import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createDemoWav, type AudioSettings } from '../src/lib/visualizations/listening-room/dsp';

const articlePath = '/blog/visualizations/listening-room';
const preferencesKey = 'suvroghosh:listening-room:v1';
const player = (page: Page) => page.getByTestId('listening-room');
const externalRequests = new WeakMap<Page, string[]>();
const pageErrors = new WeakMap<Page, string[]>();
const trackedPages = new WeakMap<BrowserContext, Page[]>();

interface MockCall {
	method: string;
	value?: unknown;
}
interface MockPlayer {
	destroyed: boolean;
	playing: boolean;
	volume: number;
	muted: boolean;
	options: { events: Record<string, (event: { target: MockPlayer; data?: number }) => void> };
}
interface MockState {
	calls: MockCall[];
	players: MockPlayer[];
}
type TestWindow = Window & {
	__listeningRoomMock: MockState;
	__lrTrackedAudio?: HTMLAudioElement;
	__lrExtensionMock?: {
		active: boolean;
		localPlayEvents: number;
		messages: Array<{ type: string; settings?: AudioSettings }>;
		status(active: boolean): void;
	};
	__lrDelayedResume?: {
		waiting: boolean;
		released: boolean;
		localPlayEvents: number;
		release(): void;
	};
};

// Only the documented IFrame API surface is mocked. Native local-file audio is real.
// These tests establish UI/controller integration, not YouTube regional availability.
const youtubeMock = `(() => {
  const state = window.__listeningRoomMock = { calls: [], players: [] };
  const call = (method, value) => state.calls.push({ method, value });
  class Player {
    constructor(container, options) {
      this.options = options;
      this.playlist = [];
      this.index = 0;
      this.time = 0;
      this.volume = 35;
      this.muted = false;
      this.playing = false;
      this.destroyed = false;
      this.iframe = document.createElement('iframe');
      this.iframe.src = 'https://www.youtube.com/embed/mock';
      this.iframe.style.width = '100%';
      this.iframe.style.height = '100%';
      this.iframe.style.border = '0';
      container.replaceWith(this.iframe);
      state.players.push(this);
      call('create', options.playerVars);
      setTimeout(() => options.events.onReady({ target: this }), 0);
    }
    emit(data) { this.options.events.onStateChange({ target: this, data }); }
    cueVideoById(source) {
      call('cueVideoById', source);
      this.playlist = [source.videoId]; this.index = 0;
      this.time = source.startSeconds || 0; this.playing = false; this.emit(5);
    }
    cuePlaylist(source, index = 0, startSeconds = 0) {
      if (Array.isArray(source)) source = { list: source, index, startSeconds };
      call('cuePlaylist', source);
      this.playlist = Array.isArray(source.list) ? [...source.list] : ['YQHsXMglC9A', 'JGwWNGJdvx8', '4NRXx6U8ABQ'];
      this.index = Math.min(source.index || 0, this.playlist.length - 1);
      this.time = source.startSeconds || 0; this.playing = false; this.emit(5);
    }
    playVideo() { call('playVideo'); this.playing = true; this.emit(1); }
    pauseVideo() { call('pauseVideo'); this.playing = false; this.emit(2); }
    seekTo(value) { call('seekTo', value); this.time = value; }
    setVolume(value) { call('setVolume', value); this.volume = value; }
    getVolume() { return this.volume; }
    mute() { call('mute'); this.muted = true; }
    unMute() { call('unMute'); this.muted = false; }
    isMuted() { return this.muted; }
    nextVideo() { this.playVideoAt((this.index + 1) % this.playlist.length); call('nextVideo'); }
    previousVideo() { this.playVideoAt((this.index + this.playlist.length - 1) % this.playlist.length); call('previousVideo'); }
    playVideoAt(index) { call('playVideoAt', index); this.index = index; this.time = 0; this.playing = true; this.emit(1); }
    setShuffle(value) { call('setShuffle', value); }
    setLoop(value) { call('setLoop', value); }
    getCurrentTime() { return this.time; }
    getDuration() { return 250; }
    getPlaylist() { return [...this.playlist]; }
    getPlaylistIndex() { return this.index; }
    getVideoUrl() { return 'https://www.youtube.com/watch?v=' + (this.playlist[this.index] || 'YQHsXMglC9A'); }
    getIframe() { return this.iframe; }
    destroy() { call('destroy'); this.destroyed = true; this.playing = false; this.iframe.remove(); }
  }
  window.YT = { Player };
  window.onYouTubeIframeAPIReady?.();
})();`;

async function calls(page: Page): Promise<MockCall[]> {
	return page.evaluate(() => (window as TestWindow).__listeningRoomMock?.calls ?? []);
}

async function expectNoHorizontalOverflow(page: Page) {
	const overflowing = await page.evaluate(() =>
		Array.from(document.querySelectorAll('body *'))
			.flatMap((element) => {
				const box = element.getBoundingClientRect();
				return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1)
					? [
							{
								tag: element.tagName,
								className: element.getAttribute('class'),
								left: box.left,
								right: box.right
							}
						]
					: [];
			})
			.slice(0, 15)
	);
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
			message: `No horizontal overflow: ${JSON.stringify(overflowing)}`
		})
		.toBeLessThanOrEqual(1);
}

async function openRoom(page: Page) {
	await page.goto(articlePath);
	await expect(player(page)).toBeVisible();
	const dismissNotice = page.getByRole('button', {
		name: 'Dismiss privacy notice without choosing',
		exact: true
	});
	await expect(player(page).getByRole('button', { name: 'YouTube', exact: true })).toBeEnabled();
	if (await dismissNotice.isVisible()) await dismissNotice.click();
}

