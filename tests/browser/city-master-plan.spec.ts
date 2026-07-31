import { expect, test, type Download, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/the-city-that-refuses-a-master-plan';
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const topologyParameters = {
	v: '1',
	seed: 'browser-qa-monsoon',
	anchor: 'sweet-shop',
	ax: '8',
	ay: '6',
	r: '0',
	size: '18x14',
	patience: '8',
	guarantees: '0',
	density: 'balanced',
	landmarks: 'balanced',
	appetite: 'balanced',
	tram: 'ordinary'
} as const;

const runtimeDiagnostics = new WeakMap<Page, string[]>();

function cityPath(overrides: Record<string, string> = {}): string {
	const parameters = new URLSearchParams({ ...topologyParameters, ...overrides });
	return `${articlePath}?${parameters.toString()}`;
}

function laboratory(page: Page) {
	return page.getByTestId('city-master-plan-lab');
}

function collectUnexpectedRuntimeDiagnostics(page: Page): string[] {
	const diagnostics: string[] = [];
	page.on('pageerror', (error) => {
		diagnostics.push(`pageerror: ${error.message}`);
	});
	page.on('console', (message) => {
		if (message.type() !== 'warning' && message.type() !== 'error') return;
		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/')) return;
		diagnostics.push(`${message.type()}: ${message.text()}`);
	});
	return diagnostics;
}

test.beforeEach(({ page }) => {
	runtimeDiagnostics.set(page, collectUnexpectedRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(runtimeDiagnostics.get(page) ?? []).toEqual([]);
});

async function waitForComputedCity(page: Page): Promise<void> {
	const lab = laboratory(page);
	await expect.poll(() => lab.getAttribute('data-state')).toMatch(/^(revealing|paused|complete)$/u);
	const finish = page.getByRole('button', { name: 'Fast-forward bureaucracy' });
	if (await finish.isVisible()) {
		await finish.click();
	}
	await expect(lab).toHaveAttribute('data-state', 'complete');
	await expect(page.getByTestId('city-fingerprint')).toHaveText(/^[0-9A-F]{4}-[0-9A-F]{4}$/u);
}

async function openCompletedCity(page: Page, path = cityPath()): Promise<void> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	await expect(laboratory(page)).toBeVisible();
	await waitForComputedCity(page);
}

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

function pngDimensions(bytes: Buffer): { width: number; height: number } {
	expect([...bytes.subarray(0, 8)]).toEqual(pngSignature);
	return {
		width: bytes.readUInt32BE(16),
		height: bytes.readUInt32BE(20)
	};
}

async function horizontalOverflows(page: Page): Promise<Record<string, number>> {
	return page.evaluate(() => {
		const lab = document.querySelector<HTMLElement>('[data-testid="city-master-plan-lab"]');
		const workbench = lab?.querySelector<HTMLElement>('.workbench');
		const map = lab?.querySelector<HTMLElement>('.map-column');
		const reports = lab?.querySelector<HTMLElement>('.report-rail');
		if (!lab || !workbench || !map || !reports) {
			throw new Error('The city laboratory layout contract is missing.');
		}
		return {
			document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			laboratory: lab.scrollWidth - lab.clientWidth,
			workbench: workbench.scrollWidth - workbench.clientWidth,
			map: map.scrollWidth - map.clientWidth,
			reports: reports.scrollWidth - reports.clientWidth
		};
	});
}

async function citySnapshot(page: Page) {
	const report = laboratory(page).locator('.municipal-report');
	return {
		fingerprint: (await page.getByTestId('city-fingerprint').textContent())?.trim(),
		name: (await report.locator('.heading h3').textContent())?.trim(),
		report: (await report.locator('.report').textContent())?.trim(),
		functional: (await page.getByTestId('functional-score').textContent())?.trim(),
		calamity: (await page.getByTestId('calamity-score').textContent())?.trim(),
		facts: await report.locator('dl > div').allTextContents()
	};
}

test('the SSR poster hydrates into the fixed canonical interactive city', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('data-testid="city-master-plan-lab"');
	expect(html).toContain('/images/the-city-that-refuses-a-master-plan.webp');
	expect(html).toContain('Canonical no-JavaScript city report');

	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = laboratory(page);
	await expect(lab).toBeVisible();
	await expect(lab.locator('img.static-poster')).toBeAttached();
	await waitForComputedCity(page);

	expect(new URL(page.url()).search).toBe('');
	await expect(lab.locator('.static-poster')).toHaveClass(/superseded/u);
	await expect(lab.locator('.city-canvas')).toHaveClass(/canvas-ready/u);
	await expect(lab.locator('.city-interaction')).toBeEnabled();
	await expect(lab.locator('.city-interaction')).toHaveAccessibleName(/monsoon-tram-184/u);
	await expect(page.getByTestId('functional-score')).toHaveText(/^\d{1,3}$/u);
	await expect(page.getByTestId('calamity-score')).toHaveText(/^\d{1,3}$/u);
	await expect(
		lab.locator('.municipal-report dl > div').filter({ hasText: 'Seed' }).locator('dd')
	).toHaveText('monsoon-tram-184');
	await expect(
		lab.locator('.municipal-report dl > div').filter({ hasText: 'Anchor' }).locator('dd')
	).toHaveText('sweet shop');

	const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute('href');
	expect(new URL(canonicalHref!).pathname).toBe(articlePath);
	expect(new URL(canonicalHref!).search).toBe('');

	const colourCount = await lab.locator('canvas.city-map').evaluate((canvas) => {
		const cityCanvas = canvas as HTMLCanvasElement;
		const context = cityCanvas.getContext('2d');
		if (!context || cityCanvas.width === 0 || cityCanvas.height === 0) return 0;
		const pixels = context.getImageData(0, 0, cityCanvas.width, cityCanvas.height).data;
		const colours = new Set<number>();
		const stride = Math.max(4, Math.floor(pixels.length / 4 / 4_000) * 4);
		for (let offset = 0; offset < pixels.length; offset += stride) {
			if (pixels[offset + 3] === 0) continue;
			colours.add((pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]);
			if (colours.size > 24) break;
		}
		return colours.size;
	});
	expect(colourCount).toBeGreaterThan(8);
});

