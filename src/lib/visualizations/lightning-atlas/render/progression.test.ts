import { describe, expect, it } from 'vitest';
import { updateProgressiveSegmentPositions } from './progression';

describe('Lightning Atlas progressive segment geometry', () => {
	it.each([
		[0, [1, 2, 3, 1, 2, 3, -2, 5, 8, -2, 5, 8]],
		[0.5, [1, 2, 3, 3, 5, 7, -2, 5, 8, 2, 2, 9]],
		[1, [1, 2, 3, 5, 8, 11, -2, 5, 8, 6, -1, 10]]
	] as const)('moves every endpoint from its start at progress %s', (progress, expected) => {
		const target = new Float32Array([1, 2, 3, 5, 8, 11, -2, 5, 8, 6, -1, 10]);
		const output = new Float32Array(target.length);
		updateProgressiveSegmentPositions(target, output, progress);
		expect(Array.from(output)).toEqual(expected);
	});

	it('clamps out-of-range playback progress without allocating replacement storage', () => {
		const target = new Float32Array([0, 0, 0, 3, 6, 9]);
		const output = new Float32Array(6);
		updateProgressiveSegmentPositions(target, output, 4);
		expect(Array.from(output)).toEqual(Array.from(target));
		updateProgressiveSegmentPositions(target, output, -2);
		expect(Array.from(output)).toEqual([0, 0, 0, 0, 0, 0]);
	});
});
