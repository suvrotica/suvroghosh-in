import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const longArticlePath = '/blog/healthcare-it/latent-space-in-healthcare-data';

type Phase5Audit = {
	ambientDraws: number;
	localFrames: number;
	cls: number;
	heroReadyAt: number | null;
	lcp: Array<{
		startTime: number;
		tag: string | null;
		text: string;
		inAtmosphere: boolean;
		inLivingIndex: boolean;
	}>;
};

async function installAudit(page: Page) {
	await page.addInitScript(() => {
		type AuditWindow = Window & { __phase5Audit: Phase5Audit };
		const auditWindow = window as unknown as AuditWindow;
		auditWindow.__phase5Audit = {
			ambientDraws: 0,
			localFrames: 0,
			cls: 0,
			heroReadyAt: null,
			lcp: []
		};

		const markSemanticHero = () => {
			if (auditWindow.__phase5Audit.heroReadyAt !== null) return;
			if (document.querySelector('[data-living-hero]')) {
				auditWindow.__phase5Audit.heroReadyAt = performance.now();
			}
		};
		const semanticObserver = new MutationObserver(markSemanticHero);
		semanticObserver.observe(document, { childList: true, subtree: true });
		document.addEventListener('DOMContentLoaded', () => {
			markSemanticHero();
			semanticObserver.disconnect();
		});

		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const shift = entry as PerformanceEntry & {
					hadRecentInput?: boolean;
					value?: number;
				};
				if (!shift.hadRecentInput) auditWindow.__phase5Audit.cls += shift.value ?? 0;
			}
		}).observe({ type: 'layout-shift', buffered: true });

		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const paint = entry as PerformanceEntry & { element?: Element | null };
				const element = paint.element ?? null;
				auditWindow.__phase5Audit.lcp.push({
					startTime: entry.startTime,
					tag: element?.tagName ?? null,
					text: element?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) ?? '',
					inAtmosphere: Boolean(element?.closest('[data-route-atmosphere]')),
					inLivingIndex: Boolean(element?.closest('[data-living-index-scene]'))
				});
			}
		}).observe({ type: 'largest-contentful-paint', buffered: true });

		const nativeClear = CanvasRenderingContext2D.prototype.clearRect;
		const nativeFill = CanvasRenderingContext2D.prototype.fillRect;
		CanvasRenderingContext2D.prototype.clearRect = function (...args) {
			if (this.canvas?.matches('[data-ambient-field]')) {
				auditWindow.__phase5Audit.ambientDraws += 1;
			}
			return nativeClear.apply(this, args);
		};
		CanvasRenderingContext2D.prototype.fillRect = function (...args) {
			if (
				this.canvas?.matches('[data-render-frame-cap]') &&
				(this.fillStyle === '#05070b' || this.fillStyle === 'rgb(5, 7, 11)')
			) {
				auditWindow.__phase5Audit.localFrames += 1;
			}
			return nativeFill.apply(this, args);
		};
	});
}

async function audit(page: Page): Promise<Phase5Audit> {
	return page.evaluate(
		() => (window as unknown as Window & { __phase5Audit: Phase5Audit }).__phase5Audit
	);
}

function collectLivingIndexSceneModules(page: Page): () => Promise<string[]> {
	const inspections: Array<Promise<string | null>> = [];
	page.on('response', (response) => {
		const pathname = new URL(response.url()).pathname;
		if (!pathname.startsWith('/_app/immutable/chunks/') || !pathname.endsWith('.js')) return;
		inspections.push(
			response
				.text()
				.then((source) => (source.includes('createLivingIndexScene') ? response.url() : null))
				.catch(() => null)
		);
	});

	return async () => (await Promise.all(inspections)).filter((url): url is string => url !== null);
}

