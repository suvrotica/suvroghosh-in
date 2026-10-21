import { expect, test, type Download, type Locator, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extractNarration } from '../../src/lib/components/blog/tts/narration.mjs';

type Receipt = ReturnType<
	typeof import('../../src/lib/visualizations/shape-of-waiting/export').receiptReport
>;

const articlePath = '/blog/visualizations/the-shape-of-waiting';
const posterPath = '/images/visualizations/shape-of-waiting/shape-of-waiting-social.png';
const laboratory = (page: Page) => page.locator('.sow-lab');
const runtime = (page: Page) => laboratory(page).locator('[data-ready]');

async function ready(page: Page, path = articlePath): Promise<Locator> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	await laboratory(page).scrollIntoViewIfNeeded();
	await expect(runtime(page)).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
	return runtime(page);
}

async function settled(page: Page): Promise<void> {
	await expect(runtime(page)).toHaveAttribute('data-ready', 'true');
}

async function requestRange(page: Page, name: string, value: number): Promise<void> {
	await runtime(page)
		.getByRole('slider', { name, exact: true })
		.evaluate((element, next) => {
			const input = element as HTMLInputElement;
			input.value = String(next);
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}, value);
}

async function setRange(page: Page, name: string, value: number): Promise<void> {
	await requestRange(page, name, value);
	await settled(page);
}

async function bytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	if (!stream) throw new Error('The browser did not supply a download stream.');
	const chunks: Buffer[] = [];
	for await (const chunk of stream)
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks);
}

async function report(page: Page): Promise<Receipt> {
	const downloading = page.waitForEvent('download');
	await runtime(page).getByRole('button', { name: 'Download JSON', exact: true }).click();
	return JSON.parse((await bytes(await downloading)).toString('utf8')) as Receipt;
}

function comparisonRow(page: Page, name: string): Locator {
	return runtime(page)
		.getByRole('region', { name: 'Paired queue comparison' })
		.getByRole('row')
		.filter({ has: page.getByRole('cell', { name, exact: true }) });
}

test('the article and model-derived poster remain readable without JavaScript', async ({
	browser,
	request,
	baseURL
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain(posterPath);
	expect(html.match(/<h1(?=\s|>)/gu)).toHaveLength(1);
	expect(html).toContain('Begin with the person at the edge');
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		serviceWorkers: 'block'
	});
	try {
		const page = await context.newPage();
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { level: 1 })).toContainText('The Shape of');
		await expect(laboratory(page).locator(`img[src="${posterPath}"]`)).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Begin with the person at the edge' })
		).toBeVisible();
		await expect(page.getByRole('link', { name: /right-censored observations/ })).toHaveAttribute(
			'href',
			/itl\.nist\.gov/u
		);
		const poster = await request.get(posterPath);
		expect(poster.ok()).toBe(true);
		expect(await sharp(await poster.body()).metadata()).toMatchObject({
			width: 1200,
			height: 630,
			format: 'png'
		});
	} finally {
		await context.close();
	}
});

test('article narration retains the same prose and transcript hash before hydration and after queue experiments', async ({
	browser,
	page,
	baseURL
}) => {
	const source = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		serviceWorkers: 'block'
	});
	try {
		const ssr = await source.newPage();
		await ssr.goto(articlePath, { waitUntil: 'domcontentloaded' });
		expect(await laboratory(ssr).getAttribute('data-tts-exclude')).not.toBeNull();
		const transcript = await ssr.evaluate(extractNarration, undefined);
		expect(transcript).toContain('The sign says average waiting time: twenty minutes.');
		expect(transcript).toContain('Begin with the person at the edge');
		expect(transcript).toContain(
			'Return to the sign. Twenty minutes may still be a correct average.'
		);
		for (const chrome of [
			'THE EVERYDAY SYSTEMS LABORATORY',
			'The average has excellent manners.',
			'Opening the counters.',
			'CHANGE THE RULE / SAME SEED'
		])
			expect(transcript).not.toContain(chrome);
		const hash = (text: string) => createHash('sha256').update(text).digest('hex');
		const expectedHash = hash(transcript);
		await ready(page);
		const hydrated = await page.evaluate(extractNarration, undefined);
		expect(hydrated).toBe(transcript);
		expect(hash(hydrated)).toBe(expectedHash);
		await setRange(page, 'Staff', 3);
		await expect(runtime(page).getByRole('slider', { name: 'Staff', exact: true })).toHaveValue(
			'3'
		);
		expect(await page.evaluate(extractNarration, undefined)).toBe(transcript);
		await runtime(page)
			.getByRole('button', { name: /Better average, worse tail/u })
			.click();
		await settled(page);
		await expect(
			runtime(page).getByRole('region', { name: 'Paired queue comparison' })
		).toContainText('The average improved. The longest wait did not.');
		const changed = await page.evaluate(extractNarration, undefined);
		expect(changed).toBe(transcript);
		expect(hash(changed)).toBe(expectedHash);
	} finally {
		await source.close();
	}
});

