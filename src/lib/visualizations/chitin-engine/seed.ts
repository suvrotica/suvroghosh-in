const UINT32_RANGE = 0x1_0000_0000;
export const MAX_SEED_LENGTH = 64;

const FRIENDLY_PREFIXES = Object.freeze([
	'glassback',
	'oxide',
	'monsoon',
	'basalt',
	'hullmite',
	'brine',
	'terminal',
	'ashfall',
	'cobalt',
	'velvet',
	'frost',
	'mercury'
] as const);

/** Stable FNV-1a string hash. It is an identity function here, not a security primitive. */
export function hashString32(value: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export function normalizeSeed(value: unknown, fallback = 'glassback-1847'): string {
	if (typeof value !== 'string') return fallback;
	const normalized = value
		.normalize('NFKC')
		.replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();
	if (!normalized) return fallback;
	return Array.from(normalized).slice(0, MAX_SEED_LENGTH).join('');
}

export class DeterministicStream {
	readonly seed: string;
	private state: number;

	constructor(seed: string | number) {
		this.seed = String(seed);
		this.state = hashString32(this.seed) || 0x6d2b79f5;
	}

	nextUint32(): number {
		let state = (this.state += 0x6d2b79f5);
		state = Math.imul(state ^ (state >>> 15), state | 1);
		state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
		this.state = state >>> 0;
		return (state ^ (state >>> 14)) >>> 0;
	}

	next(): number {
		return this.nextUint32() / UINT32_RANGE;
	}

	float(minimum = 0, maximum = 1): number {
		if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
			throw new RangeError('Deterministic stream bounds must be finite.');
		}
		if (maximum < minimum) [minimum, maximum] = [maximum, minimum];
		return minimum + this.next() * (maximum - minimum);
	}

	int(minimum: number, maximum: number): number {
		if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
			throw new RangeError('Deterministic integer bounds must be finite.');
		}
		let lower = Math.ceil(minimum);
		let upper = Math.floor(maximum);
		if (upper < lower) [lower, upper] = [upper, lower];
		return lower + Math.floor(this.next() * (upper - lower + 1));
	}

	boolean(probability = 0.5): boolean {
		const bounded = Math.max(0, Math.min(1, Number.isFinite(probability) ? probability : 0.5));
		return this.next() < bounded;
	}

	pick<T>(values: readonly T[]): T {
		if (values.length === 0) throw new RangeError('Cannot choose from an empty collection.');
		return values[this.int(0, values.length - 1)];
	}

	fork(namespace: string): DeterministicStream {
		return createNamedStream(this.seed, namespace);
	}
}

/**
 * Stable namespaces keep a dust or naming change from altering limbs or armour.
 * Namespace labels are part of the schema's reproducibility contract.
 */
export function createNamedStream(seed: string, namespace: string): DeterministicStream {
	return new DeterministicStream(`chitin:v1::${normalizeSeed(seed)}::${namespace}`);
}

export function deterministicId(seed: string, namespace: string): string {
	return hashString32(`chitin:v1::${normalizeSeed(seed)}::${namespace}`)
		.toString(36)
		.padStart(7, '0');
}

export function friendlySeedFromEntropy(entropy: ArrayLike<number>): string {
	if (entropy.length === 0) throw new RangeError('Seed entropy must not be empty.');
	let hashInput = '';
	for (let index = 0; index < entropy.length; index += 1) {
		hashInput += String.fromCharCode(Number(entropy[index]) & 0xff);
	}
	const hash = hashString32(hashInput);
	const prefix = FRIENDLY_PREFIXES[hash % FRIENDLY_PREFIXES.length];
	return `${prefix}-${1_000 + (hashString32(`${hash}:suffix`) % 9_000)}`;
}

export function generateFriendlySeed(source: Crypto = globalThis.crypto): string {
	if (!source || typeof source.getRandomValues !== 'function') {
		throw new Error('Secure platform entropy is unavailable. Enter a seed instead.');
	}
	const entropy = new Uint8Array(16);
	source.getRandomValues(entropy);
	return friendlySeedFromEntropy(entropy);
}
