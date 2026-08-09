import {
	CAPSULE_FRAGMENT_SHADER,
	CAPSULE_VERTEX_SHADER,
	CHAMBER_FRAGMENT_SHADER,
	CHAMBER_VERTEX_SHADER,
	PLATE_FRAGMENT_SHADER,
	PLATE_VERTEX_SHADER,
	UNIT_QUAD_VERTEX_COUNT
} from './shader-sources';
import type { ExhibitState, MaterialId, PaletteDefinition, RenderPacket, ViewMode } from './types';

/**
 * Five tightly packed vec4 attributes, in world-coordinate units:
 * centre/half-extents, shape, surface, material, metadata. `seed` is a stable
 * value in [0, 1); `materialIndex` may be -1 to use the genome material;
 * opacity is in [0, 1].
 */
export const PLATE_INSTANCE_STRIDE = 20;

export const PLATE_INSTANCE_OFFSET = Object.freeze({
	centerX: 0,
	centerY: 1,
	halfWidth: 2,
	halfHeight: 3,
	rotation: 4,
	depth: 5,
	exponent: 6,
	lobeAmplitude: 7,
	lobeCount: 8,
	ridge: 9,
	seed: 10,
	damage: 11,
	materialIndex: 12,
	opacity: 13,
	emission: 14,
	layer: 15,
	segmentIndex: 16,
	selected: 17,
	region: 18,
	membrane: 19
} as const);

/**
 * Four tightly packed vec4 attributes, in world-coordinate units: endpoints,
 * radii/depth/joint, material, metadata. `seed` is in [0, 1), kind is an
 * application-defined small integer, phase wraps in [0, 1), and planted is 0/1.
 */
export const CAPSULE_INSTANCE_STRIDE = 16;

export const CAPSULE_INSTANCE_OFFSET = Object.freeze({
	startX: 0,
	startY: 1,
	endX: 2,
	endY: 3,
	radiusStart: 4,
	radiusEnd: 5,
	depth: 6,
	jointEmphasis: 7,
	materialIndex: 8,
	seed: 9,
	opacity: 10,
	emission: 11,
	layer: 12,
	kind: 13,
	phase: 14,
	planted: 15
} as const);

export const DEFAULT_MAX_PLATE_INSTANCES = 384;
export const DEFAULT_MAX_CAPSULE_INSTANCES = 1_536;
export const HARD_MAX_PLATE_INSTANCES = 1_024;
export const HARD_MAX_CAPSULE_INSTANCES = 4_096;

const UNIT_QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

const VIEW_MODE_INDEX: Readonly<Record<ViewMode, number>> = Object.freeze({
	specimen: 0,
	anatomy: 1,
	gait: 2,
	surface: 3,
	silhouette: 4,
	fluorescence: 5,
	depth: 6
});

const MATERIAL_INDEX: Readonly<Record<MaterialId, number>> = Object.freeze({
	'obsidian-iridescent': 0,
	'iridescent-chitin': 1,
	'oxidized-metal': 2,
	'ceramic-bone': 3,
	'translucent-brine': 4,
	'velvet-black': 5,
	'reactor-enamel': 6
});

export interface RenderInstanceCaps {
	readonly plates: number;
	readonly capsules: number;
}

export interface ResolvedRenderCounts {
	readonly requestedPlates: number;
	readonly requestedCapsules: number;
	readonly availablePlates: number;
	readonly availableCapsules: number;
	readonly plates: number;
	readonly capsules: number;
	readonly truncated: boolean;
}

export interface RenderBounds {
	readonly minX: number;
	readonly minY: number;
	readonly maxX: number;
	readonly maxY: number;
}

export interface RenderProjection {
	readonly centerX: number;
	readonly centerY: number;
	/** World-to-NDC scale. X and Y differ only to preserve physical aspect. */
	readonly scaleX: number;
	readonly scaleY: number;
}

