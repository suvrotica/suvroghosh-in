import type { ComplexValue, OrbitTrapState, PaletteDefinition, PaletteStop } from './types';

export const MIN_PALETTE_STOPS = 2;
export const MAX_PALETTE_STOPS = 8;

export const PALETTE_REGISTRY = [
	{
		id: 'observatory',
		label: 'Observatory',
		interpolation: 'srgb',
		stops: [
			{ position: 0, color: '#090B12' },
			{ position: 0.28, color: '#19345B' },
			{ position: 0.58, color: '#2E7C8A' },
			{ position: 0.82, color: '#C7B36A' },
			{ position: 1, color: '#F3E8C8' }
		]
	},
	{
		id: 'monsoon-ink',
		label: 'Monsoon Ink',
		interpolation: 'srgb',
		stops: [
			{ position: 0, color: '#081217' },
			{ position: 0.34, color: '#12394B' },
			{ position: 0.68, color: '#3B6B73' },
			{ position: 1, color: '#B8C6B3' }
		]
	},
	{
		id: 'tram-brass',
		label: 'Tram Brass',
		interpolation: 'srgb',
		stops: [
			{ position: 0, color: '#17120C' },
			{ position: 0.35, color: '#60462C' },
			{ position: 0.7, color: '#B1843E' },
			{ position: 1, color: '#F0D895' }
		]
	},
	{
		id: 'ember-field',
		label: 'Ember Field',
		interpolation: 'srgb',
		stops: [
			{ position: 0, color: '#100A0D' },
			{ position: 0.32, color: '#4B1724' },
			{ position: 0.67, color: '#B5442E' },
			{ position: 1, color: '#F2C26B' }
		]
	},
	{
		id: 'ultraviolet-glass',
		label: 'Ultraviolet Glass',
		interpolation: 'srgb',
		stops: [
			{ position: 0, color: '#090713' },
			{ position: 0.27, color: '#2B1D55' },
			{ position: 0.58, color: '#6048A1' },
			{ position: 0.82, color: '#4DA0A8' },
			{ position: 1, color: '#D8E8D7' }
		]
	},
	{
		id: 'bone-and-soot',
		label: 'Bone and Soot',
		interpolation: 'srgb',
		stops: [
			{ position: 0, color: '#080808' },
			{ position: 0.45, color: '#494641' },
			{ position: 1, color: '#EFE6D2' }
		]
	},
	{
		id: 'algae',
		label: 'Algae',
		interpolation: 'srgb',
		stops: [
			{ position: 0, color: '#07100B' },
			{ position: 0.35, color: '#17462D' },
			{ position: 0.72, color: '#5B8B42' },
			{ position: 1, color: '#D2D58B' }
		]
	},
	{
		id: 'printers-proof',
		label: 'Printer’s Proof',
		interpolation: 'srgb',
		stops: [
			{ position: 0, color: '#101010' },
			{ position: 0.48, color: '#55514A' },
			{ position: 0.52, color: '#D8CDB8' },
			{ position: 1, color: '#FAF6EA' }
		]
	},
	{
		id: 'categorical-roots',
		label: 'Colour-blind-friendly roots',
		interpolation: 'srgb',
		categorical: true,
		stops: [
			{ position: 0, color: '#0072B2' },
			{ position: 0.2, color: '#E69F00' },
			{ position: 0.4, color: '#009E73' },
			{ position: 0.6, color: '#CC79A7' },
			{ position: 0.8, color: '#56B4E9' },
			{ position: 1, color: '#D55E00' }
		]
	}
] as const satisfies readonly PaletteDefinition[];

export const PALETTE_BY_ID: Readonly<Record<string, PaletteDefinition>> = Object.freeze(
	Object.fromEntries(PALETTE_REGISTRY.map((palette) => [palette.id, palette]))
);

const PALETTE_IDS: ReadonlySet<string> = new Set<string>(
	PALETTE_REGISTRY.map((palette) => palette.id)
);

export interface PaletteValidationResult {
	stops: PaletteStop[];
	issues: string[];
}

