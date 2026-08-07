import { describe, expect, it } from 'vitest';
import { DEFAULT_REACTION_DIFFUSION_SETUP } from './constants';
import { conservativelyRestrictCellValues, runNumericalComparison } from './numerical-experiments';

describe('conservative fine-grid restriction', () => {
	it('reduces an integer-ratio grid by exact 2 × 2 block averages', () => {
		const fine = Float64Array.from({ length: 16 }, (_, index) => index + 1);

		expect([...conservativelyRestrictCellValues(fine, 4, 2)]).toEqual([3.5, 5.5, 11.5, 13.5]);
	});

	it('area-weights arbitrary ratios while conserving the domain mean', () => {
		const fine = Float64Array.from({ length: 25 }, (_, index) => {
			const row = Math.floor(index / 5);
			const column = index % 5;
			return row * 10 + column;
		});
		const restricted = conservativelyRestrictCellValues(fine, 5, 3);
		const fineMean = fine.reduce((sum, value) => sum + value, 0) / fine.length;
		const restrictedMean = restricted.reduce((sum, value) => sum + value, 0) / restricted.length;

		const expected = [4.4, 6, 7.6, 20.4, 22, 23.6, 36.4, 38, 39.6];
		expected.forEach((value, index) => expect(restricted[index]).toBeCloseTo(value, 12));
		expect(restrictedMean).toBeCloseTo(fineMean, 12);
	});
});

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

	it('states the conservative resolution-norm semantics', () => {
		const result = runNumericalComparison(DEFAULT_REACTION_DIFFUSION_SETUP, 'resolution');

		expect(result.outcome).toContain('coarse cell-centred values');
		expect(result.outcome).toContain('area-weighted fine-cell averages');
		expect(result.outcome).toContain('same coarse physical grid');
	});

	it('labels the opt-in experiment above the diffusion ceiling without repairing state', () => {
		const result = runNumericalComparison(DEFAULT_REACTION_DIFFUSION_SETUP, 'unsafe');
		expect(result.comparisonMu).toBeGreaterThan(0.25);
		expect(result.trajectory.length).toBeGreaterThan(0);
		expect(result.outcome).toMatch(/unsafe|No state was clipped|not evidence of convergence/iu);
	});
});
