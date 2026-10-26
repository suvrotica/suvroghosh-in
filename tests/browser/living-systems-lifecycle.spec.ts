import { expect, test, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/living-systems';

// Use an actual browser context preference so both the initial query and change
// events exercise the same lifecycle as a reader's operating-system setting.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function ready(page: Page) {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	for (const name of ['Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name, exact: true });
		if (await button.isVisible()) await button.click();
	}
	const shell = page.getByRole('region', { name: 'Living Systems simulation playground' });
	await shell.scrollIntoViewIfNeeded();
	const runtime = shell.locator('.ls-runtime');
	const canvas = runtime.locator('canvas');
	await expect(runtime.getByRole('button', { name: 'Play simulation', exact: true })).toBeEnabled();
	await canvas.scrollIntoViewIfNeeded();
	await expect(canvas).toHaveAttribute('width', /[1-9][0-9]+/u);
	await expect(runtime).toHaveAttribute('data-playing', 'false');
	await page.evaluate(() => document.fonts.ready);
	return { runtime, canvas };
}

async function steps(runtime: Locator) {
	return Number(await runtime.getAttribute('data-steps'));
}

async function population(runtime: Locator) {
	const value = await runtime
		.locator('dt')
		.filter({ hasText: /^Living cells$/u })
		.locator('..')
		.locator('dd')
		.innerText();
	return Number(value.replaceAll(',', ''));
}

async function frame(canvas: Locator) {
	return canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL('image/png'));
}

test('offscreen playback suspends without losing the requested playing state and resumes on return', async ({
	page
}) => {
	const { runtime, canvas } = await ready(page);
	await runtime.getByRole('button', { name: 'Play simulation', exact: true }).click();
	await expect.poll(() => steps(runtime)).toBeGreaterThan(0);
	await page.evaluate(() =>
		window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
	);
	await expect
		.poll(() =>
			canvas.evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				return bounds.bottom <= 0 || bounds.top >= window.innerHeight;
			})
		)
		.toBe(true);
	// Allow the intersection callback and any already queued display frame to settle.
	await page.waitForTimeout(250);
	const suspendedSteps = await steps(runtime);
	const suspendedFrame = await frame(canvas);
	await page.waitForTimeout(550);
	await expect(runtime).toHaveAttribute('data-playing', 'true');
	expect(await steps(runtime)).toBe(suspendedSteps);
	expect(await frame(canvas)).toBe(suspendedFrame);
	await canvas.scrollIntoViewIfNeeded();
	await expect.poll(() => steps(runtime)).toBeGreaterThan(suspendedSteps);
	await runtime.getByRole('button', { name: 'Pause simulation', exact: true }).click();
	await expect(runtime).toHaveAttribute('data-playing', 'false');
});

test('resizing a paused field preserves the generation, population, camera and exact restored image', async ({
	page
}) => {
	const { runtime, canvas } = await ready(page);
	for (let index = 0; index < 7; index++)
		await runtime.getByRole('button', { name: 'Step', exact: true }).click();
	await expect(runtime).toHaveAttribute('data-steps', '7');
	await page.mouse.move(0, 0);
	const originalViewport = page.viewportSize()!;
	const originalPopulation = await population(runtime);
	const originalWidth = Number(await canvas.getAttribute('width'));
	const originalFrame = await frame(canvas);
	await page.setViewportSize({ width: 920, height: 1000 });
	await canvas.scrollIntoViewIfNeeded();
	await expect.poll(async () => Number(await canvas.getAttribute('width'))).not.toBe(originalWidth);
	await expect(runtime).toHaveAttribute('data-steps', '7');
	await expect(runtime).toHaveAttribute('data-playing', 'false');
	expect(await population(runtime)).toBe(originalPopulation);
	await page.setViewportSize(originalViewport);
	await canvas.scrollIntoViewIfNeeded();
	await expect(canvas).toHaveAttribute('width', String(originalWidth));
	await expect.poll(() => frame(canvas)).toBe(originalFrame);
	await expect(runtime).toHaveAttribute('data-steps', '7');
	expect(await population(runtime)).toBe(originalPopulation);
});

test('changing the live operating-system motion preference pauses an explicitly running simulation', async ({
	page
}) => {
	const { runtime } = await ready(page);
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await expect
		.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))
		.toBe(false);
	await runtime.getByRole('button', { name: 'Play simulation', exact: true }).click();
	await expect.poll(() => steps(runtime)).toBeGreaterThan(0);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(runtime).toHaveAttribute('data-playing', 'false');
	const pausedSteps = await steps(runtime);
	await page.waitForTimeout(350);
	expect(await steps(runtime)).toBe(pausedSteps);
	await expect(runtime.locator('.ls-footer')).toContainText(
		'Starts paused for your motion preference'
	);
	// An explicit Play remains available, even after a change to reduced motion.
	await runtime.getByRole('button', { name: 'Play simulation', exact: true }).click();
	await expect.poll(() => steps(runtime)).toBeGreaterThan(pausedSteps);
	await runtime.getByRole('button', { name: 'Pause simulation', exact: true }).click();
});

test('a 2× DPR touch context renders at device resolution and paints the intended logical cells', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 1440, height: 1100 },
		deviceScaleFactor: 2,
		hasTouch: true,
		reducedMotion: 'reduce',
		serviceWorkers: 'block'
	});
	try {
		const page = await context.newPage();
		const { runtime, canvas } = await ready(page);
		await expect
			.poll(() =>
				canvas.evaluate((element) => {
					const node = element as HTMLCanvasElement;
					const bounds = node.getBoundingClientRect();
					return (
						window.devicePixelRatio === 2 &&
						node.width === Math.round(bounds.width * 2) &&
						node.height === Math.round(bounds.height * 2)
					);
				})
			)
			.toBe(true);
		await runtime.getByRole('combobox', { name: 'Preset', exact: true }).selectOption('blinker');
		await expect.poll(() => population(runtime)).toBe(3);
		await runtime.getByRole('button', { name: /\+ Paint/u }).click();
		const brush = runtime.getByRole('slider', { name: 'Brush size', exact: true });
		await brush.focus();
		await brush.press('Home');
		await canvas.scrollIntoViewIfNeeded();
		const bounds = await canvas.boundingBox();
		expect(bounds).not.toBeNull();
		const scale = Math.min(bounds!.width / 120, bounds!.height / 84);
		await page.touchscreen.tap(
			bounds!.x + bounds!.width / 2 + (20.5 - 60) * scale,
			bounds!.y + bounds!.height / 2 + (20.5 - 42) * scale
		);
		// A radius-one circular brush adds the centre plus its four cardinal neighbours.
		await expect.poll(() => population(runtime)).toBe(8);
		await expect(runtime).toHaveAttribute('data-steps', '0');
		await expect(runtime).toHaveAttribute('data-playing', 'false');
	} finally {
		await context.close();
	}
});
