import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const articlePath = '/blog/visualizations/ray-marching-fragment-shader-from-scratch';
const capturePath = `${articlePath}?stage=8&scene=cathedral&capture=1`;
const articleTitle = 'The Pixel Has a Postbox: Build a 3D World with Ray Marching';
const posterPath = '/images/visualizations/ray-marching-cathedral/cathedral-poster.jpg';
const posterAlt =
	'A symmetrical hall of dark arches recedes into blue fog around a floating black orb. A narrow cyan-and-gold ring expands from the orb and travels across the floor, columns, and archways.';
const runtimeDiagnostics = new WeakMap<Page, string[]>();
const intentionalCompileFailurePages = new WeakSet<Page>();

function collectRuntimeDiagnostics(page: Page): string[] {
	const diagnostics: string[] = [];
	page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		const text = message.text();
		const source = `${message.location().url} ${text}`;
		if (source.includes('/_vercel/') || /favicon/iu.test(source)) return;
		if (
			intentionalCompileFailurePages.has(page) &&
			/RM_TEST_COMPILE_FAILURE|fragment shader failed to compile|error compiling (?:fragment )?shader|webgl.*(?:shader|program|invalid)/iu.test(
				text
			)
		) {
			return;
		}
		if (message.type() === 'error') diagnostics.push(`console error: ${text}`);
		if (
			message.type() === 'warning' &&
			/shader\s+(?:compile|link)|resizeobserver loop|gl_invalid|webgl.*error/iu.test(text)
		) {
			diagnostics.push(`console warning: ${text}`);
		}
	});
	return diagnostics;
}

function exhibit(page: Page): Locator {
	return page.locator('figure.cathedral-exhibit');
}

function shaderCanvas(page: Page): Locator {
	return exhibit(page).locator('canvas[data-ray-marching-canvas="true"]');
}

function canvasHost(page: Page): Locator {
	return exhibit(page).locator('.ray-marching-canvas');
}

async function waitForCathedral(page: Page, path = capturePath): Promise<Locator> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	const root = exhibit(page);
	await expect(root).toHaveCount(1);
	await root.scrollIntoViewIfNeeded();
	await expect(shaderCanvas(page)).toHaveCount(1, { timeout: 60_000 });
	await expect(root).toHaveAttribute(
		'data-ray-marching-state',
		/^(?:ready|paused|reduced-motion-paused)$/u,
		{ timeout: 60_000 }
	);
	await expect(shaderCanvas(page)).toBeVisible();
	return root;
}

async function canvasScreenshot(page: Page): Promise<Buffer> {
	return shaderCanvas(page).screenshot({ animations: 'disabled' });
}

async function expectNonblankCanvas(page: Page): Promise<void> {
	const stats = await sharp(await canvasScreenshot(page)).stats();
	const colourChannels = stats.channels.slice(0, 3);
	expect(Math.max(...colourChannels.map((channel) => channel.stdev))).toBeGreaterThan(2);
	expect(Math.max(...colourChannels.map((channel) => channel.max))).toBeGreaterThan(24);
}

async function pauseAtFreshTime(root: Locator): Promise<void> {
	await root.getByRole('button', { name: 'Restart motion', exact: true }).click();
	const pause = root.getByRole('button', { name: 'Pause', exact: true });
	await expect(pause).toBeVisible();
	await pause.click();
	await expect(root).toHaveAttribute('data-ray-marching-state', /paused$/u);
	await root.page().waitForTimeout(120);
}

async function assertNoJavaScriptFallback(browser: Browser, baseURL: string): Promise<void> {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	try {
		const response = await page.goto(`${baseURL}${articlePath}`, {
			waitUntil: 'domcontentloaded'
		});
		expect(response?.ok()).toBe(true);
		await expect(page.getByRole('heading', { level: 1, name: articleTitle })).toHaveCount(1);
		const root = exhibit(page);
		await expect(root.locator(`img[src="${posterPath}"]`)).toHaveAttribute('alt', posterAlt);
		await expect(root.locator('.noscript-note')).toContainText(/JavaScript is unavailable/iu);
		await expect(root.getByText(/The Cathedral of Distance\./u).last()).toBeVisible();
		await expect(root.locator('details.source-explorer')).toContainText(
			'Actual files running this exhibit'
		);
		await expect(root.locator('canvas')).toHaveCount(0);
	} finally {
		await context.close();
	}
}

