import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	DEFAULT_USER_AGENT_SAMPLE_SIZE,
	FETCH_RETRY_DELAYS_MS,
	MAX_FETCH_ATTEMPTS,
	REPORT_FILES,
	analyzeHtml,
	applyIssueDetection,
	assertFetchCompleteness,
	assertVariantFetchCompleteness,
	buildAuditReports,
	buildUserAgentSample,
	compareUserAgentRecord,
	computeInternalGraph,
	createRateGate,
	createUrlInventory,
	crawlInventory,
	crawlVariantProbes,
	csvEscape,
	discoverSourceUrls,
	fetchWithRedirects,
	hasSourceRecord,
	isAuditablePageUrl,
	isPublicAuditTarget,
	mapConcurrent,
	measureJavaScriptBundles,
	normalizeAuditUrl,
	observedTrafficFromCsv,
	parseArguments,
	parseCsvRows,
	parsePostRedirectAliases,
	parsePromotedTopicAliases,
	parseRssXml,
	parseRobotsDirectives,
	parseSitemapXml,
	principalContentWithoutJavaScript,
	renderCrawlRecords,
	runAudit,
	toCsv,
	writeAuditReports
} from './audit-traffic-indexing.mjs';

const ORIGIN = 'https://www.example.test';

function htmlPage(
	pathname,
	{
		title = pathname,
		description = `Description for ${pathname}`,
		robots = 'index,follow',
		body = '<p>This fixture includes enough ordinary words to represent principal server-rendered content for a deterministic crawler test page.</p>'
	} = {}
) {
	const url = new URL(pathname, ORIGIN).href;
	return `<!doctype html>
<html lang="en-GB"><head>
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${url}">
</head><body><main><h1>${title}</h1>${body}</main></body></html>`;
}

function fakeCrawlRecord(
	pathname,
	{
		html = htmlPage(pathname),
		status = 200,
		contentType = 'text/html; charset=utf-8',
		inventory = null,
		finalUrl = ''
	} = {}
) {
	const requestedUrl = new URL(pathname, ORIGIN).href;
	const resolvedFinalUrl = finalUrl || requestedUrl;
	return {
		requestedUrl,
		inventory,
		fetch: {
			requestedUrl,
			finalUrl: resolvedFinalUrl,
			redirectChain: [requestedUrl],
			redirects: [],
			status,
			headers: { 'content-type': contentType },
			contentType,
			body: html,
			rawBytes: Buffer.byteLength(html),
			bodyTruncated: false,
			totalMs: 10,
			error: ''
		},
		analysis: analyzeHtml(html, resolvedFinalUrl, { origin: ORIGIN }),
		render: {
			status: 'not_requested',
			htmlLength: null,
			visibleWordCount: null,
			principalWordCount: null,
			error: ''
		},
		jsBundleBytes: 0,
		jsBundleReferences: [],
		jsBundleMeasurementStatus: 'measured',
		jsBundleUnmeasuredReferenceCount: 0,
		issueCodes: []
	};
}

async function temporaryDirectory(t) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'traffic-audit-test-'));
	t.after(async () => fs.rm(directory, { recursive: true, force: true }));
	return directory;
}

test('parses sitemap and RSS URLs with XML entities and last-modified values', () => {
	const sitemap = `<?xml version="1.0"?>
<urlset>
  <url><loc>${ORIGIN}/blog?page=2&amp;sort=new</loc><lastmod>2026-08-06</lastmod></url>
  <url><loc>${ORIGIN}/contact</loc></url>
</urlset>`;
	assert.deepEqual(parseSitemapXml(sitemap, ORIGIN), [
		{ url: `${ORIGIN}/blog?page=2&sort=new`, lastModified: '2026-08-06' },
		{ url: `${ORIGIN}/contact`, lastModified: '' }
	]);
	const rss = `<rss><channel>
<item><link>${ORIGIN}/first?a=1&amp;b=2</link></item>
<item><link><![CDATA[${ORIGIN}/second]]></link></item>
<item><link>${ORIGIN}/first?a=1&amp;b=2</link></item>
</channel></rss>`;
	assert.deepEqual(parseRssXml(rss, ORIGIN), [`${ORIGIN}/first?a=1&b=2`, `${ORIGIN}/second`]);
});

test('extracts post and promoted-topic redirect aliases deterministically', () => {
	const postAliases = parsePostRedirectAliases(
		`export const postPathAliases = {
			'old-category/old-post': '/blog/new-category/new-post',
			"other/legacy": "/blog/essay/current"
		};`,
		ORIGIN
	);
	assert.deepEqual(postAliases, [
		{
			source: `${ORIGIN}/blog/old-category/old-post`,
			destination: `${ORIGIN}/blog/new-category/new-post`,
			type: 'post_alias'
		},
		{
			source: `${ORIGIN}/blog/other/legacy`,
			destination: `${ORIGIN}/blog/essay/current`,
			type: 'post_alias'
		}
	]);
	const topicAliases = parsePromotedTopicAliases(
		`export const PROMOTED_TOPIC_TAGS = {
			fhir: 'hl7-fhir',
			'health-level-seven': 'hl7-fhir'
		} as const;`,
		ORIGIN
	);
	assert.equal(topicAliases.length, 4);
	assert.deepEqual(topicAliases[0], {
		source: `${ORIGIN}/tags/fhir`,
		destination: `${ORIGIN}/topics/hl7-fhir`,
		type: 'tag_alias'
	});
});

test('discovers posts, archives, resources, topic pages, routes, pagination, and aliases from source', async (t) => {
	const root = await temporaryDirectory(t);
	const directories = [
		'src/lib/posts',
		'src/lib/content',
		'src/lib/prompts',
		'src/lib/lists',
		'src/lib/topics',
		'src/lib/notebooks',
		'src/routes/contact',
		'static/notebooks'
	];
	for (const directory of directories)
		await fs.mkdir(path.join(root, directory), { recursive: true });
	for (let index = 1; index <= 14; index += 1) {
		const slug = index === 1 ? 'legacy-post' : `science-post-${index}`;
		await fs.writeFile(
			path.join(root, 'src/lib/posts', `${slug}.md`),
			`---
title: "Science Post ${index}"
description: "A deterministic source discovery fixture with enough metadata."
date: "2025-01-${String(index).padStart(2, '0')}"
category: "Science"
tags: ["Physics", "Testing"]
published: true
${index <= 10 ? 'interactiveFirst: true\n' : ''}---

Source body.
`,
			'utf8'
		);
	}
	await fs.writeFile(
		path.join(root, 'src/lib/content/posts.ts'),
		`export const postPathAliases = {
			'science/legacy-post': '/blog/science/science-post-2'
		};`,
		'utf8'
	);
	await fs.writeFile(
		path.join(root, 'src/lib/content/topics.ts'),
		`export const PROMOTED_TOPIC_TAGS = { physics: 'physics' } as const;`,
		'utf8'
	);
	await fs.writeFile(
		path.join(root, 'src/lib/prompts', 'audit-prompt.md'),
		`---
title: "Audit Prompt"
description: "A resource fixture used only by the source discovery unit test."
date: "2026-08-01"
kind: "prompt"
tags: ["Audit"]
published: true
---
Resource body.
`,
		'utf8'
	);
	await fs.writeFile(
		path.join(root, 'src/lib/topics', 'physics.md'),
		`---
title: "Physics"
slug: "physics"
date: "2026-08-01"
---
Topic body.
`,
		'utf8'
	);
	await fs.writeFile(
		path.join(root, 'src/routes/contact/+page.svelte'),
		'<h1>Contact</h1>',
		'utf8'
	);
	await fs.writeFile(
		path.join(root, 'static/notebooks/perceptron-demo.html'),
		'<!doctype html><title>Perceptron demo</title>',
		'utf8'
	);
	await fs.writeFile(
		path.join(root, 'src/lib/notebooks/perceptron-demo.ipynb'),
		'{"cells":[],"metadata":{},"nbformat":4,"nbformat_minor":5}',
		'utf8'
	);
	await fs.writeFile(
		path.join(root, 'src/lib/notebooks/source-only.ipynb'),
		'{"cells":[],"metadata":{},"nbformat":4,"nbformat_minor":5}',
		'utf8'
	);
	await fs.writeFile(
		path.join(root, 'static/notebooks/output-only.html'),
		'<!doctype html><title>Output only notebook</title>',
		'utf8'
	);

	const result = await discoverSourceUrls({ root, origin: ORIGIN });
	const inventory = createUrlInventory(result.records, ORIGIN);
	assert.equal(result.warnings.length, 0);
	assert.equal(inventory.has(`${ORIGIN}/blog/science/science-post-2`), true);
	assert.equal(inventory.has(`${ORIGIN}/blog/science`), true);
	assert.equal(inventory.has(`${ORIGIN}/blog/science?page=2`), true);
	assert.equal(inventory.has(`${ORIGIN}/blog/archive/2025`), true);
	assert.equal(inventory.has(`${ORIGIN}/blog/archive/2025/01`), true);
	assert.equal(inventory.has(`${ORIGIN}/resources/prompts/audit-prompt`), true);
	assert.equal(inventory.has(`${ORIGIN}/topics/physics`), true);
	assert.equal(inventory.has(`${ORIGIN}/contact`), true);
	assert.equal(inventory.has(`${ORIGIN}/notebooks/perceptron-demo.html`), true);
	assert.deepEqual(
		[...inventory.get(`${ORIGIN}/notebooks/source-only.html`).sources],
		['notebook_source']
	);
	assert.deepEqual(
		[...inventory.get(`${ORIGIN}/notebooks/output-only.html`).sources],
		['static_notebook']
	);
	assert.equal(inventory.get(`${ORIGIN}/blog/science/legacy-post`).canonicalCandidate, false);
	assert.equal(inventory.get(`${ORIGIN}/blog/science/legacy-post`).strata.has('redirect'), true);
	assert.equal(hasSourceRecord(inventory.get(`${ORIGIN}/blog/science?page=2`).sources), true);
	assert.equal(hasSourceRecord(inventory.get(`${ORIGIN}/blog/science/legacy-post`).sources), true);
	const notebook = inventory.get(`${ORIGIN}/notebooks/perceptron-demo.html`);
	assert.deepEqual([...notebook.sources].sort(), ['notebook_source', 'static_notebook']);
	assert.deepEqual([...notebook.sourceFiles].sort(), [
		'src/lib/notebooks/perceptron-demo.ipynb',
		'static/notebooks/perceptron-demo.html'
	]);
	assert.equal(hasSourceRecord(notebook.sources), true);
	assert.equal(hasSourceRecord(new Set(['main_sitemap', 'homepage', 'crawl'])), false);
});

