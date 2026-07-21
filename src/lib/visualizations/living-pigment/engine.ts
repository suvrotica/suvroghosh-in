import { colorToAbsorption, getPigment, hexToRgb } from './colors';
import { BRUSHES, cloneSettings } from './presets';
import type {
	BrushInjection,
	EngineDiagnostics,
	ProjectFieldData,
	QualityLevel,
	SimulationSettings
} from './types';
import copyFragmentSource from './shaders/copy.frag?raw';
import vertexSource from './shaders/fullscreen.vert?raw';
import renderFragmentSource from './shaders/render.frag?raw';
import seedFragmentSource from './shaders/seed.frag?raw';
import simulationFragmentSource from './shaders/simulation.frag?raw';

const VELOCITY_RANGE = 0.12;
const MAX_HISTORY = 6;

type TextureFormat = {
	internalFormat: number;
	type: number;
	float: boolean;
};

type FieldSet = {
	textures: [WebGLTexture, WebGLTexture, WebGLTexture];
	framebuffer: WebGLFramebuffer;
};

type ProgramSet = {
	seed: WebGLProgram;
	simulation: WebGLProgram;
	render: WebGLProgram;
	copy: WebGLProgram;
};

export type PigmentEngineCallbacks = {
	onContextLost?: () => void;
	onContextRestored?: (recovered: boolean) => void;
};

const QUALITY_WIDTHS: Record<QualityLevel, number> = {
	low: 360,
	medium: 520,
	high: 720
};

const BACKGROUND_INDEX: Record<SimulationSettings['background']['mode'], number> = {
	clean: 0,
	handmade: 1,
	canvas: 2,
	'wet-field': 3,
	'pigment-cloud': 4,
	'atmospheric-wash': 5,
	'random-pigments': 6,
	'dark-ground': 7,
	custom: 8
};

const MODE_INDEX: Record<SimulationSettings['mode'], number> = {
	watercolor: 0,
	oil: 1,
	hybrid: 2
};

const OVERLAY_INDEX: Record<SimulationSettings['overlay'], number> = {
	artwork: 0,
	moisture: 1,
	pigment: 2,
	velocity: 3,
	drying: 4,
	grain: 5,
	deposited: 6
};

const BRUSH_INDEX = Object.fromEntries(BRUSHES.map((brush, index) => [brush.id, index])) as Record<
	SimulationSettings['brush'],
	number
>;

function qualityDimensions(quality: QualityLevel, aspect: number) {
	const longEdge = QUALITY_WIDTHS[quality];
	const safeAspect = Number.isFinite(aspect) ? Math.min(8, Math.max(0.125, aspect)) : 1;
	return safeAspect >= 1
		? { width: longEdge, height: Math.max(96, Math.round(longEdge / safeAspect)) }
		: { width: Math.max(96, Math.round(longEdge * safeAspect)), height: longEdge };
}

function paperColor(settings: SimulationSettings) {
	if (settings.background.mode === 'dark-ground') return hexToRgb('#282a29');
	if (settings.background.mode === 'custom') return hexToRgb(settings.background.customColor);
	if (settings.background.mode === 'handmade') return hexToRgb('#e8deca');
	if (settings.background.mode === 'canvas') return hexToRgb('#e4dbc9');
	return hexToRgb('#eee7d8');
}

export class LivingPigmentEngine {
	readonly canvas: HTMLCanvasElement;
	readonly gl: WebGL2RenderingContext;
	readonly callbacks: PigmentEngineCallbacks;

	private textureFormat: TextureFormat;
	private programs: ProgramSet | null = null;
	private vao: WebGLVertexArrayObject | null = null;
	private readSet: FieldSet | null = null;
	private writeSet: FieldSet | null = null;
	private history: FieldSet[] = [];
	private historyIndex = -1;
	private uniformLocations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
	private recoveryCheckpoint: ProjectFieldData | null = null;
	private settings: SimulationSettings;
	private width = 1;
	private height = 1;
	private actionCount = 0;
	private contextLost = false;
	private destroyed = false;
	private shaderLog = '';

