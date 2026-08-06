#!/usr/bin/env node

import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { markdownLinkRecords, sanitizedLinkTarget } from './audit-content-corpus.mjs';
import { parseCsvRows, toCsv } from './audit-traffic-indexing.mjs';

export const DEFAULT_SITE_ORIGIN = 'https://www.suvroghosh.in';
export const DEFAULT_AUDIT_DATE = '2026-08-06';
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_REQUESTS_PER_SECOND = 2;
export const DEFAULT_TIMEOUT_MS = 20_000;
export const MAX_REDIRECTS = 6;

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const GET_FALLBACK_STATUSES = new Set([400, 403, 404, 405, 410, 501]);
const PRIVATE_REDACTION_MARKER = '[REDACTED-UUID-PATH]';
const OUTPUT_FILENAME = 'CITATION_LIVENESS.csv';
const REPORT_FILENAME = 'CITATION_REVIEW.md';
const REPORT_COLUMNS = [
	'citation_id',
	'page_url',
	'page_title',
	'source_file',
	'section_heading',
	'anchor_text',
	'source_url_sanitized',
	'source_domain',
	'occurrences_on_page',
	'http_method',
	'http_status',
	'redirect_hops',
	'final_url_sanitized',
	'liveness_status',
	'checked_at',
	'error_category',
	'source_to_claim_correspondence_status'
];

function normalizeWhitespace(value) {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim();
}

function truncate(value, length = 180) {
	const normalized = normalizeWhitespace(value);
	return normalized.length <= length ? normalized : `${normalized.slice(0, length - 1)}…`;
}

function csvObjects(source) {
	const [headers = [], ...values] = parseCsvRows(source);
	return values.map((row) =>
		Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
	);
}

function sectionHeadingAt(source, index) {
	const headings = [...source.slice(0, index).matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)];
	return normalizeWhitespace(headings.at(-1)?.[1] ?? '');
}

function canonicalRequestUrl(value) {
	const url = new URL(value);
	if (!['http:', 'https:'].includes(url.protocol)) return '';
	url.hash = '';
	return url.href;
}

