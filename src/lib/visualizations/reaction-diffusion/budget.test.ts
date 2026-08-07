import { describe, expect, it } from 'vitest';
import { DEFAULT_REACTION_DIFFUSION_SETUP } from './constants';
import { stepField } from './engine';
import { calculateChemicalBudget, calculateLocalTermLedger } from './metrics';
import type { FieldState, GrayScottSetup } from './types';

function setup(overrides: Partial<GrayScottSetup> = {}): GrayScottSetup {
	return {
		...DEFAULT_REACTION_DIFFUSION_SETUP,
		gridSize: 16,
		domainWidth: 16,
		timestep: 0.2,
		initialCondition: 'blank-feed',
		...overrides
	};
}

function field(size: number, uValue: number, vValue: number): FieldState {
	const u = new Float64Array(size * size);
	const v = new Float64Array(size * size);
	const mask = new Uint8Array(size * size);
	u.fill(uValue);
	v.fill(vValue);
	mask.fill(1);
	return { size, u, v, mask };
}

describe('local ledger and global chemical budget', () => {
	it('23. integrates diffusion to approximately zero for periodic and no-flux closed domains', () => {
		for (const boundary of ['periodic', 'no-flux'] as const) {
			const state = field(16, 0, 0);
			for (let row = 0; row < 16; row += 1) {
				for (let column = 0; column < 16; column += 1) {
					state.u[row * 16 + column] =
						0.5 + 0.2 * Math.sin(column * 0.7) + 0.1 * Math.cos(row * 0.41);
				}
			}
			const budget = calculateChemicalBudget(
				state,
				setup({ boundary, feed: 0, kill: 0, diffusionU: 0.16, diffusionV: 0 })
			);
			expect(Math.abs(budget.diffusionU)).toBeLessThan(1e-15);
		}
	});

	it('24. balances uv² consumption from U against production into V before feed and kill', () => {
		const state = field(16, 0.6, 0.2);
		const configuration = setup({ diffusionU: 0, diffusionV: 0, feed: 0.03, kill: 0.05 });
		const budget = calculateChemicalBudget(state, configuration);
		expect(budget.autocatalysisU).toBeCloseTo(-budget.autocatalysisV, 15);
		const ledger = calculateLocalTermLedger(state, configuration, 5, 7);
		expect(ledger.reactionU).toBe(-ledger.reactionV);
	});

	it('25. reconciles measured mean change with the integrator-consistent global RHS', () => {
		const state = field(16, 0.74, 0.18);
		for (let index = 0; index < state.u.length; index += 1) {
			state.u[index] += 0.03 * Math.sin(index * 0.2);
			state.v[index] += 0.02 * Math.cos(index * 0.17);
		}
		const configuration = setup({ integrator: 'heun', boundary: 'periodic' });
		const after = stepField(state, configuration);
		const budget = calculateChemicalBudget(state, configuration, after);
		expect(budget.measuredChangeU).toBeCloseTo(budget.predictedChangeU, 13);
		expect(budget.measuredChangeV).toBeCloseTo(budget.predictedChangeV, 13);
		expect(Math.abs(budget.residualU ?? 1)).toBeLessThan(1e-13);
		expect(Math.abs(budget.residualV ?? 1)).toBeLessThan(1e-13);
	});
});
