import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	changedUrlsFromSitemaps,
	createPayload,
	getIndexNowKey,
	INDEXNOW_REQUEST_TIMEOUT_MS,
	runIndexNow,
	urlsFromSitemap,
	validateUrls
} from './indexnow.mjs';

const INDEXNOW_KEY = 'test-indexnow-key-2026';
const environment = { INDEXNOW_KEY };
const proofResponse = () =>
	new Response(INDEXNOW_KEY, {
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});

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
		if (requests.length === 1) return new Response(sitemap, { status: 200 });
		if (requests.length === 2) return proofResponse();
		return new Response('', { status: 202 });
	};
	const result = await runIndexNow([], { fetchImpl, environment });

	assert.equal(result.status, 202);
	assert.equal(requests.length, 3);
	assert.equal(requests[1].url, `https://www.suvroghosh.in/${INDEXNOW_KEY}.txt`);
	assert.equal(requests[1].options.method, undefined);
	assert.equal(requests[1].options.redirect, 'error');
	assert.equal(requests[1].options.headers.accept, 'text/plain');
	assert.ok(requests[1].options.signal instanceof AbortSignal);
	assert.equal(requests[2].url, 'https://api.indexnow.org/indexnow');
	assert.equal(requests[2].options.method, 'POST');
	assert.ok(requests[2].options.signal instanceof AbortSignal);
	assert.deepEqual(JSON.parse(requests[2].options.body).urlList, urlsFromSitemap(sitemap));
});

test('a direct URL submission does not fetch the default sitemap', async () => {
	const requests = [];
	const fetchImpl = async (url, options = {}) => {
		requests.push({ url: String(url), options });
		return requests.length === 1 ? proofResponse() : new Response('', { status: 200 });
	};
	await runIndexNow(['--url', 'https://www.suvroghosh.in/contact'], {
		fetchImpl,
		environment
	});

	assert.equal(requests.length, 2);
	assert.equal(requests[0].url, `https://www.suvroghosh.in/${INDEXNOW_KEY}.txt`);
	assert.equal(requests[1].url, 'https://api.indexnow.org/indexnow');
	assert.deepEqual(JSON.parse(requests[1].options.body).urlList, [
		'https://www.suvroghosh.in/contact'
	]);
});

test('ownership proof must be HTTP 200, plain text and exactly the configured key', async () => {
	for (const [response, message] of [
		[new Response(INDEXNOW_KEY, { status: 404 }), /HTTP 404/],
		[new Response(INDEXNOW_KEY, { status: 302 }), /HTTP 302/],
		[new Response(INDEXNOW_KEY, { headers: { 'content-type': 'text/html' } }), /text\/plain/],
		[new Response('different-ownership-key'), /exactly match/],
		[new Response(`${INDEXNOW_KEY}\n`), /exactly match/],
		[new Response(INDEXNOW_KEY.repeat(100)), /exactly match/]
	]) {
		const requests = [];
		await assert.rejects(
			runIndexNow(['--url', 'https://www.suvroghosh.in/contact'], {
				environment,
				fetchImpl: async (url, options = {}) => {
					requests.push({ url, options });
					return response;
				}
			}),
			(error) => {
				assert.match(error.message, message);
				assert.ok(!error.message.includes(INDEXNOW_KEY));
				assert.ok(!error.message.includes('.txt'));
				assert.ok(!error.message.includes('different-ownership-key'));
				return true;
			}
		);
		assert.equal(requests.length, 1, 'invalid proof must prevent the POST');
		assert.equal(requests[0].options.method, undefined);
	}
});

test('a streamed ownership proof can span chunks without buffering unrelated data', async () => {
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(INDEXNOW_KEY.slice(0, 5)));
			controller.enqueue(new TextEncoder().encode(INDEXNOW_KEY.slice(5)));
			controller.close();
		}
	});
	const requests = [];
	await runIndexNow(['--url', 'https://www.suvroghosh.in/contact'], {
		environment,
		fetchImpl: async (url, options = {}) => {
			requests.push({ url, options });
			return requests.length === 1
				? new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
				: new Response('', { status: 200 });
		}
	});
	assert.equal(requests.length, 2);
	assert.equal(requests[1].options.method, 'POST');
});

