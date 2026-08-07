import { describe, expect, it } from 'vitest';
import { maskContains, maskWeight } from './masks';
import { generateArtworkPaths, generateFlowPath, rk2Step, sampleSecondaryField } from './paths';
import { createExhibitionRecipe, stateForPreset } from './recipes';
import { classifyThreshold } from './thresholds';
import type { MaskKind } from './types';

describe('Invisible Weather masks and RK2 paths', () => {
	const masks: MaskKind[] = [
		'rectangle',
		'oval',
		'ellipse',
		'circle',
		'arch',
		'capsule',
		'diamond',
		'stepped-niche',
		'offset-diptych',
		'quadrilateral',
		'split-horizontal',
		'three-window',
		'river-band'
	];

	it('keeps each declared mask finite, bounded, and visibly selective', () => {
		for (const mask of masks) {
			const samples = Array.from({ length: 21 * 21 }, (_, index) => {
				const x = (index % 21) / 20;
				const y = Math.floor(index / 21) / 20;
				return maskContains(mask, x, y);
			});
			expect(samples.some(Boolean), mask).toBe(true);
			expect(
				samples.some((value) => !value),
				mask
			).toBe(true);
			expect(maskWeight(mask, 0.5, 0.5)).toBeGreaterThanOrEqual(0);
			expect(maskWeight(mask, 0.5, 0.5)).toBeLessThanOrEqual(1);
		}
	});

	it('keeps structural river-band mask geometry fixed while field phase moves', () => {
		for (let index = 0; index <= 100; index += 1) {
			const x = (index % 11) / 10;
			const y = Math.floor(index / 11) / 9;
			expect(maskContains('river-band', x, y, { phase: 0 })).toBe(
				maskContains('river-band', x, y, { phase: 918.25 })
			);
		}
	});

	it('uses a midpoint RK2 step and terminates paths at bounds', () => {
		const rotational = (x: number, y: number) => ({ x: -(y - 0.5), y: x - 0.5 });
		const eulerLike = { x: 0.75, y: 0.5 };
		const next = rk2Step(rotational, eulerLike, 0.1);
		expect(next.x).toBeLessThan(0.75);
		expect(next.y).toBeGreaterThan(0.5);
		const path = generateFlowPath(
			() => ({ x: 1, y: 0 }),
			{ x: 0.5, y: 0.5 },
			{
				stepSize: 0.1,
				maxSteps: 100
			}
		);
		expect(path.length).toBeGreaterThan(2);
		expect(path.at(-1)!.x).toBeLessThanOrEqual(1);
	});

	it('generates deterministic, short, finite artwork paths from the real recipe', () => {
		const recipe = createExhibitionRecipe({
			...stateForPreset('three-large-silences'),
			pathDensity: 0.2,
			pathLength: 12
		});
		const artwork = recipe.artworks[0];
		const first = generateArtworkPaths(artwork, { phase: 1.25, maxPaths: 18 });
		const second = generateArtworkPaths(artwork, { phase: 1.25, maxPaths: 18 });
		expect(first).toEqual(second);
		expect(first).toHaveLength(18);
		expect(first.every((path) => path.points.length >= 2 && path.points.length <= 13)).toBe(true);
		expect(
			first.every((path) =>
				path.points.every((point) =>
					[point.x, point.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
				)
			)
		).toBe(true);
	});

	it('draws primary traces first and limits secondary ink to classified runs of a separate field', () => {
		const recipe = createExhibitionRecipe({
			...stateForPreset('monsoon-ledger', 'secondary-river'),
			pathDensity: 0.2,
			pathLength: 24
		});
		const source = recipe.artworks.find((artwork) => artwork.secondaryInk) ?? recipe.artworks[0];
		const artwork = {
			...source,
			dualInk: true,
			secondaryInk: source.secondaryInk ?? '#711F1B',
			threshold: { ...source.threshold, mode: 'river' as const, width: 0.35 }
		};
		const paths = generateArtworkPaths(artwork, { phase: 0.75, maxPaths: 16 });
		const primary = paths.filter((path) => path.ink === 'primary');
		const secondary = paths.filter((path) => path.ink === 'secondary');
		expect(primary).toHaveLength(16);
		expect(secondary.length).toBeGreaterThan(0);
		expect(paths.slice(0, primary.length).every((path) => path.ink === 'primary')).toBe(true);
		for (const path of secondary) {
			for (const point of path.points) {
				const value = sampleSecondaryField(artwork, point.x, point.y, 0.75);
				expect(classifyThreshold(value, artwork.threshold).selected).toBe(true);
			}
		}
	});
});
