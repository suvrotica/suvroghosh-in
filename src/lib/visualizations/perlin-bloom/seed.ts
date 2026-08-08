import type { BloomSeeds } from './types';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const MAX_SEED_LENGTH = 96;

export const FRIENDLY_SEED_WORDS = Object.freeze([
	'orchid',
	'monsoon',
	'plasma',
	'tramlight',
	'quasar',
	'pollen',
	'lotus',
	'nebula',
	'violet',
	'firefly',
	'comet',
	'glasshouse',
	'jasmine',
	'aurora',
	'midnight',
	'chrysalis'
] as const);

/** Stable FNV-1a over JavaScript UTF-16 code units. */
export function hashString32(value: string): number {
	let hash = FNV_OFFSET;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, FNV_PRIME);
	}
	return hash >>> 0;
}

export function hashToHex(value: number): string {
	return (value >>> 0).toString(16).padStart(8, '0');
}

export function mixUint32(left: number, right: number): number {
	let value = (left ^ right) >>> 0;
	value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
	value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
	return (value ^ (value >>> 16)) >>> 0;
}

/** A labelled child seed does not depend on how much its parent stream has consumed. */
export function deriveSeed(seed: string | number, label: string | number): number {
	return mixUint32(hashString32(String(seed)), hashString32(String(label)));
}

export function deriveBloomSeeds(seed: string | number): BloomSeeds {
	const base = hashString32(String(seed));
	return Object.freeze({
		base,
		noise: deriveSeed(base, 'noise'),
		morphology: deriveSeed(base, 'morphology'),
		particles: deriveSeed(base, 'particles'),
		palette: deriveSeed(base, 'palette')
	});
}

function rotateLeft(value: number, shift: number): number {
	return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function seedWords(seed: string | number): [number, number, number, number] {
	const initial = hashString32(String(seed));
	return [
		mixUint32(initial, 0x9e3779b9),
		mixUint32(initial, 0x243f6a88),
		mixUint32(initial, 0xb7e15162),
		mixUint32(initial, 0xdeadbeef)
	];
}

/** Deterministic xoshiro128** stream with consumption-independent labelled forks. */
export class SeededRandom {
	readonly seed: string;
	#state: [number, number, number, number];

	constructor(seed: string | number) {
		this.seed = String(seed);
		this.#state = seedWords(seed);
		if (this.#state.every((word) => word === 0)) this.#state[0] = 1;
	}

	nextUint32(): number {
		const state = this.#state;
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

	nextFloat(): number {
		return this.nextUint32() / 0x1_0000_0000;
	}

	next(): number {
		return this.nextFloat();
	}

	float(minimum = 0, maximum = 1): number {
		if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
			throw new RangeError('Random range bounds must be finite.');
		}
		if (maximum < minimum) [minimum, maximum] = [maximum, minimum];
		return minimum + (maximum - minimum) * this.nextFloat();
	}

	range(minimum = 0, maximum = 1): number {
		return this.float(minimum, maximum);
	}

	int(minimum: number, maximum: number): number {
		if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
			throw new RangeError('Random integer bounds must be finite.');
		}
		let lower = Math.ceil(minimum);
		let upper = Math.floor(maximum);
		if (upper < lower) [lower, upper] = [upper, lower];
		return lower + Math.floor(this.nextFloat() * (upper - lower + 1));
	}

	integer(minimum: number, maximum: number): number {
		return this.int(minimum, maximum);
	}

	boolean(probability = 0.5): boolean {
		const bounded = Math.max(0, Math.min(1, Number.isFinite(probability) ? probability : 0.5));
		return this.nextFloat() < bounded;
	}

	pick<T>(values: readonly T[]): T {
		if (values.length === 0) throw new RangeError('Cannot pick from an empty collection.');
		return values[this.int(0, values.length - 1)];
	}

	fork(label: string | number): SeededRandom {
		return new SeededRandom(deriveSeed(this.seed, label));
	}
}

export function createSeededRandom(seed: string | number): SeededRandom {
	return new SeededRandom(seed);
}

export const createPrng = createSeededRandom;

export function normalizeSeedText(value: unknown, fallback = 'outside-1847'): string {
	if (typeof value !== 'string') return fallback;
	const cleaned = value
		.normalize('NFKC')
		.replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();
	if (!cleaned) return fallback;
	return Array.from(cleaned).slice(0, MAX_SEED_LENGTH).join('');
}

export function friendlySeedFromEntropy(entropy: ArrayLike<number>): string {
	if (entropy.length === 0) throw new RangeError('Seed entropy must not be empty.');
	let encoded = '';
	for (let index = 0; index < entropy.length; index += 1) {
		encoded += String.fromCharCode(Number(entropy[index]) & 0xff);
	}
	const wordHash = hashString32(encoded);
	const numberHash = deriveSeed(wordHash, 'friendly-number');
	const word = FRIENDLY_SEED_WORDS[wordHash % FRIENDLY_SEED_WORDS.length];
	return `${word}-${1_000 + (numberHash % 9_000)}`;
}

type CryptoRandomSource = Readonly<{
	getRandomValues: (values: Uint8Array) => Uint8Array;
}>;

/** Creates a friendly seed from platform cryptographic entropy; it never falls back to weak RNGs. */
export function generateFriendlySeed(source?: CryptoRandomSource): string {
	const cryptoSource = source ?? globalThis.crypto;
	if (!cryptoSource || typeof cryptoSource.getRandomValues !== 'function') {
		throw new Error('Cryptographic random values are unavailable.');
	}
	const entropy = new Uint8Array(16);
	cryptoSource.getRandomValues(entropy);
	return friendlySeedFromEntropy(entropy);
}
