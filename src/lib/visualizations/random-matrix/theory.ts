import { NUMERICAL_WARNING_TOLERANCE, THEORY_SAMPLE_COUNT } from './constants';
import type {
	CircleTheoryOverlay,
	DensityTheoryOverlay,
	RandomMatrixState,
	TheoryOverlay
} from './types';

export interface TheoryOverlayResult {
	overlay: TheoryOverlay | null;
	warning: string | null;
}

const CIRCULAR_PRESETS = new Set<RandomMatrixState['preset']>([
	'circular-cloud',
	'universality-test'
]);
const WIGNER_PRESETS = new Set<RandomMatrixState['preset']>([
	'wigner-moonrise',
	'hidden-rank-one-signal'
]);

function spectralNoiseScale(state: RandomMatrixState): number {
	return state.scale * (state.normalization === 'variance-1/n' ? 1 : Math.sqrt(state.dimension));
}

function covarianceNoiseVariance(state: RandomMatrixState): number {
	const variance = state.scale * state.scale;
	return state.normalization === 'variance-1/n' ? variance / state.dimension : variance;
}

function sampleSupport(minimum: number, maximum: number): Float64Array {
	const samples = new Float64Array(THEORY_SAMPLE_COUNT);
	const denominator = THEORY_SAMPLE_COUNT - 1;
	for (let index = 0; index < THEORY_SAMPLE_COUNT; index += 1) {
		samples[index] =
			index === 0
				? minimum
				: index === denominator
					? maximum
					: minimum + ((maximum - minimum) * index) / denominator;
	}
	return samples;
}

/** The circular-law boundary at the scale used by the matrix generator. */
export function circularLawOverlay(state: RandomMatrixState): CircleTheoryOverlay {
	const radius = spectralNoiseScale(state);
	return {
		kind: 'circle',
		radius,
		centerReal: 0,
		centerImaginary: 0,
		label:
			state.normalization === 'variance-1/n'
				? `Circular law (radius ${radius.toPrecision(4)})`
				: `Circular law, unscaled (radius ${radius.toPrecision(4)})`
	};
}

/** Wigner's limiting density, rescaled for the declared entry variance. */
export function wignerSemicircleOverlay(state: RandomMatrixState): DensityTheoryOverlay {
	const sigma = spectralNoiseScale(state);
	const support = [-2 * sigma, 2 * sigma] as const;
	const x = sampleSupport(support[0], support[1]);
	const density = new Float64Array(THEORY_SAMPLE_COUNT);
	const sigmaSquared = sigma * sigma;
	const denominator = 2 * Math.PI * sigmaSquared;
	for (let index = 0; index < x.length; index += 1) {
		const radicand = Math.max(0, 4 * sigmaSquared - x[index] * x[index]);
		density[index] = Math.sqrt(radicand) / denominator;
	}
	return {
		kind: 'semicircle',
		support,
		x,
		density,
		label:
			state.normalization === 'variance-1/n'
				? `Wigner semicircle (sigma ${sigma.toPrecision(4)})`
				: `Wigner semicircle, unscaled (sigma ${sigma.toPrecision(4)})`
	};
}

/**
 * Marchenko-Pastur density for C = XX^T / m and gamma = n / m.
 * The zero atom is reported separately rather than drawn as part of the curve.
 */
