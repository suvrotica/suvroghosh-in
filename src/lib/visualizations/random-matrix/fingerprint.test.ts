import { describe, expect, it } from 'vitest';
import { DEFAULT_RANDOM_MATRIX_STATE } from './constants';
import {
	hasRandomMatrixParameterFingerprint,
	randomMatrixParameterFingerprint
} from './fingerprint';
import type { RandomMatrixState } from './types';

describe('random-matrix generative parameter fingerprints', () => {
	it.each([
		['preset', 'wigner-moonrise'],
		['seed', 'another-seed'],
		['dimension', 65],
		['distribution', 'uniform'],
		['mean', 0.25],
		['scale', 1.5],
		['symmetry', 'symmetric'],
		['sparsity', 0.3],
		['aspectRatio', 1.25],
		['normalization', 'unscaled'],
		['signalType', 'rank-one'],
		['signalStrength', 1.75]
	] as const)('changes when %s changes', (key, value) => {
		const baseline = randomMatrixParameterFingerprint(DEFAULT_RANDOM_MATRIX_STATE);
		const changed = randomMatrixParameterFingerprint({
			...DEFAULT_RANDOM_MATRIX_STATE,
			[key]: value
		} as RandomMatrixState);
		expect(changed).not.toBe(baseline);
	});

	it.each([
		['lens', 'spectral-sky'],
		['mode', 'ensemble'],
		['sampleCount', 17],
		['theory', false],
		['colorScale', 'sequential'],
		['highContrast', true]
	] as const)('does not change for display/orchestration field %s', (key, value) => {
		const baseline = randomMatrixParameterFingerprint(DEFAULT_RANDOM_MATRIX_STATE);
		const changed = randomMatrixParameterFingerprint({
			...DEFAULT_RANDOM_MATRIX_STATE,
			[key]: value
		} as RandomMatrixState);
		expect(changed).toBe(baseline);
	});

	it('uses normalized state and validates exact state/fingerprint pairs', () => {
		const baseline = randomMatrixParameterFingerprint(DEFAULT_RANDOM_MATRIX_STATE);
		const equivalent = {
			...DEFAULT_RANDOM_MATRIX_STATE,
			seed: `  ${DEFAULT_RANDOM_MATRIX_STATE.seed}  `,
			dimension: DEFAULT_RANDOM_MATRIX_STATE.dimension + 0.1
		};
		expect(randomMatrixParameterFingerprint(equivalent)).toBe(baseline);
		expect(hasRandomMatrixParameterFingerprint(baseline, DEFAULT_RANDOM_MATRIX_STATE)).toBe(true);
		expect(
			hasRandomMatrixParameterFingerprint(baseline, {
				...DEFAULT_RANDOM_MATRIX_STATE,
				distribution: 'rademacher'
			})
		).toBe(false);
	});
});
