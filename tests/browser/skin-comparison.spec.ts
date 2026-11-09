import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const route = '/blog/visualizations/a-skin-that-paints-itself';
const evidenceDir = process.env.SKIN_COMPARISON_EVIDENCE;
const specimen = (page: Page) => page.getByTestId('skin-comparison').filter({ visible: true });
const formationTime = (page: Page) => specimen(page).getByTestId('skin-formed-time');
const fittedTime = (page: Page) => specimen(page).getByTestId('skin-fitted-time');

async function openInstrument(page: Page, query = '') {
	await page.route('**/_vercel/**', (request) =>
		request.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
	);
	await page.goto(`${route}${query}`);
	const instrument = page.getByTestId('skin-instrument');
	await instrument.scrollIntoViewIfNeeded();
	return instrument;
}

async function canvasImages(page: Page) {
	return specimen(page)
		.locator('canvas:visible')
		.evaluateAll((canvases) => canvases.map((canvas) => (canvas as HTMLCanvasElement).toDataURL()));
}

test('the computed opening survives hydration; keyboard changes reject stale widths', async ({
	page
}) => {
	const failures: string[] = [];
	page.on('pageerror', (error) => failures.push(error.message));
	page.on('requestfailed', (request) => {
		if (request.url().includes('a-skin-that-paints-itself')) failures.push(request.url());
	});
	const instrument = await openInstrument(page);
	await expect(
		page.getByRole('heading', { level: 1, name: 'A Skin That Paints Itself' })
	).toBeVisible();
	const width = instrument.getByRole('slider', { name: /width/i });
	await expect(width).toHaveValue('24');
	await expect(specimen(page)).toHaveAttribute('data-displayed-width', '24');
	await width.focus();
	await expect(width).toBeFocused();
	await width.press('ArrowRight');
	await width.press('ArrowRight');
	await width.press('End');
	await expect(width).toHaveValue('100');
	await expect(specimen(page)).toHaveAttribute('data-displayed-width', '24');
	await expect(specimen(page)).toHaveAttribute('data-displayed-width', '100');
	const broad = await canvasImages(page);
	expect(broad).toHaveLength(2);
	expect(broad[0]).toEqual(broad[1]);

	await instrument.getByRole('button', { name: 'Tapered patch' }).click();
	await expect(specimen(page)).toHaveAttribute('data-displayed-shape', 'tapered');
	await expect(specimen(page)).toHaveAttribute('data-displayed-width', '80');
	const taper = await canvasImages(page);
	expect(taper).toHaveLength(2);
	expect(taper[0]).not.toEqual(taper[1]);
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await canvasImages(page)).toEqual(taper);
	await instrument.getByRole('button', { name: 'Reset example' }).click();
	await expect(specimen(page)).toHaveAttribute('data-displayed-width', '24');
	await expect(specimen(page)).toHaveAttribute('data-displayed-seed', '1952');
	await expect(formationTime(page)).toContainText('60');
	expect(failures).toEqual([]);
});

test('replay pauses independently of the saved snapshot; display and chemistry controls have separate effects', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const instrument = await openInstrument(page);
	await expect(formationTime(page)).toContainText('60');
	await instrument.getByRole('button', { name: 'Replay formation' }).click();
	const pause = instrument.getByRole('button', { name: 'Pause', exact: true });
	await expect(pause).toBeEnabled();
	await pause.click();
	const paused = await formationTime(page).textContent();
	expect(paused).not.toContain('60');
	await expect(fittedTime(page)).toContainText('60');
	await page.waitForTimeout(500);
	await expect(formationTime(page)).toHaveText(paused ?? '');
	await instrument.getByRole('button', { name: 'Resume', exact: true }).click();
	await expect(formationTime(page)).toContainText('60');

	await instrument.getByText('Explore the signals and settings', { exact: true }).click();
	const pigment = await canvasImages(page);
	await instrument.getByRole('button', { name: 'Inhibitor signal', exact: true }).click();
	await expect(formationTime(page)).toContainText('60');
	await expect(specimen(page)).toHaveAttribute('data-displayed-seed', '1952');
	await expect.poll(() => canvasImages(page)).not.toEqual(pigment);
	const oldField = await canvasImages(page);
	await instrument.getByRole('button', { name: 'Spots', exact: true }).click();
	await expect(specimen(page)).toHaveAttribute('data-displayed-appearance', 'spots');
	const newField = await canvasImages(page);
	expect(newField[1]).not.toEqual(oldField[1]);
});

test('fallback works with canvas disabled and when the worker cannot start', async ({ page }) => {
	let instrument = await openInstrument(page, '?canvas=off');
	await expect(instrument.getByTestId('skin-static-fallback')).toBeVisible();
	await expect(instrument.getByRole('slider')).toHaveCount(0);
	await expect(specimen(page).locator('img')).toHaveCount(2);
	await page.addInitScript(() => {
		window.Worker = class {
			constructor() {
				throw new Error('Test: worker unavailable');
			}
		} as unknown as typeof Worker;
	});
	instrument = await openInstrument(page);
	await instrument.getByRole('button', { name: 'Tapered patch' }).click();
	await expect(instrument.getByRole('status')).toContainText(/couldn.t|failed|unavailable/i);
	await expect(specimen(page)).toHaveAttribute('data-displayed-width', '24');
	await expect(specimen(page).locator('img:visible')).toHaveCount(2);
});