test('extracts indexability, social, structured-data, link, media, and no-JS fields from HTML', () => {
	const html = `<!doctype html>
<html lang="en-GB"><head>
<title>A Complete Fixture Title</title>
<meta name="description" content="A complete deterministic fixture description.">
<meta name="robots" content="index, follow">
<meta name="googlebot" content="max-snippet:-1">
<meta property="og:title" content="Open Graph Fixture">
<meta property="og:description" content="Open Graph description">
<meta property="og:image" content="/images/cover.jpg">
<meta property="og:type" content="article">
<meta property="og:url" content="${ORIGIN}/article">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Twitter Fixture">
<link rel="canonical" href="/article">
<script type="application/ld+json">{
	"@context":"https://schema.org",
	"@graph":[
		{"@id":"#article","@type":["Article","WebPage"],"author":{"@id":"#missing-person"}},
		{"@id":"#site","@type":"WebSite"}
	]
}</script>
<script type="module" src="/_app/immutable/start.js"></script>
</head><body>
<main id="content"><article>
<h1>A Complete Fixture Title</h1>
<p class="byline">Suvro Ghosh</p>
<time class="published" datetime="2026-08-01">1 August 2026</time>
<time class="updated" datetime="2026-08-05">5 August 2026</time>
<p>This server-rendered paragraph contains the principal content, with enough words for readers and crawlers to understand the page without JavaScript. It continues with evidence, context, methods, limitations, and a concise conclusion so the fixture clears the content threshold reliably.</p>
<a href="/inside#known">Internal</a><a href="https://outside.test/">External</a>
<a href="#missing-fragment">Missing fragment</a><span id="known">Known target</span>
<a href="/hidden" hidden>Hidden</a>
<img src="/images/river-bank.jpg" alt="river bank" width="640" height="480">
<img src="/images/missing.jpg">
<video src="/video/example.mp4"></video>
</article></main></body></html>`;
	const analysis = analyzeHtml(html, `${ORIGIN}/article`, { origin: ORIGIN });
	assert.equal(analysis.canonicalUrl, `${ORIGIN}/article`);
	assert.equal(analysis.title, 'A Complete Fixture Title');
	assert.equal(analysis.h1Count, 1);
	assert.equal(analysis.htmlLang, 'en-GB');
	assert.equal(analysis.visibleAuthor, 'Suvro Ghosh');
	assert.equal(analysis.publicationDate, '2026-08-01');
	assert.equal(analysis.modificationOrReviewDate, '2026-08-05');
	assert.equal(analysis.openGraph.image, `${ORIGIN}/images/cover.jpg`);
	assert.equal(analysis.twitter.card, 'summary_large_image');
	assert.deepEqual(analysis.jsonLd.types, ['Article', 'WebPage', 'WebSite']);
	assert.deepEqual(analysis.jsonLd.danglingReferences, [`${ORIGIN}/article#missing-person`]);
	assert.deepEqual(analysis.danglingFragmentReferences, ['missing-fragment']);
	assert.equal(analysis.internalLinkCount, 3);
	assert.equal(
		analysis.links.find((link) => link.url === `${ORIGIN}/inside`)?.anchorText,
		'Internal'
	);
	assert.equal(
		analysis.links.find((link) => link.url === `${ORIGIN}/inside`)?.context,
		'server_html'
	);
	assert.equal(analysis.externalLinkCount, 1);
	assert.equal(analysis.hiddenInternalLinkCount, 1);
	assert.equal(analysis.imageCount, 2);
	assert.equal(analysis.imageMissingOrEmptyAltCount, 1);
	assert.equal(analysis.filenameDerivedAltCount, 1);
	assert.equal(analysis.imagesMissingIntrinsicDimensionsCount, 1);
	assert.equal(analysis.videoCount, 1);
	assert.equal(analysis.videosMissingCaptionsTranscriptOrSummaryCount, 1);
	assert.deepEqual(analysis.scriptReferences, [`${ORIGIN}/_app/immutable/start.js`]);
	assert.equal(analysis.principalContentInRawHtml, true);
	assert.equal(analysis.bodyContentHash.length, 64);
	assert.deepEqual([...parseRobotsDirectives('none')].sort(), ['nofollow', 'noindex', 'none']);
	assert.equal(parseRobotsDirectives('googlebot: noindex, noarchive').has('noindex'), true);
});

test('no-JavaScript principal-content evidence handles short SSR and short client-only pages', () => {
	const shortSsr = fakeCrawlRecord('/short-ssr');
	shortSsr.analysis.principalWordCount = 20;
	shortSsr.analysis.principalContentInRawHtml = false;
	shortSsr.render = { ...shortSsr.render, status: 'rendered', principalWordCount: 20 };
	assert.equal(principalContentWithoutJavaScript(shortSsr), true);

	const shortClientOnly = fakeCrawlRecord('/short-client-only');
	shortClientOnly.analysis.principalWordCount = 0;
	shortClientOnly.analysis.principalContentInRawHtml = false;
	shortClientOnly.render = {
		...shortClientOnly.render,
		status: 'rendered',
		principalWordCount: 20
	};
	assert.equal(principalContentWithoutJavaScript(shortClientOnly), false);
});

test('follows and records same-site redirect chains without following an off-site target', async () => {
	const requests = [];
	const responses = new Map([
		[`${ORIGIN}/old`, () => new Response('', { status: 301, headers: { location: '/middle' } })],
		[`${ORIGIN}/middle`, () => new Response('', { status: 308, headers: { location: '/new' } })],
		[
			`${ORIGIN}/new`,
			() =>
				new Response(htmlPage('/new'), {
					status: 200,
					headers: { 'content-type': 'text/html; charset=utf-8' }
				})
		]
	]);
	const fetchImpl = async (url, options) => {
		requests.push({ url: String(url), method: options.method, redirect: options.redirect });
		return responses.get(String(url))();
	};
	const result = await fetchWithRedirects(`${ORIGIN}/old`, { fetchImpl, origin: ORIGIN });
	assert.equal(result.status, 200);
	assert.equal(result.finalUrl, `${ORIGIN}/new`);
	assert.deepEqual(result.redirectChain, [`${ORIGIN}/old`, `${ORIGIN}/middle`, `${ORIGIN}/new`]);
	assert.deepEqual(
		requests.map((request) => request.method),
		['GET', 'GET', 'GET']
	);
	assert.equal(
		requests.every((request) => request.redirect === 'manual'),
		true
	);

	let externalFetches = 0;
	const external = await fetchWithRedirects(`${ORIGIN}/outside`, {
		origin: ORIGIN,
		fetchImpl: async () => {
			externalFetches += 1;
			return new Response('', { status: 302, headers: { location: 'https://outside.test/path' } });
		}
	});
	assert.equal(externalFetches, 1);
	assert.match(external.error, /^redirect_outside_audit_origin:/);
});

test('page fetch policy records but never requests or exposes a protected redirect target', async () => {
	const publicUrl = `${ORIGIN}/public-page`;
	const requests = [];
	const result = await fetchWithRedirects(publicUrl, {
		origin: ORIGIN,
		targetPolicy: isAuditablePageUrl,
		fetchImpl: async (url) => {
			requests.push(String(url));
			assert.equal(String(url), publicUrl, 'the protected redirect target must never be fetched');
			return new Response('', {
				status: 302,
				headers: { location: '/notes/sign-in?password=do-not-record' }
			});
		}
	});

	assert.deepEqual(requests, [publicUrl]);
	assert.equal(result.status, 302);
	assert.equal(result.finalUrl, publicUrl);
	assert.deepEqual(result.redirectChain, [publicUrl]);
	assert.equal(result.redirects.length, 1);
	assert.equal(result.redirects[0].location, '[BLOCKED_BY_AUDIT_POLICY]');
	assert.equal(result.redirects[0].to, '');
	assert.equal(result.error, 'redirect_target_blocked_by_audit_policy');
	assert.equal(JSON.stringify(result).includes('/notes/sign-in'), false);
	assert.equal(JSON.stringify(result).includes('do-not-record'), false);
});

test('public input and asset policy blocks normalized protected redirects and non-default ports', async () => {
	assert.equal(isPublicAuditTarget(`${ORIGIN}/sitemap.xml`, ORIGIN), true);
	assert.equal(isPublicAuditTarget(`${ORIGIN}/_app/immutable/start.js`, ORIGIN), true);
	assert.equal(isPublicAuditTarget(`${ORIGIN}/notes/studio`, ORIGIN), false);
	assert.equal(isPublicAuditTarget(`${ORIGIN}/notes//%73ign-in/private`, ORIGIN), false);
	assert.equal(isPublicAuditTarget(`${ORIGIN}/notes/%ZZsign-in`, ORIGIN), false);
	assert.equal(
		isPublicAuditTarget('https://www.example.test:8443/_app/immutable/start.js', ORIGIN),
		false
	);

	const inputUrl = `${ORIGIN}/sitemap.xml`;
	const requests = [];
	const result = await fetchWithRedirects(inputUrl, {
		origin: ORIGIN,
		fetchImpl: async (url) => {
			requests.push(String(url));
			assert.equal(String(url), inputUrl, 'the normalized protected target must never be fetched');
			return new Response('', {
				status: 302,
				headers: { location: '/notes//%73ign-in/private?secret=do-not-record' }
			});
		}
	});

	assert.deepEqual(requests, [inputUrl]);
	assert.equal(result.error, 'redirect_target_blocked_by_audit_policy');
	assert.equal(result.redirects[0].location, '[BLOCKED_BY_AUDIT_POLICY]');
	assert.equal(JSON.stringify(result).includes('sign-in'), false);
	assert.equal(JSON.stringify(result).includes('do-not-record'), false);
});

