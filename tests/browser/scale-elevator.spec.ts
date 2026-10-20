import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/the-scale-elevator-from-ion-to-city';
const galleryPath = '/blog/visualizations';
const reviewPath = resolve('.codex-artifacts/scale-elevator/review');
const floors = [
	'ion',
	'molecule',
	'membrane',
	'cell',
	'tissue',
	'organ',
	'person',
	'bed',
	'ward',
	'hospital',
	'city'
];
const root = (page: Page) => page.getByTestId('scale-elevator');
const stage = (page: Page) => page.getByTestId('scale-stage');
const primary = (page: Page) => page.getByTestId('scale-primary');

function diagnostics(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		const text = `${message.location().url} ${message.text()}`;
		if (/Failed to load resource|favicon|\/_vercel\//iu.test(text)) return;
		errors.push(message.text());
	});
	return errors;
}

async function ready(page: Page, query = '?motion=reduce', webgl = true): Promise<Locator> {
	await page.goto(`${articlePath}${query}`, { waitUntil: 'domcontentloaded' });
	await expect(root(page)).toHaveAttribute('data-hydrated', 'true');
	await root(page).locator('.se-stage').scrollIntoViewIfNeeded();
	await expect(root(page)).toHaveAttribute('data-status', webgl ? 'ready' : 'fallback', {
		timeout: 60_000
	});
	return root(page);
}

async function range(page: Page, id: 'se-progress' | 'se-control', value: number): Promise<void> {
	await root(page)
		.locator(`#${id}`)
		.evaluate((element, next) => {
			const input = element as HTMLInputElement;
			input.value = String(next);
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}, value);
}

async function jump(page: Page, floor: number): Promise<void> {
	await root(page).locator('.se-floor-rail button').nth(floor).click();
	await expect(root(page)).toHaveAttribute('data-floor', floors[floor]);
	await expect(root(page).locator('.se-floor-rail button').nth(floor)).toHaveAttribute(
		'aria-current',
		'step'
	);
}

async function screenshot(page: Page, name: string): Promise<void> {
	await root(page).locator('.se-stage').scrollIntoViewIfNeeded();
	await expect(stage(page)).toHaveAttribute(
		'data-render-progress',
		(await root(page).getAttribute('data-progress'))!
	);
	await page.evaluate(
		() =>
			new Promise<void>((resolveFrame) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
			)
	);
	await root(page)
		.getByTestId('scale-capture')
		.screenshot({
			path: resolve(reviewPath, `${name}.png`),
			animations: 'disabled',
			style: '.site-header { visibility: hidden !important; }'
		});
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
	const bounds = await root(page).boundingBox();
	expect(bounds).not.toBeNull();
	const width = page.viewportSize()!.width;
	expect(bounds!.x).toBeGreaterThanOrEqual(-1);
	expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
	expect(overflow).toBeLessThanOrEqual(1);
	const chartBounds = await root(page).locator('.se-chart svg').boundingBox();
	expect(chartBounds!.x + chartBounds!.width).toBeLessThanOrEqual(width + 1);
}

test.beforeAll(async () => {
	await mkdir(reviewPath, { recursive: true });
});

test('all eleven floors render through one WebGL canvas with distinct diagrams and measurement passports', async ({
	page
}) => {
	const errors = diagnostics(page);
	await ready(page);
	await expect(stage(page).locator('canvas')).toHaveCount(1);
	expect(
		await stage(page)
			.locator('canvas')
			.evaluate((canvas) => Boolean((canvas as HTMLCanvasElement).getContext('webgl2')))
	).toBe(true);
	for (let index = 0; index < floors.length; index++) {
		await jump(page, index);
		await expect(root(page).locator('.se-stage-heading h2')).toContainText(
			index === 7 ? 'Hospital bed' : new RegExp(floors[index], 'iu')
		);
		await expect(
			root(page).getByRole('complementary', { name: 'Current scale explanation' })
		).toBeVisible();
		await expect(root(page).locator('.se-chart svg')).toHaveAttribute('aria-label', /.+/u);
		await expect(root(page).locator('.se-passport')).toContainText('Denominator / interval');
		await expect(primary(page)).not.toBeEmpty();
		await expect(root(page)).toHaveAttribute('data-status', 'ready');
		await expect(stage(page).locator('canvas')).toHaveCount(1);
		await root(page).locator('.se-stage').scrollIntoViewIfNeeded();
		await expect(stage(page)).toHaveAttribute(
			'data-render-progress',
			(await root(page).getAttribute('data-progress'))!
		);
		if ([0, 4, 8, 10].includes(index))
			await screenshot(page, `desktop-${String(index + 1).padStart(2, '0')}-${floors[index]}`);
	}
	await assertNoHorizontalOverflow(page);
	expect(errors).toEqual([]);
});

