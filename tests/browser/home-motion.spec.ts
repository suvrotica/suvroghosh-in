import { expect, test, type Page } from '@playwright/test';

const homeTitle = 'Suvro Ghosh | Healthcare IT Architect & Clinical Data Systems Consultant';
const homeCanonical = 'https://www.suvroghosh.in';

const heroLinks = [
	['View Resume', '/resume'],
	['Projects', '/projects'],
	['Healthcare IT Consulting', '/consulting'],
	['Writings', '/writing'],
	['Contact', '/contact']
] as const;

const readingPathIds = ['orientation', 'healthcare', 'science', 'calcutta', 'fiction'] as const;

const portalLinks = {
	professional: [
		['Projects', '/projects'],
		['Resume', '/resume'],
		['Consulting', '/consulting'],
		['Gulf / Kuwait', '/healthcare-it-gulf']
	],
	writing: [
		['Writings', '/writing'],
		['All Posts', '/blog'],
		['Images', '/images'],
		['Music', '/topics/songs'],
		['Newsletter', 'https://suvroghosh.substack.com/']
	]
} as const;

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
			// The assertions expose an unexpected storage denial.
		}
	}, preference);
}

async function readGlyphGeometry(page: Page) {
	return page.locator('[data-recent-signal-card]').evaluateAll((cards) =>
		cards.map((card) => {
			const svg = card.querySelector<SVGElement>('[data-signal-glyph]');
			return {
				slug: card.getAttribute('data-recent-signal-card'),
				variant: svg?.getAttribute('data-signal-glyph'),
				paths: Array.from(svg?.querySelectorAll('path') ?? [], (path) => path.getAttribute('d')),
				nodes: Array.from(svg?.querySelectorAll('circle') ?? [], (circle) => ({
					cx: circle.getAttribute('cx'),
					cy: circle.getAttribute('cy'),
					r: circle.getAttribute('r')
				}))
			};
		})
	);
}

test('the living home preserves content, SEO, links, and one ambient owner', async ({ page }) => {
	const runtimeErrors = collectUnexpectedRuntimeErrors(page);
	await page.goto('/');

	await expect(page).toHaveTitle(homeTitle);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', homeCanonical);
	const structuredData = JSON.parse(
		(await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}'
	) as unknown;
	expect(JSON.stringify(structuredData)).toContain('"@type":"WebSite"');

	const home = page.locator('[data-living-home]');
	const hero = page.locator('[data-living-hero]');
	await expect(home).toHaveCount(1);
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
	await expect(page.getByRole('heading', { level: 1, name: 'Suvro Ghosh' })).toBeVisible();
	await expect(hero).toContainText('Healthcare IT · Interoperability · Applied AI · Calcutta');
	await expect(hero).toContainText('Healthcare IT Architect & Clinical Data Systems Consultant');
	await expect(hero).toContainText(
		'I work on healthcare data systems, interoperability, clinical data architecture'
	);

	const introductionLinks = hero.locator('.living-hero__actions');
	await expect(introductionLinks.getByRole('link')).toHaveCount(heroLinks.length);
	for (const [name, href] of heroLinks) {
		await expect(introductionLinks.getByRole('link', { name, exact: true })).toHaveAttribute(
			'href',
			href
		);
	}

	const readingCards = page.locator('[data-reading-path-card]');
	await expect(readingCards).toHaveCount(readingPathIds.length);
	for (const [index, pathId] of readingPathIds.entries()) {
		const card = readingCards.nth(index);
		await expect(card).toHaveAttribute('data-path-id', pathId);
		await expect(card).toHaveAttribute('href', `/start-here#${pathId}`);
		await expect(card.locator('h3')).not.toBeEmpty();
		await expect(card.locator('.reading-path-card__description')).not.toBeEmpty();
	}
	await expect(
		page.locator('[data-reading-path-rail]').getByRole('link', {
			name: 'Explore the reading paths',
			exact: true
		})
	).toHaveAttribute('href', '/start-here');

	const portals = page.locator('[data-world-portal]');
	await expect(portals).toHaveCount(2);
	for (const kind of ['professional', 'writing'] as const) {
		const portal = page.locator(`[data-world-portal="${kind}"]`);
		await expect(portal).toHaveCount(1);
		await expect(portal.getByRole('link')).toHaveCount(portalLinks[kind].length);
		for (const [name, href] of portalLinks[kind]) {
			const link =
				name === 'Newsletter'
					? portal.getByRole('link', { name: /^Newsletter/ })
					: portal.getByRole('link', { name, exact: true });
			await expect(link).toHaveAttribute('href', href);
		}
	}

	const recentCards = page.locator('[data-recent-signal-card]');
	await expect(recentCards).toHaveCount(4);
	await expect(recentCards.locator('h3')).toHaveCount(4);
	await expect(recentCards.locator('time')).toHaveCount(4);
	await expect(recentCards.locator('.recent-signal-card__description')).toHaveCount(4);
	await expect(page.locator('a a')).toHaveCount(0);

	await expect(page.locator('[data-route-atmosphere]')).toHaveCount(1);
	await expect(page.locator('[data-ambient-field]')).toHaveCount(1);
	await expect(home.locator('canvas')).toHaveCount(0);
	await expect(home.locator('video')).toHaveCount(0);

	const inactiveWillChange = await home
		.locator('.living-card__underlay, .world-portal__underlay')
		.evaluateAll((underlays) => underlays.map((element) => getComputedStyle(element).willChange));
	expect(inactiveWillChange.every((value) => value === 'auto')).toBe(true);
	expect(runtimeErrors).toEqual([]);
});