test('make-your-own places a sweet shop with a genuine pointer action and finishes', async ({
	page
}) => {
	await openCompletedCity(page, cityPath({ seed: 'browser-qa-pointer' }));
	const originalParameters = new URL(page.url()).searchParams;
	const originalPlacement = `${originalParameters.get('ax')},${originalParameters.get('ay')}`;
	const originalSeed = originalParameters.get('seed');

	await page.getByRole('button', { name: 'Make your own city' }).click();
	await expect(laboratory(page)).toHaveAttribute('data-state', 'placing');
	const sweetShop = page.getByRole('button', { name: /^Sweet shop/u });
	await sweetShop.click();
	await expect(sweetShop).toHaveAttribute('aria-pressed', 'true');

	const canvas = laboratory(page).locator('canvas.city-interaction');
	const box = await canvas.boundingBox();
	expect(box).not.toBeNull();
	await canvas.click({
		position: {
			x: box!.width * 0.31,
			y: box!.height * 0.36
		}
	});
	await expect(page.getByTestId('city-status')).toContainText('Sweet shop placed');
	await expect(page.getByText('Placement committed.', { exact: false })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Let the city happen' })).toBeEnabled();

	const placedParameters = new URL(page.url()).searchParams;
	expect(placedParameters.get('anchor')).toBe('sweet-shop');
	expect(placedParameters.get('seed')).toBe(originalSeed);
	expect(`${placedParameters.get('ax')},${placedParameters.get('ay')}`).not.toBe(originalPlacement);
	expect(Number(placedParameters.get('ax'))).toBeGreaterThanOrEqual(0);
	expect(Number(placedParameters.get('ay'))).toBeGreaterThanOrEqual(0);

	await page.getByRole('button', { name: 'Let the city happen' }).click();
	await waitForComputedCity(page);
	await expect(
		laboratory(page)
			.locator('.municipal-report dl > div')
			.filter({ hasText: 'Anchor' })
			.locator('dd')
	).toHaveText('sweet shop');
});

test('keyboard placement moves and rotates one sweet shop before generation', async ({ page }) => {
	await openCompletedCity(page, cityPath({ seed: 'browser-qa-keyboard-placement' }));
	const originalSeed = new URL(page.url()).searchParams.get('seed');
	await page.getByRole('button', { name: 'Make your own city' }).click();
	await page.getByRole('button', { name: /^Sweet shop/u }).click();

	const canvas = laboratory(page).locator('canvas.city-interaction');
	await canvas.focus();
	await expect(canvas).toBeFocused();
	await canvas.press('r');
	await expect(page.getByTestId('city-status')).toContainText('Sweet shop rotated to 90 degrees.');
	await canvas.press('ArrowRight');
	await expect(canvas).toHaveAccessibleName(/Selected cell column 11, row 8/u);
	await canvas.press('Space');
	await expect(page.getByText('Placement committed.', { exact: false })).toBeVisible();

	const parameters = new URL(page.url()).searchParams;
	expect(parameters.get('seed')).toBe(originalSeed);
	expect(parameters.get('anchor')).toBe('sweet-shop');
	expect(parameters.get('ax')).toBe('10');
	expect(parameters.get('ay')).toBe('7');
	expect(parameters.get('r')).toBe('1');

	await page.getByRole('button', { name: 'Let the city happen' }).click();
	await waitForComputedCity(page);
	await expect(page.getByTestId('city-status')).toContainText('Fingerprint');
});

test('Lab mode pauses, single-steps, finishes, and Enter opens and focuses the inspector', async ({
	page
}) => {
	await page.goto(cityPath({ seed: 'browser-qa-lab' }), { waitUntil: 'domcontentloaded' });
	const lab = laboratory(page);
	await expect(lab).toBeVisible();
	await expect.poll(() => lab.getAttribute('data-state')).toBe('revealing');
	await page.getByRole('button', { name: 'How it decides' }).click();
	await expect(lab).toHaveAttribute('data-mode', 'lab');
	await expect(page.getByRole('heading', { name: 'What the neighbourhood decided' })).toBeVisible();

	await page.getByRole('button', { name: 'Pause negotiations' }).click();
	await expect(lab).toHaveAttribute('data-state', 'paused');
	const shown = lab.getByText('Events shown').locator('..').locator('dd');
	const before = await shown.textContent();
	await page.getByRole('button', { name: 'Approve one more tile' }).click();
	await expect.poll(() => shown.textContent()).not.toBe(before);
	await page.getByRole('button', { name: 'Fast-forward bureaucracy' }).click();
	await expect(lab).toHaveAttribute('data-state', 'complete');

	const inspector = lab.locator('.inspector-focus-region');
	const initialHeading = await inspector
		.getByRole('heading', { name: /Cell \d+, \d+/u })
		.textContent();
	const canvas = lab.locator('canvas.city-interaction');
	await canvas.focus();
	await canvas.press('ArrowRight');
	await expect
		.poll(() => inspector.getByRole('heading', { name: /Cell \d+, \d+/u }).textContent())
		.not.toBe(initialHeading);
	await canvas.press('Enter');
	await expect(inspector).toBeFocused();
	await expect(inspector.getByText('Fabric edges')).toBeVisible();
	await expect(lab.locator('.event-log li').first()).toBeVisible();
});

test('a permanent shared URL reproduces the full city snapshot after a hard reload', async ({
	page
}) => {
	await openCompletedCity(page, cityPath({ seed: 'browser-qa-shared-fingerprint' }));
	const firstUrl = page.url();
	const first = await citySnapshot(page);
	expect(first.fingerprint).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/u);

	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForComputedCity(page);
	expect(page.url()).toBe(firstUrl);
	expect(await citySnapshot(page)).toEqual(first);
	expect(new URL(page.url()).searchParams.get('seed')).toBe('browser-qa-shared-fingerprint');

	const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute('href');
	expect(new URL(canonicalHref!).pathname).toBe(articlePath);
	expect(new URL(canonicalHref!).search).toBe('');
});

