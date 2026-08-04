import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/brownian-motion-laboratory';
const articleTitle = 'The Particle That Could Not Make Up Its Mind';
const staticArticlePath = '/blog/healthcare-it/latent-space-in-healthcare-data';
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const runtimeDiagnostics = new WeakMap<Page, string[]>();

type WorkerCounts = {
	created: number;
	active: number;
	terminated: number;
	errors: number;
	urls: string[];
};

function laboratory(page: Page): Locator {
	return page.getByTestId('brownian-motion-lab');
}

function stageCanvas(page: Page): Locator {
	return laboratory(page).getByTestId('brownian-stage').locator('canvas');
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

async function waitForLaboratory(page: Page): Promise<Locator> {
	const lab = laboratory(page);
	await expect(lab).toHaveCount(1);
	await expect(lab).toBeVisible();
	await lab.scrollIntoViewIfNeeded();
	await expect(lab).toHaveAttribute('data-hydrated', 'true');
	await expect(lab.getByTestId('brownian-stage')).toHaveClass(/is-ready/u);
	await expect(stageCanvas(page)).toBeVisible();
	await expect
		.poll(() =>
			stageCanvas(page).evaluate((canvas) => {
				const element = canvas as HTMLCanvasElement;
				return Math.min(element.width, element.height);
			})
		)
		.toBeGreaterThan(250);
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

async function openExportMenu(lab: Locator): Promise<Locator> {
	const menu = lab.locator('details.export-menu');
	if (!(await menu.evaluate((element) => (element as HTMLDetailsElement).open))) {
		await menu.locator('summary').click();
	}
	await expect(menu).toHaveAttribute('open', '');
	return menu;
}

async function exportedBytes(page: Page, lab: Locator, buttonName: string): Promise<Buffer> {
	const menu = await openExportMenu(lab);
	const downloadPromise = page.waitForEvent('download');
	await menu.getByRole('button', { name: buttonName, exact: true }).click();
	return downloadBytes(await downloadPromise);
}

async function installClipboardCapture(page: Page): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (value: string) => {
					Object.defineProperty(window, '__brownianCopiedText', {
						configurable: true,
						writable: true,
						value
					});
				}
			}
		});
	});
}

async function copiedText(page: Page): Promise<string> {
	return page.evaluate(() => String(Reflect.get(window, '__brownianCopiedText') ?? ''));
}

async function setNumericControlValue(locator: Locator, value: number): Promise<void> {
	await locator.evaluate((element, nextValue) => {
		const input = element as HTMLInputElement;
		input.value = String(nextValue);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}, value);
}

async function installWorkerRecorder(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const counts: WorkerCounts = {
			created: 0,
			active: 0,
			terminated: 0,
			errors: 0,
			urls: []
		};
		const NativeWorker = window.Worker;
		const TrackingWorker = function (
			this: Worker,
			scriptURL: string | URL,
			options?: WorkerOptions
		): Worker {
			const worker = options ? new NativeWorker(scriptURL, options) : new NativeWorker(scriptURL);
			counts.created += 1;
			counts.active += 1;
			counts.urls.push(String(scriptURL));
			worker.addEventListener('error', () => {
				counts.errors += 1;
			});
			let terminated = false;
			const terminate = worker.terminate.bind(worker);
			worker.terminate = () => {
				if (!terminated) {
					terminated = true;
					counts.terminated += 1;
					counts.active -= 1;
				}
				terminate();
			};
			return worker;
		} as unknown as typeof Worker;
		TrackingWorker.prototype = NativeWorker.prototype;
		Object.setPrototypeOf(TrackingWorker, NativeWorker);
		Object.defineProperty(window, 'Worker', {
			configurable: true,
			writable: true,
			value: TrackingWorker
		});
		Object.defineProperty(window, '__brownianWorkerCounts', {
			configurable: true,
			value: counts
		});
	});
}

async function workerCounts(page: Page): Promise<WorkerCounts> {
	return page.evaluate(() => Reflect.get(window, '__brownianWorkerCounts') as WorkerCounts);
}

