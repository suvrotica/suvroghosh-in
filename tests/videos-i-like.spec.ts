import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import type {
	GalleryItem,
	GalleryResponse,
	VideoAvailability
} from '../src/lib/visualizations/videos-i-like/types';

const article = '/blog/visualizations/videos-i-like';
const gallery = (page: Page) => page.getByTestId('videos-i-like');
const panel = (page: Page) => gallery(page).getByRole('region', { name: 'Selected video' });
const frame = (page: Page) => gallery(page).locator('iframe[title="YouTube video player"]');
const requests = new WeakMap<Page, string[]>();
const errors = new WeakMap<Page, string[]>();

interface MockPlayer {
	destroyed: boolean;
	videoId: string;
	options: { events: Record<string, (event: { target: MockPlayer; data?: number }) => void> };
}
type MockWindow = Window & {
	__vifMock: { players: MockPlayer[]; calls: Array<{ method: string; value?: unknown }> };
	__vifDelayFirst?: boolean;
};

// This substitutes only the documented provider API in the test browser. It does not
// establish live YouTube availability or appear in the production implementation.
const youtubeMock = `(() => {
  const state = window.__vifMock = { calls: [], players: [] };
  const call = (method, value) => state.calls.push({ method, value });
  class Player {
    constructor(container, options) {
      this.options = options; this.videoId = options.videoId;
      this.volume = 35; this.muted = false; this.time = 0; this.destroyed = false;
      this.iframe = document.createElement('iframe');
      this.iframe.src = 'https://www.youtube.com/embed/mock';
      this.iframe.style.cssText = 'width:100%;height:100%;border:0';
      container.replaceWith(this.iframe); state.players.push(this);
      call('create', options.videoId);
      const delay = window.__vifDelayFirst && state.players.length === 1 ? 600 : 0;
      setTimeout(() => options.events.onReady({ target: this }), delay);
    }
    emit(data) { this.options.events.onStateChange({ target: this, data }); }
    cueVideoById(source) { this.videoId = source.videoId; this.time = source.startSeconds || 0; call('cue', source); this.emit(5); }
    cuePlaylist() { throw new Error('Gallery must queue validated video IDs itself.'); }
    playVideo() { call('play', this.videoId); this.emit(1); }
    pauseVideo() { call('pause', this.videoId); this.emit(2); }
    seekTo(value) { this.time = value; }
    setVolume(value) { this.volume = value; }
    getVolume() { return this.volume; }
    mute() { this.muted = true; }
    unMute() { this.muted = false; }
    isMuted() { return this.muted; }
    setShuffle() {} setLoop() {} nextVideo() {} previousVideo() {} playVideoAt() {}
    getCurrentTime() { return this.time; }
    getDuration() { return 250; }
    getPlaylist() { return [this.videoId]; }
    getPlaylistIndex() { return 0; }
    getVideoUrl() { return 'https://www.youtube.com/watch?v=' + this.videoId; }
    getIframe() { return this.iframe; }
    destroy() { call('destroy', this.videoId); this.destroyed = true; this.iframe.remove(); }
  }
  window.YT = { Player }; window.onYouTubeIframeAPIReady?.();
})();`;

function checkedVideo(
	id: string,
	title: string,
	state: VideoAvailability['state'] = 'eligible'
): VideoAvailability {
	return {
		id,
		title,
		state,
		channelTitle: 'Example creator',
		thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
		durationSeconds: 245,
		checkedAt: new Date().toISOString()
	};
}

function videoItem(
	id: string,
	title: string,
	categories: GalleryItem['categories'],
	musicCategories: GalleryItem['musicCategories'] = []
): GalleryItem {
	const video = checkedVideo(id, title);
	return {
		...video,
		key: `video:${id}`,
		kind: 'video',
		url: `https://www.youtube.com/watch?v=${id}`,
		categories,
		musicCategories,
		sources: [
			{
				file: 'drafts/Fixture.md',
				url: 'https://github.com/suvrotica/SuvroTuitionBlog/blob/laptop/drafts/Fixture.md',
				originalUrl: `https://youtu.be/${id}?t=12`,
				startSeconds: 12,
				order: 1
			}
		],
		videos: [video],
		checkedCount: 1
	};
}

