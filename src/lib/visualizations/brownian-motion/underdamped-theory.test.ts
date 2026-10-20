import { describe, expect, it } from 'vitest';
import { underdampedLangevinTheory } from './models/underdamped-langevin';

const parameters = {
	mass: 1,
	drag: 2,
	thermalEnergy: 3,
	forceX: 0,
	forceY: 0,
	initialVelocity: 'equilibrium' as const
};

describe('underdamped theory for the chosen ensemble', () => {
	it('distinguishes thermal ballistic t² from cold-start t³ displacement', () => {
		const time = 1e-6;
		const equilibrium = underdampedLangevinTheory(parameters, time);
		const cold = underdampedLangevinTheory({ ...parameters, initialVelocity: 'zero' }, time);
		expect(equilibrium.msd / time ** 2).toBeCloseTo(2 * parameters.thermalEnergy, 4);
		expect(cold.msd / time ** 3).toBeCloseTo(
			(4 * parameters.drag * parameters.thermalEnergy) / (3 * parameters.mass ** 2),
			4
		);
		expect(cold.velocityAutocorrelationPerAxis).toBe(0);
		expect(cold.velocityVariancePerAxis).toBeCloseTo(
			parameters.thermalEnergy * -Math.expm1(-4 * time),
			14
		);
	});

	it('includes deterministic constant-force displacement in the MSD', () => {
		const time = 2;
		const forced = underdampedLangevinTheory(
			{ ...parameters, thermalEnergy: 0, forceX: 4, forceY: -2 },
			time
		);
		const displacementIntegral = time - 0.5 * (1 - Math.exp(-2 * time));
		expect(forced.msd).toBeCloseTo(5 * displacementIntegral ** 2, 12);
	});

	it('starts at zero displacement for either ensemble', () => {
		for (const initialVelocity of ['equilibrium', 'zero'] as const) {
			expect(underdampedLangevinTheory({ ...parameters, initialVelocity }, 0).msd).toBe(0);
		}
	});
});
