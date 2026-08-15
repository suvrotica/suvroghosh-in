import AxeBuilder from '@axe-core/playwright';
import {
	expect,
	test,
	type Browser,
	type Locator,
	type Page,
	type Request as PlaywrightRequest
} from '@playwright/test';

const articlePath = '/blog/visualizations/human-ai-icu-prediction-laboratory';
const posterPath =
	'/images/visualizations/human-ai-icu-prediction-laboratory/human-ai-icu-prediction-laboratory.webp';

const requestedViewports = [
	{ width: 320, height: 568 },
	{ width: 360, height: 800 },
	{ width: 390, height: 844 },
	{ width: 430, height: 932 },
	{ width: 768, height: 1024 },
	{ width: 1024, height: 768 },
	{ width: 1181, height: 800 },
	{ width: 1200, height: 800 },
	{ width: 1256, height: 900 },
	{ width: 1366, height: 768 },
	{ width: 1440, height: 900 },
	{ width: 1920, height: 1080 }
] as const;

const presetFixtures = [
	{
		id: 'specialist-missing-structured-data',
		title: 'Specialist with missing structured data',
		developmentRate: '20.0%',
		deploymentRate: '20.0%',
		clinicianAuc: '0.82',
		modelAuc: '0.75',
		correlation: '0.05',
		clinicianWeight: '0.7'
	},
	{
		id: 'trainee-strong-model',
		title: 'Trainee plus strong model',
		developmentRate: '20.0%',
		deploymentRate: '20.0%',
		clinicianAuc: '0.7',
		modelAuc: '0.86',
		correlation: '0.15',
		clinicianWeight: '0.15'
	},
	{
		id: 'shared-hospital-artifact',
		title: 'Both learn the same hospital artifact',
		developmentRate: '20.0%',
		deploymentRate: '20.0%',
		clinicianAuc: '0.83',
		modelAuc: '0.83',
		correlation: '0.94',
		clinicianWeight: '0.5'
	},
	{
		id: 'deployment-population-shift',
		title: 'Deployment population shift',
		developmentRate: '20.0%',
		deploymentRate: '35.0%',
		clinicianAuc: '0.78',
		modelAuc: '0.84',
		correlation: '0.65',
		clinicianWeight: '0.5'
	}
] as const;

type RuntimeDiagnostics = {
	errors: string[];
	failedRequests: string[];
};

type RailReading = {
	forecast: number;
	loss: number;
};

const diagnosticsByPage = new WeakMap<Page, RuntimeDiagnostics>();

function laboratory(page: Page): Locator {
	return page.getByTestId('human-ai-icu-laboratory');
}

function normalizedText(value: string): string {
	return value.replace(/\s+/gu, ' ').trim();
}

function ignorablePlatformRequest(url: string): boolean {
	try {
		const parsed = new URL(url);
		return (
			parsed.pathname.startsWith('/_vercel/') || /(?:^|\/)favicon(?:\.|$)/iu.test(parsed.pathname)
		);
	} catch {
		return false;
	}
}

function observeRuntime(page: Page): RuntimeDiagnostics {
	const diagnostics: RuntimeDiagnostics = { errors: [], failedRequests: [] };

	page.on('pageerror', (error) => diagnostics.errors.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		const text = message.text();
		const hydrationWarning = /hydrat(?:e|ion|ing)|server-rendered html|mismatch/iu.test(text);
		if (message.type() !== 'error' && !hydrationWarning) return;
		if (/\/_vercel\/(?:insights|speed-insights)\//iu.test(text)) return;
		if (ignorablePlatformRequest(message.location().url || 'http://local.invalid/')) return;
		diagnostics.errors.push(`${message.type()}: ${text}`);
	});
	page.on('requestfailed', (request) => {
		if (ignorablePlatformRequest(request.url())) return;
		const reason = request.failure()?.errorText ?? 'unknown failure';
		if (reason === 'net::ERR_ABORTED' && request.isNavigationRequest()) return;
		diagnostics.failedRequests.push(`${request.method()} ${request.url()} — ${reason}`);
	});
	page.on('response', (response) => {
		if (response.status() < 400 || ignorablePlatformRequest(response.url())) return;
		diagnostics.failedRequests.push(
			`${response.request().method()} ${response.url()} — HTTP ${response.status()}`
		);
	});

	return diagnostics;
}

