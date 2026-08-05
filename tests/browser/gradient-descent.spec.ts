import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/gradient-descent-landscapes';
const articleTitle = 'The Landscape of Error: An Interactive Atlas of Gradient Descent';
const visibleTitle = 'The Landscape of Error';
const visibleSubtitle =
	'An interactive atlas of gradient descent, learning rates, curvature, momentum, noise, saddles, and the peculiar geography of machine learning.';
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const runtimeDiagnostics = new WeakMap<Page, string[]>();

type DownloadedArtifact = {
	bytes: Buffer;
	filename: string;
};

type WorkerTally = {
	created: number;
	active: number;
	terminated: number;
};

function laboratory(page: Page): Locator {
	return page.locator('[data-gradient-descent-lab]');
}

function landscapeControl(lab: Locator): Locator {
	return lab.getByRole('combobox', { name: 'Landscape', exact: true });
}

function optimizerControl(lab: Locator): Locator {
	return lab.getByRole('combobox', { name: 'Optimizer', exact: true });
}

function collectUnexpectedRuntimeDiagnostics(page: Page): string[] {
	const diagnostics: string[] = [];
	page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() !== 'error' && message.type() !== 'warning') return;
		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/') || /favicon/iu.test(source)) return;
		diagnostics.push(`console ${message.type()}: ${message.text()}`);
	});
	return diagnostics;
}