function withoutExportTime(record: Record<string, unknown>): Record<string, unknown> {
	const copy = structuredClone(record);
	delete copy.exportedAt;
	return copy;
}

test.beforeEach(({ page }) => {
	runtimeDiagnostics.set(page, collectUnexpectedRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(runtimeDiagnostics.get(page) ?? []).toEqual([]);
});

test('the canonical article hydrates one deterministic laboratory and reveals ensemble diagnostics', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain(articleTitle);
	expect(html).toContain('/images/brownian-motion-laboratory.png');
	expect(html).toContain('data-testid="brownian-motion-lab"');
	expect(html).toContain('One particle looks confused. Add 999 more.');

	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { level: 1, name: articleTitle })).toHaveCount(1);
	const lab = await waitForLaboratory(page);
	await expect(lab).toHaveAttribute('data-process', 'free-brownian');
	await expect(lab).toHaveAttribute('data-particle-count', '1');
	await expect(lab.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	await expect(lab.getByRole('tablist', { name: 'Stochastic process selector' })).toHaveCount(0);
	await expect(lab.getByRole('button', { name: 'Step', exact: true })).toHaveCount(0);
	await expect(lab.getByLabel('Reproducibility seed')).toHaveCount(0);
	await expect(lab.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
	await expect(lab.getByRole('button', { name: 'New seed', exact: true })).toBeVisible();

	await lab.getByRole('button', { name: 'Add 999 more particles', exact: true }).click();
	await expect(lab).toHaveAttribute('data-particle-count', '1000');
	await expect(lab.getByLabel('Reproducibility seed')).toHaveValue('indecision-1827');
	await expect(
		lab.getByRole('tablist', { name: 'Stochastic process selector' }).getByRole('tab')
	).toHaveCount(13);

	const dimensions = await stageCanvas(page).evaluate((canvas) => {
		const element = canvas as HTMLCanvasElement;
		return {
			cssWidth: element.clientWidth,
			cssHeight: element.clientHeight,
			pixelWidth: element.width,
			pixelHeight: element.height
		};
	});
	expect(dimensions.pixelWidth).toBeGreaterThanOrEqual(dimensions.cssWidth);
	expect(dimensions.pixelWidth / dimensions.cssWidth).toBeLessThanOrEqual(2.01);
	expect(dimensions.pixelHeight / dimensions.cssHeight).toBeLessThanOrEqual(2.01);

	await expect(lab.getByRole('table').first()).toContainText('Radial MSD, measured');
	await expect(lab.getByRole('img', { name: /Trajectory chart/u })).toBeVisible();
	await expect(lab.getByLabel('Line legend')).toContainText('measured');
});

test('reduced motion starts paused and reset reproduces an exact stepped export', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	expect(
		await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
	).toBe(true);
	await expect(lab).toHaveAttribute('data-frame-state', 'paused');
	await expect(lab.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	const initialTime = await lab.getAttribute('data-simulation-time');
	await page.waitForTimeout(350);
	await expect(lab).toHaveAttribute('data-simulation-time', initialTime ?? '0.000000');

	await lab.getByRole('button', { name: 'Add 999 more particles', exact: true }).click();
	await lab.getByLabel('Reproducibility seed').fill('browser-reset-regression');
	await lab.getByRole('button', { name: 'Apply', exact: true }).click();
	for (let step = 0; step < 4; step += 1) {
		await lab.getByRole('button', { name: 'Step', exact: true }).click();
	}
	await expect(lab).toHaveAttribute('data-step-count', '4');
	const firstRecord = JSON.parse(
		(await exportedBytes(page, lab, 'Experiment JSON')).toString('utf8')
	) as Record<string, unknown>;

	await lab.getByRole('button', { name: 'Reset', exact: true }).click();
	await expect(lab).toHaveAttribute('data-step-count', '0');
	for (let step = 0; step < 4; step += 1) {
		await lab.getByRole('button', { name: 'Step', exact: true }).click();
	}
	const secondRecord = JSON.parse(
		(await exportedBytes(page, lab, 'Experiment JSON')).toString('utf8')
	) as Record<string, unknown>;

	expect(firstRecord).toMatchObject({
		schemaVersion: 1,
		simulationVersion: 1,
		processId: 'free-brownian',
		seed: 'browser-reset-regression',
		particleCount: 1000
	});
	expect(withoutExportTime(secondRecord)).toEqual(withoutExportTime(firstRecord));
});

