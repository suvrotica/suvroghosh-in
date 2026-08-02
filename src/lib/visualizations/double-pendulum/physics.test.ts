import { describe, expect, it } from 'vitest';
import { energy, relativeEnergyDifference } from './analysis';
import {
	createEulerWorkspace,
	createRk4Workspace,
	eulerStepInto,
	rk4StepInto
} from './integrators';
import { bobPositions, derivatives } from './physics';
import { cloneState, createState, type PendulumParameters, type PendulumState } from './types';

const PARAMETERS: PendulumParameters = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

function evolveRk4(
	initial: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>,
	dt: number,
	steps: number
): PendulumState {
	let current = cloneState(initial);
	let next = createState();
	const workspace = createRk4Workspace();
	for (let step = 0; step < steps; step += 1) {
		rk4StepInto(current, parameters, dt, next, workspace);
		[current, next] = [next, current];
	}
	return current;
}

describe('ideal double-pendulum physics', () => {
	it('keeps the downward equilibrium exactly stationary', () => {
		expect(derivatives(createState(), PARAMETERS)).toEqual(createState());
	});

	it('approaches the single-pendulum upper acceleration as m2 tends safely to zero', () => {
		const state = { theta1: 0.63, omega1: -0.27, theta2: -0.41, omega2: 0.52 };
		const parameters = { ...PARAMETERS, m2: 1e-9, l1: 1.7 };
		const result = derivatives(state, parameters);
		const expected = (-parameters.g * Math.sin(state.theta1)) / parameters.l1;
		expect(result.omega1).toBeCloseTo(expected, 8);
	});

	it('uses downward-positive SI rendering coordinates', () => {
		const positions = bobPositions(
			{ theta1: Math.PI / 2, omega1: 0, theta2: 0, omega2: 0 },
			{ ...PARAMETERS, l1: 2, l2: 3 }
		);
		expect(positions.x1).toBeCloseTo(2, 14);
		expect(positions.y1).toBeCloseTo(0, 14);
		expect(positions.x2).toBeCloseTo(2, 14);
		expect(positions.y2).toBeCloseTo(3, 14);
	});

	it('rejects invalid parameters and non-finite states before they poison a run', () => {
		expect(() => derivatives(createState(), { ...PARAMETERS, l1: 0 })).toThrow(RangeError);
		expect(() => derivatives({ ...createState(), omega2: Number.NaN }, PARAMETERS)).toThrow(
			RangeError
		);
		expect(() =>
			rk4StepInto(createState(), PARAMETERS, Number.POSITIVE_INFINITY, createState())
		).toThrow(RangeError);
	});
});

describe('fixed-step integration', () => {
	it('is bit-for-bit deterministic for identical state, parameters, dt, and step count', () => {
		const initial = { theta1: 2.1, omega1: 0.15, theta2: -0.18, omega2: -0.08 };
		const first = evolveRk4(initial, PARAMETERS, 1 / 240, 4_000);
		const second = evolveRk4(initial, PARAMETERS, 1 / 240, 4_000);
		expect(first).toEqual(second);
	});

	it('supports allocation-free in-place RK4 stepping', () => {
		const initial = { theta1: 0.8, omega1: -0.1, theta2: -0.3, omega2: 0.2 };
		const expected = evolveRk4(initial, PARAMETERS, 1 / 240, 1);
		const inPlace = cloneState(initial);
		rk4StepInto(inPlace, PARAMETERS, 1 / 240, inPlace, createRk4Workspace());
		expect(inPlace).toEqual(expected);
	});

	it('keeps RK4 energy drift tightly bounded for a documented moderate ten-second run', () => {
		const initial = {
			theta1: (70 * Math.PI) / 180,
			omega1: 0,
			theta2: (-20 * Math.PI) / 180,
			omega2: 0
		};
		const reference = energy(initial, PARAMETERS);
		const final = evolveRk4(initial, PARAMETERS, 1 / 480, 10 * 480);
		const drift = relativeEnergyDifference(energy(final, PARAMETERS), reference);
		// This is intentionally far below a visually harmless tolerance: a broken RK4 fails it.
		expect(drift).toBeLessThan(1e-7);
	});

	it('shows meaningfully larger energy error under the isolated Euler demonstration', () => {
		const initial = {
			theta1: (80 * Math.PI) / 180,
			omega1: 0,
			theta2: (-25 * Math.PI) / 180,
			omega2: 0
		};
		const reference = energy(initial, PARAMETERS);
		const dt = 1 / 240;
		const steps = 5 * 240;
		const rk4Final = evolveRk4(initial, PARAMETERS, dt, steps);
		let eulerCurrent = cloneState(initial);
		let eulerNext = createState();
		const workspace = createEulerWorkspace();
		for (let step = 0; step < steps; step += 1) {
			eulerStepInto(eulerCurrent, PARAMETERS, dt, eulerNext, workspace);
			[eulerCurrent, eulerNext] = [eulerNext, eulerCurrent];
		}
		const rk4Error = relativeEnergyDifference(energy(rk4Final, PARAMETERS), reference);
		const eulerError = relativeEnergyDifference(energy(eulerCurrent, PARAMETERS), reference);
		expect(eulerError).toBeGreaterThan(1e-3);
		expect(eulerError).toBeGreaterThan(rk4Error * 10_000);
	});
});
