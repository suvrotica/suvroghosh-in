import { CURATED_DEFAULT_SEED, type PrngStreamName } from './types.ts';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const STREAM_SALTS: Readonly<Record<PrngStreamName, number>> = {
	paths: 0x243f6a88,
	layers: 0x85a308d3,
	flow: 0x13198a2e,
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
		if (/^\d+$/.test(trimmed)) {
			const parsed = Number.parseInt(trimmed, 10);
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
	const s = Math.max(1, Math.trunc(Math.abs(step)));
	const mixed = mix32((base ^ Math.imul(s + 1, 0x9e3779b9)) >>> 0);
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
		(normalized ^ STREAM_SALTS[stream] ^ Math.imul(substream + 1, 0x9e3779b1)) >>> 0
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

export function hashPassUnit(
	seed: number,
	stream: PrngStreamName,
	passIndex: number,
	channel = 0
): number {
	const normalized = normalizeSeed(seed);
	const a = (normalized ^ STREAM_SALTS[stream]) >>> 0;
	const b = Math.imul((passIndex + 1) >>> 0, 0x85ebca6b) >>> 0;
	const c = Math.imul((channel + 1) >>> 0, 0xc2b2ae35) >>> 0;
	return mix32((a ^ b ^ c) >>> 0) / 4294967296;
}

export function hashPassSigned(
	seed: number,
	stream: PrngStreamName,
	passIndex: number,
	channel = 0
): number {
	return hashPassUnit(seed, stream, passIndex, channel) * 2 - 1;
}

export function hashMarkUnit(
	seed: number,
	stream: PrngStreamName,
	passIndex: number,
	itemIndex: number,
	channel = 0
): number {
	const normalized = normalizeSeed(seed);
	const a = (normalized ^ STREAM_SALTS[stream]) >>> 0;
	const b = Math.imul((passIndex + 1) >>> 0, 0x85ebca6b) >>> 0;
	const c = Math.imul((itemIndex + 1) >>> 0, 0xc2b2ae35) >>> 0;
	const d = Math.imul((channel + 1) >>> 0, 0x27d4eb2d) >>> 0;
	return mix32((a ^ b ^ c ^ d) >>> 0) / 4294967296;
}

export function hashMarkSigned(
	seed: number,
	stream: PrngStreamName,
	passIndex: number,
	itemIndex: number,
	channel = 0
): number {
	return hashMarkUnit(seed, stream, passIndex, itemIndex, channel) * 2 - 1;
}

export function smoothNoise2D(
	seed: number,
	x: number,
	y: number,
	channel = 0,
	stream: PrngStreamName = 'surface'
): number {
	const normalized = normalizeSeed(seed);
	const streamSalt = STREAM_SALTS[stream];
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const xf = x - xi;
	const yf = y - yi;
	const u = xf * xf * (3 - 2 * xf);
	const v = yf * yf * (3 - 2 * yf);

	const corner = (cx: number, cy: number): number => {
		const h = mix32(
			(normalized ^
				streamSalt ^
				Math.imul(cx, 0x27d4eb2d) ^
				Math.imul(cy, 0x165667b1) ^
				Math.imul(channel + 7, 0x9e3779b9)) >>>
				0
		);
		return h / 4294967296;
	};

	const n00 = corner(xi, yi);
	const n10 = corner(xi + 1, yi);
	const n01 = corner(xi, yi + 1);
	const n11 = corner(xi + 1, yi + 1);

	const nx0 = n00 + (n10 - n00) * u;
	const nx1 = n01 + (n11 - n01) * u;
	return nx0 + (nx1 - nx0) * v;
}
