import { serializeGenome } from './genome';
import type { CreatureGenome } from './types';

const MEBIBYTE = 1024 * 1024;
const DEFAULT_MAX_LONGEST_EDGE = 8_192;
const DEFAULT_MAX_PIXELS = 48_000_000;
const DEFAULT_MAX_BYTES = 256 * MEBIBYTE;
const HARD_MAX_LONGEST_EDGE = 16_384;
const HARD_MAX_PIXELS = 96_000_000;
const HARD_MAX_BYTES = 512 * MEBIBYTE;
const MAX_CONTACT_SHEET_TILES = 9;
const MAX_FILENAME_LENGTH = 160;

export type ExportScale = 1 | 2 | 4;

export type ExportMemoryLimits = Readonly<{
	maxLongestEdge?: number;
	maxPixels?: number;
	maxBytes?: number;
	workingCopies?: number;
}>;

export type ExportDimensionPlan = Readonly<{
	safe: boolean;
	baseWidth: number;
	baseHeight: number;
	requestedScale: ExportScale;
	scale: ExportScale;
	width: number;
	height: number;
	pixels: number;
	rgbaBytes: number;
	estimatedBytes: number;
	downgraded: boolean;
	reason?: string;
}>;

export type CanvasBlobSource = Readonly<{
	toBlob?: (callback: BlobCallback, type?: string, quality?: number) => void;
	convertToBlob?: (options?: { type?: string; quality?: number }) => Promise<Blob>;
}>;

export type DownloadEnvironment = Readonly<{
	document?: Document;
	url?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
}>;

export type GenomeDownloadOptions = DownloadEnvironment &
	Readonly<{
		name?: string;
		seed?: string;
	}>;

export type ContactSheetTile<T> = Readonly<{
	value: T;
	name: string;
	seed: string;
	world: string;
}>;

export type ContactSheetTileFrame = Readonly<{
	index: number;
	x: number;
	y: number;
	width: number;
	height: number;
	scale: ExportScale;
}>;

export type ContactSheetOptions<T> = Readonly<{
	tiles: readonly ContactSheetTile<T>[];
	renderTile: (
		context: CanvasRenderingContext2D,
		tile: ContactSheetTile<T>,
		frame: ContactSheetTileFrame
	) => void | Promise<void>;
	createCanvas?: (width: number, height: number) => HTMLCanvasElement;
	tileWidth?: number;
	tileHeight?: number;
	scale?: ExportScale;
	gap?: number;
	padding?: number;
	labelHeight?: number;
	background?: string;
	foreground?: string;
	border?: string;
	memoryLimits?: ExportMemoryLimits;
}>;

export type ContactSheetResource = Readonly<{
	canvas: HTMLCanvasElement;
	plan: ExportDimensionPlan;
	columns: number;
	rows: number;
	release: () => void;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
	return clamp(Math.round(finite(value, fallback)), 1, maximum);
}

function requestedScale(value: unknown): ExportScale {
	return value === 4 ? 4 : value === 2 ? 2 : 1;
}

function resolvedLimits(limits: ExportMemoryLimits = {}): Required<ExportMemoryLimits> {
	return {
		maxLongestEdge: positiveInteger(
			limits.maxLongestEdge,
			DEFAULT_MAX_LONGEST_EDGE,
			HARD_MAX_LONGEST_EDGE
		),
		maxPixels: positiveInteger(limits.maxPixels, DEFAULT_MAX_PIXELS, HARD_MAX_PIXELS),
		maxBytes: positiveInteger(limits.maxBytes, DEFAULT_MAX_BYTES, HARD_MAX_BYTES),
		workingCopies: positiveInteger(limits.workingCopies, 2, 4)
	};
}

