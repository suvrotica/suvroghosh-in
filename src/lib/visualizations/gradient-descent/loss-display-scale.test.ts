import { describe, expect, it } from 'vitest';
import {
	displayContourLevels,
	lossDisplayBounds,
	normalizeLossForDisplay,
	rawLossAtDisplayPosition
} from './loss-display-scale';

const rosenbrockLikeGrid = {
	rawFloor: 0,
	displayCeiling: 1_411.975
};

describe('shared loss display scale', () => {
	it('preserves the true floor and round-trips raw values through each display mapping', () => {
		for (const mapping of ['linear', 'log-compressed'] as const) {
			expect(normalizeLossForDisplay(0, rosenbrockLikeGrid, mapping)).toBe(0);
			expect(normalizeLossForDisplay(1_411.975, rosenbrockLikeGrid, mapping)).toBe(1);
			for (const value of [0.01, 0.1, 1, 3, 30, 300, 1_000]) {
				const position = normalizeLossForDisplay(value, rosenbrockLikeGrid, mapping);
				expect(rawLossAtDisplayPosition(position, rosenbrockLikeGrid, mapping)).toBeCloseTo(
					value,
					10
				);
			}
		}
	});

	it('concentrates log-compressed contour thresholds near the destination', () => {
		const levels = displayContourLevels(rosenbrockLikeGrid, 13, 'log-compressed');
		expect(levels).toHaveLength(13);
		expect(levels[0]).toBeLessThan(1);
		expect(levels[1]).toBeLessThan(3);
		expect(levels.at(-1)).toBeGreaterThan(500);
		expect(levels.every((level, index) => index === 0 || level > levels[index - 1])).toBe(true);

		const linearLevels = displayContourLevels(rosenbrockLikeGrid, 13, 'linear');
		expect(linearLevels[0]).toBeGreaterThan(100);
	});

	it('creates a finite relative range when a large floor and ceiling coincide', () => {
		const bounds = lossDisplayBounds({ rawFloor: 1e20, displayCeiling: 1e20 });
		expect(bounds.ceiling).toBeGreaterThan(bounds.floor);
		expect(bounds.range).toBeGreaterThan(0);
		expect(Number.isFinite(bounds.range)).toBe(true);
	});
});
