import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const storageKey = 'suvroghosh:consent';
const lifetime = 180 * 24 * 60 * 60 * 1000;
const artifactDirectory = path.resolve('.codex-artifacts/privacy');
const optionalPattern =
	/youtube|ytimg|googlevideo|vercel-insights|vitals\.vercel|\/_vercel\/|\/api\/analytics\/pageview/;

async function guardNetwork(context: BrowserContext, baseURL: string) {
	const optionalRequests: string[] = [];
	await context.route('**/*', (route) => {
		const url = route.request().url();
		if (optionalPattern.test(url)) optionalRequests.push(url);
		return new URL(url).origin === new URL(baseURL).origin ? route.continue() : route.abort();
	});
	return optionalRequests;
}

async function savedChoice(page: Page) {
	return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'), storageKey);
}

async function openFromFooter(page: Page) {
	await page.getByRole('button', { name: 'Privacy & cookies', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
}

test('first visit stays readable and non-modal, with equal choices and no optional traffic', async ({
	page,
	context,
	baseURL
}) => {
	const requests = await guardNetwork(context, baseURL!);
	await page.goto('/privacy');
	const note = page.locator('[data-privacy-note]');
	await expect(note).toBeVisible();
	await expect(page.getByRole('dialog')).not.toBeVisible();
	expect(await note.evaluate((element) => element.contains(document.activeElement))).toBe(false);
	await expect(page.locator('main')).not.toHaveAttribute('inert', '');
	const reject = note.getByRole('button', { name: 'Reject optional', exact: true });
	const accept = note.getByRole('button', { name: 'Accept optional', exact: true });
	const rejectBox = await reject.boundingBox();
	const acceptBox = await accept.boundingBox();
	expect(rejectBox!.height).toBeGreaterThanOrEqual(44);
	expect(acceptBox!.width).toBeCloseTo(rejectBox!.width, 0);
	expect(await reject.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe(
		await accept.evaluate((button) => getComputedStyle(button).backgroundColor)
	);
	expect(await savedChoice(page)).toBeNull();
	const accessibility = await new AxeBuilder({ page }).include('[data-privacy-note]').analyze();
	expect(accessibility.violations).toEqual([]);
	await page.getByRole('heading', { name: 'Your choices come first' }).scrollIntoViewIfNeeded();
	await expect(note).toBeVisible();
	expect(await savedChoice(page)).toBeNull();
	expect(requests).toEqual([]);
});

test('reject, reopen, edit, Escape, save, reload and cross-tab withdrawal preserve the committed choice', async ({
	page,
	context,
	baseURL
}) => {
	const requests = await guardNetwork(context, baseURL!);
	await page.goto('/privacy');
	await page
		.locator('[data-privacy-note]')
		.getByRole('button', { name: 'Reject optional', exact: true })
		.click();
	await expect(page.locator('[data-privacy-note]')).toHaveCount(0);
	const rejection = await savedChoice(page);
	expect(rejection).toMatchObject({ v: 1, analytics: false, media: false });
	expect(rejection.expiresAt - rejection.savedAt).toBe(lifetime);
	await openFromFooter(page);
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('switch', { name: /Audience/ })).not.toBeChecked();
	await dialog.getByRole('switch', { name: /Audience/ }).check();
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();
	await expect(page.getByRole('button', { name: 'Privacy & cookies', exact: true })).toBeFocused();
	expect(await savedChoice(page)).toEqual(rejection);
	await openFromFooter(page);
	await expect(dialog.getByRole('switch', { name: /Audience/ })).not.toBeChecked();
	await dialog.getByRole('switch', { name: /Audience/ }).check();
	await dialog.getByRole('button', { name: 'Save preferences' }).click();
	expect(await savedChoice(page)).toMatchObject({ analytics: true, media: false });
	await page.reload();
	await expect(page.locator('[data-privacy-note]')).toHaveCount(0);
	const second = await context.newPage();
	await second.goto('/privacy');
	await openFromFooter(second);
	await second
		.getByRole('dialog')
		.getByRole('button', { name: 'Reject optional', exact: true })
		.click();
	await openFromFooter(page);
	await expect(dialog.getByRole('switch', { name: /Audience/ })).not.toBeChecked();
	await page.keyboard.press('Escape');
	await second.evaluate((key) => localStorage.removeItem(key), storageKey);
	await expect(page.locator('[data-privacy-note]')).toBeVisible();
	await second.close();
	// These browsers are deliberately excluded by both local-origin and webdriver rules.
	// Positive, otherwise eligible consent/network behaviour is covered by the client integration suite.
	expect(requests).toEqual([]);
});

test('first-visit dialog traps focus, Escape restores its opener, and unsaved choices do not persist', async ({
	page,
	context,
	baseURL
}) => {
	await guardNetwork(context, baseURL!);
	await page.goto('/privacy');
	const choose = page
		.locator('[data-privacy-note]')
		.getByRole('button', { name: /Choose settings/ });
	await choose.click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('heading', { name: 'Your visit. Your choices.' })).toBeFocused();
	await expect(dialog.getByRole('switch')).toHaveCount(2);
	await dialog.getByRole('switch', { name: /External media/ }).check();
	for (let i = 0; i < 12; i++) {
		await page.keyboard.press('Tab');
		expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
	}
	await page.keyboard.press('Escape');
	await expect(choose).toBeFocused();
	expect(await savedChoice(page)).toBeNull();
	await choose.click();
	await expect(dialog.getByRole('switch', { name: /External media/ })).not.toBeChecked();
	const accessibility = await new AxeBuilder({ page }).include('.privacy-dialog').analyze();
	expect(accessibility.violations).toEqual([]);
});

test('invalid and expired preference records fail closed', async ({ page, context, baseURL }) => {
	await guardNetwork(context, baseURL!);
	await page.addInitScript(
		({ storageKey, lifetime }) => {
			const savedAt = Date.now() - lifetime - 1000;
			localStorage.setItem(
				storageKey,
				JSON.stringify({
					v: 1,
					analytics: true,
					media: true,
					savedAt,
					expiresAt: savedAt + lifetime
				})
			);
		},
		{ storageKey, lifetime }
	);
	await page.goto('/privacy');
	await expect(page.locator('[data-privacy-note]')).toBeVisible();
	await page.evaluate((key) => localStorage.setItem(key, '{malformed'), storageKey);
	await page.getByRole('button', { name: 'Change privacy preferences' }).click();
	await expect(
		page.getByRole('dialog').getByRole('switch', { name: /Audience/ })
	).not.toBeChecked();
	await expect(
		page.getByRole('dialog').getByRole('switch', { name: /External media/ })
	).not.toBeChecked();
});

test('blocked storage keeps a visit-only choice and a truthful explanation without optional traffic', async ({
	page,
	context,
	baseURL
}) => {
	const requests = await guardNetwork(context, baseURL!);
	await page.addInitScript(() => {
		Object.defineProperty(window, 'localStorage', {
			configurable: true,
			get() {
				throw new DOMException('Storage blocked', 'SecurityError');
			}
		});
	});
	await page.goto('/privacy');
	await page
		.locator('[data-privacy-note]')
		.getByRole('button', { name: 'Accept optional', exact: true })
		.click();
	await expect(page.getByRole('status')).toContainText('could not save these choices');
	await expect(page.locator('[data-privacy-note]')).toHaveCount(0);
	await openFromFooter(page);
	await expect(page.getByRole('dialog').getByRole('switch', { name: /Audience/ })).toBeChecked();
	await page.keyboard.press('Escape');
	await page.reload();
	await expect(page.locator('[data-privacy-note]')).toBeVisible();
	expect(requests).toEqual([]);
});

test('YouTube is blocked by default, one-time loading is explicit, and rejection unloads it', async ({
	page,
	context,
	baseURL
}) => {
	const requests = await guardNetwork(context, baseURL!);
	await page.goto('/resume');
	await expect(page.getByRole('button', { name: /^Load YouTube video:/ })).toHaveCount(3);
	await expect(page.locator('iframe[src*="youtube"]')).toHaveCount(0);
	expect(requests).toEqual([]);
	const first = page.getByRole('button', { name: /^Load YouTube video:/ }).first();
	await first.focus();
	await first.press('Enter');
	const player = page.locator('iframe[src*="youtube"]');
	await expect(player).toHaveCount(1);
	await expect(player).toBeFocused();
	expect(await savedChoice(page)).toBeNull();
	await page
		.locator('[data-privacy-note]')
		.getByRole('button', { name: 'Reject optional', exact: true })
		.click();
	await expect(player).toHaveCount(0);
	await openFromFooter(page);
	await page
		.getByRole('dialog')
		.getByRole('switch', { name: /External media/ })
		.check();
	await page.getByRole('dialog').getByRole('button', { name: 'Save preferences' }).click();
	// Résumé explicitly opts into clickToPlay, so even remembered media needs activation.
	await expect(player).toHaveCount(0);
	await page
		.getByRole('button', { name: /^Load YouTube video:/ })
		.first()
		.click();
	await expect(player).toHaveCount(1);
	await openFromFooter(page);
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Reject optional', exact: true })
		.click();
	await expect(player).toHaveCount(0);
	await expect(page.getByRole('link', { name: '(Watch on YouTube)', exact: true })).toHaveCount(3);
	expect(requests.some((url) => /youtube/.test(url))).toBe(true);
});

test('remembered media permission loads a standard article player and withdrawal removes it', async ({
	page,
	context,
	baseURL
}) => {
	await guardNetwork(context, baseURL!);
	await page.goto('/blog/artificial-intelligence/agentic-ai-and-the-asymmetry-of-will');
	await expect(page.getByRole('button', { name: /^Load YouTube video:/ })).toHaveCount(1);
	await page
		.locator('[data-privacy-note]')
		.getByRole('button', { name: /Choose settings/ })
		.click();
	await page
		.getByRole('dialog')
		.getByRole('switch', { name: /External media/ })
		.check();
	await page.getByRole('dialog').getByRole('button', { name: 'Save preferences' }).click();
	await expect(page.locator('iframe[src*="youtube"]')).toHaveCount(1);
	await openFromFooter(page);
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Reject optional', exact: true })
		.click();
	await expect(page.locator('iframe[src*="youtube"]')).toHaveCount(0);
});

test('unauthenticated dashboard and export never return analytics data and stay private', async ({
	request
}) => {
	for (const route of ['/notes/studio/analytics', '/notes/studio/analytics/export']) {
		const response = await request.get(route, { maxRedirects: 0 });
		expect([303, 401, 503]).toContain(response.status());
		expect(response.headers()['cache-control']).toMatch(/private.*no-store/);
		expect(response.headers()['x-robots-tag']).toMatch(/noindex/);
		if (response.status() === 303)
			expect(response.headers().location).toMatch(/^\/notes\/sign-in\?returnTo=/);
		expect(await response.text()).not.toMatch(
			/Recorded page views|fieldbook-\d{4}|site_analytics_daily/
		);
	}
});

for (const theme of ['paper', 'light', 'night', 'high-contrast']) {
	for (const mobile of [false, true]) {
		test(`privacy visual and keyboard review: ${theme}, ${mobile ? 'mobile' : 'desktop'}`, async ({
			page,
			context,
			baseURL
		}) => {
			await guardNetwork(context, baseURL!);
			await page.emulateMedia({ reducedMotion: 'reduce' });
			if (mobile) await page.setViewportSize({ width: 390, height: 844 });
			await page.addInitScript((theme) => {
				localStorage.setItem('site-theme', theme);
				localStorage.setItem('site-motion', 'still');
			}, theme);
			await page.goto('/privacy');
			await expect(page.locator('[data-privacy-note]')).toBeVisible();
			await page.evaluate(() => document.fonts.ready);
			await mkdir(artifactDirectory, { recursive: true });
			const name = `${theme}-${mobile ? 'mobile' : 'desktop'}`;
			await page.screenshot({ path: path.join(artifactDirectory, `note-${name}.png`) });
			await page
				.locator('[data-privacy-note]')
				.getByRole('button', { name: /Choose settings/ })
				.click();
			const dialog = page.getByRole('dialog');
			await expect(dialog).toBeVisible();
			await dialog.getByRole('switch', { name: /Audience/ }).check();
			await page.screenshot({ path: path.join(artifactDirectory, `settings-${name}.png`) });
			expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
				true
			);
			const box = await dialog.boundingBox();
			expect(box!.x).toBeGreaterThanOrEqual(0);
			expect(box!.x + box!.width).toBeLessThanOrEqual(mobile ? 391 : 1441);
			await expect(dialog.getByRole('button', { name: 'Save preferences' })).toBeInViewport();
			await page.keyboard.press('Escape');
			if (mobile) {
				await page.setViewportSize({ width: 390, height: 844 });
				await page.evaluate(() => {
					document.documentElement.style.fontSize = '200%';
				});
				await page
					.locator('[data-privacy-note]')
					.getByRole('button', { name: /Choose settings/ })
					.click();
				expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
					true
				);
				await dialog.getByRole('button', { name: 'Save preferences' }).scrollIntoViewIfNeeded();
				await expect(dialog.getByRole('button', { name: 'Save preferences' })).toBeInViewport();
			}
		});
	}
}
