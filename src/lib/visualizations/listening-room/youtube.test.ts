import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseYouTubeUrl, type YouTubeSnapshot } from './youtube';
import { SONG_PRESETS } from './presets';

describe('YouTube URL parser', () => {
	it.each([
		['https://www.youtube.com/watch?v=YQHsXMglC9A', { videoId: 'YQHsXMglC9A' }],
		['https://youtu.be/YQHsXMglC9A?t=1m25s', { videoId: 'YQHsXMglC9A', startSeconds: 85 }],
		[
			'https://m.youtube.com/shorts/YQHsXMglC9A?start=12',
			{ videoId: 'YQHsXMglC9A', startSeconds: 12 }
		],
		[
			'https://www.youtube-nocookie.com/embed/YQHsXMglC9A#t=2m',
			{ videoId: 'YQHsXMglC9A', startSeconds: 120 }
		],
		['https://youtube.com/playlist?list=PL1234567890_ab', { playlistId: 'PL1234567890_ab' }],
		[
			'https://youtube.com/watch?v=YQHsXMglC9A&list=PL1234567890_ab&index=3',
			{
				videoId: 'YQHsXMglC9A',
				playlistId: 'PL1234567890_ab',
				index: 2
			}
		],
		['https://music.youtube.com/watch?v=YQHsXMglC9A&si=tracking', { videoId: 'YQHsXMglC9A' }]
	])('accepts and normalises %s', (input, expected) => {
		expect(parseYouTubeUrl(input)).toEqual(expected);
	});

	it.each([
		'https://youtube.com.evil.example/watch?v=YQHsXMglC9A',
		'https://notyoutube.com/watch?v=YQHsXMglC9A',
		'https://youtube.com@evil.example/watch?v=YQHsXMglC9A',
		'https://name:secret@youtube.com/watch?v=YQHsXMglC9A',
		'https://youtube.com:443/watch?v=YQHsXMglC9A',
		'https://youtube.com:8443/watch?v=YQHsXMglC9A',
		'https://youtube.com\\@evil.example/watch?v=YQHsXMglC9A',
		'javascript:alert(1)',
		'//youtube.com/watch?v=YQHsXMglC9A',
		'https://youtube.com/watch?v=short',
		'https://youtu.be/YQHsXMglC9A/anything',
		'https://youtube.com/watch?v=YQHsXMglC9A&v=JGwWNGJdvx8',
		'https://youtube.com/watch?v=YQHsXMglC9A&list=',
		'https://youtube.com/watch?v=YQHsXMglC9A&t=-5',
		'https://youtube.com/watch?v=YQHsXMglC9A&t=Infinity',
		'https://youtube.com/watch?v=YQHsXMglC9A&t=604801',
		'https://youtube.com/watch?v=YQHsXMglC9A&index=0',
		'https://www.youtube-nocookie.com/watch?v=YQHsXMglC9A',
		'https://youtube.com/anything?list=PL1234567890_ab',
		'https://youtube.com/watch?v=YQHsXMglC9A\n',
		''
	])('rejects ambiguous or untrusted input %s', (input) => {
		expect(parseYouTubeUrl(input)).toBeNull();
	});

	it('has eight distinct, valid official-video seed links', () => {
		expect(SONG_PRESETS).toHaveLength(8);
		expect(new Set(SONG_PRESETS.map((song) => song.videoId)).size).toBe(8);
		for (const song of SONG_PRESETS) {
			expect(parseYouTubeUrl(song.url)).toEqual({ videoId: song.videoId });
			expect(song.artist.length).toBeGreaterThan(0);
		}
	});
});

class ElementStub extends EventTarget {
	isConnected = true;
	remove = vi.fn();
	append = vi.fn();
	setAttribute = vi.fn();
	src = '';
	async = false;
	referrerPolicy = '';
	title = '';
}

