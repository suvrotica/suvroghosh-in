import { expect, test, type Download, type Page } from '@playwright/test';
import sharp from 'sharp';

const articlePath = '/blog/visualizations/reaction-diffusion-atlas';
const articleTitle = 'The Chemistry That Draws Without a Hand: A Reaction–Diffusion Atlas';
const runtimeDiagnostics = new WeakMap<Page, string[]>();

function collectUnexpectedRuntimeDiagnostics(page: Page) {
	const diagnostics: string[] = [];
	page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/') || /favicon/iu.test(source)) return;
		diagnostics.push(`console error: ${message.text()}`);
	});
	return diagnostics;
}

function observatory(page: Page) {
	return page.locator('#reaction-diffusion-observatory');
}

async function waitForObservatory(page: Page) {
	const lab = observatory(page);
	await expect(lab).toBeVisible();
	await lab.scrollIntoViewIfNeeded();
	await expect(lab.locator('.stage-status')).toContainText(
		/GPU|CPU Worker|floating-point|Exact initial state restored/iu,
		{
			timeout: 60_000
		}
	);
	return lab;
}

async function downloadBytes(download: Download) {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream)
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks);
}

async function telemetryStep(page: Page) {
	const text = await observatory(page)
		.locator('.telemetry > div')
		.filter({ hasText: /^step/iu })
		.locator('strong')
		.innerText();
	return Number(text.trim());
}

test.beforeEach(({ page }) => {
	runtimeDiagnostics.set(page, collectUnexpectedRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(runtimeDiagnostics.get(page) ?? []).toEqual([]);
});

test('the article, guided sequence and float-or-worker observatory hydrate cleanly', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain(articleTitle);
	expect(html).toContain('/images/reaction-diffusion-atlas.png');
	expect(html).toContain('Six things to notice before touching every knob');
	// SSR describes the requested 256² setup. The client may later adopt an
	// effective 128² CPU grid, but that fallback must not leak into server HTML.
	expect(html).toContain('0.08000');
	expect(html).not.toContain('0.02000');

	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { level: 1, name: articleTitle })).toHaveCount(1);
	await expect(
		page.getByRole('heading', { name: 'Six things to notice before touching every knob' })
	).toBeVisible();
	const guided = page.locator('section.guided');
	await expect(guided.getByRole('button', { name: /Replay observation/iu })).toBeVisible();
	await expect(guided.locator('.stage-index button')).toHaveCount(6);
	const lab = await waitForObservatory(page);
	await expect(lab.locator('.field-stack')).toBeVisible();
	await expect(lab.getByLabel('Calibrated preset')).toHaveValue('');
	await expect(lab.getByLabel('Resolution')).not.toHaveValue('');
	await expect(lab.getByLabel('Speed')).toHaveValue('2');
	await expect(lab.locator('.panel-tabs button')).toHaveCount(5);
	await expect(lab.getByText(/schema 1 · five-point Laplacian/iu)).toBeVisible();
	const scale = lab.locator('.field-stack .scale');
	await expect(scale).toContainText('64 model units');
	const scaleGeometry = await scale.evaluate((element) => {
		const scaleBounds = element.getBoundingClientRect();
		const fieldBounds = element.parentElement?.getBoundingClientRect();
		const barBounds = element.querySelector('span')?.getBoundingClientRect();
		return {
			scaleFraction: fieldBounds ? scaleBounds.width / fieldBounds.width : 0,
			barFraction: barBounds ? barBounds.width / scaleBounds.width : 0
		};
	});
	expect(scaleGeometry.scaleFraction).toBeCloseTo(0.25, 2);
	expect(scaleGeometry.barFraction).toBeCloseTo(1, 2);
	const initialEngineStatus = await lab.locator('.stage-status').innerText();
	if (/RGBA(?:16|32)F/iu.test(initialEngineStatus)) {
		const gpuCanvas = lab.locator('.field-stack > canvas.visible');
		const contextLossSupported = await gpuCanvas.evaluate((canvas) => {
			const context = (canvas as HTMLCanvasElement).getContext('webgl2');
			const extension = context?.getExtension('WEBGL_lose_context');
			if (!extension) return false;
			extension.loseContext();
			return true;
		});
		if (contextLossSupported) {
			await expect(lab.locator('.stage-status')).toContainText(/context was interrupted/iu);
			await gpuCanvas.evaluate((canvas) => {
				(canvas as HTMLCanvasElement)
					.getContext('webgl2')
					?.getExtension('WEBGL_lose_context')
					?.restoreContext();
			});
			await expect(lab.locator('.stage-status')).toContainText(/restored|Float64 CPU Worker/iu, {
				timeout: 60_000
			});
		}
	}
	const desktopGeometry = await lab.evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		return { left: bounds.left, right: bounds.right, viewport: window.innerWidth };
	});
	expect(desktopGeometry.left).toBeGreaterThanOrEqual(0);
	expect(desktopGeometry.right).toBeLessThanOrEqual(desktopGeometry.viewport);
	const duplicateIds = await page.evaluate(() => {
		const counts = new Map<string, number>();
		for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
			counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
		}
		return [...counts.entries()].filter(([, count]) => count > 1);
	});
	expect(duplicateIds).toEqual([]);

	await page.getByRole('link', { name: 'Essays', exact: true }).click();
	await expect(page).toHaveURL(/\/blog$/u);
	await page.goBack({ waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { level: 1, name: articleTitle })).toBeVisible();
	await waitForObservatory(page);
});

