export type PrngState = readonly [number, number, number, number];

function rotateLeft(value: number, bits: number): number {
	return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function splitMix32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x9e3779b9) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
		value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
		return (value ^ (value >>> 15)) >>> 0;
	};
}

/** Stable FNV-1a seed conversion; it deliberately does not depend on locale or runtime APIs. */
export function normalizeSeed(seed: number | string): number {
	if (typeof seed === 'number') {
		if (!Number.isFinite(seed)) return 0;
		return Math.trunc(seed) >>> 0;
	}
	let hash = 0x811c9dc5;
	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/**
 * Small deterministic xoshiro128** generator.
 * The algorithm and seed expansion are part of the engine contract; changing either
 * requires an engine-version change so saved recipes continue to reproduce arrays.
 */
export class SeededRandom {
	readonly seed: number;
	private state: [number, number, number, number];
	private spareNormal: number | undefined;

	constructor(seed: number | string, state?: PrngState) {
		this.seed = normalizeSeed(seed);
		if (state) {
			this.state = [state[0] >>> 0, state[1] >>> 0, state[2] >>> 0, state[3] >>> 0];
		} else {
			const expand = splitMix32(this.seed);
			this.state = [expand(), expand(), expand(), expand()];
			if (this.state.every((value) => value === 0)) this.state[0] = 1;
		}
	}

	nextUint32(): number {
		const [s0, s1, s2, s3] = this.state;
		const result = Math.imul(rotateLeft(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
		const shifted = (s1 << 9) >>> 0;
		let n2 = (s2 ^ s0) >>> 0;
		let n3 = (s3 ^ s1) >>> 0;
		const n1 = (s1 ^ n2) >>> 0;
		const n0 = (s0 ^ n3) >>> 0;
		n2 = (n2 ^ shifted) >>> 0;
		n3 = rotateLeft(n3, 11);
		this.state = [n0, n1, n2, n3];
		return result;
	}

	/** A value in [0, 1), with exactly 32 deterministic random bits. */
	next(): number {
		return this.nextUint32() / 0x1_0000_0000;
	}

	range(min: number, max: number): number {
		return min + (max - min) * this.next();
	}

	integer(minInclusive: number, maxExclusive: number): number {
		const min = Math.ceil(minInclusive);
		const max = Math.floor(maxExclusive);
		const span = max - min;
		if (
			!Number.isSafeInteger(min) ||
			!Number.isSafeInteger(max) ||
			span <= 0 ||
			span > 0x1_0000_0000
		) {
			throw new RangeError('integer() requires a positive range no wider than 2^32.');
		}
		const limit = Math.floor(0x1_0000_0000 / span) * span;
		let value: number;
		do value = this.nextUint32();
		while (value >= limit);
		return min + (value % span);
	}

	chance(probability = 0.5): boolean {
		return this.next() < Math.min(1, Math.max(0, probability));
	}

	normal(mean = 0, standardDeviation = 1): number {
		if (this.spareNormal !== undefined) {
			const value = this.spareNormal;
			this.spareNormal = undefined;
			return mean + standardDeviation * value;
		}
		let x: number;
		let y: number;
		let radiusSquared: number;
		do {
			x = this.range(-1, 1);
			y = this.range(-1, 1);
			radiusSquared = x * x + y * y;
		} while (radiusSquared === 0 || radiusSquared >= 1);
		const factor = Math.sqrt((-2 * Math.log(radiusSquared)) / radiusSquared);
		this.spareNormal = y * factor;
		return mean + standardDeviation * x * factor;
	}

	choice<T>(values: readonly T[]): T {
		if (values.length === 0) throw new RangeError('Cannot choose from an empty array.');
		return values[this.integer(0, values.length)];
	}

	shuffle<T>(values: readonly T[]): T[] {
		const result = [...values];
		for (let index = result.length - 1; index > 0; index -= 1) {
			const swapIndex = this.integer(0, index + 1);
			[result[index], result[swapIndex]] = [result[swapIndex], result[index]];
		}
		return result;
	}

	snapshot(): PrngState {
		return [...this.state] as PrngState;
	}

	fork(label: number | string): SeededRandom {
		return new SeededRandom((this.seed ^ normalizeSeed(label)) >>> 0);
	}
}

export function createSeededRandom(seed: number | string): SeededRandom {
	return new SeededRandom(seed);
}

export function deterministicSequence(seed: number | string, count: number): Float64Array {
	const generator = new SeededRandom(seed);
	const result = new Float64Array(Math.max(0, Math.floor(count)));
	for (let index = 0; index < result.length; index += 1) result[index] = generator.next();
	return result;
}
