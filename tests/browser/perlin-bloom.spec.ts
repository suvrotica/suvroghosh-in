import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/thinking-outside-the-box';
const listingPath = '/blog/visualizations';
const posterPath = '/images/thinking-outside-the-box-perlin-flower.png';
const posterAlt =
	'A luminous violet and cyan procedural flower forcing translucent petals through a glass square in deep space';
const fixedPath = `${articlePath}?pb_v=1&pb_seed=outside-1847&pb_preset=neon-orchid&pb_motion=0&pb_view=artwork`;
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10] as const;

function exhibit(page: Page): Locator {
	return page.getByTestId('perlin-bloom-exhibit');
}

function host(page: Page): Locator {
	return page.getByTestId('perlin-bloom-p5-host');
}

function bloomCanvas(page: Page): Locator {
	return page.getByTestId('perlin-bloom-canvas');
}

function diagnostics(page: Page): string[] {
	const messages: string[] = [];
	page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() !== 'error' && message.type() !== 'warning') return;
		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/') || /favicon/iu.test(source)) return;
		messages.push(`console ${message.type()}: ${message.text()}`);
	});
	return messages;
}

async function waitForEngineSync(page: Page): Promise<void> {
	await expect
		.poll(async () => {
			const canvas = bloomCanvas(page);
			const expected = (await host(page).getAttribute('data-morphology-hash')) ?? '';
			const geometry = (await canvas.getAttribute('data-geometry-hash')) ?? '';
			const morphology = (await canvas.getAttribute('data-morphology-hash')) ?? '';
			return expected === geometry && expected === morphology ? expected : '';
		})
		.toMatch(/^pb1-[a-f\d]{8}$/u);
}

async function waitForBloom(
	page: Page,
	path = fixedPath,
	options: { scroll?: boolean } = {}
): Promise<Locator> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	return waitForCurrentBloom(page, options);
}

async function waitForCurrentBloom(
	page: Page,
	options: { scroll?: boolean } = {}
): Promise<Locator> {
	const root = exhibit(page);
	await expect(root).toHaveCount(1);
	if (options.scroll !== false) await root.scrollIntoViewIfNeeded();
	await expect(root).toBeVisible();
	await expect(host(page)).toBeVisible();
	await expect(bloomCanvas(page)).toHaveCount(1, { timeout: 45_000 });
	await expect(bloomCanvas(page)).toBeVisible();
	await expect(host(page)).toHaveClass(/\bready\b/u, { timeout: 45_000 });
	await expect(bloomCanvas(page)).toHaveAttribute('data-ready', 'true');
	await expect(bloomCanvas(page)).toHaveAttribute('data-renderer', 'canvas-2d');
	await expect
		.poll(async () => Number((await bloomCanvas(page).getAttribute('data-frame-count')) ?? 0))
		.toBeGreaterThanOrEqual(1);
	await expect
		.poll(async () => (await host(page).getAttribute('data-morphology-hash')) ?? '')
		.toMatch(/^[a-z0-9_-]{6,}$/iu);
	await waitForEngineSync(page);
	return root;
}

async function morphologyHash(page: Page): Promise<string> {
	return (await host(page).getAttribute('data-morphology-hash')) ?? '';
}

async function bytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

function pngDimensions(png: Buffer): { width: number; height: number } {
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

async function installClipboardCapture(page: Page): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (value: string) => {
					Reflect.set(window, '__perlinBloomCopiedLink', value);
				}
			}
		});
	});
}

async function openControlsSection(root: Locator, name: string): Promise<void> {
	const summary = root
		.getByTestId('perlin-bloom-controls')
		.locator('details > summary')
		.filter({ hasText: new RegExp(`^\\s*${name}\\b`, 'iu') })
		.first();
	const details = summary.locator('..');
	if ((await details.getAttribute('open')) === null) await summary.click();
	await expect(details).toHaveAttribute('open', '');
}

