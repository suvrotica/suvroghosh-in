import AxeBuilder from '@axe-core/playwright';
import {
	expect,
	test,
	type Browser,
	type Download,
	type Locator,
	type Page
} from '@playwright/test';

const articlePath = '/blog/visualizations/the-matrix-is-random-why-does-it-have-a-shape';
const fixedExperiment = `${articlePath}?rmv=1&seed=browser-audit-1847&n=20&lens=microscope&samples=10`;
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const runtimeDiagnostics = new WeakMap<Page, string[]>();

function laboratory(page: Page): Locator {
	return page.getByTestId('random-matrix-instrument');
}

function collectRuntimeErrors(page: Page): string[] {
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

async function waitForLaboratory(page: Page, path = fixedExperiment): Promise<Locator> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	const lab = laboratory(page);
	await expect(lab).toHaveCount(1);
	await lab.scrollIntoViewIfNeeded();
	await expect(lab).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
	await expect(lab.getByRole('heading', { name: /One random matrix\. Six ways/iu })).toBeVisible();
	return lab;
}

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

async function installClipboardCapture(page: Page): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (value: string) => {
					Reflect.set(window, '__randomMatrixCopiedText', value);
				}
			}
		});
	});
}

async function copiedText(page: Page): Promise<string> {
	return page.evaluate(() => String(Reflect.get(window, '__randomMatrixCopiedText') ?? ''));
}

async function assertNoJavaScriptFallback(browser: Browser): Promise<void> {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	try {
		const response = await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		expect(response?.ok()).toBe(true);
		await expect(
			page.getByRole('heading', {
				level: 1,
				name: 'The Matrix Is Random. Why Does It Have a Shape?',
				exact: true
			})
		).toHaveCount(1);
		await expect(
			page.getByRole('img', { name: /blue-and-amber random matrix heatmap/iu }).last()
		).toBeVisible();
		await expect(
			page.getByText(/interactive numerical instrument requires JavaScript/iu)
		).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Sources and further reading' })).toBeVisible();
	} finally {
		await context.close();
	}
}

test.beforeEach(async ({ page }) => {
	await page.route('https://va.vercel-scripts.com/**', (route) =>
		route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
	);
	runtimeDiagnostics.set(page, collectRuntimeErrors(page));
});

test.afterEach(({ page }) => {
	expect(runtimeDiagnostics.get(page) ?? []).toEqual([]);
});

test('theory captions keep accessibility labels out of visible prose', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Theory caption semantics are covered once.');
	const lab = await waitForLaboratory(
		page,
		`${articlePath}?rmv=1&seed=theory-caption&preset=circular-cloud&n=12&lens=spectral-sky`
	);
	const spectrum = lab.locator('[data-lens="spectrum"]');
	const caption = spectrum.locator('figcaption');
	await expect(caption).toContainText('The dashed circular-law disk has radius r =');
	await expect(caption).not.toContainText('Circular law (radius');
	await expect(spectrum.locator('#spectral-plot-description')).toContainText(
		'Theory overlay: Circular law (radius'
	);
});

test('invariant symmetric null statistics omit meaningless inference', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Degenerate null presentation is covered once.');
	const lab = await waitForLaboratory(
		page,
		`${articlePath}?rmv=1&seed=degenerate-null&preset=hidden-rank-one-signal&n=8&sym=symmetric&signal=rank-one&strength=1.2&lens=structure-detector&samples=40`
	);
	await lab.getByRole('button', { name: 'Compare with null ensemble' }).click();
	const card = lab.locator('.metric-card').filter({ hasText: 'Row/column correlation' });
	await expect(
		card.getByText('not informative for this matrix class', { exact: true })
	).toBeVisible({
		timeout: 60_000
	});
	await expect(card.locator('dt', { hasText: 'Empirical percentile' })).toHaveCount(0);
	await expect(card.locator('dt', { hasText: 'Two-sided empirical p' })).toHaveCount(0);
});

