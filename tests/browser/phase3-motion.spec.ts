import { expect, test, type Locator, type Page } from '@playwright/test';

const longArticlePath = '/blog/healthcare-it/latent-space-in-healthcare-data';
const gamePath = '/blog/games/calcutta-footpath-simulator-ekdom-side-diye-jaan';
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

async function pseudoScaleX(locator: Locator) {
	return locator.evaluate((element) => {
		const transform = getComputedStyle(element, '::after').transform;
		if (transform === 'none') return 1;
		return new DOMMatrixReadOnly(transform).m11;
	});
}

test('Phase 3 routes expose their static scene and single-owner atmosphere contracts', async ({
	page
}) => {
	const runtimeErrors = collectUnexpectedRuntimeErrors(page);
	const routes = [
		{
			path: '/writing',
			biome: 'writing',
			intensity: 'standard',
			ambient: 'animated',
			scope: 'viewport',
			scene: 'writing'
		},
		{
			path: '/blog',
			biome: 'writing',
			intensity: 'quiet',
			ambient: 'animated',
			scope: 'viewport',
			scene: 'writing'
		},
		{
			path: '/projects',
			biome: 'healthcare',
			intensity: 'quiet',
			ambient: 'animated',
			scope: 'viewport',
			scene: 'healthcare'
		},
		{
			path: '/consulting',
			biome: 'healthcare',
			intensity: 'standard',
			ambient: 'animated',
			scope: 'viewport',
			scene: 'healthcare'
		},
		{
			path: '/healthcare-it-gulf',
			biome: 'healthcare',
			intensity: 'quiet',
			ambient: 'animated',
			scope: 'viewport',
			scene: 'healthcare'
		},
		{
			path: '/resume',
			biome: 'healthcare',
			intensity: 'minimal',
			ambient: 'static',
			scope: 'header',
			scene: 'healthcare'
		},
		{
			path: '/notes',
			biome: 'notes',
			intensity: 'quiet',
			ambient: 'animated',
			scope: 'viewport',
			scene: 'notes'
		},
		{
			path: '/blog/visualizations',
			biome: 'lab',
			intensity: 'standard',
			ambient: 'static',
			scope: 'viewport',
			scene: 'lab'
		}
	] as const;

	for (const route of routes) {
		await test.step(route.path, async () => {
			await page.goto(route.path, { waitUntil: 'domcontentloaded' });

			const siteShell = page.locator('.site-shell');
			const atmosphere = page.locator('[data-route-atmosphere]');
			await expect(siteShell).toHaveAttribute('data-biome', route.biome);
			await expect(atmosphere).toHaveCount(1);
			await expect(atmosphere).toHaveAttribute('data-biome', route.biome);
			await expect(atmosphere).toHaveAttribute('data-intensity', route.intensity);
			await expect(atmosphere).toHaveAttribute('data-ambient', route.ambient);
			await expect(atmosphere).toHaveAttribute('data-scope', route.scope);
			await expect(page.locator(`[data-route-scene="${route.scene}"]`).first()).toBeAttached();
			await expectNoHorizontalOverflow(page);

			if (route.ambient === 'static') {
				await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
			} else {
				await expect(page.locator('[data-ambient-field]')).toHaveCount(1);
			}
		});
	}

	expect(runtimeErrors).toEqual([]);
});

