import type { FractalViewState, PaletteStop } from '../types';
import {
	findPolynomialRoots,
	pixelToComplex,
	sampleFractalPoint,
	type FractalSample
} from './math';
import {
	paletteStops,
	parseCssColor,
	sampleCategoricalPalette,
	samplePalette,
	type RgbColor
} from './palette';
import {
	boundedCpuIterations,
	computeCpuRenderSize,
	CPU_MAX_PIXELS,
	type RenderSizeOptions
} from './quality';

export interface CpuRenderOptions {
	preview?: boolean;
	maxPixels?: number;
	maxIterations?: number;
	signal?: AbortSignal;
	tileWidth?: number;
	tileHeight?: number;
}

export interface CpuFractalFrame {
	width: number;
	height: number;
	data: Uint8ClampedArray;
	iterations: number;
	requestedIterations: number;
	pixelCount: number;
}

export type CpuRasterPhase = 'analyse' | 'colour' | 'complete';

export interface CpuRasterTile {
	x: number;
	y: number;
	width: number;
	height: number;
	pixels: Uint8ClampedArray;
	sequence: number;
	completedWorkUnits: number;
	totalWorkUnits: number;
	progress: number;
	phase: CpuRasterPhase;
	complete: boolean;
}

export interface Canvas2DRendererCallbacks {
	onStatus?: (message: string) => void;
	onError?: (message: string) => void;
}

export interface Canvas2DRenderResult {
	backend: 'canvas-2d';
	width: number;
	height: number;
	iterations: number;
	requestedIterations: number;
	preview: boolean;
}