test('SSR preview hydrates into one deterministic p5 canvas without diagnostics', async ({
	page,
	request
}) => {
	const response = await request.get(fixedPath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('data-testid="perlin-bloom-exhibit"');
	expect(html).toContain('data-testid="perlin-bloom-p5-host"');
	expect(html).not.toContain('<canvas');
	const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/iu)?.[1] ?? '';
	expect(canonical).toMatch(/\/blog\/visualizations\/thinking-outside-the-box\/?$/u);
	expect(canonical).not.toContain('pb_');

	const runtimeMessages = diagnostics(page);
	await waitForBloom(page);
	await expect(bloomCanvas(page)).toHaveCount(1);
	await expect(bloomCanvas(page)).toHaveAttribute('role', 'img');
	await expect(bloomCanvas(page)).toHaveAttribute('tabindex', '0');
	await expect(bloomCanvas(page)).toHaveAttribute('aria-label', /Perlin|bloom|flower/iu);
	const describedBy = await bloomCanvas(page).getAttribute('aria-describedby');
	expect(describedBy).toBeTruthy();
	await expect(page.locator(`#${describedBy}`)).toHaveAttribute(
		'data-testid',
		'perlin-bloom-summary'
	);
	expect(
		await bloomCanvas(page).evaluate((canvas) =>
			canvas instanceof HTMLCanvasElement ? Boolean(canvas.getContext('2d')) : false
		)
	).toBe(true);
	await expect(exhibit(page).locator('[data-testid="perlin-bloom-summary"]')).toContainText(
		/outside-1847/iu
	);
	expect(runtimeMessages).toEqual([]);
});

test('seeded morphology survives reload and resize; New bloom changes it; Reset restores it', async ({
	page
}) => {
	const runtimeMessages = diagnostics(page);
	const root = await waitForBloom(page);
	const fixedHash = await morphologyHash(page);

	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForCurrentBloom(page);
	await expect(host(page)).toHaveAttribute('data-morphology-hash', fixedHash);
	await waitForEngineSync(page);

	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 768, height: 1024 },
		{ width: 1024, height: 768 },
		{ width: 1440, height: 900 },
		{ width: 1920, height: 1080 }
	]) {
		await page.setViewportSize(viewport);
		await expect(bloomCanvas(page)).toHaveCount(1);
		await expect(host(page)).toHaveAttribute('data-morphology-hash', fixedHash);
		const bounds = await bloomCanvas(page).boundingBox();
		expect(bounds?.width ?? 0).toBeGreaterThan(280);
		expect(bounds?.height ?? 0).toBeGreaterThan(280);
	}

	await root.getByRole('button', { name: /New bloom|Surprise me/iu }).click();
	await expect.poll(() => morphologyHash(page)).not.toBe(fixedHash);
	await waitForEngineSync(page);
	await openControlsSection(root, 'Output');
	await root.getByRole('button', { name: /Reset/iu }).click();
	await expect(host(page)).toHaveAttribute('data-morphology-hash', fixedHash);
	await waitForEngineSync(page);
	await expect(bloomCanvas(page)).toHaveCount(1);
	expect(runtimeMessages).toEqual([]);
});

test('URL state repairs invalid values, preserves unrelated parameters, and restores on history navigation', async ({
	page
}) => {
	await installClipboardCapture(page);
	const runtimeMessages = diagnostics(page);
	const invalid = `${articlePath}?utm_source=observatory&pb_v=1&pb_seed=%20&pb_preset=missing&pb_p=999&pb_w=-4&pb_warp=NaN&pb_box=Infinity`;
	const root = await waitForBloom(page, invalid);
	await expect(root.getByRole('slider', { name: /^Petals\b/iu })).toHaveValue('32');
	await expect(root.getByRole('slider', { name: /^Whorls\b/iu })).toHaveValue('1');

	await openControlsSection(root, 'Output');
	await root.getByRole('button', { name: /Copy.*link/iu }).click();
	const copied = await page.evaluate(() =>
		String(Reflect.get(window, '__perlinBloomCopiedLink') ?? '')
	);
	expect(copied).toContain('utm_source=observatory');
	expect(copied).toContain('pb_v=1');
	await expect(root.getByTestId('perlin-bloom-status')).toContainText(/copied|address bar/iu);

	const firstHash = await morphologyHash(page);
	await root.getByRole('button', { name: /New bloom|Surprise me/iu }).click();
	await expect.poll(() => morphologyHash(page)).not.toBe(firstHash);
	await waitForEngineSync(page);
	const secondHash = await morphologyHash(page);
	expect(secondHash).not.toBe(firstHash);
	await page.goBack({ waitUntil: 'domcontentloaded' });
	await expect(host(page)).toHaveAttribute('data-morphology-hash', firstHash);
	await waitForEngineSync(page);

	await waitForBloom(page, copied);
	await expect(host(page)).toHaveAttribute('data-morphology-hash', firstHash);
	await expect(page).toHaveURL(/utm_source=observatory/u);
	const petals = exhibit(page).getByRole('slider', { name: /^Petals\b/iu });
	await petals.fill('17');
	await expect(page).toHaveURL(/pb_p=17/u);
	await waitForEngineSync(page);
	const editedHash = await morphologyHash(page);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForCurrentBloom(page);
	await expect(exhibit(page).getByRole('slider', { name: /^Petals\b/iu })).toHaveValue('17');
	await expect(host(page)).toHaveAttribute('data-morphology-hash', editedHash);
	await waitForEngineSync(page);
	expect(runtimeMessages).toEqual([]);
});

