import { expect, test, type Download, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
	DEFAULT_STATE,
	decodeState,
	encodeState,
	normalizeState,
	type DesignState
} from '../../src/lib/visualizations/strange-matter/model';

const articlePath = '/blog/visualizations/strange-matter';
const studio = (page: Page) => page.getByRole('group', { name: 'Generative sculpture studio' });
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
	const collected: string[] = [];
	errors.set(page, collected);
	page.on('pageerror', (error) => collected.push(error.message));
});

test.afterEach(async ({ page }) => {
	expect(
		errors.get(page) ?? [],
		'The actual studio should not produce unhandled page errors'
	).toEqual([]);
});

async function ready(page: Page, query = '') {
	await page.goto(articlePath + query, { waitUntil: 'domcontentloaded' });
	for (const name of ['Keep videos paused', 'Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name, exact: true });
		if (await button.isVisible()) await button.click();
	}
	const app = studio(page);
	await expect(app).toBeVisible();
	await app.scrollIntoViewIfNeeded();
	await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
	await expect(app.locator('canvas')).toBeVisible();
	return app;
}

async function fingerprint(page: Page) {
	return studio(page)
		.locator('canvas')
		.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL('image/png'));
}

async function brightArtworkPixels(page: Page) {
	const bytes = Buffer.from((await fingerprint(page)).split(',')[1], 'base64');
	const { data, info } = await sharp(bytes)
		.resize({ width: 300 })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	let bright = 0;
	for (let i = 0; i < data.length; i += info.channels) {
		if (Math.max(data[i], data[i + 1], data[i + 2]) > 50) bright++;
	}
	return bright;
}

async function expectVisibleArtwork(page: Page, world: string) {
	// A changed canvas can still be a black frame. Require sustained visible sculpture pixels,
	// rather than accepting only a different PNG hash or a healthy-looking control panel.
	let visibleSamples = 0;
	await expect
		.poll(
			async () => {
				const bright = await brightArtworkPixels(page);
				visibleSamples = bright > 1500 ? visibleSamples + 1 : 0;
				return visibleSamples;
			},
			{
				message: `${world} should render substantial visible geometry, not only its dark background`,
				intervals: [200, 300, 400],
				timeout: 10_000
			}
		)
		.toBeGreaterThanOrEqual(3);
}

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

async function sharedState(page: Page): Promise<DesignState> {
	await page.getByRole('button', { name: 'Share creation', exact: true }).click();
	const url = await page.getByLabel('Your reproducible artwork link').inputValue();
	return decodeState(new URL(url).searchParams.get('art'));
}

test('server fallback is readable and reduced motion opens a real paused sculpture', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('STRANGE MATTER');
	expect(html).toContain('/images/visualizations/strange-matter/poster.png');
	expect(html).toContain('Enable JavaScript');
	expect(html.match(/<h1\b/gu)).toHaveLength(1);
	expect(html).toMatch(/Updated\s*<time[^>]*datetime="2026-10-27"/u);
	const app = await ready(page);
	expect(
		await app
			.locator('.sm-art-caption h2')
			.evaluate((element) => getComputedStyle(element).fontFamily)
	).toContain('Newsreader Variable');
	await expect(app).toHaveAttribute('data-world', 'liquid');
	await expect(app).toHaveAttribute('data-seed', String(DEFAULT_STATE.seed));
	await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeEnabled();
	const bytes = Buffer.from((await fingerprint(page)).split(',')[1], 'base64');
	const stats = await sharp(bytes).stats();
	expect(stats.channels.some((channel) => channel.stdev > 12)).toBe(true);
	await page.getByRole('button', { name: 'Play animation', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toBeEnabled();
	const before = await fingerprint(page);
	await expect.poll(() => fingerprint(page)).not.toBe(before);
	await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
	const speed = page.getByRole('slider', { name: 'Speed', exact: true });
	await speed.focus();
	await speed.press('Home');
	await page.getByRole('button', { name: 'Play animation', exact: true }).click();
	const stopped = await sharedState(page);
	await page.getByRole('button', { name: 'Close share link', exact: true }).click();
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				let frames = 0;
				const sample = () => {
					if (++frames >= 30) resolve();
					else requestAnimationFrame(sample);
				};
				requestAnimationFrame(sample);
			})
	);
	expect(
		(await sharedState(page)).time,
		'Speed zero freezes the animation phase while playback is enabled'
	).toBe(stopped.time);
	await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
});