test.beforeEach(({ page }) => {
	runtimeDiagnostics.set(page, collectRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(runtimeDiagnostics.get(page) ?? []).toEqual([]);
});

test('SSR and no-JavaScript responses contain the complete poster, caption, lesson and source', async ({
	request,
	browser,
	baseURL
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain(articleTitle);
	expect(html).toContain(posterPath);
	expect(html).toContain(posterAlt);
	expect(html).toContain('<figcaption');
	expect(html).toContain('The Cathedral of Distance.');
	expect(html).toContain('Actual files running this exhibit');
	expect(html).toContain('mapScene');
	expect(html).toContain('Frequently asked questions');
	expect(html.match(/<canvas\b/giu) ?? []).toHaveLength(0);
	await assertNoJavaScriptFallback(browser, baseURL ?? 'http://127.0.0.1:4257');
});

test('?webgl=off preserves the poster, prose, diagram and inspectable source', async ({ page }) => {
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const root = exhibit(page);
	await expect(root).toHaveAttribute('data-ray-marching-state', 'unavailable');
	await expect(root.locator(`img[src="${posterPath}"]`)).toBeVisible();
	await expect(root.getByText('Static fallback', { exact: true })).toBeVisible();
	await expect(root.locator('canvas')).toHaveCount(0);
	await expect(
		page.getByRole('heading', { name: 'Sphere tracing: how the postman walks' })
	).toBeVisible();
	await expect(page.getByRole('table', { name: /sphere-tracing samples/iu })).toBeAttached();
	await root.getByRole('button', { name: 'Source', exact: true }).click();
	await expect(root.locator('details.source-explorer')).toHaveAttribute('open', '');
	await expect(root.locator('details.source-file')).toHaveCount(7);
});

test('an initial fragment compile failure retains the poster and Retry rebuilds one visible canvas', async ({
	page
}) => {
	intentionalCompileFailurePages.add(page);
	await page.addInitScript(() => {
		Reflect.set(window, '__rayMarchingForceCompileFailure', true);
		Reflect.set(window, '__rayMarchingInjectedCompileFailures', 0);
		const cathedralFragments = new WeakSet<WebGLShader>();
		const contextPrototypes = [
			WebGLRenderingContext.prototype,
			typeof WebGL2RenderingContext === 'undefined' ? undefined : WebGL2RenderingContext.prototype
		].filter((prototype): prototype is WebGLRenderingContext => Boolean(prototype));

		for (const prototype of contextPrototypes) {
			const originalShaderSource = prototype.shaderSource;
			const originalShaderParameter = prototype.getShaderParameter;
			const originalShaderInfoLog = prototype.getShaderInfoLog;
			prototype.shaderSource = function (shader: WebGLShader, source: string): void {
				const isCathedralFragment = typeof source === 'string' && source.includes('u_pulseRadius');
				if (isCathedralFragment) cathedralFragments.add(shader);
				originalShaderSource.call(this, shader, source);
			};
			prototype.getShaderParameter = function (shader: WebGLShader, parameter: number): unknown {
				if (
					Reflect.get(window, '__rayMarchingForceCompileFailure') &&
					parameter === this.COMPILE_STATUS &&
					cathedralFragments.has(shader)
				) {
					const failures = Number(Reflect.get(window, '__rayMarchingInjectedCompileFailures') ?? 0);
					Reflect.set(window, '__rayMarchingInjectedCompileFailures', failures + 1);
					return false;
				}
				return originalShaderParameter.call(this, shader, parameter);
			};
			prototype.getShaderInfoLog = function (shader: WebGLShader): string | null {
				if (
					Reflect.get(window, '__rayMarchingForceCompileFailure') &&
					cathedralFragments.has(shader)
				) {
					return 'RM_TEST_COMPILE_FAILURE: deliberate fragment shader test failure';
				}
				return originalShaderInfoLog.call(this, shader);
			};
		}
	});

	await page.goto(capturePath, { waitUntil: 'domcontentloaded' });
	const root = exhibit(page);
	await root.scrollIntoViewIfNeeded();
	await expect(root).toHaveAttribute('data-ray-marching-state', 'shader-error', {
		timeout: 60_000
	});
	await expect(root.locator(`img[src="${posterPath}"]`)).toBeVisible();
	await expect(root.locator(`img[src="${posterPath}"]`)).not.toHaveClass(/poster-hidden/u);
	await expect(root.getByText('Shader could not start', { exact: true })).toBeVisible();
	const retry = root.getByRole('button', { name: 'Retry', exact: true });
	await expect(retry).toBeVisible();
	await expect(root.locator('canvas')).toHaveCount(1);
	const injectedFailures = await page.evaluate(() => {
		Reflect.set(window, '__rayMarchingForceCompileFailure', false);
		return Number(Reflect.get(window, '__rayMarchingInjectedCompileFailures'));
	});
	expect(injectedFailures).toBeGreaterThan(0);

	await retry.click();
	await expect(root).toHaveAttribute(
		'data-ray-marching-state',
		/^(?:ready|paused|reduced-motion-paused)$/u,
		{ timeout: 60_000 }
	);
	await expect(shaderCanvas(page)).toHaveCount(1);
	await expect(root.locator('canvas')).toHaveCount(1);
	await expect(root.locator(`img[src="${posterPath}"]`)).toHaveClass(/poster-hidden/u);
	await expect(retry).toHaveCount(0);
	await expectNonblankCanvas(page);
	expect(
		await page.evaluate(() => Reflect.get(window, '__rayMarchingInjectedCompileFailures'))
	).toBe(injectedFailures);
});

test('one WebGL canvas reaches a visible nonblank frame and all eight build stages differ', async ({
	page
}) => {
	const root = await waitForCathedral(page);
	await expect(root.locator('canvas')).toHaveCount(1);
	await expectNonblankCanvas(page);

	await root.getByRole('button', { name: 'Build it', exact: true }).click();
	const rail = root.getByRole('navigation', { name: 'Ray-marching build stages' });
	await expect(rail.getByRole('button')).toHaveCount(8);
	const stageTitles = [
		'Camera rays',
		'One distance',
		'The walking loop',
		'Surface direction',
		'Constructive geometry',
		'Fold space',
		'Make light believable',
		'Lose the horizon'
	] as const;
	const hashes = new Set<string>();
	for (const title of stageTitles) {
		const button = rail.getByRole('button', { name: new RegExp(`${title}$`, 'iu') });
		await button.click();
		await expect(button).toHaveAttribute('aria-current', 'step');
		await expect(
			root.locator('.stage-reading').getByRole('heading', { name: title })
		).toBeVisible();
		await expect(root.locator('.stage-source code')).not.toBeEmpty();
		await page.waitForTimeout(120);
		hashes.add(
			createHash('sha256')
				.update(await canvasScreenshot(page))
				.digest('hex')
		);
	}
	expect(hashes.size).toBe(stageTitles.length);

	await rail.getByRole('button', { name: /Make light believable$/iu }).click();
	await root.locator('details.settings > summary').click();
	const quality = root
		.locator('details.settings label')
		.filter({ hasText: /Quality/iu })
		.locator('select');
	await quality.selectOption('balanced');
	await page.waitForTimeout(180);
	const balancedLighting = await canvasScreenshot(page);
	await quality.selectOption('saver');
	await expect
		.poll(async () => (await canvasScreenshot(page)).equals(balancedLighting), { timeout: 5_000 })
		.toBe(false);
	await expect(root.locator('details.settings')).toContainText(
		'48 march steps; shadows and AO are compiled out.'
	);
	await expect(root.locator('canvas')).toHaveCount(1);
});

test('button, pointer and keyboard pulses work; dragging turns without launching a pulse; pause is still', async ({
	page
}) => {
	const root = await waitForCathedral(page);

	await pauseAtFreshTime(root);
	const stillBefore = await canvasScreenshot(page);
	await page.waitForTimeout(350);
	expect((await canvasScreenshot(page)).equals(stillBefore)).toBe(true);
	await root.getByRole('button', { name: 'Pulse', exact: true }).click();
	await expect
		.poll(async () => (await canvasScreenshot(page)).equals(stillBefore), { timeout: 5_000 })
		.toBe(false);

	await pauseAtFreshTime(root);
	const beforePointer = await canvasScreenshot(page);
	const host = canvasHost(page);
	const bounds = await host.boundingBox();
	expect(bounds).not.toBeNull();
	await page.mouse.click(
		(bounds?.x ?? 0) + (bounds?.width ?? 1) * 0.5,
		(bounds?.y ?? 0) + (bounds?.height ?? 1) * 0.5
	);
	await expect
		.poll(async () => (await canvasScreenshot(page)).equals(beforePointer), { timeout: 5_000 })
		.toBe(false);

	await pauseAtFreshTime(root);
	const beforeKeyboard = await canvasScreenshot(page);
	await host.focus();
	await page.keyboard.press('KeyP');
	await expect
		.poll(async () => (await canvasScreenshot(page)).equals(beforeKeyboard), { timeout: 5_000 })
		.toBe(false);

	await pauseAtFreshTime(root);
	const centred = await canvasScreenshot(page);
	const dragBounds = await host.boundingBox();
	expect(dragBounds).not.toBeNull();
	const startX = (dragBounds?.x ?? 0) + (dragBounds?.width ?? 1) * 0.42;
	const endX = (dragBounds?.x ?? 0) + (dragBounds?.width ?? 1) * 0.67;
	const y = (dragBounds?.y ?? 0) + (dragBounds?.height ?? 1) * 0.48;
	await page.mouse.move(startX, y);
	await page.mouse.down();
	await page.mouse.move(endX, y, { steps: 6 });
	await page.mouse.up();
	await page.waitForTimeout(120);
	expect((await canvasScreenshot(page)).equals(centred)).toBe(false);
	await host.press('Home');
	await page.waitForTimeout(120);
	// Returning to the same camera also proves the drag did not release as a pulse.
	expect((await canvasScreenshot(page)).equals(centred)).toBe(true);
});

test('reduced motion stays deterministic until Start; source, copy state and serious axe checks work', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (value: string) => {
					Reflect.set(window, '__rayMarchingClipboard', value);
				}
			}
		});
	});
	const root = await waitForCathedral(page);
	await expect(root).toHaveAttribute('data-ray-marching-state', 'reduced-motion-paused');
	const first = await canvasScreenshot(page);
	await page.waitForTimeout(400);
	expect((await canvasScreenshot(page)).equals(first)).toBe(true);
	await root.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(root).toHaveAttribute('data-ray-marching-state', 'ready');
	await expect
		.poll(async () => (await canvasScreenshot(page)).equals(first), { timeout: 10_000 })
		.toBe(false);
	await root.getByRole('button', { name: 'Pause', exact: true }).click();

	await root.locator('details.settings > summary').click();
	await root
		.locator('details.settings label')
		.filter({ hasText: /Debug view/iu })
		.locator('select')
		.selectOption('normals');
	await root
		.locator('details.settings label')
		.filter({ hasText: /Palette/iu })
		.locator('select')
		.selectOption('blue-hour');
	await root.getByRole('button', { name: 'Copy scene link', exact: true }).click();
	const sceneLink = await page.evaluate(() =>
		String(Reflect.get(window, '__rayMarchingClipboard'))
	);
	const copiedUrl = new URL(sceneLink);
	expect(copiedUrl.pathname).toBe(articlePath);
	expect(copiedUrl.searchParams.get('debug')).toBe('normals');
	expect(copiedUrl.searchParams.get('palette')).toBe('blue-hour');
	expect(copiedUrl.searchParams.has('capture')).toBe(false);

	await root.getByRole('button', { name: 'Source', exact: true }).click();
	const sourceExplorer = root.locator('details.source-explorer');
	await expect(sourceExplorer).toHaveAttribute('open', '');
	const canvasSource = sourceExplorer.locator('details.source-file', {
		has: page.getByText('RayMarchingCanvas.svelte', { exact: true })
	});
	await canvasSource.locator('summary').click();
	await canvasSource.getByRole('button', { name: /Copy RayMarchingCanvas\.svelte/iu }).click();
	await expect
		.poll(() => page.evaluate(() => String(Reflect.get(window, '__rayMarchingClipboard'))))
		.toContain('mountRayMarchingSketch');

	const results = await new AxeBuilder({ page })
		.include('figure.cathedral-exhibit')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(
		results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious'
		)
	).toEqual([]);
});

