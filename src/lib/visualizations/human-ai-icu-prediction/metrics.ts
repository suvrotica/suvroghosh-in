import { NamedSeedPrng } from './prng';
import type {
	BinaryOutcome,
	CohortEvaluation,
	CohortMetrics,
	DisplaySampleOptions,
	EvaluatedSyntheticCase,
	ForecastValues,
	SimulatedSyntheticCase,
	SyntheticCohort,
	WeightCurve
} from './types';

function assertAligned(predictions: readonly number[], outcomes: readonly BinaryOutcome[]): void {
	if (predictions.length === 0 || predictions.length !== outcomes.length) {
		throw new RangeError('Predictions and outcomes must have the same non-zero length.');
	}
	for (const prediction of predictions) {
		if (!Number.isFinite(prediction) || prediction < 0 || prediction > 1) {
			throw new RangeError('Predictions must be finite probabilities in [0, 1].');
		}
	}
	for (const outcome of outcomes) {
		if (outcome !== 0 && outcome !== 1) {
			throw new RangeError('Outcomes must be binary zero-or-one values.');
		}
	}
}

function arithmeticMean(values: readonly number[]): number {
	if (values.length === 0) throw new RangeError('Cannot take the mean of an empty sequence.');
	let sum = 0;
	for (const value of values) sum += value;
	return sum / values.length;
}

export function brierScore(
	predictions: readonly number[],
	outcomes: readonly BinaryOutcome[]
): number {
	assertAligned(predictions, outcomes);
	let squaredErrorSum = 0;
	for (let index = 0; index < predictions.length; index += 1) {
		const error = predictions[index] - outcomes[index];
		squaredErrorSum += error * error;
	}
	return squaredErrorSum / predictions.length;
}

/** Mann–Whitney AUC with average ranks for ties; null explicitly means one class is absent. */
export function areaUnderRocCurve(
	predictions: readonly number[],
	outcomes: readonly BinaryOutcome[]
): number | null {
	assertAligned(predictions, outcomes);
	const pairs = predictions
		.map((prediction, index) => ({ prediction, outcome: outcomes[index] }))
		.sort((left, right) => left.prediction - right.prediction);
	const positiveCount = outcomes.reduce<number>((sum, outcome) => sum + outcome, 0);
	const negativeCount = outcomes.length - positiveCount;
	if (positiveCount === 0 || negativeCount === 0) return null;

	let positiveRankSum = 0;
	let start = 0;
	while (start < pairs.length) {
		let end = start + 1;
		while (end < pairs.length && pairs[end].prediction === pairs[start].prediction) end += 1;
		const averageOneBasedRank = (start + 1 + end) / 2;
		for (let index = start; index < end; index += 1) {
			if (pairs[index].outcome === 1) positiveRankSum += averageOneBasedRank;
		}
		start = end;
	}

	return (
		(positiveRankSum - (positiveCount * (positiveCount + 1)) / 2) / (positiveCount * negativeCount)
	);
}

export const auc = areaUnderRocCurve;

/** Returns null for empty, non-finite, or effectively constant inputs. */
export function pearsonCorrelation(
	left: readonly number[],
	right: readonly number[]
): number | null {
	if (left.length < 2 || left.length !== right.length) return null;
	if (
		left.some((value) => !Number.isFinite(value)) ||
		right.some((value) => !Number.isFinite(value))
	) {
		return null;
	}
	const leftMean = arithmeticMean(left);
	const rightMean = arithmeticMean(right);
	let cross = 0;
	let leftSquares = 0;
	let rightSquares = 0;
	let leftMagnitude = 0;
	let rightMagnitude = 0;
	for (let index = 0; index < left.length; index += 1) {
		const leftDeviation = left[index] - leftMean;
		const rightDeviation = right[index] - rightMean;
		cross += leftDeviation * rightDeviation;
		leftSquares += leftDeviation * leftDeviation;
		rightSquares += rightDeviation * rightDeviation;
		leftMagnitude += left[index] * left[index];
		rightMagnitude += right[index] * right[index];
	}
	const leftThreshold = Number.EPSILON * Math.max(1, leftMagnitude);
	const rightThreshold = Number.EPSILON * Math.max(1, rightMagnitude);
	if (leftSquares <= leftThreshold || rightSquares <= rightThreshold) return null;
	const correlation = cross / Math.sqrt(leftSquares * rightSquares);
	if (!Number.isFinite(correlation)) return null;
	return Math.max(-1, Math.min(1, correlation));
}

function caseProbabilities(
	cases: readonly SimulatedSyntheticCase[],
	forecast: keyof ForecastValues
): number[] {
	return cases.map((syntheticCase) => syntheticCase.probabilities[forecast]);
}

