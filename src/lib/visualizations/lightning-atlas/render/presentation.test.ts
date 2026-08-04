import { describe, expect, it } from 'vitest';
import type { LightningSegment } from '../types';
import {
	calculateEventFraming,
	dominantEventYaw,
	majorEventBounds,
	segmentHierarchy,
	segmentRelativeBrightness,
	segmentRelativeThickness,
	shouldPresentSegment
} from './presentation';

function segment(overrides: Partial<LightningSegment> = {}): LightningSegment {
	return {
		start: { x: 0, y: 3_200, z: 0 },
		end: { x: 120, y: 3_000, z: 60 },
		parentIndex: -1,
		branchDepth: 0,
		birthStep: 0,
		energy: 1,
		isMainChannel: true,
		channelClass: 'main',
		hierarchyDepth: 0,
		relativeThickness: 1.62,
		relativeBrightness: 1.12,
		persistence: 1,
		...overrides
	};
}

describe('Lightning Atlas hierarchy presentation', () => {
	it('preserves substantial engine-authored width and brightness', () => {
		const trunk = segment();
		const primary = segment({
			isMainChannel: false,
			channelClass: 'primary',
			hierarchyDepth: 1,
			branchDepth: 1,
			relativeThickness: 0.88,
			relativeBrightness: 0.86
		});
		expect(segmentHierarchy(trunk)).toBe(0);
		expect(segmentHierarchy(primary)).toBe(1);
		expect(segmentRelativeThickness(trunk)).toBe(1.62);
		expect(segmentRelativeBrightness(primary)).toBe(0.86);
	});

	it('simplifies the same strike by hierarchy without changing main or primary segments', () => {
		const main = segment();
		const primary = segment({
			isMainChannel: false,
			channelClass: 'primary',
			hierarchyDepth: 1
		});
		const secondary = segment({
			isMainChannel: false,
			channelClass: 'secondary',
			hierarchyDepth: 2
		});
		const tertiary = segment({
			isMainChannel: false,
			channelClass: 'tertiary',
			hierarchyDepth: 3
		});
		expect(
			[main, primary, secondary, tertiary].map((entry) =>
				shouldPresentSegment(entry, true, 'full', 'low')
			)
		).toEqual([true, true, true, false]);
		expect(
			[main, primary, secondary, tertiary].map((entry) =>
				shouldPresentSegment(entry, true, 'primary', 'high')
			)
		).toEqual([true, true, false, false]);
	});
});

describe('Lightning Atlas hero framing', () => {
	it('ignores distant tertiary twigs when fitting the main event', () => {
		const bounds = majorEventBounds([
			segment({ start: { x: -400, y: 3_200, z: 0 }, end: { x: 0, y: 1_600, z: 0 } }),
			segment({
				isMainChannel: false,
				channelClass: 'primary',
				hierarchyDepth: 1,
				start: { x: 0, y: 2_700, z: 0 },
				end: { x: 1_200, y: 2_100, z: 200 }
			}),
			segment({
				isMainChannel: false,
				channelClass: 'tertiary',
				hierarchyDepth: 3,
				start: { x: 1_200, y: 2_100, z: 200 },
				end: { x: 9_000, y: 2_000, z: 8_000 }
			})
		]);
		expect(bounds).toMatchObject({ minX: -400, maxX: 1_200, maxZ: 200 });
	});

	it('turns the broad primary canopy into the screen plane', () => {
		const canopy = [
			segment({ start: { x: -1_200, y: 3_000, z: 0 }, end: { x: 0, y: 2_500, z: 0 } }),
			segment({
				isMainChannel: false,
				channelClass: 'primary',
				hierarchyDepth: 1,
				start: { x: 0, y: 2_500, z: 0 },
				end: { x: 1_400, y: 2_100, z: 80 }
			})
		];
		const yaw = dominantEventYaw(canopy, 0.74);
		expect(Math.abs(Math.sin(yaw))).toBeGreaterThan(0.98);
		expect(dominantEventYaw(canopy, -1.2)).toBe(yaw);
		expect(dominantEventYaw(canopy, 2.4)).toBe(yaw);
	});

	it.each([
		[16 / 9, 0.4, 0.8, 0.25, 0.6],
		[9 / 16, 0.36, 0.8, 0.25, 0.74]
	] as const)(
		'keeps a hero event dominant at aspect %s',
		(aspect, minHeight, maxHeight, minWidth, maxWidth) => {
			const framing = calculateEventFraming(
				{ minX: -1_350, maxX: 1_350, minY: 120, maxY: 3_300, minZ: -500, maxZ: 500 },
				aspect,
				50,
				0.74,
				'hero'
			);
			expect(framing.projectedHeightRatio).toBeGreaterThanOrEqual(minHeight);
			expect(framing.projectedHeightRatio).toBeLessThanOrEqual(maxHeight);
			expect(framing.projectedWidthRatio).toBeGreaterThanOrEqual(minWidth);
			expect(framing.projectedWidthRatio).toBeLessThanOrEqual(maxWidth);
		}
	);
});
