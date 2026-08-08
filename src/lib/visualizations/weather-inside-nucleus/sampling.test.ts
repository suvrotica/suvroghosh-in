import { describe, expect, it } from 'vitest';
import { sampleIndexAtOrBefore } from './sampling';

describe('weather nucleus discrete trace sampling', () => {
	const times = Float64Array.from([0, 0.5, 1, 1.5]);

	it('never looks ahead between sample boundaries', () => {
		expect(sampleIndexAtOrBefore(times, 0.26)).toBe(0);
		expect(sampleIndexAtOrBefore(times, 0.49)).toBe(0);
		expect(sampleIndexAtOrBefore(times, 0.99)).toBe(1);
	});

	it('selects a sample exactly when its boundary is reached', () => {
		expect(sampleIndexAtOrBefore(times, 0.5)).toBe(1);
		expect(sampleIndexAtOrBefore(times, 1)).toBe(2);
		expect(sampleIndexAtOrBefore(times, 1.5)).toBe(3);
	});

	it('clamps times outside the trace and handles absent data', () => {
		expect(sampleIndexAtOrBefore(times, -1)).toBe(0);
		expect(sampleIndexAtOrBefore(times, Number.POSITIVE_INFINITY)).toBe(3);
		expect(sampleIndexAtOrBefore(times, Number.NaN)).toBe(0);
		expect(sampleIndexAtOrBefore([], 1)).toBe(0);
		expect(sampleIndexAtOrBefore(null, 1)).toBe(0);
	});
});