export function isPaletteId(value: unknown): value is string {
	return typeof value === 'string' && PALETTE_IDS.has(value);
}

export function getPalette(id: string): PaletteDefinition {
	return PALETTE_BY_ID[id] ?? PALETTE_BY_ID.observatory;
}

export function isHexColor(value: unknown): value is string {
	return typeof value === 'string' && /^#[\da-f]{6}$/iu.test(value);
}

export function normalizeHexColor(value: unknown, fallback = '#000000'): string {
	if (typeof value !== 'string') return fallback;
	const trimmed = value.trim();
	const short = /^#([\da-f])([\da-f])([\da-f])$/iu.exec(trimmed);
	if (short)
		return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
	return isHexColor(trimmed) ? trimmed.toUpperCase() : fallback;
}

export function validatePaletteStops(
	value: unknown,
	fallback: readonly PaletteStop[] = getPalette('observatory').stops
): PaletteValidationResult {
	const issues: string[] = [];
	if (!Array.isArray(value)) {
		return {
			stops: fallback.map((stop) => ({ ...stop })),
			issues: ['Palette stops must be an array.']
		};
	}

	if (value.length < MIN_PALETTE_STOPS || value.length > MAX_PALETTE_STOPS) {
		issues.push(`A palette must contain ${MIN_PALETTE_STOPS}–${MAX_PALETTE_STOPS} stops.`);
	}
	const bounded = value.slice(0, MAX_PALETTE_STOPS);
	const stops: PaletteStop[] = [];
	for (let index = 0; index < bounded.length; index += 1) {
		const candidate = bounded[index];
		if (!isRecord(candidate)) {
			issues.push(`Palette stop ${index + 1} is not an object.`);
			continue;
		}
		const position = Number(candidate.position);
		if (!Number.isFinite(position)) {
			issues.push(`Palette stop ${index + 1} has a non-finite position.`);
			continue;
		}
		if (!isHexColor(candidate.color)) {
			issues.push(`Palette stop ${index + 1} has an invalid six-digit hex colour.`);
			continue;
		}
		stops.push({
			position: clamp(position, 0, 1),
			color: normalizeHexColor(candidate.color)
		});
	}

	stops.sort((left, right) => left.position - right.position);
	if (stops.length < MIN_PALETTE_STOPS) {
		issues.push('Too few valid palette stops remained; the fallback palette was restored.');
		return { stops: fallback.map((stop) => ({ ...stop })), issues };
	}
	if (stops[0].position !== 0) stops[0] = { ...stops[0], position: 0 };
	if (stops.at(-1)?.position !== 1) {
		stops[stops.length - 1] = { ...stops[stops.length - 1], position: 1 };
	}
	return { stops, issues };
}

export function samplePalette(
	palette: string | PaletteDefinition | readonly PaletteStop[],
	value: number,
	options: { offset?: number; cycles?: number; reverse?: boolean } = {}
): string {
	const stops =
		typeof palette === 'string'
			? getPalette(palette).stops
			: isPaletteDefinition(palette)
				? palette.stops
				: validatePaletteStops(palette).stops;
	const offset = finiteOr(options.offset, 0);
	const cycles = clamp(finiteOr(options.cycles, 1), 0.05, 128);
	let normalized = wrapUnit(finiteOr(value, 0) * cycles + offset);
	if (options.reverse) normalized = 1 - normalized;
	return interpolateStops(stops, normalized);
}

export function categoricalRootColor(
	rootIndex: number,
	rootCount: number,
	convergence: number,
	paletteId = 'categorical-roots'
): string {
	const stops = getPalette(paletteId).stops;
	const safeCount = Math.max(1, Math.floor(finiteOr(rootCount, 1)));
	const index = modulo(Math.floor(finiteOr(rootIndex, 0)), safeCount);
	const base = hexToRgb(stops[index % stops.length].color);
	const intensity = clamp(finiteOr(convergence, 1), 0, 1);
	/* Keep slow convergence legible instead of fading all the way to black. */
	const scale = 0.3 + intensity * 0.7;
	return rgbToHex({
		r: base.r * scale,
		g: base.g * scale,
		b: base.b * scale
	});
}

