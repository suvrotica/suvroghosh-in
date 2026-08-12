import { readFile } from 'node:fs/promises';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Download, type Page, type TestInfo } from '@playwright/test';

const ARTICLE_PATH = '/blog/visualizations/the-living-aperture';
const SHELL_READY_TIMEOUT = 45_000;

async function openLaboratory(page: Page): Promise<void> {
	const runtimeErrors: string[] = [];
	page.on('pageerror', (error) => runtimeErrors.push(error.message));
	page.on('console', (message) => {
		if (
			message.type() === 'error' &&
			!message.text().startsWith('Failed to load resource:') &&
			!message.text().includes('/_vercel/insights/script.js') &&
			!message.text().includes('/_vercel/speed-insights/script.js')
		) {
			runtimeErrors.push(message.text());
		}
	});
	page.on('requestfailed', (request) => {
		if (/\/_vercel\//.test(request.url())) return;
		runtimeErrors.push(
			`request failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`
		);
	});
	await page.goto(ARTICLE_PATH, { waitUntil: 'domcontentloaded' });
	await expect(page).toHaveTitle(/Living Aperture/);
	await expect(
		page.getByRole('region', { name: 'The Living Aperture shell laboratory' })
	).toBeVisible();
	await expect
		.poll(
			async () => {
				if (runtimeErrors.length > 0) return `runtime error: ${runtimeErrors.join(' | ')}`;
				return String(await page.locator('.living-aperture-lab .viewport-host canvas').count());
			},
			{ timeout: SHELL_READY_TIMEOUT, message: 'viewport canvas count (or startup error)' }
		)
		.toBe('1');
}

function desktopOnly(testInfo: TestInfo): void {
	test.skip(
		testInfo.project.name !== 'desktop',
		'Desktop workflow; responsive checks run per device.'
	);
}

async function downloadedText(download: Download): Promise<string> {
	const path = await download.path();
	expect(path).not.toBeNull();
	return readFile(path!, 'utf8');
}

test.describe('The Living Aperture blog visualization', () => {
	test.describe.configure({ mode: 'serial' });

	test('loads inside the canonical article with one shell canvas', async ({ page }) => {
		await openLaboratory(page);
		await expect(page).toHaveURL(new RegExp(`${ARTICLE_PATH}(?:[?#]|$)`));
		await expect(page.locator('.living-aperture-lab .brand-title')).toHaveText(
			'The Living Aperture'
		);
		await expect(page.getByLabel('Model classification')).toContainText(/Model [AB]/);
		await expect(page.getByRole('region', { name: 'Growth timeline' })).toBeVisible();

		const canvas = page.locator('.living-aperture-lab .viewport-host canvas');
		await expect(canvas).toHaveCount(1);
		expect(await canvas.getAttribute('aria-label')).toMatch(
			/Interactive three-dimensional shell specimen|WebGL is unavailable/
		);
	});

	test('does not change the parent document theme and scopes keyboard shortcuts to the lab', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		const rootThemeBefore = await page.locator('html').getAttribute('data-theme');
		await page.getByRole('button', { name: 'Overlays' }).click();
		await page.getByLabel('High contrast').check();
		await expect(page.locator('.living-aperture-lab')).toHaveAttribute('data-lab-contrast', 'high');
		expect(await page.locator('html').getAttribute('data-theme')).toBe(rootThemeBefore);

		const age = page.getByRole('slider', { name: 'Deposited shell age' });
		await page.getByRole('button', { name: 'Restart growth' }).click();
		await page.locator('body').click({ position: { x: 4, y: 4 } });
		await page.keyboard.press('ArrowRight');
		await expect(age).toHaveValue('0');
		await page.locator('.living-aperture-lab .viewport-host canvas').focus();
		await page.keyboard.press('ArrowRight');
		expect(Number(await age.inputValue())).toBeGreaterThan(0);
	});

	test('shares recipe state through a query parameter while preserving article anchors', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		await page.locator('.preset-card').filter({ hasText: 'Turritella-like turret' }).click();
		await page.getByRole('button', { name: 'Save / share' }).click();
		const dialog = page.getByRole('dialog', { name: 'Save & share' });
		await expect(dialog.getByLabel('Reproducible recipe URL')).toHaveValue(/\?shell=/);
		await dialog.getByRole('button', { name: 'Put in address bar' }).click();
		await expect(page).toHaveURL(/\/blog\/visualizations\/the-living-aperture\?shell=/);
		await dialog.getByRole('button', { name: 'Done' }).click();
		await page.reload({ waitUntil: 'domcontentloaded' });
		await expect(
			page.getByRole('button', { name: 'Rename recipe Turritella-like turret' })
		).toBeVisible();
	});

	test('supports deterministic sculpting, undo, presets, and ring-prefix playback', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		const tightness = page.getByLabel('Coil tightness numeric value');
		await tightness.fill('3.2');
		await tightness.blur();
		await expect(tightness).toHaveValue('3.2');
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(tightness).toHaveValue('2.35');
		const preset = page.locator('.preset-card').filter({ hasText: 'Turritella-like turret' });
		await preset.click();
		await expect(preset).toHaveAttribute('aria-pressed', 'true');

		const age = page.getByRole('slider', { name: 'Deposited shell age' });
		await page.getByRole('button', { name: 'Restart growth' }).click();
		await page.getByRole('button', { name: 'Step one aperture ring forward' }).click();
		expect(Number(await age.inputValue())).toBeGreaterThan(0);
		await page.getByRole('button', { name: 'Play growth' }).click();
		await expect(page.getByRole('button', { name: 'Pause growth' })).toBeVisible();
		await page.getByRole('button', { name: 'Pause growth' }).click();
	});

	test('keeps analytic-only controls honest when an accretion preset is active', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		await page.getByRole('tab', { name: /Experiments/ }).click();
		await page.getByRole('button', { name: /^Alternating winding sense/ }).click();
		await expect(page.getByLabel('Integration span numeric value')).toBeVisible();
		await expect(page.getByLabel('Coil tightness numeric value')).toHaveCount(0);

		await page.getByRole('tab', { name: 'Advanced' }).click();
		await expect(page.getByLabel('Analytic planar curve')).toBeDisabled();
		await expect(page.getByLabel('Analytic expansion per radian numeric value')).toBeDisabled();
		await expect(page.getByText('Model B control boundary.')).toBeVisible();
	});

	test('downloads a versioned recipe and aperture history', async ({ page }, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		await page.getByRole('button', { name: 'Export' }).click();
		const dialog = page.getByRole('dialog', { name: 'Export the specimen' });
		const jsonDownloadPromise = page.waitForEvent('download');
		await dialog.getByRole('button', { name: /^\.shell\.json/ }).click();
		const recipe = JSON.parse(await downloadedText(await jsonDownloadPromise)) as {
			schemaVersion: number;
			name: string;
		};
		expect(recipe).toMatchObject({ schemaVersion: 2, name: 'Living aperture' });

		const csvButton = dialog.getByRole('button', { name: /^CSV/ });
		await expect(csvButton).toBeEnabled({ timeout: SHELL_READY_TIMEOUT });
		const csvDownloadPromise = page.waitForEvent('download');
		await csvButton.click();
		const csv = await downloadedText(await csvDownloadPromise);
		expect(csv.split('\n')[0]).toContain('ring,age,theta,center_x');
		expect(csv.split('\n').length).toBeGreaterThan(100);

		const recipeSheetPromise = page.waitForEvent('popup');
		await dialog.getByRole('button', { name: /^Recipe sheet/ }).click();
		const recipeSheet = await recipeSheetPromise;
		await expect(recipeSheet).toHaveTitle(/Living aperture — recipe sheet/);
		await expect(recipeSheet.getByRole('button', { name: 'Print / Save PDF' })).toBeVisible();
		await expect(recipeSheet.getByRole('heading', { name: 'Central equations' })).toBeVisible();
		await recipeSheet.close();
	});

	test('has no serious accessibility violations in the embedded instrument', async ({
		page
	}, testInfo) => {
		desktopOnly(testInfo);
		await openLaboratory(page);
		const audit = await new AxeBuilder({ page })
			.include('.living-aperture-lab')
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		const serious = audit.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious'
		);
		expect(
			serious,
			serious.map((violation) => `${violation.id}: ${violation.help}`).join('\n')
		).toEqual([]);
	});

	test('has no horizontal page overflow at desktop, tablet, or mobile width', async ({
		page
	}, testInfo) => {
		const sizes = {
			desktop: { width: 1440, height: 1000 },
			tablet: { width: 768, height: 1024 },
			mobile: { width: 360, height: 800 }
		} as const;
		await page.setViewportSize(sizes[testInfo.project.name as keyof typeof sizes]);
		await openLaboratory(page);
		if (testInfo.project.name !== 'desktop') {
			const sheet = page.locator('button.sheet-handle');
			await expect(sheet).toBeVisible();
			await sheet.click();
			await expect(page.getByRole('heading', { name: 'Quick Sculpt' })).toBeVisible();
		}
		const overflow = await page.evaluate(() =>
			Math.max(
				document.documentElement.scrollWidth - document.documentElement.clientWidth,
				document.body.scrollWidth - document.body.clientWidth
			)
		);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