test('universality accumulates matched Gaussian, uniform and Rademacher clouds together', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Universality comparison is covered once.');
	const lab = await waitForLaboratory(
		page,
		`${articlePath}?rmv=1&seed=universality-triplet&preset=universality-test&n=8&dist=rademacher&lens=ensemble-laboratory&samples=2`
	);
	const comparison = lab.getByTestId('random-matrix-universality-comparison');
	await expect(comparison).toBeVisible();
	await lab.getByTestId('random-matrix-ensemble-start').click();
	await expect(lab.getByTestId('random-matrix-ensemble-completed')).toHaveText('2', {
		timeout: 60_000
	});

	for (const distribution of ['gaussian', 'uniform', 'rademacher'] as const) {
		const panel = lab.getByTestId(`random-matrix-universality-${distribution}`);
		await expect(panel).toContainText('2 matrices');
		expect(await panel.locator('circle.sample-point').count()).toBe(16);
	}
	const viewBoxes = await comparison
		.locator('svg')
		.evaluateAll((plots) => plots.map((plot) => plot.getAttribute('viewBox')));
	expect(new Set(viewBoxes).size).toBe(1);
});

test('the non-normal preset shows stable long-run decay after transient amplification', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The non-normal witness is covered once.');
	const lab = await waitForLaboratory(
		page,
		`${articlePath}?rmv=1&seed=tramlight-circle-1847&preset=non-normal-trap&n=24&lens=direction-machine`
	);
	const direction = lab.locator('[data-lens="direction"]');
	await expect(
		direction.getByText('amplifies transiently, then decays', { exact: true })
	).toBeVisible();
	await expect(direction.getByText(/\|\|A\^k x\|\| rises from 1 .* then falls to/iu)).toBeVisible();

	const readout = async (label: string): Promise<number> => {
		const value = await direction
			.locator('.summary-grid > div')
			.filter({ hasText: label })
			.locator('strong')
			.textContent();
		return Number(value);
	};
	expect(await readout('Spectral radius')).toBeLessThan(1);
	expect(await readout('Global largest singular value')).toBeGreaterThan(1);
	expect(await readout('Peak witness norm')).toBeGreaterThan(1);
	expect(await readout('Final witness norm')).toBeLessThan(1);
});

test('SSR and no-JavaScript reading preserve the article, poster and scientific boundary', async ({
	page,
	request,
	browser
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'One canonical SSR/no-JavaScript audit is sufficient.'
	);
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('The Matrix Is Random. Why Does It Have a Shape?');
	expect(html).toContain('data-testid="random-matrix-instrument"');
	expect(html).toContain('/images/visualizations/random-matrix-shape/the-matrix-is-random.png');
	expect(html).toContain('One matrix is a realization, not a law.');
	expect(html).toContain('JavaScript is disabled.');

	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(page).toHaveTitle(/Random Matrix Shapes/iu);
	await expect(
		page.getByRole('heading', {
			level: 1,
			name: 'The Matrix Is Random. Why Does It Have a Shape?',
			exact: true
		})
	).toHaveCount(1);
	await assertNoJavaScriptFallback(browser);
});

test('one versioned URL reproduces the rendered matrix and exports a valid PNG', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'Determinism and export are covered once on desktop.'
	);
	await installClipboardCapture(page);
	let lab = await waitForLaboratory(page);
	const seed = lab.getByLabel('Reproducibility seed');
	await expect(seed).toHaveValue('browser-audit-1847');
	const canvas = lab.getByTestId('random-matrix-canvas');
	await expect(canvas).toBeVisible();
	const selectedCell = await canvas.getAttribute('aria-label');
	const firstFrame = await canvas.screenshot({ animations: 'disabled' });

	await page.reload({ waitUntil: 'domcontentloaded' });
	lab = laboratory(page);
	await lab.scrollIntoViewIfNeeded();
	await expect(lab).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
	const reloadedCanvas = lab.getByTestId('random-matrix-canvas');
	expect(await reloadedCanvas.getAttribute('aria-label')).toBe(selectedCell);
	expect((await reloadedCanvas.screenshot({ animations: 'disabled' })).equals(firstFrame)).toBe(
		true
	);

	await lab.getByTestId('random-matrix-share-url').click();
	await expect.poll(() => copiedText(page)).toContain('rmv=1');
	const shared = new URL(await copiedText(page));
	expect(shared.searchParams.get('seed')).toBe('browser-audit-1847');
	expect(shared.searchParams.get('n')).toBe('20');
	expect(shared.searchParams.get('lens')).toBe('microscope');
	expect(shared.searchParams.getAll('rmv')).toEqual(['1']);

	const downloadPromise = page.waitForEvent('download');
	await lab.getByTestId('random-matrix-save-png').click();
	const download = await downloadPromise;
	const png = await downloadBytes(download);
	expect(download.suggestedFilename()).toMatch(/^random-matrix-matrix-browser-audit-1847\.png$/u);
	expect([...png.subarray(0, pngSignature.length)]).toEqual([...pngSignature]);
	expect(png.byteLength).toBeGreaterThan(1_000);
});

