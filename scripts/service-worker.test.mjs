import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const origin = 'https://example.test';
const marker = '/__suvroghosh-build-cache-created__';
const ttl = 30 * 24 * 60 * 60 * 1000;
const asset = '/_app/immutable/chunks/viewed.js';
const unseen = '/_app/immutable/chunks/unopened-game.js';
const image = '/api/public/notes/assets/note-id/image-id';
const note = '/notes/opened-note';
const noteDocument = '/api/public/notes/opened-note/document';

function workerHarness(options = {}) {
	const listeners = new Map();
	const stores = new Map();
	const fetched = [];
	let skips = 0;
	let claims = 0;
	let online = true;
	const resourceKey = (request) =>
		new URL(typeof request === 'string' ? request : request.url, origin).href;
	const clients = new Map([['reader', { id: 'reader', type: 'window', url: origin + note }]]);
	function open(name) {
		if (!stores.has(name)) stores.set(name, new Map());
		const store = stores.get(name);
		return {
			match: async (request) => store.get(resourceKey(request))?.clone(),
			put: async (request, response) => store.set(resourceKey(request), response.clone()),
			delete: async (request) => store.delete(resourceKey(request)),
			keys: async () => [...store.keys()].map((url) => new Request(url)),
			addAll: async () => {
				throw new Error('Eager precaching is forbidden');
			}
		};
	}
	const caches = {
		open: async (name) => open(name),
		keys: async () => [...stores.keys()],
		delete: async (name) => stores.delete(name),
		match: async (request) => {
			for (const store of stores.values()) {
				const response = store.get(resourceKey(request));
				if (response) return response.clone();
			}
		}
	};
	const responses = new Map([
		[note, () => new Response('<html>Opened note and its viewed runtime</html>')],
		[noteDocument, () => Response.json({ document: { objects: [{ type: 'image', src: image }] } })]
	]);
	const self = {
		location: { origin },
		addEventListener: (name, callback) => listeners.set(name, callback),
		skipWaiting: async () => {
			skips++;
		},
		clients: {
			claim: async () => {
				claims++;
			},
			get: async (id) => clients.get(id)
		}
	};
	const source = fs
		.readFileSync('src/service-worker.ts', 'utf8')
		.replace(
			"import { build, version } from '$service-worker';",
			`const build = ${JSON.stringify(options.build ?? [asset, unseen])}; const version = 'test';`
		);
	const compiled = ts
		.transpileModule(source, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
		})
		.outputText.replace(/export \{\};?\s*$/, '');
	vm.runInNewContext(compiled, {
		self,
		caches,
		Response,
		Request,
		Headers,
		URL,
		Set,
		Map,
		Date,
		fetch: async (request) => {
			const url = new URL(resourceKey(request));
			fetched.push(url.pathname);
			if (!online) throw new TypeError('Offline');
			return responses.get(url.pathname)?.() ?? new Response(`Resource: ${url.pathname}`);
		}
	});
	async function dispatch(name, extra = {}) {
		const waiting = [];
		let response;
		listeners.get(name)?.({
			...extra,
			waitUntil: (promise) => waiting.push(promise),
			respondWith: (promise) => {
				response = Promise.resolve(promise);
			}
		});
		await Promise.all(waiting);
		return response;
	}
	return {
		stores,
		fetched,
		responses,
		clients,
		open,
		dispatch,
		fetch: (pathname, init) => dispatch('fetch', { request: new Request(origin + pathname, init) }),
		message: (urls, source = { id: 'reader' }) =>
			dispatch('message', { source, data: { type: 'cache-opened-public-note-v1', urls } }),
		offline: () => {
			online = false;
		},
		lifecycle: () => ({ skips, claims })
	};
}

test('install creates a cache marker and activates without requesting any of 1066 build assets', async () => {
	const worker = workerHarness({
		build: Array.from({ length: 1066 }, (_, i) => `/_app/immutable/chunks/${i}.js`)
	});
	await worker.dispatch('install');
	assert.deepEqual(worker.fetched, []);
	assert.ok(await worker.open('suvroghosh-build-test').match(marker));
	assert.equal(worker.stores.get('suvroghosh-build-test').size, 1);
	await worker.dispatch('activate');
	assert.deepEqual(worker.lifecycle(), { skips: 1, claims: 1 });
});

test('requested build assets are cached once, including concurrent requests; unvisited features stay absent', async () => {
	const worker = workerHarness();
	const [first, concurrent] = await Promise.all([worker.fetch(asset), worker.fetch(asset)]);
	assert.equal(await first.text(), `Resource: ${asset}`);
	assert.equal(await concurrent.text(), `Resource: ${asset}`);
	assert.equal(await (await worker.fetch(asset)).text(), `Resource: ${asset}`);
	assert.deepEqual(worker.fetched, [asset]);
	assert.equal(await worker.open('suvroghosh-build-test').match(unseen), undefined);
});

