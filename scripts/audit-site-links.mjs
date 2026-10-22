import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import {
	decodeHtmlEntities,
	discoverSourceUrls,
	parseTagAttributes,
	parseRssXml,
	parseSitemapXml
} from './audit-traffic-indexing.mjs';

export const SITE = 'https://www.suvroghosh.in';
const siteHosts = new Set(['www.suvroghosh.in', 'suvroghosh.in']);
const excludedPath =
	/^(?:\/api(?:\/|$)|\/_app(?:\/|$)|\/notes\/(?:studio|auth|sign-in|forgot-password|reset-password)(?:\/|$))/;

export function localPreviewOrigin(value) {
	const url = new URL(value);
	if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
		throw new Error('The comprehensive link audit requires an HTTP loopback production preview.');
	}
	return url.origin;
}

export function resolveLink(href, source = `${SITE}/`) {
	let url;
	try {
		url = new URL(href, source);
	} catch {
		return { kind: 'invalid', href };
	}
	if (!['http:', 'https:'].includes(url.protocol)) return { kind: 'special', href: url.href };
	if (!siteHosts.has(url.hostname)) return { kind: 'external', href: url.href };
	if (url.port || url.username || url.password) return { kind: 'invalid', href };
	url.protocol = 'https:';
	url.host = new URL(SITE).host;
	let fragment;
	let policyPath;
	try {
		fragment = decodeURIComponent(url.hash.slice(1));
		policyPath = decodeURIComponent(url.pathname)
			.replace(/\\/g, '/')
			.replace(/\/{2,}/g, '/')
			.toLowerCase();
	} catch {
		return { kind: 'invalid', href };
	}
	url.hash = '';
	url.searchParams.sort();
	return {
		kind: excludedPath.test(policyPath) ? 'excluded' : 'internal',
		url: url.href,
		fragment
	};
}

export function missingFragment(fragment, ids) {
	// Text-fragment directives are handled by the browser, rather than DOM IDs.
	const id = fragment.split(':~:text=')[0];
	return Boolean(id && id.toLowerCase() !== 'top' && !ids.includes(id));
}