test('palette-only changes preserve morphology while rupture threshold remains shareable geometry', async ({
	page
}) => {
	const runtimeMessages = diagnostics(page);
	const root = await waitForBloom(page);
	const initialHash = await morphologyHash(page);
	const initialConfigHash = await bloomCanvas(page).getAttribute('data-config-hash');
	const beforePalette = await bloomCanvas(page).screenshot();

	await openControlsSection(root, 'Light');
	const palette = root.getByRole('combobox', { name: /Light palette/iu });
	await palette.selectOption('reactor-lotus');
	await expect(page).toHaveURL(/pb_palette=reactor-lotus/u);
	await expect(host(page)).toHaveAttribute('data-morphology-hash', initialHash);
	await waitForEngineSync(page);
	await expect
		.poll(() => bloomCanvas(page).getAttribute('data-config-hash'))
		.not.toBe(initialConfigHash);
	expect((await bloomCanvas(page).screenshot()).equals(beforePalette)).toBe(false);

	await openControlsSection(root, 'Boundary');
	await root.getByRole('slider', { name: /Rupture threshold/iu }).fill('0.08');
	await expect(page).toHaveURL(/pb_rupture=0.08/u);
	await expect.poll(() => morphologyHash(page)).not.toBe(initialHash);
	await waitForEngineSync(page);
	const thresholdHash = await morphologyHash(page);

	await page.reload({ waitUntil: 'domcontentloaded' });
	const reloadedRoot = await waitForCurrentBloom(page);
	await openControlsSection(reloadedRoot, 'Light');
	await openControlsSection(reloadedRoot, 'Boundary');
	await expect(reloadedRoot.getByRole('combobox', { name: /Light palette/iu })).toHaveValue(
		'reactor-lotus'
	);
	await expect(reloadedRoot.getByRole('slider', { name: /Rupture threshold/iu })).toHaveValue(
		'0.08'
	);
	await expect(host(page)).toHaveAttribute('data-morphology-hash', thresholdHash);
	await waitForEngineSync(page);
	expect(runtimeMessages).toEqual([]);
});

