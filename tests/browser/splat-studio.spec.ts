import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import { usePausedMediaPreference } from '../helpers/privacy-choice';

const route = '/tools/splat-studio';
const studio = (page: Page) => page.locator('#splat-studio');
const canvas = (page: Page) => page.locator('canvas[aria-label="Interactive 3D splat sculpture"]');
const presets = [
	['aurora-knot', 'Aurora Knot'],
	['chromatic-nebula', 'Chromatic Nebula'],
	['liquid-bloom', 'Liquid Bloom'],
	['magnetic-storm', 'Magnetic Storm'],
	['prism-reef', 'Prism Reef'],
	['impossible-torus', 'Impossible Torus']
] as const;
const styles = ['gaussian', 'anisotropic', 'surfel', 'ink', 'spark', 'hybrid'];

test.beforeEach(async ({ context, page, baseURL }) => {
	await usePausedMediaPreference(context);
	if (baseURL && ['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
		// Vercel serves this platform script; a loopback Vite production preview does not.
		await page.route('**/_vercel/insights/script.js', (request) =>
			request.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
		);
	}
});

async function ready(page: Page, query = '') {
	await page.goto(route + query, { waitUntil: 'domcontentloaded' });
	await expect(studio(page)).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
	await expect(canvas(page)).toBeVisible();
}

async function canvasPNG(target: Locator) {
	const image = await target.evaluate((element) =>
		(element as HTMLCanvasElement).toDataURL('image/png')
	);
	return Buffer.from(image.split(',')[1], 'base64');
}

async function fingerprint(target: Locator) {
	return createHash('sha256')
		.update(await canvasPNG(target))
		.digest('hex');
}

async function hasArtwork(target: Locator) {
	// Canvas replacement and a ResizeObserver delivery can fall between two frames.
	// Require actual painted pixels, while allowing the next scheduled redraw to finish.
	await expect
		.poll(async () => {
			const { channels } = await sharp(await canvasPNG(target)).stats();
			return channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0);
		})
		.toBeGreaterThan(12);
}

async function bytes(download: Download) {
	const stream = await download.createReadStream();
	if (!stream) throw new Error('The PNG download did not provide a readable stream.');
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

async function denyClipboard(page: Page) {
	// Clipboard permissions differ by engine. Exercise the visitor-facing copy field
	// used when browser permission, an embedded view or OS policy denies clipboard access.
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')) }
		});
	});
}

async function exportArtwork(page: Page) {
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/\.png$/u);
	const png = await bytes(download);
	const metadata = await sharp(png).metadata();
	expect(metadata.format).toBe('png');
	expect(metadata.width).toBeGreaterThan(300);
	expect(metadata.height).toBeGreaterThan(300);
	const stats = await sharp(png).stats();
	expect(
		stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0)
	).toBeGreaterThan(12);
}

test('six presets and six splat styles produce visible, distinct sculptures without runtime errors', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await ready(page);
	expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
		true
	);
	await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Splat Studio', exact: true })).toBeVisible();
	await hasArtwork(canvas(page));
	await mkdir('artifacts/splat-studio', { recursive: true });
	await page.screenshot({ path: 'artifacts/splat-studio/desktop.png', fullPage: true });
	const images = new Set<string>();
	for (const [id, name] of presets) {
		const previousId = await studio(page).getAttribute('data-preset');
		const previousImage = await fingerprint(canvas(page));
		await page.getByRole('button', { name: new RegExp(name, 'u') }).click();
		await expect(studio(page)).toHaveAttribute('data-preset', id);
		if (previousId !== id)
			await expect.poll(() => fingerprint(canvas(page))).not.toBe(previousImage);
		await hasArtwork(canvas(page));
		images.add(await fingerprint(canvas(page)));
	}
	expect(images.size).toBe(6);
	for (const style of styles) {
		const previousStyle = await studio(page).getAttribute('data-style');
		const previousImage = await fingerprint(canvas(page));
		await page.getByLabel('Splat style', { exact: true }).selectOption(style);
		await expect(studio(page)).toHaveAttribute('data-style', style);
		if (previousStyle !== style)
			await expect.poll(() => fingerprint(canvas(page))).not.toBe(previousImage);
		await hasArtwork(canvas(page));
	}
	expect(errors).toEqual([]);
});

