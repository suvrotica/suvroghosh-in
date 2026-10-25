import { describe, expect, it } from 'vitest';
import { isMassColumn, probabilityMassSeries } from './chart-series';

describe('probability mass chart series', () => {
	it('represents Bernoulli probabilities, independent of a histogram bin width', () => {
		const { points } = probabilityMassSeries([0, 0, 0, 1]);
		expect(points.map((p) => [p.x, p.count, p.probability])).toEqual([
			[0, 3, 0.75],
			[1, 1, 0.25]
		]);
		expect(points.reduce((sum, p) => sum + p.probability, 0)).toBe(1);
	});
	it('preserves fractional custom PMF support without rounding or interpolating', () => {
		const { points } = probabilityMassSeries(
			[0.25, 0.25, 2.5, 2.5],
			[],
			[
				{ x: 0.25, y: 0.5 },
				{ x: 2.5, y: 0.5 }
			]
		);
		expect(points.map((p) => [p.x, p.probability, p.modelProbability])).toEqual([
			[0.25, 0.5, 0.5],
			[2.5, 0.5, 0.5]
		]);
	});
	it('uses the same union of support for both independently normalized samples and the model', () => {
		const { points } = probabilityMassSeries([0, 0], [1, 1, 1, 2], [{ x: 3, y: 0.1 }]);
		expect(points.map((p) => [p.x, p.probability, p.baselineProbability])).toEqual([
			[0, 1, 0],
			[1, 0, 0.75],
			[2, 0, 0.25],
			[3, 0, 0]
		]);
		expect(points[3].modelProbability).toBe(0.1);
	});
	it('bounds support marks and reports omitted mass without renormalizing displayed points', () => {
		const series = probabilityMassSeries(
			[0, 0, 0, 0, 1, 1, 2, 3],
			[2, 2, 3, 3],
			[
				{ x: 0, y: 0.5 },
				{ x: 2, y: 0.3 },
				{ x: 3, y: 0.2 }
			],
			2
		);
		expect(series.points).toHaveLength(2);
		expect(series.supportCount).toBe(4);
		expect(
			series.points.reduce((sum, p) => sum + p.probability, 0) + series.omittedProbability
		).toBeCloseTo(1);
		expect(
			series.points.reduce((sum, p) => sum + p.baselineProbability, 0) +
				series.omittedBaselineProbability
		).toBeCloseTo(1);
		expect(
			series.points.reduce((sum, p) => sum + (p.modelProbability ?? 0), 0) +
				series.omittedModelProbability
		).toBeCloseTo(1);
		expect(series.omittedProbability).toBeGreaterThan(0);
	});
	it('excludes nonfinite observations from empirical probability denominators', () => {
		const { points } = probabilityMassSeries([0, 1, NaN, Infinity]);
		expect(points.map((p) => p.probability)).toEqual([0.5, 0.5]);
	});
	it('recognizes fractional PMFs but does not treat noisy integer-typed observations as mass data', () => {
		expect(isMassColumn('pmf', 'numeric', [0.25, 2.5])).toBe(true);
		expect(isMassColumn(undefined, 'integer', [0, 1, 2])).toBe(true);
		expect(isMassColumn(undefined, 'integer', [0, 0.2, 1.1])).toBe(false);
		expect(isMassColumn('pdf', 'numeric', [0, 1, 2])).toBe(false);
	});
});
