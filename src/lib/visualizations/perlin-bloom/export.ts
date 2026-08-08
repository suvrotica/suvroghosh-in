import { normalizeFlowerConfig } from './config';
import type { BloomExportPlan, ExportFormat, FlowerConfig } from './types';

export const MAX_EXPORT_EDGE = 8_192;
export const MAX_EXPORT_PIXELS = 24_000_000;
export const MAX_EXPORT_BYTES = 256 * 1_024 * 1_024;
export const EXPORT_BYTES_PER_PIXEL = 4;
// Target + background/instrument/body/light/particles + reduced glow + encoder/headroom.
export const EXPORT_WORKING_BUFFERS = 8;
export const MIN_EXPORT_SCALE = 0.25;
export const MAX_EXPORT_SCALE = 4;

const MAX_SOURCE_DIMENSION = 1_000_000;
const WINDOWS_RESERVED_STEM = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

export function sanitizeFilename(value: string, fallback = 'perlin-bloom.png'): string {
	const cleaned = String(value)
		.normalize('NFKD')
		.replace(/\p{M}+/gu, '')
		.replace(/[<>:"/\\|?*]/gu, '-')
		.replace(/\p{Cc}+/gu, '-')
		.replace(/\s+/gu, '-')
		.replace(/\.{2,}/gu, '.')
		.replace(/^[.\s-]+|[.\s-]+$/gu, '')
		.replace(/-+/gu, '-')
		.slice(0, 120);
	return !cleaned || WINDOWS_RESERVED_STEM.test(cleaned) ? fallback : cleaned;
}

function slug(value: string, fallback: string): string {
	const result = value
		.normalize('NFKD')
		.replace(/\p{M}+/gu, '')
		.toLocaleLowerCase('en')
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
		.slice(0, 48);
	return result || fallback;
}

export function perlinBloomFilename(
	input: Readonly<FlowerConfig>,
	format: ExportFormat = 'png'
): string {
	const config = normalizeFlowerConfig(input);
	return sanitizeFilename(
		`perlin-bloom-${slug(config.preset, 'specimen')}-${slug(config.seed, 'seed')}.${format}`,
		`perlin-bloom-${slug(config.preset, 'specimen')}.${format}`
	);
}

export const exportFilename = perlinBloomFilename;

function sourceDimension(value: number, fallback: number): number {
	if (!Number.isFinite(value) || value <= 0) return fallback;
	return Math.max(1, Math.min(MAX_SOURCE_DIMENSION, Math.round(value)));
}

export function estimateExportBytes(
	width: number,
	height: number,
	workingBuffers = EXPORT_WORKING_BUFFERS
): number {
	const buffers = Number.isFinite(workingBuffers)
		? Math.max(1, Math.min(16, Math.ceil(workingBuffers)))
		: EXPORT_WORKING_BUFFERS;
	return Math.ceil(Math.max(0, width) * Math.max(0, height) * EXPORT_BYTES_PER_PIXEL * buffers);
}

export function boundedExportDimensions(
	width: number,
	height: number,
	scale = 1
): Omit<BloomExportPlan, 'format' | 'filename' | 'includeSignature'> {
	const baseWidth = sourceDimension(width, 1_200);
	const baseHeight = sourceDimension(height, 750);
	const rawScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
	const requestedScale = Math.max(MIN_EXPORT_SCALE, Math.min(MAX_EXPORT_SCALE, rawScale));
	let safeScale = requestedScale;
	const reasons: string[] = [];
	if (requestedScale !== rawScale) reasons.push('requested-scale');

	const longestEdge = Math.max(baseWidth, baseHeight) * safeScale;
	if (longestEdge > MAX_EXPORT_EDGE) {
		safeScale *= MAX_EXPORT_EDGE / longestEdge;
		reasons.push('longest-edge');
	}

	let outputWidth = Math.max(1, Math.floor(baseWidth * safeScale));
	let outputHeight = Math.max(1, Math.floor(baseHeight * safeScale));
	let pixelCount = outputWidth * outputHeight;
	if (pixelCount > MAX_EXPORT_PIXELS) {
		const reduction = Math.sqrt(MAX_EXPORT_PIXELS / pixelCount);
		safeScale *= reduction;
		outputWidth = Math.max(1, Math.floor(baseWidth * safeScale));
		outputHeight = Math.max(1, Math.floor(baseHeight * safeScale));
		pixelCount = outputWidth * outputHeight;
		reasons.push('pixel-budget');
	}

	let estimatedBytes = estimateExportBytes(outputWidth, outputHeight);
	if (estimatedBytes > MAX_EXPORT_BYTES) {
		// A small cushion absorbs integer dimension rounding at the allocation boundary.
		const reduction = Math.sqrt(MAX_EXPORT_BYTES / estimatedBytes) * 0.999;
		safeScale *= reduction;
		outputWidth = Math.max(1, Math.floor(baseWidth * safeScale));
		outputHeight = Math.max(1, Math.floor(baseHeight * safeScale));
		pixelCount = outputWidth * outputHeight;
		estimatedBytes = estimateExportBytes(outputWidth, outputHeight);
		reasons.push('memory-budget');
	}

	return {
		width: outputWidth,
		height: outputHeight,
		requestedScale,
		scale: safeScale,
		pixelCount,
		estimatedBytes,
		wasCapped: reasons.length > 0,
		reasons
	};
}

function filenameWithPngExtension(value: string, fallback: string): string {
	const candidate = sanitizeFilename(value, fallback);
	return candidate.toLocaleLowerCase('en').endsWith('.png') ? candidate : `${candidate}.png`;
}

export function createExportPlan(
	input: Readonly<FlowerConfig>,
	options: Readonly<{
		width?: number;
		height?: number;
		scale?: number;
		format?: ExportFormat;
		includeSignature?: boolean;
		filename?: string;
	}> = {}
): BloomExportPlan {
	const config = normalizeFlowerConfig(input);
	const format = options.format ?? 'png';
	const fallbackFilename = perlinBloomFilename(config, format);
	const filename = options.filename
		? filenameWithPngExtension(options.filename, fallbackFilename)
		: fallbackFilename;
	return {
		format,
		filename,
		includeSignature: options.includeSignature ?? false,
		...boundedExportDimensions(options.width ?? 1_200, options.height ?? 750, options.scale ?? 1)
	};
}

export const planExportSize = boundedExportDimensions;
