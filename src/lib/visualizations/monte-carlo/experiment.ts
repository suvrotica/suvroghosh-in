import { createSampler, type Sampler } from './samplers';
import {
	calculateStatistics,
	checkpointCounts,
	classifyPoint,
	statisticsObservation
} from './statistics';
import type {
	ConvergenceObservation,
	GenerationResult,
	MonteCarloSettings,
	MonteCarloStatistics
} from './types';

export class MonteCarloExperiment {
	readonly settings: MonteCarloSettings;
	readonly visiblePoints: Float32Array;
	readonly observations: ConvergenceObservation[] = [];
	private readonly sampler: Sampler;
	private readonly checkpoints: number[];
	private checkpointIndex = 0;
	private total = 0;
	private inside = 0;
	private visible = 0;

	constructor(settings: MonteCarloSettings) {
		this.settings = {
			...settings,
			targetSamples: Math.max(1, Math.floor(settings.targetSamples)),
			visiblePointCap: Math.max(1, Math.floor(settings.visiblePointCap))
		};
		this.sampler = createSampler(
			this.settings.method,
			this.settings.seed,
			this.settings.targetSamples
		);
		this.visiblePoints = new Float32Array(this.settings.visiblePointCap * 3);
		this.checkpoints = checkpointCounts(this.settings.targetSamples);
	}

	get totalSamples() {
		return this.total;
	}

	get insideSamples() {
		return this.inside;
	}

	get displayedSamples() {
		return this.visible;
	}

	get completed() {
		return this.total >= this.settings.targetSamples;
	}

	statistics(): MonteCarloStatistics {
		return calculateStatistics(this.total, this.inside, this.visible);
	}

	generate(requestedSamples: number): GenerationResult {
		const requested = Math.max(0, Math.floor(requestedSamples));
		const amount = Math.min(requested, this.settings.targetSamples - this.total);
		const visibleStart = this.visible;

		for (let index = 0; index < amount; index += 1) {
			const point = this.sampler.next();
			const inside = classifyPoint(point.x, point.y);
			this.total += 1;
			if (inside) this.inside += 1;

			if (this.visible < this.settings.visiblePointCap) {
				const offset = this.visible * 3;
				this.visiblePoints[offset] = point.x;
				this.visiblePoints[offset + 1] = point.y;
				this.visiblePoints[offset + 2] = inside ? 1 : 0;
				this.visible += 1;
			}

			while (
				this.checkpointIndex < this.checkpoints.length &&
				this.total >= this.checkpoints[this.checkpointIndex]
			) {
				this.observations.push(statisticsObservation(this.total, this.inside));
				this.checkpointIndex += 1;
			}
		}

		return {
			generated: amount,
			visibleStart,
			visibleEnd: this.visible,
			completed: this.completed
		};
	}
}
