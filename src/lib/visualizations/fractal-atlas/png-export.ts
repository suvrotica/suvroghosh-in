import type { FractalFamily, FractalViewState, PaletteStop } from './types';
import {
	findPolynomialRoots,
	MAX_SHADER_ITERATIONS,
	pixelToComplex,
	sampleFractalPoint,
	type FractalSample
} from './render/math';
import {
	paletteStops,
	parseCssColor,
	sampleCategoricalPalette,
	samplePalette,
	type RgbColor
} from './render/palette';

export const PNG_EXPORT_MAX_DIMENSION = 8_192;
export const PNG_EXPORT_MAX_PIXELS = 12_000_000;
export const PNG_EXPORT_MAX_ESTIMATED_BYTES = 160 * 1024 * 1024;
export const PNG_EXPORT_ESTIMATED_BYTES_PER_PIXEL = 12;
export const PNG_EXPORT_MAX_WORK_UNITS = 400_000_000;
export const PNG_EXPORT_DEFAULT_TILE_SIZE = 64;
export const PNG_EXPORT_MIN_TILE_SIZE = 32;
export const PNG_EXPORT_MAX_TILE_SIZE = 256;

export const PNG_EXPORT_RASTER_FAMILIES = [
	'mandelbrot',
	'julia',
	'multibrot',
	'burning-ship',
	'tricorn',
	'phoenix',
	'custom-map',
	'newton'
] as const satisfies readonly FractalFamily[];

type PngExportRasterFamily = (typeof PNG_EXPORT_RASTER_FAMILIES)[number];
type PngExportPhase = 'rendering' | 'encoding' | 'complete';

