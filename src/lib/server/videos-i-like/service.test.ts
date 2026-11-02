import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalogue, CatalogueEntry } from '$lib/visualizations/videos-i-like/types';
import { CACHE_TTL_MS, createGalleryService, FAILURE_TTL_MS, PLAYLIST_BATCH_SIZE } from './service';
import { parseGalleryQuery, viewerCountry } from './http';

const videoEntry = (id = 'aaaaaaaaaaa'): CatalogueEntry => ({
	key: `video:${id}`,
	id,
	kind: 'video',
	url: `https://www.youtube.com/watch?v=${id}`,
	categories: ['music'],
	musicCategories: [],
	sources: []
});
const playlistEntry: CatalogueEntry = {
	...videoEntry('PLtest'),
	kind: 'playlist',
	key: 'playlist:PLtest',
	url: 'https://www.youtube.com/playlist?list=PLtest'
};
const catalogue = (entries: CatalogueEntry[]): Catalogue => ({
	version: 1,
	repository: 'source',
	branch: 'laptop',
	commit: 'abc',
	fileCount: 1,
	referenceCount: entries.length,
	entries
});
const json = (items: unknown[], extra = {}) => Response.json({ items, ...extra });
const video = (id = 'aaaaaaaaaaa', extra: Record<string, unknown> = {}) => ({
	id,
	snippet: {
		title: `Title ${id}`,
		channelTitle: 'Channel',
		thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } }
	},
	status: { privacyStatus: 'public', embeddable: true },
	contentDetails: { duration: 'PT2M10S' },
	...extra
});
const playlist = {
	id: 'PLtest',
	snippet: { title: 'A playlist', channelTitle: 'Channel' },
	status: { privacyStatus: 'public' },
	contentDetails: { itemCount: 2 }
};
afterEach(() => vi.useRealTimers());

function manyPlaylists(count: number): CatalogueEntry[] {
	return Array.from({ length: count }, (_, index) => ({
		...playlistEntry,
		id: `PLcourse${index}`,
		key: `playlist:PLcourse${index}`,
		url: `https://www.youtube.com/playlist?list=PLcourse${index}`
	}));
}
function courseProvider(sharedVideo = false) {
	return vi.fn(async (input: RequestInfo | URL) => {
		const url = new URL(String(input));
		if (url.pathname.endsWith('/playlists'))
			return json(
				url.searchParams
					.get('id')!
					.split(',')
					.map((id) => ({ ...playlist, id }))
			);
		if (url.pathname.endsWith('/playlistItems')) {
			const index = Number(url.searchParams.get('playlistId')!.replace('PLcourse', ''));
			return json([
				{
					contentDetails: {
						videoId: sharedVideo ? 'aaaaaaaaaaa' : `v${String(index).padStart(10, '0')}`
					}
				}
			]);
		}
		return json(
			url.searchParams
				.get('id')!
				.split(',')
				.map((id) => video(id))
		);
	});
}

