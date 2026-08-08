import { describe, expect, it } from 'vitest';
import {
	BZNumericalInstabilityError,
	DEFAULT_OREGONATOR_SETUP,
	DEFAULT_SCHNAKENBERG_SETUP,
	OREGONATOR_EQUATIONS_ID,
	OREGONATOR_MODEL_VERSION,
	SCHNAKENBERG_EQUATIONS_ID,
	SCHNAKENBERG_MODEL_VERSION,
	activeAreaMetrics,
	assessBZTimestep,
	cloneBZFieldState,
	computeBZDerivativeTerms,
	createInitialBZField,
	fivePointLaplacianAt,
	heunBZStep,
	heunBZStepInto,
	oregonatorReaction
} from './index';
import type { BZFieldState, OregonatorSetup, SchnakenbergSetup } from './types';

function oregonator(
	overrides: Partial<Omit<OregonatorSetup, 'parameters'>> & {
		parameters?: Partial<OregonatorSetup['parameters']>;
	} = {}
): OregonatorSetup {
	return {
		...DEFAULT_OREGONATOR_SETUP,
		...overrides,
		model: 'oregonator',
		modelVersion: OREGONATOR_MODEL_VERSION,
		equationsId: OREGONATOR_EQUATIONS_ID,
		parameters: { ...DEFAULT_OREGONATOR_SETUP.parameters, ...overrides.parameters }
	};
}

function schnakenberg(
	overrides: Partial<Omit<SchnakenbergSetup, 'parameters'>> & {
		parameters?: Partial<SchnakenbergSetup['parameters']>;
	} = {}
): SchnakenbergSetup {
	return {
		...DEFAULT_SCHNAKENBERG_SETUP,
		...overrides,
		model: 'schnakenberg',
		modelVersion: SCHNAKENBERG_MODEL_VERSION,
		equationsId: SCHNAKENBERG_EQUATIONS_ID,
		parameters: { ...DEFAULT_SCHNAKENBERG_SETUP.parameters, ...overrides.parameters }
	};
}

function field(size: number, uValue = 1, vValue = 0.9): BZFieldState {
	const length = size * size;
	const u = new Float64Array(length);
	const v = new Float64Array(length);
	const domainMask = new Uint8Array(length);
	const mask = new Uint8Array(length);
	u.fill(uValue);
	v.fill(vValue);
	domainMask.fill(1);
	mask.fill(1);
	return { size, u, v, domainMask, mask };
}

describe('five-point boundaries and masks', () => {
	it('gives zero Laplacian for a constant active field under both boundaries', () => {
		const state = field(8, 0.37, 0.12);
		for (const boundary of ['no-flux', 'periodic'] as const) {
			for (let row = 0; row < state.size; row += 1) {
				for (let column = 0; column < state.size; column += 1) {
					expect(
						fivePointLaplacianAt(state.u, state.mask, state.size, row, column, boundary, 1)
					).toBe(0);
				}
			}
		}
	});

	it('wraps the square only when periodic is explicitly selected', () => {
		const state = field(4, 0, 0);
		state.u[3 * 4 + 1] = 1;
		const noFlux = fivePointLaplacianAt(state.u, state.mask, 4, 0, 1, 'no-flux', 1);
		const periodic = fivePointLaplacianAt(state.u, state.mask, 4, 0, 1, 'periodic', 1);
		expect(noFlux).toBe(0);
		expect(periodic).toBe(1);
	});

	it('does not communicate through a circular exterior or an obstacle', () => {
		const circular = oregonator({
			gridSize: 17,
			domainSize: 17,
			activeRadius: 7,
			initialCondition: 'uniform-equilibrium'
		});
		const state = createInitialBZField(circular);
		state.u.fill(999);
		for (let index = 0; index < state.u.length; index += 1) {
			if (state.mask[index]) state.u[index] = 0.25;
		}
		for (let row = 0; row < state.size; row += 1) {
			for (let column = 0; column < state.size; column += 1) {
				const index = row * state.size + column;
				if (!state.mask[index]) continue;
				expect(
					fivePointLaplacianAt(state.u, state.mask, state.size, row, column, 'no-flux', 1)
				).toBe(0);
			}
		}

		const obstacle = field(7, 0.42, 0.17);
		obstacle.mask[3 * 7 + 4] = 0;
		obstacle.u[3 * 7 + 4] = -1_000;
		expect(fivePointLaplacianAt(obstacle.u, obstacle.mask, 7, 3, 3, 'no-flux', 1)).toBe(0);
	});
});

