import { describe, expect, it } from 'vitest';
import { applyRoutePreloadPolicy, BARNUM_LAB_PATHNAME } from '../../../../hooks.server';

describe('route preload response policy', () => {
	it('removes only Link on the exact Barnum laboratory pathname', () => {
		const headers = new Headers({
			Link: '</_app/immutable/example.js>; rel="modulepreload"',
			'x-content-type-options': 'nosniff'
		});

		applyRoutePreloadPolicy(BARNUM_LAB_PATHNAME, headers);

		expect(headers.has('link')).toBe(false);
		expect(headers.get('x-content-type-options')).toBe('nosniff');
	});

	it.each([
		'/',
		'/blog/visualizations',
		`${BARNUM_LAB_PATHNAME}/`,
		`${BARNUM_LAB_PATHNAME}-extended`
	])('preserves Link on every other pathname: %s', (pathname) => {
		const link = '</_app/immutable/example.js>; rel="modulepreload"';
		const headers = new Headers({ Link: link });

		applyRoutePreloadPolicy(pathname, headers);

		expect(headers.get('link')).toBe(link);
	});
});