function clamp01(value: number) {
	return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function mix(color: RgbColor, brightness: number): RgbColor {
	const amount = clamp01(brightness);
	return { r: color.r * amount, g: color.g * amount, b: color.b * amount };
}

function sampleColor(
	state: FractalViewState,
	sample: FractalSample,
	stops: readonly PaletteStop[],
	rootsCount: number,
	iterationLimit: number,
	renderHeight: number,
	point: { re: number; im: number }
): RgbColor {
	const escaped = sample.status === 'escaped';
	const converged = sample.status === 'converged';
	const interior = parseCssColor(state.interiorColor, { r: 0.012, g: 0.016, b: 0.032 });
	const colorsBoundedOrbit =
		state.coloring === 'orbit-trap' &&
		state.family !== 'newton' &&
		Number.isFinite(sample.trapDistance);
	if (!escaped && !converged && !colorsBoundedOrbit) return interior;

	const maximumIterations = Math.max(1, iterationLimit);
	let value = sample.smoothIteration / Math.max(12, maximumIterations * 0.12);
	let brightness = 1;
	let categoricalColor: RgbColor | null = null;
	switch (state.coloring) {
		case 'binary':
			value = 0.98;
			break;
		case 'bands':
			value = (Math.floor(sample.iterations / 3) % 24) / 24;
			break;
		case 'distance': {
			const pixelWorldSize = Math.max(1e-15, state.spanY / Math.max(1, renderHeight));
			const distanceInPixels = sample.distanceEstimate / pixelWorldSize;
			brightness = 0.22 + 0.78 * (1 - Math.exp(-Math.max(0, distanceInPixels) * 0.12));
			brightness *= distanceLightAmount(state, point);
			break;
		}
		case 'orbit-trap': {
			const normalizedTrap = sample.trapDistance / Math.max(1e-15, state.spanY);
			const trapTone = Math.exp(-normalizedTrap * 34);
			brightness = 0.25 + 0.75 * trapTone * clamp01(state.orbitTrap?.mix ?? 1);
			value = -Math.log(Math.max(1e-12, normalizedTrap)) * 0.073;
			break;
		}
		case 'root-basin':
			if (converged && sample.rootIndex >= 0) {
				value = sample.rootIndex / Math.max(1, rootsCount);
				categoricalColor = sampleCategoricalPalette(stops, sample.rootIndex);
				brightness = 0.32 + 0.68 * (1 - Math.min(1, sample.iterations / maximumIterations));
			}
			break;
		case 'histogram':
		case 'density':
		case 'smooth':
			break;
	}
	return mix(
		categoricalColor ?? samplePalette(stops, value, state.paletteOffset, state.paletteCycles),
		brightness
	);
}

function distanceLightAmount(state: FractalViewState, point: { re: number; im: number }) {
	const strength = clamp01(state.distanceLightStrength ?? 0.72);
	const angle = Number.isFinite(state.distanceLightAngle)
		? (state.distanceLightAngle as number)
		: -Math.PI / 4;
	const dx = point.re - state.center.re;
	const dy = point.im - state.center.im;
	const length = Math.hypot(dx, dy);
	const nx = length > 1e-15 ? dx / length : 0;
	const ny = length > 1e-15 ? dy / length : 1;
	const light = Math.max(0, Math.min(1, 0.5 + 0.5 * (nx * Math.cos(angle) + ny * Math.sin(angle))));
	const relief = 0.28 + 0.72 * light;
	return 1 - strength + strength * relief;
}

function writeColor(target: Uint8ClampedArray, offset: number, color: RgbColor) {
	target[offset] = Math.round(clamp01(color.r) * 255);
	target[offset + 1] = Math.round(clamp01(color.g) * 255);
	target[offset + 2] = Math.round(clamp01(color.b) * 255);
	target[offset + 3] = 255;
}

export function supportsCpuFamily(state: FractalViewState) {
	return (
		state.family === 'mandelbrot' ||
		state.family === 'julia' ||
		state.family === 'multibrot' ||
		state.family === 'burning-ship' ||
		state.family === 'tricorn' ||
		state.family === 'phoenix' ||
		state.family === 'custom-map' ||
		state.family === 'newton'
	);
}

function boundedTileDimension(value: number | undefined, fallback: number) {
	return Math.max(1, Math.min(128, Math.floor(Number.isFinite(value) ? Number(value) : fallback)));
}

/**
 * Allocation-bounded, incremental CPU renderer shared by the synchronous last-resort
 * Canvas path and the module Worker. Each call advances exactly one small tile so a
 * Worker can service cancellation and replacement messages between calls.
 */
export class CpuTiledFractalAccumulator {
	readonly width: number;
	readonly height: number;
	readonly pixelCount: number;
	readonly iterations: number;
	readonly requestedIterations: number;
	readonly tileWidth: number;
	readonly tileHeight: number;
	readonly tilesAcross: number;
	readonly tilesDown: number;
	readonly tilesPerPass: number;
	readonly totalWorkUnits: number;

	private readonly stops: readonly PaletteStop[];
	private readonly roots: ReturnType<typeof findPolynomialRoots>;
	private readonly histogramMode: boolean;
	private readonly escaped: Uint8Array | null;
	private readonly bins: Uint16Array | null;
	private readonly histogram: Uint32Array | null;
	private cumulative: Uint32Array | null = null;
	private totalEscaped = 0;
	private workIndex = 0;
	private sequence = 0;

	constructor(
		private readonly state: FractalViewState,
		requestedWidth: number,
		requestedHeight: number,
		options: CpuRenderOptions = {}
	) {
		if (!supportsCpuFamily(state)) {
			throw new Error(`The Canvas 2D fallback cannot render the ${state.family} family.`);
		}
		const size = computeCpuRenderSize(requestedWidth, requestedHeight, {
			preview: options.preview,
			maxPixels: options.maxPixels ?? CPU_MAX_PIXELS
		});
		const selectedIterations = options.maxIterations ?? state.maxIterations;
		this.requestedIterations = Number.isFinite(selectedIterations)
			? Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(selectedIterations)))
			: 96;
		this.width = size.width;
		this.height = size.height;
		this.pixelCount = size.pixelCount;
		this.iterations = boundedCpuIterations(size.pixelCount, this.requestedIterations);
		this.tileWidth = boundedTileDimension(options.tileWidth, 64);
		this.tileHeight = boundedTileDimension(options.tileHeight, 32);
		this.tilesAcross = Math.ceil(this.width / this.tileWidth);
		this.tilesDown = Math.ceil(this.height / this.tileHeight);
		this.tilesPerPass = this.tilesAcross * this.tilesDown;
		this.histogramMode = state.coloring === 'histogram' && state.family !== 'newton';
		this.totalWorkUnits = this.tilesPerPass * (this.histogramMode ? 2 : 1);
		this.stops = paletteStops(state.paletteId, state.customPalette);
		this.roots = state.family === 'newton' ? findPolynomialRoots(state.polynomial) : [];
		this.escaped = this.histogramMode ? new Uint8Array(size.pixelCount) : null;
		this.bins = this.histogramMode ? new Uint16Array(size.pixelCount) : null;
		this.histogram = this.histogramMode ? new Uint32Array(this.iterations + 1) : null;
	}

	get completedWorkUnits() {
		return this.workIndex;
	}

	get progress() {
		return this.totalWorkUnits === 0 ? 1 : this.workIndex / this.totalWorkUnits;
	}

	get phase(): CpuRasterPhase {
		if (this.complete) return 'complete';
		if (this.histogramMode && this.workIndex < this.tilesPerPass) return 'analyse';
		return 'colour';
	}

	get complete() {
		return this.workIndex >= this.totalWorkUnits;
	}

	advanceTile(signal?: AbortSignal): CpuRasterTile | null {
		if (this.complete) return null;
		this.throwIfCancelled(signal);
		const passIndex = this.workIndex % this.tilesPerPass;
		const tile = this.tileBounds(passIndex);

		if (this.histogramMode && this.workIndex < this.tilesPerPass) {
			this.analyseHistogramTile(tile, signal);
			this.workIndex += 1;
			if (this.workIndex === this.tilesPerPass) this.finishHistogramAnalysis();
			return null;
		}

		const pixels = this.histogramMode
			? this.colourHistogramTile(tile, signal)
			: this.colourSampledTile(tile, signal);
		this.workIndex += 1;
		this.sequence += 1;
		return {
			...tile,
			pixels,
			sequence: this.sequence,
			completedWorkUnits: this.workIndex,
			totalWorkUnits: this.totalWorkUnits,
			progress: this.progress,
			phase: this.complete ? 'complete' : 'colour',
			complete: this.complete
		};
	}

	private tileBounds(index: number) {
		const x = (index % this.tilesAcross) * this.tileWidth;
		const y = Math.floor(index / this.tilesAcross) * this.tileHeight;
		return {
			x,
			y,
			width: Math.min(this.tileWidth, this.width - x),
			height: Math.min(this.tileHeight, this.height - y)
		};
	}

	private analyseHistogramTile(
		tile: { x: number; y: number; width: number; height: number },
		signal?: AbortSignal
	) {
		const escaped = this.escaped as Uint8Array;
		const bins = this.bins as Uint16Array;
		const histogram = this.histogram as Uint32Array;
		for (let localY = 0; localY < tile.height; localY += 1) {
			this.throwIfCancelled(signal);
			const y = tile.y + localY;
			for (let localX = 0; localX < tile.width; localX += 1) {
				const x = tile.x + localX;
				const index = y * this.width + x;
				const point = pixelToComplex(this.state, x, y, this.width, this.height);
				const sample = sampleFractalPoint(this.state, point, this.iterations, this.roots);
				if (sample.status !== 'escaped') continue;
				const bin = Math.max(0, Math.min(this.iterations, Math.floor(sample.iterations)));
				escaped[index] = 1;
				bins[index] = bin;
				histogram[bin] += 1;
			}
		}
	}

	private finishHistogramAnalysis() {
		const histogram = this.histogram as Uint32Array;
		this.cumulative = new Uint32Array(histogram.length);
		for (let index = 0; index < histogram.length; index += 1) {
			this.totalEscaped += histogram[index];
			this.cumulative[index] = this.totalEscaped;
		}
	}

	private colourHistogramTile(
		tile: { x: number; y: number; width: number; height: number },
		signal?: AbortSignal
	) {
		const data = new Uint8ClampedArray(tile.width * tile.height * 4);
		const escaped = this.escaped as Uint8Array;
		const bins = this.bins as Uint16Array;
		const histogram = this.histogram as Uint32Array;
		const cumulative = this.cumulative as Uint32Array;
		const interior = parseCssColor(this.state.interiorColor, {
			r: 0.012,
			g: 0.016,
			b: 0.032
		});
		for (let localY = 0; localY < tile.height; localY += 1) {
			this.throwIfCancelled(signal);
			const y = tile.y + localY;
			for (let localX = 0; localX < tile.width; localX += 1) {
				const x = tile.x + localX;
				const sourceIndex = y * this.width + x;
				const targetIndex = (localY * tile.width + localX) * 4;
				if (!escaped[sourceIndex] || this.totalEscaped === 0) {
					writeColor(data, targetIndex, interior);
					continue;
				}
				const bin = bins[sourceIndex];
				const lowerCount = cumulative[bin] - histogram[bin];
				const quantile = (lowerCount + histogram[bin] * 0.5) / this.totalEscaped;
				writeColor(
					data,
					targetIndex,
					samplePalette(this.stops, quantile, this.state.paletteOffset, this.state.paletteCycles)
				);
			}
		}
		return data;
	}

	private colourSampledTile(
		tile: { x: number; y: number; width: number; height: number },
		signal?: AbortSignal
	) {
		const data = new Uint8ClampedArray(tile.width * tile.height * 4);
		for (let localY = 0; localY < tile.height; localY += 1) {
			this.throwIfCancelled(signal);
			const y = tile.y + localY;
			for (let localX = 0; localX < tile.width; localX += 1) {
				const x = tile.x + localX;
				const point = pixelToComplex(this.state, x, y, this.width, this.height);
				const sample = sampleFractalPoint(this.state, point, this.iterations, this.roots);
				writeColor(
					data,
					(localY * tile.width + localX) * 4,
					sampleColor(
						this.state,
						sample,
						this.stops,
						this.roots.length,
						this.iterations,
						this.height,
						point
					)
				);
			}
		}
		return data;
	}

	private throwIfCancelled(signal?: AbortSignal) {
		if (signal?.aborted) throw new Error('The CPU fractal render was cancelled.');
	}
}

