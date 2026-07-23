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

worker.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			try {
				const cache = await caches.open(BUILD_CACHE);
				await cache.addAll(build);
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
	const response = await fetch(request);
	if (response.ok) {
		try {
			const cache = await caches.open(BUILD_CACHE);
			await cache.put(request, response.clone());
		} catch {
			// Cache Storage is an enhancement; a successful network response always wins.
		}
	}
	return response;
}

async function storePublicResponse(cache: Cache, request: Request, response: Response) {
	const cacheControl = response.headers.get('cache-control') ?? '';
	if (/no-store|private/i.test(cacheControl) || response.headers.has('set-cookie')) return;
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
	const isPublicNoteAsset = /^\/api\/public\/notes\/assets\/[^/]+\/[^/]+\/?$/.test(url.pathname);
	const isPublishedNotePage =
		/^\/notes\/[^/]+\/?$/.test(url.pathname) &&
		url.pathname !== '/notes/sign-in' &&
		url.pathname !== '/notes/studio' &&
		url.pathname !== '/notes/forgot-password' &&
		url.pathname !== '/notes/reset-password' &&
		url.pathname !== '/notes/auth';
	if (isPublicDocument || isPublicNoteAsset || isPublishedNotePage) {
		event.respondWith(networkFirstPublicNote(request));
	}
});
