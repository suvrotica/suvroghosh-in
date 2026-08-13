import { DEFAULT_RANDOM_MATRIX_STATE } from './constants';
import type { MatrixPresetDefinition, MatrixPresetId, RandomMatrixState } from './types';

export const RANDOM_MATRIX_PRESETS = Object.freeze([
	{
		id: 'circular-cloud',
		label: 'Circular cloud',
		shortLabel: 'Circular',
		purpose: 'IID real entries reveal the circular-law bulk in the complex plane.',
		overrides: {
			dimension: 64,
			distribution: 'gaussian',
			normalization: 'variance-1/n',
			symmetry: 'none',
			sparsity: 0,
			signalType: 'none',
			signalStrength: 0,
			lens: 'spectral-sky'
		}
	},
	{
		id: 'wigner-moonrise',
		label: 'Wigner moonrise',
		shortLabel: 'Wigner',
		purpose: 'A symmetric random heatmap produces the Wigner semicircle density.',
		overrides: {
			dimension: 96,
			distribution: 'gaussian',
			normalization: 'variance-1/n',
			symmetry: 'symmetric',
			sparsity: 0,
			signalType: 'none',
			signalStrength: 0,
			lens: 'spectral-sky'
		}
	},
	{
		id: 'wishart-ridge',
		label: 'Wishart ridge',
		shortLabel: 'Wishart',
		purpose: 'A sample covariance matrix approaches the Marchenko–Pastur law.',
		overrides: {
			dimension: 72,
			aspectRatio: 0.75,
			distribution: 'gaussian',
			normalization: 'unscaled',
			symmetry: 'symmetric',
			sparsity: 0,
			signalType: 'none',
			signalStrength: 0,
			lens: 'singular-mountain'
		}
	},
	{
		id: 'universality-test',
		label: 'Universality test',
		shortLabel: 'Universality',
		purpose: 'Match first two moments and compare Gaussian, uniform and Rademacher entries.',
		overrides: {
			dimension: 64,
			distribution: 'rademacher',
			normalization: 'variance-1/n',
			symmetry: 'none',
			sparsity: 0,
			signalType: 'none',
			signalStrength: 0,
			lens: 'ensemble-laboratory'
		}
	},
	{
		id: 'hidden-rank-one-signal',
		label: 'Hidden rank-one signal',
		shortLabel: 'Hidden signal',
		purpose: 'A low-rank spike detaches from a Wigner noise bulk as its strength grows.',
		overrides: {
			dimension: 72,
			distribution: 'gaussian',
			normalization: 'variance-1/n',
			symmetry: 'symmetric',
			sparsity: 0,
			signalType: 'rank-one',
			signalStrength: 1.35,
			lens: 'structure-detector'
		}
	},
	{
		id: 'sparse-galaxy',
		label: 'Sparse galaxy',
		shortLabel: 'Sparse',
		purpose:
			'Centered sparse adjacency-like matrices expose localization and sparse-regime failures.',
		overrides: {
			dimension: 96,
			distribution: 'rademacher',
			normalization: 'variance-1/n',
			symmetry: 'symmetric',
			sparsity: 0.9,
			signalType: 'none',
			signalStrength: 0,
			lens: 'spectral-sky'
		}
	},
	{
		id: 'same-spectrum-different-face',
		label: 'Same spectrum, different face',
		shortLabel: 'Same spectrum',
		purpose: 'Compare A with QᵀAQ: the heatmap changes while the spectrum stays fixed.',
		overrides: {
			dimension: 48,
			distribution: 'gaussian',
			normalization: 'variance-1/n',
			symmetry: 'symmetric',
			sparsity: 0,
			signalType: 'diagonal-band',
			signalStrength: 0.8,
			lens: 'microscope'
		}
	},
	{
		id: 'non-normal-trap',
		label: 'Non-normal trap',
		shortLabel: 'Non-normal',
		purpose:
			'An upper-triangular-dominant matrix shows transient growth that eigenvalues can hide.',
		overrides: {
			dimension: 24,
			distribution: 'gaussian',
			normalization: 'unscaled',
			symmetry: 'none',
			sparsity: 0,
			signalType: 'none',
			signalStrength: 0,
			lens: 'direction-machine',
			theory: false
		}
	}
] as const satisfies readonly MatrixPresetDefinition[]);

export const RANDOM_MATRIX_PRESET_BY_ID = Object.freeze(
	Object.fromEntries(RANDOM_MATRIX_PRESETS.map((preset) => [preset.id, preset])) as Record<
		MatrixPresetId,
		MatrixPresetDefinition
	>
);

export function stateForPreset(
	preset: MatrixPresetId,
	base: RandomMatrixState = { ...DEFAULT_RANDOM_MATRIX_STATE }
): RandomMatrixState {
	// A preset is a complete scientific starting point, not a patch over the
	// previous experiment. Preserve only identity/presentation choices that do
	// not change the ensemble; all model-defining fields are reset to the
	// documented defaults before the preset's canonical overrides are applied.
	return {
		...DEFAULT_RANDOM_MATRIX_STATE,
		seed: base.seed,
		mode: base.mode,
		sampleCount: base.sampleCount,
		colorScale: base.colorScale,
		highContrast: base.highContrast,
		...RANDOM_MATRIX_PRESET_BY_ID[preset].overrides,
		preset
	};
}
