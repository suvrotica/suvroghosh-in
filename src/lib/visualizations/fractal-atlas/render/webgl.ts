import type {
	CustomMapInitialZRule,
	FractalFamily,
	FractalViewState,
	OrbitTrapKind,
	RenderQuality
} from '../types';
import { cloneCustomMapRecipe, customMapSupportsDistanceEstimate } from '../custom-map';
import {
	createPrecisionReferenceWorkerClient,
	precisionReferenceConfig,
	type PrecisionReferenceResult,
	type PrecisionReferenceWorkerClient
} from '../precision/client';
import {
	doubleSingleCoordinateGridCollapses,
	splitDecimalDoubleSingle,
	splitDoubleSingle
} from '../precision/double-single';
import type { PrecisionWorkerResponse } from '../precision/protocol';
import {
	findPolynomialRoots,
	MAX_NEWTON_ROOTS,
	MAX_PERTURBATION_SHADER_ITERATIONS,
	MAX_POLYNOMIAL_COEFFICIENTS,
	MAX_SHADER_ITERATIONS,
	normalizePolynomialCoefficients
} from './math';
import { COLORING_MODE_IDS, paletteUniforms } from './palette';
import {
	computeRenderSize,
	floatCoordinateGridCollapses,
	MAX_RENDER_DIMENSION,
	WEBGL_MAX_WORK_UNITS,
	type RenderSizeOptions
} from './quality';
import { FRACTAL_VERTEX_SOURCE, fractalFragmentSource, type FractalShaderVariant } from './shaders';

export interface WebGLFractalRendererCallbacks {
	onStatus?: (message: string) => void;
	onError?: (message: string) => void;
	onContextLost?: () => void;
	onContextRestored?: () => void;
	onPrecisionReady?: () => void;
	onPrecisionDiagnostics?: (diagnostics: WebGLPrecisionDiagnostics) => void;
}

export interface WebGLFractalRenderOptions {
	preview?: boolean;
	pixelRatio?: number;
	maxPixels?: number;
}

export interface WebGLFractalRenderResult {
	backend: 'webgl2';
	width: number;
	height: number;
	preview: boolean;
	variant: FractalShaderVariant;
	iterations: number;
	requestedIterations: number;
	renderMilliseconds: number;
	precisionTier: WebGLPrecisionTier;
	precision: WebGLPrecisionDiagnostics;
}

export type WebGLPrecisionTier = 'gpu-float' | 'double-single' | 'perturbation';

export interface WebGLPrecisionDiagnostics {
	tier: WebGLPrecisionTier;
	label: 'GPU float' | 'Extended double-single' | 'Perturbation';
	estimatedDecimalDigits: number;
	pixelScale: number;
	magnification: number;
	neighboursDistinct: boolean;
	increasedRenderCost: string;
	referencePending: boolean;
	referencePrecisionDigits?: number;
	referenceUploadDigits?: number;
	rebased: boolean;
	glitchesDetected: number;
	diagnosticSamples: number;
	settingsHash?: string;
}

interface ProgramResources {
	program: WebGLProgram;
	locations: Map<string, WebGLUniformLocation | null>;
}

const FAMILY_IDS: Record<FractalFamily, number> = {
	mandelbrot: 0,
	julia: 1,
	multibrot: 2,
	'burning-ship': 3,
	tricorn: 4,
	phoenix: 5,
	newton: 6,
	buddhabrot: 7,
	'barnsley-fern': 8,
	sierpinski: 9,
	'l-system': 10,
	'custom-map': 11
};

const TRAP_IDS: Record<OrbitTrapKind, number> = {
	point: 0,
	line: 1,
	circle: 2,
	cross: 3,
	grid: 4
};

function now() {
	return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function customMapInitialRuleId(rule: CustomMapInitialZRule) {
	switch (rule) {
		case 'plane-default':
			return 0;
		case 'zero':
			return 1;
		case 'pixel':
			return 2;
		case 'parameter':
			return 3;
	}
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('WebGL2 could not allocate a shader.');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const message = gl.getShaderInfoLog(shader) ?? 'Unknown fractal shader compilation error.';
		gl.deleteShader(shader);
		throw new Error(message);
	}
	return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
	const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
	let fragment: WebGLShader | null = null;
	let program: WebGLProgram | null = null;
	try {
		fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
		program = gl.createProgram();
		if (!program) throw new Error('WebGL2 could not allocate a fractal shader program.');
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(
				gl.getProgramInfoLog(program) ?? 'The fractal shader program failed to link.'
			);
		}
		return program;
	} catch (error) {
		if (program) gl.deleteProgram(program);
		throw error;
	} finally {
		gl.deleteShader(vertex);
		if (fragment) gl.deleteShader(fragment);
	}
}

