import { describe, expect, it } from 'vitest';
import { estimateRingIntersections, type RingSphere } from './intersections';

function lineRings(count: number, spacing = 1, radius = 0.2): RingSphere[] {
	return Array.from({ length: count }, (_, index) => ({
		x: index * spacing,
		y: 0,
		z: 0,
		radius
	}));
}

describe('ring-envelope overlap estimate', () => {
	it('records the excluded local neighbourhood and complete pair count', () => {
		const estimate = estimateRingIntersections(lineRings(8), 2, 100);
		expect(estimate.excludedNeighborRings).toBe(2);
		expect(estimate.checkedPairCount).toBe(15);
		expect(estimate.truncated).toBe(false);
		expect(estimate.likely).toBe(false);
	});

	it('finds a possible overlap only beyond the excluded neighbours', () => {
		const rings = lineRings(8);
		rings[6] = { ...rings[2] };
		const estimate = estimateRingIntersections(rings, 2, 100);
		expect(estimate.likely).toBe(true);
		expect(estimate.firstPair).toEqual([2, 6]);
	});

	it('marks a bounded incomplete scan as truncated', () => {
		const estimate = estimateRingIntersections(lineRings(100), 3, 7);
		expect(estimate.checkedPairCount).toBe(7);
		expect(estimate.truncated).toBe(true);
		expect(estimate.pairCount).toBe(0);
	});

	it('stratifies a bounded scan across late as well as early ring pairs', () => {
		const rings = lineRings(100, 1, 0.1);
		for (let index = 75; index < rings.length; index += 1) rings[index].x = 1_000;
		const estimate = estimateRingIntersections(rings, 3, 40);
		expect(estimate.truncated).toBe(true);
		expect(estimate.likely).toBe(true);
		expect(estimate.firstPair?.[0]).toBeGreaterThanOrEqual(70);
	});
});
