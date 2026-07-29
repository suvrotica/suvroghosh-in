import { expect, test, type Page } from '@playwright/test';

const gamePath = '/blog/games/calcutta-footpath-simulator-ekdom-side-diye-jaan';
const articlePath = '/blog/personal-essay/a-trapezoid-in-low-light';
const visualizationPath =
	'/blog/visualizations/how-a-scanner-sees-reconstructing-a-body-from-shadows';

function collectUnexpectedRuntimeErrors(page: Page): string[] {
	const errors: string[] = [];

	page.on('pageerror', (error) => {
		errors.push(`pageerror: ${error.message}`);
	});
	page.on('console', (message) => {
		if (message.type() !== 'error') return;

		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/')) return;
		errors.push(`console: ${message.text()}`);
	});

	return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
}

async function storeMotionBeforePageScripts(page: Page, preference: string) {
	await page.addInitScript((nextPreference) => {
		try {
			window.localStorage.setItem('site-motion', nextPreference);
		} catch {
			// The assertion in the test will expose an unexpected storage denial.
		}
	}, preference);
}

async function blockHydration(page: Page) {
	await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
}

test('the early bootstrap resolves a stored preference before hydration', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await storeMotionBeforePageScripts(page, 'alive');
	await blockHydration(page);

	await page.goto('/', { waitUntil: 'domcontentloaded' });

	const root = page.locator('html');
	await expect(root).toHaveAttribute('data-motion-preference', 'alive');
	await expect(root).toHaveAttribute('data-motion', 'still');
	await expect(page.locator('#desktop-motion')).toBeDisabled();
	await expect(page.getByRole('heading', { level: 1, name: 'Suvro Ghosh' })).toBeVisible();
	expect(await page.evaluate(() => window.localStorage.getItem('site-motion'))).toBe('alive');
});

test('the accessible desktop and mobile selectors synchronise and persist', async ({ page }) => {
	const runtimeErrors = collectUnexpectedRuntimeErrors(page);
	await page.goto('/');

	const desktopSelect = page.getByLabel('Motion preference', { exact: true });
	const mobileSelect = page.locator('#mobile-motion');
	await expect(desktopSelect).toBeEnabled();
	await expect(desktopSelect.locator('option')).toHaveText(['System', 'Still', 'Gentle', 'Alive']);

	await desktopSelect.selectOption('alive');
	await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'alive');
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'alive');
	await expect(page.locator('#mobile-motion')).toHaveValue('alive');
	expect(await page.evaluate(() => window.localStorage.getItem('site-motion'))).toBe('alive');

	await page.setViewportSize({ width: 390, height: 844 });
	const mobileMenu = page.locator('header details');
	const menuSummary = mobileMenu.locator(':scope > summary');
	await menuSummary.click();
	await expect(page.locator('label[for="mobile-motion"]')).toHaveText('Motion');
	await expect(mobileSelect).toHaveAccessibleName('Motion');
	await expect(mobileSelect).toBeVisible();
	expect(
		await mobileSelect.evaluate((select) => select.getBoundingClientRect().height)
	).toBeGreaterThanOrEqual(44);
	await expectNoHorizontalOverflow(page);

	await mobileSelect.selectOption('gentle');
	await expect(page.locator('#desktop-motion')).toHaveValue('gentle');
	await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'gentle');
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'gentle');
	expect(await page.evaluate(() => window.localStorage.getItem('site-motion'))).toBe('gentle');

	await page.keyboard.press('Escape');
	await expect(mobileMenu).not.toHaveAttribute('open', '');
	await expect(menuSummary).toBeFocused();

	await menuSummary.click();
	const mobileNavigation = page.getByRole('navigation', {
		name: 'Mobile and tablet navigation'
	});
	await mobileNavigation.getByRole('link', { name: 'Topics', exact: true }).click();
	await expect(page).toHaveURL(/\/topics$/);
	await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'gentle');

	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'gentle');
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'gentle');
	await expect(page.locator('#mobile-motion')).toHaveValue('gentle');
	await expectNoHorizontalOverflow(page);
	expect(runtimeErrors).toEqual([]);
});

test('reduced motion remains authoritative without erasing an explicit preference', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await storeMotionBeforePageScripts(page, 'alive');
	await page.goto('/');

	const desktopSelect = page.getByLabel('Motion preference', { exact: true });
	await expect(desktopSelect).toHaveValue('alive');
	await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'alive');
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
	expect(await page.evaluate(() => window.localStorage.getItem('site-motion'))).toBe('alive');

	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'alive');
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'alive');
	await expect(desktopSelect).toHaveValue('alive');
	expect(await page.evaluate(() => window.localStorage.getItem('site-motion'))).toBe('alive');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(1);
});