export function marchenkoPasturOverlay(state: RandomMatrixState): DensityTheoryOverlay {
	const sampleDimension = Math.max(2, Math.round(state.dimension / state.aspectRatio));
	const gamma = state.dimension / sampleDimension;
	const variance = covarianceNoiseVariance(state);
	const rootGamma = Math.sqrt(gamma);
	const support = [
		variance * (1 - rootGamma) * (1 - rootGamma),
		variance * (1 + rootGamma) * (1 + rootGamma)
	] as const;
	const x = sampleSupport(support[0], support[1]);
	const density = new Float64Array(THEORY_SAMPLE_COUNT);
	const denominatorScale = 2 * Math.PI * gamma * variance;
	for (let index = 0; index < x.length; index += 1) {
		const value = x[index];
		// At gamma = 1 the limiting density has an integrable singularity at
		// zero. A finite plot cannot contain Infinity, so the exact endpoint is
		// represented by zero while all interior samples follow the density.
		if (value <= 0) {
			density[index] = 0;
			continue;
		}
		const radicand = Math.max(0, (support[1] - value) * (value - support[0]));
		const result = Math.sqrt(radicand) / (denominatorScale * value);
		density[index] = Number.isFinite(result) && result >= 0 ? result : 0;
	}
	return {
		kind: 'marchenko-pastur',
		support,
		x,
		density,
		label: `Marchenko-Pastur (gamma ${gamma.toPrecision(4)})`,
		atomAtZero: gamma > 1 ? 1 - 1 / gamma : 0,
		gamma
	};
}

function unavailable(warning: string): TheoryOverlayResult {
	return { overlay: null, warning };
}

/** Select a justified large-n reference for the current experiment state. */
export function theoryOverlayForState(state: RandomMatrixState): TheoryOverlayResult {
	if (!state.theory) return { overlay: null, warning: null };
	if (!Number.isFinite(state.mean) || state.mean !== 0) {
		return unavailable('Theory requires mean-zero entries; set the entry mean to zero.');
	}
	if (state.normalization !== 'variance-1/n' && state.normalization !== 'unscaled') {
		return unavailable(
			`The ${state.normalization} normalization is data-dependent, so this asymptotic reference is disabled.`
		);
	}
	if (!Number.isFinite(state.scale) || state.scale <= 0) {
		return unavailable('Theory requires a finite, strictly positive entry scale.');
	}
	if (state.sparsity > NUMERICAL_WARNING_TOLERANCE) {
		return unavailable(
			'This dense-law reference is disabled for sparse entries; sparse limits require additional assumptions.'
		);
	}

	if (CIRCULAR_PRESETS.has(state.preset)) {
		if (state.symmetry !== 'none') {
			return unavailable('The circular-law reference requires a nonsymmetric IID matrix.');
		}
		if (state.signalType !== 'none' && state.signalStrength > NUMERICAL_WARNING_TOLERANCE) {
			return unavailable('The circular-law reference is disabled for this planted signal.');
		}
		return { overlay: circularLawOverlay(state), warning: null };
	}

	if (WIGNER_PRESETS.has(state.preset)) {
		if (state.symmetry !== 'symmetric') {
			return unavailable('The Wigner reference requires a real symmetric matrix.');
		}
		if (
			state.preset === 'hidden-rank-one-signal' &&
			state.signalType !== 'none' &&
			state.signalType !== 'rank-one' &&
			state.signalStrength > NUMERICAL_WARNING_TOLERANCE
		) {
			return unavailable('The Wigner bulk reference is not defined for this planted signal.');
		}
		if (
			state.preset === 'wigner-moonrise' &&
			state.signalType !== 'none' &&
			state.signalStrength > NUMERICAL_WARNING_TOLERANCE
		) {
			return unavailable('The Wigner reference is disabled for this planted signal.');
		}
		return { overlay: wignerSemicircleOverlay(state), warning: null };
	}

	if (state.preset === 'wishart-ridge') {
		if (state.signalType !== 'none' && state.signalStrength > NUMERICAL_WARNING_TOLERANCE) {
			return unavailable('The Marchenko-Pastur reference is disabled for this planted signal.');
		}
		if (!Number.isFinite(state.aspectRatio) || state.aspectRatio <= 0) {
			return unavailable('Marchenko-Pastur theory requires a finite positive aspect ratio.');
		}
		return { overlay: marchenkoPasturOverlay(state), warning: null };
	}

	return unavailable(
		`No circular-law, Wigner or Marchenko-Pastur reference is defined for the ${state.preset} preset.`
	);
}
