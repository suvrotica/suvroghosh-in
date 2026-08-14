import type {
	MatrixAnalysis,
	MatrixLens,
	MatrixPresetId,
	MatrixRearrangement as EngineRearrangement,
	NullEnsembleResult,
	RandomMatrixState,
	TheoryOverlay
} from '$lib/visualizations/random-matrix';
import type {
	EnsembleSummaryView,
	ExperimentStateView,
	LensId,
	MatrixAnalysisView,
	MatrixRearrangement,
	MetricComparisonView,
	NullEnsembleView,
	PresetId,
	TheoryView
} from './types';

const lensToEngine: Readonly<Record<LensId, MatrixLens>> = {
	matrix: 'microscope',
	spectrum: 'spectral-sky',
	'singular-values': 'singular-mountain',
	direction: 'direction-machine',
	structure: 'structure-detector',
	ensemble: 'ensemble-laboratory'
};
const lensFromEngine: Readonly<Record<MatrixLens, LensId>> = {
	microscope: 'matrix',
	'spectral-sky': 'spectrum',
	'singular-mountain': 'singular-values',
	'direction-machine': 'direction',
	'structure-detector': 'structure',
	'ensemble-laboratory': 'ensemble'
};
const presetToEngine: Readonly<Record<PresetId, MatrixPresetId>> = {
	'circular-cloud': 'circular-cloud',
	'wigner-moonrise': 'wigner-moonrise',
	'wishart-ridge': 'wishart-ridge',
	'universality-test': 'universality-test',
	'hidden-rank-one': 'hidden-rank-one-signal',
	'sparse-galaxy': 'sparse-galaxy',
	'same-spectrum': 'same-spectrum-different-face',
	'non-normal-trap': 'non-normal-trap'
};
const presetFromEngine: Readonly<Record<MatrixPresetId, PresetId>> = {
	'circular-cloud': 'circular-cloud',
	'wigner-moonrise': 'wigner-moonrise',
	'wishart-ridge': 'wishart-ridge',
	'universality-test': 'universality-test',
	'hidden-rank-one-signal': 'hidden-rank-one',
	'sparse-galaxy': 'sparse-galaxy',
	'same-spectrum-different-face': 'same-spectrum',
	'non-normal-trap': 'non-normal-trap'
};
const rearrangementToEngine: Readonly<Record<MatrixRearrangement, EngineRearrangement>> = {
	original: 'original',
	shuffle: 'entry-shuffle',
	'joint-permutation': 'joint-permutation',
	'orthogonal-basis': 'orthogonal-similarity',
	'row-norm': 'row-norm',
	'spectral-order': 'spectral-order'
};

export function toEngineState(state: ExperimentStateView): RandomMatrixState {
	return {
		seed: state.seed,
		preset: presetToEngine[state.preset],
		dimension: state.dimension,
		aspectRatio: state.aspectRatio,
		distribution: state.distribution,
		mean: state.mean,
		scale: state.scale,
		normalization: state.normalisation,
		symmetry: state.symmetry,
		sparsity: state.sparsity,
		signalType: state.signalType,
		signalStrength: state.signalStrength,
		lens: lensToEngine[state.lens],
		mode: state.mode,
		sampleCount: state.sampleCount,
		theory: state.theory,
		colorScale: state.colourScale,
		highContrast: state.highContrast
	};
}

export function fromEngineState(state: RandomMatrixState): ExperimentStateView {
	return {
		seed: state.seed,
		preset: presetFromEngine[state.preset],
		dimension: state.dimension,
		aspectRatio: state.aspectRatio,
		distribution: state.distribution,
		mean: state.mean,
		scale: state.scale,
		normalisation: state.normalization,
		symmetry: state.symmetry,
		sparsity: state.sparsity,
		signalType: state.signalType,
		signalStrength: state.signalStrength,
		lens: lensFromEngine[state.lens],
		mode: state.mode,
		sampleCount: state.sampleCount,
		theory: state.theory,
		colourScale: state.colorScale === 'absolute' ? 'sequential' : state.colorScale,
		highContrast: state.highContrast
	};
}

export function toEngineRearrangement(value: MatrixRearrangement): EngineRearrangement {
	return rearrangementToEngine[value];
}

