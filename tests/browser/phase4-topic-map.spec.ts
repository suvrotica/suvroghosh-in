import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';

const topicSlugs = [
	'bipolar-depression',
	'calcutta',
	'codex-desktop',
	'healthcare-ai',
	'hl7-fhir',
	'interactive-mathematics',
	'sketch',
	'songs'
] as const;
const topicHrefs = topicSlugs.map((slug) => `/topics/${slug}`).sort();
const exploredTopic = 'interactive-mathematics';
const phase4AfterDirectory = resolvePath('artifacts/motion/phase4-after');

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

async function blockHydration(page: Page) {
	await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
}

async function uniqueHrefs(locator: Locator) {
	return locator.evaluateAll((elements) =>
		Array.from(
			new Set(
				elements
					.map((element) => {
						const anchor = element.matches('a[href]') ? element : element.querySelector('a[href]');
						const href = anchor?.getAttribute('href');
						return href ? new URL(href, document.baseURI).pathname : '';
					})
					.filter(Boolean)
			)
		).sort()
	);
}

async function waitForFiniteMapMotion(page: Page) {
	await page.locator('[data-living-topic-map]').waitFor();
	await page.evaluate(async () => {
		await document.fonts.ready;

		const map = document.querySelector('[data-living-topic-map]');
		if (!map) throw new Error('Living Topic Map is missing');
		const finiteAnimations = map.getAnimations({ subtree: true }).filter((animation) => {
			const iterations = Number(animation.effect?.getComputedTiming().iterations ?? 1);
			return Number.isFinite(iterations);
		});

		await Promise.allSettled(finiteAnimations.map((animation) => animation.finished));
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
		});
	});
}

async function mapGeometry(page: Page) {
	return page.locator('[data-topic-map-mode="desktop"]').evaluate((map) => {
		const svg = map.querySelector('svg');
		if (!(svg instanceof SVGSVGElement)) throw new Error('Desktop topic SVG is missing');

		const round = (value: number) => Math.round(value * 100) / 100;
		const nodes = Array.from(map.querySelectorAll<SVGGraphicsElement>('[data-topic-node]'))
			.map((node) => {
				const bounds = node.getBBox();
				return {
					slug: node.getAttribute('data-topic-node') ?? '',
					x: round(bounds.x),
					y: round(bounds.y),
					width: round(bounds.width),
					height: round(bounds.height)
				};
			})
			.sort((left, right) => left.slug.localeCompare(right.slug));
		const edges = Array.from(map.querySelectorAll<SVGElement>('[data-topic-edge]'))
			.map((edge) => ({
				source: edge.dataset.source ?? '',
				target: edge.dataset.target ?? '',
				path: edge.getAttribute('d') ?? edge.querySelector('path')?.getAttribute('d') ?? ''
			}))
			.sort(
				(left, right) =>
					left.source.localeCompare(right.source) || left.target.localeCompare(right.target)
			);

		return {
			viewBox: {
				x: svg.viewBox.baseVal.x,
				y: svg.viewBox.baseVal.y,
				width: svg.viewBox.baseVal.width,
				height: svg.viewBox.baseVal.height
			},
			nodes,
			edges
		};
	});
}

type EdgeState = {
	id: string;
	source: string;
	target: string;
	state: string;
};

async function edgeStates(page: Page): Promise<EdgeState[]> {
	return page.locator('[data-topic-map-mode="desktop"] [data-topic-edge]').evaluateAll((edges) =>
		edges
			.map((edge) => ({
				id: edge.getAttribute('data-topic-edge') ?? '',
				source: edge.getAttribute('data-source') ?? '',
				target: edge.getAttribute('data-target') ?? '',
				state: edge.getAttribute('data-state') ?? ''
			}))
			.sort((left, right) => left.id.localeCompare(right.id))
	);
}

type EdgeAnimationStyle = {
	name: string;
	duration: string;
	iterations: string;
	dashOffset: string;
};

async function edgeAnimationStyles(page: Page): Promise<EdgeAnimationStyle[]> {
	return page.locator('[data-topic-map-mode="desktop"] [data-topic-edge]').evaluateAll((edges) =>
		edges.map((edge) => {
			const animatedElement = edge.matches('path') ? edge : (edge.querySelector('path') ?? edge);
			const style = getComputedStyle(animatedElement);
			return {
				name: style.animationName,
				duration: style.animationDuration,
				iterations: style.animationIterationCount,
				dashOffset: style.strokeDashoffset
			};
		})
	);
}

