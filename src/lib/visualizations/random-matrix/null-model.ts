import {
	ALL_NULL_METRICS,
	MAX_NULL_ENSEMBLE_SAMPLES,
	MIN_NULL_SAMPLES_FOR_TAIL_INTERPRETATION,
	maximumEnsembleSamples
} from './constants';
import { computeRandomMatrix } from './analysis';
import {
	calculateMetricValues,
	compareMetricToNull,
	eigenvalueMagnitudeRank,
	selectMetricValues
} from './statistics';
import type {
	NullEnsembleInput,
	NullEnsembleProgress,
	NullEnsembleResult,
	NullMetric,
	NullMetricComparison,
	MatrixRearrangement,
	RandomMatrixState
} from './types';
import { RANDOM_MATRIX_MODEL_VERSION } from './types';
import { normalizeRandomMatrixState } from './url-state';

export interface NullEnsembleOptions {
	shouldCancel?: () => boolean;
	yieldControl?: () => Promise<void>;
	onProgress?: (progress: NullEnsembleProgress) => void;
	yieldEvery?: number;
}

export class NullEnsembleCancelledError extends Error {
	constructor() {
		super('The null-ensemble calculation was cancelled.');
		this.name = 'NullEnsembleCancelledError';
	}
}

export async function runNullEnsemble(
	input: NullEnsembleInput,
	options: NullEnsembleOptions = {}
): Promise<NullEnsembleResult> {
	const state = normalizeRandomMatrixState(input.state);
	const maximum = Math.min(MAX_NULL_ENSEMBLE_SAMPLES, maximumEnsembleSamples(state.dimension));
	if (!Number.isFinite(input.sampleCount)) {
		throw new RangeError('Null-ensemble sample count must be finite.');
	}
	if (input.sampleIndexStart !== undefined && !Number.isFinite(input.sampleIndexStart)) {
		throw new RangeError('Null-ensemble sample index must be finite.');
	}
	if (input.observedSampleIndex !== undefined && !Number.isFinite(input.observedSampleIndex)) {
		throw new RangeError('Observed sample index must be finite.');
	}
	if (input.selectedEigenIndex !== undefined && !Number.isFinite(input.selectedEigenIndex)) {
		throw new RangeError('Selected eigenvalue index must be finite.');
	}
	const sampleCount = Math.max(1, Math.min(maximum, Math.round(input.sampleCount)));
	const observedSampleIndex = normalizeSampleIndex(input.observedSampleIndex ?? 0, 'Observed');
	const sampleIndexStart = normalizeSampleIndex(
		input.sampleIndexStart ?? observedSampleIndex + 1,
		'Null-ensemble'
	);
	const sampleIndexEnd = sampleIndexStart + sampleCount - 1;
	if (!Number.isSafeInteger(sampleIndexEnd)) {
		throw new RangeError('The null-ensemble sample-index range exceeds safe integer precision.');
	}
	if (observedSampleIndex >= sampleIndexStart && observedSampleIndex <= sampleIndexEnd) {
		throw new RangeError('The null ensemble cannot include the observed sample index.');
	}
	const rearrangement: MatrixRearrangement = input.rearrangement ?? 'original';
	const metrics = normalizeMetrics(input.metrics);
	const shouldCancel = options.shouldCancel ?? (() => false);
	const yieldControl = options.yieldControl ?? yieldToEventLoop;
	const yieldEvery = Math.max(1, Math.min(20, Math.round(options.yieldEvery ?? 2)));

	throwIfCancelled(shouldCancel);
	const observedAnalysis = computeRandomMatrix({
		state,
		sampleIndex: observedSampleIndex,
		rearrangement
	});
	const localizationMagnitudeRank = eigenvalueMagnitudeRank(
		observedAnalysis.eigen,
		input.selectedEigenIndex
	);
	const observed = selectMetricValues(
		calculateMetricValues(
			observedAnalysis.matrix,
			observedAnalysis.rows,
			observedAnalysis.columns,
			observedAnalysis.eigen,
			observedAnalysis.singular,
			observedAnalysis.summary,
			localizationMagnitudeRank
		),
		metrics
	);
	const nullState: RandomMatrixState = {
		...state,
		signalType: 'none',
		signalStrength: 0,
		mode: 'ensemble'
	};
	const samples = Object.fromEntries(
		ALL_NULL_METRICS.map((metric) => [metric, [] as (number | null)[]])
	) as Record<NullMetric, (number | null)[]>;

	for (let sample = 0; sample < sampleCount; sample += 1) {
		throwIfCancelled(shouldCancel);
		const analysis = computeRandomMatrix({
			state: nullState,
			sampleIndex: sampleIndexStart + sample,
			rearrangement
		});
		const values = calculateMetricValues(
			analysis.matrix,
			analysis.rows,
			analysis.columns,
			analysis.eigen,
			analysis.singular,
			analysis.summary,
			localizationMagnitudeRank
		);
		for (const metric of metrics) samples[metric].push(values[metric]);
		options.onProgress?.({ completed: sample + 1, total: sampleCount });
		if ((sample + 1) % yieldEvery === 0 && sample + 1 < sampleCount) {
			await yieldControl();
			throwIfCancelled(shouldCancel);
		}
	}

	const comparisons = Object.fromEntries(
		ALL_NULL_METRICS.map((metric) => [
			metric,
			metrics.includes(metric)
				? compareMetricToNull(observed[metric], samples[metric])
				: emptyComparison()
		])
	) as Record<NullMetric, NullMetricComparison>;
	const warnings: string[] = [];
	if (input.sampleCount > maximum) {
		warnings.push(`The null ensemble was capped at ${maximum} samples for n=${state.dimension}.`);
	}
	if (sampleCount < MIN_NULL_SAMPLES_FOR_TAIL_INTERPRETATION) {
		warnings.push(
			`At least ${MIN_NULL_SAMPLES_FOR_TAIL_INTERPRETATION} null samples are needed to resolve a two-sided 5% tail event.`
		);
	}
	warnings.push('Every comparison is conditional on the selected null model.');

	return {
		modelVersion: RANDOM_MATRIX_MODEL_VERSION,
		state,
		nullState,
		sampleCount,
		observedSampleIndex,
		rearrangement,
		observed,
		metrics: comparisons,
		warnings
	};
}

