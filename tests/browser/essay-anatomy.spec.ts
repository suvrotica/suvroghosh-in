import { expect, test, type Download, type Page } from '@playwright/test';
import sharp from 'sharp';

const route = '/blog/visualizations/anatomy-of-an-essay';
const runtime = (page: Page) => page.locator('.ea-runtime');
const errors = new WeakMap<Page, string[]>();

async function ready(page: Page) {
	await page.goto(route, { waitUntil: 'domcontentloaded' });
	await page.locator('.essay-atlas').scrollIntoViewIfNeeded();
	for (const name of ['Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name, exact: true });
		if (await button.isVisible()) await button.click();
	}
	await expect(runtime(page)).toHaveAttribute('data-ready', 'true');
	await expect(runtime(page).locator('.ea-svg').first()).toBeVisible();
	return runtime(page);
}

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	if (!stream) throw new Error('The browser did not provide the exported file.');
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

test.beforeEach(async ({ page }) => {
	const collected: string[] = [];
	errors.set(page, collected);
	page.on('pageerror', (error) => collected.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') collected.push(message.text());
	});
});

test.afterEach(async ({ page }) => {
	expect(errors.get(page), 'The atlas should not raise browser errors').toEqual([]);
});

test('server fallback and live source navigation identify the exact sentence and resume reading', async ({
	page,
	request
}) => {
	const response = await request.get(route);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('Every essay has a body');
	expect(html).toContain('/images/visualizations/anatomy-of-an-essay/');
	const lab = await ready(page);
	const source = lab.locator('[data-source-sentence]').nth(12);
	const sentenceId = await source.getAttribute('data-source-sentence');
	const sentenceText = await source.textContent();
	await source.click();
	await expect(source).toHaveClass(/ea-sentence-selected/);
	await expect(lab.locator('.ea-inspector-quote')).toContainText(sentenceText!);
	await expect(lab.locator(`.ea-rib[data-sentence="${sentenceId}"]`)).toHaveClass(/is-selected/);
	await expect(lab.getByRole('button', { name: /Resume reading/ })).toBeVisible();
	await lab.getByRole('button', { name: /Resume reading/ }).click();
	await expect(source).not.toHaveClass(/ea-sentence-selected/);
	const nextParagraph = lab.locator('.ea-reader [data-paragraph]').nth(20);
	const paragraphId = await nextParagraph.getAttribute('data-paragraph');
	await nextParagraph.evaluate((element) => {
		const y = element.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.23;
		window.scrollTo(0, y);
	});
	await expect(lab.locator(`.ea-organ[data-paragraph="${paragraphId}"]`)).toHaveClass(/is-active/);
	await expect(lab.locator('.ea-reader [data-paragraph].ea-paragraph-active')).toHaveAttribute(
		'data-paragraph',
		paragraphId!
	);
});

test('comparison preserves shared scales, truthful different counts and independent selection', async ({
	page
}) => {
	const lab = await ready(page);
	await lab.getByRole('button', { name: 'Compare two', exact: true }).click();
	await expect(lab.locator('.ea-svg')).toHaveCount(2);
	await expect(lab.locator('.ea-comparison-report')).toBeVisible();
	await expect(lab.locator('.ea-comparison-report')).toContainText('Shared scales');
	const frames = await lab
		.locator('.ea-svg')
		.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
	expect(
		Math.abs(frames[0] - frames[1]),
		'Both bodies must use the same physical drawing scale'
	).toBeLessThan(1);
	const paragraphRow = lab.getByRole('row', { name: /Paragraphs/ });
	await expect(paragraphRow.getByRole('cell').nth(0)).toHaveText('58');
	await expect(paragraphRow.getByRole('cell').nth(1)).toHaveText('8');
	await expect(lab.locator('.ea-specimen-column').nth(0).locator('.ea-organ')).toHaveCount(58);
	await expect(lab.locator('.ea-specimen-column').nth(1).locator('.ea-organ')).toHaveCount(8);
	const sliders = lab.getByRole('slider');
	await sliders.nth(0).focus();
	await sliders.nth(0).press('Home');
	await sliders.nth(0).press('Enter');
	await expect(lab.locator('.ea-specimen-column').nth(0).locator('.ea-inspector')).toContainText(
		'SELECTED PASSAGE'
	);
	await sliders.nth(1).focus();
	await sliders.nth(1).press('Home');
	await sliders.nth(1).press('Enter');
	await expect(lab.locator('.ea-second .ea-inspector')).toContainText('SELECTED PASSAGE');
	await lab.getByRole('checkbox', { name: 'Normalize body size' }).check();
	await expect(lab.locator('.ea-comparison-report')).toContainText('Normalized view');
	await expect(lab.locator('.ea-scale-label').first()).toHaveText('NORMALIZED SHAPE');
	await lab.getByRole('checkbox', { name: 'Normalize body size' }).uncheck();
	await expect(lab.locator('.ea-scale-label').first()).toHaveText('SHARED COMPRESSED SCALE');
});