export interface WebGLFrameOptions {
	readonly state: ExhibitState;
	readonly palette: PaletteDefinition;
	readonly time?: number;
	readonly projection?: RenderProjection;
	/** Fraction of each viewport edge reserved as chamber breathing room. */
	readonly padding?: number;
}

export interface WebGLRenderStats extends ResolvedRenderCounts {
	readonly contextLost: boolean;
	readonly width: number;
	readonly height: number;
}

export interface WebGLRendererOptions {
	readonly development?: boolean;
	readonly maxPlateInstances?: number;
	readonly maxCapsuleInstances?: number;
	readonly contextAttributes?: WebGLContextAttributes;
	readonly onContextLost?: () => void;
	readonly onContextRestored?: () => void;
	readonly onError?: (error: Error) => void;
}

interface ProgramResource {
	readonly program: WebGLProgram;
	readonly uniforms: Map<string, WebGLUniformLocation>;
}

interface RendererResources {
	readonly chamber: ProgramResource;
	readonly plates: ProgramResource;
	readonly capsules: ProgramResource;
	readonly unitBuffer: WebGLBuffer;
	readonly plateBuffer: WebGLBuffer;
	readonly capsuleBuffer: WebGLBuffer;
	readonly chamberVao: WebGLVertexArrayObject;
	readonly plateVao: WebGLVertexArrayObject;
	readonly capsuleVao: WebGLVertexArrayObject;
}

type MutableRendererResources = {
	-readonly [Key in keyof RendererResources]?: RendererResources[Key];
};

interface PendingFrame {
	readonly packet: RenderPacket;
	readonly options: WebGLFrameOptions;
}

const DEFAULT_CONTEXT_ATTRIBUTES: WebGLContextAttributes = Object.freeze({
	alpha: false,
	antialias: true,
	depth: true,
	stencil: false,
	premultipliedAlpha: true,
	preserveDrawingBuffer: false,
	powerPreference: 'high-performance',
	failIfMajorPerformanceCaveat: false
});

const DEFAULT_BOUNDS: RenderBounds = Object.freeze({ minX: -1, minY: -0.65, maxX: 1, maxY: 0.65 });

/** Converts the stable string view contract to the GLSL branch index. */
export function viewModeIndex(view: ViewMode): number {
	return VIEW_MODE_INDEX[view];
}

/** Converts the stable material identifier to the compact shader index. */
export function materialIndex(material: MaterialId): number {
	return MATERIAL_INDEX[material];
}

/** Converts integer hashes or arbitrary finite seeds to the packet's [0, 1) contract. */
export function normalizeInstanceSeed(seed: number): number {
	if (!Number.isFinite(seed)) return 0;
	if (seed >= 0 && seed < 1) return seed;
	if (Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff) {
		return (seed >>> 0) / 4_294_967_296;
	}
	return ((seed % 1) + 1) % 1;
}

/** Maps the authored genome range to the normalized shader control. */
export function normalizeCellularScale(value: number): number {
	return clamp((finite(value, 2.5) - 2.5) / (18 - 2.5), 0, 1);
}

/**
 * Resolves untrusted packet counts against both typed-array capacity and hard
 * renderer budgets. Negative, fractional, NaN and infinite counts render zero.
 */
export function resolveRenderCounts(
	packet: RenderPacket,
	caps: RenderInstanceCaps = {
		plates: DEFAULT_MAX_PLATE_INSTANCES,
		capsules: DEFAULT_MAX_CAPSULE_INSTANCES
	}
): ResolvedRenderCounts {
	const requestedPlates = safeCount(packet.plateCount);
	const requestedCapsules = safeCount(packet.capsuleCount);
	const availablePlates = Math.floor(packet.plates.length / PLATE_INSTANCE_STRIDE);
	const availableCapsules = Math.floor(packet.capsules.length / CAPSULE_INSTANCE_STRIDE);
	const plateCap = clampInteger(caps.plates, 0, HARD_MAX_PLATE_INSTANCES);
	const capsuleCap = clampInteger(caps.capsules, 0, HARD_MAX_CAPSULE_INSTANCES);
	const plates = Math.min(requestedPlates, availablePlates, plateCap);
	const capsules = Math.min(requestedCapsules, availableCapsules, capsuleCap);
	return {
		requestedPlates,
		requestedCapsules,
		availablePlates,
		availableCapsules,
		plates,
		capsules,
		truncated: plates !== requestedPlates || capsules !== requestedCapsules
	};
}