async function waitForLaboratoryOnCurrentPage(page: Page): Promise<Locator> {
	const lab = laboratory(page);
	await expect(lab).toHaveCount(1);
	await expect(lab).toHaveAttribute('data-ready', 'true');
	await expect(
		lab.getByRole('heading', { name: 'Human + AI ICU Prediction Laboratory', exact: true })
	).toBeVisible();
	await page.waitForLoadState('networkidle');
	return lab;
}

async function openLaboratory(page: Page): Promise<Locator> {
	const response = await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	expect(response?.ok()).toBe(true);
	return waitForLaboratoryOnCurrentPage(page);
}

async function setRange(input: Locator, value: number): Promise<void> {
	await input.evaluate((element, nextValue) => {
		const range = element as HTMLInputElement;
		range.value = String(nextValue);
		range.dispatchEvent(new Event('input', { bubbles: true }));
		range.dispatchEvent(new Event('change', { bubbles: true }));
	}, value);
	await expect(input).toHaveValue(String(value));
}

async function ledgerValue(lab: Locator, label: string): Promise<string> {
	const row = lab.locator('.settings-ledger > div').filter({ hasText: label });
	await expect(row).toHaveCount(1);
	return normalizedText((await row.locator('dd').textContent()) ?? '');
}

async function assertPresetConfiguration(
	lab: Locator,
	fixture: (typeof presetFixtures)[number]
): Promise<void> {
	await expect(lab).toHaveAttribute('data-preset', fixture.id);
	await expect(lab).toHaveAttribute('data-custom', 'false');
	await expect(lab.getByTestId(`icu-preset-${fixture.id}`)).toHaveAttribute('aria-pressed', 'true');
	await expect(lab.locator('#icu-clinician-auc')).toHaveValue(fixture.clinicianAuc);
	await expect(lab.locator('#icu-model-auc')).toHaveValue(fixture.modelAuc);
	await expect(lab.locator('#icu-clinician-intercept')).toHaveValue('0');
	await expect(lab.locator('#icu-model-intercept')).toHaveValue('0');
	await expect(lab.locator('#icu-clinician-slope')).toHaveValue('1');
	await expect(lab.locator('#icu-model-slope')).toHaveValue('1');
	// The requested 0.94 preset sits off the native 0.05 step grid anchored at -0.80, so Chromium
	// sanitizes that range control to 0.95. The adjacent output and settings ledger remain the exact
	// source of truth for the applied simulation configuration.
	const correlationControl = lab.locator('#icu-residual-correlation');
	expect(
		Math.abs(Number(await correlationControl.inputValue()) - Number(fixture.correlation))
	).toBeLessThanOrEqual(0.011);
	await expect(correlationControl).toHaveAttribute('aria-valuetext', fixture.correlation);
	await expect(lab.locator('label[for="icu-residual-correlation"] output')).toHaveText(
		fixture.correlation
	);
	await expect(lab.locator('#icu-clinician-weight')).toHaveValue(fixture.clinicianWeight);
	expect(await ledgerValue(lab, 'Development event rate')).toBe(fixture.developmentRate);
	expect(await ledgerValue(lab, 'Deployment event rate')).toBe(fixture.deploymentRate);
	expect(await ledgerValue(lab, 'Shared residual ρ')).toBe(fixture.correlation);
}

async function readRail(rail: Locator): Promise<RailReading> {
	const label = (await rail.getAttribute('aria-label')) ?? '';
	const match = label.match(/forecast ([\d.]+)%, squared loss ([\d.]+)/u);
	if (!match) throw new Error(`Could not parse synthetic-case rail: ${label}`);
	return { forecast: Number(match[1]) / 100, loss: Number(match[2]) };
}

async function assertNoJavaScriptFallback(browser: Browser, baseURL: string): Promise<void> {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	try {
		const response = await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		expect(response?.ok()).toBe(true);
		await expect(
			page.getByRole('heading', { name: /Human \+ AI ICU Prediction Laboratory — static guide/iu })
		).toBeVisible();
		await expect(page.getByText('Synthetic educational simulation', { exact: true })).toBeVisible();
		await expect(page.getByText(/Every case, forecast, and outcome/iu).first()).toBeVisible();
		await expect(
			page.getByText(/equations, assumptions, experiments, limitations/iu)
		).toBeVisible();
	} finally {
		await context.close();
	}
}

