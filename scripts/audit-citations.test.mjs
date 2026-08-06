import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	auditCitations,
	checkCitationRecord,
	discoverCitationRecords,
	isSafeCitationTarget
} from './audit-citations.mjs';
import { toCsv } from './audit-traffic-indexing.mjs';

const SITE_ORIGIN = 'https://www.example.test';
const DOI = 'https://doi.org/10.1016/S0006-3495(61)86902-6';
const PRIVATE_TARGET =
	'https://notebooklm.google.com/notebook/11111111-1111-4111-8111-111111111111/artifact/22222222-2222-4222-8222-222222222222?view=private';

async function fixture(t) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'citation-audit-test-'));
	t.after(async () => fs.rm(root, { recursive: true, force: true }));
	const posts = path.join(root, 'src', 'lib', 'posts');
	const output = path.join(root, 'docs', 'audits', 'traffic-2026-08-06');
	await fs.mkdir(posts, { recursive: true });
	await fs.mkdir(output, { recursive: true });
	await fs.writeFile(
		path.join(posts, 'citation-fixture.md'),
		`---
title: Citation fixture
---

## Evidence

[Biophysical paper](${DOI}) and [the same paper](${DOI}).

[Private notebook](${PRIVATE_TARGET})

[Internal page](${SITE_ORIGIN}/about)
`,
		'utf8'
	);
	await fs.writeFile(
		path.join(output, 'EVIDENCE_AUDIT.csv'),
		toCsv(
			[
				{
					source_file: 'src/lib/posts/citation-fixture.md',
					canonical_url: `${SITE_ORIGIN}/blog/evidence/citation-fixture`,
					title: 'Citation fixture',
					external_link_count: 3
				}
			],
			['source_file', 'canonical_url', 'title', 'external_link_count']
		),
		'utf8'
	);
	return { root, output };
}

test('discovers balanced authored targets, deduplicates occurrences, and redacts UUID paths', async (t) => {
	const { root, output } = await fixture(t);
	const records = await discoverCitationRecords({
		root,
		evidenceFile: path.join(output, 'EVIDENCE_AUDIT.csv'),
		siteOrigin: SITE_ORIGIN
	});
	assert.equal(records.length, 2);
	const doi = records.find((record) => record.requestUrl === DOI);
	assert.equal(doi.occurrencesOnPage, 2);
	assert.equal(doi.sectionHeading, 'Evidence');
	const privateRecord = records.find((record) => record.privateTarget);
	assert.match(privateRecord.publicUrl, /\[REDACTED-UUID-PATH\]/);
	assert.doesNotMatch(privateRecord.publicUrl, /11111111|view=private/);
});

test('blocks local and private targets, including a redirect discovered after a safe request', async () => {
	assert.equal(isSafeCitationTarget('http://127.0.0.1/private'), false);
	assert.equal(isSafeCitationTarget('http://192.168.1.2/private'), false);
	assert.equal(isSafeCitationTarget('https://example.org/public'), true);
	const result = await checkCitationRecord(
		{
			requestUrl: 'https://example.org/source',
			privateTarget: false
		},
		{
			gate: { wait: async () => {} },
			fetchImpl: async () =>
				new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } })
		}
	);
	assert.equal(result.status, null);
	assert.equal(result.errorCategory, 'blocked_unsafe_target');
	assert.match(result.livenessStatus, /UNSAFE REDIRECT BLOCKED/);
});

test('writes privacy-safe live evidence and never requests a redacted private target', async (t) => {
	const { root, output } = await fixture(t);
	const requests = [];
	const result = await auditCitations(
		{
			root,
			evidenceFile: path.join(output, 'EVIDENCE_AUDIT.csv'),
			outputDirectory: output,
			siteOrigin: SITE_ORIGIN
		},
		{
			checkedAt: '2026-08-06T12:00:00.000Z',
			logProgress: false,
			requestGate: { wait: async () => {} },
			fetchImpl: async (url, options) => {
				requests.push({ url: String(url), method: options.method });
				if (String(url) === DOI) {
					return new Response('', {
						status: 302,
						headers: { location: 'https://journal.example.test/article' }
					});
				}
				return new Response('', { status: 200 });
			}
		}
	);
	assert.deepEqual(requests, [
		{ url: DOI, method: 'HEAD' },
		{ url: 'https://journal.example.test/article', method: 'HEAD' }
	]);
	assert.equal(result.rows.length, 2);
	assert.equal(result.rows.find((row) => row.source_domain === 'doi.org').http_status, 200);
	assert.match(
		result.rows.find((row) => row.source_domain === 'notebooklm.google.com').liveness_status,
		/PRIVATE TARGET REDACTED/
	);
	for (const filename of ['CITATION_LIVENESS.csv', 'CITATION_REVIEW.md']) {
		const contents = await fs.readFile(path.join(output, filename), 'utf8');
		assert.doesNotMatch(contents, /11111111|22222222|view=private/);
	}
});

test('confirms an HTTP 404 with GET before assigning broken-link review', async () => {
	const requests = [];
	const result = await checkCitationRecord(
		{
			requestUrl: 'https://example.org/missing',
			privateTarget: false
		},
		{
			gate: { wait: async () => {} },
			fetchImpl: async (_url, options) => {
				requests.push(options.method);
				return new Response('', { status: 404 });
			}
		}
	);
	assert.deepEqual(requests, ['HEAD', 'GET']);
	assert.equal(result.status, 404);
	assert.equal(result.method, 'GET');
	assert.match(result.livenessStatus, /BROKEN-LINK REVIEW/);
});
