import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/double-pendulum-chaos';
const articleTitle = 'The Machine That Misplaces Tomorrow: A Double-Pendulum Atlas of Chaos';
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const runtimeDiagnostics = new WeakMap<Page, string[]>();

type CanvasSegment = {
	fromX: number;
	fromY: number;
	toX: number;
	toY: number;
};

type RecordedPointerEvent = {
	type: string;
	target: string;
	pointerType: string;
	x: number;
	y: number;
};

function laboratory(page: Page): Locator {
	return page.locator('section.double-pendulum-lab');
}

function stageCanvas(page: Page): Locator {
	return laboratory(page).locator('.stage-shell canvas');
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
	await expect(lab).toBeVisible();
	await lab.scrollIntoViewIfNeeded();
	await expect(lab.locator('.loading')).toBeHidden();
	await expect(lab.locator('.stage-shell')).toHaveClass(/is-ready/u);
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

async function dispatchTouchDrag(
	page: Page,
	start: { x: number; y: number },
	end: { x: number; y: number }
): Promise<void> {
	const session = await page.context().newCDPSession(page);
	const point = (x: number, y: number) => ({
		x,
		y,
		radiusX: 8,
		radiusY: 8,
		force: 1,
		id: 1
	});
	await session.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [point(start.x, start.y)]
	});
	for (let index = 1; index <= 5; index += 1) {
		const progress = index / 5;
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [
				point(start.x + (end.x - start.x) * progress, start.y + (end.y - start.y) * progress)
			]
		});
		await page.waitForTimeout(30);
	}
	await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await session.detach();
}

async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
	const box = await locator.boundingBox();
	expect(box).not.toBeNull();
	return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function installCanvasPathRecorder(page: Page): Promise<void> {
	await page.addInitScript(() => {
		type InstrumentedCanvas = HTMLCanvasElement & {
			__doublePendulumSegments?: CanvasSegment[];
			__doublePendulumLabels?: string[];
		};
		const currentPoint = new WeakMap<CanvasRenderingContext2D, { x: number; y: number } | null>();
		const prototype = CanvasRenderingContext2D.prototype;
		const beginPath = prototype.beginPath;
		const moveTo = prototype.moveTo;
		const lineTo = prototype.lineTo;
		const fillText = prototype.fillText;

		prototype.beginPath = function (
			...arguments_: Parameters<CanvasRenderingContext2D['beginPath']>
		) {
			currentPoint.set(this, null);
			return beginPath.apply(this, arguments_);
		};
		prototype.moveTo = function (x: number, y: number) {
			currentPoint.set(this, { x, y });
			return moveTo.call(this, x, y);
		};
		prototype.lineTo = function (x: number, y: number) {
			const previous = currentPoint.get(this);
			if (previous && String(this.strokeStyle).toLowerCase() === '#dc7a4f') {
				const canvas = this.canvas as InstrumentedCanvas;
				(canvas.__doublePendulumSegments ??= []).push({
					fromX: previous.x,
					fromY: previous.y,
					toX: x,
					toY: y
				});
			}
			currentPoint.set(this, { x, y });
			return lineTo.call(this, x, y);
		};
		prototype.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
			const canvas = this.canvas as InstrumentedCanvas;
			(canvas.__doublePendulumLabels ??= []).push(text);
			return maxWidth === undefined
				? fillText.call(this, text, x, y)
				: fillText.call(this, text, x, y, maxWidth);
		};
	});
}

async function installWorkerRecorder(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const counts = { created: 0, active: 0, terminated: 0 };
		const NativeWorker = window.Worker;
		const TrackingWorker = function (
			this: Worker,
			scriptURL: string | URL,
			options?: WorkerOptions
		): Worker {
			const worker = options ? new NativeWorker(scriptURL, options) : new NativeWorker(scriptURL);
			counts.created += 1;
			counts.active += 1;
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
		Object.defineProperty(window, 'Worker', {
			configurable: true,
			writable: true,
			value: TrackingWorker
		});
		Object.defineProperty(window, '__doublePendulumWorkerCounts', {
			configurable: true,
			value: counts
		});
	});
}

