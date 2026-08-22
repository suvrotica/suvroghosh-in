import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/domain-coloring-complex-functions-explorer';

function laboratory(page: Page) {
	return page.getByTestId('domain-coloring-lab');
}

function twoDimensionalStage(page: Page) {
	return laboratory(page).getByTestId('domain-2d-stage');
}

function threeDimensionalStage(page: Page) {
	return laboratory(page).getByTestId('domain-3d-stage');
}

async function waitForHydration(page: Page) {
	const lab = laboratory(page);
	await expect(lab).toBeVisible();
	await expect(lab.locator('.lab-status')).not.toContainText('Preparing the synchronized');
	return lab;
}

async function waitForRenderer(stage: Locator, expected: 'ready' | 'fallback' = 'ready') {
	await stage.scrollIntoViewIfNeeded();
	await expect(stage).toHaveAttribute('data-renderer-state', expected, { timeout: 60_000 });
}

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
	await page.addInitScript(() => {
		localStorage.setItem('theme', 'dark');
	});
});

test('canonical SSR article exposes the complete grouped 29-preset laboratory', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('Complex Functions as Landscapes: A 3D Domain-Colouring Laboratory');
	expect(html).toContain('data-testid="domain-coloring-lab"');
	expect(html).toContain('/images/domain-coloring-explorer.svg');
	expect(html).toContain('Grouped examples · 29 presets');

	const presetMarkup = html.match(
		/Grouped examples · 29 presets[\s\S]*?<select[\s\S]*?<\/select>/u
	)?.[0];
	expect(presetMarkup, 'the preset select should be present in the server response').toBeTruthy();
	expect(presetMarkup?.match(/<option value=/gu) ?? []).toHaveLength(29);
	expect(presetMarkup?.match(/<optgroup label=/gu) ?? []).toHaveLength(7);

	await page.goto(`${articlePath}?dcm=2d`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForHydration(page);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		/^https:\/\/www\.suvroghosh\.in\/blog\/visualizations\/domain-coloring-complex-functions-explorer$/u
	);
	await expect(
		page.getByRole('heading', { name: 'Four coordinates, one honest compromise' })
	).toBeVisible();
	await expect(lab.getByLabel('Grouped examples · 29 presets').locator('option')).toHaveCount(29);
	await expect(lab.getByLabel('Grouped examples · 29 presets').locator('optgroup')).toHaveCount(7);
});

