import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';

type Report = ReturnType<
	typeof import('../../src/lib/visualizations/missing-data/export').fingerprintReport
>;

declare global {
	interface Window {
		__missingAudioContexts?: number;
	}
}

const articlePath = '/blog/visualizations/the-music-of-missing-data';
const posterPath = '/images/visualizations/missing-data/missing-data-social.png';
const explorer = (page: Page) =>
	page.getByRole('region', { name: 'The Music of Missing Data interactive explorer' });
const runtime = (page: Page) => explorer(page).locator('.ms-runtime');

async function ready(page: Page, path = articlePath): Promise<Locator> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	await explorer(page).scrollIntoViewIfNeeded();
	await expect(runtime(page)).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
	await runtime(page).locator('.ms-viewport').scrollIntoViewIfNeeded();
	return runtime(page);
}

async function assumptions(page: Page): Promise<void> {
	const details = runtime(page).locator('details.ms-assumptions');
	if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
}

async function setRange(page: Page, name: string, value: number): Promise<void> {
	await runtime(page)
		.getByRole('slider', { name, exact: true })
		.evaluate((element, next) => {
			const input = element as HTMLInputElement;
			input.value = String(next);
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}, value);
}

async function bytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

async function report(page: Page): Promise<Report> {
	const downloading = page.waitForEvent('download');
	await runtime(page)
		.getByRole('button', { name: /JSON report/ })
		.click();
	return JSON.parse((await bytes(await downloading)).toString('utf8'));
}

test('the article and deterministic poster remain readable without JavaScript', async ({
	browser,
	request,
	baseURL
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain(posterPath);
	expect(html).toContain('Begin with the lights on');
	expect(html.match(/<h1(?=\s|>)/gu)).toHaveLength(1);
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		serviceWorkers: 'block'
	});
	try {
		const page = await context.newPage();
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { level: 1 })).toContainText(
			'The Music of Missing Data'
		);
		await expect(explorer(page).locator(`img[src="${posterPath}"]`)).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Begin with the lights on' })).toBeVisible();
		await expect(
			page.getByRole('link', { name: /patterns from the assumptions about their causes/ })
		).toHaveAttribute('href', /nationalacademies\.org/);
		const poster = await request.get(posterPath);
		expect(poster.ok()).toBe(true);
		expect(poster.headers()['content-type']).toContain('image/png');
	} finally {
		await context.close();
	}
});

test('all seven disappearance processes render a real matrix and preserve complete data within a view', async ({
	page
}) => {
	const failures: string[] = [];
	page.on('pageerror', (error) => failures.push(error.message));
	await ready(page);
	const matrix = runtime(page).locator('.ms-matrix-button canvas');
	await expect(matrix).toHaveCount(1);
	expect(
		await matrix.evaluate((element) => Boolean((element as HTMLCanvasElement).getContext('webgl')))
	).toBe(true);
	const reference = await runtime(page).getByTestId('complete-mean').textContent();
	const scenarios = [
		['Scattered holes', 'Missing completely at random', 'variables'],
		['The observed clue', 'Missing depending on observed information', 'variables'],
		['The unseen clue', 'Missing depending on the missing value itself', 'variables'],
		['Silent instruments', 'Entire missing variables', 'variables'],
		['Dark continents', 'Selective nonresponse', 'variables'],
		['The vanishing cohort', 'Dropout over time', 'time'],
		['An outage, then recovery', 'Failed instruments', 'time']
	];
	for (const [short, label, view] of scenarios) {
		const button = runtime(page).getByRole('button', { name: new RegExp(short, 'u') });
		await button.click();
		await expect(button).toHaveAttribute('aria-pressed', 'true');
		await expect(runtime(page).locator('.ms-scenario-story h3')).toHaveText(label);
		await expect(runtime(page).locator('.ms-instrument-top')).toContainText(
			view === 'time' ? '24 VISITS' : '16 VARIABLES'
		);
		if (view === 'variables')
			await expect(runtime(page).getByTestId('complete-mean')).toHaveText(reference!);
	}
	await matrix.scrollIntoViewIfNeeded();
	const image = await sharp(await matrix.screenshot()).stats();
	expect(image.channels[0].max - image.channels[0].min).toBeGreaterThan(30);
	expect(failures).toEqual([]);
});