test('keyboard tuning and the clipboard-denied share link restore scene settings', async ({
	page
}) => {
	await denyClipboard(page);
	await ready(page);
	const initial = await fingerprint(canvas(page));
	const size = page.getByLabel('Splat size', { exact: true });
	await size.focus();
	await size.press('End');
	await expect.poll(() => fingerprint(canvas(page))).not.toBe(initial);
	await page.getByLabel('Splat style', { exact: true }).selectOption('ink');
	await page.getByLabel('Seed', { exact: true }).fill('92743');
	await page.getByLabel('Seed', { exact: true }).press('Tab');
	await page.getByRole('button', { name: 'Copy scene link', exact: true }).click();
	const link = page.locator('#ss-share-link');
	await expect(link).toBeVisible();
	const copied = await link.inputValue();
	expect(new URL(copied).pathname).toBe(route);
	expect(new URL(copied).search.length).toBeGreaterThan(10);
	await page.goto(copied);
	await expect(studio(page)).toHaveAttribute('data-state', 'ready');
	await expect(page.getByLabel('Splat style', { exact: true })).toHaveValue('ink');
	await expect(page.getByLabel('Seed', { exact: true })).toHaveValue('92743');
	await expect(page.getByLabel('Splat size', { exact: true })).toHaveValue('2.5');
});

test('advanced controls are reachable and PNG export contains the artwork', async ({ page }) => {
	await ready(page);
	for (const [section, controls] of [
		['Shape', ['Scale', 'Twist', 'Curl', 'Spread', 'Hollow centre', 'Symmetry']],
		['Splats', ['Opacity', 'Softness', 'Elongation', 'Orientation variation']],
		['Colour', ['Hue shift', 'Saturation', 'Gradient spread', 'Colour mapping']],
		['Motion', ['Turbulence', 'Breathing', 'Rotation speed']],
		['View', ['Exposure', 'Bloom', 'Background', 'Camera distance', 'Quality']]
	] as const) {
		const details = page
			.locator('details')
			.filter({ has: page.locator('summary', { hasText: section }) });
		if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
		for (const label of controls)
			await expect(page.getByLabel(label, { exact: true })).toBeVisible();
	}
	await exportArtwork(page);
});

test('transport, camera and immersive controls remain usable', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await ready(page);
	const moving = await fingerprint(canvas(page));
	await expect.poll(() => fingerprint(canvas(page))).not.toBe(moving);
	await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
	// Observe the absence of animation over an interval after a completed frame.
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	const paused = await fingerprint(canvas(page));
	await page.waitForTimeout(300);
	expect(await fingerprint(canvas(page))).toBe(paused);
	await canvas(page).focus();
	await canvas(page).press('ArrowLeft');
	await expect.poll(() => fingerprint(canvas(page))).not.toBe(paused);
	await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
	const beforeResume = await fingerprint(canvas(page));
	await page.getByRole('button', { name: 'Play animation', exact: true }).click();
	await expect.poll(() => fingerprint(canvas(page))).not.toBe(beforeResume);
	await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
	await page.getByRole('button', { name: 'Hide controls', exact: true }).click();
	await page.getByRole('button', { name: 'Show controls', exact: true }).click();
	await expect(page.getByLabel('Splat style', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Surprise me', exact: true }).click();
	await hasArtwork(canvas(page));
});

test('mobile layout preserves the canvas and controls without horizontal overflow', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await ready(page);
	await hasArtwork(canvas(page));
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
	await mkdir('artifacts/splat-studio', { recursive: true });
	await page.screenshot({ path: 'artifacts/splat-studio/mobile.png', fullPage: true });
	await page.getByRole('button', { name: /Liquid Bloom/u }).click();
	await expect(studio(page)).toHaveAttribute('data-preset', 'liquid-bloom');
	await page.getByRole('button', { name: 'Tune sculpture', exact: true }).click();
	await page.getByLabel('Splat style', { exact: true }).selectOption('surfel');
	await page.getByRole('button', { name: 'Close controls', exact: true }).click();
	await hasArtwork(canvas(page));
});

