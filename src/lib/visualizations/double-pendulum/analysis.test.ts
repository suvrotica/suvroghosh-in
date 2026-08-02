import { describe, expect, it } from 'vitest';
import {
	accumulateBenettinGrowth,
	characteristicTime,
	createPerturbedState,
	detectPoincareCrossing,
	energy,
	lowerBobSeparation,
	lyapunovReading,
	renormalizeShadow,
	scaledPhaseDistance,
	wrappedAngleDifference
} from './analysis';
import { createState, type LyapunovAccumulator, type PendulumParameters } from './types';

const PARAMETERS: PendulumParameters = { m1: 1.2, m2: 0.8, l1: 1.5, l2: 0.7, g: 9.81 };

describe('energy and separations', () => {
	it('matches the selected potential-energy convention at equilibrium', () => {
		const expected =
			-(PARAMETERS.m1 + PARAMETERS.m2) * PARAMETERS.g * PARAMETERS.l1 -
			PARAMETERS.m2 * PARAMETERS.g * PARAMETERS.l2;
		expect(energy(createState(), PARAMETERS)).toBeCloseTo(expected, 13);
	});

	it('wraps differences across −π and +π onto the short path', () => {
		const epsilon = 1e-8;
		expect(wrappedAngleDifference(-Math.PI + epsilon, Math.PI - epsilon)).toBeCloseTo(
			2 * epsilon,
			12
		);
		expect(wrappedAngleDifference(Math.PI - epsilon, -Math.PI + epsilon)).toBeCloseTo(
			-2 * epsilon,
			12
		);
	});

	it('scales angular velocities by the characteristic time and measures physical metres', () => {
		const primary = createState();
		const shadow = { ...primary, omega1: 2 };
		expect(scaledPhaseDistance(primary, shadow, PARAMETERS)).toBeCloseTo(
			2 * characteristicTime(PARAMETERS),
			14
		);
		const displaced = { ...primary, theta2: Math.PI };
		expect(lowerBobSeparation(primary, displaced, PARAMETERS)).toBeCloseTo(2 * PARAMETERS.l2, 14);
	});
});

describe('Poincaré interpolation', () => {
	const previous = { theta1: 0.4, omega1: -0.2, theta2: -0.1, omega2: 0.8 };
	const current = { theta1: 0.7, omega1: 0.4, theta2: 0.2, omega2: 1.1 };

	it('detects the selected positive crossing and interpolates between adjacent states', () => {
		const crossing = detectPoincareCrossing(previous, current);
		expect(crossing).not.toBeNull();
		expect(crossing?.fraction).toBeCloseTo(1 / 3, 14);
		expect(crossing?.theta2).toBeCloseTo(0, 14);
		expect(crossing?.theta1).toBeGreaterThan(previous.theta1);
		expect(crossing?.theta1).toBeLessThan(current.theta1);
		expect(crossing?.omega2).toBeGreaterThan(0);
	});

	it('honours direction and rejects a velocity inconsistent with the crossing', () => {
		expect(
			detectPoincareCrossing(previous, current, {
				angle: 'theta2',
				value: 0,
				direction: 'negative'
			})
		).toBeNull();
		expect(
			detectPoincareCrossing({ ...previous, omega2: -1 }, { ...current, omega2: -0.5 })
		).toBeNull();
	});

	it('recognises the equivalent zero after one complete rotation', () => {
		const crossing = detectPoincareCrossing(
			{ theta1: 0, omega1: 0, theta2: Math.PI * 2 - 0.1, omega2: 1 },
			{ theta1: 0.1, omega1: 0.2, theta2: Math.PI * 2 + 0.1, omega2: 1.1 }
		);
		expect(crossing?.fraction).toBeCloseTo(0.5, 14);
		expect(crossing?.theta2).toBeCloseTo(Math.PI * 2, 14);
	});
});

describe('Benettin renormalization', () => {
	it('restores the scaled perturbation norm without producing NaN', () => {
		const primary = { theta1: Math.PI - 1e-5, omega1: 0.3, theta2: -0.4, omega2: -0.2 };
		const shadow = {
			theta1: -Math.PI + 2e-5,
			omega1: 0.34,
			theta2: -0.37,
			omega2: -0.24
		};
		const epsilon = 1e-7;
		const result = renormalizeShadow(primary, shadow, epsilon, PARAMETERS);
		expect(result).not.toBeNull();
		expect(scaledPhaseDistance(primary, result!, PARAMETERS)).toBeCloseTo(epsilon, 12);
		expect(Object.values(result!).every(Number.isFinite)).toBe(true);
	});

	it('returns null for coincident states and creates controlled single-axis perturbations', () => {
		const primary = createState();
		expect(renormalizeShadow(primary, primary, 1e-7, PARAMETERS)).toBeNull();
		expect(createPerturbedState(primary, 'omega2', 1e-6)).toEqual({
			...primary,
			omega2: 1e-6
		});
		expect(() => createPerturbedState(primary, 'invalid' as keyof typeof primary, 1e-6)).toThrow(
			RangeError
		);
	});

	it('accumulates finite logarithmic growth and labels the early transient honestly', () => {
		const accumulator: LyapunovAccumulator = {
			accumulatedLogGrowth: 0,
			elapsedTime: 0,
			renormalizations: 0
		};
		expect(accumulateBenettinGrowth(accumulator, 2e-7, 1e-7, 1)).toBe(true);
		expect(lyapunovReading(accumulator).status).toBe('not-enough-evidence');
		expect(accumulateBenettinGrowth(accumulator, 2e-7, 1e-7, 1)).toBe(true);
		const reading = lyapunovReading(accumulator);
		expect(reading.status).toBe('available');
		expect(reading.estimate).toBeCloseTo(Math.log(2), 14);
		expect(reading.eFoldingTime).toBeCloseTo(1 / Math.log(2), 14);
		const corrupt: LyapunovAccumulator = {
			accumulatedLogGrowth: Number.POSITIVE_INFINITY,
			elapsedTime: 1,
			renormalizations: 2
		};
		expect(accumulateBenettinGrowth(corrupt, 2e-7, 1e-7, 1)).toBe(false);
		expect(corrupt.elapsedTime).toBe(1);
	});
});