test('malformed links are adjusted visibly and unsupported versions recover explicitly', async ({
	page
}) => {
	const malformed = `${articlePath}?v=1&seed=browser-invalid&anchor=palace&ax=9999&ay=-4&r=12&size=77x88&patience=forever&guarantees=perhaps&density=vertical`;
	await page.goto(malformed, { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { name: 'Shared-link adjustments' })).toBeVisible();
	await expect(page.getByText('Unknown anchor', { exact: false })).toBeVisible();
	await expect(page.getByText('Unsupported map size', { exact: false })).toBeVisible();
	await waitForComputedCity(page);
	await expect(
		laboratory(page)
			.locator('.municipal-report dl > div')
			.filter({ hasText: 'Anchor' })
			.locator('dd')
	).toHaveText('sweet shop');

	await page.goto(`${articlePath}?v=99&seed=do-not-reinterpret`, {
		waitUntil: 'domcontentloaded'
	});
	await expect(laboratory(page).locator('.application-error')).toContainText(
		'unsupported generator version'
	);
	await expect(laboratory(page)).toHaveAttribute('data-state', 'error');
	await page.getByRole('button', { name: 'Load the published v1 demo' }).click();
	await waitForComputedCity(page);
	expect(new URL(page.url()).search).toBe('');
});

