import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/the-museum-of-invisible-weather';
const listingPath = '/blog/visualizations';
const posterPath = '/images/the-museum-of-invisible-weather.png';
const posterAlt =
	'A quiet plaster gallery wall holding asymmetrical framed prints whose high-contrast lines bend through nested flow fields, with dark river-like bands winding through several works.';
const fixedPath = `${articlePath}?iw_v=1&iw_seed=monsoon-ledger-1847&iw_preset=monsoon-ledger&iw_layout=salon-wall&iw_motion=still&iw_selected=3`;
const movingPath = `${articlePath}?iw_v=1&iw_seed=browser-motion-1847&iw_preset=monsoon-ledger&iw_layout=salon-wall`;
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10] as const;

function exhibit(page: Page): Locator {
	return page.locator('#invisible-weather-exhibit');
}

function p5Host(page: Page): Locator {
	return page.getByTestId('invisible-weather-p5-host');
}

function galleryCanvas(page: Page): Locator {
	return p5Host(page).locator('canvas[data-invisible-weather-canvas="true"]');
}

function focusView(page: Page): Locator {
	return exhibit(page).locator('[data-testid="invisible-weather-focus"], [role="dialog"]').first();
}

function runtimeDiagnostics(page: Page): string[] {
	const diagnostics: string[] = [];
	page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() !== 'error' && message.type() !== 'warning') return;
		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/') || /favicon/iu.test(source)) return;
		diagnostics.push(`console ${message.type()}: ${message.text()}`);
	});
	return diagnostics;
}

async function waitForExhibit(page: Page, path = articlePath): Promise<Locator> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	const root = exhibit(page);
	await expect(root).toHaveCount(1);
	await expect(root).toBeVisible();
	await root.scrollIntoViewIfNeeded();
	await expect(p5Host(page)).toBeVisible();
	await expect(galleryCanvas(page)).toHaveCount(1, { timeout: 45_000 });
	await expect(galleryCanvas(page)).toBeVisible();
	await expect
		.poll(async () => (await p5Host(page).getAttribute('data-recipe-hash'))?.trim() ?? '')
		.toMatch(/^[a-zA-Z0-9_-]{6,}$/u);
	return root;
}

async function recipeHash(page: Page): Promise<string> {
	return (await p5Host(page).getAttribute('data-recipe-hash')) ?? '';
}

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

async function installClipboardCapture(page: Page): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (value: string) => {
					Reflect.set(window, '__invisibleWeatherCopiedLink', value);
				}
			}
		});
	});
}

test('SSR poster hydrates cleanly into one deterministic p5 canvas', async ({ page, request }) => {
	const response = await request.get(fixedPath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('id="invisible-weather-exhibit"');
	expect(html).toContain('data-testid="invisible-weather-p5-host"');
	expect(html).toContain(posterPath);
	expect(html).not.toContain('data-invisible-weather-canvas="true"');

	const diagnostics = runtimeDiagnostics(page);
	await waitForExhibit(page, fixedPath);
	await expect(galleryCanvas(page)).toHaveCount(1);
	await expect(exhibit(page).locator('canvas[data-invisible-weather-canvas="true"]')).toHaveCount(
		1
	);
	const artworkCount = Number(await p5Host(page).getAttribute('data-artwork-count'));
	expect(artworkCount).toBe(9);
	expect(diagnostics).toEqual([]);
});

test('fixed URLs reconstruct, resizing preserves the recipe, and New changes it', async ({
	page
}) => {
	const diagnostics = runtimeDiagnostics(page);
	const root = await waitForExhibit(page, fixedPath);
	const fixedHash = await recipeHash(page);
	await expect(root.getByRole('combobox', { name: 'Curated preset', exact: true })).toHaveValue(
		'monsoon-ledger'
	);
	await expect(root.getByRole('combobox', { name: 'Wall arrangement', exact: true })).toHaveValue(
		'salon-wall'
	);
	await expect(root.getByRole('combobox', { name: 'Weather motion', exact: true })).toHaveValue(
		'still'
	);
	await expect(root.getByTestId('invisible-weather-inspector').getByRole('heading')).toHaveText(
		'Work 04'
	);

	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(galleryCanvas(page)).toHaveCount(1);
	await expect(p5Host(page)).toHaveAttribute('data-recipe-hash', fixedHash);

	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 1366, height: 768 }
	]) {
		await page.setViewportSize(viewport);
		await expect(galleryCanvas(page)).toHaveCount(1);
		await expect(p5Host(page)).toHaveAttribute('data-recipe-hash', fixedHash);
		const bounds = await galleryCanvas(page).boundingBox();
		expect(bounds?.width ?? 0).toBeGreaterThan(280);
		expect(bounds?.height ?? 0).toBeGreaterThan(250);
	}

	const newButton = exhibit(page).getByRole('button', { name: 'New exhibition', exact: true });
	await newButton.click();
	await expect.poll(() => recipeHash(page)).not.toBe(fixedHash);
	const newHash = await recipeHash(page);
	await exhibit(page).getByRole('button', { name: 'Replay seed', exact: true }).click();
	await expect(p5Host(page)).toHaveAttribute('data-recipe-hash', newHash);
	await expect(galleryCanvas(page)).toHaveCount(1);
	expect(diagnostics).toEqual([]);
});

