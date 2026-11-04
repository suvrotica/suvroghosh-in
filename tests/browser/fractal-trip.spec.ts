import { createHash } from 'node:crypto';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
	DEFAULT_STATE,
	FAMILIES,
	decodeState,
	defaultForFamily,
	encodeState,
	normalizeState,
	type FamilyId,
	type FractalState
} from '../../src/lib/visualizations/fractal-trip/model';

const articlePath = '/blog/visualizations/fractal-trip';
const storageKey = 'suvro-fractal-trip-favourites-v1';
const app = (page: Page) => page.locator('#fractal-trip');
const failures = new WeakMap<Page, string[]>();

function comparable(state: FractalState) {
	// Node and Chrome can differ by one ULP in their trigonometric default roots.
	return JSON.parse(
		JSON.stringify(state, (_key, value) =>
			typeof value === 'number' ? Number(value.toPrecision(12)) : value
		)
	);
}

test.beforeEach(async ({ page }) => {
	const errors: string[] = [];
	failures.set(page, errors);
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		const tracker = globalThis as typeof globalThis & { __fractalDraws: number };
		tracker.__fractalDraws = 0;
		const original = WebGL2RenderingContext.prototype.drawArrays;
		WebGL2RenderingContext.prototype.drawArrays = function (...args) {
			if (this.canvas instanceof HTMLCanvasElement && this.canvas.closest('#fractal-trip')) {
				tracker.__fractalDraws++;
			}
			return Reflect.apply(original, this, args);
		};
	});
});

test.afterEach(async ({ page }) => {
	expect(failures.get(page) ?? [], 'The fractal app must not produce unhandled errors').toEqual([]);
});

async function ready(page: Page, query = '') {
	await page.goto(articlePath + query, { waitUntil: 'domcontentloaded' });
	for (const name of ['Keep videos paused', 'Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name, exact: true });
		if (await button.isVisible()) await button.click();
	}
	await expect(app(page)).toBeVisible();
	await app(page).scrollIntoViewIfNeeded();
	await expect(app(page)).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
	await expect(app(page).locator('.ft-fallback')).toHaveCount(0);
	await expect.poll(() => draws(page)).toBeGreaterThan(0);
	return app(page);
}

async function frames(page: Page, count = 24) {
	await page.evaluate(
		(total) =>
			new Promise<void>((resolve) => {
				let completed = 0;
				function step() {
					if (++completed >= total) resolve();
					else requestAnimationFrame(step);
				}
				requestAnimationFrame(step);
			}),
		count
	);
}

async function draws(page: Page) {
	return page.evaluate(
		() => (globalThis as typeof globalThis & { __fractalDraws: number }).__fractalDraws
	);
}

async function closePanel(page: Page) {
	const close = app(page).getByRole('button', { name: 'Close panel', exact: true });
	if (await close.isVisible()) await close.click();
}

async function selectFamily(page: Page, id: FamilyId) {
	await closePanel(page);
	await app(page)
		.getByRole('button', { name: /Choose shape/ })
		.click();
	const name = FAMILIES.find((family) => family.id === id)!.name;
	await app(page)
		.locator('.ft-shape-list')
		.getByRole('button', { name: new RegExp(`^${name}\\b`) })
		.click();
	await expect(app(page)).toHaveAttribute('data-family', id);
	await expect(app(page).locator('.ft-fallback')).toHaveCount(0);
	await frames(page);
}

async function share(page: Page): Promise<{ url: string; state: FractalState }> {
	await closePanel(page);
	await app(page)
		.getByRole('button', { name: /Saved views/ })
		.click();
	await app(page)
		.getByRole('button', { name: /Copy view link/ })
		.click();
	const url = await app(page).getByLabel('Your view link', { exact: true }).inputValue();
	const state = decodeState(new URL(url).searchParams.get('trip'));
	expect(state, 'The UI should export a valid versioned state').not.toBeNull();
	await app(page).getByRole('button', { name: 'Close view link', exact: true }).click();
	await closePanel(page);
	return { url, state: state! };
}

async function number(page: Page, label: string, value: string) {
	const field = app(page).getByRole('spinbutton', { name: `${label} value`, exact: true });
	await field.fill(value);
	await field.press('Tab');
}

async function artwork(canvas: Locator) {
	// A compositor capture works with preserveDrawingBuffer:false. Inspect its centre,
	// excluding DOM labels/buttons, so a healthy panel around a blank canvas cannot pass.
	const image = await canvas.screenshot({ animations: 'disabled' });
	const metadata = await sharp(image).metadata();
	const width = metadata.width!;
	const height = metadata.height!;
	const crop = sharp(image)
		.extract({
			left: Math.floor(width * 0.22),
			top: Math.floor(height * 0.22),
			width: Math.max(1, Math.floor(width * 0.56)),
			height: Math.max(1, Math.floor(height * 0.4))
		})
		.resize({ width: 240 });
	const bytes = await crop.clone().removeAlpha().raw().toBuffer();
	const stats = await crop.stats();
	return {
		hash: createHash('sha256').update(bytes).digest('hex'),
		variation: Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev)),
		brightness: Math.max(...stats.channels.slice(0, 3).map((channel) => channel.mean))
	};
}

