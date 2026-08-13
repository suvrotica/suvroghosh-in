import { MAX_SEED_LENGTH } from './constants';
import type { EntryDistribution, RandomMatrixState } from './types';

const UINT32_RANGE = 0x1_0000_0000;

function rotateLeft(value: number, shift: number): number {
	return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

export function hashString32(value: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
	hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
	return (hash ^ (hash >>> 16)) >>> 0;
}

function seedWords(seed: string): [number, number, number, number] {
	let word = hashString32(seed);
	const output: [number, number, number, number] = [0, 0, 0, 0];
	for (let index = 0; index < output.length; index += 1) {
		word = (word + 0x9e3779b9) >>> 0;
		let mixed = word;
		mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad);
		mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
		output[index] = (mixed ^ (mixed >>> 15)) >>> 0;
	}
	if (output.every((entry) => entry === 0)) output[0] = 1;
	return output;
}

/** Deterministic xoshiro128** stream with a cached Box–Muller Gaussian. */
export class MatrixRandom {
	private readonly state: [number, number, number, number];
	private spareGaussian: number | null = null;

	constructor(readonly seed: string) {
		this.state = seedWords(seed);
	}

	nextUint32(): number {
		const state = this.state;
		const result = Math.imul(rotateLeft(Math.imul(state[1], 5), 7), 9) >>> 0;
		const temporary = (state[1] << 9) >>> 0;
		state[2] ^= state[0];
		state[3] ^= state[1];
		state[1] ^= state[2];
		state[0] ^= state[3];
		state[2] ^= temporary;
		state[3] = rotateLeft(state[3], 11);
		return result;
	}

	next(): number {
		return this.nextUint32() / UINT32_RANGE;
	}

	integer(minimum: number, maximum: number): number {
		const low = Math.ceil(minimum);
		const high = Math.floor(maximum);
		if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) {
			throw new RangeError('Random integer bounds must contain at least one integer.');
		}
		return low + Math.floor(this.next() * (high - low + 1));
	}

	gaussian(): number {
		if (this.spareGaussian !== null) {
			const spare = this.spareGaussian;
			this.spareGaussian = null;
			return spare;
		}
		let first = this.next();
		while (first <= Number.EPSILON) first = this.next();
		const second = this.next();
		const radius = Math.sqrt(-2 * Math.log(first));
		const angle = 2 * Math.PI * second;
		this.spareGaussian = radius * Math.sin(angle);
		return radius * Math.cos(angle);
	}

	standardized(distribution: EntryDistribution): number {
		switch (distribution) {
			case 'gaussian':
				return this.gaussian();
			case 'uniform':
				return (this.next() * 2 - 1) * Math.sqrt(3);
			case 'rademacher':
				return this.next() < 0.5 ? -1 : 1;
		}
	}

	shuffleInPlace<Value extends ArrayLike<unknown> & { [index: number]: unknown }>(
		values: Value
	): Value {
		for (let index = values.length - 1; index > 0; index -= 1) {
			const swapIndex = this.integer(0, index);
			const temporary = values[index];
			values[index] = values[swapIndex];
			values[swapIndex] = temporary;
		}
		return values;
	}
}

export function normalizeSeed(value: unknown, fallback = 'tramlight-circle-1847'): string {
	if (typeof value !== 'string') return fallback;
	const normalized = value
		.normalize('NFKC')
		.replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();
	return Array.from(normalized || fallback)
		.slice(0, MAX_SEED_LENGTH)
		.join('');
}

/** Only mathematically generative fields participate; display controls cannot perturb a matrix. */
export function matrixSeed(
	state: RandomMatrixState,
	sampleIndex: number,
	stream = 'entries'
): string {
	const material: (string | number)[] = [
		normalizeSeed(state.seed),
		state.preset,
		state.dimension,
		Math.max(0, Math.trunc(sampleIndex)),
		stream
	];
	// Include only controls consumed by the selected generator. Irrelevant UI
	// controls must not cause a surprising reroll of an otherwise identical
	// matrix. Continuous amplitude/sparsity/signal controls operate on a fixed
	// latent stream and are intentionally omitted for comparable slider sweeps.
	switch (stream) {
		case 'iid-entries':
			material.push(state.distribution, state.symmetry);
			break;
		case 'wigner-entries':
		case 'non-normal-perturbation':
			material.push(state.distribution);
			break;
		case 'wishart-data':
			material.push(state.aspectRatio.toPrecision(12), state.distribution);
			break;
	}
	return material.join('\u001f');
}

export function createMatrixRandom(
	state: RandomMatrixState,
	sampleIndex: number,
	stream = 'entries'
): MatrixRandom {
	return new MatrixRandom(matrixSeed(state, sampleIndex, stream));
}
