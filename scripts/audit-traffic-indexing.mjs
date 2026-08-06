#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { parsePostFrontmatter } from './lib/post-metadata.mjs';

export const SITE_ORIGIN = 'https://www.suvroghosh.in';
export const DEFAULT_REQUESTS_PER_SECOND = 2;
export const MAX_REQUESTS_PER_SECOND = 2;
export const DEFAULT_CONCURRENCY = 4;
export const MAX_CONCURRENCY = 4;
export const DEFAULT_USER_AGENT_SAMPLE_SIZE = 60;
export const MIN_USER_AGENT_SAMPLE_SIZE = 50;
export const DEFAULT_TIMEOUT_MS = 20_000;
export const MIN_RENDER_NAVIGATION_TIMEOUT_MS = 120_000;
export const FETCH_RETRY_DELAYS_MS = Object.freeze([500, 1_500, 3_000, 5_000]);
export const MAX_FETCH_ATTEMPTS = FETCH_RETRY_DELAYS_MS.length + 1;
export const DEFAULT_MAX_URLS = 5_000;
export const DEFAULT_MAX_BODY_BYTES = 12 * 1024 * 1024;
export const BLOG_PAGE_SIZE = 12;

export const USER_AGENTS = Object.freeze({
	desktop:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
	mobile:
		'Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
	googlebot:
		'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
	bingbot:
		'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 Edg/131.0.0.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
	'oai-searchbot': 'OAI-SearchBot/1.0; +https://openai.com/searchbot',
	'chatgpt-user': 'ChatGPT-User/1.0; +https://openai.com/bot',
	'claude-searchbot': 'Claude-SearchBot/1.0; +https://anthropic.com/claude-searchbot',
	perplexitybot: 'PerplexityBot/1.0; +https://perplexity.ai/perplexitybot'
});

