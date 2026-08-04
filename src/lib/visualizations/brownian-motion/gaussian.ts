import type { RandomSource } from '$lib/utils/seeded-random';

/** Cached Box–Muller transform backed by an injected deterministic uniform stream. */
export class GaussianSampler {
	private spare: number | null = null;

	constructor(private readonly uniform: RandomSource) {}

	next(mean = 0, standardDeviation = 1): number {
		if (!Number.isFinite(mean)) throw new RangeError('Gaussian mean must be finite.');
		if (!Number.isFinite(standardDeviation) || standardDeviation < 0) {
			throw new RangeError('Gaussian standard deviation must be finite and non-negative.');
		}
		if (standardDeviation === 0) return mean;

		if (this.spare !== null) {
			const value = this.spare;
			this.spare = null;
			return mean + value * standardDeviation;
		}

		const first = this.openUnitInterval();
		const second = this.unitInterval();
		const magnitude = Math.sqrt(-2 * Math.log(first));
		const angle = 2 * Math.PI * second;
		this.spare = magnitude * Math.sin(angle);
		return mean + magnitude * Math.cos(angle) * standardDeviation;
	}

	clearCachedValue(): void {
		this.spare = null;
	}

	private unitInterval(): number {
		const value = this.uniform.next();
		if (!Number.isFinite(value) || value < 0 || value >= 1) {
			throw new RangeError('Uniform random sources must return finite values in [0, 1).');
		}
		return value;
	}

	private openUnitInterval(): number {
		for (let attempt = 0; attempt < 64; attempt += 1) {
			const value = this.unitInterval();
			if (value > Number.EPSILON) return value;
		}
		throw new Error('Uniform random source repeatedly returned zero during Gaussian sampling.');
	}
}
