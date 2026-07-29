import { describe, expect, it } from 'vitest';
import {
	AMBIENT_BACKING_PIXEL_BUDGET,
	resolveAmbientFrameRate,
	resolveAmbientPixelRatio
} from './quality';

describe('ambient quality policy', () => {
	it('caps motion by preference and compact/coarse surfaces', () => {
		expect(resolveAmbientFrameRate('still', 1440, false)).toBe(0);
		expect(resolveAmbientFrameRate('gentle', 1440, false)).toBe(30);
		expect(resolveAmbientFrameRate('gentle', 390, true)).toBe(30);
		expect(resolveAmbientFrameRate('alive', 1440, false)).toBe(60);
		expect(resolveAmbientFrameRate('alive', 390, true)).toBe(45);
		expect(resolveAmbientFrameRate('alive', 1024, true)).toBe(45);
	});

	it.each([
		{
			name: 'high-DPR desktop',
			width: 1440,
			height: 1000,
			devicePixelRatio: 3,
			coarsePointer: false,
			budget: AMBIENT_BACKING_PIXEL_BUDGET.desktop
		},
		{
			name: '4K desktop',
			width: 3840,
			height: 2160,
			devicePixelRatio: 2,
			coarsePointer: false,
			budget: AMBIENT_BACKING_PIXEL_BUDGET.desktop
		},
		{
			name: 'high-DPR phone',
			width: 390,
			height: 844,
			devicePixelRatio: 3,
			coarsePointer: true,
			budget: AMBIENT_BACKING_PIXEL_BUDGET.compact
		},
		{
			name: 'coarse tablet',
			width: 1024,
			height: 768,
			devicePixelRatio: 2,
			coarsePointer: true,
			budget: AMBIENT_BACKING_PIXEL_BUDGET.compact
		}
	])('keeps the $name backing store within its absolute budget', (fixture) => {
		const ratio = resolveAmbientPixelRatio(fixture);
		const backingPixels = fixture.width * ratio * fixture.height * ratio;

		expect(ratio).toBeGreaterThan(0);
		expect(ratio).toBeLessThanOrEqual(fixture.coarsePointer ? 1.5 : 2);
		expect(backingPixels).toBeLessThanOrEqual(fixture.budget + 0.001);
	});

	it('falls back safely when the reported device ratio is invalid', () => {
		expect(
			resolveAmbientPixelRatio({
				width: 800,
				height: 600,
				devicePixelRatio: Number.NaN,
				coarsePointer: false
			})
		).toBe(1);
	});
});