export interface FractalPngExportTile {
	index: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface FractalPngIterationPlan {
	requested: number;
	effective: number;
	capped: boolean;
	reasons: string[];
}

export interface FractalPngExportPlan {
	width: number;
	height: number;
	pixelCount: number;
	tileSize: number;
	tiles: FractalPngExportTile[];
	totalTiles: number;
	estimatedPeakBytes: number;
	iterations: FractalPngIterationPlan;
}

export interface FractalPngExportProgress {
	phase: PngExportPhase;
	completedTiles: number;
	totalTiles: number;
	completedPixels: number;
	totalPixels: number;
	renderFraction: number;
	currentTile?: FractalPngExportTile;
}

export interface FractalPngExportOptions {
	width: number;
	height: number;
	tileSize?: number;
	/**
	 * A caller may lower the hard pixel cap but cannot raise it.
	 */
	maxPixels?: number;
	/**
	 * A caller-selected ceiling. The sampler and total-work ceilings can still
	 * lower the effective count.
	 */
	maximumIterations?: number;
	/** Optional visible atlas annotation drawn inside the bottom edge of the PNG. */
	caption?: FractalPngCaption;
	signal?: AbortSignal;
	onProgress?: (progress: FractalPngExportProgress) => void;
}

export interface FractalPngCaption {
	title: string;
	formula: string;
	coordinate: string;
}

export interface FractalPngExportMetadata {
	family: PngExportRasterFamily;
	width: number;
	height: number;
	pixelCount: number;
	tileSize: number;
	tileCount: number;
	estimatedPeakBytes: number;
	requestedIterations: number;
	effectiveIterations: number;
	iterationsCapped: boolean;
	iterationCapReasons: string[];
	mimeType: 'image/png';
	blobBytes: number;
	elapsedMilliseconds: number;
}

export interface FractalPngExportResult {
	blob: Blob;
	metadata: FractalPngExportMetadata;
}

export interface FractalPngTileRenderOptions {
	signal?: AbortSignal;
	onProgress?: (progress: FractalPngExportProgress) => void;
	writeTile: (tile: FractalPngExportTile, rgba: Uint8ClampedArray) => void | Promise<void>;
}

const RASTER_FAMILY_SET = new Set<FractalFamily>(PNG_EXPORT_RASTER_FAMILIES);

/**
 * Performs all dimension, memory, tile, and iteration checks without touching
 * the DOM. The plan can be shown to a user before starting a long export.
 */
export function createFractalPngExportPlan(
	state: FractalViewState,
	options: Pick<
		FractalPngExportOptions,
		'width' | 'height' | 'tileSize' | 'maxPixels' | 'maximumIterations'
	>
): FractalPngExportPlan {
	assertRasterFamily(state.family);
	const width = requiredInteger(options.width, 'width', 1, PNG_EXPORT_MAX_DIMENSION);
	const height = requiredInteger(options.height, 'height', 1, PNG_EXPORT_MAX_DIMENSION);
	const pixelCount = width * height;
	const callerPixelCap =
		options.maxPixels === undefined
			? PNG_EXPORT_MAX_PIXELS
			: requiredInteger(options.maxPixels, 'maxPixels', 1, PNG_EXPORT_MAX_PIXELS);
	if (pixelCount > callerPixelCap) {
		throw new RangeError(
			`PNG export requested ${pixelCount.toLocaleString()} pixels, above the ${callerPixelCap.toLocaleString()}-pixel safety cap.`
		);
	}

	const tileSize =
		options.tileSize === undefined
			? PNG_EXPORT_DEFAULT_TILE_SIZE
			: requiredInteger(
					options.tileSize,
					'tileSize',
					PNG_EXPORT_MIN_TILE_SIZE,
					PNG_EXPORT_MAX_TILE_SIZE
				);
	const maximumTilePixels = Math.min(tileSize, width) * Math.min(tileSize, height);
	const estimatedPeakBytes =
		pixelCount * PNG_EXPORT_ESTIMATED_BYTES_PER_PIXEL + maximumTilePixels * 8;
	if (estimatedPeakBytes > PNG_EXPORT_MAX_ESTIMATED_BYTES) {
		throw new RangeError(
			`PNG export is estimated to need ${formatMebibytes(estimatedPeakBytes)}, above the ${formatMebibytes(PNG_EXPORT_MAX_ESTIMATED_BYTES)} memory safety cap.`
		);
	}

	const tiles: FractalPngExportTile[] = [];
	for (let y = 0; y < height; y += tileSize) {
		for (let x = 0; x < width; x += tileSize) {
			tiles.push({
				index: tiles.length,
				x,
				y,
				width: Math.min(tileSize, width - x),
				height: Math.min(tileSize, height - y)
			});
		}
	}

	return {
		width,
		height,
		pixelCount,
		tileSize,
		tiles,
		totalTiles: tiles.length,
		estimatedPeakBytes,
		iterations: resolveIterationPlan(state.maxIterations, options.maximumIterations, pixelCount)
	};
}

/**
 * Renders seam-free RGBA tiles. Every tile maps its local samples through the
 * full image's width, height, and absolute pixel coordinates.
 *
 * This lower-level entry point is useful for alternate encoders and makes
 * cancellation testable without allocating a browser canvas.
 */
export async function renderFractalPngTiles(
	state: FractalViewState,
	plan: FractalPngExportPlan,
	options: FractalPngTileRenderOptions
): Promise<void> {
	assertRasterFamily(state.family);
	throwIfAborted(options.signal);
	const roots = state.family === 'newton' ? findPolynomialRoots(state.polynomial) : [];
	const stops = paletteStops(state.paletteId, state.customPalette);
	let completedPixels = 0;

	reportProgress(options.onProgress, {
		phase: 'rendering',
		completedTiles: 0,
		totalTiles: plan.totalTiles,
		completedPixels: 0,
		totalPixels: plan.pixelCount,
		renderFraction: 0
	});
	throwIfAborted(options.signal);

	for (const tile of plan.tiles) {
		throwIfAborted(options.signal);
		const rgba = renderTile(state, plan, tile, stops, roots, options.signal);
		await options.writeTile(tile, rgba);
		completedPixels += tile.width * tile.height;
		reportProgress(options.onProgress, {
			phase: 'rendering',
			completedTiles: tile.index + 1,
			totalTiles: plan.totalTiles,
			completedPixels,
			totalPixels: plan.pixelCount,
			renderFraction: completedPixels / plan.pixelCount,
			currentTile: tile
		});
		throwIfAborted(options.signal);
		if (tile.index + 1 < plan.totalTiles) {
			await yieldToBrowser();
			throwIfAborted(options.signal);
		}
	}
}

/**
 * Creates a PNG entirely in the browser. State is snapshotted before the first
 * asynchronous yield, so edits made in the live atlas cannot create seams.
 */
export async function exportFractalPng(
	state: FractalViewState,
	options: FractalPngExportOptions
): Promise<FractalPngExportResult> {
	const startedAt = now();
	throwIfAborted(options.signal);
	const snapshot = cloneState(state);
	const plan = createFractalPngExportPlan(snapshot, options);
	const surface = createExportSurface(plan.width, plan.height);

	try {
		await renderFractalPngTiles(snapshot, plan, {
			signal: options.signal,
			onProgress: options.onProgress,
			writeTile(tile, rgba) {
				const image = surface.context.createImageData(tile.width, tile.height);
				image.data.set(rgba);
				surface.context.putImageData(image, tile.x, tile.y);
			}
		});
		throwIfAborted(options.signal);
		if (options.caption) {
			drawFractalPngCaption(
				surface.context,
				plan.width,
				plan.height,
				normalizePngCaption(options.caption)
			);
		}
		reportProgress(options.onProgress, progressForPhase('encoding', plan));
		const blob = await encodePng(surface.canvas);
		throwIfAborted(options.signal);
		reportProgress(options.onProgress, progressForPhase('complete', plan));

		return {
			blob,
			metadata: {
				family: snapshot.family as PngExportRasterFamily,
				width: plan.width,
				height: plan.height,
				pixelCount: plan.pixelCount,
				tileSize: plan.tileSize,
				tileCount: plan.totalTiles,
				estimatedPeakBytes: plan.estimatedPeakBytes,
				requestedIterations: plan.iterations.requested,
				effectiveIterations: plan.iterations.effective,
				iterationsCapped: plan.iterations.capped,
				iterationCapReasons: [...plan.iterations.reasons],
				mimeType: 'image/png',
				blobBytes: blob.size,
				elapsedMilliseconds: Math.max(0, now() - startedAt)
			}
		};
	} finally {
		surface.canvas.width = 1;
		surface.canvas.height = 1;
	}
}

/**
 * Draws a restrained observatory-style caption inside the existing bitmap.
 * Keeping the dimensions unchanged makes the resolution selector literal and
 * lets callers add the same annotation to composed and tiled exports.
 */
export function drawFractalPngCaption(
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	width: number,
	height: number,
	caption: FractalPngCaption
) {
	const safeWidth = Math.max(1, Math.floor(width));
	const safeHeight = Math.max(1, Math.floor(height));
	const normalized = normalizePngCaption(caption);
	const padding = Math.max(6, Math.min(32, safeWidth * 0.022));
	const titleSize = Math.max(7, Math.min(28, safeWidth * 0.021));
	const bodySize = Math.max(6, Math.min(18, safeWidth * 0.013));
	const bandHeight = Math.min(
		safeHeight,
		Math.max(34, Math.min(safeHeight * 0.34, titleSize + bodySize * 2.9 + padding * 1.4))
	);
	const top = Math.max(0, safeHeight - bandHeight);
	const textWidth = Math.max(1, safeWidth - padding * 2);

	context.save();
	context.fillStyle = 'rgba(6, 8, 14, 0.88)';
	context.fillRect(0, top, safeWidth, bandHeight);
	context.fillStyle = '#cfaa64';
	context.fillRect(0, top, safeWidth, Math.max(1, safeHeight / 900));
	context.textAlign = 'left';
	context.textBaseline = 'alphabetic';

	let baseline = top + padding * 0.72 + titleSize;
	drawCaptionLine(
		context,
		normalized.title,
		padding,
		baseline,
		textWidth,
		titleSize,
		7,
		700,
		'#f3eee4'
	);
	baseline += bodySize * 1.48;
	drawCaptionLine(
		context,
		normalized.formula,
		padding,
		baseline,
		textWidth,
		bodySize,
		6,
		500,
		'#8fc2c2'
	);
	baseline += bodySize * 1.34;
	drawCaptionLine(
		context,
		normalized.coordinate,
		padding,
		Math.min(safeHeight - Math.max(3, padding * 0.28), baseline),
		textWidth,
		bodySize,
		6,
		500,
		'#d8c690'
	);
	context.restore();
}

function renderTile(
	state: FractalViewState,
	plan: FractalPngExportPlan,
	tile: FractalPngExportTile,
	stops: readonly PaletteStop[],
	roots: ReturnType<typeof findPolynomialRoots>,
	signal?: AbortSignal
) {
	const rgba = new Uint8ClampedArray(tile.width * tile.height * 4);
	for (let localY = 0; localY < tile.height; localY += 1) {
		throwIfAborted(signal);
		const globalY = tile.y + localY;
		for (let localX = 0; localX < tile.width; localX += 1) {
			const globalX = tile.x + localX;
			const point = pixelToComplex(state, globalX, globalY, plan.width, plan.height);
			const sample = sampleFractalPoint(state, point, plan.iterations.effective, roots);
			writeColor(
				rgba,
				(localY * tile.width + localX) * 4,
				colorSample(
					state,
					sample,
					stops,
					roots.length,
					plan.iterations.effective,
					plan.height,
					point
				)
			);
		}
	}
	return rgba;
}

function colorSample(
	state: FractalViewState,
	sample: FractalSample,
	stops: readonly PaletteStop[],
	rootCount: number,
	iterationLimit: number,
	fullImageHeight: number,
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
			const pixelWorldSize = Math.max(1e-15, state.spanY / Math.max(1, fullImageHeight));
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
				value = sample.rootIndex / Math.max(1, rootCount);
				categoricalColor = sampleCategoricalPalette(stops, sample.rootIndex);
				brightness = 0.32 + 0.68 * (1 - Math.min(1, sample.iterations / maximumIterations));
			}
			break;
		case 'histogram':
		case 'density':
		case 'smooth':
			break;
	}
	return scaleColor(
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
	const light = clamp01(0.5 + 0.5 * (nx * Math.cos(angle) + ny * Math.sin(angle)));
	const relief = 0.28 + 0.72 * light;
	return 1 - strength + strength * relief;
}