/** Derives conservative world bounds from only the capped packet records. */
export function deriveRenderBounds(packet: RenderPacket, caps?: RenderInstanceCaps): RenderBounds {
	const counts = resolveRenderCounts(packet, caps);
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (let index = 0; index < counts.plates; index += 1) {
		const offset = index * PLATE_INSTANCE_STRIDE;
		const centerX = finite(packet.plates[offset + PLATE_INSTANCE_OFFSET.centerX]);
		const centerY = finite(packet.plates[offset + PLATE_INSTANCE_OFFSET.centerY]);
		const halfWidth = Math.abs(finite(packet.plates[offset + PLATE_INSTANCE_OFFSET.halfWidth]));
		const halfHeight = Math.abs(finite(packet.plates[offset + PLATE_INSTANCE_OFFSET.halfHeight]));
		const lobe = Math.min(
			Math.abs(finite(packet.plates[offset + PLATE_INSTANCE_OFFSET.lobeAmplitude])),
			0.24
		);
		const radius = Math.hypot(halfWidth, halfHeight) * (1.08 + lobe);
		minX = Math.min(minX, centerX - radius);
		minY = Math.min(minY, centerY - radius);
		maxX = Math.max(maxX, centerX + radius);
		maxY = Math.max(maxY, centerY + radius);
	}

	for (let index = 0; index < counts.capsules; index += 1) {
		const offset = index * CAPSULE_INSTANCE_STRIDE;
		const startX = finite(packet.capsules[offset + CAPSULE_INSTANCE_OFFSET.startX]);
		const startY = finite(packet.capsules[offset + CAPSULE_INSTANCE_OFFSET.startY]);
		const endX = finite(packet.capsules[offset + CAPSULE_INSTANCE_OFFSET.endX]);
		const endY = finite(packet.capsules[offset + CAPSULE_INSTANCE_OFFSET.endY]);
		const radius = Math.max(
			Math.abs(finite(packet.capsules[offset + CAPSULE_INSTANCE_OFFSET.radiusStart])),
			Math.abs(finite(packet.capsules[offset + CAPSULE_INSTANCE_OFFSET.radiusEnd]))
		);
		const joint = Math.max(
			0,
			finite(packet.capsules[offset + CAPSULE_INSTANCE_OFFSET.jointEmphasis])
		);
		const extent = radius + joint;
		minX = Math.min(minX, startX - extent, endX - extent);
		minY = Math.min(minY, startY - extent, endY - extent);
		maxX = Math.max(maxX, startX + extent, endX + extent);
		maxY = Math.max(maxY, startY + extent, endY + extent);
	}

	if (![minX, minY, maxX, maxY].every(Number.isFinite)) return DEFAULT_BOUNDS;
	const width = Math.max(maxX - minX, 0.001);
	const height = Math.max(maxY - minY, 0.001);
	const margin = Math.max(width, height) * 0.035;
	return {
		minX: minX - margin,
		minY: minY - margin,
		maxX: maxX + margin,
		maxY: maxY + margin
	};
}