/**
 * Synchronous, allocation-bounded fallback. It deliberately reduces both
 * resolution and iteration depth to keep a failed-GPU path responsive.
 */
export function renderCpuFractal(
	state: FractalViewState,
	requestedWidth: number,
	requestedHeight: number,
	options: CpuRenderOptions = {}
): CpuFractalFrame {
	const accumulator = new CpuTiledFractalAccumulator(
		state,
		requestedWidth,
		requestedHeight,
		options
	);
	const data = new Uint8ClampedArray(accumulator.pixelCount * 4);
	while (!accumulator.complete) {
		const tile = accumulator.advanceTile(options.signal);
		if (!tile) continue;
		for (let localY = 0; localY < tile.height; localY += 1) {
			const sourceStart = localY * tile.width * 4;
			const targetStart = ((tile.y + localY) * accumulator.width + tile.x) * 4;
			data.set(tile.pixels.subarray(sourceStart, sourceStart + tile.width * 4), targetStart);
		}
	}

	return {
		width: accumulator.width,
		height: accumulator.height,
		data,
		iterations: accumulator.iterations,
		requestedIterations: accumulator.requestedIterations,
		pixelCount: accumulator.pixelCount
	};
}

/**
 * Demand-rendered Canvas 2D backend. The canvas drawing buffer itself remains
 * bounded, so CSS naturally scales the fallback without allocating a hidden
 * full-resolution image.
 */