function writeColor(target: Uint8ClampedArray, offset: number, color: RgbColor) {
	target[offset] = Math.round(clamp01(color.r) * 255);
	target[offset + 1] = Math.round(clamp01(color.g) * 255);
	target[offset + 2] = Math.round(clamp01(color.b) * 255);
	target[offset + 3] = 255;
}

function scaleColor(color: RgbColor, amount: number): RgbColor {
	const scale = clamp01(amount);
	return { r: color.r * scale, g: color.g * scale, b: color.b * scale };
}

function resolveIterationPlan(
	requestedValue: number,
	callerMaximum: number | undefined,
	pixelCount: number
): FractalPngIterationPlan {
	const requested = finitePositiveInteger(requestedValue, 96);
	const selectedMaximum =
		callerMaximum === undefined
			? requested
			: requiredInteger(callerMaximum, 'maximumIterations', 1, Number.MAX_SAFE_INTEGER);
	const workLimit = Math.max(8, Math.floor(PNG_EXPORT_MAX_WORK_UNITS / pixelCount));
	const effective = Math.max(
		1,
		Math.min(requested, selectedMaximum, MAX_SHADER_ITERATIONS, workLimit)
	);
	const reasons: string[] = [];
	if (selectedMaximum < requested) {
		reasons.push(`caller maximum of ${selectedMaximum.toLocaleString()} iterations`);
	}
	if (MAX_SHADER_ITERATIONS < requested) {
		reasons.push(`sampler maximum of ${MAX_SHADER_ITERATIONS.toLocaleString()} iterations`);
	}
	if (workLimit < requested) {
		reasons.push(
			`${PNG_EXPORT_MAX_WORK_UNITS.toLocaleString()} pixel-iteration export work budget`
		);
	}
	return {
		requested,
		effective,
		capped: effective < requested,
		reasons
	};
}

