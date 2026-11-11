import { expect, test, type Locator, type Page } from '@playwright/test';

const GAME_PATH = '/blog/games/the-repair-shop-on-the-corner';
const SAVE_KEY = 'the-repair-shop-on-the-corner.save.v1';

type PageFailures = {
	pageErrors: string[];
	consoleErrors: string[];
};

function collectPageFailures(page: Page): PageFailures {
	const failures: PageFailures = { pageErrors: [], consoleErrors: [] };
	page.on('pageerror', (err) => failures.pageErrors.push(err.message));
	page.on('console', (msg) => {
		const text = msg.text();
		if (
			msg.type() === 'error' &&
			!text.startsWith('Failed to load resource:') &&
			!text.includes('/_vercel/insights/script.js')
		) {
			failures.consoleErrors.push(text);
		}
	});
	return failures;
}

function expectNoFailures(failures: PageFailures) {
	expect(failures.pageErrors, 'uncaught page errors').toEqual([]);
	expect(failures.consoleErrors, 'console errors').toEqual([]);
}

async function setRangeValue(locator: Locator, value: number) {
	await locator.evaluate((el, nextVal) => {
		const input = el as HTMLInputElement;
		input.value = String(nextVal);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}, value);
}

test.describe('The Repair Shop on the Corner', () => {
	test('renders on Games shelf, keeps Three.js lazy on poster, and navigates cleanly back to Games', async ({
		page
	}) => {
		const failures = collectPageFailures(page);
		let webglContextsCreated: number;

		await page.addInitScript(() => {
			const win = window as unknown as { __webglCount: number };
			win.__webglCount = 0;
			const origGetContext = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = function (
				this: HTMLCanvasElement,
				contextId: string,
				options?: unknown
			) {
				if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
					win.__webglCount += 1;
				}
				return Reflect.apply(origGetContext, this, [contextId, options]) as RenderingContext | null;
			} as typeof HTMLCanvasElement.prototype.getContext;
		});

		await page.goto('/blog/games', { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { name: 'Games', level: 1 })).toBeVisible();
		const cardLink = page
			.locator(`a[href="${GAME_PATH}"]`)
			.filter({ hasText: /The Repair Shop|Open the shutter/i })
			.first();
		await expect(cardLink).toBeVisible();

		webglContextsCreated = await page.evaluate(
			() => (window as unknown as { __webglCount: number }).__webglCount
		);
		expect(webglContextsCreated, 'no WebGL initialized on /blog/games').toBe(0);

		await page.goto(GAME_PATH, { waitUntil: 'domcontentloaded' });
		const shell = page.locator('#game-experience');
		await expect(shell).toHaveAttribute('data-phase', 'poster');
		await expect(
			shell.getByRole('heading', { name: 'The Repair Shop on the Corner', level: 1 })
		).toBeVisible();
		await expect(page.locator('#about-the-game')).toContainText(
			'Listen to the symptom, find the fault'
		);

		webglContextsCreated = await page.evaluate(
			() => (window as unknown as { __webglCount: number }).__webglCount
		);
		expect(webglContextsCreated, 'no WebGL initialized before clicking Enter').toBe(0);

		// Clean back navigation from poster
		await shell.getByRole('link', { name: '← Games' }).click();
		await expect(page).toHaveURL(/\/blog\/games$/);
		expectNoFailures(failures);
	});

	test('completes all three repairs muted from opening shutter to courtyard film screening and free play', async ({
		page
	}) => {
		const failures = collectPageFailures(page);

		await page.goto(GAME_PATH, { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(800);

		const shell = page.locator('#game-experience');
		await shell.getByRole('button', { name: 'Enter shop quietly' }).click();
		await expect(shell).toHaveAttribute('data-phase', 'playing');
		await expect(shell.getByRole('button', { name: 'Muted' })).toBeVisible();

		// --- JOB 1: PORTABLE RADIO (BAPI) ---
		await shell
			.getByRole('button', { name: /Talk to Bapi/i })
			.first()
			.click();
		await expect(shell.getByRole('heading', { name: 'Bapi Mondal' })).toBeVisible();
		await shell.getByRole('button', { name: 'Accept radio and take a look' }).click();
		await expect(shell).toHaveAttribute('data-mode', 'workbench');

		// Verify opening back cover is blocked until closed-case symptom test is observed
		await shell.getByRole('button', { name: 'Open back cover' }).click();
		await expect(shell.locator('.feedback-box')).toContainText('closed-case test first');

		// Run closed-case test while muted -> verify visual text caption reports steady lamp + audio cutout
		await shell.getByRole('button', { name: 'Switch power on' }).click();
		await shell.getByRole('button', { name: 'Test & tilt radio' }).click();
		await expect(shell.locator('.feedback-box')).toContainText(
			'red power light stays steadily lit while you tilt the radio, yet the audio cuts out'
		);

		// Switch off, unscrew both screws into tray, open cover
		await shell.getByRole('button', { name: /Power: ON/i }).click();
		await shell.getByRole('button', { name: /Unscrew back screw/i }).click();
		await shell.getByRole('button', { name: /Unscrew back screw/i }).click();
		await shell.getByRole('button', { name: 'Open back cover' }).click();

		// Inspect intact battery vs actual loose speaker connector
		await shell.getByRole('button', { name: /Inspect 1\.5V D-cell battery pack/i }).click();
		await expect(shell.locator('.feedback-box')).toContainText('matches the steady power light');
		await shell.getByRole('button', { name: /Inspect Speaker spade connector/i }).click();
		await expect(shell.locator('.feedback-box')).toContainText('This connector is loose');

		// Seat connector, close case, fasten screws, tune station, verify closed test
		await shell.getByRole('button', { name: 'Seat speaker connector firmly' }).click();
		await shell.getByRole('button', { name: 'Close back cover' }).click();
		await shell
			.getByRole('button', { name: /Fasten screw/i })
			.first()
			.click();
		await shell
			.getByRole('button', { name: /Fasten screw/i })
			.first()
			.click();
		await shell.getByRole('button', { name: 'Switch power on' }).click();
		await setRangeValue(shell.getByLabel('Radio tuning dial'), 70);
		await shell.getByRole('button', { name: 'Test & tilt radio' }).click();
		await expect(shell.locator('.feedback-box')).toContainText('Ready to return to Bapi');

		// Return radio to Bapi at tea stall & collect spare rubber belts
		await shell.getByRole('button', { name: /Carry back to Bapi Mondal/i }).click();
		await shell
			.getByRole('button', { name: 'Return the repaired radio' })
			.click({ timeout: 25_000 });
		await expect(shell.getByRole('button', { name: 'Jobs (1/3)' })).toBeVisible();
		await expect(shell.locator('.caption-strip')).toContainText('Tea-stall radio humming gently');

		await shell
			.getByRole('button', { name: /Ask Bapi about rubber belts/i })
			.first()
			.click();
		await shell.getByRole('button', { name: 'Ask about the spare rubber belts' }).click();
		await shell.getByRole('button', { name: 'Take spare rubber belts to the shop' }).click();

		// --- JOB 2: WIND-UP CLOCK (MALA SEN) ---
		await shell.getByRole('button', { name: 'Walk & Visit…' }).click();
		await shell.getByRole('button', { name: /Talk to Mala/i }).click();
		await shell
			.getByRole('button', { name: 'Accept the wind-up clock' })
			.click({ timeout: 25_000 });
		await expect(shell).toHaveAttribute('data-mode', 'workbench');

		await shell.getByRole('button', { name: /Unscrew thumbscrew/i }).click();
		await shell.getByRole('button', { name: /Unscrew thumbscrew/i }).click();
		await shell.getByRole('button', { name: 'Open brass back plate' }).click();

		// Observe where initial motion stops
		await shell.getByRole('button', { name: 'Turn winding key slowly' }).click();
		await expect(shell.locator('.feedback-box')).toContainText('The gears stop turning here');

		// Try an incorrect placement first and verify reversible mechanical explanation
		const moveBtns = shell.getByRole('button', { name: 'Move…' });
		await moveBtns.nth(1).click(); // Medium 4-hole wheel
		await shell.getByRole('button', { name: 'Shaft 3 (Right)' }).click();
		await shell.getByRole('button', { name: 'Turn winding key slowly' }).click();
		await expect(shell.locator('.feedback-box')).toContainText('stop turning');

		// Place coherent gear train: Large -> Shaft 1, Medium -> Shaft 2, Small -> Shaft 3
		await moveBtns.nth(0).click(); // Large
		await shell.getByRole('button', { name: 'Shaft 1 (Left)' }).click();
		await moveBtns.nth(1).click(); // Medium
		await shell.getByRole('button', { name: 'Shaft 2 (Centre)' }).click();
		await moveBtns.nth(2).click(); // Small
		await shell.getByRole('button', { name: 'Shaft 3 (Right)' }).click();
		await shell.getByRole('button', { name: 'Turn winding key slowly' }).click();
		await expect(shell.locator('.feedback-box')).toContainText('Every wheel meshes cleanly');

		await shell.getByRole('button', { name: 'Close brass back plate' }).click();
		await shell
			.getByRole('button', { name: /Fasten thumbscrew/i })
			.first()
			.click();
		await shell
			.getByRole('button', { name: /Fasten thumbscrew/i })
			.first()
			.click();
		await setRangeValue(shell.getByLabel('Set clock hands time'), 270);
		await expect(shell.locator('.feedback-box')).toContainText('Ready to return to Sen Brothers');

		await shell.getByRole('button', { name: /Carry back to Mala Sen/i }).click();
		await shell
			.getByRole('button', { name: 'Return the wind-up clock' })
			.click({ timeout: 25_000 });
		await expect(shell.getByRole('button', { name: 'Jobs (2/3)' })).toBeVisible();

		// --- JOB 3: 8MM FILM PROJECTOR (RUMA) ---
		await shell.getByRole('button', { name: 'Walk & Visit…' }).click();
		await shell.getByRole('button', { name: /Talk to Ruma/i }).click();
		await shell.getByRole('button', { name: 'Accept the film projector' }).click({
			timeout: 25_000
		});

		await shell.getByRole('button', { name: 'Open side cover' }).click();
		await shell.getByRole('button', { name: 'Remove perished belt' }).click();
		await shell.getByRole('button', { name: 'Fit spare belt from Bapi' }).click();

		// Check mis-threaded initial route non-destructively with manual turn
		await shell.getByRole('button', { name: 'Turn mechanism manually' }).click();
		await expect(shell.locator('.feedback-box')).toContainText('missing the aperture gate');

		// Rewind and thread all 5 guides in exact order
		await shell.getByRole('button', { name: 'Rewind film leader' }).click();
		await shell.getByRole('button', { name: /Thread Upper guide roller/i }).click();
		await shell.getByRole('button', { name: /Thread Aperture gate/i }).click();
		await shell.getByRole('button', { name: /Thread Toothed drive sprocket/i }).click();
		await shell.getByRole('button', { name: /Thread Lower tension guide/i }).click();
		await shell.getByRole('button', { name: /Thread Take-up spool hub/i }).click();
		await shell.getByRole('button', { name: 'Turn mechanism manually' }).click();
		await expect(shell.locator('.feedback-box')).toContainText('Manual turn passed');

		await shell.getByRole('button', { name: 'Close side cover' }).click();
		await shell.getByRole('button', { name: 'Switch projector on' }).click();
		await setRangeValue(shell.getByLabel('Projector lens focus barrel'), 59);
		await expect(shell.locator('.feedback-box')).toContainText('razor-sharp');

		await shell.getByRole('button', { name: /Carry back to Ruma Chatterjee/i }).click();
		await shell
			.getByRole('button', { name: 'Place repaired projector on courtyard table' })
			.click({ timeout: 25_000 });
		await expect(shell.getByRole('button', { name: 'Jobs (3/3)' })).toBeVisible();

		// --- COURTYARD FILM SCREENING & CONTINUED EXPLORATION ---
		await shell
			.getByRole('button', { name: /Start courtyard film screening/i })
			.first()
			.click();
		await expect(shell).toHaveAttribute('data-mode', 'screening');
		await expect(shell.locator('.screening-bar')).toContainText('Afternoon Across the Roofs');

		// Sample live animation frame pacing during screening
		const frameMetrics = await page.evaluate(
			() =>
				new Promise<{ frames: number; avgMs: number }>((resolve) => {
					const stamps: number[] = [];
					const step = (t: number) => {
						stamps.push(t);
						if (stamps.length < 25) requestAnimationFrame(step);
						else {
							const elapsed = stamps[stamps.length - 1] - stamps[0];
							resolve({ frames: stamps.length - 1, avgMs: elapsed / (stamps.length - 1) });
						}
					};
					requestAnimationFrame(step);
				})
		);
		expect(frameMetrics.frames).toBe(24);
		expect(frameMetrics.avgMs).toBeLessThan(120);

		await shell.getByRole('button', { name: 'Step back & explore lane' }).click();
		await expect(shell).toHaveAttribute('data-mode', 'explore');
		await expect(shell.locator('.caption-strip')).toContainText('First chapter complete');

		expectNoFailures(failures);
	});

	test('persists mid-workbench progress across reload, supports Reset Repair vs New Game, and fits mobile portrait', async ({
		page
	}) => {
		const failures = collectPageFailures(page);
		await page.goto(GAME_PATH, { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(800);

		const shell = page.locator('#game-experience');
		await shell.getByRole('button', { name: 'Enter shop quietly' }).click();
		await expect(shell).toHaveAttribute('data-phase', 'playing');

		// Accept radio, run closed test, unscrew 2 screws, open cover
		await shell
			.getByRole('button', { name: /Talk to Bapi/i })
			.first()
			.click();
		await shell.getByRole('button', { name: 'Accept radio and take a look' }).click();
		await shell.getByRole('button', { name: 'Switch power on' }).click();
		await shell.getByRole('button', { name: 'Test & tilt radio' }).click();
		await shell.getByRole('button', { name: /Power: ON/i }).click();
		await shell.getByRole('button', { name: /Unscrew back screw/i }).click();
		await shell.getByRole('button', { name: /Unscrew back screw/i }).click();
		await shell.getByRole('button', { name: 'Open back cover' }).click();

		// Reload page and confirm saved workbench state restores cleanly
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(800);
		await expect(shell.getByRole('button', { name: 'Continue quietly' })).toBeVisible();
		await shell.getByRole('button', { name: 'Continue quietly' }).click();
		await expect(shell).toHaveAttribute('data-phase', 'playing');
		await expect(shell).toHaveAttribute('data-mode', 'workbench');
		await expect(shell.getByRole('button', { name: 'Close back cover' })).toBeVisible();

		// Check mobile portrait (390x844) non-overlapping 3D view + bench controls
		await page.setViewportSize({ width: 390, height: 844 });
		await page.waitForTimeout(350);
		const canvasBox = await shell.locator('.canvas-pane').boundingBox();
		const benchBox = await shell.locator('.workbench-pane').boundingBox();
		expect(canvasBox).not.toBeNull();
		expect(benchBox).not.toBeNull();
		if (canvasBox && benchBox) {
			expect(canvasBox.height).toBeGreaterThan(200);
			expect(benchBox.height).toBeGreaterThan(250);
			expect(benchBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height - 2);
		}

		// Check 3 hint levels without penalty
		const hintBtn = shell.getByRole('button', { name: /hint/i });
		await hintBtn.click();
		await expect(shell.locator('.hint-callout')).toContainText('Hint (1/3)');
		await shell.getByRole('button', { name: /More specific hint/i }).click();
		await expect(shell.locator('.hint-callout')).toContainText('Hint (2/3)');
		await shell.getByRole('button', { name: /Exact next action/i }).click();
		await expect(shell.locator('.hint-callout')).toContainText('Hint (3/3)');

		// Test "Reset this repair" (restores closed cover while keeping radio accepted on bench)
		await shell.getByRole('button', { name: 'Reset this repair' }).click();
		await shell.getByRole('button', { name: 'Confirm reset' }).click();
		await expect(shell.getByRole('button', { name: 'Open back cover' })).toBeVisible();

		// Test Escape stepping back from bench & opening Options -> Start new game
		await page.keyboard.press('Escape');
		await expect(shell).toHaveAttribute('data-mode', 'explore');
		await page.keyboard.press('Escape');
		await expect(shell).toHaveAttribute('data-phase', 'paused');

		await shell.getByRole('button', { name: 'Start new game…' }).click();
		await shell.getByRole('button', { name: 'Confirm new game' }).click();
		await expect(shell).toHaveAttribute('data-phase', 'playing');
		const savedRaw = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
		expect(savedRaw).not.toBeNull();
		expect(JSON.parse(savedRaw!).jobs.radio).toBe('not_started');

		expectNoFailures(failures);
	});

	test('cleans up listeners and AudioContext on route exit and recovers gracefully from WebGL context loss', async ({
		page
	}) => {
		const failures = collectPageFailures(page);

		await page.addInitScript(() => {
			type Audit = {
				audioCreated: number;
				audioClosed: number;
				windowKeydownActive: number;
			};
			const audit: Audit = { audioCreated: 0, audioClosed: 0, windowKeydownActive: 0 };
			(window as unknown as { __rsAudit: Audit }).__rsAudit = audit;

			const NativeAudio =
				window.AudioContext ||
				(window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (NativeAudio) {
				class TrackedAudio extends NativeAudio {
					constructor(opts?: AudioContextOptions) {
						super(opts);
						audit.audioCreated += 1;
					}
					override close(): Promise<void> {
						audit.audioClosed += 1;
						return super.close();
					}
				}
				window.AudioContext = TrackedAudio;
			}

			const origAdd = window.addEventListener.bind(window);
			const origRemove = window.removeEventListener.bind(window);
			window.addEventListener = ((
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | AddEventListenerOptions
			) => {
				if (type === 'keydown') audit.windowKeydownActive += 1;
				return origAdd(type, listener, options);
			}) as typeof window.addEventListener;
			window.removeEventListener = ((
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | EventListenerOptions
			) => {
				if (type === 'keydown')
					audit.windowKeydownActive = Math.max(0, audit.windowKeydownActive - 1);
				return origRemove(type, listener, options);
			}) as typeof window.removeEventListener;
		});

		await page.goto('/blog/games', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(600);
		const baselineKeydown = await page.evaluate(
			() =>
				(window as unknown as { __rsAudit: { windowKeydownActive: number } }).__rsAudit
					.windowKeydownActive
		);

		await page
			.locator(`a[href="${GAME_PATH}"]`)
			.filter({ hasText: /The Repair Shop|Open the shutter/i })
			.first()
			.click();
		await expect(page).toHaveURL(new RegExp(`${GAME_PATH}$`));
		const shell = page.locator('#game-experience');

		await shell.getByRole('button', { name: 'Enter shop with sound' }).click();
		await expect(shell).toHaveAttribute('data-phase', 'playing');

		// Navigate away via client-side link to /blog/games -> verify teardown
		await shell.getByRole('link', { name: /Back to Games|← Games/i }).click();
		await expect(page).toHaveURL(/\/blog\/games$/);
		await page.waitForTimeout(300);

		const afterExit = await page.evaluate(
			() =>
				(
					window as unknown as {
						__rsAudit: { audioCreated: number; audioClosed: number; windowKeydownActive: number };
					}
				).__rsAudit
		);
		expect(afterExit.audioCreated).toBeGreaterThanOrEqual(1);
		expect(afterExit.audioClosed).toBe(afterExit.audioCreated);
		expect(afterExit.windowKeydownActive).toBeLessThanOrEqual(baselineKeydown);

		// Re-enter game & simulate WebGL context loss -> verify graceful recovery card
		await page.goto(GAME_PATH, { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(800);
		await shell
			.getByRole('button', { name: /Enter shop quietly|Continue quietly/i })
			.first()
			.click();
		await expect(shell).toHaveAttribute('data-phase', 'playing');

		await page.locator('#game-experience canvas').evaluate((canvasEl) => {
			const evt = new Event('webglcontextlost', { cancelable: true });
			canvasEl.dispatchEvent(evt);
		});

		await expect(shell).toHaveAttribute('data-phase', 'error');
		await expect(shell.getByRole('button', { name: 'Reload 3D Workshop' })).toBeVisible();
		await shell.getByRole('button', { name: 'Reload 3D Workshop' }).click();
		await expect(shell).toHaveAttribute('data-phase', 'playing');

		expectNoFailures(failures);
	});
});