async function downloadBytes(download: Download) {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

test('SSR explanation survives and reduced motion opens paused without continuous GPU work', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('FRACTAL TRIP');
	expect(html).toContain('/images/visualizations/fractal-trip/poster.png');
	expect(html).toContain('Enable JavaScript');
	expect(html).toContain('A small rule, repeated');
	await ready(page);
	await expect(app(page)).toHaveAttribute('data-playing', 'false');
	const image = await artwork(app(page).locator('canvas'));
	expect(image.variation).toBeGreaterThan(8);
	await frames(page);
	const paused = await draws(page);
	await frames(page);
	expect(await draws(page), 'An unchanged paused scene should not keep drawing').toBe(paused);
	await app(page).getByRole('button', { name: 'Start trip', exact: true }).click();
	await expect(app(page)).toHaveAttribute('data-playing', 'true');
	await expect.poll(() => draws(page)).toBeGreaterThan(paused + 3);
	await page
		.getByRole('heading', { name: 'Change one number', exact: true })
		.scrollIntoViewIfNeeded();
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await frames(page);
	const hidden = await draws(page);
	await frames(page);
	expect(await draws(page), 'An offscreen journey should suspend GPU drawing').toBe(hidden);
	await app(page).scrollIntoViewIfNeeded();
	await expect.poll(() => draws(page)).toBeGreaterThan(hidden);
	await app(page).getByRole('button', { name: 'Pause trip', exact: true }).click();
	await app(page)
		.getByRole('button', { name: /Fullscreen/ })
		.click();
	await expect(app(page).getByRole('button', { name: /Exit fullscreen/ })).toBeVisible();
	expect(await page.evaluate(() => document.fullscreenElement?.id)).toBe('fractal-trip');
	await app(page)
		.getByRole('button', { name: /Exit fullscreen/ })
		.click();
	await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});

test('all seven choices render distinct visible fractal content', async ({ page }) => {
	await ready(page);
	const distinct = new Set<string>();
	for (const family of FAMILIES) {
		await selectFamily(page, family.id);
		const image = await artwork(app(page).locator('canvas'));
		expect(
			image.variation,
			`${family.name} should contain detail, not a uniform frame`
		).toBeGreaterThan(5);
		expect(image.brightness, `${family.name} should have visible artwork`).toBeGreaterThan(12);
		distinct.add(image.hash);
	}
	expect(distinct.size).toBe(FAMILIES.length);
});