test('conditional draws and MNAR sensitivity change only the completion, while mean filling preserves the available mean', async ({
	page
}) => {
	await ready(page);
	await runtime(page)
		.getByRole('button', { name: /The unseen clue/ })
		.click();
	await runtime(page)
		.getByRole('combobox', { name: 'Imputation method' })
		.selectOption('predictive');
	await assumptions(page);
	const available = await runtime(page).getByTestId('available-mean').textContent();
	const complete = await runtime(page).getByTestId('complete-mean').textContent();
	const initial = Number(await runtime(page).getByTestId('completed-mean').textContent());
	await setRange(page, 'Missing outcome sensitivity', 1);
	await expect
		.poll(async () => Number(await runtime(page).getByTestId('completed-mean').textContent()))
		.toBeGreaterThan(initial + 1);
	await expect(runtime(page).getByTestId('available-mean')).toHaveText(available!);
	await expect(runtime(page).getByTestId('complete-mean')).toHaveText(complete!);
	const shifted = await runtime(page).getByTestId('completed-mean').textContent();
	await setRange(page, 'Predictive draw', 1);
	await expect(runtime(page).getByTestId('completed-mean')).not.toHaveText(shifted!);
	await runtime(page).getByRole('combobox', { name: 'Imputation method' }).selectOption('mean');
	await expect(runtime(page).getByTestId('completed-mean')).toHaveText(available!);
	await expect(
		runtime(page).getByRole('slider', { name: 'Missing outcome sensitivity' })
	).toBeDisabled();
	await runtime(page)
		.getByRole('button', { name: /Scattered holes/ })
		.click();
	await runtime(page)
		.getByRole('combobox', { name: 'Imputation method' })
		.selectOption('predictive');
	await expect(
		runtime(page).getByRole('slider', { name: 'Missing outcome sensitivity' })
	).toBeDisabled();
});

test('ordering preserves statistics, keyboard inspection moves cells, and hidden truth needs explicit reveal', async ({
	page
}) => {
	await ready(page);
	const available = await runtime(page).getByTestId('available-mean').textContent();
	await assumptions(page);
	await runtime(page).getByRole('combobox', { name: 'Row ordering' }).selectOption('driver');
	await expect(runtime(page).getByTestId('available-mean')).toHaveText(available!);
	await runtime(page).getByRole('combobox', { name: 'Inspect column' }).selectOption('5');
	const inspector = runtime(page).getByRole('button', { name: /Matrix inspector/ });
	await inspector.focus();
	await inspector.press('ArrowRight');
	await expect(runtime(page).getByRole('combobox', { name: 'Inspect column' })).toHaveValue('6');
	const exported = await report(page);
	const missing = exported.matrix.missingMask.findIndex((value) => value === 1);
	await runtime(page)
		.getByRole('combobox', { name: 'Inspect participant' })
		.selectOption(String(Math.floor(missing / exported.dimensions.columns)));
	await runtime(page)
		.getByRole('combobox', { name: 'Inspect column' })
		.selectOption(String(missing % exported.dimensions.columns));
	await expect(runtime(page).locator('.ms-inspected-value')).toContainText('UNOBSERVED');
	await runtime(page)
		.getByRole('checkbox', { name: /Reveal what vanished/ })
		.check();
	await expect(runtime(page).locator('.ms-inspected-value')).toContainText(
		'SIMULATED HIDDEN TRUTH'
	);
	await expect(runtime(page).locator('.ms-inspected-value strong')).not.toHaveText('—');
});

test('the PNG and JSON describe the current scene and its validated share link replays the result', async ({
	page
}) => {
	await ready(page);
	await runtime(page)
		.getByRole('button', { name: /The observed clue/ })
		.click();
	await runtime(page)
		.getByRole('combobox', { name: 'Imputation method' })
		.selectOption('predictive');
	await setRange(page, 'Target missingness', 0.42);
	await assumptions(page);
	await runtime(page).getByRole('combobox', { name: 'Row ordering' }).selectOption('driver');
	const initialMean = await runtime(page).getByTestId('completed-mean').textContent();
	const exported = await report(page);
	expect(exported.parameters).toMatchObject({
		scenario: 'mar',
		rate: 0.42,
		imputation: 'predictive',
		ordering: 'driver'
	});
	expect(exported.actual.missingCells).toBe(
		exported.matrix.missingMask.reduce((sum, value) => sum + value, 0)
	);
	expect(exported.matrix).not.toHaveProperty('revealedSyntheticTruth');
	expect(exported.matrix.observedValues.some((value) => value === null)).toBe(true);
	const pngDownloading = page.waitForEvent('download');
	await runtime(page)
		.getByRole('button', { name: /Download fingerprint/ })
		.click();
	const png = await bytes(await pngDownloading);
	expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
	expect(await sharp(png).metadata()).toMatchObject({ width: 1800, height: 1300 });
	await runtime(page)
		.getByRole('button', { name: /Copy scene link/ })
		.click();
	const replay = await runtime(page)
		.getByRole('textbox', { name: 'Reproducible scene link' })
		.inputValue();
	expect(new URL(replay).searchParams.get('mdv')).toBe('1');
	await ready(page, replay);
	await expect(runtime(page).getByTestId('completed-mean')).toHaveText(initialMean!);
	const replayed = await report(page);
	expect(replayed.parameters).toEqual(exported.parameters);
	expect(replayed.actual).toEqual(exported.actual);
});

