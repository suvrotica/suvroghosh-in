import { describe, expect, it } from 'vitest';
import { spectralDensityHistogram } from './spectral-density';

describe('comparable empirical spectral density', () => {
	it('normalizes area, rather than peak height, and does not depend on ensemble sample count', () => {
		const values = [0, 0.1, 0.2, 0.7, 1];
		const density = spectralDensityHistogram(values, [0, 1], 4);
		expect(density.reduce((sum, value) => sum + value * 0.25, 0)).toBeCloseTo(1, 14);
		expect(spectralDensityHistogram([...values, ...values], [0, 1], 4)).toEqual(density);
		expect(density).toEqual([2.4, 0, 0.8, 0.8]);
	});

	it('retains the probability carried by a zero atom', () => {
		const density = spectralDensityHistogram([0, 0, 1, 2], [-0.5, 2.5], 3);
		expect(density).toEqual([0.5, 0.25, 0.25]);
	});
});
