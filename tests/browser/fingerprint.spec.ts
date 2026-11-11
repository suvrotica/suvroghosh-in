import { expect, test, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';

const articlePath = '/blog/visualizations/how-fingerprints-form';
const heading = 'How fingerprints form';

async function openLab(page: Page) {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
}

async function dismissPrivacyNotice(page: Page) {
	const privacyNotice = page.getByRole('button', {
		name: 'Dismiss privacy notice without choosing',
		exact: true
	});
	if (await privacyNotice.isVisible()) await privacyNotice.click();
}

function button(page: Page, name: string) {
	return page.getByTestId('fingerprint-instrument').getByRole('button', { name, exact: true });
}

async function canvasPng(canvas: Locator) {
	return canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL('image/png'));
}

async function expectReady(page: Page) {
	await openLab(page);
	await expect(button(page, 'Save image')).toBeEnabled();
	await dismissPrivacyNotice(page);
	return {
		status: page.getByTestId('fingerprint-status'),
		current: page.getByTestId('fingerprint-current'),
		canvas: page.getByTestId('fingerprint-current').getByTestId('fingerprint-canvas'),
		progress: page.getByRole('progressbar', { name: 'Simulation time' })
	};
}

test('the canonical article includes the experiment and companion post in its server HTML', async ({
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.status()).toBe(200);
	const html = await response.text();
	const origin = process.env.FINGERPRINT_CANONICAL_ORIGIN ?? 'https://www.suvroghosh.in';
	expect(html.match(/<link rel="canonical" href="([^"]+)"/u)?.[1]).toBe(origin + articlePath);
	expect(html.match(/<meta property="og:image" content="([^"]+)"/u)?.[1]).toBe(
		origin + '/images/visualizations/how-fingerprints-form/social.png'
	);
	expect(html.match(/<h1\b/gu)).toHaveLength(1);
	expect(html.match(/<h1\b[^>]*>([^<]*)<\/h1>/u)?.[1].trim()).toBe(heading);
	const normalized = html.replace(/\s+/gu, ' ');
	for (const text of [
		'/images/visualizations/how-fingerprints-form/loop.png',
		'The print above is a stored example.',
		'How a fingerprint forms',
		'10.1016/j.cell.2023.01.015',
		'10.1016/j.cell.2021.12.008',
		'10.1098/rstb.1952.0012'
	]) {
		expect(normalized.includes(text), `Server-rendered article should include "${text}".`).toBe(
			true
		);
	}
});

test('keyboard spacing changes the solved print, preserving the comparison and export pixels', async ({
	page
}) => {
	// Deliberately use the readable text fallback for settings, independent of browser permissions.
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', { value: undefined });
	});
	const { status, current, canvas } = await expectReady(page);
	const lab = page.getByTestId('fingerprint-instrument');
	const bounds = await lab.boundingBox();
	expect(bounds?.width ?? 0).toBeGreaterThan(1000);
	expect(Math.abs((bounds?.x ?? 0) + (bounds?.width ?? 0) / 2 - 720)).toBeLessThan(8);
	const reference = await canvasPng(canvas);
	const settingsText = page.getByRole('textbox', { name: 'Settings to copy' });
	await button(page, 'Copy settings').click();
	const original = JSON.parse(await settingsText.inputValue());
	expect(original.settings.preset).toBe('loop');
	expect(original.settings.spacing).toBe(1);
	expect(original.numerical.mesh.columns).toBeGreaterThan(100);
	expect(original.numerical.timeStep).toBeGreaterThan(0);
	await button(page, 'Keep for comparison').click();

	const spacing = page.getByRole('slider', { name: 'Ridge spacing' });
	const wider = await spacing.getAttribute('max');
	expect(Number(wider)).toBeGreaterThan(1);
	await spacing.press('End');
	await expect(spacing).toHaveValue(wider!);
	await expect(status).toHaveText('Simulation finished');
	await expect(current).toContainText(`Now · Loop · ${Number(wider).toFixed(2)}× spacing`);
	const widerPrint = await canvasPng(canvas);
	expect(widerPrint === reference).toBe(false);
	const comparison = page.getByTestId('fingerprint-comparison');
	await expect(comparison).toContainText('Before · Loop · 1.00× spacing');
	expect((await canvasPng(comparison.getByTestId('fingerprint-canvas'))) === reference).toBe(true);

	await button(page, 'Copy settings').click();
	const changed = JSON.parse(await settingsText.inputValue());
	expect(changed.settings).toEqual({ ...original.settings, spacing: Number(wider) });
	expect(changed.surface).toEqual(original.surface);
	expect(changed.diffusion.activator).toBeCloseTo(Number(wider) ** 2, 8);
	expect(changed.diffusion.inhibitor / changed.diffusion.activator).toBeCloseTo(180, 8);

	await button(page, 'Signal').click();
	await expect(current.getByRole('img')).toHaveAccessibleName(/activator signal/iu);
	await expect(page.getByText('High signal', { exact: true })).toBeVisible();
	expect((await canvasPng(canvas)) === widerPrint).toBe(false);
	await button(page, 'Print').click();
	await expect(current.getByRole('img')).toHaveAccessibleName(/preset print/iu);
	expect((await canvasPng(canvas)) === widerPrint).toBe(true);

	const downloadPromise = page.waitForEvent('download');
	await button(page, 'Save image').click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe(
		`synthetic-fingerprint-loop-${changed.settings.seed}-print.png`
	);
	const imagePath = await download.path();
	expect(imagePath).not.toBeNull();
	const displayBytes = Buffer.from(widerPrint.split(',')[1], 'base64');
	const display = await sharp(displayBytes)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const { width, height } = display.info;
	const exported = sharp(imagePath!);
	const metadata = await exported.metadata();
	expect(metadata.width).toBe(width);
	expect(metadata.height ?? 0).toBeGreaterThan(height);
	const exportedPrint = await exported
		.extract({ left: 0, top: 0, width, height })
		.ensureAlpha()
		.raw()
		.toBuffer();
	expect(exportedPrint.equals(display.data)).toBe(true);
});

