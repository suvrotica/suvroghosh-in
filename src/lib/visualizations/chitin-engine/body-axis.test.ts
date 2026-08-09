import { describe, expect, it } from 'vitest';
import {
	buildArcLengthLookup,
	buildBodyAxis,
	repairAxisControlPoints,
	sampleAxisPoint,
	sampleAxisPosition
} from './body-axis';

function separation(left: { x: number; y: number }, right: { x: number; y: number }): number {
	return Math.hypot(right.x - left.x, right.y - left.y);
}

describe('Chitin body axis', () => {
	it('places straight-axis samples at ordered, equal arc-length intervals', () => {
		const axis = buildBodyAxis(
			[
				{ x: -4, y: 0 },
				{ x: -1, y: 0 },
				{ x: 6, y: 0 }
			],
			11
		);
		expect(axis.map((point) => point.s)).toEqual(
			Array.from({ length: 11 }, (_, index) => index / 10)
		);
		const distances = axis
			.slice(1)
			.map((point, index) => separation(axis[index].position, point.position));
		for (const value of distances) expect(value).toBeCloseTo(1, 6);
	});

	it('uses an arc-length lookup rather than raw spline parameter spacing', () => {
		const lookup = buildArcLengthLookup(
			[
				{ x: 0, y: 0 },
				{ x: 0.2, y: 2.5 },
				{ x: 3.5, y: 3 },
				{ x: 8, y: 0 }
			],
			{ samplesPerSegment: 128 }
		);
		const points = Array.from({ length: 17 }, (_, index) => sampleAxisPosition(lookup, index / 16));
		const distances = points.slice(1).map((point, index) => separation(points[index], point));
		const minimum = Math.min(...distances);
		const maximum = Math.max(...distances);
		expect(maximum / minimum).toBeLessThan(1.08);
	});

	it('produces finite unit tangents and perpendicular normals at both endpoints', () => {
		const lookup = buildArcLengthLookup([
			{ x: 0, y: 0 },
			{ x: 1, y: 2 },
			{ x: 4, y: 1 }
		]);
		for (const s of [0, 0.25, 0.5, 0.75, 1]) {
			const point = sampleAxisPoint(lookup, s);
			expect(Object.values(point.position).every(Number.isFinite)).toBe(true);
			expect(Math.hypot(point.tangent.x, point.tangent.y)).toBeCloseTo(1, 8);
			expect(Math.hypot(point.normal.x, point.normal.y)).toBeCloseTo(1, 8);
			expect(point.tangent.x * point.normal.x + point.tangent.y * point.normal.y).toBeCloseTo(0, 8);
		}
	});

	it('repairs non-finite and collapsed controls deterministically without NaN', () => {
		const hostile = [
			{ x: Number.NaN, y: Number.POSITIVE_INFINITY },
			{ x: 7, y: 7 },
			{ x: 7, y: 7 }
		];
		const firstRepair = repairAxisControlPoints(hostile);
		const secondRepair = repairAxisControlPoints(hostile);
		expect(firstRepair).toEqual(secondRepair);
		const first = buildBodyAxis(hostile, 25);
		const second = buildBodyAxis(hostile, 25);
		expect(first).toEqual(second);
		expect(
			first.every((point) =>
				[
					point.position.x,
					point.position.y,
					point.tangent.x,
					point.tangent.y,
					point.normal.x,
					point.normal.y
				].every(Number.isFinite)
			)
		).toBe(true);
	});
});
