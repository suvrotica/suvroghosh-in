import { expect, test, type Page } from '@playwright/test';

const footerPages = [
	{ label: /^SuvroGhosh\s*\.IN$/, href: '/', heading: /Suvro Ghosh/ },
	{ label: 'Start here', href: '/start-here', heading: 'Start here' },
	{ label: 'Writing', href: '/writing', heading: 'Writings' },
	{ label: 'Search & archive', href: '/blog', heading: 'All Posts' },
	{ label: 'Topics', href: '/topics', heading: 'Topic Headquarters' },
	{ label: 'Handwritten notes', href: '/notes', heading: 'Handwritten notes' },
	{ label: 'Field Kit', href: '/resources', heading: 'The Field Kit' },
	{ label: 'Visualizations', href: '/blog/visualizations', heading: 'Visualizations' },
	{ label: 'Games', href: '/blog/games', heading: 'Games' },
	{ label: 'Images & sketches', href: '/images', heading: 'Images' },
	{ label: 'Work & experiments', href: '/projects', heading: 'Work & experiments' },
	{ label: 'About Suvro', href: '/about', heading: 'Suvro Ghosh' },
	{ label: 'Résumé & career history', href: '/resume', heading: 'Suvro Ghosh' },
	{ label: 'Contact', href: '/contact', heading: 'Contact' },
	{ label: 'Privacy note', href: '/privacy', heading: /A small note\s*about privacy/ }
] as const;

const runtimeErrors = new WeakMap<Page, string[]>();

// These checks exercise clicks locally. Third-party destination availability is audited separately;
// a stub document proves the requested URL/new tab without sending traffic or subscribing.
test.beforeEach(async ({ context, baseURL, page }) => {
	const errors: string[] = [];
	runtimeErrors.set(page, errors);
	page.on('pageerror', (error) => errors.push(error.message));
	await context.route('**/*', (route) => {
		if (new URL(route.request().url()).origin === baseURL) return route.continue();
		if (route.request().isNavigationRequest()) {
			return route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: '<!doctype html><title>External navigation fixture</title>'
			});
		}
		return route.abort();
	});
	await context.addInitScript(() => {
		const savedAt = Date.now();
		localStorage.setItem(
			'suvroghosh:consent',
			JSON.stringify({
				v: 1,
				analytics: false,
				media: false,
				savedAt,
				expiresAt: savedAt + 180 * 24 * 60 * 60 * 1000
			})
		);
	});
});

test.afterEach(async ({ page }) => {
	expect(
		runtimeErrors.get(page) ?? [],
		'navigation must not leave uncaught browser errors'
	).toEqual([]);
});

async function load(page: Page, href: string) {
	const response = await page.goto(href);
	expect(response?.ok(), `loading ${href}`).toBe(true);
	await expect(page.locator('html')).toHaveAttribute(
		'data-view-transitions',
		/available|unavailable/
	);
}

async function expectPage(page: Page, href: string, heading?: string | RegExp) {
	await expect(page).toHaveURL((url) => url.pathname === href);
	const expectedHeading =
		heading ?? footerPages.find((destination) => destination.href === href)?.heading;
	const title = page.locator('main').getByRole('heading', { level: 1 });
	if (expectedHeading) await expect(title).toHaveText(expectedHeading);
	else await expect(title).toBeVisible();
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	// A changed URL and an already idle document can precede Kit's DOM commit.
	// Match the destination, then let its commit and paint finish before another history action.
	if (await page.locator('html').getAttribute('data-view-transitions')) {
		await page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
				)
		);
	}
}

for (const destination of footerPages) {
	test(`footer ${destination.label}: pointer, keyboard, history and direct reload`, async ({
		page
	}) => {
		const source = destination.href === '/privacy' ? '/about' : '/privacy';
		await load(page, source);
		const link = page.locator('footer').getByRole('link', { name: destination.label, exact: true });
		await expect(link).toHaveAttribute('href', destination.href);
		await link.click();
		await expectPage(page, destination.href, destination.heading);
		await page.goBack();
		await expectPage(page, source);
		await link.focus();
		await link.press('Enter');
		await expectPage(page, destination.href, destination.heading);
		await page.goBack();
		await expectPage(page, source);
		await page.goForward();
		await expectPage(page, destination.href, destination.heading);
		const response = await page.reload();
		expect(response?.ok(), `direct load of ${destination.href}`).toBe(true);
		await expectPage(page, destination.href, destination.heading);
	});
}