test('SSR gives both labeled panels with JavaScript disabled', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
	try {
		const page = await context.newPage();
		await page.goto(route);
		await expect(page.getByTestId('skin-static-fallback')).toBeVisible();
		await expect(
			specimen(page).getByRole('heading', { name: 'Formed on this shape', exact: true })
		).toBeVisible();
		await expect(
			specimen(page).getByRole('heading', {
				name: 'Finished pattern fitted to this shape',
				exact: true
			})
		).toBeVisible();
		const images = specimen(page).locator('img');
		await expect(images).toHaveCount(2);
		await expect
			.poll(() =>
				images.evaluateAll((elements) =>
					elements.every((el) => (el as HTMLImageElement).naturalWidth > 0)
				)
			)
			.toBe(true);
	} finally {
		await context.close();
	}
});

test('an offscreen or hidden experiment pauses work and navigation releases its worker', async ({
	page
}) => {
	await page.addInitScript(() => {
		const Original = window.Worker;
		const events: string[] = [];
		Object.assign(window, { __skinWorkerEvents: events });
		window.Worker = class extends Original {
			postMessage(message: { type: string; active?: boolean }) {
				if (message.type === 'active') events.push(String(message.active));
				super.postMessage(message);
			}
			terminate() {
				events.push('terminate');
				super.terminate();
			}
		};
	});
	const instrument = await openInstrument(page);
	const workerEvents = () =>
		page.evaluate(() => (window as unknown as { __skinWorkerEvents: string[] }).__skinWorkerEvents);
	await instrument.getByRole('button', { name: 'Replay formation' }).click();
	await expect(instrument.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	await page.evaluate(() =>
		window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
	);
	await expect.poll(async () => (await workerEvents()).at(-1)).toBe('false');
	const offscreenTime = await formationTime(page).textContent();
	await page.waitForTimeout(500);
	await expect(formationTime(page)).toHaveText(offscreenTime ?? '');
	await instrument.scrollIntoViewIfNeeded();
	await expect.poll(async () => (await workerEvents()).at(-1)).toBe('true');
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: true });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect.poll(async () => (await workerEvents()).at(-1)).toBe('false');
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: false });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect.poll(async () => (await workerEvents()).at(-1)).toBe('true');
	await page.locator('a[href="/blog/visualizations/how-spots-and-stripes-form"]').first().click();
	await expect(page).toHaveURL(/\/how-spots-and-stripes-form$/);
	await expect.poll(workerEvents).toContain('terminate');
});

test('canvas failure and print both retain the saved comparison', async ({ page }) => {
	const instrument = await openInstrument(page);
	await expect(instrument.getByRole('slider')).toBeVisible();
	await page.emulateMedia({ media: 'print' });
	await expect(instrument.getByRole('slider')).toBeHidden();
	await expect(specimen(page).locator('img:visible')).toHaveCount(2);
	await page.emulateMedia({ media: 'screen' });
	await page.addInitScript(() => {
		HTMLCanvasElement.prototype.getContext = (() =>
			null) as typeof HTMLCanvasElement.prototype.getContext;
	});
	await page.reload();
	await instrument.scrollIntoViewIfNeeded();
	await expect(instrument.getByRole('status')).toContainText(
		'interactive experiment is unavailable'
	);
	await expect(specimen(page).locator('img:visible')).toHaveCount(2);
});

for (const width of [320, 390, 768, 1024, 1440]) {
	test(`both panels fit at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 1000 });
		const instrument = await openInstrument(page);
		await expect(instrument.getByRole('slider', { name: /width/i })).toBeVisible();
		const panels = specimen(page).locator('figure');
		await expect(panels).toHaveCount(2);
		const first = await panels.nth(0).boundingBox();
		const second = await panels.nth(1).boundingBox();
		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		expect(Math.abs(first!.width - second!.width)).toBeLessThan(2);
		if (width <= 390) expect(second!.y).toBeGreaterThan(first!.y);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
		const button = instrument.getByRole('button', { name: 'Replay formation' });
		expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
		if (evidenceDir) {
			await mkdir(evidenceDir, { recursive: true });
			await instrument.screenshot({
				path: join(evidenceDir, `skin-comparison-${width}.png`),
				style: 'header.site-header, [data-privacy-note] { visibility: hidden !important; }'
			});
		}
	});
}

test('dragging previews the requested outline and submits only the released width', async ({
	page
}) => {
	await page.addInitScript(() => {
		const Original = window.Worker;
		const widths: number[] = [];
		Object.assign(window, { __skinRequestedWidths: widths });
		window.Worker = class extends Original {
			postMessage(message: { type: string; settings?: { widthPercent: number } }) {
				if (message.type === 'calculate' && message.settings) {
					widths.push(message.settings.widthPercent);
				}
				super.postMessage(message);
			}
		};
	});
	const instrument = await openInstrument(page);
	const slider = instrument.getByRole('slider', { name: /width/i });
	await slider.scrollIntoViewIfNeeded();
	const outline = instrument.locator('.skin-outline-target');
	const initialOutline = await outline.getAttribute('d');
	const bounds = (await slider.boundingBox())!;
	const y = bounds.y + bounds.height / 2;
	const calculatedWidths = () =>
		page.evaluate(
			() => (window as unknown as { __skinRequestedWidths: number[] }).__skinRequestedWidths
		);

	await page.mouse.move(bounds.x + 11, y);
	await page.mouse.down();
	await page.mouse.move(bounds.x + bounds.width * 0.7, y, { steps: 7 });
	const requested = await slider.inputValue();
	expect(requested).not.toBe('24');
	await expect(outline).not.toHaveAttribute('d', initialOutline ?? '');
	await expect(specimen(page)).toHaveAttribute('data-displayed-width', '24');
	await expect(specimen(page).getByText('Previous result · 24% width')).toHaveCount(2);
	await page.waitForTimeout(300);
	expect(await calculatedWidths()).toEqual([]);

	await page.mouse.up();
	await expect(specimen(page)).toHaveAttribute('data-displayed-width', requested);
	expect(await calculatedWidths()).toEqual([Number(requested)]);
});