test('reduced motion starts still while controls, anatomy mode, and shortcuts remain accessible', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const runtimeMessages = diagnostics(page);
	const root = await waitForBloom(page, `${articlePath}?pb_v=1&pb_seed=outside-1847`);
	await expect(host(page)).toHaveAttribute('data-motion', 'still');
	await expect(bloomCanvas(page)).toHaveAttribute('data-motion', 'still');
	const initialFrame = Number(await bloomCanvas(page).getAttribute('data-frame-count'));
	await page.waitForTimeout(300);
	expect(Number(await bloomCanvas(page).getAttribute('data-frame-count'))).toBe(initialFrame);

	const resume = root.getByRole('button', { name: /Play|Resume|Enable motion/iu });
	await resume.click();
	await expect(host(page)).toHaveAttribute('data-motion', /alive|moving|animate|live/iu);
	await expect(bloomCanvas(page)).toHaveAttribute('data-motion', 'alive');
	await expect
		.poll(async () => Number(await bloomCanvas(page).getAttribute('data-frame-count')))
		.toBeGreaterThan(initialFrame);
	await root.getByRole('button', { name: /Pause/iu }).click();
	await expect(host(page)).toHaveAttribute('data-motion', 'still');
	await expect(bloomCanvas(page)).toHaveAttribute('data-motion', 'still');
	await page.waitForTimeout(150);
	const pausedFrame = Number(await bloomCanvas(page).getAttribute('data-frame-count'));
	const beforePointer = await bloomCanvas(page).screenshot();
	const canvasBounds = await bloomCanvas(page).boundingBox();
	expect(canvasBounds).not.toBeNull();
	await page.mouse.move(
		(canvasBounds?.x ?? 0) + (canvasBounds?.width ?? 1) * 0.78,
		(canvasBounds?.y ?? 0) + (canvasBounds?.height ?? 1) * 0.46
	);
	await page.mouse.down();
	await page.mouse.up();
	await page.waitForTimeout(180);
	const afterPointer = await bloomCanvas(page).screenshot();
	expect(afterPointer.equals(beforePointer)).toBe(false);
	await page.waitForTimeout(350);
	expect(Number(await bloomCanvas(page).getAttribute('data-frame-count'))).toBeGreaterThanOrEqual(
		pausedFrame
	);

	await root.getByRole('button', { name: 'Anatomy', exact: true }).click();
	await expect(host(page)).toHaveAttribute('data-view', 'anatomy');
	await bloomCanvas(page).focus();
	await page.keyboard.press('KeyA');
	await expect(host(page)).toHaveAttribute('data-view', 'artwork');

	const seed = root.locator('.seed-console').getByRole('textbox', { name: 'Seed', exact: true });
	await seed.focus();
	await seed.fill('typed-seed-a');
	await page.keyboard.press('KeyA');
	await expect(seed).toHaveValue('typed-seed-aa');
	await expect(host(page)).toHaveAttribute('data-view', 'artwork');
	expect(runtimeMessages).toEqual([]);
});

test('PNG export rerenders at true 1× and 2× dimensions with safe filenames', async ({ page }) => {
	const runtimeMessages = diagnostics(page);
	const root = await waitForBloom(page);
	await openControlsSection(root, 'Output');
	const scale = root.getByRole('combobox', { name: /Export scale/iu });

	await scale.selectOption('1');
	const firstPromise = page.waitForEvent('download');
	await root.getByRole('button', { name: /Save.*PNG|Save image/iu }).click();
	const firstDownload = await firstPromise;
	const first = await bytes(firstDownload);
	expect([...first.subarray(0, 8)]).toEqual(pngSignature);
	expect(firstDownload.suggestedFilename()).toBe(
		'perlin-bloom-neon-orchid-neon-orchid-outside-1847.png'
	);
	const repeatPromise = page.waitForEvent('download');
	await root.getByRole('button', { name: /Save.*PNG|Save image/iu }).click();
	const repeated = await bytes(await repeatPromise);
	expect(repeated.equals(first)).toBe(true);

	await scale.selectOption('2');
	const secondPromise = page.waitForEvent('download');
	await root.getByRole('button', { name: /Save.*PNG|Save image/iu }).click();
	const second = await bytes(await secondPromise);
	expect([...second.subarray(0, 8)]).toEqual(pngSignature);
	const one = pngDimensions(first);
	const two = pngDimensions(second);
	expect(two.width).toBeGreaterThan(one.width);
	expect(two.height).toBeGreaterThan(one.height);
	expect(two.width * two.height).toBeGreaterThan(one.width * one.height * 3.5);
	expect(runtimeMessages).toEqual([]);
});

