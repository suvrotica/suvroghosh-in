import { CURATED_DEFAULT_SEED, type PrngStreamName } from './types.ts';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const STREAM_SALTS: Readonly<Record<PrngStreamName, number>> = {
	composition: 0x243f6a88,
	pigment: 0x85a308d3,
	edges: 0x13198a2e,
	surface: 0x03707344,
	timeline: 0xa4093822
} as const;

export function fnv1aString(input: string, basis = FNV_OFFSET_BASIS): number {
	let h = basis >>> 0;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, FNV_PRIME) >>> 0;
	}
	return h >>> 0;
}

export function mix32(x: number): number {
	let z = x >>> 0;
	z ^= z >>> 16;
	z = Math.imul(z, 0x7feb352d) >>> 0;
	z ^= z >>> 15;
	z = Math.imul(z, 0x846ca68b) >>> 0;
	z ^= z >>> 16;
	return z >>> 0;
}

export function normalizeSeed(input: unknown, fallback = CURATED_DEFAULT_SEED): number {
	if (typeof input === 'number' && Number.isFinite(input)) {
		const n = Math.abs(Math.trunc(input));
		if (n === 0) return fallback;
		return ((n - 1) % 999_999_999) + 1;
	}
	if (typeof input === 'string') {
		const trimmed = input.trim();
		if (!trimmed) return fallback;
		if (/^-?\d+$/.test(trimmed)) {
			const parsed = Math.abs(Number.parseInt(trimmed, 10));
			if (Number.isFinite(parsed) && parsed > 0) {
				return ((parsed - 1) % 999_999_999) + 1;
			}
			return fallback;
		}
		return (fnv1aString(trimmed) % 999_999_999) + 1;
	}
	return fallback;
}

export function createNextSeed(currentSeed: number, step = 1): number {
	const base = normalizeSeed(currentSeed);
	const safeStep = Number.isFinite(step) ? Math.max(1, Math.trunc(Math.abs(step))) : 1;
	const mixed = mix32((base ^ Math.imul(safeStep + 1, 0x9e3779b9)) >>> 0);
	let candidate = (mixed % 899_999) + 100_000;
	if (candidate === base) {
		candidate = ((candidate - 100_000 + 15485863) % 899_999) + 100_000;
	}
	return candidate;
}

export interface SeededRng {
	next(): number;
	nextUint32(): number;
	range(min: number, max: number): number;
	int(minInclusive: number, maxInclusive: number): number;
	pick<T>(items: readonly T[]): T;
	chance(probability: number): boolean;
	signed(): number;
}

export function createStreamRng(seed: number, stream: PrngStreamName, substream = 0): SeededRng {
	const normalized = normalizeSeed(seed);
	let state = mix32(
		(normalized ^ STREAM_SALTS[stream] ^ Math.imul((substream + 1) >>> 0, 0x9e3779b1)) >>> 0
	);
	if (state === 0) state = 0x6d2b79f5;

	function nextUint32(): number {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
		t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
		return (t ^ (t >>> 14)) >>> 0;
	}

	function next(): number {
		return nextUint32() / 4294967296;
	}

	return {
		next,
		nextUint32,
		range(min: number, max: number): number {
			return min + (max - min) * next();
		},
		int(minInclusive: number, maxInclusive: number): number {
			if (maxInclusive <= minInclusive) return minInclusive;
			return minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));
		},
		pick<T>(items: readonly T[]): T {
			if (items.length === 0) {
				throw new Error('SeededRng.pick called with an empty array.');
			}
			return items[Math.floor(next() * items.length)]!;
		},
		chance(probability: number): boolean {
			return next() < probability;
		},
		signed(): number {
			return next() * 2 - 1;
		}
	};
}

export function hashRegionUnit(
	seed: number,
	stream: PrngStreamName,
	regionIndex: number,
	channel = 0
): number {
	const normalized = normalizeSeed(seed);
	const a = (normalized ^ STREAM_SALTS[stream]) >>> 0;
	const b = Math.imul((regionIndex + 1) >>> 0, 0x85ebca6b) >>> 0;
	const c = Math.imul((channel + 1) >>> 0, 0xc2b2ae35) >>> 0;
	return mix32((a ^ b ^ c) >>> 0) / 4294967296;
}

export function hashRegionSigned(
	seed: number,
	stream: PrngStreamName,
	regionIndex: number,
	channel = 0
): number {
	return hashRegionUnit(seed, stream, regionIndex, channel) * 2 - 1;
}

