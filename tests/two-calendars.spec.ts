import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

declare global {
	interface Window {
		__twoCalendarsBlobTypes?: string[];
	}
}

const articlePath = '/blog/visualizations/two-calendars-one-life';
const artifacts = 'artifacts/two-calendars';
const atlas = (page: Page): Locator => page.locator('[data-two-calendars]');
const yearSelect = (page: Page): Locator =>
	atlas(page).getByRole('combobox', { name: 'Explore a year', exact: true });
const comparisonSelect = (page: Page): Locator =>
	atlas(page).getByRole('combobox', { name: 'Choose a comparison', exact: true });
const postcard = (page: Page): Locator => atlas(page).locator('[data-postcard-preview]');

async function ready(page: Page, path = articlePath): Promise<Locator> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	await expect(atlas(page)).toBeVisible();
	await expect(atlas(page)).toHaveAttribute('data-ready', 'true');
	return atlas(page);
}

async function bytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	if (!stream) throw new Error('The browser did not supply a postcard download stream.');
	const chunks: Buffer[] = [];
	for await (const chunk of stream)
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks);
}

async function openDetails(feature: Locator, label: string): Promise<Locator> {
	const summary = feature.locator('summary').filter({ hasText: label });
	const details = summary.locator('..');
	if ((await details.getAttribute('open')) === null) await summary.click();
	await expect(details).toHaveAttribute('open', '');
	return details;
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
	await expect
		.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
		.toBe(true);
	const measurements = await atlas(page).evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		return {
			left: bounds.left,
			right: bounds.right,
			viewport: innerWidth,
			overflow: element.scrollWidth - element.clientWidth
		};
	});
	expect(measurements.left).toBeGreaterThanOrEqual(-1);
	expect(measurements.right).toBeLessThanOrEqual(measurements.viewport + 1);
	expect(measurements.overflow).toBeLessThanOrEqual(1);
}

async function positionAtlas(page: Page): Promise<void> {
	await atlas(page).evaluate((element) =>
		window.scrollTo({
			top: Math.max(0, element.getBoundingClientRect().top + scrollY - 96),
			behavior: 'instant'
		})
	);
}

test('paired reading fits desktop, tablet and both narrow mobile widths', async ({ page }) => {
	await ready(page);
	await mkdir(artifacts, { recursive: true });
	const fonts = await atlas(page).evaluate((element) => ({
		heading: getComputedStyle(element.querySelector('.tc-title-composition h1')!).fontFamily,
		summary: getComputedStyle(
			element.querySelector(
				'.tc-event-reading > p:not(.tc-event-date, .tc-event-scope, .tc-context-note)'
			)!
		).fontFamily
	}));
	expect(fonts.heading).toMatch(/Source Serif|Georgia|Times/iu);
	expect(fonts.heading).not.toMatch(/Roboto|Arial|monospace/iu);
	expect(fonts.summary).toMatch(/Roboto|Arial|sans-serif/iu);
	expect(fonts.summary).not.toMatch(/Courier|monospace/iu);
	for (const width of [1440, 768, 390, 360]) {
		const height = width === 1440 ? 1800 : width === 390 ? 2400 : width === 768 ? 1000 : 844;
		await page.setViewportSize({ width, height });
		await positionAtlas(page);
		await assertNoHorizontalOverflow(page);
		await expect(atlas(page)).toContainText('Calcutta');
		await expect(atlas(page)).toContainText('America');
		if (width <= 390) {
			await expect(atlas(page).locator('.tc-postmark')).toBeHidden();
			const pairs = atlas(page).locator('.tc-chapter-mobile-pair');
			await expect(pairs).toHaveCount(5);
			for (const pair of await pairs.all()) {
				await expect(pair).toBeVisible();
				await expect(pair.locator(':scope > div')).toHaveCount(2);
				await expect(pair.locator('.tc-mobile-date')).toHaveCount(2);
				await expect(pair).toContainText('CALCUTTA / INDIA');
				await expect(pair).toContainText('AMERICA');
				await expect(pair.getByRole('link', { name: 'Read record & sources' })).toHaveCount(2);
			}
		}
		if (width === 1440 || width === 390)
			await page.screenshot({ path: `${artifacts}/${width === 1440 ? 'desktop' : 'mobile'}.png` });
	}
	await page.setViewportSize({ width: 360, height: 2400 });
	await positionAtlas(page);
	await page.screenshot({ path: `${artifacts}/mobile-narrow.png` });
	await page.setViewportSize({ width: 1440, height: 1800 });
	await page.getByRole('combobox', { name: 'Colour theme', exact: true }).selectOption('light');
	await expect
		.poll(() =>
			atlas(page).evaluate((element) =>
				getComputedStyle(element).getPropertyValue('--tc-paper').trim()
			)
		)
		.toBe('#f4efe2');
	await positionAtlas(page);
	await page.screenshot({ path: `${artifacts}/desktop-light.png` });
	await page.setViewportSize({ width: 390, height: 2400 });
	await positionAtlas(page);
	await assertNoHorizontalOverflow(page);
	await page.screenshot({ path: `${artifacts}/mobile-light.png` });
	await page.setViewportSize({ width: 390, height: 1200 });
	await atlas(page)
		.locator('[data-calendar-chapter]')
		.first()
		.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
	await page.screenshot({ path: `${artifacts}/mobile-chapter.png` });
});