async function createAliveContext(
	browser: Browser,
	baseURL: string | undefined,
	options: {
		viewport: { width: number; height: number };
		deviceScaleFactor: number;
		hasTouch?: boolean;
		isMobile?: boolean;
	}
): Promise<{ context: BrowserContext; page: Page }> {
	const context = await browser.newContext({ baseURL, ...options });
	await context.addInitScript(() => {
		window.localStorage.setItem('site-motion', 'alive');
	});
	const page = await context.newPage();
	await installAudit(page);
	return { context, page };
}

test('semantic home LCP precedes the lazy Living Index scene and stays outside its cost', async ({
	page
}, testInfo) => {
	await installAudit(page);
	const readSceneModuleUrls = collectLivingIndexSceneModules(page);
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { level: 1, name: 'Suvro Ghosh' })).toBeVisible();
	await expect(page.locator('[data-living-index-fallback]')).toBeAttached();
	await expect(page.locator('[data-route-atmosphere]')).toHaveAttribute('data-ambient', 'static');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
	await page.waitForTimeout(4_200);

	const result = await audit(page);
	const maximumLcpStart = Math.max(...result.lcp.map((entry) => entry.startTime));
	expect(result.heroReadyAt).not.toBeNull();
	expect(result.lcp.length).toBeGreaterThan(0);
	expect(result.cls).toBeLessThanOrEqual(0.1);
	expect(result.lcp.every((entry) => entry.startTime <= 2_500)).toBe(true);
	expect(
		result.lcp.every(
			(entry) => !entry.inAtmosphere && !entry.inLivingIndex && entry.tag !== 'CANVAS'
		)
	).toBe(true);

	const sceneModuleUrls = await readSceneModuleUrls();
	const sceneResources = await page.evaluate(
		(moduleUrls) =>
			performance
				.getEntriesByType('resource')
				.filter((entry) => moduleUrls.includes(entry.name))
				.map((entry) => ({
					initiatorType: (entry as PerformanceResourceTiming).initiatorType,
					startTime: entry.startTime
				})),
		sceneModuleUrls
	);
	const scene = page.locator('[data-living-index-scene]');
	const tier = await scene.getAttribute('data-scene-tier');
	expect(['A', 'B', 'C']).toContain(tier);
	testInfo.annotations.push(
		{
			type: 'maximum-semantic-lcp',
			description: `${maximumLcpStart.toFixed(1)} ms`
		},
		{ type: 'cumulative-layout-shift', description: result.cls.toFixed(4) },
		{
			type: 'semantic-hero-ready',
			description: `${result.heroReadyAt!.toFixed(1)} ms`
		},
		{ type: 'living-index-tier', description: tier ?? 'unknown' },
		{
			type: 'scene-resource-start',
			description: sceneResources[0] ? `${sceneResources[0].startTime.toFixed(1)} ms` : 'none'
		}
	);
	if (tier === 'A' || tier === 'B') {
		expect(sceneResources).toHaveLength(1);
		expect(sceneResources[0].initiatorType).toBe('script');
		expect(sceneResources[0].startTime).toBeGreaterThanOrEqual(result.heroReadyAt!);
		await expect(page.locator('[data-living-index-canvas]')).toHaveCount(1);
		await expect(page.locator('[data-local-animation-owner="living-index"]')).toHaveCount(1);
	} else {
		expect(sceneResources.length).toBeLessThanOrEqual(1);
		if (sceneResources[0]) {
			expect(sceneResources[0].initiatorType).toBe('script');
			expect(sceneResources[0].startTime).toBeGreaterThanOrEqual(result.heroReadyAt!);
		}
		await expect(page.locator('[data-living-index-canvas]')).toHaveCount(0);
	}

	const motionSelect = page.getByLabel('Motion preference', { exact: true });
	const interactionLatency = page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				const control = document.querySelector('[aria-label="Motion preference"]');
				if (!(control instanceof HTMLSelectElement)) {
					resolve(9_999);
					return;
				}

				const timeout = window.setTimeout(() => resolve(9_999), 2_000);
				control.addEventListener(
					'change',
					() => {
						const changedAt = performance.now();
						requestAnimationFrame(() => {
							requestAnimationFrame(() => {
								window.clearTimeout(timeout);
								resolve(performance.now() - changedAt);
							});
						});
					},
					{ once: true }
				);
			})
	);
	await motionSelect.focus();
	await page.keyboard.press('End');
	const interactionToNextPaint = await interactionLatency;
	testInfo.annotations.push({
		type: 'interaction-to-next-paint',
		description: `${interactionToNextPaint.toFixed(1)} ms`
	});
	expect(interactionToNextPaint).toBeLessThanOrEqual(200);
});