test('desktop comparison starts synchronized computed 2D and 3D views', async ({
	page
}, testInfo) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForHydration(page);
	await expect(lab.getByRole('button', { name: 'Comparison' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await waitForRenderer(twoDimensionalStage(page));
	await waitForRenderer(threeDimensionalStage(page));

	const canvases = lab.locator('.stage-grid canvas[tabindex="0"]');
	await expect(canvases).toHaveCount(2);
	const descriptionIds = await canvases.evaluateAll((elements) =>
		elements.map((element) => element.getAttribute('aria-describedby'))
	);
	expect(new Set(descriptionIds).size).toBe(1);

	const rangeBefore = await lab.locator('.utility-bar output').textContent();
	const domainControls = lab.locator('details').filter({ hasText: 'Domain, camera, and overlays' });
	await domainControls.locator('summary').click();
	await lab.getByRole('button', { name: 'Zoom in' }).click();
	await expect.poll(() => lab.locator('.utility-bar output').textContent()).not.toBe(rangeBefore);
	await expect(lab.locator(`#${descriptionIds[0]}`)).toContainText(
		'The same mathematical domain is shown simultaneously'
	);
	await canvases.first().focus();
	await canvases.first().press('Enter');
	await expect(lab.getByRole('heading', { name: 'Pinned synchronized sample' })).toBeVisible();
	await waitForRenderer(twoDimensionalStage(page));
	await waitForRenderer(threeDimensionalStage(page));

	await lab
		.locator('.stage-grid')
		.screenshot({ path: testInfo.outputPath('desktop-comparison.png') });
});

test('an invalid custom expression leaves the last valid field running', async ({ page }) => {
	await page.goto(`${articlePath}?dcm=2d`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForHydration(page);
	await waitForRenderer(twoDimensionalStage(page));
	const expression = lab.getByLabel('Complex function');

	await expression.fill('z+1');
	await lab.getByRole('button', { name: 'Draw function' }).click();
	await expect(lab.locator('.lab-status')).toContainText(
		'Rendered the custom expression f(z) = z+1'
	);
	const field = twoDimensionalStage(page).locator('canvas[tabindex="0"]');
	await expect(field).toHaveAttribute('aria-label', /f\(z\) = z\+1/u);

	await expression.fill('sin(');
	await lab.getByRole('button', { name: 'Draw function' }).click();
	await expect(lab.getByRole('alert')).toBeVisible();
	await expect(lab.locator('.lab-status')).toHaveText(
		'The previous valid function remains in every view.'
	);
	await expect(field).toHaveAttribute('aria-label', /f\(z\) = z\+1/u);
	await waitForRenderer(twoDimensionalStage(page));
});

test('the identity argument-principle loop converges to one zero minus poles', async ({ page }) => {
	await page.goto(`${articlePath}?dcm=2d`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForHydration(page);
	await waitForRenderer(twoDimensionalStage(page));

	await lab.getByRole('button', { name: 'Add loop' }).click();
	await expect(lab.getByLabel('Radius')).toHaveValue('0.92');
	await lab.getByRole('button', { name: 'Run convergent estimate' }).click();
	const result = lab.locator('.winding-result');
	await expect(result).toContainText('Converged numerical estimate: N − P = 1');
	await expect(result).toContainText(/Samples: \d+; minimum sampled \|f\|:/u);
});

test('square root enables a connected sheet view and switches between principal and all sheets', async ({
	page
}, testInfo) => {
	await page.goto(`${articlePath}?dcm=2d`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForHydration(page);
	await lab.getByLabel('Grouped examples · 29 presets').selectOption('square-root');
	const sheetsButton = lab.getByRole('button', { name: 'Riemann sheets' });
	await expect(sheetsButton).toBeEnabled();
	await sheetsButton.click();
	await expect(sheetsButton).toHaveAttribute('aria-pressed', 'true');
	await waitForRenderer(threeDimensionalStage(page));

	const branchDisplay = lab.getByLabel('Branch display');
	await branchDisplay.selectOption('principal');
	await expect(
		lab
			.locator('p.formula-note')
			.filter({ hasText: 'Displayed branch: principal sheet k = 0 with an open cut boundary.' })
	).toBeVisible();
	await branchDisplay.selectOption('all');
	await expect(
		lab.locator('p.formula-note').filter({
			hasText: 'Displayed sheet indices: k = 0, 1, cyclically joined across paired cut edges.'
		})
	).toBeVisible();
	await expect(threeDimensionalStage(page).locator('canvas')).toHaveAttribute(
		'aria-label',
		/Connected displayed Riemann-sheet projection for Square root/u
	);

	await threeDimensionalStage(page).screenshot({
		path: testInfo.outputPath('square-root-sheets.png')
	});
});

test('versioned URL state restores deterministically and rejects out-of-bounds tuples', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	const restored =
		'?ref=qa&dcv=1&dcp=identity&dcb=1.25,-0.5,4,3&dcm=2d&dch=phase&dcc=asinh&dcvs=1.25&dclc=7&dcsy=1&dcca=8&dccm=top&dcpr=perspective&dcco=0.5,0.3&dcd=8&dcz=1.75&dct=0,0,0&dcov=101010&dcq=low&dcsr=3&dcr=0.2,4&dcas=0&dcl=0,0,1';
	await page.goto(`${articlePath}${restored}`, { waitUntil: 'domcontentloaded' });
	let lab = await waitForHydration(page);
	await expect(lab.getByRole('button', { name: '2D field' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(lab.getByLabel('Height lens')).toHaveValue('phase');
	await expect(lab.getByLabel('Camera projection')).toHaveValue('perspective');
	await expect(lab.getByLabel('Adaptive quality')).toHaveValue('low');
	let domainControls = lab.locator('details').filter({ hasText: 'Domain, camera, and overlays' });
	await expect(domainControls.getByLabel('Centre Re')).toHaveValue('1.25');
	await expect(domainControls.getByLabel('Centre Im')).toHaveValue('-0.5');
	await expect(domainControls.getByLabel('Real span')).toHaveValue('4');
	await expect(domainControls.getByLabel('Imaginary span')).toHaveValue('3');
	await expect(lab.getByLabel('Radius')).toHaveValue('1');

	await lab.getByRole('button', { name: 'Copy deterministic link' }).click();
	await expect(lab.locator('.lab-status')).toContainText('bounded, versioned link');
	const deterministicUrl = page.url();
	expect(new URL(deterministicUrl).searchParams.get('ref')).toBe('qa');
	expect(new URL(deterministicUrl).search.length).toBeLessThanOrEqual(2_048);
	await page.reload({ waitUntil: 'domcontentloaded' });
	lab = await waitForHydration(page);
	domainControls = lab.locator('details').filter({ hasText: 'Domain, camera, and overlays' });
	await expect(domainControls.getByLabel('Centre Re')).toHaveValue('1.25');
	await expect(lab.getByLabel('Height lens')).toHaveValue('phase');
	expect(page.url()).toBe(deterministicUrl);
	expect(new URL(page.url()).searchParams.get('dcz')).toBe('1.75');

	await page.goto(`${articlePath}?dcv=1&dcp=identity&dcm=2d&dcb=1000001,0,-2,4&dcvs=99&dcr=5,1`, {
		waitUntil: 'domcontentloaded'
	});
	lab = await waitForHydration(page);
	await expect(lab.locator('.lab-status')).toContainText('Ignored invalid domain bounds.');
	await expect(lab.locator('.lab-status')).toContainText('Ignored invalid vertical scale.');
	await expect(lab.locator('.lab-status')).toContainText('Ignored inverted sheet radial range.');
	domainControls = lab.locator('details').filter({ hasText: 'Domain, camera, and overlays' });
	expect(Number(await domainControls.getByLabel('Centre Re').inputValue())).toBe(0);
	expect(Number(await domainControls.getByLabel('Real span').inputValue())).toBe(4);
	expect(
		Number(
			await lab
				.locator('.control-deck details')
				.first()
				.locator('input[type="range"]')
				.first()
				.inputValue()
		)
	).toBe(0.7);
});

test('keyboard camera orbit, orthographic zoom, and vertical pan survive URL state', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto(`${articlePath}?dcm=3d`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForHydration(page);
	const stage = threeDimensionalStage(page);
	await waitForRenderer(stage);
	const canvas = stage.locator('canvas[tabindex="0"]');
	await canvas.focus();
	await canvas.press('2');
	await canvas.press('ArrowLeft');
	await canvas.press('+');
	await canvas.press('Control+ArrowUp');
	await lab.getByRole('button', { name: 'Copy deterministic link' }).click();

	const firstUrl = new URL(page.url());
	expect(firstUrl.searchParams.get('dccm')).toBe('isometric');
	expect(Number(firstUrl.searchParams.get('dcz'))).toBeGreaterThan(1);
	expect(Number(firstUrl.searchParams.get('dct')?.split(',')[1])).toBeGreaterThan(0);

	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForHydration(page);
	const restoredStage = threeDimensionalStage(page);
	await waitForRenderer(restoredStage);
	await laboratory(page).getByRole('button', { name: 'Copy deterministic link' }).click();
	expect(page.url()).toBe(firstUrl.toString());

	const restoredCanvas = restoredStage.locator('canvas[tabindex="0"]');
	await restoredCanvas.focus();
	await restoredCanvas.press('R');
	await laboratory(page).getByRole('button', { name: 'Copy deterministic link' }).click();
	const resetUrl = new URL(page.url());
	expect(resetUrl.searchParams.get('dccm')).toBe('isometric');
	expect(resetUrl.searchParams.get('dcco')).toBe('-0.785398,0.61548');
	expect(resetUrl.searchParams.get('dcd')).toBe('6');
	expect(resetUrl.searchParams.get('dcz')).toBe('1');
	expect(resetUrl.searchParams.get('dct')).toBe('0,0,0');
});

test('webgl=off keeps the poster and the complete server-rendered article readable', async ({
	page
}, testInfo) => {
	await page.goto(`${articlePath}?webgl=off&dcm=2d`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForHydration(page);
	await expect(lab.locator('.lab-status')).toContainText('WebGL is disabled');
	await waitForRenderer(twoDimensionalStage(page), 'fallback');
	await expect(twoDimensionalStage(page).locator('img.poster')).toBeVisible();
	await expect(twoDimensionalStage(page).locator('img.poster')).toHaveAttribute(
		'src',
		'/images/domain-coloring-explorer.svg'
	);
	await expect(page.getByRole('heading', { name: 'How to read the landscape' })).toBeVisible();
	await expect(
		page.getByRole('heading', { name: 'What the picture does not prove' })
	).toBeAttached();
	await twoDimensionalStage(page).screenshot({ path: testInfo.outputPath('webgl-fallback.png') });
});

test('a lost 2D WebGL context exposes the poster and restores the computed field', async ({
	page
}) => {
	await page.goto(`${articlePath}?dcm=2d`, { waitUntil: 'domcontentloaded' });
	await waitForHydration(page);
	const stage = twoDimensionalStage(page);
	await waitForRenderer(stage);
	const canvas = stage.locator('canvas[tabindex="0"]');
	const supported = await canvas.evaluate((element) =>
		Boolean((element as HTMLCanvasElement).getContext('webgl')?.getExtension('WEBGL_lose_context'))
	);
	if (!supported) test.skip(true, 'WEBGL_lose_context is unavailable in this browser.');
	await canvas.evaluate((element) => {
		const extension = (element as HTMLCanvasElement)
			.getContext('webgl')
			?.getExtension('WEBGL_lose_context');
		(
			element as HTMLCanvasElement & {
				__domainColouringContextController?: WEBGL_lose_context;
			}
		).__domainColouringContextController = extension ?? undefined;
		extension?.loseContext();
	});
	await expect(stage).toHaveAttribute('data-renderer-state', 'context-lost');
	await expect(stage.locator('img.poster')).toBeVisible();
	await canvas.evaluate((element) =>
		(
			element as HTMLCanvasElement & {
				__domainColouringContextController?: WEBGL_lose_context;
			}
		).__domainColouringContextController?.restoreContext()
	);
	await waitForRenderer(stage);
});

test('mobile defaults to 2D, preserves page scrolling, and has no horizontal overflow', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForHydration(page);
	await expect(lab.getByRole('button', { name: '2D field' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(twoDimensionalStage(page)).toHaveCount(1);
	await expect(threeDimensionalStage(page)).toHaveCount(0);
	await waitForRenderer(twoDimensionalStage(page));
	await twoDimensionalStage(page).screenshot({ path: testInfo.outputPath('mobile-2d.png') });

	const overflow = await page.evaluate(() => ({
		viewport: document.documentElement.clientWidth,
		document: document.documentElement.scrollWidth,
		body: document.body.scrollWidth
	}));
	expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
	expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);

	const canvas = twoDimensionalStage(page).locator('canvas[tabindex="0"]');
	await expect(lab.getByRole('button', { name: 'Use plane gestures' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	expect(await canvas.evaluate((element) => getComputedStyle(element).touchAction)).toContain(
		'pan-y'
	);
	await canvas.scrollIntoViewIfNeeded();
	const scrollBefore = await page.evaluate(() => window.scrollY);
	await canvas.hover();
	await page.mouse.wheel(0, 500);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore);
});

test('an explicit comparison URL remains comparison on a mobile viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${articlePath}?dcv=1&dcp=identity&dcm=comparison`, {
		waitUntil: 'domcontentloaded'
	});
	const lab = await waitForHydration(page);
	await expect(lab.locator('.comparison-tab')).toHaveAttribute('aria-pressed', 'true');
	await expect(twoDimensionalStage(page)).toHaveCount(1);
	await expect(threeDimensionalStage(page)).toHaveCount(1);
	await waitForRenderer(twoDimensionalStage(page));
	await waitForRenderer(threeDimensionalStage(page));
});

test('PNG export, fullscreen focus, and scoped serious/critical axe checks succeed', async ({
	page
}) => {
	await page.goto(`${articlePath}?dcm=2d`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForHydration(page);
	await waitForRenderer(twoDimensionalStage(page));

	const fullscreenSupported = await lab.evaluate(
		(element) =>
			typeof element.requestFullscreen === 'function' &&
			typeof document.exitFullscreen === 'function'
	);
	if (fullscreenSupported) {
		const fullScreenButton = lab.getByRole('button', { name: 'Full screen' });
		await fullScreenButton.click();
		await expect(lab.getByRole('button', { name: 'Exit full screen' })).toBeVisible();
		await expect(twoDimensionalStage(page).locator('canvas[tabindex="0"]')).toBeFocused();
		await lab.getByRole('button', { name: 'Exit full screen' }).click();
		await expect(fullScreenButton).toBeFocused();
	}

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		lab.getByRole('button', { name: 'Export PNG + legend' }).click()
	]);
	expect(download.suggestedFilename()).toBe('complex-function-identity-2d.png');
	const bytes = await downloadBytes(download);
	expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	expect(bytes.length).toBeGreaterThan(20_000);
	await expect(lab.locator('.lab-status')).toContainText('PNG exported at 1600 × 1000');

	const accessibility = await new AxeBuilder({ page })
		.include('[data-testid="domain-coloring-lab"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	const seriousOrCritical = accessibility.violations.filter(
		(violation) => violation.impact === 'serious' || violation.impact === 'critical'
	);
	expect(seriousOrCritical).toEqual([]);
});