test('request timeout remains active and retries the whole GET while the body is being read', async () => {
	let fetches = 0;
	let gateWaits = 0;
	const retrySleeps = [];
	const result = await fetchWithRedirects(`${ORIGIN}/slow-body`, {
		origin: ORIGIN,
		timeoutMs: 10,
		gate: {
			wait: async () => {
				gateWaits += 1;
			}
		},
		retrySleep: async (milliseconds) => retrySleeps.push(milliseconds),
		fetchImpl: async (_url, options) => {
			fetches += 1;
			return new Response(
				new ReadableStream({
					start(controller) {
						options.signal.addEventListener(
							'abort',
							() => controller.error(options.signal.reason),
							{ once: true }
						);
					}
				}),
				{ status: 200, headers: { 'content-type': 'text/html' } }
			);
		}
	});
	assert.match(result.error, /^response_body_error:.*request_timeout/);
	assert.match(result.error, /transport_attempts_exhausted_after_5/);
	assert.equal(fetches, MAX_FETCH_ATTEMPTS);
	assert.equal(gateWaits, MAX_FETCH_ATTEMPTS);
	assert.deepEqual(retrySleeps, FETCH_RETRY_DELAYS_MS);
});

test('uses five gated fetch attempts and the exact deterministic backoff schedule', async () => {
	let fetches = 0;
	let gateWaits = 0;
	const retrySleeps = [];
	const result = await fetchWithRedirects(`${ORIGIN}/transient`, {
		origin: ORIGIN,
		gate: {
			wait: async () => {
				gateWaits += 1;
			}
		},
		retrySleep: async (milliseconds) => retrySleeps.push(milliseconds),
		fetchImpl: async () => {
			fetches += 1;
			if (fetches < MAX_FETCH_ATTEMPTS) throw new TypeError('fetch failed');
			return new Response(htmlPage('/transient'), {
				status: 200,
				headers: { 'content-type': 'text/html; charset=utf-8' }
			});
		}
	});
	assert.equal(result.status, 200);
	assert.equal(result.error, '');
	assert.equal(fetches, MAX_FETCH_ATTEMPTS);
	assert.equal(gateWaits, MAX_FETCH_ATTEMPTS);
	assert.deepEqual(FETCH_RETRY_DELAYS_MS, [500, 1_500, 3_000, 5_000]);
	assert.deepEqual(retrySleeps, FETCH_RETRY_DELAYS_MS);
});

test('bounds rejected fetches at five attempts and never retries an HTTP error response', async () => {
	let rejectedFetches = 0;
	const retrySleeps = [];
	const rejected = await fetchWithRedirects(`${ORIGIN}/unavailable`, {
		origin: ORIGIN,
		retrySleep: async (milliseconds) => retrySleeps.push(milliseconds),
		fetchImpl: async () => {
			rejectedFetches += 1;
			throw new TypeError('fetch failed');
		}
	});
	assert.equal(rejectedFetches, MAX_FETCH_ATTEMPTS);
	assert.equal(rejected.status, null);
	assert.equal(rejected.error, 'transport_attempts_exhausted_after_5:fetch failed');
	assert.deepEqual(retrySleeps, FETCH_RETRY_DELAYS_MS);

	let httpFetches = 0;
	const httpRetrySleeps = [];
	const httpError = await fetchWithRedirects(`${ORIGIN}/service-unavailable`, {
		origin: ORIGIN,
		retrySleep: async (milliseconds) => httpRetrySleeps.push(milliseconds),
		fetchImpl: async () => {
			httpFetches += 1;
			return new Response('temporarily unavailable', { status: 503 });
		}
	});
	assert.equal(httpFetches, 1);
	assert.equal(httpError.status, 503);
	assert.equal(httpError.error, '');
	assert.deepEqual(httpRetrySleeps, []);
});

test('retries a classified response-body transport failure but not a generic body error', async () => {
	let transportFetches = 0;
	const transportSleeps = [];
	const recovered = await fetchWithRedirects(`${ORIGIN}/body-transport`, {
		origin: ORIGIN,
		retrySleep: async (milliseconds) => transportSleeps.push(milliseconds),
		fetchImpl: async () => {
			transportFetches += 1;
			if (transportFetches === 1) {
				const cause = Object.assign(new Error('other side closed'), {
					code: 'UND_ERR_SOCKET'
				});
				return new Response(
					new ReadableStream({
						start(controller) {
							controller.error(new TypeError('terminated', { cause }));
						}
					}),
					{ status: 200, headers: { 'content-type': 'text/html' } }
				);
			}
			return new Response(htmlPage('/body-transport'), {
				status: 200,
				headers: { 'content-type': 'text/html' }
			});
		}
	});
	assert.equal(recovered.status, 200);
	assert.equal(recovered.error, '');
	assert.equal(transportFetches, 2);
	assert.deepEqual(transportSleeps, [FETCH_RETRY_DELAYS_MS[0]]);

	let genericFetches = 0;
	const genericSleeps = [];
	const genericFailure = await fetchWithRedirects(`${ORIGIN}/invalid-body`, {
		origin: ORIGIN,
		retrySleep: async (milliseconds) => genericSleeps.push(milliseconds),
		fetchImpl: async () => {
			genericFetches += 1;
			return new Response(
				new ReadableStream({
					start(controller) {
						controller.error(new Error('invalid content encoding'));
					}
				}),
				{ status: 200, headers: { 'content-type': 'text/html' } }
			);
		}
	});
	assert.equal(genericFetches, 1);
	assert.match(genericFailure.error, /^response_body_error:invalid content encoding/);
	assert.deepEqual(genericSleeps, []);
});

test('does not retry a successful response that fails audit-input content validation', async (t) => {
	const root = await temporaryDirectory(t);
	const calls = new Map();
	const bodies = new Map([
		[`${ORIGIN}/sitemap.xml`, '<html><body>not a sitemap</body></html>'],
		[`${ORIGIN}/notes/sitemap.xml`, '<urlset></urlset>'],
		[`${ORIGIN}/rss.xml`, `<rss><channel><item><link>${ORIGIN}/</link></item></channel></rss>`],
		[`${ORIGIN}/robots.txt`, 'User-agent: *\nAllow: /\n'],
		[`${ORIGIN}/`, htmlPage('/')]
	]);
	await assert.rejects(
		() =>
			runAudit(
				{
					root,
					origin: ORIGIN,
					outputDirectory: path.join(root, 'reports'),
					renderMode: 'none',
					bundleWeightMode: 'off',
					runUserAgentSample: false,
					runVariants: false
				},
				{
					logProgress: false,
					requestGate: { wait: async () => {} },
					fetchImpl: async (url) => {
						const key = String(url);
						calls.set(key, (calls.get(key) ?? 0) + 1);
						return new Response(bodies.get(key), {
							status: 200,
							headers: {
								'content-type': key === `${ORIGIN}/` ? 'text/html' : 'application/xml'
							}
						});
					}
				}
			),
		/main_sitemap audit input was not a recognizable sitemap document/
	);
	assert.equal(calls.get(`${ORIGIN}/sitemap.xml`), 1);
});

test('fetch completeness failures expose only a bounded sanitized diagnostic sample', () => {
	assert.throws(
		() =>
			assertFetchCompleteness(
				'Normal crawl',
				[
					{
						requestedUrl: `${ORIGIN}/failed`,
						status: null,
						error: 'fetch failed'
					}
				],
				{ partialResult: 'crawl' }
			),
		/Normal crawl had 1 fetch failure\(s\); retryable transport failures use at most 5 attempts with 500\/1500\/3000\/5000 ms backoffs; no partial crawl will be accepted/
	);

	const failures = Array.from({ length: 7 }, (_, index) => ({
		userAgentKey: index === 0 ? 'googlebot\nforged' : `agent-${index}`,
		requestedUrl:
			index === 0
				? 'https://user:password@www.example.test/private?access_token=secret-value&view=1#fragment'
				: `${ORIGIN}/failed-${index}`,
		status: null,
		error:
			index === 0
				? 'fetch failed\nBearer private-bearer password=private-password'
				: `fetch failed ${'x'.repeat(400)}`
	}));
	let diagnostic = '';
	assert.throws(
		() => assertFetchCompleteness('User-agent comparison', failures, { partialResult: 'sample' }),
		(error) => {
			diagnostic = error.message;
			return true;
		}
	);
	assert.match(diagnostic, /User-agent comparison had 7 fetch failure\(s\)/);
	assert.match(diagnostic, /2 additional failure\(s\) omitted/);
	assert.equal((diagnostic.match(/"userAgentKey"/g) ?? []).length, 5);
	assert.match(diagnostic, /googlebot_forged/);
	assert.match(diagnostic, /access_token=\[REDACTED\]/);
	assert.doesNotMatch(diagnostic, /secret-value|private-bearer|private-password|user:password/);
	assert.doesNotMatch(diagnostic, /[\r\n]/);
	assert.ok(diagnostic.length < 4_000);
});