async function selectSiteTheme(
	page: Page,
	theme: 'paper' | 'light' | 'night' | 'high-contrast'
): Promise<void> {
	const select = page.getByLabel('Colour theme', { exact: true }).filter({ visible: true }).first();
	await expect(select).toBeVisible();
	await expect(select).toBeEnabled();
	await select.selectOption(theme);
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

test.beforeEach(async ({ page }) => {
	await page.route('https://va.vercel-scripts.com/**', (route) =>
		route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
	);
	diagnosticsByPage.set(page, observeRuntime(page));
});

test.afterEach(({ page }) => {
	const diagnostics = diagnosticsByPage.get(page) ?? { errors: [], failedRequests: [] };
	expect(diagnostics.errors, 'console, page, and hydration errors').toEqual([]);
	expect(diagnostics.failedRequests, 'failed or HTTP-error requests').toEqual([]);
});

test('SSR and no-JavaScript reading preserve the boundary, poster, and complete article', async ({
	page,
	request,
	browser,
	baseURL
}) => {
	if (!baseURL) throw new Error('The ICU browser project requires a configured baseURL.');
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('Human + AI ICU Prediction Laboratory');
	expect(html).toContain('Educational simulation only');
	expect(html).toContain('synthetic AKI within 48 hours');
	expect(html).toContain(posterPath);
	expect(html).toContain('Averaging is arithmetic, not magic');
	expect(html).toContain('Human + AI ICU Prediction Laboratory — static guide');

	await openLaboratory(page);
	await expect(page).toHaveTitle(/Human \+ AI ICU Prediction Laboratory/iu);
	await assertNoJavaScriptFallback(browser, baseURL);
});

test('presets apply atomically; keyboard edits become Custom; Reset restores the full origin', async ({
	page
}) => {
	const lab = await openLaboratory(page);
	const disclaimer = lab.getByTestId('icu-educational-disclaimer');
	await expect(disclaimer).toContainText('must not be used for diagnosis, triage, treatment');
	expect(
		await lab.evaluate((element) => {
			const boundary = element.querySelector('[data-testid="icu-educational-disclaimer"]');
			const firstPreset = element.querySelector(
				'[data-testid="icu-preset-specialist-missing-structured-data"]'
			);
			return Boolean(
				boundary &&
				firstPreset &&
				boundary.compareDocumentPosition(firstPreset) & Node.DOCUMENT_POSITION_FOLLOWING
			);
		})
	).toBe(true);

	const methods = lab
		.locator('.disclosures > details')
		.filter({ hasText: 'How this synthetic cohort works' })
		.first();
	await methods.locator('summary').click();
	await expect(methods).toHaveAttribute('open', '');

	for (const fixture of presetFixtures) {
		await lab.getByTestId(`icu-preset-${fixture.id}`).click();
		await assertPresetConfiguration(lab, fixture);
	}
	await expect(lab.locator('.interpretation')).toContainText(
		/ensemble mean remains below the observed synthetic event rate/iu
	);
	await expect(lab.locator('.interpretation')).toContainText(/Shared miscalibration survives/iu);

	const first = presetFixtures[0];
	await lab.getByTestId(`icu-preset-${first.id}`).click();
	const auc = lab.locator('#icu-clinician-auc');
	await auc.focus();
	await page.keyboard.press('ArrowLeft');
	await expect(auc).toHaveValue('0.81');
	await expect(lab).toHaveAttribute('data-custom', 'true');
	await expect(
		lab.getByRole('heading', { name: `Custom — based on ${first.title}`, exact: true })
	).toBeVisible();

	await setRange(lab.locator('#icu-model-slope'), 1.35);
	await methods
		.getByRole('button', { name: 'Generate another synthetic cohort', exact: true })
		.click();
	await expect(methods.locator('code').first()).toContainText('icu-lab-v1-check-1');
	await lab.getByTestId('icu-reset').click();
	await assertPresetConfiguration(lab, first);
	await expect(methods.locator('code').first()).toHaveText('icu-lab-v1');
});

test('case arithmetic, loss, weight invariance, interpretation, charts, and tables agree', async ({
	page
}) => {
	const lab = await openLaboratory(page);
	const clinicianRail = lab.getByRole('img', { name: /^Simulated clinician forecast/iu });
	const modelRail = lab.getByRole('img', { name: /^Simulated model forecast/iu });
	const ensembleRail = lab.getByRole('img', { name: /^Weighted ensemble forecast/iu });
	const clinicianBefore = await clinicianRail.getAttribute('aria-label');
	const modelBefore = await modelRail.getAttribute('aria-label');
	const ensembleBefore = await ensembleRail.getAttribute('aria-label');

	const actionRequests: string[] = [];
	const recordRequest = (request: PlaywrightRequest) => {
		if (!request.url().startsWith('data:') && !request.url().startsWith('blob:')) {
			actionRequests.push(`${request.method()} ${request.url()}`);
		}
	};
	page.on('request', recordRequest);
	await setRange(lab.locator('#icu-clinician-weight'), 0.2);
	await expect(lab).toHaveAttribute('data-custom', 'true');
	await expect.poll(() => clinicianRail.getAttribute('aria-label')).toBe(clinicianBefore);
	await expect.poll(() => modelRail.getAttribute('aria-label')).toBe(modelBefore);
	await expect.poll(() => ensembleRail.getAttribute('aria-label')).not.toBe(ensembleBefore);
	page.off('request', recordRequest);
	expect(actionRequests, 'local slider recomputation must not make a network request').toEqual([]);
	await expect(lab.locator('input[type="file"]')).toHaveCount(0);

	const selectedCase = lab.getByTestId('icu-selected-case');
	const outcome = (await selectedCase.locator('.outcome strong').textContent())?.includes('did not')
		? 0
		: 1;
	for (const rail of [clinicianRail, modelRail, ensembleRail]) {
		const reading = await readRail(rail);
		expect(Math.abs((reading.forecast - outcome) ** 2 - reading.loss)).toBeLessThan(0.0011);
	}

	const arithmetic = normalizedText(
		(await selectedCase.locator('.arithmetic code').textContent()) ?? ''
	);
	const arithmeticMatch = arithmetic.match(
		/(\d+\.\d+)\s*×\s*(\d+\.\d+)%\s*\+\s*(\d+\.\d+)\s*×\s*(\d+\.\d+)%\s*=\s*(\d+\.\d+)%/u
	);
	if (!arithmeticMatch) throw new Error(`Could not parse ensemble arithmetic: ${arithmetic}`);
	const [, clinicianWeight, clinicianPercent, modelWeight, modelPercent, ensemblePercent] =
		arithmeticMatch.map(Number);
	expect(clinicianWeight + modelWeight).toBeCloseTo(1, 10);
	expect(
		Math.abs(clinicianWeight * clinicianPercent + modelWeight * modelPercent - ensemblePercent)
	).toBeLessThanOrEqual(0.11);

	const selectedIndex = await selectedCase.getAttribute('data-case-index');
	await selectedCase.getByRole('button', { name: /Next/iu }).click();
	await expect(selectedCase).not.toHaveAttribute('data-case-index', selectedIndex ?? '');
	await selectedCase.getByRole('button', { name: /Previous/iu }).click();
	await expect(selectedCase).toHaveAttribute('data-case-index', selectedIndex ?? '');

	const headlineMetrics = lab.locator('.headline-metrics');
	const brier = async (series: 'Clinician' | 'Model' | 'Ensemble') =>
		Number(
			await headlineMetrics
				.locator('article')
				.filter({ hasText: series })
				.locator('strong')
				.textContent()
		);
	const clinicianBrier = await brier('Clinician');
	const modelBrier = await brier('Model');
	const ensembleBrier = await brier('Ensemble');
	const displayedGain = Number(await headlineMetrics.locator('article.gain strong').textContent());
	expect(displayedGain).toBeCloseTo(Math.min(clinicianBrier, modelBrier) - ensembleBrier, 3);
	const expectedInterpretation =
		displayedGain > 0.0001
			? /pool beats both individual forecasts/iu
			: displayedGain >= -0.0001
				? /averaging adds little/iu
				: modelBrier < clinicianBrier
					? /model leads/iu
					: /clinician forecast leads/iu;
	await expect(lab.locator('.interpretation h3')).toHaveText(expectedInterpretation);

	await lab.getByTestId('icu-tab-scores').click();
	const scoreCurve = lab.getByTestId('icu-score-curve');
	await expect(scoreCurve).toContainText('Model only');
	await expect(scoreCurve).toContainText('Clinician only');
	const currentLabel = normalizedText(
		(await scoreCurve.locator('text.current-label').textContent()) ?? ''
	);
	const currentMatch = currentLabel.match(/current w = ([\d.]+) · ([\d.]+)/u);
	if (!currentMatch) throw new Error(`Could not parse score-curve current marker: ${currentLabel}`);

	const chartData = lab
		.locator('.disclosures > details')
		.filter({ hasText: 'View chart data' })
		.first();
	await chartData.locator('summary').click();
	const weightRows = await chartData
		.getByRole('heading', { name: 'Weight curve', exact: true })
		.locator('xpath=following-sibling::div[1]//tbody/tr')
		.evaluateAll((rows) =>
			rows.map((row) =>
				Array.from(row.querySelectorAll('td'), (cell) => cell.textContent?.trim() ?? '')
			)
		);
	const weightRow = weightRows.find((cells) => cells[0] === currentMatch[1]);
	expect(weightRow, `missing weight-curve table row for w=${currentMatch[1]}`).toBeDefined();
	expect(Number(weightRow?.[2])).toBeCloseTo(Number(currentMatch[2]), 4);

	await lab.getByTestId('icu-tab-calibration').click();
	const reliability = lab.getByTestId('icu-reliability-diagram');
	await expect(reliability).toBeVisible();
	const square = await reliability.locator('rect.plot-background').evaluate((rect) => ({
		width: Number(rect.getAttribute('width')),
		height: Number(rect.getAttribute('height'))
	}));
	expect(square.width).toBeCloseTo(square.height, 10);
	const point = reliability
		.getByRole('button', { name: /mean prediction.*event frequency/iu })
		.first();
	await point.focus();
	const pointLabel = (await point.getAttribute('aria-label')) ?? '';
	await expect(reliability.getByRole('status')).toContainText(/cases.*events.*mean prediction/iu);
	const pointMatch = pointLabel.match(
		/^(.+), bin (\d+): (\d+) cases, (\d+) events, mean prediction ([\d.]+%), event frequency ([\d.]+%), Wilson 95 percent interval ([\d.]+%) to ([\d.]+%)$/u
	);
	if (!pointMatch) throw new Error(`Could not parse reliability point: ${pointLabel}`);
	const reliabilitySection = reliability.locator('xpath=ancestor::section[1]');
	const pointTable = reliabilitySection.locator('details');
	await pointTable.locator('summary').click();
	const firstCalibrationRow = await pointTable
		.locator('tbody tr')
		.first()
		.evaluate((row) =>
			Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent?.trim() ?? '')
		);
	expect(firstCalibrationRow).toEqual([
		pointMatch[1],
		pointMatch[2],
		pointMatch[3],
		pointMatch[4],
		pointMatch[5],
		pointMatch[6],
		`${pointMatch[7]}–${pointMatch[8]}`
	]);

	await lab.getByTestId('icu-tab-shared-error').click();
	const sharedError = lab.getByTestId('icu-shared-error-canvas');
	const sharedErrorSection = sharedError.locator('xpath=ancestor::section[1]');
	await expect(sharedError).toBeVisible();
	for (const metricLabel of [
		'Configured latent ρ',
		'Realized latent correlation',
		'Squared-loss correlation',
		'Cross-error term, C'
	]) {
		await expect(sharedErrorSection.getByText(metricLabel, { exact: true })).toBeVisible();
	}
	const canvas = sharedError.locator('canvas');
	const canvasGeometry = await canvas.evaluate((element) => {
		const canvasElement = element as HTMLCanvasElement;
		const bounds = canvasElement.getBoundingClientRect();
		const ratio = devicePixelRatio || 1;
		return {
			cssWidth: bounds.width,
			cssHeight: bounds.height,
			pixelWidth: canvasElement.width,
			pixelHeight: canvasElement.height,
			ratio
		};
	});
	expect(canvasGeometry.pixelWidth).toBeGreaterThanOrEqual(
		Math.floor(canvasGeometry.cssWidth * canvasGeometry.ratio) - 1
	);
	expect(canvasGeometry.pixelHeight).toBeGreaterThanOrEqual(
		Math.floor(canvasGeometry.cssHeight * canvasGeometry.ratio) - 1
	);

	const sharedTable = sharedErrorSection.locator('details');
	await sharedTable.locator('summary').click();
	const rows = sharedTable.locator('tbody tr');
	const rowCount = await rows.count();
	expect(rowCount).toBeGreaterThan(0);
	expect(rowCount).toBeLessThanOrEqual(600);
	const targetRow = rows.nth(Math.min(1, rowCount - 1));
	const targetCase = normalizedText((await targetRow.locator('th').textContent()) ?? '');
	await targetRow.getByRole('button').click();
	await expect(selectedCase.getByRole('heading')).toContainText(targetCase);
	await expect(canvas).toHaveAttribute('aria-label', new RegExp(`Selected ${targetCase}`, 'u'));
});

