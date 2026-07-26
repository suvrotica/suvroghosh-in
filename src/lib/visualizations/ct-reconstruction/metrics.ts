import type { ReconstructionMetrics } from './types';

function validatePair(reference: ArrayLike<number>, estimate: ArrayLike<number>): void {
	if (reference.length === 0 || reference.length !== estimate.length) {
		throw new RangeError('Metric arrays must have equal, non-zero lengths.');
	}
	for (let index = 0; index < reference.length; index += 1) {
		if (!Number.isFinite(reference[index]) || !Number.isFinite(estimate[index])) {
			throw new RangeError('Metric arrays must contain only finite values.');
		}
	}
}

export function computeMetrics(
	reference: ArrayLike<number>,
	estimate: ArrayLike<number>
): ReconstructionMetrics {
	validatePair(reference, estimate);
	let squaredError = 0;
	let absoluteError = 0;
	let referenceMinimum = Number.POSITIVE_INFINITY;
	let referenceMaximum = Number.NEGATIVE_INFINITY;
	let referenceSquared = 0;
	let estimateSquared = 0;
	let crossProduct = 0;
	let referenceMean = 0;
	let estimateMean = 0;
	for (let index = 0; index < reference.length; index += 1) {
		const expected = reference[index];
		const actual = estimate[index];
		const difference = actual - expected;
		squaredError += difference * difference;
		absoluteError += Math.abs(difference);
		referenceSquared += expected * expected;
		estimateSquared += actual * actual;
		crossProduct += expected * actual;
		referenceMinimum = Math.min(referenceMinimum, expected);
		referenceMaximum = Math.max(referenceMaximum, expected);
		referenceMean += expected;
		estimateMean += actual;
	}
	referenceMean /= reference.length;
	estimateMean /= reference.length;

	let covariance = 0;
	let referenceVariance = 0;
	let estimateVariance = 0;
	for (let index = 0; index < reference.length; index += 1) {
		const centeredReference = reference[index] - referenceMean;
		const centeredEstimate = estimate[index] - estimateMean;
		covariance += centeredReference * centeredEstimate;
		referenceVariance += centeredReference * centeredReference;
		estimateVariance += centeredEstimate * centeredEstimate;
	}

	const rmse = Math.sqrt(squaredError / reference.length);
	const dynamicRange = referenceMaximum - referenceMinimum;
	const normalizedRmse = dynamicRange > 0 ? rmse / dynamicRange : rmse;
	const optimalScale = estimateSquared > 0 ? crossProduct / estimateSquared : 0;
	let scaledSquaredError = 0;
	for (let index = 0; index < reference.length; index += 1) {
		const difference = optimalScale * estimate[index] - reference[index];
		scaledSquaredError += difference * difference;
	}
	const referenceRms = Math.sqrt(referenceSquared / reference.length);
	const scaleInvariantRmse =
		referenceRms > 0 ? Math.sqrt(scaledSquaredError / reference.length) / referenceRms : 0;
	const correlationDenominator = Math.sqrt(referenceVariance * estimateVariance);
	const correlation =
		correlationDenominator > 0
			? covariance / correlationDenominator
			: referenceVariance === 0
				? 1
				: 0;
	const peakSignalToNoiseRatio =
		rmse === 0
			? Number.POSITIVE_INFINITY
			: dynamicRange > 0
				? 20 * Math.log10(dynamicRange / rmse)
				: Number.NEGATIVE_INFINITY;

	return {
		rmse,
		normalizedRmse,
		scaleInvariantRmse,
		mae: absoluteError / reference.length,
		correlation: Math.max(-1, Math.min(1, correlation)),
		peakSignalToNoiseRatio
	};
}