/** Produces an aspect-correct orthographic fit in NDC space. */
export function deriveRenderProjection(
	packet: RenderPacket,
	width: number,
	height: number,
	padding = 0.08,
	caps?: RenderInstanceCaps
): RenderProjection {
	const bounds = deriveRenderBounds(packet, caps);
	const safeWidth = Math.max(1, finite(width, 1));
	const safeHeight = Math.max(1, finite(height, 1));
	const safePadding = Math.min(0.42, Math.max(0, finite(padding, 0.08)));
	const boundsWidth = Math.max(bounds.maxX - bounds.minX, 0.001);
	const boundsHeight = Math.max(bounds.maxY - bounds.minY, 0.001);
	const usable = 1 - safePadding * 2;
	const pixelsPerWorld = Math.min(
		(safeWidth * usable) / boundsWidth,
		(safeHeight * usable) / boundsHeight
	);
	return {
		centerX: (bounds.minX + bounds.maxX) * 0.5,
		centerY: (bounds.minY + bounds.maxY) * 0.5,
		scaleX: (pixelsPerWorld * 2) / safeWidth,
		scaleY: (pixelsPerWorld * 2) / safeHeight
	};
}

/** Accepts either unit RGB tuples or conventional 0-255 tuples. */
export function normalizePaletteColour(
	colour: readonly [number, number, number]
): readonly [number, number, number] {
	const divisor = Math.max(...colour.map((channel) => Math.abs(finite(channel)))) > 1 ? 255 : 1;
	return [
		Math.min(1, Math.max(0, finite(colour[0]) / divisor)),
		Math.min(1, Math.max(0, finite(colour[1]) / divisor)),
		Math.min(1, Math.max(0, finite(colour[2]) / divisor))
	];
}

/** Detailed source/log diagnostics are emitted only when development=true. */
export function formatShaderFailure(
	label: string,
	log: string | null,
	source: string,
	development: boolean
): Error {
	if (!development) return new Error(`The ${label} shader could not be compiled.`);
	const numberedSource = source
		.split('\n')
		.map((line, index) => `${String(index + 1).padStart(4, ' ')} | ${line}`)
		.join('\n');
	return new Error(
		`The ${label} shader could not be compiled.\n${log?.trim() || 'No compiler log was returned.'}\n\n${numberedSource}`
	);
}

/**
 * Raw WebGL2 renderer. It owns no simulation or UI loop; callers decide when
 * to render. Context restoration is transactional and replays only the most
 * recently requested serializable packet/options frame.
 */
export class WebGLRenderer {
	readonly canvas: HTMLCanvasElement;

	private gl: WebGL2RenderingContext;
	private resources: RendererResources | null = null;
	private readonly options: WebGLRendererOptions;
	private readonly caps: RenderInstanceCaps;
	private readonly development: boolean;
	private contextLost = false;
	private disposed = false;
	private pendingFrame: PendingFrame | null = null;

	private readonly handleContextLost = (event: Event): void => {
		event.preventDefault();
		if (this.disposed || this.contextLost) return;
		this.contextLost = true;
		// The browser owns invalidated objects. Drop references without issuing GL calls.
		this.resources = null;
		this.options.onContextLost?.();
	};

	private readonly handleContextRestored = (): void => {
		if (this.disposed) return;
		try {
			const restored = this.canvas.getContext('webgl2', this.contextAttributes());
			if (!restored) throw new Error('WebGL2 did not return after context restoration.');
			const rebuilt = buildResources(restored, this.development);
			this.gl = restored;
			this.resources = rebuilt;
			this.contextLost = false;
			this.options.onContextRestored?.();
			if (this.pendingFrame) this.render(this.pendingFrame.packet, this.pendingFrame.options);
		} catch (error) {
			this.contextLost = true;
			this.resources = null;
			this.options.onError?.(asError(error, 'WebGL2 restoration failed.'));
		}
	};