test('mobile, zoom, site themes, and repeat navigation remain usable without duplicate canvases', async ({
	page
}) => {
	await page.setViewportSize({ width: 360, height: 800 });
	const runtimeMessages = diagnostics(page);
	const root = await waitForBloom(page, fixedPath, { scroll: false });
	const initialCanvas = await bloomCanvas(page).boundingBox();
	expect(initialCanvas).not.toBeNull();
	expect(initialCanvas?.y ?? 801).toBeLessThan(800);
	expect(Math.min(800, (initialCanvas?.y ?? 0) + (initialCanvas?.height ?? 0))).toBeGreaterThan(
		Math.max(0, initialCanvas?.y ?? 0) + 100
	);
	const mobile = await root.evaluate((element) => {
		const essential = [...element.querySelectorAll<HTMLElement>('button, summary, input, select')]
			.filter((control) => control.offsetParent !== null)
			.filter((control) =>
				/New bloom|Pause|Play|Save|Anatomy|Artwork|Seed/iu.test(
					control.getAttribute('aria-label') ?? control.textContent ?? ''
				)
			)
			.map((control) => {
				const box = control.getBoundingClientRect();
				return { width: box.width, height: box.height };
			});
		return {
			controlCount: essential.length,
			documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			exhibitOverflow: element.scrollWidth - element.clientWidth,
			undersized: essential.filter((control) => control.width < 43.5 || control.height < 43.5)
		};
	});
	expect(mobile.controlCount).toBeGreaterThanOrEqual(4);
	expect(mobile.documentOverflow).toBeLessThanOrEqual(1);
	expect(mobile.exhibitOverflow).toBeLessThanOrEqual(1);
	expect(mobile.undersized).toEqual([]);

	for (const theme of ['paper', 'light', 'night', 'high-contrast']) {
		const contrast = await root.evaluate((element, nextTheme) => {
			document.documentElement.dataset.theme = nextTheme;
			const control = element.querySelector<HTMLSelectElement>('select');
			if (!control) return null;
			const style = getComputedStyle(control);
			return {
				color: style.color,
				background: style.backgroundColor,
				border: Number.parseFloat(style.borderTopWidth)
			};
		}, theme);
		expect(contrast).not.toBeNull();
		expect(contrast?.color).not.toBe(contrast?.background);
		expect(contrast?.border ?? 0).toBeGreaterThanOrEqual(theme === 'high-contrast' ? 2 : 1);
	}

	// A 320 CSS-pixel layout is the reflow target produced by 200% browser zoom on a 640px viewport.
	await page.setViewportSize({ width: 320, height: 800 });
	await expect(bloomCanvas(page)).toBeVisible();
	const zoomed = await page.evaluate(() => {
		const box = document
			.querySelector('[data-testid="perlin-bloom-exhibit"] button')
			?.getBoundingClientRect();
		return {
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			newBloomUsable: Boolean(box && box.width >= 44 && box.height >= 44)
		};
	});
	expect(zoomed.overflow).toBeLessThanOrEqual(1);
	expect(zoomed.newBloomUsable).toBe(true);
	await page.setViewportSize({ width: 360, height: 800 });

	const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
	await breadcrumb.getByRole('link', { name: 'Visualizations', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`${listingPath.replaceAll('/', '\\/')}/?$`, 'u'));
	const card = page.locator(`a[href="${articlePath}"]`).first();
	await expect(card).toBeVisible();
	await card.scrollIntoViewIfNeeded();
	await expect(card.locator('img')).toHaveAttribute('src', posterPath);
	await expect(card.locator('img')).toHaveAttribute('alt', posterAlt);
	await expect
		.poll(() =>
			card.locator('img').evaluate((image) => ({
				complete: image instanceof HTMLImageElement && image.complete,
				width: image instanceof HTMLImageElement ? image.naturalWidth : 0,
				height: image instanceof HTMLImageElement ? image.naturalHeight : 0
			}))
		)
		.toEqual({ complete: true, width: 1200, height: 630 });
	const posterResponse = await page.request.get(posterPath);
	expect(posterResponse.ok()).toBe(true);
	expect(posterResponse.headers()['content-type']).toContain('image/png');
	expect((await posterResponse.body()).byteLength).toBeLessThanOrEqual(750 * 1024);

	await page.goto('/blog/visualizations/the-museum-of-invisible-weather', {
		waitUntil: 'domcontentloaded'
	});
	const relatedCard = page.locator(`a[href="${articlePath}"]`).filter({ has: page.locator('img') });
	await expect(relatedCard).toHaveCount(1);
	await expect(relatedCard.locator('img')).toHaveAttribute('src', posterPath);
	await expect(relatedCard.locator('img')).toHaveAttribute('alt', posterAlt);

	await waitForBloom(page);
	await expect(bloomCanvas(page)).toHaveCount(1);
	expect(runtimeMessages).toEqual([]);
});