test('the long article inherits its essay ink and keeps a static, calm reading region', async ({
	page
}) => {
	const runtimeErrors = collectUnexpectedRuntimeErrors(page);
	await page.goto(longArticlePath);

	const siteShell = page.locator('.site-shell');
	const articleShell = page.locator('.article-shell');
	const atmosphere = page.locator('[data-route-atmosphere]');
	const prose = page.locator('[data-article-reading-region]');

	await expect(siteShell).toHaveAttribute('data-essay-ink', 'blue');
	await expect(articleShell).toHaveAttribute('data-essay-ink', 'blue');
	await expect(atmosphere).toHaveAttribute('data-scope', 'header');
	await expect(atmosphere).toHaveAttribute('data-ambient', 'static');
	await expect(atmosphere).toHaveAttribute('data-active', 'true');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);

	const inheritedColours = await page.evaluate(() => {
		const shell = document.querySelector<HTMLElement>('.site-shell');
		const field = document.querySelector<HTMLElement>('[data-route-atmosphere]');
		const article = document.querySelector<HTMLElement>('.article-shell');
		if (!shell || !field || !article) throw new Error('Article atmosphere contract is missing');

		return {
			shell: getComputedStyle(shell).getPropertyValue('--essay-ink').trim(),
			field: getComputedStyle(field).getPropertyValue('--biome-primary').trim(),
			article: getComputedStyle(article).getPropertyValue('--essay-ink').trim()
		};
	});
	expect(inheritedColours.shell).toBe(inheritedColours.article);
	expect(inheritedColours.field).toBe(inheritedColours.article);

	await expect(page.locator('.reading-progress-bar')).toHaveCount(1);
	await expect(page.getByLabel('Audio article')).toBeAttached();
	await expect(page.getByRole('navigation', { name: 'On this page' }).first()).toBeAttached();
	await expect(prose.locator('table')).not.toHaveCount(0);
	await expect(prose.locator('blockquote')).not.toHaveCount(0);

	const decoratedReadingContent = prose.locator(
		':is(p, blockquote, table, pre, code, img, sup):is(.reveal, .reveal-enhanced, [data-reveal], [data-parallax], [data-tilt], [class*="parallax"], [class*="tilt"])'
	);
	await expect(decoratedReadingContent).toHaveCount(0);
	const animatedAncestors = await prose.evaluate((readingRegion) => {
		const owners: string[] = [];
		let element: HTMLElement | null = readingRegion as HTMLElement;

		while (element) {
			const style = getComputedStyle(element);
			const ownsAnimation = element.getAnimations().some((animation) => {
				const effect = animation.effect;
				return effect instanceof KeyframeEffect && effect.target === element;
			});
			if (style.animationName !== 'none' || ownsAnimation) {
				owners.push(`${element.tagName.toLowerCase()}.${element.className}`);
			}
			element = element.parentElement;
		}

		return owners;
	});
	expect(animatedAncestors).toEqual([]);

	await prose.scrollIntoViewIfNeeded();
	await page.evaluate(() => window.scrollBy(0, 240));
	await expect(atmosphere).toHaveAttribute('data-active', 'false');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
	expect(
		await page.locator('.reading-progress-bar').evaluate((element) => {
			const transform = getComputedStyle(element).transform;
			return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m11;
		})
	).toBeGreaterThan(0);

	await page.emulateMedia({ media: 'print' });
	await expect(atmosphere).toHaveCSS('display', 'none');
	await expect(page.locator('.reading-progress-bar')).toHaveCSS('display', 'none');
	await expect(prose).toBeVisible();
	await expect(prose.locator('table').first()).toBeVisible();
	expect(runtimeErrors).toEqual([]);
});

test('the resume keeps a minimal static top field for calm document reading', async ({ page }) => {
	await page.goto('/resume');

	const atmosphere = page.locator('[data-route-atmosphere]');
	await expect(atmosphere).toHaveAttribute('data-scope', 'header');
	await expect(atmosphere).toHaveAttribute('data-ambient', 'static');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);

	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	await expect(atmosphere).toHaveAttribute('data-active', 'false');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
	await expect(page.getByRole('heading', { level: 1, name: 'Suvro Ghosh' })).toBeAttached();
	await expectNoHorizontalOverflow(page);
});