export class Canvas2DFractalRenderer {
	readonly backend = 'canvas-2d' as const;
	private readonly context: CanvasRenderingContext2D;
	private cssWidth = 1;
	private cssHeight = 1;
	private pixelRatio = 1;
	private destroyed = false;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly callbacks: Canvas2DRendererCallbacks = {}
	) {
		const context = canvas.getContext('2d', { alpha: false });
		if (!context) throw new Error('Canvas 2D is unavailable.');
		this.context = context;
	}

	get ready() {
		return !this.destroyed;
	}

	get isContextLost() {
		return false;
	}

	resize(cssWidth: number, cssHeight: number, pixelRatio = 1) {
		this.ensureActive();
		this.cssWidth = Math.max(1, Number.isFinite(cssWidth) ? cssWidth : 1);
		this.cssHeight = Math.max(1, Number.isFinite(cssHeight) ? cssHeight : 1);
		this.pixelRatio = Math.max(0.5, Math.min(1, Number.isFinite(pixelRatio) ? pixelRatio : 1));
	}

	render(
		state: FractalViewState,
		options: CpuRenderOptions & Pick<RenderSizeOptions, 'maxPixels'> = {}
	): Canvas2DRenderResult {
		this.ensureActive();
		try {
			const frame = renderCpuFractal(
				state,
				this.cssWidth * this.pixelRatio,
				this.cssHeight * this.pixelRatio,
				options
			);
			if (this.canvas.width !== frame.width) this.canvas.width = frame.width;
			if (this.canvas.height !== frame.height) this.canvas.height = frame.height;
			const image = this.context.createImageData(frame.width, frame.height);
			image.data.set(frame.data);
			this.context.putImageData(image, 0, 0);
			if (frame.iterations < frame.requestedIterations) {
				this.callbacks.onStatus?.(
					`Canvas fallback capped this frame at ${frame.iterations} iterations to remain responsive.`
				);
			} else {
				this.callbacks.onStatus?.('Canvas fallback frame ready.');
			}
			return {
				backend: 'canvas-2d',
				width: frame.width,
				height: frame.height,
				iterations: frame.iterations,
				requestedIterations: frame.requestedIterations,
				preview: options.preview ?? false
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'The Canvas fallback could not render.';
			this.callbacks.onError?.(message);
			throw error;
		}
	}

	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
	}

	private ensureActive() {
		if (this.destroyed) throw new Error('The Canvas 2D fractal renderer has been destroyed.');
	}
}