function adaptTheory(theory: TheoryOverlay | null): TheoryView | undefined {
	if (!theory) return undefined;
	if (theory.kind === 'circle') {
		return {
			kind: 'circular-law',
			radius: theory.radius,
			accessibilityLabel: theory.label
		};
	}
	return {
		kind: theory.kind,
		supportMinimum: theory.support[0],
		supportMaximum: theory.support[1],
		x: theory.x,
		density: theory.density,
		...(theory.gamma === undefined ? {} : { gamma: theory.gamma }),
		...(theory.atomAtZero === undefined ? {} : { atomAtZero: theory.atomAtZero }),
		accessibilityLabel: theory.label
	};
}

export function adaptAnalysis(analysis: MatrixAnalysis): MatrixAnalysisView {
	return {
		matrix: analysis.matrix,
		rows: analysis.rows,
		columns: analysis.columns,
		...(analysis.eigen
			? {
					eigen: {
						real: analysis.eigen.real,
						imaginary: analysis.eigen.imaginary,
						residual: analysis.eigen.residual
					}
				}
			: {}),
		singular: {
			values: analysis.singular.values,
			...(analysis.singular.u ? { u: analysis.singular.u } : {}),
			...(analysis.singular.v ? { v: analysis.singular.v } : {}),
			rank: analysis.singular.rank,
			tolerance: analysis.singular.tolerance,
			condition: analysis.singular.condition ?? Number.POSITIVE_INFINITY,
			residual: analysis.singular.residual,
			cumulativeEnergy: analysis.singular.cumulativeEnergy
		},
		summary: {
			mean: analysis.summary.mean,
			standardDeviation: analysis.summary.stddev,
			minimum: analysis.summary.min,
			maximum: analysis.summary.max,
			frobeniusNorm: analysis.summary.frobeniusNorm,
			spectralRadius: analysis.summary.spectralRadius ?? 0
		},
		...(adaptTheory(analysis.theory) ? { theory: adaptTheory(analysis.theory) } : {}),
		warnings: analysis.warnings,
		...(analysis.comparison
			? {
					comparisonMatrix: analysis.comparison.matrix,
					comparisonEigenError: analysis.comparison.maxEigenvalueDelta
				}
			: {}),
		...(analysis.singular.reconstruction
			? {
					reconstruction: analysis.singular.reconstruction,
					reconstructionRank: analysis.singular.reconstructionRank,
					reconstructionError: analysis.singular.reconstructionError
				}
			: {})
	};
}

const metricLabels = {
	largestSingularValue: ['Largest singular value', 'Largest one-step stretch measured by σ₁.'],
	spectralRadius: [
		'Spectral radius',
		'Largest eigenvalue magnitude, when an eigendecomposition is available.'
	],
	leadingEigenvalue: [
		'Leading eigenvalue',
		'Extreme real eigenvalue used only where that statistic is meaningful.'
	],
	inverseParticipationRatio: [
		'Eigenvector inverse participation ratio',
		'A localization statistic for the selected eigenvalue-magnitude rank.'
	],
	rowColumnCorrelation: [
		'Row/column correlation',
		'Aggregate correlation between row and column summaries.'
	],
	lowFrequencyPower: [
		'Low-frequency power',
		'Energy in coarse spatial modes of the displayed grid.'
	],
	blockContrast: ['Block contrast', 'Difference between within-block and between-block averages.']
} as const;

export function adaptNullResult(result: NullEnsembleResult): NullEnsembleView {
	const metrics: MetricComparisonView[] = Object.entries(result.metrics).map(([id, comparison]) => {
		const [label, description] = metricLabels[id as keyof typeof metricLabels];
		return {
			id,
			label,
			value: comparison.observed ?? Number.NaN,
			...(comparison.mean === null ? {} : { nullMean: comparison.mean }),
			...(comparison.stddev === null ? {} : { nullStandardDeviation: comparison.stddev }),
			...(comparison.percentile === null ? {} : { percentile: comparison.percentile }),
			...(comparison.zScore === null ? {} : { zScore: comparison.zScore }),
			...(comparison.twoSidedPValue === null ? {} : { twoSidedPValue: comparison.twoSidedPValue }),
			validSampleCount: comparison.validSampleCount,
			description,
			informative: !comparison.degenerate
		};
	});
	return {
		samples: result.sampleCount,
		requestedSamples: result.sampleCount,
		metrics,
		warnings: result.warnings
	};
}

export function emptyEnsembleSummary(requested: number): EnsembleSummaryView {
	return {
		completed: 0,
		requested,
		spectralRadii: [],
		largestSingularValues: [],
		eigenvalues: []
	};
}