test('all four worlds render distinct geometry and each preset changes the composition', async ({
	page
}) => {
	const app = await ready(page);
	const views = new Set<string>();
	for (const [id, name, preset] of [
		['liquid', 'Liquid Knot', 'molten-orbit'],
		['bloom', 'Alien Bloom', 'night-flower'],
		['current', 'Neon Current', 'ghost-frequency'],
		['tunnel', 'Impossible Tunnel', 'solar-passage']
	] as const) {
		const old = await fingerprint(page);
		await page.getByRole('button', { name, exact: true }).click();
		await expect(app).toHaveAttribute('data-world', id);
		await expect(page.getByRole('heading', { name: new RegExp(name) })).toBeVisible();
		if (id !== 'liquid') await expect.poll(() => fingerprint(page)).not.toBe(old);
		await expectVisibleArtwork(page, `${name} default`);
		const defaultView = await fingerprint(page);
		await page.getByLabel('Starting point', { exact: true }).selectOption(preset);
		await expect.poll(() => fingerprint(page)).not.toBe(defaultView);
		await expectVisibleArtwork(page, `${name} alternate preset`);
		views.add(await fingerprint(page));
	}
	expect(views.size).toBe(4);
});

test('paused edits and zero-speed playback draw once and leave WebGL idle', async ({ page }) => {
	// Count actual GPU draw submissions without replacing the renderer or exposing an app test API.
	await page.addInitScript(() => {
		const prototype = WebGL2RenderingContext.prototype;
		const count = (context: WebGL2RenderingContext) => {
			const canvas = context.canvas as HTMLCanvasElement & { strangeMatterDrawCalls?: number };
			canvas.strangeMatterDrawCalls = (canvas.strangeMatterDrawCalls ?? 0) + 1;
		};
		const drawElements = prototype.drawElements;
		prototype.drawElements = function (...args: Parameters<typeof drawElements>) {
			count(this);
			return drawElements.apply(this, args);
		};
		const drawArrays = prototype.drawArrays;
		prototype.drawArrays = function (...args: Parameters<typeof drawArrays>) {
			count(this);
			return drawArrays.apply(this, args);
		};
	});
	const app = await ready(page);
	const sampleDraws = (glow?: number) =>
		app.locator('canvas').evaluate(async (element, nextGlow) => {
			const canvas = element as HTMLCanvasElement & { strangeMatterDrawCalls?: number };
			const samples = [canvas.strangeMatterDrawCalls ?? 0];
			if (nextGlow !== undefined) {
				const control = document.querySelector<HTMLInputElement>('#sm-glow')!;
				control.value = String(nextGlow);
				control.dispatchEvent(new Event('input', { bubbles: true }));
			}
			for (let frame = 0; frame < 8; frame++) {
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
				samples.push(canvas.strangeMatterDrawCalls ?? 0);
			}
			return samples;
		}, glow);
	const expectOneFrame = (samples: number[]) => {
		expect(samples[1], 'A stationary edit must draw the updated artwork').toBeGreaterThan(
			samples[0]
		);
		expect(
			new Set(samples.slice(1)).size,
			'A stationary edit must stop submitting GPU draws after its first frame'
		).toBe(1);
	};
	// Allow the initial size observer to finish, then require a genuinely idle renderer.
	const initial = await sampleDraws();
	expect(initial.at(-1), 'The canvas must have submitted real WebGL draws').toBeGreaterThan(0);
	expect(new Set(initial.slice(-4)).size, 'Reduced motion must leave the renderer idle').toBe(1);
	expectOneFrame(await sampleDraws(100));
	await page.getByRole('slider', { name: 'Speed', exact: true }).press('Home');
	await page.getByRole('button', { name: 'Play animation', exact: true }).click();
	expectOneFrame(await sampleDraws(0));
	await page.getByRole('slider', { name: 'Speed', exact: true }).press('End');
	const moving = await sampleDraws();
	expect(moving.at(-1), 'Positive-speed playback must continue rendering').toBeGreaterThan(
		moving[1]
	);
	await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
	const paused = await sampleDraws();
	expect(new Set(paused.slice(-4)).size, 'Pausing must release the render loop again').toBe(1);
});