test('all seven settings run the real queue engine and draw a non-empty Canvas', async ({
	page
}) => {
	const failures: string[] = [];
	page.on('pageerror', (error) => failures.push(error.message));
	await ready(page);
	await runtime(page).getByText('Advanced settings & assumptions', { exact: true }).click();
	const settings = [
		'Bank',
		'Clinic',
		'Visa office',
		'Railway counter',
		'Call centre',
		'Emergency department',
		'Business inbox'
	];
	for (const label of settings) {
		const button = runtime(page).getByRole('button', { name: label, exact: true });
		await button.click();
		await settled(page);
		await expect(button).toHaveAttribute('aria-pressed', 'true');
		await expect(runtime(page).getByRole('heading', { level: 2 })).toHaveText(
			`${label}: a synthetic day`
		);
		await expect(runtime(page).locator('.sow-population').first()).toContainText('service started');
		if (label === 'Bank') {
			const slider = runtime(page).getByRole('slider', { name: 'Service variability' });
			await expect
				.soft(slider, 'Bank must retain its configured CV 0.8 without native slider rounding')
				.toHaveValue('0.8', { timeout: 1000 });
			await expect(slider.locator('..').locator('output')).toHaveText('CV 0.8');
		}
		if (label === 'Clinic') {
			const slider = runtime(page).getByRole('slider', { name: 'No-show rate' });
			await expect
				.soft(
					slider,
					'Clinic must retain its configured no-show rate 0.18 without native slider rounding'
				)
				.toHaveValue('0.18', { timeout: 1000 });
			await expect(slider.locator('..').locator('output')).toHaveText('18.0%');
		}
		if (label === 'Call centre') {
			const slider = runtime(page).getByRole('slider', { name: 'Patience', exact: true });
			await expect
				.soft(
					slider,
					'Call centre must retain its configured patience 18 minutes without native slider rounding'
				)
				.toHaveValue('18', { timeout: 1000 });
			await expect(slider.locator('..').locator('output')).toHaveText('18 min mean');
		}
		await expect(
			runtime(page).getByRole('region', { name: 'Live queue', exact: true }).locator('canvas')
		).toHaveCount(1);
	}
	const canvas = runtime(page)
		.getByRole('region', { name: 'Live queue', exact: true })
		.locator('canvas');
	await canvas.scrollIntoViewIfNeeded();
	const image = await sharp(await canvas.screenshot()).stats();
	expect(image.channels[0].max - image.channels[0].min).toBeGreaterThan(30);
	await runtime(page).getByRole('button', { name: 'Run to result', exact: true }).click();
	await expect(runtime(page).locator('.sow-clock')).toContainText('resolved');
	expect(failures).toEqual([]);
});

