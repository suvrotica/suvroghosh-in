export type Seed = string | number;

const UINT32_RANGE = 0x1_0000_0000;
const FALLBACK_STATE = 0x6d2b79f5;
const RNG_SCHEMA = 'kagojer-dana:rng:v1';

export const MAX_SEED_LENGTH = 64;
export const DEFAULT_CITY_SEED = 'north-calcutta-1847';

/** Stable FNV-1a identity hash. This is intentionally not a cryptographic hash. */
export function hashString32(value: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export function normalizeSeed(seed: unknown, fallback = DEFAULT_CITY_SEED): string {
	if (typeof seed === 'number') {
		return Number.isFinite(seed) ? String(Math.trunc(seed)) : fallback;
	}
	if (typeof seed !== 'string') return fallback;

	const normalized = seed
		.normalize('NFKC')
		.replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();
	if (!normalized) return fallback;
	return Array.from(normalized).slice(0, MAX_SEED_LENGTH).join('');
}

function seedMaterial(seed: Seed): string {
	if (typeof seed === 'number') {
		if (!Number.isFinite(seed)) throw new RangeError('A numeric seed must be finite.');
		return `number:${Math.trunc(seed)}`;
	}
	return `string:${normalizeSeed(seed)}`;
}

function normalizeNamespace(namespace: string): string {
	const normalized = namespace
		.normalize('NFKC')
		.replace(/[\p{Cc}\p{Cf}]+/gu, '')
		.split('/')
		.map((part) => part.trim())
		.filter(Boolean)
		.join('/');
	if (!normalized) throw new RangeError('A random-stream namespace must not be empty.');
	return normalized;
}

export function hashSeed(seed: Seed): number {
	return hashString32(`${RNG_SCHEMA}\u001f${seedMaterial(seed)}`);
}

export function deriveSeed(seed: Seed, namespace: string): number {
	return hashString32(
		`${RNG_SCHEMA}\u001f${seedMaterial(seed)}\u001f${normalizeNamespace(namespace)}`
	);
}

/**
 * Small deterministic generator whose forks are derived from immutable root material.
 * Consuming or adding one stream therefore cannot perturb any sibling stream.
 */
export class SeededRng {
	readonly seed: string;
	readonly namespace: string;
	private readonly material: string;
	private state: number;

	constructor(seed: Seed, namespace = '') {
		this.material = seedMaterial(seed);
		this.seed = normalizeSeed(seed);
		this.namespace = namespace ? normalizeNamespace(namespace) : '';
		this.state = this.initialState();
	}

	private initialState(): number {
		return (
			hashString32(
				`${RNG_SCHEMA}\u001f${this.material}${this.namespace ? `\u001f${this.namespace}` : ''}`
			) || FALLBACK_STATE
		);
	}

	nextUint32(): number {
		// Mulberry32: compact, repeatable across JS engines, and adequate for world synthesis.
		this.state = (this.state + FALLBACK_STATE) >>> 0;
		let value = this.state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return (value ^ (value >>> 14)) >>> 0;
	}

	next(): number {
		return this.nextUint32() / UINT32_RANGE;
	}

	range(minimum = 0, maximum = 1): number {
		if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum < minimum) {
			throw new RangeError('Random ranges require finite bounds with maximum >= minimum.');
		}
		return minimum + (maximum - minimum) * this.next();
	}

	integer(minimum: number, maximum: number): number {
		const lower = Math.ceil(minimum);
		const upper = Math.floor(maximum);
		if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper < lower) {
			throw new RangeError('Random integer ranges must contain at least one integer.');
		}
		return Math.floor(this.range(lower, upper + 1));
	}

	chance(probability = 0.5): boolean {
		if (!Number.isFinite(probability)) return false;
		return this.next() < Math.max(0, Math.min(1, probability));
	}

	pick<Value>(values: readonly Value[]): Value {
		if (values.length === 0) throw new RangeError('Cannot pick from an empty collection.');
		return values[this.integer(0, values.length - 1)];
	}

	shuffle<Value>(values: readonly Value[]): Value[] {
		const copy = [...values];
		for (let index = copy.length - 1; index > 0; index -= 1) {
			const swapIndex = this.integer(0, index);
			[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
		}
		return copy;
	}

	/** `root.fork('world').fork('chunk/17')` equals `root.fork('world/chunk/17')`. */
	fork(namespace: string): SeededRng {
		const child = normalizeNamespace(namespace);
		const path = this.namespace ? `${this.namespace}/${child}` : child;
		return new SeededRng(
			this.material.startsWith('number:') ? Number(this.material.slice(7)) : this.seed,
			path
		);
	}

	clone(): SeededRng {
		const clone = new SeededRng(
			this.material.startsWith('number:') ? Number(this.material.slice(7)) : this.seed,
			this.namespace
		);
		clone.state = this.state;
		return clone;
	}

	getState(): number {
		return this.state;
	}

	setState(state: number): void {
		if (!Number.isFinite(state)) throw new RangeError('Random state must be finite.');
		this.state = Math.trunc(state) >>> 0;
	}
}

export type SeedStreams<Name extends string> = Record<Name, SeededRng>;

export function createSeedStreams<const Name extends string>(
	seed: Seed,
	namespaces: readonly Name[]
): SeedStreams<Name> {
	const root = new SeededRng(seed);
	return Object.fromEntries(namespaces.map((name) => [name, root.fork(name)])) as SeedStreams<Name>;
}
