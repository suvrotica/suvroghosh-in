/// <reference lib="webworker" />

import { build, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const BUILD_CACHE = `suvroghosh-build-${version}`;
// Keep explicitly opened notes across deployments. Bump this suffix only for an incompatible
// cached-response schema change.
const PUBLIC_NOTES_CACHE = 'suvroghosh-public-notes-v1';
const buildAssets = new Set(build);
const PUBLIC_NOTE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_PUBLIC_NOTE_ENTRIES = 240;
const BUILD_CACHE_MARKER = '/__suvroghosh-build-cache-created__';
const MAX_OPEN_NOTE_RESOURCES = 128;
const MAX_OPEN_NOTE_CLIENTS = 32;
const openedNotes = new Map<string, Promise<Set<string>>>();
const buildRequests = new Map<string, Promise<Response>>();
const PRIVATE_NOTES_PATHS = [
	'/notes/studio',
	'/notes/sign-in',
	'/notes/forgot-password',
	'/notes/reset-password',
	'/notes/auth',
	'/api/notes'
];

function matchesPrivateNotesPath(pathname: string) {
	return PRIVATE_NOTES_PATHS.some(
		(privatePath) => pathname === privatePath || pathname.startsWith(`${privatePath}/`)
	);
}

function isPublishedNotePath(pathname: string) {
	return /^\/notes\/[^/]+\/?$/.test(pathname) && !matchesPrivateNotesPath(pathname);
}

function isPublicNoteAssetPath(pathname: string) {
	return /^\/api\/public\/notes\/assets\/[^/]+\/[^/]+\/?$/.test(pathname);
}

function isPubliclyCacheable(response: Response) {
	return (
		response.ok &&
		!/no-store|private/i.test(response.headers.get('cache-control') ?? '') &&
		!response.headers.has('set-cookie')
	);
}

worker.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			try {
				const cache = await caches.open(BUILD_CACHE);
				// Install never downloads the site's complete code/font graph. An asset enters
				// this cache only after it is requested, including the bounded first-note rescue.
				await cache.put(
					BUILD_CACHE_MARKER,
					new Response(String(Date.now()), {
						headers: { 'content-type': 'text/plain; charset=utf-8' }
					})
				);
			} catch {
				// The site remains network-capable if Cache Storage is unavailable.
			}
			await worker.skipWaiting();
		})()
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			try {
				const keys = await caches.keys();
				for (const key of keys) {
					if (key.startsWith('suvroghosh-public-notes-') && key !== PUBLIC_NOTES_CACHE) {
						await caches.delete(key);
						continue;
					}
					if (!key.startsWith('suvroghosh-build-') || key === BUILD_CACHE) continue;
					const cache = await caches.open(key);
					const marker = await cache.match(BUILD_CACHE_MARKER);
					const createdAt = Number(marker ? await marker.text() : '0');
					if (createdAt > 0 && Date.now() - createdAt > PUBLIC_NOTE_TTL_MS) {
						await caches.delete(key);
					} else if (createdAt === 0) {
						// Give a pre-marker cache one retention window so saved HTML keeps its runtime.
						await cache.put(
							BUILD_CACHE_MARKER,
							new Response(String(Date.now()), {
								headers: { 'content-type': 'text/plain; charset=utf-8' }
							})
						);
					}
				}
			} catch {
				// Activation and online browsing must not depend on cache maintenance succeeding.
			}
			await worker.clients.claim();
		})()
	);
});

async function cacheFirst(request: Request) {
	const cached = await caches.match(request).catch(() => undefined);
	if (cached) return cached;
	let pending = buildRequests.get(request.url);
	if (!pending) {
		pending = (async () => {
			const response = await fetch(request);
			if (isPubliclyCacheable(response)) {
				try {
					const cache = await caches.open(BUILD_CACHE);
					await cache.put(request, response.clone());
				} catch {
					// Cache Storage is an enhancement; a successful network response always wins.
				}
			}
			return response;
		})();
		buildRequests.set(request.url, pending);
	}
	try {
		return (await pending).clone();
	} finally {
		if (buildRequests.get(request.url) === pending) buildRequests.delete(request.url);
	}
}

async function storePublicResponse(cache: Cache, request: Request, response: Response) {
	if (!isPubliclyCacheable(response)) return;
	const headers = new Headers(response.headers);
	headers.set('x-suvroghosh-cached-at', String(Date.now()));
	// Fetch exposes decoded bytes. Do not retain compression metadata on the synthetic response.
	headers.delete('content-encoding');
	headers.delete('content-length');
	const body = await response.clone().blob();
	await cache.put(
		request,
		new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers
		})
	);
	const keys = await cache.keys();
	for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_PUBLIC_NOTE_ENTRIES))) {
		await cache.delete(stale);
	}
}

async function networkFirstPublicNote(request: Request) {
	const cache = await caches.open(PUBLIC_NOTES_CACHE).catch(() => null);
	let response: Response;
	try {
		response = await fetch(request);
	} catch {
		const cached = await cache?.match(request).catch(() => undefined);
		const cachedAt = Number(cached?.headers.get('x-suvroghosh-cached-at') ?? '0');
		if (cached && cachedAt > 0 && Date.now() - cachedAt <= PUBLIC_NOTE_TTL_MS) return cached;
		if (cached) await cache?.delete(request).catch(() => false);
		return new Response('This published note is not available offline yet.', {
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		});
	}

	if (cache) {
		try {
			if (response.status === 404 || response.status === 410) {
				await cache.delete(request);
			} else if (response.ok) {
				await storePublicResponse(cache, request, response);
			}
		} catch {
			// Quota or private-mode failures must never replace a valid online response.
		}
	}
	return response;
}

