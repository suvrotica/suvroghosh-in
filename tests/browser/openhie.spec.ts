import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import { extractNarration } from '../../src/lib/components/blog/tts/narration.mjs';
import { COMPONENTS, MODEL_VERSION } from '../../src/lib/visualizations/openhie/catalog';
import type { ExchangeReceipt } from '../../src/lib/visualizations/openhie/replay';

const articlePath =
	process.env.OPENHIE_TEST_PATH || '/blog/visualizations/the-patient-between-the-systems';
const posterPath = '/images/visualizations/openhie/openhie-social.png';
const laboratory = (page: Page) => page.locator('.ohie-lab');
const runtime = (page: Page) => laboratory(page).locator('[data-ohie-ready="true"]');

async function ready(page: Page, path = articlePath): Promise<Locator> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	await laboratory(page).scrollIntoViewIfNeeded();
	await expect(runtime(page)).toBeVisible({ timeout: 60_000 });
	const rejectOptional = page.getByRole('button', { name: 'Reject optional', exact: true });
	if (await rejectOptional.isVisible()) await rejectOptional.click();
	const privacyConfirmation = page.getByRole('button', {
		name: 'Dismiss privacy confirmation',
		exact: true
	});
	if (await privacyConfirmation.isVisible()) await privacyConfirmation.click();
	return runtime(page);
}

async function receipt(download: Download): Promise<ExchangeReceipt> {
	const stream = await download.createReadStream();
	if (!stream) throw new Error('The browser did not provide the exchange receipt.');
	const chunks: Buffer[] = [];
	for await (const chunk of stream)
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return JSON.parse(Buffer.concat(chunks).toString('utf8')) as ExchangeReceipt;
}

async function journey(page: Page, value: number | 'last'): Promise<void> {
	const slider = runtime(page).getByRole('slider', { name: 'Journey event', exact: true });
	const last = Number(await slider.getAttribute('max'));
	const next = value === 'last' ? last : value;
	await slider.evaluate((element, target) => {
		const input = element as HTMLInputElement;
		input.value = String(target);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, next);
	await expect(runtime(page)).toHaveAttribute('data-step', String(next));
}

test('the article, sources and captured poster are readable without JavaScript', async ({
	browser,
	baseURL,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html.match(/<h1(?=\s|>)/gu)).toHaveLength(1);
	expect(html).toContain(posterPath);
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		serviceWorkers: 'block'
	});
	try {
		const page = await context.newPage();
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
			'The Patient Between the Systems.'
		);
		await expect(laboratory(page).locator(`img[src="${posterPath}"]`)).toBeVisible();
		await expect(page.locator('article')).toContainText('Asha');
		await expect(page.locator('article a[href*="guides.ohie.org"]').first()).toBeVisible();
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

test('the Healthcare gallery filter opens the canonical visualization', async ({ page }) => {
	await page.goto('/blog/visualizations', { waitUntil: 'domcontentloaded' });
	const filter = page.getByRole('button', { name: 'Healthcare', exact: true });
	await filter.click();
	await expect(filter).toHaveAttribute('aria-pressed', 'true');
	const card = page.locator(`a[href="${articlePath}"]`).filter({
		has: page.getByRole('heading', { name: 'The Patient Between the Systems', exact: true })
	});
	await expect(card).toBeVisible();
	await expect(card).toContainText('Healthcare');
	await expect(card.locator('img')).toHaveAttribute('src', posterPath);
	await card.click();
	await expect(page).toHaveURL(new RegExp(`${articlePath}$`, 'u'));
	await laboratory(page).scrollIntoViewIfNeeded();
	await expect(runtime(page)).toBeVisible({ timeout: 60_000 });
});

test('each scenario reaches its model outcome, and recoverable failures reach a valid result', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await ready(page);
	const expected = {
		success: 'success',
		ambiguous: 'blocked',
		terminology: 'blocked',
		denied: 'denied',
		outage: 'unavailable',
		duplicate: 'success'
	};
	for (const [scenario, status] of Object.entries(expected)) {
		await runtime(page).getByLabel('Scenario', { exact: true }).selectOption(scenario);
		await expect(runtime(page)).toHaveAttribute('data-scenario', scenario);
		await journey(page, 'last');
		await expect(runtime(page)).toHaveAttribute('data-status', status);
		if (scenario === 'duplicate') {
			const downloading = page.waitForEvent('download');
			await runtime(page)
				.getByRole('button', { name: 'Download exchange receipt', exact: true })
				.click();
			expect((await receipt(await downloading)).snapshot).toMatchObject({
				duplicateCount: 1,
				persistedCount: 2
			});
		}
		if (scenario === 'denied') {
			await runtime(page).getByRole('button', { name: 'Architect', exact: true }).click();
			await expect(runtime(page).locator('[data-ohie-response]')).toHaveText('null');
		}
		if (['ambiguous', 'terminology', 'denied', 'outage'].includes(scenario)) {
			await runtime(page).getByRole('button', { name: 'Resolve and retry', exact: true }).click();
			await journey(page, 'last');
			await expect(runtime(page)).toHaveAttribute('data-status', 'success');
		}
	}
	expect(errors).toEqual([]);
});

