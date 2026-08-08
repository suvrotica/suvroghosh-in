import { expect, test, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/weather-inside-the-nucleus';
const articleTitle = 'Weather Inside the Nucleus';
const diagnosticsByPage = new WeakMap<Page, string[]>();

function experience(page: Page): Locator {
	return page.getByTestId('weather-inside-nucleus');
}

function collectUnexpectedRuntimeDiagnostics(page: Page): string[] {
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

async function skipOpening(page: Page): Promise<Locator> {
	const lab = experience(page);
	await expect(lab).toBeVisible();
	const skip = lab.getByRole('button', { name: 'Skip intro', exact: true });
	if (await skip.isVisible()) await skip.click();
	await expect(lab).toHaveAttribute('data-stage', 'observe', { timeout: 60_000 });
	await expect(
		lab.getByRole('button', { name: 'Intervene once', exact: true }).first()
	).toBeVisible();
	return lab;
}

async function reachContactResult(page: Page): Promise<Locator> {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const lab = await skipOpening(page);
	await lab.getByRole('button', { name: 'Intervene once', exact: true }).first().click();
	await expect(lab).toHaveAttribute('data-stage', 'intervene');

	const contact = lab.getByRole('button', { name: /Change how often they meet/u });
	await contact.click();
	await expect(contact).toHaveAttribute('aria-pressed', 'true');
	await expect(lab).toContainText('The enhancer and promoter meet more often—not always.');
	await expect(lab.getByLabel('Normalized geometry bias')).toHaveValue('1');
	await lab.getByRole('button', { name: 'Commit this intervention', exact: true }).click();
	await expect(lab).toHaveAttribute('data-stage', 'replay');
	await expect(
		lab.getByRole('heading', {
			name: 'Same random starting stream; one modeled cause changed.',
			exact: true
		})
	).toBeVisible();

	await expect.poll(() => new URL(page.url()).searchParams.get('scenario')).toBe('contact');
	await lab.getByRole('button', { name: 'Run this cell', exact: true }).click();
	await expect(lab).toHaveAttribute('data-stage', 'repeat', { timeout: 60_000 });
	await expect(
		lab.getByRole('heading', { name: 'Closer. Still silent.', exact: true })
	).toBeVisible();
	return lab;
}

test.beforeEach(({ page }) => {
	diagnosticsByPage.set(page, collectUnexpectedRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(diagnosticsByPage.get(page) ?? []).toEqual([]);
});

test('the canonical route SSRs one H1, the authored poster, and the immersive lead', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	expect(response.headers()['content-type']).toContain('text/html');
	const html = await response.text();
	expect(html.match(/<h1(?:\s[^>]*)?>Weather Inside the Nucleus<\/h1>/gu)).toHaveLength(1);
	expect(html).toMatch(/class="[^"]*nucleus-poster/u);
	expect(html).toContain('/images/weather-inside-the-nucleus.png');
	expect(html).toContain('A signal arrives. A gene hesitates.');

	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	await expect(
		page.getByRole('heading', { level: 1, name: articleTitle, exact: true })
	).toHaveCount(1);
	const lab = experience(page);
	await expect(lab).toBeVisible();
	const desktopBounds = await lab.evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		return {
			left: bounds.left,
			right: bounds.right,
			viewportWidth: document.documentElement.clientWidth
		};
	});
	expect(
		desktopBounds.left,
		'immersive lead stays inside the desktop viewport'
	).toBeGreaterThanOrEqual(0);
	expect(
		desktopBounds.right,
		'immersive lead stays inside the desktop viewport'
	).toBeLessThanOrEqual(desktopBounds.viewportWidth + 1);
	await expect(
		lab.getByRole('img', { name: /A signal reaches a synthetic locus inside a modeled nucleus/u })
	).toBeVisible();
	await expect(lab).toHaveAttribute('data-model-version', '1.0.0');
});

test('skip intro lands on the first guided action', async ({ page }) => {
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const lab = await skipOpening(page);
	await expect(
		lab.getByRole('heading', { name: 'Watch one possible cell.', exact: true })
	).toBeVisible();
	await expect(lab).toContainText('This happened once. It was not guaranteed.');
	await expect(lab.locator('.stage-bar')).toContainText('Step 2 of 6 observe');
});

