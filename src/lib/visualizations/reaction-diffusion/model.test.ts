import { describe, expect, it } from 'vitest';
import { DEFAULT_REACTION_DIFFUSION_SETUP } from './constants';
import {
	NumericalInstabilityError,
	assessNumericalStability,
	createReactionDiffusionWorkspace,
	stepField,
	stepFieldInto
} from './engine';
import { cloneFieldState } from './initial';
import { fivePointLaplacianAt } from './stencil';
import type { FieldState, GrayScottSetup } from './types';

function setup(overrides: Partial<GrayScottSetup> = {}): GrayScottSetup {
	return {
		...DEFAULT_REACTION_DIFFUSION_SETUP,
		gridSize: 8,
		domainWidth: 8,
		timestep: 0.1,
		initialCondition: 'blank-feed',
		...overrides
	};
}

function field(size: number, uValue = 1, vValue = 0): FieldState {
	const length = size * size;
	const u = new Float64Array(length);
	const v = new Float64Array(length);
	const mask = new Uint8Array(length);
	u.fill(uValue);
	v.fill(vValue);
	mask.fill(1);
	return { size, u, v, mask };
}

function meanAndVariance(values: Float64Array): { mean: number; variance: number } {
	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
	return { mean, variance };
}

describe('model and five-point stencil', () => {
	it('1. gives a zero constant-field Laplacian for periodic, no-flux, and reservoir interior cells', () => {
		const state = field(8, 0.37, 0.12);
		for (const boundary of ['periodic', 'no-flux'] as const) {
			for (let row = 0; row < 8; row += 1) {
				for (let column = 0; column < 8; column += 1) {
					expect(fivePointLaplacianAt(state.u, state.mask, 8, row, column, boundary, 1, 0.37)).toBe(
						0
					);
				}
			}
		}
		expect(fivePointLaplacianAt(state.u, state.mask, 8, 4, 4, 'reservoir', 1, 1)).toBe(0);
	});

	it('2. reproduces the known discrete eigenvalue of a periodic sinusoid', () => {
		const size = 32;
		const mode = 3;
		const state = field(size);
		for (let row = 0; row < size; row += 1) {
			for (let column = 0; column < size; column += 1) {
				state.u[row * size + column] = Math.sin((2 * Math.PI * mode * column) / size);
			}
		}
		const column = 2;
		const value = state.u[column];
		const eigenvalue = 2 * (Math.cos((2 * Math.PI * mode) / size) - 1);
		const laplacian = fivePointLaplacianAt(state.u, state.mask, size, 7, column, 'periodic', 1, 1);
		expect(laplacian).toBeCloseTo(eigenvalue * value, 13);
	});

	it('3. conserves pure-diffusion mean and decreases variance for periodic and no-flux boundaries', () => {
		for (const boundary of ['periodic', 'no-flux'] as const) {
			let state = field(16);
			for (let row = 0; row < 16; row += 1) {
				for (let column = 0; column < 16; column += 1) {
					state.u[row * 16 + column] =
						0.7 +
						0.15 * Math.sin((2 * Math.PI * column) / 16) +
						0.05 * Math.cos((4 * Math.PI * row) / 16);
				}
			}
			const configuration = setup({
				gridSize: 16,
				domainWidth: 16,
				boundary,
				feed: 0,
				kill: 0,
				diffusionU: 0.2,
				diffusionV: 0,
				integrator: 'euler'
			});
			const before = meanAndVariance(state.u);
			for (let index = 0; index < 20; index += 1) state = stepField(state, configuration);
			const after = meanAndVariance(state.u);
			expect(after.mean).toBeCloseTo(before.mean, 13);
			expect(after.variance).toBeLessThan(before.variance);
		}
	});

	it('4. removes all spatial communication when both diffusion coefficients are zero', () => {
		const state = field(8, 0.9, 0.05);
		state.u[0] = state.u[27] = 0.63;
		state.v[0] = state.v[27] = 0.21;
		state.u[1] = 0.02;
		state.v[1] = 0.81;
		const next = stepField(
			state,
			setup({ diffusionU: 0, diffusionV: 0, integrator: 'euler', boundary: 'reservoir' })
		);
		expect(next.u[0]).toBe(next.u[27]);
		expect(next.v[0]).toBe(next.v[27]);
	});

	it('5. leaves the homogeneous feed equilibrium exactly invariant', () => {
		const state = field(8, 1, 0);
		const next = stepField(state, setup({ boundary: 'periodic' }));
		expect(next.u).toEqual(state.u);
		expect(next.v).toEqual(state.v);
	});

	it('6. treats obstacle faces as impermeable and preserves a uniform active field around them', () => {
		const state = field(8, 0.42, 0.17);
		state.mask[3 * 8 + 4] = 0;
		state.u[3 * 8 + 4] = 999;
		state.v[3 * 8 + 4] = -999;
		const adjacent = fivePointLaplacianAt(state.u, state.mask, 8, 3, 3, 'periodic', 1, 1);
		expect(adjacent).toBe(0);
		const configuration = setup({ feed: 0, kill: 0, diffusionU: 0.1, diffusionV: 0.1 });
		const next = stepField(state, configuration);
		for (let index = 0; index < state.u.length; index += 1) {
			if (!state.mask[index]) continue;
			// Reaction changes every active cell equally; the obstacle introduces no diffusion artefact.
			expect(next.u[index]).toBe(next.u[0]);
			expect(next.v[index]).toBe(next.v[0]);
		}
	});
});