test('compatibility rendering supports every form and style, tuning, share links and PNG export', async ({
	page
}) => {
	await denyClipboard(page);
	await ready(page, '?webgl=off');
	await expect(studio(page)).toHaveAttribute('data-renderer', 'canvas2d');
	await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
	const images = new Set<string>();
	for (const [id, name] of presets) {
		const before = await fingerprint(canvas(page));
		const previousId = await studio(page).getAttribute('data-preset');
		await page.getByRole('button', { name: new RegExp(name, 'u') }).click();
		await expect(studio(page)).toHaveAttribute('data-preset', id);
		if (previousId !== id) await expect.poll(() => fingerprint(canvas(page))).not.toBe(before);
		await hasArtwork(canvas(page));
		images.add(await fingerprint(canvas(page)));
	}
	expect(images.size).toBe(6);
	for (const style of styles) {
		const before = await fingerprint(canvas(page));
		const previousStyle = await studio(page).getAttribute('data-style');
		await page.getByLabel('Splat style', { exact: true }).selectOption(style);
		if (previousStyle !== style)
			await expect.poll(() => fingerprint(canvas(page))).not.toBe(before);
		await hasArtwork(canvas(page));
	}
	const before = await fingerprint(canvas(page));
	await page.getByLabel('Splat size', { exact: true }).focus();
	await page.getByLabel('Splat size', { exact: true }).press('End');
	await expect.poll(() => fingerprint(canvas(page))).not.toBe(before);
	await page.getByLabel('Seed', { exact: true }).fill('92743');
	await page.getByLabel('Seed', { exact: true }).press('Tab');
	await exportArtwork(page);
	await page.getByRole('button', { name: 'Copy scene link', exact: true }).click();
	await expect(page.locator('#ss-share-link')).toBeVisible();
	const copied = await page.locator('#ss-share-link').inputValue();
	await page.goto(copied);
	await expect(studio(page)).toHaveAttribute('data-state', 'ready');
	await expect(page.getByLabel('Seed', { exact: true })).toHaveValue('92743');
	await expect(page.getByLabel('Splat size', { exact: true })).toHaveValue('2.5');
});

for (const failure of ['unavailable', 'throws'] as const) {
	test(`a browser whose WebGL context ${failure === 'throws' ? 'throws' : 'is unavailable'} still renders interactive artwork`, async ({
		page
	}) => {
		await page.addInitScript((failure) => {
			const original = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = function (
				this: HTMLCanvasElement,
				contextId: string,
				...args: unknown[]
			) {
				if (['webgl', 'webgl2', 'experimental-webgl'].includes(contextId)) {
					if (failure === 'throws')
						throw new DOMException('Graphics disabled', 'NotSupportedError');
					return null;
				}
				return original.apply(this, [contextId, ...args] as Parameters<typeof original>);
			} as typeof original;
		}, failure);
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await ready(page);
		await expect(studio(page)).toHaveAttribute('data-renderer', 'canvas2d');
		await hasArtwork(canvas(page));
		const before = await fingerprint(canvas(page));
		await canvas(page).focus();
		await canvas(page).press('ArrowRight');
		await expect.poll(() => fingerprint(canvas(page))).not.toBe(before);
		await page.getByRole('button', { name: 'Play animation', exact: true }).click();
		const moving = await fingerprint(canvas(page));
		await expect.poll(() => fingerprint(canvas(page))).not.toBe(moving);
		await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
		await page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
				)
		);
		const paused = await fingerprint(canvas(page));
		await page.waitForTimeout(300);
		expect(await fingerprint(canvas(page))).toBe(paused);
		expect(errors).toEqual([]);
	});
}