test('copy-link and share fall back to selection copying with the exact permanent URL', async ({
	page
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async () => {
					throw new DOMException('Denied for fallback QA', 'NotAllowedError');
				}
			}
		});
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: undefined
		});
		(window as unknown as { __cityCopiedValues: string[] }).__cityCopiedValues = [];
		document.execCommand = (command: string) => {
			if (command !== 'copy') return false;
			const active = document.activeElement;
			(window as unknown as { __cityCopiedValues: string[] }).__cityCopiedValues.push(
				active instanceof HTMLTextAreaElement ? active.value : ''
			);
			return true;
		};
	});
	await openCompletedCity(page, cityPath({ seed: 'browser-qa-copy-fallback' }));

	await page.getByRole('button', { name: 'Copy permanent URL' }).click();
	await expect(laboratory(page).locator('.municipal-report .status')).toContainText(
		'Permanent URL copied'
	);
	await page.getByRole('button', { name: 'Share city' }).click();
	await expect(laboratory(page).locator('.municipal-report .status')).toContainText(
		'Native sharing was unavailable'
	);

	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as { __cityCopiedValues: string[] }).__cityCopiedValues
			)
		)
		.toHaveLength(2);
	const values = await page.evaluate(
		() => (window as unknown as { __cityCopiedValues: string[] }).__cityCopiedValues
	);
	expect(values[0]).toBe(page.url());
	expect(values[1]).toContain('My city,');
	expect(values[1]).toContain('scored');
	expect(values[1]).toContain(page.url());
});

test('JSON, social PNG, and high-resolution PNG downloads are valid and nonempty', async ({
	page
}) => {
	await openCompletedCity(page, cityPath({ seed: 'browser-qa-downloads' }));
	const fingerprint = (await page.getByTestId('city-fingerprint').textContent())!.trim();

	const [jsonDownload] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Download city JSON' }).click()
	]);
	const jsonBytes = await downloadBytes(jsonDownload);
	expect(jsonBytes.length).toBeGreaterThan(1_000);
	expect(jsonDownload.suggestedFilename()).toMatch(/\.json$/u);
	const payload = JSON.parse(jsonBytes.toString('utf8')) as {
		schema: string;
		generatorVersion: number;
		fingerprint: string;
		width: number;
		height: number;
		anchor: { id: string };
		fabricTiles: unknown[];
		occupationTiles: unknown[];
		infrastructure: unknown[];
		municipalPatches: unknown[];
		scores: { functional: number; calamity: number; components: Record<string, unknown[]> };
		analysis: unknown;
	};
	expect(payload).toMatchObject({
		schema: 'suvro-city-v1',
		generatorVersion: 1,
		fingerprint,
		anchor: { id: 'sweet-shop' }
	});
	expect(payload.fabricTiles).toHaveLength(payload.width * payload.height);
	expect(payload.occupationTiles).toHaveLength(payload.width * payload.height);
	expect(Array.isArray(payload.infrastructure)).toBe(true);
	expect(Array.isArray(payload.municipalPatches)).toBe(true);
	expect(payload.scores.functional).toBeGreaterThanOrEqual(0);
	expect(payload.scores.calamity).toBeGreaterThanOrEqual(0);
	expect(payload.scores.components.functional.length).toBeGreaterThan(0);
	expect(payload.scores.components.calamity.length).toBeGreaterThan(0);
	expect(payload.analysis).toBeTruthy();

	const [socialDownload] = await Promise.all([
		page.waitForEvent('download', { timeout: 45_000 }),
		page.getByRole('button', { name: 'Download social PNG' }).click()
	]);
	const socialBytes = await downloadBytes(socialDownload);
	expect(socialDownload.suggestedFilename()).toMatch(/-social\.png$/u);
	expect(socialBytes.length).toBeGreaterThan(10_000);
	expect(pngDimensions(socialBytes)).toEqual({ width: 1_600, height: 1_200 });

	const [mapDownload] = await Promise.all([
		page.waitForEvent('download', { timeout: 45_000 }),
		page.getByRole('button', { name: 'Download high-res PNG' }).click()
	]);
	const mapBytes = await downloadBytes(mapDownload);
	expect(mapDownload.suggestedFilename()).toMatch(/-map\.png$/u);
	expect(mapBytes.length).toBeGreaterThan(10_000);
	expect(pngDimensions(mapBytes)).toEqual({ width: 3_200, height: 2_400 });
});

