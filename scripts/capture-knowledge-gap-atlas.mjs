import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const origin = process.env.KNOWLEDGE_GAP_ATLAS_BASE_URL || 'http://127.0.0.1:4329';
const reviewOnly = process.argv.includes('--review-only');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) {
	throw new Error('Capture the atlas against a loopback development or production preview.');
}
const reviewDirectory = path.resolve('test-results/knowledge-gap-atlas');
const imageDirectory = path.resolve('static/images/visualizations/knowledge-gap-atlas');
await mkdir(reviewDirectory, { recursive: true });
await mkdir(imageDirectory, { recursive: true });
const browser = await chromium.launch({
	channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
	headless: true
});
try {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1100 },
		deviceScaleFactor: 1,
		serviceWorkers: 'block',
		reducedMotion: 'reduce'
	});
	await context.route('**/*', (route) => {
		const url = new URL(route.request().url());
		return url.origin === new URL(origin).origin || !['http:', 'https:'].includes(url.protocol)
			? route.continue()
			: route.abort('blockedbyclient');
	});
	const page = await context.newPage();
	await page.goto(new URL('/blog/visualizations/knowledge-gap-atlas', origin).href, {
		timeout: 90_000
	});
	const app = page.getByTestId('atlas-app');
	await app.waitFor({ state: 'visible' });
	const mediaChoice = page.getByRole('button', { name: 'Keep videos paused', exact: true });
	await mediaChoice.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
	if (await mediaChoice.isVisible()) await mediaChoice.click();
	const privacyConfirmation = page.getByRole('button', {
		name: 'Dismiss privacy confirmation',
		exact: true
	});
	if (await privacyConfirmation.isVisible()) await privacyConfirmation.click();
	await page.getByTestId('atlas-example-city-heat').waitFor({ state: 'visible' });
	await page.evaluate(() => document.fonts.ready);
	await app.screenshot({ path: path.join(reviewDirectory, 'landing.png'), animations: 'disabled' });
	await page.getByTestId('atlas-example-city-heat').click();
	await page.getByTestId('atlas-map').waitFor({ state: 'visible', timeout: 45_000 });
	const notification = app.getByRole('button', { name: 'Dismiss notification', exact: true });
	if (await notification.isVisible()) await notification.click();
	await page.evaluate(() => document.fonts.ready);
	await app.screenshot({ path: path.join(reviewDirectory, 'map.png'), animations: 'disabled' });
	await page.setViewportSize({ width: 1200, height: 630 });
	// The social poster is a direct 1200×630 browser capture of the real app.
	// The surrounding site's sticky navigation is hidden only in this capture.
	const compact = await page.addStyleTag({
		content: `
		.site-header { visibility: hidden !important; }
		.kga { width: 1200px !important; border: 0 !important; margin-bottom: 0 !important; }
		.kga-masthead { padding: 8px 24px !important; min-height: 46px; }
		.kga-brand-mark { font-size: 28px !important; }
		.kga-result-heading { padding: 7px 24px !important; }
		.kga .kga-project-name { font-size: 22px !important; padding: 0 !important; }
		.kga-metrics { padding: 7px 24px !important; }
		.kga-metrics b { font-size: 24px !important; }
		.kga-view-tabs button { min-height: 40px !important; padding: 6px 12px !important; }
		.kga-workspace-body { min-height: 0 !important; }
		.kga-topic-rail { flex-basis: 170px !important; padding: 8px 10px !important; }
		.kga-rail-title { padding-bottom: 6px !important; }
		.kga-topic-list button { padding: 6px 8px !important; }
		.kga-topic-list small { display: none !important; }
		.kga-map-toolbar { padding: 3px 16px !important; }
		.kga-density select { padding-top: 3px !important; padding-bottom: 3px !important; }
		.kga-map-host { height: 380px !important; min-height: 380px !important; }
		.kga-map-caption { top: 10px !important; }
		.kga-first-lead, .kga-status-strip, .kga-methodology, .kga-footer, .kga-rail-note { display: none !important; }
	`
	});
	await page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
	);
	await app.evaluate((element) => {
		window.scrollTo({
			top: Math.max(0, window.scrollY + element.getBoundingClientRect().top),
			behavior: 'instant'
		});
	});
	if (!reviewOnly)
		await page.screenshot({
			path: path.join(imageDirectory, 'social.png'),
			animations: 'disabled'
		});
	await compact.evaluate((element) => element.remove());
	await page.setViewportSize({ width: 390, height: 844 });
	// An element screenshot scrolls the app underneath the surrounding sticky
	// site header. Exclude that unrelated overlay from this app-only review image.
	await page.addStyleTag({ content: '.site-header { visibility: hidden !important; }' });
	await page.getByTestId('atlas-map').scrollIntoViewIfNeeded();
	await app.screenshot({ path: path.join(reviewDirectory, 'mobile.png'), animations: 'disabled' });
	process.stdout.write(
		`Captured landing, map and mobile review images${reviewOnly ? '.' : '; social.png is a direct 1200×630 app capture.'}\n`
	);
} finally {
	await browser.close();
}