test('paper, night, and high contrast honour explicit still, gentle, and alive choices', async ({
	page
}) => {
	const runtimeErrors = collectUnexpectedRuntimeErrors(page);
	await page.goto('/');

	const themeSelect = page.getByLabel('Colour theme', { exact: true });
	const motionSelect = page.getByLabel('Motion preference', { exact: true });
	const atmosphere = page.locator('[data-route-atmosphere]');
	const themes = ['paper', 'night', 'high-contrast'] as const;
	const motions = ['still', 'gentle', 'alive'] as const;

	for (const theme of themes) {
		await test.step(theme, async () => {
			await themeSelect.selectOption(theme);
			await expect(page.locator('html')).toHaveAttribute('data-theme-preference', theme);
			await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

			for (const motion of motions) {
				await motionSelect.selectOption(motion);
				await expect(page.locator('html')).toHaveAttribute('data-motion-preference', motion);
				await expect(page.locator('html')).toHaveAttribute('data-motion', motion);
				expect(await page.evaluate(() => window.localStorage.getItem('site-motion'))).toBe(motion);

				const canvasExpected = motion !== 'still' && theme !== 'high-contrast';
				await expect(page.locator('[data-ambient-field]')).toHaveCount(canvasExpected ? 1 : 0);

				if (canvasExpected) {
					const canvas = page.locator('[data-ambient-field]');
					await expect(canvas).toHaveAttribute('aria-hidden', 'true');
					expect(await canvas.getAttribute('tabindex')).toBeNull();
					expect(await canvas.evaluate((element) => element.tabIndex)).toBe(-1);
					await expect(canvas).toHaveCSS('pointer-events', 'none');
				}
			}

			if (theme === 'high-contrast') {
				await expect(atmosphere).toHaveCSS('display', 'none');
			}
		});
	}

	expect(runtimeErrors).toEqual([]);
});

test('forced colours and print suppress both atmosphere layers', async ({ page }) => {
	await page.goto('/');

	const atmosphere = page.locator('[data-route-atmosphere]');
	await expect(atmosphere).toHaveCount(1);
	await expect(page.locator('[data-ambient-field]')).toHaveCount(1);

	await page.emulateMedia({ forcedColors: 'active' });
	await expect(atmosphere).toHaveCSS('display', 'none');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);

	await page.emulateMedia({ forcedColors: 'none' });
	await expect(page.locator('[data-ambient-field]')).toHaveCount(1);

	await page.emulateMedia({ media: 'print' });
	await expect(atmosphere).toHaveCSS('display', 'none');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
});

test('normal routes expose deterministic biomes and one fixed, inert atmosphere', async ({
	page
}) => {
	const runtimeErrors = collectUnexpectedRuntimeErrors(page);
	const routes = [
		{
			path: '/',
			biome: 'home',
			intensity: 'standard',
			ambient: 'animated'
		},
		{
			path: '/writing',
			biome: 'writing',
			intensity: 'standard',
			ambient: 'animated'
		},
		{
			path: '/topics',
			biome: 'writing',
			intensity: 'standard',
			ambient: 'animated'
		},
		{
			path: '/blog/calcutta-life',
			biome: 'calcutta',
			intensity: 'standard',
			ambient: 'animated'
		},
		{
			path: '/notes',
			biome: 'notes',
			intensity: 'quiet',
			ambient: 'animated'
		},
		{
			path: '/projects',
			biome: 'healthcare',
			intensity: 'quiet',
			ambient: 'animated'
		},
		{
			path: '/resume',
			biome: 'healthcare',
			intensity: 'minimal',
			ambient: 'static'
		},
		{
			path: '/blog/visualizations',
			biome: 'lab',
			intensity: 'standard',
			ambient: 'static'
		},
		{
			path: articlePath,
			biome: 'quiet',
			intensity: 'header-only',
			ambient: 'static'
		}
	] as const;

	await page.setViewportSize({ width: 390, height: 844 });

	for (const route of routes) {
		await test.step(route.path, async () => {
			await page.goto(route.path, { waitUntil: 'domcontentloaded' });
			await expect(page.locator('html')).toHaveAttribute('data-biome', route.biome);

			const atmosphere = page.locator('[data-route-atmosphere]');
			await expect(atmosphere).toHaveCount(1);
			await expect(atmosphere).toHaveAttribute('aria-hidden', 'true');
			await expect(atmosphere).toHaveAttribute('data-biome', route.biome);
			await expect(atmosphere).toHaveAttribute('data-intensity', route.intensity);
			await expect(atmosphere).toHaveAttribute('data-ambient', route.ambient);

			const presentation = await atmosphere.evaluate((element) => {
				const style = getComputedStyle(element);
				const bounds = element.getBoundingClientRect();
				return {
					position: style.position,
					pointerEvents: style.pointerEvents,
					left: bounds.left,
					top: bounds.top,
					width: bounds.width,
					height: bounds.height,
					viewportWidth: window.innerWidth,
					viewportHeight: window.innerHeight
				};
			});
			expect(presentation.position).toBe('fixed');
			expect(presentation.pointerEvents).toBe('none');
			expect(Math.abs(presentation.left)).toBeLessThanOrEqual(1);
			expect(Math.abs(presentation.top)).toBeLessThanOrEqual(1);
			expect(Math.abs(presentation.width - presentation.viewportWidth)).toBeLessThanOrEqual(1);
			expect(Math.abs(presentation.height - presentation.viewportHeight)).toBeLessThanOrEqual(1);
			await expectNoHorizontalOverflow(page);

			if (route.ambient === 'static') {
				await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
			}

			if (route.path === articlePath) {
				await expect(page.locator('.article-prose p')).not.toHaveCount(0);
				const decoratedParagraphs = page.locator(
					'.article-prose p:is(.reveal, .reveal-enhanced, [data-reveal], [data-parallax], [data-tilt], [class*="parallax"], [class*="tilt"])'
				);
				await expect(decoratedParagraphs).toHaveCount(0);
			}
		});
	}

	expect(runtimeErrors).toEqual([]);
});