test('ownership deadline prevents POST and does not expose native network error details', async (t) => {
	t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
		assert.equal(milliseconds, INDEXNOW_REQUEST_TIMEOUT_MS);
		return AbortSignal.abort(new Error(`Timed out fetching /${INDEXNOW_KEY}.txt`));
	});
	let requests = 0;
	await assert.rejects(
		runIndexNow(['--url', 'https://www.suvroghosh.in/contact'], {
			environment,
			fetchImpl: async (_url, options) => {
				requests += 1;
				options.signal.throwIfAborted();
				return proofResponse();
			}
		}),
		(error) => {
			assert.match(error.message, /ownership verification request failed or timed out/);
			assert.ok(!error.message.includes(INDEXNOW_KEY));
			assert.ok(!error.message.includes('.txt'));
			return true;
		}
	);
	assert.equal(requests, 1);
});

test('ownership body read errors are safe and do not permit a POST', async () => {
	let requests = 0;
	const brokenStream = new ReadableStream({
		start(controller) {
			controller.error(new Error(`Unexpected secret proof ${INDEXNOW_KEY}`));
		}
	});
	await assert.rejects(
		runIndexNow(['--url', 'https://www.suvroghosh.in/contact'], {
			environment,
			fetchImpl: async () => {
				requests += 1;
				return new Response(brokenStream, { headers: { 'content-type': 'text/plain' } });
			}
		}),
		(error) => {
			assert.match(error.message, /proof could not be read/);
			assert.ok(!error.message.includes(INDEXNOW_KEY));
			return true;
		}
	);
	assert.equal(requests, 1);
});

test('a sitemap snapshot advances only after accepted IndexNow submission', async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), 'indexnow-test-'));
	t.after(async () => {
		assert.equal(path.dirname(directory), path.resolve(tmpdir()));
		await rm(directory, { recursive: true, force: true });
	});
	const currentFile = path.join(directory, 'current.xml');
	const snapshotFile = path.join(directory, 'snapshot.xml');
	const previous = '<urlset><url><loc>https://www.suvroghosh.in/old</loc></url></urlset>';
	await writeFile(currentFile, sitemap);
	await writeFile(snapshotFile, previous);
	const args = ['--sitemap-file', currentFile, '--save-sitemap-file', snapshotFile];

	for (const [proofStatus, submitStatus] of [
		[404, 200],
		[200, 403],
		[200, 204]
	]) {
		let requests = 0;
		await assert.rejects(
			runIndexNow(args, {
				environment,
				fetchImpl: async () => {
					requests += 1;
					assert.equal(await readFile(snapshotFile, 'utf8'), previous);
					if (requests === 1) return new Response(INDEXNOW_KEY, { status: proofStatus });
					return new Response(submitStatus === 204 ? null : `Reflected key: ${INDEXNOW_KEY}`, {
						status: submitStatus
					});
				}
			}),
			(error) => {
				assert.ok(!error.message.includes(INDEXNOW_KEY));
				return true;
			}
		);
		assert.equal(await readFile(snapshotFile, 'utf8'), previous);
		assert.equal(requests, proofStatus === 200 ? 2 : 1);
	}

	for (const status of [200, 202]) {
		await writeFile(snapshotFile, previous);
		let requests = 0;
		const result = await runIndexNow(args, {
			environment,
			fetchImpl: async () => {
				requests += 1;
				assert.equal(await readFile(snapshotFile, 'utf8'), previous);
				return requests === 1 ? proofResponse() : new Response('', { status });
			}
		});
		assert.equal(result.status, status);
		assert.equal(await readFile(snapshotFile, 'utf8'), sitemap);
	}
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
	assert.match(workflow, /ref: \$\{\{ github\.event\.deployment\.sha \|\| github\.sha \}\}/);
	assert.match(workflow, /node --test scripts\/indexnow\.test\.mjs/);
});