test('keyboard slider edits change saved settings, palette and the rendered sculpture; Undo restores surprise', async ({
	page
}) => {
	const app = await ready(page);
	const initial = await fingerprint(page);
	for (const name of ['Shape', 'Energy', 'Detail', 'Glow', 'Speed']) {
		const control = page.getByRole('slider', { name, exact: true });
		await control.focus();
		await control.press('Home');
		await control.press('ArrowRight');
		await expect(control).toHaveValue('1');
	}
	await page.getByRole('button', { name: 'Palette: Solar flare', exact: true }).click();
	await expect.poll(() => fingerprint(page)).not.toBe(initial);
	const changed = await sharedState(page);
	for (const key of ['shape', 'energy', 'detail', 'glow', 'speed'] as const)
		expect(changed[key]).toBe(1);
	expect(changed.palette).toBe('ember');
	await page.getByRole('button', { name: 'Close share link', exact: true }).click();
	const seed = await app.getAttribute('data-seed');
	await page.getByRole('button', { name: 'Surprise me', exact: false }).click();
	await expect(app).not.toHaveAttribute('data-seed', seed!);
	await page.getByRole('button', { name: 'Undo last change', exact: true }).click();
	await expect(app).toHaveAttribute('data-seed', seed!);
	const restored = await sharedState(page);
	expect(restored).toEqual(changed);
});