	constructor(canvas: HTMLCanvasElement, options: WebGLRendererOptions = {}) {
		this.canvas = canvas;
		this.options = options;
		this.development = options.development ?? isDevelopmentBuild();
		this.caps = {
			plates: clampInteger(
				options.maxPlateInstances ?? DEFAULT_MAX_PLATE_INSTANCES,
				0,
				HARD_MAX_PLATE_INSTANCES
			),
			capsules: clampInteger(
				options.maxCapsuleInstances ?? DEFAULT_MAX_CAPSULE_INSTANCES,
				0,
				HARD_MAX_CAPSULE_INSTANCES
			)
		};
		canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
		canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);

		const gl = canvas.getContext('webgl2', this.contextAttributes());
		if (!gl) {
			canvas.removeEventListener('webglcontextlost', this.handleContextLost, false);
			canvas.removeEventListener('webglcontextrestored', this.handleContextRestored, false);
			throw new Error('WebGL2 is unavailable. Use the Canvas2D Chitin renderer for this specimen.');
		}
		this.gl = gl;
		try {
			this.resources = buildResources(gl, this.development);
		} catch (error) {
			canvas.removeEventListener('webglcontextlost', this.handleContextLost, false);
			canvas.removeEventListener('webglcontextrestored', this.handleContextRestored, false);
			throw error;
		}
	}

	get isContextLost(): boolean {
		return this.contextLost;
	}

	/** Updates only the backing store; normalized creature geometry is untouched. */
	setSize(cssWidth: number, cssHeight: number, pixelRatio = 1): boolean {
		if (this.disposed) return false;
		const width = Math.round(Math.max(0, finite(cssWidth)) * clamp(finite(pixelRatio, 1), 0.5, 4));
		const height = Math.round(
			Math.max(0, finite(cssHeight)) * clamp(finite(pixelRatio, 1), 0.5, 4)
		);
		if (width < 2 || height < 2) return false;
		if (this.canvas.width === width && this.canvas.height === height) return false;
		this.canvas.width = width;
		this.canvas.height = height;
		return true;
	}

	render(packet: RenderPacket, options: WebGLFrameOptions): WebGLRenderStats {
		if (this.disposed) throw new Error('Cannot render with a disposed Chitin WebGL renderer.');
		this.pendingFrame = { packet, options };
		const counts = resolveRenderCounts(packet, this.caps);
		const width = this.canvas.width;
		const height = this.canvas.height;
		if (this.contextLost || !this.resources || width < 2 || height < 2) {
			return { ...counts, contextLost: this.contextLost, width, height };
		}

		const gl = this.gl;
		const resources = this.resources;
		const time = finite(options.time, options.state.paused ? 0 : 0);
		const projection =
			options.projection ??
			deriveRenderProjection(packet, width, height, options.padding ?? 0.08, this.caps);

		gl.viewport(0, 0, width, height);
		gl.disable(gl.CULL_FACE);
		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(true);
		gl.clearColor(0, 0, 0, 1);
		gl.clearDepth(1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		this.drawChamber(resources, options.palette, options.state, time);

		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.depthMask(true);

		if (counts.capsules > 0) {
			const floats = counts.capsules * CAPSULE_INSTANCE_STRIDE;
			gl.bindBuffer(gl.ARRAY_BUFFER, resources.capsuleBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, packet.capsules.subarray(0, floats), gl.DYNAMIC_DRAW);
			this.applyCreatureUniforms(
				resources.capsules,
				options.state,
				options.palette,
				packet,
				projection,
				time
			);
			gl.bindVertexArray(resources.capsuleVao);
			gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, UNIT_QUAD_VERTEX_COUNT, counts.capsules);
		}

		if (counts.plates > 0) {
			const floats = counts.plates * PLATE_INSTANCE_STRIDE;
			gl.bindBuffer(gl.ARRAY_BUFFER, resources.plateBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, packet.plates.subarray(0, floats), gl.DYNAMIC_DRAW);
			this.applyCreatureUniforms(
				resources.plates,
				options.state,
				options.palette,
				packet,
				projection,
				time
			);
			gl.bindVertexArray(resources.plateVao);
			gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, UNIT_QUAD_VERTEX_COUNT, counts.plates);
		}

		gl.bindVertexArray(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		return { ...counts, contextLost: false, width, height };
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.canvas.removeEventListener('webglcontextlost', this.handleContextLost, false);
		this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored, false);
		this.pendingFrame = null;
		if (this.resources && !this.contextLost) destroyResources(this.gl, this.resources);
		this.resources = null;
	}

	private contextAttributes(): WebGLContextAttributes {
		return { ...DEFAULT_CONTEXT_ATTRIBUTES, ...this.options.contextAttributes };
	}

	private drawChamber(
		resources: RendererResources,
		palette: PaletteDefinition,
		state: ExhibitState,
		time: number
	): void {
		const gl = this.gl;
		gl.useProgram(resources.chamber.program);
		uniform3(gl, resources.chamber, 'uBackground', palette.background);
		uniform3(gl, resources.chamber, 'uChamber', palette.chamber);
		gl.uniform2f(
			uniform(gl, resources.chamber, 'uViewport'),
			this.canvas.width,
			this.canvas.height
		);
		gl.uniform1f(uniform(gl, resources.chamber, 'uTime'), time);
		gl.uniform1f(
			uniform(gl, resources.chamber, 'uScanner'),
			clamp(finite(state.scannerIntensity), 0, 1)
		);
		gl.bindVertexArray(resources.chamberVao);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, UNIT_QUAD_VERTEX_COUNT);
	}

	private applyCreatureUniforms(
		program: ProgramResource,
		state: ExhibitState,
		palette: PaletteDefinition,
		packet: RenderPacket,
		projection: RenderProjection,
		time: number
	): void {
		const gl = this.gl;
		const genome = state.genome;
		gl.useProgram(program.program);
		gl.uniform4f(
			uniform(gl, program, 'uProjection'),
			finite(projection.centerX),
			finite(projection.centerY),
			Math.max(0.000_001, finite(projection.scaleX, 1)),
			Math.max(0.000_001, finite(projection.scaleY, 1))
		);
		gl.uniform4f(
			uniform(gl, program, 'uCamera'),
			clamp(finite(state.cameraYaw), -0.7, 0.7),
			clamp(finite(state.cameraPitch), -0.5, 0.5),
			clamp(finite(state.cameraRoll), -0.35, 0.35),
			0.08
		);
		uniform3(gl, program, 'uShellA', palette.shellA);
		uniform3(gl, program, 'uShellB', palette.shellB);
		uniform3(gl, program, 'uEmissionColour', palette.emission);
		gl.uniform4f(
			uniform(gl, program, 'uEmissionControls'),
			clamp(finite(genome.seamEmission), 0, 1),
			clamp(finite(genome.eyeEmission), 0, 1),
			clamp(finite(state.scannerIntensity), 0, 1),
			clamp(finite(state.bloom), 0, 1)
		);
		gl.uniform4f(
			uniform(gl, program, 'uEffects'),
			clamp(finite(genome.iridescence), 0, 1),
			clamp(finite(state.grain), 0, 1),
			clamp(finite(state.chromaticFault), 0, 1),
			time
		);
		gl.uniform2f(uniform(gl, program, 'uViewport'), this.canvas.width, this.canvas.height);
		gl.uniform1i(uniform(gl, program, 'uViewMode'), viewModeIndex(packet.view));
		gl.uniform1i(uniform(gl, program, 'uMaterialIndex'), materialIndex(genome.material));

		if (program === this.resources?.plates) {
			uniform3(gl, program, 'uMembrane', palette.membrane);
			uniform3(gl, program, 'uCorrosionColour', palette.corrosion);
			gl.uniform4f(
				uniform(gl, program, 'uSurfaceControls'),
				normalizeCellularScale(genome.cellularScale),
				clamp(finite(genome.cellularContrast), 0, 1),
				clamp(finite(genome.corrosion), 0, 1),
				clamp(finite(genome.fluorescence), 0, 1)
			);
			gl.uniform1i(uniform(gl, program, 'uSelectedSegment'), packet.selectedSegment);
		}
	}
}