test('game and heavy visualization routes opt out of the global atmosphere', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });

	for (const path of ['/blog/games', gamePath, visualizationPath]) {
		await test.step(path, async () => {
			await page.goto(path, { waitUntil: 'domcontentloaded' });
			await expect(page.locator('html')).toHaveAttribute('data-biome', 'off');
			await expect(page.locator('[data-route-atmosphere]')).toHaveCount(0);
			await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
			await expect(page.locator('main#main-content')).toBeAttached();
			await expectNoHorizontalOverflow(page);
		});
	}
});

test('the protected note studio redirects or keeps its unavailable special shell isolated', async ({
	page,
	request
}) => {
	const response = await request.get('/notes/studio', { maxRedirects: 0 });

	if (response.status() === 503) {
		const pageResponse = await page.goto('/notes/studio', { waitUntil: 'domcontentloaded' });
		expect(pageResponse?.status()).toBe(503);
		await expect(page.locator('html')).toHaveAttribute('data-biome', 'off');
		await expect(page.locator('[data-route-atmosphere]')).toHaveCount(0);
		await expect(page.locator('main#main-content')).toBeAttached();
		return;
	}

	expect([302, 303, 307, 308]).toContain(response.status());
	expect(response.headers().location).toMatch(/^\/notes\/sign-in(?:[/?#]|$)/);
});

test('SSR content and the static atmosphere remain meaningful without JavaScript', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 1440, height: 1000 }
	});
	const noJsPage = await context.newPage();

	try {
		await noJsPage.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
		await expect(noJsPage.getByRole('heading', { level: 1, name: 'Suvro Ghosh' })).toBeVisible();
		await expect(
			noJsPage.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', {
				name: 'Start Here',
				exact: true
			})
		).toBeVisible();

		const reveal = noJsPage.locator('.reveal').first();
		await expect(reveal).toBeVisible();
		await expect(reveal).not.toHaveClass(/reveal-enhanced/);
		await expect(noJsPage.locator('[data-route-atmosphere]')).toHaveCount(1);
		await expect(noJsPage.locator('[data-route-atmosphere] > div')).toHaveCount(2);
		await expect(noJsPage.locator('[data-ambient-field]')).toHaveCount(0);

		await noJsPage.goto(`${baseURL}${articlePath}`, { waitUntil: 'domcontentloaded' });
		const articleImage = noJsPage.locator('img[data-original-src]').first();
		await expect(articleImage).toBeVisible();
		await expect(noJsPage.locator('source[data-responsive-image]').first()).toHaveAttribute(
			'media',
			'(scripting: enabled)'
		);
		const originalSrc = await articleImage.getAttribute('data-original-src');
		expect(originalSrc).toBeTruthy();
		const absoluteOriginalSrc = new URL(originalSrc!, noJsPage.url()).href;
		await expect
			.poll(() =>
				articleImage.evaluate((image) => {
					const htmlImage = image as HTMLImageElement;
					return {
						complete: htmlImage.complete,
						currentSrc: htmlImage.currentSrc,
						naturalWidth: htmlImage.naturalWidth,
						src: htmlImage.src
					};
				})
			)
			.toMatchObject({
				complete: true,
				currentSrc: absoluteOriginalSrc
			});
		expect(
			await articleImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)
		).toBeGreaterThan(0);
	} finally {
		await context.close();
	}
});

