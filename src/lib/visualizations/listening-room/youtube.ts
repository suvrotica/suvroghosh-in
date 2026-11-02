/** Documented IFrame API only. This module neither extracts audio nor reads iframe DOM. */
export interface YouTubeSource {
	videoId?: string;
	playlistId?: string;
	videoIds?: string[];
	startSeconds?: number;
	/** Zero-based; a URL's one-based `index` is converted by the parser. */
	index?: number;
}

export type YouTubePlaybackState =
	| 'idle'
	| 'unstarted'
	| 'cued'
	| 'playing'
	| 'paused'
	| 'buffering'
	| 'ended'
	| 'error';

export interface YouTubeSnapshot {
	state: YouTubePlaybackState;
	currentTime: number;
	duration: number;
	volume: number;
	muted: boolean;
	playlist: string[];
	playlistIndex: number;
	error?: string;
	/** Documented provider code; consumers must not classify human-readable error text. */
	errorCode?: number;
	autoplayBlocked?: boolean;
}

export interface YouTubeController {
	cue(source: YouTubeSource, mode?: 'video' | 'playlist'): void;
	play(): void;
	pause(): void;
	seek(seconds: number): void;
	volume(value: number): void;
	mute(value: boolean): void;
	next(): void;
	previous(): void;
	playAt(index: number): void;
	shuffle(enabled: boolean): void;
	repeat(mode: 'off' | 'one' | 'all'): void;
	destroy(): void;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,150}$/;
const HOSTS = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtu.be',
	'www.youtu.be',
	'youtube-nocookie.com',
	'www.youtube-nocookie.com'
]);

function parseTime(value: string | null): number | undefined {
	if (value === null || value === '') return undefined;
	if (/^\d+(?:\.\d+)?$/.test(value)) {
		const seconds = Number(value);
		return seconds <= 604800 ? seconds : undefined;
	}
	const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
	if (!units || !units.slice(1).some(Boolean)) return undefined;
	const seconds = Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
	return seconds <= 604800 ? seconds : undefined;
}

