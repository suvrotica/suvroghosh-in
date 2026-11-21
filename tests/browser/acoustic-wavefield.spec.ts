import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const articlePath = '/blog/visualizations/the-room-that-remembers-every-clap';
const RIR_READY_TIMEOUT = 35_000;

function attachDiagnostics(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
	page.on('console', (msg) => {
		if (msg.type() !== 'error') return;
		const txt = `${msg.location().url} ${msg.text()}`;
		if (/\/_vercel\/|favicon/iu.test(txt)) return;
		errors.push(`console.error: ${msg.text()}`);
	});
	return errors;
}

async function waitForChamberReady(page: Page, path = articlePath): Promise<void> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	const dismissPrivacy = page.getByRole('button', { name: 'Keep videos paused' });
	if (await dismissPrivacy.isVisible().catch(() => false)) {
		await dismissPrivacy.click();
	}
	const chamber = page.getByTestId('acoustic-wavefield-chamber');
	await expect(chamber).toBeVisible();
	await expect(chamber.getByTestId('awc-viewport-canvas')).toBeVisible();
	// Wait for initial hydration and 1.2s worker RIR capture to finish
	await expect(chamber.getByTestId('awc-metric-t0')).not.toContainText('—', {
		timeout: RIR_READY_TIMEOUT
	});
	await expect(chamber.getByTestId('awc-metric-rt60')).not.toContainText('Computing…', {
		timeout: RIR_READY_TIMEOUT
	});
}

function parseClarityDb(text: string): number {
	const m = text.match(/([+-]?\d+(?:\.\d+)?)\s*dB/);
	if (!m) throw new Error(`Could not parse clarity from "${text}"`);
	return Number(m[1]);
}

async function assertNoShellOverflow(page: Page): Promise<void> {
	const metrics = await page.evaluate(() => {
		const docEl = document.documentElement;
		const articleShell = document.querySelector('.article-shell') as HTMLElement | null;
		const breakoutRoot = document.querySelector('.awc-breakout-root') as HTMLElement | null;
		const shell = document.querySelector('.awc-shell') as HTMLElement | null;
		return {
			docScrollW: docEl.scrollWidth,
			docClientW: docEl.clientWidth,
			artScrollW: articleShell?.scrollWidth ?? -1,
			artClientW: articleShell?.clientWidth ?? -1,
			brScrollW: breakoutRoot?.scrollWidth ?? -1,
			brClientW: breakoutRoot?.clientWidth ?? -1,
			shScrollW: shell?.scrollWidth ?? -1,
			shClientW: shell?.clientWidth ?? -1
		};
	});
	expect(metrics.docScrollW).toBeLessThanOrEqual(metrics.docClientW);
	expect(metrics.artScrollW).toBe(metrics.artClientW);
	expect(metrics.brScrollW).toBeLessThanOrEqual(metrics.brClientW);
	expect(metrics.shScrollW).toBeLessThanOrEqual(metrics.shClientW);
}