test('friendly challenges compare distinct recomputed cities, expose deltas, and rematch', async ({
	page
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: async () => undefined }
		});
	});
	await openCompletedCity(page, cityPath({ seed: 'browser-qa-challenge' }));
	await page.getByText('Challenge a friend', { exact: true }).click();
	await page.getByRole('button', { name: 'Most functional' }).click();
	await waitForComputedCity(page);

	await expect(page.getByRole('heading', { name: 'Two cities, recomputed locally' })).toBeVisible();
	const challenge = laboratory(page).locator('.challenge-panel');
	const comparison = challenge.locator('.comparison');
	await expect(comparison).toBeVisible();
	await expect(comparison.locator('article')).toHaveCount(2);
	await expect(comparison.locator('output')).toHaveCount(2);
	await expect(comparison.locator('output').first()).toContainText('Functional:');

	const firstChallengeParameters = new URL(page.url()).searchParams;
	const firstRecipientSeed = firstChallengeParameters.get('seed');
	expect(firstChallengeParameters.get('challenge')).toBe('functional');
	expect(firstChallengeParameters.get('c_seed')).toBe('browser-qa-challenge');
	expect(firstRecipientSeed).toBeTruthy();
	expect(firstRecipientSeed).not.toBe(firstChallengeParameters.get('c_seed'));
	expect([...firstChallengeParameters.keys()].some((key) => /score|fingerprint/u.test(key))).toBe(
		false
	);

	const componentRows = challenge.locator('.details > div').first().locator('li');
	await expect(componentRows).toHaveCount(3);
	const componentDeltas = await componentRows.allTextContents();
	expect(
		componentDeltas.some((row) => {
			const value = row.match(/([-+]?\d+(?:\.\d+)?)\s*$/u)?.[1];
			return value !== undefined && Math.abs(Number(value)) > 0;
		})
	).toBe(true);
	await expect(challenge.getByText('Notable anomalies')).toBeVisible();
	await expect(challenge.locator('.details > div').nth(1).locator('p')).not.toBeEmpty();
	await expect(laboratory(page).locator('.municipal-report .status')).toContainText(
		'Opponent recomputed from seed and settings'
	);

	await challenge.getByRole('button', { name: 'Share rematch' }).click();
	await expect.poll(() => new URL(page.url()).searchParams.get('c_seed')).toBe(firstRecipientSeed);
	await waitForComputedCity(page);
	const rematchParameters = new URL(page.url()).searchParams;
	expect(rematchParameters.get('challenge')).toBe('functional');
	expect(rematchParameters.get('seed')).not.toBe(firstRecipientSeed);
	await expect(challenge.locator('.comparison')).toBeVisible();
});

