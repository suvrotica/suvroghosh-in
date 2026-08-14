export type LensId =
	| 'matrix'
	| 'spectrum'
	| 'singular-values'
	| 'direction'
	| 'structure'
	| 'ensemble';

export type MatrixMode = 'single' | 'ensemble';
export type MatrixDistribution = 'gaussian' | 'uniform' | 'rademacher';
export type MatrixNormalisation = 'variance-1/n' | 'unscaled' | 'frobenius' | 'spectral-radius';
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
export type ColourScale = 'diverging' | 'sequential';
export type MatrixDisplayMode = 'raw' | 'standardised' | 'absolute' | 'threshold';
export type MatrixRearrangement =
	| 'original'
	| 'shuffle'
	| 'joint-permutation'
	| 'orthogonal-basis'
	| 'row-norm'
	| 'spectral-order';

export type PresetId =
	| 'circular-cloud'
	| 'wigner-moonrise'
	| 'wishart-ridge'
	| 'universality-test'
	| 'hidden-rank-one'
	| 'sparse-galaxy'
	| 'same-spectrum'
	| 'non-normal-trap';

export interface ExperimentStateView {
	seed: string;
	preset: PresetId;
	dimension: number;
	aspectRatio: number;
	distribution: MatrixDistribution;
	mean: number;
	scale: number;
	normalisation: MatrixNormalisation;
	symmetry: MatrixSymmetry;
	sparsity: number;
	signalType: SignalType;
	signalStrength: number;
	lens: LensId;
	mode: MatrixMode;
	sampleCount: number;
	theory: boolean;
	colourScale: ColourScale;
	highContrast: boolean;
}

export interface ComplexSpectrumView {
	real: Float64Array;
	imaginary: Float64Array;
	residual?: number;
}

export interface SingularView {
	values: Float64Array;
	u?: Float64Array;
	v?: Float64Array;
	rank: number;
	tolerance: number;
	condition: number;
	residual?: number;
	cumulativeEnergy?: Float64Array;
}

export interface ScalarSummaryView {
	mean: number;
	standardDeviation: number;
	minimum: number;
	maximum: number;
	frobeniusNorm: number;
	spectralRadius: number;
}

export interface TheoryView {
	kind?: 'circular-law' | 'semicircle' | 'marchenko-pastur' | 'none';
	supportMinimum?: number;
	supportMaximum?: number;
	radius?: number;
	x?: Float64Array;
	density?: Float64Array;
	gamma?: number;
	atomAtZero?: number;
	/** Complete theory label for non-visible SVG descriptions. */
	accessibilityLabel?: string;
}

export interface MetricComparisonView {
	id: string;
	label: string;
	value: number;
	nullMean?: number;
	nullStandardDeviation?: number;
	percentile?: number;
	zScore?: number;
	twoSidedPValue?: number;
	validSampleCount?: number;
	description?: string;
	informative?: boolean;
}

export interface NullEnsembleView {
	samples: number;
	requestedSamples: number;
	metrics: readonly MetricComparisonView[];
	warnings?: readonly string[];
}

export interface EnsemblePointView {
	real: number;
	imaginary: number;
	sample: number;
}

export interface EnsembleSummaryView {
	completed: number;
	requested: number;
	spectralRadii: readonly number[];
	largestSingularValues: readonly number[];
	eigenvalues: readonly EnsemblePointView[];
}

export interface UniversalityComparisonView {
	dimension: number;
	mean: number;
	scale: number;
	normalisation: MatrixNormalisation;
	distributions: Readonly<Record<MatrixDistribution, EnsembleSummaryView>>;
}

export interface MatrixAnalysisView {
	matrix: Float64Array;
	rows: number;
	columns: number;
	eigen?: ComplexSpectrumView;
	singular?: SingularView;
	summary: ScalarSummaryView;
	theory?: TheoryView;
	warnings: readonly string[];
	comparisonMatrix?: Float64Array;
	comparisonEigenError?: number;
	reconstruction?: Float64Array;
	reconstructionRank?: number;
	reconstructionError?: number;
	metrics?: readonly MetricComparisonView[];
}

export type ComputePhase = 'idle' | 'loading' | 'working' | 'ready' | 'error';

export interface ExperimentCard {
	id: string;
	title: string;
	prompt: string;
	patch: Partial<ExperimentStateView>;
	rearrangement?: MatrixRearrangement;
}

export const LENSES: readonly { id: LensId; label: string; shortLabel: string }[] = [
	{ id: 'matrix', label: 'Matrix microscope', shortLabel: 'Matrix' },
	{ id: 'spectrum', label: 'Spectral sky', shortLabel: 'Spectrum' },
	{ id: 'singular-values', label: 'Singular-value mountain', shortLabel: 'Singular' },
	{ id: 'direction', label: 'Direction machine', shortLabel: 'Direction' },
	{ id: 'structure', label: 'Structure detector', shortLabel: 'Structure' },
	{ id: 'ensemble', label: 'Ensemble laboratory', shortLabel: 'Ensemble' }
] as const;

export const PRESET_LABELS: Readonly<Record<PresetId, string>> = {
	'circular-cloud': 'Circular cloud',
	'wigner-moonrise': 'Wigner moonrise',
	'wishart-ridge': 'Wishart ridge',
	'universality-test': 'Universality test',
	'hidden-rank-one': 'Hidden rank-one signal',
	'sparse-galaxy': 'Sparse galaxy',
	'same-spectrum': 'Same spectrum, different face',
	'non-normal-trap': 'Non-normal trap'
};

export function finiteNumber(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function formatNumber(value: unknown, digits = 4): string {
	if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
	if (value === 0) return '0';
	const magnitude = Math.abs(value);
	if (magnitude >= 10_000 || magnitude < 0.001) return value.toExponential(Math.min(4, digits));
	return value.toLocaleString('en-GB', {
		maximumFractionDigits: digits,
		useGrouping: false
	});
}
