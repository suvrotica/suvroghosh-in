import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const artifacts = path.resolve('.codex-artifacts/privacy');
test.use({ serviceWorkers: 'block' });

test('populated dashboard is readable across viewports and themes', async ({ page }) => {
	test.setTimeout(90_000);
	const failures: string[] = [];
	page.on('pageerror', (error) => failures.push(error.message));
	await mkdir(artifacts, { recursive: true });
	for (const [name, width, height] of [
		['desktop', 1440, 1100],
		['mobile', 390, 844]
	] as const) {
		await page.setViewportSize({ width, height });
		await page.goto('/tests/privacy-preview.html');
		await expect(page.getByRole('heading', { name: /a little perspective/i })).toBeVisible({
			timeout: 15_000
		});
		await page.evaluate(() => document.fonts.ready);
		for (const theme of ['paper', 'light', 'night', 'high-contrast']) {
			await page.evaluate((value) => {
				document.documentElement.dataset.theme = value;
			}, theme);
			await expect(page.getByRole('heading', { name: /a little perspective/i })).toBeVisible();
			await expect(page.getByRole('heading', { name: 'A sense of place' })).toBeVisible();
			await expect(page.getByText('Kolkata · West Bengal · India')).toBeVisible();
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
			await page.screenshot({
				path: path.join(artifacts, `dashboard-${name}${theme === 'paper' ? '' : `-${theme}`}.png`),
				fullPage: true,
				animations: 'disabled'
			});
		}
	}
	expect(failures).toEqual([]);
});

test('daily chart has an accessible table and native date/export controls', async ({ page }) => {
	await page.goto('/tests/privacy-preview.html');
	await page.getByText('Read the daily figures', { exact: false }).click();
	await expect(page.getByRole('table')).toBeVisible();
	await expect(page.getByRole('row')).toHaveCount(31);
	await expect(page.getByRole('link', { name: /export csv/i })).toHaveAttribute(
		'href',
		/\/notes\/studio\/analytics\/export\?period=custom/
	);
	await expect(page.getByRole('combobox', { name: 'Reading window' })).toHaveValue('30d');
	await expect(page.getByLabel('From date')).toHaveAttribute('type', 'date');
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addStyleTag({ content: 'html { font-size: 200%; }' });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('empty and unavailable states remain honest', async ({ page }) => {
	await page.goto('/tests/privacy-preview.html?state=empty');
	await expect(page.getByRole('heading', { name: 'A blank page is a beginning.' })).toBeVisible();
	await expect(page.getByText('Kolkata · West Bengal · India')).toHaveCount(0);
	await page.goto('/tests/privacy-preview.html?state=unconfigured');
	await expect(page.getByRole('heading', { name: 'Connect the analytics ledger.' })).toBeVisible();
	await expect(page.getByRole('link', { name: /export csv/i })).toHaveCount(0);
	await page.goto('/tests/privacy-preview.html?state=error');
	await expect(
		page.getByRole('heading', { name: 'This report is unavailable for a moment.' })
	).toBeVisible();
	await expect(page.getByRole('link', { name: /export csv/i })).toHaveCount(0);
});