test('the city remains usable at 360 CSS pixels with a scrollable anchor palette', async ({
	page
}) => {
	await page.setViewportSize({ width: 360, height: 800 });
	await openCompletedCity(page, cityPath({ seed: 'browser-qa-mobile-360' }));
	const lab = laboratory(page);

	const geometry = await lab.evaluate((element) => {
		const workbench = element.querySelector<HTMLElement>('.workbench');
		const map = element.querySelector<HTMLElement>('.map-column');
		const reports = element.querySelector<HTMLElement>('.report-rail');
		const canvas = element.querySelector<HTMLElement>('canvas.city-interaction');
		const inspector = element.querySelector<HTMLElement>('.inspector-focus-region');
		if (!workbench || !map || !reports || !canvas || !inspector) {
			throw new Error('The mobile city layout is incomplete.');
		}
		const mapRect = map.getBoundingClientRect();
		const reportRect = reports.getBoundingClientRect();
		const canvasRect = canvas.getBoundingClientRect();
		const visibleButtons = [...element.querySelectorAll<HTMLButtonElement>('button')].filter(
			(button) => button.getBoundingClientRect().height > 0
		);
		return {
			laboratoryWidth: element.getBoundingClientRect().width,
			mapWidth: mapRect.width,
			reportWidth: reportRect.width,
			reportBelowMap: reportRect.top >= mapRect.bottom - 1,
			canvasWidth: canvasRect.width,
			canvasTouchAction: getComputedStyle(canvas).touchAction,
			reportColumns: getComputedStyle(reports).gridTemplateColumns.split(/\s+/u).length,
			minimumButtonHeight: Math.min(
				...visibleButtons.map((button) => button.getBoundingClientRect().height)
			)
		};
	});
	expect(geometry.laboratoryWidth).toBeLessThanOrEqual(360);
	expect(geometry.mapWidth).toBeGreaterThan(330);
	expect(geometry.reportWidth).toBeGreaterThan(330);
	expect(geometry.reportBelowMap).toBe(true);
	expect(geometry.canvasWidth).toBeGreaterThan(320);
	expect(geometry.canvasTouchAction).toBe('pan-y');
	expect(geometry.reportColumns).toBe(1);
	expect(geometry.minimumButtonHeight).toBeGreaterThanOrEqual(43.5);
	for (const overflow of Object.values(await horizontalOverflows(page))) {
		expect(overflow).toBeLessThanOrEqual(1);
	}

	const inspector = lab.locator('.inspector-focus-region');
	const inspectorToggle = inspector.locator('.mobile-inspector-toggle');
	await expect(inspectorToggle).toBeVisible();
	await expect(inspectorToggle).toHaveAttribute('aria-expanded', 'true');
	await inspectorToggle.click();
	await expect(inspectorToggle).toHaveAttribute('aria-expanded', 'false');
	await expect(inspector.locator('.inspector-content')).toBeHidden();
	await inspectorToggle.click();
	await expect(inspectorToggle).toHaveAttribute('aria-expanded', 'true');
	await expect(inspector.locator('.inspector-content')).toBeVisible();
	await inspector.focus();
	await inspector.press('Escape');
	await expect(inspectorToggle).toHaveAttribute('aria-expanded', 'false');
	await expect(lab.locator('canvas.city-interaction')).toBeFocused();
	await expect(page.getByTestId('city-status')).toContainText(
		'mobile cell inspector was collapsed'
	);

	await page.getByRole('button', { name: 'Make your own city' }).click();
	const anchorRow = lab.locator('.anchor-row');
	await expect(anchorRow).toBeVisible();
	const paletteGeometry = await anchorRow.evaluate((row) => ({
		clientWidth: row.clientWidth,
		scrollWidth: row.scrollWidth,
		overflowX: getComputedStyle(row).overflowX
	}));
	expect(paletteGeometry.scrollWidth).toBeGreaterThan(paletteGeometry.clientWidth);
	expect(['auto', 'scroll']).toContain(paletteGeometry.overflowX);
	await expect(page.getByRole('button', { name: /^Sweet shop/u })).toBeVisible();
});

test('the tablet layout keeps a full-width map and a lower two-column outcome panel', async ({
	page
}) => {
	await page.setViewportSize({ width: 820, height: 1_080 });
	await openCompletedCity(page, cityPath({ seed: 'browser-qa-tablet' }));
	const lab = laboratory(page);
	const geometry = await lab.evaluate((element) => {
		const workbench = element.querySelector<HTMLElement>('.workbench');
		const map = element.querySelector<HTMLElement>('.map-column');
		const reports = element.querySelector<HTMLElement>('.report-rail');
		const score = element.querySelector<HTMLElement>('.score-panel');
		const inspector = element.querySelector<HTMLElement>('.inspector-focus-region');
		if (!workbench || !map || !reports || !score || !inspector) {
			throw new Error('The tablet city layout is incomplete.');
		}
		const workbenchRect = workbench.getBoundingClientRect();
		const mapRect = map.getBoundingClientRect();
		const reportRect = reports.getBoundingClientRect();
		return {
			workbenchWidth: workbenchRect.width,
			mapWidth: mapRect.width,
			reportWidth: reportRect.width,
			reportBelowMap: reportRect.top >= mapRect.bottom - 1,
			reportColumns: getComputedStyle(reports).gridTemplateColumns.split(/\s+/u).length,
			scoreVisible: score.getBoundingClientRect().height > 0,
			inspectorVisible: inspector.getBoundingClientRect().height > 0
		};
	});
	expect(Math.abs(geometry.mapWidth - geometry.workbenchWidth)).toBeLessThanOrEqual(1);
	expect(Math.abs(geometry.reportWidth - geometry.workbenchWidth)).toBeLessThanOrEqual(1);
	expect(geometry.reportBelowMap).toBe(true);
	expect(geometry.reportColumns).toBe(2);
	expect(geometry.scoreVisible).toBe(true);
	expect(geometry.inspectorVisible).toBe(true);
	for (const overflow of Object.values(await horizontalOverflows(page))) {
		expect(overflow).toBeLessThanOrEqual(1);
	}
});

