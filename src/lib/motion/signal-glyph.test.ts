import { describe, expect, it, vi } from 'vitest';
import { generateSignalGlyph, SIGNAL_GLYPH_VIEW_BOX } from './signal-glyph';

describe('deterministic signal glyphs', () => {
	it('returns identical geometry for identical content identity', () => {
		const first = generateSignalGlyph('a-trapezoid-in-low-light', 'personal-essay');
		const second = generateSignalGlyph('a-trapezoid-in-low-light', 'personal-essay');

		expect(first).toEqual(second);
		expect(SIGNAL_GLYPH_VIEW_BOX).toBe('0 0 160 88');
	});

	it('uses both slug and category as seed material', () => {
		const original = generateSignalGlyph('same-slug', 'healthcare-it');

		expect(generateSignalGlyph('another-slug', 'healthcare-it')).not.toEqual(original);
		expect(generateSignalGlyph('same-slug', 'calcutta-life')).not.toEqual(original);
	});

	it('handles Unicode identity without consulting runtime randomness', () => {
		const runtimeRandom = vi.spyOn(Math, 'random').mockImplementation(() => {
			throw new Error('Signal glyphs must not consult Math.random()');
		});

		expect(generateSignalGlyph('কলকাতার-মানচিত্র', 'place-and-memory')).toEqual(
			generateSignalGlyph('কলকাতার-মানচিত্র', 'place-and-memory')
		);
		expect(runtimeRandom).not.toHaveBeenCalled();
		runtimeRandom.mockRestore();
	});

	it('emits finite, bounded SVG instructions without runtime randomness', () => {
		for (let index = 0; index < 100; index += 1) {
			const glyph = generateSignalGlyph(`post-${index}`, `category-${index % 7}`);
			const numericValues = `${glyph.primaryPath} ${glyph.secondaryPath}`
				.match(/-?\d+(?:\.\d+)?/g)
				?.map(Number);

			expect(['trace', 'orbit', 'network', 'contour']).toContain(glyph.variant);
			expect(glyph.primaryPath).not.toMatch(/NaN|Infinity/);
			expect(glyph.secondaryPath).not.toMatch(/NaN|Infinity/);
			expect(numericValues?.every(Number.isFinite)).toBe(true);
			expect(
				glyph.nodes.every(({ x, y, r }) => x >= 0 && x <= 160 && y >= 0 && y <= 88 && r > 0)
			).toBe(true);
		}
	});
});