function candidatePlan(
	baseWidth: number,
	baseHeight: number,
	scale: ExportScale,
	limits: Required<ExportMemoryLimits>
): Omit<ExportDimensionPlan, 'requestedScale' | 'downgraded'> {
	const width = baseWidth * scale;
	const height = baseHeight * scale;
	if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
		return {
			safe: false,
			baseWidth,
			baseHeight,
			scale,
			width: 0,
			height: 0,
			pixels: 0,
			rgbaBytes: 0,
			estimatedBytes: 0,
			reason: 'Export dimensions exceed safe integer precision.'
		};
	}
	const pixels = width * height;
	const rgbaBytes = pixels * 4;
	const estimatedBytes = rgbaBytes * limits.workingCopies;
	let reason: string | undefined;
	if (Math.max(width, height) > limits.maxLongestEdge) {
		reason = `The longest edge would exceed ${limits.maxLongestEdge}px.`;
	} else if (!Number.isSafeInteger(pixels) || pixels > limits.maxPixels) {
		reason = `The export would exceed ${limits.maxPixels.toLocaleString('en')} pixels.`;
	} else if (!Number.isSafeInteger(estimatedBytes) || estimatedBytes > limits.maxBytes) {
		reason = `The estimated working memory would exceed ${Math.floor(limits.maxBytes / MEBIBYTE)} MiB.`;
	}
	return {
		safe: reason === undefined,
		baseWidth,
		baseHeight,
		scale,
		width,
		height,
		pixels,
		rgbaBytes,
		estimatedBytes,
		...(reason ? { reason } : {})
	};
}

/** Chooses the requested 1x/2x/4x scale, safely falling back when memory is tighter. */
export function planExportDimensions(
	widthInput: number,
	heightInput: number,
	scaleInput: ExportScale,
	limitOptions: ExportMemoryLimits = {}
): ExportDimensionPlan {
	const width = finite(widthInput);
	const height = finite(heightInput);
	const scale = requestedScale(scaleInput);
	if (
		width <= 0 ||
		height <= 0 ||
		!Number.isSafeInteger(Math.round(width)) ||
		!Number.isSafeInteger(Math.round(height))
	) {
		return {
			safe: false,
			baseWidth: 0,
			baseHeight: 0,
			requestedScale: scale,
			scale: 1,
			width: 0,
			height: 0,
			pixels: 0,
			rgbaBytes: 0,
			estimatedBytes: 0,
			downgraded: scale !== 1,
			reason: 'Export dimensions must be positive finite integers.'
		};
	}
	const baseWidth = Math.round(width);
	const baseHeight = Math.round(height);
	const limits = resolvedLimits(limitOptions);
	const candidates: readonly ExportScale[] = scale === 4 ? [4, 2, 1] : scale === 2 ? [2, 1] : [1];
	let last = candidatePlan(baseWidth, baseHeight, 1, limits);
	for (const candidate of candidates) {
		const plan = candidatePlan(baseWidth, baseHeight, candidate, limits);
		last = plan;
		if (plan.safe) {
			return {
				...plan,
				requestedScale: scale,
				downgraded: candidate !== scale
			};
		}
	}
	return {
		...last,
		requestedScale: scale,
		downgraded: scale !== 1
	};
}

export function sanitizeFilenamePart(
	value: unknown,
	fallback = 'specimen',
	maximumLength = 72
): string {
	const boundedLength = clamp(Math.round(finite(maximumLength, 72)), 1, MAX_FILENAME_LENGTH);
	const normalized = String(value ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-')
		.slice(0, boundedLength)
		.replace(/-+$/g, '');
	if (normalized) return normalized;
	const safeFallback = String(fallback)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, boundedLength);
	return safeFallback || 'specimen';
}

export function createExportFilename(
	name: unknown,
	seed: unknown,
	extension: 'png' | 'json' = 'png'
): string {
	const creature = sanitizeFilenamePart(name, 'specimen', 68);
	const safeSeed = sanitizeFilenamePart(seed, 'seed', 54);
	return `chitin-engine-${creature}-${safeSeed}.${extension}`.slice(0, MAX_FILENAME_LENGTH);
}

/** Supports both HTMLCanvasElement.toBlob and OffscreenCanvas.convertToBlob. */
export async function canvasToBlob(
	canvas: CanvasBlobSource,
	type = 'image/png',
	quality?: number
): Promise<Blob> {
	const safeType = ['image/png', 'image/jpeg', 'image/webp'].includes(type) ? type : 'image/png';
	const safeQuality = quality === undefined ? undefined : clamp(finite(quality, 0.92), 0, 1);
	if (canvas.convertToBlob) {
		try {
			return await canvas.convertToBlob({ type: safeType, quality: safeQuality });
		} catch {
			throw new Error('The export canvas could not be encoded.');
		}
	}
	if (!canvas.toBlob) throw new Error('This canvas does not support image export.');
	return await new Promise<Blob>((resolve, reject) => {
		try {
			canvas.toBlob?.(
				(blob) => {
					if (blob) resolve(blob);
					else reject(new Error('The export canvas returned no image data.'));
				},
				safeType,
				safeQuality
			);
		} catch {
			reject(new Error('The export canvas could not be encoded.'));
		}
	});
}

