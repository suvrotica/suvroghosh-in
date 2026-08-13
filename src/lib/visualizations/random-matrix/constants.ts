import type { NullMetric, RandomMatrixState } from './types';

export const MIN_MATRIX_DIMENSION = 2;
export const MAX_MATRIX_DIMENSION = 256;
export const MAX_NONSYMMETRIC_EVD_DIMENSION = 128;
export const MAX_SYMMETRIC_EVD_DIMENSION = 256;
export const MAX_SVD_DIMENSION = 256;
export const MAX_ENSEMBLE_SAMPLES = 400;
export const MAX_NULL_ENSEMBLE_SAMPLES = 256;
/** At least 40 null draws are needed before a two-sided 5% event is resolvable. */
export const MIN_NULL_SAMPLES_FOR_TAIL_INTERPRETATION = 40;
export const MAX_SEED_LENGTH = 96;
export const NUMERICAL_WARNING_TOLERANCE = 1e-9;
export const THEORY_SAMPLE_COUNT = 181;

export const ALL_NULL_METRICS = Object.freeze([
	'largestSingularValue',
	'spectralRadius',
	'leadingEigenvalue',
	'inverseParticipationRatio',
	'rowColumnCorrelation',
	'lowFrequencyPower',
	'blockContrast'
] as const satisfies readonly NullMetric[]);

export const DEFAULT_RANDOM_MATRIX_STATE = Object.freeze({
	seed: 'tramlight-circle-1847',
	preset: 'circular-cloud',
	dimension: 64,
	aspectRatio: 0.75,
	distribution: 'gaussian',
	mean: 0,
	scale: 1,
	normalization: 'variance-1/n',
	symmetry: 'none',
	sparsity: 0,
	signalType: 'none',
	signalStrength: 0,
	lens: 'spectral-sky',
	mode: 'single',
	sampleCount: 100,
	theory: true,
	colorScale: 'diverging',
	highContrast: false
} as const satisfies RandomMatrixState);

export function maximumEnsembleSamples(dimension: number): number {
	if (dimension <= 32) return MAX_ENSEMBLE_SAMPLES;
	if (dimension <= 64) return 200;
	if (dimension <= 96) return 100;
	if (dimension <= 128) return 50;
	if (dimension <= 192) return 20;
	return 10;
}