test('layers and dissection preserve geometry while keyboard navigation selects real passages', async ({
	page
}) => {
	const lab = await ready(page);
	const firstRib = lab.locator('.ea-rib-bone').first();
	const pathBefore = await firstRib.getAttribute('d');
	const ribs = lab.locator('.ea-layer-grid button').filter({ hasText: 'Ribs' });
	await ribs.click();
	await expect(ribs).toHaveAttribute('aria-pressed', 'false');
	await expect(lab.locator('[data-layer="ribs"]')).toHaveAttribute('visibility', 'hidden');
	await ribs.click();
	await expect(lab.locator('[data-layer="ribs"]')).toHaveAttribute('visibility', 'visible');
	await lab.getByRole('button', { name: /^Dissect/ }).click();
	await expect(lab.locator('.ea-specimen')).toHaveClass(/is-dissected/);
	await expect(firstRib).toHaveAttribute('d', pathBefore!);
	await lab.getByRole('button', { name: /^Reassemble/ }).click();
	await expect(lab.locator('.ea-specimen')).not.toHaveClass(/is-dissected/);
	const slider = lab.getByRole('slider');
	await slider.focus();
	await slider.press('Home');
	await slider.press('ArrowDown');
	await expect(slider).toHaveAttribute('aria-valuenow', '2');
	await slider.press('Enter');
	await expect(lab.locator('[data-source-sentence]').nth(1)).toHaveClass(/ea-sentence-selected/);
	await page.keyboard.press('Escape');
	await expect(lab.locator('.ea-sentence-selected')).toHaveCount(0);
});

test('private text grows locally and SVG, PNG and social exports contain safe real artwork', async ({
	page
}) => {
	const lab = await ready(page);
	const secret = 'PRIVATE_ESSAY_SENTINEL_7c186';
	const title = 'A <script>window.__essayUnsafe=1</script> & a body';
	const source = `${secret} waits by the river. The river remembers the garden.\n\nA second chamber opens, because the river returns.`;
	const requests: string[] = [];
	page.on('request', (request) => requests.push(request.url() + '\n' + (request.postData() || '')));
	await lab.getByRole('button', { name: /Grow a specimen/ }).click();
	await lab.getByLabel('Specimen title').fill(title);
	await lab.getByLabel('Paste plain text').fill(source);
	await lab.getByRole('button', { name: /Grow this specimen/ }).click();
	await expect(lab.locator('.ea-reader h2')).toHaveText(title);
	await expect(lab.locator('.ea-reader [data-paragraph]')).toHaveCount(2);
	await expect(lab.locator('.ea-reader')).toContainText(secret);
	expect(
		requests.some((request) => request.includes(secret) || request.includes('__essayUnsafe'))
	).toBe(false);
	expect(
		await page.evaluate(() => (window as unknown as { __essayUnsafe?: number }).__essayUnsafe)
	).toBeUndefined();
	const svgReady = page.waitForEvent('download');
	await lab.getByRole('button', { name: 'Download SVG ↗', exact: true }).click();
	const svg = await downloadBytes(await svgReady);
	const svgText = svg.toString('utf8');
	expect(svgText).toContain('&lt;script&gt;');
	expect(svgText).toContain('PRIVATE SPECIMEN');
	const parsed = await page.evaluate((source) => {
		const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
		return {
			parseErrors: xml.querySelectorAll('parsererror').length,
			scripts: xml.querySelectorAll('script').length,
			ribs: xml.querySelectorAll('.ea-rib').length,
			width: xml.documentElement.getAttribute('width'),
			height: xml.documentElement.getAttribute('height')
		};
	}, svgText);
	expect(parsed).toEqual({ parseErrors: 0, scripts: 0, ribs: 3, width: '1600', height: '2000' });
	for (const [name, width, height] of [
		['High-resolution PNG ↗', 1600, 2000],
		['Social portrait · 1200 × 630 ↗', 1200, 630]
	] as const) {
		const pending = page.waitForEvent('download');
		await lab.getByRole('button', { name, exact: true }).click();
		const png = await downloadBytes(await pending);
		const image = sharp(png);
		const metadata = await image.metadata();
		expect(metadata.width).toBe(width);
		expect(metadata.height).toBe(height);
		const stats = await image.stats();
		expect(
			stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0)
		).toBeGreaterThan(8);
	}
});

