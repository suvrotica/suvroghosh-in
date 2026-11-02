import { readBoundedBody, withDeadline } from '$lib/server/http/body';
import type {
	Catalogue,
	CatalogueEntry,
	GalleryItem,
	GalleryResponse,
	VideoAvailability
} from '$lib/visualizations/videos-i-like/types';

export const CACHE_TTL_MS = 15 * 60_000;
export const FAILURE_TTL_MS = 60_000;
export const MAX_PLAYLIST_PAGES = 20;
export const CHECK_TIMEOUT_MS = 18_000;
const PROVIDER_TIMEOUT_MS = 6_000;
const PROVIDER_BODY_BYTES = 2 * 1024 * 1024;
const MAX_PROVIDER_CALLS_PER_DAY = 2_000;

export type GalleryQuery =
	| { playlistKey?: undefined; page?: undefined }
	| {
			playlistKey: string;
			page: number;
	  };
type RecordValue = Record<string, unknown>;
type RawVideo = {
	id: string;
	title: string;
	channelTitle: string;
	thumbnail?: string;
	durationSeconds?: number;
	checkedAt: string | null;
	state: 'eligible' | 'unavailable' | 'unknown';
	reason?: string;
	allowed?: string[];
	blocked?: string[];
};
type RawPlaylist = {
	title: string;
	channelTitle: string;
	videos: RawVideo[];
	totalCount?: number;
	checkedAt: string | null;
	state: 'eligible' | 'unavailable' | 'unknown';
	reason?: string;
	nextToken?: string;
	pages: number;
	partial: boolean;
	retryAfter?: number;
};
type Snapshot = {
	videos: Map<string, RawVideo>;
	playlists: Map<string, RawPlaylist>;
	expiresAt: number;
};
class ProviderFailure extends Error {
	constructor(public readonly kind: 'unavailable' | 'unknown' = 'unknown') {
		super(kind);
	}
}
const record = (value: unknown): RecordValue | null =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as RecordValue)
		: null;
const text = (value: unknown, limit = 500) =>
	typeof value === 'string' ? value.slice(0, limit) : '';
const iso = (time: number) => new Date(time).toISOString();
const chunks = <T>(values: T[], size: number): T[][] =>
	Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
		values.slice(index * size, (index + 1) * size)
	);

function unknownVideo(id: string, reason = 'Availability could not be checked.'): RawVideo {
	return {
		id,
		title: 'YouTube video',
		channelTitle: '',
		state: 'unknown',
		checkedAt: null,
		reason
	};
}
function thumbnail(snippet: RecordValue): string | undefined {
	const thumbnails = record(snippet.thumbnails);
	for (const name of ['medium', 'high', 'default']) {
		const value = text(record(thumbnails?.[name])?.url, 2048);
		try {
			const url = new URL(value);
			if (url.protocol === 'https:' && /^(?:i|i\d)\.ytimg\.com$/.test(url.hostname))
				return url.href;
		} catch {
			/* Ignore malformed provider thumbnail URLs. */
		}
	}
	return undefined;
}
function duration(value: unknown): number | undefined {
	const match =
		typeof value === 'string' &&
		/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
	if (!match) return undefined;
	const seconds =
		Number(match[1] ?? 0) * 86400 +
		Number(match[2] ?? 0) * 3600 +
		Number(match[3] ?? 0) * 60 +
		Number(match[4] ?? 0);
	return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : undefined;
}
function regions(value: unknown): string[] | undefined {
	return Array.isArray(value) &&
		value.every((item) => typeof item === 'string' && /^[A-Z]{2}$/.test(item))
		? (value as string[])
		: undefined;
}
function normalizeVideo(id: string, value: RecordValue, checkedAt: string): RawVideo {
	const snippet = record(value.snippet);
	const status = record(value.status);
	const details = record(value.contentDetails);
	if (
		!snippet ||
		!status ||
		!details ||
		typeof snippet.title !== 'string' ||
		typeof status.embeddable !== 'boolean' ||
		!['public', 'unlisted', 'private'].includes(String(status.privacyStatus))
	)
		return unknownVideo(id);
	const restriction = record(details.regionRestriction);
	if (
		details.regionRestriction !== undefined &&
		(!restriction ||
			(restriction.allowed !== undefined && !regions(restriction.allowed)) ||
			(restriction.blocked !== undefined && !regions(restriction.blocked)))
	)
		return unknownVideo(id);
	const raw: RawVideo = {
		id,
		title: text(snippet.title),
		channelTitle: text(snippet.channelTitle),
		thumbnail: thumbnail(snippet),
		durationSeconds: duration(details.duration),
		checkedAt,
		state: 'eligible',
		allowed: regions(restriction?.allowed),
		blocked: regions(restriction?.blocked)
	};
	if (status.privacyStatus === 'private')
		return { ...raw, state: 'unavailable', reason: 'This video is private.' };
	if (['deleted', 'failed', 'rejected'].includes(String(status.uploadStatus)))
		return { ...raw, state: 'unavailable', reason: 'This video is no longer available.' };
	if (status.uploadStatus === 'uploaded')
		return { ...raw, state: 'unknown', reason: 'This video is still being processed.' };
	if (!status.embeddable)
		return { ...raw, state: 'unavailable', reason: 'This video cannot be played here.' };
	if (record(details.contentRating)?.ytRating === 'ytAgeRestricted')
		return { ...raw, state: 'unavailable', reason: 'This video needs to be watched on YouTube.' };
	if (raw.allowed?.length === 0)
		return { ...raw, state: 'unavailable', reason: 'This video is not available in any country.' };
	return raw;
}