test('equation edits change pixels and share state; undo, redo and resets keep their separate meanings', async ({
	page
}) => {
	await ready(page);
	await selectFamily(page, 'julia');
	const original = await share(page);
	const before = await artwork(app(page).locator('canvas'));
	await app(page)
		.getByRole('button', { name: /Equation/ })
		.click();
	await number(page, 'Seed real', '-0.7');
	await closePanel(page);
	const edited = await share(page);
	expect(edited.state.seedRe).toBeCloseTo(-0.7, 12);
	const after = await artwork(app(page).locator('canvas'));
	expect(after.hash).not.toBe(before.hash);
	await app(page).getByRole('button', { name: 'Undo', exact: true }).click();
	expect((await share(page)).state).toEqual(original.state);
	await app(page).getByRole('button', { name: 'Redo', exact: true }).click();
	expect((await share(page)).state).toEqual(edited.state);
	await app(page).getByRole('button', { name: 'Zoom in', exact: true }).click();
	const closer = await share(page);
	expect(closer.state.span).toBeLessThan(edited.state.span);
	await app(page)
		.getByRole('button', { name: /Equation/ })
		.click();
	await app(page).getByRole('button', { name: 'Reset equation', exact: true }).click();
	const resetEquation = await share(page);
	expect(resetEquation.state.seedRe).toBe(defaultForFamily('julia').seedRe);
	expect(resetEquation.state.span, 'Equation reset preserves the inspected view').toBe(
		closer.state.span
	);
	await app(page)
		.getByRole('button', { name: /Equation/ })
		.click();
	await number(page, 'Seed imaginary', '0.21');
	await closePanel(page);
	await app(page).getByRole('button', { name: 'Reset view', exact: true }).click();
	const resetView = await share(page);
	expect(resetView.state.seedIm).toBeCloseTo(0.21, 12);
	expect(resetView.state.span).toBe(defaultForFamily('julia').span);
});

test('shared equations, camera and moment restore exactly; malformed input recovers safely', async ({
	page
}) => {
	const expected = normalizeState({
		...defaultForFamily('newton'),
		roots: [
			{ re: 1.2, im: 0.15 },
			{ re: -0.7, im: 0.8 },
			{ re: -0.5, im: -0.6 }
		],
		relaxation: 0.86,
		centerRe: 0.12,
		centerIm: -0.2,
		span: 2.7,
		rotation: 0.31,
		palette: 'ultraviolet',
		journeyTime: 17.25,
		quality: 'saver'
	});
	await ready(page, `?trip=${encodeState(expected)}`);
	await expect(app(page)).toHaveAttribute('data-playing', 'false');
	expect((await share(page)).state).toEqual(expected);
	await ready(page, '?trip=not-valid-json');
	expect(comparable((await share(page)).state)).toEqual(comparable(normalizeState(DEFAULT_STATE)));
	await ready(page, `?trip=${'a'.repeat(8200)}`);
	expect(comparable((await share(page)).state)).toEqual(comparable(normalizeState(DEFAULT_STATE)));
});

test('saved views persist locally and PNG export contains real artwork at the displayed aspect', async ({
	page
}) => {
	await ready(page);
	await selectFamily(page, 'julia');
	const saved = await share(page);
	await app(page)
		.getByRole('button', { name: /Saved views/ })
		.click();
	await app(page)
		.getByRole('button', { name: /Save this view on this device/ })
		.click();
	await expect(app(page).locator('.ft-favourite')).toHaveCount(1);
	const stored = await page.evaluate(
		(key) => JSON.parse(localStorage.getItem(key) || '[]'),
		storageKey
	);
	expect(stored).toHaveLength(1);
	expect(stored[0].state).toEqual(saved.state);
	await ready(page);
	await app(page)
		.getByRole('button', { name: /Saved views/ })
		.click();
	await expect(app(page).locator('.ft-favourite')).toHaveCount(1);
	await app(page).locator('.ft-favourite > button').first().click();
	await expect(app(page)).toHaveAttribute('data-family', 'julia');
	const bounds = await app(page).locator('canvas').boundingBox();
	expect(bounds).not.toBeNull();
	const pending = page.waitForEvent('download');
	await app(page)
		.getByRole('button', { name: /^Save image/ })
		.click();
	const download = await pending;
	expect(download.suggestedFilename()).toBe('fractal-trip-julia.png');
	const bytes = await downloadBytes(download);
	const image = sharp(bytes);
	const meta = await image.metadata();
	expect(meta.format).toBe('png');
	expect(meta.width).toBe(1600);
	expect(meta.height).toBe(Math.round(Math.min(1600, (1600 * bounds!.height) / bounds!.width)));
	expect((await image.stats()).channels.some((channel) => channel.stdev > 10)).toBe(true);
	await expect(app(page).getByRole('button', { name: /^Save image/ })).toBeEnabled();
	await app(page)
		.getByRole('button', { name: /Saved views/ })
		.click();
	await app(page).getByRole('button', { name: 'Delete saved view 1', exact: true }).click();
	await expect(app(page).locator('.ft-favourite')).toHaveCount(0);
});