type TestEvents = Record<string, (event: { target: PlayerStub; data?: number }) => void>;
let player: PlayerStub;
let automaticallyReady = true;
let playerOptions: {
	events: TestEvents;
	playerVars: Record<string, string | number>;
	videoId?: string;
};
class PlayerStub {
	iframe = new ElementStub();
	cueVideoById = vi.fn();
	cuePlaylist = vi.fn();
	playVideo = vi.fn();
	pauseVideo = vi.fn();
	seekTo = vi.fn();
	setVolume = vi.fn();
	getVolume = vi.fn(() => 35);
	mute = vi.fn();
	unMute = vi.fn();
	isMuted = vi.fn(() => false);
	nextVideo = vi.fn();
	previousVideo = vi.fn();
	playVideoAt = vi.fn();
	setShuffle = vi.fn();
	setLoop = vi.fn();
	getCurrentTime = vi.fn(() => 12);
	getDuration = vi.fn(() => 240);
	getPlaylist = vi.fn(() => ['YQHsXMglC9A', 'JGwWNGJdvx8']);
	getPlaylistIndex = vi.fn(() => 0);
	getVideoUrl = vi.fn(() => 'https://www.youtube.com/watch?v=YQHsXMglC9A');
	getIframe = vi.fn(() => this.iframe);
	destroy = vi.fn();
	constructor(_container: unknown, options: typeof playerOptions) {
		// Capture the instance created by the controller so tests can send provider events.
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		player = this;
		playerOptions = options;
		if (automaticallyReady) queueMicrotask(() => options.events.onReady({ target: this }));
	}
}

let browser: {
	YT?: { Player: typeof PlayerStub };
	location: { origin: string };
	onYouTubeIframeAPIReady?: () => void;
};
let browserDocument: EventTarget & {
	head: ElementStub;
	hidden: boolean;
	createElement: ReturnType<typeof vi.fn>;
};
let elements: ElementStub[];

