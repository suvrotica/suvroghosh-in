import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const GAME_PATH = '/blog/games/kagojer-dana-a-paper-plane-through-calcutta';
const SETTINGS_KEY = 'kagojer-dana.settings';

type RuntimeAudit = {
	canvasCreations: number;
	webglContextCalls: number;
	audioContextConstructions: number;
	audioContextCloses: number;
	animationFrames: number;
};

const game = (page: Page) => page.locator('#game-experience');

function collectRuntimeProblems(page: Page): string[] {
	const problems: string[] = [];
	page.on('console', (message) => {
		const text = message.text();
		if (
			message.type() === 'error' ||
			(message.type() === 'warning' && /hydration|mismatch/i.test(text))
		) {
			problems.push(`console ${message.type()}: ${text}`);
		}
	});
	page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
	return problems;
}

async function installAudit(page: Page) {
	await page.addInitScript(() => {
		const audit: RuntimeAudit = {
			canvasCreations: 0,
			webglContextCalls: 0,
			audioContextConstructions: 0,
			audioContextCloses: 0,
			animationFrames: 0
		};
		Object.defineProperty(window, '__kagojerDanaAudit', { configurable: true, value: audit });

		const nativeCreateElement = Document.prototype.createElement;
		Document.prototype.createElement = function (
			tagName: string,
			options?: ElementCreationOptions
		) {
			const element = Reflect.apply(nativeCreateElement, this, [tagName, options]) as HTMLElement;
			if (tagName.toLocaleLowerCase('en') === 'canvas') audit.canvasCreations += 1;
			return element;
		};

		const nativeGetContext = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (
			this: HTMLCanvasElement,
			contextId: string,
			...args: unknown[]
		) {
			if (contextId === 'webgl' || contextId === 'webgl2') audit.webglContextCalls += 1;
			return Reflect.apply(nativeGetContext, this, [contextId, ...args]);
		} as typeof HTMLCanvasElement.prototype.getContext;

		const nativeAnimationFrame = window.requestAnimationFrame.bind(window);
		window.requestAnimationFrame = (callback: FrameRequestCallback) => {
			audit.animationFrames += 1;
			return nativeAnimationFrame(callback);
		};

		const browserWindow = window as typeof window & {
			webkitAudioContext?: typeof AudioContext;
		};
		const NativeAudioContext = window.AudioContext ?? browserWindow.webkitAudioContext;
		if (NativeAudioContext) {
			const nativeClose = NativeAudioContext.prototype.close;
			NativeAudioContext.prototype.close = function () {
				audit.audioContextCloses += 1;
				return Reflect.apply(nativeClose, this, []);
			};
			const Instrumented = new Proxy(NativeAudioContext, {
				construct(target, argumentsList) {
					audit.audioContextConstructions += 1;
					return Reflect.construct(target, argumentsList);
				}
			});
			Object.defineProperty(window, 'AudioContext', { configurable: true, value: Instrumented });
			if ('webkitAudioContext' in browserWindow) {
				Object.defineProperty(window, 'webkitAudioContext', {
					configurable: true,
					value: Instrumented
				});
			}
		}
	});
}

async function audit(page: Page): Promise<RuntimeAudit> {
	return page.evaluate(
		() =>
			(
				window as typeof window & {
					__kagojerDanaAudit: RuntimeAudit;
				}
			).__kagojerDanaAudit
	);
}

async function openPoster(page: Page) {
	await page.goto(GAME_PATH, { waitUntil: 'networkidle' });
	await expect(game(page)).toHaveAttribute('data-phase', 'poster');
	await expect(
		game(page).getByRole('heading', { name: 'Kagojer Dana', exact: true })
	).toBeVisible();
	await expect(game(page).getByRole('button', { name: 'Fly with Calcutta sound' })).toBeVisible();
	await expect
		.poll(() =>
			game(page)
				.locator('.poster-image')
				.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
		)
		.toBe(true);
}

async function start(page: Page, sound: boolean) {
	await game(page)
		.getByRole('button', { name: sound ? 'Fly with Calcutta sound' : 'Fly silently' })
		.click();
	await expect(game(page).locator('canvas')).toHaveCount(1);
	await expect(game(page)).toHaveAttribute('data-phase', 'playing', { timeout: 30_000 });
}

test('the server-rendered poster, controls and article remain complete without JavaScript', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
	const page = await context.newPage();
	try {
		await page.goto(GAME_PATH, { waitUntil: 'load' });
		const experience = game(page);
		await expect(experience).toHaveAttribute('data-phase', 'poster');
		await expect(
			experience.getByRole('heading', { name: 'Kagojer Dana', exact: true })
		).toBeVisible();
		await expect(experience.locator('.poster-image')).toBeVisible();
		await expect(experience.getByRole('button', { name: 'Fly with Calcutta sound' })).toBeVisible();
		await expect(experience.getByRole('button', { name: 'Fly silently' })).toBeVisible();
		await expect(experience.locator('canvas')).toHaveCount(0);
		await expect(page.locator('#about-the-game')).toContainText(
			'You do not command the wind. You borrow it.'
		);
		await expect(
			page.getByText(/JavaScript is required for the live paper-plane flight/i)
		).toBeVisible();
	} finally {
		await context.close();
	}
});

