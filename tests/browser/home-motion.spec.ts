import { expect, test, type Page } from '@playwright/test';

const homeTitle = 'Suvro Ghosh | Independent Entrepreneur, Maker & Writer';
const homeCanonical = 'https://www.suvroghosh.in';
const readingPathIds = ['orientation', 'healthcare', 'science', 'calcutta', 'fiction'] as const;
const workSamples = [
	['Interactive Visualization Library', '/blog/visualizations'],
	['Living Pigment Studio', '/blog/visualizations/create-art-living-pigment-studio'],
	['SuvroGhosh.IN Editorial Publishing System', '/writing']
] as const;

function collectRuntimeErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		if (`${message.location().url} ${message.text()}`.includes('/_vercel/')) return;
		errors.push(message.text());
	});
	return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
}

async function expectArtworkLoaded(page: Page) {
	const artwork = page.locator('img[data-hero-artwork]');
	await expect(artwork).toBeVisible();
	await expect(artwork).toHaveAttribute('alt', /\S/);
	await expect
		.poll(() =>
			artwork.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
		)
		.toBe(true);
}

async function expectStaticHomepage(page: Page) {
	await expect(page.locator('[data-living-index-scene], canvas')).toHaveCount(0);
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
	await expect(page.locator('[data-route-atmosphere]')).toHaveAttribute('data-ambient', 'static');
}

async function expectStableArtworkHover(page: Page) {
	const artworkLink = page.locator('a:has(img[data-hero-artwork])');
	await page.mouse.move(0, 0);
	const initialTransform = await artworkLink.evaluate((link) => getComputedStyle(link).transform);
	await artworkLink.hover();
	const hoverTransforms = await artworkLink.evaluate(async (link) => {
		const transforms: string[] = [];
		for (let frame = 0; frame < 3; frame += 1) {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			transforms.push(getComputedStyle(link).transform);
		}
		return transforms;
	});
	expect(hoverTransforms).toEqual([initialTransform, initialTransform, initialTransform]);
}

test('the fieldbook introduces Suvro, prioritises work and writing, and preserves search metadata', async ({
	page
}) => {
	const runtimeErrors = collectRuntimeErrors(page);
	await page.goto('/');

	await expect(page).toHaveTitle(homeTitle);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', homeCanonical);
	const schema = await page.locator('script[type="application/ld+json"]').first().textContent();
	expect(JSON.stringify(JSON.parse(schema ?? '{}'))).toContain('"@type":"WebSite"');
	await expect(page.locator('[data-fieldbook-home][data-living-home]')).toHaveCount(1);
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
	await expect(page.getByRole('heading', { level: 1, name: 'Suvro Ghosh' })).toBeVisible();

	const hero = page.locator('[data-living-hero]');
	await expect(hero).toContainText(/independent entrepreneur, maker and writer/i);
	await expect(hero.getByRole('link', { name: 'Explore the work', exact: true })).toHaveAttribute(
		'href',
		'/projects'
	);
	await expect(hero.getByRole('link', { name: 'Read the writing', exact: true })).toHaveAttribute(
		'href',
		'/writing'
	);
	await expect(hero.locator('a:has(img[data-hero-artwork])')).toHaveAttribute(
		'href',
		'/blog/visualizations/create-art-living-pigment-studio'
	);
	await expect(hero.locator('a:has(img)').nth(1)).toHaveAttribute(
		'href',
		'/blog/visualizations/mrinmoyee-the-durga-atelier'
	);
	await expectArtworkLoaded(page);
	await expectStaticHomepage(page);
	await expect(page.locator('a a')).toHaveCount(0);
	expect(runtimeErrors).toEqual([]);
});

test('selected work provides three visual exhibits with real destinations and loaded images', async ({
	page
}) => {
	await page.goto('/');
	const samples = page.locator('[data-work-worlds] [data-work-project]');
	await expect(samples).toHaveCount(workSamples.length);
	for (const [index, [title, href]] of workSamples.entries()) {
		const sample = samples.nth(index);
		await expect(sample.getByRole('heading', { level: 3, name: title, exact: true })).toBeVisible();
		await expect(sample.locator(`a[href="${href}"]`).first()).toBeVisible();
		await expect(sample.locator('img, svg[role="img"]')).toHaveCount(1);
	}

	for (const image of await page.locator('[data-fieldbook-home] img').all()) {
		await image.scrollIntoViewIfNeeded();
		await expect
			.poll(() =>
				image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)
			)
			.toBe(true);
	}
});

