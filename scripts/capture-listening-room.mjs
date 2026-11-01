import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const origin = process.env.LISTENING_ROOM_BASE_URL || 'http://127.0.0.1:4337';
const reviewOnly = process.argv.includes('--review-only');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) {
	throw new Error('Capture against a loopback preview only.');
}
const review = path.resolve('test-results/listening-room');
const images = path.resolve('static/images/visualizations/listening-room');
await mkdir(review, { recursive: true });
await mkdir(images, { recursive: true });
const browser = await chromium.launch({
	channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
	headless: true
});
try {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1100 },
		serviceWorkers: 'block',
		reducedMotion: 'reduce',
		deviceScaleFactor: 1
	});
	await context.addInitScript(() => {
		const now = Date.now();
		localStorage.setItem(
			'suvroghosh:consent',
			JSON.stringify({
				v: 2,
				media: false,
				savedAt: now,
				expiresAt: now + 180 * 24 * 60 * 60 * 1000
			})
		);
	});
	await context.route('**/*', (route) => {
		const url = new URL(route.request().url());
		return url.origin === new URL(origin).origin || !['http:', 'https:'].includes(url.protocol)
			? route.continue()
			: route.abort('blockedbyclient');
	});
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${origin}/blog/visualizations/listening-room`, { timeout: 120_000 });
	const app = page.getByTestId('listening-room');
	await app.waitFor();
	await expect(app.getByRole('button', { name: 'Load', exact: true })).toBeEnabled({
		timeout: 120_000
	});
	await page.evaluate(() => document.fonts.ready);
	await page.addStyleTag({ content: '.site-header{visibility:hidden!important}' });
	await app.screenshot({ path: path.join(review, 'desktop.png'), animations: 'disabled' });
	// A direct crop of the actual app, with no fabricated controls or audio data.
	await page.setViewportSize({ width: 1440, height: 1100 });
	const bounds = await app.boundingBox();
	if (!bounds) throw new Error('App bounds unavailable.');
	if (!reviewOnly)
		await page.screenshot({
			path: path.join(images, 'social.png'),
			clip: {
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: Math.min(bounds.height, Math.round((bounds.width * 630) / 1200))
			},
			animations: 'disabled'
		});
	await app.getByRole('button', { name: 'Audio file', exact: true }).click();
	await app.getByRole('button', { name: 'Try the sample', exact: false }).click();
	await page.waitForFunction(() => {
		const audio = document.querySelector('audio');
		return audio && !audio.paused && audio.currentTime > 1;
	});
	await app.getByRole('button', { name: 'Equaliser & fine adjustments', exact: false }).click();
	await app.screenshot({ path: path.join(review, 'audio-controls.png'), animations: 'disabled' });
	await app.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.setViewportSize({ width: 390, height: 844 });
	await app.screenshot({ path: path.join(review, 'mobile-audio.png'), animations: 'disabled' });
	await app.getByRole('button', { name: 'YouTube', exact: true }).click();
	await app.screenshot({ path: path.join(review, 'mobile.png'), animations: 'disabled' });
	if (errors.length) throw new Error(errors.join('\n'));
	console.log(
		JSON.stringify({
			review,
			social: path.join(images, 'social.png'),
			browserErrors: errors.length
		})
	);
} finally {
	await browser.close();
}