export function nullModelInterpretation(
	comparison: NullMetricComparison,
	sampleCount: number
):
	| 'insufficient ensemble samples'
	| 'ordinary under this null model'
	| 'unusual under this null model' {
	if (
		sampleCount < MIN_NULL_SAMPLES_FOR_TAIL_INTERPRETATION ||
		comparison.validSampleCount < MIN_NULL_SAMPLES_FOR_TAIL_INTERPRETATION ||
		comparison.twoSidedPValue === null
	) {
		return 'insufficient ensemble samples';
	}
	return comparison.twoSidedPValue <= 0.05
		? 'unusual under this null model'
		: 'ordinary under this null model';
}

function normalizeMetrics(metrics: readonly NullMetric[] | undefined): NullMetric[] {
	if (!metrics) return [...ALL_NULL_METRICS];
	const allowed = new Set<NullMetric>(ALL_NULL_METRICS);
	return [...new Set(metrics.filter((metric) => allowed.has(metric)))];
}

function emptyComparison(): NullMetricComparison {
	return {
		observed: null,
		mean: null,
		stddev: null,
		zScore: null,
		percentile: null,
		twoSidedPValue: null,
		validSampleCount: 0
	};
}

function throwIfCancelled(shouldCancel: () => boolean): void {
	if (shouldCancel()) throw new NullEnsembleCancelledError();
}

function normalizeSampleIndex(value: number, label: string): number {
	const rounded = Math.round(value);
	if (!Number.isSafeInteger(rounded) || rounded < 0) {
		throw new RangeError(`${label} sample index must be a non-negative safe integer.`);
	}
	return rounded;
}

function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
