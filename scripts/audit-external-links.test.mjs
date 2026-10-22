import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	auditExternalLinks,
	checkExternalLink,
	externalInventory,
	unsupportedUrl
} from './audit-external-links.mjs';

const html = (status, title) =>
	new Response(`<html><title>${title}</title></html>`, {
		status,
		headers: { 'content-type': 'text/html' }
	});
const noSleep = async () => {};

test('deduplicates fragments while retaining original source references', () => {
	const inventory = externalInventory({
		external: {
			'https://public.example.org/book#one': [{ source: '/article', text: 'One' }],
			'https://public.example.org/book#two': [{ source: '/about', text: 'Two' }]
		}
	});
	assert.equal(inventory.length, 1);
	assert.equal(inventory[0].url, 'https://public.example.org/book');
	assert.deepEqual(
		inventory[0].references.map((reference) => reference.href),
		['https://public.example.org/book#one', 'https://public.example.org/book#two']
	);
	assert.throws(() => externalInventory({}), /external object/);
});

test('rejects incomplete or warned source crawls before any external request', async () => {
	let requests = 0;
	for (const metadata of [
		{ complete: false, warnings: [] },
		{ complete: true, warnings: ['Source discovery skipped an invalid post.'] },
		{ warnings: ['URL discovery was truncated.'] }
	]) {
		await assert.rejects(
			async () =>
				auditExternalLinks(
					externalInventory({
						...metadata,
						external: { 'https://public.example.org/article': [{ source: '/', text: 'Article' }] }
					}),
					{
						fetch: async () => {
							requests++;
							return html(200, 'Article');
						}
					}
				),
			/incomplete or has discovery warnings/
		);
	}
	assert.equal(requests, 0);
	assert.deepEqual(externalInventory({ complete: true, warnings: [], external: {} }), []);
	assert.deepEqual(externalInventory({ external: {} }), []);
});

test('the external CLI rejects an incomplete inventory without writing a successful report', async (t) => {
	const temporary = await fs.realpath(os.tmpdir());
	const directory = await fs.mkdtemp(path.join(temporary, 'suvro-external-links-'));
	t.after(async () => {
		const resolved = await fs.realpath(directory);
		assert.equal(path.dirname(resolved), temporary);
		assert.ok(path.basename(resolved).startsWith('suvro-external-links-'));
		await fs.rm(resolved, { recursive: true, force: true });
	});
	const input = path.join(directory, 'partial.json');
	const output = path.join(directory, 'external.json');
	await fs.writeFile(
		input,
		JSON.stringify({
			complete: false,
			warnings: [],
			// This stays network-free even if the completeness guard regresses.
			external: { 'not-a-url': [{ source: '/', text: 'Subset reference' }] }
		})
	);
	const result = spawnSync(
		process.execPath,
		[
			fileURLToPath(new URL('./audit-external-links.mjs', import.meta.url)),
			'--input',
			input,
			'--output',
			output
		],
		{ encoding: 'utf8', timeout: 10_000 }
	);
	assert.ifError(result.error);
	assert.equal(result.status, 2, result.stderr);
	assert.match(result.stderr, /incomplete or has discovery warnings/);
	assert.equal(result.stdout, '');
	await assert.rejects(fs.access(output), { code: 'ENOENT' });
});

test('rejects local/private IP forms, credentials and non-HTTP links without fetching', async () => {
	for (const url of [
		'http://localhost/',
		'http://127.1/',
		'http://2130706433/',
		'http://0x7f000001/',
		'http://10.1.2.3/',
		'http://172.16.0.1/',
		'http://169.254.169.254/',
		'http://192.168.0.1/',
		'http://[::1]/',
		'http://[::ffff:7f00:1]/',
		'http://[fc00::1]/',
		'http://service.internal/',
		'https://user:password@public.example.org/',
		'mailto:person@example.org'
	]) {
		assert.ok(unsupportedUrl(url), url);
		const result = await checkExternalLink(url, {
			fetch: () => {
				throw new Error('must not fetch');
			}
		});
		assert.equal(result.outcome, 'unsupported', url);
	}
	assert.equal(unsupportedUrl('https://www.youtube.com/@SuvroGhoshIN'), null);
});

test('uses GET and follows bounded redirects while preserving evidence', async () => {
	const calls = [];
	const result = await checkExternalLink('https://public.example.org/old', {
		fetch: async (url, options) => {
			calls.push({ url, method: options.method, credentials: options.credentials });
			return url.endsWith('/old')
				? new Response(null, { status: 301, headers: { location: '/current' } })
				: html(200, 'Expected book');
		}
	});
	assert.equal(result.outcome, 'passed');
	assert.equal(result.finalUrl, 'https://public.example.org/current');
	assert.equal(result.redirects.length, 1);
	assert.deepEqual(
		calls.map((call) => call.method),
		['GET', 'GET']
	);
	assert.ok(calls.every((call) => call.credentials === 'omit'));
});

test('never follows a redirect into local services', async () => {
	let calls = 0;
	const result = await checkExternalLink('https://public.example.org/link', {
		fetch: async () => {
			calls++;
			return new Response(null, {
				status: 302,
				headers: { location: 'http://169.254.169.254/latest/meta-data/' }
			});
		}
	});
	assert.equal(calls, 1);
	assert.equal(result.outcome, 'unsupported');
	assert.equal(result.reason, 'redirect-local-or-private-host');
});