test('sound creates no audio context until enabled and then supports mute and scan control', async ({
	page
}) => {
	await page.addInitScript(() => {
		window.__missingAudioContexts = 0;
		const NativeAudioContext = window.AudioContext;
		window.AudioContext = class extends NativeAudioContext {
			constructor(...args: ConstructorParameters<typeof AudioContext>) {
				super(...args);
				window.__missingAudioContexts = (window.__missingAudioContexts || 0) + 1;
			}
		};
	});
	await ready(page);
	expect(await page.evaluate(() => window.__missingAudioContexts)).toBe(0);
	await runtime(page)
		.getByRole('button', { name: /Enable sound/ })
		.click();
	await expect(runtime(page).getByRole('button', { name: /Mute/, exact: false })).toBeVisible();
	expect(await page.evaluate(() => window.__missingAudioContexts)).toBe(1);
	await runtime(page)
		.getByRole('button', { name: /Pause the scan/ })
		.click();
	await expect(runtime(page).getByRole('button', { name: /Scan the score/ })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await runtime(page).getByRole('button', { name: /Mute/ }).click();
	await expect(runtime(page).getByRole('button', { name: /Unmute/ })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
});

test('the mobile reduced-motion explorer fits its viewport and supports touch inspection', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		serviceWorkers: 'block',
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true,
		reducedMotion: 'reduce'
	});
	try {
		const page = await context.newPage();
		await ready(page);
		await expect(runtime(page)).toHaveAttribute('data-still', 'true');
		await expect(runtime(page).getByRole('button', { name: /Scan the score/ })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
			true
		);
		const matrix = runtime(page).getByRole('button', { name: /Matrix inspector/ });
		await matrix.tap({ position: { x: 50, y: 80 } });
		await expect(
			runtime(page).getByRole('combobox', { name: 'Inspect participant' })
		).not.toHaveValue('0');
		await runtime(page)
			.getByRole('button', { name: /Compare patterns/ })
			.tap();
		await expect(runtime(page).locator('.ms-comparison-grid')).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
			true
		);
	} finally {
		await context.close();
	}
});

test('the requested WebGL fallback retains honest previews, controls, estimates and downloads', async ({
	page
}) => {
	await ready(page, `${articlePath}?webgl=off`);
	await expect(runtime(page).locator('.ms-fallback')).toContainText('WebGL is switched off');
	await expect(runtime(page).locator('.ms-fallback')).toContainText('observed values only');
	await expect(runtime(page).locator('.ms-matrix-button canvas')).toHaveCount(0);
	await runtime(page)
		.getByRole('button', { name: /Silent instruments/ })
		.click();
	await runtime(page).getByRole('combobox', { name: 'Imputation method' }).selectOption('mean');
	await expect(runtime(page).locator('.ms-warning')).toContainText(
		'cannot be learned from these data'
	);
	const exported = await report(page);
	expect(exported.imputation.unestimableColumns.length).toBeGreaterThan(0);
	expect(exported.actual.missingCells).toBeGreaterThan(0);
});

test('the interactive instrument meets automated WCAG A and AA checks with its advanced controls open', async ({
	page
}) => {
	await ready(page);
	await assumptions(page);
	await runtime(page)
		.getByRole('button', { name: /The unseen clue/ })
		.click();
	await runtime(page)
		.getByRole('combobox', { name: 'Imputation method' })
		.selectOption('predictive');
	await runtime(page)
		.getByRole('button', { name: /Compare patterns/ })
		.click();
	const results = await new AxeBuilder({ page })
		.include('.missing-score')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
});

test('graphics context loss retains the current experiment in a useful fallback', async ({
	page
}) => {
	await ready(page);
	const matrix = runtime(page).locator('.ms-matrix-button canvas');
	await expect(matrix).toBeVisible();
	await matrix.evaluate((element) => {
		const extension = (element as HTMLCanvasElement)
			.getContext('webgl')
			?.getExtension('WEBGL_lose_context');
		if (!extension) throw new Error('This browser cannot exercise actual WebGL context loss.');
		extension.loseContext();
	});
	await expect(runtime(page).locator('.ms-fallback')).toContainText('graphics context was lost');
	await expect(runtime(page).getByTestId('available-mean')).toHaveText('50.65');
	expect((await report(page)).actual.missingCells).toBe(528);
});
