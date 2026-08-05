/** Stable FNV-1a string hash, mixed to use all 32 output bits. */
export function hashSeed(seed: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	hash ^= hash >>> 16;
	hash = Math.imul(hash, 0x7feb352d);
	hash ^= hash >>> 15;
	hash = Math.imul(hash, 0x846ca68b);
	hash ^= hash >>> 16;
	return hash >>> 0;
}

/**
 * A small serializable Mulberry32 generator. It is appropriate for repeatable
 * demonstrations and sampling, not cryptography.
 */
export class SeededRandom {
	private state: number;
	private spareNormal: number | null = null;

	constructor(seed: string | number) {
		this.state = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
	}

	nextUint32(): number {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let value = this.state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return (value ^ (value >>> 14)) >>> 0;
	}

	next(): number {
		return this.nextUint32() / 0x1_0000_0000;
	}

	integer(minimumInclusive: number, maximumExclusive: number): number {
		if (
			!Number.isSafeInteger(minimumInclusive) ||
			!Number.isSafeInteger(maximumExclusive) ||
			maximumExclusive <= minimumInclusive
		) {
			throw new RangeError('integer bounds must be safe integers with maximum > minimum.');
		}
		return minimumInclusive + Math.floor(this.next() * (maximumExclusive - minimumInclusive));
	}

	normal(): number {
		if (this.spareNormal !== null) {
			const result = this.spareNormal;
			this.spareNormal = null;
			return result;
		}

		// next() may return zero, which is not valid inside log.
		let first = 0;
		while (first <= Number.EPSILON) first = this.next();
		const second = this.next();
		const radius = Math.sqrt(-2 * Math.log(first));
		const angle = 2 * Math.PI * second;
		this.spareNormal = radius * Math.sin(angle);
		return radius * Math.cos(angle);
	}

	clone(): SeededRandom {
		const copy = new SeededRandom(this.state);
		copy.state = this.state;
		copy.spareNormal = this.spareNormal;
		return copy;
	}

	getState(): Readonly<{ state: number; spareNormal: number | null }> {
		return { state: this.state, spareNormal: this.spareNormal };
	}

	setState(snapshot: Readonly<{ state: number; spareNormal: number | null }>): void {
		if (
			!Number.isSafeInteger(snapshot.state) ||
			snapshot.state < 0 ||
			snapshot.state > 0xffffffff
		) {
			throw new RangeError('PRNG state must be an unsigned 32-bit integer.');
		}
		if (snapshot.spareNormal !== null && !Number.isFinite(snapshot.spareNormal)) {
			throw new RangeError('PRNG spare normal must be finite or null.');
		}
		this.state = snapshot.state >>> 0;
		this.spareNormal = snapshot.spareNormal;
	}
}

export function sampleWithoutReplacement(
	populationSize: number,
	sampleSize: number,
	random: SeededRandom
): number[] {
	if (!Number.isSafeInteger(populationSize) || populationSize < 0) {
		throw new RangeError('populationSize must be a non-negative safe integer.');
	}
	if (!Number.isSafeInteger(sampleSize) || sampleSize < 0 || sampleSize > populationSize) {
		throw new RangeError('sampleSize must be between zero and populationSize.');
	}

	const indices = Array.from({ length: populationSize }, (_, index) => index);
	for (let index = 0; index < sampleSize; index += 1) {
		const selected = random.integer(index, populationSize);
		[indices[index], indices[selected]] = [indices[selected], indices[index]];
	}
	return indices.slice(0, sampleSize);
}

export function deterministicShuffle<T>(values: readonly T[], random: SeededRandom): T[] {
	const shuffled = Array.from(values);
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const selected = random.integer(0, index + 1);
		[shuffled[index], shuffled[selected]] = [shuffled[selected], shuffled[index]];
	}
	return shuffled;
}