test('process, diagnostic and stage controls retain scoped keyboard semantics', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	await lab.getByRole('button', { name: 'Add 999 more particles', exact: true }).click();

	const processList = lab.getByRole('tablist', { name: 'Stochastic process selector' });
	const free = processList.getByRole('tab', { name: /Free Brownian diffusion/u });
	const drift = processList.getByRole('tab', { name: /Drift–diffusion/u });
	const walk = processList.getByRole('tab', { name: /Discrete random walk/u });
	await expect(free).toHaveAttribute('aria-selected', 'true');
	await free.focus();
	await free.press('ArrowRight');
	await expect(drift).toBeFocused();
	await expect(drift).toHaveAttribute('aria-selected', 'true');
	await expect(lab.locator('#brownian-process-panel')).toHaveAttribute(
		'aria-labelledby',
		'brownian-process-tab-drift-diffusion'
	);
	await drift.press('Home');
	await expect(walk).toBeFocused();
	await expect(walk).toHaveAttribute('aria-selected', 'true');
	await free.click();

	const diagnostics = lab.getByRole('tablist', { name: 'Statistical diagnostic' });
	const trajectory = diagnostics.getByRole('tab', { name: 'Trajectory', exact: true });
	const distribution = diagnostics.getByRole('tab', { name: 'Distribution', exact: true });
	const msd = diagnostics.getByRole('tab', { name: 'Mean-square displacement', exact: true });
	await trajectory.focus();
	await trajectory.press('ArrowRight');
	await expect(distribution).toBeFocused();
	await expect(distribution).toHaveAttribute('aria-selected', 'true');
	await distribution.press('End');
	await expect(msd).toBeFocused();
	await expect(msd).toHaveAttribute('aria-selected', 'true');
	await msd.press('Home');
	await expect(trajectory).toBeFocused();

	await lab.getByText('Advanced controls', { exact: true }).click();
	const cameraX = lab.getByLabel('Camera centre x');
	await expect(cameraX).toHaveValue('0');
	const canvas = stageCanvas(page);
	await canvas.focus();
	await canvas.press('ArrowRight');
	await expect.poll(async () => Number(await cameraX.inputValue())).toBeGreaterThan(0);
	await canvas.press('0');
	await expect(cameraX).toHaveValue('0');
	await expect(canvas).toBeFocused();
	const focus = await canvas.evaluate((element) => {
		const style = getComputedStyle(element);
		return { outline: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
	});
	expect(focus.outline).not.toBe('none');
	expect(focus.width).toBeGreaterThanOrEqual(2);
});

