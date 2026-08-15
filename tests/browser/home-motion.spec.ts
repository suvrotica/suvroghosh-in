import { expect, test, type Page } from '@playwright/test';

const homeTitle = 'Suvro Ghosh | Healthcare IT Architect & Clinical Data Systems Consultant';
const homeCanonical = 'https://www.suvroghosh.in';
const featuredSeriesPath = '/blog/visualizations/the-prior-authorization-machine';
const featuredSeriesPoster = '/images/visualizations/prior-authorization-machine.png';

const heroLinks = [
	['View Projects', '/projects'],
	['Healthcare IT Consulting', '/consulting'],
	['Resume', '/resume'],
	['Writing', '/writing'],
	['Contact', '/contact']
] as const;

const fourWays = [
	['systems', 'Systems', '/projects'],
	['laboratory', 'Laboratory', '/blog/visualizations'],
	['writing', 'Writing', '/writing'],
	['calcutta', 'Calcutta', '/topics/calcutta']
] as const;

const narrativeStates = [
	'hero',
	'systems',
	'laboratory',
	'writing',
	'calcutta',
	'patient',
	'guided',
	'work',
	'latest',
	'closing'
] as const;

const readingPathIds = ['orientation', 'healthcare', 'science', 'calcutta', 'fiction'] as const;

const portalLinks = {
	professional: [
		['Projects', '/projects'],
		['Resume', '/resume'],
		['Consulting', '/consulting'],
		['Gulf / Kuwait', '/healthcare-it-gulf'],
		['Contact', '/contact']
	],
	creative: [
		['Essays', '/writing'],
		['Satire', '/blog/satire'],
		['Fiction', '/blog/short-fiction'],
		['Visualizations', '/blog/visualizations'],
		['Games', '/blog/games'],
		['Images', '/images'],
		['Music', '/topics/songs'],
		['Newsletter', 'https://suvroghosh.substack.com/']
	]
} as const;

function collectUnexpectedRuntimeErrors(page: Page): string[] {
	const errors: string[] = [];

	page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/')) return;
		if (/THREE\.WebGLRenderer:.*WebGL context/i.test(source)) return;
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

async function expectFeaturedSeries(page: Page) {
	const featuredSeries = page.locator('[data-featured-series]');
	const seriesList = featuredSeries.locator('ol[data-series-list]');
	const firstPart = seriesList.locator('li[data-series-part="1"]');
	const seriesLink = firstPart.locator('a.featured-series__card');
	const poster = firstPart.locator(`img[src="${featuredSeriesPoster}"]`);

	await expect(featuredSeries).toHaveCount(1);
	await expect(featuredSeries).toHaveAttribute('data-scene-state', 'patient');
	await expect(featuredSeries).toContainText('The Patient Through the Machine');
	await expect(seriesList).toHaveCount(1);
	await expect(firstPart).toHaveCount(1);
	await expect(seriesLink).toHaveCount(1);
	expect(await seriesLink.evaluate((link: HTMLAnchorElement) => new URL(link.href).pathname)).toBe(
		featuredSeriesPath
	);
	await expect(poster).toHaveAttribute('width', '1600');
	await expect(poster).toHaveAttribute('height', '900');
	await expect(poster).toHaveAttribute('alt', '');
}

async function storeMotionBeforePageScripts(page: Page, preference: string) {
	await page.addInitScript((nextPreference) => {
		window.localStorage.setItem('site-motion', nextPreference);
	}, preference);
}

async function expectStaticGlobalAtmosphere(page: Page) {
	await expect(page.locator('[data-route-atmosphere]')).toHaveAttribute('data-ambient', 'static');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
}

async function expectSettledPageScene(page: Page): Promise<'A' | 'B' | 'C'> {
	const scene = page.locator('[data-living-index-scene]');
	const canvas = page.locator('[data-living-index-canvas]');

	await expect(scene).toHaveCount(1);
	await expect(scene).toHaveAttribute('aria-hidden', 'true');
	await expect(scene.locator('[data-living-index-fallback]')).toHaveCount(1);
	await expect
		.poll(async () => scene.getAttribute('data-scene-status'), { timeout: 5_000 })
		.toMatch(/^(running|paused|fallback|failed)$/);

	const tier = await scene.getAttribute('data-scene-tier');
	expect(['A', 'B', 'C']).toContain(tier);
	await expectStaticGlobalAtmosphere(page);

	if (tier === 'A' || tier === 'B') {
		await expect(scene).toHaveAttribute('data-scene-status', /^(running|paused)$/);
		await expect(canvas).toHaveCount(1);
		await expect(canvas).toHaveAttribute('data-local-animation-owner', 'living-index');
		await expect(canvas).toHaveAttribute('aria-hidden', 'true');
		await expect(canvas).toHaveAttribute('role', 'presentation');
		await expect(canvas).toHaveCSS('pointer-events', 'none');
		expect(await canvas.evaluate((element) => element.tabIndex)).toBe(-1);
		await expect(page.locator('[data-local-animation-owner]')).toHaveCount(1);
	} else {
		await expect(canvas).toHaveCount(0);
		await expect(page.locator('[data-local-animation-owner="living-index"]')).toHaveCount(0);
	}

	return tier as 'A' | 'B' | 'C';
}

async function expectNarrativeOrder(page: Page) {
	const order = await page
		.locator('[data-living-home] [data-scene-state]:not([data-living-index-scene])')
		.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('data-scene-state')));
	expect(order).toEqual(narrativeStates);
}