export const REPORT_FILES = Object.freeze([
	'URL_INVENTORY.csv',
	'INDEXABILITY.csv',
	'REDIRECTS.csv',
	'SITEMAP_RECONCILIATION.csv',
	'STRUCTURED_DATA.csv',
	'MEDIA_SEMANTICS.csv',
	'INTERNAL_LINK_GRAPH.csv',
	'ORPHANS.csv',
	'CRAWL_DEPTH.csv',
	'USER_AGENT_SAMPLE.csv',
	'USER_AGENT_COMPARISON.csv',
	'URL_VARIANTS.csv',
	'AUDIT_SUMMARY.json'
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const PAGE_EXTENSIONS = new Set(['', '.html', '.htm', '.php', '.asp', '.aspx']);
const IMAGE_GALLERY_CANONICAL_TABS = new Set(['photos', 'thumbnails']);
const PROTECTED_PATH_PREFIXES = [
	'/api/',
	'/notes/studio',
	'/notes/sign-in',
	'/notes/forgot-password',
	'/notes/reset-password'
];
const NON_PAGE_PATH_PREFIXES = ['/_app/', '/.well-known/'];
const EXCLUDED_PATH_PREFIXES = [...PROTECTED_PATH_PREFIXES, ...NON_PAGE_PATH_PREFIXES];
const SOURCE_RECORD_TYPES = new Set([
	'source',
	'post',
	'unpublished_post',
	'redirect_alias_source',
	'post_alias',
	'topic_alias',
	'tag_alias',
	'derived_archive',
	'derived_pagination',
	'derived_category',
	'derived_year_archive',
	'derived_month_archive',
	'derived_topic',
	'resource',
	'topic_headquarters',
	'static_route',
	'source_registry',
	'static_notebook',
	'notebook_source'
]);
const SOFT_404_PATTERN =
	/\b(?:404|page not found|not found|nothing (?:was )?found|does not exist|cannot be found|could not be found)\b/i;
const CHALLENGE_PATTERN =
	/\b(?:captcha|verify (?:that )?you are human|checking your browser|attention required|access denied|cloudflare ray id|unusual traffic|bot challenge)\b/i;
const CHALLENGE_PROVIDER_MARKUP_PATTERN =
	/(?:\/cdn-cgi\/challenge-platform\/|\b(?:id|class)\s*=\s*["'][^"']*(?:cf-chl|challenge-form|g-recaptcha|h-captcha)\b|\bcloudflare ray id\b)/i;
const TRACKING_PARAMETERS = new Set([
	'fbclid',
	'gclid',
	'msclkid',
	'ref',
	'source',
	'utm_campaign',
	'utm_content',
	'utm_medium',
	'utm_source',
	'utm_term'
]);
const FETCH_FAILURE_DETAIL_LIMIT = 5;
const DIAGNOSTIC_URL_LENGTH_LIMIT = 320;
const DIAGNOSTIC_ERROR_LENGTH_LIMIT = 240;
const SENSITIVE_DIAGNOSTIC_KEY =
	/(?:access[_-]?token|api[_-]?key|authorization|credential|password|passcode|secret|session(?:id)?|signature)/i;
const RETRYABLE_TRANSPORT_ERROR_CODE = new Set([
	'ECONNREFUSED',
	'ECONNRESET',
	'EHOSTUNREACH',
	'ENETRESET',
	'ENETUNREACH',
	'EPIPE',
	'ETIMEDOUT',
	'UND_ERR_BODY_TIMEOUT',
	'UND_ERR_CONNECT_TIMEOUT',
	'UND_ERR_HEADERS_TIMEOUT',
	'UND_ERR_SOCKET'
]);

function asArray(value) {
	return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function unique(values) {
	return [
		...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))
	];
}

function rounded(value, digits = 2) {
	if (!Number.isFinite(value)) return null;
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function toPosix(value) {
	return value.split(path.sep).join('/');
}

function relativeFile(root, file) {
	return toPosix(path.relative(root, file));
}

function normalizeWhitespace(value) {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim();
}

function boundedDiagnosticText(value, limit) {
	const redacted = String(value ?? '')
		.replace(/\p{Cc}/gu, ' ')
		.replace(/(\bbearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
		.replace(
			/(\b(?:access[_-]?token|api[_-]?key|authorization|credential|password|passcode|secret|session(?:id)?|signature)\s*[:=]\s*)[^\s&,;]+/gi,
			'$1[REDACTED]'
		);
	const normalized = normalizeWhitespace(redacted);
	return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

function sanitizedDiagnosticUrl(value) {
	try {
		const url = new URL(String(value));
		url.username = '';
		url.password = '';
		url.hash = '';
		for (const key of [...url.searchParams.keys()]) {
			if (SENSITIVE_DIAGNOSTIC_KEY.test(key)) url.searchParams.set(key, 'REDACTED');
		}
		return boundedDiagnosticText(url.href, DIAGNOSTIC_URL_LENGTH_LIMIT);
	} catch {
		return boundedDiagnosticText(value, DIAGNOSTIC_URL_LENGTH_LIMIT);
	}
}

export function formatFetchFailureDetails(failures) {
	const details = failures.slice(0, FETCH_FAILURE_DETAIL_LIMIT).map((failure) => {
		const detail = {};
		if (failure.userAgentKey !== undefined) {
			detail.userAgentKey = boundedDiagnosticText(failure.userAgentKey, 48).replace(
				/[^a-z0-9._-]/gi,
				'_'
			);
		}
		detail.requestedUrl = sanitizedDiagnosticUrl(failure.requestedUrl);
		detail.error = boundedDiagnosticText(
			failure.error || 'status_null_without_error',
			DIAGNOSTIC_ERROR_LENGTH_LIMIT
		);
		return detail;
	});
	const omitted = Math.max(0, failures.length - details.length);
	return `details=${JSON.stringify(details)}${
		omitted > 0 ? `; ${omitted} additional failure(s) omitted` : ''
	}`;
}

export function assertFetchCompleteness(label, results, { partialResult = 'result' } = {}) {
	const failures = results.filter((result) => result.error || result.status === null);
	if (failures.length === 0) return;
	throw new Error(
		`${label} had ${failures.length} fetch failure(s); retryable transport failures use at most ${MAX_FETCH_ATTEMPTS} attempts with ${FETCH_RETRY_DELAYS_MS.join('/')} ms backoffs; no partial ${partialResult} will be accepted. ${formatFetchFailureDetails(failures)}`
	);
}

function normalizeAnchorText(value) {
	return normalizeWhitespace(value).toLocaleLowerCase('en');
}

function isExplicitHubUrl(value, origin = SITE_ORIGIN) {
	let pathname;
	try {
		pathname = new URL(value, origin).pathname.replace(/\/+$/, '') || '/';
	} catch {
		return false;
	}
	if (
		new Set([
			'/',
			'/start-here',
			'/writing',
			'/blog',
			'/topics',
			'/projects',
			'/resume',
			'/consulting',
			'/healthcare-it-gulf',
			'/resources',
			'/blog/visualizations',
			'/blog/games'
		]).has(pathname)
	) {
		return true;
	}
	return /^\/(?:topics\/[^/]+|blog\/(?:topics(?:\/[^/]+)?|archive\/[^/]+(?:\/[^/]+)?|[^/]+))$/.test(
		pathname
	);
}

function topicClusterForRecord(record, url) {
	const strata = [...(record?.inventory?.strata ?? [])];
	const category = strata.find((value) => value.startsWith('category:'));
	if (category) return category;
	const pathname = (() => {
		try {
			return new URL(url).pathname;
		} catch {
			return '';
		}
	})();
	if (!pathname) return 'unclassified';
	const topic = pathname.match(/^\/topics\/([^/]+)\/?$/)?.[1];
	if (topic) return `topic:${decodeURIComponent(topic)}`;
	if (/^\/(?:resume|consulting|projects|healthcare-it-gulf|contact)(?:\/|$)/.test(pathname)) {
		return 'professional';
	}
	if (/^\/blog\/visualizations(?:\/|$)/.test(pathname)) return 'visualizations';
	if (/^\/blog\/games(?:\/|$)/.test(pathname)) return 'games';
	if (/^\/notes(?:\/|$)/.test(pathname)) return 'notes';
	if (/^\/resources(?:\/|$)/.test(pathname)) return 'resources';
	if (/^\/(?:blog|writing|start-here|topics)(?:\/|$)/.test(pathname)) return 'writing';
	return 'site-wide';
}

export function decodeHtmlEntities(value) {
	const named = {
		amp: '&',
		apos: "'",
		gt: '>',
		lt: '<',
		nbsp: ' ',
		quot: '"'
	};
	return String(value ?? '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token) => {
		if (token[0] !== '#') return named[token.toLowerCase()] ?? entity;
		const hexadecimal = token[1]?.toLowerCase() === 'x';
		const number = Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
		if (!Number.isFinite(number) || number < 0 || number > 0x10ffff) return entity;
		try {
			return String.fromCodePoint(number);
		} catch {
			return entity;
		}
	});
}

export function parseTagAttributes(source = '') {
	const attributes = {};
	const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
	for (const match of source.matchAll(pattern)) {
		const name = match[1].toLowerCase();
		if (name === '<' || name.startsWith('<')) continue;
		attributes[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '');
	}
	return attributes;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function openingTags(html, tagName) {
	const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b([^>]*)>`, 'gi');
	return Array.from(html.matchAll(pattern), (match) => ({
		attributes: parseTagAttributes(match[1]),
		index: match.index ?? 0,
		raw: match[0]
	}));
}

function pairedTags(html, tagName) {
	const pattern = new RegExp(
		`<${escapeRegExp(tagName)}\\b([^>]*)>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}\\s*>`,
		'gi'
	);
	return Array.from(html.matchAll(pattern), (match) => ({
		attributes: parseTagAttributes(match[1]),
		content: match[2],
		index: match.index ?? 0,
		raw: match[0]
	}));
}

export function stripMarkup(value) {
	return normalizeWhitespace(
		decodeHtmlEntities(
			String(value ?? '')
				.replace(/<!--[\s\S]*?-->/g, ' ')
				.replace(
					/<(?:script|style|template|svg|canvas)\b[^>]*>[\s\S]*?<\/(?:script|style|template|svg|canvas)\s*>/gi,
					' '
				)
				.replace(/<br\b[^>]*>/gi, ' ')
				.replace(/<\/(?:p|div|li|section|article|main|h[1-6]|tr|td|th)>/gi, ' ')
				.replace(/<[^>]+>/g, ' ')
		)
	);
}

export function countWords(value) {
	const normalized = normalizeWhitespace(value);
	if (!normalized) return 0;
	return normalized.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function bodyHtml(html) {
	return pairedTags(html, 'body')[0]?.content ?? html;
}

function headHtml(html) {
	return pairedTags(html, 'head')[0]?.content ?? html;
}

function resolveUrl(value, baseUrl, { keepHash = false } = {}) {
	if (!value) return '';
	try {
		const url = new URL(value, baseUrl);
		if (!keepHash) url.hash = '';
		return url.href;
	} catch {
		return '';
	}
}

export function normalizeAuditUrl(value, origin = SITE_ORIGIN, { keepQuery = true } = {}) {
	const url = new URL(value, `${origin}/`);
	url.username = '';
	url.password = '';
	url.hash = '';
	url.hostname = url.hostname.toLowerCase();
	if (
		(url.protocol === 'https:' && url.port === '443') ||
		(url.protocol === 'http:' && url.port === '80')
	) {
		url.port = '';
	}
	url.pathname = url.pathname.replace(/\/{2,}/g, '/');
	if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '');
	if (!keepQuery) url.search = '';
	for (const key of [...url.searchParams.keys()]) {
		if (TRACKING_PARAMETERS.has(key.toLowerCase())) url.searchParams.delete(key);
	}
	url.searchParams.sort();
	return url.href;
}

function exactAuditUrlIdentity(value, origin = SITE_ORIGIN) {
	const url = new URL(value, `${origin}/`);
	url.username = '';
	url.password = '';
	url.hash = '';
	url.hostname = url.hostname.toLowerCase();
	if (
		(url.protocol === 'https:' && url.port === '443') ||
		(url.protocol === 'http:' && url.port === '80')
	) {
		url.port = '';
	}
	return url.href;
}

function sameSiteHost(left, right) {
	const normalize = (hostname) => hostname.toLowerCase().replace(/^www\./, '');
	return normalize(left) === normalize(right);
}

function normalizedPolicyPath(url) {
	try {
		return decodeURIComponent(url.pathname)
			.replace(/\\/g, '/')
			.replace(/\/{2,}/g, '/')
			.toLowerCase();
	} catch {
		return null;
	}
}

function pathMatchesPrefix(pathname, prefix) {
	const boundary = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
	return pathname === boundary || pathname.startsWith(`${boundary}/`);
}

export function isPublicAuditTarget(value, origin = SITE_ORIGIN) {
	let url;
	try {
		url = new URL(value, `${origin}/`);
	} catch {
		return false;
	}
	const expected = new URL(origin);
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		!sameSiteHost(url.hostname, expected.hostname) ||
		url.port !== expected.port ||
		url.username ||
		url.password
	) {
		return false;
	}
	const policyPath = normalizedPolicyPath(url);
	if (!policyPath) return false;
	return !PROTECTED_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(policyPath, prefix));
}

export function isAuditablePageUrl(value, origin = SITE_ORIGIN) {
	let url;
	try {
		url = new URL(value, `${origin}/`);
	} catch {
		return false;
	}
	if (!isPublicAuditTarget(url.href, origin)) return false;
	const lowerPath = normalizedPolicyPath(url);
	if (!lowerPath || EXCLUDED_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(lowerPath, prefix)))
		return false;
	if (/\/(?:sitemap|rss)(?:\.xml)?$/i.test(lowerPath)) return false;
	if (/\/[a-z0-9-]{8,128}\.txt$/i.test(lowerPath)) return false;
	const extension = path.posix.extname(lowerPath);
	if (!PAGE_EXTENSIONS.has(extension)) return false;
	const queryPolicyPath = lowerPath === '/' ? lowerPath : lowerPath.replace(/\/+$/, '');
	const allowedQueryKeys =
		queryPolicyPath === '/images' ? new Set(['page', 'tab']) : new Set(['page']);
	const queryKeys = [...url.searchParams.keys()];
	if (queryKeys.some((key) => !allowedQueryKeys.has(key))) return false;
	const pages = url.searchParams.getAll('page');
	if (pages.length > 1) return false;
	if (pages.length === 1 && !/^[1-9]\d*$/.test(pages[0])) return false;
	const tabs = url.searchParams.getAll('tab');
	if (tabs.length > 1) return false;
	if (tabs.length === 1 && !IMAGE_GALLERY_CANONICAL_TABS.has(tabs[0])) return false;
	return true;
}

export function hasSourceRecord(sources) {
	return [...sources].some((source) => SOURCE_RECORD_TYPES.has(source));
}

export function parseSitemapXml(xml, baseUrl = SITE_ORIGIN) {
	const xmlText = (value) => {
		const unwrapped = String(value ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, '$1');
		return decodeHtmlEntities(stripMarkup(unwrapped));
	};
	const entries = [];
	for (const match of String(xml ?? '').matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
		const location = match[1].match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i);
		if (!location) continue;
		const url = resolveUrl(xmlText(location[1]), baseUrl);
		if (!url) continue;
		const lastModified = match[1].match(/<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i);
		entries.push({
			url,
			lastModified: lastModified ? xmlText(lastModified[1]) : ''
		});
	}
	for (const match of String(xml ?? '').matchAll(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi)) {
		const location = match[1].match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i);
		if (!location) continue;
		const url = resolveUrl(xmlText(location[1]), baseUrl);
		if (!url) continue;
		const lastModified = match[1].match(/<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i);
		entries.push({
			url,
			lastModified: lastModified ? xmlText(lastModified[1]) : '',
			isSitemapIndexEntry: true
		});
	}
	return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}

export function parseRssXml(xml, baseUrl = SITE_ORIGIN) {
	const urls = [];
	for (const item of String(xml ?? '').matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
		const link = item[1].match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
		if (link) {
			const linkText = String(link[1] ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, '$1');
			const url = resolveUrl(decodeHtmlEntities(stripMarkup(linkText)), baseUrl);
			if (url) urls.push(url);
		}
	}
	return unique(urls);
}

export function slugifyCategory(category = 'uncategorized') {
	return String(category)
		.toLowerCase()
		.trim()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function slugifyTopic(value = '') {
	return String(value)
		.normalize('NFKC')
		.toLocaleLowerCase('en')
		.replace(/&/g, ' and ')
		.replace(/[’']/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-|-$/g, '');
}

function canonicalTopicSlug(value) {
	const aliases = new Map([
		['artificial-intelligence', 'ai'],
		['book', 'books'],
		['kolkata', 'calcutta'],
		['write', 'writing']
	]);
	const slug = slugifyTopic(value);
	return aliases.get(slug) ?? slug;
}

async function walkFiles(directory) {
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error?.code === 'ENOENT') return [];
		throw error;
	}
	const files = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walkFiles(file)));
		else files.push(file);
	}
	return files;
}

function addSourceRecord(records, origin, pathname, details = {}) {
	let url;
	try {
		url = normalizeAuditUrl(pathname, origin);
	} catch {
		return;
	}
	if (!isAuditablePageUrl(url, origin)) return;
	records.push({
		url,
		sourceType: details.sourceType ?? 'source',
		sourceFile: details.sourceFile ?? '',
		lastModified: details.lastModified ?? '',
		canonicalCandidate: details.canonicalCandidate !== false,
		strata: unique(asArray(details.strata)),
		metadata: details.metadata ?? {}
	});
}

function aliasBlockFromSource(source) {
	return source.match(/export const postPathAliases[\s\S]*?=\s*\{([\s\S]*?)\};/)?.[1] ?? '';
}

export function parsePostRedirectAliases(source, origin = SITE_ORIGIN) {
	const aliases = [];
	for (const match of aliasBlockFromSource(source).matchAll(
		/["']([^"']+)["']\s*:\s*["']([^"']+)["']/g
	)) {
		aliases.push({
			source: normalizeAuditUrl(`/blog/${match[1]}`, origin),
			destination: normalizeAuditUrl(match[2], origin),
			type: 'post_alias'
		});
	}
	return aliases;
}

export function parsePromotedTopicAliases(source, origin = SITE_ORIGIN) {
	const block = source.match(
		/export const PROMOTED_TOPIC_TAGS\s*=\s*\{([\s\S]*?)\}\s*as const/
	)?.[1];
	if (!block) return [];
	const aliases = [];
	const propertyPattern = /(?:["']([^"']+)["']|([A-Za-z_$][\w$-]*))\s*:\s*["']([^"']+)["']/g;
	for (const match of block.matchAll(propertyPattern)) {
		const sourceSlug = match[1] ?? match[2];
		const destinationSlug = match[3];
		for (const prefix of ['/tags/', '/blog/topics/']) {
			aliases.push({
				source: normalizeAuditUrl(`${prefix}${encodeURIComponent(sourceSlug)}`, origin),
				destination: normalizeAuditUrl(`/topics/${encodeURIComponent(destinationSlug)}`, origin),
				type: prefix === '/tags/' ? 'tag_alias' : 'topic_alias'
			});
		}
	}
	return aliases;
}

function frontmatterRecord(text, sourceFile, warnings) {
	try {
		return parsePostFrontmatter(text, sourceFile);
	} catch (error) {
		warnings.push(error instanceof Error ? error.message : `${sourceFile}: invalid frontmatter.`);
		return null;
	}
}

function strataForPost(metadata, text) {
	const category = slugifyCategory(metadata.category);
	const strata = ['post', `category:${category}`];
	if (
		metadata.interactiveFirst === true ||
		category === 'visualizations' ||
		/\$lib\/components\/visualizations|<(?:BrownianMotionLab|DoublePendulum|GradientDescent|FractalAtlas|NeuronZoo|MonteCarlo|LivingPigment|DomainColoring)/i.test(
			text
		)
	) {
		strata.push('visualization');
	}
	if (/health|medical|clinical|fhir|hl7/i.test(`${category} ${metadata.title ?? ''}`)) {
		strata.push('healthcare');
	}
	if (
		/science|mathematics|statistics|physics|chemistry|biology|computer-science|visualizations/i.test(
			`${category} ${metadata.title ?? ''}`
		)
	) {
		strata.push('science_math');
	}
	if (/essay|satire|fiction|personal|memoir|monologue/i.test(category)) strata.push('essay_satire');
	if (/\.(?:mp4|webm|mov)|<video|youtube\.com|youtu\.be|vimeo\.com/i.test(text)) {
		strata.push('video');
	}
	const imageCount = (text.match(/!\[[^\]]*\]\([^)]*\)|<img\b/gi) ?? []).length;
	if (imageCount >= 4) strata.push('image_heavy');
	return strata;
}

function routePathFromDirectory(routesDirectory, directory) {
	const segments = toPosix(path.relative(routesDirectory, directory))
		.split('/')
		.filter((segment) => segment && !/^\(.*\)$/.test(segment));
	if (segments.some((segment) => segment.startsWith('['))) return '';
	return segments.length ? `/${segments.join('/')}` : '/';
}

function paginationPaths(basePath, count, pageSize = BLOG_PAGE_SIZE) {
	const totalPages = Math.ceil(count / pageSize);
	return Array.from(
		{ length: Math.max(0, totalPages - 1) },
		(_, index) => `${basePath}?page=${index + 2}`
	);
}

export async function discoverSourceUrls({ root = process.cwd(), origin = SITE_ORIGIN } = {}) {
	const records = [];
	const warnings = [];
	const aliases = [];
	const postRecords = [];
	const postsDirectory = path.join(root, 'src', 'lib', 'posts');
	const postHelpersFile = path.join(root, 'src', 'lib', 'content', 'posts.ts');
	try {
		const postHelpers = await fs.readFile(postHelpersFile, 'utf8');
		aliases.push(...parsePostRedirectAliases(postHelpers, origin));
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
		warnings.push(`${relativeFile(root, postHelpersFile)}: redirect alias registry was not found.`);
	}
	const aliasSources = new Set(aliases.map((alias) => alias.source));
	const aliasSourceSlugs = new Set(
		aliases.map((alias) =>
			decodeURIComponent(new URL(alias.source).pathname.split('/').at(-1) ?? '')
		)
	);

	for (const file of (await walkFiles(postsDirectory)).filter((candidate) =>
		candidate.endsWith('.md')
	)) {
		const sourceFile = relativeFile(root, file);
		const text = await fs.readFile(file, 'utf8');
		const metadata = frontmatterRecord(text, sourceFile, warnings);
		if (!metadata) continue;
		const slug = path.basename(file, '.md');
		const publicPath = `/blog/${slugifyCategory(metadata.category)}/${encodeURIComponent(slug)}`;
		const url = normalizeAuditUrl(publicPath, origin);
		const isAliasSource = aliasSources.has(url) || aliasSourceSlugs.has(slug);
		if (metadata.published === false) {
			records.push({
				url,
				sourceType: 'unpublished_post',
				sourceFile,
				lastModified: metadata.dateModified ?? metadata.date ?? '',
				canonicalCandidate: false,
				strata: ['unpublished'],
				metadata: { ...metadata, slug }
			});
			continue;
		}
		const sourceRecord = {
			url,
			sourceType: isAliasSource ? 'redirect_alias_source' : 'post',
			sourceFile,
			lastModified: metadata.dateModified ?? metadata.date ?? '',
			canonicalCandidate: !isAliasSource,
			strata: strataForPost(metadata, text),
			metadata: { ...metadata, slug }
		};
		records.push(sourceRecord);
		postRecords.push(sourceRecord);
	}

	for (const alias of aliases) {
		addSourceRecord(records, origin, alias.source, {
			sourceType: alias.type,
			sourceFile: relativeFile(root, postHelpersFile),
			canonicalCandidate: false,
			strata: ['redirect'],
			metadata: { redirectDestination: alias.destination }
		});
	}

	const categoryCounts = new Map();
	const yearCounts = new Map();
	const monthCounts = new Map();
	const topicCounts = new Map();
	for (const post of postRecords.filter((record) => record.canonicalCandidate)) {
		const category = slugifyCategory(post.metadata.category);
		categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
		const date = String(post.metadata.date ?? '');
		const year = /^\d{4}/.exec(date)?.[0];
		const month = /^\d{4}-(\d{2})/.exec(date)?.[1];
		if (year) yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
		if (year && month)
			monthCounts.set(`${year}/${month}`, (monthCounts.get(`${year}/${month}`) ?? 0) + 1);
		for (const rawTopic of [...asArray(post.metadata.tags), ...asArray(post.metadata.series)]) {
			const topic = canonicalTopicSlug(rawTopic);
			if (!topic || ['maybe', 'somebody', 'suvro-ghosh', 'suvroghosh'].includes(topic)) continue;
			const accumulator = topicCounts.get(topic) ?? { count: 0, categories: new Set() };
			accumulator.count += 1;
			accumulator.categories.add(category);
			topicCounts.set(topic, accumulator);
		}
	}
	addSourceRecord(records, origin, '/blog', {
		sourceType: 'derived_archive',
		sourceFile: 'src/lib/content/pagination.ts',
		strata: ['writing_hub']
	});
	for (const pagePath of paginationPaths(
		'/blog',
		postRecords.filter((post) => post.canonicalCandidate).length
	)) {
		addSourceRecord(records, origin, pagePath, {
			sourceType: 'derived_pagination',
			sourceFile: 'src/lib/content/pagination.ts',
			strata: ['pagination']
		});
	}
	for (const [category, count] of [...categoryCounts].sort()) {
		const basePath = `/blog/${category}`;
		addSourceRecord(records, origin, basePath, {
			sourceType: 'derived_category',
			sourceFile: 'src/lib/posts',
			strata: ['category']
		});
		for (const pagePath of paginationPaths(basePath, count)) {
			addSourceRecord(records, origin, pagePath, {
				sourceType: 'derived_pagination',
				sourceFile: 'src/lib/content/pagination.ts',
				strata: ['category', 'pagination']
			});
		}
	}
	for (const [year, count] of [...yearCounts].sort()) {
		const basePath = `/blog/archive/${year}`;
		addSourceRecord(records, origin, basePath, {
			sourceType: 'derived_year_archive',
			sourceFile: 'src/lib/posts',
			strata: ['archive']
		});
		for (const pagePath of paginationPaths(basePath, count)) {
			addSourceRecord(records, origin, pagePath, {
				sourceType: 'derived_pagination',
				sourceFile: 'src/lib/content/pagination.ts',
				strata: ['archive', 'pagination']
			});
		}
	}
	for (const [yearMonth, count] of [...monthCounts].sort()) {
		const basePath = `/blog/archive/${yearMonth}`;
		addSourceRecord(records, origin, basePath, {
			sourceType: 'derived_month_archive',
			sourceFile: 'src/lib/posts',
			strata: ['archive']
		});
		for (const pagePath of paginationPaths(basePath, count)) {
			addSourceRecord(records, origin, pagePath, {
				sourceType: 'derived_pagination',
				sourceFile: 'src/lib/content/pagination.ts',
				strata: ['archive', 'pagination']
			});
		}
	}

	let promotedTopicAliases = [];
	const topicsHelperFile = path.join(root, 'src', 'lib', 'content', 'topics.ts');
	try {
		const topicHelpers = await fs.readFile(topicsHelperFile, 'utf8');
		promotedTopicAliases = parsePromotedTopicAliases(topicHelpers, origin);
		aliases.push(...promotedTopicAliases);
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
	}
	const promotedLegacyTopicPaths = new Set(
		promotedTopicAliases
			.filter((alias) => alias.type === 'topic_alias')
			.map((alias) => normalizeAuditUrl(alias.source, origin))
	);
	for (const alias of promotedTopicAliases) {
		addSourceRecord(records, origin, alias.source, {
			sourceType: alias.type,
			sourceFile: relativeFile(root, topicsHelperFile),
			canonicalCandidate: false,
			strata: ['redirect'],
			metadata: { redirectDestination: alias.destination }
		});
	}
	for (const [topic, accumulator] of [...topicCounts].sort()) {
		if (
			accumulator.count < 8 ||
			accumulator.categories.size < 2 ||
			promotedLegacyTopicPaths.has(
				normalizeAuditUrl(`/blog/topics/${encodeURIComponent(topic)}`, origin)
			)
		) {
			continue;
		}
		const basePath = `/blog/topics/${encodeURIComponent(topic)}`;
		addSourceRecord(records, origin, basePath, {
			sourceType: 'derived_topic',
			sourceFile: 'src/lib/posts',
			strata: ['topic']
		});
		for (const pagePath of paginationPaths(basePath, accumulator.count)) {
			addSourceRecord(records, origin, pagePath, {
				sourceType: 'derived_pagination',
				sourceFile: 'src/lib/content/pagination.ts',
				strata: ['topic', 'pagination']
			});
		}
	}

	for (const [directoryName, segment] of [
		['prompts', 'prompts'],
		['lists', 'lists']
	]) {
		const directory = path.join(root, 'src', 'lib', directoryName);
		for (const file of (await walkFiles(directory)).filter((candidate) =>
			candidate.endsWith('.md')
		)) {
			const sourceFile = relativeFile(root, file);
			const text = await fs.readFile(file, 'utf8');
			const metadata = frontmatterRecord(text, sourceFile, warnings);
			if (!metadata || metadata.published === false) continue;
			addSourceRecord(
				records,
				origin,
				`/resources/${segment}/${encodeURIComponent(path.basename(file, '.md'))}`,
				{
					sourceType: 'resource',
					sourceFile,
					lastModified: metadata.dateModified ?? metadata.date ?? '',
					strata: ['resource'],
					metadata
				}
			);
		}
	}

	const topicDirectory = path.join(root, 'src', 'lib', 'topics');
	for (const file of (await walkFiles(topicDirectory)).filter(
		(candidate) =>
			candidate.endsWith('.md') && path.basename(candidate).toLowerCase() !== 'readme.md'
	)) {
		const sourceFile = relativeFile(root, file);
		const text = await fs.readFile(file, 'utf8');
		const metadata = frontmatterRecord(text, sourceFile, warnings);
		if (!metadata) continue;
		const slug = metadata.slug ?? path.basename(file, '.md');
		addSourceRecord(records, origin, `/topics/${encodeURIComponent(slug)}`, {
			sourceType: 'topic_headquarters',
			sourceFile,
			lastModified: metadata.dateModified ?? metadata.date ?? '',
			strata: ['topic_headquarters'],
			metadata
		});
	}

	const routesDirectory = path.join(root, 'src', 'routes');
	const routeDirectories = new Set();
	for (const file of await walkFiles(routesDirectory)) {
		if (/^\+page(?:\.server)?\.(?:js|ts|svelte)$/.test(path.basename(file))) {
			routeDirectories.add(path.dirname(file));
		}
	}
	for (const directory of [...routeDirectories].sort()) {
		const routePath = routePathFromDirectory(routesDirectory, directory);
		if (!routePath) continue;
		addSourceRecord(records, origin, routePath, {
			sourceType: 'static_route',
			sourceFile: relativeFile(root, directory),
			strata:
				routePath === '/'
					? ['homepage']
					: routePath === '/resume'
						? ['resume']
						: routePath === '/consulting'
							? ['consulting']
							: routePath === '/contact'
								? ['contact']
								: routePath === '/writing' || routePath === '/blog'
									? ['writing_hub']
									: routePath === '/images' || routePath.startsWith('/images/')
										? ['image_heavy']
										: []
		});
	}

	const staticNotebooksDirectory = path.join(root, 'static', 'notebooks');
	const notebookSourcesDirectory = path.join(root, 'src', 'lib', 'notebooks');
	for (const file of (await walkFiles(staticNotebooksDirectory)).filter(
		(candidate) =>
			path.dirname(candidate) === staticNotebooksDirectory &&
			candidate.toLowerCase().endsWith('.html')
	)) {
		const filename = path.basename(file);
		const publicPath = `/notebooks/${encodeURIComponent(filename)}`;
		addSourceRecord(records, origin, publicPath, {
			sourceType: 'static_notebook',
			sourceFile: relativeFile(root, file),
			strata: ['notebook']
		});
	}
	for (const file of (await walkFiles(notebookSourcesDirectory)).filter(
		(candidate) =>
			path.dirname(candidate) === notebookSourcesDirectory &&
			candidate.toLowerCase().endsWith('.ipynb')
	)) {
		addSourceRecord(
			records,
			origin,
			`/notebooks/${encodeURIComponent(`${path.basename(file, '.ipynb')}.html`)}`,
			{
				sourceType: 'notebook_source',
				sourceFile: relativeFile(root, file),
				strata: ['notebook']
			}
		);
	}

	const registryFiles = [
		path.join(root, 'src', 'lib', 'content', 'site-resources.ts'),
		path.join(root, 'src', 'lib', 'content', 'professional-projects.ts'),
		path.join(root, 'src', 'lib', 'content', 'reading-paths.ts'),
		path.join(root, 'src', 'lib', 'games', 'catalog.ts')
	];
	for (const file of registryFiles) {
		let text;
		try {
			text = await fs.readFile(file, 'utf8');
		} catch (error) {
			if (error?.code === 'ENOENT') continue;
			throw error;
		}
		for (const match of text.matchAll(/\b(?:href|path|url)\s*:\s*["'](\/[^"']*)["']/g)) {
			addSourceRecord(records, origin, match[1], {
				sourceType: 'source_registry',
				sourceFile: relativeFile(root, file)
			});
		}
	}

	return { records, aliases, warnings };
}

export function createUrlInventory(records = [], origin = SITE_ORIGIN) {
	const inventory = new Map();
	for (const record of records) {
		let url;
		try {
			url = normalizeAuditUrl(record.url, origin);
		} catch {
			continue;
		}
		const current = inventory.get(url) ?? {
			url,
			sources: new Set(),
			sourceFiles: new Set(),
			lastModified: new Set(),
			strata: new Set(),
			canonicalCandidate: false,
			metadata: []
		};
		if (record.sourceType) current.sources.add(record.sourceType);
		if (record.sourceFile) current.sourceFiles.add(record.sourceFile);
		if (record.lastModified) current.lastModified.add(record.lastModified);
		for (const stratum of asArray(record.strata)) current.strata.add(stratum);
		current.canonicalCandidate ||= record.canonicalCandidate !== false;
		if (record.metadata && Object.keys(record.metadata).length)
			current.metadata.push(record.metadata);
		inventory.set(url, current);
	}
	return inventory;
}

export function mergeInventoryRecord(inventory, record, origin = SITE_ORIGIN) {
	const addition = createUrlInventory([record], origin);
	for (const [url, incoming] of addition) {
		const current = inventory.get(url);
		if (!current) {
			inventory.set(url, incoming);
			continue;
		}
		for (const source of incoming.sources) current.sources.add(source);
		for (const file of incoming.sourceFiles) current.sourceFiles.add(file);
		for (const date of incoming.lastModified) current.lastModified.add(date);
		for (const stratum of incoming.strata) current.strata.add(stratum);
		current.canonicalCandidate ||= incoming.canonicalCandidate;
		current.metadata.push(...incoming.metadata);
	}
	return inventory;
}

export function createRateGate({
	requestsPerSecond = DEFAULT_REQUESTS_PER_SECOND,
	now = () => performance.now(),
	sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
} = {}) {
	if (!(requestsPerSecond > 0) || requestsPerSecond > MAX_REQUESTS_PER_SECOND) {
		throw new Error(
			`requestsPerSecond must be greater than zero and no more than ${MAX_REQUESTS_PER_SECOND}.`
		);
	}
	const interval = 1000 / requestsPerSecond;
	let nextStart = 0;
	let gate = Promise.resolve();
	return {
		async wait() {
			const turn = gate.then(async () => {
				const delay = Math.max(0, nextStart - now());
				if (delay > 0) await sleep(delay);
				const startedAt = now();
				nextStart = Math.max(nextStart + interval, startedAt + interval);
			});
			gate = turn.catch(() => {});
			await turn;
		}
	};
}

export async function mapConcurrent(items, concurrency, worker) {
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
		throw new Error(`concurrency must be an integer from 1 to ${MAX_CONCURRENCY}.`);
	}
	const results = new Array(items.length);
	let cursor = 0;
	async function runWorker() {
		while (true) {
			const index = cursor;
			cursor += 1;
			if (index >= items.length) return;
			results[index] = await worker(items[index], index);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
	return results;
}

export function createSemaphore(limit = MAX_CONCURRENCY) {
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CONCURRENCY) {
		throw new Error(`semaphore limit must be an integer from 1 to ${MAX_CONCURRENCY}.`);
	}
	let active = 0;
	const waiting = [];
	const release = () => {
		active -= 1;
		const next = waiting.shift();
		if (next) next();
	};
	const acquire = async () => {
		if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
		active += 1;
	};
	return {
		async run(operation) {
			await acquire();
			try {
				return await operation();
			} finally {
				release();
			}
		}
	};
}

function responseHeaders(response) {
	const headers = {};
	for (const [name, value] of response.headers.entries()) headers[name.toLowerCase()] = value;
	return headers;
}

async function responseTextWithLimit(response, maxBodyBytes) {
	const buffer = new Uint8Array(await response.arrayBuffer());
	const truncated = buffer.byteLength > maxBodyBytes;
	const body = new TextDecoder('utf-8', { fatal: false }).decode(
		truncated ? buffer.slice(0, maxBodyBytes) : buffer
	);
	return { body, bytes: buffer.byteLength, truncated };
}

function transportErrorChain(error) {
	const chain = [];
	let current = error;
	for (let depth = 0; current && depth < 4; depth += 1) {
		chain.push({
			name: current.name ?? '',
			message: current.message ?? String(current),
			code: current.code ?? ''
		});
		current = current.cause;
	}
	return chain;
}

function retryableResponseBodyTransportError(error, signal) {
	if (
		signal.aborted &&
		transportErrorChain(signal.reason).some(({ message }) => /request_timeout/i.test(message))
	) {
		return true;
	}
	return transportErrorChain(error).some(
		({ name, message, code }) =>
			name === 'AbortError' ||
			RETRYABLE_TRANSPORT_ERROR_CODE.has(String(code).toUpperCase()) ||
			/\b(?:fetch failed|network error|socket hang up|connection reset|other side closed)\b/i.test(
				message
			)
	);
}

function allowedFetchTarget(value, origin, { allowApex = true } = {}) {
	let url;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	const expected = new URL(origin);
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		url.port !== expected.port ||
		url.username ||
		url.password
	)
		return false;
	return allowApex
		? sameSiteHost(url.hostname, expected.hostname)
		: url.hostname === expected.hostname;
}

export async function fetchWithRedirects(
	requestedUrl,
	{
		fetchImpl = fetch,
		gate = null,
		origin = SITE_ORIGIN,
		userAgent = USER_AGENTS.desktop,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		maxRedirects = 10,
		maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
		method = 'GET',
		accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5',
		allowApex = true,
		targetPolicy = isPublicAuditTarget,
		retrySleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
	} = {}
) {
	let currentUrl = new URL(requestedUrl, `${origin}/`).href;
	const originalUrl = currentUrl;
	const redirects = [];
	const chain = [currentUrl];
	const seen = new Set();
	const totalStartedAt = performance.now();
	let lastStatus = null;
	let lastHeaders = {};

	redirectLoop: for (let hop = 0; hop <= maxRedirects; hop += 1) {
		if (!allowedFetchTarget(currentUrl, origin, { allowApex })) {
			return {
				requestedUrl: originalUrl,
				finalUrl: chain.at(-2) ?? originalUrl,
				redirectChain: chain,
				redirects,
				status: lastStatus,
				headers: lastHeaders,
				contentType: lastHeaders['content-type'] ?? '',
				body: '',
				rawBytes: 0,
				bodyTruncated: false,
				totalMs: rounded(performance.now() - totalStartedAt),
				error: `redirect_outside_audit_origin:${currentUrl}`
			};
		}
		if (targetPolicy && !targetPolicy(currentUrl, origin)) {
			return {
				requestedUrl: originalUrl,
				finalUrl: chain.at(-2) ?? originalUrl,
				redirectChain: chain.length > 1 ? chain.slice(0, -1) : [],
				redirects,
				status: lastStatus,
				headers: lastHeaders,
				contentType: lastHeaders['content-type'] ?? '',
				body: '',
				rawBytes: 0,
				bodyTruncated: false,
				totalMs: rounded(performance.now() - totalStartedAt),
				error: 'target_blocked_by_audit_policy'
			};
		}
		if (seen.has(currentUrl)) {
			return {
				requestedUrl: originalUrl,
				finalUrl: currentUrl,
				redirectChain: chain,
				redirects,
				status: lastStatus,
				headers: lastHeaders,
				contentType: lastHeaders['content-type'] ?? '',
				body: '',
				rawBytes: 0,
				bodyTruncated: false,
				totalMs: rounded(performance.now() - totalStartedAt),
				error: 'redirect_loop'
			};
		}
		seen.add(currentUrl);
		for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
			if (attempt > 0) await retrySleep(FETCH_RETRY_DELAYS_MS[attempt - 1]);
			if (gate) await gate.wait();
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(new Error('request_timeout')), timeoutMs);
			const hopStartedAt = performance.now();
			let response;
			try {
				response = await fetchImpl(currentUrl, {
					method,
					redirect: 'manual',
					signal: controller.signal,
					headers: {
						accept,
						'accept-language': 'en-GB,en;q=0.9',
						'cache-control': 'no-cache',
						pragma: 'no-cache',
						'user-agent': userAgent
					}
				});
			} catch (error) {
				clearTimeout(timer);
				if (attempt + 1 < MAX_FETCH_ATTEMPTS) continue;
				return {
					requestedUrl: originalUrl,
					finalUrl: currentUrl,
					redirectChain: chain,
					redirects,
					status: null,
					headers: {},
					contentType: '',
					body: '',
					rawBytes: 0,
					bodyTruncated: false,
					totalMs: rounded(performance.now() - totalStartedAt),
					error: `transport_attempts_exhausted_after_${MAX_FETCH_ATTEMPTS}:${
						error instanceof Error ? error.message : String(error)
					}`
				};
			}
			const hopMs = rounded(performance.now() - hopStartedAt);
			const headers = responseHeaders(response);
			lastStatus = response.status;
			lastHeaders = headers;
			if (REDIRECT_STATUSES.has(response.status) && headers.location) {
				clearTimeout(timer);
				const destination = resolveUrl(headers.location, currentUrl);
				if (!destination) {
					redirects.push({
						from: currentUrl,
						status: response.status,
						location: headers.location,
						to: destination,
						responseMs: hopMs
					});
					return {
						requestedUrl: originalUrl,
						finalUrl: currentUrl,
						redirectChain: chain,
						redirects,
						status: response.status,
						headers,
						contentType: headers['content-type'] ?? '',
						body: '',
						rawBytes: 0,
						bodyTruncated: false,
						totalMs: rounded(performance.now() - totalStartedAt),
						error: 'invalid_redirect_location'
					};
				}
				if (
					allowedFetchTarget(destination, origin, { allowApex }) &&
					targetPolicy &&
					!targetPolicy(destination, origin)
				) {
					const policyHeaders = {
						...headers,
						location: '[BLOCKED_BY_AUDIT_POLICY]'
					};
					redirects.push({
						from: currentUrl,
						status: response.status,
						location: '[BLOCKED_BY_AUDIT_POLICY]',
						to: '',
						responseMs: hopMs
					});
					return {
						requestedUrl: originalUrl,
						finalUrl: currentUrl,
						redirectChain: chain,
						redirects,
						status: response.status,
						headers: policyHeaders,
						contentType: policyHeaders['content-type'] ?? '',
						body: '',
						rawBytes: 0,
						bodyTruncated: false,
						totalMs: rounded(performance.now() - totalStartedAt),
						error: 'redirect_target_blocked_by_audit_policy'
					};
				}
				redirects.push({
					from: currentUrl,
					status: response.status,
					location: headers.location,
					to: destination,
					responseMs: hopMs
				});
				currentUrl = destination;
				chain.push(currentUrl);
				continue redirectLoop;
			}
			let payload;
			try {
				payload =
					method === 'HEAD'
						? { body: '', bytes: 0, truncated: false }
						: await responseTextWithLimit(response, maxBodyBytes);
			} catch (error) {
				clearTimeout(timer);
				if (!response.ok) {
					return {
						requestedUrl: originalUrl,
						finalUrl: currentUrl,
						redirectChain: chain,
						redirects,
						status: response.status,
						statusText: response.statusText,
						headers,
						contentType: headers['content-type'] ?? '',
						body: null,
						rawBytes: null,
						bodyTruncated: false,
						responseMs: hopMs,
						totalMs: rounded(performance.now() - totalStartedAt),
						bodyReadWarning: `response_body_unavailable_for_http_${response.status}:${boundedDiagnosticText(
							error instanceof Error ? error.message : String(error),
							120
						)}`,
						error: ''
					};
				}
				const retryableTransportFailure = retryableResponseBodyTransportError(
					error,
					controller.signal
				);
				if (retryableTransportFailure && attempt + 1 < MAX_FETCH_ATTEMPTS) {
					continue;
				}
				return {
					requestedUrl: originalUrl,
					finalUrl: currentUrl,
					redirectChain: chain,
					redirects,
					status: response.status,
					statusText: response.statusText,
					headers,
					contentType: headers['content-type'] ?? '',
					body: '',
					rawBytes: 0,
					bodyTruncated: false,
					responseMs: hopMs,
					totalMs: rounded(performance.now() - totalStartedAt),
					error: `response_body_error:${
						retryableTransportFailure
							? `transport_attempts_exhausted_after_${MAX_FETCH_ATTEMPTS}:`
							: ''
					}${error instanceof Error ? error.message : String(error)}`
				};
			}
			clearTimeout(timer);
			return {
				requestedUrl: originalUrl,
				finalUrl: currentUrl,
				redirectChain: chain,
				redirects,
				status: response.status,
				statusText: response.statusText,
				headers,
				contentType: headers['content-type'] ?? '',
				body: payload.body,
				rawBytes: payload.bytes,
				bodyTruncated: payload.truncated,
				bodyReadWarning: '',
				responseMs: hopMs,
				totalMs: rounded(performance.now() - totalStartedAt),
				error: ''
			};
		}
	}

	return {
		requestedUrl: originalUrl,
		finalUrl: currentUrl,
		redirectChain: chain,
		redirects,
		status: lastStatus,
		headers: lastHeaders,
		contentType: lastHeaders['content-type'] ?? '',
		body: '',
		rawBytes: 0,
		bodyTruncated: false,
		totalMs: rounded(performance.now() - totalStartedAt),
		error: 'too_many_redirects'
	};
}

function firstContent(metadata, keys) {
	for (const key of keys) {
		const value = metadata.get(key.toLowerCase());
		if (value) return value;
	}
	return '';
}

function metaContentMap(head) {
	const map = new Map();
	for (const tag of openingTags(head, 'meta')) {
		const key = tag.attributes.name ?? tag.attributes.property ?? tag.attributes['http-equiv'];
		if (!key || tag.attributes.content === undefined) continue;
		if (!map.has(key.toLowerCase())) map.set(key.toLowerCase(), tag.attributes.content);
	}
	return map;
}

function relationTokens(value) {
	return String(value ?? '')
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
}

function firstCanonical(head, pageUrl) {
	for (const tag of openingTags(head, 'link')) {
		if (!relationTokens(tag.attributes.rel).includes('canonical')) continue;
		return resolveUrl(tag.attributes.href, pageUrl);
	}
	return '';
}

function hashText(value) {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonLdEntities(value) {
	if (Array.isArray(value)) return value.flatMap(jsonLdEntities);
	if (!value || typeof value !== 'object') return [];
	const entities = [value];
	if (Array.isArray(value['@graph'])) entities.push(...value['@graph'].flatMap(jsonLdEntities));
	return entities;
}

function walkJson(value, visitor, parentKey = '') {
	if (Array.isArray(value)) {
		for (const item of value) walkJson(item, visitor, parentKey);
		return;
	}
	if (!value || typeof value !== 'object') return;
	visitor(value, parentKey);
	for (const [key, child] of Object.entries(value)) walkJson(child, visitor, key);
}

export function parseJsonLd(html, pageUrl) {
	const blocks = pairedTags(html, 'script').filter(
		(script) => script.attributes.type?.split(';')[0].trim().toLowerCase() === 'application/ld+json'
	);
	const parsed = [];
	const errors = [];
	for (const [index, block] of blocks.entries()) {
		try {
			parsed.push(JSON.parse(block.content.trim()));
		} catch (error) {
			errors.push(`block_${index + 1}:${error instanceof Error ? error.message : String(error)}`);
		}
	}
	const types = new Set();
	const ids = new Set();
	const definitions = new Set();
	const references = new Set();
	for (const document of parsed) {
		for (const entity of jsonLdEntities(document)) {
			for (const type of asArray(entity['@type'])) if (typeof type === 'string') types.add(type);
		}
		walkJson(document, (object) => {
			for (const type of asArray(object['@type'])) {
				if (typeof type === 'string') types.add(type);
			}
			if (typeof object['@id'] !== 'string') return;
			const id = resolveUrl(object['@id'], pageUrl, { keepHash: true }) || object['@id'];
			ids.add(id);
			if (Object.keys(object).some((key) => key !== '@id')) definitions.add(id);
			else references.add(id);
		});
	}
	const pageWithoutHash = resolveUrl(pageUrl, pageUrl);
	const danglingReferences = [...references]
		.filter((reference) => {
			if (definitions.has(reference)) return false;
			try {
				const url = new URL(reference, pageUrl);
				return Boolean(url.hash) && `${url.origin}${url.pathname}${url.search}` === pageWithoutHash;
			} catch {
				return reference.startsWith('#');
			}
		})
		.sort();
	return {
		scriptCount: blocks.length,
		parseStatus:
			blocks.length === 0
				? 'absent'
				: errors.length === 0
					? 'valid'
					: parsed.length > 0
						? 'partial'
						: 'invalid',
		errors,
		types: [...types].sort(),
		ids: [...ids].sort(),
		definitionIds: [...definitions].sort(),
		referenceIds: [...references].sort(),
		danglingReferences,
		documents: parsed
	};
}

function firstJsonLdValue(jsonLd, keys) {
	let result = '';
	for (const document of jsonLd.documents) {
		walkJson(document, (object) => {
			if (result) return;
			for (const key of keys) {
				const value = object[key];
				if (typeof value === 'string' && value.trim()) {
					result = value.trim();
					return;
				}
				if (value && typeof value === 'object' && typeof value.name === 'string') {
					result = value.name.trim();
					return;
				}
			}
		});
	}
	return result;
}

function visibleSemanticValue(html, attributePattern) {
	const tags = ['address', 'a', 'span', 'p', 'div', 'time'];
	for (const tagName of tags) {
		for (const element of pairedTags(html, tagName)) {
			const attributes = Object.entries(element.attributes)
				.map(([name, value]) => `${name}=${value}`)
				.join(' ');
			if (!attributePattern.test(attributes)) continue;
			const value = element.attributes.datetime ?? stripMarkup(element.content);
			if (value) return value;
		}
	}
	return '';
}

function normalizeFilenameWords(value) {
	try {
		const filename = decodeURIComponent(
			new URL(value, SITE_ORIGIN).pathname.split('/').at(-1) ?? ''
		);
		return filename
			.replace(/\.[a-z0-9]+$/i, '')
			.replace(/(?:[-_](?:\d{2,}|small|medium|large|thumb|thumbnail|preview|hero|cover))+$/gi, '')
			.replace(/[^\p{L}\p{N}]+/gu, ' ')
			.toLocaleLowerCase('en')
			.trim();
	} catch {
		return '';
	}
}

function filenameDerivedAlt(attributes) {
	const alt = normalizeWhitespace(attributes.alt).toLocaleLowerCase('en');
	const filename = normalizeFilenameWords(attributes.src ?? attributes['data-src'] ?? '');
	return Boolean(alt && filename && (alt === filename || alt === `image ${filename}`));
}

function isInternalLink(url, origin) {
	try {
		return sameSiteHost(new URL(url).hostname, new URL(origin).hostname);
	} catch {
		return false;
	}
}

function principalHtml(html) {
	return (
		pairedTags(html, 'main')[0]?.content ??
		pairedTags(html, 'article')[0]?.content ??
		bodyHtml(html)
	);
}

export function analyzeHtml(html, pageUrl, { origin = SITE_ORIGIN } = {}) {
	const rawHtml = String(html ?? '');
	const head = headHtml(rawHtml);
	const body = bodyHtml(rawHtml);
	const metadata = metaContentMap(head);
	const htmlTag = openingTags(rawHtml, 'html')[0];
	const title = stripMarkup(pairedTags(head, 'title')[0]?.content ?? '');
	const description = firstContent(metadata, ['description']);
	const h1Texts = pairedTags(body, 'h1')
		.map((heading) => stripMarkup(heading.content))
		.filter(Boolean);
	const canonicalUrl = firstCanonical(head, pageUrl);
	const jsonLd = parseJsonLd(rawHtml, pageUrl);
	const domIds = unique(
		Array.from(rawHtml.matchAll(/\bid\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi), (match) =>
			decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? '')
		)
	).sort();
	const domIdSet = new Set(domIds);
	const links = [];
	const fragmentReferences = [];
	let hiddenInternalLinks = 0;
	for (const anchor of pairedTags(body, 'a')) {
		const href = anchor.attributes.href;
		if (!href || /^(?:mailto|tel|javascript|data):/i.test(href)) continue;
		const resolvedWithHash = resolveUrl(href, pageUrl, { keepHash: true });
		if (!resolvedWithHash) continue;
		const resolved = resolveUrl(resolvedWithHash, pageUrl);
		const url = new URL(resolvedWithHash);
		if (url.hash && resolveUrl(url.href, pageUrl) === resolveUrl(pageUrl, pageUrl)) {
			fragmentReferences.push(decodeURIComponent(url.hash.slice(1)));
		}
		const internal = isInternalLink(resolved, origin);
		const hidden =
			'hidden' in anchor.attributes ||
			anchor.attributes['aria-hidden'] === 'true' ||
			/(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$))/i.test(
				anchor.attributes.style ?? ''
			);
		if (internal && hidden) hiddenInternalLinks += 1;
		links.push({
			url: resolved,
			href,
			internal,
			nofollow: relationTokens(anchor.attributes.rel).includes('nofollow'),
			hidden,
			anchorText: stripMarkup(anchor.content),
			anchorTextNormalized: normalizeAnchorText(stripMarkup(anchor.content)),
			context: 'server_html',
			evidence: 'server_rendered_html'
		});
	}
	const images = openingTags(body, 'img');
	const imageMissingAlt = images.filter(
		(image) => image.attributes.alt === undefined || image.attributes.alt.trim() === ''
	).length;
	const filenameAlt = images.filter((image) => filenameDerivedAlt(image.attributes)).length;
	const imagesMissingDimensions = images.filter(
		(image) =>
			!/^\d+$/.test(image.attributes.width ?? '') || !/^\d+$/.test(image.attributes.height ?? '')
	).length;
	const videos = pairedTags(body, 'video');
	const videoEmbeds = openingTags(body, 'iframe').filter((frame) =>
		/(?:youtube(?:-nocookie)?\.com|youtu\.be|vimeo\.com|video)/i.test(frame.attributes.src ?? '')
	);
	const bodyText = stripMarkup(body);
	const hasVisibleTranscript =
		/\b(?:transcript|captions?|video summary|what the video shows)\b/i.test(bodyText);
	let videosMissingSemantics = 0;
	for (const video of videos) {
		const hasCaptions = openingTags(video.content, 'track').some((track) =>
			['captions', 'subtitles'].includes((track.attributes.kind ?? '').toLowerCase())
		);
		if (!hasCaptions && !hasVisibleTranscript) videosMissingSemantics += 1;
	}
	if (!hasVisibleTranscript) videosMissingSemantics += videoEmbeds.length;
	const scriptReferences = unique(
		openingTags(rawHtml, 'script')
			.map((script) => resolveUrl(script.attributes.src, pageUrl))
			.filter(Boolean)
	);
	const author =
		visibleSemanticValue(body, /(?:class|rel|itemprop)=(?:[^ ]*author|byline)/i) ||
		firstContent(metadata, ['author']) ||
		firstJsonLdValue(jsonLd, ['author']);
	const publicationDate =
		visibleSemanticValue(
			body,
			/(?:class|itemprop)=(?:[^ ]*(?:publish|datepublished|post-date))/i
		) ||
		firstContent(metadata, ['article:published_time', 'date']) ||
		firstJsonLdValue(jsonLd, ['datePublished']);
	const modificationDate =
		visibleSemanticValue(
			body,
			/(?:class|itemprop)=(?:[^ ]*(?:modified|updated|reviewed|datemodified))/i
		) ||
		firstContent(metadata, ['article:modified_time', 'last-modified']) ||
		firstJsonLdValue(jsonLd, ['dateModified', 'dateReviewed', 'lastReviewed']);
	const visibleText = stripMarkup(body);
	const principalText = stripMarkup(principalHtml(rawHtml));
	const robots = firstContent(metadata, ['robots']);
	const googlebot = firstContent(metadata, ['googlebot']);
	const soft404 = SOFT_404_PATTERN.test(
		`${title} ${h1Texts.join(' ')} ${visibleText.slice(0, 1_500)}`
	);
	const challengeDetected =
		CHALLENGE_PROVIDER_MARKUP_PATTERN.test(rawHtml) ||
		(CHALLENGE_PATTERN.test(`${title} ${h1Texts.join(' ')}`) && countWords(visibleText) <= 250);

	return {
		canonicalUrl,
		robots,
		googlebot,
		title,
		titleLength: title.length,
		description,
		descriptionLength: description.length,
		h1Count: pairedTags(body, 'h1').length,
		h1Text: h1Texts,
		htmlLang: htmlTag?.attributes.lang ?? '',
		visibleAuthor: author,
		publicationDate,
		modificationOrReviewDate: modificationDate,
		openGraph: {
			title: firstContent(metadata, ['og:title']),
			description: firstContent(metadata, ['og:description']),
			image: resolveUrl(firstContent(metadata, ['og:image']), pageUrl),
			type: firstContent(metadata, ['og:type']),
			url: resolveUrl(firstContent(metadata, ['og:url']), pageUrl)
		},
		twitter: {
			card: firstContent(metadata, ['twitter:card']),
			title: firstContent(metadata, ['twitter:title']),
			description: firstContent(metadata, ['twitter:description']),
			image: resolveUrl(firstContent(metadata, ['twitter:image']), pageUrl),
			site: firstContent(metadata, ['twitter:site']),
			creator: firstContent(metadata, ['twitter:creator'])
		},
		jsonLd,
		domIds,
		fragmentReferences: unique(fragmentReferences).sort(),
		danglingFragmentReferences: unique(fragmentReferences)
			.filter((fragment) => fragment && !domIdSet.has(fragment))
			.sort(),
		visibleWordCount: countWords(visibleText),
		principalWordCount: countWords(principalText),
		rawHtmlLength: Buffer.byteLength(rawHtml),
		bodyContentHash: hashText(visibleText),
		links,
		internalLinkCount: links.filter((link) => link.internal).length,
		externalLinkCount: links.filter((link) => !link.internal).length,
		hiddenInternalLinkCount: hiddenInternalLinks,
		imageCount: images.length,
		imageMissingOrEmptyAltCount: imageMissingAlt,
		filenameDerivedAltCount: filenameAlt,
		imagesMissingIntrinsicDimensionsCount: imagesMissingDimensions,
		videoCount: videos.length + videoEmbeds.length,
		videosMissingCaptionsTranscriptOrSummaryCount: videosMissingSemantics,
		scriptReferences,
		principalContentInRawHtml: countWords(principalText) >= 40,
		soft404TextDetected: soft404,
		challengeDetected,
		visibleText
	};
}

export function parseRobotsDirectives(...values) {
	const directives = new Set();
	for (const value of values) {
		const normalized = String(value ?? '')
			.toLowerCase()
			.replace(/\b(?:googlebot(?:-news|-image)?|bingbot|robots?)\s*:\s*/g, ' ');
		for (const match of normalized.matchAll(
			/\b(?:all|follow|index|noarchive|noimageindex|noindex|nofollow|none|nosnippet|notranslate)\b/g
		)) {
			directives.add(match[0]);
		}
	}
	if (directives.has('none')) {
		directives.add('noindex');
		directives.add('nofollow');
	}
	if (directives.has('all')) {
		directives.add('index');
		directives.add('follow');
	}
	return directives;
}

export function robotsConflict(robots, googlebot, xRobotsTag) {
	const generic = parseRobotsDirectives(robots, xRobotsTag);
	const google = parseRobotsDirectives(googlebot);
	if (
		(generic.has('index') && generic.has('noindex')) ||
		(generic.has('follow') && generic.has('nofollow'))
	) {
		return true;
	}
	if (
		(google.has('index') && google.has('noindex')) ||
		(google.has('follow') && google.has('nofollow'))
	) {
		return true;
	}
	return (
		(generic.has('index') && google.has('noindex')) ||
		(generic.has('noindex') && google.has('index')) ||
		(generic.has('follow') && google.has('nofollow')) ||
		(generic.has('nofollow') && google.has('follow'))
	);
}

function blankHtmlAnalysis() {
	return {
		canonicalUrl: '',
		robots: '',
		googlebot: '',
		title: '',
		titleLength: 0,
		description: '',
		descriptionLength: 0,
		h1Count: 0,
		h1Text: [],
		htmlLang: '',
		visibleAuthor: '',
		publicationDate: '',
		modificationOrReviewDate: '',
		openGraph: { title: '', description: '', image: '', type: '', url: '' },
		twitter: { card: '', title: '', description: '', image: '', site: '', creator: '' },
		jsonLd: {
			scriptCount: 0,
			parseStatus: 'absent',
			errors: [],
			types: [],
			ids: [],
			definitionIds: [],
			referenceIds: [],
			danglingReferences: [],
			documents: []
		},
		domIds: [],
		fragmentReferences: [],
		danglingFragmentReferences: [],
		visibleWordCount: 0,
		principalWordCount: 0,
		rawHtmlLength: 0,
		bodyContentHash: '',
		links: [],
		internalLinkCount: 0,
		externalLinkCount: 0,
		hiddenInternalLinkCount: 0,
		imageCount: 0,
		imageMissingOrEmptyAltCount: 0,
		filenameDerivedAltCount: 0,
		imagesMissingIntrinsicDimensionsCount: 0,
		videoCount: 0,
		videosMissingCaptionsTranscriptOrSummaryCount: 0,
		scriptReferences: [],
		principalContentInRawHtml: false,
		soft404TextDetected: false,
		challengeDetected: false,
		visibleText: ''
	};
}

function looksLikeHtml(result) {
	return (
		/(?:text\/html|application\/xhtml\+xml)/i.test(result.contentType) ||
		/^\s*<!doctype html|^\s*<html\b/i.test(result.body)
	);
}

function makeCrawlRecord(fetchResult, inventoryEntry, origin) {
	fetchResult.networkMs = rounded(
		fetchResult.redirects.reduce((sum, redirect) => sum + (redirect.responseMs ?? 0), 0) +
			(fetchResult.responseMs ?? 0)
	);
	const analysis =
		!fetchResult.bodyReadWarning && looksLikeHtml(fetchResult)
			? analyzeHtml(fetchResult.body, fetchResult.finalUrl, { origin })
			: blankHtmlAnalysis();
	return {
		requestedUrl: fetchResult.requestedUrl,
		inventory: inventoryEntry,
		fetch: fetchResult,
		analysis,
		render: {
			status: 'not_requested',
			htmlLength: null,
			visibleWordCount: null,
			principalWordCount: null,
			scriptReferences: [],
			blockedScriptReferences: [],
			scriptAssets: [],
			error: ''
		},
		jsBundleBytes: null,
		jsBundleReferences: [],
		jsBundleMeasurementStatus: 'not_measured',
		jsBundleUnmeasuredReferenceCount: 0,
		issueCodes: []
	};
}

function queueableEntry(entry) {
	if (entry.canonicalCandidate) return true;
	return [...entry.sources].some((source) =>
		/alias|redirect|homepage|sitemap|rss|crawl/.test(source)
	);
}

export async function crawlInventory(
	inventory,
	{
		origin = SITE_ORIGIN,
		fetchImpl = fetch,
		gate = createRateGate(),
		concurrency = DEFAULT_CONCURRENCY,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		maxUrls = DEFAULT_MAX_URLS,
		maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
		preloaded = new Map(),
		onProgress = null
	} = {}
) {
	const records = new Map();
	const queued = new Set();
	const pending = [];
	const warnings = [];
	const enqueue = (url) => {
		let normalized;
		try {
			normalized = normalizeAuditUrl(url, origin);
		} catch {
			return;
		}
		if (queued.has(normalized) || records.has(normalized)) return;
		if (!isAuditablePageUrl(normalized, origin)) return;
		if (records.size + queued.size >= maxUrls) {
			if (!warnings.includes(`URL_LIMIT_REACHED:${maxUrls}`))
				warnings.push(`URL_LIMIT_REACHED:${maxUrls}`);
			return;
		}
		queued.add(normalized);
		pending.push(normalized);
	};
	for (const [url, entry] of inventory) if (queueableEntry(entry)) enqueue(url);

	while (pending.length > 0) {
		const batch = pending.splice(0);
		const batchResults = await mapConcurrent(batch, concurrency, async (url) => {
			const preloadedResult = preloaded.get(url);
			const fetchResult =
				preloadedResult ??
				(await fetchWithRedirects(url, {
					fetchImpl,
					gate,
					origin,
					timeoutMs,
					maxBodyBytes,
					targetPolicy: isAuditablePageUrl
				}));
			return makeCrawlRecord(fetchResult, inventory.get(url), origin);
		});

		for (const record of batchResults) {
			const requestedKey = normalizeAuditUrl(record.requestedUrl, origin);
			records.set(requestedKey, record);
			queued.delete(requestedKey);
			const fromHomepage =
				normalizeAuditUrl(record.fetch.finalUrl, origin, { keepQuery: false }) ===
				normalizeAuditUrl(origin, origin, { keepQuery: false });
			for (const link of record.analysis.links.filter((candidate) => candidate.internal)) {
				if (!isAuditablePageUrl(link.url, origin)) continue;
				const linkUrl = normalizeAuditUrl(link.url, origin);
				mergeInventoryRecord(
					inventory,
					{
						url: linkUrl,
						sourceType: fromHomepage ? 'homepage' : 'crawl',
						sourceFile: record.fetch.finalUrl,
						canonicalCandidate: true,
						strata: fromHomepage ? ['homepage_discovered'] : ['crawl_discovered']
					},
					origin
				);
				enqueue(linkUrl);
			}
			if (
				record.analysis.canonicalUrl &&
				isAuditablePageUrl(record.analysis.canonicalUrl, origin)
			) {
				const canonicalUrl = normalizeAuditUrl(record.analysis.canonicalUrl, origin);
				mergeInventoryRecord(
					inventory,
					{
						url: canonicalUrl,
						sourceType: 'canonical_discovered',
						sourceFile: record.fetch.finalUrl,
						canonicalCandidate: true,
						strata: ['canonical_discovered']
					},
					origin
				);
				enqueue(canonicalUrl);
			}
			onProgress?.({ completed: records.size, pending: pending.length, url: requestedKey });
		}
	}

	return { records, warnings };
}

function terminalResourceIndexable(record) {
	if (record.fetch.status !== 200 || !looksLikeHtml(record.fetch)) return false;
	const directives = parseRobotsDirectives(
		record.analysis.robots,
		record.analysis.googlebot,
		record.fetch.headers['x-robots-tag']
	);
	// Soft-404 text is intentionally review-only. Narrative pages in this corpus
	// legitimately use phrases such as “not found”; only an engine/account report
	// or human review can convert that heuristic into an exclusion verdict.
	return !directives.has('noindex');
}

function indexableWithoutCanonicalChecks(record) {
	// Indexability belongs to the requested URL, not merely to the terminal body.
	// A redirect alias can end at an indexable 200 resource but is not itself an
	// indexable document and must not participate in duplicate-page grouping.
	return record.fetch.redirects.length === 0 && terminalResourceIndexable(record);
}

function recordCanonicalUrl(record, origin = SITE_ORIGIN) {
	const candidate = record.analysis.canonicalUrl || record.fetch.finalUrl;
	try {
		return normalizeAuditUrl(candidate, origin);
	} catch {
		return candidate;
	}
}

export function computeInternalGraph(
	recordsInput,
	{ origin = SITE_ORIGIN, observedTraffic = new Map() } = {}
) {
	const records = recordsInput instanceof Map ? [...recordsInput.values()] : [...recordsInput];
	const canonicalRecords = new Map();
	const aliasToCanonical = new Map();
	const redirectAliasMetadata = new Map();
	for (const record of records) {
		if (!indexableWithoutCanonicalChecks(record)) continue;
		const canonical = recordCanonicalUrl(record, origin);
		if (!allowedFetchTarget(canonical, origin)) continue;
		if (
			!canonicalRecords.has(canonical) ||
			normalizeAuditUrl(record.fetch.finalUrl, origin) === canonical
		) {
			canonicalRecords.set(canonical, record);
		}
		for (const value of [record.requestedUrl, record.fetch.finalUrl]) {
			try {
				aliasToCanonical.set(normalizeAuditUrl(value, origin), canonical);
			} catch {
				// Invalid values are already represented by crawl errors.
			}
		}
	}
	for (const record of records) {
		if (!terminalResourceIndexable(record) || record.fetch.redirects.length === 0) continue;
		const canonical = recordCanonicalUrl(record, origin);
		if (!allowedFetchTarget(canonical, origin)) continue;
		const chain = unique([
			record.requestedUrl,
			...(record.fetch.redirectChain ?? []),
			...record.fetch.redirects.flatMap((redirect) => [redirect.from, redirect.to]),
			record.fetch.finalUrl
		]);
		for (const value of chain) {
			try {
				const normalized = normalizeAuditUrl(value, origin);
				if (normalized === normalizeAuditUrl(record.fetch.finalUrl, origin)) {
					if (!aliasToCanonical.has(normalized)) aliasToCanonical.set(normalized, canonical);
				} else {
					aliasToCanonical.set(normalized, canonical);
				}
			} catch {
				// Invalid/out-of-scope redirect hops remain visible in REDIRECTS.csv.
			}
		}
		for (const [index, redirect] of record.fetch.redirects.entries()) {
			try {
				redirectAliasMetadata.set(exactAuditUrlIdentity(redirect.from, origin), {
					status: redirect.status,
					hopsToFinal: record.fetch.redirects.length - index,
					finalUrl: normalizeAuditUrl(record.fetch.finalUrl, origin)
				});
			} catch {
				// The redirect itself remains available in REDIRECTS.csv.
			}
		}
	}
	const nodes = [...canonicalRecords.keys()].sort();
	const nodeSet = new Set(nodes);
	const canonicalObservedTraffic = new Map();
	for (const [observedUrl, visitors] of observedTraffic) {
		if (!Number.isFinite(visitors)) continue;
		let normalized;
		try {
			normalized = normalizeAuditUrl(observedUrl, origin);
		} catch {
			continue;
		}
		const canonical = aliasToCanonical.get(normalized) ?? normalized;
		if (!nodeSet.has(canonical)) continue;
		// Vercel page-path rows are not a session-level redirect journey. Taking the
		// maximum avoids fabricating an additive alias + canonical visitor total.
		canonicalObservedTraffic.set(
			canonical,
			Math.max(canonicalObservedTraffic.get(canonical) ?? 0, visitors)
		);
	}
	const trafficCandidates = nodes
		.map((url) => ({ url, visitors: canonicalObservedTraffic.get(url) }))
		.filter(({ visitors }) => Number.isFinite(visitors))
		.sort((left, right) => right.visitors - left.visitors || left.url.localeCompare(right.url));
	const highTrafficCount = trafficCandidates.length
		? Math.max(1, Math.ceil(trafficCandidates.length * 0.1))
		: 0;
	const highTrafficUrls = new Set(
		trafficCandidates.slice(0, highTrafficCount).map(({ url }) => url)
	);
	const edgeMap = new Map();
	for (const [source, record] of canonicalRecords) {
		const renderedLinks =
			record.render?.status === 'rendered' && Array.isArray(record.render.links)
				? record.render.links
				: null;
		const links = renderedLinks ?? record.analysis.links;
		const evidence = renderedLinks ? 'rendered_dom' : 'server_rendered_html_fallback';
		for (const link of links.filter((candidate) => isAuditablePageUrl(candidate.url, origin))) {
			let target;
			let normalizedLinkedUrl;
			try {
				normalizedLinkedUrl = normalizeAuditUrl(link.url, origin);
				target = aliasToCanonical.get(normalizedLinkedUrl) ?? normalizedLinkedUrl;
			} catch {
				continue;
			}
			const linkedUrl = link.url;
			const rawHref = normalizeWhitespace(link.href) || linkedUrl;
			const redirectMetadata = redirectAliasMetadata.get(exactAuditUrlIdentity(linkedUrl, origin));
			const targetResolvedViaAlias = normalizedLinkedUrl !== target;
			const linkedUrlDiffersFromCanonical = linkedUrl !== target;
			const selfCanonicalTarget = target === source;
			if (selfCanonicalTarget && !linkedUrlDiffersFromCanonical && !redirectMetadata) continue;
			const anchorText = normalizeWhitespace(link.anchorText) || '(empty or non-text link)';
			const anchorTextNormalized =
				normalizeAnchorText(link.anchorTextNormalized || anchorText) || '(empty-or-non-text-link)';
			const linkContext = normalizeWhitespace(link.context) || 'unknown';
			const key = `${source}\n${linkedUrl}\n${rawHref}\n${target}\n${anchorTextNormalized}\n${linkContext}\n${evidence}`;
			const edge = edgeMap.get(key) ?? {
				source,
				linkedUrl,
				normalizedLinkedUrl,
				rawHref,
				target,
				targetResolvedViaAlias,
				linkedUrlDiffersFromCanonical,
				selfCanonicalTarget,
				linkedUrlIsRedirect: Boolean(redirectMetadata),
				linkedUrlRedirectStatus: redirectMetadata?.status ?? null,
				linkedUrlRedirectHopsToFinal: redirectMetadata?.hopsToFinal ?? null,
				linkedUrlRedirectFinalUrl: redirectMetadata?.finalUrl ?? '',
				linkedUrlIsNoncanonicalVariant: linkedUrlDiffersFromCanonical && !redirectMetadata,
				anchorText,
				anchorTextNormalized,
				linkContext,
				linkEvidence: evidence,
				occurrences: 0,
				nofollowOccurrences: 0,
				hiddenOccurrences: 0,
				targetCrawled: nodeSet.has(target),
				sourceIsHub: isExplicitHubUrl(source, origin),
				sourceVisitors: canonicalObservedTraffic.get(source) ?? null,
				sourceIsObservedHighTraffic: highTrafficUrls.has(source)
			};
			edge.occurrences += 1;
			if (link.nofollow) edge.nofollowOccurrences += 1;
			if (link.hidden) edge.hiddenOccurrences += 1;
			edgeMap.set(key, edge);
		}
	}
	const edges = [...edgeMap.values()].sort(
		(left, right) =>
			left.source.localeCompare(right.source) ||
			left.target.localeCompare(right.target) ||
			left.linkedUrl.localeCompare(right.linkedUrl) ||
			left.rawHref.localeCompare(right.rawHref) ||
			left.anchorTextNormalized.localeCompare(right.anchorTextNormalized) ||
			left.linkContext.localeCompare(right.linkContext)
	);
	const inbound = new Map(nodes.map((node) => [node, new Set()]));
	const outbound = new Map(nodes.map((node) => [node, new Set()]));
	const undirected = new Map(nodes.map((node) => [node, new Set()]));
	for (const edge of edges) {
		if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) continue;
		if (edge.selfCanonicalTarget) continue;
		outbound.get(edge.source).add(edge.target);
		inbound.get(edge.target).add(edge.source);
		undirected.get(edge.source).add(edge.target);
		undirected.get(edge.target).add(edge.source);
	}
	const homepage = normalizeAuditUrl(origin, origin);
	const depth = new Map(nodes.map((node) => [node, null]));
	if (nodeSet.has(homepage)) {
		depth.set(homepage, 0);
		const queue = [homepage];
		for (let cursor = 0; cursor < queue.length; cursor += 1) {
			const source = queue[cursor];
			for (const target of outbound.get(source) ?? []) {
				if (depth.get(target) !== null) continue;
				depth.set(target, depth.get(source) + 1);
				queue.push(target);
			}
		}
	}
	let pageRank = new Map(nodes.map((node) => [node, nodes.length ? 1 / nodes.length : 0]));
	const damping = 0.85;
	for (let iteration = 0; iteration < 50 && nodes.length > 0; iteration += 1) {
		const sinkMass = nodes
			.filter((node) => (outbound.get(node)?.size ?? 0) === 0)
			.reduce((sum, node) => sum + pageRank.get(node), 0);
		const next = new Map();
		let delta = 0;
		for (const node of nodes) {
			let inboundContribution = 0;
			for (const source of inbound.get(node) ?? []) {
				inboundContribution += pageRank.get(source) / outbound.get(source).size;
			}
			const score =
				(1 - damping) / nodes.length + damping * (inboundContribution + sinkMass / nodes.length);
			next.set(node, score);
			delta += Math.abs(score - pageRank.get(node));
		}
		pageRank = next;
		if (delta < 1e-12) break;
	}
	const components = new Map();
	const componentSizes = new Map();
	let componentNumber = 0;
	for (const node of nodes) {
		if (components.has(node)) continue;
		componentNumber += 1;
		const componentId = `component-${String(componentNumber).padStart(3, '0')}`;
		const queue = [node];
		const members = [];
		components.set(node, componentId);
		for (let cursor = 0; cursor < queue.length; cursor += 1) {
			const current = queue[cursor];
			members.push(current);
			for (const adjacent of undirected.get(current) ?? []) {
				if (components.has(adjacent)) continue;
				components.set(adjacent, componentId);
				queue.push(adjacent);
			}
		}
		componentSizes.set(componentId, members.length);
	}
	const inboundOccurrences = new Map(nodes.map((node) => [node, 0]));
	const outboundOccurrences = new Map(nodes.map((node) => [node, 0]));
	const hubSources = new Map(nodes.map((node) => [node, new Set()]));
	const highTrafficSources = new Map(nodes.map((node) => [node, new Set()]));
	const inboundAnchorCounts = new Map(nodes.map((node) => [node, new Map()]));
	for (const edge of edges) {
		if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) continue;
		if (edge.selfCanonicalTarget) continue;
		outboundOccurrences.set(
			edge.source,
			(outboundOccurrences.get(edge.source) ?? 0) + edge.occurrences
		);
		inboundOccurrences.set(
			edge.target,
			(inboundOccurrences.get(edge.target) ?? 0) + edge.occurrences
		);
		if (edge.sourceIsHub) hubSources.get(edge.target).add(edge.source);
		if (edge.sourceIsObservedHighTraffic) highTrafficSources.get(edge.target).add(edge.source);
		const anchors = inboundAnchorCounts.get(edge.target);
		anchors.set(
			edge.anchorTextNormalized,
			(anchors.get(edge.anchorTextNormalized) ?? 0) + edge.occurrences
		);
	}
	const metrics = new Map(
		nodes.map((node) => {
			const inDegree = inbound.get(node)?.size ?? 0;
			const outDegree = outbound.get(node)?.size ?? 0;
			const orphan = node !== homepage && inDegree === 0;
			const nearOrphan = node !== homepage && inDegree === 1;
			const componentId = components.get(node);
			const record = canonicalRecords.get(node);
			const anchorTextDistribution = [...inboundAnchorCounts.get(node).entries()]
				.sort(
					([leftText, leftCount], [rightText, rightCount]) =>
						rightCount - leftCount || leftText.localeCompare(rightText)
				)
				.map(([text, count]) => `${text} (${count})`);
			return [
				node,
				{
					url: node,
					inDegree,
					outDegree,
					inboundInternalLinkCount: inboundOccurrences.get(node) ?? 0,
					outboundInternalLinkCount: outboundOccurrences.get(node) ?? 0,
					uniqueSourcePages: inDegree,
					pageRank: pageRank.get(node) ?? 0,
					depth: depth.get(node),
					reachableFromHomepage: depth.get(node) !== null,
					orphan,
					nearOrphan,
					orphanStatus: orphan ? 'orphan' : nearOrphan ? 'near_orphan' : 'linked',
					deadEnd: outDegree === 0,
					componentId,
					componentSize: componentSizes.get(componentId) ?? 0,
					topicCluster: topicClusterForRecord(record, node),
					linksFromHubs: hubSources.get(node)?.size ?? 0,
					linksFromObservedHighTrafficPages: highTrafficSources.get(node)?.size ?? 0,
					anchorTextDistribution,
					observed28dVisitors: canonicalObservedTraffic.get(node) ?? null,
					observedHighTraffic: highTrafficUrls.has(node),
					linkEvidence:
						record?.render?.status === 'rendered' && Array.isArray(record.render.links)
							? 'rendered_dom'
							: 'server_rendered_html_fallback'
				}
			];
		})
	);
	return {
		nodes,
		edges,
		metrics,
		canonicalRecords,
		aliasToCanonical,
		highTrafficUrls,
		trafficMatchedCanonicalUrls: trafficCandidates.length,
		renderedDomNodeCount: [...metrics.values()].filter(
			(metric) => metric.linkEvidence === 'rendered_dom'
		).length,
		fallbackNodeCount: [...metrics.values()].filter(
			(metric) => metric.linkEvidence !== 'rendered_dom'
		).length
	};
}

function datedSourceRecords(inventory) {
	return [...inventory.values()]
		.map((entry) => ({
			url: entry.url,
			date: [...entry.lastModified].sort().at(-1) ?? '',
			strata: entry.strata
		}))
		.filter((entry) => /^\d{4}-\d{2}-\d{2}/.test(entry.date))
		.sort(
			(left, right) => left.date.localeCompare(right.date) || left.url.localeCompare(right.url)
		);
}

export function buildUserAgentSample(
	inventory,
	recordsInput,
	{
		origin = SITE_ORIGIN,
		size = DEFAULT_USER_AGENT_SAMPLE_SIZE,
		missingCount = 3,
		auditDate = '2026-08-06'
	} = {}
) {
	if (!Number.isInteger(size) || size < MIN_USER_AGENT_SAMPLE_SIZE) {
		throw new Error(`User-agent sample size must be at least ${MIN_USER_AGENT_SAMPLE_SIZE}.`);
	}
	const records = recordsInput instanceof Map ? [...recordsInput.values()] : [...recordsInput];
	const selected = new Map();
	const add = (url, stratum) => {
		let normalized;
		try {
			normalized = normalizeAuditUrl(url, origin);
		} catch {
			return;
		}
		const current = selected.get(normalized) ?? { url: normalized, strata: new Set() };
		for (const value of asArray(stratum)) current.strata.add(value);
		selected.set(normalized, current);
	};
	for (const [pathname, stratum] of [
		['/', 'homepage'],
		['/resume', 'resume'],
		['/consulting', 'consulting'],
		['/contact', 'contact'],
		['/writing', 'writing_hub'],
		['/blog', 'writing_hub'],
		['/blog/topics', 'topic'],
		['/topics', 'topic_headquarters']
	]) {
		add(pathname, stratum);
	}
	for (let index = 1; index <= missingCount; index += 1) {
		add(`/__audit-intentionally-missing-${auditDate}-${index}`, 'intentional_404');
	}
	const entries = [...inventory.values()].sort((left, right) => left.url.localeCompare(right.url));
	const addByStratum = (stratum, maximum) => {
		for (const entry of entries
			.filter((candidate) => candidate.strata.has(stratum))
			.slice(0, maximum)) {
			add(entry.url, stratum);
		}
	};
	addByStratum('visualization', 10);
	addByStratum('redirect', 4);
	addByStratum('category', 3);
	addByStratum('topic', 2);
	addByStratum('pagination', 3);
	addByStratum('archive', 2);
	addByStratum('healthcare', 4);
	addByStratum('science_math', 3);
	addByStratum('essay_satire', 4);
	const dated = datedSourceRecords(inventory);
	for (const record of dated.slice(0, 3)) add(record.url, 'old');
	for (const record of dated.slice(-3)) add(record.url, 'recent');
	addByStratum('image_heavy', 2);
	for (const record of records
		.filter((candidate) => candidate.analysis.imageCount > 3)
		.sort(
			(left, right) =>
				right.analysis.imageCount - left.analysis.imageCount ||
				left.requestedUrl.localeCompare(right.requestedUrl)
		)
		.slice(0, 2)) {
		add(record.requestedUrl, 'image_heavy');
	}
	addByStratum('video', 2);
	for (const record of records
		.filter((candidate) => candidate.analysis.videoCount > 0)
		.slice(0, 2)) {
		add(record.requestedUrl, 'video');
	}
	for (const entry of entries.filter((candidate) => candidate.canonicalCandidate)) {
		if (selected.size >= size) break;
		add(entry.url, 'representative_fill');
	}
	if (selected.size < size) {
		throw new Error(
			`Only ${selected.size} auditable URLs were available; ${size} are required for the user-agent sample.`
		);
	}
	const sample = [...selected.values()]
		.slice(0, size)
		.map((entry) => ({ url: entry.url, strata: [...entry.strata].sort() }));
	const visualizationCount = sample.filter((entry) =>
		entry.strata.includes('visualization')
	).length;
	if (visualizationCount < 10) {
		throw new Error(
			`The user-agent sample contains ${visualizationCount} visualization URL(s); at least 10 are required.`
		);
	}
	if (!sample.some((entry) => entry.strata.includes('redirect'))) {
		throw new Error('The user-agent sample does not contain a redirect URL.');
	}
	if (!sample.some((entry) => entry.strata.includes('intentional_404'))) {
		throw new Error('The user-agent sample does not contain an intentionally missing URL.');
	}
	return sample;
}

function comparisonFields(record) {
	return {
		status: record.fetch.status,
		finalUrl: record.fetch.finalUrl,
		canonicalUrl: record.analysis.canonicalUrl,
		title: record.analysis.title,
		h1Text: record.analysis.h1Text.join(' | '),
		visibleWordCount: record.analysis.visibleWordCount,
		bodyContentHash: record.analysis.bodyContentHash,
		jsonLdTypes: record.analysis.jsonLd.types.join(' | '),
		challengeDetected: record.analysis.challengeDetected
	};
}

export function compareUserAgentRecord(desktopRecord, candidateRecord) {
	const baseline = comparisonFields(desktopRecord);
	const candidate = comparisonFields(candidateRecord);
	const differences = [];
	for (const key of ['status', 'finalUrl']) {
		if (baseline[key] !== candidate[key]) differences.push(key);
	}
	const bodyComparable =
		!desktopRecord.fetch.bodyReadWarning && !candidateRecord.fetch.bodyReadWarning;
	if (bodyComparable) {
		for (const key of ['canonicalUrl', 'title', 'h1Text', 'jsonLdTypes']) {
			if (baseline[key] !== candidate[key]) differences.push(key);
		}
	}
	const denominator = Math.max(1, baseline.visibleWordCount);
	const wordDeltaRatio = bodyComparable
		? Math.abs(candidate.visibleWordCount - baseline.visibleWordCount) / denominator
		: null;
	if (wordDeltaRatio !== null && wordDeltaRatio > 0.25) differences.push('visibleWordCount');
	if (bodyComparable && baseline.challengeDetected !== candidate.challengeDetected)
		differences.push('challengeDetected');
	return {
		differences,
		wordDeltaRatio: rounded(wordDeltaRatio, 4),
		bodyHashDifferent: bodyComparable
			? baseline.bodyContentHash !== candidate.bodyContentHash
			: null,
		materiallyDifferent: differences.length > 0
	};
}

export async function crawlUserAgentSample(
	sample,
	{
		origin = SITE_ORIGIN,
		fetchImpl = fetch,
		gate = createRateGate(),
		concurrency = DEFAULT_CONCURRENCY,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
		normalRecords = new Map(),
		onProgress = null
	} = {}
) {
	const jobs = sample.flatMap((entry) =>
		Object.entries(USER_AGENTS).map(([userAgentKey, userAgent]) => ({
			...entry,
			userAgentKey,
			userAgent
		}))
	);
	const results = await mapConcurrent(jobs, concurrency, async (job, index) => {
		const normalizedUrl = normalizeAuditUrl(job.url, origin);
		let record;
		if (job.userAgentKey === 'desktop' && normalRecords.has(normalizedUrl)) {
			record = normalRecords.get(normalizedUrl);
		} else {
			const fetchResult = await fetchWithRedirects(job.url, {
				fetchImpl,
				gate,
				origin,
				userAgent: job.userAgent,
				timeoutMs,
				maxBodyBytes,
				targetPolicy: isAuditablePageUrl
			});
			record = makeCrawlRecord(fetchResult, null, origin);
		}
		onProgress?.({
			completed: index + 1,
			total: jobs.length,
			url: job.url,
			userAgent: job.userAgentKey
		});
		return { ...job, record };
	});
	const byUrl = new Map();
	for (const result of results) {
		const current = byUrl.get(result.url) ?? [];
		current.push(result);
		byUrl.set(result.url, current);
	}
	for (const group of byUrl.values()) {
		const desktop = group.find((result) => result.userAgentKey === 'desktop')?.record;
		for (const result of group) {
			result.comparison = desktop
				? compareUserAgentRecord(desktop, result.record)
				: {
						differences: ['desktop_baseline_missing'],
						wordDeltaRatio: null,
						bodyHashDifferent: null,
						materiallyDifferent: true
					};
		}
	}
	return results;
}

export async function renderCrawlRecords(
	recordsInput,
	{
		mode = 'all',
		sample = [],
		origin = SITE_ORIGIN,
		fetchImpl = fetch,
		gate = createRateGate(),
		concurrency = DEFAULT_CONCURRENCY,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		renderNavigationTimeoutMs = Math.max(timeoutMs, MIN_RENDER_NAVIGATION_TIMEOUT_MS),
		onProgress = null,
		playwrightModule = null
	} = {}
) {
	if (mode === 'none') return { rendered: 0, failed: 0, warning: '' };
	const records = recordsInput instanceof Map ? [...recordsInput.values()] : [...recordsInput];
	const sampleUrls = new Set(sample.map((entry) => normalizeAuditUrl(entry.url, origin)));
	const targets = records.filter(
		(record) =>
			record.fetch.status === 200 &&
			looksLikeHtml(record.fetch) &&
			(mode === 'all' || sampleUrls.has(normalizeAuditUrl(record.requestedUrl, origin)))
	);
	let playwright = playwrightModule;
	try {
		playwright ??= await import('@playwright/test');
	} catch (error) {
		const warning = `Playwright renderer unavailable: ${error instanceof Error ? error.message : String(error)}`;
		for (const record of targets) {
			record.render = {
				status: 'unavailable',
				htmlLength: null,
				visibleWordCount: null,
				principalWordCount: null,
				scriptReferences: [],
				blockedScriptReferences: [],
				scriptAssets: [],
				error: warning
			};
		}
		return { rendered: 0, failed: targets.length, warning };
	}
	let browser;
	try {
		browser = await playwright.chromium.launch({ headless: true });
	} catch (error) {
		const warning = `Chromium renderer unavailable: ${error instanceof Error ? error.message : String(error)}`;
		for (const record of targets) {
			record.render = {
				status: 'unavailable',
				htmlLength: null,
				visibleWordCount: null,
				principalWordCount: null,
				scriptReferences: [],
				blockedScriptReferences: [],
				scriptAssets: [],
				error: warning
			};
		}
		return { rendered: 0, failed: targets.length, warning };
	}
	let rendered = 0;
	let failed = 0;
	const assetSemaphore = createSemaphore(concurrency);
	const assetCache = new Map();
	const scriptAssetMeasurements = new Map();
	const scriptReferencesByRecord = new Map(targets.map((record) => [record, new Set()]));
	const blockedScriptReferencesByRecord = new Map(targets.map((record) => [record, new Set()]));
	const scriptFailuresByRecord = new Map(targets.map((record) => [record, []]));
	const pageErrorsByRecord = new Map(targets.map((record) => [record, []]));
	try {
		let activeDocument = null;
		const context = await browser.newContext({
			javaScriptEnabled: true,
			serviceWorkers: 'block',
			userAgent: USER_AGENTS.desktop,
			viewport: { width: 1440, height: 900 }
		});
		await context.addInitScript(() => {
			const blocked = () => {
				throw new Error('Network side effect blocked by the audit renderer.');
			};
			try {
				Object.defineProperty(navigator, 'sendBeacon', { value: () => false });
			} catch {
				// Some browser builds expose a non-configurable prototype property.
			}
			window.WebSocket = class BlockedAuditWebSocket {
				constructor() {
					blocked();
				}
			};
			window.EventSource = class BlockedAuditEventSource {
				constructor() {
					blocked();
				}
			};
			const originalFetch = window.fetch.bind(window);
			window.fetch = (input, init = {}) => {
				const url = new URL(typeof input === 'string' ? input : input.url, document.baseURI);
				const method = String(
					init.method ?? (typeof input === 'string' ? 'GET' : input.method)
				).toUpperCase();
				if (
					method !== 'GET' ||
					(url.origin !== location.origin && !url.pathname.startsWith('/_app/immutable/'))
				) {
					return Promise.reject(new Error('Network side effect blocked by the audit renderer.'));
				}
				return originalFetch(input, init);
			};
			HTMLFormElement.prototype.submit = blocked;
			HTMLFormElement.prototype.requestSubmit = blocked;
		});
		await context.route('**/*', async (route) => {
			const requestRecord = activeDocument;
			const request = route.request();
			let url;
			try {
				url = new URL(request.url());
			} catch {
				await route.abort('blockedbyclient');
				return;
			}
			if (
				request.method() === 'GET' &&
				request.resourceType() === 'document' &&
				requestRecord &&
				resolveUrl(request.url(), request.url()) ===
					resolveUrl(requestRecord.fetch.finalUrl, requestRecord.fetch.finalUrl)
			) {
				await route.fulfill({
					status: 200,
					headers: {
						'content-type': requestRecord.fetch.contentType || 'text/html; charset=utf-8',
						'cache-control': 'no-store'
					},
					body: requestRecord.fetch.body
				});
				return;
			}
			const resourceType = request.resourceType();
			const expectedOrigin = new URL(origin);
			const sameAuditHost =
				sameSiteHost(url.hostname, expectedOrigin.hostname) && url.port === expectedOrigin.port;
			const allowedAsset =
				request.method() === 'GET' &&
				isPublicAuditTarget(url.href, origin) &&
				((resourceType === 'script' && /\.(?:m?js)$/i.test(url.pathname)) ||
					(resourceType === 'stylesheet' && url.pathname.startsWith('/_app/immutable/')));
			if (resourceType === 'script' && requestRecord) {
				const references = allowedAsset
					? scriptReferencesByRecord.get(requestRecord)
					: blockedScriptReferencesByRecord.get(requestRecord);
				references?.add(url.href);
				if (!allowedAsset && sameAuditHost) {
					scriptFailuresByRecord.get(requestRecord)?.push('same_site_script_blocked');
				}
			}
			if (!allowedAsset) {
				await route.abort('blockedbyclient');
				return;
			}
			let assetRequest = assetCache.get(url.href);
			if (!assetRequest) {
				const accept =
					resourceType === 'stylesheet'
						? 'text/css,*/*;q=0.1'
						: 'text/javascript,application/javascript;q=0.9,*/*;q=0.5';
				assetRequest = assetSemaphore.run(() =>
					fetchWithRedirects(url.href, {
						fetchImpl,
						gate,
						origin,
						userAgent: USER_AGENTS.desktop,
						timeoutMs,
						maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
						accept,
						targetPolicy: isPublicAuditTarget
					})
				);
				assetCache.set(url.href, assetRequest);
			}
			const result = await assetRequest;
			if (resourceType === 'script') {
				const successful =
					!result.error && result.status !== null && result.status >= 200 && result.status < 300;
				const measurement = {
					url: url.href,
					bytes: successful && Number.isFinite(result.rawBytes) ? result.rawBytes : null,
					source: successful ? 'render_downloaded' : '',
					error: result.error || (successful ? '' : `HTTP_${result.status}`)
				};
				scriptAssetMeasurements.set(url.href, measurement);
				if (!successful && requestRecord) {
					scriptFailuresByRecord
						.get(requestRecord)
						?.push(`required_script_failed:${url.pathname}:${measurement.error}`);
				}
			}
			if (result.error || result.status === null) {
				await route.abort('failed');
				return;
			}
			await route.fulfill({
				status: result.status,
				headers: {
					'content-type':
						result.contentType ||
						(resourceType === 'stylesheet'
							? 'text/css; charset=utf-8'
							: 'text/javascript; charset=utf-8'),
					'cache-control': 'public, max-age=31536000, immutable'
				},
				body: result.body
			});
		});
		const page = await context.newPage();
		page.on?.('pageerror', (error) => {
			if (!activeDocument) return;
			pageErrorsByRecord
				.get(activeDocument)
				?.push(boundedDiagnosticText(error instanceof Error ? error.message : String(error), 160));
		});
		for (const [index, record] of targets.entries()) {
			try {
				activeDocument = record;
				await page.goto(record.fetch.finalUrl, {
					waitUntil: 'domcontentloaded',
					timeout: renderNavigationTimeoutMs
				});
				await page.waitForLoadState('networkidle', { timeout: renderNavigationTimeoutMs });
				const scriptReferences = [...(scriptReferencesByRecord.get(record) ?? [])].sort();
				const successfulScriptPaths = new Set(
					scriptReferences
						.filter((url) => {
							const measurement = scriptAssetMeasurements.get(url);
							return Number.isFinite(measurement?.bytes) && !measurement.error;
						})
						.map((url) => new URL(url).pathname)
				);
				const renderFailureCodes = [];
				if ((scriptFailuresByRecord.get(record)?.length ?? 0) > 0)
					renderFailureCodes.push('required_script_request_failure');
				if ((pageErrorsByRecord.get(record)?.length ?? 0) > 0)
					renderFailureCodes.push('page_error');
				if (/\/_app\/env\.js\b/.test(record.fetch.body)) {
					if (!successfulScriptPaths.has('/_app/env.js'))
						renderFailureCodes.push('svelte_env_script_missing');
					if (
						![...successfulScriptPaths].some((pathname) => pathname.startsWith('/_app/immutable/'))
					)
						renderFailureCodes.push('svelte_immutable_script_missing');
				}
				if (renderFailureCodes.length > 0) {
					throw new Error(unique(renderFailureCodes).sort().join(','));
				}
				const renderedHtml = await page.content();
				const metrics = await page.evaluate(() => {
					const visible = document.body?.innerText ?? '';
					const principal = document.querySelector('main, article')?.innerText ?? visible;
					const links = Array.from(document.querySelectorAll('a[href]'), (anchor) => {
						const rawHref = anchor.getAttribute('href') ?? '';
						let parsed;
						try {
							// SVG anchors expose `href` as SVGAnimatedString; stringifying that
							// object creates a bogus `/[object SVGAnimatedString]` graph target.
							// The serialized attribute is the durable source for both HTML and SVG.
							parsed = new URL(rawHref, document.baseURI);
						} catch {
							return null;
						}
						if (['mailto:', 'tel:', 'javascript:', 'data:'].includes(parsed.protocol)) return null;
						parsed.hash = '';
						let hidden = false;
						for (let element = anchor; element && !hidden; element = element.parentElement) {
							const style = getComputedStyle(element);
							hidden =
								element.hidden ||
								element.getAttribute('aria-hidden') === 'true' ||
								style.display === 'none' ||
								style.visibility === 'hidden' ||
								Number.parseFloat(style.opacity || '1') === 0;
						}
						let context = 'body';
						if (
							anchor.closest('[aria-label*="breadcrumb" i], .breadcrumb, [class*="breadcrumb"]')
						) {
							context = 'breadcrumb';
						} else if (
							anchor.closest('[aria-label*="pagination" i], .pagination, [class*="pagination"]')
						) {
							context = 'pagination';
						} else if (anchor.closest('[data-related], .related, [class*="related"]')) {
							context = 'related_widget';
						} else {
							const landmark = anchor.closest('main, article, nav, aside, footer, header');
							if (landmark) context = landmark.tagName.toLowerCase();
						}
						const anchorText = (anchor.innerText || anchor.textContent || '')
							.replace(/\s+/g, ' ')
							.trim();
						return {
							url: parsed.href,
							href: rawHref,
							internal: parsed.origin === location.origin,
							nofollow: (anchor.getAttribute('rel') ?? '')
								.toLowerCase()
								.split(/\s+/)
								.includes('nofollow'),
							hidden,
							anchorText,
							anchorTextNormalized: anchorText.toLocaleLowerCase('en'),
							context,
							evidence: 'rendered_dom'
						};
					}).filter(Boolean);
					return { visible, principal, links };
				});
				record.render = {
					status: 'rendered',
					htmlLength: Buffer.byteLength(renderedHtml),
					visibleWordCount: countWords(metrics.visible),
					principalWordCount: countWords(metrics.principal),
					links: metrics.links,
					scriptReferences,
					blockedScriptReferences: [...(blockedScriptReferencesByRecord.get(record) ?? [])].sort(),
					scriptAssets: scriptReferences.map((url) => scriptAssetMeasurements.get(url)),
					error: ''
				};
				rendered += 1;
			} catch (error) {
				record.render = {
					status: 'failed',
					htmlLength: null,
					visibleWordCount: null,
					principalWordCount: null,
					scriptReferences: [...(scriptReferencesByRecord.get(record) ?? [])].sort(),
					blockedScriptReferences: [...(blockedScriptReferencesByRecord.get(record) ?? [])].sort(),
					scriptAssets: [...(scriptReferencesByRecord.get(record) ?? [])]
						.sort()
						.map((url) => scriptAssetMeasurements.get(url)),
					error: error instanceof Error ? error.message : String(error)
				};
				failed += 1;
			}
			onProgress?.({ completed: index + 1, total: targets.length, url: record.requestedUrl });
		}
		await context.close();
	} finally {
		await browser.close();
	}
	return { rendered, failed, warning: '' };
}

export async function measureJavaScriptBundles(
	recordsInput,
	{
		mode = 'full',
		origin = SITE_ORIGIN,
		fetchImpl = fetch,
		gate = createRateGate(),
		concurrency = DEFAULT_CONCURRENCY,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		onProgress = null
	} = {}
) {
	const records = recordsInput instanceof Map ? [...recordsInput.values()] : [...recordsInput];
	if (mode === 'off') {
		for (const record of records) {
			record.jsBundleBytes = null;
			record.jsBundleReferences = [];
			record.jsBundleMeasurementStatus = 'disabled';
			record.jsBundleUnmeasuredReferenceCount = unique([
				...record.analysis.scriptReferences,
				...(record.render?.scriptReferences ?? []),
				...(record.render?.blockedScriptReferences ?? [])
			]).length;
		}
		return new Map();
	}
	const sizeByUrl = new Map();
	for (const record of records) {
		for (const measurement of record.render?.scriptAssets ?? []) {
			if (measurement?.url) sizeByUrl.set(measurement.url, measurement);
		}
	}
	const references = unique(
		records
			.flatMap((record) => [
				...record.analysis.scriptReferences,
				...(record.render?.scriptReferences ?? []),
				...(record.render?.blockedScriptReferences ?? [])
			])
			.filter((url) => allowedFetchTarget(url, origin) && isPublicAuditTarget(url, origin))
	).sort();
	const missingReferences = references.filter((url) => !Number.isFinite(sizeByUrl.get(url)?.bytes));
	const measurements = await mapConcurrent(missingReferences, concurrency, async (url, index) => {
		const head = await fetchWithRedirects(url, {
			fetchImpl,
			gate,
			origin,
			timeoutMs,
			method: 'HEAD',
			accept: 'text/javascript,application/javascript;q=0.9,*/*;q=0.5',
			targetPolicy: isPublicAuditTarget
		});
		let bytes =
			head.status !== null && head.status >= 200 && head.status < 400
				? Number.parseInt(head.headers['content-length'] ?? '', 10)
				: Number.NaN;
		let source = Number.isFinite(bytes) ? 'content-length' : '';
		let error = head.error;
		if (!Number.isFinite(bytes) && mode === 'full') {
			const get = await fetchWithRedirects(url, {
				fetchImpl,
				gate,
				origin,
				timeoutMs,
				maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
				accept: 'text/javascript,application/javascript;q=0.9,*/*;q=0.5',
				targetPolicy: isPublicAuditTarget
			});
			bytes = get.status === 200 && !get.error ? get.rawBytes : Number.NaN;
			source = Number.isFinite(bytes) ? 'downloaded' : '';
			error = get.error;
		}
		onProgress?.({ completed: index + 1, total: missingReferences.length, url });
		return [url, { url, bytes: Number.isFinite(bytes) ? bytes : null, source, error }];
	});
	for (const [url, measurement] of measurements) sizeByUrl.set(url, measurement);
	for (const record of records) {
		const referencesForPage = unique([
			...record.analysis.scriptReferences,
			...(record.render?.scriptReferences ?? []),
			...(record.render?.blockedScriptReferences ?? [])
		]).sort();
		const measuredReferences = referencesForPage.filter(
			(url) => allowedFetchTarget(url, origin) && isPublicAuditTarget(url, origin)
		);
		const blockedReferences = referencesForPage.filter(
			(url) => !allowedFetchTarget(url, origin) || !isPublicAuditTarget(url, origin)
		);
		const unresolvedInternal = measuredReferences.filter(
			(url) => !Number.isFinite(sizeByUrl.get(url)?.bytes)
		);
		record.jsBundleReferences = measuredReferences;
		record.jsBundleUnmeasuredReferenceCount = blockedReferences.length + unresolvedInternal.length;
		if (blockedReferences.length > 0) {
			record.jsBundleBytes = null;
			record.jsBundleMeasurementStatus = 'partial_external_or_blocked_scripts_unmeasured';
		} else if (unresolvedInternal.length > 0) {
			record.jsBundleBytes = null;
			record.jsBundleMeasurementStatus = 'incomplete_internal_script_measurement';
		} else {
			record.jsBundleBytes = measuredReferences.reduce(
				(sum, url) => sum + sizeByUrl.get(url).bytes,
				0
			);
			record.jsBundleMeasurementStatus = 'measured';
		}
	}
	return sizeByUrl;
}

function mixedCasePath(url) {
	const parsed = new URL(url);
	const characters = [...parsed.pathname];
	const index = characters.findIndex((character) => /[a-z]/.test(character));
	if (index === -1) return '';
	characters[index] = characters[index].toUpperCase();
	parsed.pathname = characters.join('');
	return parsed.href;
}

export function buildVariantProbes(recordsInput, { origin = SITE_ORIGIN, pathLimit = 5 } = {}) {
	const records = recordsInput instanceof Map ? [...recordsInput.values()] : [...recordsInput];
	const canonical = unique(
		records
			.filter(indexableWithoutCanonicalChecks)
			.map((record) => recordCanonicalUrl(record, origin))
			.filter((url) => allowedFetchTarget(url, origin))
	).sort();
	const preferred = [
		normalizeAuditUrl(origin, origin),
		normalizeAuditUrl('/contact', origin),
		normalizeAuditUrl('/resume', origin),
		normalizeAuditUrl('/consulting', origin),
		normalizeAuditUrl('/blog', origin)
	];
	const targets = unique([
		...preferred.filter((url) => canonical.includes(url)),
		...canonical
	]).slice(0, pathLimit);
	const probes = [];
	const add = (requestedUrl, baselineUrl, variantType) => {
		if (!requestedUrl || probes.some((probe) => probe.requestedUrl === requestedUrl)) return;
		probes.push({ requestedUrl, baselineUrl, variantType });
	};
	for (const baselineUrl of targets) {
		const parsed = new URL(baselineUrl);
		if (parsed.pathname === '/') {
			const http = new URL(baselineUrl);
			http.protocol = 'http:';
			add(http.href, baselineUrl, 'http');
			const apex = new URL(baselineUrl);
			apex.hostname = apex.hostname.replace(/^www\./, '');
			add(apex.href, baselineUrl, 'apex');
		}
		const slash = new URL(baselineUrl);
		slash.pathname = slash.pathname === '/' ? '/' : `${slash.pathname.replace(/\/$/, '')}/`;
		add(slash.href, baselineUrl, 'trailing_slash');
		add(mixedCasePath(baselineUrl), baselineUrl, 'mixed_case');
		const query = new URL(baselineUrl);
		query.searchParams.set('audit_variant', '1');
		add(query.href, baselineUrl, 'query_string');
	}
	return probes;
}

export async function crawlVariantProbes(
	probes,
	{
		origin = SITE_ORIGIN,
		fetchImpl = fetch,
		gate = createRateGate(),
		concurrency = DEFAULT_CONCURRENCY,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		maxBodyBytes = DEFAULT_MAX_BODY_BYTES
	} = {}
) {
	return mapConcurrent(probes, concurrency, async (probe) => {
		const fetchResult = await fetchWithRedirects(probe.requestedUrl, {
			fetchImpl,
			gate,
			origin,
			timeoutMs,
			maxBodyBytes,
			allowApex: true,
			targetPolicy: isPublicAuditTarget
		});
		return { ...probe, record: makeCrawlRecord(fetchResult, null, origin) };
	});
}

export function assertVariantFetchCompleteness(variantResults) {
	assertFetchCompleteness(
		'URL variant probes',
		variantResults.map((result) => ({
			requestedUrl: result.record.fetch.requestedUrl ?? result.requestedUrl,
			status: result.record.fetch.status,
			error: result.record.fetch.error
		})),
		{ partialResult: 'variant report' }
	);
}

function variantConsolidatesToBaseline(candidate, baselineCanonical, origin) {
	if (!baselineCanonical) return false;
	let expected;
	try {
		expected = exactAuditUrlIdentity(baselineCanonical, origin);
	} catch {
		return false;
	}
	try {
		if (
			candidate.fetch.redirects.length > 0 &&
			exactAuditUrlIdentity(candidate.fetch.finalUrl, origin) === expected
		) {
			return true;
		}
		return Boolean(
			candidate.analysis.canonicalUrl &&
			exactAuditUrlIdentity(candidate.analysis.canonicalUrl, origin) === expected
		);
	} catch {
		return false;
	}
}

function canonicalCycles(records, origin) {
	const graph = new Map();
	for (const record of records) {
		if (!record.analysis.canonicalUrl) continue;
		let source;
		let target;
		try {
			source = normalizeAuditUrl(record.fetch.finalUrl, origin);
			target = normalizeAuditUrl(record.analysis.canonicalUrl, origin);
		} catch {
			continue;
		}
		if (source !== target) graph.set(source, target);
	}
	const cycleNodes = new Set();
	for (const start of graph.keys()) {
		const order = [];
		const positions = new Map();
		let current = start;
		while (graph.has(current)) {
			if (positions.has(current)) {
				for (const node of order.slice(positions.get(current))) cycleNodes.add(node);
				break;
			}
			positions.set(current, order.length);
			order.push(current);
			current = graph.get(current);
		}
	}
	return cycleNodes;
}

function addIssue(record, code) {
	if (code && !record.issueCodes.includes(code)) record.issueCodes.push(code);
}

function duplicateGroups(records, valueForRecord) {
	const groups = new Map();
	for (const record of records.filter(indexableWithoutCanonicalChecks)) {
		const value = normalizeWhitespace(valueForRecord(record)).toLocaleLowerCase('en');
		if (!value) continue;
		const group = groups.get(value) ?? [];
		group.push(record);
		groups.set(value, group);
	}
	return [...groups.values()].filter((group) => group.length > 1);
}

function findNormalRecord(records, value, origin) {
	let normalized;
	try {
		normalized = normalizeAuditUrl(value, origin);
	} catch {
		return null;
	}
	return (
		records.find((record) => normalizeAuditUrl(record.requestedUrl, origin) === normalized) ??
		records.find((record) => normalizeAuditUrl(record.fetch.finalUrl, origin) === normalized) ??
		null
	);
}

export function applyIssueDetection(
	recordsInput,
	{ origin = SITE_ORIGIN, userAgentResults = [], variantResults = [], graph = null } = {}
) {
	const records = recordsInput instanceof Map ? [...recordsInput.values()] : [...recordsInput];
	for (const record of records) record.issueCodes = [];
	const cycles = canonicalCycles(records, origin);
	for (const record of records) {
		const sources = record.inventory?.sources ?? new Set();
		const directives = parseRobotsDirectives(
			record.analysis.robots,
			record.analysis.googlebot,
			record.fetch.headers['x-robots-tag']
		);
		if (record.fetch.error) addIssue(record, `FETCH_ERROR:${record.fetch.error}`);
		if (record.fetch.status >= 500) addIssue(record, 'HTTP_5XX');
		else if (record.fetch.status >= 400) addIssue(record, 'HTTP_4XX');
		if (record.fetch.redirects.length > 1) addIssue(record, 'REDIRECT_CHAIN');
		if (record.fetch.error === 'redirect_loop') addIssue(record, 'REDIRECT_LOOP');
		if (record.fetch.status === 200 && record.analysis.soft404TextDetected)
			addIssue(record, 'SOFT_404_REVIEW');
		if (record.fetch.status === 200 && record.analysis.challengeDetected)
			addIssue(record, 'BOT_CHALLENGE_OR_WAF_REVIEW');
		if (directives.has('noindex')) {
			addIssue(
				record,
				[...sources].some((source) =>
					/sitemap|post|resource|static_route|topic_headquarters/.test(source)
				)
					? 'ACCIDENTAL_NOINDEX_REVIEW'
					: 'NOINDEX'
			);
		}
		if (
			robotsConflict(
				record.analysis.robots,
				record.analysis.googlebot,
				record.fetch.headers['x-robots-tag']
			)
		) {
			addIssue(record, 'CONFLICTING_ROBOTS_DIRECTIVES');
		}
		if (
			record.fetch.status === 200 &&
			looksLikeHtml(record.fetch) &&
			!record.analysis.canonicalUrl
		) {
			addIssue(record, 'MISSING_CANONICAL');
		}
		if (record.analysis.canonicalUrl) {
			if (!allowedFetchTarget(record.analysis.canonicalUrl, origin)) {
				addIssue(record, 'EXTERNAL_CANONICAL_REVIEW');
			} else {
				const canonicalTarget = findNormalRecord(records, record.analysis.canonicalUrl, origin);
				if (canonicalTarget?.fetch.redirects.length)
					addIssue(record, 'CANONICAL_POINTS_TO_REDIRECT');
				if (canonicalTarget?.fetch.status >= 400) addIssue(record, 'CANONICAL_POINTS_TO_ERROR');
				let finalUrl = '';
				let canonicalUrl = '';
				try {
					finalUrl = normalizeAuditUrl(record.fetch.finalUrl, origin);
					canonicalUrl = normalizeAuditUrl(record.analysis.canonicalUrl, origin);
				} catch {
					addIssue(record, 'INVALID_CANONICAL');
				}
				if (cycles.has(finalUrl)) addIssue(record, 'CANONICAL_LOOP');
				if (
					finalUrl &&
					canonicalUrl &&
					finalUrl !== canonicalUrl &&
					!record.fetch.redirects.length
				) {
					addIssue(record, 'CANONICAL_DIFFERENT_PATH_REVIEW');
				}
			}
		}
		if (sources.has('main_sitemap') || sources.has('notes_sitemap')) {
			if (record.fetch.redirects.length) addIssue(record, 'SITEMAP_URL_REDIRECTS');
			try {
				if (
					record.analysis.canonicalUrl &&
					normalizeAuditUrl(record.analysis.canonicalUrl, origin) !==
						normalizeAuditUrl(record.fetch.finalUrl, origin)
				) {
					addIssue(record, 'SITEMAP_URL_NOT_CANONICAL');
				}
			} catch {
				addIssue(record, 'SITEMAP_URL_INVALID_CANONICAL');
			}
		}
		if (
			indexableWithoutCanonicalChecks(record) &&
			record.inventory?.canonicalCandidate &&
			!sources.has('main_sitemap') &&
			!sources.has('notes_sitemap')
		) {
			addIssue(record, 'CANONICAL_ABSENT_FROM_SITEMAP');
		}
		if (hasSourceRecord(sources) && (record.fetch.status === null || record.fetch.status >= 400)) {
			addIssue(record, 'SOURCE_WITHOUT_PRODUCTION_URL');
		}
		if (
			[...sources].some((source) => /sitemap|homepage/.test(source)) &&
			!hasSourceRecord(sources)
		) {
			addIssue(record, 'PRODUCTION_URL_WITHOUT_SOURCE_RECORD');
		}
		if (
			record.render.status === 'rendered' &&
			(record.render.principalWordCount ?? 0) >= 80 &&
			record.analysis.principalWordCount < Math.max(40, record.render.principalWordCount * 0.35)
		) {
			addIssue(record, 'PRINCIPAL_CONTENT_REQUIRES_JAVASCRIPT');
		}
		if (record.analysis.hiddenInternalLinkCount > 0)
			addIssue(record, 'HIDDEN_INTERNAL_LINKS_REVIEW');
		if (
			record.analysis.jsonLd.parseStatus === 'invalid' ||
			record.analysis.jsonLd.parseStatus === 'partial'
		) {
			addIssue(record, 'JSON_LD_PARSE_ERROR');
		}
		if (record.analysis.jsonLd.danglingReferences.length)
			addIssue(record, 'JSON_LD_DANGLING_REFERENCE');
		if (record.analysis.danglingFragmentReferences.length)
			addIssue(record, 'DANGLING_FRAGMENT_REFERENCE');
	}
	for (const group of duplicateGroups(records, (record) => record.analysis.title)) {
		for (const record of group) addIssue(record, 'DUPLICATE_TITLE');
	}
	for (const group of duplicateGroups(records, (record) => record.analysis.description)) {
		for (const record of group) addIssue(record, 'DUPLICATE_META_DESCRIPTION');
	}
	for (const group of duplicateGroups(records, (record) => recordCanonicalUrl(record, origin))) {
		const finalUrls = new Set(
			group.map((record) => normalizeAuditUrl(record.fetch.finalUrl, origin))
		);
		if (finalUrls.size <= 1) continue;
		for (const record of group) addIssue(record, 'MULTIPLE_INDEXABLE_URLS_OR_DUPLICATE_CANONICAL');
	}
	for (const result of userAgentResults) {
		const normal = findNormalRecord(records, result.url, origin);
		if (!normal || result.userAgentKey === 'desktop') continue;
		if (result.comparison.materiallyDifferent)
			addIssue(normal, 'MATERIAL_USER_AGENT_DIFFERENCE_REVIEW');
		if (
			result.record.analysis.challengeDetected ||
			[403, 429, 503].includes(result.record.fetch.status)
		) {
			addIssue(normal, 'BOT_CHALLENGE_OR_WAF_REVIEW');
		}
	}
	for (const result of variantResults) {
		const normal = findNormalRecord(records, result.baselineUrl, origin);
		if (!normal) continue;
		const candidate = result.record;
		const baselineCanonical = recordCanonicalUrl(normal, origin);
		const consolidates = variantConsolidatesToBaseline(candidate, baselineCanonical, origin);
		if (!consolidates && candidate.fetch.status === 200) {
			addIssue(normal, `INDEXABLE_${result.variantType.toUpperCase()}_VARIANT_REVIEW`);
		}
	}
	for (const record of records) record.issueCodes.sort();
	if (graph) {
		for (const record of records) {
			if (record.fetch.redirects.length > 0) continue;
			const metrics = graph.metrics.get(recordCanonicalUrl(record, origin));
			if (metrics?.orphan) addIssue(record, 'ORPHAN_CANONICAL_URL');
			if (metrics?.nearOrphan) addIssue(record, 'NEAR_ORPHAN_CANONICAL_URL');
			if (metrics?.deadEnd) addIssue(record, 'DEAD_END_CANONICAL_URL');
			if (metrics?.linkEvidence === 'server_rendered_html_fallback')
				addIssue(record, 'INTERNAL_GRAPH_RENDER_FALLBACK');
			if (metrics && !metrics.reachableFromHomepage)
				addIssue(record, 'NOT_REACHABLE_FROM_HOMEPAGE');
			record.issueCodes.sort();
		}
	}
	return records;
}

function recordIsIndexable(record) {
	return indexableWithoutCanonicalChecks(record);
}

function graphMetricsForRecord(record, graph, origin) {
	return (
		(record.fetch.redirects.length === 0
			? graph.metrics.get(recordCanonicalUrl(record, origin))
			: null) ?? {
			inDegree: 0,
			outDegree: 0,
			inboundInternalLinkCount: 0,
			outboundInternalLinkCount: 0,
			uniqueSourcePages: 0,
			pageRank: 0,
			depth: null,
			reachableFromHomepage: false,
			orphan: false,
			nearOrphan: false,
			orphanStatus: 'not_in_canonical_graph',
			deadEnd: false,
			componentId: '',
			componentSize: 0,
			topicCluster: '',
			linksFromHubs: 0,
			linksFromObservedHighTrafficPages: 0,
			anchorTextDistribution: [],
			observed28dVisitors: null,
			observedHighTraffic: false,
			linkEvidence: 'not_in_canonical_graph'
		}
	);
}

export function principalContentWithoutJavaScript(record) {
	if (record.render.status !== 'rendered') return record.analysis.principalContentInRawHtml;
	const rawWords = record.analysis.principalWordCount;
	const renderedWords = record.render.principalWordCount ?? 0;
	if (renderedWords === 0) return rawWords > 0;
	if (renderedWords < 40) return rawWords > 0 && rawWords >= renderedWords * 0.5;
	return rawWords >= 40 && rawWords >= renderedWords * 0.35;
}

function inventoryRows(records, graph, origin) {
	return records
		.slice()
		.sort((left, right) => left.requestedUrl.localeCompare(right.requestedUrl))
		.map((record) => {
			const entry = record.inventory ?? {
				sources: new Set(),
				sourceFiles: new Set(),
				lastModified: new Set(),
				strata: new Set(),
				canonicalCandidate: false
			};
			const metrics = graphMetricsForRecord(record, graph, origin);
			const sources = [...entry.sources].sort();
			return {
				requested_url: record.requestedUrl,
				final_url: record.fetch.finalUrl,
				redirect_chain: record.fetch.redirectChain,
				redirect_hops: record.fetch.redirects.length,
				http_status: record.fetch.status,
				content_type: record.fetch.contentType,
				response_time_ms: record.fetch.networkMs,
				crawl_elapsed_ms_including_rate_limit: record.fetch.totalMs,
				canonical_url: record.analysis.canonicalUrl,
				robots_meta: record.analysis.robots,
				googlebot_meta: record.analysis.googlebot,
				x_robots_tag: record.fetch.headers['x-robots-tag'] ?? '',
				title: record.analysis.title,
				title_length: record.analysis.titleLength,
				meta_description: record.analysis.description,
				meta_description_length: record.analysis.descriptionLength,
				h1_count: record.analysis.h1Count,
				h1_text: record.analysis.h1Text,
				html_lang: record.analysis.htmlLang,
				visible_author: record.analysis.visibleAuthor,
				visible_publication_date: record.analysis.publicationDate,
				visible_modification_or_review_date: record.analysis.modificationOrReviewDate,
				og_title: record.analysis.openGraph.title,
				og_description: record.analysis.openGraph.description,
				og_image: record.analysis.openGraph.image,
				og_type: record.analysis.openGraph.type,
				og_url: record.analysis.openGraph.url,
				twitter_card: record.analysis.twitter.card,
				twitter_title: record.analysis.twitter.title,
				twitter_description: record.analysis.twitter.description,
				twitter_image: record.analysis.twitter.image,
				twitter_site: record.analysis.twitter.site,
				twitter_creator: record.analysis.twitter.creator,
				json_ld_types: record.analysis.jsonLd.types,
				json_ld_parse_status: record.analysis.jsonLd.parseStatus,
				json_ld_ids: record.analysis.jsonLd.ids,
				json_ld_dangling_references: record.analysis.jsonLd.danglingReferences,
				dom_id_count: record.analysis.domIds.length,
				dangling_fragment_references: record.analysis.danglingFragmentReferences,
				approx_visible_words: record.fetch.bodyReadWarning
					? null
					: record.analysis.visibleWordCount,
				raw_html_length_bytes: record.fetch.bodyReadWarning ? null : record.analysis.rawHtmlLength,
				raw_response_bytes: record.fetch.rawBytes,
				raw_body_truncated: record.fetch.bodyTruncated,
				body_read_warning: record.fetch.bodyReadWarning ?? '',
				render_status: record.render.status,
				rendered_html_length_bytes: record.render.htmlLength,
				rendered_visible_words: record.render.visibleWordCount,
				body_content_sha256: record.analysis.bodyContentHash,
				internal_link_count: record.analysis.internalLinkCount,
				external_link_count: record.analysis.externalLinkCount,
				image_count: record.analysis.imageCount,
				missing_or_empty_image_alt_count: record.analysis.imageMissingOrEmptyAltCount,
				filename_derived_alt_count: record.analysis.filenameDerivedAltCount,
				images_missing_intrinsic_dimensions_count:
					record.analysis.imagesMissingIntrinsicDimensionsCount,
				video_count: record.analysis.videoCount,
				videos_lacking_captions_transcript_or_summary_count:
					record.analysis.videosMissingCaptionsTranscriptOrSummaryCount,
				javascript_bundle_bytes: record.jsBundleBytes,
				javascript_bundle_references: record.jsBundleReferences,
				javascript_bundle_measurement_status: record.jsBundleMeasurementStatus,
				javascript_bundle_unmeasured_reference_count: record.jsBundleUnmeasuredReferenceCount,
				principal_content_without_javascript: principalContentWithoutJavaScript(record),
				in_main_sitemap: sources.includes('main_sitemap'),
				in_notes_sitemap: sources.includes('notes_sitemap'),
				in_any_sitemap: sources.includes('main_sitemap') || sources.includes('notes_sitemap'),
				in_rss: sources.includes('rss'),
				in_source: hasSourceRecord(sources),
				discovered_from_homepage: sources.includes('homepage'),
				sources,
				source_files: [...entry.sourceFiles].sort(),
				source_last_modified: [...entry.lastModified].sort(),
				strata: [...entry.strata].sort(),
				another_internal_page_links_to_it: metrics.inDegree > 0,
				click_depth_from_homepage: metrics.depth,
				internal_in_degree: metrics.inDegree,
				internal_out_degree: metrics.outDegree,
				internal_pagerank: rounded(metrics.pageRank, 10),
				reachable_from_homepage: metrics.reachableFromHomepage,
				indexable: recordIsIndexable(record),
				issues: record.issueCodes,
				crawl_error: record.fetch.error,
				render_error: record.render.error
			};
		});
}

function indexabilityRows(records, graph, origin) {
	return records
		.slice()
		.sort((left, right) => left.requestedUrl.localeCompare(right.requestedUrl))
		.map((record) => {
			const metrics = graphMetricsForRecord(record, graph, origin);
			const directives = parseRobotsDirectives(
				record.analysis.robots,
				record.analysis.googlebot,
				record.fetch.headers['x-robots-tag']
			);
			return {
				requested_url: record.requestedUrl,
				final_url: record.fetch.finalUrl,
				http_status: record.fetch.status,
				is_html: looksLikeHtml(record.fetch),
				canonical_url: record.analysis.canonicalUrl,
				indexable: recordIsIndexable(record),
				noindex: directives.has('noindex'),
				nofollow: directives.has('nofollow'),
				robots_conflict: robotsConflict(
					record.analysis.robots,
					record.analysis.googlebot,
					record.fetch.headers['x-robots-tag']
				),
				soft_404_review: record.issueCodes.includes('SOFT_404_REVIEW'),
				bot_challenge_or_waf_review: record.issueCodes.includes('BOT_CHALLENGE_OR_WAF_REVIEW'),
				principal_content_without_javascript: principalContentWithoutJavaScript(record),
				in_any_sitemap:
					record.inventory?.sources.has('main_sitemap') ||
					record.inventory?.sources.has('notes_sitemap') ||
					false,
				click_depth_from_homepage: metrics.depth,
				issues: record.issueCodes
			};
		});
}

function redirectRows(records) {
	return records
		.flatMap((record) =>
			record.fetch.redirects.map((redirect, index) => ({
				requested_url: record.requestedUrl,
				hop: index + 1,
				from_url: redirect.from,
				status: redirect.status,
				location_header: redirect.location,
				to_url: redirect.to,
				response_time_ms: redirect.responseMs,
				crawl_elapsed_ms_including_rate_limit: record.fetch.totalMs,
				final_url: record.fetch.finalUrl,
				total_hops: record.fetch.redirects.length,
				loop_or_error: record.fetch.error
			}))
		)
		.sort(
			(left, right) => left.requested_url.localeCompare(right.requested_url) || left.hop - right.hop
		);
}

function sitemapReconciliationRows(inventory, records, origin) {
	return [...inventory.values()]
		.sort((left, right) => left.url.localeCompare(right.url))
		.map((entry) => {
			const record = findNormalRecord(records, entry.url, origin);
			const sources = [...entry.sources].sort();
			const inSource = hasSourceRecord(sources);
			const issues = record?.issueCodes ?? [];
			return {
				url: entry.url,
				in_main_sitemap: sources.includes('main_sitemap'),
				in_notes_sitemap: sources.includes('notes_sitemap'),
				in_rss: sources.includes('rss'),
				in_source: inSource,
				discovered_from_homepage: sources.includes('homepage'),
				canonical_candidate: entry.canonicalCandidate,
				http_status: record?.fetch.status ?? '',
				final_url: record?.fetch.finalUrl ?? '',
				declared_canonical: record?.analysis.canonicalUrl ?? '',
				source_files: [...entry.sourceFiles].sort(),
				sources,
				issues
			};
		});
}

function structuredDataRows(records) {
	return records
		.filter((record) => looksLikeHtml(record.fetch))
		.sort((left, right) => left.requestedUrl.localeCompare(right.requestedUrl))
		.map((record) => ({
			url: record.fetch.finalUrl,
			requested_url: record.requestedUrl,
			script_count: record.analysis.jsonLd.scriptCount,
			parse_status: record.analysis.jsonLd.parseStatus,
			parse_errors: record.analysis.jsonLd.errors,
			entity_types: record.analysis.jsonLd.types,
			ids: record.analysis.jsonLd.ids,
			definition_ids: record.analysis.jsonLd.definitionIds,
			reference_ids: record.analysis.jsonLd.referenceIds,
			dangling_references: record.analysis.jsonLd.danglingReferences,
			dom_id_count: record.analysis.domIds.length,
			dangling_fragment_references: record.analysis.danglingFragmentReferences
		}));
}

function mediaRows(records) {
	return records
		.filter((record) => looksLikeHtml(record.fetch))
		.sort((left, right) => left.requestedUrl.localeCompare(right.requestedUrl))
		.map((record) => ({
			url: record.fetch.finalUrl,
			requested_url: record.requestedUrl,
			image_count: record.analysis.imageCount,
			missing_or_empty_alt_count: record.analysis.imageMissingOrEmptyAltCount,
			filename_derived_alt_count: record.analysis.filenameDerivedAltCount,
			images_missing_intrinsic_dimensions_count:
				record.analysis.imagesMissingIntrinsicDimensionsCount,
			video_or_video_embed_count: record.analysis.videoCount,
			videos_lacking_captions_transcript_or_visible_summary_count:
				record.analysis.videosMissingCaptionsTranscriptOrSummaryCount,
			javascript_bundle_reference_count: record.jsBundleReferences.length,
			javascript_bundle_bytes: record.jsBundleBytes,
			javascript_bundle_measurement_status: record.jsBundleMeasurementStatus,
			javascript_bundle_unmeasured_reference_count: record.jsBundleUnmeasuredReferenceCount,
			principal_content_without_javascript: principalContentWithoutJavaScript(record)
		}));
}

function graphEdgeRows(graph) {
	return graph.edges.map((edge) => {
		const sourceMetrics = graph.metrics.get(edge.source);
		const targetMetrics = graph.metrics.get(edge.target);
		return {
			source_url: edge.source,
			linked_url: edge.linkedUrl,
			normalized_linked_url: edge.normalizedLinkedUrl,
			raw_href: edge.rawHref,
			target_url: edge.target,
			target_resolved_via_alias: edge.targetResolvedViaAlias,
			linked_url_differs_from_canonical: edge.linkedUrlDiffersFromCanonical,
			self_canonical_target: edge.selfCanonicalTarget,
			linked_url_is_redirect: edge.linkedUrlIsRedirect,
			linked_url_redirect_status: edge.linkedUrlRedirectStatus,
			linked_url_redirect_hops_to_final: edge.linkedUrlRedirectHopsToFinal,
			linked_url_redirect_final_url: edge.linkedUrlRedirectFinalUrl,
			linked_url_is_noncanonical_variant: edge.linkedUrlIsNoncanonicalVariant,
			anchor_text: edge.anchorText,
			anchor_text_normalized: edge.anchorTextNormalized,
			link_context: edge.linkContext,
			occurrences: edge.occurrences,
			nofollow_occurrences: edge.nofollowOccurrences,
			hidden_occurrences: edge.hiddenOccurrences,
			link_evidence: edge.linkEvidence,
			source_is_hub: edge.sourceIsHub,
			source_28d_visitors: edge.sourceVisitors,
			source_is_observed_high_traffic: edge.sourceIsObservedHighTraffic,
			target_is_crawled_canonical: edge.targetCrawled,
			source_out_degree: sourceMetrics?.outDegree ?? '',
			target_in_degree: targetMetrics?.inDegree ?? '',
			source_depth: sourceMetrics?.depth ?? '',
			target_depth: targetMetrics?.depth ?? '',
			target_pagerank: targetMetrics ? rounded(targetMetrics.pageRank, 10) : ''
		};
	});
}

function orphanRows(graph, inventory) {
	return [...graph.metrics.values()]
		.filter((metrics) => metrics.orphan || metrics.nearOrphan || !metrics.reachableFromHomepage)
		.sort((left, right) => left.url.localeCompare(right.url))
		.map((metrics) => {
			const entry = inventory.get(metrics.url);
			return {
				url: metrics.url,
				inbound_internal_link_count: metrics.inboundInternalLinkCount,
				outbound_internal_link_count: metrics.outboundInternalLinkCount,
				unique_source_pages: metrics.uniqueSourcePages,
				orphan_no_internal_inlinks: metrics.orphan,
				near_orphan_one_unique_source: metrics.nearOrphan,
				orphan_status: metrics.orphanStatus,
				dead_end: metrics.deadEnd,
				reachable_from_homepage: metrics.reachableFromHomepage,
				click_depth: metrics.depth,
				in_degree: metrics.inDegree,
				out_degree: metrics.outDegree,
				weak_component_id: metrics.componentId,
				component_size: metrics.componentSize,
				pagerank: rounded(metrics.pageRank, 10),
				topic_cluster: metrics.topicCluster,
				links_from_hubs: metrics.linksFromHubs,
				links_from_observed_high_traffic_pages: metrics.linksFromObservedHighTrafficPages,
				anchor_text_distribution: metrics.anchorTextDistribution,
				observed_28d_visitors: metrics.observed28dVisitors,
				observed_high_traffic: metrics.observedHighTraffic,
				link_evidence: metrics.linkEvidence,
				in_main_sitemap: entry?.sources.has('main_sitemap') ?? false,
				in_notes_sitemap: entry?.sources.has('notes_sitemap') ?? false,
				in_source: entry ? hasSourceRecord(entry.sources) : false,
				sources: entry ? [...entry.sources].sort() : []
			};
		});
}

function depthRows(graph) {
	return [...graph.metrics.values()]
		.sort(
			(left, right) =>
				(left.depth ?? Number.POSITIVE_INFINITY) - (right.depth ?? Number.POSITIVE_INFINITY) ||
				left.url.localeCompare(right.url)
		)
		.map((metrics) => ({
			url: metrics.url,
			inbound_internal_link_count: metrics.inboundInternalLinkCount,
			outbound_internal_link_count: metrics.outboundInternalLinkCount,
			unique_source_pages: metrics.uniqueSourcePages,
			click_depth_from_homepage: metrics.depth,
			reachable_from_homepage: metrics.reachableFromHomepage,
			in_degree: metrics.inDegree,
			out_degree: metrics.outDegree,
			weak_component_id: metrics.componentId,
			component_size: metrics.componentSize,
			pagerank: rounded(metrics.pageRank, 10),
			topic_cluster: metrics.topicCluster,
			links_from_hubs: metrics.linksFromHubs,
			links_from_observed_high_traffic_pages: metrics.linksFromObservedHighTrafficPages,
			anchor_text_distribution: metrics.anchorTextDistribution,
			orphan_status: metrics.orphanStatus,
			near_orphan_status: metrics.nearOrphan,
			dead_end_status: metrics.deadEnd,
			observed_28d_visitors: metrics.observed28dVisitors,
			observed_high_traffic: metrics.observedHighTraffic,
			link_evidence: metrics.linkEvidence
		}));
}

function userAgentRows(results) {
	return results.map((result) => ({
		requested_url: result.url,
		strata: result.strata,
		user_agent_key: result.userAgentKey,
		user_agent: result.userAgent,
		final_url: result.record.fetch.finalUrl,
		redirect_chain: result.record.fetch.redirectChain,
		status: result.record.fetch.status,
		content_type: result.record.fetch.contentType,
		response_time_ms: result.record.fetch.networkMs,
		crawl_elapsed_ms_including_rate_limit: result.record.fetch.totalMs,
		canonical_url: result.record.analysis.canonicalUrl,
		robots_meta: result.record.analysis.robots,
		googlebot_meta: result.record.analysis.googlebot,
		x_robots_tag: result.record.fetch.headers['x-robots-tag'] ?? '',
		title: result.record.analysis.title,
		h1_count: result.record.analysis.h1Count,
		h1_text: result.record.analysis.h1Text,
		visible_words: result.record.fetch.bodyReadWarning
			? null
			: result.record.analysis.visibleWordCount,
		body_content_sha256: result.record.analysis.bodyContentHash,
		json_ld_types: result.record.analysis.jsonLd.types,
		challenge_detected: result.record.analysis.challengeDetected,
		body_hash_differs_from_desktop: result.comparison.bodyHashDifferent,
		word_count_delta_ratio_from_desktop: result.comparison.wordDeltaRatio,
		materially_different_from_desktop: result.comparison.materiallyDifferent,
		different_fields: result.comparison.differences,
		body_read_warning: result.record.fetch.bodyReadWarning ?? '',
		error: result.record.fetch.error
	}));
}

function variantRows(results, normalRecords, origin) {
	return results.map((result) => {
		const baseline = findNormalRecord(normalRecords, result.baselineUrl, origin);
		const candidate = result.record;
		const baselineCanonical = baseline ? recordCanonicalUrl(baseline, origin) : '';
		const consolidates = variantConsolidatesToBaseline(candidate, baselineCanonical, origin);
		return {
			variant_type: result.variantType,
			requested_url: result.requestedUrl,
			baseline_url: result.baselineUrl,
			status: candidate.fetch.status,
			redirect_chain: candidate.fetch.redirectChain,
			final_url: candidate.fetch.finalUrl,
			canonical_url: candidate.analysis.canonicalUrl,
			body_content_sha256: candidate.analysis.bodyContentHash,
			consolidates_to_baseline: consolidates,
			body_read_warning: candidate.fetch.bodyReadWarning ?? '',
			error: candidate.fetch.error
		};
	});
}

export function csvEscape(value) {
	let rendered;
	if (value === undefined || value === null) rendered = '';
	else if (Array.isArray(value)) rendered = value.join(' | ');
	else if (value instanceof Set) rendered = [...value].join(' | ');
	else if (typeof value === 'object') rendered = JSON.stringify(value);
	else rendered = String(value);
	return /[",\r\n]/.test(rendered) ? `"${rendered.replace(/"/g, '""')}"` : rendered;
}

export function toCsv(rows, columns) {
	const names = columns ?? unique(rows.flatMap((row) => Object.keys(row)));
	return (
		[
			names.map(csvEscape).join(','),
			...rows.map((row) => names.map((name) => csvEscape(row[name])).join(','))
		].join('\n') + '\n'
	);
}

export function parseCsvRows(value) {
	const rows = [];
	let row = [];
	let field = '';
	let quoted = false;
	const source = String(value ?? '');
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		if (quoted) {
			if (character === '"' && source[index + 1] === '"') {
				field += '"';
				index += 1;
			} else if (character === '"') quoted = false;
			else field += character;
			continue;
		}
		if (character === '"') quoted = true;
		else if (character === ',') {
			row.push(field);
			field = '';
		} else if (character === '\n') {
			row.push(field.replace(/\r$/, ''));
			rows.push(row);
			row = [];
			field = '';
		} else field += character;
	}
	if (quoted) throw new Error('CSV contains an unterminated quoted field.');
	if (field || row.length) {
		row.push(field.replace(/\r$/, ''));
		rows.push(row);
	}
	return rows.filter((candidate) => candidate.some((item) => item !== ''));
}

export function observedTrafficFromCsv(value, origin = SITE_ORIGIN) {
	const [header = [], ...rows] = parseCsvRows(value);
	const pathIndex = header.indexOf('path');
	const visitorsIndex = header.indexOf('visitors');
	if (pathIndex === -1 || visitorsIndex === -1) {
		throw new Error('Traffic CSV must contain path and visitors columns.');
	}
	const traffic = new Map();
	for (const row of rows) {
		const rawPath = row[pathIndex]?.trim();
		const visitors = Number.parseInt(row[visitorsIndex]?.replace(/,/g, '') ?? '', 10);
		if (!rawPath || !Number.isFinite(visitors)) continue;
		let url;
		try {
			url = normalizeAuditUrl(rawPath, origin);
		} catch {
			continue;
		}
		if (!allowedFetchTarget(url, origin)) continue;
		traffic.set(url, Math.max(traffic.get(url) ?? 0, visitors));
	}
	return traffic;
}

function countBy(values) {
	const counts = {};
	for (const value of values) counts[value ?? 'null'] = (counts[value ?? 'null'] ?? 0) + 1;
	return Object.fromEntries(
		Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
	);
}

export function buildAuditReports({
	inventory,
	records: recordsInput,
	graph,
	inputEvidence = {},
	userAgentSample = [],
	userAgentResults = [],
	variantResults = [],
	config = {},
	warnings = [],
	startedAt = new Date().toISOString(),
	completedAt = new Date().toISOString()
}) {
	const origin = config.origin ?? SITE_ORIGIN;
	const records = recordsInput instanceof Map ? [...recordsInput.values()] : [...recordsInput];
	const urls = inventoryRows(records, graph, origin);
	const indexability = indexabilityRows(records, graph, origin);
	const reconciliation = sitemapReconciliationRows(inventory, records, origin);
	const issueCounts = countBy(records.flatMap((record) => record.issueCodes));
	const uaMaterial = userAgentResults.filter(
		(result) => result.userAgentKey !== 'desktop' && result.comparison.materiallyDifferent
	);
	const bodyWarningRecords = [
		...new Set([
			...records,
			...userAgentResults.map((result) => result.record),
			...variantResults.map((result) => result.record)
		])
	].filter((record) => record.fetch.bodyReadWarning);
	const reportWarnings = [...warnings];
	if (bodyWarningRecords.length > 0) {
		reportWarnings.push(
			`PARTIAL_NON_2XX_RESPONSE_BODIES:${bodyWarningRecords.length}; status and headers retained; content fields unavailable`
		);
	}
	const summary = {
		schemaVersion: 1,
		startedAt,
		completedAt,
		origin,
		inputEvidence,
		config: {
			concurrency: config.concurrency,
			requestsPerSecond: config.requestsPerSecond,
			timeoutMs: config.timeoutMs,
			renderNavigationTimeoutMs: config.renderNavigationTimeoutMs,
			maxUrls: config.maxUrls,
			userAgentSampleSize: config.userAgentSampleSize,
			renderMode: config.renderMode,
			bundleWeightMode: config.bundleWeightMode
		},
		counts: {
			inventoryUrls: inventory.size,
			crawledUrls: records.length,
			canonicalGraphNodes: graph.nodes.length,
			renderedDomGraphNodes: graph.renderedDomNodeCount,
			serverHtmlFallbackGraphNodes: graph.fallbackNodeCount,
			internalGraphEdges: graph.edges.length,
			trafficMatchedCanonicalUrls: graph.trafficMatchedCanonicalUrls,
			observedHighTrafficCanonicalUrls: graph.highTrafficUrls.size,
			indexableUrls: indexability.filter((row) => row.indexable).length,
			nonIndexableUrls: indexability.filter((row) => !row.indexable).length,
			redirectingUrls: records.filter((record) => record.fetch.redirects.length > 0).length,
			orphanOrUnreachableUrls: [...graph.metrics.values()].filter(
				(metrics) => metrics.orphan || !metrics.reachableFromHomepage
			).length,
			userAgentSampleUrls: userAgentSample.length,
			userAgentRequests: userAgentResults.length,
			materialUserAgentDifferences: uaMaterial.length,
			variantProbes: variantResults.length,
			responseBodyWarnings: bodyWarningRecords.length
		},
		statusCounts: countBy(records.map((record) => record.fetch.status)),
		issueCounts,
		warnings: unique(reportWarnings).sort(),
		reports: REPORT_FILES,
		interpretationCaveats: [
			'A crawl shows technical accessibility and observable page output; it does not prove search-engine indexing, ranking, a manual action, or the absence of one.',
			'User-agent differences are review flags, not automatic evidence of cloaking. Dynamic or personalised output can also change hashes.',
			'Soft-404, hidden-link, and filename-derived-alt detections are heuristic and require human verification.',
			'Principal-content availability is measured from response HTML and, when rendering succeeds, compared with a same-origin, GET-only, side-effect-blocked browser render.',
			'Internal-link graph evidence is rendered DOM where rendering completed; any server-rendered HTML fallback nodes are counted explicitly.',
			'Observed 28-day page visitors are directional Vercel Analytics context, may include automation, and are not proof of organic or human demand. Alias and canonical page-path values are not added together.',
			'A body_read_warning means an HTTP error status and headers were observed but its response body was unavailable; body, hash, and word-count fields are intentionally blank and are not treated as a user-agent content difference.'
		]
	};
	return {
		'URL_INVENTORY.csv': urls,
		'INDEXABILITY.csv': indexability,
		'REDIRECTS.csv': redirectRows(records),
		'SITEMAP_RECONCILIATION.csv': reconciliation,
		'STRUCTURED_DATA.csv': structuredDataRows(records),
		'MEDIA_SEMANTICS.csv': mediaRows(records),
		'INTERNAL_LINK_GRAPH.csv': graphEdgeRows(graph),
		'ORPHANS.csv': orphanRows(graph, inventory),
		'CRAWL_DEPTH.csv': depthRows(graph),
		'USER_AGENT_SAMPLE.csv': userAgentSample.map((entry) => ({
			url: entry.url,
			strata: entry.strata
		})),
		'USER_AGENT_COMPARISON.csv': userAgentRows(userAgentResults),
		'URL_VARIANTS.csv': variantRows(variantResults, records, origin),
		'AUDIT_SUMMARY.json': summary
	};
}

const REPORT_COLUMNS = Object.freeze({
	'URL_INVENTORY.csv': [
		'requested_url',
		'final_url',
		'redirect_chain',
		'redirect_hops',
		'http_status',
		'content_type',
		'response_time_ms',
		'crawl_elapsed_ms_including_rate_limit',
		'canonical_url',
		'robots_meta',
		'googlebot_meta',
		'x_robots_tag',
		'title',
		'title_length',
		'meta_description',
		'meta_description_length',
		'h1_count',
		'h1_text',
		'html_lang',
		'visible_author',
		'visible_publication_date',
		'visible_modification_or_review_date',
		'og_title',
		'og_description',
		'og_image',
		'og_type',
		'og_url',
		'twitter_card',
		'twitter_title',
		'twitter_description',
		'twitter_image',
		'twitter_site',
		'twitter_creator',
		'json_ld_types',
		'json_ld_parse_status',
		'json_ld_ids',
		'json_ld_dangling_references',
		'dom_id_count',
		'dangling_fragment_references',
		'approx_visible_words',
		'raw_html_length_bytes',
		'raw_response_bytes',
		'raw_body_truncated',
		'body_read_warning',
		'render_status',
		'rendered_html_length_bytes',
		'rendered_visible_words',
		'body_content_sha256',
		'internal_link_count',
		'external_link_count',
		'image_count',
		'missing_or_empty_image_alt_count',
		'filename_derived_alt_count',
		'images_missing_intrinsic_dimensions_count',
		'video_count',
		'videos_lacking_captions_transcript_or_summary_count',
		'javascript_bundle_bytes',
		'javascript_bundle_references',
		'javascript_bundle_measurement_status',
		'javascript_bundle_unmeasured_reference_count',
		'principal_content_without_javascript',
		'in_main_sitemap',
		'in_notes_sitemap',
		'in_any_sitemap',
		'in_rss',
		'in_source',
		'discovered_from_homepage',
		'sources',
		'source_files',
		'source_last_modified',
		'strata',
		'another_internal_page_links_to_it',
		'click_depth_from_homepage',
		'internal_in_degree',
		'internal_out_degree',
		'internal_pagerank',
		'reachable_from_homepage',
		'indexable',
		'issues',
		'crawl_error',
		'render_error'
	],
	'INDEXABILITY.csv': [
		'requested_url',
		'final_url',
		'http_status',
		'is_html',
		'canonical_url',
		'indexable',
		'noindex',
		'nofollow',
		'robots_conflict',
		'soft_404_review',
		'bot_challenge_or_waf_review',
		'principal_content_without_javascript',
		'in_any_sitemap',
		'click_depth_from_homepage',
		'issues'
	],
	'REDIRECTS.csv': [
		'requested_url',
		'hop',
		'from_url',
		'status',
		'location_header',
		'to_url',
		'response_time_ms',
		'crawl_elapsed_ms_including_rate_limit',
		'final_url',
		'total_hops',
		'loop_or_error'
	],
	'SITEMAP_RECONCILIATION.csv': [
		'url',
		'in_main_sitemap',
		'in_notes_sitemap',
		'in_rss',
		'in_source',
		'discovered_from_homepage',
		'canonical_candidate',
		'http_status',
		'final_url',
		'declared_canonical',
		'source_files',
		'sources',
		'issues'
	],
	'STRUCTURED_DATA.csv': [
		'url',
		'requested_url',
		'script_count',
		'parse_status',
		'parse_errors',
		'entity_types',
		'ids',
		'definition_ids',
		'reference_ids',
		'dangling_references',
		'dom_id_count',
		'dangling_fragment_references'
	],
	'MEDIA_SEMANTICS.csv': [
		'url',
		'requested_url',
		'image_count',
		'missing_or_empty_alt_count',
		'filename_derived_alt_count',
		'images_missing_intrinsic_dimensions_count',
		'video_or_video_embed_count',
		'videos_lacking_captions_transcript_or_visible_summary_count',
		'javascript_bundle_reference_count',
		'javascript_bundle_bytes',
		'javascript_bundle_measurement_status',
		'javascript_bundle_unmeasured_reference_count',
		'principal_content_without_javascript'
	],
	'INTERNAL_LINK_GRAPH.csv': [
		'source_url',
		'linked_url',
		'normalized_linked_url',
		'raw_href',
		'target_url',
		'target_resolved_via_alias',
		'linked_url_differs_from_canonical',
		'self_canonical_target',
		'linked_url_is_redirect',
		'linked_url_redirect_status',
		'linked_url_redirect_hops_to_final',
		'linked_url_redirect_final_url',
		'linked_url_is_noncanonical_variant',
		'anchor_text',
		'anchor_text_normalized',
		'link_context',
		'occurrences',
		'nofollow_occurrences',
		'hidden_occurrences',
		'link_evidence',
		'source_is_hub',
		'source_28d_visitors',
		'source_is_observed_high_traffic',
		'target_is_crawled_canonical',
		'source_out_degree',
		'target_in_degree',
		'source_depth',
		'target_depth',
		'target_pagerank'
	],
	'ORPHANS.csv': [
		'url',
		'inbound_internal_link_count',
		'outbound_internal_link_count',
		'unique_source_pages',
		'orphan_no_internal_inlinks',
		'near_orphan_one_unique_source',
		'orphan_status',
		'dead_end',
		'reachable_from_homepage',
		'click_depth',
		'in_degree',
		'out_degree',
		'weak_component_id',
		'component_size',
		'pagerank',
		'topic_cluster',
		'links_from_hubs',
		'links_from_observed_high_traffic_pages',
		'anchor_text_distribution',
		'observed_28d_visitors',
		'observed_high_traffic',
		'link_evidence',
		'in_main_sitemap',
		'in_notes_sitemap',
		'in_source',
		'sources'
	],
	'CRAWL_DEPTH.csv': [
		'url',
		'inbound_internal_link_count',
		'outbound_internal_link_count',
		'unique_source_pages',
		'click_depth_from_homepage',
		'reachable_from_homepage',
		'in_degree',
		'out_degree',
		'weak_component_id',
		'component_size',
		'pagerank',
		'topic_cluster',
		'links_from_hubs',
		'links_from_observed_high_traffic_pages',
		'anchor_text_distribution',
		'orphan_status',
		'near_orphan_status',
		'dead_end_status',
		'observed_28d_visitors',
		'observed_high_traffic',
		'link_evidence'
	],
	'USER_AGENT_SAMPLE.csv': ['url', 'strata'],
	'USER_AGENT_COMPARISON.csv': [
		'requested_url',
		'strata',
		'user_agent_key',
		'user_agent',
		'final_url',
		'redirect_chain',
		'status',
		'content_type',
		'response_time_ms',
		'canonical_url',
		'robots_meta',
		'googlebot_meta',
		'x_robots_tag',
		'title',
		'h1_count',
		'h1_text',
		'visible_words',
		'body_content_sha256',
		'json_ld_types',
		'challenge_detected',
		'body_hash_differs_from_desktop',
		'word_count_delta_ratio_from_desktop',
		'materially_different_from_desktop',
		'different_fields',
		'body_read_warning',
		'error'
	],
	'URL_VARIANTS.csv': [
		'variant_type',
		'requested_url',
		'baseline_url',
		'status',
		'redirect_chain',
		'final_url',
		'canonical_url',
		'body_content_sha256',
		'consolidates_to_baseline',
		'body_read_warning',
		'error'
	]
});

export async function writeAuditReports(outputDirectory, reports) {
	await fs.mkdir(outputDirectory, { recursive: true });
	for (const filename of REPORT_FILES) {
		const payload = reports[filename];
		const target = path.join(outputDirectory, filename);
		if (filename.endsWith('.json')) {
			await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
		} else {
			await fs.writeFile(target, toCsv(payload, REPORT_COLUMNS[filename]), 'utf8');
		}
	}
	return REPORT_FILES.map((filename) => path.join(outputDirectory, filename));
}

async function fetchAuditInput(url, options) {
	return fetchWithRedirects(url, {
		fetchImpl: options.fetchImpl,
		gate: options.gate,
		origin: options.origin,
		timeoutMs: options.timeoutMs,
		maxBodyBytes: options.maxBodyBytes,
		targetPolicy: options.targetPolicy ?? isPublicAuditTarget,
		accept: 'application/xml,text/xml,application/rss+xml,text/html;q=0.8,*/*;q=0.3'
	});
}

function inputWarning(label, result) {
	if (result.error) return `${label}:${result.error}`;
	if (result.status !== 200) return `${label}:HTTP_${result.status}`;
	return '';
}

function requireAuditInput(label, result, predicate, expectation) {
	if (result.error) throw new Error(`${label} audit input failed: ${result.error}`);
	if (result.status !== 200)
		throw new Error(`${label} audit input returned HTTP ${result.status}.`);
	if (!predicate(result)) {
		throw new Error(`${label} audit input was not ${expectation}.`);
	}
}

function progressLogger(label, every = 25) {
	return ({ completed, total, pending, url, userAgent }) => {
		if (completed !== 1 && completed % every !== 0 && completed !== total) return;
		const denominator = total ? `/${total}` : pending !== undefined ? ` (${pending} pending)` : '';
		const agent = userAgent ? ` ${userAgent}` : '';
		console.log(`${label}: ${completed}${denominator}${agent} — ${url}`);
	};
}

export async function runAudit(
	config = {},
	{
		fetchImpl = fetch,
		now = () => new Date(),
		playwrightModule = null,
		logProgress = true,
		requestGate = null
	} = {}
) {
	const origin = config.origin ?? SITE_ORIGIN;
	const root = path.resolve(config.root ?? process.cwd());
	const auditDate = config.auditDate ?? dateInKolkata(now());
	const outputDirectory = path.resolve(
		config.outputDirectory ?? path.join(root, 'docs', 'audits', `traffic-${auditDate}`)
	);
	const settings = {
		origin,
		root,
		auditDate,
		outputDirectory,
		concurrency: config.concurrency ?? DEFAULT_CONCURRENCY,
		requestsPerSecond: config.requestsPerSecond ?? DEFAULT_REQUESTS_PER_SECOND,
		timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		renderNavigationTimeoutMs: Math.max(
			config.renderNavigationTimeoutMs ?? 0,
			config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			MIN_RENDER_NAVIGATION_TIMEOUT_MS
		),
		maxBodyBytes: config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
		maxUrls: config.maxUrls ?? DEFAULT_MAX_URLS,
		userAgentSampleSize: config.userAgentSampleSize ?? DEFAULT_USER_AGENT_SAMPLE_SIZE,
		renderMode: config.renderMode ?? 'all',
		bundleWeightMode: config.bundleWeightMode ?? 'full',
		runUserAgentSample: config.runUserAgentSample !== false,
		runVariants: config.runVariants !== false
	};
	if (settings.concurrency < 1 || settings.concurrency > MAX_CONCURRENCY) {
		throw new Error(`Concurrency must be between 1 and ${MAX_CONCURRENCY}.`);
	}
	if (settings.requestsPerSecond <= 0 || settings.requestsPerSecond > MAX_REQUESTS_PER_SECOND) {
		throw new Error(
			`Request rate must be greater than zero and no more than ${MAX_REQUESTS_PER_SECOND}/s.`
		);
	}
	if (settings.runUserAgentSample && settings.userAgentSampleSize < MIN_USER_AGENT_SAMPLE_SIZE) {
		throw new Error(`User-agent sample size must be at least ${MIN_USER_AGENT_SAMPLE_SIZE}.`);
	}
	if (!['all', 'sample', 'none'].includes(settings.renderMode)) {
		throw new Error('renderMode must be all, sample, or none.');
	}
	if (!['full', 'headers', 'off'].includes(settings.bundleWeightMode)) {
		throw new Error('bundleWeightMode must be full, headers, or off.');
	}
	const startedAt = now().toISOString();
	const gate = requestGate ?? createRateGate({ requestsPerSecond: settings.requestsPerSecond });
	const source = await discoverSourceUrls({ root, origin });
	const inventory = createUrlInventory(source.records, origin);
	const inputUrls = {
		main_sitemap: `${origin}/sitemap.xml`,
		notes_sitemap: `${origin}/notes/sitemap.xml`,
		rss: `${origin}/rss.xml`,
		robots: `${origin}/robots.txt`,
		homepage: `${origin}/`
	};
	const inputPairs = await mapConcurrent(
		Object.entries(inputUrls),
		settings.concurrency,
		async ([label, url]) => [
			label,
			await fetchAuditInput(url, {
				...settings,
				fetchImpl,
				gate,
				targetPolicy: label === 'homepage' ? isAuditablePageUrl : isPublicAuditTarget
			})
		]
	);
	const inputs = Object.fromEntries(inputPairs);
	requireAuditInput(
		'main_sitemap',
		inputs.main_sitemap,
		(result) => /<(?:urlset|sitemapindex)\b/i.test(result.body),
		'a recognizable sitemap document'
	);
	requireAuditInput(
		'notes_sitemap',
		inputs.notes_sitemap,
		(result) => /<(?:urlset|sitemapindex)\b/i.test(result.body),
		'a recognizable sitemap document'
	);
	requireAuditInput(
		'rss',
		inputs.rss,
		(result) => /<(?:rss|feed)\b/i.test(result.body),
		'a recognizable RSS or Atom document'
	);
	requireAuditInput(
		'robots',
		inputs.robots,
		(result) => /^\s*user-agent\s*:/im.test(result.body),
		'a recognizable robots.txt policy'
	);
	requireAuditInput('homepage', inputs.homepage, looksLikeHtml, 'an HTML document');
	const mainSitemapEntries = parseSitemapXml(inputs.main_sitemap.body, origin).filter(
		(candidate) => !candidate.isSitemapIndexEntry
	);
	const notesSitemapEntries = parseSitemapXml(inputs.notes_sitemap.body, origin).filter(
		(candidate) => !candidate.isSitemapIndexEntry
	);
	const rssUrls = parseRssXml(inputs.rss.body, origin);
	if (mainSitemapEntries.length === 0) {
		throw new Error('main_sitemap audit input contained no page URLs.');
	}
	if (rssUrls.length === 0) throw new Error('rss audit input contained no item URLs.');
	for (const [sourceType, entries] of [
		['main_sitemap', mainSitemapEntries],
		['notes_sitemap', notesSitemapEntries]
	]) {
		for (const entry of entries) {
			if (!isAuditablePageUrl(entry.url, origin)) continue;
			mergeInventoryRecord(
				inventory,
				{
					url: entry.url,
					sourceType,
					sourceFile: inputUrls[sourceType],
					lastModified: entry.lastModified,
					canonicalCandidate: true,
					strata: sourceType === 'notes_sitemap' ? ['note'] : ['sitemap']
				},
				origin
			);
		}
	}
	for (const url of rssUrls) {
		if (!isAuditablePageUrl(url, origin)) continue;
		mergeInventoryRecord(
			inventory,
			{
				url,
				sourceType: 'rss',
				sourceFile: inputUrls.rss,
				canonicalCandidate: true,
				strata: ['recent', 'rss']
			},
			origin
		);
	}
	const homepageAnalysis = analyzeHtml(inputs.homepage.body, inputs.homepage.finalUrl, { origin });
	for (const link of homepageAnalysis.links.filter(
		(candidate) => candidate.internal && isAuditablePageUrl(candidate.url, origin)
	)) {
		mergeInventoryRecord(
			inventory,
			{
				url: link.url,
				sourceType: 'homepage',
				sourceFile: inputs.homepage.finalUrl,
				canonicalCandidate: true,
				strata: ['homepage_discovered']
			},
			origin
		);
	}
	mergeInventoryRecord(
		inventory,
		{
			url: origin,
			sourceType: 'homepage',
			sourceFile: inputUrls.homepage,
			canonicalCandidate: true,
			strata: ['homepage']
		},
		origin
	);
	const homepageKey = normalizeAuditUrl(origin, origin);
	const preloaded = new Map([[homepageKey, inputs.homepage]]);
	const crawl = await crawlInventory(inventory, {
		...settings,
		fetchImpl,
		gate,
		preloaded,
		onProgress: logProgress ? progressLogger('Normal crawl') : null
	});
	if (crawl.warnings.some((warning) => warning.startsWith('URL_LIMIT_REACHED:'))) {
		throw new Error(`Crawl stopped at its safety bound: ${crawl.warnings.join(', ')}`);
	}
	const records = crawl.records;
	assertFetchCompleteness(
		'Normal crawl',
		[...records.values()].map((record) => ({
			requestedUrl: record.fetch.requestedUrl ?? record.requestedUrl,
			status: record.fetch.status,
			error: record.fetch.error
		})),
		{ partialResult: 'crawl' }
	);
	const sample = settings.runUserAgentSample
		? buildUserAgentSample(inventory, records, {
				origin,
				size: settings.userAgentSampleSize,
				auditDate
			})
		: [];
	const userAgentResults = settings.runUserAgentSample
		? await crawlUserAgentSample(sample, {
				...settings,
				fetchImpl,
				gate,
				normalRecords: records,
				onProgress: logProgress ? progressLogger('User-agent comparison', 40) : null
			})
		: [];
	if (settings.runUserAgentSample) {
		if (sample.length < MIN_USER_AGENT_SAMPLE_SIZE) {
			throw new Error(`User-agent sample produced only ${sample.length} URLs.`);
		}
		const expectedRequests = sample.length * Object.keys(USER_AGENTS).length;
		if (userAgentResults.length !== expectedRequests) {
			throw new Error(
				`User-agent comparison produced ${userAgentResults.length}/${expectedRequests} records.`
			);
		}
		assertFetchCompleteness(
			'User-agent comparison',
			userAgentResults.map((result) => ({
				userAgentKey: result.userAgentKey,
				requestedUrl: result.record.fetch.requestedUrl ?? result.url,
				status: result.record.fetch.status,
				error: result.record.fetch.error
			})),
			{ partialResult: 'sample' }
		);
	}
	const render = await renderCrawlRecords(records, {
		...settings,
		mode: settings.renderMode,
		sample,
		fetchImpl,
		gate,
		playwrightModule,
		onProgress: logProgress ? progressLogger('Browser render', 20) : null
	});
	if (settings.renderMode === 'all' && (render.failed > 0 || render.warning)) {
		throw new Error(
			`Rendered crawl was incomplete: ${render.rendered} rendered, ${render.failed} failed. ${render.warning}`.trim()
		);
	}
	await measureJavaScriptBundles(records, {
		...settings,
		mode: settings.bundleWeightMode,
		fetchImpl,
		gate,
		onProgress: logProgress ? progressLogger('JavaScript measurement', 20) : null
	});
	const incompleteBundleMeasurements = [...records.values()].filter(
		(record) => record.jsBundleMeasurementStatus === 'incomplete_internal_script_measurement'
	);
	if (incompleteBundleMeasurements.length > 0) {
		throw new Error(
			`JavaScript bundle measurement was incomplete for ${incompleteBundleMeasurements.length} page(s); no partial bundle-weight report will be accepted. ${formatFetchFailureDetails(
				incompleteBundleMeasurements.map((record) => ({
					requestedUrl: record.requestedUrl,
					error: record.jsBundleMeasurementStatus
				}))
			)}`
		);
	}
	const variantProbes = settings.runVariants ? buildVariantProbes(records, { origin }) : [];
	const variantResults = settings.runVariants
		? await crawlVariantProbes(variantProbes, { ...settings, fetchImpl, gate })
		: [];
	if (settings.runVariants) assertVariantFetchCompleteness(variantResults);
	let observedTraffic = new Map();
	let trafficWarning = '';
	try {
		observedTraffic = observedTrafficFromCsv(
			await fs.readFile(path.join(outputDirectory, 'TRAFFIC_BY_PAGE.csv'), 'utf8'),
			origin
		);
	} catch (error) {
		trafficWarning =
			error?.code === 'ENOENT'
				? 'Observed page traffic was unavailable; high-traffic internal-link metrics are UNVERIFIED.'
				: `Observed page traffic could not be parsed; high-traffic internal-link metrics are UNVERIFIED: ${error.message}`;
	}
	const graph = computeInternalGraph(records, { origin, observedTraffic });
	if (settings.renderMode === 'all' && (graph.nodes.length === 0 || graph.fallbackNodeCount > 0)) {
		throw new Error(
			`Rendered graph acceptance failed: ${graph.renderedDomNodeCount}/${graph.nodes.length} canonical nodes used rendered DOM.`
		);
	}
	applyIssueDetection(records, { origin, userAgentResults, variantResults, graph });
	const completedAt = now().toISOString();
	const warnings = [
		...source.warnings,
		...crawl.warnings,
		...Object.entries(inputs).map(([label, result]) => inputWarning(label, result)),
		render.warning,
		trafficWarning
	].filter(Boolean);
	const reports = buildAuditReports({
		inventory,
		records,
		graph,
		inputEvidence: Object.fromEntries(
			Object.entries(inputs).map(([label, result]) => [
				label,
				{
					url: inputUrls[label],
					status: result.status,
					contentType: result.contentType,
					rawBytes: result.rawBytes,
					bodySha256: hashText(result.body),
					error: result.error
				}
			])
		),
		userAgentSample: sample,
		userAgentResults,
		variantResults,
		config: settings,
		warnings,
		startedAt,
		completedAt
	});
	const files = await writeAuditReports(outputDirectory, reports);
	return {
		settings,
		inventory,
		records,
		graph,
		sample,
		userAgentResults,
		variantResults,
		reports,
		files,
		warnings
	};
}

export function dateInKolkata(date = new Date()) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Kolkata',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}

function requiredArgument(argv, index, option) {
	const value = argv[index + 1];
	if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
	return value;
}

export function parseArguments(argv, { root = process.cwd(), now = new Date() } = {}) {
	const options = {
		root: path.resolve(root),
		origin: SITE_ORIGIN,
		auditDate: dateInKolkata(now),
		concurrency: DEFAULT_CONCURRENCY,
		requestsPerSecond: DEFAULT_REQUESTS_PER_SECOND,
		timeoutMs: DEFAULT_TIMEOUT_MS,
		maxUrls: DEFAULT_MAX_URLS,
		userAgentSampleSize: DEFAULT_USER_AGENT_SAMPLE_SIZE,
		renderMode: 'all',
		bundleWeightMode: 'full',
		runUserAgentSample: true,
		runVariants: true,
		help: false
	};
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === '--help' || argument === '-h') options.help = true;
		else if (argument === '--root')
			options.root = path.resolve(requiredArgument(argv, index++, argument));
		else if (argument === '--origin')
			options.origin = new URL(requiredArgument(argv, index++, argument)).origin;
		else if (argument === '--audit-date')
			options.auditDate = requiredArgument(argv, index++, argument);
		else if (argument === '--output')
			options.outputDirectory = path.resolve(requiredArgument(argv, index++, argument));
		else if (argument === '--concurrency')
			options.concurrency = Number(requiredArgument(argv, index++, argument));
		else if (argument === '--requests-per-second')
			options.requestsPerSecond = Number(requiredArgument(argv, index++, argument));
		else if (argument === '--timeout-ms')
			options.timeoutMs = Number(requiredArgument(argv, index++, argument));
		else if (argument === '--max-urls')
			options.maxUrls = Number(requiredArgument(argv, index++, argument));
		else if (argument === '--ua-sample-size')
			options.userAgentSampleSize = Number(requiredArgument(argv, index++, argument));
		else if (argument === '--render')
			options.renderMode = requiredArgument(argv, index++, argument);
		else if (argument === '--bundle-weight')
			options.bundleWeightMode = requiredArgument(argv, index++, argument);
		else if (argument === '--skip-user-agent-sample') options.runUserAgentSample = false;
		else if (argument === '--skip-variants') options.runVariants = false;
		else throw new Error(`Unknown audit option: ${argument}`);
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(options.auditDate)) {
		throw new Error('--audit-date must use YYYY-MM-DD.');
	}
	options.outputDirectory ??= path.join(
		options.root,
		'docs',
		'audits',
		`traffic-${options.auditDate}`
	);
	if (
		!Number.isInteger(options.concurrency) ||
		options.concurrency < 1 ||
		options.concurrency > MAX_CONCURRENCY
	) {
		throw new Error(`--concurrency must be an integer from 1 to ${MAX_CONCURRENCY}.`);
	}
	if (!(options.requestsPerSecond > 0) || options.requestsPerSecond > MAX_REQUESTS_PER_SECOND) {
		throw new Error(
			`--requests-per-second must be greater than zero and no more than ${MAX_REQUESTS_PER_SECOND}.`
		);
	}
	if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000) {
		throw new Error('--timeout-ms must be an integer of at least 1000.');
	}
	if (!Number.isInteger(options.maxUrls) || options.maxUrls < MIN_USER_AGENT_SAMPLE_SIZE) {
		throw new Error(`--max-urls must be an integer of at least ${MIN_USER_AGENT_SAMPLE_SIZE}.`);
	}
	if (
		options.runUserAgentSample &&
		(!Number.isInteger(options.userAgentSampleSize) ||
			options.userAgentSampleSize < MIN_USER_AGENT_SAMPLE_SIZE)
	) {
		throw new Error(
			`--ua-sample-size must be an integer of at least ${MIN_USER_AGENT_SAMPLE_SIZE}.`
		);
	}
	if (!['all', 'sample', 'none'].includes(options.renderMode)) {
		throw new Error('--render must be all, sample, or none.');
	}
	if (!['full', 'headers', 'off'].includes(options.bundleWeightMode)) {
		throw new Error('--bundle-weight must be full, headers, or off.');
	}
	return options;
}

