import type { FractalViewState } from '../types';

export const FRACTAL_WORKER_PROTOCOL_VERSION = 1 as const;

/**
 * Hard allocation and work limits enforced at the Worker boundary. The density
 * accumulator uses at most three Uint32 channels plus one transferable RGBA frame.
 */
export const FRACTAL_WORKER_LIMITS = {
	maxDensityDimension: 2048,
	maxDensityPixels: 1_048_576,
	maxDensitySamples: 100_000_000,
	maxDensitySamplesPerBatch: 50_000,
	maxIterations: 10_000,
	maxFernPoints: 10_000_000,
	maxFernPointsPerBatch: 50_000,
	maxFernTransforms: 16,
	maxFernBurnIn: 100_000,
	maxRasterDimension: 16_384,
	maxRasterPixels: 196_608,
	maxRasterTileDimension: 128,
	maxRasterTilePixels: 8_192
} as const;

export type ProgressiveTaskKind = 'density' | 'barnsley-fern' | 'raster';
export type DensityMode = 'buddhabrot' | 'nebulabrot';
export type WorkerPhase = 'paused' | 'running' | 'complete';
export type RandomSeed = string | number;

export interface ComplexBounds {
	minRe: number;
	maxRe: number;
	minIm: number;
	maxIm: number;
}

export type IterationWindow = readonly [minimum: number, maximum: number];
export type NebulabrotWindows = readonly [IterationWindow, IterationWindow, IterationWindow];

export interface DensityTaskConfig {
	mode: DensityMode;
	width: number;
	height: number;
	seed: RandomSeed;
	targetSamples: number;
	samplesPerBatch: number;
	maxIterations: number;
	bailout: number;
	sampleBounds: ComplexBounds;
	orbitBounds: ComplexBounds;
	/**
	 * Escaping orbits shorter than this are counted as candidates but are not
	 * accumulated. Defaults belong in the caller; the protocol remains explicit.
	 */
	minEscapeIterations: number;
	exposure: number;
	gamma: number;
	/** Quantile of non-zero density values used as the display white point. */
	percentileClip: number;
	/** Required for Nebulabrot and ignored for monochrome Buddhabrot. */
	iterationWindows?: NebulabrotWindows;
	/** Publish an RGBA partial frame after this many computation batches. */
	publishEveryBatches?: number;
}

export interface FernTransform {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
	probability: number;
	label?: string;
}

export interface BarnsleyFernTaskConfig {
	seed: RandomSeed;
	targetPoints: number;
	pointsPerBatch: number;
	burnIn: number;
	/** Omit to use the canonical four Barnsley affine transformations. */
	transforms?: readonly FernTransform[];
}

export interface RasterTaskConfig {
	state: FractalViewState;
	width: number;
	height: number;
	preview: boolean;
	maxPixels: number;
	maxIterations: number;
	tileWidth: number;
	tileHeight: number;
}

interface WorkerEnvelope {
	protocolVersion: typeof FRACTAL_WORKER_PROTOCOL_VERSION;
	taskId: number;
	generation: number;
}

export type FractalWorkerRequest =
	| (WorkerEnvelope & {
			type: 'START_DENSITY';
			config: DensityTaskConfig;
			autoStart?: boolean;
	  })
	| (WorkerEnvelope & {
			type: 'START_FERN';
			config: BarnsleyFernTaskConfig;
			autoStart?: boolean;
	  })
	| (WorkerEnvelope & {
			type: 'START_RASTER';
			config: RasterTaskConfig;
			autoStart?: boolean;
	  })
	| (WorkerEnvelope & { type: 'RUN' })
	| (WorkerEnvelope & { type: 'PAUSE' })
	| (WorkerEnvelope & { type: 'STEP'; batchSize?: number })
	| (WorkerEnvelope & { type: 'CANCEL' })
	| (WorkerEnvelope & { type: 'DISPOSE' });