function squaredLoss(probability: number, outcome: BinaryOutcome): number {
	const error = probability - outcome;
	return error * error;
}

export function evaluateCohort(cohort: SyntheticCohort): CohortEvaluation {
	if (cohort.cases.length === 0) {
		throw new RangeError('Cannot evaluate an empty synthetic cohort.');
	}
	const outcomes = cohort.cases.map((syntheticCase) => syntheticCase.outcome);
	const clinicianPredictions = caseProbabilities(cohort.cases, 'clinician');
	const modelPredictions = caseProbabilities(cohort.cases, 'model');
	const ensemblePredictions = caseProbabilities(cohort.cases, 'ensemble');
	const evaluatedCases = cohort.cases.map(
		(syntheticCase): EvaluatedSyntheticCase => ({
			...syntheticCase,
			squaredLosses: {
				clinician: squaredLoss(syntheticCase.probabilities.clinician, syntheticCase.outcome),
				model: squaredLoss(syntheticCase.probabilities.model, syntheticCase.outcome),
				ensemble: squaredLoss(syntheticCase.probabilities.ensemble, syntheticCase.outcome)
			}
		})
	);

	const eventCount = outcomes.reduce<number>((sum, outcome) => sum + outcome, 0);
	const observedEventRate = eventCount / outcomes.length;
	const clinicianBrier = brierScore(clinicianPredictions, outcomes);
	const modelBrier = brierScore(modelPredictions, outcomes);
	const ensembleBrier = brierScore(ensemblePredictions, outcomes);
	let crossErrorTerm = 0;
	let predictionDifferenceSquares = 0;
	for (let index = 0; index < outcomes.length; index += 1) {
		crossErrorTerm +=
			(clinicianPredictions[index] - outcomes[index]) * (modelPredictions[index] - outcomes[index]);
		const predictionDifference = clinicianPredictions[index] - modelPredictions[index];
		predictionDifferenceSquares += predictionDifference * predictionDifference;
	}
	crossErrorTerm /= outcomes.length;
	predictionDifferenceSquares /= outcomes.length;

	const weight = cohort.config.clinicianWeight;
	const weightedAverageLoss = weight * clinicianBrier + (1 - weight) * modelBrier;
	const diversityTerm = weight * (1 - weight) * predictionDifferenceSquares;
	const crossTermIdentity =
		weight * weight * clinicianBrier +
		(1 - weight) * (1 - weight) * modelBrier +
		2 * weight * (1 - weight) * crossErrorTerm;

	const brierScores = {
		clinician: clinicianBrier,
		model: modelBrier,
		ensemble: ensembleBrier,
		constantPrevalence: observedEventRate * (1 - observedEventRate)
	};
	const metrics: CohortMetrics = {
		cohortSize: outcomes.length,
		eventCount,
		observedEventRate,
		clinicianWeight: weight,
		configuredResidualCorrelation: cohort.config.sharedResidualCorrelation,
		brierScores,
		meanPredictions: {
			clinician: arithmeticMean(clinicianPredictions),
			model: arithmeticMean(modelPredictions),
			ensemble: arithmeticMean(ensemblePredictions)
		},
		realizedAuc: {
			clinician: areaUnderRocCurve(clinicianPredictions, outcomes),
			model: areaUnderRocCurve(modelPredictions, outcomes),
			ensemble: areaUnderRocCurve(ensemblePredictions, outcomes)
		},
		ensembleGain: Math.min(clinicianBrier, modelBrier) - ensembleBrier,
		crossErrorTerm,
		weightedAverageLoss,
		diversityTerm,
		crossTermIdentityResidual: ensembleBrier - crossTermIdentity,
		weightedAverageIdentityResidual: weightedAverageLoss - ensembleBrier - diversityTerm,
		correlations: {
			latentResiduals: pearsonCorrelation(
				cohort.cases.map((syntheticCase) => syntheticCase.latent.clinician.residual),
				cohort.cases.map((syntheticCase) => syntheticCase.latent.model.residual)
			),
			casewiseSquaredLosses: pearsonCorrelation(
				evaluatedCases.map((syntheticCase) => syntheticCase.squaredLosses.clinician),
				evaluatedCases.map((syntheticCase) => syntheticCase.squaredLosses.model)
			)
		}
	};

	return { cases: evaluatedCases, metrics };
}

function meanSquaredPredictionDifference(cases: readonly SimulatedSyntheticCase[]): number {
	let sum = 0;
	for (const syntheticCase of cases) {
		const difference = syntheticCase.probabilities.clinician - syntheticCase.probabilities.model;
		sum += difference * difference;
	}
	return sum / cases.length;
}