test('focus mode works in portrait and landscape, traps focus, exits, and restores focus', async ({
	page
}, testInfo) => {
	await page.addInitScript(() => {
		Object.defineProperty(Document.prototype, 'fullscreenEnabled', {
			configurable: true,
			get: () => false
		});
		Object.defineProperty(Element.prototype, 'requestFullscreen', {
			configurable: true,
			value: undefined
		});
	});
	const lab = await openLaboratory(page);
	const siteHeader = page.locator('.site-shell > header.sticky');
	await expect(siteHeader).toBeVisible();
	const trigger = lab.getByTestId('icu-toggle-expanded');
	await expect(trigger).toContainText('Focus mode');
	await trigger.click();
	await expect(lab).toHaveAttribute('data-expanded', 'true');
	const exit = lab.getByTestId('icu-exit-expanded');
	await expect(exit).toBeFocused();
	await expect(lab.getByTestId('icu-educational-disclaimer')).toBeVisible();
	await expect(page.locator('body')).toHaveClass(/icu-lab-focus-mode-open/u);
	await expect(siteHeader).toBeHidden();

	for (const viewport of [
		{ width: 390, height: 844, label: 'portrait' },
		{ width: 844, height: 390, label: 'landscape' }
	] as const) {
		await page.setViewportSize(viewport);
		const geometry = await lab.evaluate((element) => {
			const bounds = element.getBoundingClientRect();
			return {
				top: bounds.top,
				left: bounds.left,
				right: bounds.right,
				bottom: bounds.bottom,
				width: innerWidth,
				height: innerHeight
			};
		});
		expect(geometry.top).toBeGreaterThanOrEqual(-1);
		expect(geometry.left).toBeGreaterThanOrEqual(-1);
		expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
		expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);
		await expect(lab.getByTestId('icu-educational-disclaimer')).toBeVisible();
		const exitHitTest = await exit.evaluate((element) => {
			const bounds = element.getBoundingClientRect();
			const topmost = document.elementFromPoint(
				bounds.left + bounds.width / 2,
				bounds.top + bounds.height / 2
			);
			return {
				top: bounds.top,
				left: bounds.left,
				right: bounds.right,
				bottom: bounds.bottom,
				viewportWidth: innerWidth,
				viewportHeight: innerHeight,
				hit: topmost === element || element.contains(topmost)
			};
		});
		expect(exitHitTest.top).toBeGreaterThanOrEqual(0);
		expect(exitHitTest.top).toBeLessThan(140);
		expect(exitHitTest.left).toBeGreaterThanOrEqual(0);
		expect(exitHitTest.right).toBeLessThanOrEqual(exitHitTest.viewportWidth);
		expect(exitHitTest.bottom).toBeLessThanOrEqual(exitHitTest.viewportHeight);
		expect(exitHitTest.hit, 'Exit must be the hit-test target at its visual centre').toBe(true);
		await page.screenshot({
			animations: 'disabled',
			path: testInfo.outputPath(`icu-focus-mode-${viewport.label}.png`)
		});
	}

	const outsideLink = page.locator('a').filter({ visible: true }).first();
	await outsideLink.focus();
	await page.keyboard.press('Tab');
	expect(await lab.evaluate((element) => element.contains(document.activeElement))).toBe(true);

	await page.keyboard.press('Escape');
	await expect(lab).toHaveAttribute('data-expanded', 'false');
	await expect(trigger).toBeFocused();
	await expect(page.locator('body')).not.toHaveClass(/icu-lab-focus-mode-open/u);
	await expect(siteHeader).toBeVisible();
});

