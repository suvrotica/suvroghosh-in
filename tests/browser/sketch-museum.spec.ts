import { expect, test, type Page } from '@playwright/test';

async function dismissNotice(page: Page) {
	const close = page.getByRole('button', { name: 'Dismiss privacy notice without choosing' });
	if (await close.isVisible()) await close.click();
}

test('browse, filter, navigate pages and restore detail selection', async ({ page }, testInfo) => {
	await page.goto('/images/sketches', { waitUntil: 'networkidle' });
	await dismissNotice(page);
	await page.evaluate(() =>
		document.getElementById('sketch-collection')?.scrollIntoView({ block: 'start' })
	);
	await page.screenshot({ path: testInfo.outputPath('browse.png') });
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
	).toBe(true);
	await expect(page.getByRole('heading', { name: 'Browse drawings' })).toBeVisible();
	const cards = page.getByRole('list', { name: 'Sketch collection' }).locator('li');
	await expect(cards).toHaveCount(48);
	const imageFitsStage = await cards
		.first()
		.locator('.image-mat')
		.evaluate((stage) => {
			const img = stage.querySelector('img');
			if (!img) return false;
			const a = stage.getBoundingClientRect();
			const b = img.getBoundingClientRect();
			return (
				getComputedStyle(img).objectFit === 'contain' &&
				Math.abs(a.width - b.width) < 1 &&
				Math.abs(a.height - b.height) < 1
			);
		});
	expect(imageFitsStage).toBe(true);
	const firstLink = cards.first().locator('a');
	const title = await firstLink.getAttribute('aria-label');
	await firstLink.click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.goBack();
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page).not.toHaveURL(/art=/);
	await expect(cards.first().locator('a')).toHaveAttribute('aria-label', title!);
	await page.getByRole('link', { name: 'Next →' }).click();
	await expect(page.getByLabel('Collection pages')).toContainText('Page 2 of');
	await expect(page).toHaveURL(/page=2/);
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Search drawings').fill('bird');
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByRole('list', { name: 'Sketch collection' })).toBeVisible();
	await expect(page).toHaveURL(/q=bird/);
});

test('the collection and linked details work without JavaScript', async ({ browser, baseURL }) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		serviceWorkers: 'block'
	});
	const page = await context.newPage();
	await page.goto('/images/sketches', { waitUntil: 'networkidle' });
	const firstLink = page.getByRole('list', { name: 'Sketch collection' }).locator('li a').first();
	await firstLink.click();
	await expect(page.locator('#artwork-detail')).toBeVisible();
	await expect(page.locator('#artwork-detail img')).toBeVisible();
	await page.getByLabel('Search drawings').fill('bird');
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page).toHaveURL(/q=bird/);
	await expect(page.getByRole('list', { name: 'Sketch collection' })).toBeVisible();
	await context.close();
});

test('3D gallery opens and offers direct room and wall navigation', async ({ page }, testInfo) => {
	await page.goto('/images/sketches', { waitUntil: 'networkidle' });
	await dismissNotice(page);
	const supports = await page.evaluate(() => {
		const canvas = document.createElement('canvas');
		const context =
			canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ||
			canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true });
		context?.getExtension('WEBGL_lose_context')?.loseContext();
		return !!context;
	});
	if (!supports) {
		await expect(page.getByRole('heading', { name: 'Museum View is unavailable' })).toBeVisible();
		testInfo.annotations.push({
			type: 'WebGL unavailable',
			description: 'Collection remains available; 3D could not be exercised.'
		});
		return;
	}
	await page.getByRole('button', { name: 'Enter Museum' }).click();
	const room = page.getByLabel('Go to room');
	await expect(room).toBeVisible({ timeout: 30_000 });
	await page.waitForLoadState('networkidle');
	await page
		.locator('.museum-shell canvas')
		.evaluate((canvas) => canvas.scrollIntoView({ block: 'center' }));
	await page
		.locator('.museum-shell canvas')
		.screenshot({ path: testInfo.outputPath('museum-overview.png') });
	const landscape = page.getByRole('button', { name: 'Inspect Backward Fall' });
	await expect(landscape).toBeVisible();
	await landscape.click();
	await expect(page.getByRole('button', { name: 'Whole wall' })).toBeVisible();
	await page
		.locator('.museum-shell canvas')
		.evaluate((canvas) => canvas.scrollIntoView({ block: 'center' }));
	await page.waitForTimeout(1500); // Wait for the visible focus transition before capture.
	await page
		.locator('.museum-shell canvas')
		.screenshot({ path: testInfo.outputPath('landscape-focus.png') });
	await page.getByRole('button', { name: 'Room overview' }).click();
	const options = room.locator('option');
	if ((await options.count()) > 1) await room.selectOption({ index: (await options.count()) - 1 });
	await expect(page.getByRole('button', { name: 'Walk freely' })).toBeVisible();
	await page
		.getByRole('button', { name: /^(Front|Right|Back|Left) wall$/ })
		.first()
		.click();
	const artwork = page.getByRole('button', { name: /^Inspect / }).first();
	await expect(artwork).toBeVisible();
	await artwork.click();
	await expect(page.getByRole('button', { name: 'Whole wall' })).toBeVisible();
	await page.getByRole('button', { name: 'Walk freely' }).click();
	await expect(page.getByRole('button', { name: 'Stop walking' })).toBeVisible();
	await page.getByRole('button', { name: 'Stop walking' }).click();
	await page.screenshot({ path: testInfo.outputPath('museum.png') });
	const beforeReturn = page.url();
	await page.getByRole('button', { name: 'Return to collection' }).click();
	await expect(page.locator('.museum-shell canvas')).toHaveCount(0);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					!!document.activeElement?.matches('#collection-heading, #sketch-collection li.selected a')
			)
		)
		.toBe(true);
	expect(page.url()).toBe(beforeReturn);
});

test('collection remains usable when WebGL is unavailable', async ({ page }) => {
	await page.goto('/images/sketches?webgl=off', { waitUntil: 'networkidle' });
	await dismissNotice(page);
	await expect(page.getByRole('heading', { name: 'Museum View is unavailable' })).toBeVisible();
	await expect(page.getByRole('list', { name: 'Sketch collection' })).toBeVisible();
	await page.getByRole('list', { name: 'Sketch collection' }).locator('li a').first().click();
	await expect(page.getByRole('dialog')).toBeVisible();
});