test('the full-bleed home and native reading rail stay inside desktop and mobile viewports', async ({
	page
}) => {
	await page.goto('/');

	const hero = page.locator('[data-living-hero]');
	const readingRail = page.locator('.reading-paths__rail');
	const readingColumn = page.locator('main#main-content > .container');
	const desktopHeroBox = await hero.boundingBox();
	const desktopColumnBox = await readingColumn.boundingBox();

	expect(desktopHeroBox).not.toBeNull();
	expect(desktopColumnBox).not.toBeNull();
	expect(desktopHeroBox!.width).toBeGreaterThan(desktopColumnBox!.width + 200);
	expect(desktopHeroBox!.x).toBeGreaterThanOrEqual(0);
	expect(desktopHeroBox!.x + desktopHeroBox!.width).toBeLessThanOrEqual(1441);
	await expectNoHorizontalOverflow(page);

	for (const link of await hero.getByRole('link').all()) {
		const bounds = await link.boundingBox();
		expect(bounds?.height).toBeGreaterThanOrEqual(44);
	}

	await page.setViewportSize({ width: 390, height: 844 });
	await expectNoHorizontalOverflow(page);

	const mobileHeroBox = await hero.boundingBox();
	expect(mobileHeroBox).not.toBeNull();
	expect(mobileHeroBox!.x).toBeGreaterThanOrEqual(0);
	expect(mobileHeroBox!.x + mobileHeroBox!.width).toBeLessThanOrEqual(391);

	const railState = await readingRail.evaluate((rail) => {
		rail.scrollLeft = 0;
		const style = getComputedStyle(rail);
		const bounds = rail.getBoundingClientRect();
		const cards = rail.querySelectorAll(':scope > li');
		const first = cards[0]?.getBoundingClientRect();
		const second = cards[1]?.getBoundingClientRect();

		return {
			clientWidth: rail.clientWidth,
			scrollWidth: rail.scrollWidth,
			scrollSnapType: style.scrollSnapType,
			overflowX: style.overflowX,
			railRight: bounds.right,
			firstRight: first?.right ?? 0,
			secondLeft: second?.left ?? Number.POSITIVE_INFINITY,
			secondRight: second?.right ?? 0
		};
	});

	expect(railState.scrollWidth).toBeGreaterThan(railState.clientWidth);
	expect(['inline', 'inline proximity', 'x', 'x proximity']).toContain(railState.scrollSnapType);
	expect(['auto', 'scroll']).toContain(railState.overflowX);
	expect(railState.secondLeft).toBeGreaterThanOrEqual(railState.firstRight);
	expect(railState.secondLeft).toBeLessThan(railState.railRight);
	expect(railState.secondRight).toBeGreaterThan(railState.railRight);

	await readingRail.evaluate((rail) => {
		rail.scrollLeft = 160;
	});
	await expect.poll(() => readingRail.evaluate((rail) => rail.scrollLeft)).toBeGreaterThan(0);
	await expectNoHorizontalOverflow(page);
});