async function installPointerRecorder(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const events: RecordedPointerEvent[] = [];
		for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
			document.addEventListener(
				type,
				(event) => {
					const pointer = event as PointerEvent;
					const target = pointer.target instanceof HTMLElement ? pointer.target : null;
					events.push({
						type,
						target:
							target?.dataset.dragTarget ?? target?.className?.toString() ?? target?.tagName ?? '',
						pointerType: pointer.pointerType,
						x: pointer.clientX,
						y: pointer.clientY
					});
				},
				true
			);
		}
		Object.defineProperty(window, '__doublePendulumPointerEvents', {
			configurable: true,
			value: events
		});
	});
}

async function workerCounts(
	page: Page
): Promise<{ created: number; active: number; terminated: number }> {
	return page.evaluate(
		() =>
			Reflect.get(window, '__doublePendulumWorkerCounts') as {
				created: number;
				active: number;
				terminated: number;
			}
	);
}

test.beforeEach(({ page }) => {
	runtimeDiagnostics.set(page, collectUnexpectedRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(runtimeDiagnostics.get(page) ?? []).toEqual([]);
});

test('the canonical article hydrates into one live, bounded laboratory', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain(articleTitle);
	expect(html).toContain('/images/double-pendulum-chaos.svg');
	expect(html).toContain('The Pendulum Laboratory');

	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { level: 1, name: articleTitle })).toHaveCount(1);
	await expect(laboratory(page)).toHaveCount(1);
	const lab = await waitForLaboratory(page);
	await expect(lab.getByRole('tab')).toHaveCount(4);
	await expect(stageCanvas(page)).toBeVisible();

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
});

test('the full article and laboratory poster remain usable with JavaScript disabled', async ({
	browser
}) => {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 1280, height: 900 }
	});
	const page = await context.newPage();
	try {
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { level: 1, name: articleTitle })).toBeVisible();
		const lab = laboratory(page);
		await expect(lab).toBeVisible();
		const poster = lab.locator('.stage-poster');
		const explanation = lab.locator('.noscript-note');
		await expect(poster).toBeVisible();
		await expect(explanation).toBeVisible();
		await expect(explanation).toContainText('requires JavaScript');
		const homeLink = page
			.getByRole('navigation', { name: 'Breadcrumb' })
			.getByRole('link', { name: 'Home', exact: true });
		await expect(homeLink).toBeAttached();
		expect(
			await homeLink.evaluate((link) => new URL((link as HTMLAnchorElement).href).pathname)
		).toBe('/');

		const fallbackIsUncovered = await lab.evaluate((element) => {
			const loading = element.querySelector<HTMLElement>('.loading');
			const poster = element.querySelector<HTMLElement>('.stage-poster');
			if (!loading || !poster) return false;
			const loadingBox = loading.getBoundingClientRect();
			const posterBox = poster.getBoundingClientRect();
			const overlapWidth = Math.max(
				0,
				Math.min(loadingBox.right, posterBox.right) - Math.max(loadingBox.left, posterBox.left)
			);
			const overlapHeight = Math.max(
				0,
				Math.min(loadingBox.bottom, posterBox.bottom) - Math.max(loadingBox.top, posterBox.top)
			);
			return overlapWidth * overlapHeight === 0;
		});
		expect(fallbackIsUncovered).toBe(true);
	} finally {
		await context.close();
	}
});

test('a 390 × 844 touch viewport preserves scrolling while both vertical and diagonal mass drags work', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await installPointerRecorder(page);
	await page.goto(`${articlePath}?v=1&mode=lab&preset=custom&th1=0&om1=0&th2=0&om2=0`, {
		waitUntil: 'domcontentloaded'
	});
	const lab = await waitForLaboratory(page);
	const lowerHandle = lab.locator('[data-drag-target="lower"]');
	await expect(lowerHandle).toBeVisible();
	await expect(lowerHandle).toHaveCSS('touch-action', 'none');
	await expect(lab.locator('.stage-shell')).toHaveCSS('touch-action', /pan-y/u);

	const overflows = await page.evaluate(() => ({
		document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		body: document.body.scrollWidth - document.body.clientWidth
	}));
	expect(overflows.document).toBeLessThanOrEqual(1);
	expect(overflows.body).toBeLessThanOrEqual(1);

	const lowerAngle = lab.getByLabel('Lower angle in degrees');
	await lowerHandle.scrollIntoViewIfNeeded();
	const initialScroll = await page.evaluate(() => window.scrollY);
	const verticalStart = await centreOf(lowerHandle);
	await dispatchTouchDrag(page, verticalStart, {
		x: verticalStart.x,
		y: verticalStart.y - 145
	});
	const firstGestureEvents = await page.evaluate(
		() => Reflect.get(window, '__doublePendulumPointerEvents') as RecordedPointerEvent[]
	);
	expect(
		firstGestureEvents.map(({ type, target, pointerType }) => ({ type, target, pointerType }))
	).toEqual(
		expect.arrayContaining([
			{ type: 'pointerdown', target: 'lower', pointerType: 'touch' },
			{ type: 'pointermove', target: 'lower', pointerType: 'touch' },
			{ type: 'pointerup', target: 'lower', pointerType: 'touch' }
		])
	);
	await expect
		.poll(async () => Math.abs(Number(await lowerAngle.inputValue())))
		.toBeGreaterThan(60);
	expect(Math.abs((await page.evaluate(() => window.scrollY)) - initialScroll)).toBeLessThanOrEqual(
		2
	);

	const verticalValue = Number(await lowerAngle.inputValue());
	const diagonalStart = await centreOf(lowerHandle);
	await dispatchTouchDrag(page, diagonalStart, {
		x: diagonalStart.x + 72,
		y: diagonalStart.y + 96
	});
	await expect
		.poll(async () => Math.abs(Number(await lowerAngle.inputValue()) - verticalValue))
		.toBeGreaterThan(20);
	expect(Math.abs((await page.evaluate(() => window.scrollY)) - initialScroll)).toBeLessThanOrEqual(
		2
	);
	await expect(lab.locator('.live-status')).toContainText('release-from-rest');
});