async function loadYouTube(page: Page) {
	await player(page).getByRole('button', { name: 'Load', exact: true }).click();
	await expect(player(page).locator('iframe[title="YouTube music player"]')).toBeVisible();
	await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
}

async function installYouTubeMock(page: Page, baseURL: string) {
	const requests: string[] = [];
	const errors: string[] = [];
	externalRequests.set(page, requests);
	pageErrors.set(page, errors);
	trackedPages.set(page.context(), [...(trackedPages.get(page.context()) ?? []), page]);
	page.on('pageerror', (error) => errors.push(error.message));
	const origin = new URL(baseURL).origin;
	await page.route('**/*', async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === origin || !['http:', 'https:'].includes(url.protocol)) {
			await route.continue();
			return;
		}
		if (/(^|\.)(youtube\.com|ytimg\.com|googlevideo\.com)$/.test(url.hostname)) {
			requests.push(url.href);
		}
		if (url.href === 'https://www.youtube.com/iframe_api') {
			await route.fulfill({
				status: 200,
				contentType: 'application/javascript',
				body: youtubeMock
			});
		} else if (url.href === 'https://www.youtube.com/embed/mock') {
			await route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: '<!doctype html><html lang="en"><title>Mock YouTube player</title><body style="background:#161c18;color:white">Mock provider video</body></html>'
			});
		} else await route.abort('blockedbyclient');
	});
}

test.beforeEach(async ({ page, baseURL }) => {
	await installYouTubeMock(page, baseURL!);
});

test.afterEach(async ({ context }) => {
	for (const page of trackedPages.get(context) ?? []) {
		expect(
			pageErrors.get(page) ?? [],
			'No uncaught application errors, including reopened tabs'
		).toEqual([]);
	}
});

async function reopenRoom(page: Page, baseURL: string) {
	const context = page.context();
	await page.close();
	const reopened = await context.newPage();
	await installYouTubeMock(reopened, baseURL);
	await openRoom(reopened);
	return reopened;
}

async function setRange(page: Page, name: string | RegExp, value: number) {
	const slider = player(page).getByRole('slider', { name, exact: typeof name === 'string' });
	await slider.evaluate((element: HTMLInputElement, next) => {
		element.value = String(next);
		element.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
	await expect(slider).toHaveValue(String(value));
}

async function savedPreferences(page: Page) {
	return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), preferencesKey);
}

async function installExtensionMock(page: Page, acknowledgeStop = true) {
	await page.addInitScript((acknowledge) => {
		const state = {
			active: false,
			localPlayEvents: 0,
			messages: [] as Array<{ type: string; settings?: AudioSettings }>,
			status(active: boolean) {
				state.active = active;
				window.postMessage(
					{ channel: 'listening-room:extension', v: 1, installed: true, active },
					location.origin
				);
			}
		};
		(window as TestWindow).__lrExtensionMock = state;
		document.addEventListener(
			'play',
			(event) => {
				if (event.target instanceof HTMLAudioElement) state.localPlayEvents++;
			},
			true
		);
		window.addEventListener('message', (event) => {
			if (
				event.source !== window ||
				event.origin !== location.origin ||
				event.data?.channel !== 'listening-room:page' ||
				event.data.v !== 1
			)
				return;
			state.messages.push(event.data);
			if (event.data.type === 'hello') state.status(state.active);
			if (event.data.type === 'stop' && acknowledge) state.status(false);
		});
	}, acknowledgeStop);
}

