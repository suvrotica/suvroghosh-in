import type { ColoringMode, PaletteStop } from '../types';
import { getPalette } from '../palettes';

export const MAX_PALETTE_STOPS = 8;

export interface RgbColor {
	r: number;
	g: number;
	b: number;
}

export interface PaletteUniforms {
	count: number;
	positions: Float32Array;
	colors: Float32Array;
	interior: RgbColor;
}

const FALLBACK_PALETTE: readonly PaletteStop[] = [
	{ position: 0, color: '#080b1a' },
	{ position: 0.18, color: '#263d8f' },
	{ position: 0.42, color: '#7c3aed' },
	{ position: 0.68, color: '#f59e0b' },
	{ position: 1, color: '#fff7d6' }
];

export const COLORING_MODE_IDS: Record<ColoringMode, number> = {
	binary: 0,
	bands: 1,
	smooth: 2,
	histogram: 3,
	distance: 4,
	'orbit-trap': 5,
	'root-basin': 6,
	density: 7
};

function clamp01(value: number) {
	return Math.min(1, Math.max(0, value));
}

export function parseCssColor(color: string, fallback: RgbColor = { r: 0, g: 0, b: 0 }): RgbColor {
	const source = color.trim();
	const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(source);
	if (short) {
		return {
			r: parseInt(short[1] + short[1], 16) / 255,
			g: parseInt(short[2] + short[2], 16) / 255,
			b: parseInt(short[3] + short[3], 16) / 255
		};
	}
	const long = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})(?:[\da-f]{2})?$/i.exec(source);
	if (long) {
		return {
			r: parseInt(long[1], 16) / 255,
			g: parseInt(long[2], 16) / 255,
			b: parseInt(long[3], 16) / 255
		};
	}
	const rgb = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i.exec(source);
	if (rgb) {
		return {
			r: clamp01(Number(rgb[1]) / 255),
			g: clamp01(Number(rgb[2]) / 255),
			b: clamp01(Number(rgb[3]) / 255)
		};
	}
	return fallback;
}

function normalizedStops(stops: readonly PaletteStop[]) {
	const selected = stops
		.filter(
			(stop) =>
				Number.isFinite(stop.position) &&
				typeof stop.color === 'string' &&
				stop.color.trim().length > 0
		)
		.slice(0, MAX_PALETTE_STOPS)
		.map((stop) => ({ position: clamp01(stop.position), color: stop.color }))
		.sort((a, b) => a.position - b.position);

	if (selected.length < 2) return [...FALLBACK_PALETTE];
	selected[0] = { ...selected[0], position: 0 };
	selected[selected.length - 1] = { ...selected[selected.length - 1], position: 1 };
	return selected;
}

export function paletteStops(paletteId: string, customPalette?: readonly PaletteStop[]) {
	return normalizedStops(
		customPalette?.length ? customPalette : (getPalette(paletteId).stops ?? FALLBACK_PALETTE)
	);
}

export function paletteUniforms(
	paletteId: string,
	customPalette: readonly PaletteStop[] | undefined,
	interiorColor: string
): PaletteUniforms {
	const stops = paletteStops(paletteId, customPalette);
	const positions = new Float32Array(MAX_PALETTE_STOPS);
	const colors = new Float32Array(MAX_PALETTE_STOPS * 3);
	const finalStop = stops[stops.length - 1];

	for (let index = 0; index < MAX_PALETTE_STOPS; index += 1) {
		const stop = stops[index] ?? finalStop;
		const color = parseCssColor(stop.color);
		positions[index] = stop.position;
		colors[index * 3] = color.r;
		colors[index * 3 + 1] = color.g;
		colors[index * 3 + 2] = color.b;
	}

	return {
		count: stops.length,
		positions,
		colors,
		interior: parseCssColor(interiorColor, { r: 0.015, g: 0.018, b: 0.035 })
	};
}

export function samplePalette(
	stops: readonly PaletteStop[],
	value: number,
	offset = 0,
	cycles = 1
): RgbColor {
	const normalized = normalizedStops(stops);
	const safeCycles = Number.isFinite(cycles) ? Math.max(0.05, Math.min(64, Math.abs(cycles))) : 1;
	const safeOffset = Number.isFinite(offset) ? offset : 0;
	const safeValue = Number.isFinite(value) ? value : 0;
	const wrapped = (((safeValue * safeCycles + safeOffset) % 1) + 1) % 1;
	let upperIndex = normalized.findIndex((stop) => wrapped <= stop.position);
	if (upperIndex <= 0) upperIndex = 1;
	const lower = normalized[upperIndex - 1];
	const upper = normalized[Math.min(upperIndex, normalized.length - 1)];
	const width = Math.max(1e-9, upper.position - lower.position);
	const amount = clamp01((wrapped - lower.position) / width);
	const a = parseCssColor(lower.color);
	const b = parseCssColor(upper.color);
	return {
		r: a.r + (b.r - a.r) * amount,
		g: a.g + (b.g - a.g) * amount,
		b: a.b + (b.b - a.b) * amount
	};
}

export function sampleCategoricalPalette(
	stops: readonly PaletteStop[],
	requestedIndex: number
): RgbColor {
	const normalized = normalizedStops(stops);
	const index = Number.isFinite(requestedIndex) ? Math.floor(requestedIndex) : 0;
	const wrapped = ((index % normalized.length) + normalized.length) % normalized.length;
	return parseCssColor(normalized[wrapped].color);
}