test('context loss preserves settings and restores the real fractal canvas', async ({ page }) => {
	await ready(page);
	await selectFamily(page, 'mandelbulb');
	const before = await share(page);
	const supported = await app(page)
		.locator('canvas')
		.evaluate((node) => {
			const extension = (node as HTMLCanvasElement)
				.getContext('webgl2')
				?.getExtension('WEBGL_lose_context');
			if (!extension) return false;
			(globalThis as typeof globalThis & { __restoreFractal?: () => void }).__restoreFractal = () =>
				extension.restoreContext();
			extension.loseContext();
			return true;
		});
	test.skip(!supported, 'This browser does not expose WEBGL_lose_context for recovery testing.');
	await expect(app(page).locator('.ft-fallback')).toBeVisible();
	await expect(app(page).locator('.ft-fallback')).toContainText('Graphics paused');
	await page.evaluate(() =>
		(globalThis as typeof globalThis & { __restoreFractal?: () => void }).__restoreFractal?.()
	);
	await expect(app(page).locator('.ft-fallback')).toHaveCount(0);
	await frames(page);
	expect((await share(page)).state).toEqual(before.state);
	expect((await artwork(app(page).locator('canvas'))).variation).toBeGreaterThan(5);
});

test('mobile controls stay reachable and fullscreen fallback can be entered and exited', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(() => {
		Element.prototype.requestFullscreen = () =>
			Promise.reject(new Error('Fullscreen unavailable for this test'));
	});
	await ready(page);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
		true
	);
	await app(page)
		.getByRole('button', { name: /Equation/ })
		.click();
	const power = app(page).getByRole('slider', { name: 'Power', exact: true });
	await expect(power).toBeVisible();
	await power.focus();
	await power.press('ArrowRight');
	await expect(power).toHaveValue('3');
	await closePanel(page);
	const beforeExpanded = await page.evaluate(() => {
		// Reproduce the transformed ancestor used by the full article layout. A
		// merely position:fixed child would be offset and trapped by this parent.
		const ancestor = document.querySelector('#fractal-trip')?.closest('.ft-shell')?.parentElement;
		if (!ancestor) throw new Error('The article ancestor fixture is missing.');
		const transform = ancestor.style.transform;
		ancestor.setAttribute('data-fractal-transformed-fixture', '');
		ancestor.style.transform = 'translateX(23px)';
		return { transform, bodyOverflow: document.body.style.overflow };
	});
	await app(page)
		.getByRole('button', { name: /Fullscreen/ })
		.click();
	await expect(app(page)).toHaveClass(/ft-expanded/);
	await expect
		.poll(() => app(page).evaluate((element) => element.matches(':popover-open')))
		.toBe(true);
	await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
	const full = await app(page).boundingBox();
	expect(full?.x).toBeCloseTo(0, 0);
	expect(full?.y).toBeCloseTo(0, 0);
	expect(full?.width).toBeCloseTo(390, 0);
	expect(full?.height).toBeCloseTo(844, 0);
	// Escape must work while the fullscreen button still owns keyboard focus.
	await page.keyboard.press('Escape');
	await expect(app(page)).not.toHaveClass(/ft-expanded/);
	await expect
		.poll(() => app(page).evaluate((element) => element.matches(':popover-open')))
		.toBe(false);
	await expect
		.poll(() => page.evaluate(() => document.body.style.overflow))
		.toBe(beforeExpanded.bodyOverflow);
	await app(page)
		.getByRole('button', { name: /Fullscreen/ })
		.click();
	await expect(app(page)).toHaveClass(/ft-expanded/);
	await app(page)
		.getByRole('button', { name: /Exit fullscreen/ })
		.click();
	await expect(app(page)).not.toHaveClass(/ft-expanded/);
	await expect
		.poll(() => page.evaluate(() => document.body.style.overflow))
		.toBe(beforeExpanded.bodyOverflow);
	await page.evaluate((transform) => {
		const ancestor = document.querySelector<HTMLElement>('[data-fractal-transformed-fixture]');
		if (ancestor) {
			ancestor.style.transform = transform;
			ancestor.removeAttribute('data-fractal-transformed-fixture');
		}
	}, beforeExpanded.transform);
	await app(page).getByRole('button', { name: 'Hide controls', exact: true }).click();
	await expect(app(page).getByRole('button', { name: /Equation/ })).not.toBeVisible();
	await app(page).getByRole('button', { name: 'Show controls', exact: true }).click();
	await expect(app(page).getByRole('button', { name: /Equation/ })).toBeVisible();
});