test('oldest-ticket and keyboard inspection survive stepping and expose exact waiting ages', async ({
	page
}) => {
	await ready(page);
	await laboratory(page).evaluate((element) => element.scrollIntoView({ block: 'start' }));
	await page.screenshot({ path: 'artifacts/shape-of-waiting/desktop-opening.png' });
	await page.setViewportSize({ width: 834, height: 1112 });
	await page.screenshot({ path: 'artifacts/shape-of-waiting/tablet-opening.png' });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
		true
	);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await runtime(page).getByRole('button', { name: 'Follow the oldest', exact: true }).click();
	await expect(runtime(page).locator('.sow-inspector h3')).toHaveText(/Ticket \d{3}/u);
	await expect(runtime(page).locator('.sow-inspector')).toContainText('Unresolved');
	const next = runtime(page)
		.getByRole('button', { name: 'Select next person in the waiting queue' })
		.first();
	await next.focus();
	await next.press('Enter');
	await expect(runtime(page).locator('.sow-inspector h3')).toHaveText(/Ticket \d{3}/u);
	const initial = Number(
		await runtime(page).getByRole('slider', { name: 'Simulated time' }).inputValue()
	);
	await runtime(page).getByRole('button', { name: 'Step +5 min', exact: true }).click();
	await expect(runtime(page).getByRole('slider', { name: 'Simulated time' })).toHaveValue(
		String(initial + 5)
	);
	await runtime(page).getByRole('button', { name: 'Restart', exact: true }).click();
	await expect(runtime(page).getByRole('slider', { name: 'Simulated time' })).toHaveValue('0');
	await expect(runtime(page).locator('.sow-dashboard')).toContainText('—');
	await runtime(page).getByRole('button', { name: 'Run to result', exact: true }).click();
	await expect(runtime(page).locator('.sow-clock')).toContainText('resolved');
});

test('the headline guided experiment lowers the closed-cohort mean and worsens its tail', async ({
	page
}) => {
	await ready(page);
	await runtime(page)
		.getByRole('button', { name: /Better average, worse tail/u })
		.click();
	await settled(page);
	const comparison = runtime(page).getByRole('region', { name: 'Paired queue comparison' });
	await expect(comparison).toContainText('The average improved. The longest wait did not.');
	await expect(comparison).toContainText('Closed-cohort results');
	for (const [name, direction] of [
		['Mean', -1],
		['P90', 1],
		['Maximum', 1]
	] as const) {
		const cells = comparisonRow(page, name).getByRole('cell');
		const a = Number(await cells.nth(1).textContent());
		const b = Number(await cells.nth(2).textContent());
		expect((b - a) * direction).toBeGreaterThan(0);
	}
	await expect(comparisonRow(page, 'Unresolved (people)').getByRole('cell').nth(1)).toHaveText(
		'0.0'
	);
	await expect(comparisonRow(page, 'Unresolved (people)').getByRole('cell').nth(2)).toHaveText(
		'0.0'
	);
	await expect(
		comparison.getByRole('region', { name: 'Baseline queue', exact: true }).locator('canvas')
	).toHaveCount(1);
	await expect(
		comparison.getByRole('region', { name: 'Alternative queue', exact: true }).locator('canvas')
	).toHaveCount(1);
	await comparison.screenshot({
		path: 'artifacts/shape-of-waiting/desktop-comparison.png',
		style: '.site-header { visibility: hidden !important; }'
	});
});

test('staffing and variability experiments retain the baseline and disclose changed demand', async ({
	page
}) => {
	await ready(page);
	await runtime(page)
		.getByRole('button', { name: /One more counter/u })
		.click();
	await settled(page);
	await expect(runtime(page).getByRole('slider', { name: 'Staff', exact: true })).toHaveValue('3');
	await expect(
		runtime(page).getByRole('region', { name: 'Paired queue comparison' })
	).toContainText('Paired synthetic demand');
	await runtime(page)
		.getByRole('button', { name: /Same mean, more uncertainty/u })
		.click();
	await settled(page);
	await expect(runtime(page).getByRole('slider', { name: 'Mean service duration' })).toHaveValue(
		'5'
	);
	await expect(runtime(page).getByRole('slider', { name: 'Service variability' })).toHaveValue('2');
	await expect(
		runtime(page).getByRole('region', { name: 'Paired queue comparison' })
	).toContainText('Demand settings differ');
});

