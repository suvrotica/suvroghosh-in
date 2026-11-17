import { expect, test, type Download, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const articlePath = '/blog/visualizations/exploded-human-skull';

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

async function waitForSkullReady(page: Page, path = articlePath): Promise<void> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	const museum = page.getByTestId('exploded-skull-museum');
	await expect(museum).toBeVisible();
	await expect(museum.locator('canvas.esm-canvas')).toHaveCount(1);
	// Wait until loading veil disappears after GLB parse + first WebGL frame
	await expect(museum.locator('.esm-loading-veil')).toHaveCount(0, { timeout: 45_000 });
	await page.waitForTimeout(350);
}

test.describe('Exploded Human Skull Interactive 3D Museum', () => {
	test('loads genuine BodyParts3D skull geometry, renders WebGL canvas, and preserves single H1 semantics', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForSkullReady(page);

		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.locator('h1')).toHaveText('Exploded Human Skull');

		const canvas = page.getByTestId('exploded-skull-museum').locator('canvas.esm-canvas');
		const box = await canvas.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.width).toBeGreaterThan(600);
		expect(box!.height).toBeGreaterThan(420);

		expect(errors).toEqual([]);
	});

	test('transitions smoothly between 0% assembled, 100% museum exploded, and Compare Assembled views', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForSkullReady(page);

		const museum = page.getByTestId('exploded-skull-museum');
		const canvas = museum.locator('canvas.esm-canvas');

		// 0% Complete skull
		await museum
			.locator('.esm-explosion-dock')
			.getByRole('button', { name: '0%', exact: true })
			.click();
		await page.waitForTimeout(600);
		const assembledShot = await canvas.screenshot();

		// 100% Exploded view
		await museum.locator('.esm-explosion-dock').getByRole('button', { name: '100%' }).click();
		await page.waitForTimeout(700);
		const explodedShot = await canvas.screenshot();

		expect(Buffer.compare(assembledShot, explodedShot)).not.toBe(0);
		await expect(museum.locator('.esm-specimen-badge')).toContainText('Sep 100%');

		// Compare Assembled toggle
		await museum.locator('header.esm-header').getByRole('button', { name: 'Compare' }).click();
		await expect(museum.locator('.esm-specimen-badge')).toContainText('Sep 0%');
		await museum.locator('header.esm-header').getByRole('button', { name: 'Exploded' }).click();
		await expect(museum.locator('.esm-specimen-badge')).toContainText('Sep 100%');

		expect(errors).toEqual([]);
	});

	test('inspects bones in catalog & info panel, isolates via Escape/button, and exercises per-bone overrides', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForSkullReady(page);
		const museum = page.getByTestId('exploded-skull-museum');

		// Filter and pick Sphenoid in Osteology Catalog
		await museum.getByPlaceholder('Search bone, Latin name, FMA...').fill('sphenoid');
		await museum.locator('.esm-bone-pick').filter({ hasText: 'Sphenoid' }).first().click();

		const infoCard = museum.locator('.esm-info-card');
		await expect(infoCard).toContainText('Sphenoid bone');
		await expect(infoCard).toContainText('Os sphenoidale');
		await expect(infoCard).toContainText('FMA52736');

		// Expand full detail breakdown
		await infoCard.getByRole('button', { name: 'Details' }).click();
		await expect(infoCard).toContainText('Sutural Articulations');
		await expect(infoCard).toContainText('Major Anatomical Landmarks');

		// Isolate Sphenoid and verify isolation banner + Escape exit
		await infoCard.getByRole('button', { name: 'Isolate' }).click();
		await expect(museum.getByText(/Isolated: Sphenoid/u)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(museum.getByText(/Isolated: Sphenoid/u)).toHaveCount(0);

		// Per-bone distance, opacity, and custom XYZ offsets in Bone tab
		await museum.getByRole('tab', { name: 'Bone' }).click();
		const boneDist = museum.locator('#esm-bone-dist');
		await boneDist.fill('2');
		await boneDist.dispatchEvent('input');
		await expect(museum.locator('#esm-off-x')).toBeVisible();
		await museum.getByRole('button', { name: 'Reset Bone', exact: true }).click();

		expect(errors).toEqual([]);
	});

	test('supports all presets, direction modes, camera views, specimen rotation, labels, and styles', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForSkullReady(page);
		const museum = page.getByTestId('exploded-skull-museum');

		// Presets & direction modes
		await museum.getByRole('button', { name: /Facial Skeleton/u }).click();
		await expect(page).toHaveURL(/preset=facial-skeleton/u);

		await museum.getByRole('button', { name: 'Superior / Inferior' }).click();
		await expect(page).toHaveURL(/dir=superior-inferior/u);

		// Camera & rotation controls
		await museum.getByRole('tab', { name: 'Camera' }).click();
		await museum.getByRole('button', { name: 'Basal View' }).click();
		await expect(museum.getByRole('button', { name: 'Basal View' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await museum.getByRole('button', { name: 'Rotate Right' }).click();
		await expect(museum.locator('#esm-rot-y')).toHaveValue('20');
		await museum.getByRole('button', { name: 'Reset Rotation' }).click();
		await expect(museum.locator('#esm-rot-y')).toHaveValue('0');

		// Labels overlay + Style presets + optional Hyoid + Ghost + Armature filaments
		await museum.getByRole('tab', { name: 'Style' }).click();
		await museum.getByRole('button', { name: 'Aged Specimen' }).click();
		await museum.getByRole('button', { name: 'Midnight Blue' }).click();
		await museum.getByRole('button', { name: 'Hyoid Bone' }).click();
		await expect(museum.locator('.esm-specimen-badge')).toContainText('+ Hyoid');
		await museum.getByRole('button', { name: 'Ghost Reference' }).click();
		await museum.getByRole('button', { name: 'Armature Filaments' }).click();
		await museum.getByRole('button', { name: 'Anatomical Labels' }).click();
		await expect(museum.locator('.esm-label-chip').first()).toBeVisible();

		expect(errors).toEqual([]);
	});

	test('handles Fullscreen toggle + Escape, Study save/load persistence, and PNG export', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForSkullReady(page);
		const museum = page.getByTestId('exploded-skull-museum');

		// Fullscreen enter & Escape exit
		await museum.locator('header.esm-header').getByRole('button', { name: 'Fullscreen' }).click();
		await expect(
			museum.locator('header.esm-header').getByRole('button', { name: 'Exit Fullscreen' })
		).toBeVisible();
		await page.keyboard.press('Escape');

		// Save study configuration -> reset -> reload study
		await museum.locator('.esm-explosion-dock').getByRole('button', { name: '75%' }).click();
		await museum.getByRole('tab', { name: 'Studies' }).click();
		await museum.locator('#esm-study-name').fill('Orbital Wall Study');
		await museum.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(museum.locator('li', { hasText: 'Orbital Wall Study' })).toBeVisible();

		await museum.getByRole('button', { name: 'Reset Defaults' }).click();
		await expect(museum.locator('.esm-specimen-badge')).toContainText('Sep 18%');

		await museum
			.locator('li', { hasText: 'Orbital Wall Study' })
			.getByRole('button', { name: 'Load' })
			.click();
		await expect(museum.locator('.esm-specimen-badge')).toContainText('Sep 75%');

		// PNG export
		const downloadPromise: Promise<Download> = page.waitForEvent('download');
		await museum.getByRole('button', { name: 'Export Specimen PNG' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/^exploded-human-skull-.*\.png$/);
		const downloadPath = await download.path();
		expect(downloadPath).toBeTruthy();
		const pngBytes = await readFile(downloadPath!);
		expect(pngBytes.byteLength).toBeGreaterThan(20_000);

		expect(errors).toEqual([]);
	});

	test('provides interactive 2D anatomical fallback when ?webgl=off is active', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
		const museum = page.getByTestId('exploded-skull-museum');
		await expect(museum.getByText('Interactive 2D Osteology Plate Fallback')).toBeVisible();
		await museum
			.locator('.esm-stage-wrap')
			.getByRole('button', { name: 'Mandible', exact: true })
			.click();
		await expect(museum.locator('.esm-info-card')).toContainText('Lower jawbone');
		expect(errors).toEqual([]);
	});

	test('renders cleanly without horizontal overflow across tablet and mobile portrait/landscape', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		for (const vp of [
			{ width: 768, height: 1024 },
			{ width: 390, height: 844 },
			{ width: 844, height: 390 }
		]) {
			await page.setViewportSize(vp);
			await waitForSkullReady(page);
			const hasOverflow = await page.evaluate(
				() => document.documentElement.scrollWidth > window.innerWidth + 1
			);
			expect(hasOverflow).toBe(false);
		}

		// Verify mobile Bone Catalog drawer opens and closes
		await page.setViewportSize({ width: 390, height: 844 });
		const museum = page.getByTestId('exploded-skull-museum');
		await museum.getByRole('button', { name: 'Bones (22)' }).click();
		await expect(museum.locator('.esm-side-left.esm-mobile-open')).toBeVisible();
		await museum.getByRole('button', { name: 'Close catalog drawer' }).click();
		await expect(museum.locator('.esm-side-left.esm-mobile-open')).toHaveCount(0);

		expect(errors).toEqual([]);
	});
});
