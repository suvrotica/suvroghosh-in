import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const path = '/blog/visualizations/bengali-life-through-impressionist-brushstrokes';
const fixed = `${path}?v=1&scene=street&seed=calcutta-27&view=landscape`;
const canvas = (page: Page) => page.locator('canvas[data-seed]');

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function pixels(element: Locator) {
	const data = await element.evaluate((node) => (node as HTMLCanvasElement).toDataURL());
	return hash(Buffer.from(data.split(',')[1], 'base64'));
}

function hash(bytes: Buffer) {
	return createHash('sha256').update(bytes).digest('hex');
}

async function decodedPng(page: Page, bytes: Buffer) {
	const normalized = await page.evaluate(async (encoded) => {
		const png = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
		const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
		const image = document.createElement('canvas');
		image.width = bitmap.width;
		image.height = bitmap.height;
		image.getContext('2d')!.drawImage(bitmap, 0, 0);
		bitmap.close();
		return image.toDataURL().split(',')[1];
	}, bytes.toString('base64'));
	return hash(Buffer.from(normalized, 'base64'));
}

test('keyboard edits, undo, a deliberate new seed, and article navigation', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(fixed);
	const painting = canvas(page);
	await expect(painting).toBeVisible();
	await expect(painting).toHaveAttribute('data-playback', 'still');
	const opening = await pixels(painting);
	const subject = page.getByRole('img', { name: /A Calcutta lane/ });
	const description = await subject.getAttribute('aria-label');
	const brush = page.getByRole('slider', { name: 'Brush size' });
	await brush.focus();
	await brush.press('End');
	await expect(brush).toHaveAttribute('aria-valuetext', '100 percent');
	await expect.poll(() => pixels(painting)).not.toBe(opening);
	await expect(painting).toHaveAttribute('data-seed', 'calcutta-27');
	await expect(subject).toHaveAttribute('aria-label', description!);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(brush).toHaveValue('45');
	await expect.poll(() => pixels(painting)).toBe(opening);

	await page.getByRole('combobox', { name: 'Scene', exact: true }).selectOption('courtyard');
	await expect(painting).toHaveAttribute('data-scene', 'courtyard');
	await page.getByRole('button', { name: 'New painting' }).click();
	await expect(painting).not.toHaveAttribute('data-seed', 'calcutta-27');
	const seed = await painting.getAttribute('data-seed');
	await page.getByRole('slider', { name: 'Light warmth' }).press('Home');
	await page.getByRole('link', { name: 'Read the post' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Bengali Life Through Impressionist Brushstrokes'
	);
	await expect(page).toHaveURL((url) => url.pathname === path + '-essay');
	await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
		'href',
		'https://www.suvroghosh.in' + path + '-essay'
	);
	await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /^index,follow/);
	await expect(page.getByRole('heading', { name: 'Generated examples' })).toBeVisible();
	await page.getByRole('link', { name: 'Return to the painting' }).first().click();
	await expect(painting).toHaveAttribute('data-seed', seed!);
	await expect(painting).toHaveAttribute('data-scene', 'courtyard');
	await expect(page.getByRole('slider', { name: 'Light warmth' })).toHaveValue('0');
	await expect(page.getByRole('link', { name: 'Read the post' })).toBeFocused();
	await page.getByRole('slider', { name: 'Light warmth' }).press('End');
	await page.reload();
	await expect(page.getByRole('slider', { name: 'Light warmth' })).toHaveValue('100');
	await expect(painting).toHaveAttribute('data-seed', seed!);
	expect(errors).toEqual([]);
});

test('pause, finish and timed replay agree with clean PNG export', async ({ page }) => {
	await page.goto(`${fixed}&time=4`);
	const painting = canvas(page);
	await expect(painting).toBeVisible();
	const opening = await pixels(painting);
	await page.getByRole('button', { name: 'Replay' }).click();
	await page.getByRole('button', { name: 'Pause' }).click();
	const paused = await pixels(painting);
	expect(paused).not.toBe(opening);
	await expect(painting).toHaveAttribute('data-playback', 'paused');
	await page.getByRole('button', { name: 'Save image' }).click();
	const first = page.waitForEvent('download');
	await page.getByRole('button', { name: '1024 × 683' }).click();
	const small = await readFile((await (await first).path())!);
	expect(await decodedPng(page, small)).toBe(opening);
	expect(await pixels(painting)).toBe(paused);
	await page.getByRole('button', { name: 'Finish now' }).click();
	expect(await pixels(painting)).toBe(opening);

	await page.getByRole('button', { name: 'Replay' }).click();
	await expect(painting).toHaveAttribute('data-playback', 'still', { timeout: 12000 });
	expect(await pixels(painting)).toBe(opening);
	await page.getByRole('button', { name: 'Save image' }).click();
	for (const [width, height] of [
		[2048, 1365],
		[4096, 2731]
	]) {
		const next = page.waitForEvent('download');
		await page.getByRole('button', { name: `${width} × ${height}` }).click();
		const image = await readFile((await (await next).path())!);
		expect(image.readUInt32BE(16)).toBe(width);
		expect(image.readUInt32BE(20)).toBe(height);
		if (width === 2048) await page.getByRole('button', { name: 'Save image' }).click();
	}
});