test('scenario comparisons preserve their held quantities and change the relevant calculations', async ({
	page
}) => {
	await ready(page, '?motion=reduce&se-scale=6');
	await expect(primary(page)).toHaveText('1,000');
	const scenario = root(page).locator('#se-scenario');
	await scenario.selectOption('haemoglobin');
	await expect(root(page)).toHaveAttribute('data-scenario', 'haemoglobin');
	await expect(primary(page)).toHaveText('540');
	await expect(root(page).locator('.se-secondary')).toContainText('98 %');
	await expect(root(page).locator('.se-secondary')).toContainText('8.0 g/dL');
	await scenario.selectOption('flow');
	await expect(primary(page)).toHaveText('600');
	await expect(root(page).locator('.se-secondary')).toContainText('15.0 g/dL');
	await expect(root(page).locator('.se-secondary')).toContainText('3.0 L blood/min');
	await range(page, 'se-control', 0);
	await expect(primary(page)).toHaveText('360');
	await root(page).getByRole('button', { name: 'Reset dial', exact: true }).click();
	await expect(primary(page)).toHaveText('600');
	await jump(page, 8);
	await scenario.selectOption('baseline');
	await expect(primary(page)).toHaveText('52.0');
	await scenario.selectOption('demand');
	await expect(primary(page)).toHaveText('93.6');
	await expect(root(page).locator('.se-secondary')).toContainText('12 beds');
	await jump(page, 9);
	await expect(primary(page)).toHaveText('142.0');
	await jump(page, 10);
	await expect(root(page).locator('.se-secondary')).toContainText('1,306.8 L/min');
	await expect(primary(page)).toHaveText('6.1');
});

test('local molecular, transport, tissue and organ controls change only their declared illustrations', async ({
	page
}) => {
	await ready(page, '?motion=reduce');
	await range(page, 'se-control', 0);
	await expect(primary(page)).toHaveText('0');
	await range(page, 'se-control', 1);
	await expect(primary(page)).toHaveText('1');
	await jump(page, 1);
	const highOccupancy = Number(await primary(page).textContent());
	await range(page, 'se-control', 0);
	expect(Number(await primary(page).textContent())).toBeLessThan(highOccupancy);
	await jump(page, 2);
	await expect(primary(page)).toHaveText('0.15');
	await range(page, 'se-control', 1);
	await expect(primary(page)).toHaveText('1.85');
	await jump(page, 3);
	await expect(primary(page)).toHaveText('1.60');
	await range(page, 'se-control', 0);
	await expect(primary(page)).toHaveText('0.40');
	await range(page, 'se-control', 0.5);
	await jump(page, 4);
	await root(page)
		.getByRole('button', { name: /^Near ·/u })
		.click();
	const near = Number(await primary(page).textContent());
	await root(page)
		.getByRole('button', { name: /^Farthest ·/u })
		.click();
	expect(Number(await primary(page).textContent())).toBeLessThan(near);
	await expect(root(page).locator('.se-secondary')).toContainText('2.4 relative spatial units');
	await jump(page, 5);
	await root(page).getByRole('button', { name: 'Region 4', exact: true }).click();
	await expect(primary(page)).toHaveText('10.0');
	await range(page, 'se-control', 0);
	await expect(primary(page)).toHaveText('3.0');
	await expect(root(page).locator('.se-secondary')).toContainText('8.0 mL O₂/min');
	await expect(root(page).locator('.se-takeaway')).toContainText('does not');
});

