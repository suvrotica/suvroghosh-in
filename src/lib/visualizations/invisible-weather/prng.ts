import { deriveSubseed, hashString, mixHash } from './hash';

function seedWords(seed: string | number): [number, number, number, number] {
	const initial = hashString(String(seed));
	return [
		mixHash(initial, 0x9e3779b9),
		mixHash(initial, 0x243f6a88),
		mixHash(initial, 0xb7e15162),
		mixHash(initial, 0xdeadbeef)
	];
}

function rotateLeft(value: number, shift: number): number {
	return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/** Deterministic xoshiro128** stream with labelled, consumption-independent forks. */
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

	float(minimum = 0, maximum = 1): number {
		if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return 0;
		if (maximum < minimum) [minimum, maximum] = [maximum, minimum];
		return minimum + (maximum - minimum) * this.nextFloat();
	}

	int(minimum: number, maximum: number): number {
		let lower = Math.ceil(Number.isFinite(minimum) ? minimum : 0);
		let upper = Math.floor(Number.isFinite(maximum) ? maximum : lower);
		if (upper < lower) [lower, upper] = [upper, lower];
		return lower + Math.floor(this.nextFloat() * (upper - lower + 1));
	}

	boolean(probability = 0.5): boolean {
		const bounded = Math.max(0, Math.min(1, Number.isFinite(probability) ? probability : 0.5));
		return this.nextFloat() < bounded;
	}

	pick<T>(values: readonly T[]): T {
		if (values.length === 0) throw new RangeError('Cannot pick from an empty collection.');
		return values[this.int(0, values.length - 1)];
	}

	weightedIndex(weights: readonly number[]): number {
		if (weights.length === 0) throw new RangeError('Weights must not be empty.');
		const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
		const total = safe.reduce((sum, weight) => sum + weight, 0);
		if (total <= 0) return this.int(0, weights.length - 1);
		let target = this.float(0, total);
		for (let index = 0; index < safe.length; index += 1) {
			target -= safe[index];
			if (target <= 0) return index;
		}
		return safe.length - 1;
	}

	shuffle<T>(values: readonly T[]): T[] {
		const output = [...values];
		for (let index = output.length - 1; index > 0; index -= 1) {
			const other = this.int(0, index);
			[output[index], output[other]] = [output[other], output[index]];
		}
		return output;
	}

	fork(label: string | number): SeededRandom {
		return new SeededRandom(deriveSubseed(this.seed, label));
	}
}

export function createPrng(seed: string | number): SeededRandom {
	return new SeededRandom(seed);
}