async function waitForLaboratory(page: Page): Promise<Locator> {
	const lab = laboratory(page);
	await expect(lab).toHaveCount(1);
	await expect(lab).toBeVisible();
	await lab.scrollIntoViewIfNeeded();

	const landscape = landscapeControl(lab);
	const loadButton = lab.getByRole('button', { name: /Load (the )?interactive laboratory/iu });
	try {
		await expect(landscape).toBeVisible({ timeout: 2_500 });
	} catch {
		// Scrolling can auto-load the lab and detach this fallback button. Dispatching is
		// intentionally non-blocking so Playwright does not retry a now-obsolete element.
		if ((await loadButton.count()) > 0)
			await loadButton.dispatchEvent('click').catch(() => undefined);
	}

	await expect(landscape).toBeVisible({ timeout: 45_000 });
	await expect(optimizerControl(lab)).toBeVisible();
	await expect(lab.getByRole('button', { name: /^(Play|Pause)$/u }).first()).toBeVisible();
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

async function revealButton(button: Locator): Promise<void> {
	await expect(button).toHaveCount(1);
	if (await button.isVisible()) return;

	const disclosure = button.locator('xpath=ancestor::details[1]');
	if ((await disclosure.count()) > 0) {
		await disclosure.evaluate((element) => {
			(element as HTMLDetailsElement).open = true;
		});
	}
	await expect(button).toBeVisible();
}

async function downloadArtifact(
	page: Page,
	lab: Locator,
	buttonName: string
): Promise<DownloadedArtifact> {
	const button = lab.getByRole('button', { name: buttonName, exact: true });
	await revealButton(button);
	const downloadPromise = page.waitForEvent('download');
	await button.click();
	const download = await downloadPromise;
	return {
		bytes: await downloadBytes(download),
		filename: download.suggestedFilename()
	};
}

function numericCsvRows(csv: string): string[] {
	return csv
		.split(/\r?\n/gu)
		.map((line) => line.trim())
		.filter((line) => /^\d+,/u.test(line));
}

async function step(lab: Locator, count: number): Promise<void> {
	const button = lab.getByRole('button', { name: 'Single step', exact: true });
	for (let index = 0; index < count; index += 1) {
		await button.click();
	}
}

async function installClipboardCapture(page: Page): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (value: string) => {
					Object.defineProperty(window, '__gradientDescentCopiedText', {
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
	return page.evaluate(() => String(Reflect.get(window, '__gradientDescentCopiedText') ?? ''));
}

async function installWorkerRecorder(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const storageKey = '__gradientDescentWorkerTally';
		const read = (): WorkerTally => {
			try {
				return JSON.parse(
					sessionStorage.getItem(storageKey) ?? '{"created":0,"active":0,"terminated":0}'
				) as WorkerTally;
			} catch {
				return { created: 0, active: 0, terminated: 0 };
			}
		};
		const write = (tally: WorkerTally) => sessionStorage.setItem(storageKey, JSON.stringify(tally));
		const NativeWorker = window.Worker;
		const TrackingWorker = function (
			this: Worker,
			scriptURL: string | URL,
			options?: WorkerOptions
		): Worker {
			const worker = options ? new NativeWorker(scriptURL, options) : new NativeWorker(scriptURL);
			const created = read();
			created.created += 1;
			created.active += 1;
			write(created);
			let terminated = false;
			const terminate = worker.terminate.bind(worker);
			worker.terminate = () => {
				if (!terminated) {
					terminated = true;
					const current = read();
					current.terminated += 1;
					current.active = Math.max(0, current.active - 1);
					write(current);
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
	});
}

async function workerTally(page: Page): Promise<WorkerTally> {
	return page.evaluate(() => {
		try {
			return JSON.parse(
				sessionStorage.getItem('__gradientDescentWorkerTally') ??
					'{"created":0,"active":0,"terminated":0}'
			) as WorkerTally;
		} catch {
			return { created: 0, active: 0, terminated: 0 };
		}
	});
}

test.beforeEach(async ({ page }) => {
	await page.route('https://va.vercel-scripts.com/**', (route) =>
		route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
	);
	runtimeDiagnostics.set(page, collectUnexpectedRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(runtimeDiagnostics.get(page) ?? []).toEqual([]);
});

test('the canonical SSR article exposes the hero and one semantic laboratory', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain(articleTitle);
	expect(html).toContain('/images/gradient-descent-landscapes.png');
	expect(html).toContain('data-gradient-descent-lab');
	expect(html).toContain('Gradient descent has no map of the landscape');
	expect(html).toContain('Display height: log-compressed; calculations use raw loss.');

	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(
		page.getByRole('heading', { level: 1, name: articleTitle, exact: true })
	).toHaveCount(1);
	await expect(
		page.getByRole('heading', { level: 2, name: visibleTitle, exact: true }).first()
	).toBeVisible();
	await expect(page.getByText(visibleSubtitle, { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Begin the descent', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Open the laboratory', exact: true })).toBeVisible();

	await page.getByRole('link', { name: 'Open the laboratory', exact: true }).click();
	const lab = await waitForLaboratory(page);
	await expect(landscapeControl(lab)).toHaveValue('rosenbrock');
	await expect(optimizerControl(lab)).toHaveValue('gd');
	await expect(lab.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	await expect(lab.getByRole('button', { name: 'Single step', exact: true })).toBeVisible();
	await expect(lab.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
	await expect(lab.getByRole('button', { name: 'Replay', exact: true })).toBeVisible();
	await expect(lab.getByRole('status').first()).toBeVisible();
	await expect(lab.getByTestId('gradient-terrain-stage')).toHaveCount(1);
	await expect(lab.getByTestId('gradient-topographic-map')).toHaveCount(1);
});

test('a hero Begin command issued before the lazy laboratory mounts starts the descent', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.setViewportSize({ width: 1_280, height: 600 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lazyLab = laboratory(page);
	await expect(landscapeControl(lazyLab)).toHaveCount(0);

	await page.getByRole('link', { name: 'Begin the descent', exact: true }).click();
	const lab = await waitForLaboratory(page);
	await expect(lab.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({
		timeout: 45_000
	});
	await expect
		.poll(async () => {
			const iteration = (await lab.textContent())?.match(/Iteration\s*(\d+)/iu)?.[1];
			return Number(iteration ?? 0);
		})
		.toBeGreaterThan(0);
	await lab.getByRole('button', { name: 'Pause', exact: true }).click();
});

test('hero commands have stable latest-command and terminal reduced-motion semantics', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(
		`${articlePath}?v=1&landscape=quadratic&optimizer=gd&lr=0.08&x=2&y=-1&seed=command-order&speed=12&max=1&tol=0.000001`,
		{ waitUntil: 'domcontentloaded' }
	);
	const lab = await waitForLaboratory(page);
	await step(lab, 1);
	await expect(lab).toContainText(/Iteration\s*1/iu);
	await expect(lab.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();

	await page.evaluate(() => {
		for (const action of ['begin', 'open'] as const) {
			window.dispatchEvent(
				new CustomEvent('gradient-descent-command', { detail: { action, source: 'browser-test' } })
			);
		}
	});
	const advanced = lab
		.locator('summary')
		.filter({ hasText: /^Advanced settings$/u })
		.locator('xpath=..');
	const analysis = lab
		.locator('summary')
		.filter({ hasText: /^Cartography and comparisons$/u })
		.locator('xpath=..');
	await expect(advanced).toHaveAttribute('open', '');
	await expect(analysis).toHaveAttribute('open', '');
	await expect(lab.locator('.live-summary')).toHaveText(
		'Laboratory controls opened from the article introduction.'
	);
	await expect(lab).toContainText(/Iteration\s*1/iu);

	await page.evaluate(() => {
		window.dispatchEvent(
			new CustomEvent('gradient-descent-command', {
				detail: { action: 'begin', source: 'browser-test' }
			})
		);
	});
	await expect(lab).toContainText(/Iteration\s*0/iu);
	await expect(lab.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
	await expect(lab.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
	await expect(lab.locator('.live-summary')).toHaveText(
		'Reduced motion is active. Use Single step to inspect the descent without continuous animation.'
	);
});

test('single-step, reset and replay preserve one deterministic numerical path', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(
		`${articlePath}?v=1&landscape=quadratic&optimizer=gd&lr=0.08&x=2&y=-1&seed=descent-1847&speed=24&max=40&tol=0.000001&noise=0&batch=full`,
		{ waitUntil: 'domcontentloaded' }
	);
	const lab = await waitForLaboratory(page);
	await expect(landscapeControl(lab)).toHaveValue('quadratic');
	await expect(optimizerControl(lab)).toHaveValue('gd');
	await expect(lab.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

	await lab.getByRole('button', { name: 'Reset', exact: true }).click();
	await step(lab, 5);
	await expect(lab).toContainText(/Iteration\s*5/iu);
	const firstCsv = (await downloadArtifact(page, lab, 'Export run as CSV')).bytes.toString('utf8');
	const firstRows = numericCsvRows(firstCsv);
	expect(firstRows.length).toBeGreaterThanOrEqual(5);

	await lab.getByRole('button', { name: 'Reset', exact: true }).click();
	await expect(lab).toContainText(/Iteration\s*0/iu);
	await step(lab, 5);
	const secondCsv = (await downloadArtifact(page, lab, 'Export run as CSV')).bytes.toString('utf8');
	expect(numericCsvRows(secondCsv)).toEqual(firstRows);

	const replay = lab.getByRole('button', { name: 'Replay', exact: true });
	await expect(replay).toBeEnabled();
	await replay.click();
	await page.waitForTimeout(350);
	const replayCsv = (await downloadArtifact(page, lab, 'Export run as CSV')).bytes.toString('utf8');
	expect(numericCsvRows(replayCsv)).toEqual(firstRows);
});

test('URL state, copied summaries and client-side exports recreate a disclosed experiment', async ({
	page
}) => {
	await installClipboardCapture(page);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(
		`${articlePath}?v=1&landscape=quadratic&optimizer=gd&lr=0.04&x=-2&y=1.5&seed=atlas-round-trip&speed=8&max=120&tol=0.00001`,
		{ waitUntil: 'domcontentloaded' }
	);
	let lab = await waitForLaboratory(page);
	await landscapeControl(lab).selectOption('himmelblau');
	await optimizerControl(lab).selectOption('adam');
	await expect.poll(() => new URL(page.url()).searchParams.get('landscape')).toBe('himmelblau');
	await expect.poll(() => new URL(page.url()).searchParams.get('optimizer')).toBe('adam');

	await page.reload({ waitUntil: 'domcontentloaded' });
	lab = await waitForLaboratory(page);
	await expect(landscapeControl(lab)).toHaveValue('himmelblau');
	await expect(optimizerControl(lab)).toHaveValue('adam');
	expect(new URL(page.url()).searchParams.get('seed')).toBe('atlas-round-trip');

	await step(lab, 3);
	const summaryButton = lab.getByRole('button', { name: 'Copy run summary', exact: true });
	await revealButton(summaryButton);
	await summaryButton.click();
	await expect.poll(() => copiedText(page)).toMatch(/Himmelblau/iu);
	const summary = await copiedText(page);
	expect(summary).toMatch(/Adam/iu);
	expect(summary).toMatch(/atlas-round-trip/iu);
	expect(summary).toMatch(/learning rate/iu);

	const copyButton = lab.getByRole('button', { name: 'Copy this experiment', exact: true });
	await copyButton.click();
	await expect.poll(() => copiedText(page)).toContain('landscape=himmelblau');
	expect(await copiedText(page)).toContain('optimizer=adam');

	const csv = await downloadArtifact(page, lab, 'Export run as CSV');
	expect(csv.filename).toMatch(/\.csv$/iu);
	const csvText = csv.bytes.toString('utf8');
	expect(csvText).toMatch(/iteration/iu);
	expect(csvText).toMatch(/himmelblau/iu);
	expect(csvText).toMatch(/adam/iu);
	expect(numericCsvRows(csvText).length).toBeGreaterThanOrEqual(3);

	const png = await downloadArtifact(page, lab, 'Export current terrain or map view as PNG');
	expect(png.filename).toMatch(/\.png$/iu);
	expect([...png.bytes.subarray(0, pngSignature.length)]).toEqual([...pngSignature]);
	expect(png.bytes.length).toBeGreaterThan(10_000);
	expect(png.bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(600);
	expect(png.bytes.readUInt32BE(20)).toBeGreaterThanOrEqual(300);
});

test('touch-mobile tabs remain usable without horizontal page or laboratory overflow', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 3,
		hasTouch: true,
		isMobile: true,
		reducedMotion: 'reduce'
	});
	const page = await context.newPage();
	const diagnostics = collectUnexpectedRuntimeDiagnostics(page);
	try {
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(
			page.getByRole('heading', { level: 2, name: visibleTitle, exact: true }).first()
		).toBeVisible();
		const lab = await waitForLaboratory(page);
		const tabs = lab.getByRole('tab');
		await expect(tabs).toHaveCount(4);
		for (const name of ['Terrain', 'Map', 'Microscope', 'Metrics']) {
			await expect(lab.getByRole('tab', { name, exact: true })).toBeVisible();
		}
		await lab.getByRole('tab', { name: 'Map', exact: true }).click();
		await expect(
			lab.getByTestId('gradient-topographic-map').locator('canvas.overlay-canvas')
		).toBeVisible();

		const geometry = await lab.evaluate((element) => {
			const names = ['Play', 'Single step', 'Reset', 'Replay'];
			const essential = [...element.querySelectorAll<HTMLElement>('button, [role="tab"]')].filter(
				(candidate) => {
					const label = candidate.getAttribute('aria-label') ?? candidate.textContent?.trim() ?? '';
					return candidate.getAttribute('role') === 'tab' || names.includes(label);
				}
			);
			return {
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth,
				labOverflow: element.scrollWidth - element.clientWidth,
				labWidth: element.getBoundingClientRect().width,
				undersized: essential
					.map((candidate) => {
						const bounds = candidate.getBoundingClientRect();
						return {
							name: candidate.getAttribute('aria-label') ?? candidate.textContent?.trim() ?? '',
							width: bounds.width,
							height: bounds.height
						};
					})
					.filter((target) => target.width < 43.5 || target.height < 43.5)
			};
		});
		expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
		expect(geometry.labOverflow).toBeLessThanOrEqual(1);
		expect(geometry.labWidth).toBeLessThanOrEqual(390);
		expect(geometry.undersized).toEqual([]);
		expect(diagnostics).toEqual([]);
	} finally {
		await context.close();
	}
});

test('the laboratory remains legible across the required viewport and zoom-proxy matrix', async ({
	browser,
	baseURL,
	page
}) => {
	const requiredViewports = [
		{ width: 360, height: 800 },
		{ width: 768, height: 1_024 },
		{ width: 1_024, height: 768 },
		{ width: 1_440, height: 900 },
		{ width: 1_920, height: 1_080 }
	] as const;

	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize(requiredViewports[0]);
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);

	for (const viewport of requiredViewports) {
		await page.setViewportSize(viewport);
		await page.waitForTimeout(80);
		await lab.scrollIntoViewIfNeeded();
		const geometry = await lab.evaluate((element) => {
			const primaryNames = ['Play', 'Pause', 'Single step', 'Reset', 'Replay'];
			const primaryControls = [...element.querySelectorAll<HTMLElement>('button')].filter(
				(control) =>
					primaryNames.includes(control.textContent?.trim() ?? '') && control.offsetParent
			);
			return {
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth,
				labRight: element.getBoundingClientRect().right,
				labLeft: element.getBoundingClientRect().left,
				viewportWidth: document.documentElement.clientWidth,
				undersizedPrimaryControls: primaryControls.filter((control) => {
					const bounds = control.getBoundingClientRect();
					return bounds.width < 43.5 || bounds.height < 43.5;
				}).length
			};
		});
		expect(geometry.documentOverflow, `${viewport.width}px document overflow`).toBeLessThanOrEqual(
			1
		);
		expect(geometry.labLeft, `${viewport.width}px laboratory left edge`).toBeGreaterThanOrEqual(-1);
		expect(geometry.labRight, `${viewport.width}px laboratory right edge`).toBeLessThanOrEqual(
			geometry.viewportWidth + 1
		);
		if (viewport.width <= 768) {
			await expect(lab.getByRole('tab', { name: 'Terrain', exact: true })).toBeVisible();
			expect(geometry.undersizedPrimaryControls, `${viewport.width}px primary touch targets`).toBe(
				0
			);
		}
	}

	const zoomContext = await browser.newContext({
		baseURL,
		viewport: { width: 720, height: 450 },
		deviceScaleFactor: 2,
		reducedMotion: 'reduce'
	});
	const zoomPage = await zoomContext.newPage();
	const zoomDiagnostics = collectUnexpectedRuntimeDiagnostics(zoomPage);
	try {
		await zoomPage.goto(articlePath, { waitUntil: 'domcontentloaded' });
		const zoomLab = await waitForLaboratory(zoomPage);
		await expect(zoomLab.getByRole('tab', { name: 'Metrics', exact: true })).toBeVisible();
		const proxy = await zoomPage.evaluate(() => ({
			dpr: window.devicePixelRatio,
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			width: document.documentElement.clientWidth
		}));
		expect(proxy).toEqual({ dpr: 2, overflow: expect.any(Number), width: 720 });
		expect(proxy.overflow).toBeLessThanOrEqual(1);
		expect(zoomDiagnostics).toEqual([]);
	} finally {
		await zoomContext.close();
	}
});

test('touch gestures scroll the page until explicit map editing is enabled, then commit on release', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 3,
		hasTouch: true,
		isMobile: true,
		reducedMotion: 'reduce'
	});
	const page = await context.newPage();
	const diagnostics = collectUnexpectedRuntimeDiagnostics(page);
	const cdp = await context.newCDPSession(page);
	try {
		await page.goto(
			`${articlePath}?v=1&landscape=quadratic&optimizer=gd&lr=0.08&x=-1.5&y=1&seed=touch-commit&speed=12&max=100&tol=0.000001`,
			{ waitUntil: 'domcontentloaded' }
		);
		const lab = await waitForLaboratory(page);
		await lab.getByRole('tab', { name: 'Map', exact: true }).click();
		const mapStage = lab.getByTestId('gradient-topographic-map');
		const map = mapStage.locator('canvas.overlay-canvas');
		await expect(map).toBeVisible();
		await map.scrollIntoViewIfNeeded();
		await expect(mapStage.getByRole('button', { name: 'Enable touch editing' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		expect(await map.evaluate((element) => getComputedStyle(element).touchAction)).toContain(
			'pan-y'
		);

		const scrollBox = await map.boundingBox();
		expect(scrollBox).not.toBeNull();
		const initialX = new URL(page.url()).searchParams.get('x');
		const initialScroll = await page.evaluate(() => ({
			y: window.scrollY,
			maximum: document.documentElement.scrollHeight - window.innerHeight
		}));
		expect(initialScroll.maximum - initialScroll.y).toBeGreaterThan(200);
		const scrollPoint = {
			x: Math.round(scrollBox!.x + scrollBox!.width * 0.72),
			y: Math.round(scrollBox!.y + scrollBox!.height * 0.72)
		};
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [scrollPoint]
		});
		await page.waitForTimeout(50);
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [{ x: scrollPoint.x, y: scrollPoint.y - 120 }]
		});
		await page.waitForTimeout(80);
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect
			.poll(() => page.evaluate(() => window.scrollY))
			.toBeGreaterThan(initialScroll.y + 5);
		expect(new URL(page.url()).searchParams.get('x')).toBe(initialX);

		await map.scrollIntoViewIfNeeded();
		const editToggle = mapStage.getByRole('button', { name: 'Enable touch editing' });
		await editToggle.click();
		await expect(mapStage.getByRole('button', { name: 'Finish touch editing' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(await map.evaluate((element) => getComputedStyle(element).touchAction)).toBe('none');

		const editBox = await map.boundingBox();
		expect(editBox).not.toBeNull();
		const beforeCommitX = new URL(page.url()).searchParams.get('x');
		const beforeCommitY = new URL(page.url()).searchParams.get('y');
		const beforeEditScroll = await page.evaluate(() => window.scrollY);
		const start = {
			x: Math.round(editBox!.x + editBox!.width * 0.76),
			y: Math.round(editBox!.y + editBox!.height * 0.76)
		};
		const finish = { x: start.x - 68, y: start.y - 42 };
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [start]
		});
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [finish]
		});
		await page.waitForTimeout(80);
		expect(new URL(page.url()).searchParams.get('x')).toBe(beforeCommitX);
		expect(new URL(page.url()).searchParams.get('y')).toBe(beforeCommitY);
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect.poll(() => new URL(page.url()).searchParams.get('x')).not.toBe(beforeCommitX);
		await expect.poll(() => new URL(page.url()).searchParams.get('y')).not.toBe(beforeCommitY);
		expect(
			Math.abs((await page.evaluate(() => window.scrollY)) - beforeEditScroll)
		).toBeLessThanOrEqual(2);
		expect(diagnostics).toEqual([]);
	} finally {
		await context.close();
	}
});

test('invalid scientific controls preserve the last valid run and recover after correction', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(
		`${articlePath}?v=1&landscape=quadratic&optimizer=gd&lr=0.08&x=2&y=-1&seed=invalid-recovery&speed=12&max=80&tol=0.000001&l1=1&l2=8&angle=0`,
		{ waitUntil: 'domcontentloaded' }
	);
	const lab = await waitForLaboratory(page);
	await lab.locator('summary').filter({ hasText: 'Advanced settings' }).click();
	const lambdaOne = lab.getByLabel('λ₁', { exact: true });
	await lambdaOne.fill('0');
	await lambdaOne.press('Tab');

	const error = lab.getByRole('alert');
	await expect(error).toContainText('Invalid parameter configuration.');
	await expect(error).toContainText(/between 0\.05 and 100/iu);
	await expect(lambdaOne).toHaveAttribute('aria-invalid', 'true');
	await expect(landscapeControl(lab)).toBeDisabled();
	await expect(optimizerControl(lab)).toBeDisabled();
	await expect(lab.getByRole('button', { name: 'Single step', exact: true })).toBeDisabled();
	await expect(lab).toContainText(/Iteration\s*0/iu);

	await lambdaOne.fill('1');
	await lambdaOne.press('Tab');
	await expect(error).toHaveCount(0);
	await expect(lambdaOne).not.toHaveAttribute('aria-invalid', 'true');
	await expect(landscapeControl(lab)).toBeEnabled();
	await expect(lab.getByRole('button', { name: 'Single step', exact: true })).toBeEnabled();
	await step(lab, 1);
	await expect(lab).toContainText(/Iteration\s*1/iu);
});

test('guided expeditions expose race, unsafe quadratic, saddle and regression evidence', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);

	await lab.getByRole('button', { name: /Momentum remembers/iu }).click();
	await expect(landscapeControl(lab)).toHaveValue('quadratic');
	await expect(optimizerControl(lab)).toHaveValue('momentum');
	await expect(lab.getByRole('heading', { name: 'Optimizer race', exact: true })).toBeVisible();
	const raceCards = lab.locator('.race-section article');
	await expect(raceCards).toHaveCount(4);
	for (const optimizer of ['gd', 'momentum', 'rmsprop', 'adam']) {
		await expect(lab.locator(`.race-section article[data-optimizer="${optimizer}"]`)).toContainText(
			'Evaluations / shared cap'
		);
	}

	await lab.getByRole('button', { name: /One step too far/iu }).click();
	const displayedLearningRate = Number(
		(await lab.locator('.learning-rate output').innerText()).match(/[\d.]+/u)?.[0]
	);
	const intervalText = await lab
		.locator('.quadratic-gauge dd')
		.filter({ hasText: /0\s*<\s*η\s*</u })
		.innerText();
	const intervalNumbers = intervalText.match(/\d+(?:\.\d+)?(?:e[+-]?\d+)?/giu) ?? [];
	const stabilityBoundary = Number(intervalNumbers.at(-1));
	expect(displayedLearningRate).toBeGreaterThan(stabilityBoundary);
	await expect(lab.locator('.quadratic-gauge')).toContainText(
		'Exact only for vanilla fixed-step GD'
	);

	await lab.getByRole('button', { name: /saddle that pretends/iu }).click();
	await expect(landscapeControl(lab)).toHaveValue('saddle');
	await expect(
		lab.getByTestId('gradient-step-microscope').locator('.classification')
	).toContainText('Indefinite curvature');

	await lab.getByRole('button', { name: /line learns to fit/iu }).click();
	await expect(landscapeControl(lab)).toHaveValue('regression');
	const regression = lab.locator('.regression-section');
	await expect(
		regression.getByRole('heading', {
			name: 'One line, two parameters, one quadratic loss surface',
			exact: true
		})
	).toBeVisible();
	const outlier = regression.getByLabel('Include the controlled outlier', { exact: true });
	await expect(outlier).not.toBeChecked();
	const mseBefore = await regression.locator('.mse strong').innerText();
	const optimumBefore = await regression.locator('.optimum').getAttribute('transform');
	await outlier.check();
	await expect.poll(() => new URL(page.url()).searchParams.get('outlier')).toBe('1');
	await expect.poll(() => regression.locator('.mse strong').innerText()).not.toBe(mseBefore);
	await expect
		.poll(() => regression.locator('.optimum').getAttribute('transform'))
		.not.toBe(optimumBefore);
});