function progressForPhase(
	phase: Extract<PngExportPhase, 'encoding' | 'complete'>,
	plan: FractalPngExportPlan
): FractalPngExportProgress {
	return {
		phase,
		completedTiles: plan.totalTiles,
		totalTiles: plan.totalTiles,
		completedPixels: plan.pixelCount,
		totalPixels: plan.pixelCount,
		renderFraction: 1
	};
}

function reportProgress(
	callback: FractalPngExportOptions['onProgress'],
	progress: FractalPngExportProgress
) {
	callback?.(progress);
}

function assertRasterFamily(family: FractalFamily): asserts family is PngExportRasterFamily {
	if (!RASTER_FAMILY_SET.has(family)) {
		throw new TypeError(
			`High-resolution tiled PNG export supports ${PNG_EXPORT_RASTER_FAMILIES.join(', ')}; ${family} requires its family-specific progressive or vector exporter.`
		);
	}
}

function requiredInteger(value: number, label: string, minimum: number, maximum: number): number {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new RangeError(
			`${label} must be an integer from ${minimum.toLocaleString()} to ${maximum.toLocaleString()}.`
		);
	}
	return value;
}

function finitePositiveInteger(value: number, fallback: number) {
	if (!Number.isFinite(value) || value <= 0) return fallback;
	return Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
}