test('the SSR poster is inert until activation and silent play never creates or downloads audio', async ({
	page
}) => {
	await installAudit(page);
	await openPoster(page);
	await expect(game(page).locator('canvas')).toHaveCount(0);
	const before = await audit(page);
	expect(before.webglContextCalls).toBe(0);
	expect(before.audioContextConstructions).toBe(0);
	expect(
		await page.evaluate(() =>
			performance
				.getEntriesByType('resource')
				.some((entry) =>
					/GameController|three(\.module)?|\.(?:wav|ogg|mp3)(?:\?|$)/i.test(entry.name)
				)
		)
	).toBe(false);

	await start(page, false);
	await expect.poll(async () => (await audit(page)).webglContextCalls).toBeGreaterThan(0);
	expect((await audit(page)).audioContextConstructions).toBe(0);
	expect(
		await page.evaluate(() =>
			performance
				.getEntriesByType('resource')
				.some((entry) => /\.(?:wav|ogg|mp3)(?:\?|$)/i.test(entry.name))
		)
	).toBe(false);
});

test('sound starts from the explicit gesture and pause, resume, mute and relaunch remain semantic', async ({
	page
}) => {
	await installAudit(page);
	await openPoster(page);
	await start(page, true);
	await expect.poll(async () => (await audit(page)).audioContextConstructions).toBe(1);
	const experience = game(page);
	await experience.getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(experience).toHaveAttribute('data-phase', 'paused');
	await experience.getByRole('button', { name: 'Catch another gust' }).click();
	await expect(experience).toHaveAttribute('data-phase', 'playing');
	await experience.getByRole('button', { name: 'Sound' }).click();
	await expect(experience.getByRole('button', { name: 'Sound' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await experience.locator('canvas').focus();
	await page.keyboard.press('Escape');
	await expect(experience).toHaveAttribute('data-phase', 'paused');
	await experience.getByRole('button', { name: 'Resume flight' }).click();
	await expect(experience).toHaveAttribute('data-phase', 'playing');
});

test('the exact seed and deterministic opening survive reload while unrelated query state survives sharing', async ({
	page
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: () => Promise.resolve()
		});
	});
	await page.goto(`${GAME_PATH}?theme=ink&kd_v=1&kd_seed=KD-HOOGHLY-7&kd_mode=free#about-the-game`);
	const seededUrl = page.url();
	await expect(game(page)).toHaveAttribute('data-seed', 'KD-HOOGHLY-7');
	await start(page, false);
	const firstOpening = {
		seed: await game(page).getAttribute('data-seed'),
		district: await game(page).locator('.district-card strong').innerText(),
		register: await game(page).locator('.district-card span').innerText()
	};

	await page.reload({ waitUntil: 'networkidle' });
	expect(page.url()).toBe(seededUrl);
	await expect(game(page)).toHaveAttribute('data-phase', 'poster');
	await expect(game(page)).toHaveAttribute('data-seed', 'KD-HOOGHLY-7');
	await start(page, false);
	const secondOpening = {
		seed: await game(page).getAttribute('data-seed'),
		district: await game(page).locator('.district-card strong').innerText(),
		register: await game(page).locator('.district-card span').innerText()
	};
	expect(secondOpening).toEqual(firstOpening);

	await game(page).getByRole('button', { name: 'Pause', exact: true }).click();
	await game(page).getByRole('button', { name: 'End flight and open folio' }).click();
	await expect(game(page).getByRole('heading', { name: 'The city kept the line.' })).toBeVisible();
	await game(page).getByRole('button', { name: 'Share this city and wind' }).click();
	expect(new URL(page.url()).searchParams.get('theme')).toBe('ink');
	expect(new URL(page.url()).searchParams.get('kd_seed')).toBe('KD-HOOGHLY-7');
	expect(new URL(page.url()).hash).toBe('#about-the-game');
});