function hasCSSAnimation(style: EdgeAnimationStyle) {
	return (
		style.name.split(',').some((name) => name.trim() !== 'none') &&
		style.duration.split(',').some((duration) => Number.parseFloat(duration) > 0)
	);
}

test('the SSR map preserves the canonical topic inventory without Canvas', async ({
	page,
	request
}) => {
	const response = await request.get('/topics');
	expect(response.status()).toBe(200);
	const html = await response.text();
	const manifestResponse = await request.get('/site.webmanifest');
	expect(manifestResponse.status()).toBe(200);
	expect(await manifestResponse.json()).toMatchObject({
		background_color: '#171512',
		theme_color: '#171512'
	});

	expect(html).toContain('data-living-topic-map');
	expect(html).not.toContain('<canvas');
	const ssrTopicHrefs = Array.from(
		html.matchAll(/\shref="([^"]+)"/g),
		([, href]) => new URL(href, 'https://preview.invalid/topics').pathname
	).filter((href) => topicHrefs.includes(href));
	for (const slug of topicSlugs) {
		expect(html.split(`data-topic-node="${slug}"`)).toHaveLength(2);
		expect(ssrTopicHrefs.filter((href) => href === `/topics/${slug}`)).toHaveLength(3);
	}

	const runtimeErrors = collectUnexpectedRuntimeErrors(page);
	await page.goto('/topics', { waitUntil: 'domcontentloaded' });

	const map = page.locator('[data-living-topic-map]');
	const desktop = map.locator('[data-topic-map-mode="desktop"]');
	const mobile = map.locator('[data-topic-map-mode="mobile"]');
	const directoryLinks = page.locator('[data-topic-directory] a[href]');
	await expect(page.getByRole('heading', { level: 1, name: 'Topic Headquarters' })).toHaveCount(1);
	await expect(
		page.getByRole('heading', { level: 2, name: 'Explore the topic territories' })
	).toBeVisible();
	await expect(map).toHaveCount(1);
	await expect(map.locator('canvas')).toHaveCount(0);
	await expect(desktop).toBeVisible();
	await expect(desktop).toHaveAccessibleName('Explore Topic Headquarters as connected territories');
	await expect(mobile).toBeHidden();
	await expect(desktop.locator('[data-topic-node]')).toHaveCount(8);
	await expect(desktop.locator('[data-topic-territory]')).toHaveCount(6);
	await expect(desktop.locator('[data-topic-edge]')).toHaveCount(13);
	await expect(directoryLinks).toHaveCount(8);
	expect(await uniqueHrefs(desktop.locator('[data-topic-node]'))).toEqual(topicHrefs);
	expect(await uniqueHrefs(mobile.locator('a[href]'))).toEqual(topicHrefs);
	expect(await uniqueHrefs(directoryLinks)).toEqual(topicHrefs);
	expect(
		await desktop.locator('[data-topic-node]').evaluateAll((nodes) =>
			nodes.every((node) => {
				const label = node.getAttribute('aria-label') ?? '';
				return label.includes('direct connection') && label.includes('Connected to');
			})
		)
	).toBe(true);
	await expect(map.locator('a a, [role="application"], button, input[type="range"]')).toHaveCount(
		0
	);
	expect(
		await page.evaluate(() => {
			const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
			return ids.filter((id, index) => ids.indexOf(id) !== index);
		})
	).toEqual([]);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://www.suvroghosh.in/topics'
	);
	await expectNoHorizontalOverflow(page);
	expect(runtimeErrors).toEqual([]);
});

