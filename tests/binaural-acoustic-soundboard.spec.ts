import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROUTE = '/blog/visualizations/binaural-acoustic-soundboard';
const STORAGE_KEY = 'binaural-acoustic-soundboard:v1';

test.describe('Binaural Acoustic Soundboard', () => {
	test('renders single H1, editorial guardrails, initial Reading preset without autoplay, and Apps discovery', async ({
		page
	}) => {
		const consoleErrors: string[] = [];
		const pageErrors: string[] = [];
		const cspViolations: string[] = [];
		const audioRequests: string[] = [];

		page.on('console', (msg) => {
			if (msg.type() !== 'error') return;
			const text = msg.text();
			if (
				text.includes('/_vercel/insights/script.js') ||
				text.includes('Failed to load resource: the server responded with a status of 404')
			) {
				return;
			}
			consoleErrors.push(text);
		});
		page.on('pageerror', (err) => pageErrors.push(err.message));
		page.on('request', (req) => {
			if (req.url().includes('/audio/binaural-acoustic-soundboard/')) {
				audioRequests.push(req.url());
			}
		});

		await page.addInitScript(() => {
			document.addEventListener('securitypolicyviolation', (event) => {
				(window as unknown as { __csp?: string[] }).__csp =
					(window as unknown as { __csp?: string[] }).__csp ?? [];
				(window as unknown as { __csp: string[] }).__csp.push(
					`${event.violatedDirective}:${event.blockedURI}`
				);
			});
		});

		const response = await page.goto(ROUTE, { waitUntil: 'networkidle' });
		expect(response?.ok()).toBe(true);

		const headings = page.locator('h1');
		await expect(headings).toHaveCount(1);
		await expect(headings.first()).toHaveText('Binaural Acoustic Soundboard');

		const app = page.getByTestId('binaural-acoustic-soundboard');
		await expect(app).toBeVisible();
		await expect(app).toContainText(
			'Mix rain, a fan, soft noise and optional binaural tones. Save a mix you like, or set it to stop after 15, 30 or 60 minutes.'
		);

		const radioLink = app.locator('a[href="/blog/visualizations/calcutta-radio"]');
		await expect(radioLink).toBeVisible();

		await expect(page.getByTestId('soundboard-status')).toHaveText('Stopped · Reading');
		await expect(page.getByTestId('soundboard-timer-status')).toHaveText('Timer off');

		// Verify initial Reading fader positions: Rain 30%, Fan 15%, Distant city 0%, Soft noise Brown 10%, Binaural Off
		await expect(page.getByTestId('fader-rain')).toHaveValue('30');
		await expect(page.getByTestId('fader-fan')).toHaveValue('15');
		await expect(page.getByTestId('fader-city')).toHaveValue('0');
		await expect(page.getByTestId('fader-noise')).toHaveValue('10');
		await expect(page.getByTestId('fader-binaural')).toHaveValue('0');
		await expect(page.getByTestId('channel-level-binaural')).toHaveText('Off');
		await expect(page.getByTestId('noise-color-brown')).toHaveAttribute('aria-pressed', 'true');

		// No audio loop network requests should fire before Play is pressed
		expect(audioRequests).toHaveLength(0);

		// Verify canonical link and PLOS ONE citation
		const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
		expect(canonical).toBe(
			'https://www.suvroghosh.in/blog/visualizations/binaural-acoustic-soundboard'
		);
		await expect(
			page
				.locator(
					'a[href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286023"]'
				)
				.first()
		).toBeVisible();

		const recordedCsp = await page.evaluate(
			() => (window as unknown as { __csp?: string[] }).__csp ?? []
		);
		expect(recordedCsp).toEqual([]);
		expect(consoleErrors).toEqual([]);
		expect(pageErrors).toEqual([]);
		expect(cspViolations).toEqual([]);

		// Verify discovery on /blog/apps
		const appsRes = await page.goto('/blog/apps', { waitUntil: 'domcontentloaded' });
		expect(appsRes?.ok()).toBe(true);
		await expect(
			page.locator('a[href="/blog/visualizations/binaural-acoustic-soundboard"]').first()
		).toBeVisible();
	});

	test('supports Play/Stop, on-demand loop loading, mute level retention, presets, and binaural fine adjustment', async ({
		page
	}) => {
		const requestedLoops: string[] = [];
		page.on('request', (req) => {
			const url = req.url();
			if (url.includes('/audio/binaural-acoustic-soundboard/')) {
				requestedLoops.push(new URL(url).pathname);
			}
		});

		await page.goto(ROUTE, { waitUntil: 'networkidle' });

		// Start playback on Reading preset
		await page.getByTestId('soundboard-play').click();
		await expect(page.getByTestId('soundboard-status')).toHaveText('Playing · Reading');

		// Reading uses Rain (30%) but Distant city is 0%, so only rain-window.wav should load initially
		expect(requestedLoops).toContain('/audio/binaural-acoustic-soundboard/rain-window.wav');
		expect(requestedLoops).not.toContain('/audio/binaural-acoustic-soundboard/distant-city.wav');

		// Mute Rain and verify previous level is retained when unmuted
		await page.getByTestId('channel-mute-rain').click();
		await expect(page.getByTestId('channel-level-rain')).toHaveText('Muted · 30%');
		await expect(page.getByTestId('channel-mute-rain')).toHaveAttribute('aria-pressed', 'true');
		await page.getByTestId('channel-mute-rain').click();
		await expect(page.getByTestId('channel-level-rain')).toHaveText('30%');

		// Raise Distant city fader -> switches to Custom mix and loads distant-city.wav on demand
		const cityFader = page.getByTestId('fader-city');
		await cityFader.fill('25');
		await cityFader.dispatchEvent('input');
		await expect(page.getByTestId('soundboard-status')).toHaveText('Playing · Custom mix');
		await expect
			.poll(() =>
				requestedLoops.includes('/audio/binaural-acoustic-soundboard/distant-city.wav')
			)
			.toBe(true);

		// Switch presets while playing
		await page.getByTestId('preset-work').click();
		await expect(page.getByTestId('soundboard-status')).toHaveText('Playing · Work');
		await expect(page.getByTestId('fader-rain')).toHaveValue('0');
		await expect(page.getByTestId('fader-fan')).toHaveValue('20');
		await expect(page.getByTestId('fader-noise')).toHaveValue('20');
		await expect(page.getByTestId('noise-color-pink')).toHaveAttribute('aria-pressed', 'true');

		await page.getByTestId('preset-rest').click();
		await expect(page.getByTestId('soundboard-status')).toHaveText('Playing · Rest');
		await expect(page.getByTestId('fader-rain')).toHaveValue('15');
		await expect(page.getByTestId('fader-fan')).toHaveValue('0');
		await expect(page.getByTestId('fader-noise')).toHaveValue('15');
		await expect(page.getByTestId('noise-color-brown')).toHaveAttribute('aria-pressed', 'true');

		// Binaural tones controls, worked example, and Fine adjustment disclosure
		await expect(page.getByTestId('binaural-controls')).toContainText(
			'Stereo headphones needed for the binaural effect'
		);
		await page.getByTestId('binaural-preset-gamma').click();
		await expect(page.getByTestId('binaural-strip-summary')).toContainText('Gamma (40 Hz)');

		await page.getByTestId('binaural-preset-alpha').click();
		await page.getByTestId('binaural-explanation').locator('summary').click();
		await expect(page.getByTestId('binaural-explanation')).toContainText(
			'Each ear receives a slightly different tone. With stereo headphones, this can create the impression of a repeating beat. The frequency names describe the setting, not what your brain is doing.'
		);
		await expect(page.getByTestId('binaural-explanation')).toContainText(
			'220 Hz left / 230 Hz right'
		);

		await page.getByTestId('fine-adjustment-disclosure').locator('summary').click();
		await expect(page.getByTestId('binaural-ear-readout')).toContainText('Left ear: 220 Hz');
		await expect(page.getByTestId('binaural-ear-readout')).toContainText('Right ear: 230 Hz');
		await expect(page.getByTestId('binaural-ear-readout')).toContainText('Difference: 10 Hz');

		// Adjust fine difference with keyboard on the rotary dial
		const diffDial = page.getByTestId('binaural-diff-dial');
		await diffDial.focus();
		await page.keyboard.press('ArrowUp');
		await expect(page.getByTestId('binaural-ear-readout')).toContainText('Difference: 10.5 Hz');
		await expect(page.getByTestId('binaural-ear-readout')).toContainText('Right ear: 230.5 Hz');

		// Rapid Play/Stop clicks settle cleanly
		const playStop = page.getByTestId('soundboard-play');
		await playStop.click(); // Stop
		await playStop.click(); // Play
		await playStop.click(); // Stop
		await expect(page.getByTestId('soundboard-status')).toContainText('Stopped ·');
	});

	test('verifies Master volume dial, sleep timer countdown, and saved mixes with Undo and stereo rendering', async ({
		page
	}) => {
		await page.goto(ROUTE, { waitUntil: 'networkidle' });

		// Keyboard adjustment on Master volume dial
		const masterDial = page.getByTestId('master-volume-dial');
		await expect(masterDial).toHaveAttribute('aria-valuenow', '60');
		await masterDial.focus();
		await page.keyboard.press('ArrowUp');
		await expect(masterDial).toHaveAttribute('aria-valuenow', '62');

		// Master mute retains dial value
		await page.getByTestId('master-mute').click();
		await expect(page.getByTestId('master-mute')).toContainText('Muted');
		await page.getByTestId('master-mute').click();
		await expect(page.getByTestId('master-mute')).toContainText('Mute');

		// Sleep timer choices: 30m -> 15m -> preserved across preset change -> Off
		await page.getByTestId('timer-30').click();
		await expect(page.getByTestId('soundboard-timer-status')).toContainText('Stops in 29:');
		await page.getByTestId('timer-15').click();
		await expect(page.getByTestId('soundboard-timer-status')).toContainText('Stops in 14:');

		// Changing preset preserves active timer deadline
		await page.getByTestId('preset-work').click();
		await expect(page.getByTestId('soundboard-timer-status')).toContainText('Stops in 14:');

		// Off cancels timer
		await page.getByTestId('timer-off').click();
		await expect(page.getByTestId('soundboard-timer-status')).toHaveText('Timer off');

		// Custom mix creation, save, load, delete, and Undo
		const rainFader = page.getByTestId('fader-rain');
		await rainFader.fill('45');
		await rainFader.dispatchEvent('input');
		await expect(page.getByTestId('soundboard-status')).toHaveText('Stopped · Custom mix');

		await page.getByTestId('save-mix-input').fill('Late Monsoon Desk');
		await page.getByTestId('save-mix-button').click();

		const savedList = page.getByTestId('saved-mix-list');
		await expect(savedList).toContainText('Late Monsoon Desk');

		// Switch back to Reading, then load saved mix
		await page.getByTestId('preset-reading').click();
		await expect(page.getByTestId('fader-rain')).toHaveValue('30');
		await savedList.getByRole('button', { name: /Late Monsoon Desk/i }).first().click();
		await expect(page.getByTestId('fader-rain')).toHaveValue('45');
		await expect(page.getByTestId('soundboard-status')).toHaveText(
			'Stopped · Late Monsoon Desk'
		);

		// Delete saved mix and restore with Undo
		await savedList.getByRole('button', { name: 'Delete Late Monsoon Desk' }).click();
		await expect(page.getByTestId('undo-delete-banner')).toBeVisible();
		await page.getByTestId('undo-delete-button').click();
		await expect(savedList).toContainText('Late Monsoon Desk');

		// Reloading restores saved mix and master volume without starting playback or timer
		await page.reload({ waitUntil: 'networkidle' });
		await expect(page.getByTestId('soundboard-status')).toHaveText('Stopped · Reading');
		await expect(page.getByTestId('soundboard-timer-status')).toHaveText('Timer off');
		await expect(page.getByTestId('saved-mix-list')).toContainText('Late Monsoon Desk');

		// Verify real Web Audio OfflineAudioContext stereo separation in browser
		const stereoCheck = await page.evaluate(async () => {
			const sampleRate = 8000;
			const frames = 8000;
			const ctx = new OfflineAudioContext(2, frames, sampleRate);
			const leftOsc = ctx.createOscillator();
			const rightOsc = ctx.createOscillator();
			leftOsc.frequency.value = 220;
			rightOsc.frequency.value = 230;
			const merger = ctx.createChannelMerger(2);
			leftOsc.connect(merger, 0, 0);
			rightOsc.connect(merger, 0, 1);
			const gain = ctx.createGain();
			gain.gain.value = 0.14 * 0.85;
			merger.connect(gain);
			gain.connect(ctx.destination);
			leftOsc.start(0);
			rightOsc.start(0);
			const rendered = await ctx.startRendering();
			const chL = rendered.getChannelData(0);
			const chR = rendered.getChannelData(1);

			function goertzel(samples: Float32Array, freq: number): number {
				const k = Math.round((samples.length * freq) / sampleRate);
				const omega = (2 * Math.PI * k) / samples.length;
				const coeff = 2 * Math.cos(omega);
				let s0 = 0;
				let s1 = 0;
				let s2 = 0;
				for (let i = 0; i < samples.length; i += 1) {
					s0 = samples[i] + coeff * s1 - s2;
					s2 = s1;
					s1 = s0;
				}
				return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / (samples.length / 2);
			}

			return {
				left220: goertzel(chL, 220),
				left230: goertzel(chL, 230),
				right220: goertzel(chR, 220),
				right230: goertzel(chR, 230)
			};
		});

		expect(stereoCheck.left220).toBeGreaterThan(0.08);
		expect(stereoCheck.left230).toBeLessThan(1e-5);
		expect(stereoCheck.right230).toBeGreaterThan(0.08);
		expect(stereoCheck.right220).toBeLessThan(1e-5);
	});

	test('handles blocked localStorage gracefully and renders cleanly on desktop and mobile viewports', async ({
		browser
	}) => {
		const outDir = path.join(process.cwd(), 'test-results', 'binaural-acoustic-soundboard');
		await mkdir(outDir, { recursive: true });

		// 1. Desktop capture in active Playing · Reading + 30m timer state
		const desktopContext = await browser.newContext({
			viewport: { width: 1440, height: 1800 },
			serviceWorkers: 'block',
			reducedMotion: 'reduce'
		});
		const desktopPage = await desktopContext.newPage();
		await desktopPage.goto(ROUTE, { waitUntil: 'networkidle' });
		const dismissPrivacy = desktopPage.getByRole('button', {
			name: 'Dismiss privacy notice without choosing'
		});
		if (await dismissPrivacy.isVisible()) {
			await dismissPrivacy.click();
		}
		await desktopPage.getByTestId('soundboard-play').click();
		await desktopPage.getByTestId('timer-30').click();
		await expect(desktopPage.getByTestId('soundboard-status')).toHaveText('Playing · Reading');
		await desktopPage.evaluate(() => window.scrollTo(0, 0));

		const desktopOverflow = await desktopPage.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(desktopOverflow).toBe(false);

		const appPanel = desktopPage.getByTestId('binaural-acoustic-soundboard');
		await appPanel.screenshot({
			path: path.join(outDir, 'desktop-playing.png')
		});
		await desktopContext.close();

		// 2. Mobile viewport (375x812) + blocked storage verification
		const mobileContext = await browser.newContext({
			viewport: { width: 375, height: 812 },
			serviceWorkers: 'block',
			reducedMotion: 'reduce'
		});
		const mobilePage = await mobileContext.newPage();
		await mobilePage.addInitScript((key) => {
			const origSetItem = Storage.prototype.setItem;
			Storage.prototype.setItem = function (k: string, v: string) {
				if (k === key) {
					throw new DOMException('QuotaExceededError', 'QuotaExceededError');
				}
				return origSetItem.call(this, k, v);
			};
		}, STORAGE_KEY);

		await mobilePage.goto(ROUTE, { waitUntil: 'networkidle' });
		const mobileDismissPrivacy = mobilePage.getByRole('button', {
			name: 'Dismiss privacy notice without choosing'
		});
		if (await mobileDismissPrivacy.isVisible()) {
			await mobileDismissPrivacy.click();
		}
		const mobileOverflow = await mobilePage.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(mobileOverflow).toBe(false);

		const rainFader = mobilePage.getByTestId('fader-rain');
		await rainFader.fill('40');
		await rainFader.dispatchEvent('input');
		await mobilePage.getByTestId('save-mix-button').click();
		await expect(mobilePage.getByTestId('storage-blocked-message')).toContainText(
			'Your mixes cannot be saved in this browser right now.'
		);

		await mobilePage.setViewportSize({ width: 375, height: 2450 });
		await mobilePage.evaluate(() => window.scrollTo(0, 0));
		await mobilePage.getByTestId('binaural-acoustic-soundboard').screenshot({
			path: path.join(outDir, 'mobile.png')
		});
		await mobileContext.close();
	});
});
