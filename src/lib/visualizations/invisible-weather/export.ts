import { createExhibitionRecipe, normalizeGalleryState } from './recipes';
import type {
	ExhibitionRecipe,
	ExportFormat,
	ExportPlan,
	InvisibleWeatherJsonExport,
	InvisibleWeatherState,
	Orientation
} from './types';

export const MAX_EXPORT_DIMENSION = 8_192;
export const MAX_EXPORT_PIXELS = 24_000_000;
export const MIN_EXPORT_DIMENSION = 320;

const RESERVED_FILENAMES = new Set([
	'CON',
	'PRN',
	'AUX',
	'NUL',
	'COM1',
	'COM2',
	'COM3',
	'COM4',
	'LPT1',
	'LPT2',
	'LPT3'
]);

export function sanitizeFilename(value: string, fallback = 'invisible-weather'): string {
	const cleaned = value
		.normalize('NFKD')
		.replace(/[<>:"/\\|?*]/gu, '-')
		.replace(/\p{Cc}/gu, '-')
		.replace(/\s+/gu, '-')
		.replace(/\.{2,}/gu, '.')
		.replace(/^-+|-+$/gu, '')
		.slice(0, 120);
	const stem = cleaned.split('.')[0]?.toUpperCase() ?? '';
	return !cleaned || RESERVED_FILENAMES.has(stem) ? fallback : cleaned;
}

export function exportFilename(
	recipe: ExhibitionRecipe,
	format: ExportFormat = 'png',
	label = 'exhibition'
): string {
	return sanitizeFilename(
		`invisible-weather-${label}-${recipe.seed}-${recipe.recipeHash}.${format}`,
		`invisible-weather-${recipe.recipeHash}.${format}`
	);
}

export function boundedExportDimensions(
	width: number,
	height: number,
	scale = 1
): Readonly<{ width: number; height: number; scale: number; pixelCount: number }> {
	const safeWidth = Math.max(
		MIN_EXPORT_DIMENSION,
		Math.min(MAX_EXPORT_DIMENSION, Number.isFinite(width) ? Math.round(width) : 1600)
	);
	const safeHeight = Math.max(
		MIN_EXPORT_DIMENSION,
		Math.min(MAX_EXPORT_DIMENSION, Number.isFinite(height) ? Math.round(height) : 900)
	);
	let safeScale = Math.max(0.25, Math.min(4, Number.isFinite(scale) ? scale : 1));
	const dimensionScale = Math.min(
		1,
		MAX_EXPORT_DIMENSION / (safeWidth * safeScale),
		MAX_EXPORT_DIMENSION / (safeHeight * safeScale)
	);
	safeScale *= dimensionScale;
	let outputWidth = Math.max(1, Math.round(safeWidth * safeScale));
	let outputHeight = Math.max(1, Math.round(safeHeight * safeScale));
	if (outputWidth * outputHeight > MAX_EXPORT_PIXELS) {
		const pixelScale = Math.sqrt(MAX_EXPORT_PIXELS / (outputWidth * outputHeight));
		safeScale *= pixelScale;
		outputWidth = Math.max(1, Math.floor(outputWidth * pixelScale));
		outputHeight = Math.max(1, Math.floor(outputHeight * pixelScale));
	}
	return {
		width: outputWidth,
		height: outputHeight,
		scale: safeScale,
		pixelCount: outputWidth * outputHeight
	};
}

export function createExportPlan(
	recipe: ExhibitionRecipe,
	options: Readonly<{
		format?: ExportFormat;
		width?: number;
		height?: number;
		scale?: number;
		orientation?: Orientation;
		label?: string;
	}> = {}
): ExportPlan {
	const orientation =
		options.orientation ??
		((options.width ?? 1600) >= (options.height ?? 900) ? 'landscape' : 'portrait');
	const defaultWidth = orientation === 'landscape' ? 1600 : 1200;
	const defaultHeight = orientation === 'landscape' ? 900 : 1600;
	const dimensions = boundedExportDimensions(
		options.width ?? defaultWidth,
		options.height ?? defaultHeight,
		options.scale ?? 1
	);
	const format = options.format ?? 'png';
	return {
		format,
		...dimensions,
		orientation,
		filename: exportFilename(recipe, format, options.label)
	};
}

export function createJsonExport(
	input: InvisibleWeatherState,
	recipe: ExhibitionRecipe = createExhibitionRecipe(input)
): InvisibleWeatherJsonExport {
	const state = normalizeGalleryState(input);
	return {
		schemaVersion: 1,
		artifact: 'Invisible Weather exhibition',
		createdBy: 'suvroghosh.in',
		recipeHash: recipe.recipeHash,
		state,
		recipe
	};
}

export function serializeJsonExport(
	state: InvisibleWeatherState,
	recipe?: ExhibitionRecipe
): string {
	return `${JSON.stringify(createJsonExport(state, recipe), null, 2)}\n`;
}

export function validateJsonExport(value: unknown): value is InvisibleWeatherJsonExport {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	if (
		record.schemaVersion !== 1 ||
		record.artifact !== 'Invisible Weather exhibition' ||
		record.createdBy !== 'suvroghosh.in' ||
		typeof record.recipeHash !== 'string' ||
		!record.state ||
		!record.recipe
	) {
		return false;
	}
	const recipe = record.recipe as Record<string, unknown>;
	return (
		recipe.schemaVersion === 1 &&
		recipe.recipeHash === record.recipeHash &&
		Array.isArray(recipe.artworks) &&
		recipe.artworks.length >= 3 &&
		recipe.artworks.every(
			(artwork) =>
				Boolean(artwork) &&
				typeof artwork === 'object' &&
				typeof (artwork as Record<string, unknown>).seed === 'string' &&
				Number.isFinite((artwork as Record<string, unknown>).pathCount)
		)
	);
}