test('the Living Index preserves semantic order, destination priority, and one local scene owner', async ({
	page
}) => {
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

	await expect(hero.getByRole('link')).toHaveCount(heroLinks.length);
	for (const [name, href] of heroLinks) {
		await expect(hero.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
	}
	await expect(hero.locator('.living-hero__actions a').first()).toHaveText('View Projects');
	await expect(hero.locator('.living-hero__actions a').nth(1)).toHaveText(
		'Healthcare IT Consulting'
	);

	const field = page.locator('[data-field-ways]');
	await expect(
		field.getByRole('heading', { level: 2, name: 'Four ways through the field', exact: true })
	).toBeVisible();
	for (const [state, name, href] of fourWays) {
		const item = field.locator(`li[data-scene-state="${state}"]`);
		const link = item.locator(`a[data-scene-destination="${state}"]`);
		await expect(item).toHaveCount(1);
		await expect(link).toHaveAttribute('href', href);
		await expect(link.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
	}

	await expectFeaturedSeries(page);
	await expectNarrativeOrder(page);

	const readingPaths = page.locator('[data-reading-path-rail]');
	await expect(readingPaths).toHaveAttribute('data-scene-state', 'guided');
	await expect(
		readingPaths.getByRole('heading', { level: 2, name: 'Five ways into the work', exact: true })
	).toBeVisible();
	const readingCards = readingPaths.locator('[data-reading-path-card]');
	await expect(readingCards).toHaveCount(readingPathIds.length);
	for (const [index, pathId] of readingPathIds.entries()) {
		await expect(readingCards.nth(index)).toHaveAttribute('data-path-id', pathId);
		await expect(readingCards.nth(index)).toHaveAttribute('href', `/start-here#${pathId}`);
	}
	await expect(
		readingPaths.getByRole('link', { name: 'Explore all five paths', exact: true })
	).toHaveAttribute('href', '/start-here');

	await expect(
		page.getByRole('heading', { level: 2, name: 'Professional and creative work', exact: true })
	).toBeVisible();
	for (const kind of ['professional', 'creative'] as const) {
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

	const recent = page.locator('[data-recent-signal-grid]');
	await expect(recent).toHaveAttribute('data-scene-state', 'latest');
	await expect(recent.locator('[data-recent-signal-card]')).toHaveCount(4);
	await expect(recent.locator('[data-signal-position="lead"]')).toHaveCount(1);
	await expect(recent.locator('[data-signal-position="supporting"]')).toHaveCount(3);
	await expect(recent.locator('h3')).toHaveCount(4);
	await expect(recent.locator('time')).toHaveCount(4);

	const closing = page.locator('[data-home-invitation]');
	await expect(closing).toHaveAttribute('data-scene-state', 'closing');
	await expect(closing.getByRole('heading', { level: 2 })).toContainText(
		'Have a difficult healthcare system'
	);
	await expect(closing.getByRole('link', { name: 'Contact', exact: true })).toHaveAttribute(
		'href',
		'/contact'
	);
	await expect(
		closing.getByRole('link', { name: 'Healthcare IT Consulting', exact: true })
	).toHaveAttribute('href', '/consulting');

	await expectSettledPageScene(page);
	await expect(home.locator('video')).toHaveCount(0);
	await expect(page.locator('a a')).toHaveCount(0);
	expect(runtimeErrors).toEqual([]);
});

test('390 px and 320 px layouts use ordinary vertical reading paths without overflow', async ({
	page
}) => {
	await page.goto('/?webgl=off');

	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 320, height: 568 }
	]) {
		await test.step(`${viewport.width}px`, async () => {
			await page.setViewportSize(viewport);
			await expectNoHorizontalOverflow(page);

			const railState = await page.locator('.reading-paths__rail').evaluate((rail) => {
				const bounds = rail.getBoundingClientRect();
				const cards = Array.from(rail.querySelectorAll(':scope > li'), (card) => {
					const cardBounds = card.getBoundingClientRect();
					return {
						left: cardBounds.left,
						right: cardBounds.right,
						top: cardBounds.top,
						bottom: cardBounds.bottom
					};
				});
				return {
					clientWidth: rail.clientWidth,
					scrollWidth: rail.scrollWidth,
					overflowX: getComputedStyle(rail).overflowX,
					left: bounds.left,
					right: bounds.right,
					cards
				};
			});

			expect(railState.scrollWidth).toBeLessThanOrEqual(railState.clientWidth + 1);
			expect(railState.overflowX).not.toBe('scroll');
			expect(railState.cards).toHaveLength(5);
			for (const [index, card] of railState.cards.entries()) {
				expect(card.left).toBeGreaterThanOrEqual(railState.left - 1);
				expect(card.right).toBeLessThanOrEqual(railState.right + 1);
				if (index > 0) expect(card.top).toBeGreaterThanOrEqual(railState.cards[index - 1].bottom);
			}

			for (const section of await page
				.locator(
					'[data-living-hero], [data-field-ways], [data-featured-series], [data-reading-path-rail], [data-work-worlds], [data-recent-signal-grid], [data-home-invitation]'
				)
				.all()) {
				const box = await section.boundingBox();
				expect(box).not.toBeNull();
				expect(box!.x).toBeGreaterThanOrEqual(-1);
				expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
			}
		});
	}
});