test('390-pixel reduced-motion reading and comparison fit the viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const lab = await ready(page);
	await expect(lab.getByRole('button', { name: 'Play pulse', exact: true })).toBeVisible();
	await expect(lab.locator('.ea-specimen')).not.toHaveClass(/is-playing/);
	await lab.getByRole('button', { name: 'Expand specimen', exact: true }).click();
	await expect(lab.locator('.ea-workspace')).toHaveClass(/ea-expanded/);
	await lab.getByRole('button', { name: 'Compact specimen', exact: true }).click();
	const source = lab.locator('[data-source-sentence]').first();
	await source.click();
	await expect(source).toHaveClass(/ea-sentence-selected/);
	await page.keyboard.press('Escape');
	await lab.getByRole('button', { name: 'Compare two', exact: true }).click();
	await expect(lab.locator('.ea-svg')).toHaveCount(2);
	const dimensions = await page.evaluate(() => ({
		width: document.documentElement.clientWidth,
		content: document.documentElement.scrollWidth
	}));
	expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
	for (const slider of await lab.getByRole('slider').all()) {
		const box = await slider.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(391);
	}
});

test('failed sample loads remove the old specimen and allow a clean retry', async ({ page }) => {
	const lab = await ready(page);
	const modelUrl = '**/essay-anatomy/perceptron-from-scratch-in-mojo.json';
	await page.route(modelUrl, (request) =>
		request.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ schemaVersion: 999 })
		})
	);
	await lab
		.getByRole('combobox', { name: 'Choose an essay', exact: true })
		.selectOption('perceptron-from-scratch-in-mojo');
	await expect(lab.getByRole('alert')).toContainText('unsupported format');
	await expect(lab.locator('.ea-svg')).toHaveCount(0);
	await expect(lab.locator('.ea-export-actions')).toHaveCount(0);
	await page.unroute(modelUrl);
	await lab.getByRole('button', { name: 'Try again', exact: true }).click();
	await expect(lab.locator('.ea-reader h2')).toHaveText('A Perceptron from Scratch in Mojo');
	await expect(lab.locator('.ea-organ')).toHaveCount(8);
});

test('the punctuation trace moves while playing and freezes when paused', async ({ page }) => {
	const lab = await ready(page);
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await lab
		.locator('[data-source-sentence]')
		.filter({ hasText: 'This, in Bengali domestic science' })
		.click();
	const canvas = lab.locator('.punctuation-pulse canvas');
	await canvas.scrollIntoViewIfNeeded();
	const play = lab.getByRole('button', { name: 'Play pulse', exact: true });
	if (await play.isVisible()) await play.click();
	await canvas.scrollIntoViewIfNeeded();
	const first = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
	await expect
		.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()))
		.not.toBe(first);
	await lab.getByRole('button', { name: 'Pause pulse', exact: true }).click();
	await expect(lab.getByRole('button', { name: 'Play pulse', exact: true })).toBeVisible();
	await canvas.scrollIntoViewIfNeeded();
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	const paused = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(paused);
});

test('recurrence controls expose neural knots and source occurrences by keyboard in both views', async ({
	page
}) => {
	const lab = await ready(page);
	await lab.locator('.ea-word-index summary').click();
	const word = lab.locator('.ea-word-index button').first();
	await word.focus();
	await word.press('Enter');
	await expect(lab.locator('.ea-inspector')).toContainText('NEURAL KNOT / RECURRENCE');
	await lab.locator('.ea-occurrences button').first().press('Enter');
	await expect(lab.locator('.ea-sentence-selected')).toHaveCount(1);
	await lab.getByRole('button', { name: 'Compare two', exact: true }).click();
	await expect(lab.locator('.ea-second .ea-svg')).toBeVisible();
	await lab.locator('.ea-second .ea-word-index summary').click();
	await lab.locator('.ea-second .ea-word-index button').first().press('Enter');
	await expect(lab.locator('.ea-second .ea-inspector')).toContainText('B / RECURRENT WORD');
	await lab.locator('.ea-second .ea-occurrences button').first().press('Enter');
	await expect(lab.locator('.ea-second .ea-inspector')).toContainText('B / SELECTED PASSAGE');
});