test('desktop topic geometry and sparse connection paths are deterministic across reloads', async ({
	page
}) => {
	await page.goto('/topics', { waitUntil: 'domcontentloaded' });
	await waitForFiniteMapMotion(page);
	const first = await mapGeometry(page);

	expect(first.nodes).toHaveLength(8);
	expect(first.edges).toHaveLength(13);
	expect(first.viewBox.width).toBeGreaterThan(0);
	expect(first.viewBox.height).toBeGreaterThan(0);
	for (const node of first.nodes) {
		expect(
			Object.values(node).every((value) => typeof value === 'string' || Number.isFinite(value))
		).toBe(true);
		expect(node.width).toBeGreaterThan(0);
		expect(node.height).toBeGreaterThan(0);
		expect(node.x).toBeGreaterThanOrEqual(first.viewBox.x);
		expect(node.y).toBeGreaterThanOrEqual(first.viewBox.y);
		expect(node.x + node.width).toBeLessThanOrEqual(first.viewBox.width);
		expect(node.y + node.height).toBeLessThanOrEqual(first.viewBox.height);
	}
	for (const edge of first.edges) {
		expect(edge.source).toBeTruthy();
		expect(edge.target).toBeTruthy();
		expect(edge.path).toMatch(/^M .+ Q .+$/);
	}

	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForFiniteMapMotion(page);
	expect(await mapGeometry(page)).toEqual(first);
});

test('focus and fine-pointer hover expose identical direct relationships and Enter navigates', async ({
	page
}) => {
	const runtimeErrors = collectUnexpectedRuntimeErrors(page);
	await page.goto('/topics', { waitUntil: 'domcontentloaded' });

	const desktop = page.locator('[data-topic-map-mode="desktop"]');
	const node = desktop.locator(`[data-topic-node="${exploredTopic}"]`);
	await expect(node).toHaveAttribute('href', `/topics/${exploredTopic}`);
	const incidentEdgeIds = (await edgeStates(page))
		.filter((edge) => edge.source === exploredTopic || edge.target === exploredTopic)
		.map((edge) => edge.id);
	expect(incidentEdgeIds.length).toBeGreaterThan(0);

	await node.focus();
	await expect(node).toBeFocused();
	await expect
		.poll(async () => (await edgeStates(page)).filter((edge) => edge.state === 'active').length)
		.toBe(incidentEdgeIds.length);
	const focusedStates = await edgeStates(page);
	expect(focusedStates.filter((edge) => edge.state === 'active').map((edge) => edge.id)).toEqual(
		incidentEdgeIds
	);

	const pointerNode = desktop.locator('[data-topic-node="healthcare-ai"]');
	await pointerNode.hover();
	expect(await edgeStates(page)).toEqual(focusedStates);
	await page.getByRole('heading', { level: 1, name: 'Topic Headquarters' }).hover();
	expect(await edgeStates(page)).toEqual(focusedStates);

	await page.evaluate(() => {
		(document.activeElement as HTMLElement | null)?.blur?.();
	});
	await page.getByRole('heading', { level: 1, name: 'Topic Headquarters' }).hover();
	await expect
		.poll(async () => (await edgeStates(page)).filter((edge) => edge.state === 'active').length)
		.toBe(0);
	await node.hover();
	await expect
		.poll(async () => (await edgeStates(page)).filter((edge) => edge.state === 'active').length)
		.toBe(incidentEdgeIds.length);
	expect(await edgeStates(page)).toEqual(focusedStates);

	await node.focus();
	await node.press('Enter');
	await expect(page).toHaveURL(new RegExp(`/topics/${exploredTopic}$`));
	await expect(
		page.getByRole('heading', { level: 1, name: 'Interactive Mathematics and Visual Models' })
	).toBeVisible();
	expect(runtimeErrors).toEqual([]);
});

test('the 390px metro map keeps canonical 44px links and the directory in flow', async ({
	browser,
	baseURL
}) => {
	const mobileContext = await browser.newContext({
		hasTouch: true,
		isMobile: true,
		viewport: { width: 390, height: 844 }
	});
	const mobilePage = await mobileContext.newPage();
	const runtimeErrors = collectUnexpectedRuntimeErrors(mobilePage);

	try {
		await mobilePage.goto(`${baseURL}/topics`, { waitUntil: 'domcontentloaded' });

		const map = mobilePage.locator('[data-living-topic-map]');
		const desktop = map.locator('[data-topic-map-mode="desktop"]');
		const mobile = map.locator('[data-topic-map-mode="mobile"]');
		const stops = mobile.locator('a[href]');
		await expect(desktop).toBeHidden();
		await expect(mobile).toBeVisible();
		await expect(mobile.locator('[data-topic-territory]')).toHaveCount(6);
		await expect(stops).toHaveCount(8);
		expect(await uniqueHrefs(stops)).toEqual(topicHrefs);
		expect(
			await stops.evaluateAll((links) =>
				links.every((link) => {
					const bounds = link.getBoundingClientRect();
					return bounds.width >= 44 && bounds.height >= 44;
				})
			)
		).toBe(true);
		await expect(mobilePage.locator('[data-topic-directory]')).toBeVisible();
		await expectNoHorizontalOverflow(mobilePage);

		await mobile.locator(`[data-topic-map-stop="${exploredTopic}"]`).tap();
		await expect(mobilePage).toHaveURL(new RegExp(`/topics/${exploredTopic}$`));
		await expect(
			mobilePage.getByRole('heading', {
				level: 1,
				name: 'Interactive Mathematics and Visual Models'
			})
		).toBeVisible();
		expect(runtimeErrors).toEqual([]);
	} finally {
		await mobileContext.close();
	}
});