test('old cached runtimes remain reusable while activation expires only caches older than 30 days', async () => {
	const worker = workerHarness();
	await worker.open('suvroghosh-build-recent').put(marker, new Response(String(Date.now() - 1000)));
	await worker.open('suvroghosh-build-recent').put(asset, new Response('old compatible runtime'));
	await worker
		.open('suvroghosh-build-expired')
		.put(marker, new Response(String(Date.now() - ttl - 1000)));
	await worker.open('suvroghosh-build-pre-marker').put(unseen, new Response('legacy runtime'));
	await worker.dispatch('activate');
	assert.equal(worker.stores.has('suvroghosh-build-expired'), false);
	assert.equal(worker.stores.has('suvroghosh-build-recent'), true);
	assert.ok(await worker.open('suvroghosh-build-pre-marker').match(marker));
	assert.equal(await (await worker.fetch(asset)).text(), 'old compatible runtime');
	assert.deepEqual(worker.fetched, []);
});

test('first-view rescue caches only the opened public note, its requested whitelisted runtime and referenced image', async () => {
	const worker = workerHarness();
	await worker.message([
		asset,
		asset,
		image,
		'/api/public/notes/assets/another-note/unrelated',
		unseen + '?cachebust=1',
		'/_app/immutable/chunks/not-in-build.js',
		'https://elsewhere.test/a.js',
		'/api/notes/private/document'
	]);
	assert.deepEqual(worker.fetched, [note, noteDocument, asset, image]);
	await worker.message([asset, image]);
	assert.equal(worker.fetched.length, 4, 'a repeat view does not refetch already cached resources');
	worker.offline();
	assert.match(await (await worker.fetch(note)).text(), /Opened note/);
	assert.ok((await (await worker.fetch(noteDocument)).json()).document);
	assert.equal(await (await worker.fetch(asset)).text(), `Resource: ${asset}`);
	assert.equal(await (await worker.fetch(image)).text(), `Resource: ${image}`);
});

test('rescue rejects private/cross-origin clients, non-window senders, unknown messages and oversized batches', async () => {
	const worker = workerHarness();
	for (const url of [
		'/notes/studio',
		'/notes/sign-in',
		'/notes/auth/callback',
		'/blog/an-article',
		'https://elsewhere.test/notes/other'
	]) {
		worker.clients.set('reader', {
			id: 'reader',
			type: 'window',
			url: url.startsWith('http') ? url : origin + url
		});
		await worker.message([asset]);
	}
	worker.clients.set('reader', { id: 'reader', type: 'worker', url: origin + note });
	await worker.message([asset]);
	worker.clients.set('reader', { id: 'reader', type: 'window', url: origin + note });
	await worker.message(Array(129).fill(asset));
	await worker.dispatch('message', {
		source: { id: 'reader' },
		data: { type: 'unknown', urls: [asset] }
	});
	assert.deepEqual(worker.fetched, []);
});

test('private paths and non-GET requests bypass caching; no-store/private/set-cookie responses never enter caches', async () => {
	const worker = workerHarness();
	for (const path of ['/notes/studio', '/notes/auth/callback', '/api/notes/secret/document'])
		assert.equal(await worker.fetch(path), undefined);
	assert.equal(await worker.fetch(asset, { method: 'POST' }), undefined);
	for (const headers of [
		{ 'cache-control': 'no-store' },
		{ 'cache-control': 'private' },
		{ 'set-cookie': 'session=secret' }
	]) {
		worker.responses.set(note, () => new Response('private', { headers }));
		await worker.fetch(note);
		assert.equal(await worker.open('suvroghosh-public-notes-v1').match(note), undefined);
		worker.responses.set(asset, () => new Response('private', { headers }));
		await worker.fetch(asset);
		assert.equal(await worker.open('suvroghosh-build-test').match(asset), undefined);
	}
});

test('published notes retain network-first reads, evict 404/410, and reject expired offline snapshots', async () => {
	const worker = workerHarness();
	await worker.fetch(note);
	worker.responses.set(note, () => new Response('updated note'));
	assert.equal(await (await worker.fetch(note)).text(), 'updated note');
	for (const status of [404, 410]) {
		worker.responses.set(note, () => new Response('gone', { status }));
		assert.equal((await worker.fetch(note)).status, status);
		assert.equal(await worker.open('suvroghosh-public-notes-v1').match(note), undefined);
	}
	await worker.open('suvroghosh-public-notes-v1').put(
		note,
		new Response('expired', {
			headers: { 'x-suvroghosh-cached-at': String(Date.now() - ttl - 1000) }
		})
	);
	worker.offline();
	assert.equal((await worker.fetch(note)).status, 503);
	assert.equal(await worker.open('suvroghosh-public-notes-v1').match(note), undefined);
});