export function hindsightOptimalWeight(cases: readonly SimulatedSyntheticCase[]): number | null {
	if (cases.length === 0) return null;
	const meanSquaredDifference = meanSquaredPredictionDifference(cases);
	if (meanSquaredDifference <= 1e-14) return null;
	let numerator = 0;
	for (const syntheticCase of cases) {
		const difference = syntheticCase.probabilities.clinician - syntheticCase.probabilities.model;
		const modelError = syntheticCase.probabilities.model - syntheticCase.outcome;
		numerator += modelError * difference;
	}
	const unconstrainedWeight = -(numerator / cases.length) / meanSquaredDifference;
	return Math.max(0, Math.min(1, unconstrainedWeight));
}

export function ensembleBrierAtWeight(
	cases: readonly SimulatedSyntheticCase[],
	clinicianWeight: number
): number {
	if (cases.length === 0) throw new RangeError('Cannot score an empty synthetic cohort.');
	if (!Number.isFinite(clinicianWeight) || clinicianWeight < 0 || clinicianWeight > 1) {
		throw new RangeError('Clinician weight must be finite and lie in [0, 1].');
	}
	let sum = 0;
	for (const syntheticCase of cases) {
		const probability =
			clinicianWeight * syntheticCase.probabilities.clinician +
			(1 - clinicianWeight) * syntheticCase.probabilities.model;
		const error = probability - syntheticCase.outcome;
		sum += error * error;
	}
	return sum / cases.length;
}

export function buildWeightCurve(
	cases: readonly SimulatedSyntheticCase[],
	steps = 100
): WeightCurve {
	if (!Number.isSafeInteger(steps) || steps <= 0) {
		throw new RangeError('Weight-curve steps must be a positive safe integer.');
	}
	if (cases.length === 0) {
		return {
			points: [],
			hindsightOptimalWeight: null,
			hindsightMinimumBrier: null,
			identifiable: false
		};
	}
	const optimalWeight = hindsightOptimalWeight(cases);
	return {
		points: Array.from({ length: steps + 1 }, (_, index) => {
			const clinicianWeight = index / steps;
			return {
				clinicianWeight,
				brierScore: ensembleBrierAtWeight(cases, clinicianWeight)
			};
		}),
		hindsightOptimalWeight: optimalWeight,
		hindsightMinimumBrier:
			optimalWeight === null ? null : ensembleBrierAtWeight(cases, optimalWeight),
		identifiable: optimalWeight !== null
	};
}

/** Chooses the deterministic 85th-percentile disagreement, avoiding the single largest outlier. */
export function selectModerateDisagreementCase(
	cases: readonly SimulatedSyntheticCase[]
): number | null {
	if (cases.length === 0) return null;
	const ranked = cases
		.map((syntheticCase) => ({
			index: syntheticCase.index,
			disagreement: Math.abs(
				syntheticCase.probabilities.clinician - syntheticCase.probabilities.model
			)
		}))
		.sort((left, right) => left.disagreement - right.disagreement || left.index - right.index);
	const targetRank = Math.round(0.85 * (ranked.length - 1));
	return ranked[targetRank].index;
}

export function sampleCasesForDisplay<T extends { readonly index: number }>(
	cases: readonly T[],
	options: DisplaySampleOptions = {}
): readonly T[] {
	const maximum = options.maximum ?? 600;
	if (!Number.isSafeInteger(maximum) || maximum <= 0) {
		throw new RangeError('Display-sample maximum must be a positive safe integer.');
	}
	if (cases.length <= maximum) return [...cases];

	const includeCase =
		options.includeCaseIndex == null
			? undefined
			: cases.find((syntheticCase) => syntheticCase.index === options.includeCaseIndex);
	const candidates = includeCase
		? cases.filter((syntheticCase) => syntheticCase.index !== includeCase.index)
		: [...cases];
	const random = new NamedSeedPrng(options.seed ?? 'icu-lab-display-sample-v1');
	const selectionCount = maximum - (includeCase ? 1 : 0);

	for (let index = 0; index < selectionCount; index += 1) {
		const swapIndex = index + Math.floor(random.nextOpenUnit() * (candidates.length - index));
		[candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
	}
	const selected = candidates.slice(0, selectionCount);
	if (includeCase) selected.push(includeCase);
	return selected.sort((left, right) => left.index - right.index);
}

export function formatMetric(value: number | null, fractionDigits = 3): string {
	if (value === null || !Number.isFinite(value)) return '—';
	if (!Number.isSafeInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 20) {
		throw new RangeError('Metric fraction digits must be a safe integer in [0, 20].');
	}
	return value.toFixed(fractionDigits);
}
