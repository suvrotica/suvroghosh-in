import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
	changedUrlsFromSitemaps,
	createPayload,
	getIndexNowKey,
	runIndexNow,
	urlsFromSitemap,
	validateUrls
} from './indexnow.mjs';

const INDEXNOW_KEY = 'test-indexnow-key-2026';
const environment = { INDEXNOW_KEY };

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
	<url><loc>https://www.suvroghosh.in/</loc><lastmod>2026-07-23</lastmod></url>
	<url><loc>https://www.suvroghosh.in/blog?tag=HL7&amp;sort=newest</loc><lastmod>2026-07-22</lastmod></url>
</urlset>`;

const emptySitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;

test('requires a valid secret-backed IndexNow key', () => {
	assert.equal(getIndexNowKey(environment), INDEXNOW_KEY);
	assert.throws(() => getIndexNowKey({}), /INDEXNOW_KEY/);
	assert.throws(() => getIndexNowKey({ INDEXNOW_KEY: 'too short' }), /INDEXNOW_KEY/);
});

test('extracts and decodes canonical sitemap URLs', () => {
	assert.deepEqual(urlsFromSitemap(sitemap), [
		'https://www.suvroghosh.in/',
		'https://www.suvroghosh.in/blog?tag=HL7&sort=newest'
	]);
});

test('diffs added, modified, and deleted sitemap URLs', () => {
	const previous = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://www.suvroghosh.in/</loc><lastmod>2026-07-22</lastmod></url>
  <url><loc>https://www.suvroghosh.in/deleted</loc><lastmod>2026-07-20</lastmod></url>
</urlset>`;

	assert.deepEqual(changedUrlsFromSitemaps(sitemap, previous), [
		'https://www.suvroghosh.in/',
		'https://www.suvroghosh.in/blog?tag=HL7&sort=newest',
		'https://www.suvroghosh.in/deleted'
	]);
	assert.deepEqual(changedUrlsFromSitemaps(sitemap, sitemap), []);
});

test('accepts a valid empty sitemap and notifies deletion of its final prior URL', () => {
	const previous = `<?xml version="1.0"?>
<urlset><url><loc>https://www.suvroghosh.in/notes/final-note</loc></url></urlset>`;

	assert.deepEqual(urlsFromSitemap(emptySitemap), []);
	assert.deepEqual(changedUrlsFromSitemaps(emptySitemap, ''), []);
	assert.deepEqual(changedUrlsFromSitemaps(emptySitemap, previous), [
		'https://www.suvroghosh.in/notes/final-note'
	]);
});

test('rejects an error page or malformed URL entry instead of treating it as mass deletion', () => {
	assert.throws(() => urlsFromSitemap('<html><h1>Service unavailable</h1></html>'), /urlset/);
	assert.throws(
		() => urlsFromSitemap('<html><body><code><urlset></urlset></code></body></html>'),
		/urlset/
	);
	assert.throws(() => urlsFromSitemap('<urlset></urlset><html>Error</html>'), /urlset/);
	assert.throws(() => urlsFromSitemap('garbage<urlset />garbage'), /urlset/);
	assert.throws(() => urlsFromSitemap('<urlset><html>Error</html></urlset>'), /outside/);
	assert.throws(
		() => urlsFromSitemap('<urlset><url><lastmod>2026-08-06</lastmod></url></urlset>'),
		/malformed/
	);
});

test('deduplicates URLs and rejects foreign hosts or fragments', () => {
	assert.deepEqual(validateUrls(['https://www.suvroghosh.in/', 'https://www.suvroghosh.in/']), [
		'https://www.suvroghosh.in/'
	]);
	assert.throws(() => validateUrls(['https://suvroghosh.in/']), /outside/);
	assert.throws(() => validateUrls(['https://www.suvroghosh.in/#about']), /fragment/);
});

test('builds a protocol-compliant ownership payload', () => {
	assert.deepEqual(createPayload(['https://www.suvroghosh.in/contact'], INDEXNOW_KEY), {
		host: 'www.suvroghosh.in',
		key: INDEXNOW_KEY,
		keyLocation: `https://www.suvroghosh.in/${INDEXNOW_KEY}.txt`,
		urlList: ['https://www.suvroghosh.in/contact']
	});
});

test('dry run fetches a sitemap but never posts to IndexNow', async () => {
	const requests = [];
	const fetchImpl = async (url, options = {}) => {
		requests.push({ url: String(url), options });
		return new Response(sitemap, { status: 200 });
	};
	const result = await runIndexNow(['--dry-run'], { fetchImpl, environment });

	assert.equal(result.dryRun, true);
	assert.equal(result.payload.urlList.length, 2);
	assert.equal(requests.length, 1);
	assert.equal(requests[0].url, 'https://www.suvroghosh.in/sitemap.xml');
	assert.equal(requests[0].options.method, undefined);
});

test('posts JSON to the global IndexNow endpoint', async () => {
	const requests = [];
	const fetchImpl = async (url, options = {}) => {
		requests.push({ url: String(url), options });
		return requests.length === 1
			? new Response(sitemap, { status: 200 })
			: new Response('', { status: 202 });
	};
	const result = await runIndexNow([], { fetchImpl, environment });

	assert.equal(result.status, 202);
	assert.equal(requests[1].url, 'https://api.indexnow.org/indexnow');
	assert.equal(requests[1].options.method, 'POST');
	assert.deepEqual(JSON.parse(requests[1].options.body).urlList, urlsFromSitemap(sitemap));
});

test('a direct URL submission does not fetch the default sitemap', async () => {
	const requests = [];
	const fetchImpl = async (url, options = {}) => {
		requests.push({ url: String(url), options });
		return new Response('', { status: 200 });
	};
	await runIndexNow(['--url', 'https://www.suvroghosh.in/contact'], {
		fetchImpl,
		environment
	});

	assert.equal(requests.length, 1);
	assert.equal(requests[0].url, 'https://api.indexnow.org/indexnow');
	assert.deepEqual(JSON.parse(requests[0].options.body).urlList, [
		'https://www.suvroghosh.in/contact'
	]);
});

test('the production workflow submits the main and Notes sitemap families independently', () => {
	const workflow = readFileSync(
		new URL('../.github/workflows/indexnow.yml', import.meta.url),
		'utf8'
	);

	assert.match(workflow, /https:\/\/www\.suvroghosh\.in\/sitemap\.xml\?deployment=/);
	assert.match(workflow, /https:\/\/www\.suvroghosh\.in\/notes\/sitemap\.xml\?deployment=/);
	assert.match(workflow, /--previous-sitemap-file \.cache\/indexnow\/sitemap\.xml/);
	assert.match(workflow, /--previous-sitemap-file \.cache\/indexnow\/notes-sitemap\.xml/);
	assert.match(workflow, /--save-sitemap-file \.cache\/indexnow\/notes-sitemap\.xml/);
	assert.match(workflow, /path: \.cache\/indexnow\/sitemap\.xml/);
	assert.match(workflow, /key: indexnow-sitemap-/);
	assert.match(workflow, /path: \.cache\/indexnow\/notes-sitemap\.xml/);
	assert.match(workflow, /key: indexnow-notes-sitemap-/);
});