export function toneMapDensity(
	count: number,
	maximumCount: number,
	exposure = 1,
	gamma = 1
): number {
	const safeCount = Math.max(0, finiteOr(count, 0));
	const safeMaximum = Math.max(1, finiteOr(maximumCount, 1));
	const safeExposure = clamp(finiteOr(exposure, 1), 0, 64);
	const safeGamma = clamp(finiteOr(gamma, 1), 0.05, 8);
	const exposed = 1 - Math.exp(-(safeCount / safeMaximum) * safeExposure);
	const mapped = exposed ** (1 / safeGamma);
	return Number.isFinite(mapped) ? clamp(mapped, 0, 1) : 0;
}

export function orbitTrapDistance(value: ComplexValue, trap: OrbitTrapState): number {
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		return Number.POSITIVE_INFINITY;
	}
	const deltaRe = value.re - finiteOr(trap.position.re, 0);
	const deltaIm = value.im - finiteOr(trap.position.im, 0);
	const cosine = Math.cos(-finiteOr(trap.rotation, 0));
	const sine = Math.sin(-finiteOr(trap.rotation, 0));
	const x = deltaRe * cosine - deltaIm * sine;
	const y = deltaRe * sine + deltaIm * cosine;

	switch (trap.kind) {
		case 'point':
			return Math.hypot(x, y);
		case 'line':
			return Math.abs(y);
		case 'circle':
			return Math.abs(Math.hypot(x, y) - Math.max(0, finiteOr(trap.radius, 0)));
		case 'cross':
			return Math.min(Math.abs(x), Math.abs(y));
		case 'grid': {
			const spacing = Math.max(Number.EPSILON, Math.abs(finiteOr(trap.spacing, 1)));
			const distanceX = Math.abs(x - Math.round(x / spacing) * spacing);
			const distanceY = Math.abs(y - Math.round(y / spacing) * spacing);
			return Math.min(distanceX, distanceY);
		}
	}
}

export function wrapUnit(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return ((value % 1) + 1) % 1;
}

function interpolateStops(stops: readonly PaletteStop[], value: number): string {
	const safeStops = stops.length >= 2 ? stops : getPalette('observatory').stops;
	if (value <= safeStops[0].position) return normalizeHexColor(safeStops[0].color);
	for (let index = 1; index < safeStops.length; index += 1) {
		const right = safeStops[index];
		if (value > right.position) continue;
		const left = safeStops[index - 1];
		const width = right.position - left.position;
		const amount = width <= Number.EPSILON ? 1 : clamp((value - left.position) / width, 0, 1);
		const leftRgb = hexToRgb(left.color);
		const rightRgb = hexToRgb(right.color);
		return rgbToHex({
			r: leftRgb.r + (rightRgb.r - leftRgb.r) * amount,
			g: leftRgb.g + (rightRgb.g - leftRgb.g) * amount,
			b: leftRgb.b + (rightRgb.b - leftRgb.b) * amount
		});
	}
	return normalizeHexColor(safeStops.at(-1)?.color, '#000000');
}

function hexToRgb(value: string): { r: number; g: number; b: number } {
	const normalized = normalizeHexColor(value);
	return {
		r: Number.parseInt(normalized.slice(1, 3), 16),
		g: Number.parseInt(normalized.slice(3, 5), 16),
		b: Number.parseInt(normalized.slice(5, 7), 16)
	};
}

function rgbToHex(value: { r: number; g: number; b: number }): string {
	const channel = (component: number) =>
		Math.round(clamp(finiteOr(component, 0), 0, 255))
			.toString(16)
			.padStart(2, '0')
			.toUpperCase();
	return `#${channel(value.r)}${channel(value.g)}${channel(value.b)}`;
}

function finiteOr(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function modulo(value: number, divisor: number): number {
	return ((value % divisor) + divisor) % divisor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPaletteDefinition(
	value: PaletteDefinition | readonly PaletteStop[]
): value is PaletteDefinition {
	return !Array.isArray(value) && 'stops' in value;
}
