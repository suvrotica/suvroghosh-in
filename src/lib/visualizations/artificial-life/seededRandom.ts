function hashSeed(seed: string) {
	let hash = 2166136261;
	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0 || 0x6d2b79f5;
}

export class SeededRandom {
	private state: number;

	constructor(seed: string | number) {
		this.state = typeof seed === 'number' ? seed >>> 0 || 0x6d2b79f5 : hashSeed(seed);
	}

	next() {
		let value = this.state;
		value ^= value << 13;
		value ^= value >>> 17;
		value ^= value << 5;
		this.state = value >>> 0 || 0x6d2b79f5;
		return this.state / 4294967296;
	}

	range(minimum: number, maximum: number) {
		return minimum + (maximum - minimum) * this.next();
	}

	integer(minimum: number, maximum: number) {
		return Math.floor(this.range(minimum, maximum + 1));
	}

	signed() {
		return this.next() * 2 - 1;
	}

	chance(probability: number) {
		return this.next() < Math.min(1, Math.max(0, probability));
	}

	pick<Value>(values: readonly Value[]) {
		if (values.length === 0) throw new Error('Cannot pick from an empty collection.');
		return values[this.integer(0, values.length - 1)];
	}

	getState() {
		return this.state;
	}
}