test('a shared URL restores exact sculpture, controls, camera, frame and paused animation phase', async ({
	page
}) => {
	const expected = normalizeState({
		...DEFAULT_STATE,
		world: 'bloom',
		seed: 73219,
		shape: 74,
		energy: 29,
		detail: 43,
		glow: 37,
		speed: 19,
		palette: 'ultraviolet',
		framing: 'portrait',
		view: { yaw: -0.4, pitch: 0.32, distance: 7.25 },
		time: 11.25
	});
	const app = await ready(page, `?${new URLSearchParams({ art: encodeState(expected) })}`);
	await expect(app).toHaveAttribute('data-world', 'bloom');
	await expect(app).toHaveAttribute('data-seed', '73219');
	await expect(page.getByRole('slider', { name: 'Shape', exact: true })).toHaveValue('74');
	await expect(
		page.getByRole('button', { name: 'Palette: After hours', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(
		page.getByRole('button', { name: 'Portrait composition', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	expect(await sharedState(page)).toEqual(expected);
	await page.getByRole('button', { name: 'Close share link', exact: true }).click();
	const canvas = app.locator('canvas');
	await canvas.focus();
	await canvas.press('ArrowLeft');
	await canvas.press('+');
	const moved = await sharedState(page);
	expect(moved.view.yaw).toBeCloseTo(expected.view.yaw + 0.12, 4);
	expect(moved.view.distance).toBeCloseTo(expected.view.distance - 0.25, 4);
	await page.getByRole('button', { name: 'Close share link', exact: true }).click();
	await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
	expect((await sharedState(page)).view).toEqual(DEFAULT_STATE.view);
});

test('all three frames export nonempty PNGs at the advertised dimensions', async ({ page }) => {
	await ready(page);
	for (const [frame, width, height] of [
		['Landscape', 1600, 1000],
		['Square', 1600, 1600],
		['Portrait', 1280, 1600]
	] as const) {
		await page.getByRole('button', { name: `${frame} composition`, exact: true }).click();
		const box = await studio(page).locator('canvas').boundingBox();
		expect(box!.width / box!.height).toBeCloseTo(width / height, 1);
		await page.getByRole('button', { name: 'Save artwork', exact: true }).click();
		const downloaded = page.waitForEvent('download');
		await page.getByRole('button', { name: 'PNG 1600 px', exact: true }).click();
		const result = await downloaded;
		expect(result.suggestedFilename()).toMatch(/^strange-matter-liquid-\d+\.png$/);
		const bytes = await downloadBytes(result);
		expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
		const metadata = await sharp(bytes).metadata();
		expect(metadata.width).toBe(width);
		expect(metadata.height).toBe(height);
		expect(bytes.length).toBeGreaterThan(20_000);
		expect((await sharp(bytes).stats()).channels.some((channel) => channel.stdev > 12)).toBe(true);
		await page.getByRole('button', { name: 'Close export options', exact: true }).click();
	}
});

test('malformed shared settings recover and clean presentation is reversible with Escape', async ({
	page
}) => {
	const app = await ready(page, '?art=invalid-untrusted-settings');
	await expect(app).toHaveAttribute('data-world', 'liquid');
	await expect(app).toHaveAttribute('data-seed', String(DEFAULT_STATE.seed));
	await page.getByRole('button', { name: 'Clean presentation view', exact: true }).click();
	await expect(app).toHaveClass(/sm-clean/);
	await expect(page.getByRole('button', { name: /Back to studio/ })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save artwork', exact: true })).not.toBeVisible();
	await app.locator('canvas').focus();
	await page.keyboard.press('Escape');
	await expect(app).not.toHaveClass(/sm-clean/);
	await expect(page.getByRole('button', { name: 'Save artwork', exact: true })).toBeVisible();
});

test('mobile keeps the artwork on screen and expands usable controls without horizontal overflow', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const app = await ready(page);
	const toggle = page.getByRole('button', { name: /Shape your strange/ });
	await expect(toggle).toBeVisible();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByRole('slider', { name: 'Shape', exact: true })).not.toBeVisible();
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByRole('slider', { name: 'Shape', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Square composition', exact: true }).click();
	await page.getByRole('button', { name: 'Surprise me', exact: false }).click();
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	const box = await app.boundingBox();
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(391);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
	await expect(app.locator('canvas')).toBeVisible();
});

test('supported native video recording exports playable moving artwork and restores pause', async ({
	page
}) => {
	test.setTimeout(90_000);
	await ready(page);
	await page.getByRole('button', { name: 'Save artwork', exact: true }).click();
	const button = page.getByRole('button', { name: /8s video/ });
	if (!(await button.isVisible())) {
		await expect(
			page.getByText('This browser supports image export. Video recording is unavailable.')
		).toBeVisible();
		return;
	}
	const downloaded = page.waitForEvent('download', { timeout: 35_000 });
	await button.click();
	await expect(page.getByRole('button', { name: 'Liquid Knot', exact: true })).toBeDisabled();
	await expect(page.getByRole('button', { name: /Finish recording/ })).toBeVisible();
	const result = await downloaded;
	expect(result.suggestedFilename()).toMatch(/\.(webm|mp4)$/);
	const bytes = await downloadBytes(result);
	expect(bytes.length).toBeGreaterThan(20_000);
	// Verify the downloaded file in its own document. The public article's CSP
	// deliberately restricts inline blob media; the product downloads this clip.
	const decoder = await page.context().newPage();
	let metadata: { width: number; height: number; time: number };
	try {
		metadata = await decoder.evaluate(
			async ({ base64, type }) => {
				const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
				const url = URL.createObjectURL(new Blob([bytes], { type }));
				const video = document.createElement('video');
				video.muted = true;
				video.src = url;
				try {
					await new Promise<void>((resolve, reject) => {
						video.onloadedmetadata = () => resolve();
						video.onerror = () => reject(new Error('The exported recording could not be decoded.'));
					});
					await video.play();
					await new Promise<void>((resolve) => {
						video.ontimeupdate = () => {
							if (video.currentTime > 0) resolve();
						};
					});
					video.pause();
					return { width: video.videoWidth, height: video.videoHeight, time: video.currentTime };
				} finally {
					URL.revokeObjectURL(url);
				}
			},
			{
				base64: bytes.toString('base64'),
				type: result.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm'
			}
		);
	} finally {
		await decoder.close();
	}
	expect(metadata.width).toBeGreaterThan(100);
	expect(metadata.height).toBeGreaterThan(100);
	expect(metadata.time).toBeGreaterThan(0);
	await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeEnabled();
	await expect(page.getByRole('button', { name: 'Liquid Knot', exact: true })).toBeEnabled();
});

test('many-turn camera sharing and immediate edits export the same artwork as a shared replay', async ({
	page
}) => {
	await ready(page);
	await studio(page)
		.locator('canvas')
		.evaluate((canvas) => {
			for (let turn = 0; turn < 120; turn++)
				canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		});
	const orbit = await sharedState(page);
	expect(Math.sin(orbit.view.yaw)).toBeCloseTo(Math.sin(14.4), 4);
	expect(Math.cos(orbit.view.yaw)).toBeCloseTo(Math.cos(14.4), 4);
	await page.getByRole('button', { name: 'Close share link', exact: true }).click();
	await page.getByRole('button', { name: 'Save artwork', exact: true }).click();
	// Export immediately after input, before the normal geometry debounce and palette easing finish.
	await page.getByRole('slider', { name: 'Shape', exact: true }).evaluate((element) => {
		const input = element as HTMLInputElement;
		input.value = '99';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.getByRole('button', { name: 'Palette: After hours', exact: true }).click();
	const firstDownload = page.waitForEvent('download');
	await page.getByRole('button', { name: 'PNG 1600 px', exact: true }).click();
	const immediate = await downloadBytes(await firstDownload);
	await page.getByRole('button', { name: 'Close export options', exact: true }).click();
	await page.getByRole('button', { name: 'Share creation', exact: true }).click();
	const replayURL = new URL(await page.getByLabel('Your reproducible artwork link').inputValue());
	const design = decodeState(replayURL.searchParams.get('art'));
	expect(design.shape).toBe(99);
	expect(design.palette).toBe('ultraviolet');
	await ready(page, replayURL.search);
	await page.getByRole('button', { name: 'Save artwork', exact: true }).click();
	const secondDownload = page.waitForEvent('download');
	await page.getByRole('button', { name: 'PNG 1600 px', exact: true }).click();
	const replay = await downloadBytes(await secondDownload);
	const a = await sharp(immediate).raw().toBuffer();
	const b = await sharp(replay).raw().toBuffer();
	expect(a.length).toBe(b.length);
	let difference = 0;
	for (let pixel = 0; pixel < a.length; pixel++) difference += Math.abs(a[pixel] - b[pixel]);
	expect(
		difference / a.length,
		'Quick export must flush the same geometry and materials as the reproducible design'
	).toBeLessThan(1);
});

test('graphics context loss during recording aborts download and restores a clear fallback', async ({
	page
}) => {
	const app = await ready(page);
	await page.getByRole('button', { name: 'Save artwork', exact: true }).click();
	const record = page.getByRole('button', { name: /8s video/ });
	if (!(await record.isVisible())) {
		await expect(
			page.getByText('This browser supports image export. Video recording is unavailable.')
		).toBeVisible();
		return;
	}
	let downloads = 0;
	page.on('download', () => downloads++);
	await record.click();
	await expect(page.getByRole('button', { name: /Finish recording/ })).toBeVisible();
	await app.locator('canvas').evaluate((element) => {
		const context = (element as HTMLCanvasElement).getContext('webgl2');
		const extension = context?.getExtension('WEBGL_lose_context');
		if (!extension) throw new Error('WebGL context-loss verification is unavailable.');
		extension.loseContext();
	});
	await expect(app).toHaveAttribute('data-ready', 'false');
	await expect(page.getByRole('button', { name: /Finish recording/ })).not.toBeVisible();
	await expect(app.getByRole('alert')).toContainText('The graphics context was interrupted');
	await expect(app.getByRole('status').filter({ hasText: 'recording was stopped' })).toBeVisible();
	await expect(app.getByAltText('An iridescent liquid sculpture in a dark studio')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Liquid Knot', exact: true })).toBeEnabled();
	await expect(page.getByRole('slider', { name: 'Shape', exact: true })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Save artwork', exact: true })).toBeDisabled();
	expect(downloads, 'A graphics failure must not download a corrupt or misleading recording').toBe(
		0
	);
});