test('matrix inspection, lens tabs and reduced-motion ensemble controls remain keyboard operable', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'Keyboard and reduced-motion behavior are covered once.'
	);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const lab = await waitForLaboratory(page);
	const canvas = lab.getByTestId('random-matrix-canvas');
	await canvas.focus();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowDown');
	await expect(canvas).toHaveAttribute('aria-label', /Selected row 1, column 1/iu);

	const ensembleTab = lab.getByTestId('random-matrix-lens-ensemble');
	await ensembleTab.focus();
	await page.keyboard.press('Enter');
	await expect(lab.getByRole('heading', { name: 'Ensemble laboratory' })).toBeVisible();
	const completed = lab.getByTestId('random-matrix-ensemble-completed');
	await expect(completed).toHaveText('0');
	await page.waitForTimeout(300);
	await expect(completed).toHaveText('0');
	await lab.getByTestId('random-matrix-ensemble-start').click();
	await expect
		.poll(async () => Number((await completed.textContent())?.replace(/\D/gu, '') ?? 0))
		.toBeGreaterThan(0);
	const pause = lab.getByTestId('random-matrix-ensemble-pause');
	if (await pause.isVisible()) await pause.click();
});

test('ensemble evidence is fingerprinted to generative controls but survives display changes', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Worker invalidation is covered once on desktop.');
	const lab = await waitForLaboratory(page);
	await lab.getByTestId('random-matrix-lens-ensemble').click();
	const completed = lab.getByTestId('random-matrix-ensemble-completed');
	await lab.getByTestId('random-matrix-ensemble-start').click();
	await expect
		.poll(async () => Number((await completed.textContent())?.replace(/\D/gu, '') ?? 0))
		.toBeGreaterThan(1);
	const pause = lab.getByTestId('random-matrix-ensemble-pause');
	if (await pause.isVisible()) await pause.click();
	const accumulated = Number((await completed.textContent())?.replace(/\D/gu, '') ?? 0);

	await lab.locator('summary').filter({ hasText: 'Display' }).click();
	await lab.getByLabel('Heatmap colour scale').selectOption('sequential');
	await expect(completed).toHaveText(String(accumulated));

	await lab.getByLabel('Entry distribution').selectOption('rademacher');
	await expect(lab.getByLabel('Entry distribution')).toHaveValue('rademacher');
	await expect(lab.locator('.fact-strip')).toContainText('rademacher');
	await expect(completed).toHaveText('0');

	await lab.getByTestId('random-matrix-ensemble-start').click();
	await expect
		.poll(async () => Number((await completed.textContent())?.replace(/\D/gu, '') ?? 0))
		.toBeGreaterThan(0);
	const secondPause = lab.getByTestId('random-matrix-ensemble-pause');
	if (await secondPause.isVisible()) await secondPause.click();
	await lab.getByLabel('Normalisation').selectOption('spectral-radius');
	await expect(lab.getByLabel('Normalisation')).toHaveValue('spectral-radius');
	await expect(lab.locator('.fact-strip')).toContainText('spectral-radius');
	await expect(completed).toHaveText('0');
});

test('focus-mode fallback exits with Escape and restores focus', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Expanded-mode focus behavior is covered once.');
	await page.addInitScript(() => {
		Object.defineProperty(Element.prototype, 'requestFullscreen', {
			configurable: true,
			value: undefined
		});
	});
	const lab = await waitForLaboratory(page);
	const trigger = lab.getByTestId('random-matrix-toggle-expanded');
	await expect(trigger).toHaveText('Focus mode');
	await trigger.click();
	await expect(lab).toHaveClass(/focus-mode/u);
	await expect(lab.getByTestId('random-matrix-exit-expanded')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(lab).not.toHaveClass(/focus-mode/u);
	await expect(trigger).toBeFocused();
});

test('native fullscreen exposes an exit control and restores trigger focus', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Native fullscreen behavior is covered once.');
	test.skip(
		!(await page.evaluate(() => document.fullscreenEnabled)),
		'Fullscreen API is unavailable.'
	);
	const lab = await waitForLaboratory(page);
	const trigger = lab.getByTestId('random-matrix-toggle-expanded');
	await expect(trigger).toHaveText('Fullscreen');
	await trigger.click();
	await expect
		.poll(() =>
			page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid') ?? null)
		)
		.toBe('random-matrix-instrument');
	const exit = lab.getByTestId('random-matrix-exit-expanded');
	await expect(exit).toBeVisible();
	await expect(exit).toBeFocused();
	await exit.click();
	await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
	await expect(trigger).toBeFocused();
});