function isPrivateIpv4(hostname) {
	const parts = hostname.split('.').map(Number);
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
	return (
		parts[0] === 0 ||
		parts[0] === 10 ||
		parts[0] === 127 ||
		(parts[0] === 169 && parts[1] === 254) ||
		(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
		(parts[0] === 192 && parts[1] === 168) ||
		parts[0] >= 224
	);
}

export function isSafeCitationTarget(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
	const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
	if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
	const addressFamily = net.isIP(hostname);
	if (addressFamily === 4 && isPrivateIpv4(hostname)) return false;
	if (
		addressFamily === 6 &&
		(hostname === '::' ||
			hostname === '::1' ||
			hostname.startsWith('fc') ||
			hostname.startsWith('fd') ||
			hostname.startsWith('fe8') ||
			hostname.startsWith('fe9') ||
			hostname.startsWith('fea') ||
			hostname.startsWith('feb'))
	)
		return false;
	return true;
}

function createRateGate(requestsPerSecond = DEFAULT_REQUESTS_PER_SECOND) {
	const intervalMs = 1_000 / requestsPerSecond;
	let nextStart = 0;
	let chain = Promise.resolve();
	return {
		wait() {
			const scheduled = chain.then(async () => {
				const now = Date.now();
				const delay = Math.max(0, nextStart - now);
				if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
				nextStart = Math.max(nextStart, Date.now()) + intervalMs;
			});
			chain = scheduled.catch(() => {});
			return scheduled;
		}
	};
}

async function mapConcurrent(values, concurrency, callback) {
	const results = new Array(values.length);
	let cursor = 0;
	async function worker() {
		while (cursor < values.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await callback(values[index], index);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
	return results;
}

export async function discoverCitationRecords({
	root = REPOSITORY_ROOT,
	evidenceFile = path.join(
		root,
		'docs',
		'audits',
		`traffic-${DEFAULT_AUDIT_DATE}`,
		'EVIDENCE_AUDIT.csv'
	),
	siteOrigin = DEFAULT_SITE_ORIGIN
} = {}) {
	const resolvedRoot = path.resolve(root);
	const postRoot = path.resolve(resolvedRoot, 'src', 'lib', 'posts');
	const evidence = csvObjects(await fs.readFile(path.resolve(evidenceFile), 'utf8'));
	const records = [];
	for (const row of evidence) {
		if (Number(row.external_link_count) <= 0 || !row.source_file || !row.canonical_url) continue;
		const sourcePath = path.resolve(resolvedRoot, row.source_file);
		if (sourcePath !== postRoot && !sourcePath.startsWith(`${postRoot}${path.sep}`)) {
			throw new Error(`Citation source escaped the published-post directory: ${row.source_file}`);
		}
		const source = await fs.readFile(sourcePath, 'utf8');
		const byTarget = new Map();
		for (const link of markdownLinkRecords(source)) {
			let requestUrl;
			try {
				requestUrl = canonicalRequestUrl(link.destination);
			} catch {
				continue;
			}
			if (!requestUrl || new URL(requestUrl).origin === new URL(siteOrigin).origin) continue;
			const existing = byTarget.get(requestUrl);
			if (existing) {
				existing.occurrencesOnPage += 1;
				continue;
			}
			const publicUrl = sanitizedLinkTarget(requestUrl, siteOrigin);
			byTarget.set(requestUrl, {
				pageUrl: row.canonical_url,
				pageTitle: row.title,
				sourceFile: row.source_file,
				sectionHeading: sectionHeadingAt(source, link.index),
				anchorText: truncate(link.anchor),
				requestUrl,
				publicUrl,
				sourceDomain: new URL(requestUrl).hostname.toLowerCase().replace(/^www\./, ''),
				occurrencesOnPage: 1,
				privateTarget: publicUrl.includes(PRIVATE_REDACTION_MARKER)
			});
		}
		records.push(...byTarget.values());
	}
	return records.sort(
		(left, right) =>
			left.pageUrl.localeCompare(right.pageUrl) || left.publicUrl.localeCompare(right.publicUrl)
	);
}

async function requestWithRedirects(initialUrl, method, { fetchImpl, gate, timeoutMs }) {
	let currentUrl = initialUrl;
	let redirectHops = 0;
	for (;;) {
		if (!isSafeCitationTarget(currentUrl)) {
			return {
				method,
				status: null,
				redirectHops,
				finalUrl: '',
				errorCategory: 'blocked_unsafe_target'
			};
		}
		await gate.wait();
		const controller = new AbortController();
		const timer = setTimeout(
			() => controller.abort(new Error('citation_request_timeout')),
			timeoutMs
		);
		let response;
		try {
			response = await fetchImpl(currentUrl, {
				method,
				redirect: 'manual',
				signal: controller.signal,
				headers: {
					accept: '*/*',
					'user-agent': 'suvroghosh.in-evidence-audit/1.0 (+https://www.suvroghosh.in/)'
				}
			});
		} catch (error) {
			clearTimeout(timer);
			return {
				method,
				status: null,
				redirectHops,
				finalUrl: currentUrl,
				errorCategory:
					controller.signal.aborted || error?.name === 'AbortError'
						? 'request_timeout'
						: 'network_error'
			};
		}
		clearTimeout(timer);
		void response.body?.cancel().catch(() => {});
		if (!REDIRECT_STATUSES.has(response.status)) {
			return {
				method,
				status: response.status,
				redirectHops,
				finalUrl: currentUrl,
				errorCategory: ''
			};
		}
		const location = response.headers.get('location');
		if (!location) {
			return {
				method,
				status: response.status,
				redirectHops,
				finalUrl: currentUrl,
				errorCategory: 'redirect_without_location'
			};
		}
		if (redirectHops >= MAX_REDIRECTS) {
			return {
				method,
				status: response.status,
				redirectHops,
				finalUrl: currentUrl,
				errorCategory: 'redirect_limit_exceeded'
			};
		}
		try {
			currentUrl = new URL(location, currentUrl).href;
		} catch {
			return {
				method,
				status: response.status,
				redirectHops,
				finalUrl: currentUrl,
				errorCategory: 'malformed_redirect_location'
			};
		}
		redirectHops += 1;
	}
}

function classifyLiveness(result) {
	if (result.errorCategory === 'blocked_unsafe_target')
		return 'UNVERIFIED — UNSAFE REDIRECT BLOCKED';
	if (result.errorCategory) return 'UNVERIFIED — NETWORK OR REDIRECT ERROR';
	if (result.status >= 200 && result.status < 400) return 'LIVE HTTP RESPONSE';
	if (result.status === 404 || result.status === 410)
		return `BROKEN-LINK REVIEW — HTTP ${result.status}`;
	if ([401, 403, 429].includes(result.status))
		return `UNVERIFIED — ACCESS OR BOT RESTRICTION HTTP ${result.status}`;
	if (result.status >= 500) return `RECHECK — SERVER RESPONSE HTTP ${result.status}`;
	return `REVIEW — HTTP ${result.status}`;
}

export async function checkCitationRecord(
	record,
	{
		fetchImpl = fetch,
		gate = createRateGate(),
		timeoutMs = DEFAULT_TIMEOUT_MS,
		checkedAt = new Date().toISOString()
	} = {}
) {
	if (record.privateTarget) {
		return {
			...record,
			method: '',
			status: null,
			redirectHops: 0,
			finalUrl: '',
			livenessStatus: 'UNVERIFIED — PRIVATE TARGET REDACTED AND NOT REQUESTED',
			checkedAt,
			errorCategory: 'private_target_not_requested'
		};
	}
	let result = await requestWithRedirects(record.requestUrl, 'HEAD', {
		fetchImpl,
		gate,
		timeoutMs
	});
	if (!result.errorCategory && GET_FALLBACK_STATUSES.has(result.status)) {
		result = await requestWithRedirects(record.requestUrl, 'GET', {
			fetchImpl,
			gate,
			timeoutMs
		});
	}
	return {
		...record,
		...result,
		livenessStatus: classifyLiveness(result),
		checkedAt
	};
}

function publicRow(result, index, siteOrigin) {
	return {
		citation_id: `CITE-${String(index + 1).padStart(4, '0')}`,
		page_url: result.pageUrl,
		page_title: result.pageTitle,
		source_file: result.sourceFile,
		section_heading: result.sectionHeading,
		anchor_text: result.anchorText,
		source_url_sanitized: result.publicUrl,
		source_domain: result.sourceDomain,
		occurrences_on_page: result.occurrencesOnPage,
		http_method: result.method,
		http_status: result.status,
		redirect_hops: result.redirectHops,
		final_url_sanitized: result.finalUrl ? sanitizedLinkTarget(result.finalUrl, siteOrigin) : '',
		liveness_status: result.livenessStatus,
		checked_at: result.checkedAt,
		error_category: result.errorCategory,
		source_to_claim_correspondence_status:
			'UNVERIFIED — HTTP liveness does not establish semantic support for the nearby claim'
	};
}

function markdownReport(rows, auditDate) {
	const count = (pattern) => rows.filter((row) => pattern.test(row.liveness_status)).length;
	const pageCount = new Set(rows.map((row) => row.page_url)).size;
	const reviewRows = rows.filter((row) => !/^LIVE HTTP RESPONSE$/.test(row.liveness_status));
	const reviewTable = reviewRows.length
		? [
				'| Citation | Page | Target | Observation |',
				'| --- | --- | --- | --- |',
				...reviewRows.map(
					(row) =>
						`| ${row.citation_id} | [${row.page_title}](${row.page_url}) | ${row.source_url_sanitized} | ${row.liveness_status} |`
				)
			].join('\n')
		: '_No target produced a review or unverified status in this run._';
	return `# Citation liveness review

Audit date: **${auditDate} (Asia/Calcutta)**

This bounded check inspected authored external Markdown targets from the ${pageCount} canonical pages that contain them. It used at most four workers and two request starts per second, followed at most ${MAX_REDIRECTS} redirects, preferred HEAD, and used a body-cancelled GET only when the HEAD status required confirmation. UUID-bearing external paths were not requested and remain redacted.

An HTTP response proves only that a target answered this audit client at the recorded time. It does **not** prove that the source is accurate, current, primary, or that it supports the nearby claim. Access restrictions, bot controls, and transient server failures are kept separate from broken-link review.

## Result counts

- Unique page/target records: **${rows.length}** across **${pageCount}** pages.
- Live HTTP responses: **${count(/^LIVE HTTP RESPONSE$/)}**.
- Broken-link review responses (HTTP 404/410): **${count(/^BROKEN-LINK REVIEW/)}**.
- Access/bot-restricted observations: **${count(/ACCESS OR BOT RESTRICTION/)}**.
- Network, redirect-policy, private-target, server, or other review observations: **${rows.length - count(/^LIVE HTTP RESPONSE$/) - count(/^BROKEN-LINK REVIEW/) - count(/ACCESS OR BOT RESTRICTION/)}**.

## Rows requiring review

${reviewTable}

The complete per-target evidence, including source page, anchor, section, status, redirect count, sanitized destination, timestamp, and uncertainty label, is in \`${OUTPUT_FILENAME}\`. Source-to-claim correspondence remains an owner/editorial reading task; do not add or retain a reference merely because it returns HTTP 200.
`;
}

export async function auditCitations(
	{
		root = REPOSITORY_ROOT,
		evidenceFile,
		outputDirectory = path.join(root, 'docs', 'audits', `traffic-${DEFAULT_AUDIT_DATE}`),
		auditDate = DEFAULT_AUDIT_DATE,
		siteOrigin = DEFAULT_SITE_ORIGIN,
		concurrency = DEFAULT_CONCURRENCY,
		requestsPerSecond = DEFAULT_REQUESTS_PER_SECOND,
		timeoutMs = DEFAULT_TIMEOUT_MS
	} = {},
	{
		fetchImpl = fetch,
		checkedAt = new Date().toISOString(),
		logProgress = true,
		requestGate = null
	} = {}
) {
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
		throw new Error('Citation concurrency must be an integer from 1 through 4.');
	if (!(requestsPerSecond > 0 && requestsPerSecond <= 2))
		throw new Error('Citation request starts per second must be greater than 0 and at most 2.');
	const resolvedOutput = path.resolve(outputDirectory);
	const records = await discoverCitationRecords({
		root,
		evidenceFile: evidenceFile ?? path.join(resolvedOutput, 'EVIDENCE_AUDIT.csv'),
		siteOrigin
	});
	const gate = requestGate ?? createRateGate(requestsPerSecond);
	const results = await mapConcurrent(records, concurrency, async (record, index) => {
		const result = await checkCitationRecord(record, {
			fetchImpl,
			gate,
			timeoutMs,
			siteOrigin,
			checkedAt
		});
		if (logProgress && ((index + 1) % 10 === 0 || index === 0 || index + 1 === records.length))
			console.log(`Citation liveness: ${index + 1}/${records.length}`);
		return result;
	});
	const rows = results.map((result, index) => publicRow(result, index, siteOrigin));
	await fs.mkdir(resolvedOutput, { recursive: true });
	await fs.writeFile(
		path.join(resolvedOutput, OUTPUT_FILENAME),
		toCsv(rows, REPORT_COLUMNS),
		'utf8'
	);
	await fs.writeFile(
		path.join(resolvedOutput, REPORT_FILENAME),
		markdownReport(rows, auditDate),
		'utf8'
	);
	return { records, results, rows, outputDirectory: resolvedOutput };
}

function parseArguments(arguments_) {
	const options = {};
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === '--root') options.root = arguments_[++index];
		else if (argument === '--evidence-file') options.evidenceFile = arguments_[++index];
		else if (argument === '--output-directory') options.outputDirectory = arguments_[++index];
		else if (argument === '--audit-date') options.auditDate = arguments_[++index];
		else if (argument === '--site-origin') options.siteOrigin = arguments_[++index];
		else if (argument === '--concurrency') options.concurrency = Number(arguments_[++index]);
		else if (argument === '--requests-per-second')
			options.requestsPerSecond = Number(arguments_[++index]);
		else if (argument === '--timeout-ms') options.timeoutMs = Number(arguments_[++index]);
		else throw new Error(`Unknown citation-audit argument: ${argument}`);
	}
	return options;
}

const isMain =
	process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
	auditCitations(parseArguments(process.argv.slice(2))).catch((error) => {
		console.error(error instanceof Error ? (error.stack ?? error.message) : error);
		process.exitCode = 1;
	});
}
