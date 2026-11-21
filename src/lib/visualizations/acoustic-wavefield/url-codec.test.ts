import { describe, expect, it } from 'vitest';
import { createDefaultUrlState, decodeStateFromQuery, encodeStateToQuery } from './url-codec';
import { GRID_NX, GRID_NY } from './types';

describe('acoustic-wavefield url-codec', () => {
	it('round-trips valid chamber state and preserves unrelated query params like webgl=off', () => {
		const query = encodeStateToQuery(
			{
				presetId: 'helmholtz-trap',
				sx: 46,
				sy: 68,
				lx: 174,
				ly: 68,
				view: 'interferometer',
				perimeter: 'open',
				chladni: false,
				toneHz: 245,
				theme: 'light'
			},
			'?webgl=off'
		);

		expect(query).toContain('webgl=off');
		const decoded = decodeStateFromQuery(query);
		expect(decoded).toEqual({
			presetId: 'helmholtz-trap',
			sx: 46,
			sy: 68,
			lx: 174,
			ly: 68,
			view: 'interferometer',
			perimeter: 'open',
			chladni: false,
			toneHz: 245,
			theme: 'light'
		});
	});

	it('sanitizes malformed and out-of-bounds parameters cleanly', () => {
		const def = createDefaultUrlState();
		const decoded = decodeStateFromQuery(
			'?preset=invalid-room&sx=-999&sy=9999&lx=NaN&ly=abc&view=bogus&perim=xyz&freq=50000&theme=neon&chladni=nope'
		);
		expect(decoded.presetId).toBe(def.presetId);
		expect(decoded.sx).toBeGreaterThanOrEqual(2);
		expect(decoded.sx).toBeLessThanOrEqual(GRID_NX - 3);
		expect(decoded.sy).toBeGreaterThanOrEqual(2);
		expect(decoded.sy).toBeLessThanOrEqual(GRID_NY - 3);
		expect(decoded.lx).toBe(def.lx);
		expect(decoded.ly).toBe(def.ly);
		expect(decoded.view).toBe('relief');
		expect(decoded.perimeter).toBe(def.perimeter);
		expect(decoded.toneHz).toBe(1000);
		expect(decoded.theme).toBe('dark');
		expect(decoded.chladni).toBe(true);
	});
});
