import { describe, expect, it } from 'vitest';
import { interpolateAngles, isAngleMultiple, quantizeAngle, wrapAngle } from './quantization';
import { classifyThreshold } from './thresholds';

describe('Invisible Weather directional grammars', () => {
	it('quantizes orthogonal, diagonal, and hexagonal angles to exact alphabets', () => {
		for (let index = -100; index <= 100; index += 1) {
			const angle = index * 0.137;
			expect(isAngleMultiple(quantizeAngle(angle, 'orthogonal'), Math.PI / 2)).toBe(true);
			expect(isAngleMultiple(quantizeAngle(angle, 'diagonal'), Math.PI / 4)).toBe(true);
			expect(isAngleMultiple(quantizeAngle(angle, 'hexagonal'), Math.PI / 3)).toBe(true);
		}
	});

	it('alternates local alphabets and soft quantization moves continuously across wraparound', () => {
		const raw = Math.PI - 0.08;
		expect(
			isAngleMultiple(quantizeAngle(raw, 'alternating', { x: 0.01, y: 0.01 }), Math.PI / 2)
		).toBe(true);
		expect(
			isAngleMultiple(quantizeAngle(raw, 'alternating', { x: 0.14, y: 0.01 }), Math.PI / 4)
		).toBe(true);
		expect(quantizeAngle(raw, 'soft', { softness: 0 })).toBeCloseTo(wrapAngle(raw));
		expect(quantizeAngle(raw, 'soft', { softness: 1 })).toBeCloseTo(quantizeAngle(raw, 'diagonal'));
		const samples = Array.from({ length: 21 }, (_, index) =>
			interpolateAngles(Math.PI - 0.02, -Math.PI + 0.02, index / 20)
		);
		expect(
			samples.slice(1).every((value, index) => Math.abs(wrapAngle(value - samples[index])) < 0.01)
		).toBe(true);
	});
});

describe('Invisible Weather threshold classification', () => {
	const base = { centre: 0.5, width: 0.08, tail: 0.2 } as const;

	it('uses a narrow middle band for River and the tails for Islands', () => {
		expect(classifyThreshold(0.5, { ...base, mode: 'river' }).selected).toBe(true);
		expect(classifyThreshold(0.7, { ...base, mode: 'river' }).selected).toBe(false);
		expect(classifyThreshold(0.05, { ...base, mode: 'islands' })).toMatchObject({
			selected: true,
			band: 'island-low'
		});
		expect(classifyThreshold(0.95, { ...base, mode: 'islands' })).toMatchObject({
			selected: true,
			band: 'island-high'
		});
		expect(classifyThreshold(0.5, { ...base, mode: 'islands' }).selected).toBe(false);
	});

	it('uses a bounded nearby-sample difference for Delta and never selects secondary ink when Off', () => {
		expect(classifyThreshold(0.5, { ...base, mode: 'delta' }, 0.53)).toMatchObject({
			selected: true,
			band: 'delta-river'
		});
		expect(classifyThreshold(0.5, { ...base, mode: 'delta' }, 0.5).selected).toBe(false);
		expect(classifyThreshold(0.5, { ...base, mode: 'delta' }, 0.8).selected).toBe(false);
		expect(classifyThreshold(0.37, { ...base, mode: 'off' })).toEqual({
			selected: false,
			band: 'field',
			weight: 0
		});
	});
});
