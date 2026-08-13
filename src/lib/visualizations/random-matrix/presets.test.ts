import { describe, expect, it } from 'vitest';
import { DEFAULT_RANDOM_MATRIX_STATE } from './constants';
import { RANDOM_MATRIX_PRESETS, stateForPreset } from './presets';
import type { MatrixPresetId, RandomMatrixState } from './types';

const MODEL_FIELDS = [
	'dimension',
	'aspectRatio',
	'distribution',
	'mean',
	'scale',
	'normalization',
	'symmetry',
	'sparsity',
	'signalType',
	'signalStrength',
	'lens',
	'theory'
] as const satisfies readonly (keyof RandomMatrixState)[];

const EXPECTED_MODELS = {
	'circular-cloud': {
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
		theory: true
	},
	'wigner-moonrise': {
		dimension: 96,
		aspectRatio: 0.75,
		distribution: 'gaussian',
		mean: 0,
		scale: 1,
		normalization: 'variance-1/n',
		symmetry: 'symmetric',
		sparsity: 0,
		signalType: 'none',
		signalStrength: 0,
		lens: 'spectral-sky',
		theory: true
	},
	'wishart-ridge': {
		dimension: 72,
		aspectRatio: 0.75,
		distribution: 'gaussian',
		mean: 0,
		scale: 1,
		normalization: 'unscaled',
		symmetry: 'symmetric',
		sparsity: 0,
		signalType: 'none',
		signalStrength: 0,
		lens: 'singular-mountain',
		theory: true
	},
	'universality-test': {
		dimension: 64,
		aspectRatio: 0.75,
		distribution: 'rademacher',
		mean: 0,
		scale: 1,
		normalization: 'variance-1/n',
		symmetry: 'none',
		sparsity: 0,
		signalType: 'none',
		signalStrength: 0,
		lens: 'ensemble-laboratory',
		theory: true
	},
	'hidden-rank-one-signal': {
		dimension: 72,
		aspectRatio: 0.75,
		distribution: 'gaussian',
		mean: 0,
		scale: 1,
		normalization: 'variance-1/n',
		symmetry: 'symmetric',
		sparsity: 0,
		signalType: 'rank-one',
		signalStrength: 1.35,
		lens: 'structure-detector',
		theory: true
	},
	'sparse-galaxy': {
		dimension: 96,
		aspectRatio: 0.75,
		distribution: 'rademacher',
		mean: 0,
		scale: 1,
		normalization: 'variance-1/n',
		symmetry: 'symmetric',
		sparsity: 0.9,
		signalType: 'none',
		signalStrength: 0,
		lens: 'spectral-sky',
		theory: true
	},
	'same-spectrum-different-face': {
		dimension: 48,
		aspectRatio: 0.75,
		distribution: 'gaussian',
		mean: 0,
		scale: 1,
		normalization: 'variance-1/n',
		symmetry: 'symmetric',
		sparsity: 0,
		signalType: 'diagonal-band',
		signalStrength: 0.8,
		lens: 'microscope',
		theory: true
	},
	'non-normal-trap': {
		dimension: 24,
		aspectRatio: 0.75,
		distribution: 'gaussian',
		mean: 0,
		scale: 1,
		normalization: 'unscaled',
		symmetry: 'none',
		sparsity: 0,
		signalType: 'none',
		signalStrength: 0,
		lens: 'direction-machine',
		theory: false
	}
} as const satisfies Record<MatrixPresetId, Pick<RandomMatrixState, (typeof MODEL_FIELDS)[number]>>;

function modelState(state: RandomMatrixState) {
	return Object.fromEntries(MODEL_FIELDS.map((field) => [field, state[field]]));
}

describe('random-matrix presets', () => {
	it('defines all eight named presets as canonical scientific states', () => {
		expect(RANDOM_MATRIX_PRESETS).toHaveLength(8);
		expect(RANDOM_MATRIX_PRESETS.map(({ id }) => id)).toEqual(Object.keys(EXPECTED_MODELS));

		for (const preset of RANDOM_MATRIX_PRESETS) {
			expect(modelState(stateForPreset(preset.id)), preset.id).toEqual(EXPECTED_MODELS[preset.id]);
		}
	});

	it('does not carry non-normal or ad-hoc model fields into another preset', () => {
		const contaminated: RandomMatrixState = {
			...stateForPreset('non-normal-trap'),
			seed: 'keep-this-realisation',
			dimension: 211,
			aspectRatio: 1.9,
			distribution: 'uniform',
			mean: 2.5,
			scale: 4.75,
			normalization: 'spectral-radius',
			symmetry: 'none',
			sparsity: 0.77,
			signalType: 'toeplitz',
			signalStrength: 8,
			lens: 'direction-machine',
			mode: 'ensemble',
			sampleCount: 173,
			theory: false,
			colorScale: 'absolute',
			highContrast: true
		};

		for (const { id } of RANDOM_MATRIX_PRESETS) {
			const selected = stateForPreset(id, contaminated);

			expect(modelState(selected), id).toEqual(EXPECTED_MODELS[id]);
			expect(selected).toMatchObject({
				seed: 'keep-this-realisation',
				mode: 'ensemble',
				sampleCount: 173,
				colorScale: 'absolute',
				highContrast: true
			});
		}
	});

	it('preserves only scientifically neutral user and presentation choices', () => {
		const base: RandomMatrixState = {
			...DEFAULT_RANDOM_MATRIX_STATE,
			seed: 'presentation-state',
			mode: 'ensemble',
			sampleCount: 321,
			colorScale: 'sequential',
			highContrast: true,
			mean: -3,
			scale: 9,
			theory: false
		};
		const selected = stateForPreset('circular-cloud', base);

		expect(selected).toMatchObject({
			seed: 'presentation-state',
			mode: 'ensemble',
			sampleCount: 321,
			colorScale: 'sequential',
			highContrast: true,
			mean: 0,
			scale: 1,
			theory: true
		});
	});
});