test('topic-route motion is finite and yields to Still and reduced-motion preferences', async ({
	page
}) => {
	await page.goto('/topics', { waitUntil: 'domcontentloaded' });

	const initialStyles = await edgeAnimationStyles(page);
	const animatedEdges = initialStyles.filter(hasCSSAnimation);
	expect(animatedEdges.length).toBeGreaterThan(0);
	expect(animatedEdges.length).toBeLessThanOrEqual(4);
	expect(initialStyles.every((style) => !style.iterations.includes('infinite'))).toBe(true);
	expect(
		await page
			.locator('[data-living-topic-map]')
			.evaluate(
				(map) =>
					!map
						.getAnimations({ subtree: true })
						.some(
							(animation) => Number(animation.effect?.getComputedTiming().iterations) === Infinity
						)
			)
	).toBe(true);

	await page.locator('#desktop-motion').selectOption('still');
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
	await expect
		.poll(async () => (await edgeAnimationStyles(page)).filter(hasCSSAnimation).length)
		.toBe(0);
	expect(
		(await edgeAnimationStyles(page)).every(
			(style) => Math.abs(Number.parseFloat(style.dashOffset) || 0) === 0
		)
	).toBe(true);

	await page.locator('#desktop-motion').selectOption('alive');
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(page.locator('html')).toHaveAttribute('data-motion', 'still');
	await expect
		.poll(async () => (await edgeAnimationStyles(page)).filter(hasCSSAnimation).length)
		.toBe(0);
});

test('high contrast, forced colours, print, and no-JavaScript retain the useful fallback', async ({
	page,
	browser,
	baseURL
}) => {
	const runtimeErrors = collectUnexpectedRuntimeErrors(page);
	await page.goto('/topics', { waitUntil: 'domcontentloaded' });
	await page.locator('#desktop-theme').selectOption('high-contrast');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'high-contrast');

	const map = page.locator('[data-living-topic-map]');
	const desktopNode = map.locator('[data-topic-node]').first();
	const desktopEdge = map.locator('[data-topic-edge]').first();
	await expect(map).toBeVisible();
	await expect(desktopNode).toBeVisible();
	expect(await desktopEdge.evaluate((edge) => getComputedStyle(edge).display)).not.toBe('none');

	await page.emulateMedia({ forcedColors: 'active' });
	await expect(map).toBeVisible();
	await expect(desktopNode).toBeVisible();
	await expect(desktopEdge).toHaveCSS('display', 'none');
	await desktopNode.focus();
	await expect(desktopNode).toBeFocused();
	await expect(page.locator('[data-topic-directory] a[href]').first()).toBeVisible();

	await page.emulateMedia({ forcedColors: 'none', media: 'print' });
	await expect(map).toHaveCSS('display', 'none');
	await expect(page.locator('[data-topic-directory]')).toBeVisible();
	expect(runtimeErrors).toEqual([]);

	const noJsContext = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 1440, height: 1000 }
	});
	const noJsPage = await noJsContext.newPage();

	try {
		await noJsPage.goto(`${baseURL}/topics`, { waitUntil: 'domcontentloaded' });
		const noJsRoot = noJsPage.locator('html');
		await expect(noJsRoot).toHaveAttribute('data-theme-preference', 'night');
		await expect(noJsRoot).toHaveAttribute('data-theme', 'night');
		await expect(noJsRoot).toHaveClass(/\bdark\b/);
		expect(await noJsRoot.evaluate((element) => getComputedStyle(element).colorScheme)).toContain(
			'dark'
		);
		await expect(noJsPage.locator('meta[name="theme-color"]')).toHaveAttribute(
			'content',
			'#171512'
		);
		const noJsMap = noJsPage.locator('[data-living-topic-map]');
		const noJsDesktop = noJsMap.locator('[data-topic-map-mode="desktop"]');
		await expect(noJsMap).toBeVisible();
		await expect(noJsDesktop.locator('[data-topic-node]')).toHaveCount(8);
		await expect(noJsDesktop.locator('[data-topic-edge]')).toHaveCount(13);
		await expect(noJsMap.locator('canvas')).toHaveCount(0);
		const noJsDirectoryLinks = noJsPage.locator('[data-topic-directory] a[href]');
		await expect(noJsDirectoryLinks).toHaveCount(8);
		expect(await uniqueHrefs(noJsDirectoryLinks)).toEqual(topicHrefs);
		expect((await edgeAnimationStyles(noJsPage)).every((style) => !hasCSSAnimation(style))).toBe(
			true
		);
		await expectNoHorizontalOverflow(noJsPage);

		const noJsNode = noJsDesktop.locator(`[data-topic-node="${exploredTopic}"]`);
		await noJsNode.click();
		await expect(noJsPage).toHaveURL(new RegExp(`/topics/${exploredTopic}$`));
		await expect(
			noJsPage.getByRole('heading', {
				level: 1,
				name: 'Interactive Mathematics and Visual Models'
			})
		).toBeVisible();
	} finally {
		await noJsContext.close();
	}
});

