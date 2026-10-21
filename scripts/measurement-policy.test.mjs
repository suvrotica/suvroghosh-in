import assert from 'node:assert/strict';
import test from 'node:test';
import {
	MEASUREMENT_OPTOUT_KEY,
	filterMeasurementEvent,
	measurementAllowed,
	readMeasurementPreference
} from '../src/lib/measurement.ts';

const productionOrigin = 'https://www.suvroghosh.in';
const reader = {
	development: false,
	currentOrigin: productionOrigin,
	productionOrigin,
	webdriver: false,
	localPreference: null,
	sessionPreference: null
};

test('measures canonical production readers while excluding development, previews and webdriver', () => {
	assert.equal(measurementAllowed(reader), true);
	for (const override of [
		{ development: true },
		{ currentOrigin: 'http://localhost:4173' },
		{ currentOrigin: 'https://preview.vercel.app' },
		{ currentOrigin: 'https://www.suvroghosh.in.example.test' },
		{ currentOrigin: 'http://www.suvroghosh.in' },
		{ webdriver: true }
	]) {
		assert.equal(measurementAllowed({ ...reader, ...override }), false);
	}
});

test('honours only the explicit off preference in either browser-local storage scope', () => {
	for (const key of ['localPreference', 'sessionPreference']) {
		assert.equal(measurementAllowed({ ...reader, [key]: 'off' }), false);
		for (const invalid of ['', 'false', 'on', 'OFF', {}, true]) {
			assert.equal(measurementAllowed({ ...reader, [key]: invalid }), true);
		}
	}
	const storage = new Map([[MEASUREMENT_OPTOUT_KEY, 'off']]);
	const getStorage = () => ({ getItem: (key) => storage.get(key) ?? null });
	assert.equal(readMeasurementPreference(getStorage), 'off');
	storage.set(MEASUREMENT_OPTOUT_KEY, 'unexpected');
	assert.equal(readMeasurementPreference(getStorage), null);
	assert.equal(
		readMeasurementPreference(() => {
			throw new Error('Storage denied');
		}),
		'off'
	);
});

test('strips sensitive URL state without mutating the original pageview or vital', () => {
	for (const type of ['pageview', 'event', 'vital']) {
		const event = {
			type,
			url: `${productionOrigin}/blog/example?email=private%40example.test&token=secret#state`,
			route: '/blog/[slug]'
		};
		assert.deepEqual(filterMeasurementEvent(event, true, productionOrigin), {
			...event,
			url: `${productionOrigin}/blog/example`
		});
		assert.match(event.url, /email=/);
	}
});

test('drops opted-out, off-origin, credential-bearing, API and owner/auth events', () => {
	assert.equal(filterMeasurementEvent({ url: productionOrigin }, false, productionOrigin), null);
	for (const url of [
		'https://external.test/blog/example',
		'https://user:password@www.suvroghosh.in/blog/example',
		'http://[invalid',
		'/api',
		'/api/public/notes/example/document',
		'/notes/studio',
		'/notes/studio/private-document',
		'/notes/%73tudio/private-document',
		'/notes/auth/callback?code=private',
		'/notes/sign-in',
		'/notes/forgot-password',
		'/notes/reset-password?token=secret'
	]) {
		assert.equal(filterMeasurementEvent({ url }, true, productionOrigin), null, url);
	}
	assert.deepEqual(filterMeasurementEvent({ url: '/notes/public-note' }, true, productionOrigin), {
		url: `${productionOrigin}/notes/public-note`
	});
});
