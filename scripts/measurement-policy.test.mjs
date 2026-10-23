import assert from 'node:assert/strict';
import test from 'node:test';
import { filterMeasurementEvent } from '../src/lib/measurement.ts';

const productionOrigin = 'https://www.suvroghosh.in';

test('redacts on the actual browser origin without requiring canonical www', () => {
	const origin = 'https://alternate.example';
	assert.deepEqual(
		filterMeasurementEvent({ url: `${origin}/writing?token=secret#state` }, true, origin),
		{ url: `${origin}/writing` }
	);
	assert.equal(
		filterMeasurementEvent({ url: `${origin}/notes/%73tudio/private?token=secret` }, true, origin),
		null
	);
	assert.equal(filterMeasurementEvent({ url: `${productionOrigin}/writing` }, true, origin), null);
});

test('strips sensitive URL state without mutating the original event', () => {
	const event = {
		type: 'pageview',
		url: `${productionOrigin}/blog/example?email=private%40example.test&token=secret#state`,
		route: '/blog/[slug]'
	};
	assert.deepEqual(filterMeasurementEvent(event, true, productionOrigin), {
		...event,
		url: `${productionOrigin}/blog/example`
	});
	assert.match(event.url, /email=/);
});

test('drops disabled, off-origin, credential-bearing, malformed and private events', () => {
	assert.equal(filterMeasurementEvent({ url: productionOrigin }, false, productionOrigin), null);
	for (const url of [
		'https://external.test/blog/example',
		'https://user:password@www.suvroghosh.in/blog/example',
		'http://[invalid',
		'/bad%escape',
		'/api',
		'/api/public/notes/example/document',
		'/notes/studio',
		'/notes/studio/private-document',
		'/notes/%73tudio/private-document',
		'/notes/auth/callback?code=private',
		'/notes/sign-in',
		'/notes/forgot-password',
		'/notes/reset-password?token=secret'
	])
		assert.equal(filterMeasurementEvent({ url }, true, productionOrigin), null, url);
});

test('allows public Notes, page names sharing prefixes, and same-origin relative paths', () => {
	for (const path of ['/notes/public-note', '/apiary', '/notes/studio-tour', '/writing']) {
		assert.deepEqual(
			filterMeasurementEvent({ url: `${path}?secret=yes#state` }, true, productionOrigin),
			{ url: `${productionOrigin}${path}` }
		);
	}
});