test('WebGL without renderable HDR attachments falls back to visible artwork', async ({ page }) => {
	await page.addInitScript(() => {
		if (typeof WebGL2RenderingContext === 'undefined') return;
		const original = WebGL2RenderingContext.prototype.getExtension;
		WebGL2RenderingContext.prototype.getExtension = function (name: string) {
			if (['EXT_color_buffer_float', 'EXT_color_buffer_half_float'].includes(name)) return null;
			return original.call(this, name);
		};
	});
	await ready(page);
	await expect(studio(page)).toHaveAttribute('data-renderer', 'canvas2d');
	await hasArtwork(canvas(page));
	await page.getByRole('button', { name: 'Liquid Bloom', exact: true }).click();
	await expect(studio(page)).toHaveAttribute('data-preset', 'liquid-bloom');
	await hasArtwork(canvas(page));
});

test('a failed GPU module download releases its pending context and starts Canvas2D', async ({
	page
}) => {
	await page.addInitScript(() => {
		const contexts: WebGL2RenderingContext[] = [];
		Object.defineProperty(window, '__splatTestContexts', { value: contexts });
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (
			this: HTMLCanvasElement,
			contextId: string,
			...args: unknown[]
		) {
			const context = original.apply(this, [contextId, ...args] as Parameters<typeof original>);
			if (contextId === 'webgl2' && context) contexts.push(context as WebGL2RenderingContext);
			return context;
		} as typeof original;
	});
	let blocked = 0;
	await page.route('**/*.js', async (request) => {
		const response = await request.fetch();
		const source = await response.text();
		// Select only this GPU renderer's chunk, including content-hashed production builds.
		// The Canvas2D module and the studio shell must remain available.
		if (source.includes('Your browser could not compile the 3D artwork shaders.')) {
			blocked++;
			await request.abort('failed');
		} else await request.fulfill({ response });
	});
	await ready(page);
	test.skip(blocked === 0, 'This browser already chose Canvas2D before requesting the GPU module.');
	await expect(studio(page)).toHaveAttribute('data-renderer', 'canvas2d');
	await hasArtwork(canvas(page));
	await expect
		.poll(() =>
			page.evaluate(() => {
				const contexts = (
					window as typeof window & { __splatTestContexts: WebGL2RenderingContext[] }
				).__splatTestContexts;
				return contexts.length > 0 && contexts.every((context) => context.isContextLost());
			})
		)
		.toBe(true);
	await exportArtwork(page);
});

test('a paused sculpture supports mouse orbit and retains its settings after WebGL context loss', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await ready(page);
	await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
	const original = await fingerprint(canvas(page));
	const bounds = await canvas(page).boundingBox();
	if (!bounds) throw new Error('The interactive canvas has no rendered bounds.');
	await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
	await page.mouse.down();
	await page.mouse.move(bounds.x + bounds.width * 0.5 + 120, bounds.y + bounds.height * 0.5 + 60, {
		steps: 10
	});
	await page.mouse.up();
	await expect.poll(() => fingerprint(canvas(page))).not.toBe(original);
	await page.getByLabel('Seed', { exact: true }).fill('28571');
	await page.getByLabel('Seed', { exact: true }).press('Tab');
	await page.getByLabel('Splat style', { exact: true }).selectOption('ink');

	const extension = await canvas(page).evaluateHandle((element) =>
		(element as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')
	);
	test.skip(
		!(await extension.evaluate((value) => Boolean(value))),
		'This browser does not expose the optional WebGL context-loss testing extension.'
	);
	try {
		await extension.evaluate((value) => value?.loseContext());
		await expect(studio(page)).toHaveAttribute('data-renderer', 'canvas2d');
		await expect(studio(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
		await hasArtwork(canvas(page));
		await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
		await expect(page.getByLabel('Seed', { exact: true })).toHaveValue('28571');
		await expect(page.getByLabel('Splat style', { exact: true })).toHaveValue('ink');
		expect(errors).toEqual([]);
	} finally {
		await extension.dispose();
	}
});