test('context restoration recreates one canvas and repeat navigation leaves no duplicate sketch', async ({
	page
}) => {
	const root = await waitForCathedral(page);
	const oldCanvas = shaderCanvas(page);
	const contextLossSupported = await oldCanvas.evaluate((canvas) => {
		const gl = (canvas as HTMLCanvasElement).getContext('webgl');
		const extension = gl?.getExtension('WEBGL_lose_context');
		if (!extension) return false;
		Reflect.set(window, '__rayMarchingLoseContext', extension);
		extension.loseContext();
		return true;
	});
	test.skip(!contextLossSupported, 'WEBGL_lose_context is unavailable in this Chromium renderer.');
	await expect(root).toHaveAttribute('data-ray-marching-state', 'context-lost');
	await expect(root.getByText('WebGL context lost', { exact: true })).toBeVisible();
	await oldCanvas.evaluate(() => {
		const extension = Reflect.get(window, '__rayMarchingLoseContext') as
			| { restoreContext: () => void }
			| undefined;
		extension?.restoreContext();
		Reflect.deleteProperty(window, '__rayMarchingLoseContext');
	});
	await expect(root).toHaveAttribute(
		'data-ray-marching-state',
		/^(?:ready|paused|reduced-motion-paused)$/u,
		{ timeout: 60_000 }
	);
	await expect(shaderCanvas(page)).toHaveCount(1);
	await expectNonblankCanvas(page);

	await page.goto('/blog', { waitUntil: 'domcontentloaded' });
	await page.goBack({ waitUntil: 'domcontentloaded' });
	await expect(exhibit(page)).toHaveCount(1);
	await exhibit(page).scrollIntoViewIfNeeded();
	await expect(shaderCanvas(page)).toHaveCount(1, { timeout: 60_000 });
	await expect(exhibit(page)).toHaveAttribute(
		'data-ray-marching-state',
		/^(?:ready|paused|reduced-motion-paused)$/u,
		{ timeout: 60_000 }
	);
	await expect(shaderCanvas(page)).toHaveCount(1);
});

