import { qualityProfile, surfaceSize, wakeSampleStride } from './quality';
import {
	EVENT_PULSE_STRIDE,
	FEATURE_STRIDE,
	POSITION_STRIDE,
	writeRenderLayerMixes,
	writeVisiblePointRange
} from './render-packet';
import type { MutableRenderLayerMixes, MutableVisiblePointRange } from './render-packet';
import {
	eventFragmentShader,
	eventVertexShader,
	trajectoryLineFragmentShader,
	trajectoryPointFragmentShader,
	trajectoryVertexShader
} from './shader-sources';
import type {
	OrchestraQualityTier,
	OrchestraRenderer,
	OrchestraRendererOptions,
	OrchestraRendererStatus,
	OrchestraRenderPacket,
	OrchestraRenderStats,
	OrchestraSurfaceSize
} from './types';

type BufferSlot = {
	buffer: WebGLBuffer;
	capacityBytes: number;
};

type TrajectoryUniforms = {
	viewScale: WebGLUniformLocation | null;
	dpr: WebGLUniformLocation | null;
	pointPass: WebGLUniformLocation | null;
	pointScale: WebGLUniformLocation | null;
	sampleStride: WebGLUniformLocation | null;
	wakePass: WebGLUniformLocation | null;
	simulationPhase: WebGLUniformLocation | null;
	layerAlpha: WebGLUniformLocation | null;
	rawPass: WebGLUniformLocation | null;
};

type EventUniforms = {
	viewScale: WebGLUniformLocation;
	dpr: WebGLUniformLocation;
	voiceMix: WebGLUniformLocation;
};

type MutableRenderStats = {
	readonly kind: 'webgl2';
	pointCount: number;
	eventCount: number;
	drawCalls: number;
	readonly skipped: false;
};

type MutableSkippedStats = {
	readonly kind: 'webgl2';
	pointCount: number;
	eventCount: number;
	readonly drawCalls: 0;
	readonly skipped: true;
	reason: NonNullable<OrchestraRenderStats['reason']>;
};

type WebGLResources = {
	lineProgram: WebGLProgram;
	pointProgram: WebGLProgram;
	eventProgram: WebGLProgram;
	lineUniforms: TrajectoryUniforms;
	pointUniforms: TrajectoryUniforms;
	eventUniforms: EventUniforms;
	rawPositions: BufferSlot;
	warpedPositions: BufferSlot;
	features: BufferSlot;
	events: BufferSlot;
};

const CONTEXT_OPTIONS: WebGLContextAttributes = Object.freeze({
	alpha: false,
	antialias: false,
	depth: false,
	desynchronized: true,
	failIfMajorPerformanceCaveat: true,
	powerPreference: 'high-performance',
	premultipliedAlpha: false,
	preserveDrawingBuffer: false,
	stencil: false
});

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('WebGL2 could not allocate a shader.');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader) || 'unknown shader error';
		gl.deleteShader(shader);
		throw new Error(`Orchestra shader compilation failed: ${log}`);
	}
	return shader;
}

function createProgram(
	gl: WebGL2RenderingContext,
	vertexSource: string,
	fragmentSource: string
): WebGLProgram {
	const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
	const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
	const program = gl.createProgram();
	if (!program) {
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
		throw new Error('WebGL2 could not allocate a shader program.');
	}
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.linkProgram(program);
	gl.deleteShader(vertex);
	gl.deleteShader(fragment);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(program) || 'unknown link error';
		gl.deleteProgram(program);
		throw new Error(`Orchestra shader linking failed: ${log}`);
	}
	return program;
}

function requiredUniform(
	gl: WebGL2RenderingContext,
	program: WebGLProgram,
	name: string
): WebGLUniformLocation {
	const location = gl.getUniformLocation(program, name);
	if (location === null) throw new Error(`Orchestra shader is missing uniform ${name}.`);
	return location;
}

function trajectoryUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): TrajectoryUniforms {
	// The shared trajectory vertex shader is linked once with a line fragment shader and once with
	// a point fragment shader. WebGL is allowed to optimise point-only uniforms (including the Wake
	// phase) out of the line program, so null is a valid, pass-specific location here. uniform* calls
	// deliberately accept null and become no-ops for those optimised values.
	return {
		viewScale: gl.getUniformLocation(program, 'u_viewScale'),
		dpr: gl.getUniformLocation(program, 'u_dpr'),
		pointPass: gl.getUniformLocation(program, 'u_pointPass'),
		pointScale: gl.getUniformLocation(program, 'u_pointScale'),
		sampleStride: gl.getUniformLocation(program, 'u_sampleStride'),
		wakePass: gl.getUniformLocation(program, 'u_wakePass'),
		simulationPhase: gl.getUniformLocation(program, 'u_simulationPhase'),
		layerAlpha: gl.getUniformLocation(program, 'u_layerAlpha'),
		rawPass: gl.getUniformLocation(program, 'u_rawPass')
	};
}

function eventUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): EventUniforms {
	return {
		viewScale: requiredUniform(gl, program, 'u_viewScale'),
		dpr: requiredUniform(gl, program, 'u_dpr'),
		voiceMix: requiredUniform(gl, program, 'u_voiceMix')
	};
}

function createBufferSlot(gl: WebGL2RenderingContext): BufferSlot {
	const buffer = gl.createBuffer();
	if (!buffer) throw new Error('WebGL2 could not allocate an orchestra buffer.');
	return { buffer, capacityBytes: 0 };
}

function createResources(gl: WebGL2RenderingContext): WebGLResources {
	const lineProgram = createProgram(gl, trajectoryVertexShader, trajectoryLineFragmentShader);
	const pointProgram = createProgram(gl, trajectoryVertexShader, trajectoryPointFragmentShader);
	const eventProgram = createProgram(gl, eventVertexShader, eventFragmentShader);
	try {
		return {
			lineProgram,
			pointProgram,
			eventProgram,
			lineUniforms: trajectoryUniforms(gl, lineProgram),
			pointUniforms: trajectoryUniforms(gl, pointProgram),
			eventUniforms: eventUniforms(gl, eventProgram),
			rawPositions: createBufferSlot(gl),
			warpedPositions: createBufferSlot(gl),
			features: createBufferSlot(gl),
			events: createBufferSlot(gl)
		};
	} catch (error) {
		gl.deleteProgram(lineProgram);
		gl.deleteProgram(pointProgram);
		gl.deleteProgram(eventProgram);
		throw error;
	}
}

function deleteResources(gl: WebGL2RenderingContext, resources: WebGLResources | null): void {
	if (!resources) return;
	gl.deleteBuffer(resources.rawPositions.buffer);
	gl.deleteBuffer(resources.warpedPositions.buffer);
	gl.deleteBuffer(resources.features.buffer);
	gl.deleteBuffer(resources.events.buffer);
	gl.deleteProgram(resources.lineProgram);
	gl.deleteProgram(resources.pointProgram);
	gl.deleteProgram(resources.eventProgram);
}

function nextCapacity(requiredBytes: number): number {
	let capacity = 256;
	while (capacity < requiredBytes) capacity *= 2;
	return capacity;
}

function uploadBuffer(
	gl: WebGL2RenderingContext,
	slot: BufferSlot,
	data: Float32Array,
	usedFloats: number
): void {
	const usedBytes = usedFloats * Float32Array.BYTES_PER_ELEMENT;
	gl.bindBuffer(gl.ARRAY_BUFFER, slot.buffer);
	if (usedBytes > slot.capacityBytes) {
		slot.capacityBytes = nextCapacity(usedBytes);
		gl.bufferData(gl.ARRAY_BUFFER, slot.capacityBytes, gl.DYNAMIC_DRAW);
	}
	if (usedBytes > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, usedFloats);
}