function buildResources(gl: WebGL2RenderingContext, development: boolean): RendererResources {
	const allocated: MutableRendererResources = {};
	try {
		allocated.chamber = createProgramResource(
			gl,
			CHAMBER_VERTEX_SHADER,
			CHAMBER_FRAGMENT_SHADER,
			'chamber',
			development
		);
		allocated.plates = createProgramResource(
			gl,
			PLATE_VERTEX_SHADER,
			PLATE_FRAGMENT_SHADER,
			'plate',
			development
		);
		allocated.capsules = createProgramResource(
			gl,
			CAPSULE_VERTEX_SHADER,
			CAPSULE_FRAGMENT_SHADER,
			'capsule',
			development
		);
		allocated.unitBuffer = requiredBuffer(gl, 'unit-quad');
		allocated.plateBuffer = requiredBuffer(gl, 'plate-instance');
		allocated.capsuleBuffer = requiredBuffer(gl, 'capsule-instance');
		allocated.chamberVao = requiredVao(gl, 'chamber');
		allocated.plateVao = requiredVao(gl, 'plate');
		allocated.capsuleVao = requiredVao(gl, 'capsule');

		gl.bindBuffer(gl.ARRAY_BUFFER, allocated.unitBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW);
		configureChamberVao(gl, allocated.chamberVao, allocated.unitBuffer);
		configureInstancedVao(
			gl,
			allocated.plateVao,
			allocated.unitBuffer,
			allocated.plateBuffer,
			PLATE_INSTANCE_STRIDE,
			5
		);
		configureInstancedVao(
			gl,
			allocated.capsuleVao,
			allocated.unitBuffer,
			allocated.capsuleBuffer,
			CAPSULE_INSTANCE_STRIDE,
			4
		);
		gl.bindVertexArray(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		return allocated as RendererResources;
	} catch (error) {
		destroyPartialResources(gl, allocated);
		throw asError(error, 'Could not construct the Chitin WebGL resource set.');
	}
}

function createProgramResource(
	gl: WebGL2RenderingContext,
	vertexSource: string,
	fragmentSource: string,
	label: string,
	development: boolean
): ProgramResource {
	const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label} vertex`, development);
	let fragment: WebGLShader | null = null;
	let program: WebGLProgram | null = null;
	try {
		fragment = compileShader(
			gl,
			gl.FRAGMENT_SHADER,
			fragmentSource,
			`${label} fragment`,
			development
		);
		program = gl.createProgram();
		if (!program) throw new Error(`Could not allocate the ${label} WebGL program.`);
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const log = gl.getProgramInfoLog(program)?.trim() || 'No linker log was returned.';
			if (development) throw new Error(`The ${label} WebGL program could not be linked.\n${log}`);
			throw new Error(`The ${label} WebGL program could not be linked.`);
		}
		return { program, uniforms: new Map() };
	} catch (error) {
		if (program) gl.deleteProgram(program);
		throw error;
	} finally {
		gl.deleteShader(vertex);
		if (fragment) gl.deleteShader(fragment);
	}
}

function compileShader(
	gl: WebGL2RenderingContext,
	type: number,
	source: string,
	label: string,
	development: boolean
): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error(`Could not allocate the ${label} shader.`);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw formatShaderFailure(label, log, source, development);
	}
	return shader;
}

function configureChamberVao(
	gl: WebGL2RenderingContext,
	vao: WebGLVertexArrayObject,
	unitBuffer: WebGLBuffer
): void {
	gl.bindVertexArray(vao);
	gl.bindBuffer(gl.ARRAY_BUFFER, unitBuffer);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);
}

function configureInstancedVao(
	gl: WebGL2RenderingContext,
	vao: WebGLVertexArrayObject,
	unitBuffer: WebGLBuffer,
	instanceBuffer: WebGLBuffer,
	strideFloats: number,
	attributeCount: number
): void {
	configureChamberVao(gl, vao, unitBuffer);
	gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
	const strideBytes = strideFloats * Float32Array.BYTES_PER_ELEMENT;
	for (let attribute = 0; attribute < attributeCount; attribute += 1) {
		const location = attribute + 1;
		gl.enableVertexAttribArray(location);
		gl.vertexAttribPointer(
			location,
			4,
			gl.FLOAT,
			false,
			strideBytes,
			attribute * 4 * Float32Array.BYTES_PER_ELEMENT
		);
		gl.vertexAttribDivisor(location, 1);
	}
}

function uniform(
	gl: WebGL2RenderingContext,
	resource: ProgramResource,
	name: string
): WebGLUniformLocation {
	const cached = resource.uniforms.get(name);
	if (cached !== undefined) return cached;
	const location = gl.getUniformLocation(resource.program, name);
	if (location === null) throw new Error(`Required Chitin WebGL uniform ${name} is unavailable.`);
	resource.uniforms.set(name, location);
	return location;
}

function uniform3(
	gl: WebGL2RenderingContext,
	resource: ProgramResource,
	name: string,
	value: readonly [number, number, number]
): void {
	const [red, green, blue] = normalizePaletteColour(value);
	gl.uniform3f(uniform(gl, resource, name), red, green, blue);
}

function requiredBuffer(gl: WebGL2RenderingContext, label: string): WebGLBuffer {
	const buffer = gl.createBuffer();
	if (!buffer) throw new Error(`Could not allocate the Chitin ${label} buffer.`);
	return buffer;
}

function requiredVao(gl: WebGL2RenderingContext, label: string): WebGLVertexArrayObject {
	const vao = gl.createVertexArray();
	if (!vao) throw new Error(`Could not allocate the Chitin ${label} vertex array.`);
	return vao;
}

function destroyResources(gl: WebGL2RenderingContext, resources: RendererResources): void {
	gl.deleteVertexArray(resources.chamberVao);
	gl.deleteVertexArray(resources.plateVao);
	gl.deleteVertexArray(resources.capsuleVao);
	gl.deleteBuffer(resources.unitBuffer);
	gl.deleteBuffer(resources.plateBuffer);
	gl.deleteBuffer(resources.capsuleBuffer);
	gl.deleteProgram(resources.chamber.program);
	gl.deleteProgram(resources.plates.program);
	gl.deleteProgram(resources.capsules.program);
}

function destroyPartialResources(
	gl: WebGL2RenderingContext,
	resources: MutableRendererResources
): void {
	if (resources.chamberVao) gl.deleteVertexArray(resources.chamberVao);
	if (resources.plateVao) gl.deleteVertexArray(resources.plateVao);
	if (resources.capsuleVao) gl.deleteVertexArray(resources.capsuleVao);
	if (resources.unitBuffer) gl.deleteBuffer(resources.unitBuffer);
	if (resources.plateBuffer) gl.deleteBuffer(resources.plateBuffer);
	if (resources.capsuleBuffer) gl.deleteBuffer(resources.capsuleBuffer);
	if (resources.chamber) gl.deleteProgram(resources.chamber.program);
	if (resources.plates) gl.deleteProgram(resources.plates.program);
	if (resources.capsules) gl.deleteProgram(resources.capsules.program);
}

function safeCount(value: number): number {
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
	if (!Number.isFinite(value)) return minimum;
	return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function finite(value: number | undefined, fallback = 0): number {
	return Number.isFinite(value) ? (value as number) : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function asError(error: unknown, fallback: string): Error {
	return error instanceof Error ? error : new Error(fallback);
}

function isDevelopmentBuild(): boolean {
	const meta = import.meta as ImportMeta & { readonly env?: { readonly DEV?: boolean } };
	return meta.env?.DEV === true;
}