test('reduced motion opens on a still and explicit formation can pause, continue and replay', async ({
	page
}) => {
	const { status, canvas, progress } = await expectReady(page);
	const instrument = page.getByTestId('fingerprint-instrument');
	await expect(status).toHaveText('Solved Loop example');
	const finalTime = Number(await progress.getAttribute('max'));
	const simulationTime = async () => Number(await progress.getAttribute('value'));
	expect(await simulationTime()).toBe(finalTime);
	await expect(button(page, 'Show formation')).toBeEnabled();
	await button(page, 'Show formation').click();
	await expect.poll(simulationTime).toBeLessThan(finalTime);
	await button(page, 'Pause').click();
	await expect(status).toHaveText('Paused');
	const pausedTime = await simulationTime();
	// Allow more than two frame publication intervals to catch accidental advancement while paused.
	await page.waitForTimeout(240);
	expect(await simulationTime()).toBe(pausedTime);
	await button(page, 'Continue').click();

	// Leave room to scroll well beyond the experiment on both the full article and a feature preview.
	await page.evaluate(() => {
		const spacer = document.createElement('div');
		spacer.setAttribute('aria-hidden', 'true');
		spacer.style.height = '150vh';
		document.body.append(spacer);
		spacer.scrollIntoView({ block: 'end', behavior: 'instant' });
	});
	await expect(instrument).not.toBeInViewport();
	await page.waitForTimeout(120);
	const offscreenTime = await simulationTime();
	expect(offscreenTime).toBeLessThan(finalTime);
	await page.waitForTimeout(240);
	expect(await simulationTime()).toBe(offscreenTime);
	await instrument.scrollIntoViewIfNeeded();
	await expect.poll(simulationTime).toBeGreaterThan(offscreenTime);
	await expect(status).toHaveText('Simulation finished');
	const first = await canvasPng(canvas);
	const start = performance.now();
	await button(page, 'Replay formation').click();
	await expect(status).toHaveText('Forming ridges…');
	await expect.poll(simulationTime).toBeLessThan(finalTime);
	await expect.poll(simulationTime, { intervals: [50, 100, 150] }).toBeGreaterThanOrEqual(450);
	const midRun = performance.now();
	await expect(status).toHaveText('Simulation finished');
	test.info().annotations.push({
		type: 'timing',
		description: `Replay reached t=450 in ${((midRun - start) / 1000).toFixed(2)} s and finished in ${((performance.now() - start) / 1000).toFixed(2)} s.`
	});
	expect((await canvasPng(canvas)) === first).toBe(true);
});