test('a copied versioned URL restores state and PNG, CSV and JSON exports carry metadata', async ({
	page
}) => {
	await installClipboardCapture(page);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	let lab = await waitForLaboratory(page);
	await lab.getByRole('button', { name: 'Add 999 more particles', exact: true }).click();

	await lab
		.getByRole('tablist', { name: 'Stochastic process selector' })
		.getByRole('tab', { name: /Drift–diffusion/u })
		.click();
	await setNumericControlValue(lab.getByLabel('Horizontal drift'), 1.24);
	await setNumericControlValue(lab.getByLabel('Vertical drift'), -0.5);
	await setNumericControlValue(lab.getByLabel('Particles'), 37);
	await lab.getByLabel('Reproducibility seed').fill('url-round-trip');
	await lab.getByRole('button', { name: 'Apply', exact: true }).click();
	await lab
		.getByRole('tablist', { name: 'Statistical diagnostic' })
		.getByRole('tab', { name: 'Mean-square displacement', exact: true })
		.click();
	await lab.getByRole('button', { name: 'Copy experiment URL', exact: true }).click();
	await expect.poll(() => copiedText(page)).toContain('bm_v=2');
	const sharedUrl = new URL(await copiedText(page));
	expect(sharedUrl.pathname).toBe(articlePath);
	expect(sharedUrl.searchParams.get('bm_mode')).toBe('drift-diffusion');
	expect(sharedUrl.searchParams.get('bm_seed')).toBe('url-round-trip');
	expect(sharedUrl.searchParams.get('bm_n')).toBe('37');
	expect(sharedUrl.searchParams.get('bm_diag')).toBe('msd');
	expect(sharedUrl.searchParams.get('bm_p_driftX')).toBe('1.24');

	await page.goto(sharedUrl.toString(), { waitUntil: 'domcontentloaded' });
	lab = await waitForLaboratory(page);
	await expect(lab).toHaveAttribute('data-process', 'drift-diffusion');
	await expect(lab).toHaveAttribute('data-particle-count', '37');
	await expect(lab.getByLabel('Reproducibility seed')).toHaveValue('url-round-trip');
	await expect(lab.getByLabel('Horizontal drift')).toHaveValue('1.24');
	await expect(
		lab
			.getByRole('tablist', { name: 'Statistical diagnostic' })
			.getByRole('tab', { name: 'Mean-square displacement', exact: true })
	).toHaveAttribute('aria-selected', 'true');

	for (let step = 0; step < 4; step += 1) {
		await lab.getByRole('button', { name: 'Step', exact: true }).click();
	}
	const png = await exportedBytes(page, lab, 'PNG stage');
	expect([...png.subarray(0, 8)]).toEqual(pngSignature);
	expect(png.byteLength).toBeGreaterThan(2_000);

	const trajectoryCsv = (await exportedBytes(page, lab, 'Trajectory CSV')).toString('utf8');
	expect(trajectoryCsv).toContain('# simulation_version=1');
	expect(trajectoryCsv).toContain('# process_id=drift-diffusion');
	expect(trajectoryCsv).toContain('# seed=url-round-trip');
	expect(trajectoryCsv).toContain('run_id,particle_id,time,x,y,unwrapped_x,unwrapped_y');

	const metricsCsv = (await exportedBytes(page, lab, 'Metrics CSV')).toString('utf8');
	expect(metricsCsv).toContain('# process_id=drift-diffusion');
	expect(metricsCsv).toContain('# seed=url-round-trip');
	expect(metricsCsv).toContain(
		'time,measured_msd,theoretical_msd,measured_survival,theoretical_survival'
	);

	const json = JSON.parse(
		(await exportedBytes(page, lab, 'Experiment JSON')).toString('utf8')
	) as Record<string, unknown>;
	expect(json).toMatchObject({
		schemaVersion: 1,
		simulationVersion: 1,
		processId: 'drift-diffusion',
		seed: 'url-round-trip',
		particleCount: 37
	});
});