test('Night is the first-paint fallback while stored Paper remains authoritative after hydration', async ({
	page,
	browser,
	baseURL
}) => {
	await blockHydration(page);
	const root = page.locator('html');
	await page.goto('/topics', { waitUntil: 'domcontentloaded' });

	expect(await page.evaluate(() => window.localStorage.getItem('site-theme'))).toBeNull();
	await expect(root).toHaveAttribute('data-theme-preference', 'night');
	await expect(root).toHaveAttribute('data-theme', 'night');
	await expect(root).toHaveClass(/\bdark\b/);
	expect(await root.evaluate((element) => getComputedStyle(element).colorScheme)).toContain('dark');
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#171512');
	await expect(page.locator('#desktop-theme')).toBeDisabled();
	await expect(page.locator('#desktop-theme')).toHaveValue('night');

	await page.evaluate(() => window.localStorage.setItem('site-theme', 'ultraviolet'));
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(root).toHaveAttribute('data-theme-preference', 'night');
	await expect(root).toHaveAttribute('data-theme', 'night');
	await expect(root).toHaveClass(/\bdark\b/);
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#171512');
	await expect(page.locator('#desktop-theme')).toBeDisabled();
	await expect(page.locator('#desktop-theme')).toHaveValue('night');
	expect(await page.evaluate(() => window.localStorage.getItem('site-theme'))).toBe('ultraviolet');

	const paperContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	await paperContext.addInitScript(() => {
		try {
			window.localStorage.setItem('site-theme', 'paper');
		} catch {
			// The assertions expose an unexpected storage denial on the navigated page.
		}
	});
	const paperPage = await paperContext.newPage();

	try {
		await paperPage.goto(`${baseURL}/topics`, { waitUntil: 'domcontentloaded' });
		const paperRoot = paperPage.locator('html');
		await expect(paperRoot).toHaveAttribute('data-theme-preference', 'paper');
		await expect(paperRoot).toHaveAttribute('data-theme', 'paper');
		await expect(paperRoot).not.toHaveClass(/\bdark\b/);
		expect(await paperRoot.evaluate((element) => getComputedStyle(element).colorScheme)).toContain(
			'light'
		);
		await expect(paperPage.locator('meta[name="theme-color"]')).toHaveAttribute(
			'content',
			'#f7f2e7'
		);
		await expect(paperPage.locator('#desktop-theme')).toBeEnabled();
		await expect(paperPage.locator('#desktop-theme')).toHaveValue('paper');
		expect(await paperPage.evaluate(() => window.localStorage.getItem('site-theme'))).toBe('paper');
	} finally {
		await paperContext.close();
	}

	const systemContext = await browser.newContext({
		colorScheme: 'dark',
		viewport: { width: 1440, height: 1000 }
	});
	await systemContext.addInitScript(() => {
		window.localStorage.setItem('site-theme', 'system');
	});
	const systemPage = await systemContext.newPage();

	try {
		await systemPage.goto(`${baseURL}/topics`, { waitUntil: 'domcontentloaded' });
		const systemRoot = systemPage.locator('html');
		await expect(systemRoot).toHaveAttribute('data-theme-preference', 'system');
		await expect(systemRoot).toHaveAttribute('data-theme', 'night');
		await expect(systemPage.locator('#desktop-theme')).toHaveValue('system');
		expect(await systemPage.evaluate(() => window.localStorage.getItem('site-theme'))).toBe(
			'system'
		);

		await systemPage.emulateMedia({ colorScheme: 'light' });
		await expect(systemRoot).toHaveAttribute('data-theme-preference', 'system');
		await expect(systemRoot).toHaveAttribute('data-theme', 'light');
		expect(await systemPage.evaluate(() => window.localStorage.getItem('site-theme'))).toBe(
			'system'
		);
	} finally {
		await systemContext.close();
	}
});