test('new variation changes only the seed and reset restores the saved Loop example', async ({
	page
}) => {
	const { status, canvas } = await expectReady(page);
	const reference = await canvasPng(canvas);
	await page.getByText('More controls', { exact: true }).click();
	const controls = [
		page.getByRole('slider', { name: 'Ridge spacing' }),
		page.getByRole('slider', { name: 'Starting position' }),
		page.getByRole('slider', { name: 'Wave timing' }),
		page.getByRole('slider', { name: 'Fingertip width' }),
		page.getByRole('slider', { name: 'Small initial differences' })
	];
	const values = await Promise.all(controls.map((control) => control.inputValue()));
	const variation = page.getByRole('spinbutton', { name: 'Variation number' });
	const seed = await variation.inputValue();
	await button(page, 'New variation').click();
	await expect(variation).not.toHaveValue(seed);
	await expect(button(page, 'Loop')).toHaveAttribute('aria-pressed', 'true');
	expect(await Promise.all(controls.map((control) => control.inputValue()))).toEqual(values);
	await button(page, 'Reset').click();
	await expect(status).toHaveText('Solved Loop example');
	await page.getByText('More controls', { exact: true }).click();
	await expect(variation).toHaveValue(seed);
	expect((await canvasPng(canvas)) === reference).toBe(true);
});

test('mobile keeps the print, controls and playback in order and switches between Before and Now', async ({
	page
}) => {
	await page.setViewportSize({ width: 375, height: 820 });
	const { status, current, canvas } = await expectReady(page);
	const printBox = await canvas.boundingBox();
	const controlsBox = await page.getByRole('slider', { name: 'Ridge spacing' }).boundingBox();
	const playbackBox = await button(page, 'New variation').boundingBox();
	expect(printBox).not.toBeNull();
	expect(controlsBox).not.toBeNull();
	expect(playbackBox).not.toBeNull();
	expect(printBox!.x).toBeGreaterThanOrEqual(0);
	expect(printBox!.x + printBox!.width).toBeLessThanOrEqual(375);
	expect(printBox!.y).toBeLessThan(controlsBox!.y);
	expect(controlsBox!.y).toBeLessThan(playbackBox!.y);
	expect(playbackBox!.height).toBeGreaterThanOrEqual(44);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
	await button(page, 'Keep for comparison').click();
	const comparison = page.getByTestId('fingerprint-comparison');
	await expect(current).toBeVisible();
	await expect(comparison).toBeHidden();
	const before = button(page, 'Before');
	await before.evaluate((element) =>
		element.scrollIntoView({ block: 'center', behavior: 'instant' })
	);
	await before.click();
	await expect(comparison).toBeVisible();
	await expect(current).toBeHidden();
	await button(page, 'Now').click();
	await expect(comparison).toBeHidden();
	await expect(current).toBeVisible();

	const position = page.getByRole('slider', { name: 'Starting position' });
	await button(page, 'Arch').click();
	await expect(position).toBeDisabled();
	await expect(page.getByText('This arch begins at the edges.', { exact: true })).toBeVisible();
	await button(page, 'Whorl').click();
	await expect(position).toBeEnabled();
	await position.press('Home');
	await position.press('End');
	await expect(position).toHaveValue((await position.getAttribute('max'))!);
	const timing = page.getByRole('slider', { name: 'Wave timing' });
	const onset = Number((await timing.getAttribute('aria-valuetext'))?.match(/\d+$/u)?.[0]);
	await timing.press('End');
	const later = Number(await timing.inputValue());
	expect(later).toBeGreaterThan(0);
	await expect(timing).toHaveAttribute(
		'aria-valuetext',
		`Crease starts at model time ${onset + later}`
	);
	await page.getByRole('checkbox', { name: 'Show starting regions' }).check();
	await expect(status).toHaveText('Simulation finished');
	await expect(current.getByRole('img')).toHaveAccessibleName('Synthetic Whorl preset print');
	await expect(current.getByText('Pad', { exact: true })).toBeVisible();
	await expect(comparison).toContainText('Before · Loop');
});

test('a missing Canvas2D renderer keeps the stored example and disables simulation controls', async ({
	page
}) => {
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
			value(this: HTMLCanvasElement, type: string, ...options: unknown[]) {
				return type === '2d' ? null : Reflect.apply(original, this, [type, ...options]);
			}
		});
	});
	await openLab(page);
	await expect(
		page.getByText('This browser cannot run the experiment.', { exact: false })
	).toBeVisible();
	await dismissPrivacyNotice(page);
	const example = page.getByTestId('fingerprint-current').getByRole('img');
	await expect(example).toBeVisible();
	await expect
		.poll(() => example.evaluate((element) => (element as HTMLImageElement).naturalWidth))
		.toBeGreaterThan(0);
	await expect(button(page, 'New variation')).toBeDisabled();
	await expect(page.getByRole('slider', { name: 'Ridge spacing' })).toBeDisabled();
});
