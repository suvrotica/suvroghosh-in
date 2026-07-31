export type Seed = string | number;

export interface RandomSource {
	next(): number;
}

export const DEFAULT_RANDOM_STREAM_NAMES = [
	'environment',
	'weather',
	'pedestrians',
	'vehicles',
	'animals',
	'food',
	'cosmetics'
] as const;

export type DefaultRandomStreamName = (typeof DEFAULT_RANDOM_STREAM_NAMES)[number];
export type RandomStreams<Name extends string = DefaultRandomStreamName> = Record<
	Name,
	SeededRandom
>;

const FALLBACK_STATE = 0x6d2b79f5;
const UINT32_RANGE = 0x1_0000_0000;

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0 || FALLBACK_STATE;
}

function seedMaterial(seed: Seed): string {
	if (typeof seed === 'number') {
		if (!Number.isFinite(seed)) throw new RangeError('A numeric random seed must be finite.');
		return `number:${Math.trunc(seed)}`;
	}
	return `string:${seed}`;
}

function stateFromSeed(seed: Seed): number {
	if (typeof seed === 'number') return Math.trunc(seed) >>> 0 || FALLBACK_STATE;
	return hashString(seedMaterial(seed));
}

/**
 * Small deterministic PRNG for simulation logic. It deliberately has no dependency on
 * Math.random, clocks, crypto, or browser globals.
 */
export class SeededRandom implements RandomSource {
	private state: number;
	private readonly material: string;

	constructor(seed: Seed) {
		this.material = seedMaterial(seed);
		this.state = stateFromSeed(seed);
	}

	next(): number {
		let value = this.state;
		value ^= value << 13;
		value ^= value >>> 17;
		value ^= value << 5;
		this.state = value >>> 0 || FALLBACK_STATE;
		return this.state / UINT32_RANGE;
	}

	nextUint32(): number {
		this.next();
		return this.state;
	}

	range(minimum: number, maximum: number): number {
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

	chance(probability: number): boolean {
		if (!Number.isFinite(probability)) return false;
		return this.next() < Math.max(0, Math.min(1, probability));
	}

	pick<Value>(values: readonly Value[]): Value {
		if (values.length === 0) throw new Error('Cannot pick from an empty collection.');
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

	/**
	 * Forks from the original seed material, not the current state. Stream construction and
	 * consumption order therefore cannot perturb another named subsystem.
	 */
	fork(label: string): SeededRandom {
		return new SeededRandom(`${this.material}\u001f${label}`);
	}

	getState(): number {
		return this.state;
	}

	setState(state: number): void {
		if (!Number.isFinite(state)) throw new RangeError('Random state must be finite.');
		this.state = Math.trunc(state) >>> 0 || FALLBACK_STATE;
	}
}

export function createRandomStreams<const Name extends string>(
	seed: Seed,
	names: readonly Name[]
): RandomStreams<Name>;
export function createRandomStreams(seed: Seed): RandomStreams;
export function createRandomStreams(
	seed: Seed,
	names: readonly string[] = DEFAULT_RANDOM_STREAM_NAMES
): RandomStreams<string> {
	const root = new SeededRandom(seed);
	return Object.fromEntries(names.map((name) => [name, root.fork(name)])) as RandomStreams<string>;
}