test('runAudit fails closed on an incomplete normal crawl before user-agent sampling', async (t) => {
	const root = await temporaryDirectory(t);
	await fs.mkdir(path.join(root, 'src/routes/broken'), { recursive: true });
	await fs.writeFile(path.join(root, 'src/routes/broken/+page.svelte'), '<h1>Broken</h1>', 'utf8');
	const fixedInputs = new Map([
		[
			`${ORIGIN}/sitemap.xml`,
			[
				'application/xml',
				`<urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/broken</loc></url></urlset>`
			]
		],
		[`${ORIGIN}/notes/sitemap.xml`, ['application/xml', '<urlset></urlset>']],
		[
			`${ORIGIN}/rss.xml`,
			['application/rss+xml', `<rss><channel><item><link>${ORIGIN}/</link></item></channel></rss>`]
		],
		[`${ORIGIN}/robots.txt`, ['text/plain', 'User-agent: *\nAllow: /\n']],
		[`${ORIGIN}/`, ['text/html', htmlPage('/')]]
	]);
	let brokenFetches = 0;
	await assert.rejects(
		() =>
			runAudit(
				{
					root,
					origin: ORIGIN,
					outputDirectory: path.join(root, 'reports'),
					renderMode: 'none',
					bundleWeightMode: 'off',
					runUserAgentSample: false,
					runVariants: false
				},
				{
					logProgress: false,
					requestGate: { wait: async () => {} },
					fetchImpl: async (url) => {
						const key = String(url);
						const fixed = fixedInputs.get(key);
						if (fixed) {
							return new Response(fixed[1], {
								status: 200,
								headers: { 'content-type': fixed[0] }
							});
						}
						const pathname = new URL(key).pathname;
						if (pathname === '/broken') {
							brokenFetches += 1;
							return new Response(
								new ReadableStream({
									start(controller) {
										controller.error(new Error('invalid content encoding'));
									}
								}),
								{ status: 200, headers: { 'content-type': 'text/html' } }
							);
						}
						return new Response(htmlPage(pathname), {
							status: 200,
							headers: { 'content-type': 'text/html' }
						});
					}
				}
			),
		(error) => {
			assert.match(error.message, /Normal crawl had 1 fetch failure\(s\)/);
			assert.match(error.message, /"requestedUrl":"https:\/\/www\.example\.test\/broken"/);
			assert.match(error.message, /response_body_error:invalid content encoding/);
			return true;
		}
	);
	assert.equal(brokenFetches, 1);
});

test('rate gate serialises request starts and concurrent map never exceeds four workers', async () => {
	let clock = 0;
	const sleeps = [];
	const gate = createRateGate({
		requestsPerSecond: 2,
		now: () => clock,
		sleep: async (milliseconds) => {
			sleeps.push(milliseconds);
			clock += milliseconds;
		}
	});
	await Promise.all([gate.wait(), gate.wait(), gate.wait()]);
	assert.deepEqual(sleeps, [500, 500]);

	let active = 0;
	let maximum = 0;
	const values = await mapConcurrent(
		Array.from({ length: 16 }, (_, index) => index),
		4,
		async (value) => {
			active += 1;
			maximum = Math.max(maximum, active);
			await new Promise((resolve) => setImmediate(resolve));
			active -= 1;
			return value * 2;
		}
	);
	assert.equal(maximum, 4);
	assert.deepEqual(
		values,
		Array.from({ length: 16 }, (_, index) => index * 2)
	);
	await assert.rejects(() => mapConcurrent([1], 5, async (value) => value), /1 to 4/);
});

test('dynamic crawl stays on-site, ignores side-effect routes, and discovers nested links', async () => {
	const inventory = createUrlInventory(
		[{ url: `${ORIGIN}/`, sourceType: 'homepage', canonicalCandidate: true, strata: ['homepage'] }],
		ORIGIN
	);
	const documents = new Map([
		[
			`${ORIGIN}/`,
			htmlPage('/', {
				body: '<p>Home page principal content with enough ordinary words for deterministic analysis and crawling.</p><a href="/a">A</a><a href="/images?tab=photos">Photos</a><a href="/api/write">API</a><a href="https://outside.test/">Outside</a>'
			})
		],
		[
			`${ORIGIN}/a`,
			htmlPage('/a', {
				body: '<p>Page A principal content with enough ordinary words for deterministic analysis and crawling.</p><a href="/b">B</a>'
			})
		],
		[`${ORIGIN}/b`, htmlPage('/b')],
		[
			`${ORIGIN}/images?tab=photos`,
			htmlPage('/images?tab=photos', {
				body: '<p>Canonical photo gallery state with enough ordinary words for deterministic analysis and crawling.</p><a href="/images?tab=thumbnails&page=2">Thumbnail page two</a>'
			})
		],
		[`${ORIGIN}/images?page=2&tab=thumbnails`, htmlPage('/images?page=2&tab=thumbnails')]
	]);
	const calls = [];
	const result = await crawlInventory(inventory, {
		origin: ORIGIN,
		gate: { wait: async () => {} },
		concurrency: 4,
		maxUrls: 50,
		fetchImpl: async (url, options) => {
			calls.push({ url: String(url), method: options.method });
			const document = documents.get(String(url));
			assert.ok(document, `unexpected fake request: ${url}`);
			return new Response(document, {
				status: 200,
				headers: { 'content-type': 'text/html; charset=utf-8' }
			});
		}
	});
	assert.deepEqual([...result.records.keys()].sort(), [
		`${ORIGIN}/`,
		`${ORIGIN}/a`,
		`${ORIGIN}/b`,
		`${ORIGIN}/images?page=2&tab=thumbnails`,
		`${ORIGIN}/images?tab=photos`
	]);
	assert.equal(inventory.get(`${ORIGIN}/a`).sources.has('homepage'), true);
	assert.equal(inventory.get(`${ORIGIN}/b`).sources.has('crawl'), true);
	assert.equal(inventory.get(`${ORIGIN}/images?tab=photos`).sources.has('homepage'), true);
	assert.equal(inventory.get(`${ORIGIN}/images?page=2&tab=thumbnails`).sources.has('crawl'), true);
	assert.equal(
		calls.every((call) => call.method === 'GET'),
		true
	);
});

test('crawl maxUrls is a total discovered-and-processed bound, not a refillable queue bound', async () => {
	const inventory = createUrlInventory(
		[{ url: `${ORIGIN}/`, sourceType: 'homepage', canonicalCandidate: true }],
		ORIGIN
	);
	const documents = new Map([
		[
			`${ORIGIN}/`,
			htmlPage('/', {
				body: '<p>Bounded crawl home fixture with ordinary principal content.</p><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>'
			})
		],
		[`${ORIGIN}/a`, htmlPage('/a')],
		[`${ORIGIN}/b`, htmlPage('/b')],
		[`${ORIGIN}/c`, htmlPage('/c')]
	]);
	const calls = [];
	const result = await crawlInventory(inventory, {
		origin: ORIGIN,
		gate: { wait: async () => {} },
		concurrency: 4,
		maxUrls: 2,
		fetchImpl: async (url) => {
			calls.push(String(url));
			return new Response(documents.get(String(url)), {
				status: 200,
				headers: { 'content-type': 'text/html; charset=utf-8' }
			});
		}
	});
	assert.equal(result.records.size, 2);
	assert.equal(calls.length, 2);
	assert.deepEqual(result.warnings, ['URL_LIMIT_REACHED:2']);
});

test('builds a 50-or-larger stratified user-agent sample with ten visualizations, redirects, and 404s', () => {
	const records = [];
	for (let index = 0; index < 10; index += 1) {
		records.push({
			url: `${ORIGIN}/visualization-${index}`,
			sourceType: 'post',
			canonicalCandidate: true,
			strata: ['visualization', 'science_math'],
			lastModified: `2026-07-${String(index + 1).padStart(2, '0')}`
		});
	}
	for (let index = 0; index < 6; index += 1) {
		records.push({
			url: `${ORIGIN}/redirect-${index}`,
			sourceType: 'post_alias',
			canonicalCandidate: false,
			strata: ['redirect']
		});
	}
	for (const stratum of [
		'category',
		'topic',
		'pagination',
		'archive',
		'healthcare',
		'essay_satire',
		'image_heavy',
		'video'
	]) {
		for (let index = 0; index < 5; index += 1) {
			records.push({
				url: `${ORIGIN}/${stratum}-${index}`,
				sourceType: 'source',
				canonicalCandidate: true,
				strata: [stratum],
				lastModified: `2025-01-${String(index + 1).padStart(2, '0')}`
			});
		}
	}
	for (let index = 0; index < 80; index += 1) {
		records.push({
			url: `${ORIGIN}/generic-${index}`,
			sourceType: 'source',
			canonicalCandidate: true,
			strata: ['generic'],
			lastModified: `2024-01-${String((index % 28) + 1).padStart(2, '0')}`
		});
	}
	const inventory = createUrlInventory(records, ORIGIN);
	const sample = buildUserAgentSample(inventory, [], {
		origin: ORIGIN,
		size: DEFAULT_USER_AGENT_SAMPLE_SIZE,
		auditDate: '2026-08-06'
	});
	assert.equal(sample.length, DEFAULT_USER_AGENT_SAMPLE_SIZE);
	assert.equal(sample.filter((entry) => entry.strata.includes('visualization')).length >= 10, true);
	assert.equal(
		sample.some((entry) => entry.strata.includes('redirect')),
		true
	);
	assert.equal(
		sample.some((entry) => entry.strata.includes('intentional_404')),
		true
	);
	assert.equal(
		sample.some((entry) => entry.strata.includes('category')),
		true
	);
	assert.equal(
		sample.some((entry) => entry.strata.includes('pagination')),
		true
	);
});