test.describe('Acoustic Wavefield Chamber', () => {
	test('renders sole H1, WebGL viewport, telemetry comparison across presets, and clean FAQ typography', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForChamberReady(page);

		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.locator('h1')).toHaveText('The Room That Remembers Every Clap');

		const chamber = page.getByTestId('acoustic-wavefield-chamber');
		const canvasBox = await chamber.getByTestId('awc-viewport-canvas').boundingBox();
		expect(canvasBox).not.toBeNull();
		expect(canvasBox!.width).toBeGreaterThan(300);
		expect(canvasBox!.height).toBeGreaterThan(200);

		// Switch to Bare Stone Bathhouse, trigger Clap, read C80
		const presetSelect = chamber.getByTestId('awc-preset-select');
		await presetSelect.selectOption('stone-bathhouse');
		await chamber.getByTestId('awc-clap-btn').click();
		await expect(chamber.getByTestId('awc-metric-rt60')).not.toContainText('Computing…', {
			timeout: RIR_READY_TIMEOUT
		});
		// Verify Bare Stone Bathhouse honestly reports Open / High Decay (> window) over 1.2 s
		await expect(chamber.getByTestId('awc-metric-rt60')).toContainText('Open / High Decay');
		const bathC80Text = (await chamber.getByTestId('awc-metric-c80').textContent()) ?? '';
		const bathC80 = parseClarityDb(bathC80Text);

		// Switch to Anechoic Foam Wedge Chamber, trigger Clap, verify Anechoic C80 > Bathhouse C80
		await presetSelect.selectOption('anechoic-chamber');
		await chamber.getByTestId('awc-clap-btn').click();
		await expect(chamber.getByTestId('awc-metric-rt60')).not.toContainText('Computing…', {
			timeout: RIR_READY_TIMEOUT
		});
		await expect(chamber.getByTestId('awc-metric-rt60')).toContainText(/ms \(T(?:30|20)\)/);
		const anechoicC80Text = (await chamber.getByTestId('awc-metric-c80').textContent()) ?? '';
		const anechoicC80 = parseClarityDb(anechoicC80Text);
		expect(anechoicC80).toBeGreaterThan(bathC80 + 10);

		// Verify rendered FAQ has clean Unicode prose with zero raw ASCII caret or underscore notation
		const faq = page.locator('[data-article-faq]');
		await expect(faq).toBeVisible();
		const faqText = (await faq.textContent()) ?? '';
		expect(faqText.length).toBeGreaterThan(100);
		expect(faqText).not.toMatch(/\^|_/);

		expect(errors).toEqual([]);
	});

	test('verifies Swap Source <-> Probe reciprocity, ghost RIR, sketching, Helmholtz stamp, tone, and Web Audio audition', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForChamberReady(page);

		const chamber = page.getByTestId('acoustic-wavefield-chamber');
		await chamber.getByTestId('awc-preset-select').selectOption('shoebox-concert-hall');
		await expect(chamber.getByTestId('awc-metric-rt60')).not.toContainText('Computing…', {
			timeout: RIR_READY_TIMEOUT
		});

		// Swap Source <-> Probe
		await chamber.getByTestId('awc-swap-btn').click();
		await expect(chamber.getByTestId('awc-reciprocity-badge')).toBeVisible({
			timeout: RIR_READY_TIMEOUT
		});
		const badgeText = (await chamber.getByTestId('awc-reciprocity-badge').textContent()) ?? '';
		const rhoMatch = badgeText.match(/(\d\.\d+)/);
		expect(rhoMatch).not.toBeNull();
		expect(Number(rhoMatch![1])).toBeGreaterThan(0.95);
		await expect(chamber.getByTestId('awc-rir-ghost')).toBeVisible();
		await expect(chamber.getByTestId('awc-ghost-legend')).toContainText(
			'Coral dashed: Previous RIR (Ghost)'
		);

		// Click-stamp Helmholtz cavity & paint stone wall
		const canvas = chamber.getByTestId('awc-viewport-canvas');
		const box = (await canvas.boundingBox())!;
		await chamber.getByTestId('awc-tool-helmholtz').click();
		await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);

		await chamber.getByRole('button', { name: 'Stone Wall' }).click();
		await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.4);
		await page.mouse.up();
		await expect(chamber.getByTestId('awc-metric-rt60')).not.toContainText('Computing…', {
			timeout: RIR_READY_TIMEOUT
		});

		// Toggle Chladni Sand & Continuous Tone
		await chamber.getByTestId('awc-chladni-toggle').click();
		await expect(chamber.getByTestId('awc-chladni-toggle')).toContainText('Off');
		await chamber.getByTestId('awc-chladni-toggle').click();
		await expect(chamber.getByTestId('awc-chladni-toggle')).toContainText('On');

		await chamber.getByTestId('awc-tone-btn').click();
		await expect(chamber.getByTestId('awc-tone-btn')).toHaveText('Stop Tone');
		await chamber.getByTestId('awc-tone-btn').click();

		// URL state reflects preset change
		await page.waitForTimeout(300);
		expect(page.url()).toContain('preset=shoebox-concert-hall');

		// Exercise Web Audio Enable Room Audio + Mute + Room Wet/Dry + Audition Triggers + Gain Slider
		const enableAudioBtn = chamber.getByTestId('awc-enable-audio');
		await enableAudioBtn.click();
		await expect(enableAudioBtn).toHaveText('Audio Ready');
		await expect(enableAudioBtn).toHaveAttribute('aria-pressed', 'true');

		const muteBtn = chamber.getByRole('button', { name: /^(Mute|Unmute)$/ });
		await expect(muteBtn).toHaveText('Mute');
		await muteBtn.click();
		await expect(muteBtn).toHaveText('Unmute');
		await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');
		await muteBtn.click();
		await expect(muteBtn).toHaveText('Mute');
		await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');

		const wetBtn = chamber.getByRole('button', { name: /^(Room Wet|Dry Source)$/ });
		await expect(wetBtn).toHaveText('Room Wet');
		await wetBtn.click();
		await expect(wetBtn).toHaveText('Dry Source');
		await expect(wetBtn).toHaveAttribute('aria-pressed', 'true');
		await wetBtn.click();
		await expect(wetBtn).toHaveText('Room Wet');
		await expect(wetBtn).toHaveAttribute('aria-pressed', 'false');

		await chamber.getByTestId('awc-audition-clap').click();
		await chamber.getByTestId('awc-audition-pluck').click();
		await chamber.getByRole('button', { name: 'Rimshot' }).click();
		await chamber.getByRole('button', { name: 'Vowel Pulse' }).click();

		const gainSlider = chamber.locator('#awc-gain-slider');
		await gainSlider.fill('-12');
		await expect(chamber.locator('.awc-slider-row:has(#awc-gain-slider)')).toContainText('-12 dB');

		expect(errors).toEqual([]);
	});

	test('engages deterministic Canvas 2D fallback under ?webgl=off', async ({ page }) => {
		const errors = attachDiagnostics(page);
		await waitForChamberReady(page, `${articlePath}?webgl=off`);

		const chamber = page.getByTestId('acoustic-wavefield-chamber');
		await expect(chamber.getByTestId('awc-canvas2d-badge')).toBeVisible();
		await expect(chamber.getByTestId('awc-canvas2d-badge')).toContainText('2D Canvas Fallback');

		const box = await chamber.getByTestId('awc-viewport-canvas').boundingBox();
		expect(box).not.toBeNull();
		expect(box!.width).toBeGreaterThan(300);

		await chamber.getByTestId('awc-clap-btn').click();
		await expect(chamber.getByTestId('awc-metric-rt60')).not.toContainText('Computing…', {
			timeout: RIR_READY_TIMEOUT
		});

		expect(errors).toEqual([]);
	});

	test('has zero horizontal overflow, >=44px interactive targets, and working fallback fullscreen on mobile 390x844', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await waitForChamberReady(page);

		await assertNoShellOverflow(page);

		const chamber = page.getByTestId('acoustic-wavefield-chamber');
		const shell = chamber.locator('.awc-shell');
		const articleShell = page.locator('.article-shell');
		const fsBtn = chamber.getByTestId('awc-fullscreen-btn');

		const initialArticleRect = await articleShell.boundingBox();
		const initialBreakoutRect = await chamber.boundingBox();
		expect(initialArticleRect).not.toBeNull();
		expect(initialBreakoutRect).not.toBeNull();
		expect(initialBreakoutRect!.width).toBeGreaterThanOrEqual(350);

		const smallTargets = await chamber
			.locator('button, select, input[type="range"]')
			.evaluateAll((els) => {
				return els
					.map((el) => {
						const r = el.getBoundingClientRect();
						return {
							tag: el.tagName,
							text: el.textContent?.trim() ?? '',
							w: r.width,
							h: r.height
						};
					})
					.filter((t) => t.w > 0 && t.h > 0 && (t.h < 44 || t.w < 44));
			});
		expect(smallTargets).toEqual([]);

		// Exercise mobile fallback fullscreen (enter, verify zero overflow & clickable Exit, exit & restore)
		await shell.evaluate((el) => {
			el.requestFullscreen = () => Promise.reject(new Error('Mocked mobile fullscreen rejection'));
		});
		await fsBtn.click();
		await expect(shell).toHaveClass(/awc-fullscreen-fallback/);
		await expect(fsBtn).toHaveText('Exit Fullscreen');

		const mobileFsBox = await shell.boundingBox();
		expect(mobileFsBox).not.toBeNull();
		expect(Math.abs(mobileFsBox!.x - 0)).toBeLessThanOrEqual(1);
		expect(Math.abs(mobileFsBox!.y - 0)).toBeLessThanOrEqual(1);
		expect(Math.abs(mobileFsBox!.width - 390)).toBeLessThanOrEqual(1);
		expect(Math.abs(mobileFsBox!.height - 844)).toBeLessThanOrEqual(1);

		await assertNoShellOverflow(page);

		const mobileExitTopmost = await fsBtn.evaluate((el) => {
			const r = el.getBoundingClientRect();
			const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
			return hit === el || el.contains(hit);
		});
		expect(mobileExitTopmost).toBe(true);

		await fsBtn.click();
		await expect(shell).not.toHaveClass(/awc-fullscreen-fallback/);
		await expect(fsBtn).toHaveText('Fullscreen');

		await assertNoShellOverflow(page);

		const restoredArticleRect = await articleShell.boundingBox();
		const restoredBreakoutRect = await chamber.boundingBox();
		expect(restoredArticleRect).not.toBeNull();
		expect(restoredBreakoutRect).not.toBeNull();
		expect(Math.abs(restoredArticleRect!.x - initialArticleRect!.x)).toBeLessThanOrEqual(1);
		expect(Math.abs(restoredArticleRect!.width - initialArticleRect!.width)).toBeLessThanOrEqual(1);
		expect(Math.abs(restoredBreakoutRect!.x - initialBreakoutRect!.x)).toBeLessThanOrEqual(1);
		expect(Math.abs(restoredBreakoutRect!.width - initialBreakoutRect!.width)).toBeLessThanOrEqual(
			1
		);

		expect(errors).toEqual([]);
	});

	test('snaps URL-supplied S/L coordinates out of stone walls into valid AIR cells', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForChamberReady(
			page,
			`${articlePath}?preset=stone-bathhouse&sx=3&sy=3&lx=220&ly=140`
		);

		const chamber = page.getByTestId('acoustic-wavefield-chamber');
		await expect(chamber.getByTestId('awc-preset-select')).toHaveValue('stone-bathhouse');

		// Snapped beacons produce genuine flight time (> 10 ms) and valid C80 rather than a silent 0 ms wall lock
		const t0Text = (await chamber.getByTestId('awc-metric-t0').textContent()) ?? '';
		const t0Match = t0Text.match(/(\d+(?:\.\d+)?)\s*ms/);
		expect(t0Match).not.toBeNull();
		expect(Number(t0Match![1])).toBeGreaterThan(10);

		const c80Text = (await chamber.getByTestId('awc-metric-c80').textContent()) ?? '';
		expect(() => parseClarityDb(c80Text)).not.toThrow();

		// Confirm URL synced to valid interior AIR coordinates (moved out of wall corners 3,3 and 220,140)
		await page.waitForTimeout(300);
		expect(page.url()).not.toContain('sx=3&');
		expect(page.url()).not.toContain('lx=220&');

		// Verify live chamber injects energy on Clap (would remain 0 if S were still inside MAT_WALL)
		await chamber.getByRole('button', { name: 'Clear Waves' }).click();
		const beforeClap = await chamber.getByTestId('awc-viewport-canvas').screenshot();
		await chamber.getByTestId('awc-clap-btn').click();
		await page.waitForTimeout(250);
		const afterClap = await chamber.getByTestId('awc-viewport-canvas').screenshot();
		expect(Buffer.compare(beforeClap, afterClap)).not.toBe(0);

		expect(errors).toEqual([]);
	});

	test('passes AxeBuilder accessibility checks in Dark Chamber and Light Studio themes', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await waitForChamberReady(page);

		const darkResults = await new AxeBuilder({ page })
			.include('[data-testid="acoustic-wavefield-chamber"]')
			.analyze();
		const darkSerious = darkResults.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(darkSerious).toEqual([]);

		const chamber = page.getByTestId('acoustic-wavefield-chamber');
		await chamber.getByRole('button', { name: 'Light Studio' }).click();
		await page.waitForTimeout(200);

		const lightResults = await new AxeBuilder({ page })
			.include('[data-testid="acoustic-wavefield-chamber"]')
			.analyze();
		const lightSerious = lightResults.violations.filter(
			(v) => v.impact === 'critical' || v.impact === 'serious'
		);
		expect(lightSerious).toEqual([]);

		expect(errors).toEqual([]);
	});

	test('desktop 1440x1000, 1440x650, and 1280x800 fallback fullscreen aligns to viewport, keeps Exit Fullscreen sticky/clickable, exits on Escape from canvas & inner controls, and preserves zero overflow', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await page.setViewportSize({ width: 1440, height: 1000 });
		await waitForChamberReady(page);

		const chamber = page.getByTestId('acoustic-wavefield-chamber');
		const shell = chamber.locator('.awc-shell');
		const fsBtn = chamber.getByTestId('awc-fullscreen-btn');
		const articleShell = page.locator('.article-shell');

		const initialArticleRect = await articleShell.boundingBox();
		const initialBreakoutRect = await chamber.boundingBox();
		expect(initialArticleRect).not.toBeNull();
		expect(initialBreakoutRect).not.toBeNull();
		// Confirm breakout chamber remains unclipped (~1416px at 1440px desktop)
		expect(initialBreakoutRect!.width).toBeGreaterThanOrEqual(1400);

		// Before entering fallback fullscreen: zero document or shell overflow
		await assertNoShellOverflow(page);

		// Mock requestFullscreen() rejection to exercise the CSS fallback fullscreen path
		await shell.evaluate((el) => {
			el.requestFullscreen = () => Promise.reject(new Error('Mocked fullscreen rejection'));
		});

		await fsBtn.click();
		await expect(shell).toHaveClass(/awc-fullscreen-fallback/);
		await expect(fsBtn).toHaveText('Exit Fullscreen');

		const fallbackBox = await shell.boundingBox();
		expect(fallbackBox).not.toBeNull();
		expect(Math.abs(fallbackBox!.x - 0)).toBeLessThanOrEqual(1);
		expect(Math.abs(fallbackBox!.y - 0)).toBeLessThanOrEqual(1);
		expect(Math.abs(fallbackBox!.width - 1440)).toBeLessThanOrEqual(1);
		expect(Math.abs(fallbackBox!.height - 1000)).toBeLessThanOrEqual(1);

		// During fallback fullscreen at 1440x1000: zero horizontal overflow
		await assertNoShellOverflow(page);

		const exitBox = await fsBtn.boundingBox();
		expect(exitBox).not.toBeNull();
		expect(exitBox!.x).toBeGreaterThanOrEqual(0);
		expect(exitBox!.y).toBeGreaterThanOrEqual(0);
		expect(exitBox!.x + exitBox!.width).toBeLessThanOrEqual(1440);
		expect(exitBox!.y + exitBox!.height).toBeLessThanOrEqual(1000);

		// Confirm Exit Fullscreen is topmost/clickable (not occluded by sticky site header)
		const exitTopmost = await fsBtn.evaluate((el) => {
			const r = el.getBoundingClientRect();
			const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
			return hit === el || el.contains(hit);
		});
		expect(exitTopmost).toBe(true);

		// Pressing Escape from focused canvas exits fallback fullscreen
		await chamber.getByTestId('awc-viewport-canvas').focus();
		await page.keyboard.press('Escape');
		await expect(shell).not.toHaveClass(/awc-fullscreen-fallback/);
		await expect(fsBtn).toHaveText('Fullscreen');
		await assertNoShellOverflow(page);

		// Pressing Escape from focused inner select (#awc-preset-select) exits fallback fullscreen
		await fsBtn.click();
		await expect(shell).toHaveClass(/awc-fullscreen-fallback/);
		await chamber.getByTestId('awc-preset-select').focus();
		await page.keyboard.press('Escape');
		await expect(shell).not.toHaveClass(/awc-fullscreen-fallback/);
		await assertNoShellOverflow(page);

		// Pressing Escape from focused inner slider (#awc-tone-slider) exits fallback fullscreen
		await fsBtn.click();
		await expect(shell).toHaveClass(/awc-fullscreen-fallback/);
		await chamber.locator('#awc-tone-slider').focus();
		await page.keyboard.press('Escape');
		await expect(shell).not.toHaveClass(/awc-fullscreen-fallback/);
		await assertNoShellOverflow(page);

		// Re-enter fallback fullscreen and test short desktop viewport 1440x650 with inner scroll + sticky header
		await fsBtn.click();
		await expect(shell).toHaveClass(/awc-fullscreen-fallback/);
		await page.setViewportSize({ width: 1440, height: 650 });

		const shortBox = await shell.boundingBox();
		expect(shortBox).not.toBeNull();
		expect(Math.abs(shortBox!.x - 0)).toBeLessThanOrEqual(1);
		expect(Math.abs(shortBox!.y - 0)).toBeLessThanOrEqual(1);
		expect(Math.abs(shortBox!.width - 1440)).toBeLessThanOrEqual(1);
		expect(Math.abs(shortBox!.height - 650)).toBeLessThanOrEqual(1);
		await assertNoShellOverflow(page);

		// Scroll inner .awc-shell to telemetry ledger and verify sticky header + Exit Fullscreen remain topmost
		const scrollResult = await shell.evaluate((el) => {
			el.scrollTop = el.scrollHeight - el.clientHeight;
			const header = el.querySelector('.awc-header') as HTMLElement;
			const rt60 = el.querySelector('[data-testid="awc-metric-rt60"]') as HTMLElement;
			const exitBtn = el.querySelector('[data-testid="awc-fullscreen-btn"]') as HTMLElement;
			const hr = header.getBoundingClientRect();
			const rr = rt60.getBoundingClientRect();
			const er = exitBtn.getBoundingClientRect();
			const hit = document.elementFromPoint(er.left + er.width / 2, er.top + er.height / 2);
			return {
				scrollTop: el.scrollTop,
				headerTop: hr.top,
				rt60Top: rr.top,
				rt60Bottom: rr.bottom,
				exitTopmost: hit === exitBtn || exitBtn.contains(hit)
			};
		});
		expect(scrollResult.scrollTop).toBeGreaterThan(0);
		expect(Math.abs(scrollResult.headerTop)).toBeLessThanOrEqual(1);
		expect(scrollResult.rt60Top).toBeGreaterThanOrEqual(0);
		expect(scrollResult.rt60Bottom).toBeLessThanOrEqual(650);
		expect(scrollResult.exitTopmost).toBe(true);

		// Exit via clicking Exit Fullscreen button
		await fsBtn.click();
		await expect(shell).not.toHaveClass(/awc-fullscreen-fallback/);
		await expect(fsBtn).toHaveText('Fullscreen');

		// Restore 1440x1000 and verify .article-shell & .awc-breakout-root rects + zero overflow
		await page.setViewportSize({ width: 1440, height: 1000 });
		await assertNoShellOverflow(page);

		const restoredArticleRect = await articleShell.boundingBox();
		const restoredBreakoutRect = await chamber.boundingBox();
		expect(restoredArticleRect).not.toBeNull();
		expect(restoredBreakoutRect).not.toBeNull();
		expect(Math.abs(restoredArticleRect!.x - initialArticleRect!.x)).toBeLessThanOrEqual(1);
		expect(Math.abs(restoredArticleRect!.width - initialArticleRect!.width)).toBeLessThanOrEqual(1);
		expect(Math.abs(restoredBreakoutRect!.x - initialBreakoutRect!.x)).toBeLessThanOrEqual(1);
		expect(Math.abs(restoredBreakoutRect!.width - initialBreakoutRect!.width)).toBeLessThanOrEqual(
			1
		);

		// Also verify 1280x800 desktop breakpoint before, during, and after fallback fullscreen
		await page.setViewportSize({ width: 1280, height: 800 });
		await assertNoShellOverflow(page);
		await fsBtn.click();
		await expect(shell).toHaveClass(/awc-fullscreen-fallback/);
		const box1280 = await shell.boundingBox();
		expect(box1280).not.toBeNull();
		expect(Math.abs(box1280!.width - 1280)).toBeLessThanOrEqual(1);
		expect(Math.abs(box1280!.height - 800)).toBeLessThanOrEqual(1);
		await assertNoShellOverflow(page);
		await fsBtn.click();
		await expect(shell).not.toHaveClass(/awc-fullscreen-fallback/);
		await assertNoShellOverflow(page);

		expect(errors).toEqual([]);
	});

	test('honors prefers-reduced-motion: reduce with paused non-blank initial snapshot and Clap pixel response', async ({
		page
	}) => {
		const errors = attachDiagnostics(page);
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await waitForChamberReady(page);

		const chamber = page.getByTestId('acoustic-wavefield-chamber');
		const playPauseBtn = chamber.getByRole('button', { name: /^(Play|Pause)$/ });
		await expect(playPauseBtn).toHaveText('Play');
		await expect(playPauseBtn).toHaveAttribute('aria-pressed', 'false');

		const canvas = chamber.getByTestId('awc-viewport-canvas');
		const initialShot = await canvas.screenshot();

		await chamber.getByRole('button', { name: 'Clear Waves' }).click();
		await page.waitForTimeout(100);
		const clearedShot = await canvas.screenshot();
		expect(Buffer.compare(initialShot, clearedShot)).not.toBe(0);

		await chamber.getByTestId('awc-clap-btn').click();
		await page.waitForTimeout(250);
		const afterClapShot = await canvas.screenshot();
		expect(Buffer.compare(clearedShot, afterClapShot)).not.toBe(0);

		expect(errors).toEqual([]);
	});
});
