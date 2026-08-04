import type { ParticleArrays } from './types';

const MAX_TRAJECTORY_SLOTS = 8_000_000;

export interface TrajectorySample {
	readonly time: number;
	readonly x: Float32Array;
	readonly y: Float32Array;
	readonly alive: Uint8Array;
}

export interface ParticleTrail {
	readonly times: Float64Array;
	readonly x: Float32Array;
	readonly y: Float32Array;
	readonly alive: Uint8Array;
}

/** Preallocated sample-major ring buffer; memory never grows during a run. */
export class TrajectoryBuffer {
	readonly sourceParticleCount: number;
	readonly trackedParticleCount: number;
	readonly capacity: number;
	private readonly times: Float64Array;
	private readonly x: Float32Array;
	private readonly y: Float32Array;
	private readonly alive: Uint8Array;
	private start = 0;
	private count = 0;

	constructor(sourceParticleCount: number, capacity: number, trackedParticleCount: number) {
		if (!Number.isSafeInteger(sourceParticleCount) || sourceParticleCount < 1) {
			throw new RangeError('Trajectory source particle count must be a positive integer.');
		}
		if (!Number.isSafeInteger(capacity) || capacity < 1) {
			throw new RangeError('Trajectory capacity must be a positive integer.');
		}
		if (
			!Number.isSafeInteger(trackedParticleCount) ||
			trackedParticleCount < 1 ||
			trackedParticleCount > sourceParticleCount
		) {
			throw new RangeError('Tracked particle count must fit within the source ensemble.');
		}
		if (capacity * trackedParticleCount > MAX_TRAJECTORY_SLOTS) {
			throw new RangeError(
				`Trajectory storage may not exceed ${MAX_TRAJECTORY_SLOTS} particle samples.`
			);
		}
		this.sourceParticleCount = sourceParticleCount;
		this.trackedParticleCount = trackedParticleCount;
		this.capacity = capacity;
		this.times = new Float64Array(capacity);
		this.x = new Float32Array(capacity * trackedParticleCount);
		this.y = new Float32Array(capacity * trackedParticleCount);
		this.alive = new Uint8Array(capacity * trackedParticleCount);
	}

	get length(): number {
		return this.count;
	}

	clear(): void {
		this.start = 0;
		this.count = 0;
	}

	push(time: number, state: ParticleArrays): void {
		if (!Number.isFinite(time) || time < 0) {
			throw new RangeError('Trajectory sample time must be finite and non-negative.');
		}
		if (state.count !== this.sourceParticleCount) {
			throw new RangeError('Trajectory state size does not match its configured ensemble.');
		}
		const slot = (this.start + this.count) % this.capacity;
		const offset = slot * this.trackedParticleCount;
		this.times[slot] = time;
		for (let particle = 0; particle < this.trackedParticleCount; particle += 1) {
			this.x[offset + particle] = state.x[particle];
			this.y[offset + particle] = state.y[particle];
			this.alive[offset + particle] = state.alive[particle];
		}
		if (this.count < this.capacity) this.count += 1;
		else this.start = (this.start + 1) % this.capacity;
	}

	sampleAt(index: number): TrajectorySample | undefined {
		const normalized = index < 0 ? this.count + index : index;
		if (!Number.isSafeInteger(normalized) || normalized < 0 || normalized >= this.count) {
			return undefined;
		}
		const slot = (this.start + normalized) % this.capacity;
		const offset = slot * this.trackedParticleCount;
		return {
			time: this.times[slot],
			x: this.x.slice(offset, offset + this.trackedParticleCount),
			y: this.y.slice(offset, offset + this.trackedParticleCount),
			alive: this.alive.slice(offset, offset + this.trackedParticleCount)
		};
	}

	particleTrail(particleIndex: number): ParticleTrail {
		if (
			!Number.isSafeInteger(particleIndex) ||
			particleIndex < 0 ||
			particleIndex >= this.trackedParticleCount
		) {
			throw new RangeError('Requested particle is not tracked by this trajectory buffer.');
		}
		const times = new Float64Array(this.count);
		const x = new Float32Array(this.count);
		const y = new Float32Array(this.count);
		const alive = new Uint8Array(this.count);
		for (let sample = 0; sample < this.count; sample += 1) {
			const slot = (this.start + sample) % this.capacity;
			const offset = slot * this.trackedParticleCount + particleIndex;
			times[sample] = this.times[slot];
			x[sample] = this.x[offset];
			y[sample] = this.y[offset];
			alive[sample] = this.alive[offset];
		}
		return { times, x, y, alive };
	}
}