test('the opening sequence starts automatically and timing changes preserve progress', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.goto(fixed);
	const painting = canvas(page);
	await expect(painting).toHaveAttribute('data-playback', 'playing');
	await page.getByRole('button', { name: 'Pause' }).click();
	const progress = page.getByRole('progressbar', { name: 'Painting progress' });
	const before = await progress.getAttribute('value');
	await page.getByRole('button', { name: 'More settings' }).click();
	await page.getByRole('slider', { name: 'Painting time' }).press('End');
	await expect(progress).toHaveAttribute('value', before!);
	await expect(painting).toHaveAttribute('data-playback', 'paused');
	await page.getByRole('button', { name: 'Resume' }).click();
	await expect(painting).toHaveAttribute('data-playback', 'playing');
	await page.getByRole('slider', { name: 'Paint texture' }).press('Home');
	await expect(painting).toHaveAttribute('data-playback', 'still');
	await expect(painting).toHaveAttribute('data-seed', 'calcutta-27');
});

test('rapid edits settle to the latest painting and fullscreen retains the subject', async ({
	page
}) => {
	await page.goto(fixed);
	const painting = canvas(page);
	await expect(painting).toBeVisible();
	await page.getByRole('slider', { name: 'Brush size' }).evaluate((element) => {
		const slider = element as HTMLInputElement;
		for (const value of ['20', '68', '90', '57']) {
			slider.value = value;
			slider.dispatchEvent(new Event('input', { bubbles: true }));
		}
		slider.dispatchEvent(new Event('change', { bubbles: true }));
	});
	await expect(page.getByRole('slider', { name: 'Brush size' })).toHaveValue('57');
	const reference = await page.context().newPage();
	await reference.emulateMedia({ reducedMotion: 'reduce' });
	await reference.goto(`${fixed}&brush=57`);
	await expect(canvas(reference)).toBeVisible();
	const settled = await pixels(canvas(reference));
	await reference.close();
	await page.bringToFront();
	await expect.poll(() => pixels(painting)).toBe(settled);
	const fullscreen = page.getByRole('button', { name: 'Fullscreen', exact: true });
	if (await fullscreen.isEnabled()) {
		await fullscreen.click();
		await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
		await expect(painting).toHaveAttribute('data-seed', 'calcutta-27');
		await page.getByRole('button', { name: 'Exit fullscreen' }).click();
		await expect(fullscreen).toBeVisible();
	}
});

test('small viewports retain the scene and keep the sheet dismissible', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto(`${path}?v=1&scene=landing&seed=landing-12`);
	const painting = canvas(page);
	await expect(painting).toBeVisible();
	const controls = page.getByRole('button', { name: 'Controls', exact: true });
	await expect(controls).toHaveAttribute('aria-expanded', 'false');
	await controls.click();
	const close = page.getByRole('button', { name: 'Close controls' });
	await expect(close).toBeFocused();
	await expect
		.poll(async () => {
			const image = await painting.boundingBox();
			const sheet = await page.getByRole('region', { name: 'Paint controls' }).boundingBox();
			return Boolean(image && sheet && image.y + image.height <= sheet.y + 1);
		})
		.toBe(true);
	await page.getByRole('button', { name: 'More settings' }).click();
	await expect(page.getByRole('button', { name: 'Save image' })).toBeInViewport();
	await expect(close).toBeInViewport();
	await page.keyboard.press('Escape');
	await expect(controls).toBeFocused();
	for (const [width, height] of [
		[740, 320],
		[768, 1024],
		[1600, 900],
		[380, 440]
	]) {
		await page.setViewportSize({ width, height });
		await expect(painting).toHaveAttribute('data-seed', 'landing-12');
		await expect(page.getByRole('button', { name: 'Save image' })).toBeInViewport();
		await expect
			.poll(async () => {
				const bounds = await painting.boundingBox();
				return [Math.round(bounds?.width ?? 0), Math.round(bounds?.height ?? 0)];
			})
			.toEqual([width, height]);
	}
});
