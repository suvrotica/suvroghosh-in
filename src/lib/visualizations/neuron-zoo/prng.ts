/**
 * Mulberry32: a compact reproducible 32-bit pseudo-random stream.
 * It is deterministic software state, not a source of physical randomness.
 */
export class Mulberry32 {
	private state: number;

	constructor(seed: number) {
		this.state = normalizeSeed(seed);
	}

	next(): number {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let value = this.state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	}

	signed(): number {
		return this.next() * 2 - 1;
	}

	getState(): number {
		return this.state;
	}
}

export function normalizeSeed(seed: number): number {
	if (!Number.isFinite(seed)) return 0;
	return Math.floor(seed) >>> 0;
}
