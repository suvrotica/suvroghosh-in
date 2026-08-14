import { describe, expect, it } from 'vitest';
import { computeEigenAnalysis, computeSingularAnalysis } from './decompositions';
import {
	NON_NORMAL_TRANSIENT_STEPS,
	matrixPowerTrajectory,
	nonNormalTrapWitness,
	validateNonNormalTrap
} from './dynamics';
import { generateMatrix } from './matrix';
import { stateForPreset } from './presets';

function decomposedSpectralRadius(values: Float64Array, dimension: number): number {
	const eigen = computeEigenAnalysis(values, dimension, dimension, { symmetric: false });
	let radius = 0;
	for (let index = 0; index < eigen.real.length; index += 1) {
		radius = Math.max(radius, Math.hypot(eigen.real[index], eigen.imaginary[index]));
	}
	return radius;
}

describe('non-normal transient-growth contract', () => {
	it('checks the actual default perturbed matrix, not only its Jordan-like template', () => {
		const state = stateForPreset('non-normal-trap');
		const generated = generateMatrix(state, 0);
		const validation = validateNonNormalTrap(generated.values, generated.rows);
		const singular = computeSingularAnalysis(generated.values, generated.rows, generated.columns);
		const spectralRadius = decomposedSpectralRadius(generated.values, generated.rows);

		expect(validation.upperTriangular).toBe(true);
		expect(validation.valid).toBe(true);
		expect(spectralRadius).toBeCloseTo(validation.spectralRadius, 12);
		expect(spectralRadius).toBeLessThan(1);
		expect(singular.values[0]).toBeGreaterThan(1);
		expect(singular.values[0]).toBeGreaterThanOrEqual(validation.largestSingularValueLowerBound);
		expect(validation.trajectory[1].magnitude).toBeGreaterThan(1);
		expect(validation.peakStep).toBeGreaterThan(0);
		expect(validation.peakStep).toBeLessThan(NON_NORMAL_TRANSIENT_STEPS);
		expect(validation.peakMagnitude).toBeGreaterThan(1);
		expect(validation.finalMagnitude).toBeLessThan(1);
	});

	it('preserves the stable-amplifying-decaying lesson across seeded perturbation controls', () => {
		for (const distribution of ['gaussian', 'uniform', 'rademacher'] as const) {
			for (const scale of [0.01, 1, 4]) {
				for (const [seed, sampleIndex] of [
					['tramlight-circle-1847', 0],
					['upper-triangle-audit', 7]
				] as const) {
					const state = {
						...stateForPreset('non-normal-trap'),
						dimension: 24,
						distribution,
						scale,
						seed
					};
					const generated = generateMatrix(state, sampleIndex);
					const validation = validateNonNormalTrap(generated.values, generated.rows);

					expect(validation.valid, `${distribution}, scale=${scale}, seed=${seed}`).toBe(true);
					expect(validation.spectralRadius).toBeLessThan(1);
					expect(validation.largestSingularValueLowerBound).toBeGreaterThan(1);
					expect(validation.finalMagnitude).toBeLessThan(1);
				}
			}
		}
	});

	it('shares the exact e2 trajectory used by the direction view', () => {
		const generated = generateMatrix(
			{ ...stateForPreset('non-normal-trap'), dimension: 12, seed: 'shared-witness' },
			3
		);
		const direct = matrixPowerTrajectory(
			generated.values,
			generated.rows,
			nonNormalTrapWitness(generated.rows),
			NON_NORMAL_TRANSIENT_STEPS
		);
		const validation = validateNonNormalTrap(generated.values, generated.rows);

		expect(direct).toEqual(validation.trajectory);
		expect(direct[0]).toMatchObject({ x: 0, y: 1, magnitude: 1 });
		expect(direct[1].magnitude).toBeGreaterThan(1);
		expect(direct.at(-1)?.magnitude).toBeLessThan(1);
	});
});