test('the latest lead story stays editorially balanced in landscape and portrait', async ({
	page
}) => {
	await page.goto('/?webgl=off');

	for (const viewport of [
		{ width: 1366, height: 768, regime: 'wide' },
		{ width: 1269, height: 1423, regime: 'wide' },
		{ width: 1024, height: 1366, regime: 'intermediate' },
		{ width: 768, height: 1024, regime: 'compact' },
		{ width: 390, height: 844, regime: 'compact' }
	] as const) {
		await test.step(`${viewport.width}×${viewport.height}`, async () => {
			await page.setViewportSize(viewport);
			await page.evaluate(async () => {
				await document.fonts.ready;
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			});

			const layout = await page.locator('[data-recent-signal-grid]').evaluate((section) => {
				const grid = section.querySelector<HTMLElement>('.recent-signals__grid');
				const lead = section.querySelector<HTMLElement>('[data-signal-position="lead"]');
				const leadCard = lead?.querySelector<HTMLElement>('[data-recent-signal-card]');
				const action = leadCard?.querySelector<HTMLElement>('.recent-signal-card__action');
				const media = leadCard?.querySelector<HTMLElement>(
					'.recent-signal-card__media, .recent-signal-card__fallback'
				);
				const supporting = Array.from(
					section.querySelectorAll<HTMLElement>('[data-signal-position="supporting"]')
				);

				if (!grid || !lead || !leadCard || !action || !media) {
					throw new Error('Latest-grid geometry missing');
				}

				const bounds = (element: Element) => {
					const box = element.getBoundingClientRect();
					return {
						left: box.left,
						right: box.right,
						top: box.top,
						bottom: box.bottom,
						width: box.width,
						height: box.height
					};
				};
				const siblings = Array.from(action.parentElement?.children ?? []);
				const actionIndex = siblings.indexOf(action);
				const precedingBottom = Math.max(
					...siblings.slice(0, actionIndex).map((element) => element.getBoundingClientRect().bottom)
				);
				const actionBounds = action.getBoundingClientRect();

				return {
					grid: bounds(grid),
					lead: bounds(lead),
					leadCard: bounds(leadCard),
					action: bounds(action),
					media: bounds(media),
					mediaOrientation: media.dataset.mediaOrientation ?? 'fallback',
					supporting: supporting.map(bounds),
					blankBeforeAction: actionBounds.top - precedingBottom,
					blankAfterAction: leadCard.getBoundingClientRect().bottom - actionBounds.bottom
				};
			});

			expect(layout.blankBeforeAction).toBeLessThanOrEqual(64);
			expect(layout.blankBeforeAction / layout.leadCard.height).toBeLessThanOrEqual(0.12);
			expect(layout.blankAfterAction).toBeGreaterThanOrEqual(0);
			if (viewport.regime === 'intermediate') {
				expect(layout.blankAfterAction / layout.leadCard.height).toBeLessThanOrEqual(0.35);
			} else {
				expect(layout.blankAfterAction).toBeLessThanOrEqual(64);
			}
			const mediaAspectRatio = layout.media.width / layout.media.height;
			if (viewport.regime === 'compact') {
				expect(mediaAspectRatio).toBeCloseTo(4 / 3, 2);
			} else if (layout.mediaOrientation === 'portrait') {
				expect(mediaAspectRatio).toBeCloseTo(3 / 4, 2);
			} else {
				expect(mediaAspectRatio).toBeCloseTo(1, 2);
			}
			for (const card of [layout.lead, ...layout.supporting]) {
				expect(card.left).toBeGreaterThanOrEqual(layout.grid.left - 1);
				expect(card.right).toBeLessThanOrEqual(layout.grid.right + 1);
			}

			if (viewport.regime === 'wide') {
				for (const supporting of layout.supporting) {
					expect(layout.lead.right).toBeLessThanOrEqual(supporting.left);
				}
				for (let index = 1; index < layout.supporting.length; index += 1) {
					expect(layout.supporting[index].top).toBeGreaterThanOrEqual(
						layout.supporting[index - 1].bottom
					);
				}
			} else if (viewport.regime === 'intermediate') {
				for (const supporting of layout.supporting) {
					expect(supporting.top).toBeGreaterThanOrEqual(layout.lead.bottom);
					expect(Math.abs(supporting.top - layout.supporting[0].top)).toBeLessThanOrEqual(1);
				}
			} else {
				const cards = [layout.lead, ...layout.supporting];
				for (let index = 1; index < cards.length; index += 1) {
					expect(cards[index].top).toBeGreaterThanOrEqual(cards[index - 1].bottom);
				}
			}

			await expectNoHorizontalOverflow(page);
		});
	}
});