function fixtures(): GalleryResponse {
	const bengali = videoItem('HvOXmnTJYRc', 'Bengali evening song', ['music'], ['bengali']);
	const hindi = videoItem('XA3XY2RRc5Y', 'Hindi song', ['music'], ['hindi']);
	const film = videoItem('iwsigIyhPWg', 'Bengali film', ['films']);
	const talk = videoItem('EkyAuG9RSSU', 'A documentary', ['documentaries', 'talks']);
	const playlist: GalleryItem = {
		...videoItem('PLffJUy1BnWj13MxDDbXWcbPzna0UESH59', 'Linear algebra playlist', ['maths']),
		key: 'playlist:PLffJUy1BnWj13MxDDbXWcbPzna0UESH59',
		kind: 'playlist',
		url: 'https://www.youtube.com/playlist?list=PLffJUy1BnWj13MxDDbXWcbPzna0UESH59',
		videos: [
			checkedVideo('QL4_4GAWvPs', 'Vectors first'),
			checkedVideo('KbyYTjfgZJI', 'Private lesson', 'unavailable'),
			checkedVideo('6htbyY3rH1w', 'Matrices next'),
			checkedVideo('Y4mnlIvVJEs', 'Uncertain lesson', 'unknown')
		],
		checkedCount: 4,
		totalCount: 6,
		nextPage: 1
	};
	const unavailable = {
		...videoItem('O099W3Gyggc', 'Private audiobook', ['audiobooks']),
		state: 'unavailable' as const
	};
	const unknown = {
		...videoItem('k_Hse48e_7M', 'Unverified audiobook', ['audiobooks']),
		state: 'unknown' as const
	};
	const mix = {
		...videoItem('RD6sfHEAeNklM', 'Generated mix', ['music'], ['hindi']),
		kind: 'mix' as const,
		key: 'mix:RD6sfHEAeNklM'
	};
	return {
		items: [bengali, hindi, film, talk, playlist, unavailable, unknown, mix],
		checkedAt: new Date().toISOString(),
		expiresAt: new Date(Date.now() + 300_000).toISOString(),
		configuration: 'ready',
		partial: false
	};
}

async function api(
	page: Page,
	handle: (route: Route) => Promise<void> = async (route) => route.fulfill({ json: fixtures() })
) {
	await page.route('**/api/videos-i-like', handle);
}

async function openGallery(page: Page, waitForComplete = true) {
	await page.goto(article);
	await expect(gallery(page)).toBeVisible();
	if (waitForComplete)
		await expect(
			gallery(page).getByRole('button', { name: 'Refresh videos', exact: true })
		).toBeEnabled();
	const dismiss = page.getByRole('button', {
		name: 'Dismiss privacy notice without choosing',
		exact: true
	});
	if (await dismiss.isVisible()) await dismiss.click();
}

async function enableMedia(page: Page) {
	await gallery(page)
		.getByRole('button', { name: 'Load YouTube content', exact: true })
		.first()
		.click();
	await expect(
		gallery(page).getByRole('button', { name: 'Hide YouTube content', exact: true })
	).toBeVisible();
}

async function clickControl(control: Locator) {
	// Explicitly finish scrolling before the pointer action. A provider iframe above
	// a control can otherwise receive a click during browser-driven smooth scrolling.
	await control.evaluate((element) =>
		element.scrollIntoView({ behavior: 'instant', block: 'center' })
	);
	await control.click();
}

async function select(page: Page, title: string) {
	await clickControl(gallery(page).getByRole('button', { name: `Play ${title}`, exact: true }));
	await expect(panel(page).getByText(title, { exact: true })).toBeVisible();
	await expect(frame(page)).toHaveCount(1);
	await expect(panel(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
}

async function emitError(page: Page, code: number) {
	await page.evaluate((value) => {
		const player = (window as unknown as MockWindow).__vifMock.players.at(-1)!;
		player.options.events.onError({ target: player, data: value });
	}, code);
}

test.beforeEach(async ({ page, baseURL }) => {
	requests.set(page, []);
	errors.set(page, []);
	page.on('pageerror', (error) => errors.get(page)!.push(error.message));
	const origin = new URL(baseURL!).origin;
	await page.route('**/*', async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === origin || !['http:', 'https:'].includes(url.protocol))
			return route.continue();
		if (/(^|\.)(youtube\.com|ytimg\.com|googlevideo\.com)$/.test(url.hostname))
			requests.get(page)!.push(url.href);
		if (url.href === 'https://www.youtube.com/iframe_api')
			return route.fulfill({ contentType: 'application/javascript', body: youtubeMock });
		if (url.href === 'https://www.youtube.com/embed/mock')
			return route.fulfill({
				contentType: 'text/html',
				body: '<!doctype html><title>Test provider</title><body style="background:#101511;color:white">YouTube test player</body>'
			});
		if (url.hostname === 'i.ytimg.com')
			return route.fulfill({
				contentType: 'image/svg+xml',
				body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#718d78"/></svg>'
			});
		return route.abort('blockedbyclient');
	});
	await api(page);
});

