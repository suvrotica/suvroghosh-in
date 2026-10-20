import { describe, expect, it } from 'vitest';
import { diagnosticExtent, isPlottablePoint } from './diagnostic-scales';

describe('logarithmic Brownian diagnostics', () => {
	it('keeps the initial zero-time/zero-MSD sample out of the logarithmic domain', () => {
		expect(isPlottablePoint({ x: 0, y: 0 }, true)).toBe(false);
		expect(diagnosticExtent([0, 0.01, 0.1, 1], true)).toEqual([-2, 0]);
		expect(diagnosticExtent([0, -1, Number.NaN], true)).toEqual([0, 1]);
	});

	it('shows a useful nonzero span for a single positive sample', () => {
		expect(diagnosticExtent([0.01], true)).toEqual([-2.5, -1.5]);
		expect(isPlottablePoint({ x: 1, y: Number.POSITIVE_INFINITY }, false)).toBe(false);
	});
});