function bindTrajectoryAttributes(
	gl: WebGL2RenderingContext,
	position: BufferSlot,
	features: BufferSlot
): void {
	gl.bindBuffer(gl.ARRAY_BUFFER, position.buffer);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, POSITION_STRIDE, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, features.buffer);
	gl.enableVertexAttribArray(1);
	gl.vertexAttribPointer(1, 4, gl.FLOAT, false, FEATURE_STRIDE * 4, 0);
	gl.enableVertexAttribArray(2);
	gl.vertexAttribPointer(2, 3, gl.FLOAT, false, FEATURE_STRIDE * 4, 4 * 4);
}

function bindEventAttributes(gl: WebGL2RenderingContext, events: BufferSlot): void {
	gl.bindBuffer(gl.ARRAY_BUFFER, events.buffer);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, EVENT_PULSE_STRIDE * 4, 0);
	gl.enableVertexAttribArray(1);
	gl.vertexAttribPointer(1, 4, gl.FLOAT, false, EVENT_PULSE_STRIDE * 4, 3 * 4);
	gl.enableVertexAttribArray(2);
	gl.vertexAttribPointer(2, 1, gl.FLOAT, false, EVENT_PULSE_STRIDE * 4, 7 * 4);
}

function writeViewScale(surface: OrchestraSurfaceSize, target: [number, number]): void {
	const aspect = surface.cssWidth / surface.cssHeight;
	if (aspect >= 1) {
		target[0] = 1 / aspect;
		target[1] = 1;
	} else {
		target[0] = 1;
		target[1] = aspect;
	}
}

function normalisedBackground(
	background: readonly [number, number, number] | undefined
): readonly [number, number, number] {
	if (!background) return [3 / 255, 5 / 255, 11 / 255];
	const divisor = Math.max(...background) > 1 ? 255 : 1;
	return background.map((component) =>
		Math.min(1, Math.max(0, Number.isFinite(component) ? component / divisor : 0))
	) as unknown as readonly [number, number, number];
}

