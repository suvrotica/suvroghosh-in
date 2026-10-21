import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
	createGithubNarrationState,
	encodeCheckpoint,
	decodeCheckpoint,
	collectCheckpoint,
	validateHostedQuota,
	validateHostedState
} from './lib/github-narration-state.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const key = 'ab'.repeat(32);
const apiKey = 'unit-test-gemini-key';
const quota = () => ({
	version: 1,
	day: '2026-10-21',
	used: 10,
	createdAt: 1,
	updatedAt: 10,
	lastRequestAt: 10,
	blockedUntil: 0,
	initialUsage: { day: '2026-10-21', used: 1 }
});
const state = () => ({
	version: 1,
	repository: 'suvrotica/suvroghosh-in',
	projectId: 'gen-lang-client-0296473115',
	keyHash: hash(apiKey),
	hosting: {
		projectId: 'prj_IxNpapfOcZwq4zRwlK56DPCRwQnc',
		teamId: 'team_PxbH7s87MnRH1xfa9cA6QIfp',
		plan: 'hobby'
	},
	quota: quota(),
	checkpoint: null,
	publication: null
});
const env = () => ({
	GH_TOKEN: 'unit-test-github-token',
	GEMINI_API_KEY: apiKey,
	NARRATION_STATE_KEY: key,
	NARRATION_GOOGLE_PROJECT_ID: 'gen-lang-client-0296473115',
	NARRATION_GOOGLE_KEY_SHA256: hash(apiKey)
});
const entry = (name = 'example/manifest.json', value = 'public narration metadata') => {
	const bytes = Buffer.from(value);
	return { path: name, bytes: bytes.length, sha256: hash(bytes), data: bytes.toString('base64') };
};

async function fixture(t) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hosted-narration-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	await fs.mkdir(path.join(root, '.codex-artifacts/narration-sources/example'), {
		recursive: true
	});
	await fs.writeFile(
		path.join(root, '.codex-artifacts/narration-sources/example/manifest.json'),
		'public narration metadata'
	);
	await fs.writeFile(
		path.join(root, '.codex-artifacts/narration-quota.json'),
		JSON.stringify(quota())
	);
	return root;
}

function github(initial = state()) {
	let sequence = 2;
	let head = '1'.repeat(40);
	const revisions = new Map([[head, structuredClone(initial)]]);
	const trees = new Map();
	const assets = new Map();
	const calls = [];
	let conflicting = false;
	let failUpload = false;
	let missing = false;
	const sha = () => String(++sequence).padStart(40, '0');
	const json = (value) => Response.json(value);
	return {
		calls,
		assets,
		get current() {
			return revisions.get(head);
		},
		set conflict(value) {
			conflicting = value;
		},
		set uploadFails(value) {
			failUpload = value;
		},
		set absent(value) {
			missing = value;
		},
		async fetch(url, options = {}) {
			url = new URL(url);
			const route = url.pathname.replace('/repos/suvrotica/suvroghosh-in', '');
			const method = options.method ?? 'GET';
			const body =
				options.body && typeof options.body === 'string' ? JSON.parse(options.body) : null;
			calls.push({ route, method, body, headers: options.headers });
			if (route === '/git/ref/heads/codex/narration-state')
				return missing ? new Response('', { status: 404 }) : json({ object: { sha: head } });
			if (route === '/contents/state.json') {
				const value = JSON.stringify(revisions.get(url.searchParams.get('ref')));
				return json({
					type: 'file',
					encoding: 'base64',
					size: Buffer.byteLength(value),
					content: Buffer.from(value).toString('base64')
				});
			}
			if (route.startsWith('/git/commits/') && method === 'GET')
				return json({ tree: { sha: '3'.repeat(40) } });
			if (route === '/git/trees') {
				const id = sha();
				trees.set(id, JSON.parse(body.tree.find((item) => item.path === 'state.json').content));
				return json({ sha: id });
			}
			if (route === '/git/commits') {
				const id = sha();
				revisions.set(id, trees.get(body.tree));
				return json({ sha: id });
			}
			if (route === '/git/refs/heads/codex/narration-state') {
				if (conflicting) return new Response('', { status: 409 });
				assert.equal(body.force, false);
				head = body.sha;
				return json({ object: { sha: head } });
			}
			if (route === '/git/refs') {
				head = body.sha;
				return json({ object: { sha: head } });
			}
			if (route === '/releases/tags/narration-checkpoints' || route === '/releases')
				return json({ id: 11, tag_name: 'narration-checkpoints', prerelease: true, draft: false });
			if (route === '/releases/11/assets' && method === 'POST') {
				if (failUpload) return new Response('', { status: 503 });
				const id = assets.size + 21;
				const bytes = Buffer.from(options.body);
				assets.set(id, { id, name: url.searchParams.get('name'), bytes });
				return json({ id, size: bytes.length });
			}
			if (route === '/releases/11/assets')
				return json([...assets.values()].map(({ id, name }) => ({ id, name })));
			if (route.startsWith('/releases/assets/')) {
				const id = Number(route.split('/').at(-1));
				if (method === 'DELETE') {
					assets.delete(id);
					return new Response(null, { status: 204 });
				}
				return new Response(assets.get(id).bytes);
			}
			throw new Error(`Unexpected mock route ${method} ${route}`);
		}
	};
}