describe('fixed-step integration and failure handling', () => {
	it('7. matches a hand-computed small-grid Euler fixture', () => {
		const state = field(3, 1, 0);
		state.v[4] = 0.2;
		const configuration = setup({
			gridSize: 3,
			domainWidth: 3,
			feed: 0,
			kill: 0,
			diffusionU: 0,
			diffusionV: 0.1,
			timestep: 0.5,
			integrator: 'euler'
		});
		const next = stepField(state, configuration);
		expect(next.u[4]).toBeCloseTo(0.98, 14);
		expect(next.v[4]).toBeCloseTo(0.18, 14);
		expect(next.v[1]).toBeCloseTo(0.01, 14);
		expect(next.v[0]).toBe(0);
	});

	it('8. exhibits approximately second-order temporal convergence for Heun on smooth reaction-only motion', () => {
		const initial = field(2, 0.8, 0.2);
		const evolve = (dt: number, duration: number): FieldState => {
			const configuration = setup({
				gridSize: 2,
				domainWidth: 2,
				diffusionU: 0,
				diffusionV: 0,
				timestep: dt,
				integrator: 'heun'
			});
			let state = cloneFieldState(initial);
			for (let step = 0; step < Math.round(duration / dt); step += 1) {
				state = stepField(state, configuration);
			}
			return state;
		};
		const reference = evolve(0.0005, 0.5);
		const coarse = evolve(0.1, 0.5);
		const fine = evolve(0.05, 0.5);
		const coarseError = Math.hypot(coarse.u[0] - reference.u[0], coarse.v[0] - reference.v[0]);
		const fineError = Math.hypot(fine.u[0] - reference.u[0], fine.v[0] - reference.v[0]);
		expect(coarseError / fineError).toBeGreaterThan(3.5);
		expect(coarseError / fineError).toBeLessThan(4.6);
	});

	it('9. detects deliberately unsafe stepping, retains the previous state, and never clamps', () => {
		const unsafeSetup = setup({ timestep: 2, diffusionU: 0.16, diffusionV: 0.08 });
		expect(assessNumericalStability(unsafeSetup).state).toBe('unsafe');
		const state = field(8, 0.8, 0.2);
		const output = cloneFieldState(state);
		const before = cloneFieldState(output);
		expect(() =>
			stepFieldInto(state, unsafeSetup, output, createReactionDiffusionWorkspace(8))
		).toThrow(NumericalInstabilityError);
		expect(output.u).toEqual(before.u);
		expect(output.v).toEqual(before.v);

		const explosive = field(8, 1, 10_000);
		const reactionUnsafe = setup({
			timestep: 20,
			diffusionU: 0,
			diffusionV: 0,
			feed: 0,
			kill: 0,
			integrator: 'euler'
		});
		expect(() => stepField(explosive, reactionUnsafe, { rejectUnsafe: false })).toThrow(
			NumericalInstabilityError
		);
		expect(explosive.v[0]).toBe(10_000);
	});
});