test('Himmelblau basin cartography and deterministic walkers remain responsive off-thread', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 700, height: 900 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	await landscapeControl(lab).selectOption('himmelblau');
	await lab.getByRole('tab', { name: 'Map', exact: true }).click();

	const basinButton = lab.locator('button').filter({ hasText: /^Map basins of attraction$/u });
	await revealButton(basinButton);
	const analysis = basinButton.locator('xpath=ancestor::details[1]');
	await basinButton.click();
	await step(lab, 1);
	await expect(lab).toContainText(/Iteration\s*1/iu);
	await expect(analysis.locator('.analysis-message')).toContainText(
		/starts classified with a 420-gradient-evaluation cap/iu,
		{ timeout: 90_000 }
	);
	await expect(lab.locator('.basin-key')).toBeVisible();

	const walkers = lab.getByRole('button', { name: 'Release many walkers', exact: true });
	await walkers.click();
	await expect(lab.getByRole('button', { name: 'Replay walkers', exact: true })).toBeEnabled({
		timeout: 45_000
	});
	await expect(lab.getByRole('status').last()).toContainText(
		'Walker final distribution displayed without continuous motion.'
	);
});

test('reduced motion starts still and essential controls work from the keyboard', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(
		`${articlePath}?v=1&landscape=quadratic&optimizer=momentum&lr=0.05&x=2&y=-1&seed=keyboard-1847`,
		{ waitUntil: 'domcontentloaded' }
	);
	const lab = await waitForLaboratory(page);
	const play = lab.getByRole('button', { name: 'Play', exact: true });
	await expect(play).toBeVisible();
	await play.focus();
	await page.keyboard.press('Enter');
	const pause = lab.getByRole('button', { name: 'Pause', exact: true });
	await expect(pause).toBeVisible();
	await pause.focus();
	await page.keyboard.press('Space');
	await expect(play).toBeVisible();

	await lab.getByRole('tab', { name: 'Metrics', exact: true }).click();
	const before = numericCsvRows(
		(await downloadArtifact(page, lab, 'Export run as CSV')).bytes.toString('utf8')
	);
	const singleStep = lab.getByRole('button', { name: 'Single step', exact: true });
	await singleStep.focus();
	await page.keyboard.press('Enter');
	const after = numericCsvRows(
		(await downloadArtifact(page, lab, 'Export run as CSV')).bytes.toString('utf8')
	);
	expect(after.length).toBeGreaterThan(before.length);

	const terrainTab = lab.getByRole('tab', { name: 'Terrain', exact: true });
	await terrainTab.focus();
	await page.keyboard.press('ArrowRight');
	const mapTab = lab.getByRole('tab', { name: 'Map', exact: true });
	await expect(mapTab).toHaveAttribute('aria-selected', 'true');

	const map = lab.getByTestId('gradient-topographic-map').locator('canvas.overlay-canvas');
	await expect(map).toBeVisible();
	await map.focus();
	const beforeX = new URL(page.url()).searchParams.get('x');
	await page.keyboard.press('ArrowRight');
	await expect.poll(() => new URL(page.url()).searchParams.get('x')).not.toBe(beforeX);
});