test('native fullscreen exposes Exit and restores the launch control when the API is available', async ({
	page
}) => {
	const lab = await openLaboratory(page);
	test.skip(
		!(await page.evaluate(() => document.fullscreenEnabled)),
		'Fullscreen API is unavailable.'
	);
	const trigger = lab.getByTestId('icu-toggle-expanded');
	await expect(trigger).toContainText('Fullscreen');
	await trigger.click();
	await expect
		.poll(() =>
			page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid') ?? null)
		)
		.toBe('human-ai-icu-laboratory');
	const exit = lab.getByTestId('icu-exit-expanded');
	await expect(exit).toBeVisible();
	await expect(exit).toBeFocused();
	await exit.click();
	await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
	await expect(trigger).toBeFocused();
});

test('every requested viewport, the 1181–1256 band, and effective 200% zoom reflow cleanly', async ({
	page
}, testInfo) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	let lab = await openLaboratory(page);
	for (const viewport of requestedViewports) {
		await page.setViewportSize(viewport);
		lab = laboratory(page);
		await lab.evaluate((element) =>
			window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 8 })
		);
		await expect(lab).toBeVisible();
		const geometry = await lab.evaluate((element) => {
			const bounds = element.getBoundingClientRect();
			const undersizedTargets = Array.from(
				element.querySelectorAll<HTMLElement>(
					'button, input:not([type="hidden"]), summary, [role="button"]'
				)
			)
				.filter(
					(control) => control.getClientRects().length > 0 && !control.hasAttribute('disabled')
				)
				.map((control) => {
					const rect = control.getBoundingClientRect();
					return {
						name:
							control.getAttribute('aria-label') ??
							control.textContent?.trim().replace(/\s+/gu, ' ') ??
							control.tagName,
						width: rect.width,
						height: rect.height
					};
				})
				.filter((target) => target.width < 43.5 || target.height < 43.5);
			return {
				left: bounds.left,
				right: bounds.right,
				viewportWidth: document.documentElement.clientWidth,
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth,
				undersizedTargets
			};
		});
		expect(geometry.left).toBeGreaterThanOrEqual(-1.5);
		expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1.5);
		expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
		expect(geometry.undersizedTargets).toEqual([]);
		await page.screenshot({
			animations: 'disabled',
			path: testInfo.outputPath(`icu-laboratory-${viewport.width}x${viewport.height}.png`)
		});
	}

	await page.setViewportSize({ width: 390, height: 844 });
	const narrowSourceOrder = await lab.evaluate((element) => {
		const selectedCase = element.querySelector('[data-testid="icu-selected-case"]');
		const controlHeading = element.querySelector('#icu-controls-heading');
		return Boolean(
			selectedCase &&
			controlHeading &&
			selectedCase.compareDocumentPosition(controlHeading) & Node.DOCUMENT_POSITION_FOLLOWING
		);
	});
	expect(
		narrowSourceOrder,
		'narrow visual and assistive reading order must place results before detailed controls'
	).toBe(true);
	await lab.getByTestId('icu-tab-scores').click();
	const scoreTextSizes = await lab
		.getByTestId('icu-score-curve')
		.locator('svg text:visible')
		.evaluateAll((nodes) =>
			nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize))
		);
	expect(Math.min(...scoreTextSizes)).toBeGreaterThanOrEqual(11.5);
	await lab.getByTestId('icu-tab-calibration').click();
	const calibrationTextSizes = await lab
		.getByTestId('icu-reliability-diagram')
		.locator('svg text:visible')
		.evaluateAll((nodes) =>
			nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize))
		);
	expect(Math.min(...calibrationTextSizes)).toBeGreaterThanOrEqual(11.5);
	const undersizedReliabilityMarks = await lab
		.getByTestId('icu-reliability-diagram')
		.locator('[role="button"]')
		.evaluateAll((marks) =>
			marks
				.map((mark) => {
					const bounds = mark.getBoundingClientRect();
					return {
						name: mark.getAttribute('aria-label') ?? 'reliability mark',
						width: bounds.width,
						height: bounds.height
					};
				})
				.filter((mark) => mark.width < 43.5 || mark.height < 43.5)
		);
	expect(undersizedReliabilityMarks).toEqual([]);
	await page.screenshot({
		animations: 'disabled',
		path: testInfo.outputPath('icu-calibration-390x844.png')
	});
	await lab.getByTestId('icu-tab-shared-error').click();
	await expect(lab.getByTestId('icu-shared-error-canvas').locator('canvas')).toBeVisible();
	await page.screenshot({
		animations: 'disabled',
		path: testInfo.outputPath('icu-shared-error-390x844.png')
	});

	// At 200% browser zoom, a 1440 × 900 window exposes roughly 720 × 450 CSS pixels.
	await page.setViewportSize({ width: 720, height: 450 });
	await lab.getByTestId('icu-tab-scores').click();
	const zoomGeometry = await lab.evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		return {
			left: bounds.left,
			right: bounds.right,
			viewportWidth: innerWidth,
			documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
		};
	});
	expect(zoomGeometry.left).toBeGreaterThanOrEqual(-1.5);
	expect(zoomGeometry.right).toBeLessThanOrEqual(zoomGeometry.viewportWidth + 1.5);
	expect(zoomGeometry.documentOverflow).toBeLessThanOrEqual(1);
	await page.screenshot({
		animations: 'disabled',
		path: testInfo.outputPath('icu-effective-200-percent-zoom.png')
	});
});