export function usage() {
	return `Production traffic/indexing audit crawler

Usage:
  node scripts/audit-traffic-indexing.mjs [options]

Defaults are deliberately restrained: four concurrent workers, globally rate-limited to two
request starts per second. Only same-site GET and HEAD requests are made; browser rendering blocks
non-GET requests, external origins, service workers, forms, analytics endpoints, images and media.

Options:
  --root PATH                 Repository root (default: current directory)
  --origin URL               Production origin (default: ${SITE_ORIGIN})
  --audit-date YYYY-MM-DD     Evidence date in Asia/Kolkata
  --output PATH               Report directory
  --concurrency 1..4          Concurrent HTTP workers (default: ${DEFAULT_CONCURRENCY})
  --requests-per-second N     Global request-start rate, maximum 2 (default: ${DEFAULT_REQUESTS_PER_SECOND})
  --timeout-ms N              Per-request timeout (default: ${DEFAULT_TIMEOUT_MS})
  --max-urls N                Crawl safety ceiling (default: ${DEFAULT_MAX_URLS})
  --ua-sample-size N          Stratified sample, minimum 50 (default: ${DEFAULT_USER_AGENT_SAMPLE_SIZE})
  --render all|sample|none    Same-origin, side-effect-blocked browser rendering (default: all)
  --bundle-weight full|headers|off
                              Measure same-origin JavaScript transfer bytes (default: full)
  --skip-user-agent-sample    Development-only HTTP crawl without the required UA comparison
  --skip-variants             Development-only crawl without protocol/host/path variant probes
  --help                      Show this help

The live production crawl is intentionally not run by tests. For an HTTP-only smoke run, use:
  node scripts/audit-traffic-indexing.mjs --render none --bundle-weight off --skip-user-agent-sample --skip-variants
`;
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	if (options.help) {
		console.log(usage());
		return;
	}
	console.log(
		`Starting production audit at ${options.requestsPerSecond} request(s)/s with ${options.concurrency} worker(s).`
	);
	const result = await runAudit(options);
	console.log(
		`Audit complete: ${result.records.size} URL(s), ${result.graph.edges.length} internal edge(s), ` +
			`${result.sample.length} user-agent sample URL(s).`
	);
	console.log(`Reports written to ${result.settings.outputDirectory}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error instanceof Error ? (error.stack ?? error.message) : error);
		process.exitCode = 1;
	});
}
