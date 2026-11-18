import { expect, test, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/the-little-city-of-wonders';

function attachDiagnostics(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
	page.on('console', (msg) => {
		if (msg.type() !== 'error') return;
		const txt = `${msg.location().url} ${msg.text()}`;
		if (/\/_vercel\/|favicon/iu.test(txt)) return;
		errors.push(`console.error: ${msg.text()}`);
	});
	return errors;
}

async function waitForCityReady(page: Page, path = articlePath): Promise<void> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	const shell = page.getByTestId('little-city-of-wonders');
	await expect(shell).toBeVisible();
	await expect(shell.locator('canvas.lcw-canvas')).toHaveCount(1);
	await expect(shell.locator('.lcw-loading-veil')).toHaveCount(0, { timeout: 45_000 });
	await page.waitForTimeout(350);
}

test.describe('The Little City of Wonders — Interactive 3D Miniature City', () => {
	test('renders 3D WebGL miniature city, preserves single H1 semantics, and has zero console errors', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForCityReady(page);

		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.locator('h1')).toHaveText('The Little City of Wonders');

		const canvas = page.getByTestId('little-city-of-wonders').locator('canvas.lcw-canvas');
		const box = await canvas.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.width).toBeGreaterThan(600);
		expect(box!.height).toBeGreaterThan(420);

		expect(errors).toEqual([]);
	});

	test('transitions across neighborhoods, lighting moods, and Diorama / 3rd-Person / 1st-Person modes', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForCityReady(page);

		const shell = page.getByTestId('little-city-of-wonders');
		const canvas = shell.locator('canvas.lcw-canvas');

		const overviewShot = await canvas.screenshot();

		// Jump to Teapot Quarter & Lantern Night mood
		await shell.getByRole('button', { name: /3\. Teapot Quarter/u }).click();
		await shell.getByRole('button', { name: 'Night', exact: true }).click();
		await page.waitForTimeout(1050);

		const nightTeapotShot = await canvas.screenshot();
		expect(Buffer.compare(overviewShot, nightTeapotShot)).not.toBe(0);

		// Inspect Grand Blue Kettle landmark from Buildings directory
		await shell.getByRole('tab', { name: /Buildings/u }).click();
		await shell.getByPlaceholder('Filter buildings, districts, materials...').fill('Blue Kettle');
		await shell.locator('.lcw-list-btn').filter({ hasText: 'Grand Blue Kettle' }).first().click();
		await expect(shell.getByTestId('landmark-story-card')).toContainText(
			'The Grand Blue Kettle Residence'
		);

		// Switch to 3rd-Person Walk and 1st-Person Eye modes
		await shell.getByRole('button', { name: '3rd-Person Walk' }).click();
		await expect(shell.getByRole('group', { name: 'Street movement pad' })).toBeVisible();

		await shell.getByRole('button', { name: '1st-Person Eye' }).click();
		await expect(shell.getByRole('group', { name: 'Street movement pad' })).toBeVisible();

		// Discover a secret curiosity from Secrets tab
		await shell.getByRole('tab', { name: /Secrets/u }).click();
		await shell.getByRole('button', { name: 'Peek' }).first().click();
		await expect(shell.locator('.lcw-subtitle-pill')).toContainText('1/8 Secrets');

		expect(errors).toEqual([]);
	});

	test('renders graceful poster fallback when ?webgl=off is requested', async ({ page }) => {
		const errors = attachDiagnostics(page);
		await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
		await expect(page.getByTestId('lcw-webgl-fallback')).toBeVisible();
		expect(errors).toEqual([]);
	});
});
