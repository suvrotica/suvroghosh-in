import fs from 'node:fs/promises';
import path from 'node:path';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

const DEFAULTS = {
	concurrency: 6,
	perHost: 2,
	timeoutMs: 12_000,
	attempts: 2,
	maxRedirects: 5,
	maxBodyBytes: 65_536
};
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function redactCredentials(value) {
	try {
		const url = new URL(value);
		url.username = '';
		url.password = '';
		return url.href;
	} catch {
		return value;
	}
}

/** Public HTTP links only; this audit never sends credentials or probes local services. */
export function unsupportedUrl(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		return 'invalid-url';
	}
	if (!['http:', 'https:'].includes(url.protocol)) return 'unsupported-protocol';
	if (url.username || url.password) return 'credential-bearing-url';
	const host = url.hostname
		.toLowerCase()
		.replace(/^\[|\]$/g, '')
		.replace(/\.$/, '');
	if (
		(!host.includes('.') && !isIP(host)) ||
		/(^|\.)(localhost|local|internal|home|test|invalid)$/.test(host)
	)
		return 'local-or-private-host';
	const ipv4 = isIP(host) === 4 ? host.split('.').map(Number) : null;
	if (ipv4) {
		const [a, b] = ipv4;
		if (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			a >= 224 ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 192 && b === 0) ||
			(a === 198 && (b === 18 || b === 19))
		)
			return 'local-or-private-host';
	}
	if (isIP(host) === 6) {
		// Mapped IPv4 forms are rejected too, including hexadecimal ::ffff:7f00:1.
		if (/^(::|fc|fd|fe[89ab]|ff)/.test(host)) return 'local-or-private-host';
	}
	return null;
}

/** Keep all referring pages/text and original fragments while deduplicating HTTP requests. */
export function externalInventory(report) {
	if (!report?.external || typeof report.external !== 'object' || Array.isArray(report.external)) {
		throw new Error('Input must be a local site-audit JSON report with an external object.');
	}
	// Older inventories may omit coverage metadata; current reports must not
	// silently turn an incomplete crawl into a successful subset-only audit.
	if (
		(report.complete !== undefined && report.complete !== true) ||
		(report.warnings && (!Array.isArray(report.warnings) || report.warnings.length > 0))
	) {
		throw new Error(
			'Input site audit is incomplete or has discovery warnings. Complete links:audit successfully before checking external links.'
		);
	}
	const inventory = new Map();
	for (const [href, references] of Object.entries(report.external)) {
		let key = href;
		try {
			const url = new URL(href);
			url.hash = '';
			key = url.href;
		} catch {
			// Invalid entries remain visible as unsupported, without a network request.
		}
		const entry = inventory.get(key) || { url: key, references: [] };
		for (const reference of Array.isArray(references) ? references : []) {
			entry.references.push({
				source: String(reference.source || ''),
				text: String(reference.text || ''),
				href: redactCredentials(href)
			});
		}
		inventory.set(key, entry);
	}
	return [...inventory.values()];
}