/** Creates, clicks, removes and revokes a temporary download URL synchronously. */
export function downloadBlob(
	blob: Blob,
	filenameInput: string,
	environment: DownloadEnvironment = {}
): string {
	const documentObject =
		environment.document ?? (typeof document === 'undefined' ? undefined : document);
	const urlObject = environment.url ?? (typeof URL === 'undefined' ? undefined : URL);
	if (!documentObject || !urlObject?.createObjectURL || !urlObject.revokeObjectURL) {
		throw new Error('Downloads are unavailable in this environment.');
	}
	const filename = sanitizeDownloadFilename(filenameInput);
	const objectUrl = urlObject.createObjectURL(blob);
	const anchor = documentObject.createElement('a');
	try {
		anchor.href = objectUrl;
		anchor.download = filename;
		anchor.rel = 'noopener';
		anchor.style.display = 'none';
		documentObject.body?.append(anchor);
		anchor.click();
	} finally {
		anchor.remove();
		urlObject.revokeObjectURL(objectUrl);
	}
	return filename;
}

export function sanitizeDownloadFilename(filename: unknown): string {
	const raw = String(filename ?? '').slice(0, MAX_FILENAME_LENGTH);
	const lastDot = raw.lastIndexOf('.');
	const extension = lastDot >= 0 ? raw.slice(lastDot + 1).toLowerCase() : 'png';
	const safeExtension = extension === 'json' ? 'json' : extension === 'png' ? 'png' : 'png';
	const stem = lastDot >= 0 ? raw.slice(0, lastDot) : raw;
	return `${sanitizeFilenamePart(stem, 'chitin-engine-specimen', 148)}.${safeExtension}`;
}

export async function downloadCanvasPng(
	canvas: CanvasBlobSource,
	filename: string,
	environment: DownloadEnvironment = {}
): Promise<string> {
	const blob = await canvasToBlob(canvas, 'image/png');
	return downloadBlob(blob, filename, environment);
}

export function createGenomeJsonBlob(genome: CreatureGenome): Blob {
	return new Blob([serializeGenome(genome)], { type: 'application/json;charset=utf-8' });
}

export function downloadGenomeJson(
	genome: CreatureGenome,
	options: GenomeDownloadOptions = {}
): string {
	const filename = createExportFilename(
		options.name ?? genome.preset,
		options.seed ?? genome.seed,
		'json'
	);
	return downloadBlob(createGenomeJsonBlob(genome), filename, options);
}

function contactSheetGrid(count: number): { columns: number; rows: number } {
	if (count === 4) return { columns: 2, rows: 2 };
	if (count === 6) return { columns: 3, rows: 2 };
	if (count === 9) return { columns: 3, rows: 3 };
	throw new RangeError('A Chitin contact sheet must contain exactly 4, 6, or 9 specimens.');
}

