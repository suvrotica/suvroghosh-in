export type SamplingMethod = 'pseudorandom' | 'stratified' | 'halton';

export type ErrorDisplay = 'absolute' | 'percentage';

export type ChartMode = 'estimate' | 'error';

export type SamplePoint = {
	x: number;
	y: number;
};

export type MonteCarloSettings = {
	seed: number;
	method: SamplingMethod;
	targetSamples: number;
	visiblePointCap: number;
};

export type ConfidenceInterval = {
	lower: number;
	upper: number;
};

export type MonteCarloStatistics = {
	totalSamples: number;
	insideSamples: number;
	displayedSamples: number;
	estimate: number | null;
	absoluteError: number | null;
	percentageError: number | null;
	iidReferenceStandardError: number | null;
	standardError: number | null;
	confidenceInterval: ConfidenceInterval | null;
};

export type ConvergenceObservation = {
	sampleCount: number;
	estimate: number;
	absoluteError: number;
	percentageError: number;
	standardError: number | null;
};

export type GenerationResult = {
	generated: number;
	visibleStart: number;
	visibleEnd: number;
	completed: boolean;
};

export const TARGET_SAMPLE_OPTIONS = [100, 1_000, 10_000, 100_000, 1_000_000] as const;

export const MINIMUM_CONFIDENCE_SAMPLES = 30;