for (const feed of [
	{ label: 'RSS feed', href: '/rss.xml', root: '<rss' },
	{ label: 'Sitemap', href: '/sitemap.xml', root: '<urlset' }
]) {
	test(`footer ${feed.label}: valid XML and pointer/keyboard destination`, async ({
		page,
		request
	}) => {
		const response = await request.get(feed.href);
		expect(response.ok()).toBe(true);
		expect(response.headers()['content-type']).toMatch(
			/(?:application|text)\/(?:[\w.+-]+\+)?xml\b/
		);
		expect(await response.text()).toContain(feed.root);
		for (const keyboard of [false, true]) {
			await load(page, '/privacy');
			const link = page.locator('footer').getByRole('link', { name: feed.label, exact: true });
			if (keyboard) {
				await link.focus();
				await link.press('Enter');
			} else await link.click();
			await expect(page).toHaveURL((url) => url.pathname === feed.href);
		}
	});
}

test('footer external accounts open the intended URL in a safe new tab by pointer and keyboard', async ({
	page
}) => {
	await load(page, '/privacy');
	const links = page.locator('footer a[target="_blank"]');
	await expect(links).toHaveCount(4);
	for (const destination of [
		{ label: 'Substack newsletter', href: 'https://suvroghosh.substack.com/' },
		{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/suvro-ghosh-78a5aa278' },
		{ label: 'YouTube', href: 'https://www.youtube.com/@SuvroGhoshIN' },
		{ label: 'X (@suvroghoshin)', href: 'https://x.com/suvroghoshin' }
	]) {
		const link = page.locator('footer').getByRole('link', { name: destination.label });
		await expect(link).toHaveAttribute('href', destination.href);
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', /noopener/);
		await expect(link).toHaveAttribute('rel', /noreferrer/);
		for (const keyboard of [false, true]) {
			const popupPromise = page.waitForEvent('popup');
			if (keyboard) {
				await link.focus();
				await link.press('Enter');
			} else await link.click();
			const popup = await popupPromise;
			await expect(popup).toHaveURL(destination.href);
			await popup.close();
		}
	}
});

test('footer email activates the intended mailto without sending a message', async ({ page }) => {
	await load(page, '/privacy');
	const email = page
		.locator('footer')
		.getByRole('link', { name: 'contact@suvroghosh.in', exact: true });
	await expect(email).toHaveAttribute('href', 'mailto:contact@suvroghosh.in');
	await page.evaluate(() => {
		document.addEventListener('click', (event) => {
			const link = event.target instanceof Element ? event.target.closest('a') : null;
			if (link?.getAttribute('href') === 'mailto:contact@suvroghosh.in') {
				event.preventDefault();
				document.documentElement.dataset.mailtoActivations = String(
					Number(document.documentElement.dataset.mailtoActivations || 0) + 1
				);
			}
		});
	});
	await email.click();
	await email.focus();
	await email.press('Enter');
	await expect(page.locator('html')).toHaveAttribute('data-mailto-activations', '2');
});

test('footer privacy settings trap keyboard focus and restore their opener after Escape', async ({
	page
}) => {
	await load(page, '/about');
	const trigger = page
		.locator('footer')
		.getByRole('button', { name: 'Privacy & cookies', exact: true });
	await trigger.focus();
	await trigger.press('Enter');
	const dialog = page.getByRole('dialog', { name: 'Your visit. Your choices.' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('heading', { name: 'Your visit. Your choices.' })).toBeFocused();
	for (let index = 0; index < 12; index++) {
		await page.keyboard.press(index < 6 ? 'Tab' : 'Shift+Tab');
		expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
	}
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
	await trigger.click();
	await dialog.getByRole('link', { name: 'Read the full privacy note' }).click();
	await expectPage(page, '/privacy', /A small note\s*about privacy/);
	// The same link must also release the modal when already reading its destination.
	await trigger.click();
	await dialog.getByRole('link', { name: 'Read the full privacy note' }).click();
	await expectPage(page, '/privacy', /A small note\s*about privacy/);
	await page.locator('footer').getByRole('link', { name: 'Contact', exact: true }).click();
	await expectPage(page, '/contact', 'Contact');
});

test('header navigation works at its active breakpoint and closes the mobile menu', async ({
	page
}, testInfo) => {
	await load(page, '/privacy');
	const mobile = testInfo.project.name === 'mobile';
	const navigation = page.getByRole('navigation', {
		name: mobile ? 'Mobile and tablet navigation' : 'Primary navigation',
		includeHidden: true
	});
	const summary = page.locator('summary').filter({ hasText: 'Navigation menu' });
	for (const [label, href] of [
		['Work', '/projects'],
		['Writing', '/writing'],
		['Start Here', '/start-here'],
		['About', '/about']
	]) {
		if (mobile) await summary.click();
		await navigation.getByRole('link', { name: label, exact: true }).click();
		await expectPage(page, href);
		await expect(
			navigation.getByRole('link', { name: label, exact: true, includeHidden: true })
		).toHaveAttribute('aria-current', 'page');
		if (mobile) await expect(page.locator('details.mobile-navigation')).not.toHaveAttribute('open');
	}
	if (mobile) {
		await summary.focus();
		await summary.press('Enter');
		await expect(navigation).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(navigation).toBeHidden();
		await expect(summary).toBeFocused();
	}
});

test('command palette quick links close the modal and leave destination links usable', async ({
	page
}) => {
	test.setTimeout(120_000);
	await load(page, '/privacy');
	const trigger = page.getByRole('link', { name: 'Open search and shortcuts' });
	const dialog = page.getByRole('dialog', { name: 'Search & shortcuts' });
	for (const destination of footerPages.filter(
		(entry) => !['/images', '/privacy'].includes(entry.href)
	)) {
		await trigger.click();
		await expect(dialog).toBeVisible();
		const link = dialog.locator(`a[href="${destination.href}"]`);
		await link.focus();
		await link.press('Enter');
		await expectPage(page, destination.href, destination.heading);
	}
	await trigger.focus();
	await trigger.press('Enter');
	await expect(dialog.getByRole('searchbox')).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
});

test('command palette search preserves the query, closes the modal and allows further navigation', async ({
	page
}) => {
	await load(page, '/about');
	await page.keyboard.press('Control+k');
	const dialog = page.getByRole('dialog', { name: 'Search & shortcuts' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('searchbox', { name: 'Search all writing' }).fill('healthcare');
	await dialog.getByRole('button', { name: 'Search writing', exact: true }).click();
	await expect(page).toHaveURL(
		(url) => url.pathname === '/blog' && url.searchParams.get('search') === 'healthcare'
	);
	await expect(dialog).toBeHidden();
	await expectPage(page, '/blog', 'All Posts');
	await expect(page.locator('main').getByRole('searchbox').first()).toHaveValue('healthcare');
	const result = page
		.locator('section[aria-labelledby="search-results-heading"] a[href^="/blog/"]')
		.first();
	await expect(result).toBeVisible();
	const resultPath = await result.getAttribute('href');
	await result.click();
	await expectPage(page, resultPath!);
	await expect(page.locator('main').getByRole('heading', { level: 1 })).toBeVisible();
	await page.goBack();
	await expect(page).toHaveURL(
		(url) => url.pathname === '/blog' && url.searchParams.get('search') === 'healthcare'
	);
	await expectPage(page, '/blog', 'All Posts');
	await expect(page.locator('main').getByRole('searchbox').first()).toHaveValue('healthcare');
	await page.locator('footer').getByRole('link', { name: 'About Suvro', exact: true }).click();
	await expectPage(page, '/about', 'Suvro Ghosh');
	await page.keyboard.press('Control+k');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('searchbox', { name: 'Search all writing' }).fill('Calcutta');
	await dialog.getByRole('searchbox', { name: 'Search all writing' }).press('Enter');
	await expect(page).toHaveURL(
		(url) => url.pathname === '/blog' && url.searchParams.get('search') === 'Calcutta'
	);
	await expect(dialog).toBeHidden();
	await expectPage(page, '/blog', 'All Posts');
	await expect(page.locator('main').getByRole('searchbox').first()).toHaveValue('Calcutta');
	await page.locator('footer').getByRole('link', { name: 'Privacy note', exact: true }).click();
	await expectPage(page, '/privacy', /A small note\s*about privacy/);
});

test('a skipped view transition cannot strand a destination or leak a browser error', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.addInitScript(() => {
		localStorage.setItem('site-motion', 'gentle');
		const testWindow = window as Window & { __skippedTransitionCalls?: number };
		testWindow.__skippedTransitionCalls = 0;
		Object.defineProperty(document, 'startViewTransition', {
			configurable: true,
			value: () => {
				testWindow.__skippedTransitionCalls = (testWindow.__skippedTransitionCalls ?? 0) + 1;
				// A rejected capture must not prevent Kit from committing the destination.
				return {
					ready: Promise.reject(new DOMException('Transition was skipped', 'AbortError')),
					updateCallbackDone: Promise.resolve(),
					finished: Promise.resolve(),
					skipTransition() {}
				} as ViewTransition;
			}
		});
	});
	await load(page, '/privacy');
	await page.locator('footer').getByRole('link', { name: 'Writing', exact: true }).click();
	await expectPage(page, '/writing', 'Writings');
	await page.locator('footer').getByRole('link', { name: 'Topics', exact: true }).click();
	await expectPage(page, '/topics', 'Topic Headquarters');
	await page.goBack();
	await expectPage(page, '/writing', 'Writings');
	await page.goForward();
	await expectPage(page, '/topics', 'Topic Headquarters');
	expect(
		await page.evaluate(
			() => (window as Window & { __skippedTransitionCalls?: number }).__skippedTransitionCalls
		)
	).toBeGreaterThan(0);
});

test('reduced motion bypasses view transitions through navigation and history', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.addInitScript(() => {
		localStorage.setItem('site-motion', 'gentle');
		const testWindow = window as Window & { __unexpectedTransitionCalls?: number };
		testWindow.__unexpectedTransitionCalls = 0;
		Object.defineProperty(document, 'startViewTransition', {
			configurable: true,
			value: () => {
				testWindow.__unexpectedTransitionCalls = (testWindow.__unexpectedTransitionCalls ?? 0) + 1;
				throw new Error('Reduced motion must bypass view transitions');
			}
		});
	});
	await load(page, '/privacy');
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
	await page.locator('footer').getByRole('link', { name: 'Writing', exact: true }).click();
	await expectPage(page, '/writing', 'Writings');
	await page.locator('footer').getByRole('link', { name: 'Topics', exact: true }).click();
	await expectPage(page, '/topics', 'Topic Headquarters');
	await page.goBack();
	await expectPage(page, '/writing', 'Writings');
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
	expect(
		await page.evaluate(
			() =>
				(window as Window & { __unexpectedTransitionCalls?: number }).__unexpectedTransitionCalls
		)
	).toBe(0);
});

test('browser history closes shared dialogs before leaving their source page', async ({ page }) => {
	await load(page, '/privacy');
	await page.locator('footer').getByRole('link', { name: 'About Suvro', exact: true }).click();
	await expectPage(page, '/about', 'Suvro Ghosh');
	await page.getByRole('link', { name: 'Open search and shortcuts' }).click();
	await expect(page.getByRole('dialog', { name: 'Search & shortcuts' })).toBeVisible();
	await page.goBack();
	await expectPage(page, '/privacy', /A small note\s*about privacy/);
	await page.goForward();
	await expectPage(page, '/about', 'Suvro Ghosh');
	await page
		.locator('footer')
		.getByRole('button', { name: 'Privacy & cookies', exact: true })
		.click();
	await expect(page.getByRole('dialog', { name: 'Your visit. Your choices.' })).toBeVisible();
	await page.goBack();
	await expectPage(page, '/privacy', /A small note\s*about privacy/);
});

test('fresh visit can dismiss its notice and use footer links without choosing optional consent', async ({
	browser,
	baseURL
}, testInfo) => {
	const context = await browser.newContext({
		baseURL,
		serviceWorkers: 'block',
		viewport: testInfo.project.use.viewport,
		reducedMotion: 'reduce'
	});
	const optionalRequests: string[] = [];
	await context.route('**/*', (route) => {
		const url = route.request().url();
		if (
			/youtube|ytimg|googlevideo|vercel-insights|vitals\.vercel|\/api\/analytics\/pageview|\/_vercel\//.test(
				url
			)
		)
			optionalRequests.push(url);
		return new URL(url).origin === baseURL ? route.continue() : route.abort();
	});
	try {
		const page = await context.newPage();
		await load(page, '/about');
		expect(await page.evaluate(() => localStorage.getItem('suvroghosh:consent'))).toBeNull();
		const dismiss = page.getByRole('button', {
			name: 'Dismiss privacy notice without choosing',
			exact: true
		});
		await expect(dismiss).toBeVisible();
		const dismissBox = await dismiss.boundingBox();
		expect(dismissBox!.width).toBeGreaterThanOrEqual(44);
		expect(dismissBox!.height).toBeGreaterThanOrEqual(44);
		await dismiss.focus();
		await dismiss.press('Enter');
		await expect(page.locator('[data-privacy-note]')).toHaveCount(0);
		for (const destination of footerPages) {
			await page
				.locator('footer')
				.getByRole('link', { name: destination.label, exact: true })
				.click();
			await expectPage(page, destination.href, destination.heading);
			await expect(page.locator('[data-privacy-note]')).toHaveCount(0);
		}
		const settings = page
			.locator('footer')
			.getByRole('button', { name: 'Privacy & cookies', exact: true });
		await settings.click();
		await expect(page.getByRole('dialog', { name: 'Your visit. Your choices.' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(settings).toBeFocused();
		expect(await page.evaluate(() => localStorage.getItem('suvroghosh:consent'))).toBeNull();
		expect(optionalRequests).toEqual([]);
		await page.reload();
		await expect(page.locator('[data-privacy-note]')).toBeVisible();
		expect(await page.evaluate(() => localStorage.getItem('suvroghosh:consent'))).toBeNull();
		await load(
			page,
			'/blog/artificial-intelligence/the-magnificent-plumbing-department-of-artificial-intelligence'
		);
		await expect(page.locator('[data-raw-thought-layout]')).toBeVisible();
		await page
			.getByRole('button', { name: 'Dismiss privacy notice without choosing', exact: true })
			.click();
		const compactSettings = page.getByRole('button', {
			name: 'Privacy & cookies settings',
			exact: true
		});
		await expect(compactSettings).toBeVisible();
		await compactSettings.click();
		await expect(page.getByRole('dialog', { name: 'Your visit. Your choices.' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(compactSettings).toBeFocused();
		expect(await page.evaluate(() => localStorage.getItem('suvroghosh:consent'))).toBeNull();
		expect(optionalRequests).toEqual([]);
	} finally {
		await context.close();
	}
});

test('interactive Meaning Map preserves shared navigation and releases its overlay when leaving', async ({
	page
}) => {
	await load(page, '/blog/visualizations/the-meaning-connection-map');
	await expect(page.locator('[data-meaning-map] svg')).toBeVisible();
	await page.getByRole('link', { name: 'Open search and shortcuts' }).click();
	const dialog = page.getByRole('dialog', { name: 'Search & shortcuts' });
	await expect(dialog).toBeVisible();
	await dialog.locator('a[href="/about"]').click();
	await expectPage(page, '/about', 'Suvro Ghosh');
	await expect(page.locator('[data-meaning-map]')).toHaveCount(0);
	expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).not.toBe('hidden');
	await page.locator('footer').getByRole('link', { name: 'Contact', exact: true }).click();
	await expectPage(page, '/contact', 'Contact');
});

test.describe('progressive navigation without JavaScript', () => {
	test.use({ javaScriptEnabled: false });
	test('every internal footer destination remains a working ordinary anchor', async ({ page }) => {
		test.setTimeout(120_000);
		for (const destination of footerPages) {
			await page.goto(destination.href === '/privacy' ? '/about' : '/privacy');
			await page
				.locator('footer')
				.getByRole('link', { name: destination.label, exact: true })
				.click();
			await expectPage(page, destination.href, destination.heading);
		}
	});
});