test('Alive Canvas work obeys desktop and compact frame/backing-store budgets', async ({
	browser,
	baseURL
}) => {
	const fixtures = [
		{
			name: 'desktop',
			viewport: { width: 1440, height: 1000 },
			deviceScaleFactor: 3,
			hasTouch: false,
			isMobile: false,
			frameCap: 60,
			rateCeiling: 65,
			pixelBudget: 4_000_000
		},
		{
			name: 'compact',
			viewport: { width: 390, height: 844 },
			deviceScaleFactor: 3,
			hasTouch: true,
			isMobile: true,
			frameCap: 45,
			rateCeiling: 50,
			pixelBudget: 1_250_000
		}
	] as const;

	for (const fixture of fixtures) {
		await test.step(fixture.name, async () => {
			const { context, page } = await createAliveContext(browser, baseURL, fixture);

			try {
				await page.goto('/writing');
				const canvas = page.locator('[data-ambient-field]');
				await expect(canvas).toHaveCount(1);
				await expect(canvas).toHaveAttribute('data-ambient-state', 'running');
				await expect(canvas).toHaveAttribute('data-ambient-frame-cap', String(fixture.frameCap));

				const quality = await canvas.evaluate((element: HTMLCanvasElement) => ({
					backingPixels: element.width * element.height,
					cssWidth: element.getBoundingClientRect().width,
					cssHeight: element.getBoundingClientRect().height
				}));
				expect(quality.backingPixels).toBeLessThanOrEqual(fixture.pixelBudget);
				expect(quality.cssWidth).toBeCloseTo(fixture.viewport.width, 0);
				expect(quality.cssHeight).toBeCloseTo(fixture.viewport.height, 0);

				await page.waitForTimeout(500);
				const before = (await audit(page)).ambientDraws;
				const sampleMilliseconds = 2_200;
				await page.waitForTimeout(sampleMilliseconds);
				const after = (await audit(page)).ambientDraws;
				const drawsPerSecond = ((after - before) * 1_000) / sampleMilliseconds;

				expect(drawsPerSecond).toBeGreaterThan(15);
				expect(drawsPerSecond).toBeLessThanOrEqual(fixture.rateCeiling);
			} finally {
				await context.close();
			}
		});
	}
});

test('the outer atmosphere owner pauses and resumes one Canvas on visibility changes', async ({
	page
}) => {
	await installAudit(page);
	await page.goto('/writing');

	const canvas = page.locator('[data-ambient-field]');
	await expect(canvas).toHaveAttribute('data-ambient-state', 'running');
	await canvas.evaluate((element) => {
		element.setAttribute('data-phase5-instance', 'original');
	});

	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'hidden'
		});
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect(canvas).toHaveAttribute('data-ambient-state', 'paused');
	const pausedAt = (await audit(page)).ambientDraws;
	await page.waitForTimeout(600);
	expect((await audit(page)).ambientDraws - pausedAt).toBeLessThanOrEqual(1);

	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'visible'
		});
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect(canvas).toHaveAttribute('data-ambient-state', 'running');
	await expect(canvas).toHaveAttribute('data-phase5-instance', 'original');
	await expect.poll(async () => (await audit(page)).ambientDraws).toBeGreaterThan(pausedAt + 2);
});