export class OrchestraWebGLRenderer implements OrchestraRenderer {
	readonly kind = 'webgl2' as const;
	private currentStatus: OrchestraRendererStatus = 'ready';
	private resources: WebGLResources | null;
	private quality: OrchestraQualityTier;
	private requestedPixelRatio: number;
	private suspended = false;
	private uploadedPacket: Readonly<OrchestraRenderPacket> | null = null;
	private uploadedGeometryRevision = -1;
	private uploadedEventRevision = -1;
	private simulationPhase = 0;
	private readonly visibleRange: MutableVisiblePointRange = {
		first: 0,
		count: 0,
		endExclusive: 0
	};
	private readonly layerMixes: MutableRenderLayerMixes = { raw: 0, warped: 0, voice: 0 };
	private readonly viewScaleScratch: [number, number] = [1, 1];
	private readonly renderedStats: MutableRenderStats = {
		kind: 'webgl2',
		pointCount: 0,
		eventCount: 0,
		drawCalls: 0,
		skipped: false
	};
	private readonly skippedFrameStats: MutableSkippedStats = {
		kind: 'webgl2',
		pointCount: 0,
		eventCount: 0,
		drawCalls: 0,
		skipped: true,
		reason: 'empty'
	};
	private readonly background: readonly [number, number, number];
	private currentSurface: OrchestraSurfaceSize;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly gl: WebGL2RenderingContext,
		private readonly options: OrchestraRendererOptions = {}
	) {
		this.quality = options.quality ?? 'high';
		this.requestedPixelRatio = options.devicePixelRatio ?? 1;
		this.background = normalisedBackground(options.background);
		this.resources = createResources(gl);
		this.currentSurface = surfaceSize(
			canvas.clientWidth || canvas.width || 1,
			canvas.clientHeight || canvas.height || 1,
			this.requestedPixelRatio,
			this.quality
		);
		canvas.addEventListener('webglcontextlost', this.handleContextLost);
		canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
		this.applySurface(this.currentSurface);
		this.configureContext();
		this.notify('ready', 'WebGL2 trajectory renderer ready.');
	}

	get status(): OrchestraRendererStatus {
		return this.currentStatus;
	}

	get surface(): OrchestraSurfaceSize {
		return this.currentSurface;
	}

	resize(
		cssWidth: number,
		cssHeight: number,
		devicePixelRatio = this.requestedPixelRatio,
		quality = this.quality
	): OrchestraSurfaceSize {
		if (this.currentStatus === 'disposed') return this.currentSurface;
		this.requestedPixelRatio = devicePixelRatio;
		this.quality = quality;
		const next = surfaceSize(cssWidth, cssHeight, devicePixelRatio, quality);
		if (
			next.pixelWidth !== this.currentSurface.pixelWidth ||
			next.pixelHeight !== this.currentSurface.pixelHeight ||
			next.cssWidth !== this.currentSurface.cssWidth ||
			next.cssHeight !== this.currentSurface.cssHeight
		) {
			this.currentSurface = next;
			this.applySurface(next);
		}
		return this.currentSurface;
	}

	render(packet: Readonly<OrchestraRenderPacket>): OrchestraRenderStats {
		if (this.currentStatus !== 'ready' || !this.resources) {
			const reason =
				this.currentStatus === 'context-lost'
					? 'context-lost'
					: this.currentStatus === 'disposed'
						? 'disposed'
						: 'suspended';
			return this.skippedStats(packet, reason);
		}
		if (packet.quality !== this.quality) {
			this.resize(
				this.currentSurface.cssWidth,
				this.currentSurface.cssHeight,
				this.requestedPixelRatio,
				packet.quality
			);
		}
		writeVisiblePointRange(packet, this.visibleRange);
		writeRenderLayerMixes(packet, this.layerMixes);
		const range = this.visibleRange;
		const mixes = this.layerMixes;
		if (range.count <= 0) {
			this.clear();
			return this.skippedStats(packet, 'empty');
		}

		const resources = this.resources;
		this.simulationPhase = Number.isFinite(packet.simulationTime) ? packet.simulationTime : 0;
		const packetChanged = this.uploadedPacket !== packet;
		if (packetChanged || this.uploadedGeometryRevision !== packet.geometryRevision) {
			uploadBuffer(
				this.gl,
				resources.rawPositions,
				packet.rawPositions,
				packet.pointCount * POSITION_STRIDE
			);
			uploadBuffer(
				this.gl,
				resources.warpedPositions,
				packet.warpedPositions,
				packet.pointCount * POSITION_STRIDE
			);
			uploadBuffer(
				this.gl,
				resources.features,
				packet.features,
				packet.pointCount * FEATURE_STRIDE
			);
			this.uploadedGeometryRevision = packet.geometryRevision;
		}
		if (packetChanged || this.uploadedEventRevision !== packet.eventRevision) {
			uploadBuffer(
				this.gl,
				resources.events,
				packet.eventPulses,
				packet.eventCount * EVENT_PULSE_STRIDE
			);
			this.uploadedEventRevision = packet.eventRevision;
		}
		this.uploadedPacket = packet;

		this.clear();
		writeViewScale(this.currentSurface, this.viewScaleScratch);
		this.gl.enable(this.gl.BLEND);
		this.gl.blendEquation(this.gl.FUNC_ADD);
		this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
		let drawCalls = 0;
		if (mixes.raw > 0.001) {
			drawCalls += this.drawTrajectory(
				resources.rawPositions,
				mixes.raw,
				true,
				range.first,
				range.count,
				false,
				false
			);
		}
		if (mixes.warped > 0.001) {
			drawCalls += this.drawTrajectory(
				resources.warpedPositions,
				mixes.warped,
				false,
				range.first,
				range.count,
				qualityProfile(packet.quality).densityHaze,
				packet.lens === 'wake'
			);
		}
		if (packet.eventCount > 0 && mixes.voice > 0.001) {
			drawCalls += this.drawEvents(packet.eventCount, mixes.voice);
		}
		this.gl.disable(this.gl.BLEND);
		this.renderedStats.pointCount = range.count;
		this.renderedStats.eventCount = packet.eventCount;
		this.renderedStats.drawCalls = drawCalls;
		return this.renderedStats;
	}

	setSuspended(suspended: boolean): void {
		if (this.currentStatus === 'disposed') return;
		this.suspended = suspended;
		if (this.currentStatus === 'context-lost') return;
		this.currentStatus = suspended ? 'suspended' : 'ready';
		this.notify(
			this.currentStatus,
			suspended ? 'Trajectory rendering suspended offscreen.' : 'Trajectory rendering resumed.'
		);
	}

	dispose(): void {
		if (this.currentStatus === 'disposed') return;
		this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
		if (!this.gl.isContextLost()) deleteResources(this.gl, this.resources);
		this.resources = null;
		this.currentStatus = 'disposed';
		this.notify('disposed', 'WebGL2 trajectory renderer disposed.');
	}

	private drawTrajectory(
		position: BufferSlot,
		alpha: number,
		rawPass: boolean,
		first: number,
		count: number,
		densityHaze: boolean,
		wake: boolean
	): number {
		const resources = this.resources!;
		let draws = 0;

		this.gl.useProgram(resources.lineProgram);
		bindTrajectoryAttributes(this.gl, position, resources.features);
		this.setTrajectoryUniforms(
			resources.lineUniforms,
			this.viewScaleScratch,
			alpha,
			rawPass,
			0,
			1,
			0
		);
		if (count > 1) {
			this.gl.drawArrays(this.gl.LINE_STRIP, first, count);
			draws += 1;
		}

		this.gl.useProgram(resources.pointProgram);
		bindTrajectoryAttributes(this.gl, position, resources.features);
		if (densityHaze) {
			const maxSamples = Math.max(1, qualityProfile(this.quality).maxDensitySamples);
			const sampleStride = Math.max(1, Math.ceil(count / maxSamples));
			this.setTrajectoryUniforms(
				resources.pointUniforms,
				this.viewScaleScratch,
				alpha,
				rawPass,
				1,
				sampleStride,
				0
			);
			this.gl.drawArrays(this.gl.POINTS, first, count);
			draws += 1;
		}
		if (wake) {
			this.setTrajectoryUniforms(
				resources.pointUniforms,
				this.viewScaleScratch,
				alpha,
				rawPass,
				0,
				wakeSampleStride(count, this.quality),
				1
			);
			this.gl.drawArrays(this.gl.POINTS, first, count);
			draws += 1;
		}
		this.setTrajectoryUniforms(
			resources.pointUniforms,
			this.viewScaleScratch,
			alpha,
			rawPass,
			0,
			1,
			0
		);
		this.gl.drawArrays(this.gl.POINTS, first, count);
		return draws + 1;
	}

	private drawEvents(eventCount: number, voiceMix: number): number {
		const resources = this.resources!;
		this.gl.useProgram(resources.eventProgram);
		bindEventAttributes(this.gl, resources.events);
		this.gl.uniform2f(
			resources.eventUniforms.viewScale,
			this.viewScaleScratch[0],
			this.viewScaleScratch[1]
		);
		this.gl.uniform1f(resources.eventUniforms.dpr, this.currentSurface.pixelRatio);
		this.gl.uniform1f(resources.eventUniforms.voiceMix, voiceMix);
		this.gl.drawArrays(this.gl.POINTS, 0, eventCount);
		return 1;
	}

	private setTrajectoryUniforms(
		uniforms: TrajectoryUniforms,
		scale: readonly [number, number],
		alpha: number,
		rawPass: boolean,
		pointPass: 0 | 1,
		sampleStride: number,
		wakePass: 0 | 1
	): void {
		this.gl.uniform2f(uniforms.viewScale, scale[0], scale[1]);
		this.gl.uniform1f(uniforms.dpr, this.currentSurface.pixelRatio);
		this.gl.uniform1f(uniforms.pointPass, pointPass);
		this.gl.uniform1f(uniforms.pointScale, rawPass ? 0.72 : 1);
		this.gl.uniform1f(uniforms.sampleStride, sampleStride);
		this.gl.uniform1f(uniforms.wakePass, wakePass);
		this.gl.uniform1f(uniforms.simulationPhase, this.simulationPhase);
		this.gl.uniform1f(uniforms.layerAlpha, alpha);
		this.gl.uniform1f(uniforms.rawPass, rawPass ? 1 : 0);
	}

	private clear(): void {
		this.gl.viewport(0, 0, this.currentSurface.pixelWidth, this.currentSurface.pixelHeight);
		this.gl.clearColor(this.background[0], this.background[1], this.background[2], 1);
		this.gl.clear(this.gl.COLOR_BUFFER_BIT);
	}

	private configureContext(): void {
		this.gl.disable(this.gl.DEPTH_TEST);
		this.gl.disable(this.gl.CULL_FACE);
		this.gl.disable(this.gl.DITHER);
		this.clear();
	}

	private applySurface(surface: OrchestraSurfaceSize): void {
		if (this.canvas.width !== surface.pixelWidth) this.canvas.width = surface.pixelWidth;
		if (this.canvas.height !== surface.pixelHeight) this.canvas.height = surface.pixelHeight;
		this.canvas.style.width = `${surface.cssWidth}px`;
		this.canvas.style.height = `${surface.cssHeight}px`;
		if (!this.gl.isContextLost()) {
			this.gl.viewport(0, 0, surface.pixelWidth, surface.pixelHeight);
		}
	}

	private skippedStats(
		packet: Readonly<OrchestraRenderPacket>,
		reason: 'suspended' | 'context-lost' | 'disposed' | 'empty'
	): OrchestraRenderStats {
		this.skippedFrameStats.pointCount = reason === 'empty' ? 0 : packet.pointCount;
		this.skippedFrameStats.eventCount = packet.eventCount;
		this.skippedFrameStats.reason = reason;
		return this.skippedFrameStats;
	}

	private notify(status: OrchestraRendererStatus, message: string): void {
		this.options.onStatus?.(status, message);
	}

	private handleContextLost = (event: Event): void => {
		event.preventDefault();
		if (this.currentStatus === 'disposed') return;
		this.resources = null;
		this.currentStatus = 'context-lost';
		this.notify('context-lost', 'WebGL2 context lost; the scientific packet remains untouched.');
	};

	private handleContextRestored = (): void => {
		if (this.currentStatus === 'disposed') return;
		try {
			this.resources = createResources(this.gl);
			this.uploadedPacket = null;
			this.uploadedGeometryRevision = -1;
			this.uploadedEventRevision = -1;
			this.configureContext();
			this.applySurface(this.currentSurface);
			this.currentStatus = this.suspended ? 'suspended' : 'ready';
			this.notify(
				this.currentStatus,
				this.suspended
					? 'WebGL2 context restored; trajectory rendering remains suspended offscreen.'
					: 'WebGL2 context restored; the next packet can be drawn.'
			);
		} catch (error) {
			this.resources = null;
			this.currentStatus = 'context-lost';
			this.notify(
				'context-lost',
				error instanceof Error
					? `WebGL2 recovery failed: ${error.message}`
					: 'WebGL2 recovery failed.'
			);
		}
	};
}

export function createWebGLRenderer(
	canvas: HTMLCanvasElement,
	options: OrchestraRendererOptions = {}
): OrchestraWebGLRenderer {
	const context = canvas.getContext('webgl2', CONTEXT_OPTIONS);
	if (!context) {
		throw new OrchestraWebGLInitializationError(
			'WebGL2 is unavailable for the orchestra renderer.',
			false
		);
	}
	try {
		return new OrchestraWebGLRenderer(canvas, context, options);
	} catch (error) {
		const detail = error instanceof Error ? error.message : 'Unknown WebGL2 initialization error.';
		throw new OrchestraWebGLInitializationError(
			`WebGL2 initialization failed after claiming the canvas: ${detail}`,
			true
		);
	}
}

/** Distinguishes a safe same-canvas fallback from a failure after WebGL has claimed the canvas. */
export class OrchestraWebGLInitializationError extends Error {
	readonly name = 'OrchestraWebGLInitializationError';

	constructor(
		message: string,
		readonly contextClaimed: boolean
	) {
		super(message);
	}
}
