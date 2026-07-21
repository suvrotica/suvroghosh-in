import type { SamplePoint, SamplingMethod } from './types';

export interface Sampler {
	next(): SamplePoint;
}

export function normaliseSeed(seed: number) {
	if (!Number.isFinite(seed)) return 0;
	return Math.floor(seed) >>> 0;
}

export class Mulberry32 {
	private state: number;

	constructor(seed: number) {
		this.state = normaliseSeed(seed);
	}

	next() {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let value = this.state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	}
}

export class PseudorandomSampler implements Sampler {
	private readonly random: Mulberry32;

	constructor(seed: number) {
		this.random = new Mulberry32(seed);
	}

	next() {
		return {
			x: this.random.next() * 2 - 1,
			y: this.random.next() * 2 - 1
		};
	}
}

function greatestCommonDivisor(first: number, second: number) {
	let a = Math.abs(first);
	let b = Math.abs(second);
	while (b !== 0) {
		const remainder = a % b;
		a = b;
		b = remainder;
	}
	return a;
}

export class StratifiedSampler implements Sampler {
	readonly strataPerAxis: number;
	private readonly random: Mulberry32;
	private readonly stratumCount: number;
	private readonly stride: number;
	private readonly offset: number;
	private index = 0;

	constructor(seed: number, targetSamples: number) {
		this.random = new Mulberry32(seed);
		this.strataPerAxis = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, targetSamples))));
		this.stratumCount = this.strataPerAxis * this.strataPerAxis;
		this.offset = Math.floor(this.random.next() * this.stratumCount);

		let candidate = Math.max(1, (normaliseSeed(seed ^ 0x9e3779b9) % this.stratumCount) | 1);
		while (greatestCommonDivisor(candidate, this.stratumCount) !== 1) candidate += 2;
		this.stride = candidate % this.stratumCount || 1;
	}

	next() {
		const positionInCycle = this.index % this.stratumCount;
		const cell = (positionInCycle * this.stride + this.offset) % this.stratumCount;
		const column = cell % this.strataPerAxis;
		const row = Math.floor(cell / this.strataPerAxis);
		this.index += 1;

		return {
			x: ((column + this.random.next()) / this.strataPerAxis) * 2 - 1,
			y: ((row + this.random.next()) / this.strataPerAxis) * 2 - 1
		};
	}
}

export function halton(index: number, base: number) {
	let result = 0;
	let fraction = 1 / base;
	let remaining = Math.max(0, Math.floor(index));
	while (remaining > 0) {
		result += fraction * (remaining % base);
		remaining = Math.floor(remaining / base);
		fraction /= base;
	}
	return result;
}

export class HaltonSampler implements Sampler {
	private index = 1;
	private readonly rotationX: number;
	private readonly rotationY: number;

	constructor(seed: number) {
		const rotation = new Mulberry32(seed);
		this.rotationX = rotation.next();
		this.rotationY = rotation.next();
	}

	next() {
		const unitX = (halton(this.index, 2) + this.rotationX) % 1;
		const unitY = (halton(this.index, 3) + this.rotationY) % 1;
		this.index += 1;
		return { x: unitX * 2 - 1, y: unitY * 2 - 1 };
	}
}

export function createSampler(
	method: SamplingMethod,
	seed: number,
	targetSamples: number
): Sampler {
	if (method === 'stratified') return new StratifiedSampler(seed, targetSamples);
	if (method === 'halton') return new HaltonSampler(seed);
	return new PseudorandomSampler(seed);
}
