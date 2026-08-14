import type { RandomMatrixState } from './types';
import { RANDOM_MATRIX_MODEL_VERSION } from './types';
import { normalizeRandomMatrixState } from './url-state';

/**
 * Canonical identity of the probability model used to generate a matrix.
 *
 * Sample index deliberately lives outside this fingerprint: it identifies a
 * draw within one ensemble. Likewise, lens, theory, colour, contrast, mode and
 * requested sample count only affect presentation or orchestration.
 */
export type RandomMatrixParameterFingerprint = string & {
	readonly __randomMatrixParameterFingerprint: unique symbol;
};

export function randomMatrixParameterFingerprint(
	state: RandomMatrixState
): RandomMatrixParameterFingerprint {
	const normalized = normalizeRandomMatrixState(state);
	return JSON.stringify({
		fingerprintVersion: 1,
		modelVersion: RANDOM_MATRIX_MODEL_VERSION,
		preset: normalized.preset,
		seed: normalized.seed,
		dimension: normalized.dimension,
		distribution: normalized.distribution,
		mean: normalized.mean,
		scale: normalized.scale,
		symmetry: normalized.symmetry,
		sparsity: normalized.sparsity,
		aspectRatio: normalized.aspectRatio,
		normalization: normalized.normalization,
		signalType: normalized.signalType,
		signalStrength: normalized.signalStrength
	}) as RandomMatrixParameterFingerprint;
}

export function hasRandomMatrixParameterFingerprint(
	value: unknown,
	state: RandomMatrixState
): value is RandomMatrixParameterFingerprint {
	return typeof value === 'string' && value === randomMatrixParameterFingerprint(state);
}
