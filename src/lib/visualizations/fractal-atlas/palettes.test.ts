import { describe, expect, it } from 'vitest';
import {
	categoricalRootColor,
	normalizeHexColor,
	orbitTrapDistance,
	samplePalette,
	toneMapDensity,
	validatePaletteStops
} from './palettes';

describe('Fractal Atlas palettes', () => {
	const monochrome = [
		{ position: 0, color: '#000000' },
		{ position: 1, color: '#FFFFFF' }
	];

	it('samples, wraps, offsets, and reverses a palette deterministically', () => {
		expect(samplePalette(monochrome, 0)).toBe('#000000');
		expect(samplePalette(monochrome, 0.5)).toBe('#808080');
		expect(samplePalette(monochrome, 0.25, { reverse: true })).toBe('#BFBFBF');
		expect(samplePalette(monochrome, 0.1, { offset: 0.4 })).toBe('#808080');
		expect(samplePalette(monochrome, Number.NaN)).toBe('#000000');
	});

	it('validates 2–8 ordered six-digit colour stops', () => {
		const result = validatePaletteStops([
			{ position: 2, color: '#ffffff' },
			{ position: -1, color: '#000000' }
		]);
		expect(result.stops).toEqual(monochrome);
		expect(result.issues).toEqual([]);

		const invalid = validatePaletteStops([{ position: 0, color: 'red' }]);
		expect(invalid.issues.length).toBeGreaterThan(0);
		expect(invalid.stops.length).toBeGreaterThanOrEqual(2);
		expect(normalizeHexColor('#abc')).toBe('#AABBCC');
	});

	it('computes orbit-trap distances for each geometric interpretation', () => {
		const base = {
			position: { re: 0, im: 0 },
			radius: 1,
			spacing: 1,
			rotation: 0,
			mix: 1
		};
		expect(orbitTrapDistance({ re: 3, im: 4 }, { ...base, kind: 'point' })).toBe(5);
		expect(orbitTrapDistance({ re: 3, im: 4 }, { ...base, kind: 'line' })).toBe(4);
		expect(orbitTrapDistance({ re: 0, im: 2 }, { ...base, kind: 'circle' })).toBe(1);
		expect(orbitTrapDistance({ re: 3, im: 0.25 }, { ...base, kind: 'cross' })).toBe(0.25);
		expect(orbitTrapDistance({ re: 1.1, im: 0.45 }, { ...base, kind: 'grid' })).toBeCloseTo(0.1);
	});

	it('tone maps density and assigns categorical root colours safely', () => {
		expect(toneMapDensity(0, 100, 2, 1)).toBe(0);
		expect(toneMapDensity(50, 100, 2, 1)).toBeGreaterThan(0);
		expect(toneMapDensity(100, 100, 2, 1)).toBeLessThanOrEqual(1);
		expect(categoricalRootColor(0, 3, 1)).toMatch(/^#[\dA-F]{6}$/u);
		expect(categoricalRootColor(Number.NaN, 0, Number.NaN)).toMatch(/^#[\dA-F]{6}$/u);
	});
});
