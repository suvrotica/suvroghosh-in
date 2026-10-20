import { describe, expect, it } from 'vitest';
import { computeMetrics } from './metrics';

describe('CT reconstruction Pearson correlation', () => {
	it('does not call a varying reconstruction perfectly correlated with constant ground truth', () => {
		expect(computeMetrics([0, 0, 0], [1, 2, 3]).correlation).toBeNull();
	});
	it('reports undefined correlation whenever either image has no variance', () => {
		expect(computeMetrics([1, 2, 3], [2, 2, 2]).correlation).toBeNull();
		expect(computeMetrics([0, 0, 0], [0, 0, 0]).correlation).toBeNull();
	});
	it('retains signed Pearson correlation for nonconstant images', () => {
		expect(computeMetrics([1, 2, 3], [2, 4, 6]).correlation).toBeCloseTo(1);
		expect(computeMetrics([1, 2, 3], [6, 4, 2]).correlation).toBeCloseTo(-1);
	});
});