test('a WebGL failure promotes the keyboard-operable topographic laboratory', async ({ page }) => {
	await page.addInitScript(() => {
		const nativeGetContext = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (
			this: HTMLCanvasElement,
			contextId: string,
			...arguments_: unknown[]
		) {
			if (/^(webgl2?|experimental-webgl)$/iu.test(contextId)) return null;
			return Reflect.apply(nativeGetContext, this, [contextId, ...arguments_]);
		} as typeof HTMLCanvasElement.prototype.getContext;
	});
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	const terrain = lab.getByTestId('gradient-terrain-stage');
	await expect(terrain).toHaveAttribute('data-render-state', 'fallback', { timeout: 45_000 });
	await expect(terrain.locator('xpath=ancestor::section[1]').locator('.panel-status')).toHaveText(
		'3D terrain is unavailable in this browser; the topographic laboratory remains active.'
	);
	await expect(lab.getByRole('tab', { name: 'Map', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(
		lab.getByTestId('gradient-topographic-map').locator('canvas.overlay-canvas')
	).toBeVisible();
	await step(lab, 1);
	await lab.getByRole('tab', { name: 'Metrics', exact: true }).click();
	const rows = numericCsvRows(
		(await downloadArtifact(page, lab, 'Export run as CSV')).bytes.toString('utf8')
	);
	expect(rows.length).toBeGreaterThanOrEqual(1);
});

test('runtime WebGL context loss preserves the synchronized topographic laboratory', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	const terrain = lab.getByTestId('gradient-terrain-stage');
	await expect(terrain).toHaveAttribute('data-render-state', 'ready', { timeout: 45_000 });
	const terrainCanvas = terrain.locator('canvas[role="img"]');
	await expect(terrainCanvas).toBeVisible();
	expect(
		await terrainCanvas.evaluate((element) => getComputedStyle(element).touchAction)
	).toContain('pan-y');

	const cancellation = await terrainCanvas.evaluate((element) => {
		const event = new Event('webglcontextlost', { cancelable: true });
		return {
			dispatched: element.dispatchEvent(event),
			defaultPrevented: event.defaultPrevented
		};
	});
	expect(cancellation).toEqual({ dispatched: false, defaultPrevented: true });
	await expect(terrain).toHaveAttribute('data-render-state', 'fallback');
	await expect(terrain.locator('.terrain-fallback')).toContainText(
		'The WebGL context was lost. Continue with the synchronized topographic map.'
	);
	await expect(terrain.locator('xpath=ancestor::section[1]').locator('.panel-status')).toHaveText(
		'The WebGL context was lost. Continue with the synchronized topographic map.'
	);
	await expect(lab.getByRole('tab', { name: 'Map', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(
		lab.getByTestId('gradient-topographic-map').locator('canvas.overlay-canvas')
	).toBeVisible();
	await step(lab, 1);
	await expect(lab).toContainText(/Iteration\s*1/iu);
});

test('the no-JavaScript article retains its calculated plate, caption and mathematical narrative', async ({
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
		).toBeVisible();
		await expect(
			page.getByRole('heading', { level: 2, name: visibleTitle, exact: true }).first()
		).toBeVisible();
		await expect(page.getByText(/The interactive terrain requires JavaScript/iu)).toBeVisible();
		await expect(
			page.locator('figcaption').filter({ hasText: /calculated static plate preserves/iu })
		).toBeVisible();
		await expect(
			page.getByRole('heading', { name: '2. One step, written carefully', exact: true })
		).toBeVisible();
		const lab = laboratory(page);
		await expect(lab.getByRole('img', { name: /topographic loss landscape/iu })).toBeVisible();
		await expect(
			lab.getByText(/static topographic plate is the no-JavaScript version/iu)
		).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);
	} finally {
		await context.close();
	}
});

test('client navigation tears down the active laboratory and returns without duplicate canvases', async ({
	page
}) => {
	await installWorkerRecorder(page);
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	let lab = await waitForLaboratory(page);
	await lab.getByRole('button', { name: 'Play', exact: true }).click();
	await expect(lab.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

	const categoryLink = page.locator('a[href="/blog/visualizations"]').first();
	await expect(categoryLink).toBeVisible();
	await categoryLink.click();
	await page.waitForURL(/\/blog\/visualizations\/?$/u);
	await expect(laboratory(page)).toHaveCount(0);
	await expect.poll(async () => (await workerTally(page)).active).toBe(0);
	expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');

	await page.goBack({ waitUntil: 'domcontentloaded' });
	lab = await waitForLaboratory(page);
	await expect(laboratory(page)).toHaveCount(1);
	await expect(lab.getByTestId('gradient-terrain-stage')).toHaveCount(1);
	await expect(lab.getByTestId('gradient-terrain-stage').getByRole('img')).toHaveCount(1);
	const secondCategoryLink = page.locator('a[href="/blog/visualizations"]').first();
	await secondCategoryLink.click();
	await page.waitForURL(/\/blog\/visualizations\/?$/u);
	await expect.poll(async () => (await workerTally(page)).active).toBe(0);
	const tally = await workerTally(page);
	expect(tally.terminated).toBe(tally.created);
});
