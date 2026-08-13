export const RANDOM_MATRIX_MODEL_VERSION = 'random-matrix-v1' as const;

export type MatrixPresetId =
	| 'circular-cloud'
	| 'wigner-moonrise'
	| 'wishart-ridge'
	| 'universality-test'
	| 'hidden-rank-one-signal'
	| 'sparse-galaxy'
	| 'same-spectrum-different-face'
	| 'non-normal-trap';

export type EntryDistribution = 'gaussian' | 'uniform' | 'rademacher';
export type MatrixNormalization = 'variance-1/n' | 'unscaled' | 'frobenius' | 'spectral-radius';
export type MatrixSymmetry = 'none' | 'symmetric';
export type SignalType =
	| 'none'
	| 'rank-one'
	| 'two-block'
	| 'diagonal-band'
	| 'toeplitz'
	| 'sparse-hubs'
	| 'repeated-motif'
	| 'nonzero-mean'
	| 'unequal-row-variance';
export type MatrixLens =
	| 'microscope'
	| 'spectral-sky'
	| 'singular-mountain'
	| 'direction-machine'
	| 'structure-detector'
	| 'ensemble-laboratory';
export type ExperimentMode = 'single' | 'ensemble';
export type MatrixColorScale = 'diverging' | 'sequential' | 'absolute';
export type MatrixRearrangement =
	| 'original'
	| 'entry-shuffle'
	| 'joint-permutation'
	| 'orthogonal-similarity'
	| 'row-norm'
	| 'spectral-order';

export interface RandomMatrixState {
	seed: string;
	preset: MatrixPresetId;
	dimension: number;
	aspectRatio: number;
	distribution: EntryDistribution;
	mean: number;
	scale: number;
	normalization: MatrixNormalization;
	symmetry: MatrixSymmetry;
	sparsity: number;
	signalType: SignalType;
	signalStrength: number;
	lens: MatrixLens;
	mode: ExperimentMode;
	sampleCount: number;
	theory: boolean;
	colorScale: MatrixColorScale;
	highContrast: boolean;
}

export interface MatrixComputeInput {
	state: RandomMatrixState;
	sampleIndex?: number;
	rearrangement?: MatrixRearrangement;
	reconstructionRank?: number;
	includeVectors?: boolean;
}

export interface MatrixSummary {
	mean: number;
	stddev: number;
	min: number;
	max: number;
	frobeniusNorm: number;
	spectralRadius: number | null;
	conditionNumber: number | null;
	rank: number;
	rowMeans: Float64Array;
	columnMeans: Float64Array;
	rowNorms: Float64Array;
	columnNorms: Float64Array;
}

export interface EigenAnalysis {
	real: Float64Array;
	imaginary: Float64Array;
	/**
	 * Row-major real storage. For a conjugate pair, adjacent columns hold the
	 * real and imaginary parts using ml-matrix's documented real block form.
	 */
	vectors?: Float64Array;
	residual: number;
	maxPairResidual: number;
	ipr?: Float64Array;
}

export interface SingularAnalysis {
	values: Float64Array;
	/** Row-major thin U (rows by values.length), when requested or reconstructing. */
	u?: Float64Array;
	/** Row-major thin V (columns by values.length), when requested or reconstructing. */
	v?: Float64Array;
	rank: number;
	tolerance: number;
	condition: number | null;
	residual: number;
	cumulativeEnergy: Float64Array;
	reconstruction?: Float64Array;
	reconstructionRank?: number;
	reconstructionError?: number;
}

export interface CircleTheoryOverlay {
	kind: 'circle';
	radius: number;
	centerReal: number;
	centerImaginary: number;
	label: string;
}

export interface DensityTheoryOverlay {
	kind: 'semicircle' | 'marchenko-pastur';
	support: readonly [number, number];
	x: Float64Array;
	density: Float64Array;
	label: string;
	atomAtZero?: number;
	gamma?: number;
}

export type TheoryOverlay = CircleTheoryOverlay | DensityTheoryOverlay;

export interface SameSpectrumComparison {
	kind: 'same-spectrum';
	matrix: Float64Array;
	maxEigenvalueDelta: number;
}

export interface MatrixAnalysis {
	modelVersion: typeof RANDOM_MATRIX_MODEL_VERSION;
	state: RandomMatrixState;
	sampleIndex: number;
	rearrangement: MatrixRearrangement;
	rows: number;
	columns: number;
	matrix: Float64Array;
	comparison?: SameSpectrumComparison;
	eigen?: EigenAnalysis;
	singular: SingularAnalysis;
	summary: MatrixSummary;
	theory: TheoryOverlay | null;
	warnings: string[];
}

export type NullMetric =
	| 'largestSingularValue'
	| 'spectralRadius'
	| 'leadingEigenvalue'
	| 'inverseParticipationRatio'
	| 'rowColumnCorrelation'
	| 'lowFrequencyPower'
	| 'blockContrast';

export type MetricValues = Record<NullMetric, number | null>;

export interface NullMetricComparison {
	observed: number | null;
	mean: number | null;
	stddev: number | null;
	zScore: number | null;
	percentile: number | null;
	/** Conservative two-sided Monte Carlo p-value with the finite-sample +1 correction. */
	twoSidedPValue: number | null;
	validSampleCount: number;
}

export interface NullEnsembleInput {
	state: RandomMatrixState;
	sampleCount: number;
	metrics?: readonly NullMetric[];
	/** Sample currently displayed as the observed matrix. Defaults to zero. */
	observedSampleIndex?: number;
	/** Eigenvector selected in the observed spectrum. Null draws compare its magnitude rank. */
	selectedEigenIndex?: number;
	/** Transformation currently applied to the displayed matrix. */
	rearrangement?: MatrixRearrangement;
	sampleIndexStart?: number;
}

export interface NullEnsembleProgress {
	completed: number;
	total: number;
}

export interface NullEnsembleResult {
	modelVersion: typeof RANDOM_MATRIX_MODEL_VERSION;
	state: RandomMatrixState;
	nullState: RandomMatrixState;
	sampleCount: number;
	observedSampleIndex: number;
	rearrangement: MatrixRearrangement;
	observed: MetricValues;
	metrics: Record<NullMetric, NullMetricComparison>;
	warnings: string[];
}

export interface GeneratedMatrix {
	rows: number;
	columns: number;
	values: Float64Array;
	symmetric: boolean;
	comparison?: Float64Array;
	warnings: string[];
}

export interface RearrangedMatrix {
	values: Float64Array;
	spectrumPreserving: boolean;
	label: string;
}

export interface MatrixPresetDefinition {
	id: MatrixPresetId;
	label: string;
	shortLabel: string;
	purpose: string;
	overrides: Partial<RandomMatrixState>;
}
