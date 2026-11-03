import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { stations } from '../src/lib/visualizations/calcutta-radio/stations.ts';

const origin = process.env.RADIO_BASE_URL || 'http://127.0.0.1:4338';
const live = process.argv.includes('--live');
const forceHls = process.argv.includes('--hls-js');
if (!live && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname))
	throw new Error('Use a loopback production preview, or --live for the bounded release check.');
const browser = await chromium.launch({
	channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
	headless: true
});
const report = {
	origin,
	checkedAt: new Date().toISOString(),
	browser: 'Chrome on Windows',
	playbackMode: forceHls ? 'hls.js fallback' : 'browser preferred',
	stations: [],
	errors: [],
	cspViolations: []
};
await mkdir('test-results/calcutta-radio', { recursive: true });
try {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1100 },
		serviceWorkers: 'block',
		reducedMotion: 'reduce'
	});
	const page = await context.newPage();
	page.on('pageerror', (error) => report.errors.push(error.message));
	await page.addInitScript(() => {
		window.__radioCsp = [];
		document.addEventListener('securitypolicyviolation', (event) => {
			window.__radioCsp.push({ directive: event.violatedDirective, blocked: event.blockedURI });
		});
	});
	if (forceHls)
		await page.addInitScript(() => {
			const nativeCanPlay = HTMLMediaElement.prototype.canPlayType;
			HTMLMediaElement.prototype.canPlayType = function (type) {
				return /mpegurl/i.test(type) ? '' : nativeCanPlay.call(this, type);
			};
		});
	const providerRequests = [];
	page.on('request', (request) => {
		const url = request.url();
		if (stations.some((station) => url.startsWith(new URL(station.streamUrl).origin)))
			providerRequests.push(url);
	});
	const response = await page.goto(`${origin}/blog/visualizations/calcutta-radio`, {
		waitUntil: 'domcontentloaded',
		timeout: 120_000
	});
	expect(response?.ok()).toBe(true);
	const app = page.getByTestId('calcutta-radio');
	await expect(app.getByTestId('radio-play')).toBeEnabled({ timeout: 120_000 });
	await expect(page.locator('audio[data-calcutta-radio-audio]')).toHaveCount(0);
	expect(providerRequests).toHaveLength(0);
	const selected = forceHls
		? [stations[0], stations.find((station) => station.id === 'vividh-bharati-national')].filter(
				Boolean
			)
		: live
			? [stations[0], stations.find((station) => station.streamType === 'audio')].filter(Boolean)
			: stations;
	for (const station of selected) {
		await app.locator(`[data-station="${station.id}"]`).click();
		try {
			await expect(app.getByRole('status')).toHaveText('Playing live', { timeout: 30_000 });
			await page.waitForFunction(
				() => {
					const audio = document.querySelector('audio[data-calcutta-radio-audio]');
					return audio && !audio.paused && audio.readyState >= 2 && audio.currentTime > 0.5;
				},
				undefined,
				{ timeout: 20_000 }
			);
			const first = await page.locator('audio[data-calcutta-radio-audio]').evaluate((audio) => ({
				time: audio.currentTime,
				decodedBytes: audio.webkitAudioDecodedByteCount ?? null,
				readyState: audio.readyState
			}));
			const advance = station.id === 'vividh-bharati-kolkata' ? 26 : 2;
			await page.waitForFunction(
				({ time, advance }) => {
					const audio = document.querySelector('audio[data-calcutta-radio-audio]');
					return audio && audio.currentTime > time + advance && !audio.paused;
				},
				{ time: first.time, advance },
				{ timeout: (advance + 12) * 1000 }
			);
			const last = await page.locator('audio[data-calcutta-radio-audio]').evaluate((audio) => ({
				time: audio.currentTime,
				decodedBytes: audio.webkitAudioDecodedByteCount ?? null,
				readyState: audio.readyState
			}));
			expect(last.time).toBeGreaterThan(first.time + advance);
			if (last.decodedBytes !== null) expect(last.decodedBytes).toBeGreaterThan(0);
			report.stations.push({ id: station.id, name: station.name, passed: true, first, last });
			console.log(
				`PLAYED ${station.name}: ${(last.time - first.time).toFixed(1)} seconds advanced; ${last.decodedBytes} decoded bytes`
			);
		} catch (error) {
			report.stations.push({
				id: station.id,
				name: station.name,
				passed: false,
				error: error.message,
				status: await app.getByRole('status').textContent()
			});
			console.log(`FAILED ${station.name}: ${error.message.split('\n')[0]}`);
		}
		if (await app.getByRole('button', { name: 'Stop radio', exact: true }).count())
			await app.getByRole('button', { name: 'Stop radio', exact: true }).click();
		await expect(page.locator('audio[data-calcutta-radio-audio]')).toHaveCount(0);
	}
	report.cspViolations = await page.evaluate(() => window.__radioCsp);
	const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
	expect(canonical).toBe('https://www.suvroghosh.in/blog/visualizations/calcutta-radio');
	if (
		report.stations.some((station) => !station.passed) ||
		report.errors.length ||
		report.cspViolations.length
	)
		process.exitCode = 1;
} catch (error) {
	report.errors.push(error.message);
	process.exitCode = 1;
	console.error(error.message);
} finally {
	await writeFile(
		`test-results/calcutta-radio/${live ? 'live' : 'preview'}${forceHls ? '-hls' : ''}-playback.json`,
		JSON.stringify(report, null, 2)
	);
	await browser.close();
}
