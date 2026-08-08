import { expect, test, type Download, type Page } from '@playwright/test';
import sharp from 'sharp';

const articlePath = '/blog/visualizations/belousov-zhabotinsky-laboratory';
const articleTitle = 'The Clock That Escaped Into Space: A Belousov–Zhabotinsky Laboratory';
const diagnostics = new WeakMap<Page, string[]>();

function collectRuntimeDiagnostics(page: Page) {
	const messages: string[] = [];
	page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/') || /favicon/iu.test(source)) return;
		messages.push(`console error: ${message.text()}`);
	});
	return messages;
}

function lab(page: Page) {
	return page.getByTestId('bz-laboratory');
}

async function waitForLab(page: Page) {
	const laboratory = lab(page);
	await expect(laboratory).toBeVisible();
	await laboratory.scrollIntoViewIfNeeded();
	await expect(laboratory.locator('.engine-line')).toContainText(/RGBA(?:16|32)F|CPU reference/iu, {
		timeout: 60_000
	});
	return laboratory;
}

async function readStep(page: Page) {
	const text = await lab(page).locator('.hud span').first().innerText();
	return Number(text.replace(/[^0-9]/gu, ''));
}

async function downloadBytes(download: Download) {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream)
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks);
}

test.beforeEach(({ page }) => diagnostics.set(page, collectRuntimeDiagnostics(page)));
test.afterEach(({ page }) => expect(diagnostics.get(page) ?? []).toEqual([]));

test('the article and every live scientific panel hydrate without replacing the Gray–Scott atlas', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain(articleTitle);
	expect(html).toContain('/images/belousov-zhabotinsky-laboratory.png');
	expect(html).toContain('Begin with a question, not seven Greek letters');
	expect(html).toContain('Can arithmetic counterfeit the chemistry?');

	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { level: 1, name: articleTitle })).toHaveCount(1);
	const laboratory = await waitForLab(page);
	await expect(laboratory.getByTestId('bz-stage')).toBeVisible();
	await expect(laboratory.getByLabel('Exhibit preset')).toHaveValue('zhabotinsky-dish');
	await expect(laboratory.getByRole('button', { name: 'BZ waves' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(laboratory.locator('.tools button')).toHaveCount(7);
	await expect(laboratory.locator('.panel-tabs button')).toHaveCount(4);
	await expect(
		page.getByRole('heading', { name: 'Begin with a question, not seven Greek letters' })
	).toBeVisible();
	await expect(
		page.getByRole('heading', { name: 'Does diffusion create a growing spatial mode?' })
	).toBeVisible();

	const bounds = await laboratory.evaluate((element) => {
		const box = element.getBoundingClientRect();
		return { left: box.left, right: box.right, width: window.innerWidth };
	});
	expect(bounds.left).toBeGreaterThanOrEqual(0);
	expect(bounds.right).toBeLessThanOrEqual(bounds.width);

	const duplicateIds = await page.evaluate(() => {
		const counts = new Map<string, number>();
		for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
			counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
		}
		return [...counts.entries()].filter(([, count]) => count > 1);
	});
	expect(duplicateIds).toEqual([]);

	const atlas = await request.get('/blog/visualizations/reaction-diffusion-atlas');
	expect(atlas.ok()).toBe(true);
	expect(await atlas.text()).toContain('The Chemistry That Draws Without a Hand');
});