test('computes a rendered-DOM graph with provenance, components, anchors, and traffic context', () => {
	const home = fakeCrawlRecord('/', {
		html: htmlPage('/', {
			body: '<p>Home principal content with many clear words for the graph fixture.</p><a href="/raw-only">Raw only</a>'
		})
	});
	const pageA = fakeCrawlRecord('/a', {
		html: htmlPage('/a')
	});
	const pageB = fakeCrawlRecord('/b');
	const rawOnly = fakeCrawlRecord('/raw-only');
	const orphan = fakeCrawlRecord('/orphan');
	home.render = {
		...home.render,
		status: 'rendered',
		links: [
			{
				url: `${ORIGIN}/a`,
				anchorText: 'Primary A',
				anchorTextNormalized: 'primary a',
				context: 'primary_navigation',
				nofollow: false,
				hidden: false
			}
		]
	};
	pageA.render = {
		...pageA.render,
		status: 'rendered',
		links: [
			{
				url: `${ORIGIN}/b`,
				anchorText: 'Detailed B',
				anchorTextNormalized: 'detailed b',
				context: 'related_content',
				nofollow: false,
				hidden: false
			}
		]
	};
	for (const record of [pageB, rawOnly, orphan]) {
		record.render = { ...record.render, status: 'rendered', links: [] };
	}
	const graph = computeInternalGraph([home, pageA, pageB, rawOnly, orphan], {
		origin: ORIGIN,
		observedTraffic: new Map([
			[`${ORIGIN}/`, 100],
			[`${ORIGIN}/a`, 20],
			[`${ORIGIN}/b`, 5]
		])
	});
	assert.equal(graph.metrics.get(`${ORIGIN}/`).depth, 0);
	assert.equal(graph.metrics.get(`${ORIGIN}/a`).depth, 1);
	assert.equal(graph.metrics.get(`${ORIGIN}/b`).depth, 2);
	assert.equal(graph.metrics.get(`${ORIGIN}/b`).inDegree, 1);
	assert.equal(graph.metrics.get(`${ORIGIN}/raw-only`).orphan, true);
	assert.equal(graph.metrics.get(`${ORIGIN}/orphan`).orphan, true);
	assert.equal(graph.metrics.get(`${ORIGIN}/orphan`).reachableFromHomepage, false);
	assert.equal(graph.metrics.get(`${ORIGIN}/a`).linksFromHubs, 1);
	assert.equal(graph.metrics.get(`${ORIGIN}/a`).linksFromObservedHighTrafficPages, 1);
	assert.deepEqual(graph.metrics.get(`${ORIGIN}/a`).anchorTextDistribution, ['primary a (1)']);
	assert.equal(graph.metrics.get(`${ORIGIN}/a`).componentSize, 3);
	assert.equal(graph.metrics.get(`${ORIGIN}/a`).linkEvidence, 'rendered_dom');
	assert.equal(graph.renderedDomNodeCount, 5);
	assert.equal(graph.fallbackNodeCount, 0);
	assert.equal(graph.trafficMatchedCanonicalUrls, 3);
	assert.equal(
		graph.edges.some(
			(edge) =>
				edge.source === `${ORIGIN}/` &&
				edge.target === `${ORIGIN}/a` &&
				edge.anchorText === 'Primary A' &&
				edge.linkContext === 'primary_navigation' &&
				edge.linkEvidence === 'rendered_dom'
		),
		true
	);
	assert.equal(
		graph.edges.some((edge) => edge.target === `${ORIGIN}/raw-only`),
		false,
		'rendered links must take precedence over raw response anchors'
	);
	const rankTotal = [...graph.metrics.values()].reduce((sum, metrics) => sum + metrics.pageRank, 0);
	assert.ok(Math.abs(rankTotal - 1) < 1e-9);
});

test('keeps canonical image-gallery query states in rendered graph topology', () => {
	const home = fakeCrawlRecord('/');
	const photos = fakeCrawlRecord('/images?tab=photos');
	home.render = {
		...home.render,
		status: 'rendered',
		links: [
			{
				url: `${ORIGIN}/images?tab=photos`,
				href: '/images?tab=photos',
				anchorText: 'Photos',
				anchorTextNormalized: 'photos',
				context: 'primary_navigation',
				nofollow: false,
				hidden: false
			}
		]
	};
	photos.render = { ...photos.render, status: 'rendered', links: [] };

	const graph = computeInternalGraph([home, photos], { origin: ORIGIN });

	assert.deepEqual(graph.nodes, [`${ORIGIN}/`, `${ORIGIN}/images?tab=photos`]);
	assert.equal(
		graph.edges.some(
			(edge) => edge.source === `${ORIGIN}/` && edge.target === `${ORIGIN}/images?tab=photos`
		),
		true
	);
	assert.equal(graph.metrics.get(`${ORIGIN}/images?tab=photos`).depth, 1);
});

test('parses quoted traffic CSV rows and keeps maximum observed visitors per path', () => {
	assert.deepEqual(parseCsvRows('path,visitors\n"/a,part",12\n/b,"1,234"\n'), [
		['path', 'visitors'],
		['/a,part', '12'],
		['/b', '1,234']
	]);
	const traffic = observedTrafficFromCsv(
		'path,visitors\n/,10\n/a,12\n/a,9\nhttps://outside.test/,999\n',
		ORIGIN
	);
	assert.equal(traffic.get(`${ORIGIN}/`), 10);
	assert.equal(traffic.get(`${ORIGIN}/a`), 12);
	assert.equal(traffic.has('https://outside.test/'), false);
});

test('compares user agents on material fields and records review issues without calling the network', () => {
	const inventory = createUrlInventory(
		[
			{ url: `${ORIGIN}/`, sourceType: 'main_sitemap', canonicalCandidate: true },
			{ url: `${ORIGIN}/duplicate`, sourceType: 'main_sitemap', canonicalCandidate: true }
		],
		ORIGIN
	);
	const home = fakeCrawlRecord('/', { inventory: inventory.get(`${ORIGIN}/`) });
	const noindexHtml = htmlPage('/duplicate', {
		title: '/',
		description: 'Description for /',
		robots: 'index, noindex',
		body: '<p>Page not found. This error-like response deliberately returns status two hundred for soft-404 testing.</p>'
	});
	const duplicate = fakeCrawlRecord('/duplicate', {
		html: noindexHtml,
		inventory: inventory.get(`${ORIGIN}/duplicate`)
	});
	const bot = fakeCrawlRecord('/', {
		html: htmlPage('/', {
			title: 'Access denied',
			body: '<p>Verify that you are human. Access denied by a bot challenge.</p>'
		}),
		status: 403
	});
	const comparison = compareUserAgentRecord(home, bot);
	assert.equal(comparison.materiallyDifferent, true);
	assert.equal(comparison.differences.includes('status'), true);
	const graph = computeInternalGraph([home, duplicate], { origin: ORIGIN });
	applyIssueDetection([home, duplicate], {
		origin: ORIGIN,
		graph,
		userAgentResults: [
			{
				url: `${ORIGIN}/`,
				userAgentKey: 'googlebot',
				record: bot,
				comparison
			}
		]
	});
	assert.equal(duplicate.issueCodes.includes('CONFLICTING_ROBOTS_DIRECTIVES'), true);
	assert.equal(duplicate.issueCodes.includes('ACCIDENTAL_NOINDEX_REVIEW'), true);
	assert.equal(duplicate.issueCodes.includes('SOFT_404_REVIEW'), true);
	assert.equal(home.issueCodes.includes('MATERIAL_USER_AGENT_DIFFERENCE_REVIEW'), true);
	assert.equal(home.issueCodes.includes('BOT_CHALLENGE_OR_WAF_REVIEW'), true);
});