async function cacheOpenedNote(client: Client): Promise<Set<string>> {
	const noteUrl = new URL(client.url);
	noteUrl.search = '';
	noteUrl.hash = '';
	const cache = await caches.open(PUBLIC_NOTES_CACHE);
	const fresh = async (request: Request) => {
		const cached = await cache.match(request);
		const cachedAt = Number(cached?.headers.get('x-suvroghosh-cached-at') ?? '0');
		return cached && cachedAt > 0 && Date.now() - cachedAt <= PUBLIC_NOTE_TTL_MS
			? cached
			: undefined;
	};
	const publicRequest = (url: string) => new Request(url, { credentials: 'omit' });
	const htmlRequest = publicRequest(noteUrl.href);
	if (!(await fresh(htmlRequest))) await networkFirstPublicNote(htmlRequest);
	const slug = noteUrl.pathname.split('/').filter(Boolean).at(-1)!;
	const documentUrl = new URL(
		`/api/public/notes/${encodeURIComponent(decodeURIComponent(slug))}/document`,
		noteUrl.origin
	);
	const documentRequest = publicRequest(documentUrl.href);
	const documentResponse =
		(await fresh(documentRequest)) ?? (await networkFirstPublicNote(documentRequest));
	const imageUrls = new Set<string>();
	if (documentResponse.ok) {
		try {
			const payload: unknown = await documentResponse.json();
			if (payload && typeof payload === 'object' && 'document' in payload) {
				const document = payload.document;
				if (
					document &&
					typeof document === 'object' &&
					'objects' in document &&
					Array.isArray(document.objects)
				) {
					for (const object of document.objects.slice(0, 10_000)) {
						if (!object || object.type !== 'image' || typeof object.src !== 'string') continue;
						const imageUrl = new URL(object.src, noteUrl.origin);
						if (
							imageUrl.origin === noteUrl.origin &&
							isPublicNoteAssetPath(imageUrl.pathname) &&
							!imageUrl.search
						)
							imageUrls.add(imageUrl.href);
					}
				}
			}
		} catch {
			// Offline HTML/document viewing must not depend on parsing optional image metadata.
		}
	}
	return imageUrls;
}

worker.addEventListener('message', (event) => {
	const data: unknown = event.data;
	if (
		!data ||
		typeof data !== 'object' ||
		!('type' in data) ||
		data.type !== 'cache-opened-public-note-v1' ||
		!('urls' in data) ||
		!Array.isArray(data.urls) ||
		data.urls.length > MAX_OPEN_NOTE_RESOURCES
	)
		return;
	const source = event.source;
	if (!source || !('id' in source)) return;
	const resourceNames: unknown[] = data.urls;
	event.waitUntil(
		(async () => {
			const client = await worker.clients.get(source.id);
			if (!client || client.type !== 'window') return;
			const clientUrl = new URL(client.url);
			if (clientUrl.origin !== worker.location.origin || !isPublishedNotePath(clientUrl.pathname))
				return;
			const key = `${client.id}:${clientUrl.pathname}`;
			let opened = openedNotes.get(key);
			if (!opened) {
				opened = cacheOpenedNote(client);
				openedNotes.set(key, opened);
				if (openedNotes.size > MAX_OPEN_NOTE_CLIENTS)
					openedNotes.delete(openedNotes.keys().next().value!);
			}
			const imageUrls = await opened;
			const urls = new Set<string>();
			for (const name of resourceNames) {
				if (typeof name !== 'string' || name.length > 2048) continue;
				const url = new URL(name, clientUrl.origin);
				if (url.origin !== clientUrl.origin || url.search || url.hash) continue;
				const immutable =
					url.pathname.startsWith('/_app/immutable/') && buildAssets.has(url.pathname);
				if (immutable || imageUrls.has(url.href)) urls.add(url.href);
			}
			for (const url of urls) {
				const request = new Request(url, { credentials: 'omit' });
				if (url.includes('/_app/immutable/')) await cacheFirst(request);
				else {
					const cache = await caches.open(PUBLIC_NOTES_CACHE);
					if (!(await cache.match(request))) await networkFirstPublicNote(request);
				}
			}
		})().catch(() => {
			// First-visit offline preparation must never interrupt the live note.
		})
	);
});

worker.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== worker.location.origin) return;

	if (matchesPrivateNotesPath(url.pathname)) return;

	if (buildAssets.has(url.pathname) || url.pathname.startsWith('/_app/immutable/')) {
		event.respondWith(cacheFirst(request));
		return;
	}

	const isPublicDocument =
		url.pathname.startsWith('/api/public/notes/') && url.pathname.endsWith('/document');
	const isPublicNoteAsset = isPublicNoteAssetPath(url.pathname);
	const isPublishedNotePage = isPublishedNotePath(url.pathname);
	if (isPublicDocument || isPublicNoteAsset || isPublishedNotePage) {
		event.respondWith(networkFirstPublicNote(request));
	}
});
