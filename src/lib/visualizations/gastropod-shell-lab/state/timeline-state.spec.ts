import { describe, expect, it } from 'vitest';
import { visibleRingCountAtAge } from '../shell/engine/history';
import { TimelineState } from './timeline-state.svelte';

describe('TimelineState', () => {
	for (const ringCount of [2, 240, 400, 900]) {
		it(`steps through all ${ringCount} rings exactly once in both directions`, () => {
			const timeline = new TimelineState();
			timeline.restart();

			for (let ring = 1; ring < ringCount; ring += 1) {
				timeline.step(1, ringCount);
				expect(visibleRingCountAtAge(ringCount, timeline.age)).toBe(ring + 1);
				expect(timeline.age).toBeCloseTo(ring / (ringCount - 1), 14);
			}
			timeline.step(1, ringCount);
			expect(timeline.age).toBe(1);

			for (let ring = ringCount - 2; ring >= 0; ring -= 1) {
				timeline.step(-1, ringCount);
				expect(visibleRingCountAtAge(ringCount, timeline.age)).toBe(ring + 1);
				expect(timeline.age).toBeCloseTo(ring / (ringCount - 1), 14);
			}
			timeline.step(-1, ringCount);
			expect(timeline.age).toBe(0);
		});
	}
});