/** Inspect actual opening tags rather than HTML-like strings in scripts/comments. */
export function inspectHtmlNavigation(html) {
	const ids = new Set();
	const links = [];
	const h1 = [];
	const rawTextTags = new Set([
		'script',
		'style',
		'title',
		'textarea',
		'xmp',
		'iframe',
		'noembed',
		'noframes'
	]);
	const normalizeText = (value) => decodeHtmlEntities(value).replace(/\s+/g, ' ').trim();
	let title = '';
	let baseHref;
	let cursor = 0;
	let templateDepth = 0;
	let currentAnchor;
	let heading;
	function text(value) {
		if (templateDepth) return;
		if (currentAnchor) currentAnchor.text += value;
		if (heading !== undefined) heading += value;
	}
	while (cursor < html.length) {
		const start = html.indexOf('<', cursor);
		if (start === -1) {
			text(html.slice(cursor));
			break;
		}
		text(html.slice(cursor, start));
		if (html.startsWith('<!--', start)) {
			const end = html.indexOf('-->', start + 4);
			cursor = end === -1 ? html.length : end + 3;
			continue;
		}
		const match = /^<(\/?)([a-z][\w:-]*)(?=[\s/>])/i.exec(html.slice(start));
		if (!match) {
			cursor = start + 1;
			continue;
		}
		let end = start + match[0].length;
		let quote = '';
		for (; end < html.length; end++) {
			const character = html[end];
			if (quote) {
				if (character === quote) quote = '';
			} else if (character === '"' || character === "'") quote = character;
			else if (character === '>') break;
		}
		if (end === html.length) break;
		cursor = end + 1;
		const tag = match[2].toLowerCase();
		if (match[1]) {
			if (tag === 'template') templateDepth = Math.max(0, templateDepth - 1);
			if (!templateDepth && tag === 'a') currentAnchor = undefined;
			if (!templateDepth && tag === 'h1' && heading !== undefined) {
				h1.push(normalizeText(heading));
				heading = undefined;
			}
			continue;
		}
		// Browsers keep the first duplicate attribute. The shared metadata helper
		// uses last-wins objects, so tokenize attributes separately here.
		const attributes = Object.create(null);
		for (const attribute of html
			.slice(start + match[0].length, end)
			.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g)) {
			for (const [key, value] of Object.entries(parseTagAttributes(attribute[0]))) {
				if (!(key in attributes)) attributes[key] = value;
			}
		}
		if (!templateDepth) {
			if (attributes.id !== undefined) ids.add(attributes.id);
			if (tag === 'a') {
				if (attributes.name !== undefined) ids.add(attributes.name);
				const href = attributes.href ?? attributes['xlink:href'];
				currentAnchor =
					href === undefined
						? undefined
						: { href, text: '', label: attributes['aria-label'] ?? '' };
				if (currentAnchor) links.push(currentAnchor);
			}
			if (tag === 'base' && attributes.href !== undefined && baseHref === undefined) {
				baseHref = attributes.href;
			}
			if (tag === 'h1') heading = '';
			if (tag === 'br') text(' ');
		}
		if (tag === 'template') templateDepth += 1;
		if (rawTextTags.has(tag)) {
			const closingTag = new RegExp(`</${tag}(?=[\\s/>])`, 'gi');
			closingTag.lastIndex = cursor;
			const closing = closingTag.exec(html)?.index ?? -1;
			const rawEnd = closing === -1 ? html.length : closing;
			if (!templateDepth && tag === 'title' && !title)
				title = normalizeText(html.slice(cursor, rawEnd));
			if (!['script', 'style', 'title'].includes(tag)) text(html.slice(cursor, rawEnd));
			cursor = rawEnd;
		}
	}
	if (heading !== undefined) h1.push(normalizeText(heading));
	return {
		ids: [...ids],
		links: links.map((link) => ({
			href: link.href,
			anchorText: normalizeText(link.text) || link.label
		})),
		baseHref,
		title,
		h1
	};
}

async function readHtml(response) {
	const reader = response.body?.getReader();
	if (!reader) return '';
	const chunks = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 16 * 1024 * 1024) throw new Error('HTML exceeds the 16 MiB audit limit.');
			chunks.push(value);
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
	return Buffer.concat(chunks).toString('utf8');
}

