import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOWER_CONFIG } from './config';
import {
	buildBloomGeometry,
	buildPetalRibbon,
	describeBloom,
	geometrySignature,
	squareSignedDistance
} from './geometry';

describe('Perlin Bloom normalized geometry', () => {
	it('builds deterministic whorls of genuinely closed petal ribbons', () => {
		const first = buildBloomGeometry(DEFAULT_FLOWER_CONFIG, { samplesPerPetal: 24 });
		const second = buildBloomGeometry({ ...DEFAULT_FLOWER_CONFIG }, { samplesPerPetal: 24 });
		expect(second).toEqual(first);
		expect(first.petals).toHaveLength(DEFAULT_FLOWER_CONFIG.petals * DEFAULT_FLOWER_CONFIG.whorls);
		expect(first.whorls).toHaveLength(DEFAULT_FLOWER_CONFIG.whorls);
		expect(geometrySignature(second)).toBe(geometrySignature(first));

		for (const petal of first.petals) {
			expect(petal.centerline).toHaveLength(24);
			expect(petal.ribbon).toHaveLength(24 * 2 + 1);
			expect(petal.ribbon.at(-1)).toEqual(petal.ribbon[0]);
			expect(petal.halfWidths[0]).toBe(0);
			expect(petal.halfWidths.at(-1)).toBe(0);
			petal.tangents.forEach((tangent, index) => {
				const normal = petal.normals[index];
				expect(Math.hypot(tangent.x, tangent.y)).toBeCloseTo(1, 10);
				expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1, 10);
				expect(tangent.x * normal.x + tangent.y * normal.y).toBeCloseTo(0, 10);
			});
		}
	});

	it('changes deterministic morphology when the seed changes without leaving normalized space', () => {
		const base = buildBloomGeometry(DEFAULT_FLOWER_CONFIG, { samplesPerPetal: 16 });
		const changed = buildBloomGeometry(
			{ ...DEFAULT_FLOWER_CONFIG, seed: 'outside-1848' },
			{ samplesPerPetal: 16 }
		);
		expect(changed.morphologyHash).not.toBe(base.morphologyHash);
		expect(geometrySignature(changed)).not.toBe(geometrySignature(base));
		for (const value of Object.values(base.bounds)) {
			expect(Number.isFinite(value)).toBe(true);
			expect(Math.abs(value)).toBeLessThan(2);
		}
	});

	it('accepts cached tangent and normal inputs when constructing a membrane', () => {
		const centerline = [
			{ x: 0, y: 0 },
			{ x: 0.5, y: 0 },
			{ x: 1, y: 0 }
		];
		const tangents = centerline.map(() => ({ x: 1, y: 0 }));
		const normals = centerline.map(() => ({ x: 0, y: 1 }));
		const ribbon = buildPetalRibbon(centerline, [0, 0.2, 0], tangents, normals);
		expect(ribbon.leftEdge[1]).toEqual({ x: 0.5, y: 0.2 });
		expect(ribbon.rightEdge[1]).toEqual({ x: 0.5, y: -0.2 });
		expect(ribbon.ribbon.at(-1)).toEqual(ribbon.ribbon[0]);
	});

	it('uses the documented square signed-distance boundary', () => {
		expect(squareSignedDistance({ x: 0, y: 0 }, 0.46)).toBeCloseTo(-0.46);
		expect(squareSignedDistance({ x: 0.46, y: -0.2 }, 0.46)).toBeCloseTo(0);
		expect(squareSignedDistance({ x: -0.6, y: 0.1 }, 0.46)).toBeCloseTo(0.14);

		const geometry = buildBloomGeometry(DEFAULT_FLOWER_CONFIG);
		const outerCrossings = geometry.petals.filter(
			(petal) => petal.whorlIndex === DEFAULT_FLOWER_CONFIG.whorls - 1 && petal.crossesBoundary
		);
		expect(outerCrossings.length).toBeGreaterThanOrEqual(3);
		expect(geometry.petals.flatMap((petal) => petal.boundaryDistances).every(Number.isFinite)).toBe(
			true
		);
		expect(describeBloom(DEFAULT_FLOWER_CONFIG, geometry)).toContain('outside-1847');
	});
});