test.afterEach(async ({ page }) => {
	expect(errors.get(page), 'No uncaught application errors').toEqual([]);
});

test('checks metadata without provider requests and filters topics, music and search', async ({
	page
}) => {
	await openGallery(page);
	await expect(gallery(page).locator('.vif-card')).toHaveCount(5);
	expect(requests.get(page)).toEqual([]);
	await expect(gallery(page).locator('img, iframe')).toHaveCount(0);
	await gallery(page).getByRole('tab', { name: 'Music', exact: true }).click();
	await expect(gallery(page).locator('.vif-card')).toHaveCount(2);
	await gallery(page).getByRole('button', { name: 'Bengali', exact: true }).click();
	await expect(gallery(page).locator('.vif-card')).toHaveCount(1);
	await expect(
		gallery(page).getByRole('button', { name: 'Play Bengali evening song' })
	).toBeVisible();
	await gallery(page).getByRole('tab', { name: 'Films', exact: true }).click();
	await expect(gallery(page).getByRole('button', { name: 'Play Bengali film' })).toBeVisible();
	await gallery(page).getByRole('searchbox').fill('nonexistent');
	await expect(gallery(page).locator('.vif-empty')).toBeVisible();
	await expect(gallery(page).locator('.vif-card')).toHaveCount(0);
	await gallery(page).getByRole('button', { name: 'Clear search' }).click();
	await gallery(page).getByRole('tab', { name: 'Films', exact: true }).press('Home');
	await expect(gallery(page).getByRole('tab', { name: 'All', exact: true })).toBeFocused();
	await gallery(page).getByRole('searchbox').fill('  EXAMPLE CREATOR  ');
	await expect(gallery(page).locator('.vif-card')).toHaveCount(5);
	expect(requests.get(page)).toEqual([]);
});

test('loads one player on selection, preserves source timestamp, closes and returns focus', async ({
	page
}) => {
	await page.addInitScript(() => localStorage.setItem('site-theme', 'light'));
	await openGallery(page);
	await enableMedia(page);
	await expect(gallery(page).locator('.vif-thumbnail img')).toHaveCount(5);
	await expect(frame(page)).toHaveCount(0);
	await select(page, 'Bengali evening song');
	await expect(panel(page)).toBeFocused();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as MockWindow).__vifMock.calls.find((call) => call.method === 'cue')
						?.value
			)
		)
		.toEqual({ videoId: 'HvOXmnTJYRc', startSeconds: 12 });
	await select(page, 'Hindi song');
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as MockWindow).__vifMock.players.filter((player) => !player.destroyed)
						.length
			)
		)
		.toBe(1);
	await clickControl(panel(page).getByRole('button', { name: 'Close player' }));
	await expect(frame(page)).toHaveCount(0);
	await expect(
		gallery(page).getByRole('button', { name: 'Play Hindi song', exact: true })
	).toBeFocused();
	await expect
		.poll(() =>
			page.evaluate(() =>
				(window as unknown as MockWindow).__vifMock.players.every((player) => player.destroyed)
			)
		)
		.toBe(true);
	await gallery(page).screenshot({ path: '.tmp/videos-i-like-desktop-fixture.png' });
});

