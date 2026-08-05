import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/the-bias-archipelago';
const objectiveScenario = 'objective-observer';
const deepLinkedStep = 3;
const clickedStep = 4;
const runtimeDiagnostics = new WeakMap<Page, string[]>();

function scenarioStepId(scenarioId: string, oneBasedStep: number): string {
	return `scenario-${scenarioId}-step-${oneBasedStep}`;
}

function scenarioStep(page: Page, scenarioId: string, oneBasedStep: number): Locator {
	return page.locator(`#${scenarioStepId(scenarioId, oneBasedStep)}`);
}

function deepLink(oneBasedStep: number): string {
	const target = scenarioStepId(objectiveScenario, oneBasedStep);
	return `${articlePath}?scenario=${objectiveScenario}&step=${oneBasedStep}#${target}`;
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

async function expectActiveScenarioStep(
	page: Page,
	scenarioId: string,
	oneBasedStep: number
): Promise<Locator> {
	const step = scenarioStep(page, scenarioId, oneBasedStep);
	await expect(step).toHaveClass(/active-step/u);
	await expect(step.getByRole('button')).toHaveAttribute('aria-current', 'step');
	await expect(page.locator('.sounding-heading strong')).toHaveText('The objective observer');
	return step;
}

async function expectTargetInReadingBand(page: Page, target: Locator): Promise<void> {
	await expect(target).toBeVisible();
	await expect
		.poll(() =>
			target.evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				const centre = bounds.top + bounds.height / 2;
				return (
					bounds.bottom > 0 &&
					bounds.top < window.innerHeight &&
					centre >= window.innerHeight * 0.28 &&
					centre <= window.innerHeight * 0.72
				);
			})
		)
		.toBe(true);
}

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

async function mapHeightRatio(map: Locator): Promise<number> {
	return map.evaluate((element) => element.getBoundingClientRect().height / window.innerHeight);
}

