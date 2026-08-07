import { describe, expect, it } from 'vitest';
import { DEFAULT_REACTION_DIFFUSION_SETUP } from './constants';
import { runNumericalComparison } from './numerical-experiments';

describe('controlled numerical-honesty experiments', () => {
	it('measures Euler and Heun against a real smaller-step Heun reference', () => {
		const result = runNumericalComparison(DEFAULT_REACTION_DIFFUSION_SETUP, 'integrator');
		expect(result.failed).toBe(false);
		expect(result.baselineReferenceL2).not.toBeNull();
		expect(result.comparisonReferenceL2).not.toBeNull();
		expect(result.comparisonReferenceL2!).toBeLessThan(result.baselineReferenceL2!);
		expect(result.trajectory).toHaveLength(9);
		expect(result.trajectory.at(-1)?.modelTime).toBe(result.modelTime);
		expect(result.outcome).toContain('Heun Δt/4 reference');
	});

	it('retains bounded equal-time metric trajectories for timestep and resolution studies', () => {
		for (const kind of ['timestep', 'resolution'] as const) {
			const result = runNumericalComparison(DEFAULT_REACTION_DIFFUSION_SETUP, kind);
			expect(result.failed).toBe(false);
			expect(result.trajectory.length).toBeGreaterThan(2);
			expect(result.trajectory.length).toBeLessThanOrEqual(9);
			expect(result.trajectory.every((sample) => Number.isFinite(sample.baselineMeanV))).toBe(true);
			expect(result.trajectory.at(-1)?.modelTime).toBe(result.modelTime);
		}
	});

	it('labels the opt-in experiment above the diffusion ceiling without repairing state', () => {
		const result = runNumericalComparison(DEFAULT_REACTION_DIFFUSION_SETUP, 'unsafe');
		expect(result.comparisonMu).toBeGreaterThan(0.25);
		expect(result.trajectory.length).toBeGreaterThan(0);
		expect(result.outcome).toMatch(/unsafe|No state was clipped|not evidence of convergence/iu);
	});
});