test('desktop, touch-mobile and no-script layouts remain bounded with usable targets', async ({
	page,
	browser,
	baseURL
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const desktopLab = await waitForLaboratory(page);
	const desktopGeometry = await desktopLab.evaluate((element) => {
		const stage = element.querySelector<HTMLElement>('[data-testid="brownian-stage"]');
		return {
			documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			labOverflow: element.scrollWidth - element.clientWidth,
			labWidth: element.getBoundingClientRect().width,
			stageWidth: stage?.getBoundingClientRect().width ?? 0
		};
	});
	expect(desktopGeometry.documentOverflow).toBeLessThanOrEqual(1);
	expect(desktopGeometry.labOverflow).toBeLessThanOrEqual(1);
	expect(desktopGeometry.labWidth).toBeLessThanOrEqual(1440);
	expect(desktopGeometry.stageWidth).toBeGreaterThan(600);

	const mobileContext = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 3,
		hasTouch: true,
		isMobile: true,
		reducedMotion: 'reduce'
	});
	const mobilePage = await mobileContext.newPage();
	const mobileDiagnostics = collectUnexpectedRuntimeDiagnostics(mobilePage);
	try {
		await mobilePage.goto(articlePath, { waitUntil: 'domcontentloaded' });
		const mobileLab = await waitForLaboratory(mobilePage);
		const geometry = await mobileLab.evaluate((element) => {
			const visible = (candidate: HTMLElement) => {
				const bounds = candidate.getBoundingClientRect();
				return bounds.width > 0 && bounds.height > 0;
			};
			const interactive = [
				...element.querySelectorAll<HTMLElement>(
					"button, summary, select, input:not([type='checkbox'])"
				)
			].filter(visible);
			const checkboxTargets = [
				...element.querySelectorAll<HTMLElement>("label:has(input[type='checkbox'])")
			].filter(visible);
			const targets = [...interactive, ...checkboxTargets].map((candidate) => {
				const bounds = candidate.getBoundingClientRect();
				return {
					name:
						candidate.getAttribute('aria-label') ??
						candidate.textContent?.trim().replace(/\s+/gu, ' ').slice(0, 80) ??
						candidate.tagName.toLowerCase(),
					width: bounds.width,
					height: bounds.height
				};
			});
			const primary = [
				...element.querySelectorAll<HTMLElement>(
					'.primary-controls button, [role="tab"], .controls summary, .export-menu > summary'
				)
			]
				.filter(visible)
				.map((candidate) => {
					const bounds = candidate.getBoundingClientRect();
					return {
						name: candidate.textContent?.trim().replace(/\s+/gu, ' ').slice(0, 80) ?? '',
						width: bounds.width,
						height: bounds.height
					};
				});
			const stage = element.querySelector<HTMLElement>('[data-testid="brownian-stage"]');
			return {
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth,
				labOverflow: element.scrollWidth - element.clientWidth,
				labWidth: element.getBoundingClientRect().width,
				stageWidth: stage?.getBoundingClientRect().width ?? 0,
				undersizedTargets: targets.filter((target) => target.width < 23.5 || target.height < 23.5),
				undersizedPrimaryTargets: primary.filter(
					(target) => target.width < 43.5 || target.height < 43.5
				)
			};
		});
		expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
		expect(geometry.labOverflow).toBeLessThanOrEqual(1);
		expect(geometry.labWidth).toBeLessThanOrEqual(390);
		expect(geometry.stageWidth).toBeGreaterThanOrEqual(geometry.labWidth - 20);
		expect(geometry.undersizedTargets).toEqual([]);
		expect(geometry.undersizedPrimaryTargets).toEqual([]);
		const mobileCanvas = stageCanvas(mobilePage);
		const dpr = await mobileCanvas.evaluate((canvas) => {
			const element = canvas as HTMLCanvasElement;
			return {
				x: element.width / element.clientWidth,
				y: element.height / element.clientHeight
			};
		});
		expect(dpr.x).toBeLessThanOrEqual(2.01);
		expect(dpr.y).toBeLessThanOrEqual(2.01);
		expect(mobileDiagnostics).toEqual([]);
	} finally {
		await mobileContext.close();
	}

	const noScriptContext = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	const noScriptPage = await noScriptContext.newPage();
	try {
		await noScriptPage.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(noScriptPage.getByRole('heading', { level: 1, name: articleTitle })).toBeVisible();
		const staticLab = laboratory(noScriptPage);
		await expect(staticLab).toHaveAttribute('data-hydrated', 'false');
		await expect(staticLab.locator('.stage-poster')).toBeVisible();
		await expect(staticLab.locator('.noscript-note')).toContainText('requires JavaScript');
		await expect(
			noScriptPage.getByRole('heading', { name: 'One particle tells a terrible story' })
		).toBeVisible();
		const overflow = await noScriptPage.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);
	} finally {
		await noScriptContext.close();
	}
});