test('captures the reviewed Phase 4 topic-map states', async ({ page, browser, baseURL }) => {
	await mkdir(phase4AfterDirectory, { recursive: true });
	await page.goto('/topics', { waitUntil: 'domcontentloaded' });
	await page.locator('#desktop-motion').selectOption('still');

	const desktopMap = page.locator('[data-living-topic-map]');
	await desktopMap.evaluate((element) => element.scrollIntoView({ block: 'start' }));
	await page.evaluate(async () => {
		await document.fonts.ready;
		window.scrollBy(0, -88);
	});

	await page.screenshot({
		path: resolvePath(phase4AfterDirectory, 'topics-desktop-night.png'),
		animations: 'disabled'
	});
	await page.locator('#desktop-theme').selectOption('paper');
	await page.screenshot({
		path: resolvePath(phase4AfterDirectory, 'topics-desktop-paper.png'),
		animations: 'disabled'
	});
	await page.locator('#desktop-theme').selectOption('high-contrast');
	await page.screenshot({
		path: resolvePath(phase4AfterDirectory, 'topics-desktop-high-contrast.png'),
		animations: 'disabled'
	});
	await page.locator('#desktop-theme').selectOption('night');
	await page
		.locator(`[data-topic-map-mode="desktop"] [data-topic-node="${exploredTopic}"]`)
		.focus();
	await page.screenshot({
		path: resolvePath(phase4AfterDirectory, 'topics-desktop-focus-interactive-mathematics.png'),
		animations: 'disabled'
	});

	const mobileContext = await browser.newContext({
		hasTouch: true,
		isMobile: true,
		viewport: { width: 390, height: 844 }
	});
	await mobileContext.addInitScript(() => {
		if (!window.localStorage.getItem('site-motion')) {
			window.localStorage.setItem('site-motion', 'still');
		}
		if (!window.localStorage.getItem('site-theme')) {
			window.localStorage.setItem('site-theme', 'night');
		}
	});
	const mobilePage = await mobileContext.newPage();

	try {
		await mobilePage.goto(`${baseURL}/topics`, { waitUntil: 'domcontentloaded' });
		const mobileMap = mobilePage.locator('[data-living-topic-map]');
		await mobileMap.evaluate((element) => element.scrollIntoView({ block: 'start' }));
		await mobilePage.evaluate(async () => {
			await document.fonts.ready;
			window.scrollBy(0, -64);
		});
		await mobilePage.screenshot({
			path: resolvePath(phase4AfterDirectory, 'topics-mobile-night.png'),
			animations: 'disabled'
		});

		await mobilePage.evaluate(() => window.localStorage.setItem('site-theme', 'paper'));
		await mobilePage.reload({ waitUntil: 'domcontentloaded' });
		await mobileMap.evaluate((element) => element.scrollIntoView({ block: 'start' }));
		await mobilePage.evaluate(() => window.scrollBy(0, -64));
		await mobilePage.screenshot({
			path: resolvePath(phase4AfterDirectory, 'topics-mobile-paper.png'),
			animations: 'disabled'
		});
	} finally {
		await mobileContext.close();
	}
});