test('the living home remains meaningful and navigable without JavaScript', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();

	try {
		await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });

		const home = page.locator('[data-living-home]');
		const hero = page.locator('[data-living-hero]');
		await expect(page.getByRole('heading', { level: 1, name: 'Suvro Ghosh' })).toBeVisible();
		await expect(hero).toContainText('Healthcare IT Architect & Clinical Data Systems Consultant');
		await expect(hero.locator('.living-hero__actions').getByRole('link')).toHaveCount(5);
		await expect(page.locator('[data-reading-path-card]')).toHaveCount(5);
		await expect(page.locator('[data-world-portal] a')).toHaveCount(9);
		await expect(page.locator('[data-recent-signal-card]')).toHaveCount(4);
		await expect(page.locator('[data-signal-glyph]')).toHaveCount(4);
		await expect(page.locator('[data-kinetic-line]')).toHaveAttribute(
			'data-kinetic-state',
			'static'
		);
		await expect(page.locator('[data-kinetic-line]')).toHaveAttribute('data-kinetic-index', '0');
		await expect(page.locator('[data-kinetic-line] .sr-only')).toContainText(
			'Suvro builds clinical data systems, writes essays and satire, makes scientific visual experiments, and maps ordinary Calcutta.'
		);

		await expect(page.locator('[data-route-atmosphere]')).toHaveCount(1);
		await expect(page.locator('canvas')).toHaveCount(0);
		await expect(home.locator('video')).toHaveCount(0);
		await expect(home.locator('img')).toHaveCount(0);
		await expect(page.locator('a a')).toHaveCount(0);
		await expectNoHorizontalOverflow(page);
	} finally {
		await context.close();
	}
});

test('signal glyph geometry is deterministic across themes, motion modes, and reload', async ({
	page
}) => {
	await page.goto('/');

	const glyphs = page.locator('[data-signal-glyph]');
	await expect(glyphs).toHaveCount(4);
	for (const glyph of await glyphs.all()) {
		await expect(glyph).toHaveAttribute('aria-hidden', 'true');
		await expect(glyph).toHaveAttribute('focusable', 'false');
	}

	const initialGeometry = await readGlyphGeometry(page);
	await page.getByLabel('Colour theme', { exact: true }).selectOption('night');
	await page.getByLabel('Motion preference', { exact: true }).selectOption('alive');
	expect(await readGlyphGeometry(page)).toEqual(initialGeometry);

	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'alive');
	expect(await readGlyphGeometry(page)).toEqual(initialGeometry);
	await expect(page.locator('[data-living-home] canvas')).toHaveCount(0);
});

test('the kinetic line is static for still and reduced motion and settles after one alive cycle', async ({
	page
}) => {
	await page.goto('/');

	const kineticLine = page.locator('[data-kinetic-line]');
	const motionSelect = page.getByLabel('Motion preference', { exact: true });
	await motionSelect.selectOption('still');
	await expect(kineticLine).toHaveAttribute('data-kinetic-state', 'static');
	await expect(kineticLine).toHaveAttribute('data-kinetic-index', '0');
	await page.waitForTimeout(1_200);
	await expect(kineticLine).toHaveAttribute('data-kinetic-index', '0');

	await motionSelect.selectOption('alive');
	await expect(kineticLine).toHaveAttribute('data-kinetic-state', 'running');
	await expect(kineticLine).toHaveAttribute('data-kinetic-index', '1', { timeout: 2_500 });
	await expect(kineticLine).toHaveAttribute('data-kinetic-state', 'settled', { timeout: 8_000 });
	await expect(kineticLine).toHaveAttribute('data-kinetic-index', '0');
	await page.waitForTimeout(1_800);
	await expect(kineticLine).toHaveAttribute('data-kinetic-state', 'settled');
	await expect(kineticLine).toHaveAttribute('data-kinetic-index', '0');

	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
	await expect(kineticLine).toHaveAttribute('data-kinetic-state', 'static');
	await expect(kineticLine).toHaveAttribute('data-kinetic-index', '0');
});