function defaultCanvasFactory(width: number, height: number): HTMLCanvasElement {
	if (typeof document === 'undefined') {
		throw new Error('A canvas factory is required outside a browser.');
	}
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function conciseLabel(value: unknown, fallback: string, maximumLength: number): string {
	const withoutControls = Array.from(String(value ?? ''), (character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127 ? ' ' : character;
	}).join('');
	const normalized = withoutControls.replace(/\s+/g, ' ').trim();
	return (normalized || fallback).slice(0, maximumLength);
}

/**
 * Builds a contact sheet only on demand. Tile callbacks run sequentially in a
 * stable order, and release() immediately drops the backing canvas allocation.
 */
export async function composeContactSheet<T>(
	options: ContactSheetOptions<T>
): Promise<ContactSheetResource> {
	if (options.tiles.length > MAX_CONTACT_SHEET_TILES) {
		throw new RangeError(`A contact sheet cannot exceed ${MAX_CONTACT_SHEET_TILES} specimens.`);
	}
	const grid = contactSheetGrid(options.tiles.length);
	const tileWidth = positiveInteger(options.tileWidth, 480, 2_048);
	const tileHeight = positiveInteger(options.tileHeight, 420, 2_048);
	const gap = clamp(Math.round(finite(options.gap, 12)), 0, 96);
	const padding = clamp(Math.round(finite(options.padding, 18)), 0, 128);
	const labelHeight = clamp(Math.round(finite(options.labelHeight, 42)), 24, 128);
	const baseWidth = padding * 2 + grid.columns * tileWidth + (grid.columns - 1) * gap;
	const baseHeight = padding * 2 + grid.rows * tileHeight + (grid.rows - 1) * gap;
	const plan = planExportDimensions(
		baseWidth,
		baseHeight,
		requestedScale(options.scale),
		options.memoryLimits
	);
	if (!plan.safe) throw new RangeError(plan.reason ?? 'The contact sheet exceeds safe limits.');

	const createCanvas = options.createCanvas ?? defaultCanvasFactory;
	let canvas: HTMLCanvasElement;
	try {
		canvas = createCanvas(plan.width, plan.height);
		canvas.width = plan.width;
		canvas.height = plan.height;
	} catch {
		throw new Error('The contact-sheet canvas could not be allocated.');
	}
	const context = canvas.getContext('2d');
	if (!context) {
		canvas.width = 1;
		canvas.height = 1;
		throw new Error('Canvas2D is unavailable for contact-sheet export.');
	}
	let released = false;
	const release = (): void => {
		if (released) return;
		released = true;
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.clearRect(0, 0, canvas.width, canvas.height);
		canvas.width = 1;
		canvas.height = 1;
	};

	const scale = plan.scale;
	const scaledPadding = padding * scale;
	const scaledGap = gap * scale;
	const scaledTileWidth = tileWidth * scale;
	const scaledTileHeight = tileHeight * scale;
	const scaledLabelHeight = labelHeight * scale;
	try {
		context.save();
		context.fillStyle = options.background ?? '#07100f';
		context.fillRect(0, 0, plan.width, plan.height);
		context.restore();

		for (let index = 0; index < options.tiles.length; index += 1) {
			const tile = options.tiles[index];
			const column = index % grid.columns;
			const row = Math.floor(index / grid.columns);
			const x = scaledPadding + column * (scaledTileWidth + scaledGap);
			const y = scaledPadding + row * (scaledTileHeight + scaledGap);
			const renderHeight = Math.max(1, scaledTileHeight - scaledLabelHeight);
			context.save();
			context.beginPath();
			context.rect(x, y, scaledTileWidth, renderHeight);
			context.clip();
			await options.renderTile(context, tile, {
				index,
				x,
				y,
				width: scaledTileWidth,
				height: renderHeight,
				scale
			});
			context.restore();

			context.save();
			context.strokeStyle = options.border ?? 'rgba(122, 181, 165, 0.38)';
			context.lineWidth = Math.max(1, scale);
			context.strokeRect(x, y, scaledTileWidth, scaledTileHeight);
			context.fillStyle = options.foreground ?? '#d7e3db';
			context.textBaseline = 'top';
			context.font = `${Math.max(10, 12 * scale)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
			context.fillText(
				conciseLabel(tile.name, `Specimen ${index + 1}`, 48),
				x + 9 * scale,
				y + renderHeight + 5 * scale,
				Math.max(1, scaledTileWidth - 18 * scale)
			);
			context.globalAlpha = 0.72;
			context.font = `${Math.max(8, 9 * scale)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
			context.fillText(
				`${conciseLabel(tile.seed, 'seed', 28)} · ${conciseLabel(tile.world, 'world', 28)}`,
				x + 9 * scale,
				y + renderHeight + 21 * scale,
				Math.max(1, scaledTileWidth - 18 * scale)
			);
			context.restore();
		}
	} catch (error) {
		release();
		if (error instanceof Error) throw error;
		throw new Error('A contact-sheet tile could not be rendered.', { cause: error });
	}

	return { canvas, plan, columns: grid.columns, rows: grid.rows, release };
}
