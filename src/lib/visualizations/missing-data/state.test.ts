import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './model';
import { decodeSettings, encodeSettings, normalizeSettings } from './state';

describe('bounded versioned share state', () => {
	it('round-trips all settings without using unrelated query parameters', () => {
		const settings = {
			...DEFAULT_SETTINGS,
			seed: 98765,
			scenario: 'mnar' as const,
			view: 'time' as const,
			rate: 0.42,
			strength: 3.2,
			imputation: 'predictive' as const,
			draw: 8,
			delta: -1.5,
			ordering: 'driver' as const,
			reveal: true
		};
		const encoded = encodeSettings(settings);
		const params = new URLSearchParams(encoded);
		params.set('webgl', 'off');
		params.set('seed', '999');
		expect(decodeSettings(params)).toEqual(settings);
		expect(encoded.length).toBeLessThan(350);
	});

	it('uses a reproducible default for absent or unsupported versions', () => {
		expect(decodeSettings(new URLSearchParams())).toEqual(DEFAULT_SETTINGS);
		expect(decodeSettings(new URLSearchParams('mdv=300&md_seed=42'))).toEqual(DEFAULT_SETTINGS);
	});

	it('clamps finite numbers, rounds discrete controls and rejects invalid enums or non-finite values', () => {
		const result = normalizeSettings({
			seed: -20,
			scenario: 'arbitrary',
			view: '<script>',
			rate: 2,
			strength: -1,
			imputation: 'magic',
			draw: 900000,
			delta: -99,
			ordering: 'random',
			reveal: 'true'
		});
		expect(result).toEqual({
			...DEFAULT_SETTINGS,
			seed: 1,
			rate: 0.9,
			strength: 0.25,
			draw: 19,
			delta: -2
		});
		expect(normalizeSettings({ seed: NaN, rate: Infinity, strength: 'NaN', draw: 3.7 })).toEqual({
			...DEFAULT_SETTINGS,
			draw: 4
		});
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings({ seed: '42', reveal: '1' }).seed).toBe(42);
		expect(normalizeSettings({ rate: 0.347596 }).rate).toBe(0.35);
	});

	it('keeps structural scenarios in their meaningful matrix view, including a malformed shared URL', () => {
		expect(
			decodeSettings(new URLSearchParams('mdv=1&md_scenario=dropout&md_view=variables')).view
		).toBe('time');
		expect(normalizeSettings({ scenario: 'instrument', view: 'variables' }).view).toBe('time');
		expect(normalizeSettings({ scenario: 'variables', view: 'time' }).view).toBe('variables');
		expect(normalizeSettings({ scenario: 'mar', view: 'time' }).view).toBe('time');
	});

	it('ignores unbounded query fields and treats false explicitly', () => {
		const params = new URLSearchParams({
			mdv: '1',
			md_seed: '7'.repeat(1000),
			md_rate: 'NaN',
			md_reveal: '0'
		});
		expect(decodeSettings(params)).toEqual(DEFAULT_SETTINGS);
		expect(decodeSettings(new URLSearchParams(encodeSettings(DEFAULT_SETTINGS))).reveal).toBe(
			false
		);
	});
});