/** Region decisions are made on copies, never written into the shared provider cache. */
export function forViewer(video: RawVideo, country?: string): VideoAvailability {
	const { allowed, blocked, ...result } = video;
	if (
		result.state === 'eligible' &&
		country &&
		((allowed && !allowed.includes(country)) || blocked?.includes(country))
	) {
		return {
			...result,
			state: 'unavailable',
			reason: 'This video is not available in your country.'
		};
	}
	return result;
}

/** Bounded process-local metadata cache and call budget; separate instances do not coordinate. */
export function createGalleryService(options: {
	catalogue: Catalogue;
	apiKey: () => string | undefined;
	fetch?: typeof fetch;
	now?: () => number;
}) {
	const now = options.now ?? Date.now;
	const fetchProvider = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
	let snapshot: Snapshot | undefined;
	let expiryTimer: ReturnType<typeof setTimeout> | undefined;
	let initialFlight: Promise<Snapshot> | undefined;
	const playlistFlights = new Map<string, Promise<void>>();
	const videoCache = new Map<string, { value: RawVideo; expiresAt: number }>();
	const videoFlights = new Map<string, Promise<RawVideo>>();
	let previousKey: string | undefined;
	let providerCalls: number[] = [];
	let active = 0;
	const waiting: Array<() => void> = [];
	function cache(value: Snapshot) {
		snapshot = value;
		clearTimeout(expiryTimer);
		expiryTimer = setTimeout(
			() => {
				if (snapshot === value) {
					snapshot = undefined;
					videoCache.clear();
				}
			},
			Math.max(1, value.expiresAt - now())
		);
		expiryTimer.unref?.();
	}

	async function provider(
		path: 'videos' | 'playlists' | 'playlistItems',
		params: Record<string, string>,
		key: string,
		signal: AbortSignal
	) {
		if (active >= 4) await new Promise<void>((resolve) => waiting.push(resolve));
		active += 1;
		try {
			if (signal.aborted) throw new ProviderFailure();
			providerCalls = providerCalls.filter((time) => now() - time < 86_400_000);
			if (providerCalls.length >= MAX_PROVIDER_CALLS_PER_DAY) throw new ProviderFailure();
			providerCalls.push(now());
			return await withDeadline(async (deadline) => {
				const combined = AbortSignal.any([signal, deadline]);
				const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
				url.search = new URLSearchParams({ ...params, key }).toString();
				const response = await fetchProvider(url, {
					signal: combined,
					redirect: 'error',
					headers: { Accept: 'application/json' }
				});
				const bytes = await readBoundedBody(
					response,
					PROVIDER_BODY_BYTES,
					PROVIDER_TIMEOUT_MS,
					combined
				);
				const body = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
				if (!response.ok) {
					const errors = record(body?.error)?.errors;
					const missing =
						response.status === 404 &&
						Array.isArray(errors) &&
						errors.some((error) => record(error)?.reason === 'playlistNotFound');
					throw new ProviderFailure(missing ? 'unavailable' : 'unknown');
				}
				if (!body || !Array.isArray(body.items) || body.items.length > 50)
					throw new ProviderFailure();
				return body;
			}, PROVIDER_TIMEOUT_MS);
		} finally {
			active -= 1;
			waiting.shift()?.();
		}
	}

	async function queryVideos(
		ids: string[],
		key: string,
		signal: AbortSignal
	): Promise<Map<string, RawVideo>> {
		const output = new Map<string, RawVideo>();
		await Promise.all(
			chunks([...new Set(ids)], 50).map(async (batch) => {
				try {
					const result = await provider(
						'videos',
						{ id: batch.join(','), part: 'snippet,status,contentDetails' },
						key,
						signal
					);
					const returned = new Map(
						(result.items as unknown[]).map((item) => {
							const value = record(item);
							if (!value || typeof value.id !== 'string' || !batch.includes(value.id))
								throw new ProviderFailure();
							return [value.id, value] as const;
						})
					);
					const checkedAt = iso(now());
					for (const id of batch) {
						const value = returned.get(id);
						output.set(
							id,
							value
								? normalizeVideo(id, value, checkedAt)
								: {
										...unknownVideo(id),
										state: 'unavailable',
										checkedAt,
										reason: 'This video is no longer publicly available.'
									}
						);
					}
				} catch {
					for (const id of batch) output.set(id, unknownVideo(id));
				}
			})
		);
		return output;
	}

	async function videos(
		ids: string[],
		key: string,
		signal: AbortSignal
	): Promise<Map<string, RawVideo>> {
		const pending = new Map<string, Promise<RawVideo>>();
		const fresh = new Map<string, (value: RawVideo) => void>();
		for (const id of new Set(ids)) {
			const existing = videoCache.get(id);
			if (existing && existing.expiresAt > now()) {
				pending.set(id, Promise.resolve(existing.value));
			} else if (videoFlights.has(id)) {
				pending.set(id, videoFlights.get(id)!);
			} else {
				const flight = new Promise<RawVideo>((resolve) => fresh.set(id, resolve));
				videoFlights.set(id, flight);
				pending.set(id, flight);
			}
		}
		if (fresh.size) {
			const checked = await queryVideos([...fresh.keys()], key, signal);
			for (const [id, resolve] of fresh) {
				const value = checked.get(id) ?? unknownVideo(id);
				// The known catalogue bounds the key space; evict older entries at an explicit cap.
				if (videoCache.size >= 5000 && !videoCache.has(id))
					videoCache.delete(videoCache.keys().next().value!);
				videoCache.set(id, {
					value,
					expiresAt: now() + (value.state === 'unknown' ? FAILURE_TTL_MS : CACHE_TTL_MS)
				});
				videoFlights.delete(id);
				resolve(value);
			}
		}
		return new Map(
			await Promise.all([...pending].map(async ([id, promise]) => [id, await promise] as const))
		);
	}

	async function members(
		entry: CatalogueEntry,
		playlist: RawPlaylist,
		key: string,
		signal: AbortSignal
	) {
		try {
			const result = await provider(
				'playlistItems',
				{
					playlistId: entry.id,
					part: 'contentDetails',
					maxResults: '50',
					...(playlist.nextToken ? { pageToken: playlist.nextToken } : {})
				},
				key,
				signal
			);
			const ids = (result.items as unknown[]).map(
				(item) => record(record(item)?.contentDetails)?.videoId
			);
			if (ids.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id)))
				throw new ProviderFailure();
			const nextToken = result.nextPageToken;
			if (
				nextToken !== undefined &&
				(typeof nextToken !== 'string' || nextToken.length > 2048 || nextToken.length === 0)
			)
				throw new ProviderFailure();
			const checked = await videos(ids as string[], key, signal);
			playlist.videos.push(...(ids as string[]).map((id) => checked.get(id) ?? unknownVideo(id)));
			playlist.pages += 1;
			playlist.nextToken = nextToken as string | undefined;
			playlist.checkedAt = iso(now());
			playlist.partial = playlist.videos.some((video) => video.state === 'unknown');
			playlist.reason = undefined;
			playlist.retryAfter = undefined;
		} catch (error) {
			playlist.partial = true;
			playlist.retryAfter = now() + FAILURE_TTL_MS;
			playlist.reason = 'Some playlist videos could not be checked.';
			if (error instanceof ProviderFailure && error.kind === 'unavailable' && !playlist.pages) {
				playlist.state = 'unavailable';
				playlist.reason = 'This playlist is no longer publicly available.';
				playlist.checkedAt = iso(now());
				playlist.partial = false;
			} else if (!playlist.pages) playlist.state = 'unknown';
		}
	}

	async function refresh(key: string): Promise<Snapshot> {
		const state: Snapshot = {
			videos: new Map(),
			playlists: new Map(),
			expiresAt: now() + CACHE_TTL_MS
		};
		for (const entry of options.catalogue.entries.filter((entry) => entry.kind === 'video'))
			state.videos.set(entry.id, unknownVideo(entry.id));
		const playlistEntries = options.catalogue.entries.filter((entry) => entry.kind === 'playlist');
		for (const entry of playlistEntries)
			state.playlists.set(entry.id, {
				title: 'YouTube playlist',
				channelTitle: '',
				videos: [],
				checkedAt: null,
				state: 'unknown',
				pages: 0,
				partial: true,
				reason: 'Availability could not be checked.'
			});
		try {
			await withDeadline(async (signal) => {
				await Promise.all([
					(async () => {
						state.videos = await videos(
							options.catalogue.entries
								.filter((entry) => entry.kind === 'video')
								.map((entry) => entry.id),
							key,
							signal
						);
					})(),
					...chunks(playlistEntries, 50).map(async (batch) => {
						try {
							const result = await provider(
								'playlists',
								{
									id: batch.map((entry) => entry.id).join(','),
									part: 'snippet,contentDetails,status'
								},
								key,
								signal
							);
							const returned = new Map(
								(result.items as unknown[]).map((item) => {
									const value = record(item);
									if (!value || typeof value.id !== 'string') throw new ProviderFailure();
									return [value.id, value] as const;
								})
							);
							await Promise.all(
								batch.map(async (entry) => {
									const playlist = state.playlists.get(entry.id)!;
									const value = returned.get(entry.id);
									if (!value || record(value.status)?.privacyStatus === 'private') {
										Object.assign(playlist, {
											state: 'unavailable',
											checkedAt: iso(now()),
											partial: false,
											reason: 'This playlist is no longer publicly available.'
										});
										return;
									}
									const snippet = record(value.snippet);
									if (
										!snippet ||
										typeof snippet.title !== 'string' ||
										typeof record(value.status)?.privacyStatus !== 'string'
									)
										return;
									playlist.title = text(snippet.title);
									playlist.channelTitle = text(snippet.channelTitle);
									const count = record(value.contentDetails)?.itemCount;
									if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)
										playlist.totalCount = count;
									playlist.state = 'eligible';
									await members(entry, playlist, key, signal);
								})
							);
						} catch {
							/* Provider failure leaves these playlists unknown. */
						}
					})
				]);
			}, CHECK_TIMEOUT_MS);
		} catch {
			/* Deadline leaves unfinished entries unknown, never deleted. */
		}
		const partial =
			[...state.videos.values()].some((video) => video.state === 'unknown') ||
			[...state.playlists.values()].some((playlist) => playlist.partial);
		state.expiresAt = now() + (partial ? FAILURE_TTL_MS : CACHE_TTL_MS);
		// Reusing a successful video lookup must not extend its 15-minute freshness window.
		for (const value of [
			...state.videos.values(),
			...[...state.playlists.values()].flatMap((playlist) => playlist.videos)
		]) {
			if (value.checkedAt)
				state.expiresAt = Math.min(state.expiresAt, Date.parse(value.checkedAt) + CACHE_TTL_MS);
		}
		// A timed-out provider that ignores abort must not mutate an already returned snapshot.
		return {
			...state,
			videos: new Map(state.videos),
			playlists: new Map(
				[...state.playlists].map(([id, playlist]) => [
					id,
					{ ...playlist, videos: [...playlist.videos] }
				])
			)
		};
	}

	function item(entry: CatalogueEntry, state: Snapshot | undefined, country?: string): GalleryItem {
		if (entry.kind === 'mix')
			return {
				...entry,
				title: 'YouTube Mix',
				channelTitle: '',
				state: 'unknown',
				checkedAt: null,
				reason: 'YouTube Mixes open on YouTube.',
				videos: [],
				checkedCount: 0
			};
		if (entry.kind === 'video') {
			const video = forViewer(state?.videos.get(entry.id) ?? unknownVideo(entry.id), country);
			return { ...entry, ...video, videos: [video], checkedCount: video.checkedAt ? 1 : 0 };
		}
		const playlist = state?.playlists.get(entry.id);
		if (!playlist)
			return {
				...entry,
				title: 'YouTube playlist',
				channelTitle: '',
				state: 'unknown',
				checkedAt: null,
				videos: [],
				checkedCount: 0,
				reason: 'Availability could not be checked.'
			};
		const checkedVideos = playlist.videos.map((video) => forViewer(video, country));
		const first = checkedVideos.find((video) => video.state === 'eligible');
		const hasMore = Boolean(playlist.nextToken);
		const unknown =
			playlist.state === 'unknown' ||
			playlist.partial ||
			checkedVideos.some((video) => video.state === 'unknown');
		return {
			...entry,
			title: playlist.title,
			channelTitle: playlist.channelTitle,
			state: first ? 'eligible' : unknown || hasMore ? 'unknown' : 'unavailable',
			thumbnail: first?.thumbnail,
			checkedAt: playlist.checkedAt,
			videos: checkedVideos,
			checkedCount: checkedVideos.filter((video) => video.checkedAt).length,
			totalCount: playlist.totalCount,
			nextPage: hasMore && playlist.pages < MAX_PLAYLIST_PAGES ? playlist.pages : undefined,
			reason:
				playlist.reason ??
				(hasMore && playlist.pages >= MAX_PLAYLIST_PAGES
					? 'Only the first 1,000 playlist entries have been checked.'
					: !first
						? hasMore
							? 'No playable videos in the checked portion yet.'
							: 'No playable videos are currently available here.'
						: undefined)
		};
	}

	return {
		async load(query: GalleryQuery = {}, country?: string): Promise<GalleryResponse> {
			const key = options.apiKey()?.trim();
			if (key !== previousKey) {
				snapshot = undefined;
				clearTimeout(expiryTimer);
				videoCache.clear();
				previousKey = key;
			}
			const entries = query.playlistKey
				? options.catalogue.entries.filter(
						(entry) => entry.key === query.playlistKey && entry.kind === 'playlist'
					)
				: options.catalogue.entries;
			if (!key)
				return {
					items: entries.map((entry) => item(entry, undefined, country)),
					checkedAt: null,
					expiresAt: null,
					configuration: 'missing-key',
					partial: true
				};
			if (!snapshot || snapshot.expiresAt <= now()) {
				initialFlight ??= refresh(key).finally(() => {
					initialFlight = undefined;
				});
				cache(await initialFlight);
				// Expired continuation tokens restart with a bounded first page.
				query = {};
			}
			const state = snapshot!;
			if (query.playlistKey && entries[0]) {
				const entry = entries[0];
				const playlist = state.playlists.get(entry.id);
				if (
					playlist?.nextToken &&
					query.page === playlist.pages &&
					playlist.pages < MAX_PLAYLIST_PAGES &&
					(playlist.retryAfter ?? 0) <= now()
				) {
					const flightKey = `${entry.key}:${query.page}`;
					if (!playlistFlights.has(flightKey)) {
						const working = { ...playlist, videos: [...playlist.videos] };
						playlistFlights.set(
							flightKey,
							withDeadline((signal) => members(entry, working, key, signal), CHECK_TIMEOUT_MS)
								.then(() => {
									state.playlists.set(entry.id, { ...working, videos: [...working.videos] });
								})
								.catch(() => {
									playlist.partial = true;
									playlist.retryAfter = now() + FAILURE_TTL_MS;
								})
								.finally(() => {
									playlistFlights.delete(flightKey);
								})
						);
					}
					await playlistFlights.get(flightKey);
					if (state.playlists.get(entry.id)?.partial) {
						state.expiresAt = Math.min(state.expiresAt, now() + FAILURE_TTL_MS);
						cache(state);
					}
				}
			}
			const items = entries.map((entry) => item(entry, state, country));
			const timestamps = items
				.map((value) => value.checkedAt)
				.filter((value): value is string => value !== null);
			return {
				items,
				checkedAt: timestamps.length ? timestamps.sort()[0] : null,
				expiresAt: iso(state.expiresAt),
				configuration: 'ready',
				partial: items.some(
					(value) =>
						value.kind !== 'mix' &&
						(value.state === 'unknown' ||
							value.videos.some((video) => video.state === 'unknown') ||
							value.nextPage !== undefined ||
							Boolean(state.playlists.get(value.id)?.nextToken))
				)
			};
		}
	};
}
