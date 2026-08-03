function avalanche(value: number): number {
	value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
	value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
	return (value ^ (value >>> 15)) >>> 0;
}

export function hashString(value: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return avalanche(hash ^ value.length);
}

function seedText(seed: string | number): string {
	return typeof seed === 'number' ? `n:${seed >>> 0}` : `s:${seed.trim() || 'storm'}`;
}

/** A deterministic PRNG whose labelled forks do not depend on how far the parent has advanced. */
export class SeededRandom {
	readonly seed: string;
	private state: number;
	private spareNormal: number | null = null;

	constructor(seed: string | number) {
		this.seed = seedText(seed);
		this.state = hashString(this.seed) || 0x6d2b79f5;
	}

	nextFloat(): number {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let value = this.state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	}

	nextInt(minimum: number, maximum: number): number {
		const low = Math.ceil(Math.min(minimum, maximum));
		const high = Math.floor(Math.max(minimum, maximum));
		if (high <= low) return low;
		return low + Math.floor(this.nextFloat() * (high - low + 1));
	}

	normal(mean = 0, standardDeviation = 1): number {
		if (this.spareNormal !== null) {
			const value = this.spareNormal;
			this.spareNormal = null;
			return mean + value * standardDeviation;
		}

		let u = 0;
		let v = 0;
		while (u <= Number.EPSILON) u = this.nextFloat();
		while (v <= Number.EPSILON) v = this.nextFloat();
		const magnitude = Math.sqrt(-2 * Math.log(u));
		const angle = 2 * Math.PI * v;
		this.spareNormal = magnitude * Math.sin(angle);
		return mean + magnitude * Math.cos(angle) * standardDeviation;
	}

	weightedIndex(weights: readonly number[]): number {
		let total = 0;
		for (const weight of weights) total += Number.isFinite(weight) ? Math.max(0, weight) : 0;
		if (total <= Number.EPSILON)
			return weights.length === 0 ? -1 : this.nextInt(0, weights.length - 1);

		let target = this.nextFloat() * total;
		for (let index = 0; index < weights.length; index += 1) {
			target -= Number.isFinite(weights[index]) ? Math.max(0, weights[index]) : 0;
			if (target <= 0) return index;
		}
		return weights.length - 1;
	}

	fork(label: string | number): SeededRandom {
		return new SeededRandom(`${this.seed}|${String(label)}`);
	}
}