type WithoutEnvelope<Message> = Message extends unknown
	? Omit<Message, keyof WorkerEnvelope>
	: never;

export type FractalWorkerRequestBody = WithoutEnvelope<FractalWorkerRequest>;

export interface DensityFrame {
	mode: DensityMode;
	width: number;
	height: number;
	sequence: number;
	pixels: Uint8ClampedArray;
	samplesProcessed: number;
	targetSamples: number;
	escapingOrbits: number;
	accumulatedOrbits: number;
	plottedOrbitPoints: number;
	progress: number;
	clipCounts: readonly [number, number, number];
	histogramBytes: number;
	running: boolean;
	complete: boolean;
}

export interface FernFrame {
	sequence: number;
	/** Interleaved x/y pairs for this partial batch only. */
	points: Float32Array;
	/** One transform index per emitted point. */
	transformIndices: Uint8Array;
	batchStart: number;
	totalPoints: number;
	targetPoints: number;
	progress: number;
	activeTransform: number | null;
	running: boolean;
	complete: boolean;
}

export interface RasterTileFrame {
	x: number;
	y: number;
	width: number;
	height: number;
	renderWidth: number;
	renderHeight: number;
	pixels: Uint8ClampedArray;
	sequence: number;
	iterations: number;
	requestedIterations: number;
	completedWorkUnits: number;
	totalWorkUnits: number;
	progress: number;
	phase: 'colour' | 'complete';
	complete: boolean;
}

export interface WorkerProgress {
	completed: number;
	total: number;
	progress: number;
}

export type FractalWorkerResponse =
	| (WorkerEnvelope & {
			type: 'READY';
			task: ProgressiveTaskKind;
			phase: WorkerPhase;
			progress: WorkerProgress;
	  })
	| (WorkerEnvelope & { type: 'DENSITY_FRAME'; frame: DensityFrame })
	| (WorkerEnvelope & { type: 'FERN_FRAME'; frame: FernFrame })
	| (WorkerEnvelope & { type: 'RASTER_TILE'; frame: RasterTileFrame })
	| (WorkerEnvelope & {
			type: 'STATUS';
			task: ProgressiveTaskKind;
			phase: WorkerPhase;
			progress: WorkerProgress;
	  })
	| (WorkerEnvelope & {
			type: 'COMPLETE';
			task: ProgressiveTaskKind;
			progress: WorkerProgress;
	  })
	| (WorkerEnvelope & { type: 'CANCELLED' })
	| (WorkerEnvelope & {
			type: 'STALE';
			activeGeneration: number;
			message: string;
	  })
	| (WorkerEnvelope & { type: 'DISPOSED' })
	| (WorkerEnvelope & { type: 'ERROR'; message: string; stack?: string });

export type FractalWorkerResponseBody = WithoutEnvelope<FractalWorkerResponse>;

export function isFractalWorkerRequest(value: unknown): value is FractalWorkerRequest {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'START_DENSITY':
			return (
				isDensityTaskConfig(value.config) &&
				(value.autoStart === undefined || typeof value.autoStart === 'boolean')
			);
		case 'START_FERN':
			return (
				isBarnsleyFernTaskConfig(value.config) &&
				(value.autoStart === undefined || typeof value.autoStart === 'boolean')
			);
		case 'START_RASTER':
			return (
				isRasterTaskConfig(value.config) &&
				(value.autoStart === undefined || typeof value.autoStart === 'boolean')
			);
		case 'RUN':
		case 'PAUSE':
		case 'CANCEL':
		case 'DISPOSE':
			return true;
		case 'STEP':
			return (
				value.batchSize === undefined ||
				isIntegerInRange(value.batchSize, 1, FRACTAL_WORKER_LIMITS.maxFernPointsPerBatch)
			);
		default:
			return false;
	}
}

