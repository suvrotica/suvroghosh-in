/**
 * Compact mutable set of non-negative integer indices. Methods that can change the set return
 * whether its contents changed, which keeps propagation queues allocation-light.
 */
export class BitSet {
	readonly size: number;
	private readonly words: Uint32Array;
	/**
	 * Optional immutable, cell-local observation weights. They are deliberately metadata on the
	 * candidate set: propagation still reasons about exactly the same sockets, while entropy and
	 * observation may give the surviving candidates different local likelihoods.
	 */
	private observationWeightScales?: Float64Array;

	constructor(size: number, fill = false) {
		if (!Number.isSafeInteger(size) || size < 0) {
			throw new RangeError('BitSet size must be a non-negative safe integer.');
		}
		this.size = size;
		this.words = new Uint32Array(Math.ceil(size / 32));
		if (fill) {
			this.words.fill(0xffffffff);
			this.clearUnusedBits();
		}
	}

	static full(size: number): BitSet {
		return new BitSet(size, true);
	}

	static from(size: number, values: Iterable<number>): BitSet {
		const set = new BitSet(size);
		for (const value of values) set.add(value);
		return set;
	}

	clone(): BitSet {
		const copy = new BitSet(this.size);
		copy.words.set(this.words);
		// Scales are copied on assignment and never exposed, so snapshots can safely share them.
		copy.observationWeightScales = this.observationWeightScales;
		return copy;
	}

	setObservationWeightScales(scales: ArrayLike<number>): void {
		if (scales.length !== this.size) {
			throw new RangeError(
				`Expected ${this.size} observation weight scales, received ${scales.length}.`
			);
		}
		const validated = new Float64Array(this.size);
		for (let index = 0; index < this.size; index += 1) {
			const scale = scales[index];
			if (!Number.isFinite(scale) || scale <= 0) {
				throw new RangeError(`Observation weight scale ${index} must be finite and positive.`);
			}
			validated[index] = scale;
		}
		this.observationWeightScales = validated;
	}

	observationWeightScale(index: number): number {
		this.assertIndex(index);
		return this.observationWeightScales?.[index] ?? 1;
	}

	add(index: number): boolean {
		this.assertIndex(index);
		const word = index >>> 5;
		const mask = (1 << (index & 31)) >>> 0;
		const before = this.words[word];
		this.words[word] = (before | mask) >>> 0;
		return this.words[word] !== before;
	}

	remove(index: number): boolean {
		this.assertIndex(index);
		const word = index >>> 5;
		const mask = (1 << (index & 31)) >>> 0;
		const before = this.words[word];
		this.words[word] = (before & ~mask) >>> 0;
		return this.words[word] !== before;
	}

	has(index: number): boolean {
		this.assertIndex(index);
		return (this.words[index >>> 5] & ((1 << (index & 31)) >>> 0)) !== 0;
	}

	clear(): boolean {
		let changed = false;
		for (let index = 0; index < this.words.length; index += 1) {
			if (this.words[index] !== 0) changed = true;
			this.words[index] = 0;
		}
		return changed;
	}

	intersect(other: BitSet): boolean {
		this.assertCompatible(other);
		let changed = false;
		for (let index = 0; index < this.words.length; index += 1) {
			const next = (this.words[index] & other.words[index]) >>> 0;
			if (next !== this.words[index]) {
				this.words[index] = next;
				changed = true;
			}
		}
		return changed;
	}

	union(other: BitSet): boolean {
		this.assertCompatible(other);
		let changed = false;
		for (let index = 0; index < this.words.length; index += 1) {
			const next = (this.words[index] | other.words[index]) >>> 0;
			if (next !== this.words[index]) {
				this.words[index] = next;
				changed = true;
			}
		}
		this.clearUnusedBits();
		return changed;
	}

	equals(other: BitSet): boolean {
		if (this.size !== other.size) return false;
		for (let index = 0; index < this.words.length; index += 1) {
			if (this.words[index] !== other.words[index]) return false;
		}
		return true;
	}

	count(): number {
		let count = 0;
		for (const word of this.words) count += popcount32(word);
		return count;
	}

	isEmpty(): boolean {
		for (const word of this.words) if (word !== 0) return false;
		return true;
	}

	isSingleton(): boolean {
		let found = false;
		for (const word of this.words) {
			if (word === 0) continue;
			if ((word & (word - 1)) !== 0 || found) return false;
			found = true;
		}
		return found;
	}

	singletonIndex(): number {
		if (!this.isSingleton()) return -1;
		for (let wordIndex = 0; wordIndex < this.words.length; wordIndex += 1) {
			const word = this.words[wordIndex];
			if (word === 0) continue;
			return wordIndex * 32 + (31 - Math.clz32(word & -word));
		}
		return -1;
	}

	*values(): IterableIterator<number> {
		for (let wordIndex = 0; wordIndex < this.words.length; wordIndex += 1) {
			let word = this.words[wordIndex] >>> 0;
			while (word !== 0) {
				const lowest = (word & -word) >>> 0;
				const bit = 31 - Math.clz32(lowest);
				const value = wordIndex * 32 + bit;
				if (value < this.size) yield value;
				word = (word & (word - 1)) >>> 0;
			}
		}
	}

	toArray(): number[] {
		return [...this.values()];
	}

	private clearUnusedBits(): void {
		if (this.words.length === 0 || this.size % 32 === 0) return;
		const used = this.size % 32;
		this.words[this.words.length - 1] &= (0xffffffff >>> (32 - used)) >>> 0;
	}

	private assertCompatible(other: BitSet): void {
		if (this.size !== other.size) {
			throw new RangeError(`Cannot combine BitSets of sizes ${this.size} and ${other.size}.`);
		}
	}

	private assertIndex(index: number): void {
		if (!Number.isSafeInteger(index) || index < 0 || index >= this.size) {
			throw new RangeError(`BitSet index ${index} is outside 0..${this.size - 1}.`);
		}
	}
}

function popcount32(value: number): number {
	let word = value >>> 0;
	word -= (word >>> 1) & 0x55555555;
	word = (word & 0x33333333) + ((word >>> 2) & 0x33333333);
	return (((word + (word >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
