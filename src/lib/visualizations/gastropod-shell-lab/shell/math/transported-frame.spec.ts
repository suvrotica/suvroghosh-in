import { describe, expect, it } from 'vitest';
import { buildRotationMinimizingFrames, mirrorChirality } from './transported-frame';
import { determinant3, dot3, length3, type Vec3 } from './vector';

describe('rotation-minimizing frames', () => {
	it('remain finite, orthonormal, right-handed, and free of unexplained flips', () => {
		const points: Vec3[] = Array.from({ length: 180 }, (_, index) => {
			const age = index / 179;
			const theta = age * Math.PI * 7;
			return {
				x: Math.cos(theta),
				y: Math.sin(theta),
				z: age + 0.06 * Math.sin(theta * 0.37)
			};
		});
		const frames = buildRotationMinimizingFrames(points);
		for (let index = 0; index < frames.length; index += 1) {
			const frame = frames[index];
			for (const vector of [frame.tangent, frame.e1, frame.e2]) {
				expect([vector.x, vector.y, vector.z].every(Number.isFinite)).toBe(true);
				expect(Math.abs(length3(vector) - 1)).toBeLessThan(1e-10);
			}
			expect(Math.abs(dot3(frame.tangent, frame.e1))).toBeLessThan(1e-10);
			expect(Math.abs(dot3(frame.tangent, frame.e2))).toBeLessThan(1e-10);
			expect(Math.abs(dot3(frame.e1, frame.e2))).toBeLessThan(1e-10);
			expect(determinant3(frame.tangent, frame.e1, frame.e2)).toBeGreaterThan(0.9999);
			if (index > 0) expect(dot3(frames[index - 1].e1, frame.e1)).toBeGreaterThan(0.85);
		}
	});

	it('recovers a point after applying the chirality mirror twice', () => {
		const point = { x: 1.25, y: -3.75, z: 9.5 };
		expect(mirrorChirality(mirrorChirality(point))).toEqual(point);
	});
});