export function isFractalWorkerResponse(value: unknown): value is FractalWorkerResponse {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'READY':
		case 'STATUS':
			return (
				isTaskKind(value.task) && isWorkerPhase(value.phase) && isWorkerProgress(value.progress)
			);
		case 'DENSITY_FRAME':
			return isDensityFrame(value.frame);
		case 'FERN_FRAME':
			return isFernFrame(value.frame);
		case 'RASTER_TILE':
			return isRasterTileFrame(value.frame);
		case 'COMPLETE':
			return isTaskKind(value.task) && isWorkerProgress(value.progress);
		case 'CANCELLED':
		case 'DISPOSED':
			return true;
		case 'STALE':
			return isNonNegativeInteger(value.activeGeneration) && typeof value.message === 'string';
		case 'ERROR':
			return (
				typeof value.message === 'string' &&
				(value.stack === undefined || typeof value.stack === 'string')
			);
		default:
			return false;
	}
}

export function responseTransferables(response: FractalWorkerResponse): ArrayBuffer[] {
	if (response.type === 'DENSITY_FRAME') {
		return arrayBufferOf(response.frame.pixels);
	}
	if (response.type === 'FERN_FRAME') {
		return [
			...arrayBufferOf(response.frame.points),
			...arrayBufferOf(response.frame.transformIndices)
		];
	}
	if (response.type === 'RASTER_TILE') {
		return arrayBufferOf(response.frame.pixels);
	}
	return [];
}

export function isDensityTaskConfig(value: unknown): value is DensityTaskConfig {
	if (!value || typeof value !== 'object') return false;
	const config = value as Partial<DensityTaskConfig>;
	const pixelCount =
		typeof config.width === 'number' && typeof config.height === 'number'
			? config.width * config.height
			: Number.POSITIVE_INFINITY;
	return (
		(config.mode === 'buddhabrot' || config.mode === 'nebulabrot') &&
		isIntegerInRange(config.width, 1, FRACTAL_WORKER_LIMITS.maxDensityDimension) &&
		isIntegerInRange(config.height, 1, FRACTAL_WORKER_LIMITS.maxDensityDimension) &&
		Number.isSafeInteger(pixelCount) &&
		pixelCount <= FRACTAL_WORKER_LIMITS.maxDensityPixels &&
		isRandomSeed(config.seed) &&
		isIntegerInRange(config.targetSamples, 1, FRACTAL_WORKER_LIMITS.maxDensitySamples) &&
		isIntegerInRange(config.samplesPerBatch, 1, FRACTAL_WORKER_LIMITS.maxDensitySamplesPerBatch) &&
		isIntegerInRange(config.maxIterations, 2, FRACTAL_WORKER_LIMITS.maxIterations) &&
		isFiniteNumber(config.bailout) &&
		config.bailout >= 2 &&
		isComplexBounds(config.sampleBounds) &&
		isComplexBounds(config.orbitBounds) &&
		isIntegerInRange(config.minEscapeIterations, 1, config.maxIterations) &&
		isFiniteNumber(config.exposure) &&
		config.exposure > 0 &&
		config.exposure <= 1_000 &&
		isFiniteNumber(config.gamma) &&
		config.gamma >= 0.05 &&
		config.gamma <= 10 &&
		isFiniteNumber(config.percentileClip) &&
		config.percentileClip >= 0.5 &&
		config.percentileClip <= 1 &&
		(config.publishEveryBatches === undefined ||
			isIntegerInRange(config.publishEveryBatches, 1, 1_000)) &&
		(config.mode !== 'nebulabrot' || isNebulabrotWindows(config.iterationWindows))
	);
}

export function isBarnsleyFernTaskConfig(value: unknown): value is BarnsleyFernTaskConfig {
	if (!value || typeof value !== 'object') return false;
	const config = value as Partial<BarnsleyFernTaskConfig>;
	return (
		isRandomSeed(config.seed) &&
		isIntegerInRange(config.targetPoints, 1, FRACTAL_WORKER_LIMITS.maxFernPoints) &&
		isIntegerInRange(config.pointsPerBatch, 1, FRACTAL_WORKER_LIMITS.maxFernPointsPerBatch) &&
		isIntegerInRange(config.burnIn, 0, FRACTAL_WORKER_LIMITS.maxFernBurnIn) &&
		(config.transforms === undefined || isFernTransforms(config.transforms))
	);
}

