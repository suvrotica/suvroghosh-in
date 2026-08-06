import { describe, expect, it } from 'vitest';
import { ROSENBROCK_LANDSCAPE } from './landscapes';
import { sampleLandscapeGrid } from './sampled-grid';

describe('sampled landscape display bounds', () => {
	it('keeps the known Rosenbrock minimum instead of replacing it with a percentile floor', () => {
		const grid = sampleLandscapeGrid(ROSENBROCK_LANDSCAPE, 84);
		expect(grid.rawFloor).toBe(0);
		expect(grid.min).toBe(0);
		expect(grid.sampledMinimum).toBeGreaterThan(0);
		expect(grid.rawFloor).toBeLessThan(grid.sampledMinimum);
		expect(grid.displayCeiling).toBeGreaterThan(1_000);
		expect(grid.displayCeiling).toBeLessThan(2_000);
	});
});