test('site themes, reduced motion, forced colours, and scoped accessibility retain the instrument', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const lab = await openLaboratory(page);
	const palettes: string[] = [];
	for (const theme of ['paper', 'light', 'night', 'high-contrast'] as const) {
		await selectSiteTheme(page, theme);
		palettes.push(
			await lab.evaluate((element) => {
				const style = getComputedStyle(element);
				return `${style.backgroundColor}|${style.color}`;
			})
		);
		await expect(lab.getByTestId('icu-educational-disclaimer')).toBeVisible();
	}
	expect(new Set(palettes).size).toBe(4);

	const movingElements = await lab.evaluate((element) => {
		const durationMs = (value: string): number => {
			return Math.max(
				0,
				...value.split(',').map((part) => {
					const duration = Number.parseFloat(part);
					return part.trim().endsWith('ms') ? duration : duration * 1000;
				})
			);
		};
		return Array.from(element.querySelectorAll<HTMLElement>('*'))
			.filter((node) => node.getClientRects().length > 0)
			.map((node) => {
				const style = getComputedStyle(node);
				return {
					name: node.getAttribute('data-testid') ?? node.tagName,
					animation: durationMs(style.animationDuration),
					transition: durationMs(style.transitionDuration)
				};
			})
			.filter((entry) => entry.animation > 1 || entry.transition > 1);
	});
	expect(movingElements).toEqual([]);

	const accessibility = await new AxeBuilder({ page })
		.include('[data-testid="human-ai-icu-laboratory"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	const serious = accessibility.violations.filter((violation) =>
		['serious', 'critical'].includes(violation.impact ?? '')
	);
	expect(serious).toEqual([]);

	await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
	await lab.getByTestId('icu-tab-shared-error').click();
	await expect(lab.locator('canvas')).toBeVisible();
	expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
	).toBeLessThanOrEqual(1);
});