function ordinaryShaderVariant(family: FractalFamily): FractalShaderVariant {
	switch (family) {
		case 'mandelbrot':
		case 'julia':
		case 'multibrot':
			return 'escape';
		case 'burning-ship':
			return 'burning-ship';
		case 'tricorn':
			return 'tricorn';
		case 'phoenix':
			return 'phoenix';
		case 'custom-map':
			return 'custom-map';
		case 'newton':
			return 'newton';
		default:
			throw new Error(`The WebGL2 fractal renderer cannot draw the ${family} family.`);
	}
}

function supportsQuadraticPrecision(state: FractalViewState) {
	return (
		(state.family === 'mandelbrot' && state.plane === 'parameter') ||
		(state.family === 'julia' && state.plane === 'dynamical')
	);
}

function finite(value: number | null | undefined, fallback: number) {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function requestedIterationLimit(state: FractalViewState) {
	return Math.max(1, Math.floor(finite(state.maxIterations, 96)));
}

function shaderWorkMultiplier(state: FractalViewState) {
	if (state.family === 'multibrot') {
		return Math.max(1, Math.min(6, Math.round(finite(state.exponent, 2)) / 2));
	}
	if (state.family === 'newton') {
		return Math.max(1, Math.min(4, (state.polynomial?.coefficients.length ?? 4) / 2));
	}
	if (state.family === 'custom-map') {
		const recipe = cloneCustomMapRecipe(state.customMap);
		return Math.max(1, Math.min(8, recipe.power / 2 + (recipe.memoryEnabled ? 0.75 : 0)));
	}
	return state.family === 'phoenix' ? 1.5 : 1;
}

export class WebGLPrecisionFallbackRequiredError extends Error {
	override readonly name = 'WebGLPrecisionFallbackRequiredError';
}

export class WebGLHistogramFallbackRequiredError extends Error {
	override readonly name = 'WebGLHistogramFallbackRequiredError';
}

/**
 * Demand-rendered WebGL2 backend. It owns no animation loop: callers render
 * only after state, size, or preview quality changes.
 */
export class WebGLFractalRenderer {
	readonly backend = 'webgl2' as const;
	private gl: WebGL2RenderingContext;
	private vao: WebGLVertexArrayObject | null = null;
	private programs = new Map<FractalShaderVariant, ProgramResources>();
	private cssWidth = 1;
	private cssHeight = 1;
	private pixelRatio = 1;
	private contextLost = false;
	private destroyed = false;
	private lastState: FractalViewState | null = null;
	private lastOptions: WebGLFractalRenderOptions = {};
	private precisionClient: PrecisionReferenceWorkerClient | null = null;
	private precisionUnsubscribe: (() => void) | null = null;
	private precisionReference: { settingsHash: string; result: PrecisionReferenceResult } | null =
		null;
	private pendingPrecisionHash = '';
	private precisionTexture: WebGLTexture | null = null;
	private precisionMetadataTexture: WebGLTexture | null = null;
	private uploadedPrecisionReference: PrecisionReferenceResult | null = null;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly callbacks: WebGLFractalRendererCallbacks = {}
	) {
		const context = canvas.getContext('webgl2', {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			powerPreference: 'high-performance',
			preserveDrawingBuffer: true,
			failIfMajorPerformanceCaveat: true
		});
		if (!context) throw new Error('WebGL2 is unavailable.');
		this.gl = context;
		this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
		this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
		try {
			this.createGeometry();
		} catch (error) {
			this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
			this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
			throw error;
		}

		const rectangle = this.canvas.getBoundingClientRect();
		this.cssWidth = rectangle.width || this.canvas.clientWidth || this.canvas.width || 1;
		this.cssHeight = rectangle.height || this.canvas.clientHeight || this.canvas.height || 1;
	}

	get ready() {
		return !this.destroyed && !this.contextLost && this.vao !== null;
	}

	get isContextLost() {
		return this.contextLost;
	}

	resize(cssWidth: number, cssHeight: number, pixelRatio = this.defaultPixelRatio()) {
		this.ensureActive();
		this.cssWidth = Math.max(1, finite(cssWidth, 1));
		this.cssHeight = Math.max(1, finite(cssHeight, 1));
		this.pixelRatio = Math.max(0.5, Math.min(3, finite(pixelRatio, 1)));
		if (this.lastState && !this.contextLost) this.render(this.lastState, this.lastOptions);
	}

	render(
		state: FractalViewState,
		options: WebGLFractalRenderOptions = {}
	): WebGLFractalRenderResult {
		this.ensureActive();
		if (this.contextLost) throw new Error('The WebGL2 context is currently lost.');
		const startedAt = now();

		try {
			const requestedIterations = requestedIterationLimit(state);
			let iterations = Math.min(MAX_SHADER_ITERATIONS, requestedIterations);
			if (state.coloring === 'histogram') {
				throw new WebGLHistogramFallbackRequiredError(
					'Histogram equalisation needs a bounded two-pass frame analysis. Using the Canvas 2D CDF renderer.'
				);
			}
			let size = this.applyDrawingBuffer(state, options, iterations);
			let requestedTier = this.selectPrecisionTier(state, size.height);
			if (requestedTier === 'perturbation') {
				iterations = Math.min(iterations, MAX_PERTURBATION_SHADER_ITERATIONS);
				size = this.applyDrawingBuffer(state, options, iterations);
				requestedTier = this.selectPrecisionTier(state, size.height);
			}
			const precisionSelection = this.preparePrecisionTier(
				state,
				size.width,
				size.height,
				iterations,
				requestedTier
			);
			const precisionTier = precisionSelection.tier;
			const variant =
				precisionTier === 'perturbation'
					? 'quadratic-perturbation'
					: precisionTier === 'double-single'
						? 'quadratic-double-single'
						: ordinaryShaderVariant(state.family);
			this.lastState = state;
			this.lastOptions = { ...options };
			const resources = this.program(variant);
			const gl = this.gl;
			gl.viewport(0, 0, size.width, size.height);
			gl.disable(gl.BLEND);
			gl.disable(gl.DEPTH_TEST);
			gl.disable(gl.CULL_FACE);
			gl.useProgram(resources.program);
			gl.bindVertexArray(this.vao);
			this.uploadState(
				resources,
				state,
				size.width,
				size.height,
				iterations,
				variant,
				precisionSelection.reference
			);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.bindVertexArray(null);
			const renderMilliseconds = now() - startedAt;
			const precision = this.precisionDiagnostics(
				state,
				size.height,
				precisionTier,
				precisionSelection.reference,
				precisionSelection.referencePending,
				precisionSelection.settingsHash
			);
			const iterationNote =
				iterations < requestedIterations
					? ` The shader used its safe ceiling of ${iterations} iterations.`
					: '';
			this.callbacks.onStatus?.(
				`${options.preview ? 'Preview' : 'Fractal'} frame ready at ${size.width} × ${size.height} using ${precision.label}.${iterationNote}${precision.referencePending ? ' A high-precision reference orbit is being calculated.' : ''}`
			);
			this.callbacks.onPrecisionDiagnostics?.(precision);
			return {
				backend: 'webgl2',
				width: size.width,
				height: size.height,
				preview: options.preview ?? false,
				variant,
				iterations,
				requestedIterations,
				renderMilliseconds,
				precisionTier,
				precision
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'The WebGL2 fractal frame could not render.';
			this.callbacks.onError?.(message);
			throw error;
		}
	}

	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
		this.precisionUnsubscribe?.();
		this.precisionUnsubscribe = null;
		this.precisionClient?.dispose();
		this.precisionClient = null;
		if (!this.contextLost) {
			for (const resources of this.programs.values()) this.gl.deleteProgram(resources.program);
			if (this.vao) this.gl.deleteVertexArray(this.vao);
			if (this.precisionTexture) this.gl.deleteTexture(this.precisionTexture);
			if (this.precisionMetadataTexture) this.gl.deleteTexture(this.precisionMetadataTexture);
			this.gl.getExtension('WEBGL_lose_context')?.loseContext();
		}
		this.programs.clear();
		this.vao = null;
		this.lastState = null;
		this.precisionReference = null;
		this.precisionTexture = null;
		this.precisionMetadataTexture = null;
		this.uploadedPrecisionReference = null;
	}

	private defaultPixelRatio() {
		return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
	}

	private ensureActive() {
		if (this.destroyed) throw new Error('The WebGL2 fractal renderer has been destroyed.');
	}

	private createGeometry() {
		this.vao = this.gl.createVertexArray();
		if (!this.vao) throw new Error('WebGL2 could not allocate the full-screen triangle.');
	}

	private program(variant: FractalShaderVariant) {
		const existing = this.programs.get(variant);
		if (existing) return existing;
		const program = createProgram(this.gl, FRACTAL_VERTEX_SOURCE, fractalFragmentSource(variant));
		const resources = { program, locations: new Map<string, WebGLUniformLocation | null>() };
		this.programs.set(variant, resources);
		return resources;
	}

	private location(resources: ProgramResources, name: string) {
		if (!resources.locations.has(name)) {
			let location = this.gl.getUniformLocation(resources.program, name);
			if (location === null && !name.endsWith('[0]')) {
				location = this.gl.getUniformLocation(resources.program, `${name}[0]`);
			}
			resources.locations.set(name, location);
		}
		return resources.locations.get(name) ?? null;
	}

	private uniform1i(resources: ProgramResources, name: string, value: number) {
		this.gl.uniform1i(this.location(resources, name), value);
	}

	private uniform1f(resources: ProgramResources, name: string, value: number) {
		this.gl.uniform1f(this.location(resources, name), value);
	}

	private uniform2f(resources: ProgramResources, name: string, x: number, y: number) {
		this.gl.uniform2f(this.location(resources, name), x, y);
	}

	private applyDrawingBuffer(
		state: FractalViewState,
		options: WebGLFractalRenderOptions,
		iterations: number
	) {
		const callerMaximumPixels =
			typeof options.maxPixels === 'number' &&
			Number.isFinite(options.maxPixels) &&
			options.maxPixels > 0
				? options.maxPixels
				: Number.POSITIVE_INFINITY;
		const workMaximumPixels = Math.max(
			1,
			Math.floor(WEBGL_MAX_WORK_UNITS / (iterations * shaderWorkMultiplier(state)))
		);
		const size = computeRenderSize(this.cssWidth, this.cssHeight, {
			devicePixelRatio: options.pixelRatio ?? this.pixelRatio,
			quality: state.renderQuality,
			preview: options.preview,
			maxPixels: Math.min(callerMaximumPixels, workMaximumPixels),
			maxDimension: this.maximumDrawingBufferDimension()
		});
		if (this.canvas.width !== size.width) this.canvas.width = size.width;
		if (this.canvas.height !== size.height) this.canvas.height = size.height;
		return size;
	}

	private maximumDrawingBufferDimension() {
		const viewportDimensions = this.gl.getParameter(this.gl.MAX_VIEWPORT_DIMS) as
			| Int32Array
			| readonly number[];
		const renderbufferSize = Number(this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE));
		const textureSize = Number(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE));
		return Math.max(
			1,
			Math.min(
				MAX_RENDER_DIMENSION,
				finite(viewportDimensions?.[0], MAX_RENDER_DIMENSION),
				finite(viewportDimensions?.[1], MAX_RENDER_DIMENSION),
				finite(renderbufferSize, MAX_RENDER_DIMENSION),
				finite(textureSize, MAX_RENDER_DIMENSION)
			)
		);
	}

	private selectPrecisionTier(state: FractalViewState, renderHeight: number): WebGLPrecisionTier {
		if (state.precisionMode === 'float') {
			this.cancelPendingPrecision();
			return 'gpu-float';
		}
		const quadratic = supportsQuadraticPrecision(state);
		if (state.precisionMode === 'perturbation') {
			this.cancelPendingPrecision();
			throw new WebGLPrecisionFallbackRequiredError(
				'Quadratic perturbation is not enabled in the published atlas: target ANGLE drivers compiled the experimental shader synchronously long enough to freeze the page. Exact decimal coordinates remain preserved, while the bounded CPU-double frame and precision meter expose the honest numeric ceiling.'
			);
		}
		if (state.precisionMode === 'double-single') {
			if (!quadratic) {
				throw new WebGLPrecisionFallbackRequiredError(
					'GPU double-single orbit arithmetic is currently limited to standard quadratic Mandelbrot and Julia. This family uses the bounded CPU double fallback.'
				);
			}
			this.cancelPendingPrecision();
			return 'double-single';
		}

		const floatCollapsed = floatCoordinateGridCollapses(
			state.center.re,
			state.center.im,
			state.spanY,
			state.rotation,
			renderHeight
		);
		if (!floatCollapsed) {
			this.cancelPendingPrecision();
			return 'gpu-float';
		}
		if (!quadratic) {
			throw new WebGLPrecisionFallbackRequiredError(
				'The GPU float coordinate grid has collapsed for this family. Its bounded CPU double fallback is the honest precision ceiling.'
			);
		}
		const doubleSingleCollapsed = doubleSingleCoordinateGridCollapses(
			state.center.re,
			state.center.im,
			state.spanY,
			state.rotation,
			renderHeight
		);
		if (doubleSingleCollapsed) {
			this.cancelPendingPrecision();
			throw new WebGLPrecisionFallbackRequiredError(
				'The tested double-single coordinate grid has collapsed. Perturbation is deliberately outside the published runtime scope, so the bounded CPU-double fallback is shown with an explicit precision warning.'
			);
		}
		return 'double-single';
	}

	private preparePrecisionTier(
		state: FractalViewState,
		width: number,
		height: number,
		iterations: number,
		requestedTier: WebGLPrecisionTier
	): {
		tier: WebGLPrecisionTier;
		reference: PrecisionReferenceResult | null;
		referencePending: boolean;
		settingsHash?: string;
	} {
		if (requestedTier !== 'perturbation') {
			return { tier: requestedTier, reference: null, referencePending: false };
		}
		const config = precisionReferenceConfig(state, width, height, iterations);
		if (
			this.precisionReference?.settingsHash === config.settingsHash &&
			this.precisionReference.result.maxIterations === iterations
		) {
			return {
				tier: 'perturbation',
				reference: this.precisionReference.result,
				referencePending: false,
				settingsHash: config.settingsHash
			};
		}
		this.requestPrecisionReference(config);
		return {
			tier: 'double-single',
			reference: null,
			referencePending: true,
			settingsHash: config.settingsHash
		};
	}

	private requestPrecisionReference(config: ReturnType<typeof precisionReferenceConfig>) {
		if (this.pendingPrecisionHash === config.settingsHash) return;
		try {
			if (!this.precisionClient) {
				this.precisionClient = createPrecisionReferenceWorkerClient();
				this.precisionUnsubscribe = this.precisionClient.subscribe(
					this.handlePrecisionWorkerMessage
				);
			}
			this.pendingPrecisionHash = config.settingsHash;
			this.precisionClient.calculate(config);
			this.callbacks.onStatus?.(
				`Calculating a ${config.precisionDigits}-digit perturbation reference orbit in a cancellable Worker.`
			);
		} catch (error) {
			this.pendingPrecisionHash = '';
			this.callbacks.onError?.(
				error instanceof Error
					? `${error.message} The genuine GPU double-single renderer remains active.`
					: 'The perturbation Worker is unavailable; double-single remains active.'
			);
		}
	}

	private handlePrecisionWorkerMessage = (message: PrecisionWorkerResponse) => {
		if (message.type === 'REFERENCE_STATUS') {
			this.callbacks.onStatus?.(
				`${message.phase === 'rebasing' ? 'Rebasing tiled reference orbits' : message.phase === 'diagnosing' ? 'Checking perturbation validity' : 'Calculating high-precision reference orbit'}: ${Math.round(message.progress * 100)}% at ${message.precisionDigits} decimal digits.`
			);
			return;
		}
		if (message.type === 'REFERENCE_RESULT') {
			this.pendingPrecisionHash = '';
			this.precisionReference = {
				settingsHash: message.settingsHash,
				result: message.result
			};
			this.uploadedPrecisionReference = null;
			this.callbacks.onStatus?.(
				`Perturbation reference calculated at ${message.result.precisionDigits} digits and uploaded as double-single coefficient pairs (about 14 useful digits)${message.result.rebased ? `; ${message.result.gridSize} × ${message.result.gridSize} tile rebasing was applied` : ''}. ${message.result.glitchesAfterRebase} of ${message.result.diagnosticSamples} diagnostic samples remained suspect. Pixels caught by the shader's bounded checks are marked; the sample is not proof of every pixel.`
			);
			this.callbacks.onPrecisionReady?.();
			return;
		}
		if (message.type === 'ERROR') {
			this.pendingPrecisionHash = '';
			this.callbacks.onError?.(
				`${message.message} The double-single renderer remains visible; no low-precision result replaced it.`
			);
		}
	};

	private cancelPendingPrecision() {
		if (!this.pendingPrecisionHash) return;
		this.precisionClient?.cancel();
		this.pendingPrecisionHash = '';
	}

	private precisionDiagnostics(
		state: FractalViewState,
		renderHeight: number,
		tier: WebGLPrecisionTier,
		reference: PrecisionReferenceResult | null,
		referencePending: boolean,
		settingsHash?: string
	): WebGLPrecisionDiagnostics {
		const pixelScale = Math.abs(state.spanY) / Math.max(1, renderHeight);
		const neighboursDistinct =
			tier === 'gpu-float'
				? !floatCoordinateGridCollapses(
						state.center.re,
						state.center.im,
						state.spanY,
						state.rotation,
						renderHeight
					)
				: tier === 'double-single'
					? !doubleSingleCoordinateGridCollapses(
							state.center.re,
							state.center.im,
							state.spanY,
							state.rotation,
							renderHeight
						)
					: pixelScale >= 1e-37;
		return {
			tier,
			label:
				tier === 'gpu-float'
					? 'GPU float'
					: tier === 'double-single'
						? 'Extended double-single'
						: 'Perturbation',
			estimatedDecimalDigits: tier === 'double-single' ? 14 : 7,
			pixelScale,
			magnification: 2.8 / Math.max(Number.MIN_VALUE, Math.abs(state.spanY)),
			neighboursDistinct,
			increasedRenderCost:
				tier === 'gpu-float'
					? 'baseline'
					: tier === 'double-single'
						? 'increased: roughly 6–10× float arithmetic per quadratic step'
						: 'increased: decimal Worker reference plus highp relative-delta arithmetic',
			referencePending,
			referencePrecisionDigits: reference?.precisionDigits,
			referenceUploadDigits: reference ? 14 : undefined,
			rebased: reference?.rebased ?? false,
			glitchesDetected: reference?.glitchesAfterRebase ?? 0,
			diagnosticSamples: reference?.diagnosticSamples ?? 0,
			settingsHash
		};
	}

	private uploadState(
		resources: ProgramResources,
		state: FractalViewState,
		width: number,
		height: number,
		iterations: number,
		variant: FractalShaderVariant,
		precisionReference: PrecisionReferenceResult | null
	) {
		const palette = paletteUniforms(state.paletteId, state.customPalette, state.interiorColor);
		const trap = state.orbitTrap ?? {
			kind: 'point' as const,
			position: { re: 0, im: 0 },
			radius: 0.5,
			spacing: 0.5,
			rotation: 0,
			mix: 1
		};
		const customMap = cloneCustomMapRecipe(state.customMap);
		const exponent =
			state.family === 'multibrot'
				? Math.max(2, Math.min(12, Math.round(state.exponent)))
				: state.family === 'custom-map'
					? customMap.power
					: 2;
		this.uniform2f(resources, 'u_resolution', width, height);
		this.uniform2f(
			resources,
			'u_center',
			finite(state.center.re, -0.5),
			finite(state.center.im, 0)
		);
		this.uniform1f(resources, 'u_spanY', Math.max(1e-37, Math.abs(finite(state.spanY, 2.8))));
		this.uniform1f(resources, 'u_rotation', finite(state.rotation, 0));
		this.uniform1i(resources, 'u_flipY', state.flipY ? 1 : 0);
		this.uniform1i(resources, 'u_planeMode', state.plane === 'parameter' ? 0 : 1);
		this.uniform1i(resources, 'u_familyId', FAMILY_IDS[state.family]);
		this.uniform1i(resources, 'u_maxIterations', iterations);
		this.uniform1f(resources, 'u_bailoutSquared', Math.max(4, finite(state.bailout, 2) ** 2));
		this.uniform1i(resources, 'u_exponent', exponent);
		this.uniform2f(resources, 'u_juliaC', finite(state.juliaC.re, 0), finite(state.juliaC.im, 0));
		this.uniform2f(
			resources,
			'u_phoenixP',
			finite(state.phoenixP.re, 0),
			finite(state.phoenixP.im, 0)
		);
		this.uniform2f(
			resources,
			'u_phoenixPrevious',
			finite(state.phoenixPrevious.re, 0),
			finite(state.phoenixPrevious.im, 0)
		);
		this.uniform1i(resources, 'u_customConjugate', customMap.conjugateBeforePower ? 1 : 0);
		this.uniform1i(resources, 'u_customAbsReal', customMap.absoluteReal ? 1 : 0);
		this.uniform1i(resources, 'u_customAbsImaginary', customMap.absoluteImaginary ? 1 : 0);
		this.uniform1i(resources, 'u_customAddC', customMap.addC ? 1 : 0);
		this.uniform1i(resources, 'u_customMemory', customMap.memoryEnabled ? 1 : 0);
		this.uniform2f(
			resources,
			'u_customMemoryCoefficient',
			finite(customMap.memoryCoefficient.re, -0.5),
			finite(customMap.memoryCoefficient.im, 0)
		);
		this.uniform1i(resources, 'u_customInitialZ', customMapInitialRuleId(customMap.initialZ));
		this.uniform1i(
			resources,
			'u_customDistanceValid',
			customMapSupportsDistanceEstimate(
				customMap,
				state.plane === 'parameter' ? 'parameter' : 'dynamical'
			)
				? 1
				: 0
		);
		this.uniform1i(resources, 'u_colorMode', COLORING_MODE_IDS[state.coloring]);
		this.uniform1f(resources, 'u_paletteOffset', finite(state.paletteOffset, 0));
		this.uniform1f(
			resources,
			'u_paletteCycles',
			Math.max(0.05, Math.min(64, Math.abs(finite(state.paletteCycles, 1))))
		);
		this.uniform1f(
			resources,
			'u_distanceLightAngle',
			finite(state.distanceLightAngle, -Math.PI / 4)
		);
		this.uniform1f(
			resources,
			'u_distanceLightStrength',
			Math.max(0, Math.min(1, finite(state.distanceLightStrength, 0.72)))
		);
		this.uniform1i(resources, 'u_paletteCount', palette.count);
		this.gl.uniform1fv(this.location(resources, 'u_palettePositions'), palette.positions);
		this.gl.uniform3fv(this.location(resources, 'u_paletteColors'), palette.colors);
		this.gl.uniform3f(
			this.location(resources, 'u_interiorColor'),
			palette.interior.r,
			palette.interior.g,
			palette.interior.b
		);
		this.uniform1i(resources, 'u_trapKind', TRAP_IDS[trap.kind]);
		this.uniform2f(
			resources,
			'u_trapPosition',
			finite(trap.position.re, 0),
			finite(trap.position.im, 0)
		);
		this.uniform1f(resources, 'u_trapRadius', Math.max(1e-8, Math.abs(finite(trap.radius, 0.5))));
		this.uniform1f(resources, 'u_trapSpacing', Math.max(1e-8, Math.abs(finite(trap.spacing, 0.5))));
		this.uniform1f(resources, 'u_trapRotation', finite(trap.rotation, 0));
		this.uniform1f(resources, 'u_trapMix', Math.max(0, Math.min(1, finite(trap.mix, 1))));
		this.uniform1i(resources, 'u_analyticInterior', state.analyticInteriorTests ? 1 : 0);
		this.uniform1f(
			resources,
			'u_convergenceTolerance',
			Math.max(1e-15, Math.min(0.1, Math.abs(finite(state.convergenceTolerance, 1e-6))))
		);
		this.uniform1f(
			resources,
			'u_newtonRelaxation',
			Math.max(0.05, Math.min(2, finite(state.newtonRelaxation, 1)))
		);
		this.uniform1f(resources, 'u_seed', finite(state.seed, 0));

		if (variant === 'quadratic-double-single') {
			this.uploadDoubleSingleState(resources, state);
		}
		if (variant === 'quadratic-perturbation' && precisionReference) {
			this.uploadPrecisionReference(resources, precisionReference);
		}
		if (state.family === 'newton') this.uploadPolynomial(resources, state);
	}

	private uploadDoubleSingleState(resources: ProgramResources, state: FractalViewState) {
		const centerRe = splitDecimalDoubleSingle(
			state.centerDecimal?.re,
			finite(state.center.re, -0.5)
		);
		const centerIm = splitDecimalDoubleSingle(state.centerDecimal?.im, finite(state.center.im, 0));
		const span = splitDoubleSingle(Math.max(1e-37, Math.abs(finite(state.spanY, 2.8))));
		const juliaRe = splitDecimalDoubleSingle(state.juliaCDecimal?.re, finite(state.juliaC.re, 0));
		const juliaIm = splitDecimalDoubleSingle(state.juliaCDecimal?.im, finite(state.juliaC.im, 0));
		this.uniform2f(resources, 'u_centerHi', centerRe.hi, centerIm.hi);
		this.uniform2f(resources, 'u_centerLo', centerRe.lo, centerIm.lo);
		this.uniform2f(resources, 'u_spanYPair', span.hi, span.lo);
		this.uniform2f(resources, 'u_juliaCHi', juliaRe.hi, juliaIm.hi);
		this.uniform2f(resources, 'u_juliaCLo', juliaRe.lo, juliaIm.lo);
	}

	private uploadPrecisionReference(
		resources: ProgramResources,
		reference: PrecisionReferenceResult
	) {
		const gl = this.gl;
		if (!this.precisionTexture) {
			this.precisionTexture = gl.createTexture();
			if (!this.precisionTexture) {
				throw new Error('WebGL2 could not allocate the perturbation reference texture.');
			}
		}
		if (!this.precisionMetadataTexture) {
			this.precisionMetadataTexture = gl.createTexture();
			if (!this.precisionMetadataTexture) {
				throw new Error('WebGL2 could not allocate the perturbation metadata texture.');
			}
		}
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.precisionTexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		if (this.uploadedPrecisionReference !== reference) {
			gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA32F,
				reference.orbitLength,
				reference.gridSize * reference.gridSize,
				0,
				gl.RGBA,
				gl.FLOAT,
				reference.orbit
			);
			const tileCount = reference.gridSize * reference.gridSize;
			const metadata = new Float32Array(tileCount * 8);
			for (let index = 0; index < tileCount; index += 1) {
				metadata.set(reference.referencePoints.subarray(index * 4, index * 4 + 4), index * 8);
				metadata[index * 8 + 4] = reference.referenceLengths[index] ?? reference.orbitLength;
			}
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, this.precisionMetadataTexture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 2, tileCount, 0, gl.RGBA, gl.FLOAT, metadata);
			this.uploadedPrecisionReference = reference;
		}
		this.uniform1i(resources, 'u_referenceOrbit', 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.precisionMetadataTexture);
		this.uniform1i(resources, 'u_referenceMetadata', 1);
		this.uniform1i(resources, 'u_referenceOrbitLength', reference.orbitLength);
		this.uniform1i(resources, 'u_referenceGridSize', reference.gridSize);
		gl.activeTexture(gl.TEXTURE0);
	}

	private uploadPolynomial(resources: ProgramResources, state: FractalViewState) {
		const coefficients = normalizePolynomialCoefficients(state.polynomial);
		const coefficientValues = new Float32Array(MAX_POLYNOMIAL_COEFFICIENTS * 2);
		for (let index = 0; index < coefficients.length; index += 1) {
			coefficientValues[index * 2] = coefficients[index].re;
			coefficientValues[index * 2 + 1] = coefficients[index].im;
		}
		const roots = findPolynomialRoots(state.polynomial).slice(0, MAX_NEWTON_ROOTS);
		const rootValues = new Float32Array(MAX_NEWTON_ROOTS * 2);
		for (let index = 0; index < roots.length; index += 1) {
			rootValues[index * 2] = roots[index].re;
			rootValues[index * 2 + 1] = roots[index].im;
		}
		this.uniform1i(resources, 'u_polynomialCount', coefficients.length);
		this.gl.uniform2fv(this.location(resources, 'u_polynomial'), coefficientValues);
		this.uniform1i(resources, 'u_rootCount', roots.length);
		this.gl.uniform2fv(this.location(resources, 'u_roots'), rootValues);
	}

	private handleContextLost = (event: Event) => {
		event.preventDefault();
		if (this.destroyed) return;
		this.contextLost = true;
		this.programs.clear();
		this.vao = null;
		this.precisionTexture = null;
		this.precisionMetadataTexture = null;
		this.uploadedPrecisionReference = null;
		this.callbacks.onStatus?.('WebGL2 context lost; the selected atlas state is preserved.');
		this.callbacks.onContextLost?.();
	};

	private handleContextRestored = () => {
		if (this.destroyed) return;
		try {
			const context = this.canvas.getContext('webgl2');
			if (!context) throw new Error('WebGL2 could not be restored.');
			this.gl = context;
			this.contextLost = false;
			this.programs.clear();
			this.precisionTexture = null;
			this.precisionMetadataTexture = null;
			this.uploadedPrecisionReference = null;
			this.createGeometry();
			if (this.lastState) this.render(this.lastState, this.lastOptions);
			this.callbacks.onStatus?.('WebGL2 restored; the selected fractal frame was rebuilt.');
			this.callbacks.onContextRestored?.();
		} catch (error) {
			this.contextLost = true;
			const message =
				error instanceof Error ? error.message : 'The WebGL2 context could not be restored.';
			this.callbacks.onError?.(message);
		}
	};
}

export function webglRenderQualityOptions(
	quality: RenderQuality,
	preview: boolean,
	pixelRatio: number
): RenderSizeOptions {
	return { quality, preview, devicePixelRatio: pixelRatio };
}