describe('progressive fixed catalogue batches', () => {
	it('checks eight playlists at a time, shares video lookups, and caches repeated batches', async () => {
		const fetch = courseProvider(true);
		const service = createGalleryService({
			catalogue: catalogue([videoEntry(), ...manyPlaylists(18)]),
			apiKey: () => 'secret',
			fetch
		});
		const first = await service.load();
		expect(first.items).toHaveLength(PLAYLIST_BATCH_SIZE + 1);
		expect(first.nextBatch).toBe(1);
		expect(first.partial).toBe(false);
		expect(Date.parse(first.expiresAt!) - Date.parse(first.checkedAt!)).toBeLessThanOrEqual(
			CACHE_TTL_MS
		);
		expect(Date.parse(first.expiresAt!) - Date.parse(first.checkedAt!)).toBeGreaterThan(
			FAILURE_TTL_MS
		);
		const [second, same] = await Promise.all([
			service.load({ batch: 1 }),
			service.load({ batch: 1 })
		]);
		expect(second.items).toHaveLength(8);
		expect(second.items[0].id).toBe('PLcourse8');
		expect(second.nextBatch).toBe(2);
		expect(same.items).toEqual(second.items);
		const last = await service.load({ batch: 2 });
		expect(last.items).toHaveLength(2);
		expect(last.nextBatch).toBeUndefined();
		const count = fetch.mock.calls.length;
		await service.load();
		await service.load({ batch: 1 });
		expect(fetch).toHaveBeenCalledTimes(count);
		expect(
			fetch.mock.calls.filter(([input]) => new URL(String(input)).pathname.endsWith('/videos'))
		).toHaveLength(1);
		expect(
			fetch.mock.calls.filter(([input]) =>
				new URL(String(input)).pathname.endsWith('/playlistItems')
			)
		).toHaveLength(18);
	});

	it('serves a later batch on a cold instance without checking the standalone or earlier catalogue', async () => {
		const fetch = courseProvider();
		const service = createGalleryService({
			catalogue: catalogue([videoEntry(), ...manyPlaylists(18)]),
			apiKey: () => 'secret',
			fetch
		});
		const result = await service.load({ batch: 1 });
		expect(result.items.map((entry) => entry.id)).toEqual(
			manyPlaylists(16)
				.slice(8)
				.map((entry) => entry.id)
		);
		expect(result.items.every((entry) => entry.state === 'eligible')).toBe(true);
		const metadata = fetch.mock.calls
			.map(([input]) => new URL(String(input)))
			.filter((url) => url.pathname.endsWith('/playlists'));
		expect(metadata).toHaveLength(1);
		expect(metadata[0].searchParams.get('id')).toBe(
			result.items.map((entry) => entry.id).join(',')
		);
		expect(
			fetch.mock.calls.some(
				([input]) => new URL(String(input)).searchParams.get('id') === 'aaaaaaaaaaa'
			)
		).toBe(false);
	});

	it('gives each batch its own freshness and never renews an earlier checked prefix', async () => {
		let time = 0;
		const fetch = courseProvider();
		const service = createGalleryService({
			catalogue: catalogue(manyPlaylists(16)),
			apiKey: () => 'secret',
			fetch,
			now: () => time
		});
		const first = await service.load();
		time = 5 * 60_000;
		const second = await service.load({ batch: 1 });
		expect(Date.parse(first.expiresAt!)).toBe(CACHE_TTL_MS);
		expect(Date.parse(second.expiresAt!)).toBe(time + CACHE_TTL_MS);
		expect((await service.load()).expiresAt).toBe(first.expiresAt);
		const before = fetch.mock.calls.length;
		time = CACHE_TTL_MS + 1;
		await service.load({ batch: 1 });
		expect(fetch).toHaveBeenCalledTimes(before);
		await service.load();
		expect(fetch.mock.calls.length).toBeGreaterThan(before);
	});

	it('starts only the requested playlist on a cold continuation and never follows an expired token', async () => {
		let time = 0;
		const fetch = courseProvider();
		const service = createGalleryService({
			catalogue: catalogue([videoEntry(), ...manyPlaylists(18)]),
			apiKey: () => 'secret',
			fetch,
			now: () => time
		});
		const query = { playlistKey: 'playlist:PLcourse17', page: 1 };
		const result = await service.load(query);
		expect(result.items.map((entry) => entry.id)).toEqual(['PLcourse17']);
		expect(result.nextBatch).toBeUndefined();
		expect(fetch).toHaveBeenCalledTimes(3);
		time = CACHE_TTL_MS + 1;
		await service.load(query);
		expect(fetch).toHaveBeenCalledTimes(6);
		expect(
			fetch.mock.calls.every(([input]) => !new URL(String(input)).searchParams.has('pageToken'))
		).toBe(true);
	});

	it('does not continue a staged scan when credentials are missing', async () => {
		const fetch = vi.fn();
		const result = await createGalleryService({
			catalogue: catalogue(manyPlaylists(20)),
			apiKey: () => undefined,
			fetch
		}).load();
		expect(result.configuration).toBe('missing-key');
		expect(result.nextBatch).toBeUndefined();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('ignores late provider data after a timed-out batch instead of publishing it as playable', async () => {
		vi.useFakeTimers();
		let release!: (response: Response) => void;
		const fetch = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					release = resolve;
				})
		);
		const service = createGalleryService({
			catalogue: catalogue(manyPlaylists(16)),
			apiKey: () => 'secret',
			fetch
		});
		const pending = service.load({ batch: 1 });
		await vi.advanceTimersByTimeAsync(6100);
		const result = await pending;
		expect(result.items.every((entry) => entry.state === 'unknown')).toBe(true);
		release(
			json(
				manyPlaylists(16)
					.slice(8)
					.map((entry) => ({ ...playlist, id: entry.id }))
			)
		);
		await vi.advanceTimersByTimeAsync(1);
		expect((await service.load({ batch: 1 })).items).toEqual(result.items);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('shares the provider budget across batches and credential changes', async () => {
		let key = 0;
		let time = 0;
		const fetch = vi.fn(async () => json([]));
		const service = createGalleryService({
			catalogue: catalogue(manyPlaylists(16)),
			apiKey: () => `secret-${key}`,
			fetch,
			now: () => time
		});
		for (; key < 2002; key++) {
			const result = await service.load({ batch: key % 2 });
			expect(result.items[0].state).toBe(key < 2000 ? 'unavailable' : 'unknown');
		}
		expect(fetch).toHaveBeenCalledTimes(2000);
		time = 86_400_001;
		expect((await service.load({ batch: 0 })).items[0].state).toBe('unavailable');
		expect(fetch).toHaveBeenCalledTimes(2001);
	}, 10_000);
});

describe('Videos I Like availability', () => {
	it('makes no provider request without a key and preserves the source catalogue', async () => {
		const fetch = vi.fn();
		const service = createGalleryService({
			catalogue: catalogue([videoEntry(), playlistEntry]),
			apiKey: () => '',
			fetch
		});
		const result = await service.load();
		expect(fetch).not.toHaveBeenCalled();
		expect(result.configuration).toBe('missing-key');
		expect(result.items.map((item) => item.state)).toEqual(['unknown', 'unknown']);
		expect(result.items[0].url).toContain('aaaaaaaaaaa');
		expect(result.checkedAt).toBeNull();
	});

	it('distinguishes a successfully omitted video from failed lookup or malformed response', async () => {
		for (const [response, expected] of [
			[json([]), 'unavailable'],
			[
				Response.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 }),
				'unknown'
			],
			[Response.json({ unexpected: [] }), 'unknown']
		] as const) {
			const service = createGalleryService({
				catalogue: catalogue([videoEntry()]),
				apiKey: () => 'secret',
				fetch: vi.fn().mockResolvedValue(response)
			});
			expect((await service.load()).items[0].state).toBe(expected);
		}
	});

	it('filters private, embed-disabled and age-restricted content and preserves metadata', async () => {
		const entries = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'].map((id) =>
			videoEntry(id)
		);
		const service = createGalleryService({
			catalogue: catalogue(entries),
			apiKey: () => 'secret',
			fetch: vi.fn().mockResolvedValue(
				json([
					video('aaaaaaaaaaa', { status: { privacyStatus: 'private', embeddable: true } }),
					video('bbbbbbbbbbb', { status: { privacyStatus: 'public', embeddable: false } }),
					video('ccccccccccc', {
						contentDetails: { contentRating: { ytRating: 'ytAgeRestricted' } }
					}),
					video('ddddddddddd')
				])
			)
		});
		const result = await service.load();
		expect(result.items.map((item) => item.state)).toEqual([
			'unavailable',
			'unavailable',
			'unavailable',
			'eligible'
		]);
		expect(result.items[3].durationSeconds).toBe(130);
	});

	it('shares one refresh and 15-minute cache without sharing visitor region decisions', async () => {
		let time = Date.parse('2026-11-03T00:00:00Z');
		const fetch = vi
			.fn()
			.mockImplementation(async () =>
				json([video('aaaaaaaaaaa', { contentDetails: { regionRestriction: { blocked: ['IN'] } } })])
			);
		const service = createGalleryService({
			catalogue: catalogue([videoEntry()]),
			apiKey: () => 'secret',
			fetch,
			now: () => time
		});
		const [india, uk] = await Promise.all([service.load({}, 'IN'), service.load({}, 'GB')]);
		expect(india.items[0].state).toBe('unavailable');
		expect(uk.items[0].state).toBe('eligible');
		expect((await service.load()).items[0].state).toBe('eligible');
		expect(fetch).toHaveBeenCalledTimes(1);
		time += CACHE_TTL_MS + 1;
		await service.load();
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('backs off failures for one minute and can recover instead of persisting deletion', async () => {
		let time = 0;
		const fetch = vi
			.fn()
			.mockRejectedValueOnce(new Error('network'))
			.mockImplementation(async () => json([video()]));
		const service = createGalleryService({
			catalogue: catalogue([videoEntry()]),
			apiKey: () => 'secret',
			fetch,
			now: () => time
		});
		expect((await service.load()).items[0].state).toBe('unknown');
		await service.load();
		expect(fetch).toHaveBeenCalledTimes(1);
		time += FAILURE_TTL_MS + 1;
		expect((await service.load()).items[0].state).toBe('eligible');
	});

	it('loads a playlist in order, checks each member, and returns a cumulative bounded continuation', async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith('/playlists')) return json([playlist]);
			if (url.pathname.endsWith('/playlistItems')) {
				const id = url.searchParams.has('pageToken') ? 'bbbbbbbbbbb' : 'aaaaaaaaaaa';
				return json(
					[{ contentDetails: { videoId: id } }],
					url.searchParams.has('pageToken') ? {} : { nextPageToken: 'page-two' }
				);
			}
			return json([video(url.searchParams.get('id')!)]);
		});
		const service = createGalleryService({
			catalogue: catalogue([playlistEntry]),
			apiKey: () => 'secret',
			fetch
		});
		const first = await service.load();
		expect(first.items[0].nextPage).toBe(1);
		expect(first.partial).toBe(true);
		const [next, same] = await Promise.all([
			service.load({ playlistKey: playlistEntry.key, page: 1 }),
			service.load({ playlistKey: playlistEntry.key, page: 1 })
		]);
		expect(next.items).toHaveLength(1);
		expect(next.items[0].videos.map((item) => item.id)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
		expect(same.items[0].videos).toHaveLength(2);
		expect(next.items[0].nextPage).toBeUndefined();
		expect(next.items[0].totalCount).toBe(2);
		expect(fetch).toHaveBeenCalledTimes(5);
	});

	it('does not hide a mixed playlist when only one member is missing', async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith('/playlists')) return json([playlist]);
			if (url.pathname.endsWith('/playlistItems'))
				return json(
					['aaaaaaaaaaa', 'bbbbbbbbbbb'].map((videoId) => ({ contentDetails: { videoId } }))
				);
			return json([video('bbbbbbbbbbb')]);
		});
		const result = await createGalleryService({
			catalogue: catalogue([playlistEntry]),
			apiKey: () => 'secret',
			fetch
		}).load();
		expect(result.items[0].state).toBe('eligible');
		expect(result.items[0].videos.map((item) => item.state)).toEqual(['unavailable', 'eligible']);
		expect(result.items[0].thumbnail).toContain('bbbbbbbbbbb');
	});

	it('deduplicates video checks across standalone entries and playlist membership', async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith('/playlists')) return json([playlist]);
			if (url.pathname.endsWith('/playlistItems'))
				return json([{ contentDetails: { videoId: 'aaaaaaaaaaa' } }]);
			return json([video()]);
		});
		const result = await createGalleryService({
			catalogue: catalogue([videoEntry(), playlistEntry]),
			apiKey: () => 'secret',
			fetch
		}).load();
		expect(result.items.map((item) => item.state)).toEqual(['eligible', 'eligible']);
		expect(
			fetch.mock.calls.filter(([input]) => new URL(String(input)).pathname.endsWith('/videos'))
		).toHaveLength(1);
	});

	it('backs off a failed continuation and preserves the checked prefix', async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith('/playlists')) return json([playlist]);
			if (url.pathname.endsWith('/playlistItems')) {
				if (url.searchParams.has('pageToken'))
					return Response.json(
						{ error: { errors: [{ reason: 'quotaExceeded' }] } },
						{ status: 403 }
					);
				return json([{ contentDetails: { videoId: 'aaaaaaaaaaa' } }], { nextPageToken: 'next' });
			}
			return json([video()]);
		});
		const service = createGalleryService({
			catalogue: catalogue([playlistEntry]),
			apiKey: () => 'secret',
			fetch
		});
		await service.load();
		const result = await service.load({ playlistKey: playlistEntry.key, page: 1 });
		expect(result.items[0].state).toBe('eligible');
		expect(result.items[0].videos).toHaveLength(1);
		expect(result.items[0].nextPage).toBe(1);
		await service.load({ playlistKey: playlistEntry.key, page: 1 });
		expect(fetch).toHaveBeenCalledTimes(4);
	});

	it('does not fetch arbitrary skipped pages or exceed 1,000 playlist members', async () => {
		let pages = 0;
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith('/playlists')) return json([playlist]);
			if (url.pathname.endsWith('/playlistItems')) {
				pages++;
				return json(
					Array.from({ length: 50 }, () => ({ contentDetails: { videoId: 'aaaaaaaaaaa' } })),
					{ nextPageToken: `next-${pages}` }
				);
			}
			return json([video()]);
		});
		const service = createGalleryService({
			catalogue: catalogue([playlistEntry]),
			apiKey: () => 'secret',
			fetch
		});
		await service.load();
		await service.load({ playlistKey: playlistEntry.key, page: 19 });
		expect(pages).toBe(1);
		for (let page = 1; page < 20; page++)
			await service.load({ playlistKey: playlistEntry.key, page });
		const result = await service.load({ playlistKey: playlistEntry.key, page: 20 });
		expect(pages).toBe(20);
		expect(result.items[0].videos).toHaveLength(1000);
		expect(result.items[0].nextPage).toBeUndefined();
		expect(result.items[0].reason).toContain('1,000');
		expect(result.partial).toBe(true);
	});

	it('never queries a Mix or mistakes it for a normal playlist', async () => {
		const fetch = vi.fn();
		const entry: CatalogueEntry = { ...playlistEntry, kind: 'mix', id: 'RDmix' };
		const result = await createGalleryService({
			catalogue: catalogue([entry]),
			apiKey: () => 'secret',
			fetch
		}).load();
		expect(fetch).not.toHaveBeenCalled();
		expect(result.items[0].reason).toContain('open on YouTube');
	});

	it('settles an unresponsive provider and does not mark it deleted', async () => {
		vi.useFakeTimers();
		const fetch = vi.fn(() => new Promise<Response>(() => {}));
		const result = createGalleryService({
			catalogue: catalogue([videoEntry()]),
			apiKey: () => 'secret',
			fetch
		}).load();
		await vi.advanceTimersByTimeAsync(6100);
		expect((await result).items[0].state).toBe('unknown');
	});

	it('bounds actual provider response bytes', async () => {
		const cancel = vi.fn();
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
			},
			cancel
		});
		const fetch = vi.fn().mockResolvedValue(new Response(body));
		const result = await createGalleryService({
			catalogue: catalogue([videoEntry()]),
			apiKey: () => 'secret',
			fetch
		}).load();
		expect(result.items[0].state).toBe('unknown');
		expect(cancel).toHaveBeenCalled();
	});
});