test('ward controls expose twelve beds at a time and keyboard inspection reaches the 36th bed', async ({
	page
}) => {
	await ready(page, '?motion=reduce&se-scale=8');
	const bars = root(page).locator('.se-chart [role="button"]');
	await expect(bars).toHaveCount(12);
	await root(page)
		.getByRole('button', { name: /^Ward B ·/u })
		.click();
	await expect(primary(page)).toHaveText('77.0');
	await expect(root(page).locator('.se-selection')).toContainText('Ward B, bed 1:');
	await bars.nth(11).focus();
	await page.keyboard.press('Enter');
	await expect(root(page).locator('.se-selection')).toContainText('Ward B, bed 12:');
	await expect(root(page).locator('.se-selection')).toContainText('15.0 L/min');
	await root(page)
		.getByRole('button', { name: /^Ward C ·/u })
		.click();
	await expect(primary(page)).toHaveText('113.0');
	await bars.nth(11).focus();
	await page.keyboard.press('Space');
	await expect(root(page).locator('.se-selection')).toContainText('Ward C, bed 12:');
	await expect(root(page).locator('.se-selection')).toContainText('20.0 L/min');
	await expect.poll(() => new URL(page.url()).searchParams.get('se-selected')).toBe('35');
	await expect(bars).toHaveCount(12);
	await range(page, 'se-control', 1);
	await expect(root(page).locator('.se-selection')).toContainText('28.0 L/min');
});

test('share state round trips without overwriting unrelated query parameters', async ({ page }) => {
	await ready(
		page,
		'?motion=reduce&campaign=oxygen&se-scale=8&se-scenario=demand&se-control=0.4&se-selected=35&se-seed=1234'
	);
	await expect(root(page)).toHaveAttribute('data-floor', 'ward');
	await expect(root(page)).toHaveAttribute('data-scenario', 'demand');
	await expect(root(page).locator('#se-control')).toHaveValue('0.4');
	await expect(root(page).locator('.se-selection')).toContainText('Ward C, bed 12:');
	await range(page, 'se-progress', 10);
	await range(page, 'se-control', 0);
	await expect.poll(() => new URL(page.url()).searchParams.get('se-scale')).toBe('10');
	const shared = new URL(page.url());
	expect(shared.searchParams.get('campaign')).toBe('oxygen');
	expect(shared.searchParams.get('se-selected')).toBe('35');
	expect(shared.searchParams.get('se-control')).toBe('0');
	await page.reload();
	await expect(root(page)).toHaveAttribute('data-hydrated', 'true');
	await expect(root(page)).toHaveAttribute('data-floor', 'city');
	await expect(root(page).locator('#se-control')).toHaveValue('0');
	await expect(root(page)).toHaveAttribute('data-scenario', 'demand');
	await ready(
		page,
		'?motion=reduce&se-scale=Infinity&se-control=NaN&se-scenario=invalid&se-selected=999&se-seed=0'
	);
	await expect(root(page)).toHaveAttribute('data-floor', 'ion');
	await expect(root(page)).toHaveAttribute('data-scenario', 'baseline');
	await expect(root(page).locator('#se-control')).toHaveValue('0.5');
});

test('keyboard navigation, scrubbing, and reduced motion preserve the full journey without playback', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await ready(page, '');
	await expect(root(page).getByRole('button', { name: /Guided zoom/u })).toBeDisabled();
	await expect(
		root(page).getByRole('button', { name: 'Animate this view', exact: true })
	).toBeDisabled();
	await expect(root(page)).toHaveAttribute('data-playing', 'false');
	await expect(root(page).locator('.se-motion-note')).toContainText('Still mode is active');
	const viewport = root(page).getByRole('slider', { name: /^Scale viewport/u });
	await viewport.focus();
	await page.keyboard.press('End');
	await expect(root(page)).toHaveAttribute('data-floor', 'city');
	await page.keyboard.press('ArrowLeft');
	await expect(root(page)).toHaveAttribute('data-floor', 'hospital');
	await page.keyboard.press('Home');
	await expect(root(page)).toHaveAttribute('data-floor', 'ion');
	await page.keyboard.press('ArrowRight');
	await expect(root(page)).toHaveAttribute('data-floor', 'molecule');
	await range(page, 'se-progress', 4.25);
	await expect(root(page)).toHaveAttribute('data-progress', '4.2500');
	await expect(root(page)).toHaveAttribute('data-floor', 'tissue');
	await root(page).getByRole('button', { name: 'Next floor', exact: true }).click();
	await expect(root(page)).toHaveAttribute('data-floor', 'organ');
	await root(page).getByRole('button', { name: 'Previous floor', exact: true }).click();
	await expect(root(page)).toHaveAttribute('data-floor', 'tissue');
});

