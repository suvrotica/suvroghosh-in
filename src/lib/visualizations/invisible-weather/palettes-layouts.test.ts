import { describe, expect, it } from 'vitest';
import { contrastRatio, validatePaletteCollection } from './contrast';
import { createLayout, validateLayout } from './layouts';
import { PALETTE_FAMILIES } from './palettes';
import { createExhibitionRecipe, stateForPreset } from './recipes';
import type { LayoutId, Orientation, PaletteFamily } from './types';

describe('Invisible Weather compatibility palettes', () => {
	it('declares nine explicit ground-to-ink families whose pairs pass functional contrast', () => {
		expect(PALETTE_FAMILIES).toHaveLength(9);
		expect(validatePaletteCollection(PALETTE_FAMILIES)).toEqual([]);
		for (const palette of PALETTE_FAMILIES) {
			expect(palette.walls).toHaveLength(2);
			expect(palette.frames.length).toBeGreaterThan(0);
			expect(palette.mats.length).toBeGreaterThan(0);
			expect(palette.labelInk).toMatch(/^#[0-9A-F]{6}$/iu);
			expect(palette.accent).toMatch(/^#[0-9A-F]{6}$/iu);
			expect(palette.grounds.length).toBeGreaterThanOrEqual(2);
			for (const ground of palette.grounds) {
				expect(ground.pairs.length).toBeGreaterThan(0);
				for (const pair of ground.pairs) {
					expect(contrastRatio(pair.primary, ground.colour)).toBeGreaterThanOrEqual(4.5);
					expect(pair.secondary).toBeTruthy();
					expect(contrastRatio(pair.secondary!, ground.colour)).toBeGreaterThanOrEqual(4.5);
				}
			}
		}
		const palettes: readonly PaletteFamily[] = PALETTE_FAMILIES;
		const traits = new Set(palettes.flatMap((palette) => palette.traits ?? []));
		expect(traits).toEqual(
			new Set(['colour-vision-friendly', 'near-monochrome', 'dark-wall', 'pale-paper'])
		);
	});
});

describe('Invisible Weather normalized layouts', () => {
	const layouts: LayoutId[] = ['quiet-grid', 'salon-wall', 'cabinet', 'triptych', 'procession'];
	const orientations: Orientation[] = ['landscape', 'portrait'];

	it('keeps every supported count bounded, non-overlapping, and in stable keyboard order', () => {
		for (const layout of layouts) {
			for (const orientation of orientations) {
				for (let count = 3; count <= 15; count += 1) {
					const frames = createLayout(layout, count, orientation, 'layout-audit');
					expect(validateLayout(frames), `${layout}/${orientation}/${count}`).toEqual([]);
					expect(frames.map((frame) => frame.artworkIndex)).toEqual(
						Array.from({ length: layout === 'triptych' ? 3 : count }, (_, index) => index)
					);
				}
			}
		}
	});

	it('forces triptychs to three primaries and gives Salon Wall one conspicuous anchor', () => {
		for (const orientation of orientations) {
			const triptych = createLayout('triptych', 15, orientation, 'triptych');
			expect(triptych).toHaveLength(3);
			expect(triptych.every((frame) => frame.primary)).toBe(true);
			const salon = createLayout('salon-wall', 11, orientation, 'salon');
			const areas = salon.map((frame) => frame.width * frame.height);
			const median = [...areas].sort((left, right) => left - right)[Math.floor(areas.length / 2)];
			expect(areas[0]).toBeGreaterThan(median * 1.35);
			const anchor = salon[0];
			expect(anchor.x + anchor.width / 2).toBeCloseTo(0.5, 1);
			expect(anchor.y + anchor.height / 2).toBeCloseTo(0.5, 1);
			expect(salon.some((frame) => frame.x + frame.width < anchor.x)).toBe(true);
			expect(salon.some((frame) => frame.x > anchor.x + anchor.width)).toBe(true);
		}
	});

	it('gives Quiet Grid controlled seeded size variation without disturbing order', () => {
		for (const orientation of orientations) {
			const first = createLayout('quiet-grid', 12, orientation, 'quiet-variation');
			const second = createLayout('quiet-grid', 12, orientation, 'quiet-variation');
			expect(second).toEqual(first);
			expect(
				new Set(first.map((frame) => (frame.width * frame.height).toFixed(6))).size
			).toBeGreaterThan(3);
		}
	});

	it('fits landscape and portrait independently without mutating either recipe geometry', () => {
		const landscape = createLayout('cabinet', 12, 'landscape', 'stable');
		const snapshot = structuredClone(landscape);
		const portrait = createLayout('cabinet', 12, 'portrait', 'stable');
		expect(landscape).toEqual(snapshot);
		expect(portrait).not.toEqual(landscape);
	});

	it('makes Procession progress from free weather to orthogonal weather', () => {
		const state = { ...stateForPreset('river-between-walls'), layout: 'procession' as const };
		const recipe = createExhibitionRecipe(state);
		expect(recipe.artworks[0].angleMode).toBe('free');
		expect(recipe.artworks.at(-1)?.angleMode).toBe('orthogonal');
		expect(
			new Set(recipe.artworks.map((artwork) => artwork.angleMode)).size
		).toBeGreaterThanOrEqual(5);
	});
});