test('the guided contact path preserves the decisive silence and exposes the 48-run table', async ({
	page
}) => {
	const lab = await reachContactResult(page);
	const url = new URL(page.url());
	expect(url.searchParams.get('nucleus_v')).toBe('1');
	expect(url.searchParams.get('nucleus_model')).toBe('weather-inside-nucleus-1.0.0');
	expect(url.searchParams.get('seed')).toBe('3');
	expect(url.searchParams.get('contact')).toBe('1');

	await lab.getByRole('button', { name: 'Compare 48 possible cells', exact: true }).click();
	await expect(lab).toHaveAttribute('data-stage', 'inspect');
	const ensemble = lab.getByTestId('nucleus-ensemble');
	await expect(ensemble).toBeVisible();
	await expect(ensemble.getByRole('heading', { name: 'Compare 48 possible cells' })).toBeVisible();
	await expect(ensemble).toContainText('Closer. Still silent.');
	await expect(ensemble).toContainText('The odds moved. The outcome did not obey.', {
		timeout: 60_000
	});

	const table = ensemble.getByRole('table');
	await expect(table).toBeVisible();
	await expect(table.locator('caption')).toHaveText(
		'Model-distribution summary; silent runs remain in every denominator and are censored at the observation horizon.'
	);
	await expect(table.locator('tbody tr')).toHaveCount(2);
	await expect(table.locator('tbody tr').filter({ hasText: 'Baseline' })).toContainText('48');
	await expect(
		table.locator('tbody tr').filter({ hasText: 'Raised contact propensity' })
	).toContainText('48');
});

test('replay preserves the focal seed, URL, model version, and result', async ({ page }) => {
	const lab = await reachContactResult(page);
	const beforeUrl = page.url();
	const beforeResult = (await lab.locator('.result-copy p').nth(1).innerText()).trim();
	await lab.getByRole('button', { name: 'Replay this cell', exact: true }).click();
	await expect(lab.locator('[aria-live="polite"]')).toContainText(
		'Replay preserved seed 3 and model 1.0.0.',
		{ timeout: 60_000 }
	);
	expect(page.url()).toBe(beforeUrl);
	expect(new URL(page.url()).searchParams.get('seed')).toBe('3');
	await expect(lab.locator('.result-copy p').nth(1)).toHaveText(beforeResult);
});