test('paper, night, high-contrast and forced-colour modes keep the instrument legible', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'Theme behavior is covered once on desktop.');
	const lab = await waitForLaboratory(page);
	const palettes: string[] = [];
	for (const theme of ['paper', 'night', 'high-contrast'] as const) {
		palettes.push(
			await lab.evaluate((element, selectedTheme) => {
				document.documentElement.dataset.theme = selectedTheme;
				window.dispatchEvent(new CustomEvent('site-theme-change'));
				const style = getComputedStyle(element);
				return `${style.backgroundColor}|${style.color}`;
			}, theme)
		);
		await expect(lab.getByTestId('random-matrix-canvas')).toBeVisible();
	}
	expect(new Set(palettes).size).toBeGreaterThan(1);

	await lab.locator('summary').filter({ hasText: 'Display' }).click();
	const contrastToggle = lab.getByLabel('High-contrast plot mode');
	await contrastToggle.check();
	await expect(lab).toHaveClass(/high-contrast/u);

	await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
	expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
	await lab.getByTestId('random-matrix-lens-spectrum').click();
	await expect(lab.getByRole('heading', { name: 'Spectral sky' })).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
	).toBeLessThanOrEqual(1);
});

test('effective two-hundred-percent browser zoom reflows without horizontal page overflow', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'The 200% browser-zoom audit is covered once.');
	// At 200% browser zoom, a 1440 x 900 window exposes roughly half as many CSS pixels.
	// Halving the layout viewport reproduces that reflow without relying on browser chrome shortcuts.
	await page.setViewportSize({ width: 720, height: 450 });
	const lab = await waitForLaboratory(page);
	for (const lens of [
		'matrix',
		'spectrum',
		'singular-values',
		'direction',
		'structure',
		'ensemble'
	]) {
		await lab.getByTestId(`random-matrix-lens-${lens}`).click();
		await expect(lab.locator(`[data-lens="${lens}"]`)).toBeVisible();
	}
	const geometry = await lab.evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		return {
			documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			left: bounds.left,
			right: bounds.right,
			viewportWidth: innerWidth
		};
	});
	expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
	expect(geometry.left).toBeGreaterThanOrEqual(-1);
	expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
});

test('every configured viewport keeps each lens inside the page and preserves touch-size controls', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const lab = await waitForLaboratory(page);
	for (const lens of [
		'matrix',
		'spectrum',
		'singular-values',
		'direction',
		'structure',
		'ensemble'
	]) {
		await lab.getByTestId(`random-matrix-lens-${lens}`).click();
		await expect(lab.locator(`[data-lens="${lens}"]`)).toBeVisible();
		const geometry = await lab.evaluate((element) => {
			const rootBounds = element.getBoundingClientRect();
			const interactive = [...element.querySelectorAll<HTMLElement>('button, select, input')]
				.filter((control) => control.offsetParent !== null && !control.hasAttribute('disabled'))
				.map((control) => {
					const bounds = control.getBoundingClientRect();
					return {
						name:
							control.getAttribute('aria-label') ?? control.textContent?.trim() ?? control.tagName,
						width: bounds.width,
						height: bounds.height
					};
				});
			const undersizedButtons = interactive.filter((control) => control.height < 43.5);
			const tinySvgText = [...element.querySelectorAll<SVGTextElement>('svg text')]
				.filter(
					(node) => node.getClientRects().length > 0 && (node.textContent?.trim().length ?? 0) > 0
				)
				.map((node) => ({
					text: node.textContent?.trim() ?? '',
					size: Number.parseFloat(getComputedStyle(node).fontSize)
				}))
				.filter((entry) => entry.size < 10.9);
			return {
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth,
				rootLeft: rootBounds.left,
				rootRight: rootBounds.right,
				viewportWidth: innerWidth,
				undersizedButtons,
				tinySvgText
			};
		});
		expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
		expect(geometry.rootLeft).toBeGreaterThanOrEqual(-1);
		expect(geometry.rootRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
		expect(geometry.undersizedButtons).toEqual([]);
		expect(geometry.tinySvgText).toEqual([]);
	}
});

test('the hydrated instrument has no WCAG A/AA violations in its default state', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name !== 'desktop',
		'The feature-scoped accessibility audit runs once.'
	);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await waitForLaboratory(page);
	const results = await new AxeBuilder({ page })
		.include('[data-testid="random-matrix-instrument"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
});