export function isRasterTaskConfig(value: unknown): value is RasterTaskConfig {
	if (!value || typeof value !== 'object') return false;
	const config = value as Partial<RasterTaskConfig>;
	const pixelCount =
		typeof config.width === 'number' && typeof config.height === 'number'
			? config.width * config.height
			: Number.POSITIVE_INFINITY;
	const tilePixels =
		typeof config.tileWidth === 'number' && typeof config.tileHeight === 'number'
			? config.tileWidth * config.tileHeight
			: Number.POSITIVE_INFINITY;
	return (
		isIntegerInRange(config.width, 1, FRACTAL_WORKER_LIMITS.maxRasterDimension) &&
		isIntegerInRange(config.height, 1, FRACTAL_WORKER_LIMITS.maxRasterDimension) &&
		Number.isSafeInteger(pixelCount) &&
		isIntegerInRange(config.maxPixels, 1, FRACTAL_WORKER_LIMITS.maxRasterPixels) &&
		isIntegerInRange(config.maxIterations, 1, Number.MAX_SAFE_INTEGER) &&
		isIntegerInRange(config.tileWidth, 1, FRACTAL_WORKER_LIMITS.maxRasterTileDimension) &&
		isIntegerInRange(config.tileHeight, 1, FRACTAL_WORKER_LIMITS.maxRasterTileDimension) &&
		Number.isSafeInteger(tilePixels) &&
		tilePixels <= FRACTAL_WORKER_LIMITS.maxRasterTilePixels &&
		typeof config.preview === 'boolean' &&
		isRasterViewState(config.state)
	);
}

function hasEnvelope(value: unknown): value is WorkerEnvelope & Record<string, unknown> {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.protocolVersion === FRACTAL_WORKER_PROTOCOL_VERSION &&
		isNonNegativeInteger(candidate.taskId) &&
		isNonNegativeInteger(candidate.generation) &&
		typeof candidate.type === 'string'
	);
}

function isDensityFrame(value: unknown): value is DensityFrame {
	if (!value || typeof value !== 'object') return false;
	const frame = value as Partial<DensityFrame>;
	const expectedPixels =
		typeof frame.width === 'number' && typeof frame.height === 'number'
			? frame.width * frame.height * 4
			: -1;
	return (
		(frame.mode === 'buddhabrot' || frame.mode === 'nebulabrot') &&
		isPositiveInteger(frame.width) &&
		isPositiveInteger(frame.height) &&
		isNonNegativeInteger(frame.sequence) &&
		frame.pixels instanceof Uint8ClampedArray &&
		frame.pixels.length === expectedPixels &&
		isNonNegativeInteger(frame.samplesProcessed) &&
		isPositiveInteger(frame.targetSamples) &&
		frame.samplesProcessed <= frame.targetSamples &&
		isNonNegativeInteger(frame.escapingOrbits) &&
		isNonNegativeInteger(frame.accumulatedOrbits) &&
		frame.accumulatedOrbits <= frame.escapingOrbits &&
		isNonNegativeInteger(frame.plottedOrbitPoints) &&
		isProgress(frame.progress) &&
		isClipCounts(frame.clipCounts) &&
		isNonNegativeInteger(frame.histogramBytes) &&
		typeof frame.running === 'boolean' &&
		typeof frame.complete === 'boolean'
	);
}

