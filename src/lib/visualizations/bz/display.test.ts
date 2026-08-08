import { describe, expect, it } from 'vitest';
import { DEFAULT_OREGONATOR_SETUP } from './constants';
import { bzPaletteRgba, renderBZPixelBuffer } from './display';
import { createInitialBZField } from './initial-conditions';

describe('BZ display contract', () => {
	it('renders a deterministic opaque field without mutating solver state', () => {
		const setup = { ...DEFAULT_OREGONATOR_SETUP, gridSize: 32 };
		const state = createInitialBZField(setup);
		const beforeU = state.u.slice();
		const beforeV = state.v.slice();
		const first = renderBZPixelBuffer(state, setup, {
			view: 'dish',
			palette: 'ferroin',
			width: 64,
			height: 48
		});
		const second = renderBZPixelBuffer(state, setup, {
			view: 'dish',
			palette: 'ferroin',
			width: 64,
			height: 48
		});
		expect(first.width).toBe(64);
		expect(first.height).toBe(48);
		expect(first.data).toEqual(second.data);
		expect(first.data.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
		expect(state.u).toEqual(beforeU);
		expect(state.v).toEqual(beforeV);
	});

	it('distinguishes the exterior, an obstacle, and active chemistry in mask view', () => {
		const setup = {
			...DEFAULT_OREGONATOR_SETUP,
			gridSize: 32,
			maskPreset: 'central-obstacle' as const
		};
		const state = createInitialBZField(setup);
		const pixels = renderBZPixelBuffer(state, setup, { view: 'mask', palette: 'high-contrast' });
		const rgba = (index: number) => Array.from(pixels.data.slice(index * 4, index * 4 + 3));
		const corner = rgba(0);
		const centre = rgba(16 * 32 + 16);
		const active = rgba(16 * 32 + 25);
		expect(corner).not.toEqual(active);
		expect(centre).not.toEqual(active);
		expect(corner).not.toEqual(centre);
	});

	it('provides finite 8-bit endpoints for every palette', () => {
		for (const palette of [
			'ferroin',
			'cerium',
			'phase-spectrum',
			'scientific',
			'high-contrast'
		] as const) {
			for (const value of [-1, 0, 0.5, 1, 2, Number.NaN]) {
				const colour = bzPaletteRgba(value, palette);
				expect(colour).toHaveLength(4);
				expect(colour[3]).toBe(255);
				expect(
					colour.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
				).toBe(true);
			}
		}
	});

	it('rejects a field whose grid does not match its setup', () => {
		const setup = { ...DEFAULT_OREGONATOR_SETUP, gridSize: 32 };
		const state = createInitialBZField(setup);
		expect(() =>
			renderBZPixelBuffer(state, { ...setup, gridSize: 64 }, { view: 'u', palette: 'scientific' })
		).toThrow(/grid sizes differ/i);
	});
});