test('the reduced Float64 path runs, pauses, probes, intervenes, stirs and isolates terms', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const laboratory = await waitForLab(page);
	await expect(laboratory.locator('.engine-line')).toContainText(/reduced from 128 × 128/iu);
	expect(await readStep(page)).toBe(0);

	await laboratory.getByRole('button', { name: 'Step', exact: true }).click();
	await expect.poll(() => readStep(page)).toBe(1);
	await laboratory.getByRole('button', { name: 'Run', exact: true }).click();
	await expect.poll(() => readStep(page)).toBeGreaterThan(2);
	await laboratory.getByRole('button', { name: 'Pause', exact: true }).click();
	const paused = await readStep(page);
	await page.waitForTimeout(300);
	expect(await readStep(page)).toBe(paused);

	const field = laboratory.locator('.overlay-canvas');
	await field.click({ position: { x: 220, y: 220 } });
	await expect(laboratory.getByRole('tab', { name: 'Probe' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(laboratory.getByText(/active chemistry|wall or exterior/iu)).toBeVisible();
	await field.press('2');
	await field.press('Enter');
	await expect.poll(() => readStep(page)).toBe(paused + 1);

	await laboratory.getByRole('button', { name: 'Stir', exact: true }).click();
	await expect(laboratory.getByTestId('bz-status')).toContainText(/homogenisation/iu);
	await expect.poll(() => readStep(page)).toBe(paused + 2);

	await laboratory.getByRole('tab', { name: 'Method' }).click();
	await laboratory.getByLabel('Reaction only').check();
	await expect(laboratory.locator('.engine-line')).toContainText(/term-isolation|CPU reference/iu);
	await expect.poll(() => readStep(page)).toBe(0);
	await laboratory.getByRole('button', { name: 'Step', exact: true }).click();
	await expect.poll(() => readStep(page)).toBe(1);

	await laboratory.getByRole('button', { name: 'Reset', exact: true }).click();
	await expect.poll(() => readStep(page)).toBe(0);
});

test('guided setups reach the main lab and JSON/PNG exports preserve the scientific record', async ({
	page
}) => {
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const laboratory = await waitForLab(page);
	const guides = page.locator('section.guided-experiments');
	await guides.getByRole('button', { name: /Break a front; test the tip/iu }).click();
	await guides.getByRole('button', { name: 'Open exact setup' }).click();
	await expect(laboratory.getByLabel('Exhibit preset')).toHaveValue('broken-front-spiral');
	await expect(laboratory.getByTestId('bz-status')).toContainText(/opened exactly/iu);

	await laboratory.getByRole('button', { name: 'Step', exact: true }).click();
	await laboratory.getByRole('tab', { name: 'Save' }).click();
	const jsonDownloadPromise = page.waitForEvent('download');
	await laboratory.getByRole('button', { name: 'Experiment JSON' }).click();
	const json = JSON.parse((await downloadBytes(await jsonDownloadPromise)).toString('utf8')) as {
		schemaVersion: number;
		engineVersion: string;
		setup: { initialCondition: string; seed: string; gridSize: number };
		step: number;
		interventions: unknown[];
	};
	expect(json.schemaVersion).toBe(1);
	expect(json.engineVersion).toContain('heun');
	expect(json.setup.initialCondition).toBe('broken-front');
	expect(json.setup.seed).toContain('spiral');
	expect(json.setup.gridSize).toBe(64);
	expect(json.step).toBe(1);
	expect(Array.isArray(json.interventions)).toBe(true);

	const pngDownloadPromise = page.waitForEvent('download');
	await laboratory.getByRole('button', { name: 'Field PNG' }).click();
	const image = sharp(await downloadBytes(await pngDownloadPromise));
	const metadata = await image.metadata();
	expect(metadata.format).toBe('png');
	expect(metadata.width).toBe(1200);
	expect(metadata.height).toBe(1200);
});

test('mobile layout stays in bounds and keyboard controls remain operable', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const laboratory = await waitForLab(page);
	const geometry = await laboratory.evaluate((element) => {
		const box = element.getBoundingClientRect();
		return {
			left: box.left,
			right: box.right,
			viewport: window.innerWidth,
			documentOverflow: document.documentElement.scrollWidth - window.innerWidth
		};
	});
	expect(geometry.left).toBeGreaterThanOrEqual(0);
	expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
	expect(geometry.documentOverflow).toBeLessThanOrEqual(1);

	const field = laboratory.locator('.overlay-canvas');
	await field.focus();
	await field.press('ArrowRight');
	await field.press('1');
	await field.press('Enter');
	await expect(laboratory.getByRole('tab', { name: 'Probe' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(laboratory.getByRole('button', { name: 'Full screen' })).toBeHidden();
	await expect(laboratory.locator('.tools')).toBeVisible();
});