for (const code of [100, 101]) {
	test(`playlist excludes unchecked members and suppresses provider content error ${code}`, async ({
		page
	}) => {
		await openGallery(page);
		await enableMedia(page);
		await select(page, 'Linear algebra playlist');
		await expect(panel(page).locator('.vif-queue li')).toHaveCount(2);
		await expect(
			panel(page)
				.locator('.vif-queue')
				.getByRole('button', { name: /Private lesson/ })
		).toHaveCount(0);
		await expect(
			panel(page)
				.locator('.vif-queue')
				.getByRole('button', { name: /Uncertain lesson/ })
		).toHaveCount(0);
		await emitError(page, code);
		await expect(frame(page)).toHaveCount(0);
		await expect(panel(page).locator('.vif-queue li')).toHaveCount(1);
		await expect(
			panel(page).getByText('This video cannot play here.', { exact: true })
		).toBeVisible();
		await clickControl(panel(page).getByRole('button', { name: 'Choose next available video' }));
		await expect(
			panel(page).getByRole('heading', { name: 'Matrices next', exact: true })
		).toBeVisible();
		await expect(frame(page)).toHaveCount(1);
	});
}

test('browser error 5 remains retryable and autoplay blocking asks for Play', async ({ page }) => {
	await openGallery(page);
	await enableMedia(page);
	await select(page, 'Bengali evening song');
	await emitError(page, 5);
	await expect(
		gallery(page).getByRole('button', { name: 'Play Bengali evening song', exact: true })
	).toBeVisible();
	await expect(panel(page).getByRole('button', { name: 'Try playback again' })).toBeEnabled();
	await clickControl(panel(page).getByRole('button', { name: 'Try playback again' }));
	await expect(panel(page).getByRole('button', { name: 'Try playback again' })).toHaveCount(0);
	await page.evaluate(() => {
		const player = (window as unknown as MockWindow).__vifMock.players.at(-1)!;
		player.options.events.onAutoplayBlocked({ target: player });
	});
	await expect(panel(page).getByText('Press Play to start the video.')).toBeVisible();
	await expect(panel(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
});

test('revoking media permission removes provider images and the active player', async ({
	page
}) => {
	await openGallery(page);
	await enableMedia(page);
	await select(page, 'Bengali film');
	await page.evaluate(() => {
		const key = 'suvroghosh:consent';
		const savedAt = Date.now();
		const value = JSON.stringify({
			v: 2,
			media: false,
			savedAt,
			expiresAt: savedAt + 180 * 24 * 60 * 60 * 1000
		});
		const oldValue = localStorage.getItem(key);
		localStorage.setItem(key, value);
		window.dispatchEvent(
			new StorageEvent('storage', { key, oldValue, newValue: value, storageArea: localStorage })
		);
	});
	await expect(gallery(page).locator('img, iframe')).toHaveCount(0);
	await expect(panel(page).getByText('Load YouTube content to watch here.')).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(() =>
				(window as unknown as MockWindow).__vifMock.players.every((player) => player.destroyed)
			)
		)
		.toBe(true);
});

test('missing API configuration gives honest empty state and accessible source links', async ({
	page
}) => {
	await api(page, async (route) =>
		route.fulfill({
			json: {
				items: [],
				checkedAt: null,
				expiresAt: null,
				configuration: 'missing-key',
				partial: true
			}
		})
	);
	await openGallery(page);
	await expect(
		gallery(page).getByText(
			'Video checks are not available yet. You can still browse the original collections below.'
		)
	).toBeVisible();
	await expect(gallery(page).locator('.vif-card')).toHaveCount(0);
	await gallery(page).getByText('Original collections and source links', { exact: true }).click();
	await expect(gallery(page).getByRole('link', { name: 'Audiobook', exact: true })).toBeVisible();
	await expect(
		gallery(page).getByRole('link', { name: 'Open the Hindi YouTube Mix ↗' })
	).toHaveAttribute('href', 'https://www.youtube.com/playlist?list=RD6sfHEAeNklM');
	expect(requests.get(page)).toEqual([]);
});

test('playlist continuation replaces its prefix without dropping other cards or duplicating members', async ({
	page
}) => {
	await api(page, async (route) => {
		const response = fixtures();
		if (route.request().postDataJSON().playlistKey) {
			const playlist = response.items.find((item) => item.kind === 'playlist')!;
			playlist.videos.push(checkedVideo('Y4mnlIvVJEs', 'More algebra'));
			playlist.videos = playlist.videos.filter((video) => video.title !== 'Uncertain lesson');
			playlist.checkedCount = 6;
			delete playlist.nextPage;
			response.items = [playlist];
		}
		await route.fulfill({ json: response });
	});
	await openGallery(page);
	await enableMedia(page);
	await select(page, 'Linear algebra playlist');
	await clickControl(panel(page).getByRole('button', { name: 'Check more playlist videos' }));
	await expect(panel(page).locator('.vif-queue li')).toHaveCount(3);
	await expect(gallery(page).locator('.vif-card')).toHaveCount(5);
	await expect(panel(page).getByRole('button', { name: 'Check more playlist videos' })).toHaveCount(
		0
	);
	await expect(
		panel(page)
			.locator('.vif-queue')
			.getByRole('button', { name: /More algebra/ })
	).toBeVisible();
	await expect(frame(page)).toHaveCount(1);
});

test('a delayed playlist response cannot replace a newly selected film', async ({ page }) => {
	let release!: () => void;
	const delayed = new Promise<void>((resolve) => {
		release = resolve;
	});
	await api(page, async (route) => {
		const response = fixtures();
		if (route.request().postDataJSON().playlistKey) {
			await delayed;
			response.items = response.items.filter((item) => item.kind === 'playlist');
			delete response.items[0].nextPage;
		}
		await route.fulfill({ json: response });
	});
	await openGallery(page);
	await enableMedia(page);
	await select(page, 'Linear algebra playlist');
	await clickControl(panel(page).getByRole('button', { name: 'Check more playlist videos' }));
	await select(page, 'Bengali film');
	release();
	await expect(gallery(page).getByRole('button', { name: 'Refresh videos' })).toBeEnabled();
	await expect(
		panel(page).getByRole('heading', { name: 'Bengali film', exact: true })
	).toBeVisible();
	await expect(panel(page).locator('.vif-queue')).toHaveCount(0);
	await expect(frame(page)).toHaveCount(1);
});

test('switching during player startup cancels the old player and ignores late callbacks', async ({
	page
}) => {
	await page.addInitScript(() => {
		(window as unknown as MockWindow).__vifDelayFirst = true;
	});
	await openGallery(page);
	await enableMedia(page);
	await gallery(page)
		.getByRole('button', { name: 'Play Bengali evening song', exact: true })
		.click();
	await expect(frame(page)).toHaveCount(1);
	await select(page, 'Bengali film');
	await page.evaluate(() => {
		const first = (window as unknown as MockWindow).__vifMock.players[0];
		first.options.events.onError({ target: first, data: 100 });
		first.options.events.onReady({ target: first });
	});
	await expect(
		panel(page).getByRole('heading', { name: 'Bengali film', exact: true })
	).toBeVisible();
	await expect(frame(page)).toHaveCount(1);
	await expect(
		gallery(page).getByRole('button', { name: 'Play Bengali evening song', exact: true })
	).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(() =>
				(window as unknown as MockWindow).__vifMock.players
					.filter((player) => !player.destroyed)
					.map((player) => player.videoId)
			)
		)
		.toEqual(['iwsigIyhPWg']);
});