test('wrapped phase portraits break at the angle seam and all angular views retain fixed axes', async ({
	page
}) => {
	await installCanvasPathRecorder(page);
	await page.goto(
		`${articlePath}?v=1&mode=phase-space&preset=custom&th1=3.13&om1=5&th2=0.4&om2=0&speed=4`,
		{ waitUntil: 'domcontentloaded' }
	);
	const lab = laboratory(page);
	await expect(lab).toBeVisible();
	await lab.scrollIntoViewIfNeeded();
	const observatory = lab.locator('.observatory');
	const phaseCanvas = observatory.locator('figure').first().locator('canvas');
	await expect(phaseCanvas).toBeVisible();
	await expect
		.poll(() => phaseCanvas.getAttribute('aria-label'))
		.toMatch(/(?:[2-9]\d|[1-9]\d{2,}) rolling phase-space samples/iu);

	const seamEvidence = await phaseCanvas.evaluate((canvas) => {
		const element = canvas as HTMLCanvasElement & { __doublePendulumSegments?: CanvasSegment[] };
		const segments = element.__doublePendulumSegments ?? [];
		return {
			count: segments.length,
			falseChords: segments.filter(
				(segment) => Math.abs(segment.toX - segment.fromX) > element.clientWidth * 0.55
			).length
		};
	});
	expect(seamEvidence.count).toBeGreaterThan(10);
	expect(seamEvidence.falseChords).toBe(0);

	await observatory.getByLabel('Phase portrait').selectOption('theta2-omega2');
	await phaseCanvas.evaluate((canvas) => {
		(canvas as HTMLCanvasElement & { __doublePendulumLabels?: string[] }).__doublePendulumLabels =
			[];
	});
	await expect
		.poll(() =>
			phaseCanvas.evaluate((canvas) =>
				(
					(canvas as HTMLCanvasElement & { __doublePendulumLabels?: string[] })
						.__doublePendulumLabels ?? []
				).filter((label) => label === '-3.14' || label === '3.14')
			)
		)
		.toEqual(expect.arrayContaining(['-3.14', '3.14']));

	await observatory.getByLabel('Phase portrait').selectOption('theta1-theta2');
	await phaseCanvas.evaluate((canvas) => {
		(canvas as HTMLCanvasElement & { __doublePendulumLabels?: string[] }).__doublePendulumLabels =
			[];
	});
	await expect
		.poll(() =>
			phaseCanvas.evaluate(
				(canvas) =>
					(
						(canvas as HTMLCanvasElement & { __doublePendulumLabels?: string[] })
							.__doublePendulumLabels ?? []
					).filter((label) => label === '-3.14' || label === '3.14').length
			)
		)
		.toBeGreaterThanOrEqual(4);
});

