import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function sampleCanvasSignature(page: Page): Promise<string> {
	return await page.evaluate(() => {
		const canvas = document.querySelector('canvas.ps-canvas') as HTMLCanvasElement | null;
		if (!canvas || canvas.width === 0 || canvas.height === 0) return 'empty';
		const ctx = canvas.getContext('2d');
		if (!ctx) return 'no-ctx';
		const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		let h = 0x811c9dc5;
		for (let i = 0; i < data.length; i += 16) {
			h ^= data[i]!;
			h = Math.imul(h, 0x01000193) >>> 0;
			h ^= data[i + 1]!;
			h = Math.imul(h, 0x01000193) >>> 0;
			h ^= data[i + 2]!;
			h = Math.imul(h, 0x01000193) >>> 0;
		}
		return `${canvas.width}x${canvas.height}:${h.toString(16)}`;
	});
}

test.describe('Pointillism Studio fullscreen interactive experience', () => {
	test('opens directly onto artwork, plays 4-pass reveal with Pause/Resume/Finish now matching still render, and stays stable after completion', async ({
		browser
	}) => {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			reducedMotion: 'no-preference',
			serviceWorkers: 'block'
		});
		const page = await context.newPage();
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));

		await page.goto('/tools/pointillism-studio');
		await expect(
			page.getByText('Choose a Texas scene. Change the dots and colors. Watch the picture emerge.')
		).toBeVisible();

		const pauseBtn = page.getByRole('button', { name: 'Pause' });
		const finishBtn = page.getByRole('button', { name: 'Finish now' });
		await expect(pauseBtn).toBeVisible();
		await expect(finishBtn).toBeVisible();

		await pauseBtn.click();
		const resumeBtn = page.getByRole('button', { name: 'Resume' });
		await expect(resumeBtn).toBeVisible();
		const pausedSigA = await sampleCanvasSignature(page);
		await page.waitForTimeout(200);
		const pausedSigB = await sampleCanvasSignature(page);
		expect(pausedSigB).toBe(pausedSigA);

		await resumeBtn.click();
		await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await finishBtn.click();
		await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);

		const finishedSigA = await sampleCanvasSignature(page);
		await page.waitForTimeout(200);
		const finishedSigB = await sampleCanvasSignature(page);
		// Texture remains completely stable once completed.
		expect(finishedSigB).toBe(finishedSigA);

		const currentUrl = page.url();
		const stillCtx = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			reducedMotion: 'reduce',
			serviceWorkers: 'block'
		});
		const stillPage = await stillCtx.newPage();
		await stillPage.goto(currentUrl);
		await expect(stillPage.locator('canvas.ps-canvas')).toBeVisible();
		const directStillSig = await sampleCanvasSignature(stillPage);
		expect(finishedSigA).toBe(directStillSig);

		expect(errors).toEqual([]);
		await stillCtx.close();
		await context.close();
	});

	test('respects prefers-reduced-motion on load and New painting while allowing explicit Replay', async ({
		browser
	}) => {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			reducedMotion: 'reduce',
			serviceWorkers: 'block'
		});
		const page = await context.newPage();

		await page.goto('/tools/pointillism-studio');
		await expect(page.locator('canvas.ps-canvas')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);

		const initialMeta = await page.locator('.ps-meta-badge').textContent();
		await page.getByRole('button', { name: 'New painting' }).click();
		await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
		const nextMeta = await page.locator('.ps-meta-badge').textContent();
		expect(nextMeta).not.toBe(initialMeta);

		await page.getByRole('button', { name: 'Replay' }).click();
		await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await page.getByRole('button', { name: 'Finish now' }).click();
		await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);

		await context.close();
	});

	test('supports one-action Inspect dots, keyboard panning & sliders, Undo, scene switching, rapid inputs, and state-preserving Read the post', async ({
		browser
	}) => {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			reducedMotion: 'reduce',
			serviceWorkers: 'block'
		});
		const page = await context.newPage();
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));

		await page.goto('/tools/pointillism-studio');
		const canvas = page.locator('canvas.ps-canvas');
		await expect(canvas).toHaveAttribute('data-active-marks', '14392');
		const wholeSig = await sampleCanvasSignature(page);

		// One-action Inspect dots changes view without altering active marks or Dot size.
		await page.getByRole('button', { name: 'Inspect dots', exact: true }).click();
		await expect(canvas).toHaveAttribute('data-view-mode', 'inspect');
		await expect(canvas).toHaveAttribute('data-active-marks', '14392');
		const dotSizeSlider = page.getByRole('slider', { name: 'Dot size' });
		await expect(dotSizeSlider).toHaveValue('40');
		const inspectSigA = await sampleCanvasSignature(page);
		expect(inspectSigA).not.toBe(wholeSig);

		// Pan close-up with keyboard arrow and verify view shifts cleanly.
		await page.getByRole('button', { name: 'Pan inspection right' }).click();
		const inspectSigB = await sampleCanvasSignature(page);
		expect(inspectSigB).not.toBe(inspectSigA);

		// Return to whole painting restores exact original view.
		await page.getByRole('button', { name: 'Return to whole painting' }).click();
		await expect(canvas).toHaveAttribute('data-view-mode', 'fill');
		const wholeSigRestored = await sampleCanvasSignature(page);
		expect(wholeSigRestored).toBe(wholeSig);

		// Keyboard slider update + Undo from More options.
		await dotSizeSlider.focus();
		await page.keyboard.press('ArrowRight');
		await expect(dotSizeSlider).toHaveValue('41');

		await page.locator('summary', { hasText: 'More options' }).click();
		await page.getByRole('button', { name: /Undo/ }).click();
		await expect(dotSizeSlider).toHaveValue('40');

		// Switch scene family to Hill Country and preserve knobs.
		await page.getByRole('button', { name: 'Hill Country', exact: true }).click();
		await expect(page.locator('.ps-meta-badge')).toContainText('Seed 793409');
		await expect(dotSizeSlider).toHaveValue('40');
		const sigBeforeArticle = await sampleCanvasSignature(page);

		// Open accompanying draft article via Read the post and verify sources + state preservation.
		await page.getByRole('button', { name: 'Read the post' }).click();
		await expect(
			page.getByRole('heading', {
				level: 1,
				name: 'Pointillism: San Antonio and Texas in Dots of Color'
			})
		).toBeVisible();
		await expect(
			page.locator(
				'a[href="https://www.visitsanantonio.com/blog/post/enjoy-the-sunshine-outdoor-adventures-to-experience-in-san-antonio/"]'
			)
		).toBeVisible();
		await expect(
			page.locator(
				'a[href="https://tpwd.texas.gov/landwater/water/environconcerns/regions/hillcountry.phtml"]'
			)
		).toBeVisible();
		await expect(
			page.locator(
				'a[href="https://www.metmuseum.org/essays/georges-seurat-1859-1891-and-neo-impressionism"]'
			)
		).toBeVisible();
		await expect(
			page.locator('a[href="https://archive.artic.edu/seurat/seurat_themes.html"]')
		).toBeVisible();

		await page.getByRole('button', { name: '← Return to painting' }).first().click();
		await expect(page.locator('.ps-meta-badge')).toContainText('Seed 793409');
		const sigAfterArticle = await sampleCanvasSignature(page);
		expect(sigAfterArticle).toBe(sigBeforeArticle);

		// Rapid New painting clicks never throw or corrupt accessible description.
		const newBtn = page.getByRole('button', { name: 'New painting' });
		for (let i = 0; i < 4; i++) {
			await newBtn.click();
		}
		const ariaLabel = await canvas.getAttribute('aria-label');
		expect(ariaLabel).toContain('Hill Country');
		expect(errors).toEqual([]);

		await context.close();
	});

	test('preserves artboard & uniform aspect ratio across resizes, supports mobile bottom sheet, and exports full 2048px PNG even while zoomed in', async ({
		browser
	}) => {
		// 1. Mobile bottom sheet check (390x844)
		const phoneCtx = await browser.newContext({
			viewport: { width: 390, height: 844 },
			reducedMotion: 'reduce',
			serviceWorkers: 'block'
		});
		const phonePage = await phoneCtx.newPage();
		await phonePage.goto('/tools/pointillism-studio');
		const controlsBtn = phonePage.getByRole('button', { name: 'Controls', exact: true });
		await expect(controlsBtn).toHaveAttribute('aria-expanded', 'false');
		await controlsBtn.click();
		await expect(controlsBtn).toHaveAttribute('aria-expanded', 'true');

		const trayBox = await phonePage.locator('#pointillism-controls-tray').boundingBox();
		expect(trayBox).not.toBeNull();
		expect(trayBox!.height).toBeLessThanOrEqual(844 * 0.5);
		await phonePage.getByRole('button', { name: 'Close controls' }).click();
		await expect(controlsBtn).toHaveAttribute('aria-expanded', 'false');
		await phoneCtx.close();

		// 2. Resize & export check: resizing preserves fixed 1200x800 artboard, 14,392 marks, and 1.50 uniform ratio.
		const ctx = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			reducedMotion: 'reduce',
			acceptDownloads: true,
			serviceWorkers: 'block'
		});
		const page = await ctx.newPage();
		await page.goto('/tools/pointillism-studio');

		const canvas = page.locator('canvas.ps-canvas');
		await expect(canvas).toHaveAttribute('data-artboard', '1200x800');
		await expect(canvas).toHaveAttribute('data-active-marks', '14392');

		// Switch to Fit painting and resize to portrait tablet: artboard & 3:2 aspect ratio stay unstretched.
		await page.getByRole('button', { name: 'View', exact: true }).click();
		await page.getByRole('button', { name: /Fit painting/ }).click();
		await page.setViewportSize({ width: 820, height: 1180 });
		await page.waitForTimeout(120);

		await expect(canvas).toHaveAttribute('data-artboard', '1200x800');
		await expect(canvas).toHaveAttribute('data-active-marks', '14392');
		const fitBox = await canvas.boundingBox();
		expect(fitBox).not.toBeNull();
		expect(fitBox!.width / fitBox!.height).toBeCloseTo(1.5, 2);

		// Enter Inspect dots (zoomed crop) and trigger Save whole painting (2048 px) — must export full 2048x1365 artwork!
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.getByRole('button', { name: 'Inspect dots', exact: true }).click();
		await expect(canvas).toHaveAttribute('data-view-mode', 'inspect');

		await page.getByRole('button', { name: 'Save image' }).click();
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: /Save whole painting · Large PNG/ }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe('pointillism-river-path-seed-418206-2048x1365.png');

		const downloadPath = await download.path();
		expect(downloadPath).toBeTruthy();
		const pngBytes = await readFile(downloadPath!);
		// PNG magic header + IHDR width=2048, height=1365
		expect(pngBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
			true
		);
		expect(pngBytes.readUInt32BE(16)).toBe(2048);
		expect(pngBytes.readUInt32BE(20)).toBe(1365);

		await ctx.close();
	});
});