test('distinguishes definitive errors and soft 404s from authentication and bot refusals', async () => {
	for (const [status, title, outcome] of [
		[404, 'Error: DOI Not Found', 'broken'],
		[410, 'Removed', 'broken'],
		[200, 'Page not found', 'broken'],
		[403, 'Forbidden', 'unresolved'],
		[429, 'Too many requests', 'unresolved'],
		[999, '', 'unresolved'],
		[200, 'Just a moment...', 'unresolved'],
		[200, 'Sign in - Google Accounts', 'unresolved'],
		[200, 'Real article', 'passed'],
		[200, 'Why 404 errors matter', 'passed']
	]) {
		// Response deliberately limits statuses to 200-599; a minimal response covers LinkedIn's 999.
		const response = () =>
			status === 999 ? { status, headers: new Headers(), body: null } : html(status, title);
		const result = await checkExternalLink('https://public.example.org/article', {
			fetch: async () => response(),
			attempts: 1
		});
		assert.equal(result.outcome, outcome, `${status} ${title}`);
	}
});

test('does not copy URL credentials into evidence', async () => {
	const result = await checkExternalLink(
		'https://user:private-password@public.example.org/article'
	);
	assert.equal(result.reason, 'credential-bearing-url');
	assert.ok(!JSON.stringify(result).includes('private-password'));
	const inventory = externalInventory({
		external: {
			'https://user:private-password@public.example.org/article': [{ source: '/', text: 'Article' }]
		}
	});
	const report = await auditExternalLinks(inventory);
	assert.ok(!JSON.stringify(report).includes('private-password'));
});

test('does not pass pending 202 responses or successful-status JavaScript cookie challenges', async () => {
	const pending = await checkExternalLink('https://public.example.org/article', {
		attempts: 1,
		fetch: async () => new Response(null, { status: 202, headers: { 'content-type': 'text/html' } })
	});
	assert.equal(pending.outcome, 'unresolved');
	assert.equal(pending.reason, 'http-202');
	const gate = await checkExternalLink('https://public.example.org/article', {
		attempts: 1,
		fetch: async () =>
			new Response(
				'<title>public.example.org</title><h1>Cookies must be enabled</h1><script>const challengeId = "example";</script>',
				{ status: 203, headers: { 'content-type': 'text/html' } }
			)
	});
	assert.equal(gate.outcome, 'unresolved');
	assert.equal(gate.reason, 'browser-verification-required');
});

test('retries transient failures and confirms persistent 404s without hiding the first attempt', async () => {
	let calls = 0;
	const recovered = await checkExternalLink('https://public.example.org/article', {
		fetch: async () => (++calls === 1 ? html(503, 'Unavailable') : html(200, 'Article')),
		sleep: noSleep
	});
	assert.equal(recovered.outcome, 'passed');
	assert.equal(recovered.attempts.length, 2);
	const broken = await checkExternalLink('https://public.example.org/removed', {
		fetch: async () => html(404, 'Not found'),
		sleep: noSleep
	});
	assert.equal(broken.outcome, 'broken');
	assert.equal(broken.attempts.length, 2);
});

test('times out network reads and cancels oversized response streams', async () => {
	const timeout = await checkExternalLink('https://public.example.org/slow', {
		timeoutMs: 5,
		attempts: 1,
		fetch: async (_url, { signal }) =>
			new Promise((_resolve, reject) =>
				signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
			)
	});
	assert.equal(timeout.reason, 'timeout');
	let canceled = false;
	const response = () =>
		new Response(
			new ReadableStream({
				pull(controller) {
					controller.enqueue(
						new TextEncoder().encode('<title>Article</title>' + 'x'.repeat(100_000))
					);
				},
				cancel() {
					canceled = true;
				}
			}),
			{ headers: { 'content-type': 'text/html' } }
		);
	const limited = await checkExternalLink('https://public.example.org/large', {
		maxBodyBytes: 128,
		fetch: async () => response()
	});
	assert.equal(limited.outcome, 'passed');
	assert.ok(canceled);
	assert.ok(!('body' in limited));
});

test('detects redirect loops and applies a redirect limit', async () => {
	const loop = await checkExternalLink('https://public.example.org/loop', {
		fetch: async () => new Response(null, { status: 302, headers: { location: '/loop' } }),
		attempts: 1
	});
	assert.equal(loop.reason, 'redirect-loop');
	let next = 0;
	const bounded = await checkExternalLink('https://public.example.org/start', {
		maxRedirects: 2,
		attempts: 1,
		fetch: async () => new Response(null, { status: 302, headers: { location: `/next-${++next}` } })
	});
	assert.equal(bounded.reason, 'redirect-limit');
	assert.equal(next, 3);
});

test('bounds global and per-host concurrency and preserves input ordering', async () => {
	let active = 0;
	let max = 0;
	const hostActive = new Map();
	const hostMax = new Map();
	const inventory = Array.from({ length: 8 }, (_, index) => ({
		url: `https://${index < 5 ? 'one' : 'two'}.example.org/${index}`,
		references: [{ source: '/', text: String(index) }]
	}));
	const report = await auditExternalLinks(inventory, {
		concurrency: 3,
		perHost: 2,
		fetch: async (url) => {
			const host = new URL(url).hostname;
			active++;
			max = Math.max(max, active);
			hostActive.set(host, (hostActive.get(host) || 0) + 1);
			hostMax.set(host, Math.max(hostMax.get(host) || 0, hostActive.get(host)));
			await new Promise((resolve) => setTimeout(resolve, 5));
			active--;
			hostActive.set(host, hostActive.get(host) - 1);
			return html(200, 'Article');
		}
	});
	assert.equal(max, 3);
	assert.ok([...hostMax.values()].every((value) => value <= 2));
	assert.deepEqual(
		report.results.map((result) => result.url),
		inventory.map((entry) => entry.url)
	);
	assert.equal(report.summary.passed, 8);
});