test('the guided tour advances, pauses, resumes and replays under a controlled clock', async ({
	page
}) => {
	await page.clock.install();
	await ready(page, '?webgl=off', false);
	await root(page)
		.getByRole('button', { name: /Guided zoom/u })
		.click();
	await expect(root(page)).toHaveAttribute('data-playing', 'true');
	await page.clock.runFor(3600);
	expect(Number(await root(page).getAttribute('data-progress'))).toBeGreaterThan(0.4);
	await root(page)
		.getByRole('button', { name: /Pause tour/u })
		.click();
	const paused = await root(page).getAttribute('data-progress');
	await page.clock.runFor(1000);
	await expect(root(page)).toHaveAttribute('data-progress', paused!);
	await root(page)
		.getByRole('button', { name: /Guided zoom/u })
		.click();
	await page.clock.runFor(1000);
	expect(Number(await root(page).getAttribute('data-progress'))).toBeGreaterThan(Number(paused));
	await root(page).getByRole('button', { name: 'Replay continuous tour' }).click();
	await expect(root(page)).toHaveAttribute('data-floor', 'ion');
	await expect(root(page)).toHaveAttribute('data-playing', 'true');
	await root(page)
		.getByRole('button', { name: /Pause tour/u })
		.click();
});

test('WebGL-off keeps synthetic readings, diagrams, floor stills and the ordered ledger usable', async ({
	page
}) => {
	const errors = diagnostics(page);
	await ready(page, '?webgl=off&motion=reduce&se-scale=9', false);
	await expect(stage(page)).toHaveAttribute('data-render-status', 'fallback');
	await expect(stage(page).getByRole('status')).toContainText('WebGL is off');
	await expect(stage(page).getByRole('img')).toHaveAttribute('src', /scene-10-hospital\.jpg$/u);
	await expect(primary(page)).toHaveText('23.0');
	await range(page, 'se-control', 1);
	await expect(primary(page)).toHaveText('0.0');
	await jump(page, 10);
	await expect(root(page).locator('.se-chart svg')).toHaveAttribute(
		'aria-label',
		/twenty-four hours/u
	);
	await root(page).getByText('Read the eleven-floor field guide', { exact: true }).click();
	await expect(root(page).locator('.se-ledger li')).toHaveCount(11);
	await expect(root(page).locator('.se-ledger li').last()).toContainText('City');
	expect(errors).toEqual([]);
});

test('JavaScript-free SSR preserves the eleven-floor guide, article sources and recording link', async ({
	browser,
	baseURL,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('data-testid="scale-elevator"');
	expect(html).toContain('A number needs a place');
	expect(html).toContain('JavaScript is disabled');
	expect(html).not.toContain('scale-elevator/renderer.ts');
	const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(root(page)).toBeVisible();
		await root(page).getByText('Read the eleven-floor field guide', { exact: true }).click();
		await expect(root(page).locator('.se-ledger li')).toHaveCount(11);
		await expect(root(page).locator('.se-ledger li').first()).toContainText(/iron/iu);
		await expect(root(page).locator('.se-ledger li').last()).toContainText('City');
		const stillLinks = root(page).locator('.se-ledger-links a');
		await expect(stillLinks).toHaveCount(11);
		for (let index = 0; index < floors.length; index++) {
			const href = await stillLinks.nth(index).getAttribute('href');
			expect(new URL(href!, page.url()).pathname).toBe(
				`/images/visualizations/scale-elevator/${String(index + 1).padStart(2, '0')}-${floors[index]}.jpg`
			);
			await expect(root(page).locator('.se-ledger-links button').nth(index)).toBeDisabled();
		}
		await expect(
			page.getByRole('heading', { name: 'What does an oxygen level belong to?', exact: true })
		).toBeVisible();
		await expect(page.locator('a[href="https://pdb101.rcsb.org/motm/41"]').first()).toHaveText(
			/haemoglobin/u
		);
		const recordingHref = await root(page)
			.getByRole('link', { name: /Download the continuous tour/u })
			.getAttribute('href');
		expect(new URL(recordingHref!, page.url()).pathname).toBe(
			'/videos/visualizations/scale-elevator/scale-elevator-tour.mp4'
		);
	} finally {
		await context.close();
	}
});

