import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { comicCatalog, comicPath } from '../../src/lib/content/comics';

const comic = comicCatalog[0];
const detail = comicPath(comic);

test.beforeEach(async ({ context, baseURL }) => {
	await context.route('**/*', (route) => {
		const url = new URL(route.request().url());
		if (url.pathname.startsWith('/_vercel/insights/'))
			return route.fulfill({ contentType: 'application/javascript', body: '' });
		return url.origin === baseURL ? route.continue() : route.abort();
	});
	await context.addInitScript(() => {
		const savedAt = Date.now();
		localStorage.setItem(
			'suvroghosh:consent',
			JSON.stringify({
				v: 2,
				media: false,
				savedAt,
				expiresAt: savedAt + 180 * 24 * 60 * 60 * 1000
			})
		);
	});
});

test('both homepage covers lead to the comic; gallery, source and PDF form a complete flow', async ({
	page,
	request
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	for (const side of ['front', 'back']) {
		await page.goto('/');
		const cover = page.locator(`[data-home-comics] [data-comic-cover="${side}"]`);
		await expect(cover).toHaveAttribute('href', detail);
		await cover.click();
		await expect(page).toHaveURL(new RegExp(`${detail}$`));
		await expect(page.locator('main h1')).toHaveText(comic.title);
	}
	await page
		.locator('header nav[aria-label="Primary navigation"]')
		.getByRole('link', { name: 'Comics', exact: true })
		.click();
	await expect(page).toHaveURL(/\/comics$/);
	await expect(page.locator('[data-comics-gallery]')).toBeVisible();
	await page.getByRole('link', { name: 'View comic', exact: true }).click();
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		`https://www.suvroghosh.in${detail}`
	);
	await page.getByRole('link', { name: 'Read the original story' }).click();
	await expect(page).toHaveURL(new RegExp(`${comic.source.href}$`));
	await page
		.locator('[data-comic-adaptation]')
		.getByRole('link', { name: 'View the comic' })
		.click();
	await expect(page.locator('[data-comic-detail]')).toBeVisible();
	const downloadEvent = page.waitForEvent('download');
	await page.locator('[data-comic-download]').click();
	const download = await downloadEvent;
	expect(download.suggestedFilename()).toBe(comic.pdf.filename);
	const downloadedPath = await download.path();
	expect(downloadedPath).toBeTruthy();
	const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
	expect(digest(readFileSync(downloadedPath!))).toBe(
		digest(readFileSync(`static${comic.pdf.href}`))
	);
	await page.locator('footer').getByRole('link', { name: 'Comics', exact: true }).click();
	await expect(page).toHaveURL(/\/comics$/);
	const sitemap = await request.get('/sitemap.xml');
	expect(await sitemap.text()).toContain(`https://www.suvroghosh.in${detail}`);
	expect((await request.get('/comics/not-a-published-comic')).status()).toBe(404);
	expect(errors).toEqual([]);
});

test('mobile navigation and whole covers stay usable without horizontal overflow or automatic PDF fetches', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const pdfRequests: string[] = [];
	page.on('request', (request) => {
		if (request.url().endsWith('.pdf')) pdfRequests.push(request.url());
	});
	await page.goto('/');
	await page.locator('[data-home-comics]').scrollIntoViewIfNeeded();
	for (const cover of await page.locator('[data-home-comics] img').all()) {
		await cover.evaluate((img: HTMLImageElement) => img.decode());
		expect(
			await cover.evaluate((img: HTMLImageElement) =>
				Math.abs(img.getBoundingClientRect().width / img.getBoundingClientRect().height - 2 / 3)
			)
		).toBeLessThan(0.01);
	}
	await page.locator('header details summary').click();
	await page
		.locator('header nav[aria-label="Mobile and tablet navigation"]')
		.getByRole('link', { name: 'Comics', exact: true })
		.click();
	await expect(page.locator('[data-comics-gallery]')).toBeVisible();
	await page.getByRole('link', { name: 'View comic', exact: true }).click();
	await expect(page.locator('[data-comic-download]')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
	expect(pdfRequests).toEqual([]);
});