test('recent writing and the compact index lead to articles, reading paths and the featured series', async ({
	page
}) => {
	await page.goto('/');
	const recent = page.locator('[data-recent-signal-grid]');
	const stories = recent.locator('[data-recent-signal-card]');
	await expect(stories).toHaveCount(4);
	await expect(recent.locator('[data-signal-position="lead"]')).toHaveCount(1);
	await expect(recent.locator('[data-signal-position="supporting"]')).toHaveCount(3);
	for (const story of await stories.all()) {
		await expect(story).toHaveAttribute('href', /^\/blog\/[^/]+\/[^/]+$/);
		await expect(story.getByRole('heading', { level: 3 })).toHaveText(/\S/);
		await expect(story.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}/);
	}

	const index = page.locator('[data-fieldbook-index]');
	await expect(index).toHaveCount(1);
	const readingPaths = page.locator('[data-fieldbook-index][data-reading-path-rail]');
	await expect(readingPaths.locator('[data-reading-path-card]')).toHaveCount(5);
	for (const id of readingPathIds) {
		await expect(
			readingPaths.locator(`[data-reading-path-card][data-path-id="${id}"]`)
		).toHaveAttribute('href', `/start-here#${id}`);
	}
	const series = index.locator('[data-featured-series]');
	await expect(series).toContainText('The Patient Through the Machine');
	await expect(
		series.locator(
			'[data-series-part="1"] a[href="/blog/visualizations/the-prior-authorization-machine"]'
		)
	).toHaveCount(1);

	const invitation = page.locator('[data-home-invitation]');
	await expect(invitation.getByRole('link', { name: 'About Suvro', exact: true })).toHaveAttribute(
		'href',
		'/about'
	);
	await expect(invitation.getByRole('link', { name: 'Get in touch', exact: true })).toHaveAttribute(
		'href',
		'/contact'
	);
	await expect(invitation.getByRole('link', { name: /Videos/ })).toHaveAttribute(
		'href',
		/^https:\/\//
	);
	await expect(invitation.getByRole('link', { name: /Newsletter/ })).toHaveAttribute(
		'href',
		/^https:\/\//
	);
});

test('desktop, tablet and small phones fit the viewport and mobile opens with visible artwork', async ({
	page
}) => {
	await page.goto('/');
	for (const viewport of [
		{ width: 1440, height: 1000 },
		{ width: 1024, height: 1366 },
		{ width: 768, height: 1024 },
		{ width: 390, height: 844 },
		{ width: 320, height: 568 }
	]) {
		await test.step(`${viewport.width}px`, async () => {
			await page.setViewportSize(viewport);
			await page.evaluate(async () => {
				await document.fonts.ready;
				window.scrollTo(0, 0);
			});
			await expectNoHorizontalOverflow(page);
			for (const section of await page
				.locator('[data-fieldbook-home] > section, [data-fieldbook-index]')
				.all()) {
				const box = await section.boundingBox();
				expect(box).not.toBeNull();
				expect(box!.x).toBeGreaterThanOrEqual(-1);
				expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
			}
			if (viewport.width === 390) {
				const artwork = await page.locator('img[data-hero-artwork]').boundingBox();
				expect(artwork).not.toBeNull();
				const visibleHeight =
					Math.min(artwork!.y + artwork!.height, viewport.height) - Math.max(0, artwork!.y);
				expect(visibleHeight).toBeGreaterThanOrEqual(80);
			}
		});
	}
});

test('primary links support ordinary keyboard navigation and appearance persists after reload', async ({
	page
}) => {
	await page.goto('/');
	const hero = page.locator('[data-living-hero]');
	const work = hero.getByRole('link', { name: 'Explore the work', exact: true });
	const writing = hero.getByRole('link', { name: 'Read the writing', exact: true });
	await work.focus();
	await expect(work).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(writing).toBeFocused();
	const focusVisible = await writing.evaluate((link) => {
		const style = getComputedStyle(link);
		return (
			link.matches(':focus-visible') &&
			((style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) ||
				style.boxShadow !== 'none')
		);
	});
	expect(focusVisible).toBe(true);

	const appearance = page.getByRole('combobox', { name: 'Colour theme', exact: true }).first();
	await expect(appearance).toBeEnabled();
	for (const theme of ['paper', 'night']) {
		await appearance.selectOption(theme);
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await expectArtworkLoaded(page);
		await expectNoHorizontalOverflow(page);
	}
});

test('reduced motion and unavailable WebGL preserve the complete static fieldbook', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({ baseURL, reducedMotion: 'reduce' });
	await context.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
			value(this: HTMLCanvasElement, id: string, ...args: unknown[]) {
				if (id.startsWith('webgl')) throw new Error('The homepage must not require WebGL');
				return Reflect.apply(original, this, [id, ...args]);
			}
		});
	});
	const page = await context.newPage();
	const runtimeErrors = collectRuntimeErrors(page);
	try {
		await page.goto('/');
		await expectArtworkLoaded(page);
		await expectStaticHomepage(page);
		await expect(page.locator('[data-work-worlds] [data-work-project]')).toHaveCount(3);
		await expect(page.locator('[data-reading-path-card]')).toHaveCount(5);
		await expect(page.locator('[data-recent-signal-card]')).toHaveCount(4);
		await expectStableArtworkHover(page);
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await page.getByLabel('Motion preference', { exact: true }).selectOption('still');
		await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
		await expectStableArtworkHover(page);
		expect(runtimeErrors).toEqual([]);
	} finally {
		await context.close();
	}
});

test('the page remains complete, illustrated and navigable without JavaScript', async ({
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
		await expectArtworkLoaded(page);
		await expect(page.locator('[data-work-worlds] [data-work-project]')).toHaveCount(3);
		await expect(page.locator('[data-reading-path-card]')).toHaveCount(5);
		const firstPart = page.locator('[data-featured-series] [data-series-part="1"] a');
		expect(await firstPart.evaluate((link: HTMLAnchorElement) => new URL(link.href).pathname)).toBe(
			'/blog/visualizations/the-prior-authorization-machine'
		);
		await expect(page.locator('[data-recent-signal-card]')).toHaveCount(4);
		await expect(page.locator('[data-home-invitation]')).toBeVisible();
		await expectStaticHomepage(page);
		await expectNoHorizontalOverflow(page);
	} finally {
		await context.close();
	}
});
