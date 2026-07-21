import {
	MINIMUM_CONFIDENCE_SAMPLES,
	type ConvergenceObservation,
	type MonteCarloStatistics
} from './types';

export function classifyPoint(x: number, y: number) {
	return x * x + y * y <= 1;
}

export function calculateStatistics(
	totalSamples: number,
	insideSamples: number,
	displayedSamples = totalSamples
): MonteCarloStatistics {
	if (totalSamples <= 0) {
		return {
			totalSamples: 0,
			insideSamples: 0,
			displayedSamples: 0,
			estimate: null,
			absoluteError: null,
			percentageError: null,
			standardError: null,
			confidenceInterval: null
		};
	}

	const proportion = insideSamples / totalSamples;
	const estimate = 4 * proportion;
	const absoluteError = Math.abs(estimate - Math.PI);
	const percentageError = (absoluteError / Math.PI) * 100;
	const standardError = 4 * Math.sqrt((proportion * (1 - proportion)) / totalSamples);
	const confidenceInterval =
		totalSamples >= MINIMUM_CONFIDENCE_SAMPLES
			? {
					lower: estimate - 1.96 * standardError,
					upper: estimate + 1.96 * standardError
				}
			: null;

	return {
		totalSamples,
		insideSamples,
		displayedSamples,
		estimate,
		absoluteError,
		percentageError,
		standardError,
		confidenceInterval
	};
}

export function statisticsObservation(
	totalSamples: number,
	insideSamples: number
): ConvergenceObservation {
	const statistics = calculateStatistics(totalSamples, insideSamples);
	return {
		sampleCount: totalSamples,
		estimate: statistics.estimate ?? 0,
		absoluteError: statistics.absoluteError ?? Math.PI,
		percentageError: statistics.percentageError ?? 100,
		standardError: statistics.standardError ?? 0
	};
}

export function checkpointCounts(targetSamples: number) {
	const target = Math.max(0, Math.floor(targetSamples));
	const checkpoints: number[] = [];
	for (let magnitude = 1; magnitude <= target; magnitude *= 10) {
		for (const multiplier of [1, 2, 5]) {
			const checkpoint = magnitude * multiplier;
			if (checkpoint >= 10 && checkpoint <= target) checkpoints.push(checkpoint);
		}
		if (magnitude > Number.MAX_SAFE_INTEGER / 10) break;
	}
	if (target > 0 && !checkpoints.includes(target)) checkpoints.push(target);
	return checkpoints.sort((first, second) => first - second);
}

export function theoreticalStandardError(sampleCount: number) {
	if (sampleCount <= 0) return 0;
	const trueProportion = Math.PI / 4;
	return 4 * Math.sqrt((trueProportion * (1 - trueProportion)) / sampleCount);
}