test('stepping, reset, lenses and component inspection preserve a coherent model snapshot', async ({
	page
}) => {
	await ready(page);
	await expect(runtime(page)).toHaveAttribute('data-step', '0');
	const next = runtime(page).getByRole('button', { name: 'Next event', exact: true });
	await next.focus();
	await next.press('Enter');
	await expect(runtime(page)).toHaveAttribute('data-step', '1');
	await runtime(page).getByRole('button', { name: 'Previous event', exact: true }).click();
	await expect(runtime(page)).toHaveAttribute('data-step', '0');
	await journey(page, 7);
	for (const lens of ['Patient', 'Clinician', 'Architect']) {
		const button = runtime(page).getByRole('button', { name: lens, exact: true });
		await button.click();
		await expect(button).toHaveAttribute('aria-pressed', 'true');
		await expect(runtime(page)).toHaveAttribute('data-step', '7');
	}
	for (const component of COMPONENTS) {
		await runtime(page).getByRole('button', { name: component.title, exact: true }).click();
		await expect(runtime(page)).toContainText(component.role);
		await expect(runtime(page)).toHaveAttribute('data-step', '7');
	}
	await runtime(page).getByRole('button', { name: 'Explore', exact: true }).click();
	await expect(runtime(page).getByRole('button', { name: 'Explore', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await runtime(page).getByRole('button', { name: 'Guided', exact: true }).click();
	await runtime(page).getByRole('button', { name: 'Reset', exact: true }).click();
	await expect(runtime(page)).toHaveAttribute('data-step', '0');
});

test('recovery resolves one failed prerequisite while preserving a separate access denial', async ({
	page
}) => {
	await ready(page);
	await runtime(page).getByRole('button', { name: 'Explore', exact: true }).click();
	const identity = runtime(page).getByRole('checkbox', { name: /^Identity link confirmed/u });
	const access = runtime(page).getByRole('checkbox', { name: /^Hospital B may read/u });
	await identity.uncheck();
	await access.uncheck();
	await journey(page, 'last');
	await expect(runtime(page)).toHaveAttribute('data-status', 'blocked');
	await runtime(page).getByRole('button', { name: 'Resolve and retry', exact: true }).click();
	await expect(identity).toBeChecked();
	await expect(access).not.toBeChecked();
	await journey(page, 'last');
	await expect(runtime(page)).toHaveAttribute('data-status', 'denied');
	await runtime(page).getByRole('button', { name: 'Resolve and retry', exact: true }).click();
	await expect(access).toBeChecked();
	await journey(page, 'last');
	await expect(runtime(page)).toHaveAttribute('data-status', 'success');
});

test('guided playback advances the same event sequence and pauses without losing position', async ({
	page
}) => {
	await ready(page);
	await runtime(page).getByRole('button', { name: 'Start guided tour', exact: true }).click();
	await expect
		.poll(async () => Number(await runtime(page).getAttribute('data-step')))
		.toBeGreaterThan(0);
	await runtime(page).getByRole('button', { name: 'Pause', exact: true }).click();
	const step = await runtime(page).getAttribute('data-step');
	await expect(runtime(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	await page.waitForTimeout(1500);
	await expect(runtime(page)).toHaveAttribute('data-step', step!);
});

test('the downloaded receipt and replay reproduce the selected synthetic snapshot', async ({
	page
}) => {
	await ready(page);
	await runtime(page).getByLabel('Scenario', { exact: true }).selectOption('denied');
	await journey(page, 'last');
	const downloading = page.waitForEvent('download');
	await runtime(page)
		.getByRole('button', { name: 'Download exchange receipt', exact: true })
		.click();
	const exported = await receipt(await downloading);
	expect(exported).toMatchObject({
		version: 1,
		model: MODEL_VERSION,
		scenario: 'denied',
		settings: { authorized: false },
		snapshot: { status: 'denied', payload: null, returnedEvents: [] }
	});
	expect(exported.step).toBe(Number(await runtime(page).getAttribute('data-step')));
	await runtime(page).getByRole('button', { name: 'Copy replay link', exact: true }).click();
	const replay = page.url();
	expect(new URL(replay).searchParams.get('ohie_s')).toBe('denied');
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await ready(page, replay);
	await expect(runtime(page)).toHaveAttribute('data-status', 'denied');
	await expect(runtime(page)).toHaveAttribute('data-step', String(exported.step));
	const downloadingReplay = page.waitForEvent('download');
	await runtime(page)
		.getByRole('button', { name: 'Download exchange receipt', exact: true })
		.click();
	expect(await receipt(await downloadingReplay)).toEqual(exported);
});

test('mobile reduced-motion mode stays in the viewport and retains explicit event controls', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
		reducedMotion: 'reduce',
		serviceWorkers: 'block'
	});
	try {
		const page = await context.newPage();
		await ready(page);
		await expect(runtime(page).getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
		await runtime(page).getByRole('button', { name: 'Next event', exact: true }).tap();
		await expect(runtime(page)).toHaveAttribute('data-step', '1');
		await journey(page, 'last');
		await expect(runtime(page)).toHaveAttribute('data-status', 'success');
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
			true
		);
		await page.screenshot({ path: 'artifacts/openhie/mobile-result.png' });
		await page.evaluate(() => document.documentElement.style.setProperty('font-size', '125%'));
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
			true
		);
	} finally {
		await context.close();
	}
});

test('narration retains the authored prose while interactive experiments remain excluded', async ({
	browser,
	page,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		serviceWorkers: 'block'
	});
	try {
		const source = await context.newPage();
		await source.goto(articlePath, { waitUntil: 'domcontentloaded' });
		expect(await laboratory(source).getAttribute('data-tts-exclude')).not.toBeNull();
		const transcript = await source.evaluate(extractNarration, undefined);
		expect(transcript).toContain('Asha');
		await ready(page);
		expect(await page.evaluate(extractNarration, undefined)).toBe(transcript);
		await journey(page, 'last');
		await runtime(page).getByRole('button', { name: 'Architect', exact: true }).click();
		await runtime(page).getByLabel('Scenario', { exact: true }).selectOption('denied');
		await journey(page, 'last');
		expect(await page.evaluate(extractNarration, undefined)).toBe(transcript);
	} finally {
		await context.close();
	}
});