test('the deterministic CPU Worker steps, pauses and survives diagnostic tab changes', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForObservatory(page);
	await expect(lab.locator('.stage-status')).toContainText('Float64 CPU Worker', {
		timeout: 60_000
	});
	await expect(lab.locator('.stage-status')).toContainText(
		/reduced to 128 × 128.*not a continuation/iu
	);
	expect(await telemetryStep(page)).toBe(0);
	const cpuField = lab.locator('.field-frame canvas');
	await cpuField.click({ position: { x: 120, y: 120 } });
	await page.waitForTimeout(150);
	expect(await telemetryStep(page)).toBe(0);
	await cpuField.press('Enter');
	await page.waitForTimeout(150);
	expect(await telemetryStep(page)).toBe(0);
	await expect(
		lab
			.locator('.telemetry > div')
			.filter({ hasText: /^events/iu })
			.locator('strong')
	).toHaveText('0 / 2000');
	await lab.getByRole('button', { name: 'Single step' }).click();
	await expect.poll(() => telemetryStep(page)).toBe(1);
	await lab.getByRole('button', { name: 'Run', exact: true }).click();
	await expect.poll(() => telemetryStep(page)).toBeGreaterThan(2);
	await lab.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.waitForTimeout(300);
	const pausedAt = await telemetryStep(page);

	// Headless Chromium does not mark a background Page as hidden. Override the
	// read-only signal and dispatch the native event so this still exercises the
	// observatory's exact visibilitychange suspension and restart path.
	await lab.getByRole('button', { name: 'Run', exact: true }).click();
	await expect.poll(() => telemetryStep(page)).toBeGreaterThan(pausedAt);
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: true });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await page.waitForTimeout(100);
	const hiddenAt = await telemetryStep(page);
	await page.waitForTimeout(400);
	expect(await telemetryStep(page)).toBe(hiddenAt);
	await page.evaluate(() => {
		Reflect.deleteProperty(document, 'hidden');
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect.poll(() => page.evaluate(() => document.hidden)).toBe(false);
	await expect.poll(() => telemetryStep(page)).toBeGreaterThan(hiddenAt);
	await page
		.getByRole('heading', { name: '13. What this model does not establish' })
		.scrollIntoViewIfNeeded();
	await page.waitForTimeout(200);
	const offscreenAt = await telemetryStep(page);
	await page.waitForTimeout(400);
	expect(await telemetryStep(page)).toBe(offscreenAt);
	await lab.scrollIntoViewIfNeeded();
	await expect.poll(() => telemetryStep(page)).toBeGreaterThan(offscreenAt);
	await lab.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.waitForTimeout(300);
	const pausedAfterVisibilityCycle = await telemetryStep(page);

	await lab.getByRole('button', { name: 'Diagnostics' }).click();
	await expect(
		lab.getByRole('heading', { name: 'Live local ledger and global chemical budget' })
	).toBeVisible();
	const budget = lab.locator('section.budget');
	await expect(budget).toContainText(/first stage estimate for Heun/iu);
	await expect(budget.getByText('on demand', { exact: true })).toHaveCount(4);
	await lab.getByRole('button', { name: 'Measure now' }).click();
	await expect(lab.getByRole('button', { name: 'Measure now' })).toBeEnabled({ timeout: 60_000 });
	await expect(budget).toContainText(/Heun-integrated term contributions/iu);
	await expect(budget.getByText('on demand', { exact: true })).toHaveCount(0);
	await expect(lab.locator('.peak-card')).toContainText(/Credible peak|No invented peak/iu);
	await lab.getByRole('button', { name: 'Numerical honesty' }).click();
	const timestepComparison = lab.locator('.honesty-panel article').filter({
		hasText: 'Does halving the step change the field at equal model time?'
	});
	await expect(lab.locator('.worker-status')).toContainText(/dedicated CPU Worker/iu);
	await timestepComparison.getByRole('button', { name: 'Run comparison' }).click();
	await expect(timestepComparison.getByRole('button', { name: 'Repeat comparison' })).toBeVisible({
		timeout: 60_000
	});
	await expect(timestepComparison).toContainText('equal model time');
	await lab.getByRole('button', { name: 'Laboratory' }).click();
	await expect.poll(() => telemetryStep(page)).toBe(pausedAfterVisibilityCycle);
});