/** Parse URLs as data: reject lookalike hosts, credentials, custom ports and malformed IDs. */
export function parseYouTubeUrl(input: string): YouTubeSource | null {
	if (
		typeof input !== 'string' ||
		input.length > 4096 ||
		input.includes('\\') ||
		[...input].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
	) {
		return null;
	}
	let url: URL;
	const authority = /^https?:\/\/([^/?#]+)/i.exec(input.trim())?.[1];
	if (!authority || authority.includes(':')) return null;
	try {
		url = new URL(input.trim());
	} catch {
		return null;
	}
	if (
		!['https:', 'http:'].includes(url.protocol) ||
		!HOSTS.has(url.hostname) ||
		url.username ||
		url.password ||
		url.port
	) {
		return null;
	}
	for (const key of ['v', 'list', 't', 'start', 'index']) {
		if (url.searchParams.getAll(key).length > 1) return null;
	}
	const parts = url.pathname.split('/').filter(Boolean);
	let videoId: string | undefined;
	const shortHost = url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be';
	const privateHost = url.hostname.endsWith('youtube-nocookie.com');
	if (shortHost && parts.length === 1) videoId = parts[0];
	else if (!shortHost && (!privateHost || parts[0] === 'embed')) {
		if (parts.length === 1 && parts[0] === 'watch') {
			videoId = url.searchParams.get('v') ?? undefined;
		} else if (parts.length === 2 && ['shorts', 'embed', 'live'].includes(parts[0])) {
			if (parts[1] !== 'videoseries') videoId = parts[1];
			else if (parts[0] !== 'embed') return null;
		} else if (!(parts.length === 1 && parts[0] === 'playlist')) return null;
	} else return null;
	const playlistId = url.searchParams.get('list') ?? undefined;
	if (videoId !== undefined && !VIDEO_ID.test(videoId)) return null;
	if (playlistId !== undefined && !PLAYLIST_ID.test(playlistId)) return null;
	if (!videoId && !playlistId) return null;
	const fragmentTime = url.hash.startsWith('#t=') ? url.hash.slice(3) : null;
	const rawTime = url.searchParams.get('t') ?? url.searchParams.get('start') ?? fragmentTime;
	const startSeconds = parseTime(rawTime);
	if (rawTime !== null && startSeconds === undefined) return null;
	const rawIndex = url.searchParams.get('index');
	if (rawIndex !== null && (!/^\d{1,6}$/.test(rawIndex) || Number(rawIndex) < 1)) return null;
	return {
		...(videoId ? { videoId } : {}),
		...(playlistId ? { playlistId } : {}),
		...(startSeconds !== undefined ? { startSeconds } : {}),
		...(rawIndex !== null ? { index: Number(rawIndex) - 1 } : {})
	};
}

interface PlayerEvent<T = undefined> {
	target: IFramePlayer;
	data: T;
}

interface PlayerEvents {
	onReady(event: PlayerEvent): void;
	onStateChange(event: PlayerEvent<number>): void;
	onError(event: PlayerEvent<number>): void;
	onAutoplayBlocked(event: PlayerEvent): void;
}

interface IFramePlayer {
	cueVideoById(source: { videoId: string; startSeconds?: number }): void;
	cuePlaylist(source: {
		list: string;
		listType?: 'playlist';
		index?: number;
		startSeconds?: number;
	}): void;
	cuePlaylist(videoIds: string[], index: number, startSeconds: number): void;
	playVideo(): void;
	pauseVideo(): void;
	seekTo(seconds: number, allowSeekAhead: boolean): void;
	setVolume(volume: number): void;
	getVolume(): number;
	mute(): void;
	unMute(): void;
	isMuted(): boolean;
	nextVideo(): void;
	previousVideo(): void;
	playVideoAt(index: number): void;
	setShuffle(enabled: boolean): void;
	setLoop(enabled: boolean): void;
	getCurrentTime(): number;
	getDuration(): number;
	getPlaylist(): string[] | undefined;
	getPlaylistIndex(): number;
	getVideoUrl(): string;
	getIframe(): HTMLIFrameElement;
	destroy(): void;
}

interface YouTubeApi {
	Player: new (
		container: HTMLElement,
		options: {
			width: string;
			height: string;
			videoId?: string;
			playerVars: Record<string, string | number>;
			events: PlayerEvents;
		}
	) => IFramePlayer;
}

type YouTubeWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
interface ApiLoad {
	promise: Promise<YouTubeApi>;
	waiters: number;
	settled: boolean;
	cancel(): void;
}

let apiLoad: ApiLoad | undefined;
const API_DEADLINE = 12000;
// The iframe has its own network and player startup after the small API script.
// Give that stage room to finish on a cold connection while keeping it bounded.
const PLAYER_DEADLINE = 30000;

function abortError(): DOMException {
	return new DOMException('YouTube player loading was cancelled.', 'AbortError');
}

function beginApiLoad(browser: YouTubeWindow): ApiLoad {
	let cancel = () => {};
	const entry: ApiLoad = {
		waiters: 0,
		settled: false,
		cancel: () => cancel(),
		promise: new Promise<YouTubeApi>((resolve, reject) => {
			const previousReady = browser.onYouTubeIframeAPIReady;
			const script = document.createElement('script');
			script.src = 'https://www.youtube.com/iframe_api';
			script.async = true;
			script.referrerPolicy = 'strict-origin-when-cross-origin';
			const complete = (error?: Error) => {
				if (entry.settled) return;
				entry.settled = true;
				clearTimeout(deadline);
				script.removeEventListener('error', failed);
				if (browser.onYouTubeIframeAPIReady === ready) {
					browser.onYouTubeIframeAPIReady = previousReady;
				}
				if (error || !browser.YT?.Player) {
					script.remove();
					if (apiLoad === entry) apiLoad = undefined;
					reject(error ?? new Error('YouTube did not provide its player API.'));
				} else resolve(browser.YT);
			};
			const ready = () => {
				try {
					previousReady?.();
				} finally {
					complete();
				}
			};
			const failed = () =>
				complete(new Error('YouTube could not be reached. Check your connection, then retry.'));
			const deadline = setTimeout(
				() => complete(new Error('YouTube took too long to load. Please retry.')),
				API_DEADLINE
			);
			cancel = () => complete(abortError());
			browser.onYouTubeIframeAPIReady = ready;
			script.addEventListener('error', failed, { once: true });
			document.head.append(script);
		})
	};
	return entry;
}

function loadApi(signal?: AbortSignal): Promise<YouTubeApi> {
	if (signal?.aborted) return Promise.reject(abortError());
	if (typeof window === 'undefined')
		return Promise.reject(new Error('The player needs a browser.'));
	const browser = window as YouTubeWindow;
	if (browser.YT?.Player) return Promise.resolve(browser.YT);
	const entry = (apiLoad ??= beginApiLoad(browser));
	entry.waiters += 1;
	return new Promise((resolve, reject) => {
		let finished = false;
		const finish = (error?: unknown, api?: YouTubeApi) => {
			if (finished) return;
			finished = true;
			signal?.removeEventListener('abort', aborted);
			entry.waiters -= 1;
			if (!entry.waiters && !entry.settled) entry.cancel();
			if (error) reject(error);
			else if (api) resolve(api);
		};
		const aborted = () => finish(abortError());
		signal?.addEventListener('abort', aborted, { once: true });
		entry.promise.then(
			(api) => finish(undefined, api),
			(error) => finish(error)
		);
	});
}

const STATES: Record<number, YouTubePlaybackState> = {
	[-1]: 'unstarted',
	0: 'ended',
	1: 'playing',
	2: 'paused',
	3: 'buffering',
	5: 'cued'
};

function playerError(code: number): string {
	if (code === 2) return 'YouTube could not use this video or playlist link.';
	if (code === 5) return 'This browser could not play the video. Try opening it on YouTube.';
	if (code === 100) return 'This video is unavailable, private or has been removed.';
	if (code === 101 || code === 150)
		return 'The owner does not allow this video to play here. Open it on YouTube.';
	if (code === 153)
		return 'YouTube could not verify this player’s website. Open the video on YouTube.';
	return 'YouTube could not play this item. Try another track or open it on YouTube.';
}

function bounded(value: number, minimum: number, maximum: number): number {
	return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : minimum;
}

function validateSource(source: YouTubeSource): void {
	if (
		(!source.videoId && !source.playlistId && !source.videoIds?.length) ||
		(source.videoId !== undefined && !VIDEO_ID.test(source.videoId)) ||
		(source.playlistId !== undefined && !PLAYLIST_ID.test(source.playlistId)) ||
		(source.videoIds !== undefined &&
			(!source.videoIds.length ||
				source.videoIds.length > 100 ||
				source.videoIds.some((id) => !VIDEO_ID.test(id))))
	)
		throw new Error('Choose a valid YouTube video or playlist.');
}

/** Call only after media permission. Abort pending creation on withdrawal or navigation. */
export async function createYouTubeController(
	container: HTMLElement,
	onChange: (snapshot: YouTubeSnapshot) => void,
	options: {
		signal?: AbortSignal;
		source?: YouTubeSource;
		mode?: 'video' | 'playlist';
		iframeTitle?: string;
	} = {}
): Promise<YouTubeController> {
	const { signal } = options;
	if (options.source) validateSource(options.source);
	const api = await loadApi(signal);
	if (signal?.aborted || !container.isConnected) throw abortError();
	return new Promise<YouTubeController>((resolve, reject) => {
		let player: IFramePlayer | undefined;
		let disposed = false;
		let ready = false;
		let repeating: 'off' | 'one' | 'all' = 'off';
		let isPlaylist = false;
		let hasSource = Boolean(options.source);
		let awaitingCue = false;
		let polling: ReturnType<typeof setInterval> | undefined;
		let snapshot: YouTubeSnapshot = {
			state: 'idle',
			currentTime: 0,
			duration: 0,
			volume: 35,
			muted: false,
			playlist: [],
			playlistIndex: -1
		};
		const mount = document.createElement('div');
		container.append(mount);
		const publish = () => {
			if (disposed) return;
			if (player && ready && !awaitingCue) {
				const playlist = isPlaylist ? player.getPlaylist() : undefined;
				const currentVideo = !isPlaylist
					? parseYouTubeUrl(player.getVideoUrl())?.videoId
					: undefined;
				snapshot = {
					...snapshot,
					currentTime: bounded(player.getCurrentTime(), 0, Number.MAX_SAFE_INTEGER),
					duration: bounded(player.getDuration(), 0, Number.MAX_SAFE_INTEGER),
					volume: bounded(player.getVolume(), 0, 100),
					muted: player.isMuted(),
					...(currentVideo ? { playlist: [currentVideo], playlistIndex: 0 } : {}),
					...(playlist?.length
						? {
								playlist: playlist.filter((id) => VIDEO_ID.test(id)),
								playlistIndex: player.getPlaylistIndex()
							}
						: {})
				};
			}
			onChange({ ...snapshot, playlist: [...snapshot.playlist] });
		};
		const destroy = () => {
			if (disposed) return;
			disposed = true;
			clearTimeout(deadline);
			if (polling !== undefined) clearInterval(polling);
			signal?.removeEventListener('abort', aborted);
			document.removeEventListener('visibilitychange', visibilityChanged);
			player?.destroy();
			mount.remove();
			if (!ready) reject(abortError());
		};
		const aborted = () => destroy();
		const visibilityChanged = () => {
			if (document.hidden && ready && !disposed) player?.pauseVideo();
		};
		const run = (action: (active: IFramePlayer) => void) => {
			if (disposed || !ready || !player) return;
			action(player);
			publish();
		};
		const controller: YouTubeController = {
			cue(source, mode = 'playlist') {
				if (disposed) return;
				validateSource(source);
				hasSource = true;
				const startSeconds = bounded(source.startSeconds ?? 0, 0, 604800);
				const index = Math.floor(bounded(source.index ?? 0, 0, 999999));
				isPlaylist = Boolean(mode === 'playlist' && (source.playlistId || source.videoIds));
				if (!isPlaylist && !source.videoId)
					throw new Error('This link contains a playlist, not a single video.');
				awaitingCue = true;
				snapshot = {
					...snapshot,
					state: 'unstarted',
					currentTime: startSeconds,
					duration: 0,
					playlist: isPlaylist ? [...(source.videoIds ?? [])] : [source.videoId!],
					playlistIndex: isPlaylist ? index : 0,
					error: undefined,
					errorCode: undefined,
					autoplayBlocked: false
				};
				run((active) => {
					active.setShuffle(false);
					active.setLoop(repeating === 'all');
					if (isPlaylist && source.videoIds && !source.playlistId) {
						// The positional form establishes a real provider queue for arrays.
						// The live player ignored arrays supplied inside the object form.
						active.cuePlaylist(source.videoIds, index, startSeconds);
					} else if (isPlaylist) {
						active.cuePlaylist({
							list: source.playlistId!,
							listType: 'playlist',
							index,
							startSeconds
						});
					} else active.cueVideoById({ videoId: source.videoId!, startSeconds });
				});
			},
			play() {
				if (document.hidden) return;
				snapshot = { ...snapshot, autoplayBlocked: false };
				run((active) => active.playVideo());
			},
			pause: () => run((active) => active.pauseVideo()),
			seek: (seconds) =>
				run((active) => active.seekTo(bounded(seconds, 0, snapshot.duration || 604800), true)),
			volume: (value) => run((active) => active.setVolume(bounded(value, 0, 100))),
			mute: (value) => run((active) => (value ? active.mute() : active.unMute())),
			next: () =>
				run((active) => {
					if (isPlaylist && !document.hidden) active.nextVideo();
				}),
			previous: () =>
				run((active) => {
					if (isPlaylist && !document.hidden) active.previousVideo();
				}),
			playAt: (index) =>
				run((active) => {
					if (
						isPlaylist &&
						!document.hidden &&
						Number.isInteger(index) &&
						index >= 0 &&
						index < snapshot.playlist.length
					) {
						active.playVideoAt(index);
					}
				}),
			shuffle: (enabled) =>
				run((active) => {
					if (isPlaylist) active.setShuffle(enabled);
				}),
			repeat(mode) {
				repeating = mode;
				run((active) => active.setLoop(mode === 'all'));
			},
			destroy
		};
		const deadline = setTimeout(() => {
			reject(new Error('The YouTube player took too long to start. Please retry.'));
			destroy();
		}, PLAYER_DEADLINE);
		signal?.addEventListener('abort', aborted, { once: true });
		document.addEventListener('visibilitychange', visibilityChanged);
		try {
			const initial = options.source;
			const initialVideo = initial?.videoId ?? initial?.videoIds?.[initial?.index ?? 0];
			const initialPlaylist = options.mode !== 'video' ? initial?.playlistId : undefined;
			player = new api.Player(mount, {
				width: '100%',
				height: '100%',
				...(initialVideo ? { videoId: initialVideo } : {}),
				playerVars: {
					controls: 1,
					playsinline: 1,
					autoplay: 0,
					origin: window.location.origin,
					...(initialPlaylist ? { listType: 'playlist', list: initialPlaylist } : {}),
					...(initial?.startSeconds ? { start: Math.floor(initial.startSeconds) } : {})
				},
				events: {
					onReady(event) {
						// An aborted player has already been destroyed. A queued ready
						// callback must not call the provider's destroy method twice.
						if (disposed) return;
						if (signal?.aborted) {
							player = event.target;
							destroy();
							return;
						}
						player = event.target;
						ready = true;
						clearTimeout(deadline);
						player.setVolume(snapshot.volume);
						// The documented API has no volume-change event. Poll paused/cued
						// players too, so native controls remain reflected in the outer UI.
						polling = setInterval(() => {
							if (!document.hidden) publish();
						}, 500);
						publish();
						resolve(controller);
					},
					onStateChange(event) {
						if (disposed) return;
						awaitingCue = false;
						snapshot = {
							...snapshot,
							state: STATES[event.data] ?? 'idle',
							...(event.data === 1 || event.data === 5
								? { error: undefined, errorCode: undefined }
								: {}),
							...(event.data === 1 ? { autoplayBlocked: false } : {})
						};
						if (event.data === 1 && document.hidden) event.target.pauseVideo();
						if (
							event.data === 0 &&
							repeating !== 'off' &&
							(!isPlaylist || repeating === 'one') &&
							!document.hidden
						) {
							event.target.seekTo(0, true);
							event.target.playVideo();
						}
						publish();
					},
					onError(event) {
						if (disposed) return;
						// A caller without an initial source may briefly have an empty
						// player. Do not present its empty-ID error as a rejected user URL.
						if (event.data === 2 && !hasSource) return;
						snapshot = {
							...snapshot,
							state: 'error',
							error: playerError(event.data),
							errorCode: event.data
						};
						publish();
						if (!ready) {
							reject(new Error(snapshot.error));
							destroy();
						}
					},
					onAutoplayBlocked() {
						if (disposed) return;
						snapshot = { ...snapshot, autoplayBlocked: true };
						publish();
					}
				}
			});
			const iframe = player.getIframe();
			iframe.title = options.iframeTitle?.trim().slice(0, 200) || 'YouTube music player';
			iframe.referrerPolicy = 'strict-origin-when-cross-origin';
			iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
		} catch (error) {
			reject(error);
			destroy();
		}
	});
}