beforeEach(() => {
	vi.resetModules();
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
	elements = [];
	automaticallyReady = true;
	browser = { YT: { Player: PlayerStub }, location: { origin: 'https://www.suvroghosh.in' } };
	browserDocument = Object.assign(new EventTarget(), {
		head: new ElementStub(),
		hidden: false,
		createElement: vi.fn(() => {
			const element = new ElementStub();
			elements.push(element);
			return element;
		})
	});
	vi.stubGlobal('window', browser);
	vi.stubGlobal('document', browserDocument);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

async function create(signal?: AbortSignal) {
	const { createYouTubeController } = await import('./youtube');
	const changes: YouTubeSnapshot[] = [];
	const controller = await createYouTubeController(
		new ElementStub() as unknown as HTMLElement,
		(snapshot) => changes.push(snapshot),
		{ signal }
	);
	return { controller, changes };
}

describe('official YouTube controller lifecycle', () => {
	it('allows slower iframe startup while still timing out and cleaning up an unready player', async () => {
		automaticallyReady = false;
		const { createYouTubeController } = await import('./youtube');
		const pending = createYouTubeController(new ElementStub() as unknown as HTMLElement, () => {});
		const rejected = expect(pending).rejects.toThrow('too long to start');
		await vi.advanceTimersByTimeAsync(15000);
		expect(player.destroy).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(15000);
		await rejected;
		expect(player.destroy).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('ignores a queued ready callback after abort without destroying the provider twice', async () => {
		automaticallyReady = false;
		const { createYouTubeController } = await import('./youtube');
		const abort = new AbortController();
		const onChange = vi.fn();
		const pending = createYouTubeController(new ElementStub() as unknown as HTMLElement, onChange, {
			signal: abort.signal
		});
		const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		await Promise.resolve();
		abort.abort();
		await rejected;
		expect(player.destroy).toHaveBeenCalledOnce();
		playerOptions.events.onReady({ target: player });
		expect(player.destroy).toHaveBeenCalledOnce();
		expect(onChange).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('does not request scripts on import, and prepares a song without autoplay', async () => {
		await import('./youtube');
		expect(browserDocument.head.append).not.toHaveBeenCalled();
		const { controller } = await create();
		controller.cue({ videoId: 'YQHsXMglC9A', startSeconds: 25 });
		expect(player.cueVideoById).toHaveBeenCalledWith({ videoId: 'YQHsXMglC9A', startSeconds: 25 });
		expect(player.playVideo).not.toHaveBeenCalled();
		expect(playerOptions.playerVars).toMatchObject({
			controls: 1,
			autoplay: 0,
			playsinline: 1,
			origin: browser.location.origin
		});
		expect(player.iframe.referrerPolicy).toBe('strict-origin-when-cross-origin');
		controller.destroy();
	});

	it('makes the song-versus-playlist choice explicit and bounds control values', async () => {
		const { controller, changes } = await create();
		const source = { videoId: 'YQHsXMglC9A', playlistId: 'PL1234567890_ab', index: 2 };
		controller.cue(source, 'video');
		expect(player.cueVideoById).toHaveBeenCalledWith({ videoId: source.videoId, startSeconds: 0 });
		controller.cue(source, 'playlist');
		expect(player.cuePlaylist).toHaveBeenCalledWith({
			list: source.playlistId,
			listType: 'playlist',
			index: 2,
			startSeconds: 0
		});
		playerOptions.events.onStateChange({ target: player, data: 5 });
		controller.playAt(99);
		expect(player.playVideoAt).not.toHaveBeenCalled();
		controller.playAt(1);
		expect(player.playVideoAt).toHaveBeenCalledWith(1);
		controller.volume(400);
		expect(player.setVolume).toHaveBeenLastCalledWith(100);
		controller.seek(9000);
		expect(player.seekTo).toHaveBeenCalledWith(240, true);
		expect(changes.at(-1)?.playlist).toEqual(['YQHsXMglC9A', 'JGwWNGJdvx8']);
		controller.destroy();
	});

	it('uses the documented positional form for an array queue and preserves its starting entry', async () => {
		const { controller } = await create();
		const videoIds = ['YQHsXMglC9A', 'JGwWNGJdvx8'];
		controller.cue({ videoIds, index: 1, startSeconds: 25 }, 'playlist');
		expect(player.cuePlaylist).toHaveBeenCalledWith(videoIds, 1, 25);
		playerOptions.events.onStateChange({ target: player, data: 5 });
		controller.next();
		expect(player.nextVideo).toHaveBeenCalledOnce();
		controller.destroy();
	});

	it('pauses hidden playback and destroys listeners, polling and future callbacks', async () => {
		const abort = new AbortController();
		const { controller, changes } = await create(abort.signal);
		controller.cue({ videoId: 'YQHsXMglC9A' });
		playerOptions.events.onStateChange({ target: player, data: 1 });
		browserDocument.hidden = true;
		browserDocument.dispatchEvent(new Event('visibilitychange'));
		expect(player.pauseVideo).toHaveBeenCalledTimes(1);
		controller.play();
		expect(player.playVideo).not.toHaveBeenCalled();
		abort.abort();
		const count = changes.length;
		playerOptions.events.onStateChange({ target: player, data: 1 });
		vi.advanceTimersByTime(2000);
		controller.play();
		expect(changes).toHaveLength(count);
		expect(player.destroy).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('reports embedding errors and autoplay blocking without claiming playback', async () => {
		const { controller, changes } = await create();
		playerOptions.events.onAutoplayBlocked({ target: player });
		expect(changes.at(-1)?.autoplayBlocked).toBe(true);
		playerOptions.events.onError({ target: player, data: 150 });
		expect(changes.at(-1)).toMatchObject({ state: 'error' });
		expect(changes.at(-1)?.error).toContain('does not allow');
		playerOptions.events.onStateChange({ target: player, data: 1 });
		expect(changes.at(-1)).toMatchObject({ state: 'playing', autoplayBlocked: false });
		expect(changes.at(-1)?.error).toBeUndefined();
		controller.destroy();
	});

	it('reflects native paused volume controls and native navigation to a different video', async () => {
		const { controller, changes } = await create();
		controller.cue({ videoId: 'YQHsXMglC9A' });
		playerOptions.events.onStateChange({ target: player, data: 2 });
		player.getVolume.mockReturnValue(68);
		player.isMuted.mockReturnValue(true);
		vi.advanceTimersByTime(500);
		expect(changes.at(-1)).toMatchObject({ volume: 68, muted: true, state: 'paused' });
		player.getVideoUrl.mockReturnValue('https://www.youtube.com/watch?v=JGwWNGJdvx8');
		playerOptions.events.onStateChange({ target: player, data: 1 });
		expect(changes.at(-1)?.playlist).toEqual(['JGwWNGJdvx8']);
		controller.destroy();
	});

	it('repeats a standalone song when repeat-all is selected', async () => {
		const { controller } = await create();
		controller.cue({ videoId: 'YQHsXMglC9A' });
		controller.repeat('all');
		playerOptions.events.onStateChange({ target: player, data: 0 });
		expect(player.seekTo).toHaveBeenCalledWith(0, true);
		expect(player.playVideo).toHaveBeenCalledOnce();
		controller.destroy();
	});

	it('initialises with the requested source instead of an empty video', async () => {
		const { createYouTubeController } = await import('./youtube');
		const controller = await createYouTubeController(
			new ElementStub() as unknown as HTMLElement,
			() => {},
			{
				source: { videoId: 'YQHsXMglC9A', playlistId: 'PL1234567890_ab' },
				mode: 'playlist'
			}
		);
		expect(playerOptions.videoId).toBe('YQHsXMglC9A');
		expect(playerOptions.playerVars).toMatchObject({
			list: 'PL1234567890_ab',
			listType: 'playlist',
			autoplay: 0
		});
		controller.destroy();
	});

	it('ignores an empty-player ID error before a source and reports real source errors after cue', async () => {
		const { controller, changes } = await create();
		playerOptions.events.onError({ target: player, data: 2 });
		expect(changes.at(-1)?.error).toBeUndefined();
		controller.cue({ videoId: 'YQHsXMglC9A' });
		playerOptions.events.onError({ target: player, data: 2 });
		expect(changes.at(-1)?.error).toContain('could not use');
		controller.destroy();
	});

	it('shares a pending script, cancels only its own consumer, and permits retry after timeout', async () => {
		delete browser.YT;
		const { createYouTubeController } = await import('./youtube');
		const firstAbort = new AbortController();
		const first = createYouTubeController(new ElementStub() as unknown as HTMLElement, () => {}, {
			signal: firstAbort.signal
		});
		const firstRejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
		const second = createYouTubeController(new ElementStub() as unknown as HTMLElement, () => {});
		const secondRejected = expect(second).rejects.toThrow('too long');
		expect(browserDocument.head.append).toHaveBeenCalledTimes(1);
		firstAbort.abort();
		await firstRejected;
		expect(elements[0].remove).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(12000);
		await secondRejected;
		expect(elements[0].remove).toHaveBeenCalledOnce();
		const retry = createYouTubeController(new ElementStub() as unknown as HTMLElement, () => {});
		expect(browserDocument.head.append).toHaveBeenCalledTimes(2);
		browser.YT = { Player: PlayerStub };
		browser.onYouTubeIframeAPIReady?.();
		const controller = await retry;
		controller.destroy();
	});

	it('withdrawal cancels the final pending script and prevents a late player', async () => {
		delete browser.YT;
		const { createYouTubeController } = await import('./youtube');
		const abort = new AbortController();
		const pending = createYouTubeController(new ElementStub() as unknown as HTMLElement, () => {}, {
			signal: abort.signal
		});
		const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		abort.abort();
		await rejected;
		expect(elements[0].remove).toHaveBeenCalledOnce();
		expect(browser.onYouTubeIframeAPIReady).toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);
	});
});