test('does not label a redirect alias indexable or treat its terminal body as a duplicate page', () => {
	const home = fakeCrawlRecord('/', {
		html: htmlPage('/', {
			body: '<p id="main">Home page with enough content for redirect graph testing.</p><a href="#main">Skip locally</a><a href="/old-destination">Legacy link</a><a href="/middle-destination">Legacy link</a><a href="/notes/sign-in">Protected sign-in</a><a href="/api/write">Write API</a>'
		})
	});
	const destination = fakeCrawlRecord('/destination', {
		html: htmlPage('/destination', {
			title: 'Shared terminal title',
			body: '<p id="destination-main">Destination content remains substantial enough for the graph fixture.</p><a href="/old-destination">Legacy link</a>'
		})
	});
	const alias = fakeCrawlRecord('/old-destination', {
		html: htmlPage('/destination', { title: 'Shared terminal title' }),
		finalUrl: `${ORIGIN}/destination`
	});
	alias.fetch.redirects = [
		{
			from: `${ORIGIN}/old-destination`,
			status: 308,
			location: '/middle-destination',
			to: `${ORIGIN}/middle-destination`,
			responseMs: 2
		},
		{
			from: `${ORIGIN}/middle-destination`,
			status: 308,
			location: '/destination',
			to: `${ORIGIN}/destination`,
			responseMs: 2
		}
	];
	alias.fetch.redirectChain = [
		`${ORIGIN}/old-destination`,
		`${ORIGIN}/middle-destination`,
		`${ORIGIN}/destination`
	];
	const graph = computeInternalGraph([home, destination, alias], {
		origin: ORIGIN,
		observedTraffic: new Map([
			[`${ORIGIN}/destination`, 5],
			[`${ORIGIN}/old-destination`, 9],
			[`${ORIGIN}/middle-destination`, 17]
		])
	});
	applyIssueDetection([home, destination, alias], { origin: ORIGIN, graph });
	const inventory = createUrlInventory(
		[
			{ url: `${ORIGIN}/destination`, sourceType: 'main_sitemap', canonicalCandidate: true },
			{ url: `${ORIGIN}/old-destination`, sourceType: 'post_redirect', canonicalCandidate: false }
		],
		ORIGIN
	);
	destination.inventory = inventory.get(`${ORIGIN}/destination`);
	alias.inventory = inventory.get(`${ORIGIN}/old-destination`);
	const reports = buildAuditReports({
		inventory,
		records: [home, destination, alias],
		graph,
		config: { origin: ORIGIN }
	});
	const aliasRow = reports['INDEXABILITY.csv'].find(
		(row) => row.requested_url === `${ORIGIN}/old-destination`
	);
	assert.equal(aliasRow.indexable, false);
	assert.equal(aliasRow.click_depth_from_homepage, null);
	assert.equal(alias.issueCodes.includes('DUPLICATE_TITLE'), false);
	assert.equal(destination.issueCodes.includes('DUPLICATE_TITLE'), false);
	assert.deepEqual(graph.nodes, [`${ORIGIN}/`, `${ORIGIN}/destination`]);
	assert.equal(graph.aliasToCanonical.get(`${ORIGIN}/old-destination`), `${ORIGIN}/destination`);
	assert.equal(graph.aliasToCanonical.get(`${ORIGIN}/middle-destination`), `${ORIGIN}/destination`);
	assert.equal(graph.metrics.get(`${ORIGIN}/destination`).inDegree, 1);
	assert.equal(graph.metrics.get(`${ORIGIN}/destination`).inboundInternalLinkCount, 2);
	assert.equal(graph.metrics.get(`${ORIGIN}/destination`).observed28dVisitors, 17);
	assert.equal(graph.trafficMatchedCanonicalUrls, 1);
	assert.equal(
		graph.edges.filter(
			(edge) => edge.source === `${ORIGIN}/` && edge.target === `${ORIGIN}/destination`
		).length,
		2
	);
	const homeEdges = graph.edges.filter((edge) => edge.source === `${ORIGIN}/`);
	assert.deepEqual(homeEdges.map((edge) => edge.linkedUrl).sort(), [
		`${ORIGIN}/middle-destination`,
		`${ORIGIN}/old-destination`
	]);
	assert.deepEqual(homeEdges.map((edge) => edge.rawHref).sort(), [
		'/middle-destination',
		'/old-destination'
	]);
	assert.equal(
		graph.edges.every((edge) => edge.targetResolvedViaAlias),
		true
	);
	assert.equal(
		graph.edges.every((edge) => edge.linkedUrlIsRedirect),
		true
	);
	assert.deepEqual(graph.edges.map((edge) => edge.linkedUrlRedirectStatus).sort(), [308, 308, 308]);
	assert.equal(
		graph.edges.every((edge) => edge.targetCrawled),
		true
	);
	const selfAliasEdges = graph.edges.filter((edge) => edge.source === edge.target);
	assert.equal(selfAliasEdges.length, 1);
	assert.equal(selfAliasEdges[0].selfCanonicalTarget, true);
	assert.equal(selfAliasEdges[0].linkedUrl, `${ORIGIN}/old-destination`);
	assert.equal(
		graph.edges.some((edge) => edge.rawHref === '#main'),
		false
	);
	assert.equal(
		graph.edges.some(
			(edge) => edge.linkedUrl.includes('/notes/sign-in') || edge.linkedUrl.includes('/api/')
		),
		false
	);
});

test('keeps narrative soft-404 phrases review-only instead of excluding a canonical page', () => {
	const narrative = fakeCrawlRecord('/narrative', {
		html: htmlPage('/narrative', {
			body: '<p>The archive record was not found by the character, which begins a longer narrative about evidence, memory, bureaucracy, recovery, and the limits of catalogues. This paragraph deliberately contains enough ordinary words to remain a substantive canonical document while exercising the broad review heuristic without turning that heuristic into a technical exclusion.</p>'
		})
	});
	const graph = computeInternalGraph([narrative], { origin: ORIGIN });
	applyIssueDetection([narrative], { origin: ORIGIN, graph });
	const inventory = createUrlInventory(
		[{ url: `${ORIGIN}/narrative`, sourceType: 'main_sitemap', canonicalCandidate: true }],
		ORIGIN
	);
	narrative.inventory = inventory.get(`${ORIGIN}/narrative`);
	const reports = buildAuditReports({
		inventory,
		records: [narrative],
		graph,
		config: { origin: ORIGIN }
	});
	assert.equal(narrative.analysis.soft404TextDetected, true);
	assert.equal(narrative.issueCodes.includes('SOFT_404_REVIEW'), true);
	assert.deepEqual(graph.nodes, [`${ORIGIN}/narrative`]);
	assert.equal(reports['INDEXABILITY.csv'][0].indexable, true);
});

test('challenge detection ignores long narrative CAPTCHA prose but catches a short challenge page', () => {
	const narrative = analyzeHtml(
		htmlPage('/captcha-glossary', {
			title: 'A glossary of agentic systems',
			body: `<p>CAPTCHA is one term in this glossary. ${'ordinary narrative evidence and context '.repeat(
				90
			)}</p>`
		}),
		`${ORIGIN}/captcha-glossary`,
		{ origin: ORIGIN }
	);
	assert.equal(narrative.visibleWordCount > 250, true);
	assert.equal(narrative.challengeDetected, false);

	const challenge = analyzeHtml(
		htmlPage('/challenge', {
			title: 'Checking your browser',
			body: '<p>Please wait while this security check completes.</p>'
		}),
		`${ORIGIN}/challenge`,
		{ origin: ORIGIN }
	);
	assert.equal(challenge.challengeDetected, true);
});

test('rendered links use serialized SVG hrefs and inherit hidden ancestor state', async () => {
	const record = fakeCrawlRecord('/topics');
	const hiddenPanel = {
		hidden: true,
		parentElement: null,
		getAttribute: () => null
	};
	const svgAnchor = {
		// Real SVG anchors expose an SVGAnimatedString object through this property.
		href: { toString: () => '[object SVGAnimatedString]' },
		hidden: false,
		parentElement: hiddenPanel,
		innerText: 'Calcutta',
		textContent: 'Calcutta',
		getAttribute: (name) => {
			if (name === 'href') return './topics/calcutta';
			if (name === 'rel') return '';
			return null;
		},
		closest: () => null
	};
	const fakeDocument = {
		baseURI: `${ORIGIN}/topics`,
		body: { innerText: 'Rendered topic directory' },
		querySelector: () => ({ innerText: 'Rendered topic directory' }),
		querySelectorAll: () => [svgAnchor]
	};
	const page = {
		goto: async () => {},
		waitForLoadState: async () => {},
		content: async () => record.fetch.body,
		evaluate: async (callback) => {
			const previous = {
				document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
				location: Object.getOwnPropertyDescriptor(globalThis, 'location'),
				getComputedStyle: Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle')
			};
			Object.defineProperties(globalThis, {
				document: { configurable: true, value: fakeDocument },
				location: { configurable: true, value: { origin: ORIGIN } },
				getComputedStyle: {
					configurable: true,
					value: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
				}
			});
			try {
				return callback();
			} finally {
				for (const [name, descriptor] of Object.entries(previous)) {
					if (descriptor) Object.defineProperty(globalThis, name, descriptor);
					else delete globalThis[name];
				}
			}
		}
	};
	const context = {
		addInitScript: async () => {},
		route: async () => {},
		newPage: async () => page,
		close: async () => {}
	};
	const browser = {
		newContext: async () => context,
		close: async () => {}
	};
	const playwrightModule = { chromium: { launch: async () => browser } };

	const result = await renderCrawlRecords([record], {
		mode: 'all',
		origin: ORIGIN,
		playwrightModule,
		timeoutMs: 1_000
	});

	assert.deepEqual(result, { rendered: 1, failed: 0, warning: '' });
	assert.equal(record.render.links.length, 1);
	assert.equal(record.render.links[0].url, `${ORIGIN}/topics/calcutta`);
	assert.equal(record.render.links[0].href, './topics/calcutta');
	assert.equal(record.render.links[0].hidden, true);
	assert.equal(record.render.links[0].url.includes('[object'), false);
});

test('renderer executes the Svelte env-to-immutable bootstrap and reuses captured script bytes', async () => {
	const envModule = `export async function boot() {
		const { hydrate } = await import('/_app/immutable/entry/start.js');
		hydrate();
	}`;
	const startModule = `export function hydrate() {
		const panel = document.querySelector('#hydrated-panel');
		panel.hidden = true;
		panel.dataset.hydrated = 'true';
	}`;
	const html = htmlPage('/hydration-fixture', {
		body: `<div id="hydrated-panel"><a href="/hydrated-target">Hydrated target</a></div>
		<script type="module">import('/_app/env.js').then(({ boot }) => boot())</script>`
	});
	const record = fakeCrawlRecord('/hydration-fixture', { html });
	const assetCalls = [];
	let gateWaits = 0;
	const fetchImpl = async (url) => {
		assetCalls.push(String(url));
		if (String(url) === `${ORIGIN}/_app/env.js`) {
			return new Response(envModule, {
				status: 200,
				headers: { 'content-type': 'text/javascript; charset=utf-8' }
			});
		}
		if (String(url) === `${ORIGIN}/_app/immutable/entry/start.js`) {
			return new Response(startModule, {
				status: 200,
				headers: { 'content-type': 'text/javascript; charset=utf-8' }
			});
		}
		throw new Error(`unexpected hydration asset: ${url}`);
	};

	const render = await renderCrawlRecords([record], {
		mode: 'all',
		origin: ORIGIN,
		fetchImpl,
		gate: {
			wait: async () => {
				gateWaits += 1;
				await new Promise((resolve) => setTimeout(resolve, 600));
			}
		},
		timeoutMs: 1_000,
		renderNavigationTimeoutMs: 5_000
	});

	assert.deepEqual(render, { rendered: 1, failed: 0, warning: '' });
	assert.deepEqual(assetCalls.sort(), [
		`${ORIGIN}/_app/env.js`,
		`${ORIGIN}/_app/immutable/entry/start.js`
	]);
	assert.equal(gateWaits, 2);
	assert.equal(record.render.links.length, 1);
	assert.equal(record.render.links[0].hidden, true, 'the hydration mutation must be observed');
	assert.deepEqual(record.render.scriptReferences, [
		`${ORIGIN}/_app/env.js`,
		`${ORIGIN}/_app/immutable/entry/start.js`
	]);
	assert.equal(
		record.render.scriptAssets.every((asset) => Number.isFinite(asset.bytes)),
		true
	);

	await measureJavaScriptBundles([record], {
		mode: 'full',
		origin: ORIGIN,
		fetchImpl: async () => {
			throw new Error('captured rendered assets must be reused without another request');
		},
		gate: { wait: async () => {} }
	});
	assert.equal(record.jsBundleBytes, Buffer.byteLength(envModule) + Buffer.byteLength(startModule));
	assert.equal(record.jsBundleMeasurementStatus, 'measured');
	assert.equal(record.jsBundleUnmeasuredReferenceCount, 0);
});

