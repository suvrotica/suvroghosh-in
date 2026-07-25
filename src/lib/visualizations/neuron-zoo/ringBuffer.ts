export class RingBuffer<Value> {
	private readonly values: Array<Value | undefined>;
	private start = 0;
	private count = 0;

	constructor(readonly capacity: number) {
		if (!Number.isInteger(capacity) || capacity < 1) {
			throw new RangeError('Ring-buffer capacity must be a positive integer.');
		}
		this.values = new Array<Value | undefined>(capacity);
	}

	get length(): number {
		return this.count;
	}

	push(value: Value): void {
		const index = (this.start + this.count) % this.capacity;
		this.values[index] = value;
		if (this.count < this.capacity) {
			this.count += 1;
		} else {
			this.start = (this.start + 1) % this.capacity;
		}
	}

	clear(): void {
		this.values.fill(undefined);
		this.start = 0;
		this.count = 0;
	}

	at(index: number): Value | undefined {
		const normalized = index < 0 ? this.count + index : index;
		if (normalized < 0 || normalized >= this.count) return undefined;
		return this.values[(this.start + normalized) % this.capacity];
	}

	toArray(): Value[] {
		return Array.from({ length: this.count }, (_, index) => this.at(index) as Value);
	}
}

export class Float64RingBuffer {
	private readonly values: Float64Array;
	private start = 0;
	private count = 0;

	constructor(readonly capacity: number) {
		if (!Number.isInteger(capacity) || capacity < 1) {
			throw new RangeError('Ring-buffer capacity must be a positive integer.');
		}
		this.values = new Float64Array(capacity);
	}

	get length(): number {
		return this.count;
	}

	push(value: number): void {
		if (!Number.isFinite(value))
			throw new RangeError('Numeric ring buffer accepts finite values only.');
		const index = (this.start + this.count) % this.capacity;
		this.values[index] = value;
		if (this.count < this.capacity) this.count += 1;
		else this.start = (this.start + 1) % this.capacity;
	}

	clear(): void {
		this.start = 0;
		this.count = 0;
	}

	toFloat64Array(): Float64Array {
		const result = new Float64Array(this.count);
		for (let index = 0; index < this.count; index += 1) {
			result[index] = this.values[(this.start + index) % this.capacity];
		}
		return result;
	}
}