test('historical records and source links remain readable without JavaScript', async ({
	browser,
	request,
	baseURL
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('data-two-calendars');
	expect(html).toContain('Read all historical records');
	expect(html).toMatch(/Sources (?:&amp;|&) selection/u);
	expect(html.match(/<h1(?=\s|>)/gu)).toHaveLength(1);
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		serviceWorkers: 'block',
		viewport: { width: 390, height: 844 }
	});
	try {
		const page = await context.newPage();
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { level: 1 })).toContainText(/two calendars/iu);
		await expect(atlas(page)).toContainText('Calcutta');
		await expect(atlas(page)).toContainText('America');
		const records = await openDetails(atlas(page), 'Read all historical records');
		const recordCount = await records.locator('[id^="record-"]').count();
		expect(recordCount).toBeGreaterThanOrEqual(24);
		expect(recordCount).toBeLessThanOrEqual(36);
		await expect(records.locator('a[href^="https://"]').first()).toBeVisible();
		const sources = await openDetails(atlas(page), 'Sources & selection');
		expect(await sources.locator('a[href^="https://"]').count()).toBeGreaterThan(10);
		await expect(sources.locator('a[href^="https://"]').first()).toBeVisible();
		await assertNoHorizontalOverflow(page);
	} finally {
		await context.close();
	}
});

test('year and comparison selections update the historical view and restore from the public URL', async ({
	page
}) => {
	const failures: string[] = [];
	page.on('pageerror', (error) => failures.push(error.message));
	await ready(page);
	await yearSelect(page).selectOption('1943');
	await expect(yearSelect(page)).toHaveValue('1943');
	await expect(postcard(page)).toContainText('1943');
	await expect.poll(() => new URL(page.url()).searchParams.get('year')).toBe('1943');

	const options = await comparisonSelect(page)
		.locator('option')
		.evaluateAll((elements) =>
			elements
				.map((element) => ({
					value: (element as HTMLOptionElement).value,
					disabled: (element as HTMLOptionElement).disabled
				}))
				.filter((option) => option.value && !option.disabled)
		);
	expect(options.length).toBeGreaterThan(5);
	const current = await comparisonSelect(page).inputValue();
	const next = options.find((option) => option.value !== current) ?? options[0];
	await comparisonSelect(page).selectOption(next.value);
	await expect(comparisonSelect(page)).toHaveValue(next.value);
	await expect.poll(() => new URL(page.url()).searchParams.get('connection')).toBe(next.value);
	const selectedYear = await yearSelect(page).inputValue();
	const selectedPostcard = await postcard(page).textContent();
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(atlas(page)).toHaveAttribute('data-ready', 'true');
	await expect(yearSelect(page)).toHaveValue(selectedYear);
	await expect(comparisonSelect(page)).toHaveValue(next.value);
	await expect(postcard(page)).toHaveText(selectedPostcard!);
	expect(failures).toEqual([]);
});

test('unsupported URL state resolves to a safe historical selection', async ({ page }) => {
	await ready(page, `${articlePath}?year=2099&connection=unknown-comparison&event=%3Cscript%3E`);
	await expect(yearSelect(page)).toHaveValue('1947');
	await expect(postcard(page)).toContainText('1947');
	await expect(postcard(page)).not.toContainText('2099');
	await expect(postcard(page)).not.toContainText('unknown-comparison');
	await expect(postcard(page)).not.toContainText('<script>');
});

