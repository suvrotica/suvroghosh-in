import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function sampleCanvasSignature(page: Page): Promise<string> {
	return await page.evaluate(() => {
		const canvas = document.querySelector('canvas.ms-canvas') as HTMLCanvasElement | null;
		if (!canvas || canvas.width === 0 || canvas.height === 0) return 'empty';
		const ctx = canvas.getContext('2d');
		if (!ctx) return 'no-ctx';
		const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		// FNV-1a hash across strided pixels for fast exact frame comparison.
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

test.describe('Mondrian Studio fullscreen interactive experience', () => {
	test('plays initial brush reveal with Pause, Resume, and Finish now matching direct still render', async ({
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

		await page.goto('/tools/mondrian-studio');
		await expect(
			page.getByText('Change the spacing, color, and paint. Watch a new composition take shape.')
		).toBeVisible();

		// Pause and Finish now are immediately exposed in the toolbar during playback.
		const pauseBtn = page.getByRole('button', { name: 'Pause' });
		const finishBtn = page.getByRole('button', { name: 'Finish now' });
		await expect(pauseBtn).toBeVisible();
		await expect(finishBtn).toBeVisible();

		// Pause preserves exact progress with zero drift.
		await pauseBtn.click();
		const resumeBtn = page.getByRole('button', { name: 'Resume' });
		await expect(resumeBtn).toBeVisible();
		const pausedSigA = await sampleCanvasSignature(page);
		await page.waitForTimeout(220);
		const pausedSigB = await sampleCanvasSignature(page);
		expect(pausedSigB).toBe(pausedSigA);

		// Resume continues playback; Finish now completes to the authoritative finished image.
		await resumeBtn.click();
		await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await finishBtn.click();
		await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);

		const finishedSig = await sampleCanvasSignature(page);
		expect(finishedSig).not.toBe(pausedSigA);

		// Compare against a fresh reduced-motion direct still render of the exact same URL state.
		const currentUrl = page.url();
		const stillCtx = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			reducedMotion: 'reduce',
			serviceWorkers: 'block'
		});
		const stillPage = await stillCtx.newPage();
		await stillPage.goto(currentUrl);
		await expect(stillPage.locator('canvas.ms-canvas')).toBeVisible();
		const directStillSig = await sampleCanvasSignature(stillPage);
		expect(finishedSig).toBe(directStillSig);

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

		await page.goto('/tools/mondrian-studio');
		await expect(page.locator('canvas.ms-canvas')).toBeVisible();
		// Under reduced motion, initial load renders finished painting immediately.
		await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);

		const initialSeedText = await page.locator('.ms-seed-badge').textContent();
		await page.getByRole('button', { name: 'New painting' }).click();
		await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
		const nextSeedText = await page.locator('.ms-seed-badge').textContent();
		expect(nextSeedText).not.toBe(initialSeedText);

		// Explicit Replay is still honored with Pause and Finish now available.
		await page.getByRole('button', { name: 'Replay' }).click();
		await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		await page.getByRole('button', { name: 'Finish now' }).click();
		await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);

		await context.close();
	});

	test('supports presets (preserving seed), keyboard sliders, Undo, rapid actions, and state-preserving article reader', async ({
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

		await page.goto('/tools/mondrian-studio');
		await expect(page.locator('.ms-seed-badge')).toHaveText('Seed 100779');

		// Selecting presets preserves Seed 100779 while updating parameters.
		await page.getByRole('button', { name: 'Spare' }).click();
		await expect(page.locator('.ms-seed-badge')).toHaveText('Seed 100779');
		const panelsSlider = page.getByRole('slider', { name: 'Panels' });
		await expect(panelsSlider).toHaveValue('9');

		// Keyboard slider operation updates Panels cleanly.
		await panelsSlider.focus();
		await page.keyboard.press('ArrowRight');
		await expect(panelsSlider).toHaveValue('10');

		// Undo from More options restores 9 panels.
		await page.locator('summary', { hasText: 'More options' }).click();
		await page.getByRole('button', { name: /Undo/ }).click();
		await expect(panelsSlider).toHaveValue('9');

		// Apply custom seed 246810 and capture canvas state before opening article.
		const seedInput = page.getByRole('textbox', { name: 'Composition seed' });
		await seedInput.fill('246810');
		await page.getByRole('button', { name: 'Apply' }).click();
		await expect(page.locator('.ms-seed-badge')).toHaveText('Seed 246810');
		const sigBeforeArticle = await sampleCanvasSignature(page);

		// Open accompanying article and verify title + historical links + Return to painting preservation.
		await page.getByRole('button', { name: 'Read about Mondrian' }).click();
		await expect(
			page.getByRole('heading', { level: 1, name: 'Piet Mondrian: A Pioneer of Abstract Art' })
		).toBeVisible();
		await expect(page.locator('a[href="https://www.moma.org/artists/4057-piet-mondrian"]')).toBeVisible();
		await expect(
			page.locator('a[href="https://www.nationalgalleries.org/art-and-artists/glossary-terms/de-stijl-style"]')
		).toBeVisible();
		await expect(
			page.locator('a[href="https://www.metmuseum.org/essays/geometric-abstraction"]')
		).toBeVisible();
		await expect(page.locator('a[href="https://www.moma.org/collection/works/78682"]')).toBeVisible();

		await page.getByRole('button', { name: '← Return to painting' }).first().click();
		await expect(page.locator('.ms-seed-badge')).toHaveText('Seed 246810');
		const sigAfterArticle = await sampleCanvasSignature(page);
		expect(sigAfterArticle).toBe(sigBeforeArticle);

		// Rapid New painting spam never corrupts state or throws errors.
		const newBtn = page.getByRole('button', { name: 'New painting' });
		for (let i = 0; i < 5; i++) {
			await newBtn.click();
		}
		const canvasLabel = await page.locator('canvas.ms-canvas').getAttribute('aria-label');
		expect(canvasLabel).toContain('Nine rectangular panels');
		expect(errors).toEqual([]);

		await context.close();
	});

	test('maintains accessible mobile layout across portrait phone, short landscape, and tablet, and exports clean 2048px PNG', async ({
		browser
	}) => {
		// 1. Portrait phone layout check (390x844)
		const phoneCtx = await browser.newContext({
			viewport: { width: 390, height: 844 },
			reducedMotion: 'reduce',
			serviceWorkers: 'block'
		});
		const phonePage = await phoneCtx.newPage();
		await phonePage.goto('/tools/mondrian-studio');
		// On phones, tray starts closed so artwork leads; Controls opens bottom sheet leaving >50% painting visible.
		const controlsBtn = phonePage.getByRole('button', { name: 'Controls', exact: true });
		await expect(controlsBtn).toHaveAttribute('aria-expanded', 'false');
		await controlsBtn.click();
		await expect(controlsBtn).toHaveAttribute('aria-expanded', 'true');

		const trayBox = await phonePage.locator('#mondrian-controls-tray').boundingBox();
		expect(trayBox).not.toBeNull();
		expect(trayBox!.height).toBeLessThanOrEqual(844 * 0.46);
		await expect(phonePage.getByRole('button', { name: 'Close controls' })).toBeVisible();
		await phonePage.getByRole('button', { name: 'Close controls' }).click();
		await expect(controlsBtn).toHaveAttribute('aria-expanded', 'false');
		await phoneCtx.close();

		// 2. Short landscape phone (740x380) & Tablet (820x1180)
		for (const vp of [
			{ width: 740, height: 380 },
			{ width: 820, height: 1180 }
		]) {
			const ctx = await browser.newContext({
				viewport: vp,
				reducedMotion: 'reduce',
				serviceWorkers: 'block'
			});
			const p = await ctx.newPage();
			await p.goto('/tools/mondrian-studio');
			const cBox = await p.locator('canvas.ms-canvas').boundingBox();
			expect(cBox?.width).toBe(vp.width);
			expect(cBox?.height).toBe(vp.height);
			await ctx.close();
		}

		// 3. Desktop PNG export + saved original ratio option verification (1440x900 = 1.60:1)
		const exportCtx = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			reducedMotion: 'reduce',
			acceptDownloads: true,
			serviceWorkers: 'block'
		});
		const exportPage = await exportCtx.newPage();
		await exportPage.goto(
			'/tools/mondrian-studio?v=1&s=100779&p=14&u=65&ca=28&lw=0.7&pt=40&t=8&ce=balanced&ar=1.000'
		);

		await exportPage.getByRole('button', { name: 'Save image' }).click();
		await expect(exportPage.getByRole('button', { name: /Original saved ratio/ })).toBeVisible();

		const downloadPromise = exportPage.waitForEvent('download');
		await exportPage.getByRole('button', { name: /Save PNG · Standard/ }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe('mondrian-seed-100779-2048x1280.png');

		const downloadPath = await download.path();
		expect(downloadPath).toBeTruthy();
		const pngBytes = await readFile(downloadPath!);
		// Verify PNG magic signature and IHDR width=2048, height=1280.
		expect(pngBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
		const pngWidth = pngBytes.readUInt32BE(16);
		const pngHeight = pngBytes.readUInt32BE(20);
		expect(pngWidth).toBe(2048);
		expect(pngHeight).toBe(1280);

		await exportCtx.close();
	});
});