test('reduced motion starts paused and keyboard controls remain scoped to the focused lab', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	expect(
		await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
	).toBe(true);
	await expect(lab.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	await expect(lab.locator('.instrument-readouts')).toContainText('0.00 s');

	const tabs = lab.getByRole('tab');
	await tabs.nth(0).focus();
	await tabs.nth(0).press('ArrowRight');
	await expect(tabs.nth(1)).toBeFocused();
	await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
	await tabs.nth(1).press('ArrowRight');
	await expect(tabs.nth(2)).toBeFocused();
	await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
	await tabs.nth(2).press('Home');
	await expect(tabs.nth(0)).toBeFocused();
	await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');

	const transport = lab.locator('.transport');
	const canvas = stageCanvas(page);
	await canvas.focus();
	await canvas.press('Space');
	await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	await page.evaluate(() => {
		const marker = document.createElement('button');
		marker.id = 'outside-lab-focus-target';
		marker.textContent = 'Outside laboratory';
		document.body.prepend(marker);
		marker.focus();
	});
	await page.keyboard.press('Space');
	await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	await canvas.focus();
	await canvas.press('Space');
	await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	await canvas.press('s');
	await expect(lab.locator('.live-status')).toContainText('Advanced exactly one');

	const numericalHonesty = lab.locator('details').filter({ hasText: 'Numerical Honesty' });
	await numericalHonesty.locator('summary').click();
	await numericalHonesty.getByRole('button', { name: 'Open The Lying Integrator' }).click();
	await expect(lab.locator('.instrument-readouts')).toContainText('RK4 + explicit Euler');
	await transport.getByRole('button', { name: 'Single step', exact: true }).click();
	await expect(lab.locator('.live-status')).toContainText('Advanced RK4 and explicit Euler');
});