test('hidden and offscreen laboratories stop advancing without injecting elapsed wall time', async ({
	page
}) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	await expect(lab).toHaveAttribute('data-frame-state', 'running');
	const startingTime = Number(await lab.getAttribute('data-simulation-time'));
	await expect
		.poll(async () => Number(await lab.getAttribute('data-simulation-time')))
		.toBeGreaterThan(startingTime + 0.05);

	await page.evaluate(() => {
		Object.defineProperty(window, '__brownianDocumentHidden', {
			configurable: true,
			writable: true,
			value: true
		});
		Object.defineProperty(document, 'hidden', {
			configurable: true,
			get: () => Boolean(Reflect.get(window, '__brownianDocumentHidden'))
		});
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => (Reflect.get(window, '__brownianDocumentHidden') ? 'hidden' : 'visible')
		});
		document.dispatchEvent(new Event('visibilitychange'));
	});
	const hiddenAt = await lab.getAttribute('data-simulation-time');
	await page.waitForTimeout(700);
	await expect(lab).toHaveAttribute('data-simulation-time', hiddenAt ?? '0.000000');

	await page.evaluate(() => {
		Reflect.set(window, '__brownianDocumentHidden', false);
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect
		.poll(async () => Number(await lab.getAttribute('data-simulation-time')))
		.toBeGreaterThan(Number(hiddenAt) + 0.05);
	await page.waitForTimeout(180);
	const shortlyAfterResume = Number(await lab.getAttribute('data-simulation-time'));
	expect(shortlyAfterResume - Number(hiddenAt)).toBeLessThan(0.75);

	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	await expect
		.poll(() =>
			lab.evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				return bounds.bottom < -160 || bounds.top > window.innerHeight + 160;
			})
		)
		.toBe(true);
	await expect(lab).toHaveAttribute('data-frame-state', 'offscreen');
	const offscreenAt = await lab.getAttribute('data-simulation-time');
	await page.waitForTimeout(650);
	await expect(lab).toHaveAttribute('data-simulation-time', offscreenAt ?? '0.000000');
	await lab.scrollIntoViewIfNeeded();
	await expect(lab).toHaveAttribute('data-frame-state', 'running');
	await expect
		.poll(async () => Number(await lab.getAttribute('data-simulation-time')))
		.toBeGreaterThan(Number(offscreenAt) + 0.05);
});

test('fractional machinery is lazy and its Worker is disposed by client navigation', async ({
	page
}) => {
	await installWorkerRecorder(page);
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	let lab = await waitForLaboratory(page);
	expect(await workerCounts(page)).toMatchObject({ created: 0, active: 0, terminated: 0 });
	await lab.getByRole('button', { name: 'Add 999 more particles', exact: true }).click();

	await lab
		.getByRole('tablist', { name: 'Stochastic process selector' })
		.getByRole('tab', { name: /Fractional Brownian motion/u })
		.click();
	await expect(lab).toHaveAttribute('data-worker-kind', 'fractional');
	await expect.poll(async () => (await workerCounts(page)).created).toBe(1);
	await expect.poll(async () => (await workerCounts(page)).active).toBe(1);
	await expect(lab).toHaveAttribute('data-worker-state', 'complete', { timeout: 60_000 });
	await expect(lab.locator('.status-line')).toContainText(/Davies–Harte path ready.+Worker/iu);

	await page.evaluate((path) => {
		Object.defineProperty(window, '__brownianNavigationMarker', {
			configurable: true,
			value: true
		});
		const link = document.createElement('a');
		link.id = 'brownian-away-link';
		link.href = path;
		link.textContent = 'Open a static article';
		document.body.append(link);
	}, staticArticlePath);
	await page.locator('#brownian-away-link').click();
	await expect(page).toHaveURL(staticArticlePath);
	expect(await page.evaluate(() => Reflect.has(window, '__brownianNavigationMarker'))).toBe(true);
	await expect.poll(async () => (await workerCounts(page)).active).toBe(0);
	const disposed = await workerCounts(page);
	expect(disposed.terminated).toBe(disposed.created);
	expect(disposed.errors).toBe(0);
	expect(disposed.urls.some((url) => /fractional/iu.test(url))).toBe(true);
	lab = laboratory(page);
	await expect(lab).toHaveCount(0);
});