test('renderer rejects a page when a required same-site bootstrap script fails', async () => {
	const record = fakeCrawlRecord('/broken-hydration', {
		html: htmlPage('/broken-hydration', {
			body: `<p>Broken hydration fixture.</p>
			<script type="module">import('/_app/env.js').then(() => import('/_app/immutable/entry/start.js'))</script>`
		})
	});
	const requests = [];
	const render = await renderCrawlRecords([record], {
		mode: 'all',
		origin: ORIGIN,
		gate: { wait: async () => {} },
		timeoutMs: 5_000,
		fetchImpl: async (url) => {
			requests.push(String(url));
			return new Response('missing', {
				status: 404,
				headers: { 'content-type': 'text/javascript; charset=utf-8' }
			});
		}
	});

	assert.deepEqual(requests, [`${ORIGIN}/_app/env.js`]);
	assert.equal(render.rendered, 0);
	assert.equal(render.failed, 1);
	assert.equal(record.render.status, 'failed');
	assert.match(record.render.error, /required_script_request_failure|svelte_env_script_missing/);
});

test('bundle measurement preserves same-site custom scripts and marks external scripts unmeasured', async () => {
	const custom = fakeCrawlRecord('/custom-script', {
		html: htmlPage('/custom-script').replace(
			'</head>',
			'<script src="/custom-runtime.js"></script></head>'
		)
	});
	const external = fakeCrawlRecord('/external-script', {
		html: htmlPage('/external-script').replace(
			'</head>',
			'<script src="https://cdn.example.test/runtime.js"></script></head>'
		)
	});
	const calls = [];
	await measureJavaScriptBundles([custom, external], {
		mode: 'full',
		origin: ORIGIN,
		gate: { wait: async () => {} },
		fetchImpl: async (url, options) => {
			calls.push({ url: String(url), method: options.method });
			return new Response('', {
				status: 200,
				headers: {
					'content-type': 'text/javascript; charset=utf-8',
					'content-length': '42'
				}
			});
		}
	});

	assert.deepEqual(calls, [{ url: `${ORIGIN}/custom-runtime.js`, method: 'HEAD' }]);
	assert.equal(custom.jsBundleBytes, 42);
	assert.deepEqual(custom.jsBundleReferences, [`${ORIGIN}/custom-runtime.js`]);
	assert.equal(custom.jsBundleMeasurementStatus, 'measured');
	assert.equal(external.jsBundleBytes, null);
	assert.deepEqual(external.jsBundleReferences, []);
	assert.equal(
		external.jsBundleMeasurementStatus,
		'partial_external_or_blocked_scripts_unmeasured'
	);
	assert.equal(external.jsBundleUnmeasuredReferenceCount, 1);
});

test('variant consolidation requires an exact canonical or an actual redirect terminal', () => {
	const baseline = fakeCrawlRecord('/a');
	const unresolvedSlash = fakeCrawlRecord('/a/', { html: htmlPage('/a/') });
	const redirectedSlash = fakeCrawlRecord('/a/', {
		html: htmlPage('/a'),
		finalUrl: `${ORIGIN}/a`
	});
	redirectedSlash.fetch.redirects = [
		{
			from: `${ORIGIN}/a/`,
			status: 308,
			location: '/a',
			to: `${ORIGIN}/a`,
			responseMs: 2
		}
	];
	redirectedSlash.fetch.redirectChain = [`${ORIGIN}/a/`, `${ORIGIN}/a`];
	const variantResults = [
		{
			variantType: 'trailing_slash',
			requestedUrl: `${ORIGIN}/a/`,
			baselineUrl: `${ORIGIN}/a`,
			record: unresolvedSlash
		},
		{
			variantType: 'trailing_slash',
			requestedUrl: `${ORIGIN}/a/`,
			baselineUrl: `${ORIGIN}/a`,
			record: redirectedSlash
		}
	];
	const graph = computeInternalGraph([baseline], { origin: ORIGIN });
	applyIssueDetection([baseline], { origin: ORIGIN, graph, variantResults });
	const inventory = createUrlInventory(
		[{ url: `${ORIGIN}/a`, sourceType: 'main_sitemap', canonicalCandidate: true }],
		ORIGIN
	);
	baseline.inventory = inventory.get(`${ORIGIN}/a`);
	const reports = buildAuditReports({
		inventory,
		records: [baseline],
		graph,
		variantResults,
		config: { origin: ORIGIN }
	});
	assert.equal(baseline.issueCodes.includes('INDEXABLE_TRAILING_SLASH_VARIANT_REVIEW'), true);
	assert.deepEqual(
		reports['URL_VARIANTS.csv'].map((row) => row.consolidates_to_baseline),
		[false, true]
	);
});

