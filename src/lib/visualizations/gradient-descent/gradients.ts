import { angleBetween, norm, subtract } from './linear-algebra';
import { isRegressionLandscape } from './landscapes';
import { sampleWithoutReplacement, SeededRandom } from './prng';
import type { GradientMode, GradientSample, LandscapeDefinition, Vector2 } from './types';

export const FULL_GRADIENT_MODE: GradientMode = { kind: 'full' };

export function sampleGradient(
	landscape: LandscapeDefinition,
	theta: Vector2,
	mode: GradientMode,
	random: SeededRandom
): GradientSample {
	const full = landscape.gradient(theta);
	let active = full;
	let batchIndices: readonly number[] | null = null;
	let additionalFullGradientComputations = 0;
	let activeGradientExamplesProcessed: number | null = isRegressionLandscape(landscape)
		? landscape.points.length
		: null;
	let diagnosticExamplesProcessed: number | null = isRegressionLandscape(landscape) ? 0 : null;

	if (mode.kind === 'minibatch') {
		if (!isRegressionLandscape(landscape)) {
			throw new TypeError('Minibatch gradients are available only for the regression landscape.');
		}
		const requestedSize = mode.batchSize === 'full' ? landscape.points.length : mode.batchSize;
		const sampleSize = Math.min(requestedSize, landscape.points.length);
		batchIndices =
			mode.batchSize === 'full'
				? landscape.points.map((_, index) => index)
				: sampleWithoutReplacement(landscape.points.length, sampleSize, random);
		activeGradientExamplesProcessed = batchIndices.length;
		if (batchIndices.length < landscape.points.length) {
			active = landscape.gradientForIndices(theta, batchIndices);
			additionalFullGradientComputations = 1;
			diagnosticExamplesProcessed = landscape.points.length;
		}
	} else if (mode.kind === 'noisy') {
		if (isRegressionLandscape(landscape)) {
			throw new TypeError(
				'Regression uses genuine deterministic minibatches; noisy-gradient mode is for analytic landscapes.'
			);
		}
		if (!(mode.sigma >= 0) || !Number.isFinite(mode.sigma)) {
			throw new RangeError('Noisy-gradient sigma must be a finite non-negative number.');
		}
		active = [full[0] + mode.sigma * random.normal(), full[1] + mode.sigma * random.normal()];
	}

	return {
		active,
		full,
		batchIndices,
		work: {
			activeGradientComputations: 1,
			additionalFullGradientComputations,
			activeGradientExamplesProcessed,
			diagnosticExamplesProcessed
		},
		angularErrorRadians: angleBetween(active, full),
		magnitudeError: norm(subtract(active, full))
	};
}

export function deterministicGradientFan(
	landscape: LandscapeDefinition,
	theta: Vector2,
	mode: GradientMode,
	seed: string,
	count = 8
): readonly GradientSample[] {
	if (!Number.isSafeInteger(count) || count < 1 || count > 128) {
		throw new RangeError('Gradient fan count must be an integer between 1 and 128.');
	}
	const random = new SeededRandom(seed);
	return Array.from({ length: count }, () => sampleGradient(landscape, theta, mode, random));
}
