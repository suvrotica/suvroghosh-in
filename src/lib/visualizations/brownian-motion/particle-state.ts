import type { ParticleArrays } from './types';

export const MAX_PARTICLE_COUNT = 100_000;

function validateParticleCount(count: number): number {
	if (!Number.isSafeInteger(count) || count < 1 || count > MAX_PARTICLE_COUNT) {
		throw new RangeError(`Particle count must be an integer from 1 to ${MAX_PARTICLE_COUNT}.`);
	}
	return count;
}

/** Fixed-size, allocation-free hot-path storage for the current ensemble. */
export class ParticleState implements ParticleArrays {
	readonly count: number;
	readonly x: Float64Array;
	readonly y: Float64Array;
	readonly unwrappedX: Float64Array;
	readonly unwrappedY: Float64Array;
	readonly originX: Float64Array;
	readonly originY: Float64Array;
	readonly originUnwrappedX: Float64Array;
	readonly originUnwrappedY: Float64Array;
	readonly alive: Uint8Array;
	readonly velocityX: Float64Array;
	readonly velocityY: Float64Array;
	readonly orientation: Float64Array;
	readonly firstPassageTime: Float64Array;
	readonly modelData: ParticleArrays['modelData'];

	constructor(count: number) {
		this.count = validateParticleCount(count);
		this.x = new Float64Array(count);
		this.y = new Float64Array(count);
		this.unwrappedX = new Float64Array(count);
		this.unwrappedY = new Float64Array(count);
		this.originX = new Float64Array(count);
		this.originY = new Float64Array(count);
		this.originUnwrappedX = new Float64Array(count);
		this.originUnwrappedY = new Float64Array(count);
		this.alive = new Uint8Array(count);
		this.velocityX = new Float64Array(count);
		this.velocityY = new Float64Array(count);
		this.orientation = new Float64Array(count);
		this.firstPassageTime = new Float64Array(count);
		this.modelData = {};
		this.firstPassageTime.fill(Number.NaN);
	}

	clear(): void {
		this.x.fill(0);
		this.y.fill(0);
		this.unwrappedX.fill(0);
		this.unwrappedY.fill(0);
		this.originX.fill(0);
		this.originY.fill(0);
		this.originUnwrappedX.fill(0);
		this.originUnwrappedY.fill(0);
		this.alive.fill(0);
		this.velocityX.fill(0);
		this.velocityY.fill(0);
		this.orientation.fill(0);
		this.firstPassageTime.fill(Number.NaN);
		for (const key of Object.keys(this.modelData)) delete this.modelData[key];
	}
}
