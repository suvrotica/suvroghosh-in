import { describe, expect, it } from 'vitest';
import {
	buildGaitPhaseOffsets,
	phaseOffsetForLimb,
	sampleFootTrajectory,
	sampleGaitTarget
} from './gait';
import type { GaitLimb } from './gait';

function limb(id: string, pairIndex: number, side: -1 | 1, phaseOffset = 0): GaitLimb {
	return { id, pairIndex, side, rootSegment: pairIndex, phaseOffset };
}

describe('Chitin gait oscillators', () => {
	it('forms alternating tripod groups and progressive myriapod waves', () => {
		const limbs = [
			limb('left-0', 0, -1),
			limb('right-0', 0, 1),
			limb('left-1', 1, -1),
			limb('right-1', 1, 1),
			limb('left-2', 2, -1),
			limb('right-2', 2, 1)
		];
		expect(buildGaitPhaseOffsets('tripod', limbs, 3)).toEqual([0, 0.5, 0.5, 0, 0, 0.5]);
		const wave = buildGaitPhaseOffsets('wave', limbs, 3);
		expect(wave[2]).toBeGreaterThan(wave[0]);
		expect(wave[4]).toBeGreaterThan(wave[2]);
		expect(wave[1]).toBeCloseTo(0.5, 10);
	});

	it('derives skitter offsets from stable identities rather than call order', () => {
		const candidate = limb('hind-right', 3, 1, 0.05);
		const first = phaseOffsetForLimb('skitter', candidate, 4, 'oxide-2241');
		const second = phaseOffsetForLimb('skitter', candidate, 4, 'oxide-2241');
		const other = phaseOffsetForLimb('skitter', candidate, 4, 'oxide-2242');
		expect(first).toBe(second);
		expect(other).not.toBe(first);
	});

	it('keeps stance low and lifts swing on a smooth arc', () => {
		const stance = sampleFootTrajectory(
			0.25,
			{ x: 4, y: 2 },
			{
				stanceRatio: 0.7,
				strideLength: 2,
				swingHeight: 0.8
			}
		);
		const middleSwing = sampleFootTrajectory(
			0.85,
			{ x: 4, y: 2 },
			{
				stanceRatio: 0.7,
				strideLength: 2,
				swingHeight: 0.8
			}
		);
		expect(stance.planted).toBe(true);
		expect(stance.target.y).toBe(2);
		expect(middleSwing.planted).toBe(false);
		expect(middleSwing.target.y).toBeCloseTo(1.2, 8);
		expect(middleSwing.swingProgress).toBeCloseTo(0.5, 10);
	});

	it('samples deterministic family targets and makes dormant limbs remain planted', () => {
		const candidate = limb('fore-left', 0, -1);
		const options = {
			family: 'stalk' as const,
			time: 3.25,
			cadence: 0.22,
			strideLength: 0.5,
			swingHeight: 0.16,
			restTarget: { x: -0.4, y: 0.8 },
			totalPairs: 4,
			seed: 'glassback-1847'
		};
		expect(sampleGaitTarget(candidate, options)).toEqual(sampleGaitTarget(candidate, options));
		const dormant = sampleGaitTarget(candidate, { ...options, family: 'dormant' });
		expect(dormant.planted).toBe(true);
		expect(dormant.phase).toBe(0);
		expect(dormant.target).toEqual(options.restTarget);
	});
});