test('shared URL state reloads into the same paused deterministic experiment', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const sharedPath = `${articlePath}?v=1&mode=shadow&preset=custom&th1=0.75&om1=-0.5&th2=-0.4&om2=0.25&m1=1.2&m2=0.8&l1=1.1&l2=0.9&g=9.7&dt=0.004166666666666667&speed=2&trail=1200&pdim=theta2&eps=0.000001`;
	await page.goto(sharedPath, { waitUntil: 'domcontentloaded' });
	let lab = await waitForLaboratory(page);
	await expect(lab.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
	await expect(lab.getByLabel('Upper angle in degrees')).toHaveValue(/42\.97/iu);
	await expect(lab.getByLabel('Lower angle in degrees')).toHaveValue(/-22\.91/iu);
	await expect(lab.getByLabel('Upper angular velocity in radians per second')).toHaveValue('-0.5');
	await expect(lab.getByLabel('Lower angular velocity in radians per second')).toHaveValue('0.25');
	await expect(lab.locator('.instrument-readouts')).toContainText('0.00 s');
	const firstState = await lab.locator('.instrument-readouts strong').allTextContents();

	await page.reload({ waitUntil: 'domcontentloaded' });
	lab = await waitForLaboratory(page);
	await expect(lab.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
	expect(await lab.locator('.instrument-readouts strong').allTextContents()).toEqual(firstState);
	await expect(lab.getByLabel('Logarithmic perturbation exponent')).toHaveValue('-6');
});

test('the atlas can cancel, regenerate, complete and select a cell', async ({ page }) => {
	await page.goto(`${articlePath}?v=1&mode=atlas&ares=80&acap=20`, {
		waitUntil: 'domcontentloaded'
	});
	const lab = laboratory(page);
	await expect(lab).toBeVisible();
	await lab.scrollIntoViewIfNeeded();
	const atlas = lab.locator('.atlas-panel');
	const progress = atlas.getByRole('progressbar', { name: 'Atlas computation progress' });
	await atlas.scrollIntoViewIfNeeded();
	await atlas.getByRole('button', { name: 'Generate atlas', exact: true }).click();
	await expect(atlas.locator('.progress-wrap')).toHaveAttribute('aria-busy', 'true');
	await atlas.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(atlas.locator('.progress-wrap')).toHaveAttribute('aria-busy', 'false');
	await expect(atlas.locator('.progress-wrap')).toContainText('cancelled');

	await atlas.getByText('Time cap').locator('..').getByRole('slider').fill('4');
	await atlas.getByRole('button', { name: 'Generate atlas', exact: true }).click();
	await expect(atlas.locator('.progress-wrap')).toHaveAttribute('aria-busy', 'true');
	await expect(atlas.locator('.progress-wrap')).toContainText(
		/(?:Preview\/refinement|coarse preview|background Worker)/iu
	);
	await expect(atlas.locator('.progress-wrap')).toContainText('Atlas complete at 80 × 80', {
		timeout: 90_000
	});
	await expect(progress).toHaveAttribute('aria-valuenow', '100');

	const atlasCanvas = atlas.locator('canvas');
	await atlasCanvas.click({ position: { x: 180, y: 150 } });
	await expect(atlas.getByRole('button', { name: 'Copy coordinates' })).toBeEnabled();
	await expect(atlas.getByRole('button', { name: 'Watch this point' })).toBeEnabled();
	await expect(atlas.locator('.selection-readout')).toContainText(/θ₁.+θ₂/iu);
	await atlas.getByRole('button', { name: 'Watch this point' }).click();
	await expect(lab.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
});

test('client navigation disposes the atlas Worker and returns with only one live simulation', async ({
	page
}) => {
	await installWorkerRecorder(page);
	await page.goto(`${articlePath}?v=1&mode=atlas&ares=80&acap=20`, {
		waitUntil: 'domcontentloaded'
	});
	let lab = laboratory(page);
	await expect(lab).toBeVisible();
	await lab.scrollIntoViewIfNeeded();
	await expect.poll(async () => (await workerCounts(page)).active).toBe(1);
	await page.evaluate(() => {
		Object.defineProperty(window, '__doublePendulumNavigationMarker', {
			configurable: true,
			value: true
		});
		const link = document.createElement('a');
		link.id = 'double-pendulum-away-link';
		link.href = '/blog/visualizations';
		link.textContent = 'Visualizations';
		document.body.append(link);
	});
	await page.locator('#double-pendulum-away-link').click();
	await expect(page).toHaveURL('/blog/visualizations');
	expect(await page.evaluate(() => Reflect.has(window, '__doublePendulumNavigationMarker'))).toBe(
		true
	);
	await expect.poll(async () => (await workerCounts(page)).active).toBe(0);

	const atlasPath = `${articlePath}?v=1&mode=atlas&ares=80&acap=20`;
	await page.evaluate((path) => {
		const link = document.createElement('a');
		link.id = 'double-pendulum-return-link';
		link.href = path;
		link.textContent = 'Return to pendulum';
		document.body.append(link);
	}, atlasPath);
	await page.locator('#double-pendulum-return-link').click();
	await expect(page).toHaveURL(new RegExp(`${articlePath.replaceAll('/', '\\/')}\\?`, 'u'));
	lab = laboratory(page);
	await expect(lab).toHaveCount(1);
	await lab.scrollIntoViewIfNeeded();
	await expect.poll(async () => (await workerCounts(page)).active).toBe(1);
	expect((await workerCounts(page)).created).toBe(2);

	await lab.getByRole('tab').nth(0).click();
	await lab.getByRole('button', { name: 'Play', exact: true }).click();
	const timeReading = lab
		.locator('.instrument-readouts > div')
		.filter({ hasText: 'Simulated time' })
		.locator('strong');
	const readSeconds = async () => Number.parseFloat((await timeReading.textContent()) ?? 'NaN');
	const before = await readSeconds();
	await expect.poll(readSeconds).toBeGreaterThan(before + 0.35);
	const after = await readSeconds();
	expect(after - before).toBeLessThan(2.5);
});

test('PNG and JSON exports emit bounded, parseable downloads', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	const pngPromise = page.waitForEvent('download');
	await lab.getByRole('button', { name: 'Download PNG', exact: true }).click();
	const pngDownload = await pngPromise;
	expect(pngDownload.suggestedFilename()).toMatch(/^double-pendulum-.+\.png$/u);
	const png = await downloadBytes(pngDownload);
	expect([...png.subarray(0, 8)]).toEqual(pngSignature);
	expect(png.byteLength).toBeGreaterThan(5_000);

	const jsonPromise = page.waitForEvent('download');
	await lab.getByRole('button', { name: 'Download state', exact: true }).click();
	const jsonDownload = await jsonPromise;
	expect(jsonDownload.suggestedFilename()).toMatch(/^double-pendulum-.+\.json$/u);
	const json = JSON.parse((await downloadBytes(jsonDownload)).toString('utf8')) as Record<
		string,
		unknown
	>;
	expect(json.schemaVersion).toBe(1);
	expect(json.currentState).toEqual(
		expect.objectContaining({ theta1: expect.any(Number), theta2: expect.any(Number) })
	);
	expect(json.parameters).toEqual(
		expect.objectContaining({
			m1: expect.any(Number),
			l1: expect.any(Number),
			g: expect.any(Number)
		})
	);
});