test('LivingCard applies bounded alive pointer variables and resets for stable focus', async ({
	page
}) => {
	const runtimeErrors = collectUnexpectedRuntimeErrors(page);
	await storeMotionBeforePageScripts(page, 'alive');
	await page.goto('/');

	expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(
		true
	);

	const card = page.locator('[data-reading-path-card]').first();
	await card.scrollIntoViewIfNeeded();
	const bounds = await card.boundingBox();
	expect(bounds).not.toBeNull();

	await card.dispatchEvent('pointerenter', {
		pointerType: 'mouse',
		clientX: bounds!.x + bounds!.width - 3,
		clientY: bounds!.y + bounds!.height - 3
	});
	await card.dispatchEvent('pointermove', {
		pointerType: 'mouse',
		clientX: bounds!.x + bounds!.width - 3,
		clientY: bounds!.y + bounds!.height - 3
	});
	await expect(card).toHaveAttribute('data-living-card-active', 'true');
	await expect
		.poll(() =>
			card.evaluate((element) => element.style.getPropertyValue('--living-card-rotate').trim())
		)
		.not.toBe('');

	const pose = await card.evaluate((element) => ({
		x: Number.parseFloat(element.style.getPropertyValue('--living-card-x')),
		y: Number.parseFloat(element.style.getPropertyValue('--living-card-y')),
		rotate: Number.parseFloat(element.style.getPropertyValue('--living-card-rotate')),
		contentTransform: getComputedStyle(element.querySelector<HTMLElement>('.living-card__content')!)
			.transform,
		underlayWillChange: getComputedStyle(
			element.querySelector<HTMLElement>('.living-card__underlay')!
		).willChange
	}));

	expect(Math.abs(pose.x)).toBeGreaterThan(1);
	expect(Math.abs(pose.x)).toBeLessThanOrEqual(5);
	expect(Math.abs(pose.y)).toBeLessThanOrEqual(4);
	expect(Math.abs(pose.rotate)).toBeGreaterThan(0.25);
	expect(Math.abs(pose.rotate)).toBeLessThanOrEqual(1.15);
	expect(pose.contentTransform).toBe('none');
	expect(pose.underlayWillChange).toContain('transform');

	await card.dispatchEvent('pointerleave', { pointerType: 'mouse' });
	await expect(card).toHaveAttribute('data-living-card-active', 'false');
	await expect
		.poll(() =>
			card.evaluate((element) => element.style.getPropertyValue('--living-card-x').trim())
		)
		.toBe('');
	await expect
		.poll(() =>
			card
				.locator('.living-card__underlay')
				.evaluate((element) => getComputedStyle(element).willChange)
		)
		.toBe('auto');

	await card.focus();
	await expect(card).toBeFocused();
	await expect(card).toHaveAttribute('data-living-card-active', 'false');
	expect(await card.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
	expect(runtimeErrors).toEqual([]);
});

test('coarse pointers cannot activate LivingCard tilt', async ({ browser, baseURL }) => {
	const context = await browser.newContext({
		baseURL,
		hasTouch: true,
		isMobile: true,
		viewport: { width: 390, height: 844 }
	});
	await context.addInitScript(() => {
		window.localStorage.setItem('site-motion', 'alive');
	});
	const page = await context.newPage();

	try {
		await page.goto('/');
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
		await expect(page.locator('html')).toHaveAttribute('data-motion', 'alive');

		const card = page.locator('[data-reading-path-card]').first();
		const bounds = await card.boundingBox();
		expect(bounds).not.toBeNull();
		await card.dispatchEvent('pointerenter', {
			pointerType: 'mouse',
			clientX: bounds!.x + bounds!.width - 2,
			clientY: bounds!.y + bounds!.height - 2
		});
		await card.dispatchEvent('pointermove', {
			pointerType: 'mouse',
			clientX: bounds!.x + bounds!.width - 2,
			clientY: bounds!.y + bounds!.height - 2
		});

		await expect(card).toHaveAttribute('data-living-card-active', 'false');
		expect(
			await card.evaluate((element) => ({
				x: element.style.getPropertyValue('--living-card-x'),
				y: element.style.getPropertyValue('--living-card-y'),
				rotate: element.style.getPropertyValue('--living-card-rotate'),
				willChange: getComputedStyle(element.querySelector<HTMLElement>('.living-card__underlay')!)
					.willChange
			}))
		).toEqual({
			x: '',
			y: '',
			rotate: '',
			willChange: 'auto'
		});
		await expectNoHorizontalOverflow(page);
	} finally {
		await context.close();
	}
});