function isFernFrame(value: unknown): value is FernFrame {
	if (!value || typeof value !== 'object') return false;
	const frame = value as Partial<FernFrame>;
	return (
		isNonNegativeInteger(frame.sequence) &&
		frame.points instanceof Float32Array &&
		frame.points.length % 2 === 0 &&
		frame.transformIndices instanceof Uint8Array &&
		frame.transformIndices.length === frame.points.length / 2 &&
		frame.transformIndices.length <= FRACTAL_WORKER_LIMITS.maxFernPointsPerBatch &&
		isNonNegativeInteger(frame.batchStart) &&
		isNonNegativeInteger(frame.totalPoints) &&
		isPositiveInteger(frame.targetPoints) &&
		frame.totalPoints <= frame.targetPoints &&
		frame.batchStart + frame.transformIndices.length === frame.totalPoints &&
		isProgress(frame.progress) &&
		(frame.activeTransform === null || isNonNegativeInteger(frame.activeTransform)) &&
		typeof frame.running === 'boolean' &&
		typeof frame.complete === 'boolean'
	);
}

function isRasterTileFrame(value: unknown): value is RasterTileFrame {
	if (!value || typeof value !== 'object') return false;
	const frame = value as Partial<RasterTileFrame>;
	const expectedPixels =
		typeof frame.width === 'number' && typeof frame.height === 'number'
			? frame.width * frame.height * 4
			: -1;
	const renderPixels =
		typeof frame.renderWidth === 'number' && typeof frame.renderHeight === 'number'
			? frame.renderWidth * frame.renderHeight
			: Number.POSITIVE_INFINITY;
	return (
		isNonNegativeInteger(frame.x) &&
		isNonNegativeInteger(frame.y) &&
		isIntegerInRange(frame.width, 1, FRACTAL_WORKER_LIMITS.maxRasterTileDimension) &&
		isIntegerInRange(frame.height, 1, FRACTAL_WORKER_LIMITS.maxRasterTileDimension) &&
		isIntegerInRange(frame.renderWidth, 1, FRACTAL_WORKER_LIMITS.maxRasterDimension) &&
		isIntegerInRange(frame.renderHeight, 1, FRACTAL_WORKER_LIMITS.maxRasterDimension) &&
		Number.isSafeInteger(renderPixels) &&
		renderPixels <= FRACTAL_WORKER_LIMITS.maxRasterPixels &&
		Number(frame.width) * Number(frame.height) <= FRACTAL_WORKER_LIMITS.maxRasterTilePixels &&
		Number(frame.x) + Number(frame.width) <= Number(frame.renderWidth) &&
		Number(frame.y) + Number(frame.height) <= Number(frame.renderHeight) &&
		frame.pixels instanceof Uint8ClampedArray &&
		frame.pixels.length === expectedPixels &&
		isPositiveInteger(frame.sequence) &&
		isPositiveInteger(frame.iterations) &&
		isPositiveInteger(frame.requestedIterations) &&
		isPositiveInteger(frame.completedWorkUnits) &&
		isPositiveInteger(frame.totalWorkUnits) &&
		Number(frame.completedWorkUnits) <= Number(frame.totalWorkUnits) &&
		isProgress(frame.progress) &&
		(frame.phase === 'colour' || frame.phase === 'complete') &&
		typeof frame.complete === 'boolean' &&
		(frame.phase === 'complete') === frame.complete &&
		(!frame.complete || (frame.completedWorkUnits === frame.totalWorkUnits && frame.progress === 1))
	);
}

function isWorkerProgress(value: unknown): value is WorkerProgress {
	if (!value || typeof value !== 'object') return false;
	const progress = value as Partial<WorkerProgress>;
	return (
		isNonNegativeInteger(progress.completed) &&
		isPositiveInteger(progress.total) &&
		progress.completed <= progress.total &&
		isProgress(progress.progress)
	);
}

function isTaskKind(value: unknown): value is ProgressiveTaskKind {
	return value === 'density' || value === 'barnsley-fern' || value === 'raster';
}