test('the hero scroll cue gets out of the way after the reader begins', async ({ page }) => {
	await page.goto('/?webgl=off');
	const cue = page.locator('.living-hero__cue');
	await expect(cue).toBeVisible();
	await page.evaluate(() => window.scrollTo(0, 80));
	await expect(cue).toBeHidden();
});

test('an enhanced scene follows the semantic patient and closing anchors on scroll', async ({
	page
}, testInfo) => {
	await page.goto('/');
	const scene = page.locator('[data-living-index-scene]');
	const tier = await expectSettledPageScene(page);
	if (tier === 'C') {
		testInfo.annotations.push({
			type: 'scene-fallback',
			description: 'WebGL was unavailable; Tier C correctly retained the semantic DOM.'
		});
		return;
	}

	await page.locator('[data-featured-series]').evaluate((section) => {
		section.scrollIntoView({ block: 'center' });
	});
	await expect(scene).toHaveAttribute('data-scene-state', 'patient');

	await page.locator('[data-home-invitation]').evaluate((section) => {
		section.scrollIntoView({ block: 'center' });
	});
	await expect(scene).toHaveAttribute('data-scene-state', 'closing');
});

test('Still, reduced motion, Save-Data, and the explicit switch all use Tier C', async ({
	browser,
	baseURL
}) => {
	const fixtures: ReadonlyArray<{
		name: string;
		path: string;
		motion?: 'still';
		reducedMotion?: 'reduce';
		saveData?: boolean;
	}> = [
		{ name: 'explicit WebGL off', path: '/?webgl=off' },
		{ name: 'site Still', path: '/', motion: 'still' },
		{ name: 'OS reduced motion', path: '/', reducedMotion: 'reduce' },
		{ name: 'Save-Data', path: '/', saveData: true }
	];

	for (const fixture of fixtures) {
		await test.step(fixture.name, async () => {
			const context = await browser.newContext({
				baseURL,
				reducedMotion: fixture.reducedMotion
			});
			if (fixture.motion) {
				await context.addInitScript((motion) => {
					window.localStorage.setItem('site-motion', motion);
				}, fixture.motion);
			}
			if (fixture.saveData) {
				await context.addInitScript(() => {
					const connection = new EventTarget();
					Object.defineProperty(connection, 'saveData', { value: true });
					Object.defineProperty(navigator, 'connection', {
						configurable: true,
						value: connection
					});
				});
			}

			const page = await context.newPage();
			try {
				await page.goto(fixture.path);
				const scene = page.locator('[data-living-index-scene]');
				await expect(scene).toHaveAttribute('data-scene-tier', 'C');
				await expect(scene).toHaveAttribute('data-scene-status', 'fallback');
				await expect(scene.locator('[data-living-index-fallback]')).toBeVisible();
				await expect(scene.locator('[data-living-index-canvas]')).toHaveCount(0);
				await expectStaticGlobalAtmosphere(page);
			} finally {
				await context.close();
			}
		});
	}
});