test('closing a tab retains named and custom sound preferences without restoring local playback', async ({
	page,
	baseURL
}) => {
	await openRoom(page);
	await player(page).getByRole('button', { name: 'Audio file', exact: true }).click();
	await player(page).getByLabel('Sound preset', { exact: true }).selectOption('bass');
	await expect
		.poll(async () => (await savedPreferences(page))?.settings.eq)
		.toEqual([1, 2, 2, 1, 0, 0, 0, 0, 0, 0]);
	let current = await reopenRoom(page, baseURL!);
	await expect(
		player(current).getByRole('button', { name: 'Audio file', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(player(current).getByLabel('Sound preset', { exact: true })).toHaveValue('bass');
	await player(current)
		.getByRole('button', { name: /Equaliser & fine adjustments/ })
		.click();
	await setRange(current, 'Equaliser 31 Hz', 5);
	await setRange(current, /^Balance /, -0.4);
	await setRange(current, /^Stereo width /, 0.65);
	await setRange(current, /^Gain trim /, -7);
	await setRange(current, 'Volume', 43);
	await player(current).getByRole('checkbox', { name: 'Mono listening', exact: true }).check();
	await player(current).getByRole('checkbox', { name: 'Bypass effects', exact: true }).check();
	await player(current).getByRole('button', { name: 'Mute', exact: true }).click();
	await player(current).getByRole('button', { name: 'Try the sample', exact: true }).click();
	await expect(player(current).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	const expectedSettings = {
		eq: [5, 2, 2, 1, 0, 0, 0, 0, 0, 0],
		trimDb: -7,
		width: 0.65,
		balance: -0.4,
		mono: true,
		volume: 43,
		bypass: true
	};
	await expect
		.poll(() => savedPreferences(current))
		.toEqual({
			v: 2,
			settings: expectedSettings,
			mode: 'file',
			muted: true,
			advanced: true,
			repeat: 'off',
			shuffle: false
		});
	current = await reopenRoom(current, baseURL!);
	await expect(
		player(current).getByRole('button', { name: 'Audio file', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(
		player(current).getByRole('button', { name: /Equaliser & fine adjustments/ })
	).toHaveAttribute('aria-expanded', 'true');
	await expect(player(current).getByLabel('Sound preset', { exact: true })).toHaveValue('custom');
	await expect(
		player(current).getByRole('slider', { name: 'Equaliser 31 Hz', exact: true })
	).toHaveValue('5');
	await expect(player(current).getByRole('slider', { name: /^Balance / })).toHaveValue('-0.4');
	await expect(player(current).getByRole('slider', { name: /^Stereo width / })).toHaveValue('0.65');
	await expect(player(current).getByRole('slider', { name: /^Gain trim / })).toHaveValue('-7');
	await expect(player(current).getByRole('slider', { name: 'Volume', exact: true })).toHaveValue(
		'43'
	);
	await expect(
		player(current).getByRole('button', { name: 'Unmute', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(
		player(current).getByRole('checkbox', { name: 'Mono listening', exact: true })
	).toBeChecked();
	await expect(
		player(current).getByRole('checkbox', { name: 'Bypass effects', exact: true })
	).toBeChecked();
	await expect(
		player(current).getByText('Settings are saved in this browser.', { exact: true })
	).toBeVisible();
	await expect(player(current).locator('iframe')).toHaveCount(0);
	expect(await player(current).locator('audio').getAttribute('src')).toBeNull();
	expect(
		await player(current)
			.locator('audio')
			.evaluate((audio: HTMLAudioElement) => audio.paused)
	).toBe(true);
	expect((await savedPreferences(current)).settings).toEqual(expectedSettings);
	expect(externalRequests.get(current)).toEqual([]);
});

test('native YouTube volume and mute and playlist preferences survive closing and loading a new player', async ({
	page,
	baseURL
}) => {
	await openRoom(page);
	await setRange(page, 'Volume', 43);
	await player(page).getByRole('button', { name: 'Load starter collection', exact: true }).click();
	await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
	await player(page).getByRole('button', { name: 'Repeat: off', exact: true }).click();
	await player(page).getByRole('button', { name: 'Shuffle playlist', exact: true }).click();
	await page.evaluate(() => {
		const players = (window as TestWindow).__listeningRoomMock.players;
		const active = players[players.length - 1];
		active.volume = 26;
		active.muted = true;
	});
	await expect(player(page).getByRole('slider', { name: 'Volume', exact: true })).toHaveValue('26');
	await expect
		.poll(async () => {
			const saved = await savedPreferences(page);
			return {
				volume: saved?.settings.volume,
				muted: saved?.muted,
				repeat: saved?.repeat,
				shuffle: saved?.shuffle
			};
		})
		.toEqual({ volume: 26, muted: true, repeat: 'all', shuffle: true });
	const reopened = await reopenRoom(page, baseURL!);
	await expect(
		player(reopened).getByRole('button', { name: 'YouTube', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(player(reopened).getByRole('slider', { name: 'Volume', exact: true })).toHaveValue(
		'26'
	);
	await expect(player(reopened).getByRole('button', { name: 'Unmute', exact: true })).toBeVisible();
	await expect(
		player(reopened).getByRole('button', { name: 'Repeat: all', exact: true })
	).toBeVisible();
	await expect(
		player(reopened).getByRole('button', { name: 'Shuffle playlist', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(player(reopened).locator('iframe')).toHaveCount(0);
	expect(externalRequests.get(reopened)).toEqual([]);
	await player(reopened)
		.getByRole('button', { name: 'Load starter collection', exact: true })
		.click();
	await expect(player(reopened).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
	await expect(player(reopened).getByRole('slider', { name: 'Volume', exact: true })).toHaveValue(
		'26'
	);
	await expect(player(reopened).getByRole('button', { name: 'Unmute', exact: true })).toBeVisible();
	expect(await calls(reopened)).toEqual(
		expect.arrayContaining([
			{ method: 'setVolume', value: 26 },
			{ method: 'mute' },
			{ method: 'setLoop', value: true },
			{ method: 'setShuffle', value: true }
		])
	);
	expect((await calls(reopened)).some((call) => call.method === 'playVideo')).toBe(false);
	expect((await savedPreferences(reopened)).settings.volume).toBe(26);
	expect((await savedPreferences(reopened)).muted).toBe(true);
	// A subsequent poll must still observe the restored provider state, not its
	// constructor's 35% / unmuted defaults. Then prove native unmute saves too.
	await reopened.evaluate(() => {
		const players = (window as TestWindow).__listeningRoomMock.players;
		players[players.length - 1].muted = false;
	});
	await expect(player(reopened).getByRole('button', { name: 'Mute', exact: true })).toBeVisible();
	await expect.poll(async () => (await savedPreferences(reopened)).muted).toBe(false);
	expect((await savedPreferences(reopened)).settings.volume).toBe(26);
});

test('legacy sound preferences migrate without retaining history or resetting adjustments', async ({
	page
}) => {
	const settings = {
		eq: [0, 0, 0, 0, 0, 0, -1, -2, -3, -3],
		trimDb: -3,
		width: 0.8,
		balance: 0.2,
		mono: false,
		volume: 36,
		bypass: true
	};
	await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
		key: preferencesKey,
		value: {
			v: 1,
			settings,
			inputUrl: 'https://example.com/old-history',
			fileName: 'private-audio.wav'
		}
	});
	await openRoom(page);
	await expect
		.poll(() => savedPreferences(page))
		.toEqual({
			v: 2,
			settings,
			mode: 'youtube',
			muted: false,
			advanced: false,
			repeat: 'off',
			shuffle: false
		});
	await expect(player(page).getByRole('slider', { name: 'Volume', exact: true })).toHaveValue('36');
	await player(page).getByRole('button', { name: 'Audio file', exact: true }).click();
	await expect(player(page).getByLabel('Sound preset', { exact: true })).toHaveValue('soft');
	await expect(
		player(page).getByRole('checkbox', { name: 'Bypass effects', exact: true })
	).toBeChecked();
	expect(externalRequests.get(page)).toEqual([]);
});

for (const [label, raw] of [
	['invalid JSON', '{not valid JSON'],
	[
		'invalid preference fields',
		JSON.stringify({
			v: 2,
			settings: { eq: ['loud'], volume: 'loud', balance: null },
			mode: 'remote',
			muted: 'yes',
			advanced: 1,
			repeat: 'forever',
			shuffle: 'yes',
			fileName: 'private.wav'
		})
	]
] as const) {
	test(`saved ${label} fall back to usable defaults`, async ({ page }) => {
		await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
			key: preferencesKey,
			raw
		});
		await openRoom(page);
		await expect(player(page).getByRole('slider', { name: 'Volume', exact: true })).toHaveValue(
			'70'
		);
		await expect(player(page).getByRole('button', { name: 'Mute', exact: true })).toBeVisible();
		await expect
			.poll(() => savedPreferences(page))
			.toEqual({
				v: 2,
				settings: {
					eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
					trimDb: 0,
					width: 1,
					balance: 0,
					mono: false,
					volume: 70,
					bypass: false
				},
				mode: 'youtube',
				muted: false,
				advanced: false,
				repeat: 'off',
				shuffle: false
			});
		await expect(player(page).locator('iframe')).toHaveCount(0);
		expect(externalRequests.get(page)).toEqual([]);
	});
}

test('unavailable preference storage keeps sound controls usable and explains that changes will be lost', async ({
	page
}) => {
	await page.addInitScript((key) => {
		const getItem = Storage.prototype.getItem;
		const setItem = Storage.prototype.setItem;
		Storage.prototype.getItem = function (requested) {
			if (requested === key) throw new DOMException('Storage unavailable', 'SecurityError');
			return getItem.call(this, requested);
		};
		Storage.prototype.setItem = function (requested, value) {
			if (requested === key) throw new DOMException('Storage unavailable', 'QuotaExceededError');
			return setItem.call(this, requested, value);
		};
	}, preferencesKey);
	await openRoom(page);
	await expect(
		player(page).getByText(
			'Settings could not be saved. Keep this tab open to retain your changes.',
			{ exact: true }
		)
	).toBeVisible();
	await player(page).getByRole('button', { name: 'Audio file', exact: true }).click();
	await player(page).getByLabel('Sound preset', { exact: true }).selectOption('voice');
	await setRange(page, 'Volume', 38);
	await player(page).getByRole('button', { name: 'Mute', exact: true }).click();
	await expect(player(page).getByRole('button', { name: 'Unmute', exact: true })).toBeVisible();
	await player(page)
		.getByRole('button', { name: /Equaliser & fine adjustments/ })
		.click();
	await expect(
		player(page).getByRole('slider', { name: 'Equaliser 31 Hz', exact: true })
	).toHaveValue('-2');
	await expect(player(page).getByRole('alert')).toHaveCount(0);
	expect(externalRequests.get(page)).toEqual([]);
});

test('mock extension status reveals YouTube equaliser controls and passes EQ without applying player volume twice', async ({
	page
}) => {
	// This exercises only the page/extension message contract. No extension is
	// installed and no tab capture or real streamed-audio processing is claimed.
	await installExtensionMock(page);
	await openRoom(page);
	await expect(
		player(page).getByText(
			'Click Listening Room in your browser’s extensions toolbar to turn it on for this tab.',
			{ exact: true }
		)
	).toBeVisible();
	await expect(player(page).getByLabel('Sound preset', { exact: true })).toHaveCount(0);
	await page.evaluate(() =>
		window.postMessage(
			{ channel: 'listening-room:extension', v: 2, installed: true, active: true },
			location.origin
		)
	);
	await expect(player(page).getByLabel('Sound preset', { exact: true })).toHaveCount(0);
	await page.evaluate(() => (window as TestWindow).__lrExtensionMock!.status(true));
	await expect(player(page).getByText('Tab equaliser is on', { exact: true })).toBeVisible();
	await player(page).getByLabel('Sound preset', { exact: true }).selectOption('voice');
	await player(page)
		.getByRole('button', { name: /Equaliser & fine adjustments/ })
		.click();
	await setRange(page, 'Equaliser 31 Hz', 4);
	await setRange(page, 'Volume', 29);
	await expect
		.poll(() =>
			page.evaluate(() => {
				const messages = (window as TestWindow).__lrExtensionMock!.messages;
				return messages.filter((message) => message.type === 'settings').at(-1)?.settings;
			})
		)
		.toEqual({
			eq: [4, -2, -1, 0, 1, 2, 2, 1, 0, -1],
			trimDb: 0,
			width: 1,
			balance: 0,
			mono: false,
			volume: 100,
			bypass: false
		});
	await expect(player(page).getByRole('slider', { name: 'Volume', exact: true })).toHaveValue('29');
	await expect(player(page).getByRole('img', { name: /Live spectrum/ })).toHaveCount(0);
	await expect(player(page).locator('iframe')).toHaveCount(0);
	expect(externalRequests.get(page)).toEqual([]);
	await player(page).getByRole('button', { name: 'Turn off tab equaliser', exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(() =>
				(window as TestWindow).__lrExtensionMock!.messages.some(
					(message) => message.type === 'stop'
				)
			)
		)
		.toBe(true);
	await expect(player(page).getByLabel('Sound preset', { exact: true })).toHaveCount(0);
	await page.evaluate(() => (window as TestWindow).__lrExtensionMock!.status(true));
	await expect(player(page).getByLabel('Sound preset', { exact: true })).toBeVisible();
	await player(page).getByRole('button', { name: 'Audio file', exact: true }).click();
	await expect
		.poll(() => page.evaluate(() => (window as TestWindow).__lrExtensionMock!.active))
		.toBe(false);
	await expect(player(page).getByLabel('Sound preset', { exact: true })).toHaveValue('custom');
	await player(page).getByRole('button', { name: 'YouTube', exact: true }).click();
	await expect(player(page).getByLabel('Sound preset', { exact: true })).toHaveCount(0);
});

for (const switchBack of [false, true]) {
	test(`local playback waits for extension stop${switchBack ? ' and is cancelled by a source switch' : ' before playing'}`, async ({
		page
	}) => {
		await installExtensionMock(page, false);
		await openRoom(page);
		await page.evaluate(() => (window as TestWindow).__lrExtensionMock!.status(true));
		await expect(player(page).getByText('Tab equaliser is on', { exact: true })).toBeVisible();
		await player(page).getByRole('button', { name: 'Audio file', exact: true }).click();
		const stopRequests = await page.evaluate(
			() =>
				(window as TestWindow).__lrExtensionMock!.messages.filter(
					(message) => message.type === 'stop'
				).length
		);
		await player(page).getByRole('button', { name: 'Try the sample', exact: true }).click();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as TestWindow).__lrExtensionMock!.messages.filter(
							(message) => message.type === 'stop'
						).length
				)
			)
			.toBeGreaterThan(stopRequests);
		const audio = player(page).locator('audio');
		expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
		expect(
			await page.evaluate(() => (window as TestWindow).__lrExtensionMock!.localPlayEvents)
		).toBe(0);
		if (switchBack)
			await player(page).getByRole('button', { name: 'YouTube', exact: true }).click();
		await page.evaluate(async () => {
			(window as TestWindow).__lrExtensionMock!.status(false);
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			);
		});
		if (switchBack) {
			expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
			expect(
				await page.evaluate(() => (window as TestWindow).__lrExtensionMock!.localPlayEvents)
			).toBe(0);
			await expect(
				player(page).getByRole('button', { name: 'YouTube', exact: true })
			).toHaveAttribute('aria-pressed', 'true');
		} else {
			await expect(player(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
			await expect
				.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
				.toBeGreaterThan(0.1);
			expect(
				await page.evaluate(() => (window as TestWindow).__lrExtensionMock!.localPlayEvents)
			).toBe(1);
		}
		await expect(player(page).getByRole('alert')).toHaveCount(0);
		expect(externalRequests.get(page)).toEqual([]);
	});
}

test('waits for the selected track to be cued before enabling playback', async ({ page }) => {
	await page.route('https://www.youtube.com/iframe_api', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/javascript',
			body: youtubeMock.replaceAll('this.emit(5);', '')
		})
	);
	await openRoom(page);
	await player(page).getByRole('button', { name: 'Load starter collection', exact: true }).click();
	await expect
		.poll(async () => (await calls(page)).some((call) => call.method === 'cuePlaylist'))
		.toBe(true);
	await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
	await expect(
		player(page).getByRole('button', { name: 'Next track', exact: true })
	).toBeDisabled();
	await expect(player(page).locator('.lr-status')).toHaveText('Preparing track');
	expect((await calls(page)).some((call) => call.method === 'playVideo')).toBe(false);
	await page.evaluate(() => {
		const state = (window as TestWindow).__listeningRoomMock;
		const active = state.players[state.players.length - 1];
		active.options.events.onStateChange({ target: active, data: 5 });
	});
	await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
	await player(page).getByRole('button', { name: 'Play', exact: true }).click();
	await expect(player(page).locator('.lr-status')).toHaveText('Playing');
});

test('YouTube stays local before activation and rejects a lookalike URL', async ({ page }) => {
	await openRoom(page);
	await expect(
		page.getByRole('heading', { level: 1, name: 'Listening Room.', exact: true })
	).toHaveCount(1);
	await expect(player(page).getByLabel('Popular songs')).toHaveValue('YQHsXMglC9A');
	await expect(player(page).locator('iframe')).toHaveCount(0);
	expect(externalRequests.get(page)).toEqual([]);
	await player(page)
		.getByLabel('Or paste a YouTube song or playlist')
		.fill('https://youtube.com.attacker.example/watch?v=YQHsXMglC9A');
	await player(page).getByRole('button', { name: 'Load', exact: true }).click();
	await expect(player(page).getByRole('alert')).toContainText(
		'Enter a valid YouTube song or playlist link.'
	);
	expect(externalRequests.get(page)).toEqual([]);
	await player(page).getByLabel('Popular songs').selectOption('JGwWNGJdvx8');
	await loadYouTube(page);
	expect(externalRequests.get(page)).toContain('https://www.youtube.com/iframe_api');
	expect(await calls(page)).toContainEqual({
		method: 'cueVideoById',
		value: { videoId: 'JGwWNGJdvx8', startSeconds: 0 }
	});
	await expect(player(page).getByRole('img', { name: /Live spectrum/ })).toHaveCount(0);
	await player(page).getByRole('button', { name: 'Play', exact: true }).click();
	await expect(player(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	await player(page).getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	// Simulate changes made in YouTube's own controls while paused. There is no
	// documented volume-change event: the parent must poll the real player state.
	await page.evaluate(() => {
		const instances = (window as TestWindow).__listeningRoomMock.players;
		const active = instances[instances.length - 1];
		active.volume = 27;
		active.muted = true;
	});
	await expect(player(page).getByRole('slider', { name: 'Volume', exact: true })).toHaveValue('27');
	await expect(player(page).getByRole('button', { name: 'Unmute', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.evaluate(() => {
		const instances = (window as TestWindow).__listeningRoomMock.players;
		instances[instances.length - 1].muted = false;
	});
	await expect(player(page).getByRole('button', { name: 'Mute', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await expect(player(page).locator('.lr-volume')).toContainText('27%');
	await player(page)
		.getByLabel('Or paste a YouTube song or playlist')
		.fill('https://youtube.com.attacker.example/watch?v=YQHsXMglC9A');
	await player(page).getByRole('button', { name: 'Load', exact: true }).click();
	await expect(player(page).getByRole('alert')).toContainText(
		'Enter a valid YouTube song or playlist link.'
	);
	// Observe a later native polling update instead of relying on a fixed sleep.
	// The unrelated provider update must not erase the URL validation message.
	await page.evaluate(() => {
		const instances = (window as TestWindow).__listeningRoomMock.players;
		instances[instances.length - 1].volume = 31;
	});
	await expect(player(page).getByRole('slider', { name: 'Volume', exact: true })).toHaveValue('31');
	await expect(player(page).getByRole('alert')).toContainText(
		'Enter a valid YouTube song or playlist link.'
	);
});

test('mocked playlist preserves index and time, supports transport, and permits single-song choice', async ({
	page
}) => {
	await openRoom(page);
	await player(page)
		.getByLabel('Or paste a YouTube song or playlist')
		.fill('https://www.youtube.com/watch?v=JGwWNGJdvx8&list=PLabcdefghijk12345&index=2&t=1m30s');
	await expect(
		player(page).getByRole('radio', { name: 'Whole playlist', exact: true })
	).toBeChecked();
	await loadYouTube(page);
	expect(await calls(page)).toContainEqual({
		method: 'cuePlaylist',
		value: { list: 'PLabcdefghijk12345', listType: 'playlist', index: 1, startSeconds: 90 }
	});
	await expect(
		player(page).getByRole('heading', { name: 'In your queue', exact: true })
	).toBeVisible();
	await expect(player(page).locator('.lr-queue-item')).toHaveCount(3);
	await expect(player(page).locator('.lr-track-name h3')).toHaveText('Shape of You');
	await player(page).getByRole('button', { name: 'Next track', exact: true }).click();
	await expect(player(page).locator('.lr-track-name h3')).toHaveText('Blinding Lights');
	await player(page).getByRole('button', { name: 'Previous track', exact: true }).click();
	await expect(player(page).locator('.lr-track-name h3')).toHaveText('Shape of You');
	await player(page).getByRole('button', { name: 'Shuffle playlist', exact: true }).click();
	await expect(
		player(page).getByRole('button', { name: 'Shuffle playlist', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await player(page).getByRole('button', { name: 'Repeat: off', exact: true }).click();
	await expect(
		player(page).getByRole('button', { name: 'Repeat: all', exact: true })
	).toBeVisible();
	expect(await calls(page)).toContainEqual({ method: 'setLoop', value: true });
	await player(page).getByRole('radio', { name: 'This song', exact: true }).check();
	await loadYouTube(page);
	expect(await calls(page)).toContainEqual({
		method: 'cueVideoById',
		value: { videoId: 'JGwWNGJdvx8', startSeconds: 90 }
	});
	await expect(
		player(page).getByRole('button', { name: 'Next track', exact: true })
	).toBeDisabled();
	// A stale "This song" selection from a mixed URL cannot turn a new, pure
	// playlist URL into a request for a nonexistent single video.
	await player(page)
		.getByLabel('Or paste a YouTube song or playlist')
		.fill('https://www.youtube.com/playlist?list=PLzyxwvutsrq98765');
	await expect(player(page).getByRole('radio', { name: 'This song', exact: true })).toHaveCount(0);
	await loadYouTube(page);
	expect(await calls(page)).toContainEqual({
		method: 'cuePlaylist',
		value: { list: 'PLzyxwvutsrq98765', listType: 'playlist', index: 0, startSeconds: 0 }
	});
	await expect(player(page).getByRole('button', { name: 'Next track', exact: true })).toBeEnabled();
	await expect(player(page).locator('.lr-footer a')).toHaveAttribute(
		'href',
		'https://www.youtube.com/playlist?list=PLzyxwvutsrq98765'
	);
});

test('mocked starter collection and provider failure expose useful recovery', async ({ page }) => {
	await openRoom(page);
	await player(page).getByRole('button', { name: 'Load starter collection', exact: true }).click();
	await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
	await expect(player(page).locator('.lr-queue-item')).toHaveCount(8);
	await page.evaluate(() => {
		const state = (window as TestWindow).__listeningRoomMock;
		const active = state.players[state.players.length - 1];
		active.options.events.onAutoplayBlocked({ target: active });
	});
	await expect(player(page).locator('.lr-notice[role="status"]')).toContainText(
		'Press Play in the YouTube player'
	);
	await page.evaluate(() => {
		const state = (window as TestWindow).__listeningRoomMock;
		const active = state.players[state.players.length - 1];
		active.options.events.onError({ target: active, data: 150 });
	});
	await expect(player(page).getByRole('alert')).toContainText(
		'The owner does not allow this video to play here.'
	);
	await expect(
		player(page)
			.getByRole('alert')
			.getByRole('link', { name: /Open on YouTube/ })
	).toHaveAttribute('href', /youtube\.com/);
	await player(page).getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(player(page).getByRole('alert')).toHaveCount(0);
	await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
});

test('an unavailable playlist item can be skipped with Next', async ({ page }) => {
	await openRoom(page);
	await player(page).getByRole('button', { name: 'Load starter collection', exact: true }).click();
	await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
	await page.evaluate(() => {
		const state = (window as TestWindow).__listeningRoomMock;
		const active = state.players[state.players.length - 1];
		active.options.events.onError({ target: active, data: 150 });
	});
	await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
	await expect(player(page).getByRole('button', { name: 'Next track', exact: true })).toBeEnabled();
	await player(page).getByRole('button', { name: 'Next track', exact: true }).click();
	await expect(player(page).getByRole('alert')).toHaveCount(0);
	await expect(player(page).locator('.lr-track-name')).toContainText('Shape of You');
	await expect(player(page).locator('.lr-status')).toHaveText('Playing');
});

test('media revocation removes an activated player and changing source destroys it', async ({
	page
}) => {
	await openRoom(page);
	await loadYouTube(page);
	await player(page).getByRole('button', { name: 'Play', exact: true }).click();
	await player(page)
		.getByRole('button', { name: /Media settings/ })
		.click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Keep videos paused', exact: true })
		.click();
	await expect(player(page).locator('iframe')).toHaveCount(0);
	expect(
		await page.evaluate(() =>
			(window as TestWindow).__listeningRoomMock.players.every(
				(item) => item.destroyed && !item.playing
			)
		)
	).toBe(true);
	await page.getByRole('button', { name: 'Dismiss privacy confirmation', exact: true }).click();
	await loadYouTube(page);
	await player(page).getByRole('button', { name: 'Play', exact: true }).click();
	await player(page).getByRole('button', { name: 'Audio file', exact: true }).click();
	await expect(player(page).locator('iframe')).toHaveCount(0);
	expect(
		await page.evaluate(() =>
			(window as TestWindow).__listeningRoomMock.players.every(
				(item) => item.destroyed && !item.playing
			)
		)
	).toBe(true);
});

test('real local sample drives measurements and keyboard-operated EQ and bypass', async ({
	page
}) => {
	await openRoom(page);
	await player(page).getByRole('button', { name: 'Audio file', exact: true }).click();
	await player(page).getByRole('button', { name: 'Try the sample', exact: true }).click();
	await expect(player(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	await expect
		.poll(() =>
			player(page)
				.locator('audio')
				.evaluate((element: HTMLAudioElement) => element.currentTime)
		)
		.toBeGreaterThan(0.1);
	await expect
		.poll(() =>
			player(page)
				.locator('.lr-spectrum-bars > div')
				.evaluateAll((elements) =>
					Math.max(...elements.map((element) => parseFloat((element as HTMLElement).style.height)))
				)
		)
		.toBeGreaterThan(5);
	await expect(player(page).locator('.lr-quality strong')).toContainText('kHz processing');
	expect(externalRequests.get(page)).toEqual([]);
	await player(page)
		.getByRole('button', { name: /Equaliser & fine adjustments/ })
		.click();
	const bass = player(page).getByRole('slider', { name: 'Equaliser 31 Hz', exact: true });
	await bass.focus();
	await bass.press('End');
	await expect(bass).toHaveValue('6');
	await expect
		.poll(() => player(page).locator('.lr-headroom strong').textContent())
		.not.toBe('0.0 dB');
	await player(page).getByRole('checkbox', { name: 'Bypass effects', exact: true }).check();
	await expect(player(page).locator('.lr-response')).toContainText('bypassed');
	await expect.poll(() => player(page).locator('.lr-headroom strong').textContent()).toBe('0.0 dB');
	await player(page).getByRole('button', { name: 'Reset sound', exact: true }).click();
	await expect(bass).toHaveValue('0');
	await expect(
		player(page).getByRole('checkbox', { name: 'Bypass effects', exact: true })
	).not.toBeChecked();
	await player(page).getByRole('checkbox', { name: 'Mono listening', exact: true }).check();
	await expect(player(page).getByRole('slider', { name: /Stereo width/ })).toBeDisabled();
	await player(page).getByRole('button', { name: 'YouTube', exact: true }).click();
	expect(
		await player(page)
			.locator('audio')
			.evaluate((element: HTMLAudioElement) => element.paused)
	).toBe(true);
	expect(externalRequests.get(page)).toEqual([]);
});

test('file input plays a local WAV without upload and replacing it pauses the source', async ({
	page
}) => {
	await openRoom(page);
	const writes: string[] = [];
	page.on('request', (request) => {
		if (['POST', 'PUT', 'PATCH'].includes(request.method())) writes.push(request.url());
	});
	await player(page).getByRole('button', { name: 'Audio file', exact: true }).click();
	const buffer = Buffer.from(await createDemoWav().arrayBuffer());
	const fileInput = player(page).getByLabel('Choose a local audio file', { exact: true });
	await fileInput.setInputFiles({
		name: 'local-listening-fixture.wav',
		mimeType: 'audio/wav',
		buffer
	});
	await expect(player(page).locator('.lr-track-name h3')).toHaveText('local-listening-fixture');
	const audio = player(page).locator('audio');
	const firstUrl = await audio.getAttribute('src');
	expect(firstUrl?.startsWith(`blob:${new URL(page.url()).origin}/`)).toBe(true);
	await player(page).getByRole('button', { name: 'Play', exact: true }).click();
	await expect(player(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	await expect
		.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
		.toBeGreaterThan(0.1);
	await fileInput.setInputFiles({ name: 'replacement-fixture.wav', mimeType: 'audio/wav', buffer });
	await expect(player(page).locator('.lr-track-name h3')).toHaveText('replacement-fixture');
	await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	expect(await audio.getAttribute('src')).not.toBe(firstUrl);
	expect(
		await audio.evaluate((element: HTMLAudioElement) => ({
			paused: element.paused,
			time: element.currentTime
		}))
	).toEqual({ paused: true, time: 0 });
	await player(page).getByRole('button', { name: 'Play', exact: true }).click();
	await expect
		.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
		.toBeGreaterThan(0.1);
	expect(externalRequests.get(page)).toEqual([]);
	expect(writes, 'Opening and playing local files performs no HTTP writes').toEqual([]);
});

test('a delayed AudioContext resume cannot start local playback after switching to YouTube', async ({
	page
}) => {
	await page.addInitScript(() => {
		const nativeConstructor = window.AudioContext;
		let releaseGate: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});
		const state = {
			waiting: false,
			released: false,
			localPlayEvents: 0,
			release() {
				state.released = true;
				releaseGate();
			}
		};
		(window as TestWindow).__lrDelayedResume = state;
		document.addEventListener(
			'play',
			(event) => {
				if (event.target instanceof HTMLAudioElement) state.localPlayEvents++;
			},
			true
		);
		const delayedConstructor = function (options?: AudioContextOptions) {
			const context = new nativeConstructor(options);
			const nativeResume = context.resume.bind(context);
			// Simulate a browser starting with a suspended audio context while
			// retaining its real decoder, nodes and native resume operation.
			Object.defineProperty(context, 'state', {
				get() {
					const actual = Reflect.get(
						nativeConstructor.prototype,
						'state',
						context
					) as AudioContextState;
					return !state.released && actual === 'running' ? 'suspended' : actual;
				}
			});
			context.resume = async () => {
				state.waiting = true;
				await nativeResume();
				await gate;
			};
			return context;
		};
		delayedConstructor.prototype = nativeConstructor.prototype;
		Object.setPrototypeOf(delayedConstructor, nativeConstructor);
		window.AudioContext = delayedConstructor as unknown as typeof AudioContext;
	});
	await openRoom(page);
	await player(page).getByRole('button', { name: 'Audio file', exact: true }).click();
	await player(page).getByRole('button', { name: 'Try the sample', exact: true }).click();
	await expect
		.poll(() => page.evaluate(() => (window as TestWindow).__lrDelayedResume?.waiting))
		.toBe(true);
	await player(page).getByRole('button', { name: 'YouTube', exact: true }).click();
	await page.evaluate(async () => {
		(window as TestWindow).__lrDelayedResume!.release();
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	});
	expect(
		await player(page)
			.locator('audio')
			.evaluate((element: HTMLAudioElement) => element.paused)
	).toBe(true);
	expect(await page.evaluate(() => (window as TestWindow).__lrDelayedResume?.localPlayEvents)).toBe(
		0
	);
	await expect(player(page).getByRole('button', { name: 'YouTube', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(player(page).getByRole('alert')).toHaveCount(0);
	expect(externalRequests.get(page)).toEqual([]);
});

test('changing source during API loading cannot resurrect a YouTube player', async ({ page }) => {
	let finishApi: (() => void) | undefined;
	const released = new Promise<void>((resolve) => {
		finishApi = resolve;
	});
	await page.route('https://www.youtube.com/iframe_api', async (route) => {
		await released;
		await route.fulfill({ status: 200, contentType: 'application/javascript', body: youtubeMock });
	});
	await openRoom(page);
	const requested = page.waitForRequest('https://www.youtube.com/iframe_api');
	await player(page).getByRole('button', { name: 'Load', exact: true }).click();
	await requested;
	await player(page).getByRole('button', { name: 'Audio file', exact: true }).click();
	finishApi?.();
	await expect(
		player(page).getByRole('button', { name: 'Try the sample', exact: true })
	).toBeEnabled();
	await expect(player(page).locator('iframe')).toHaveCount(0);
	await player(page).getByRole('button', { name: 'Try the sample', exact: true }).click();
	await expect(player(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	expect(
		await page.evaluate(() => (window as TestWindow).__listeningRoomMock?.players.length ?? 0)
	).toBe(0);
	await expect(player(page).getByRole('alert')).toHaveCount(0);
});

for (const width of [390, 320]) {
	test(`fits a ${width}px screen with a visible provider and accessible equaliser`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 844 });
		await openRoom(page);
		await loadYouTube(page);
		const box = await player(page).locator('iframe').boundingBox();
		expect(box?.width).toBeGreaterThanOrEqual(200);
		expect(box?.height).toBeGreaterThanOrEqual(200);
		await expectNoHorizontalOverflow(page);
		await player(page).getByRole('button', { name: 'Audio file', exact: true }).click();
		await player(page)
			.getByRole('button', { name: /Equaliser & fine adjustments/ })
			.click();
		await expect(player(page).getByRole('slider', { name: /^Equaliser \d+ Hz$/ })).toHaveCount(10);
		await expectNoHorizontalOverflow(page);
	});
}

test('client navigation tears down real local playback and releases its object URL', async ({
	page
}) => {
	await openRoom(page);
	await player(page).getByRole('button', { name: 'Audio file', exact: true }).click();
	await player(page).getByRole('button', { name: 'Try the sample', exact: true }).click();
	await expect(player(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	await page.evaluate(() => {
		(window as TestWindow).__lrTrackedAudio = document.querySelector(
			'[data-testid="listening-room"] audio'
		) as HTMLAudioElement;
	});
	await page.locator('a[href="/blog/apps"]').first().click();
	await expect(page).toHaveURL(/\/blog\/apps\/?$/);
	await expect(player(page)).toHaveCount(0);
	const audio = await page.evaluate(() => {
		const element = (window as TestWindow).__lrTrackedAudio;
		return element
			? { paused: element.paused, src: element.getAttribute('src'), connected: element.isConnected }
			: null;
	});
	expect(
		audio,
		'Client navigation retains the test reference so cleanup can be inspected'
	).not.toBeNull();
	expect(audio).toEqual({ paused: true, src: null, connected: false });
});