test('portrait layouts and both colour preferences preserve readable controls without horizontal page overflow', async ({
	page
}) => {
	const errors = diagnostics(page);
	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 768, height: 1024 }
	]) {
		await page.setViewportSize(viewport);
		await ready(page, '?motion=reduce&se-scale=8');
		await assertNoHorizontalOverflow(page);
		await expect(root(page).locator('#se-scenario')).toBeVisible();
		await root(page)
			.getByRole('button', { name: /^Ward C ·/u })
			.click();
		await expect(primary(page)).toHaveText('113.0');
		await expect(root(page).locator('.se-chart [role="button"]')).toHaveCount(12);
		await screenshot(page, `portrait-${viewport.width}-ward`);
		await page.emulateMedia({ colorScheme: 'dark' });
		await jump(page, 6);
		await assertNoHorizontalOverflow(page);
		await screenshot(page, `portrait-${viewport.width}-person-dark`);
		await page.emulateMedia({ colorScheme: 'light' });
	}
	expect(errors).toEqual([]);
});

test('a lost graphics context falls back and Retry 3D replaces the canvas without losing scientific state', async ({
	page
}) => {
	const errors = diagnostics(page);
	await ready(page, '?motion=reduce&se-scale=6&se-scenario=haemoglobin');
	await expect(primary(page)).toHaveText('540');
	const lost = await stage(page)
		.locator('canvas')
		.evaluate((element) => {
			const gl = (element as HTMLCanvasElement).getContext('webgl2');
			const extension = gl?.getExtension('WEBGL_lose_context');
			if (!extension) return false;
			extension.loseContext();
			return true;
		});
	expect(lost).toBe(true);
	await expect(root(page)).toHaveAttribute('data-status', 'fallback');
	await expect(stage(page).getByRole('status')).toContainText('graphics context was interrupted');
	await expect(primary(page)).toHaveText('540');
	await stage(page).getByRole('button', { name: 'Retry 3D', exact: true }).click();
	await expect(root(page)).toHaveAttribute('data-status', 'ready');
	await expect(stage(page).locator('canvas')).toHaveCount(1);
	await expect(root(page)).toHaveAttribute('data-floor', 'person');
	await expect(root(page)).toHaveAttribute('data-scenario', 'haemoglobin');
	expect(errors).toEqual([]);
});

test('touch interaction selects floors, wards and individual beds on a narrow screen', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true,
		reducedMotion: 'reduce'
	});
	try {
		const page = await context.newPage();
		await ready(page, '?webgl=off&motion=reduce', false);
		const wardFloor = root(page).locator('.se-floor-rail button').nth(8);
		await wardFloor.scrollIntoViewIfNeeded();
		await wardFloor.tap();
		await expect(root(page)).toHaveAttribute('data-floor', 'ward');
		const wardB = root(page).getByRole('button', { name: /^Ward B ·/u });
		await wardB.tap();
		const lastBed = root(page).locator('.se-chart [role="button"]').nth(11);
		await lastBed.scrollIntoViewIfNeeded();
		await lastBed.tap();
		await expect(root(page).locator('.se-selection')).toContainText('Ward B, bed 12:');
		await assertNoHorizontalOverflow(page);
	} finally {
		await context.close();
	}
});

