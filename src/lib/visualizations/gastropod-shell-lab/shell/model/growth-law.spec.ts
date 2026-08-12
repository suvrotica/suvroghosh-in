import { describe, expect, it } from 'vitest';
import { GrowthLawSchema, evaluateGrowthLaw, sampleGrowthLaw } from './growth-law';

describe('GrowthLaw', () => {
	it('evaluates constants and clamps normalized age', () => {
		const law = { type: 'linear', start: 2, end: 6 } as const;
		expect(evaluateGrowthLaw(law, -4)).toBe(2);
		expect(evaluateGrowthLaw(law, 0.25)).toBe(3);
		expect(evaluateGrowthLaw(law, 2)).toBe(6);
		expect(evaluateGrowthLaw({ type: 'constant', value: 7 }, 0.73)).toBe(7);
	});

	it('supports bounded cubic Hermite interpolation without overshoot', () => {
		const bounded = GrowthLawSchema.parse({
			type: 'hermite',
			start: 0,
			end: 1,
			startSlope: 20,
			endSlope: -20,
			clampOvershoot: true
		});
		const samples = sampleGrowthLaw(bounded, 101);
		expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...samples)).toBeLessThanOrEqual(1);
		expect(samples[0]).toBe(0);
		expect(samples.at(-1)).toBe(1);
	});

	it('evaluates episodes, sinusoids, and ordered keyframes deterministically', () => {
		const episode = GrowthLawSchema.parse({
			type: 'step',
			base: 1,
			episodes: [{ start: 0.3, end: 0.4, value: 4 }]
		});
		expect([0.2, 0.35, 0.5].map((age) => evaluateGrowthLaw(episode, age))).toEqual([1, 4, 1]);

		const sinusoid = GrowthLawSchema.parse({
			type: 'sinusoid',
			offset: 3,
			amplitude: 2,
			cycles: 1,
			phase: 0
		});
		expect(evaluateGrowthLaw(sinusoid, 0.25)).toBeCloseTo(5, 12);

		const smooth = GrowthLawSchema.parse({
			type: 'keyframes',
			interpolation: 'smooth',
			points: [
				{ age: 0, value: 2 },
				{ age: 0.5, value: 6 },
				{ age: 1, value: 4 }
			]
		});
		expect(evaluateGrowthLaw(smooth, 0)).toBe(2);
		expect(evaluateGrowthLaw(smooth, 0.25)).toBe(4);
		expect(evaluateGrowthLaw(smooth, 0.5)).toBe(6);
		expect(evaluateGrowthLaw(smooth, 0.75)).toBe(5);
		expect(evaluateGrowthLaw(smooth, 1)).toBe(4);
		expect(sampleGrowthLaw(smooth, 17)).toEqual(sampleGrowthLaw(smooth, 17));
	});

	it('rejects unordered or repeated keyframe ages', () => {
		const parsed = GrowthLawSchema.safeParse({
			type: 'keyframes',
			interpolation: 'linear',
			points: [
				{ age: 0.4, value: 1 },
				{ age: 0.4, value: 2 }
			]
		});
		expect(parsed.success).toBe(false);
	});
});
