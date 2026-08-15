const UINT32_RANGE = 0x1_0000_0000;

function hashSeed(seed: string): readonly [number, number, number, number] {
	let a = 1_779_033_703;
	let b = 3_144_134_277;
	let c = 1_013_904_242;
	let d = 2_773_480_762;

	for (let index = 0; index < seed.length; index += 1) {
		const code = seed.charCodeAt(index);
		a = b ^ Math.imul(a ^ code, 597_399_067);
		b = c ^ Math.imul(b ^ code, 2_869_860_233);
		c = d ^ Math.imul(c ^ code, 951_274_213);
		d = a ^ Math.imul(d ^ code, 2_716_044_179);
	}

	a = Math.imul(c ^ (a >>> 18), 597_399_067);
	b = Math.imul(d ^ (b >>> 22), 2_869_860_233);
	c = Math.imul(a ^ (c >>> 17), 951_274_213);
	d = Math.imul(b ^ (d >>> 19), 2_716_044_179);

	return [(a ^ b ^ c ^ d) >>> 0, (b ^ a) >>> 0, (c ^ a) >>> 0, (d ^ a) >>> 0];
}

/** A deterministic string-seeded sfc32 generator. It never reads ambient entropy. */
export class NamedSeedPrng {
	readonly seed: string;
	#a: number;
	#b: number;
	#c: number;
	#d: number;

	constructor(seed: string) {
		if (seed.length === 0) {
			throw new RangeError('A named seed must not be empty.');
		}
		this.seed = seed;
		[this.#a, this.#b, this.#c, this.#d] = hashSeed(seed);
		// Diffuse nearby seed hashes before exposing the first draw.
		for (let warmup = 0; warmup < 12; warmup += 1) this.nextUint32();
	}

	nextUint32(): number {
		this.#a >>>= 0;
		this.#b >>>= 0;
		this.#c >>>= 0;
		this.#d >>>= 0;
		const sum = (this.#a + this.#b + this.#d) | 0;
		this.#d = (this.#d + 1) | 0;
		this.#a = this.#b ^ (this.#b >>> 9);
		this.#b = (this.#c + (this.#c << 3)) | 0;
		this.#c = ((this.#c << 21) | (this.#c >>> 11)) + sum;
		return sum >>> 0;
	}

	/** Returns a value strictly inside (0, 1), which is safe for logarithms. */
	nextOpenUnit(): number {
		return (this.nextUint32() + 0.5) / UINT32_RANGE;
	}

	next(): number {
		return this.nextOpenUnit();
	}
}

export function deriveCohortSeed(baseSeed: string, generation: number): string {
	if (!Number.isSafeInteger(generation) || generation < 0) {
		throw new RangeError('Cohort generation must be a non-negative safe integer.');
	}
	return generation === 0 ? baseSeed : `${baseSeed}:${generation + 1}`;
}