test('client navigation disposes the renderer context and returning creates one clean stage', async ({
	page
}) => {
	await page.addInitScript(() => {
		const audit = { losses: 0 };
		(window as typeof window & { __scaleContextAudit: typeof audit }).__scaleContextAudit = audit;
		const original = WebGL2RenderingContext.prototype.getExtension;
		const seen = new WeakSet<object>();
		WebGL2RenderingContext.prototype.getExtension = function (
			this: WebGL2RenderingContext,
			name: string
		) {
			const extension: unknown = Reflect.apply(original, this, [name]);
			if (
				name === 'WEBGL_lose_context' &&
				extension &&
				typeof extension === 'object' &&
				!seen.has(extension)
			) {
				seen.add(extension);
				const lossExtension = extension as WEBGL_lose_context;
				const lose = lossExtension.loseContext.bind(lossExtension);
				lossExtension.loseContext = () => {
					audit.losses++;
					lose();
				};
			}
			return extension;
		} as typeof original;
	});
	const errors = diagnostics(page);
	await ready(page);
	const readLosses = () =>
		page.evaluate(
			() =>
				(window as typeof window & { __scaleContextAudit: { losses: number } }).__scaleContextAudit
					.losses
		);
	expect(await readLosses()).toBe(0);
	await page
		.getByRole('navigation', { name: 'Primary navigation', exact: true })
		.getByRole('link', { name: 'About', exact: true })
		.click();
	await expect(root(page)).toHaveCount(0);
	await expect.poll(readLosses).toBeGreaterThan(0);
	await page.goBack();
	await expect(root(page)).toHaveAttribute('data-hydrated', 'true');
	await root(page).locator('.se-stage').scrollIntoViewIfNeeded();
	await expect(root(page)).toHaveAttribute('data-status', 'ready');
	await expect(stage(page).locator('canvas')).toHaveCount(1);
	expect(errors).toEqual([]);
});

test('the visualization gallery discovers the article using metadata without creating its graphics context', async ({
	page
}) => {
	const requests: string[] = [];
	page.on('request', (request) => requests.push(request.url()));
	await page.goto(galleryPath, { waitUntil: 'domcontentloaded' });
	const entry = page.getByRole('link', { name: /The Scale Elevator — From Ion to City/u }).first();
	await expect(entry).toBeVisible();
	await expect(entry).toHaveAttribute('href', articlePath);
	await expect(page.getByTestId('scale-stage')).toHaveCount(0);
	expect(requests.filter((url) => /scale-elevator\/renderer/iu.test(url))).toEqual([]);
});

test('batched visibility entries use the newest state for rendering and tour scheduling', async ({
	page
}) => {
	await page.addInitScript(() => {
		const counts: Record<string, number> = {};
		(
			window as typeof window & { __scaleVisibilityBatches: typeof counts }
		).__scaleVisibilityBatches = counts;
		const NativeObserver = window.IntersectionObserver;
		window.IntersectionObserver = class extends NativeObserver {
			constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
				super((entries, observer) => {
					const newest = entries.at(-1);
					if (
						newest?.isIntersecting &&
						newest.target.matches('[data-testid="scale-stage"], [data-testid="scale-elevator"]')
					) {
						const name = newest.target.getAttribute('data-testid')!;
						counts[name] = (counts[name] ?? 0) + 1;
						// A resize can queue an earlier zero-area snapshot and a later visible one together.
						const earlier: IntersectionObserverEntry = {
							target: newest.target,
							time: Math.max(0, newest.time - 0.01),
							rootBounds: new DOMRect(0, 0, 1, 1),
							boundingClientRect: new DOMRect(),
							intersectionRect: new DOMRect(),
							intersectionRatio: 0,
							isIntersecting: false
						};
						callback([earlier, newest], observer);
					} else callback(entries, observer);
				}, options);
			}
		};
	});
	await page.clock.install();
	await ready(page, '?se-scale=8');
	await root(page)
		.getByRole('button', { name: /Guided zoom/u })
		.click();
	await page.clock.runFor(3600);
	expect(Number(await root(page).getAttribute('data-progress'))).toBeGreaterThan(8.4);
	await root(page)
		.getByRole('button', { name: /Pause tour/u })
		.click();
	await page.clock.runFor(50);
	await root(page).locator('.se-stage').scrollIntoViewIfNeeded();
	await expect(stage(page)).toHaveAttribute(
		'data-render-progress',
		(await root(page).getAttribute('data-progress'))!
	);
	const batches = await page.evaluate(
		() =>
			(window as typeof window & { __scaleVisibilityBatches: Record<string, number> })
				.__scaleVisibilityBatches
	);
	expect(batches['scale-stage']).toBeGreaterThan(0);
	expect(batches['scale-elevator']).toBeGreaterThan(0);
});
