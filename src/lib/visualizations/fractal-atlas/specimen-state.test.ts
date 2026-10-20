import { describe, expect, it } from 'vitest';
import { createPresetState } from './presets';
import { serializeLocalState } from './state';
import {
	normalizeSpecimenDecimal,
	normalizeSpecimenLab,
	type SpecimenLabState
} from './specimen-state';

const defaults: SpecimenLabState = {
	comparisonState: serializeLocalState(createPresetState('tricorn-full')),
	linkedJulia: true,
	showGrid: true,
	compareMode: false,
	linkComparisonViewport: true,
	linkComparisonColour: true,
	linkComparisonIterations: true,
	compareSplit: 50,
	compareSplitLocked: false,
	parameterA: { re: -0.123, im: 0.745 },
	parameterB: { re: -0.124, im: 0.744 },
	parameterPathSampleCount: 7,
	parameterPathIndex: 0,
	sierpinskiMode: 'overlay',
	activePanel: 'explore'
};

describe('Fractal Atlas specimen laboratory boundary', () => {
	it('restores a partial older envelope without a NaN divider or false boolean coercion', () => {
		const next = normalizeSpecimenLab(
			{ comparisonState: defaults.comparisonState, linkedJulia: 'false' },
			defaults
		);
		expect(next.compareSplit).toBe(50);
		expect(next.linkedJulia).toBe(true);
		expect(next.parameterPathSampleCount).toBe(7);
	});
	it('bounds finite values and rejects malformed numbers and modes', () => {
		const next = normalizeSpecimenLab(
			{
				compareSplit: Infinity,
				parameterPathSampleCount: 5,
				parameterPathIndex: 200,
				parameterA: { re: NaN, im: 3 },
				activePanel: {},
				sierpinskiMode: 'wrong'
			},
			defaults
		);
		expect(next.compareSplit).toBe(50);
		expect(next.parameterPathIndex).toBe(4);
		expect(next.parameterA).toEqual(defaults.parameterA);
		expect(next.activePanel).toBe('explore');
		expect(next.sierpinskiMode).toBe('overlay');
		expect(normalizeSpecimenLab({ compareSplit: 90 }, defaults).compareSplit).toBe(75);
	});
	it('preserves exact decimal strings while rejecting unrelated or non-decimal coordinates', () => {
		const exact = { re: '-0.12300000000000000001', im: '0.74500000000000000001' };
		expect(normalizeSpecimenDecimal(exact, defaults.parameterA)).toEqual(exact);
		expect(normalizeSpecimenDecimal({ re: '0x10', im: 'Infinity' }, defaults.parameterA)).toEqual({
			re: '-0.123',
			im: '0.745'
		});
		expect(
			normalizeSpecimenDecimal({ re: '123', im: '1'.repeat(161) }, defaults.parameterA)
		).toEqual({ re: '-0.123', im: '0.745' });
	});
	it('round trips valid saved state without changing settings or sharing point objects', () => {
		const next = normalizeSpecimenLab(JSON.parse(JSON.stringify(defaults)), defaults);
		expect(next).toMatchObject(defaults);
		expect(next.parameterA).not.toBe(defaults.parameterA);
	});
});