test('encrypted snapshots authenticate every file and disclose neither source text nor credentials', () => {
	const files = [entry()];
	const encrypted = encodeCheckpoint(files, key);
	assert.deepEqual(decodeCheckpoint(encrypted, key), files);
	assert.equal(encrypted.includes(Buffer.from('public narration metadata')), false);
	assert.equal(encrypted.includes(Buffer.from(apiKey)), false);
	assert.throws(() => decodeCheckpoint(encrypted, 'cd'.repeat(32)), /authentication/);
	const tampered = Buffer.from(encrypted);
	tampered[tampered.length - 1] ^= 1;
	assert.throws(() => decodeCheckpoint(tampered, key), /authentication/);
	assert.throws(() => decodeCheckpoint(encrypted.subarray(0, 10), key), /container/);
});

test('unsafe paths, auditions, duplicate entries and false file checksums fail before encoding', () => {
	for (const name of [
		'../.env.local',
		'example/../../secret',
		'/example/manifest.json',
		'_audition/manifest.json',
		'example/other.json',
		'example\\manifest.json'
	])
		assert.throws(() => encodeCheckpoint([entry(name)], key), /path/);
	assert.throws(() => encodeCheckpoint([entry(), entry()], key), /duplicate/);
	assert.throws(() => encodeCheckpoint([{ ...entry(), sha256: '0'.repeat(64) }], key), /checksum/);
	assert.throws(() => encodeCheckpoint([{ ...entry(), bytes: 0 }], key), /metadata/);
});

test('source collection rejects unexpected files and symlinks and omits auditions', async (t) => {
	const root = await fixture(t);
	const sources = path.join(root, '.codex-artifacts/narration-sources');
	await fs.mkdir(path.join(sources, '_audition'));
	await fs.writeFile(path.join(sources, '_audition/.env.local'), 'never upload');
	assert.equal((await collectCheckpoint(sources)).length, 1);
	await fs.writeFile(path.join(sources, 'example/.env.local'), 'never upload');
	await assert.rejects(collectCheckpoint(sources), /Unexpected private source file/);
});