test('unsafe integration needs explicit consent and shared URLs reject future schemas', async ({
	page
}) => {
	await page.goto(`${articlePath}?foo=preserved&rd_v=99`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForObservatory(page);
	await expect(lab.locator('.notice')).toContainText(/unsupported schema 99/iu);
	const timestep = lab.getByLabel('Timestep exact value');
	// This value exceeds the conservative diffusion ceiling at both the requested
	// 256² grid and the intentionally reduced 128² CPU fallback grid.
	await timestep.fill('20');
	await timestep.press('Tab');
	await expect(lab.locator('.stability')).toHaveAttribute('data-state', 'unsafe');
	const run = lab.getByRole('button', { name: 'Run', exact: true });
	await expect(run).toBeDisabled();
	const consent = lab.getByLabel(/I understand this is an unsafe numerical experiment/iu);
	await consent.check();
	await expect(run).toBeEnabled();

	// Consent belongs to one exact numerical experiment and must not leak into a
	// different parameter setup.
	const feed = lab.getByLabel('Feed F exact value');
	await feed.fill('0.04');
	await feed.press('Tab');
	await expect(run).toBeDisabled();
	await consent.check();
	await expect(run).toBeEnabled();

	await lab.getByRole('button', { name: 'Record & export' }).click();
	await lab.getByRole('button', { name: /Update this address/iu }).click();
	await expect.poll(() => new URL(page.url()).searchParams.get('foo')).toBe('preserved');
	await expect.poll(() => new URL(page.url()).searchParams.get('rd_v')).toBe('1');
	await page.reload({ waitUntil: 'domcontentloaded' });
	const restoredLab = await waitForObservatory(page);
	await expect(restoredLab.getByLabel('Feed F exact value')).toHaveValue('0.04');
	await expect(restoredLab.getByLabel('Timestep exact value')).toHaveValue('20');
	await restoredLab.getByRole('button', { name: 'Laboratory' }).click();
	await expect(restoredLab.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
});

test('counterfactual clocks remain synchronized and the live atlas loads a computed tile', async ({
	page
}) => {
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForObservatory(page);
	await lab.getByRole('button', { name: 'Compare' }).click();
	const compare = lab.locator('section.compare');
	await expect(compare).toBeVisible();
	const compareMethods = compare.getByLabel('Compare engine methods');
	await expect(compareMethods).toContainText(
		'Comparison engine: 64 × 64 cells, L = 64, h = 1.000, fixed-step Heun.'
	);
	await expect(compareMethods).toContainText(/Both panes share this reduced base/iu);
	const methodsStrip = compareMethods.locator('.methods-strip');
	await expect(methodsStrip).toContainText('64 × 64 cells');
	await expect(methodsStrip).toContainText('64 model units');
	await expect(methodsStrip).toContainText('fixed-step Heun');
	await expect(methodsStrip).toContainText('periodic · shared');
	await expect(methodsStrip).toContainText('observatory-2407 · shared');
	await compare.getByRole('button', { name: 'Step ×10' }).click();
	await expect(compare.locator('.clock small')).toContainText('A step 10 · B step 10');
	await expect(compare.locator('.measurement-grid dl')).toContainText('L² field difference');
	await compare.getByText('Timeline data table', { exact: true }).click();
	await expect(compare.getByRole('table')).toHaveCount(1);
	await expect(compare.getByRole('columnheader', { name: 'model time' })).toBeAttached();
	await compare.getByLabel('Brush target').selectOption('a');
	await compare.getByLabel('Counterfactual A concentration field').click({
		position: { x: 80, y: 80 }
	});
	await expect(compare.locator('.clock small')).toContainText('A step 11 · B step 11');
	await expect(compare.locator('.status')).toContainText('A only');
	await compare.getByLabel('Difference map').selectOption('absolute');
	await expect(compare.locator('.difference-card')).toContainText(/absolute/iu);

	const atlas = page.locator('section.atlas').first();
	await atlas.scrollIntoViewIfNeeded();
	await atlas.getByText('Atlas range and common observation time').click();
	await atlas.getByLabel('Model time').fill('20');
	await atlas.getByRole('button', { name: 'Calculate atlas' }).click();
	await expect(atlas.locator('.progress-block')).toContainText('100%', { timeout: 60_000 });
	await expect(atlas.locator('.tile-grid button')).toHaveCount(81);
	await atlas.locator('.tile-grid button').nth(20).click();
	await atlas.getByRole('button', { name: 'Use this tile in the laboratory' }).click();
	await expect(lab.getByRole('button', { name: 'Laboratory' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(lab.getByLabel('Feed F exact value')).not.toHaveValue('0.0367');
});

test('JSON, CSV and PNG exports carry the current documented experiment', async ({ page }) => {
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForObservatory(page);
	await lab.getByRole('button', { name: 'Step ×10' }).click();
	await expect.poll(() => telemetryStep(page)).toBe(10);
	await lab.getByRole('button', { name: 'Reconstruct in CPU reference' }).click();
	await expect.poll(() => telemetryStep(page), { timeout: 60_000 }).toBe(10);
	await lab.getByRole('button', { name: 'Record & export' }).click();

	const [jsonDownload] = await Promise.all([
		page.waitForEvent('download'),
		lab.getByRole('button', { name: /Experiment JSON/iu }).click()
	]);
	const record = JSON.parse((await downloadBytes(jsonDownload)).toString('utf8')) as {
		schemaVersion: number;
		engineVersion: string;
		model: string;
		step: number;
	};
	expect(record).toMatchObject({ schemaVersion: 1, model: 'gray-scott-2d', step: 10 });
	expect(record.engineVersion).toContain('heun-five-point');

	const [csvDownload] = await Promise.all([
		page.waitForEvent('download'),
		lab.getByRole('button', { name: /Measurements CSV/iu }).click()
	]);
	const csv = (await downloadBytes(csvDownload)).toString('utf8');
	expect(csv).toContain('step,modelTime,meanU,meanV');
	expect(csv.split('\n').length).toBeGreaterThan(1);

	const [pngDownload] = await Promise.all([
		page.waitForEvent('download'),
		lab.getByRole('button', { name: /Rendered PNG/iu }).click()
	]);
	const png = await downloadBytes(pngDownload);
	expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	const pngMetadata = await sharp(png).metadata();
	expect(pngMetadata).toMatchObject({ width: 512, height: 512, format: 'png' });
	const pngStats = await sharp(png).stats();
	expect(
		Math.max(...pngStats.channels.slice(0, 3).map((channel) => channel.stdev))
	).toBeGreaterThan(1);
});

test('mobile and no-JavaScript readers keep the plate, prose and controls bounded', async ({
	page,
	browser,
	baseURL
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForObservatory(page);
	const geometry = await lab.evaluate((element) => ({
		documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		labOverflow: element.scrollWidth - element.clientWidth,
		labWidth: element.getBoundingClientRect().width,
		fieldWidth:
			element.querySelector<HTMLElement>('.field-stack')?.getBoundingClientRect().width ?? 0
	}));
	expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
	expect(geometry.labOverflow).toBeLessThanOrEqual(1);
	expect(geometry.labWidth).toBeLessThanOrEqual(390);
	expect(geometry.fieldWidth).toBeGreaterThan(340);

	const touchContext = await browser.newContext({
		baseURL,
		hasTouch: true,
		isMobile: true,
		viewport: { width: 390, height: 844 }
	});
	const touchPage = await touchContext.newPage();
	const touchDiagnostics = collectUnexpectedRuntimeDiagnostics(touchPage);
	try {
		await touchPage.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
		const touchLab = await waitForObservatory(touchPage);
		const domainControls = touchLab.locator('details').filter({
			hasText: 'Domain, boundary, and disturbance'
		});
		await domainControls.locator('summary').click();
		await domainControls.getByLabel('Interaction').selectOption('paint');
		await expect(
			domainControls.getByLabel('Application').locator('option[value="path"]')
		).toHaveText('Drag a line intervention');
		await domainControls.getByLabel('Application').selectOption('once');
		const touchField = touchLab.locator('.field-frame canvas');
		await expect(touchField).toHaveCSS('touch-action', 'none');
		await touchField.scrollIntoViewIfNeeded();
		await expect(touchField).toBeInViewport();
		const touchBounds = await touchField.boundingBox();
		expect(touchBounds).not.toBeNull();
		await touchPage.touchscreen.tap(
			(touchBounds?.x ?? 0) + (touchBounds?.width ?? 0) / 2,
			(touchBounds?.y ?? 0) + (touchBounds?.height ?? 0) / 2
		);
		await expect(
			touchLab
				.locator('.telemetry > div')
				.filter({ hasText: /^events/iu })
				.locator('strong')
		).toHaveText('1 / 2000');
		expect(touchDiagnostics).toEqual([]);
	} finally {
		await touchContext.close();
	}

	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	const noScriptPage = await context.newPage();
	try {
		await noScriptPage.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(noScriptPage.getByRole('heading', { level: 1, name: articleTitle })).toBeVisible();
		await expect(noScriptPage.locator('.no-js-observatory img')).toBeVisible();
		await expect(noScriptPage.locator('.no-js-observatory')).toContainText('128² grid');
		await expect(noScriptPage.locator('.no-script img')).toBeVisible();
		const overflow = await noScriptPage.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);
	} finally {
		await context.close();
	}
});
