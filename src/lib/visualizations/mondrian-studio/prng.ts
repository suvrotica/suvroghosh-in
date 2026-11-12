export type RandomDomain = 'layout' | 'color' | 'material' | 'timeline';

export interface SeededRandom {
	next(): number;
	range(min: number, max: number): number;
	int(minInclusive: number, maxInclusive: number): number;
	pick<T>(items: readonly T[]): T;
	chance(probability: number): boolean;
	fork(subKey: string | number): SeededRandom;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashSeedString(input: string): number {
	let h = FNV_OFFSET >>> 0;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, FNV_PRIME) >>> 0;
	}
	return avalanche32(h);
}

export function normalizeSeed(input: number | string | null | undefined, fallback = 100779): number {
	if (typeof input === 'number' && Number.isFinite(input)) {
		const normalized = (Math.abs(Math.trunc(input)) >>> 0) || fallback;
		return normalized;
	}
	if (typeof input === 'string') {
		const trimmed = input.trim();
		if (!trimmed) return fallback;
		if (/^\d{1,10}$/.test(trimmed)) {
			const parsed = Number.parseInt(trimmed, 10);
			if (Number.isFinite(parsed) && parsed > 0) {
				return (parsed >>> 0) || fallback;
			}
		}
		return hashSeedString(trimmed) || fallback;
	}
	return fallback;
}

export function avalanche32(x: number): number {
	let z = (x + 0x9e3779b9) >>> 0;
	z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
	z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
	return (z ^ (z >>> 16)) >>> 0;
}

export function createPrng(rawState: number): SeededRandom {
	let state = avalanche32(rawState >>> 0) || 0x6d2b79f5;

	const next = (): number => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

	return {
		next,
		range(min: number, max: number): number {
			return min + (max - min) * next();
		},
		int(minInclusive: number, maxInclusive: number): number {
			if (maxInclusive <= minInclusive) return minInclusive;
			return minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));
		},
		pick<T>(items: readonly T[]): T {
			if (items.length === 0) {
				throw new Error('Cannot pick from an empty array.');
			}
			return items[Math.floor(next() * items.length)]!;
		},
		chance(probability: number): boolean {
			return next() < probability;
		},
		fork(subKey: string | number): SeededRandom {
			const mixed = hashSeedString(`${state}:${String(subKey)}`);
			return createPrng(mixed);
		}
	};
}

/**
 * Derives an isolated PRNG stream for a subsystem so parameter changes in one
 * subsystem never consume random values needed by another subsystem.
 */
export function deriveStream(seed: number, domain: RandomDomain, subKey?: string | number): SeededRandom {
	const normalized = normalizeSeed(seed);
	const key = subKey !== undefined ? `v1:${normalized}:${domain}:${subKey}` : `v1:${normalized}:${domain}`;
	return createPrng(hashSeedString(key));
}