test('reading and specialist routes retain calm, single-owner contracts', async ({ page }) => {
	await installAudit(page);
	await page.goto(longArticlePath);
	await expect(page.locator('[data-route-atmosphere]')).toHaveAttribute('data-ambient', 'static');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
	const readingRegion = page.locator('[data-article-reading-region]');
	const animatedAncestors = await readingRegion.evaluate((region) => {
		const owners: string[] = [];
		let element: HTMLElement | null = region as HTMLElement;
		while (element) {
			const style = getComputedStyle(element);
			if (
				style.animationName !== 'none' ||
				element.getAnimations().some((animation) => {
					const effect = animation.effect;
					return effect instanceof KeyframeEffect && effect.target === element;
				})
			) {
				owners.push(element.tagName.toLowerCase());
			}
			element = element.parentElement;
		}
		return owners;
	});
	expect(animatedAncestors).toEqual([]);

	await page.goto('/resume');
	await expect(page.locator('[data-route-atmosphere]')).toHaveAttribute('data-ambient', 'static');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);

	await page.goto('/blog/visualizations');
	await expect(page.locator('[data-route-atmosphere]')).toHaveAttribute('data-ambient', 'static');
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
	await expect(page.locator('[data-local-animation-owner="artificial-life"]')).toHaveCount(1);
	await expect(page.locator('canvas[data-render-frame-cap="30"]')).toHaveCount(1);
	const telemetry = page.getByText(/^\d+ fps$/);
	await expect
		.poll(async () => Number.parseInt((await telemetry.textContent()) ?? '0', 10))
		.toBeGreaterThan(0);
	expect(Number.parseInt((await telemetry.textContent()) ?? '0', 10)).toBeLessThanOrEqual(35);
	const localCanvas = page.locator('canvas[data-render-frame-cap="30"]');
	await page.getByRole('button', { name: 'Pause', exact: true }).first().click();
	await expect(localCanvas).toHaveAttribute('data-simulation-state', 'paused');
	await expect(telemetry).toHaveText('0 fps');
	const pausedAt = (await audit(page)).localFrames;
	await page.waitForTimeout(600);
	expect((await audit(page)).localFrames - pausedAt).toBeLessThanOrEqual(1);
	await page
		.getByRole('button', { name: 'Advance 8 simulated seconds', exact: true })
		.first()
		.click();
	await expect(
		page.getByText('Advance complete: 8 simulated seconds (240 fixed ticks).')
	).toBeVisible();
	await expect(telemetry).toHaveText('0 fps');
	const advanceCompleteAt = (await audit(page)).localFrames;
	await page.waitForTimeout(400);
	expect((await audit(page)).localFrames - advanceCompleteAt).toBeLessThanOrEqual(1);
	await page.getByRole('button', { name: 'Resume', exact: true }).first().click();
	await expect(localCanvas).toHaveAttribute('data-simulation-state', 'running');
	await expect.poll(async () => (await audit(page)).localFrames).toBeGreaterThan(pausedAt + 2);
	await expect
		.poll(async () => Number.parseInt((await telemetry.textContent()) ?? '0', 10))
		.toBeGreaterThan(0);

	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	await expect
		.poll(async () =>
			localCanvas.evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				return bounds.bottom < -120 || bounds.top > window.innerHeight + 120;
			})
		)
		.toBe(true);
	await page.waitForTimeout(250);
	const offscreenAt = (await audit(page)).localFrames;
	await page.waitForTimeout(600);
	expect((await audit(page)).localFrames - offscreenAt).toBeLessThanOrEqual(1);
	await localCanvas.scrollIntoViewIfNeeded();
	await expect.poll(async () => (await audit(page)).localFrames).toBeGreaterThan(offscreenAt + 2);

	await page.goto('/blog/games');
	await expect(page.locator('html')).toHaveAttribute('data-biome', 'off');
	await expect(page.locator('[data-route-atmosphere]')).toHaveCount(0);
	await expect(page.locator('[data-ambient-field]')).toHaveCount(0);
});