test('a historical record selected from a ribbon restores from its event URL', async ({ page }) => {
	await ready(page);
	const eventLink = atlas(page).locator('a[href^="#record-"]').first();
	const href = await eventLink.getAttribute('href');
	expect(href).toMatch(/^#record-[a-z0-9-]+$/u);
	const eventId = href!.slice('#record-'.length);
	await eventLink.focus();
	await eventLink.press('Enter');
	await expect.poll(() => new URL(page.url()).searchParams.get('event')).toBe(eventId);
	const selectedYear = await yearSelect(page).inputValue();
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(atlas(page)).toHaveAttribute('data-ready', 'true');
	await expect(yearSelect(page)).toHaveValue(selectedYear);
	await expect(atlas(page).locator(`a[href="#record-${eventId}"]`).first()).toHaveClass(
		/tc-event-selected/u
	);
});

test('native source details and links are reachable with a keyboard', async ({ page }) => {
	await ready(page);
	const summary = atlas(page).locator('summary').filter({ hasText: 'Sources & selection' });
	await summary.focus();
	await expect(summary).toBeFocused();
	await summary.press('Enter');
	const sources = summary.locator('..');
	await expect(sources).toHaveAttribute('open', '');
	await page.keyboard.press('Tab');
	const source = sources.locator('a[href^="https://"]').first();
	await expect(source).toBeFocused();
	await expect(source).toHaveAttribute('href', /^https:\/\//u);
});

test('native chapter scrolling follows an authored comparison', async ({ page }) => {
	await ready(page);
	const chapter = atlas(page).locator('[data-calendar-chapter]').nth(2);
	const chapterId = await chapter.getAttribute('id');
	expect(chapterId).toBeTruthy();
	await chapter.evaluate((element) =>
		element.scrollIntoView({ block: 'center', behavior: 'instant' })
	);
	await expect(
		atlas(page).locator(`nav[aria-label="Historical chapters"] a[href="#${chapterId}"]`)
	).toHaveAttribute('aria-current', 'step');
	await expect(chapter.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
	expect(await comparisonSelect(page).inputValue()).not.toBe('');
});

test('actual SVG and PNG downloads retain the selected year, evidence and opaque artwork', async ({
	page
}) => {
	await page.addInitScript(() => {
		const createObjectURL = URL.createObjectURL.bind(URL);
		window.__twoCalendarsBlobTypes = [];
		URL.createObjectURL = (value: Blob | MediaSource) => {
			if (value instanceof Blob) window.__twoCalendarsBlobTypes!.push(value.type);
			return createObjectURL(value);
		};
	});
	await ready(page);
	await yearSelect(page).selectOption('1943');
	await expect(yearSelect(page)).toHaveValue('1943');
	await atlas(page).getByRole('link', { name: 'Make a postcard', exact: true }).click();
	await expect(postcard(page)).toBeVisible();
	await mkdir(artifacts, { recursive: true });

	const svgDownload = page.waitForEvent('download');
	await atlas(page).getByRole('button', { name: 'Download SVG', exact: true }).click();
	const svgFile = await svgDownload;
	expect(svgFile.suggestedFilename()).toMatch(/two-calendars-1943\.svg$/u);
	const svgBytes = await bytes(svgFile);
	const svgText = svgBytes.toString('utf8');
	expect(svgText).toMatch(/^<svg\s/u);
	expect(svgText).toContain('xmlns="http://www.w3.org/2000/svg"');
	expect(svgText).toContain('1943');
	expect(svgText).toContain('Sources:');
	expect(svgText).toContain('Calcutta');
	expect(svgText).toContain('America');
	expect(svgText).toContain('year=1943');
	expect(await page.evaluate(() => window.__twoCalendarsBlobTypes?.at(-1))).toMatch(
		/^image\/svg\+xml/u
	);
	await writeFile(`${artifacts}/postcard-1943.svg`, svgBytes);

	const pngDownload = page.waitForEvent('download');
	await atlas(page).getByRole('button', { name: 'Download PNG', exact: true }).click();
	const pngFile = await pngDownload;
	expect(pngFile.suggestedFilename()).toMatch(/two-calendars-1943\.png$/u);
	const pngBytes = await bytes(pngFile);
	expect(pngBytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
	expect(await page.evaluate(() => window.__twoCalendarsBlobTypes?.at(-1))).toBe('image/png');
	expect(await sharp(pngBytes).metadata()).toMatchObject({
		format: 'png',
		width: 1600,
		height: 1000
	});
	const statistics = await sharp(pngBytes).stats();
	expect(statistics.isOpaque).toBe(true);
	expect(statistics.channels[0].max - statistics.channels[0].min).toBeGreaterThan(40);
	await writeFile(`${artifacts}/postcard-1943.png`, pngBytes);
});

test('the copied caption includes the selected historical year and a replayable link', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await ready(page);
	await yearSelect(page).selectOption('1943');
	await atlas(page).getByRole('link', { name: 'Make a postcard', exact: true }).click();
	await atlas(page).getByRole('button', { name: 'Copy caption & link', exact: true }).click();
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toContain('Two Calendars, One Life');
	const caption = await page.evaluate(() => navigator.clipboard.readText());
	expect(caption).toContain('1943');
	expect(caption).toContain('Calcutta');
	expect(caption).toContain('America');
	expect(caption).toContain('year=1943');
	expect(caption).toContain(articlePath);
});

test('reduced motion keeps ribbon emphasis immediate', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await ready(page);
	await yearSelect(page).selectOption('1955');
	await expect(yearSelect(page)).toHaveValue('1955');
	const motion = await atlas(page)
		.locator('.tc-event-dot')
		.first()
		.evaluate((element) => {
			const style = getComputedStyle(element);
			return { transition: style.transitionDuration, animation: style.animationName };
		});
	expect(motion).toEqual({ transition: '0s', animation: 'none' });
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.evaluate(() => {
		document.documentElement.dataset.motion = 'still';
	});
	await expect
		.poll(() =>
			atlas(page)
				.locator('.tc-event-dot')
				.first()
				.evaluate((element) => getComputedStyle(element).transitionDuration)
		)
		.toBe('0s');
});
