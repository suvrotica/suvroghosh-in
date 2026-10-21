import { describe, expect, it } from 'vitest';
import {
	coarseClientDimensions,
	normalizeAnalyticsPath,
	readGeography,
	referrerDimension,
	reportingDay
} from './policy';

describe('analytics input minimization', () => {
	it('only trusts provider geography in a verified production environment', () => {
		const headers = new Headers({
			'x-vercel-ip-country': 'IN',
			'x-vercel-ip-country-region': 'WB',
			'x-vercel-ip-city': 'S%C3%A3o%20Paulo'
		});
		expect(readGeography(headers, false)).toEqual({
			country: 'Unknown',
			region: 'Unknown',
			city: 'Unknown'
		});
		expect(readGeography(headers, true)).toEqual({
			country: 'IN',
			region: 'WB',
			city: 'São Paulo'
		});
	});
	it('bounds and safely decodes malformed, oversized and missing geography', () => {
		expect(readGeography(new Headers(), true).city).toBe('Unknown');
		for (const city of ['%FF', 'x'.repeat(385), 'a%0Ab', '<script>']) {
			expect(
				readGeography(new Headers({ 'x-vercel-ip-country': 'IN', 'x-vercel-ip-city': city }), true)
					.city
			).toBe('Unknown');
		}
		expect(
			readGeography(
				new Headers({ 'x-vercel-ip-country': 'India', 'x-vercel-ip-city': 'Calcutta' }),
				true
			).city
		).toBe('Unknown');
	});
	it('removes incidental URL data and rejects private and encoded route variants', () => {
		expect(normalizeAnalyticsPath('/writing?q=private#token')).toBe('/writing');
		for (const path of [
			'/api/a',
			'/notes/studio/analytics',
			'/notes/a-public-note',
			'//evil.test/a',
			'/%6eotes/studio',
			'/foo\\bar',
			'/foo bar',
			'https://www.suvroghosh.in/'
		])
			expect(normalizeAnalyticsPath(path)).toBeNull();
	});
	it('uses finite referrer groups and never stores arbitrary hosts or referrer paths', () => {
		expect(referrerDimension('https://www.google.com/search?q=secret')).toBe('Google');
		expect(referrerDimension('www.google.com')).toBe('Google');
		expect(referrerDimension('www.suvroghosh.in')).toBe('Internal');
		expect(referrerDimension('https://a-personal-identifier.example/secret')).toBe(
			'Other external'
		);
		expect(referrerDimension('https://www.suvroghosh.in/blog?q=secret')).toBe('Internal');
		expect(referrerDimension('https://user:secret@google.com/')).toBe('Other external');
		expect(referrerDimension('')).toBe('Direct or unavailable');
	});
	it('keeps only coarse device/browser and uses Kolkata reporting boundaries', () => {
		expect(
			coarseClientDimensions('Mozilla/5.0 (iPhone; Mobile) AppleWebKit/605 Safari/605')
		).toEqual({ device: 'Mobile', browser: 'Safari' });
		expect(coarseClientDimensions('Mozilla Chrome/100 Safari/537 Edg/100')).toEqual({
			device: 'Desktop',
			browser: 'Edge'
		});
		expect(reportingDay(new Date('2026-10-21T18:29:59Z'))).toBe('2026-10-21');
		expect(reportingDay(new Date('2026-10-21T18:30:00Z'))).toBe('2026-10-22');
	});
});