test('phone, landscape, tablet, desktop and fullscreen layouts preserve aspect, scroll and controls', async ({
	page
}) => {
	const root = await waitForCathedral(page);
	const fullscreenButton = root.getByRole('button', { name: 'Fullscreen', exact: true });
	await fullscreenButton.click();
	const exitFullscreen = root.getByRole('button', { name: 'Exit expanded view', exact: true });
	await expect(exitFullscreen).toBeVisible();
	await expect(shaderCanvas(page)).toHaveCount(1);
	await exitFullscreen.click();
	const restoredFullscreenButton = root.getByRole('button', {
		name: 'Fullscreen',
		exact: true
	});
	await expect(restoredFullscreenButton).toBeFocused();

	// Exercise the contained expanded-mode fallback too; unlike native fullscreen,
	// its Escape handling is page script and therefore deterministic in automation.
	await root.evaluate((element) => {
		Object.defineProperty(element, 'requestFullscreen', {
			configurable: true,
			value: undefined
		});
	});
	await restoredFullscreenButton.click();
	await expect(root.getByRole('button', { name: 'Exit expanded view', exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(restoredFullscreenButton).toBeFocused();

	for (const viewport of [
		{ width: 320, height: 720 },
		{ width: 390, height: 844 },
		{ width: 844, height: 390 },
		{ width: 768, height: 1024 },
		{ width: 1024, height: 768 },
		{ width: 1440, height: 900 }
	]) {
		await page.setViewportSize(viewport);
		await root.scrollIntoViewIfNeeded();
		await page.waitForTimeout(180);
		await expect(shaderCanvas(page)).toHaveCount(1);
		const geometry = await root.evaluate((element) => {
			const canvas = element.querySelector<HTMLCanvasElement>(
				'canvas[data-ray-marching-canvas="true"]'
			);
			const host = element.querySelector<HTMLElement>('.ray-marching-canvas');
			const canvasBounds = canvas?.getBoundingClientRect();
			const visibleControls = [...element.querySelectorAll<HTMLElement>('button, summary, select')]
				.filter((control) => control.offsetParent !== null)
				.map((control) => {
					const bounds = control.getBoundingClientRect();
					return { width: bounds.width, height: bounds.height, label: control.textContent?.trim() };
				});
			return {
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth,
				exhibitOverflow: element.scrollWidth - element.clientWidth,
				touchAction: host ? getComputedStyle(host).touchAction : '',
				canvasTouchAction: canvas ? getComputedStyle(canvas).touchAction : '',
				cssAspect: canvasBounds ? canvasBounds.width / canvasBounds.height : 0,
				backingAspect: canvas ? canvas.width / canvas.height : 0,
				undersized: visibleControls.filter(
					(control) => control.width < 43.5 || control.height < 43.5
				)
			};
		});
		expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
		expect(geometry.exhibitOverflow).toBeLessThanOrEqual(1);
		expect(geometry.touchAction).toBe('pan-y');
		expect(geometry.canvasTouchAction).toBe('pan-y');
		expect(Math.abs(geometry.cssAspect - geometry.backingAspect)).toBeLessThan(0.03);
		expect(geometry.undersized).toEqual([]);
	}
});