	constructor(
		canvas: HTMLCanvasElement,
		settings: SimulationSettings,
		callbacks: PigmentEngineCallbacks = {}
	) {
		this.canvas = canvas;
		this.callbacks = callbacks;
		if (new URLSearchParams(window.location.search).get('webgl') === 'off') {
			throw new Error('WebGL2 has been disabled for this preview.');
		}
		const gl = canvas.getContext('webgl2', {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: false,
			powerPreference: 'high-performance',
			failIfMajorPerformanceCaveat: false
		});
		if (!gl) throw new Error('This browser cannot create the WebGL2 pigment surface.');
		if (gl.getParameter(gl.MAX_DRAW_BUFFERS) < 3 || gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) < 3) {
			throw new Error('This GPU cannot maintain the three pigment fields at once.');
		}

		this.gl = gl;
		this.settings = cloneSettings(settings);
		this.textureFormat = gl.getExtension('EXT_color_buffer_float')
			? { internalFormat: gl.RGBA16F, type: gl.HALF_FLOAT, float: true }
			: { internalFormat: gl.RGBA8, type: gl.UNSIGNED_BYTE, float: false };
		canvas.addEventListener('webglcontextlost', this.handleContextLost);
		canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
	}

	get diagnosticsLog() {
		return this.shaderLog;
	}

	get canUndo() {
		return this.historyIndex > 0;
	}

	get canRedo() {
		return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1;
	}

	get simulationResolution() {
		return { width: this.width, height: this.height };
	}

	get formatLabel(): EngineDiagnostics['textureFormat'] {
		return this.textureFormat.float ? 'RGBA16F' : 'RGBA8';
	}

	initialize() {
		this.assertUsable();
		this.createPrograms();
		this.vao = this.gl.createVertexArray();
		if (!this.vao) throw new Error('The pigment surface could not create its drawing geometry.');
		const bounds = this.canvas.getBoundingClientRect();
		const dimensions = qualityDimensions(
			this.settings.quality,
			bounds.width > 0 && bounds.height > 0 ? bounds.width / bounds.height : 4 / 3
		);
		this.width = dimensions.width;
		this.height = dimensions.height;
		try {
			this.readSet = this.createFieldSet(this.width, this.height);
			this.writeSet = this.createFieldSet(this.width, this.height);
		} catch (error) {
			if (!this.textureFormat.float) throw error;
			if (this.readSet) this.deleteFieldSet(this.readSet);
			this.readSet = null;
			this.textureFormat = {
				internalFormat: this.gl.RGBA8,
				type: this.gl.UNSIGNED_BYTE,
				float: false
			};
			this.readSet = this.createFieldSet(this.width, this.height);
			this.writeSet = this.createFieldSet(this.width, this.height);
		}
		this.seed(this.settings, false);
		this.commitHistory(false);
		this.render(this.settings);
	}

	setDisplaySize(cssWidth: number, cssHeight: number, density: number) {
		this.assertUsable();
		const width = Math.max(1, Math.round(cssWidth * density));
		const height = Math.max(1, Math.round(cssHeight * density));
		if (this.canvas.width === width && this.canvas.height === height) return false;
		this.canvas.width = width;
		this.canvas.height = height;
		this.render(this.settings);
		return true;
	}

	setQuality(quality: QualityLevel) {
		this.assertReady();
		if (quality === this.settings.quality) return;
		const bounds = this.canvas.getBoundingClientRect();
		const dimensions = qualityDimensions(
			quality,
			bounds.width > 0 && bounds.height > 0
				? bounds.width / bounds.height
				: this.width / this.height
		);
		const oldRead = this.readSet!;
		const oldWrite = this.writeSet!;
		let nextRead: FieldSet | null = null;
		let nextWrite: FieldSet | null = null;
		try {
			nextRead = this.createFieldSet(dimensions.width, dimensions.height);
			nextWrite = this.createFieldSet(dimensions.width, dimensions.height);
			this.copySet(oldRead, nextRead, dimensions.width, dimensions.height);
			this.copySet(oldRead, nextWrite, dimensions.width, dimensions.height);
		} catch (error) {
			if (nextRead) this.deleteFieldSet(nextRead);
			if (nextWrite) this.deleteFieldSet(nextWrite);
			throw error;
		}
		this.readSet = nextRead;
		this.writeSet = nextWrite;
		this.width = dimensions.width;
		this.height = dimensions.height;
		this.deleteFieldSet(oldRead);
		this.deleteFieldSet(oldWrite);
		this.settings = { ...this.settings, quality };
		this.clearHistory();
		this.commitHistory(false);
		try {
			this.recoveryCheckpoint = this.readProjectFields();
		} catch {
			this.recoveryCheckpoint = null;
		}
		this.render(this.settings);
	}

	seed(settings: SimulationSettings, recordHistory = true) {
		this.assertReady();
		this.settings = cloneSettings(settings);
		const gl = this.gl;
		const program = this.programs!.seed;
		gl.useProgram(program);
		gl.bindVertexArray(this.vao);
		this.setSeedUniforms(program, settings);
		for (const target of [this.readSet!, this.writeSet!]) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
			gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
			gl.viewport(0, 0, this.width, this.height);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.recoveryCheckpoint = null;
		if (recordHistory) {
			this.clearHistory();
			this.commitHistory(true);
		}
		this.render(settings);
	}

	step(
		settings: SimulationSettings,
		injections: readonly BrushInjection[],
		deltaSeconds: number,
		timeSeconds: number
	) {
		this.assertReady();
		this.settings = cloneSettings(settings);
		const passCount = Math.max(1, Math.min(8, injections.length || 1));
		const dt = Math.min(1 / 24, Math.max(1 / 360, deltaSeconds / passCount));
		for (let index = 0; index < passCount; index += 1) {
			this.simulationPass(settings, injections[index] ?? null, dt, timeSeconds, 0);
		}
		this.render(settings);
	}

	advanceOneStep(settings: SimulationSettings) {
		this.step(settings, [], 1 / 60, performance.now() / 1_000);
	}

	dryArtwork(settings: SimulationSettings) {
		this.assertReady();
		for (let index = 0; index < 7; index += 1) {
			this.simulationPass(settings, null, 1 / 30, performance.now() / 1_000, 1);
		}
		this.render(settings);
		this.commitHistory(true);
	}

	render(settings: SimulationSettings) {
		if (this.destroyed || this.contextLost || !this.readSet || !this.programs || !this.vao) return;
		this.settings = cloneSettings(settings);
		this.drawRenderPass(settings, null, this.canvas.width, this.canvas.height);
	}

	commitHistory(captureRecovery = true) {
		this.assertReady();
		if (this.historyIndex < this.history.length - 1) {
			for (const snapshot of this.history.splice(this.historyIndex + 1))
				this.deleteFieldSet(snapshot);
		}
		const snapshot = this.createFieldSet(this.width, this.height);
		this.copySet(this.readSet!, snapshot, this.width, this.height);
		this.history.push(snapshot);
		if (this.history.length > MAX_HISTORY) {
			this.deleteFieldSet(this.history.shift()!);
		}
		this.historyIndex = this.history.length - 1;
		this.actionCount += 1;
		if (captureRecovery && this.actionCount % 4 === 0) {
			try {
				this.recoveryCheckpoint = this.readProjectFields();
			} catch {
				this.recoveryCheckpoint = null;
			}
		}
	}

	undo(settings: SimulationSettings) {
		this.assertReady();
		if (!this.canUndo) return false;
		this.historyIndex -= 1;
		this.restoreSnapshot(this.history[this.historyIndex]);
		this.render(settings);
		return true;
	}

	redo(settings: SimulationSettings) {
		this.assertReady();
		if (!this.canRedo) return false;
		this.historyIndex += 1;
		this.restoreSnapshot(this.history[this.historyIndex]);
		this.render(settings);
		return true;
	}

	readProjectFields(): ProjectFieldData {
		this.assertReady();
		return {
			state: this.readAttachment(0),
			deposit: this.readAttachment(1),
			flow: this.readAttachment(2)
		};
	}

	restoreProject(
		fields: ProjectFieldData,
		width: number,
		height: number,
		settings: SimulationSettings
	) {
		this.assertReady();
		if (width < 32 || height < 32 || width > 2_048 || height > 2_048) {
			throw new Error('The saved project resolution is outside the supported range.');
		}
		const expected = width * height * 4;
		if ([fields.state, fields.deposit, fields.flow].some((field) => field.length !== expected)) {
			throw new Error('The saved pigment fields do not match their declared resolution.');
		}
		const oldRead = this.readSet!;
		const oldWrite = this.writeSet!;
		let nextRead: FieldSet | null = null;
		let nextWrite: FieldSet | null = null;
		try {
			nextRead = this.createFieldSet(width, height);
			nextWrite = this.createFieldSet(width, height);
			this.uploadProjectFields(nextRead, fields, width, height);
			this.uploadProjectFields(nextWrite, fields, width, height);
		} catch (error) {
			if (nextRead) this.deleteFieldSet(nextRead);
			if (nextWrite) this.deleteFieldSet(nextWrite);
			throw error;
		}
		this.readSet = nextRead;
		this.writeSet = nextWrite;
		this.width = width;
		this.height = height;
		this.deleteFieldSet(oldRead);
		this.deleteFieldSet(oldWrite);
		this.settings = cloneSettings(settings);
		this.recoveryCheckpoint = {
			state: fields.state.slice(),
			deposit: fields.deposit.slice(),
			flow: fields.flow.slice()
		};
		this.clearHistory();
		this.commitHistory(false);
		this.render(settings);
	}

	async exportBlob(
		settings: SimulationSettings,
		format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
		scale = 1
	) {
		this.assertReady();
		const gl = this.gl;
		const safeScale = Math.min(2, Math.max(1, scale));
		const width = Math.min(4_096, Math.max(1, Math.round(this.width * safeScale)));
		const height = Math.min(4_096, Math.max(1, Math.round(this.height * safeScale)));
		const texture = gl.createTexture();
		if (!texture) throw new Error('The export surface could not be allocated.');
		const framebuffer = gl.createFramebuffer();
		if (!framebuffer) {
			gl.deleteTexture(texture);
			throw new Error('The export surface could not be allocated.');
		}

		try {
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
				throw new Error('The high-resolution export target is not supported by this GPU.');
			}
			this.drawRenderPass(settings, framebuffer, width, height);
			const pixels = new Uint8Array(width * height * 4);
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
			gl.readBuffer(gl.COLOR_ATTACHMENT0);
			gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
			const flipped = new Uint8ClampedArray(pixels.length);
			const rowLength = width * 4;
			for (let row = 0; row < height; row += 1) {
				flipped.set(
					pixels.subarray(row * rowLength, (row + 1) * rowLength),
					(height - row - 1) * rowLength
				);
			}
			const output = document.createElement('canvas');
			output.width = width;
			output.height = height;
			const context = output.getContext('2d');
			if (!context) throw new Error('The browser could not prepare the exported bitmap.');
			context.putImageData(new ImageData(flipped, width, height), 0, 0);
			const blob = await new Promise<Blob>((resolve, reject) => {
				output.toBlob(
					(value) =>
						value ? resolve(value) : reject(new Error('The browser did not create an image.')),
					format,
					0.93
				);
			});
			return blob;
		} finally {
			gl.deleteFramebuffer(framebuffer);
			gl.deleteTexture(texture);
			this.render(settings);
		}
	}

	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
		this.clearHistory();
		if (this.readSet) this.deleteFieldSet(this.readSet);
		if (this.writeSet) this.deleteFieldSet(this.writeSet);
		this.readSet = null;
		this.writeSet = null;
		if (this.programs) {
			this.gl.deleteProgram(this.programs.seed);
			this.gl.deleteProgram(this.programs.simulation);
			this.gl.deleteProgram(this.programs.render);
			this.gl.deleteProgram(this.programs.copy);
		}
		if (this.vao) this.gl.deleteVertexArray(this.vao);
		this.programs = null;
		this.vao = null;
		this.uniformLocations.clear();
		this.recoveryCheckpoint = null;
		this.gl.getExtension('WEBGL_lose_context')?.loseContext();
	}

	private assertUsable() {
		if (this.destroyed) throw new Error('The pigment surface has already been released.');
		if (this.contextLost) throw new Error('The WebGL context is currently unavailable.');
	}

	private assertReady() {
		this.assertUsable();
		if (!this.programs || !this.vao || !this.readSet || !this.writeSet) {
			throw new Error('The pigment surface is not ready yet.');
		}
	}

	private createPrograms() {
		this.programs = {
			seed: this.createProgram(vertexSource, seedFragmentSource, 'background'),
			simulation: this.createProgram(vertexSource, simulationFragmentSource, 'simulation'),
			render: this.createProgram(vertexSource, renderFragmentSource, 'rendering'),
			copy: this.createProgram(vertexSource, copyFragmentSource, 'copy')
		};
	}

	private createProgram(vertex: string, fragment: string, label: string) {
		const gl = this.gl;
		const compile = (type: number, source: string) => {
			const shader = gl.createShader(type);
			if (!shader) throw new Error(`The ${label} shader could not be created.`);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				this.shaderLog += `${label}: ${gl.getShaderInfoLog(shader) ?? 'Unknown compilation error'}\n`;
				gl.deleteShader(shader);
				throw new Error(`The ${label} shader could not be prepared on this GPU.`);
			}
			return shader;
		};
		const vertexShader = compile(gl.VERTEX_SHADER, vertex);
		const fragmentShader = compile(gl.FRAGMENT_SHADER, fragment);
		const program = gl.createProgram();
		if (!program) throw new Error(`The ${label} shader program could not be created.`);
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			this.shaderLog += `${label}: ${gl.getProgramInfoLog(program) ?? 'Unknown link error'}\n`;
			gl.deleteProgram(program);
			throw new Error(`The ${label} shader passes could not be connected.`);
		}
		return program;
	}

	private createFieldSet(width: number, height: number): FieldSet {
		const gl = this.gl;
		const textures: WebGLTexture[] = [];
		let framebuffer: WebGLFramebuffer | null = null;
		try {
			for (let index = 0; index < 3; index += 1) {
				const texture = gl.createTexture();
				if (!texture) throw new Error('A pigment texture could not be allocated.');
				textures.push(texture);
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					this.textureFormat.internalFormat,
					width,
					height,
					0,
					gl.RGBA,
					this.textureFormat.type,
					null
				);
			}
			framebuffer = gl.createFramebuffer();
			if (!framebuffer) throw new Error('A pigment framebuffer could not be allocated.');
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			textures.forEach((texture, index) => {
				gl.framebufferTexture2D(
					gl.FRAMEBUFFER,
					gl.COLOR_ATTACHMENT0 + index,
					gl.TEXTURE_2D,
					texture,
					0
				);
			});
			gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
				throw new Error('This GPU cannot render into the selected pigment texture format.');
			}
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			return {
				textures: textures as [WebGLTexture, WebGLTexture, WebGLTexture],
				framebuffer
			};
		} catch (error) {
			textures.forEach((texture) => gl.deleteTexture(texture));
			if (framebuffer) gl.deleteFramebuffer(framebuffer);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			throw error;
		}
	}

	private simulationPass(
		settings: SimulationSettings,
		injection: BrushInjection | null,
		dt: number,
		time: number,
		forceDry: number
	) {
		const gl = this.gl;
		const program = this.programs!.simulation;
		gl.useProgram(program);
		gl.bindVertexArray(this.vao);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeSet!.framebuffer);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
		gl.viewport(0, 0, this.width, this.height);
		this.bindFields(program, this.readSet!);

		this.uniform2f(program, 'u_texel', 1 / this.width, 1 / this.height);
		this.uniform2f(program, 'u_aspect', this.width / this.height, 1);
		this.uniform1f(program, 'u_dt', dt * settings.simulationSpeed);
		this.uniform1f(program, 'u_time', time);
		this.uniform1i(program, 'u_mode', MODE_INDEX[settings.mode]);
		this.uniform1f(program, 'u_diffusion', settings.diffusion);
		this.uniform1f(program, 'u_surface_moisture', settings.surfaceMoisture);
		this.uniform1f(program, 'u_drying', settings.dryingSpeed);
		this.uniform1f(program, 'u_viscosity', settings.viscosity);
		this.uniform1f(program, 'u_flow_strength', settings.flowStrength);
		this.uniform1f(program, 'u_turbulence', settings.turbulence);
		this.uniform1f(program, 'u_granulation', settings.granulation);
		this.uniform1f(program, 'u_edge_darkening', settings.edgeDarkening);
		this.uniform1f(program, 'u_mixing', settings.mixingStrength);
		this.uniform1f(program, 'u_texture', settings.textureStrength);
		this.uniform1f(program, 'u_force_dry', forceDry);
		this.uniform1f(program, 'u_float_mode', this.textureFormat.float ? 1 : 0);
		this.uniform1f(program, 'u_seed', settings.background.seed);

		this.uniform1f(program, 'u_injecting', injection ? 1 : 0);
		const brush = BRUSHES.find((candidate) => candidate.id === settings.brush) ?? BRUSHES[0];
		this.uniform1i(program, 'u_brush', BRUSH_INDEX[settings.brush]);
		this.uniform2f(program, 'u_brush_from', injection?.from.x ?? 0, injection?.from.y ?? 0);
		this.uniform2f(program, 'u_brush_to', injection?.to.x ?? 0, injection?.to.y ?? 0);
		const visibleHeight = Math.max(320, this.canvas.clientHeight || 480);
		this.uniform1f(program, 'u_brush_radius', settings.brushSize / visibleHeight);
		this.uniform1f(program, 'u_pressure', injection?.to.pressure ?? 0.5);
		this.uniform2f(
			program,
			'u_tilt',
			(injection?.to.tiltX ?? 0) / 90,
			-(injection?.to.tiltY ?? 0) / 90
		);
		this.uniform3f(program, 'u_pigment_color', ...(injection?.color ?? [0, 0, 0]));
		this.uniform1f(program, 'u_pigment_amount', settings.pigmentAmount * brush.pigmentScale);
		this.uniform1f(program, 'u_transparency', settings.transparency);
		this.uniform1f(program, 'u_water_amount', settings.waterAmount * brush.waterScale);
		const segmentDuration = Math.max(1, (injection?.to.time ?? 0) - (injection?.from.time ?? 0));
		const segmentSpeed = injection
			? (Math.hypot(injection.to.x - injection.from.x, injection.to.y - injection.from.y) * 1_000) /
				segmentDuration
			: 0;
		const velocityFactor = 0.65 + Math.min(1.35, segmentSpeed * 0.3);
		this.uniform1f(
			program,
			'u_stroke_force',
			settings.flowStrength * brush.flowScale * (injection?.to.pressure ?? 0.5) * velocityFactor
		);
		this.uniform1f(program, 'u_pigment_granulation', injection?.granulation ?? 0.5);
		this.uniform1f(program, 'u_pigment_staining', injection?.staining ?? 0.5);
		this.uniform1f(program, 'u_pigment_density', injection?.density ?? 0.7);
		this.uniform1f(program, 'u_eraser_strength', settings.eraserStrength);
		this.uniform1f(program, 'u_eraser_softness', settings.eraserSoftness);
		this.uniform1f(program, 'u_wet_lifting', settings.wetLifting ? 1 : 0);

		gl.drawArrays(gl.TRIANGLES, 0, 3);
		this.swapFieldSets();
	}

	private drawRenderPass(
		settings: SimulationSettings,
		framebuffer: WebGLFramebuffer | null,
		width: number,
		height: number
	) {
		const gl = this.gl;
		const program = this.programs!.render;
		gl.useProgram(program);
		gl.bindVertexArray(this.vao);
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.drawBuffers([framebuffer ? gl.COLOR_ATTACHMENT0 : gl.BACK]);
		gl.viewport(0, 0, width, height);
		this.bindFields(program, this.readSet!);
		this.uniform2f(program, 'u_texel', 1 / this.width, 1 / this.height);
		this.uniform3f(program, 'u_paper_color', ...paperColor(settings));
		this.uniform1f(program, 'u_texture', settings.textureStrength);
		this.uniform1f(program, 'u_edge_darkening', settings.edgeDarkening);
		this.uniform1f(program, 'u_float_mode', this.textureFormat.float ? 1 : 0);
		this.uniform1f(program, 'u_seed', settings.background.seed);
		this.uniform1i(program, 'u_mode', MODE_INDEX[settings.mode]);
		this.uniform1i(
			program,
			'u_surface',
			settings.background.mode === 'canvas' ? 2 : settings.background.mode === 'handmade' ? 1 : 0
		);
		this.uniform1i(program, 'u_overlay', OVERLAY_INDEX[settings.overlay]);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	private setSeedUniforms(program: WebGLProgram, settings: SimulationSettings) {
		this.uniform1f(program, 'u_seed', settings.background.seed);
		this.uniform1i(program, 'u_background', BACKGROUND_INDEX[settings.background.mode]);
		this.uniform1i(program, 'u_regions', settings.background.regions);
		this.uniform1f(program, 'u_moisture', settings.background.moisture);
		this.uniform1f(program, 'u_turbulence', settings.background.turbulence);
		this.uniform1f(program, 'u_scale', settings.background.scale);
		this.uniform1f(program, 'u_symmetry', settings.background.symmetry);
		this.uniform1f(program, 'u_intensity', settings.background.intensity);
		this.uniform1f(program, 'u_float_mode', this.textureFormat.float ? 1 : 0);
		this.uniform2f(program, 'u_aspect', this.width / this.height, 1);
		const palette = settings.paletteIds
			.map((id) => getPigment(id).absorption)
			.filter(Boolean)
			.slice(0, 5);
		while (palette.length < 5) palette.push(colorToAbsorption('#315a96'));
		palette.forEach((absorption, index) => {
			this.uniform3f(program, `u_palette[${index}]`, ...absorption);
		});
	}

	private bindFields(program: WebGLProgram, fields: FieldSet) {
		const gl = this.gl;
		fields.textures.forEach((texture, index) => {
			gl.activeTexture(gl.TEXTURE0 + index);
			gl.bindTexture(gl.TEXTURE_2D, texture);
		});
		this.uniform1i(program, 'u_mobile', 0);
		this.uniform1i(program, 'u_deposit', 1);
		this.uniform1i(program, 'u_flow', 2);
	}

	private copySet(source: FieldSet, target: FieldSet, width: number, height: number) {
		const gl = this.gl;
		const program = this.programs!.copy;
		gl.useProgram(program);
		gl.bindVertexArray(this.vao);
		gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
		gl.viewport(0, 0, width, height);
		this.bindFields(program, source);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	private restoreSnapshot(snapshot: FieldSet) {
		this.copySet(snapshot, this.readSet!, this.width, this.height);
		this.copySet(snapshot, this.writeSet!, this.width, this.height);
	}

	private swapFieldSets() {
		const current = this.readSet;
		this.readSet = this.writeSet;
		this.writeSet = current;
	}

	private clearHistory() {
		for (const snapshot of this.history) this.deleteFieldSet(snapshot);
		this.history = [];
		this.historyIndex = -1;
	}

	private deleteFieldSet(fields: FieldSet) {
		fields.textures.forEach((texture) => this.gl.deleteTexture(texture));
		this.gl.deleteFramebuffer(fields.framebuffer);
	}

	private readAttachment(index: 0 | 1 | 2) {
		const gl = this.gl;
		const length = this.width * this.height * 4;
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.readSet!.framebuffer);
		gl.readBuffer(gl.COLOR_ATTACHMENT0 + index);
		const output = new Uint8Array(length);

		if (this.textureFormat.float) {
			const values = new Float32Array(length);
			gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.FLOAT, values);
			for (let offset = 0; offset < length; offset += 4) {
				if (index < 2) {
					output[offset] = Math.round(Math.min(1, Math.max(0, values[offset] / 4)) * 255);
					output[offset + 1] = Math.round(Math.min(1, Math.max(0, values[offset + 1] / 4)) * 255);
					output[offset + 2] = Math.round(Math.min(1, Math.max(0, values[offset + 2] / 4)) * 255);
					output[offset + 3] = Math.round(
						Math.min(1, Math.max(0, values[offset + 3] / (index === 1 ? 2 : 1))) * 255
					);
				} else {
					output[offset] = Math.round(
						Math.min(1, Math.max(0, values[offset] / VELOCITY_RANGE + 0.5)) * 255
					);
					output[offset + 1] = Math.round(
						Math.min(1, Math.max(0, values[offset + 1] / VELOCITY_RANGE + 0.5)) * 255
					);
					output[offset + 2] = Math.round(Math.min(1, Math.max(0, values[offset + 2])) * 255);
					output[offset + 3] = Math.round(Math.min(1, Math.max(0, values[offset + 3])) * 255);
				}
			}
		} else {
			const values = new Uint8Array(length);
			gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, values);
			for (let offset = 0; offset < length; offset += 4) {
				if (index < 2) {
					output[offset] = Math.round(values[offset] / 4);
					output[offset + 1] = Math.round(values[offset + 1] / 4);
					output[offset + 2] = Math.round(values[offset + 2] / 4);
					output[offset + 3] = Math.round(values[offset + 3] / (index === 1 ? 2 : 1));
				} else {
					output.set(values.subarray(offset, offset + 4), offset);
				}
			}
		}
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
		return output;
	}

	private uploadProjectFields(
		target: FieldSet,
		fields: ProjectFieldData,
		width = this.width,
		height = this.height
	) {
		const values = [fields.state, fields.deposit, fields.flow];
		target.textures.forEach((texture, index) =>
			this.uploadAttachment(texture, index, values[index], width, height)
		);
	}

	private uploadAttachment(
		texture: WebGLTexture,
		index: number,
		bytes: Uint8Array,
		width: number,
		height: number
	) {
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		if (this.textureFormat.float) {
			const values = new Float32Array(bytes.length);
			for (let offset = 0; offset < bytes.length; offset += 4) {
				if (index < 2) {
					values[offset] = (bytes[offset] / 255) * 4;
					values[offset + 1] = (bytes[offset + 1] / 255) * 4;
					values[offset + 2] = (bytes[offset + 2] / 255) * 4;
					values[offset + 3] = (bytes[offset + 3] / 255) * (index === 1 ? 2 : 1);
				} else {
					values[offset] = (bytes[offset] / 255 - 0.5) * VELOCITY_RANGE;
					values[offset + 1] = (bytes[offset + 1] / 255 - 0.5) * VELOCITY_RANGE;
					values[offset + 2] = bytes[offset + 2] / 255;
					values[offset + 3] = bytes[offset + 3] / 255;
				}
			}
			gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, values);
		} else {
			const values = bytes.slice();
			if (index < 2) {
				for (let offset = 0; offset < values.length; offset += 4) {
					values[offset] = Math.min(255, values[offset] * 4);
					values[offset + 1] = Math.min(255, values[offset + 1] * 4);
					values[offset + 2] = Math.min(255, values[offset + 2] * 4);
					values[offset + 3] = Math.min(255, values[offset + 3] * (index === 1 ? 2 : 1));
				}
			}
			gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, values);
		}
	}

	private uniform(program: WebGLProgram, name: string) {
		let locations = this.uniformLocations.get(program);
		if (!locations) {
			locations = new Map();
			this.uniformLocations.set(program, locations);
		}
		if (!locations.has(name)) locations.set(name, this.gl.getUniformLocation(program, name));
		return locations.get(name) ?? null;
	}

	private uniform1f(program: WebGLProgram, name: string, value: number) {
		this.gl.uniform1f(this.uniform(program, name), value);
	}

	private uniform1i(program: WebGLProgram, name: string, value: number) {
		this.gl.uniform1i(this.uniform(program, name), value);
	}

	private uniform2f(program: WebGLProgram, name: string, first: number, second: number) {
		this.gl.uniform2f(this.uniform(program, name), first, second);
	}

	private uniform3f(
		program: WebGLProgram,
		name: string,
		first: number,
		second: number,
		third: number
	) {
		this.gl.uniform3f(this.uniform(program, name), first, second, third);
	}

	private handleContextLost = (event: Event) => {
		event.preventDefault();
		this.contextLost = true;
		this.callbacks.onContextLost?.();
	};

	private handleContextRestored = () => {
		if (this.destroyed) return;
		this.contextLost = false;
		this.programs = null;
		this.vao = null;
		this.readSet = null;
		this.writeSet = null;
		this.history = [];
		this.historyIndex = -1;
		this.uniformLocations.clear();
		try {
			this.createPrograms();
			this.vao = this.gl.createVertexArray();
			if (!this.vao) throw new Error('The restored context could not recreate its geometry.');
			this.readSet = this.createFieldSet(this.width, this.height);
			this.writeSet = this.createFieldSet(this.width, this.height);
			const recovered = Boolean(this.recoveryCheckpoint);
			if (this.recoveryCheckpoint) {
				this.uploadProjectFields(this.readSet, this.recoveryCheckpoint);
				this.uploadProjectFields(this.writeSet, this.recoveryCheckpoint);
			} else {
				this.seed(this.settings, false);
			}
			this.commitHistory(false);
			this.render(this.settings);
			this.callbacks.onContextRestored?.(recovered);
		} catch (error) {
			this.shaderLog += `${error instanceof Error ? error.message : String(error)}\n`;
			this.contextLost = true;
			this.callbacks.onContextLost?.();
		}
	};
}
