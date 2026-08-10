import { describe, expect, it } from 'vitest';
import { flightShareUrl, parseFlightQuery, validateSeed } from './share';

describe('Kagojer Dana share links', () => {
	it('validates and normalizes bounded seeds', () => {
		expect(validateSeed(' kd-old-roofs_17 ')).toBe('KD-OLD-ROOFS_17');
		expect(validateSeed('../bad')).toBeNull();
		expect(validateSeed('x'.repeat(49))).toBeNull();
	});

	it('requires the supported generator version', () => {
		expect(
			parseFlightQuery(new URL('https://example.test/game?kd_v=2&kd_seed=KNOWN&kd_mode=free'))
		).toEqual({ seed: null, mode: 'curated' });
	});

	it('preserves unrelated parameters and fragments when sharing', () => {
		const next = flightShareUrl(
			new URL('https://example.test/game?theme=ink&page=2#about-the-game'),
			'KD-HOOGHLY-7',
			'free'
		);
		expect(next.searchParams.get('theme')).toBe('ink');
		expect(next.searchParams.get('page')).toBe('2');
		expect(next.searchParams.get('kd_seed')).toBe('KD-HOOGHLY-7');
		expect(next.searchParams.get('kd_mode')).toBe('free');
		expect(next.hash).toBe('#about-the-game');
	});
});