test.beforeEach(({ page }) => {
	runtimeDiagnostics.set(page, collectUnexpectedRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(runtimeDiagnostics.get(page) ?? []).toEqual([]);
});

test('scenario and step are present in raw SSR and survive hydration, history, and exact-target restoration', async ({
	page,
	request
}) => {
	const serverResponse = await request.get(
		`${articlePath}?scenario=${objectiveScenario}&step=${deepLinkedStep}`
	);
	expect(serverResponse.ok()).toBe(true);
	const serverHtml = await serverResponse.text();
	expect(serverHtml).toContain('Current sounding');
	expect(serverHtml).toContain('The objective observer');
	expect(serverHtml).toContain(`id="${scenarioStepId(objectiveScenario, deepLinkedStep)}"`);
	expect(serverHtml).toMatch(
		new RegExp(
			`<li(?=[^>]*id="${scenarioStepId(objectiveScenario, deepLinkedStep)}")(?=[^>]*class="[^"]*active-step)[^>]*>`,
			'u'
		)
	);
	expect(serverHtml).toMatch(
		new RegExp(
			`id="${scenarioStepId(objectiveScenario, deepLinkedStep)}"[\\s\\S]{0,1200}?aria-current="step"`,
			'u'
		)
	);

	await page.goto(deepLink(deepLinkedStep), { waitUntil: 'domcontentloaded' });
	const initialTarget = await expectActiveScenarioStep(page, objectiveScenario, deepLinkedStep);
	await expectTargetInReadingBand(page, initialTarget);

	// The observer is deliberately resumed after the programmatic jump. Waiting beyond
	// that boundary catches regressions where the first visible passage overwrites the link.
	await page.waitForTimeout(700);
	await expectActiveScenarioStep(page, objectiveScenario, deepLinkedStep);
	await expect(page).toHaveURL(deepLink(deepLinkedStep));

	const historyLength = await page.evaluate(() => window.history.length);
	const clickedTarget = scenarioStep(page, objectiveScenario, clickedStep);
	await clickedTarget.getByRole('button').click();
	await expect
		.poll(() => {
			const url = new URL(page.url());
			return {
				scenario: url.searchParams.get('scenario'),
				step: url.searchParams.get('step'),
				hash: url.hash
			};
		})
		.toEqual({
			scenario: objectiveScenario,
			step: String(clickedStep),
			hash: `#${scenarioStepId(objectiveScenario, clickedStep)}`
		});
	await expectActiveScenarioStep(page, objectiveScenario, clickedStep);
	await expect.poll(() => page.evaluate(() => window.history.length)).toBe(historyLength + 1);

	await page.goBack({ waitUntil: 'domcontentloaded' });
	await expect(page).toHaveURL(deepLink(deepLinkedStep));
	const restoredBackTarget = await expectActiveScenarioStep(
		page,
		objectiveScenario,
		deepLinkedStep
	);
	await expectTargetInReadingBand(page, restoredBackTarget);

	await page.goForward({ waitUntil: 'domcontentloaded' });
	await expect(page).toHaveURL(deepLink(clickedStep));
	const restoredForwardTarget = await expectActiveScenarioStep(
		page,
		objectiveScenario,
		clickedStep
	);
	await expectTargetInReadingBand(page, restoredForwardTarget);
});

test('the server-rendered document follows intro, essay, explorer, and field-guide order', async ({
	page
}) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(page.getByTestId('bias-archipelago')).toHaveCount(1);
	await expect(page.locator('.scenario-rail > article')).toHaveCount(2);
	await expect(
		page.locator('#there-are-several-ways-to-organize-human-foolishness')
	).toBeAttached();
	await expect(page.getByTestId('bias-archipelago-survey')).toHaveCount(1);
	await expect(page.locator('#bias-index-heading')).toHaveText(
		'Open the complete 90-entry field guide'
	);

	const orderIsCorrect = await page.evaluate(() => {
		const nodes = [
			document.querySelector('[data-testid="bias-archipelago"]'),
			document.querySelector('#there-are-several-ways-to-organize-human-foolishness'),
			document.querySelector('#bias-archipelago-explorer'),
			document.querySelector('#bias-index-heading')
		];
		if (nodes.some((node) => !node)) return false;
		return nodes
			.slice(0, -1)
			.every((node, index) =>
				Boolean(node!.compareDocumentPosition(nodes[index + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING)
			);
	});
	expect(orderIsCorrect).toBe(true);
});

test('mobile opening and guided maps start near 44dvh and expand on request', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });

	const opening = page.locator('.opening-map');
	const openingMap = opening.getByTestId('bias-map');
	const guided = page.locator('.sticky-sounding');
	const guidedMap = guided.getByTestId('bias-map');

	for (const map of [openingMap, guidedMap]) {
		await expect(map).toBeAttached();
		const ratio = await mapHeightRatio(map);
		expect(ratio).toBeGreaterThanOrEqual(0.4);
		expect(ratio).toBeLessThanOrEqual(0.47);
	}

	const openingHeight = await openingMap.evaluate(
		(element) => element.getBoundingClientRect().height
	);
	await opening.getByRole('button', { name: 'Expand map', exact: true }).click();
	await expect(opening.getByRole('button', { name: 'Compact map', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect.poll(() => mapHeightRatio(openingMap)).toBeGreaterThanOrEqual(0.69);
	expect(
		await openingMap.evaluate((element) => element.getBoundingClientRect().height)
	).toBeGreaterThan(openingHeight + 100);
	await opening.getByRole('button', { name: 'Compact map', exact: true }).click();

	await guided.scrollIntoViewIfNeeded();
	const guidedHeight = await guidedMap.evaluate(
		(element) => element.getBoundingClientRect().height
	);
	await guided.getByRole('button', { name: 'Expand map', exact: true }).click();
	await expect(guided.getByRole('button', { name: 'Compact map', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect.poll(() => mapHeightRatio(guidedMap)).toBeGreaterThanOrEqual(0.69);
	expect(
		await guidedMap.evaluate((element) => element.getBoundingClientRect().height)
	).toBeGreaterThan(guidedHeight + 100);
});

test('Vector SVG export contains contour paths and no embedded raster image', async ({ page }) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const survey = page.getByTestId('bias-archipelago-survey');
	await expect(survey).toBeVisible();
	const downloadPromise = page.waitForEvent('download');
	await survey.getByRole('button', { name: /Vector SVG/u }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('bias-archipelago-view.svg');

	const svg = (await downloadBytes(download)).toString('utf8');
	expect(svg).toMatch(/^<svg\b/u);
	expect(svg).toContain('class="vector-terrain"');
	expect(svg.match(/<path\b/gu)?.length ?? 0).toBeGreaterThan(30);
	expect(svg).not.toMatch(/<image(?:\s|>)/iu);
	expect(svg).not.toMatch(/data:image\//iu);
});