test('the semantic active-route line settles once and preserves every accessibility fallback', async ({
	page
}) => {
	await page.goto('/');

	const primary = page.getByRole('navigation', { name: 'Primary navigation' });
	const essays = primary.getByRole('link', { name: 'Essays', exact: true });
	await essays.hover();
	await expect.poll(() => pseudoScaleX(essays)).toBeCloseTo(0, 3);

	await essays.click();
	await expect(page).toHaveURL(/\/blog$/);
	await expect(primary.locator('[aria-current="page"]')).toHaveCount(1);
	await expect(essays).toHaveAttribute('aria-current', 'page');
	await expect.poll(() => pseudoScaleX(essays)).toBeCloseTo(1, 3);

	const work = primary.getByRole('link', { name: 'Work', exact: true });
	await work.focus();
	await expect(work).toBeFocused();
	await work.press('Enter');
	await expect(page).toHaveURL(/\/projects$/);
	await expect(work).toHaveAttribute('aria-current', 'page');

	await page.goto('/blog/games');
	await expect(primary.getByRole('link', { name: 'Games', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await page.goto('/blog/visualizations');
	await expect(primary.getByRole('link', { name: 'Lab', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);

	await page.locator('#desktop-motion').selectOption('still');
	const current = primary.locator('[aria-current="page"]');
	await expect(current).toHaveCSS('transition-duration', '0s');
	expect(
		await current.evaluate((element) => getComputedStyle(element, '::after').transitionDuration)
	).toBe('0s');
	await expect.poll(() => pseudoScaleX(current)).toBeCloseTo(1, 3);

	await page.locator('#desktop-motion').selectOption('alive');
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
	expect(
		await current.evaluate((element) => getComputedStyle(element, '::after').transitionDuration)
	).toBe('0s');

	await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
	expect(await current.evaluate((element) => getComputedStyle(element, '::after').display)).toBe(
		'none'
	);
	await expect(current).toHaveCSS('text-decoration-line', 'underline');
	await page.goto('/writing');
	await expect(page.locator('.writing-signal-glyph').first()).toHaveCSS('display', 'none');
	expect(
		await page
			.locator('[data-route-scene="writing"]')
			.evaluate((element) => getComputedStyle(element, '::before').display)
	).toBe('none');

	await page.emulateMedia({ forcedColors: 'none', media: 'print' });
	await expect(page.locator('.site-shell > header')).toHaveCSS('display', 'none');
	await expect(page.locator('.writing-signal-glyph').first()).toHaveCSS('display', 'none');
});

test('notes, lab, games, studio, and visualization shells retain clear animation ownership', async ({
	page,
	request
}) => {
	await page.goto('/notes');
	await expect(page.getByRole('search')).toBeAttached();
	await expect(page.locator('[data-route-scene="notes"]')).toHaveCount(1);
	const noteLinks = page.locator('.notes-list > li > a');
	const noteCount = await noteLinks.count();
	if (noteCount > 0) {
		await expect(noteLinks.first()).toHaveCSS('transform', 'none');
		const publicNotePath = await noteLinks.first().getAttribute('href');
		expect(publicNotePath).toBeTruthy();
		await page.goto(publicNotePath!);
		await expect(page.locator('.site-shell')).toHaveAttribute('data-biome', 'off');
		await expect(page.locator('[data-route-atmosphere]')).toHaveCount(0);
	}

	await page.goto('/blog/visualizations');
	await expect(page.locator('[data-route-atmosphere]')).toHaveAttribute('data-ambient', 'static');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
	await expect(page.locator('[data-local-animation-owner="artificial-life"]')).toHaveCount(1);
	await expect(page.locator('[data-local-animation-owner="artificial-life"] canvas')).toHaveCount(
		1
	);

	for (const path of ['/blog/games', gamePath, visualizationPath]) {
		await page.goto(path, { waitUntil: 'domcontentloaded' });
		await expect(page.locator('html')).toHaveAttribute('data-biome', 'off');
		await expect(page.locator('[data-route-atmosphere]')).toHaveCount(0);
		await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
		await expectNoHorizontalOverflow(page);
	}

	const studioResponse = await request.get('/notes/studio', { maxRedirects: 0 });
	expect([302, 303, 307, 308, 503]).toContain(studioResponse.status());
});

test('route decoration remains static across themes, motion choices, touch, and no-JS', async ({
	browser,
	baseURL
}) => {
	const touchContext = await browser.newContext({
		hasTouch: true,
		isMobile: true,
		viewport: { width: 390, height: 844 }
	});
	const touchPage = await touchContext.newPage();

	try {
		await touchPage.goto(`${baseURL}/writing`);
		const glyphPaths = touchPage.locator('.writing-signal-glyph path');
		await expect(glyphPaths).not.toHaveCount(0);
		const initialPaths = await glyphPaths.evaluateAll((paths) =>
			paths.map((path) => path.getAttribute('d'))
		);
		await touchPage.locator('header details > summary').click();

		for (const theme of ['paper', 'night'] as const) {
			await touchPage.locator('#mobile-theme').selectOption(theme);
			for (const motion of ['still', 'gentle', 'alive'] as const) {
				await touchPage.locator('#mobile-motion').selectOption(motion);
				expect(
					await glyphPaths.evaluateAll((paths) => paths.map((path) => path.getAttribute('d')))
				).toEqual(initialPaths);
			}
		}
		await touchPage.locator('#mobile-theme').selectOption('high-contrast');
		await expect(touchPage.locator('.writing-signal-glyph').first()).toHaveCSS('display', 'none');
		expect(
			await touchPage
				.locator('[data-route-scene="writing"]')
				.evaluate((element) => getComputedStyle(element, '::before').display)
		).toBe('none');

		const mobileNav = touchPage.getByRole('navigation', { name: 'Mobile and tablet navigation' });
		await expect(mobileNav.locator('[aria-current="page"]')).toHaveCount(1);
		await expect(mobileNav.getByRole('link', { name: 'Essays', exact: true })).toHaveAttribute(
			'aria-current',
			'page'
		);
		expect(
			await mobileNav
				.getByRole('link')
				.evaluateAll((links) => links.every((link) => link.getBoundingClientRect().height >= 44))
		).toBe(true);
		await expectNoHorizontalOverflow(touchPage);
	} finally {
		await touchContext.close();
	}

	const noJsContext = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 1440, height: 1000 }
	});
	const noJsPage = await noJsContext.newPage();

	try {
		await noJsPage.goto(`${baseURL}/writing`, { waitUntil: 'domcontentloaded' });
		await expect(noJsPage.getByRole('heading', { level: 1, name: 'Writings' })).toBeVisible();
		await expect(noJsPage.locator('.site-shell')).toHaveAttribute('data-biome', 'writing');
		await expect(noJsPage.locator('[data-route-scene="writing"]')).toBeVisible();
		await expect(noJsPage.locator('[data-route-atmosphere] > div')).toHaveCount(2);
		await expect(noJsPage.locator('[data-ambient-field]')).toHaveCount(0);
		await expect(
			noJsPage
				.getByRole('navigation', { name: 'Primary navigation' })
				.getByRole('link', { name: 'Essays', exact: true })
		).toHaveAttribute('aria-current', 'page');

		await noJsPage.goto(`${baseURL}${longArticlePath}`, { waitUntil: 'domcontentloaded' });
		await expect(noJsPage.locator('.site-shell')).toHaveAttribute('data-essay-ink', 'blue');
		await expect(noJsPage.locator('[data-route-atmosphere]')).toHaveAttribute(
			'data-active',
			'true'
		);
		await expect(noJsPage.locator('[data-route-atmosphere] > div')).toHaveCount(2);
		await expect(noJsPage.locator('[data-ambient-field]')).toHaveCount(0);
		await expect(noJsPage.locator('[data-article-reading-region]')).toContainText(
			'Latent space is where healthcare data goes'
		);
		await expect(noJsPage.locator('[data-article-reading-region] table')).not.toHaveCount(0);
	} finally {
		await noJsContext.close();
	}
});
