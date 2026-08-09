import { describe, expect, it } from 'vitest';
import {
	generalizedSuperellipseMaskValue,
	generateSurfaceSamples,
	isInsideGeneralizedSuperellipse,
	sampleMinimumDistanceInSuperellipse
} from './surface-sampling';

function minimumPairDistance(points: readonly { x: number; y: number }[]): number {
	let minimum = Number.POSITIVE_INFINITY;
	for (let left = 0; left < points.length; left += 1) {
		for (let right = left + 1; right < points.length; right += 1) {
			minimum = Math.min(
				minimum,
				Math.hypot(points[left].x - points[right].x, points[left].y - points[right].y)
			);
		}
	}
	return minimum;
}

describe('Chitin minimum-distance surface sampling', () => {
	const mask = {
		radiusX: 2.4,
		radiusY: 1.1,
		exponent: 3.2,
		lobeAmplitude: 0.08,
		lobeCount: 5,
		lobePhase: 0.4
	};

	it('keeps every deterministic point inside the generalized-superellipse mask', () => {
		const first = sampleMinimumDistanceInSuperellipse({
			seed: 'glassback-1847',
			count: 48,
			minimumDistance: 0.18,
			mask,
			edgePadding: 0.04
		});
		const second = sampleMinimumDistanceInSuperellipse({
			seed: 'glassback-1847',
			count: 48,
			minimumDistance: 0.18,
			mask,
			edgePadding: 0.04
		});
		expect(first.exhausted).toBe(false);
		expect(first.points).toHaveLength(48);
		expect(first.points).toEqual(second.points);
		expect(first.points.every((point) => isInsideGeneralizedSuperellipse(point, mask, 0.04))).toBe(
			true
		);
		expect(minimumPairDistance(first.points)).toBeGreaterThanOrEqual(0.18 - 1e-8);
	});

	it('changes placement with the seed while retaining deterministic bounds', () => {
		const base = {
			count: 20,
			minimumDistance: 0.2,
			mask
		};
		const first = sampleMinimumDistanceInSuperellipse({ ...base, seed: 'brine-1200' });
		const second = sampleMinimumDistanceInSuperellipse({ ...base, seed: 'brine-1201' });
		expect(second.points).not.toEqual(first.points);
		expect(second.attempts).toBeLessThanOrEqual(20 * 96);
	});

	it('recognizes oval, squared, and harmonically lobed mask boundaries', () => {
		expect(generalizedSuperellipseMaskValue({ x: 0, y: 0 }, mask)).toBe(0);
		expect(isInsideGeneralizedSuperellipse({ x: 2.5, y: 1 }, mask)).toBe(false);
		expect(
			generalizedSuperellipseMaskValue({ x: 0.9, y: 0.9 }, { radiusX: 1, radiusY: 1, exponent: 8 })
		).toBeLessThan(
			generalizedSuperellipseMaskValue({ x: 0.9, y: 0.9 }, { radiusX: 1, radiusY: 1, exponent: 2 })
		);
	});

	it('terminates a physically impossible dense request at the explicit attempt cap', () => {
		const result = sampleMinimumDistanceInSuperellipse({
			seed: 'bounded-failure',
			count: 100,
			minimumDistance: 1.5,
			mask: { radiusX: 1, radiusY: 1, exponent: 2 },
			maxAttempts: 250
		});
		expect(result.exhausted).toBe(true);
		expect(result.attempts).toBe(250);
		expect(result.points.length).toBeLessThan(100);
		expect(minimumPairDistance(result.points)).toBeGreaterThanOrEqual(1.5 - 1e-8);
	});

	it('generates stable typed surface records with bounded scale and angle', () => {
		const options = {
			seed: 'oxide-pits',
			count: 16,
			minimumDistance: 0.25,
			mask,
			plateIndex: 7,
			kind: 'pit' as const,
			minimumScale: 0.3,
			maximumScale: 0.7
		};
		const samples = generateSurfaceSamples(options);
		expect(samples).toEqual(generateSurfaceSamples(options));
		expect(samples.every((sample) => sample.plateIndex === 7 && sample.kind === 'pit')).toBe(true);
		expect(samples.every((sample) => sample.scale >= 0.3 && sample.scale <= 0.7)).toBe(true);
		expect(samples.every((sample) => Number.isFinite(sample.angle))).toBe(true);
	});
});