test('real PNG and JSON downloads freeze the scene and its replay reproduces the same report', async ({
	page
}) => {
	await ready(page);
	await runtime(page)
		.getByRole('button', { name: /Better average, worse tail/u })
		.click();
	await settled(page);
	await setRange(page, 'Simulated time', 120);
	await runtime(page)
		.getByRole('region', { name: 'Baseline queue', exact: true })
		.getByRole('button', { name: 'Select next person in the waiting queue' })
		.click();
	const selectedTicket = await runtime(page).locator('.sow-inspector h3').textContent();
	expect(selectedTicket).toMatch(/^Ticket \d{3}$/u);
	await expect(
		runtime(page).getByRole('region', { name: 'Paired queue comparison' })
	).toContainText(`${selectedTicket} · A:`);
	const exported = await report(page);
	expect(exported).toMatchObject({
		schemaVersion: 1,
		modelVersion: 'waiting-1',
		seed: 1817,
		snapshotTime: 120,
		settings: { policy: 'priority', seed: 1817 },
		baseline: { settings: { policy: 'fifo', seed: 1817 } }
	});
	expect(exported.metrics.arrived).toBe(
		exported.metrics.waiting +
			exported.metrics.active +
			exported.metrics.completed +
			exported.metrics.abandoned
	);
	expect(exported.definitions.quantile).toContain('Hyndman–Fan type 7');
	const downloading = page.waitForEvent('download');
	await runtime(page).getByRole('button', { name: 'Download PNG', exact: true }).click();
	const png = await bytes(await downloading);
	expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
	const metadata = await sharp(png).metadata();
	expect(metadata.width).toBeGreaterThanOrEqual(1200);
	expect(metadata.height).toBeGreaterThanOrEqual(630);
	await runtime(page).getByRole('button', { name: 'Copy replay link', exact: true }).click();
	const replay = await runtime(page).getByRole('textbox', { name: 'Replay URL' }).inputValue();
	expect(new URL(replay).hash).toMatch(/^#waiting=/u);
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await ready(page, replay);
	expect(await report(page)).toEqual(exported);
});

test('the mobile Still laboratory stays in its viewport and supports touch comparison', async ({
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
		await laboratory(page).evaluate((element) => element.scrollIntoView({ block: 'start' }));
		await page.screenshot({ path: 'artifacts/shape-of-waiting/mobile-opening.png' });
		await expect(runtime(page)).toHaveAttribute('data-still', 'true');
		await expect(runtime(page).getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
		await runtime(page).getByRole('button', { name: 'Follow the oldest', exact: true }).tap();
		await expect(runtime(page).locator('.sow-inspector h3')).toHaveText(/Ticket \d{3}/u);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
			true
		);
		await runtime(page)
			.getByRole('button', { name: /Better average, worse tail/u })
			.tap();
		await settled(page);
		await expect(
			runtime(page).getByRole('region', { name: 'Paired queue comparison' })
		).toBeVisible();
		await runtime(page).getByRole('region', { name: 'Paired queue comparison' }).screenshot({
			path: 'artifacts/shape-of-waiting/mobile-comparison.png',
			style: '.site-header { visibility: hidden !important; }'
		});
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
			true
		);
		await page.evaluate(() => document.documentElement.style.setProperty('font-size', '125%'));
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
			true
		);
	} finally {
		await context.close();
	}
});

test('malformed replay falls back visibly and navigation remounts a fresh usable laboratory', async ({
	page
}) => {
	const failures: string[] = [];
	page.on('pageerror', (error) => failures.push(error.message));
	await ready(page, `${articlePath}#waiting=%7B%22version%22%3A%22future%22%7D`);
	await expect(runtime(page).locator('.sow-status[role="status"]')).toContainText(
		'malformed or uses an unsupported version'
	);
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await ready(page);
	await setRange(page, 'Staff', 4);
	await runtime(page).getByRole('button', { name: 'Run to result', exact: true }).click();
	await expect(runtime(page).locator('.sow-clock')).toContainText('resolved');
	expect(failures).toEqual([]);
});