test('reduced motion reaches the renderer and removes canvas transitions', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${articlePath}?renderer=3d&motion=reduce`, { waitUntil: 'domcontentloaded' });
	expect(
		await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
	).toBe(true);
	const stage = experience(page).locator('.weather-stage');
	await expect(stage).toBeVisible();
	await expect(stage).toHaveClass(/reduced-motion/u);
	const transitionDuration = await stage
		.locator('canvas')
		.evaluate((canvas) => getComputedStyle(canvas).transitionDuration);
	expect(transitionDuration).toBe('0s');
});

test('webgl=off keeps the complete route on its synchronized 2D view', async ({ page }) => {
	await page.goto(`${articlePath}?webgl=off&renderer=3d&view=territory`, {
		waitUntil: 'domcontentloaded'
	});
	const lab = experience(page);
	await expect(lab.getByRole('button', { name: '2D', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(lab.locator('.weather-stage')).toHaveCount(0);
	await expect(lab.locator('svg.nucleus-poster')).toBeVisible();

	await skipOpening(page);
	const liveScene = lab.locator('.live-scene');
	await expect(liveScene).toHaveAttribute('data-renderer', '2d');
	await expect(liveScene.getByTestId('nucleus-cross-section')).toBeVisible();
	await expect(
		liveScene.getByRole('img', { name: /Interactive two-dimensional nucleus cross-section/u })
	).toBeVisible();

	await lab.getByRole('button', { name: 'Intervene once', exact: true }).first().click();
	await expect(lab).toHaveAttribute('data-stage', 'intervene');
	await expect(liveScene.locator('.scene-targets')).toHaveCount(0);
	await expect(lab.getByRole('heading', { name: 'Where will you intervene?' })).toBeVisible();
	await expect(lab.getByRole('button', { name: /Change how often they meet/u })).toBeVisible();

	await page.addInitScript(() => {
		const nativeGetContext = HTMLCanvasElement.prototype.getContext;
		Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
			configurable: true,
			value(this: HTMLCanvasElement, contextId: string, ...arguments_: unknown[]) {
				if (contextId.toLowerCase() === 'webgl2') return null;
				return Reflect.apply(nativeGetContext, this, [contextId, ...arguments_]);
			}
		});
	});
	const sharedState = new URLSearchParams({
		nucleus_v: '1',
		nucleus_model: 'weather-inside-nucleus-1.0.0',
		scenario: 'contact',
		seed: '424242',
		contact: '1',
		view: 'territory',
		time: '12.5',
		renderer: '3d'
	});
	await page.goto(`${articlePath}?${sharedState}`, { waitUntil: 'domcontentloaded' });
	await expect.poll(() => new URL(page.url()).searchParams.get('renderer')).toBe('2d');
	const restored = new URL(page.url()).searchParams;
	for (const key of ['scenario', 'contact', 'seed', 'view', 'time'] as const) {
		expect(restored.get(key), `${key} survived WebGL fallback`).toBe(sharedState.get(key));
	}
	await expect(experience(page).getByRole('button', { name: '2D', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('the no-JavaScript route retains a meaningful poster, causal sequence, and disclosure', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	try {
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(
			page.getByRole('heading', { level: 1, name: articleTitle, exact: true })
		).toHaveCount(1);
		await expect(page.locator('svg.nucleus-poster')).toBeVisible();
		const staticHeading = page.getByRole('heading', {
			name: 'Weather Inside the Nucleus — static route',
			exact: true
		});
		await expect(staticHeading).toBeVisible();
		const staticRoute = staticHeading.locator('..');
		await expect(page.locator('img[src="/images/weather-inside-the-nucleus.png"]')).toBeVisible();
		await expect(staticRoute).toContainText('EGF stays outside the cell');
		await expect(staticRoute).toContainText('Closer. Still silent.');
		await expect(staticRoute).toContainText(
			'This is a synthetic demonstration locus in illustrative model time'
		);
	} finally {
		await context.close();
	}
});

test('320- and 390-pixel guided layouts do not leak horizontal page overflow', async ({
	browser,
	baseURL
}) => {
	for (const width of [320, 390]) {
		const context = await browser.newContext({
			baseURL,
			viewport: { width, height: 844 },
			isMobile: true,
			hasTouch: true,
			reducedMotion: 'reduce'
		});
		const page = await context.newPage();
		const diagnostics = collectUnexpectedRuntimeDiagnostics(page);
		try {
			await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
			const lab = await skipOpening(page);
			await lab.getByRole('button', { name: 'Intervene once', exact: true }).first().click();
			await lab.getByRole('button', { name: /Change how often they meet/u }).click();
			const geometry = await lab.evaluate((element) => ({
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth,
				bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
				labOverflow: element.scrollWidth - element.clientWidth,
				labWidth: element.getBoundingClientRect().width
			}));
			expect(geometry.documentOverflow, `${width}px document overflow`).toBeLessThanOrEqual(1);
			expect(geometry.bodyOverflow, `${width}px body overflow`).toBeLessThanOrEqual(1);
			expect(geometry.labOverflow, `${width}px laboratory overflow`).toBeLessThanOrEqual(1);
			expect(geometry.labWidth).toBeLessThanOrEqual(width);
			expect(diagnostics).toEqual([]);
		} finally {
			await context.close();
		}
	}
});

test('a synthetic WebGL context interruption exposes fallback and restores the live canvas', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${articlePath}?renderer=3d&motion=reduce`, { waitUntil: 'domcontentloaded' });
	const stage = experience(page).locator('.weather-stage');
	await expect(stage).toHaveAttribute('data-renderer-status', /^(ready|fallback)$/u, {
		timeout: 60_000
	});
	const initialStatus = await stage.getAttribute('data-renderer-status');
	test.skip(initialStatus !== 'ready', 'The configured browser does not expose WebGL 2.');

	const canvas = stage.locator('canvas');
	await canvas.evaluate((element) => {
		element.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
	});
	await expect(stage).toHaveAttribute('data-renderer-status', 'context-lost');
	await expect(stage.locator('.fallback-layer')).toBeVisible();

	await canvas.evaluate((element) => {
		element.dispatchEvent(new Event('webglcontextrestored'));
	});
	await expect(stage).toHaveAttribute('data-renderer-status', 'ready');
	await expect(canvas).toBeVisible();
	await expect(experience(page).locator('.status-line')).toContainText(
		'The three-dimensional nucleus view has been restored.'
	);
});