test('a WebGL creation failure falls back to the Tier C DOM environment', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({ baseURL });
	await context.addInitScript(() => {
		const nativeGetContext = HTMLCanvasElement.prototype.getContext;
		let webglCalls = 0;
		Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
			configurable: true,
			value(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
				if (contextId.startsWith('webgl') && ++webglCalls > 1) return null;
				return Reflect.apply(nativeGetContext, this, [contextId, ...args]);
			}
		});
	});
	const page = await context.newPage();

	try {
		await page.goto('/');
		const scene = page.locator('[data-living-index-scene]');
		await expect(scene).toHaveAttribute('data-scene-status', 'failed', { timeout: 5_000 });
		await expect(scene).toHaveAttribute('data-scene-tier', 'C');
		await expect(scene.locator('[data-living-index-canvas]')).toHaveCount(0);
		await expect(scene.locator('[data-living-index-fallback]')).toBeVisible();
		await expectStaticGlobalAtmosphere(page);
	} finally {
		await context.close();
	}
});

test('the Living Index remains complete, semantic, and attractive without JavaScript', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		viewport: { width: 320, height: 568 }
	});
	const page = await context.newPage();

	try {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { level: 1, name: 'Suvro Ghosh' })).toBeVisible();
		await expectNarrativeOrder(page);
		await expect(
			page.getByRole('heading', { level: 2, name: 'Four ways through the field' })
		).toBeVisible();
		await expect(page.locator('[data-field-way]')).toHaveCount(4);
		await expectFeaturedSeries(page);
		await expect(page.locator('[data-reading-path-card]')).toHaveCount(5);
		await expect(page.locator('[data-world-portal]')).toHaveCount(2);
		await expect(page.locator('[data-recent-signal-card]')).toHaveCount(4);
		await expect(page.locator('[data-home-invitation]')).toBeVisible();

		const scene = page.locator('[data-living-index-scene]');
		await expect(scene).toHaveAttribute('data-scene-tier', 'C');
		await expect(scene).toHaveAttribute('data-scene-status', 'fallback');
		await expect(scene.locator('[data-living-index-fallback]')).toBeVisible();
		await expect(page.locator('canvas')).toHaveCount(0);
		await expectStaticGlobalAtmosphere(page);
		await expect(page.locator('a a')).toHaveCount(0);
		await expectNoHorizontalOverflow(page);
	} finally {
		await context.close();
	}
});

test('Alive cards keep static underlays and stable keyboard focus', async ({ page }) => {
	const runtimeErrors = collectUnexpectedRuntimeErrors(page);
	await storeMotionBeforePageScripts(page, 'alive');
	await page.goto('/?webgl=off');

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
	await expect(card).not.toHaveAttribute('data-living-card-active', /.+/);

	const pose = await card.evaluate((element) => ({
		x: element.style.getPropertyValue('--living-card-x'),
		y: element.style.getPropertyValue('--living-card-y'),
		rotate: element.style.getPropertyValue('--living-card-rotate'),
		contentTransform: getComputedStyle(element.querySelector<HTMLElement>('.living-card__content')!)
			.transform,
		underlayTransform: getComputedStyle(
			element.querySelector<HTMLElement>('.living-card__underlay')!
		).transform,
		underlayWillChange: getComputedStyle(
			element.querySelector<HTMLElement>('.living-card__underlay')!
		).willChange
	}));

	expect(pose).toEqual({
		x: '',
		y: '',
		rotate: '',
		contentTransform: 'none',
		underlayTransform: 'none',
		underlayWillChange: 'auto'
	});

	await card.focus();
	await expect(card).toBeFocused();
	expect(await card.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
	expect(runtimeErrors).toEqual([]);
});