test('disabled WebGL keeps the readable poster and article without a false ready state', async ({
	page
}) => {
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	await expect(app(page).locator('.ft-fallback')).toBeVisible();
	await expect(app(page).locator('.ft-fallback')).toContainText('WebGL is disabled');
	await expect(app(page)).toHaveAttribute('data-ready', 'false');
	await expect(app(page).getByRole('button', { name: 'Start trip', exact: true })).toBeDisabled();
	await expect(
		page.getByRole('heading', { name: 'A small rule, repeated', exact: true })
	).toBeVisible();
	expect(await draws(page)).toBe(0);
});

test('reset view fits higher-power plane families without changing their equations', async ({
	page
}) => {
	await ready(page);
	for (const family of ['mandelbrot', 'tricorn'] as const) {
		await selectFamily(page, family);
		await app(page)
			.getByRole('button', { name: /Equation/ })
			.click();
		await number(page, 'Power', '3');
		await closePanel(page);
		await app(page).getByRole('button', { name: 'Zoom in', exact: true }).click();
		const canvas = app(page).locator('canvas');
		await canvas.focus();
		await canvas.press('ArrowRight');
		const changed = (await share(page)).state;
		expect(changed.power).toBe(3);
		expect(changed.span).toBeLessThan(3.5);
		expect(Math.abs(changed.centerRe)).toBeGreaterThan(0);
		await app(page).getByRole('button', { name: 'Reset view', exact: true }).click();
		const reset = (await share(page)).state;
		expect(reset.family).toBe(family);
		expect(reset.power, 'Reset view must preserve the higher-power equation').toBe(3);
		expect(
			reset.span,
			'Higher powers need a whole-set view, not the quadratic Seahorse close-up'
		).toBe(3.5);
		expect(reset.centerRe).toBe(0);
		expect(reset.centerIm).toBe(0);
		expect((await artwork(canvas)).variation).toBeGreaterThan(5);
	}
});

test('portrait PNG export preserves the visible aspect ratio with a 1600-pixel longest edge', async ({
	page
}) => {
	await page.setViewportSize({ width: 800, height: 1200 });
	await page.addInitScript(() => {
		Element.prototype.requestFullscreen = () =>
			Promise.reject(new Error('Use expanded view for this portrait capture'));
	});
	await ready(page);
	await selectFamily(page, 'julia');
	await app(page)
		.getByRole('button', { name: /Fullscreen/ })
		.click();
	await expect(app(page)).toHaveClass(/ft-expanded/);
	await frames(page);
	const bounds = await app(page).locator('canvas').boundingBox();
	expect(bounds).not.toBeNull();
	expect(bounds!.height, 'The regression fixture must actually be portrait').toBeGreaterThan(
		bounds!.width
	);
	const pending = page.waitForEvent('download');
	await app(page)
		.getByRole('button', { name: /^Save image/ })
		.click();
	const bytes = await downloadBytes(await pending);
	const image = sharp(bytes);
	const metadata = await image.metadata();
	expect(metadata.format).toBe('png');
	expect(metadata.height).toBe(1600);
	expect(metadata.width).toBe(Math.round((1600 * bounds!.width) / bounds!.height));
	expect(metadata.width! / metadata.height!).toBeCloseTo(bounds!.width / bounds!.height, 3);
	expect((await image.stats()).channels.some((channel) => channel.stdev > 10)).toBe(true);
	await expect(app(page).getByRole('button', { name: /^Save image/ })).toBeEnabled();
});