function formatMebibytes(bytes: number) {
	return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function clamp01(value: number) {
	return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function cloneState(state: FractalViewState): FractalViewState {
	if (typeof structuredClone === 'function') return structuredClone(state);
	return JSON.parse(JSON.stringify(state)) as FractalViewState;
}

function normalizePngCaption(caption: FractalPngCaption): FractalPngCaption {
	return {
		title: boundedCaptionText(caption.title, 'The Fractal Atlas'),
		formula: boundedCaptionText(caption.formula, 'Fractal iteration'),
		coordinate: boundedCaptionText(caption.coordinate, 'Coordinate unavailable')
	};
}

function boundedCaptionText(value: string, fallback: string) {
	const normalized = String(value ?? '')
		.split('')
		.map((character) => {
			const code = character.charCodeAt(0);
			return code <= 31 || code === 127 ? ' ' : character;
		})
		.join('')
		.replace(/\s+/gu, ' ')
		.trim();
	return (normalized || fallback).slice(0, 512);
}

function drawCaptionLine(
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	maxWidth: number,
	preferredSize: number,
	minimumSize: number,
	weight: number,
	color: string
) {
	let fontSize = preferredSize;
	const family = '"IBM Plex Mono", "Cascadia Mono", ui-monospace, monospace';
	context.font = `${weight} ${fontSize}px ${family}`;
	const measured = context.measureText(text).width;
	if (measured > maxWidth && measured > 0) {
		fontSize = Math.max(minimumSize, (fontSize * maxWidth) / measured);
		context.font = `${weight} ${fontSize}px ${family}`;
	}
	let visible = text;
	if (context.measureText(visible).width > maxWidth) {
		const ellipsis = '…';
		let low = 0;
		let high = visible.length;
		while (low < high) {
			const middle = Math.ceil((low + high) / 2);
			if (context.measureText(`${visible.slice(0, middle)}${ellipsis}`).width <= maxWidth) {
				low = middle;
			} else {
				high = middle - 1;
			}
		}
		visible = `${visible.slice(0, low)}${ellipsis}`;
	}
	context.fillStyle = color;
	context.fillText(visible, x, y);
}

function throwIfAborted(signal?: AbortSignal) {
	if (!signal?.aborted) return;
	if (
		typeof DOMException === 'function' &&
		signal.reason instanceof DOMException &&
		signal.reason.name === 'AbortError'
	) {
		throw signal.reason;
	}
	if (typeof DOMException === 'function') {
		throw new DOMException('The PNG export was cancelled.', 'AbortError');
	}
	const error = new Error('The PNG export was cancelled.');
	error.name = 'AbortError';
	throw error;
}

async function yieldToBrowser() {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}

type ExportCanvas = HTMLCanvasElement | OffscreenCanvas;
type ExportContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function createExportSurface(
	width: number,
	height: number
): { canvas: ExportCanvas; context: ExportContext } {
	if (typeof OffscreenCanvas === 'function') {
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext('2d', { alpha: false });
		if (!context) throw new Error('Offscreen Canvas 2D is unavailable for PNG export.');
		return { canvas, context };
	}
	if (typeof document !== 'undefined') {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d', { alpha: false });
		if (!context) throw new Error('Canvas 2D is unavailable for PNG export.');
		return { canvas, context };
	}
	throw new Error('PNG encoding requires a browser Canvas 2D implementation.');
}

async function encodePng(canvas: ExportCanvas): Promise<Blob> {
	if ('convertToBlob' in canvas) {
		return canvas.convertToBlob({ type: 'image/png' });
	}
	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(new Error('The browser could not encode the rendered canvas as PNG.'));
		}, 'image/png');
	});
}

function now() {
	return typeof performance === 'undefined' ? Date.now() : performance.now();
}