describe('gallery input and region trust', () => {
	it('accepts only fixed catalogue batch indices and rejects mixed query shapes', () => {
		const source = catalogue(manyPlaylists(17));
		expect(parseGalleryQuery({ batch: 0 }, source)).toEqual({ batch: 0 });
		expect(parseGalleryQuery({ batch: 2 }, source)).toEqual({ batch: 2 });
		for (const value of [
			{ batch: -1 },
			{ batch: 3 },
			{ batch: 1.5 },
			{ batch: '1' },
			{ batch: NaN },
			{ batch: 1, page: 1 },
			{ batch: 1, playlistKey: 'playlist:PLcourse1', page: 1 },
			{ batch: 0, extra: true }
		])
			expect(parseGalleryQuery(value, source)).toBeNull();
		expect(parseGalleryQuery({ batch: 0 }, catalogue([videoEntry()]))).toBeNull();
	});
	it('accepts only known catalogue playlist continuation keys and bounded integer pages', () => {
		const source = catalogue([videoEntry(), playlistEntry]);
		expect(parseGalleryQuery({}, source)).toEqual({});
		expect(parseGalleryQuery({ playlistKey: playlistEntry.key, page: 1 }, source)).toEqual({
			playlistKey: playlistEntry.key,
			page: 1
		});
		for (const value of [
			null,
			[],
			{ id: 'arbitrary' },
			{ playlistKey: videoEntry().key, page: 1 },
			{ playlistKey: 'other', page: 1 },
			{ playlistKey: playlistEntry.key, page: 20 },
			{ playlistKey: playlistEntry.key, page: 1.5 }
		])
			expect(parseGalleryQuery(value, source)).toBeNull();
	});
	it('ignores spoofable country headers outside the canonical Vercel production boundary', () => {
		const headers = new Headers({ 'x-vercel-ip-country': 'IN' });
		const url = new URL('https://www.suvroghosh.in/api/videos-i-like');
		expect(viewerCountry(headers, url, {})).toBeUndefined();
		expect(viewerCountry(headers, url, { VERCEL: '1', VERCEL_ENV: 'preview' })).toBeUndefined();
		expect(
			viewerCountry(headers, new URL('https://other.example'), {
				VERCEL: '1',
				VERCEL_ENV: 'production'
			})
		).toBeUndefined();
		expect(viewerCountry(headers, url, { VERCEL: '1', VERCEL_ENV: 'production' })).toBe('IN');
	});
});