test('variant acceptance permits HTTP errors but fails closed on a fetch/body error', async () => {
	let missingFetches = 0;
	const probes = [
		{
			variantType: 'mixed_case',
			requestedUrl: `${ORIGIN}/Missing`,
			baselineUrl: `${ORIGIN}/missing`
		},
		{
			variantType: 'query_string',
			requestedUrl: `${ORIGIN}/page?audit_variant=1`,
			baselineUrl: `${ORIGIN}/page`
		}
	];
	const results = await crawlVariantProbes(probes, {
		origin: ORIGIN,
		gate: { wait: async () => {} },
		fetchImpl: async (url) => {
			if (String(url) === `${ORIGIN}/Missing`) {
				missingFetches += 1;
				return new Response(
					new ReadableStream({
						start(controller) {
							controller.error(new Error('request_timeout'));
						}
					}),
					{
						status: 404,
						headers: { 'content-type': 'text/html; charset=utf-8' }
					}
				);
			}
			return new Response(
				new ReadableStream({
					start(controller) {
						controller.error(new Error('invalid variant body encoding'));
					}
				}),
				{ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
			);
		}
	});

	assert.equal(results[0].record.fetch.status, 404);
	assert.equal(results[0].record.fetch.error, '');
	assert.equal(results[0].record.fetch.body, null);
	assert.equal(results[0].record.fetch.rawBytes, null);
	assert.match(
		results[0].record.fetch.bodyReadWarning,
		/^response_body_unavailable_for_http_404:request_timeout/
	);
	assert.equal(results[0].record.analysis.bodyContentHash, '');
	assert.equal(missingFetches, 1, 'an observed HTTP error must not be retried for its body');
	assert.doesNotThrow(() => assertVariantFetchCompleteness([results[0]]));
	assert.throws(
		() => assertVariantFetchCompleteness(results),
		/URL variant probes had 1 fetch failure\(s\).*no partial variant report will be accepted/
	);
});

test('unread HTTP-error bodies stay non-comparable and surface in every relevant report', () => {
	const baseline = fakeCrawlRecord('/missing', { status: 404 });
	const unread = fakeCrawlRecord('/missing', { status: 404 });
	unread.fetch.body = null;
	unread.fetch.rawBytes = null;
	unread.fetch.bodyReadWarning = 'response_body_unavailable_for_http_404:request_timeout';
	unread.analysis = analyzeHtml('', unread.fetch.finalUrl, { origin: ORIGIN });

	const comparison = compareUserAgentRecord(baseline, unread);
	assert.deepEqual(comparison.differences, []);
	assert.equal(comparison.wordDeltaRatio, null);
	assert.equal(comparison.bodyHashDifferent, null);
	assert.equal(comparison.materiallyDifferent, false);

	const inventory = createUrlInventory(
		[{ url: `${ORIGIN}/missing`, sourceType: 'main_sitemap', canonicalCandidate: true }],
		ORIGIN
	);
	unread.inventory = inventory.get(`${ORIGIN}/missing`);
	const graph = computeInternalGraph([unread], { origin: ORIGIN });
	const userAgentResults = [
		{
			url: `${ORIGIN}/missing`,
			strata: ['intentional_404'],
			userAgentKey: 'googlebot',
			userAgent: 'fixture-googlebot',
			record: unread,
			comparison
		}
	];
	const variantResults = [
		{
			variantType: 'intentional_404',
			requestedUrl: `${ORIGIN}/missing`,
			baselineUrl: `${ORIGIN}/missing`,
			record: unread
		}
	];
	const reports = buildAuditReports({
		inventory,
		records: [unread],
		graph,
		userAgentResults,
		variantResults,
		config: { origin: ORIGIN }
	});

	assert.equal(reports['URL_INVENTORY.csv'][0].raw_response_bytes, null);
	assert.equal(reports['URL_INVENTORY.csv'][0].raw_html_length_bytes, null);
	assert.equal(reports['URL_INVENTORY.csv'][0].approx_visible_words, null);
	assert.equal(reports['URL_INVENTORY.csv'][0].body_read_warning, unread.fetch.bodyReadWarning);
	assert.equal(
		reports['USER_AGENT_COMPARISON.csv'][0].body_read_warning,
		unread.fetch.bodyReadWarning
	);
	assert.equal(reports['USER_AGENT_COMPARISON.csv'][0].visible_words, null);
	assert.equal(reports['URL_VARIANTS.csv'][0].body_read_warning, unread.fetch.bodyReadWarning);
	assert.equal(reports['AUDIT_SUMMARY.json'].counts.responseBodyWarnings, 1);
	assert.match(
		reports['AUDIT_SUMMARY.json'].warnings.join('\n'),
		/PARTIAL_NON_2XX_RESPONSE_BODIES:1/
	);
});

test('writes every required CSV plus a JSON summary with stable headers and escaping', async (t) => {
	assert.equal(csvEscape('plain'), 'plain');
	assert.equal(csvEscape('comma,value'), '"comma,value"');
	assert.equal(csvEscape('say "hello"'), '"say ""hello"""');
	assert.equal(toCsv([{ a: 'x,y', b: true }], ['a', 'b']), 'a,b\n"x,y",true\n');

	const output = await temporaryDirectory(t);
	const inventory = createUrlInventory(
		[{ url: `${ORIGIN}/`, sourceType: 'main_sitemap', canonicalCandidate: true }],
		ORIGIN
	);
	const home = fakeCrawlRecord('/', { inventory: inventory.get(`${ORIGIN}/`) });
	const graph = computeInternalGraph([home], { origin: ORIGIN });
	applyIssueDetection([home], { origin: ORIGIN, graph });
	const reports = buildAuditReports({
		inventory,
		records: [home],
		graph,
		config: {
			origin: ORIGIN,
			concurrency: 4,
			requestsPerSecond: 2,
			timeoutMs: 20_000,
			maxUrls: 5_000,
			userAgentSampleSize: 60,
			renderMode: 'none',
			bundleWeightMode: 'off'
		},
		startedAt: '2026-08-06T00:00:00.000Z',
		completedAt: '2026-08-06T00:00:01.000Z'
	});
	const files = await writeAuditReports(output, reports);
	assert.equal(files.length, REPORT_FILES.length);
	for (const filename of REPORT_FILES) {
		const text = await fs.readFile(path.join(output, filename), 'utf8');
		assert.ok(text.length > 1, `${filename} should not be empty`);
	}
	const redirects = await fs.readFile(path.join(output, 'REDIRECTS.csv'), 'utf8');
	assert.match(redirects, /^requested_url,hop,from_url,status,/);
	const graphCsv = await fs.readFile(path.join(output, 'INTERNAL_LINK_GRAPH.csv'), 'utf8');
	assert.match(
		graphCsv,
		/^source_url,linked_url,normalized_linked_url,raw_href,target_url,target_resolved_via_alias,/
	);
	const depthCsv = await fs.readFile(path.join(output, 'CRAWL_DEPTH.csv'), 'utf8');
	assert.match(
		depthCsv,
		/^url,inbound_internal_link_count,outbound_internal_link_count,unique_source_pages,/
	);
	const inventoryCsv = await fs.readFile(path.join(output, 'URL_INVENTORY.csv'), 'utf8');
	assert.match(inventoryCsv.split('\n')[0], /raw_body_truncated,body_read_warning,render_status/);
	const userAgentCsv = await fs.readFile(path.join(output, 'USER_AGENT_COMPARISON.csv'), 'utf8');
	assert.match(userAgentCsv.split('\n')[0], /different_fields,body_read_warning,error$/);
	const variantsCsv = await fs.readFile(path.join(output, 'URL_VARIANTS.csv'), 'utf8');
	assert.match(variantsCsv.split('\n')[0], /consolidates_to_baseline,body_read_warning,error$/);
	const summary = JSON.parse(await fs.readFile(path.join(output, 'AUDIT_SUMMARY.json'), 'utf8'));
	assert.equal(summary.counts.crawledUrls, 1);
	assert.equal(summary.counts.serverHtmlFallbackGraphNodes, 1);
	assert.equal(summary.origin, ORIGIN);
});

test('runs the report pipeline end to end against an injected fixture fetcher only', async (t) => {
	const root = await temporaryDirectory(t);
	await fs.mkdir(path.join(root, 'src/routes/contact'), { recursive: true });
	await fs.writeFile(
		path.join(root, 'src/routes/contact/+page.svelte'),
		'<h1>Contact</h1>',
		'utf8'
	);
	const outputDirectory = path.join(root, 'reports');
	await fs.mkdir(outputDirectory, { recursive: true });
	await fs.writeFile(
		path.join(outputDirectory, 'TRAFFIC_BY_PAGE.csv'),
		'path,visitors\n/,12\n/contact,3\n',
		'utf8'
	);
	const mainSitemap = `<urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/contact</loc></url></urlset>`;
	const notesSitemap = '<urlset></urlset>';
	const rss = `<rss><channel><item><link>${ORIGIN}/contact</link></item></channel></rss>`;
	const responses = new Map([
		[`${ORIGIN}/sitemap.xml`, ['application/xml', mainSitemap]],
		[`${ORIGIN}/notes/sitemap.xml`, ['application/xml', notesSitemap]],
		[`${ORIGIN}/rss.xml`, ['application/rss+xml', rss]],
		[`${ORIGIN}/robots.txt`, ['text/plain', `User-agent: *\nAllow: /\n`]],
		[
			`${ORIGIN}/`,
			[
				'text/html; charset=utf-8',
				htmlPage('/', {
					body: '<p>Fixture homepage with sufficient principal content for the end-to-end report test.</p><a href="/contact">Contact</a>'
				})
			]
		],
		[`${ORIGIN}/blog`, ['text/html; charset=utf-8', htmlPage('/blog')]],
		[`${ORIGIN}/contact`, ['text/html; charset=utf-8', htmlPage('/contact')]]
	]);
	const calls = [];
	const fetchImpl = async (url, options) => {
		calls.push({ url: String(url), method: options.method });
		const fixture = responses.get(String(url));
		assert.ok(fixture, `unexpected fixture request: ${url}`);
		return new Response(fixture[1], {
			status: 200,
			headers: { 'content-type': fixture[0] }
		});
	};
	const fixedNow = new Date('2026-08-06T12:00:00.000Z');
	const result = await runAudit(
		{
			root,
			origin: ORIGIN,
			auditDate: '2026-08-06',
			outputDirectory,
			concurrency: 4,
			requestsPerSecond: 2,
			timeoutMs: 5_000,
			maxUrls: 50,
			runUserAgentSample: false,
			runVariants: false,
			renderMode: 'none',
			bundleWeightMode: 'off'
		},
		{
			fetchImpl,
			now: () => fixedNow,
			logProgress: false,
			requestGate: { wait: async () => {} }
		}
	);
	assert.equal(result.records.size, 3);
	assert.equal(result.reports['URL_INVENTORY.csv'].length, 3);
	assert.equal(result.reports['AUDIT_SUMMARY.json'].counts.crawledUrls, 3);
	assert.equal(result.reports['AUDIT_SUMMARY.json'].counts.trafficMatchedCanonicalUrls, 2);
	assert.equal(result.reports['AUDIT_SUMMARY.json'].inputEvidence.robots.status, 200);
	assert.equal(
		calls.every((call) => call.method === 'GET'),
		true
	);
	assert.deepEqual(
		[...new Set(calls.map((call) => call.url))].sort(),
		[...responses.keys()].sort()
	);
	for (const filename of REPORT_FILES) await fs.access(path.join(outputDirectory, filename));
});

test('CLI parser enforces the production crawl safety ceilings', () => {
	const now = new Date('2026-08-05T20:00:00.000Z');
	const parsed = parseArguments([], { root: 'C:/repo', now });
	assert.equal(parsed.auditDate, '2026-08-06');
	assert.equal(parsed.concurrency, 4);
	assert.equal(parsed.requestsPerSecond, 2);
	assert.equal(parsed.userAgentSampleSize, DEFAULT_USER_AGENT_SAMPLE_SIZE);
	assert.throws(() => parseArguments(['--concurrency', '5'], { now }), /1 to 4/);
	assert.throws(() => parseArguments(['--requests-per-second', '3'], { now }), /no more than 2/);
	assert.throws(() => parseArguments(['--ua-sample-size', '49'], { now }), /at least 50/);
	assert.equal(
		normalizeAuditUrl(`${ORIGIN}/blog/?utm_source=test&page=2#fragment`, ORIGIN),
		`${ORIGIN}/blog?page=2`
	);
	assert.equal(isAuditablePageUrl(`${ORIGIN}/notes/studio`, ORIGIN), false);
	assert.equal(isAuditablePageUrl(`${ORIGIN}/notes/studio/private`, ORIGIN), false);
	assert.equal(isAuditablePageUrl(`${ORIGIN}/notes/studio-ghibli`, ORIGIN), true);
	assert.equal(isAuditablePageUrl(`${ORIGIN}/notes/sign-in-to-life`, ORIGIN), true);
	assert.equal(isAuditablePageUrl(`${ORIGIN}/images?tab=photos`, ORIGIN), true);
	assert.equal(isAuditablePageUrl(`${ORIGIN}/images?tab=thumbnails&page=2`, ORIGIN), true);
	assert.equal(isAuditablePageUrl(`${ORIGIN}/images?tab=images`, ORIGIN), false);
	assert.equal(isAuditablePageUrl(`${ORIGIN}/images?tab=unknown`, ORIGIN), false);
	assert.equal(isAuditablePageUrl(`${ORIGIN}/images?tab=`, ORIGIN), false);
	assert.equal(isAuditablePageUrl(`${ORIGIN}/blog?tab=photos`, ORIGIN), false);
	assert.equal(isAuditablePageUrl(`${ORIGIN}/images?tab=photos&tab=thumbnails`, ORIGIN), false);
	assert.equal(isAuditablePageUrl(`${ORIGIN}/images?page=`, ORIGIN), false);
});