test('navigation falls back normally when the View Transition API is unavailable', async ({
	page
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(document, 'startViewTransition', {
			configurable: true,
			writable: true,
			value: undefined
		});
	});
	const runtimeErrors = collectUnexpectedRuntimeErrors(page);

	await page.goto('/');
	expect(await page.evaluate(() => typeof document.startViewTransition)).toBe('undefined');
	await page
		.getByRole('navigation', { name: 'Primary navigation' })
		.getByRole('link', { name: 'Essays', exact: true })
		.click();

	await expect(page).toHaveURL(/\/blog$/);
	await expect(page.locator('main#main-content')).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('data-biome', 'writing');
	expect(runtimeErrors).toEqual([]);
});

test('eligible navigation uses the View Transition handshake while off routes skip it', async ({
	page
}) => {
	await page.addInitScript(() => {
		const testWindow = window as Window & { __archiveViewTransitionCalls?: number };
		testWindow.__archiveViewTransitionCalls = 0;

		Object.defineProperty(document, 'startViewTransition', {
			configurable: true,
			writable: true,
			value: (callback: () => void | Promise<void>) => {
				testWindow.__archiveViewTransitionCalls =
					(testWindow.__archiveViewTransitionCalls ?? 0) + 1;
				const updateCallbackDone = Promise.resolve().then(callback);

				return {
					ready: Promise.resolve(),
					updateCallbackDone,
					finished: updateCallbackDone,
					skipTransition() {}
				} as unknown as ViewTransition;
			}
		});
	});

	await page.goto('/');
	const primaryNavigation = page.getByRole('navigation', { name: 'Primary navigation' });
	await primaryNavigation.getByRole('link', { name: 'Essays', exact: true }).click();
	await expect(page).toHaveURL(/\/blog$/);
	expect(
		await page.evaluate(
			() =>
				(window as Window & { __archiveViewTransitionCalls?: number }).__archiveViewTransitionCalls
		)
	).toBe(1);

	await primaryNavigation.getByRole('link', { name: 'Games', exact: true }).click();
	await expect(page).toHaveURL(/\/blog\/games$/);
	expect(
		await page.evaluate(
			() =>
				(window as Window & { __archiveViewTransitionCalls?: number }).__archiveViewTransitionCalls
		)
	).toBe(1);
});

test('an article header atmosphere stays static while its scope follows the header', async ({
	page
}) => {
	await page.goto(articlePath);

	const atmosphere = page.locator('[data-route-atmosphere]');
	await expect(atmosphere).toHaveAttribute('data-ambient', 'static');
	await expect(atmosphere).toHaveAttribute('data-active', 'true');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);

	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	await expect(atmosphere).toHaveAttribute('data-active', 'false');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);

	await page.evaluate(() => window.scrollTo(0, 0));
	await expect(atmosphere).toHaveAttribute('data-active', 'true');
});

test('reveals use the viewport observer, have no timer fallback, and yield to still mode', async ({
	page
}) => {
	await page.addInitScript(() => {
		const roots: string[] = [];
		Object.defineProperty(window, '__motionObserverRoots', {
			configurable: true,
			value: roots
		});

		class RecordingIntersectionObserver {
			readonly root = null;
			readonly rootMargin = '0px';
			readonly thresholds = [0];

			constructor(_callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
				roots.push(options?.root == null ? 'viewport' : 'element');
			}

			observe() {}
			unobserve() {}
			disconnect() {}
			takeRecords(): IntersectionObserverEntry[] {
				return [];
			}
		}

		Object.defineProperty(window, 'IntersectionObserver', {
			configurable: true,
			writable: true,
			value: RecordingIntersectionObserver
		});
	});

	await page.goto('/');
	const reveals = page.locator('.reveal');
	await expect(reveals.first()).toHaveClass(/reveal-enhanced/);
	expect(
		await page.evaluate(
			() => (window as Window & { __motionObserverRoots?: string[] }).__motionObserverRoots ?? []
		)
	).toContain('viewport');

	await page.waitForTimeout(550);
	await expect(reveals.first()).not.toHaveClass(/is-visible/);

	await page.getByLabel('Motion preference', { exact: true }).selectOption('still');
	await expect(page.locator('.reveal:not(.is-visible)')).toHaveCount(0);
	await expect(reveals.first()).toBeVisible();
});

test('static content and header atmosphere remain visible without IntersectionObserver', async ({
	page
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, 'IntersectionObserver', {
			configurable: true,
			writable: true,
			value: undefined
		});
	});

	await page.goto('/');
	const reveal = page.locator('.reveal').first();
	await expect(reveal).toHaveClass(/is-visible/);
	await expect(reveal).not.toHaveClass(/reveal-enhanced/);
	await expect(reveal).toBeVisible();

	await page.goto(articlePath);
	const atmosphere = page.locator('[data-route-atmosphere]');
	await expect(atmosphere).toHaveAttribute('data-ambient', 'static');
	await expect(atmosphere).toHaveAttribute('data-active', 'true');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
});