test('OS reduced motion and the site Still setting both skip reveal transitions', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(cityPath({ seed: 'browser-qa-os-reduced-motion' }), {
		waitUntil: 'domcontentloaded'
	});
	await expect(laboratory(page)).toHaveAttribute('data-state', 'complete');
	await expect(page.getByTestId('city-status')).toContainText('motion preferences skipped');

	const transitionDurations = () =>
		laboratory(page).evaluate((element) => {
			const staticPoster = element.querySelector<HTMLElement>('.static-poster');
			const canvasPoster = element.querySelector<HTMLElement>('.city-poster');
			const progress = element.querySelector<HTMLElement>('.progress-line span');
			const settingsMarker = element.querySelector<HTMLElement>(
				'.advanced-settings summary > span:last-child'
			);
			if (!staticPoster || !canvasPoster || !progress || !settingsMarker) {
				throw new Error('The city motion targets are missing.');
			}
			return [
				getComputedStyle(staticPoster).transitionDuration,
				getComputedStyle(canvasPoster).transitionDuration,
				getComputedStyle(progress).transitionDuration,
				getComputedStyle(settingsMarker).transitionDuration
			];
		});
	expect(await transitionDurations()).toEqual(['0s', '0s', '0s', '0s']);

	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.evaluate(() => window.localStorage.setItem('site-motion', 'still'));
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
	await expect(laboratory(page)).toHaveAttribute('data-state', 'complete');
	await expect(page.getByTestId('city-status')).toContainText('motion preferences skipped');
	expect(await transitionDurations()).toEqual(['0s', '0s', '0s', '0s']);
});

test('without JavaScript the article, dedicated poster, premise, and canonical report remain', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 360, height: 800 }
	});
	const page = await context.newPage();
	const diagnostics = collectUnexpectedRuntimeDiagnostics(page);
	try {
		const origin = baseURL ?? 'http://127.0.0.1:4213';
		await page.goto(`${origin}${articlePath}`, { waitUntil: 'domcontentloaded' });
		await expect(
			page.getByRole('heading', { name: 'The City That Refuses a Master Plan' })
		).toBeVisible();
		await expect(
			page.getByText('Place one thing. The neighbourhood negotiates everything else.')
		).toBeVisible();
		const lab = laboratory(page);
		await expect(lab).toBeVisible();
		await expect(lab.locator('img.no-script-poster')).toBeVisible();
		await expect(lab.locator('.workbench')).toHaveAttribute('inert', '');
		await expect(lab.locator('.workbench')).toHaveAttribute('aria-hidden', 'true');
		await expect(lab.locator('.workbench')).toBeHidden();
		await expect(lab.getByRole('button')).toHaveCount(0);
		await expect(
			page.getByRole('heading', { name: 'The published sweet-shop demonstration' })
		).toBeVisible();
		const fallbackReport = lab.locator('.no-script-report');
		await expect(fallbackReport).toContainText('monsoon-tram-184');
		await expect(fallbackReport).toContainText('Jute Sand Para 274');
		await expect(fallbackReport).toContainText('9F16-B94E');
		await expect(fallbackReport).toContainText(/Function\s+66\/100/u);
		await expect(fallbackReport).toContainText(/All\s+121\s+segments reach an outlet/u);
		await expect(fallbackReport).toContainText('With scripting disabled');
		expect(await page.getByTestId('city-fingerprint').count()).toBe(0);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);
		expect(diagnostics).toEqual([]);
	} finally {
		await context.close();
	}
});