test('repeated playlist IDs advance by source occurrence in A, A, B order', async ({ page }) => {
	await api(page, async (route) => {
		const response = fixtures();
		const playlist = response.items.find((item) => item.kind === 'playlist')!;
		const first = checkedVideo('QL4_4GAWvPs', 'Repeated vectors');
		playlist.videos = [first, { ...first }, checkedVideo('6htbyY3rH1w', 'Matrices last')];
		playlist.checkedCount = 3;
		delete playlist.nextPage;
		await route.fulfill({ json: response });
	});
	await openGallery(page);
	await enableMedia(page);
	await select(page, 'Linear algebra playlist');
	const queue = panel(page).locator('.vif-queue button');
	await expect(queue).toHaveCount(3);
	await expect(queue.nth(0)).toHaveAttribute('aria-current', 'true');
	for (const position of [1, 2]) {
		await page.evaluate(() => {
			const current = (window as unknown as MockWindow).__vifMock.players.at(-1)!;
			current.options.events.onStateChange({ target: current, data: 0 });
		});
		await expect(queue.nth(position)).toHaveAttribute('aria-current', 'true');
		await expect(panel(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
	}
	await expect
		.poll(() =>
			page.evaluate(() =>
				(window as unknown as MockWindow).__vifMock.calls
					.filter((call) => call.method === 'play')
					.map((call) => call.value)
			)
		)
		.toEqual(['QL4_4GAWvPs', 'QL4_4GAWvPs', '6htbyY3rH1w']);
	await expect(frame(page)).toHaveCount(1);
});

test('refresh unloads a selected video that is no longer available', async ({ page }) => {
	let requestCount = 0;
	await api(page, async (route) => {
		const response = fixtures();
		if (++requestCount > 1) {
			const film = response.items.find((item) => item.id === 'iwsigIyhPWg')!;
			film.state = 'unavailable';
			film.videos[0].state = 'unavailable';
		}
		await route.fulfill({ json: response });
	});
	await openGallery(page);
	await enableMedia(page);
	await select(page, 'Bengali film');
	await clickControl(gallery(page).getByRole('button', { name: 'Refresh videos', exact: true }));
	await expect(frame(page)).toHaveCount(0);
	await expect(
		gallery(page).getByRole('button', { name: 'Play Bengali film', exact: true })
	).toHaveCount(0);
	await expect(
		panel(page).getByText(
			'This selection is no longer available to play here. Refresh the check or choose another video.'
		)
	).toBeVisible();
	await expect(panel(page).getByRole('button', { name: 'Try playback again' })).toBeDisabled();
	await expect
		.poll(() =>
			page.evaluate(() =>
				(window as unknown as MockWindow).__vifMock.players.every((player) => player.destroyed)
			)
		)
		.toBe(true);
});

test('expired checks prevent starting another queue item or restarting a paused player', async ({
	page
}) => {
	await page.clock.install({ time: new Date() });
	await openGallery(page);
	await enableMedia(page);
	await select(page, 'Linear algebra playlist');
	await page.evaluate(() => {
		const current = (window as unknown as MockWindow).__vifMock.players.at(-1)!;
		current.options.events.onStateChange({ target: current, data: 2 });
	});
	await page.clock.fastForward(6 * 60 * 1000);
	await expect(
		gallery(page).getByText('The last check has expired. Refresh to see available videos.')
	).toBeVisible();
	await expect(gallery(page).locator('.vif-card')).toHaveCount(0);
	await expect(panel(page).getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
	for (const button of await panel(page).locator('.vif-queue button').all())
		await expect(button).toBeDisabled();
});

test('ordinary playlist pagination is not reported as an availability check failure', async ({
	page
}) => {
	await api(page, async (route) => {
		const response = fixtures();
		response.partial = true;
		response.items = response.items.filter((item) => item.state !== 'unknown');
		for (const item of response.items) {
			item.videos = item.videos.filter((video) => video.state !== 'unknown');
			if (item.kind === 'mix') item.state = 'unknown';
		}
		await route.fulfill({ json: response });
	});
	await openGallery(page);
	await expect(gallery(page).locator('.vif-status')).toContainText('5 selections available');
	await expect(
		gallery(page).getByText('Some videos could not be checked. Try again.', { exact: true })
	).toHaveCount(0);
	await expect(
		gallery(page).getByRole('button', { name: 'Play Linear algebra playlist', exact: true })
	).toBeVisible();
});

test('progressive checks add new topics without interrupting a selected video', async ({
	page
}) => {
	let release!: () => void;
	const delayed = new Promise<void>((resolve) => {
		release = resolve;
	});
	const bodies: unknown[] = [];
	await api(page, async (route) => {
		const body = route.request().postDataJSON();
		bodies.push(body);
		const response = fixtures();
		response.items = [response.items[0]];
		if (body.batch === 1) {
			await delayed;
			response.items = [videoItem('e44meSqTkH0', 'Physics lesson', ['science'])];
		} else response.nextBatch = 1;
		await route.fulfill({ json: response });
	});
	await openGallery(page, false);
	await expect(gallery(page).locator('.vif-card')).toHaveCount(1);
	await expect(gallery(page).locator('.vif-status')).toContainText('Checking videos');
	await enableMedia(page);
	await select(page, 'Bengali evening song');
	release();
	await expect(gallery(page).getByRole('button', { name: 'Refresh videos' })).toBeEnabled();
	await expect(gallery(page).locator('.vif-card')).toHaveCount(2);
	await expect(
		panel(page).getByRole('heading', { name: 'Bengali evening song', exact: true })
	).toBeVisible();
	await expect(frame(page)).toHaveCount(1);
	await clickControl(gallery(page).getByRole('tab', { name: 'Science', exact: true }));
	await expect(
		gallery(page).getByRole('button', { name: 'Play Physics lesson', exact: true })
	).toBeVisible();
	await expect(gallery(page).locator('.vif-card')).toHaveCount(1);
	expect(bodies).toEqual([{}, { batch: 1 }]);
});

test('an interrupted catalogue check can resume without losing the checked cards', async ({
	page
}) => {
	let attempts = 0;
	const bodies: unknown[] = [];
	await api(page, async (route) => {
		const body = route.request().postDataJSON();
		bodies.push(body);
		const response = fixtures();
		response.items = [response.items[0]];
		if (body.batch === 1) {
			if (++attempts === 1) {
				await route.fulfill({ status: 429, json: { error: 'Please wait.' } });
				return;
			}
			response.items = [videoItem('e44meSqTkH0', 'Technology lesson', ['technology'])];
		} else response.nextBatch = 1;
		await route.fulfill({ json: response });
	});
	await openGallery(page);
	await expect(
		gallery(page).getByRole('button', { name: 'Continue checking', exact: true })
	).toBeVisible();
	await expect(gallery(page).locator('.vif-card')).toHaveCount(1);
	await clickControl(gallery(page).getByRole('button', { name: 'Continue checking', exact: true }));
	await expect(gallery(page).locator('.vif-card')).toHaveCount(2);
	await expect(
		gallery(page).getByRole('button', { name: 'Continue checking', exact: true })
	).toHaveCount(0);
	expect(bodies).toEqual([{}, { batch: 1 }, { batch: 1 }]);
});

test('new batches never extend the expiry of previously checked cards', async ({ page }) => {
	await page.clock.install({ time: new Date() });
	let release!: () => void;
	const delayed = new Promise<void>((resolve) => {
		release = resolve;
	});
	await api(page, async (route) => {
		const response = fixtures();
		response.items = [response.items[0]];
		if (route.request().postDataJSON().batch === 1) {
			await delayed;
			response.expiresAt = new Date(Date.now() + 900_000).toISOString();
			response.items = [videoItem('e44meSqTkH0', 'Science lesson', ['science'])];
		} else {
			response.expiresAt = new Date(Date.now() + 1_000).toISOString();
			response.nextBatch = 1;
		}
		await route.fulfill({ json: response });
	});
	await openGallery(page, false);
	await expect(gallery(page).locator('.vif-card')).toHaveCount(1);
	await page.clock.fastForward(2_000);
	release();
	await expect(gallery(page).getByRole('button', { name: 'Refresh videos' })).toBeEnabled();
	await expect(gallery(page).locator('.vif-status')).toContainText('expired');
	await expect(gallery(page).locator('.vif-card')).toHaveCount(0);
});

test('saved-note fallback links use public YouTube URLs without local paths', async ({ page }) => {
	await openGallery(page);
	await clickControl(
		gallery(page).getByText('Original collections and source links', { exact: true })
	);
	await expect(gallery(page).getByText('Saved-note collections', { exact: true })).toBeVisible();
	const collections = gallery(page).locator('.vif-sources details');
	await expect(collections).toHaveCount(30);
	const links = await collections
		.locator('a')
		.evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href));
	expect(links.length).toBeGreaterThanOrEqual(270);
	expect(links.every((url) => new URL(url).hostname === 'www.youtube.com')).toBe(true);
	expect(await gallery(page).innerText()).not.toMatch(/C:\\Users|suvros_obsidian|obsidian:\/\//i);
});

test('390px dark layout keeps readable cards and a player at least 200px in both dimensions', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(() => localStorage.setItem('site-theme', 'dark'));
	await openGallery(page);
	await enableMedia(page);
	await select(page, 'Bengali film');
	await expect(page.locator('html')).toHaveClass(/dark/);
	const size = await frame(page).boundingBox();
	expect(size!.width).toBeGreaterThanOrEqual(200);
	expect(size!.height).toBeGreaterThanOrEqual(200);
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
		.toBeLessThanOrEqual(1);
	await expect(gallery(page).getByRole('tablist', { name: 'Video topics' })).toBeVisible();
	const colours = await gallery(page).evaluate((element) => {
		const style = getComputedStyle(element);
		return { background: style.backgroundColor, text: style.color };
	});
	expect(colours.background).not.toBe(colours.text);
	await page.screenshot({
		path: 'test-results/videos-i-like-tests/mobile-dark.png',
		fullPage: true
	});
	await gallery(page).screenshot({ path: '.tmp/videos-i-like-mobile-dark-fixture.png' });
});