test('Projects, resume, gallery subject filters, and client navigation resolve the canonical post', async ({
	page
}) => {
	await page.goto('/projects', { waitUntil: 'domcontentloaded' });
	const project = page.locator('#human-ai-icu-prediction-laboratory');
	await expect(
		project.getByRole('heading', { name: 'Human + AI ICU Prediction Laboratory' })
	).toBeVisible();
	await expect(project.locator('p').first()).toHaveText('05 / 10');
	const projectLink = project.getByRole('link', {
		name: 'Open the synthetic laboratory →',
		exact: true
	});
	await expect(projectLink).toHaveAttribute('href', articlePath);
	await projectLink.click();
	await expect(page).toHaveURL(new RegExp(`${articlePath}$`, 'u'));
	await waitForLaboratoryOnCurrentPage(page);

	await page.goto('/resume', { waitUntil: 'domcontentloaded' });
	await expect(page.getByText('Human + AI ICU Prediction Laboratory', { exact: true })).toHaveCount(
		0
	);

	await page.goto('/blog/visualizations', { waitUntil: 'domcontentloaded' });
	const articleLink = page.getByRole('link', {
		name: /Human \+ AI ICU Prediction Laboratory/iu
	});
	for (const subject of ['Healthcare', 'Statistics', 'Machine Learning']) {
		const filter = page.getByRole('button', { name: subject, exact: true });
		await filter.click();
		await expect(filter).toHaveAttribute('aria-pressed', 'true');
		await expect(articleLink).toBeVisible();
	}

	await articleLink.click();
	await expect(page).toHaveURL(new RegExp(`${articlePath}$`, 'u'));
	await waitForLaboratoryOnCurrentPage(page);
});
