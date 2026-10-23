import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const route = '/blog/visualizations/between-a-click-and-a-page';
const output = '.codex-artifacts/http-tcp';
const feature = (page: Page) => page.locator('[data-network-feature]');
const errors = new WeakMap<Page, string[]>();

function watchErrors(page: Page): string[] {
	const messages: string[] = [];
	page.on('pageerror', (error) => messages.push(`Page error: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error') {
			const location = message.location().url;
			messages.push(`Console error${location ? ` (${location})` : ''}: ${message.text()}`);
		}
	});
	return messages;
}

test.beforeEach(async ({ page }) => {
	errors.set(page, watchErrors(page));
	await page.addInitScript(() => {
		localStorage.setItem('site-theme', 'paper');
		localStorage.setItem('site-motion', 'still');
	});
});

test.afterEach(async ({ page }) => {
	expect(errors.get(page), 'browser should have no console or uncaught JavaScript errors').toEqual(
		[]
	);
});

async function ready(page: Page): Promise<Locator> {
	await page.goto(route, { waitUntil: 'domcontentloaded' });
	for (const name of ['Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name, exact: true });
		if (await button.isVisible()) await button.click();
	}
	await feature(page).scrollIntoViewIfNeeded();
	const runtime = feature(page).locator('[data-network-ready]');
	await expect(runtime).toBeVisible();
	await expect(runtime).toHaveAttribute('data-still', 'true');
	return runtime;
}

function timeline(runtime: Locator) {
	return runtime.getByRole('slider', { name: 'Position in the exchange', exact: true });
}

function stageButton(runtime: Locator, name: string) {
	return runtime
		.getByRole('navigation', { name: 'Request stages' })
		.getByRole('button', { name: new RegExp(name) });
}

function wholeJourney(runtime: Locator) {
	return runtime
		.locator('.net-stage-readout > div')
		.filter({ hasText: 'Whole journey' })
		.locator('dd');
}

test('the complete article and meaningful instrument remain readable without JavaScript', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		serviceWorkers: 'block',
		viewport: { width: 1440, height: 1000 }
	});
	try {
		const page = await context.newPage();
		const messages = watchErrors(page);
		await page.goto(route, { waitUntil: 'domcontentloaded' });
		await expect(
			page.getByRole('heading', { name: 'The page is not inside the wire', exact: true })
		).toBeVisible();
		await expect(feature(page).locator('.net-scene-desktop')).toBeVisible();
		await expect(feature(page).locator('.net-fallback')).toContainText('1,200 response bytes');
		await expect(feature(page).locator('.net-fallback')).toContainText('2,400 bytes');
		// Server rendering must depict the same gap as the fallback paragraph. This
		// check cannot be repaired by the scene's client-side present() effect.
		await expect(feature(page).locator('[data-net-part="buffer.card-1"]')).toHaveCSS(
			'visibility',
			'hidden'
		);
		for (const index of [0, 2, 3])
			await expect(feature(page).locator(`[data-net-part="buffer.card-${index}"]`)).toHaveCSS(
				'visibility',
				'visible'
			);
		for (const index of [2, 3])
			await expect(feature(page).locator(`[data-net-part="buffer.card-${index}"]`)).toHaveClass(
				/is-buffered/
			);
		await expect(
			feature(page).getByText(/^The full explanation below works without JavaScript\./)
		).toBeVisible();
		await expect(feature(page).locator('[data-network-ready]')).toHaveCount(0);
		await expect(
			page.getByRole('heading', { name: 'First, an address', exact: true })
		).toBeVisible();
		expect(messages).toEqual([]);
	} finally {
		await context.close();
	}
});

test('steps, gap inspection, cumulative byte counters and keyboard timeline describe the same exchange', async ({
	page
}) => {
	const runtime = await ready(page);
	const position = timeline(runtime);
	await expect(runtime).toHaveAttribute('data-stage', 'dns');
	await expect(position).toHaveValue('0');
	await runtime.getByRole('button', { name: 'Next step', exact: true }).click();
	await expect(runtime).toHaveAttribute('data-stage', 'tcp');
	await expect(stageButton(runtime, 'TCP')).toHaveAttribute('aria-current', 'step');
	await runtime.getByRole('button', { name: 'Inspect the missing bytes', exact: true }).click();
	await expect(runtime).toHaveAttribute('data-stage', 'response');
	await expect(runtime.locator('[data-delivered]')).toHaveText('1,200 B');
	await expect(runtime.locator('[data-buffered]')).toHaveText('2,400 B');
	await expect(runtime.locator('[data-next-byte]')).toHaveText('1,200');
	await expect(runtime.locator('[data-segment-state="buffered"]')).toHaveCount(2);
	await expect(
		runtime.getByRole('button', { name: 'Receiving tray', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await position.focus();
	await position.press('End');
	await expect(runtime).toHaveAttribute('data-stage', 'complete');
	await expect(runtime.locator('[data-delivered]')).toHaveText('4,800 B');
	await expect(runtime.locator('[data-buffered]')).toHaveText('0 B');
	await expect(runtime.locator('[data-next-byte]')).toHaveText('4,800');
	await expect(runtime.locator('[data-segment-state="delivered"]')).toHaveCount(4);
	await position.press('Home');
	await expect(position).toHaveValue('0');
	await position.press('ArrowRight');
	await expect(position).toHaveValue('1');
	await runtime.getByRole('button', { name: 'Start again', exact: true }).click();
	await expect(position).toHaveValue('0');
	await expect(
		runtime.getByRole('checkbox', { name: 'Lose one response segment', exact: true })
	).not.toBeChecked();
	await expect(runtime.locator('[data-delivered]')).toHaveText('0 B');
	await expect(runtime.locator('[data-buffered]')).toHaveText('0 B');
	await expect(runtime).toHaveAttribute('data-stage', 'dns');
});

test('connection reuse skips setup and fresh browser cache bypasses network and origin work', async ({
	page
}) => {
	const runtime = await ready(page);
	const baseline = Number((await wholeJourney(runtime).innerText()).replace(/[^0-9]/g, ''));
	await runtime.getByRole('radio', { name: 'Reuse secure connection', exact: true }).check();
	await expect(runtime).toHaveAttribute('data-stage', 'request');
	for (const name of ['DNS', 'TCP', 'TLS']) {
		await expect(stageButton(runtime, name)).toBeDisabled();
		await expect(stageButton(runtime, name)).toContainText('skipped');
	}
	const reused = Number((await wholeJourney(runtime).innerText()).replace(/[^0-9]/g, ''));
	expect(reused).toBeLessThan(baseline);
	await runtime
		.getByRole('checkbox', { name: 'Use a fresh browser cache copy', exact: true })
		.check();
	await expect(runtime).toHaveAttribute('data-stage', 'resources');
	await expect(wholeJourney(runtime)).toHaveText('60 ms');
	for (const name of ['DNS', 'TCP', 'TLS', 'Request', 'Server', 'Response'])
		await expect(stageButton(runtime, name)).toBeDisabled();
	await expect(runtime.locator('.net-notice')).toContainText(
		'No network request reaches the origin'
	);
	await expect(runtime.locator('.net-tiles')).toContainText(
		'needs no response bytes from the network'
	);
	await expect(runtime.locator('[data-segment-state]')).toHaveCount(0);
	await timeline(runtime).focus();
	await timeline(runtime).press('End');
	await expect(runtime).toHaveAttribute('data-stage', 'complete');
	await expect(runtime.locator('[data-delivered]')).toHaveText('0 B');
	await expect(runtime.locator('[data-buffered]')).toHaveText('0 B');
	await runtime.getByRole('button', { name: 'Start again', exact: true }).click();
	await expect(wholeJourney(runtime)).toHaveText(`${baseline.toLocaleString('en-GB')} ms`);
	await expect(runtime.getByRole('radio', { name: 'Fresh connection', exact: true })).toBeChecked();
});

test('playback advances only after a request and pause freezes its model clock', async ({
	page
}) => {
	const runtime = await ready(page);
	await page.evaluate(() => {
		localStorage.setItem('site-motion', 'alive');
		document.documentElement.dataset.motion = 'alive';
	});
	await expect(runtime).toHaveAttribute('data-still', 'false');
	await expect(timeline(runtime)).toHaveValue('0');
	await runtime.getByRole('button', { name: 'Follow the request', exact: true }).click();
	await expect.poll(async () => Number(await timeline(runtime).inputValue())).toBeGreaterThan(1);
	await runtime.getByRole('button', { name: 'Pause the request', exact: true }).click();
	const paused = await timeline(runtime).inputValue();
	await page.waitForTimeout(400);
	await expect(timeline(runtime)).toHaveValue(paused);
	await runtime.getByRole('button', { name: 'Next step', exact: true }).click();
	await expect(runtime).toHaveAttribute('data-stage', 'tcp');
});

test('playback sleeps offscreen, resumes onscreen and releases its scene when navigating away', async ({
	page
}) => {
	const runtime = await ready(page);
	await page.evaluate(() => {
		localStorage.setItem('site-motion', 'alive');
		document.documentElement.dataset.motion = 'alive';
	});
	await expect(runtime).toHaveAttribute('data-still', 'false');
	await runtime.getByRole('button', { name: 'Follow the request', exact: true }).click();
	await expect.poll(async () => Number(await timeline(runtime).inputValue())).toBeGreaterThan(1);
	await runtime.evaluate((element) => {
		window.scrollTo({
			top: element.getBoundingClientRect().bottom + window.scrollY + window.innerHeight,
			behavior: 'instant'
		});
	});
	await expect(runtime).not.toBeInViewport();
	// Give the intersection notification one delivery opportunity before observing
	// the clock; this period is deliberately shorter than the pause observation.
	await page.waitForTimeout(100);
	const offscreen = await timeline(runtime).inputValue();
	await page.waitForTimeout(400);
	await expect(timeline(runtime)).toHaveValue(offscreen);
	await runtime.scrollIntoViewIfNeeded();
	await expect
		.poll(async () => Number(await timeline(runtime).inputValue()))
		.toBeGreaterThan(Number(offscreen));
	await runtime.evaluate((element) => {
		const state = { element, mutations: 0, observer: null as MutationObserver | null };
		state.observer = new MutationObserver((records) => {
			state.mutations += records.length;
		});
		state.observer.observe(element, {
			attributes: true,
			childList: true,
			characterData: true,
			subtree: true
		});
		(window as typeof window & { __httpTcpLifecycle?: typeof state }).__httpTcpLifecycle = state;
	});
	// A normal client-side link click without scrolling the live scene away first
	// makes this a teardown check, rather than another offscreen-pause check.
	await page
		.getByRole('navigation', { name: 'Breadcrumb', exact: true })
		.getByRole('link', { name: 'Visualizations', exact: true })
		.evaluate((element) => (element as HTMLAnchorElement).click());
	await page.waitForURL('**/blog/visualizations');
	await expect(feature(page)).toHaveCount(0);
	await page.waitForTimeout(100);
	const teardown = await page.evaluate(() => {
		const state = (
			window as typeof window & { __httpTcpLifecycle?: { element: Element; mutations: number } }
		).__httpTcpLifecycle;
		return state ? { connected: state.element.isConnected, mutations: state.mutations } : null;
	});
	expect(teardown).not.toBeNull();
	expect(teardown!.connected).toBe(false);
	await page.waitForTimeout(400);
	const afterWait = await page.evaluate(() => {
		const host = window as typeof window & {
			__httpTcpLifecycle?: { mutations: number; observer: MutationObserver | null };
		};
		const mutations = host.__httpTcpLifecycle?.mutations;
		host.__httpTcpLifecycle?.observer?.disconnect();
		delete host.__httpTcpLifecycle;
		return mutations;
	});
	expect(afterWait).toBe(teardown!.mutations);
	await page.goBack({ waitUntil: 'domcontentloaded' });
	await feature(page).scrollIntoViewIfNeeded();
	const remounted = feature(page).locator('[data-network-ready]');
	await expect(remounted).toBeVisible();
	await expect(timeline(remounted)).toHaveValue('0');
	await expect(
		remounted.getByRole('button', { name: 'Follow the request', exact: true })
	).toBeEnabled();
	await page.waitForTimeout(400);
	await expect(timeline(remounted)).toHaveValue('0');
});

for (const preference of ['stored Still mode', 'OS reduced motion'] as const) {
	test(`${preference} disables playback while preserving manual navigation`, async ({ page }) => {
		if (preference === 'OS reduced motion') {
			await page.addInitScript(() => localStorage.setItem('site-motion', 'alive'));
			await page.emulateMedia({ reducedMotion: 'reduce' });
		}
		const runtime = await ready(page);
		await expect(
			runtime.getByRole('button', { name: 'Follow the request', exact: true })
		).toBeDisabled();
		await expect(timeline(runtime)).toHaveValue('0');
		await runtime.getByRole('button', { name: 'Next step', exact: true }).click();
		await expect(runtime).toHaveAttribute('data-stage', 'tcp');
		const current = await timeline(runtime).inputValue();
		// This short observation period tests a stopped animation clock, not server readiness.
		await page.waitForTimeout(400);
		await expect(timeline(runtime)).toHaveValue(current);
		await timeline(runtime).focus();
		await timeline(runtime).press('End');
		await expect(runtime).toHaveAttribute('data-stage', 'complete');
	});
}

test('desktop themes and phone mechanism crops produce readable deterministic evidence', async ({
	page
}) => {
	await page.goto(route, { waitUntil: 'domcontentloaded' });
	// The privacy UI hydrates independently of the lazy instrument. Wait for the
	// real choice instead of checking visibility before that UI has appeared.
	const rejectOptional = page.getByRole('button', { name: 'Reject optional', exact: true });
	await expect(rejectOptional).toBeVisible();
	await rejectOptional.click();
	await expect(page.locator('[data-privacy-note]')).toBeHidden();
	const confirmation = page.getByRole('button', {
		name: 'Dismiss privacy confirmation',
		exact: true
	});
	await expect(confirmation).toBeVisible({ timeout: 3000 });
	await confirmation.click();
	await expect(confirmation).toBeHidden();
	await feature(page).scrollIntoViewIfNeeded();
	const runtime = feature(page).locator('[data-network-ready]');
	await expect(runtime).toBeVisible();
	await expect(runtime).toHaveAttribute('data-still', 'true');
	const capture = async (target: Locator, name: string) => {
		await expect(
			page.locator('[data-privacy-note], .privacy-status, .privacy-dialog[open]')
		).toHaveCount(0);
		await target.screenshot({
			path: `${output}/${name}.png`,
			animations: 'disabled',
			style: '.site-header { visibility: hidden !important; }'
		});
	};
	await mkdir(output, { recursive: true });
	await runtime.getByRole('button', { name: 'Inspect the missing bytes', exact: true }).click();
	const card = runtime.locator('[data-network-poster]');
	const figure = runtime.locator('[data-network-capture]');
	await capture(card, 'desktop-paper');
	const paperBackground = await figure.evaluate(
		(element) => getComputedStyle(element).backgroundColor
	);
	await page.locator('#desktop-theme').selectOption('night');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
	await expect
		.poll(() => figure.evaluate((element) => getComputedStyle(element).backgroundColor))
		.not.toBe(paperBackground);
	await capture(card, 'desktop-night');
	await page.setViewportSize({ width: 390, height: 844 });
	const mobileScene = runtime.locator('.net-scene-mobile');
	await expect(mobileScene).toBeVisible();
	await expect(runtime.locator('.net-scene-desktop')).toBeHidden();
	await runtime.getByRole('button', { name: 'Start again', exact: true }).click();
	await stageButton(runtime, 'TLS').click();
	await runtime.getByRole('button', { name: 'Connection', exact: true }).click();
	await expect(figure).toHaveAttribute('data-selected', 'coupling');
	const couplingBox = await mobileScene.getAttribute('viewBox');
	await capture(figure, 'phone-coupling');
	await stageButton(runtime, 'Server').click();
	await runtime.getByRole('button', { name: 'Server rack', exact: true }).click();
	await expect(figure).toHaveAttribute('data-selected', 'server');
	await expect(mobileScene).not.toHaveAttribute('viewBox', couplingBox!);
	await expect(runtime.locator('.net-server-path')).toBeVisible();
	await capture(figure, 'phone-server');
	await runtime.getByRole('button', { name: 'Inspect the missing bytes', exact: true }).click();
	await expect(figure).toHaveAttribute('data-selected', 'buffer');
	await expect(runtime.locator('[data-buffered]')).toHaveText('2,400 B');
	const bufferBox = await mobileScene.getAttribute('viewBox');
	await capture(figure, 'phone-buffer');
	await runtime.getByRole('button', { name: 'Whole instrument', exact: true }).click();
	await expect(
		runtime.getByRole('button', { name: 'Whole instrument', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(mobileScene).not.toHaveAttribute('viewBox', bufferBox!);
	await capture(figure, 'phone-overview');
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
		'390px layout must not scroll horizontally'
	).toBe(true);
	const bounds = await feature(page).boundingBox();
	expect(bounds).not.toBeNull();
	expect(bounds!.x).toBeGreaterThanOrEqual(0);
	expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
});