async function readPrefix(response, limit) {
	const type = response.headers.get('content-type') || '';
	if (!response.body) return '';
	const reader = response.body.getReader();
	let bytes = 0;
	let text = '';
	const decoder = new TextDecoder();
	try {
		if (/html|text\/plain/i.test(type)) {
			while (bytes < limit) {
				const { done, value } = await reader.read();
				if (done) break;
				const remaining = limit - bytes;
				text += decoder.decode(value.subarray(0, remaining), { stream: true });
				bytes += Math.min(value.byteLength, remaining);
			}
			text += decoder.decode();
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
	return text;
}

function responseOutcome(status, title, finalUrl, prefix) {
	if (
		/just a moment|attention required|security checkpoint|human verification|access denied|checking your browser|captcha/i.test(
			title
		) ||
		(/(?:const|let|var)\s+challenge(?:Id|Domain)\s*=/.test(prefix) &&
			/cookies must be enabled|proof.of.work/i.test(prefix))
	) {
		return { outcome: 'unresolved', reason: 'browser-verification-required' };
	}
	// Accepted is a pending response, often an empty publisher challenge, not delivered content.
	if (status === 202) return { outcome: 'unresolved', reason: 'http-202' };
	if ([401, 403, 407, 429, 451, 999].includes(status)) {
		return { outcome: 'unresolved', reason: status === 429 ? 'rate-limited' : 'access-restricted' };
	}
	if (
		/sign[ -]?in|log[ -]?in/i.test(title) ||
		/\/accounts?\/(login|signin)|accounts\.google\.com/i.test(finalUrl)
	) {
		return { outcome: 'unresolved', reason: 'authentication-required' };
	}
	if ([404, 410].includes(status)) return { outcome: 'broken', reason: `http-${status}` };
	if (status >= 200 && status < 300) {
		if (
			/^(?:error[ :–—-]*)?404(?:[ :–—-]+(?:error|not found|page not found))?$|\bpage (?:not found|does not exist)\b|^not found\b|^error: doi not found/i.test(
				title
			)
		) {
			return { outcome: 'broken', reason: 'soft-404' };
		}
		return { outcome: 'passed', reason: 'http-success' };
	}
	return { outcome: 'unresolved', reason: `http-${status}` };
}

export async function checkExternalLink(url, options = {}) {
	const settings = { ...DEFAULTS, ...options };
	const fetcher = options.fetch || globalThis.fetch;
	const pause = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
	const unsupported = unsupportedUrl(url);
	if (unsupported)
		return {
			url: redactCredentials(url),
			outcome: 'unsupported',
			reason: unsupported,
			attempts: []
		};
	const attempts = [];
	for (let attempt = 0; attempt < settings.attempts; attempt++) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
		const redirects = [];
		const visited = new Set();
		let current = url;
		let result;
		try {
			for (;;) {
				const blocked = unsupportedUrl(current);
				if (blocked) {
					result = {
						outcome: 'unsupported',
						reason: `redirect-${blocked}`,
						finalUrl: redactCredentials(current),
						redirects
					};
					break;
				}
				if (visited.has(current)) {
					result = { outcome: 'broken', reason: 'redirect-loop', finalUrl: current, redirects };
					break;
				}
				visited.add(current);
				const response = await fetcher(current, {
					method: 'GET',
					redirect: 'manual',
					credentials: 'omit',
					signal: controller.signal,
					headers: {
						'User-Agent': 'Mozilla/5.0 (compatible; SuvroGhosh-LinkAudit/1.0)',
						Accept: 'text/html,application/pdf;q=0.8,*/*;q=0.5'
					}
				});
				if (REDIRECTS.has(response.status)) {
					await response.body?.cancel().catch(() => {});
					const location = response.headers.get('location');
					if (!location || redirects.length >= settings.maxRedirects) {
						result = {
							outcome: 'unresolved',
							reason: location ? 'redirect-limit' : 'missing-redirect-location',
							status: response.status,
							finalUrl: current,
							redirects
						};
						break;
					}
					const next = new URL(location, current);
					next.hash = '';
					redirects.push({
						from: current,
						status: response.status,
						to: redactCredentials(next.href)
					});
					current = next.href;
					continue;
				}
				const contentType = response.headers.get('content-type') || '';
				const prefix = await readPrefix(response, settings.maxBodyBytes);
				const title = (prefix.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
					.replace(/\s+/g, ' ')
					.trim()
					.slice(0, 300);
				result = {
					...responseOutcome(response.status, title, current, prefix),
					status: response.status,
					finalUrl: current,
					contentType,
					title,
					redirects
				};
				break;
			}
		} catch (error) {
			result = {
				outcome: 'unresolved',
				reason: controller.signal.aborted ? 'timeout' : 'network-error',
				code: error.cause?.code || error.code || error.name,
				finalUrl: current,
				redirects
			};
		} finally {
			clearTimeout(timer);
		}
		attempts.push(result);
		if (result.outcome === 'passed' || result.outcome === 'unsupported') break;
		// Access controls and verification pages will not improve through immediate retries.
		if (
			['browser-verification-required', 'authentication-required', 'access-restricted'].includes(
				result.reason
			)
		)
			break;
		if (attempt + 1 < settings.attempts) await pause(Math.min(250 * 2 ** attempt, 1_000));
	}
	return { url, ...attempts.at(-1), attempts };
}

export async function auditExternalLinks(inventory, options = {}) {
	const settings = { ...DEFAULTS, ...options };
	const pending = inventory.map((entry, index) => ({ entry, index }));
	const activeHosts = new Map();
	const results = new Array(inventory.length);
	let active = 0;
	await new Promise((resolve) => {
		function pump() {
			while (active < settings.concurrency) {
				const index = pending.findIndex(({ entry }) => {
					let host = '';
					try {
						host = new URL(entry.url).hostname;
					} catch {
						/* invalid entry */
					}
					return (activeHosts.get(host) || 0) < settings.perHost;
				});
				if (index < 0) break;
				const { entry, index: resultIndex } = pending.splice(index, 1)[0];
				let host = '';
				try {
					host = new URL(entry.url).hostname;
				} catch {
					/* invalid entry */
				}
				activeHosts.set(host, (activeHosts.get(host) || 0) + 1);
				active++;
				checkExternalLink(entry.url, settings)
					.then((result) => {
						results[resultIndex] = { ...result, references: entry.references };
					})
					.finally(() => {
						active--;
						activeHosts.set(host, activeHosts.get(host) - 1);
						if (!pending.length && !active) resolve();
						else pump();
					});
			}
			if (!pending.length && !active) resolve();
		}
		pump();
	});
	const summary = {
		destinations: results.length,
		passed: 0,
		broken: 0,
		unresolved: 0,
		unsupported: 0
	};
	for (const result of results) summary[result.outcome]++;
	return { checkedAt: new Date().toISOString(), summary, results };
}

async function main(args) {
	const values = {};
	for (let i = 0; i < args.length; i += 2) {
		if (
			!['--input', '--output', '--concurrency', '--timeout-ms', '--attempts'].includes(args[i]) ||
			!args[i + 1]
		) {
			throw new Error(
				'Usage: node scripts/audit-external-links.mjs [--input report.json] [--output report.json] [--concurrency 6] [--timeout-ms 12000] [--attempts 2]'
			);
		}
		values[args[i]] = args[i + 1];
	}
	const input = values['--input'] || '.codex-artifacts/site-links.json';
	const output = values['--output'] || '.codex-artifacts/external-links.json';
	const options = {};
	for (const [flag, key, min, max] of [
		['--concurrency', 'concurrency', 1, 16],
		['--timeout-ms', 'timeoutMs', 100, 30_000],
		['--attempts', 'attempts', 1, 3]
	]) {
		if (values[flag] !== undefined) {
			const value = Number(values[flag]);
			if (!Number.isInteger(value) || value < min || value > max)
				throw new Error(`${flag} must be an integer from ${min} to ${max}.`);
			options[key] = value;
		}
	}
	const report = await auditExternalLinks(
		externalInventory(JSON.parse(await fs.readFile(input, 'utf8'))),
		options
	);
	await fs.mkdir(path.dirname(output), { recursive: true });
	await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
	console.log(
		`External links: ${report.summary.destinations} destinations; ${report.summary.passed} passed, ${report.summary.broken} broken, ${report.summary.unresolved} unresolved, ${report.summary.unsupported} unsupported. Report: ${output}`
	);
	process.exitCode = report.summary.broken ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	main(process.argv.slice(2)).catch((error) => {
		console.error(error.message);
		process.exitCode = 2;
	});
}