describe('reaction/diffusion separation', () => {
	it('pure no-flux diffusion preserves active mean and reduces variance', () => {
		let state = field(16);
		state.mask[7 * 16 + 7] = 0;
		for (let row = 0; row < 16; row += 1) {
			for (let column = 0; column < 16; column += 1) {
				const index = row * 16 + column;
				if (!state.mask[index]) continue;
				state.u[index] =
					1 +
					0.1 * Math.sin((2 * Math.PI * column) / 16) +
					0.04 * Math.cos((4 * Math.PI * row) / 16);
			}
		}
		const setup = schnakenberg({
			gridSize: 16,
			domainSize: 16,
			activeRadius: 8,
			geometry: 'square',
			boundary: 'no-flux',
			diffusionU: 0.2,
			diffusionV: 0,
			timestep: 0.1,
			initialCondition: 'uniform-equilibrium'
		});
		const before = activeAreaMetrics(state);
		for (let step = 0; step < 30; step += 1) {
			state = heunBZStep(state, setup, {
				activeTerms: { reaction: false, diffusion: true }
			});
		}
		const after = activeAreaMetrics(state);
		expect(after.meanU).toBeCloseTo(before.meanU, 13);
		expect(after.varianceU).toBeLessThan(before.varianceU);
	});

	it('reports reaction and diffusion separately and sums them exactly', () => {
		const state = field(4);
		state.u[5] = 1.2;
		state.v[5] = 0.7;
		const setup = schnakenberg({
			gridSize: 4,
			domainSize: 4,
			activeRadius: 2,
			geometry: 'square',
			boundary: 'no-flux',
			timestep: 0.01
		});
		const all = computeBZDerivativeTerms(state, setup);
		expect(all.totalU[5]).toBe(all.reactionU[5] + all.diffusionU[5]);
		expect(all.totalV[5]).toBe(all.reactionV[5] + all.diffusionV[5]);

		const diffusionOnly = computeBZDerivativeTerms(state, setup, {
			reaction: false,
			diffusion: true
		});
		expect(diffusionOnly.reactionU.every((value) => value === 0)).toBe(true);
		expect(diffusionOnly.totalU).toEqual(diffusionOnly.diffusionU);

		const reactionOnly = computeBZDerivativeTerms(state, setup, {
			reaction: true,
			diffusion: false
		});
		expect(reactionOnly.diffusionU.every((value) => value === 0)).toBe(true);
		expect(reactionOnly.totalU).toEqual(reactionOnly.reactionU);
	});

	it('does not let a perturbation spread when diffusion is disabled', () => {
		const state = field(5);
		state.u[12] = 1.2;
		state.v[12] = 0.7;
		const setup = schnakenberg({
			gridSize: 5,
			domainSize: 5,
			activeRadius: 2.5,
			geometry: 'square',
			boundary: 'no-flux',
			diffusionU: 0,
			diffusionV: 0,
			timestep: 0.01
		});
		const next = heunBZStep(state, setup);
		expect(next.u[11]).toBe(next.u[0]);
		expect(next.v[11]).toBe(next.v[0]);
		expect(next.u[12]).not.toBe(next.u[11]);
	});
});

describe('fixed-step Float64 Heun integration', () => {
	it('matches a hand-computed reaction-only Heun step', () => {
		const setup = oregonator({
			gridSize: 2,
			domainSize: 2,
			activeRadius: 1,
			geometry: 'square',
			boundary: 'no-flux',
			diffusionU: 0,
			diffusionV: 0,
			timestep: 0.001,
			parameters: { epsilon: 0.5, q: 0.05, f: 1.2 }
		});
		const state = field(2, 0.2, 0.1);
		const k1 = oregonatorReaction(0.2, 0.1, setup.parameters);
		const predictorU = 0.2 + setup.timestep * k1.u;
		const predictorV = 0.1 + setup.timestep * k1.v;
		const k2 = oregonatorReaction(predictorU, predictorV, setup.parameters);
		const expectedU = 0.2 + (setup.timestep * (k1.u + k2.u)) / 2;
		const expectedV = 0.1 + (setup.timestep * (k1.v + k2.v)) / 2;
		const next = heunBZStep(state, setup);
		expect(next.u[0]).toBeCloseTo(expectedU, 15);
		expect(next.v[0]).toBeCloseTo(expectedV, 15);
	});

	it('shows second-order temporal convergence at equal model time', () => {
		const initial = field(2, 1.2, 0.8);
		const evolve = (timestep: number): BZFieldState => {
			const setup = schnakenberg({
				gridSize: 2,
				domainSize: 2,
				activeRadius: 1,
				geometry: 'square',
				boundary: 'no-flux',
				diffusionU: 0,
				diffusionV: 0,
				timestep
			});
			let state = cloneBZFieldState(initial);
			for (let step = 0; step < Math.round(0.2 / timestep); step += 1) {
				state = heunBZStep(state, setup);
			}
			return state;
		};
		const reference = evolve(0.00025);
		const coarse = evolve(0.02);
		const fine = evolve(0.01);
		const coarseError = Math.hypot(coarse.u[0] - reference.u[0], coarse.v[0] - reference.v[0]);
		const fineError = Math.hypot(fine.u[0] - reference.u[0], fine.v[0] - reference.v[0]);
		expect(coarseError / fineError).toBeGreaterThan(3.4);
		expect(coarseError / fineError).toBeLessThan(4.7);
	});

	it('rejects unsafe or negative states before committing output and never clamps', () => {
		const setup = schnakenberg({
			gridSize: 8,
			domainSize: 1,
			activeRadius: 0.5,
			geometry: 'square',
			boundary: 'no-flux',
			diffusionU: 1,
			diffusionV: 1,
			timestep: 0.01
		});
		expect(assessBZTimestep(setup).state).toBe('unsafe');
		expect(assessBZTimestep(setup).diffusionLimit).toBeCloseTo(1 / 256, 15);
		expect(assessBZTimestep(setup).diffusionRatio).toBeCloseTo(2.56, 14);
		const state = field(8);
		const output = cloneBZFieldState(state);
		const before = cloneBZFieldState(output);
		expect(() => heunBZStepInto(state, setup, output)).toThrow(BZNumericalInstabilityError);
		expect(output.u).toEqual(before.u);
		expect(output.v).toEqual(before.v);

		const negative = field(8);
		negative.u[0] = -0.01;
		expect(() =>
			heunBZStep(negative, { ...setup, diffusionU: 0, diffusionV: 0, timestep: 0.001 })
		).toThrow(/no cosmetic state clamp/u);
		expect(negative.u[0]).toBe(-0.01);
	});
});
