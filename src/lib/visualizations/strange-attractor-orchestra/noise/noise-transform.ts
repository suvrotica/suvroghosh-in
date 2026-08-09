import { createSubseed } from '../seeded-random';
import type {
	GenerationProgress,
	NoiseConfiguration,
	NoiseLens,
	TrajectoryData,
	WeatherData
} from '../types';
import { createNoiseField } from './noise-fields';

const DEFAULT_PHASE_RATE = 0.02;
const SPACE_SCALE = 1.65;
const WARP_SCALE = 0.22;

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

export function isNoiseLens(value: unknown): value is NoiseLens {
	return value === 'dye' || value === 'warp' || value === 'wake';
}

export interface ApplyNoiseOptions {
	readonly onProgress?: (progress: GenerationProgress) => void;
}

export function applyNoiseLens(
	trajectory: TrajectoryData,
	configuration: NoiseConfiguration,
	options: ApplyNoiseOptions = {}
): WeatherData {
	if (
		!Number.isFinite(configuration.influence) ||
		configuration.influence < 0 ||
		configuration.influence > 1
	) {
		throw new RangeError('Noise influence must be a finite value in [0, 1].');
	}
	const phaseRate = configuration.phaseRate ?? DEFAULT_PHASE_RATE;
	if (!Number.isFinite(phaseRate) || phaseRate < 0 || phaseRate > 1) {
		throw new RangeError('Noise phase rate must be a finite value in [0, 1].');
	}
	const field = createNoiseField(
		configuration.family,
		createSubseed(configuration.masterSeed, 'noise-field')
	);
	const pointCount = trajectory.pointCount;
	const warpedPositions = trajectory.normalizedPositions.slice();
	const displacement = new Float64Array(pointCount * 3);
	const value01 = new Float64Array(pointCount);
	const gradient01 = new Float64Array(pointCount);
	const curlAngle01 = new Float64Array(pointCount);
	const cellBoundary01 = new Float64Array(pointCount);
	const influence = configuration.influence;
	for (let index = 0; index < pointCount; index += 1) {
		const offset = index * 3;
		const x = trajectory.normalizedPositions[offset];
		const y = trajectory.normalizedPositions[offset + 1];
		const z = trajectory.normalizedPositions[offset + 2];
		const sample = field.sample(
			x * SPACE_SCALE,
			y * SPACE_SCALE,
			z * SPACE_SCALE,
			trajectory.simulationTimes[index] * phaseRate
		);
		displacement[offset] = sample.displacement[0];
		displacement[offset + 1] = sample.displacement[1];
		displacement[offset + 2] = sample.displacement[2];
		value01[index] = clamp01(0.5 + (sample.value01 - 0.5) * influence);
		gradient01[index] = clamp01(sample.gradient01 * influence);
		curlAngle01[index] = clamp01(0.5 + (sample.curlAngle01 - 0.5) * influence);
		cellBoundary01[index] = clamp01(sample.cellBoundary01 * influence);
		if (configuration.lens === 'warp' && influence > 0) {
			warpedPositions[offset] = x + sample.displacement[0] * WARP_SCALE * influence;
			warpedPositions[offset + 1] = y + sample.displacement[1] * WARP_SCALE * influence;
			warpedPositions[offset + 2] = z + sample.displacement[2] * WARP_SCALE * influence;
		}
		if ((index + 1) % 2_048 === 0 || index + 1 === pointCount) {
			options.onProgress?.({
				phase: 'weather',
				completed: index + 1,
				total: pointCount,
				progress01: (index + 1) / pointCount
			});
		}
	}
	return {
		family: configuration.family,
		lens: configuration.lens,
		influence,
		warpedPositions,
		displacement,
		value01,
		gradient01,
		curlAngle01,
		cellBoundary01
	};
}