test('closing an in-flight comparison persists, and a real worker failure clears stale receipts before recovery', async ({
	page,
	context
}) => {
	const workers: string[] = [];
	page.on('worker', (worker) => workers.push(worker.url()));
	await ready(page);
	const workerUrl = workers[0];
	if (!workerUrl) throw new Error('The initial run did not create an observable dedicated worker.');
	expect(new URL(workerUrl).origin).toBe(new URL(page.url()).origin);
	await runtime(page).getByRole('button', { name: 'Keep as baseline', exact: true }).click();
	await expect(
		runtime(page).getByRole('region', { name: 'Paired queue comparison' })
	).toBeVisible();

	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let blockedRequests = 0;
	const delayWorker = async (route: Route) => {
		blockedRequests++;
		await gate;
		await route.continue();
	};
	await context.route(workerUrl, delayWorker);
	try {
		await requestRange(page, 'Staff', 3);
		await expect(runtime(page)).toHaveAttribute('data-ready', 'false');
		await expect.poll(() => blockedRequests).toBe(1);
		await runtime(page).getByRole('button', { name: 'Close comparison', exact: true }).click();
		await expect(
			runtime(page).getByRole('region', { name: 'Paired queue comparison' })
		).toHaveCount(0);
		release();
		await settled(page);
		await expect(
			runtime(page).getByRole('region', { name: 'Paired queue comparison' })
		).toHaveCount(0);
		const closed = await report(page);
		expect(closed.settings.servers).toBe(3);
		expect(closed.baseline).toBeNull();
		expect(closed.replay.baseline).toBeNull();
	} finally {
		release();
		await context.unroute(workerUrl, delayWorker);
	}

	// A slower baseline extends the shared clock beyond the alternative's drain time.
	await setRange(page, 'Staff', 1);
	await runtime(page).getByRole('button', { name: 'Keep as baseline', exact: true }).click();
	await setRange(page, 'Staff', 8);
	await runtime(page).getByRole('button', { name: 'Run to result', exact: true }).click();
	const pairedResult = await report(page);
	expect(pairedResult.baseline!.finalSimulatedTime).toBeGreaterThan(
		pairedResult.finalSimulatedTime
	);
	await runtime(page).getByRole('button', { name: 'Close comparison', exact: true }).click();
	await expect(runtime(page).getByRole('region', { name: 'Paired queue comparison' })).toHaveCount(
		0
	);
	const clock = runtime(page).getByRole('slider', { name: 'Simulated time' });
	expect(Number(await clock.inputValue())).toBeLessThanOrEqual(
		Number(await clock.getAttribute('max'))
	);
	const singleResult = await report(page);
	expect(singleResult.baseline).toBeNull();
	expect(singleResult.requestedTime).toBe(singleResult.snapshotTime);

	let failedRequests = 0;
	const failWorker = async (route: Route) => {
		failedRequests++;
		await route.abort('failed');
	};
	await context.route(workerUrl, failWorker);
	try {
		await requestRange(page, 'Staff', 4);
		await expect.poll(() => failedRequests).toBe(1);
		await expect(runtime(page).getByRole('alert')).toContainText('simulation worker could not run');
		await expect(runtime(page)).toHaveAttribute('data-ready', 'false');
		await expect(
			runtime(page).getByRole('button', { name: 'Download JSON', exact: true })
		).toHaveCount(0);
		await expect(
			runtime(page).getByRole('button', { name: 'Keep as baseline', exact: true })
		).toBeDisabled();
	} finally {
		await context.unroute(workerUrl, failWorker);
	}
	await setRange(page, 'Staff', 5);
	await expect(runtime(page).getByRole('alert')).toHaveCount(0);
	const recovered = await report(page);
	expect(recovered.settings.servers).toBe(5);
	expect(recovered.baseline).toBeNull();
	expect(recovered.replay.baseline).toBeNull();
});

test('advanced controls and paired results meet automated WCAG A and AA checks', async ({
	page
}) => {
	await ready(page);
	await runtime(page)
		.getByRole('button', { name: /Better average, worse tail/u })
		.click();
	await settled(page);
	await runtime(page).getByText('Advanced settings & assumptions', { exact: true }).click();
	const results = await new AxeBuilder({ page })
		.include('.sow-lab')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	await mkdir('artifacts/shape-of-waiting', { recursive: true });
	await writeFile(
		'artifacts/shape-of-waiting/axe-results.json',
		JSON.stringify(
			{
				testEngine: results.testEngine,
				testRunner: results.testRunner,
				testEnvironment: results.testEnvironment,
				toolOptions: results.toolOptions,
				timestamp: results.timestamp,
				url: results.url,
				counts: {
					violations: results.violations.length,
					passes: results.passes.length,
					incomplete: results.incomplete.length,
					inapplicable: results.inapplicable.length
				},
				violations: results.violations,
				passes: results.passes.map((rule) => ({ id: rule.id, nodeCount: rule.nodes.length })),
				incomplete: results.incomplete.map((rule) => ({
					id: rule.id,
					nodeCount: rule.nodes.length
				})),
				inapplicable: results.inapplicable.map((rule) => rule.id)
			},
			null,
			2
		)
	);
	expect(results.violations).toEqual([]);
});