test('hosted project, key, free hosting and quota state fail closed on mismatches', async () => {
	assert.throws(() => validateHostedQuota({ ...quota(), used: 11 }), /count/);
	assert.throws(() => validateHostedQuota({ ...quota(), day: '2026-02-30' }), /date/);
	assert.throws(
		() => validateHostedState({ ...state(), hosting: { ...state().hosting, plan: 'pro' } }),
		/hosting/
	);
	assert.throws(
		() => validateHostedState({ ...state(), repository: 'another/repo' }),
		/repository/
	);
	await assert.rejects(
		createGithubNarrationState({ env: { ...env(), GEMINI_API_KEY: 'wrong' } }),
		/attested/
	);
	await assert.rejects(
		createGithubNarrationState({ env: { ...env(), NARRATION_GOOGLE_PROJECT_ID: 'wrong' } }),
		/pins/
	);
});

test('one-time bootstrap preserves existing usage and stores sources only as encrypted release assets', async (t) => {
	const root = await fixture(t);
	const remote = github();
	const client = await createGithubNarrationState({ root, env: env(), fetchImpl: remote.fetch });
	await client.bootstrap(quota());
	assert.equal(remote.current.quota.used, 10);
	assert(remote.current.checkpoint.assetId);
	const treeCalls = remote.calls.filter((call) => call.route === '/git/trees');
	assert(
		treeCalls[0].body.tree.some(
			(item) =>
				item.path === 'vercel.json' && JSON.parse(item.content).git.deploymentEnabled === false
		)
	);
	assert(treeCalls.every((call) => call.body.tree.every((item) => !item.path.endsWith('.wav'))));
	assert.equal(remote.assets.size, 1);
	const asset = [...remote.assets.values()][0];
	assert.equal(asset.bytes.includes(Buffer.from('public narration metadata')), false);
	await assert.rejects(
		(
			await createGithubNarrationState({
				root,
				env: { ...env(), GITHUB_ACTIONS: 'true' },
				fetchImpl: remote.fetch
			})
		).bootstrap(quota()),
		/cannot bootstrap/
	);
});

test('restore authenticates checkpoint and preserves the durable ledger before any generation', async (t) => {
	const root = await fixture(t);
	const remote = github();
	await (
		await createGithubNarrationState({ root, env: env(), fetchImpl: remote.fetch })
	).bootstrap(quota());
	const destination = await fixture(t);
	await fs.rm(path.join(destination, '.codex-artifacts/narration-sources'), { recursive: true });
	const client = await createGithubNarrationState({
		root: destination,
		env: env(),
		fetchImpl: remote.fetch
	});
	await client.restore();
	assert.equal(client.data.quota.used, 10);
	assert.equal(
		await fs.readFile(
			path.join(destination, '.codex-artifacts/narration-sources/example/manifest.json'),
			'utf8'
		),
		'public narration metadata'
	);
	await assert.rejects(client.restore(), /empty runner source/);
});

test('absent state and corrupted checkpoint cannot silently initialize an empty quota', async (t) => {
	const root = await fixture(t);
	const remote = github();
	remote.absent = true;
	await assert.rejects(
		(await createGithubNarrationState({ root, env: env(), fetchImpl: remote.fetch })).restore(),
		/HTTP 404/
	);
	assert.equal(
		JSON.parse(await fs.readFile(path.join(root, '.codex-artifacts/narration-quota.json'))).used,
		10
	);
	remote.absent = false;
	await (
		await createGithubNarrationState({ root, env: env(), fetchImpl: remote.fetch })
	).bootstrap(quota());
	const asset = remote.assets.get(remote.current.checkpoint.assetId);
	asset.bytes[asset.bytes.length - 1] ^= 1;
	const destination = await fixture(t);
	await fs.rm(path.join(destination, '.codex-artifacts/narration-sources'), { recursive: true });
	await assert.rejects(
		(
			await createGithubNarrationState({ root: destination, env: env(), fetchImpl: remote.fetch })
		).restore(),
		/checksum/
	);
	assert.equal(
		JSON.parse(await fs.readFile(path.join(destination, '.codex-artifacts/narration-quota.json')))
			.used,
		10
	);
});