test('portrait phones receive the finished poster while landscape receives one canvas and 44px controls', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true
	});
	const page = await context.newPage();
	try {
		await page.goto(GAME_PATH, { waitUntil: 'networkidle' });
		await expect(game(page)).toHaveAttribute('data-phase', 'poster');
		await expect(
			game(page).getByRole('heading', { name: 'Kagojer Dana', exact: true })
		).toBeVisible();
		await expect(
			game(page).getByText('This flight needs a wider horizon. Rotate your phone to fly.')
		).toBeVisible();
		await expect(game(page).locator('canvas')).toHaveCount(0);
		await page.setViewportSize({ width: 844, height: 390 });
		await game(page).getByRole('button', { name: 'Fly silently' }).click();
		await expect(game(page)).toHaveAttribute('data-phase', 'playing', { timeout: 30_000 });
		await expect(game(page).locator('canvas')).toHaveCount(1);
		const activeSeed = await game(page).getAttribute('data-seed');
		await game(page)
			.locator('canvas')
			.evaluate((canvas) => canvas.setAttribute('data-qa-preserved-canvas', 'true'));
		const sizes = await game(page)
			.locator('button:visible')
			.evaluateAll((buttons) =>
				buttons.map((button) => {
					const box = button.getBoundingClientRect();
					return { name: button.textContent?.trim() ?? '', width: box.width, height: box.height };
				})
			);
		for (const size of sizes) {
			expect(size.width, `${size.name} width`).toBeGreaterThanOrEqual(44);
			expect(size.height, `${size.name} height`).toBeGreaterThanOrEqual(44);
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			844
		);

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(game(page)).toHaveAttribute('data-phase', 'paused');
		await expect(
			game(page).getByText('This flight needs a wider horizon. Rotate your phone to fly.')
		).toBeVisible();
		await expect(game(page).getByText(/paused exactly where you left them/i)).toBeVisible();
		await expect(game(page).locator('canvas[data-qa-preserved-canvas="true"]')).toHaveCount(1);
		await expect(game(page).locator('.live-flight')).toHaveAttribute('aria-hidden', 'true');
		await expect(game(page).locator('.live-flight')).toHaveAttribute('inert', '');
		await expect
			.poll(() =>
				page.evaluate(() => document.activeElement?.closest('.portrait-fallback') !== null)
			)
			.toBe(true);
		await expect
			.poll(() =>
				game(page)
					.locator('.portrait-fallback img')
					.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
			)
			.toBe(true);

		await page.setViewportSize({ width: 844, height: 390 });
		const resume = game(page).getByRole('button', { name: 'Resume flight' });
		await expect(game(page)).toHaveAttribute('data-phase', 'paused');
		await expect(resume).toBeVisible();
		await expect(resume).toBeFocused();
		await resume.click();
		await expect(game(page)).toHaveAttribute('data-phase', 'playing');
		await expect(game(page)).toHaveAttribute('data-seed', activeSeed ?? '');
		await expect(game(page).locator('canvas[data-qa-preserved-canvas="true"]')).toBeFocused();
	} finally {
		await context.close();
	}
});

test('hydration and an activated silent flight emit no console errors, page errors or hydration warnings', async ({
	page
}) => {
	const problems = collectRuntimeProblems(page);
	await openPoster(page);
	await start(page, false);
	await page.waitForTimeout(500);
	await game(page).getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(game(page)).toHaveAttribute('data-phase', 'paused');
	expect(problems).toEqual([]);
});

test('hidden tabs pause safely and WebGL context loss leaves a useful restart path', async ({
	page
}) => {
	await openPoster(page);
	await start(page, false);

	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: true });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect(game(page)).toHaveAttribute('data-phase', 'paused');

	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: false });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await game(page).getByRole('button', { name: 'Resume flight' }).click();
	await expect(game(page)).toHaveAttribute('data-phase', 'playing');

	await game(page).locator('canvas').dispatchEvent('webglcontextlost');
	await expect(game(page)).toHaveAttribute('data-phase', 'error');
	await expect(game(page).getByRole('alert')).toContainText(
		'The charcoal drawing lost its graphics context'
	);

	await game(page).getByRole('button', { name: 'Fly silently' }).click();
	await expect(game(page)).toHaveAttribute('data-phase', 'playing', { timeout: 30_000 });
	await expect(game(page).locator('canvas')).toHaveCount(1);
});

test('reduced motion defaults a new visitor to Calm Flight and the poster has no serious accessibility violations', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
	const page = await context.newPage();
	try {
		await openPoster(page);
		await expect(game(page).getByRole('button', { name: 'Calm flight: On' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(
			await page.evaluate(
				(key) => JSON.parse(localStorage.getItem(key) ?? '{}').calmFlight,
				SETTINGS_KEY
			)
		).toBe(true);
		const results = await new AxeBuilder({ page }).include('#game-experience').analyze();
		expect(
			results.violations.filter(
				(violation) => violation.impact === 'critical' || violation.impact === 'serious'
			)
		).toEqual([]);
	} finally {
		await context.close();
	}
});

test('navigation closes audio and removes the canvas', async ({ page }) => {
	await installAudit(page);
	await openPoster(page);
	await start(page, true);
	await page.locator('#about-the-game').getByRole('link', { name: 'Games', exact: true }).click();
	await expect(page).toHaveURL(/\/blog\/games\/?$/);
	await expect(page.locator('#game-experience')).toHaveCount(0);
	await expect.poll(async () => (await audit(page)).audioContextCloses).toBeGreaterThanOrEqual(1);
	await expect(page.locator('canvas')).toHaveCount(0);
});