test('pause, freeze, focus navigation, and Escape preserve an accessible interaction loop', async ({
	page
}) => {
	const diagnostics = runtimeDiagnostics(page);
	const root = await waitForExhibit(page, movingPath);
	const pause = root.getByRole('button', { name: 'Pause', exact: true });
	await expect(pause).toBeVisible();
	await pause.click();
	await expect(root.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
	await expect(p5Host(page)).toHaveAttribute('data-motion', 'still');

	await root.getByRole('button', { name: 'Resume', exact: true }).click();
	const beforeFreeze = await recipeHash(page);
	await root.getByRole('button', { name: 'Freeze frame', exact: true }).click();
	await expect(p5Host(page)).toHaveAttribute('data-motion', 'still');
	await expect.poll(() => recipeHash(page)).not.toBe(beforeFreeze);

	const canvas = galleryCanvas(page);
	await canvas.focus();
	await expect(root.getByTestId('invisible-weather-inspector').getByRole('heading')).toHaveText(
		'Work 01'
	);
	await canvas.press('ArrowRight');
	await expect(root.getByTestId('invisible-weather-inspector').getByRole('heading')).toHaveText(
		'Work 02'
	);

	const focusButton = root.getByRole('button', { name: 'Focus work', exact: true });
	await focusButton.click();
	await expect(focusView(page)).toBeVisible();
	await page.keyboard.press('ArrowRight');
	await expect(root.getByTestId('invisible-weather-inspector').getByRole('heading')).toHaveText(
		'Work 03'
	);
	await page.keyboard.press('Escape');
	await expect(focusView(page)).toBeHidden();
	await expect(focusButton).toBeFocused();
	await expect(galleryCanvas(page)).toHaveCount(1);
	expect(diagnostics).toEqual([]);
});

test('reduced motion begins still and copying a permanent link reports success', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await installClipboardCapture(page);
	const diagnostics = runtimeDiagnostics(page);
	const root = await waitForExhibit(page, movingPath);
	await expect(p5Host(page)).toHaveAttribute('data-motion', 'still');
	await root.getByRole('button', { name: 'Resume', exact: true }).click();
	await expect(p5Host(page)).toHaveAttribute('data-motion', 'migrate');

	await root.getByRole('button', { name: 'Copy permanent link', exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(() => String(Reflect.get(window, '__invisibleWeatherCopiedLink') ?? ''))
		)
		.toContain(articlePath);
	await expect
		.poll(async () => (await root.locator('[role="status"]').allTextContents()).join(' '))
		.toMatch(/copied|permanent link/iu);
	expect(diagnostics).toEqual([]);
});

test('paper, night, and high-contrast site modes keep controls legible', async ({ page }) => {
	const diagnostics = runtimeDiagnostics(page);
	const root = await waitForExhibit(page, fixedPath);

	for (const theme of ['paper', 'night', 'high-contrast'] as const) {
		const metrics = await root.evaluate((element, nextTheme) => {
			const documentRoot = document.documentElement;
			documentRoot.dataset.theme = nextTheme;
			documentRoot.classList.toggle('dark', nextTheme === 'night');
			const control = element.querySelector<HTMLSelectElement>('select');
			if (!control) return null;
			const style = getComputedStyle(control);
			const channels = (value: string) =>
				(value.match(/[\d.]+/gu) ?? []).slice(0, 3).map(Number) as [number, number, number];
			const luminance = (rgb: [number, number, number]) => {
				const linear = rgb.map((channel) => {
					const normalized = channel / 255;
					return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
			};
			const foreground = luminance(channels(style.color));
			const background = luminance(channels(style.backgroundColor));
			return {
				contrast:
					(Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
				borderWidth: Number.parseFloat(style.borderTopWidth),
				background: style.backgroundColor
			};
		}, theme);
		expect(metrics, `${theme} control metrics`).not.toBeNull();
		expect(metrics?.contrast ?? 0, `${theme} control contrast`).toBeGreaterThanOrEqual(4.5);
		expect(metrics?.borderWidth ?? 0, `${theme} control border`).toBeGreaterThanOrEqual(
			theme === 'high-contrast' ? 2 : 1
		);
		expect(metrics?.background).not.toBe('rgba(0, 0, 0, 0)');
	}

	expect(diagnostics).toEqual([]);
});

test('Save emits a valid gallery PNG and a matching versioned JSON recipe', async ({ page }) => {
	const root = await waitForExhibit(page, fixedPath);
	const hash = await recipeHash(page);
	await root
		.getByTestId('invisible-weather-export-menu')
		.locator('summary[aria-label="Open save and export menu"]')
		.click();

	const pngPromise = page.waitForEvent('download');
	await root.getByRole('button', { name: 'Gallery PNG · 1×', exact: true }).click();
	const pngDownload = await pngPromise;
	const png = await downloadBytes(pngDownload);
	expect(pngDownload.suggestedFilename()).toMatch(/\.png$/iu);
	expect([...png.subarray(0, 8)]).toEqual(pngSignature);
	expect(png.byteLength).toBeGreaterThan(5_000);

	const jsonPromise = page.waitForEvent('download');
	await root.getByRole('button', { name: 'Recipe JSON', exact: true }).click();
	const jsonDownload = await jsonPromise;
	const json = JSON.parse((await downloadBytes(jsonDownload)).toString('utf8')) as {
		schemaVersion?: number;
		artifact?: string;
		recipeHash?: string;
		state?: { seed?: string; selectedArtwork?: number };
		recipe?: { artworkCount?: number };
	};
	expect(jsonDownload.suggestedFilename()).toMatch(/\.json$/iu);
	expect(json).toMatchObject({
		schemaVersion: 1,
		artifact: 'Invisible Weather exhibition',
		recipeHash: hash,
		state: { seed: 'monsoon-ledger-1847', selectedArtwork: 3 },
		recipe: { artworkCount: 9 }
	});
});

test('invalid URL state is bounded and the 360px interface has no horizontal leak', async ({
	page
}) => {
	await page.setViewportSize({ width: 360, height: 800 });
	const diagnostics = runtimeDiagnostics(page);
	const invalidPath = `${articlePath}?iw_v=999&iw_seed=%20&iw_preset=missing&iw_layout=spiral&iw_count=99999&iw_depth=NaN&iw_motion=violent&iw_selected=-42`;
	const root = await waitForExhibit(page, invalidPath);
	const count = Number(await p5Host(page).getAttribute('data-artwork-count'));
	expect(count).toBeGreaterThanOrEqual(3);
	expect(count).toBeLessThanOrEqual(15);

	const geometry = await root.evaluate((element) => {
		const essentialNames = [
			'New exhibition',
			'Replay seed',
			'Pause',
			'Resume',
			'Freeze frame',
			'Focus work',
			'Copy permanent link',
			'Open save and export menu'
		];
		const controls = [...element.querySelectorAll<HTMLElement>('button, summary')].filter(
			(control) => {
				const name = control.getAttribute('aria-label') ?? control.textContent?.trim() ?? '';
				return essentialNames.includes(name) && control.offsetParent !== null;
			}
		);
		return {
			documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			exhibitOverflow: element.scrollWidth - element.clientWidth,
			exhibitLeft: element.getBoundingClientRect().left,
			exhibitRight: element.getBoundingClientRect().right,
			viewportWidth: document.documentElement.clientWidth,
			undersized: controls
				.map((control) => {
					const bounds = control.getBoundingClientRect();
					return {
						name: control.getAttribute('aria-label') ?? control.textContent?.trim() ?? '',
						width: bounds.width,
						height: bounds.height
					};
				})
				.filter((control) => control.width < 43.5 || control.height < 43.5)
		};
	});
	expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
	expect(geometry.exhibitOverflow).toBeLessThanOrEqual(1);
	expect(geometry.exhibitLeft).toBeGreaterThanOrEqual(-1);
	expect(geometry.exhibitRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
	expect(geometry.undersized).toEqual([]);
	await expect(galleryCanvas(page)).toHaveCount(1);
	expect(diagnostics).toEqual([]);
});

test('the listing exposes the authored poster and route navigation never duplicates the canvas', async ({
	page
}) => {
	const diagnostics = runtimeDiagnostics(page);
	await waitForExhibit(page, fixedPath);

	for (let visit = 0; visit < 2; visit += 1) {
		const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
		await breadcrumb.getByRole('link', { name: 'Visualizations', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`${listingPath.replaceAll('/', '\\/')}/?$`, 'u'));
		const card = page.locator(`a[href="${articlePath}"]`);
		await card.scrollIntoViewIfNeeded();
		await expect(
			card.getByRole('heading', { name: 'The Museum of Invisible Weather' })
		).toBeVisible();
		const poster = card.locator('img');
		await expect(poster).toHaveAttribute('src', posterPath);
		await expect(poster).toHaveAttribute('alt', posterAlt);
		await expect
			.poll(() => poster.evaluate((image: HTMLImageElement) => image.naturalWidth))
			.toBeGreaterThan(0);

		await page.goBack({ waitUntil: 'domcontentloaded' });
		await expect(exhibit(page)).toBeVisible();
		await expect(galleryCanvas(page)).toHaveCount(1, { timeout: 45_000 });
		await expect(exhibit(page).locator('canvas[data-invisible-weather-canvas="true"]')).toHaveCount(
			1
		);
	}

	expect(diagnostics).toEqual([]);
});