export function hashPassUnit(
	seed: number,
	stream: PrngStreamName,
	passIndex: number,
	channel = 0
): number {
	return hashRegionUnit(seed, stream, passIndex, channel);
}

export function hashPassSigned(
	seed: number,
	stream: PrngStreamName,
	passIndex: number,
	channel = 0
): number {
	return hashPassUnit(seed, stream, passIndex, channel) * 2 - 1;
}

/**
 * Fast inner quintic noise taking pre-normalized seed and numeric stream salt.
 */
export function smoothNoise2DFast(
	normalizedSeed: number,
	streamSalt: number,
	x: number,
	y: number,
	channel = 0
): number {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const xf = x - xi;
	const yf = y - yi;
	const u = xf * xf * xf * (xf * (6 * xf - 15) + 10);
	const v = yf * yf * yf * (yf * (6 * yf - 15) + 10);

	const base = (normalizedSeed ^ streamSalt ^ Math.imul((channel + 7) >>> 0, 0x9e3779b9)) >>> 0;
	const x0 = Math.imul(xi, 0x27d4eb2d) >>> 0;
	const x1 = Math.imul(xi + 1, 0x27d4eb2d) >>> 0;
	const y0 = Math.imul(yi, 0x165667b1) >>> 0;
	const y1 = Math.imul(yi + 1, 0x165667b1) >>> 0;

	let z00 = (base ^ x0 ^ y0) >>> 0;
	z00 ^= z00 >>> 16;
	z00 = Math.imul(z00, 0x7feb352d) >>> 0;
	z00 ^= z00 >>> 15;
	z00 = Math.imul(z00, 0x846ca68b) >>> 0;
	z00 ^= z00 >>> 16;

	let z10 = (base ^ x1 ^ y0) >>> 0;
	z10 ^= z10 >>> 16;
	z10 = Math.imul(z10, 0x7feb352d) >>> 0;
	z10 ^= z10 >>> 15;
	z10 = Math.imul(z10, 0x846ca68b) >>> 0;
	z10 ^= z10 >>> 16;

	let z01 = (base ^ x0 ^ y1) >>> 0;
	z01 ^= z01 >>> 16;
	z01 = Math.imul(z01, 0x7feb352d) >>> 0;
	z01 ^= z01 >>> 15;
	z01 = Math.imul(z01, 0x846ca68b) >>> 0;
	z01 ^= z01 >>> 16;

	let z11 = (base ^ x1 ^ y1) >>> 0;
	z11 ^= z11 >>> 16;
	z11 = Math.imul(z11, 0x7feb352d) >>> 0;
	z11 ^= z11 >>> 15;
	z11 = Math.imul(z11, 0x846ca68b) >>> 0;
	z11 ^= z11 >>> 16;

	const inv = 1 / 4294967296;
	const n00 = (z00 >>> 0) * inv;
	const n10 = (z10 >>> 0) * inv;
	const n01 = (z01 >>> 0) * inv;
	const n11 = (z11 >>> 0) * inv;

	const nx0 = n00 + (n10 - n00) * u;
	const nx1 = n01 + (n11 - n01) * u;
	return nx0 + (nx1 - nx0) * v;
}

/**
 * C^2-continuous quintic Hermite 2D value noise bounded in [0, 1).
 */
export function smoothNoise2D(
	seed: number,
	x: number,
	y: number,
	channel = 0,
	stream: PrngStreamName = 'surface'
): number {
	const normalized = normalizeSeed(seed);
	const streamSalt = STREAM_SALTS[stream];
	return smoothNoise2DFast(normalized, streamSalt, x, y, channel);
}

/**
 * Normalized multi-octave quintic FBM bounded in [0, 1).
 */
export function fbm2D(
	seed: number,
	x: number,
	y: number,
	octaves = 3,
	lacunarity = 2.05,
	gain = 0.48,
	channel = 0,
	stream: PrngStreamName = 'edges'
): number {
	const normalized = normalizeSeed(seed);
	const streamSalt = STREAM_SALTS[stream];
	const count = Math.max(1, Math.min(6, Math.trunc(octaves)));
	let freq = 1;
	let amp = 1;
	let sum = 0;
	let norm = 0;
	for (let k = 0; k < count; k++) {
		sum += amp * smoothNoise2DFast(normalized, streamSalt, x * freq, y * freq, channel + k * 31);
		norm += amp;
		freq *= lacunarity;
		amp *= gain;
	}
	return norm > 0 ? sum / norm : 0.5;
}