export async function auditSiteLinks({
	baseURL = 'http://127.0.0.1:4268',
	root = process.cwd(),
	maxUrls = 10000,
	concurrency = 4,
	output = path.join(root, '.codex-artifacts', 'site-links.json')
} = {}) {
	if (!Number.isSafeInteger(maxUrls) || maxUrls < 1)
		throw new Error('maxUrls must be a positive integer.');
	if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) {
		throw new Error('concurrency must be an integer between one and sixteen.');
	}
	const preview = localPreviewOrigin(baseURL);
	const queue = [];
	const references = new Map();
	const pages = new Map();
	const external = new Map();
	const exclusions = new Set();
	const issues = [];
	const fragments = [];
	let truncated = false;
	function enqueue(href, source, text = '', seed = false, base = source) {
		const link = resolveLink(href, base);
		if (link.kind === 'external') {
			const refs = external.get(link.href) ?? [];
			refs.push({ source, text });
			external.set(link.href, refs);
		} else if (link.kind === 'excluded') exclusions.add(link.url);
		else if (link.kind === 'invalid') issues.push({ type: 'invalid-url', source, href });
		else if (link.kind === 'internal') {
			if (link.fragment)
				fragments.push({ source, target: link.url, fragment: link.fragment, text });
			if (!references.has(link.url)) {
				if (references.size >= maxUrls) {
					truncated = true;
					return;
				}
				references.set(link.url, []);
				queue.push(link.url);
			}
			if (!seed) references.get(link.url)?.push({ source, href, text });
		}
	}
	async function fetchPage(url) {
		const chain = [];
		let current = url;
		let redirectFragment;
		try {
			for (let hop = 0; hop <= 8; hop++) {
				const local = new URL(current);
				const response = await fetch(`${preview}${local.pathname}${local.search}`, {
					redirect: 'manual',
					signal: AbortSignal.timeout(20000),
					headers: { 'user-agent': 'SuvroLocalLinkAudit/1.0', accept: 'text/html,*/*;q=0.8' }
				});
				const location = response.headers.get('location');
				if ([301, 302, 303, 307, 308].includes(response.status) && location) {
					await response.body?.cancel();
					const target = resolveLink(location, current);
					chain.push({ status: response.status, from: current, location });
					if (target.kind !== 'internal') {
						const targetUrl = target.url ?? target.href;
						pages.set(url, {
							url,
							status: response.status,
							redirects: chain,
							finalUrl: targetUrl,
							ids: []
						});
						if (target.kind !== 'external') {
							issues.push({
								type: `redirect-${target.kind}`,
								url,
								target: targetUrl,
								redirects: chain
							});
						}
						enqueue(location, current);
						return;
					}
					// An explicit fragment in Location replaces the original, including
					// a bare '#' which clears it; otherwise the browser inherits it.
					if (new URL(location, current).href.includes('#')) redirectFragment = target.fragment;
					if (target.url === url || chain.some((step) => step.from === target.url))
						throw new Error('Redirect loop.');
					current = target.url;
					continue;
				}
				const type = response.headers.get('content-type') ?? '';
				const sitemap = /(?:^|\/)sitemap\.xml$/i.test(new URL(url).pathname);
				const rss = /(?:^|\/)rss\.xml$/i.test(new URL(url).pathname);
				const record = {
					url,
					status: response.status,
					finalUrl: current,
					type,
					redirects: chain,
					...(redirectFragment === undefined ? {} : { redirectFragment }),
					ids: []
				};
				pages.set(url, record);
				if (!response.ok)
					issues.push({ type: 'http', url, status: response.status, finalUrl: current });
				if (response.ok && (sitemap || rss) && !/xml/i.test(type)) {
					issues.push({ type: 'content-type', url, expected: 'XML', actual: type });
				}
				if (type.includes('text/html')) {
					const html = await readHtml(response);
					const analysis = inspectHtmlNavigation(html);
					record.title = analysis.title;
					record.h1 = analysis.h1;
					record.ids = analysis.ids;
					if (
						response.ok &&
						/^(?:404|500|not found|page not found|internal error)\b/i.test(
							`${analysis.title} ${analysis.h1.join(' ')}`
						)
					) {
						issues.push({ type: 'soft-404', url, title: analysis.title, h1: analysis.h1 });
					}
					if (response.ok) {
						let base = current;
						if (analysis.baseHref !== undefined) {
							try {
								base = new URL(analysis.baseHref, current).href;
							} catch {
								issues.push({ type: 'invalid-base', source: current, href: analysis.baseHref });
							}
						}
						for (const link of analysis.links)
							enqueue(link.href, current, link.anchorText, false, base);
						if (redirectFragment) {
							fragments.push({
								source: url,
								target: url,
								fragment: redirectFragment,
								text: 'redirect destination'
							});
						}
					}
				} else if (/xml/i.test(type)) {
					const xml = await readHtml(response);
					const sitemapDocument = /<(?:urlset|sitemapindex)(?=[\s>])/i.test(xml);
					const rssDocument = /<(?:rss|feed)(?=[\s>])/i.test(xml);
					if (response.ok && ((sitemap && !sitemapDocument) || (rss && !rssDocument))) {
						issues.push({
							type: 'invalid-xml-document',
							url,
							expected: sitemap ? 'sitemap' : 'RSS'
						});
					}
					if (sitemapDocument) {
						for (const item of parseSitemapXml(xml, SITE)) enqueue(item.url, current, 'sitemap');
					} else if (rssDocument) {
						for (const href of parseRssXml(xml, current)) enqueue(href, current, 'RSS');
					}
				} else await response.body?.cancel();
				return;
			}
			throw new Error('More than eight redirects.');
		} catch (error) {
			pages.set(url, { url, status: 0, error: error.message, redirects: chain, ids: [] });
			issues.push({ type: 'fetch', url, error: error.message });
		}
	}
	const inventory = await discoverSourceUrls({ root });
	for (const record of inventory.records) {
		if (record.sourceType !== 'unpublished_post')
			enqueue(record.url, SITE, record.sourceType, true);
	}
	for (const href of ['/', '/sitemap.xml', '/notes/sitemap.xml', '/rss.xml'])
		enqueue(href, SITE, 'seed', true);
	let cursor = 0;
	while (cursor < queue.length) {
		const batch = queue.slice(cursor, cursor + concurrency);
		cursor += batch.length;
		await Promise.all(batch.map(fetchPage));
		if (cursor % 100 < concurrency)
			console.log(`Checked ${cursor}/${queue.length} local destinations; ${issues.length} issues.`);
	}
	const reportedFragments = new Set();
	for (const link of fragments) {
		const destination = pages.get(link.target);
		const fragment = destination?.redirectFragment ?? link.fragment;
		const key = JSON.stringify([link.source, destination?.finalUrl ?? link.target, fragment]);
		if (
			destination?.status === 200 &&
			destination.type?.includes('text/html') &&
			missingFragment(fragment, destination.ids) &&
			!reportedFragments.has(key)
		) {
			reportedFragments.add(key);
			issues.push({ type: 'fragment', ...link, target: destination.finalUrl, fragment });
		}
	}
	const report = {
		generatedAt: new Date().toISOString(),
		preview,
		complete: !truncated && inventory.warnings.length === 0,
		summary: {
			seedRecords: inventory.records.length,
			destinations: pages.size,
			htmlPages: [...pages.values()].filter((page) => page.type?.includes('text/html')).length,
			references: [...references.values()].reduce((sum, refs) => sum + refs.length, 0),
			fragmentReferences: fragments.length,
			externalDestinations: external.size,
			excludedDestinations: exclusions.size,
			issues: issues.length
		},
		warnings: inventory.warnings,
		issues,
		exclusions: [...exclusions].sort(),
		pages: [...pages.values()],
		references: Object.fromEntries(references),
		external: Object.fromEntries(external)
	};
	await fs.mkdir(path.dirname(output), { recursive: true });
	await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify(report.summary));
	console.log(`Report: ${output}`);
	return report;
}

async function main() {
	let server;
	try {
		if (!process.argv[2]) {
			server = spawn(
				process.execPath,
				[
					path.resolve('node_modules/vite/bin/vite.js'),
					'preview',
					'--host',
					'127.0.0.1',
					'--port',
					'4268',
					'--strictPort'
				],
				{ stdio: ['ignore', 'pipe', 'pipe'] }
			);
			let startup = '';
			server.stdout.on('data', (chunk) => {
				startup += chunk;
			});
			server.stderr.on('data', (chunk) => {
				startup += chunk;
			});
			let ready = false;
			for (let attempt = 0; attempt < 120; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 250));
				if (server.exitCode !== null) throw new Error(`Preview startup failed: ${startup}`);
				if (startup.includes('http://127.0.0.1:4268/')) {
					ready = true;
					break;
				}
			}
			if (!ready) throw new Error(`Preview startup timed out: ${startup}`);
		}
		const report = await auditSiteLinks({ baseURL: process.argv[2], output: process.argv[3] });
		if (!report.complete || report.issues.length) process.exitCode = 1;
	} finally {
		server?.kill();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