test('remote quota reservation is fast-forward-only and conflicts prevent provider transport', async (t) => {
	const root = await fixture(t);
	const remote = github();
	const initial = { ...quota(), used: 3 };
	await fs.writeFile(
		path.join(root, '.codex-artifacts/narration-quota.json'),
		JSON.stringify(initial)
	);
	const client = await createGithubNarrationState({ root, env: env(), fetchImpl: remote.fetch });
	await client.bootstrap(initial);
	await fs.writeFile(
		path.join(root, '.codex-artifacts/narration-quota.json'),
		JSON.stringify({ ...initial, used: 4, updatedAt: 11, lastRequestAt: 11 })
	);
	await client.saveQuota();
	assert.equal(remote.current.quota.used, 4);
	remote.conflict = true;
	await fs.writeFile(
		path.join(root, '.codex-artifacts/narration-quota.json'),
		JSON.stringify({ ...initial, used: 5, updatedAt: 12, lastRequestAt: 12 })
	);
	let transported = false;
	await assert.rejects(
		(async () => {
			await client.saveQuota();
			transported = true;
		})(),
		/HTTP 409/
	);
	assert.equal(transported, false);
	assert.equal(remote.current.quota.used, 4);
});

test('same-day ledger rewinds and checkpoint persistence failure retain durable progress', async (t) => {
	const root = await fixture(t);
	const remote = github();
	const client = await createGithubNarrationState({ root, env: env(), fetchImpl: remote.fetch });
	await client.bootstrap(quota());
	const pointer = structuredClone(client.data.checkpoint);
	await fs.writeFile(
		path.join(root, '.codex-artifacts/narration-quota.json'),
		JSON.stringify({ ...quota(), used: 0 })
	);
	await assert.rejects(client.saveQuota(), /backwards/);
	await fs.writeFile(
		path.join(root, '.codex-artifacts/narration-quota.json'),
		JSON.stringify(quota())
	);
	remote.uploadFails = true;
	await assert.rejects(client.saveCheckpoint(), /HTTP 503/);
	assert.deepEqual(remote.current.checkpoint, pointer);
});

test('only current and previous owned snapshots remain after successful pointer replacement', async (t) => {
	const root = await fixture(t);
	const remote = github();
	const client = await createGithubNarrationState({ root, env: env(), fetchImpl: remote.fetch });
	await client.bootstrap(quota());
	remote.assets.set(77, {
		id: 77,
		name: 'unrelated-release-file.bin',
		bytes: Buffer.from('unrelated')
	});
	await client.saveCheckpoint();
	await client.saveCheckpoint();
	assert.equal(
		[...remote.assets.values()].filter((asset) => asset.name.startsWith('narration-checkpoint-v1-'))
			.length,
		2
	);
	assert(remote.assets.has(77));
});

test('source pruning requires a verified hosted publication and never deletes local originals', async (t) => {
	const root = await fixture(t);
	const remote = github();
	const client = await createGithubNarrationState({ root, env: env(), fetchImpl: remote.fetch });
	await client.bootstrap(quota());
	await assert.rejects(client.dropPublishedSources(['example']), /verified hosted/);
	await client.savePublication({ commit: 'a'.repeat(40), slugs: ['example'], status: 'verified' });
	await assert.rejects(client.dropPublishedSources(['example']), /verified hosted/);
	const hosted = await createGithubNarrationState({
		root,
		env: { ...env(), GITHUB_ACTIONS: 'true' },
		fetchImpl: remote.fetch
	});
	await fs.rm(path.join(root, '.codex-artifacts/narration-sources'), { recursive: true });
	await hosted.restore();
	await assert.rejects(hosted.dropPublishedSources(['../outside']), /pruning slug/);
	await hosted.dropPublishedSources(['example']);
	await assert.rejects(
		fs.access(path.join(root, '.codex-artifacts/narration-sources/example')),
		/ENOENT/
	);
});