function isRasterViewState(value: unknown): value is FractalViewState {
	if (!value || typeof value !== 'object') return false;
	const state = value as Partial<FractalViewState>;
	return (
		(state.family === 'mandelbrot' ||
			state.family === 'julia' ||
			state.family === 'multibrot' ||
			state.family === 'burning-ship' ||
			state.family === 'tricorn' ||
			state.family === 'phoenix' ||
			state.family === 'custom-map' ||
			state.family === 'newton') &&
		isComplexValue(state.center) &&
		isFiniteNumber(state.spanY) &&
		state.spanY > 0 &&
		isFiniteNumber(state.rotation) &&
		isPositiveInteger(state.maxIterations) &&
		isFiniteNumber(state.bailout) &&
		isFiniteNumber(state.exponent) &&
		isComplexValue(state.juliaC) &&
		isComplexValue(state.phoenixP) &&
		isComplexValue(state.phoenixPrevious) &&
		isFiniteNumber(state.newtonRelaxation) &&
		typeof state.coloring === 'string' &&
		typeof state.paletteId === 'string' &&
		isFiniteNumber(state.paletteOffset) &&
		isFiniteNumber(state.paletteCycles) &&
		typeof state.interiorColor === 'string' &&
		typeof state.flipY === 'boolean' &&
		typeof state.analyticInteriorTests === 'boolean' &&
		isFiniteNumber(state.convergenceTolerance)
	);
}

function isComplexValue(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	const complex = value as { re?: unknown; im?: unknown };
	return isFiniteNumber(complex.re) && isFiniteNumber(complex.im);
}

function isWorkerPhase(value: unknown): value is WorkerPhase {
	return value === 'paused' || value === 'running' || value === 'complete';
}

function isComplexBounds(value: unknown): value is ComplexBounds {
	if (!value || typeof value !== 'object') return false;
	const bounds = value as Partial<ComplexBounds>;
	return (
		isFiniteNumber(bounds.minRe) &&
		isFiniteNumber(bounds.maxRe) &&
		bounds.minRe < bounds.maxRe &&
		isFiniteNumber(bounds.minIm) &&
		isFiniteNumber(bounds.maxIm) &&
		bounds.minIm < bounds.maxIm
	);
}

function isNebulabrotWindows(value: unknown): value is NebulabrotWindows {
	return (
		Array.isArray(value) &&
		value.length === 3 &&
		value.every(
			(window) =>
				Array.isArray(window) &&
				window.length === 2 &&
				isPositiveInteger(window[0]) &&
				isPositiveInteger(window[1]) &&
				window[0] <= window[1]
		)
	);
}

function isFernTransforms(value: unknown): value is readonly FernTransform[] {
	if (
		!Array.isArray(value) ||
		value.length < 1 ||
		value.length > FRACTAL_WORKER_LIMITS.maxFernTransforms
	) {
		return false;
	}
	let probabilityTotal = 0;
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') return false;
		const transform = entry as Partial<FernTransform>;
		if (
			!isFiniteNumber(transform.a) ||
			!isFiniteNumber(transform.b) ||
			!isFiniteNumber(transform.c) ||
			!isFiniteNumber(transform.d) ||
			!isFiniteNumber(transform.e) ||
			!isFiniteNumber(transform.f) ||
			!isFiniteNumber(transform.probability) ||
			transform.probability < 0 ||
			(transform.label !== undefined && typeof transform.label !== 'string')
		) {
			return false;
		}
		probabilityTotal += transform.probability;
	}
	return probabilityTotal > 0 && Number.isFinite(probabilityTotal);
}

function isRandomSeed(value: unknown): value is RandomSeed {
	return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

function isClipCounts(value: unknown): value is readonly [number, number, number] {
	return (
		Array.isArray(value) &&
		value.length === 3 &&
		value.every((entry) => isNonNegativeInteger(entry))
	);
}

function isProgress(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
	return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function arrayBufferOf(view: ArrayBufferView): ArrayBuffer[] {
	return view.buffer instanceof ArrayBuffer ? [view.buffer] : [];
}
