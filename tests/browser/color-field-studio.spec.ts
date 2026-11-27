import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import {
	expect,
	test,
	type Browser,
	type BrowserContext,
	type BrowserContextOptions,
	type Locator,
	type Page
} from '@playwright/test';
import { usePausedMediaPreference } from '../helpers/privacy-choice';

const ROUTE_PATH = '/tools/color-field-studio';
const ARTICLE_PATH = '/blog/visualizations/color-field-painting-color-edges-and-space';
const LISTING_PATH = '/blog/visualizations';
const ESSAY_TITLE = 'Color Field Painting — Color, Edges, and Space';
const OPENING_SHARP_PLATE = '/images/visualizations/color-field-studio/example-two-areas-sharp.png';
const OPENING_SOFT_PLATE =
	'/images/visualizations/color-field-studio/example-two-areas-soft-translucent.png';
const CANVAS_SELECTOR =
	'[data-testid="color-field-canvas"], canvas[data-phase], main canvas, canvas';
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const STUDIO_QUERY_KEYS = [
	'areas',
	'size',
	'edge',
	'trans',
	'texture',
	'time',
	'study',
	'seed',
	'artboard',
	'view'
] as const;

interface RuntimeTracker {
	pageErrors: string[];
	consoleErrors: string[];
	failedRequests: string[];
}

interface PixelStats {
	width: number;
	height: number;
	opaqueAll: boolean;
	transparentEdgePixels: number;
	meanLuma: number;
	lumaVariance: number;
	chromaticSampleRatio: number;
	distinctSampleColors: number;
	distinctSampleColors32: number;
	meanLocalGradient: number;
	pureWhiteGlareRatio: number;
}

interface DecodedPngStats {
	width: number;
	height: number;
	opaqueAll: boolean;
	distinctSampleColors: number;
	chromaticSampleRatio: number;
}

interface ContrastMetric {
	label: string;
	contrastOverDark: number;
	contrastOverLight: number;
	minRequiredRatio: number;
}

function isNoiseAssetUrl(url: string): boolean {
	return url.includes('/_vercel/') || /favicon/iu.test(url);
}

async function stubLoopbackAnalytics(page: Page, baseURL: string | undefined): Promise<void> {
	const host = baseURL ? new URL(baseURL).hostname : '127.0.0.1';
	if (host !== '127.0.0.1' && host !== 'localhost') return;
	await page.route('**/_vercel/insights/**', (route) =>
		route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
	);
	await page.route('**/_vercel/speed-insights/**', (route) =>
		route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
	);
}

function trackRuntime(
	page: Page,
	{ allowNoJavaScriptAssetCsp = false }: { allowNoJavaScriptAssetCsp?: boolean } = {}
): RuntimeTracker {
	const tracker: RuntimeTracker = {
		pageErrors: [],
		consoleErrors: [],
		failedRequests: []
	};
	page.on('pageerror', (err) => tracker.pageErrors.push(err.message));
	page.on('console', (msg) => {
		if (msg.type() !== 'error') return;
		const source = `${msg.location().url} ${msg.text()}`;
		if (isNoiseAssetUrl(source)) return;
		tracker.consoleErrors.push(msg.text());
	});
	page.on('requestfailed', (req) => {
		const url = req.url();
		if (!url.startsWith('http://127.0.0.1') && !url.startsWith('http://localhost')) return;
		if (isNoiseAssetUrl(url)) return;
		const reason = req.failure()?.errorText ?? 'failed';
		if (
			allowNoJavaScriptAssetCsp &&
			reason === 'csp' &&
			new URL(url).pathname.startsWith('/_app/')
		) {
			return;
		}
		tracker.failedRequests.push(`${req.method()} ${url}: ${reason}`);
	});
	return tracker;
}

async function withContext<T>(
	browser: Browser,
	options: BrowserContextOptions,
	baseURL: string | undefined,
	fn: (context: BrowserContext, page: Page, tracker: RuntimeTracker) => Promise<T>
): Promise<T> {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		reducedMotion: 'reduce',
		acceptDownloads: true,
		...options,
		serviceWorkers: 'block'
	});
	await usePausedMediaPreference(context);
	const page = await context.newPage();
	await stubLoopbackAnalytics(page, baseURL);
	const tracker = trackRuntime(page, {
		allowNoJavaScriptAssetCsp: options.javaScriptEnabled === false
	});
	try {
		return await fn(context, page, tracker);
	} finally {
		await context.close();
	}
}

async function assertCleanRuntime(tracker: RuntimeTracker): Promise<void> {
	expect(tracker.pageErrors).toEqual([]);
	expect(tracker.consoleErrors).toEqual([]);
	expect(tracker.failedRequests).toEqual([]);
}

function getCanvas(page: Page): Locator {
	return page.locator(CANVAS_SELECTOR).first();
}

function getEssayHeading(page: Page): Locator {
	return page.getByRole('heading', { level: 1, name: ESSAY_TITLE, exact: true });
}

async function assertEmbeddedEssayLoaded(page: Page): Promise<void> {
	await expect(getEssayHeading(page)).toBeVisible();
	await expect(page.locator('.cf-article-fallback')).toHaveCount(0);
	await expect(page.locator('article h2').first()).toBeVisible();
}

async function sha256CanvasPixels(page: Page): Promise<string> {
	const dataUrl = await page.evaluate((selector) => {
		const canvas = document.querySelector(selector);
		if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
			return '';
		}
		return canvas.toDataURL('image/png');
	}, CANVAS_SELECTOR);
	expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
	const payload = dataUrl.slice('data:image/png;base64,'.length);
	return createHash('sha256').update(Buffer.from(payload, 'base64')).digest('hex');
}

async function analyzeCanvasPixels(page: Page): Promise<PixelStats> {
	return await page.evaluate((selector) => {
		const canvas = document.querySelector(selector);
		if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
			throw new Error('Missing or zero-sized Color Field canvas');
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Missing 2D canvas context');
		}
		const { width, height } = canvas;
		const data = ctx.getImageData(0, 0, width, height).data;

		let opaqueAll = true;
		let transparentEdgePixels = 0;
		let totalSamples = 0;
		let lumaSum = 0;
		let lumaSqSum = 0;
		let chromaticSamples = 0;
		let pureWhiteGlare = 0;
		let gradientSum = 0;
		let gradientCount = 0;
		const quantizedColors = new Set<number>();
		const quantizedColors32 = new Set<number>();

		const lumaAt = (px: number, py: number): number => {
			const idx = (py * width + px) * 4;
			const r = data[idx] ?? 0;
			const g = data[idx + 1] ?? 0;
			const b = data[idx + 2] ?? 0;
			return 0.2126 * r + 0.7152 * g + 0.0722 * b;
		};

		const step = 2;
		for (let y = 0; y < height; y += step) {
			for (let x = 0; x < width; x += step) {
				const idx = (y * width + x) * 4;
				const r = data[idx] ?? 0;
				const g = data[idx + 1] ?? 0;
				const b = data[idx + 2] ?? 0;
				const a = data[idx + 3] ?? 0;
				totalSamples += 1;

				if (a !== 255) {
					opaqueAll = false;
					if (x < 8 || y < 8 || x >= width - 8 || y >= height - 8) {
						transparentEdgePixels += 1;
					}
				}

				const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
				lumaSum += luma;
				lumaSqSum += luma * luma;

				if (Math.max(r, g, b) - Math.min(r, g, b) >= 10) {
					chromaticSamples += 1;
				}
				if (r >= 252 && g >= 252 && b >= 252) {
					pureWhiteGlare += 1;
				}
				if (x + step < width && y + step < height) {
					const dx = Math.abs(lumaAt(x + step, y) - luma);
					const dy = Math.abs(lumaAt(x, y + step) - luma);
					gradientSum += dx + dy;
					gradientCount += 1;
				}

				quantizedColors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
				quantizedColors32.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
			}
		}

		const meanLuma = totalSamples > 0 ? lumaSum / totalSamples : 0;
		const lumaVariance =
			totalSamples > 1 ? Math.max(0, lumaSqSum / totalSamples - meanLuma * meanLuma) : 0;

		return {
			width,
			height,
			opaqueAll,
			transparentEdgePixels,
			meanLuma,
			lumaVariance,
			chromaticSampleRatio: totalSamples > 0 ? chromaticSamples / totalSamples : 0,
			distinctSampleColors: quantizedColors.size,
			distinctSampleColors32: quantizedColors32.size,
			meanLocalGradient: gradientCount > 0 ? gradientSum / gradientCount : 0,
			pureWhiteGlareRatio: totalSamples > 0 ? pureWhiteGlare / totalSamples : 0
		};
	}, CANVAS_SELECTOR);
}

async function analyzeDecodedPng(page: Page, pngBytes: Buffer): Promise<DecodedPngStats> {
	return await page.evaluate(async (encoded) => {
		const raw = Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0));
		const blob = new Blob([raw], { type: 'image/png' });
		const bitmap = await createImageBitmap(blob);
		const offscreen = document.createElement('canvas');
		offscreen.width = bitmap.width;
		offscreen.height = bitmap.height;
		const ctx = offscreen.getContext('2d');
		if (!ctx) {
			bitmap.close();
			throw new Error('Could not create 2D context for decoded PNG');
		}
		ctx.drawImage(bitmap, 0, 0);
		bitmap.close();

		const { width, height } = offscreen;
		const data = ctx.getImageData(0, 0, width, height).data;
		let opaqueAll = true;
		for (let i = 3; i < data.length; i += 4) {
			if (data[i] !== 255) {
				opaqueAll = false;
				break;
			}
		}

		const step = Math.max(2, Math.floor(Math.max(width, height) / 512));
		const quantizedColors = new Set<number>();
		let totalSamples = 0;
		let chromaticSamples = 0;
		for (let y = 0; y < height; y += step) {
			for (let x = 0; x < width; x += step) {
				const idx = (y * width + x) * 4;
				const r = data[idx] ?? 0;
				const g = data[idx + 1] ?? 0;
				const b = data[idx + 2] ?? 0;
				totalSamples += 1;
				if (Math.max(r, g, b) - Math.min(r, g, b) >= 10) {
					chromaticSamples += 1;
				}
				quantizedColors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
			}
		}

		offscreen.width = 0;
		offscreen.height = 0;
		return {
			width,
			height,
			opaqueAll,
			distinctSampleColors: quantizedColors.size,
			chromaticSampleRatio: totalSamples > 0 ? chromaticSamples / totalSamples : 0
		};
	}, pngBytes.toString('base64'));
}

function readPngIhdrDimensions(pngBytes: Buffer): { width: number; height: number } {
	expect(pngBytes.byteLength).toBeGreaterThanOrEqual(24);
	expect(pngBytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
	expect(pngBytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
	return {
		width: pngBytes.readUInt32BE(16),
		height: pngBytes.readUInt32BE(20)
	};
}

function verifyPngHeaders(
	pngBytes: Buffer,
	expectedLongSide: number
): { width: number; height: number } {
	const { width, height } = readPngIhdrDimensions(pngBytes);
	expect(Math.max(width, height)).toBe(expectedLongSide);
	expect(Math.min(width, height)).toBeGreaterThan(Math.floor(expectedLongSide * 0.45));
	return { width, height };
}

function readStudioQueryParams(
	page: Page
): Record<(typeof STUDIO_QUERY_KEYS)[number], string | null> {
	const params = new URL(page.url()).searchParams;
	return Object.fromEntries(STUDIO_QUERY_KEYS.map((key) => [key, params.get(key)])) as Record<
		(typeof STUDIO_QUERY_KEYS)[number],
		string | null
	>;
}

function readExpectedStudioQueryParams(
	href: string
): Record<(typeof STUDIO_QUERY_KEYS)[number], string | null> {
	const params = new URL(href, 'http://127.0.0.1:4331').searchParams;
	return Object.fromEntries(STUDIO_QUERY_KEYS.map((key) => [key, params.get(key)])) as Record<
		(typeof STUDIO_QUERY_KEYS)[number],
		string | null
	>;
}

async function ensureControlsExpanded(page: Page): Promise<void> {
	const controlsBtn = page.getByRole('button', { name: 'Controls', exact: true });
	const expanded = await controlsBtn.getAttribute('aria-expanded');
	if (expanded !== 'true') {
		await controlsBtn.click();
		await expect(controlsBtn).toHaveAttribute('aria-expanded', 'true');
	}
}

async function ensureControlsCollapsed(page: Page): Promise<void> {
	const controlsBtn = page.getByRole('button', { name: 'Controls', exact: true });
	const expanded = await controlsBtn.getAttribute('aria-expanded');
	if (expanded === 'true') {
		const closeBtn = page.getByRole('button', { name: /Close controls/i });
		if ((await closeBtn.count()) > 0 && (await closeBtn.first().isVisible())) {
			await closeBtn.first().click();
		} else {
			await controlsBtn.click();
		}
		await expect(controlsBtn).toHaveAttribute('aria-expanded', 'false');
	}
}

async function openMoreOptions(page: Page): Promise<void> {
	await ensureControlsExpanded(page);
	const resetBtn = page.getByRole('button', { name: /^Reset/i });
	if ((await resetBtn.count()) > 0 && (await resetBtn.first().isVisible())) {
		return;
	}
	const moreSummary = page.getByText('More options', { exact: false }).first();
	await moreSummary.scrollIntoViewIfNeeded();
	await moreSummary.click();
	await expect(page.getByRole('button', { name: /^Reset/i })).toBeVisible();
}

function getKnobSlider(page: Page, label: string): Locator {
	return page.getByRole('slider', { name: new RegExp(label, 'i') }).first();
}

async function setSliderValue(page: Page, label: string, targetValue: number): Promise<void> {
	const slider = getKnobSlider(page, label);
	await slider.scrollIntoViewIfNeeded();
	const tagName = await slider.evaluate((el) => el.tagName.toUpperCase());

	if (tagName === 'INPUT') {
		await slider.evaluate((el, nextVal) => {
			if (!(el instanceof HTMLInputElement)) {
				throw new Error('Expected native HTMLInputElement range control');
			}
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			if (setter) {
				setter.call(el, String(nextVal));
			} else {
				el.value = String(nextVal);
			}
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
		}, targetValue);
	} else {
		await slider.focus();
		const minAttr = Number(await slider.getAttribute('aria-valuemin'));
		const maxAttr = Number(await slider.getAttribute('aria-valuemax'));
		const readCurrent = async (): Promise<number> =>
			Number(await slider.getAttribute('aria-valuenow'));

		let current = await readCurrent();
		if (
			Number.isFinite(minAttr) &&
			Math.abs(targetValue - minAttr) < Math.abs(targetValue - current)
		) {
			await slider.press('Home');
			current = await readCurrent();
		} else if (
			Number.isFinite(maxAttr) &&
			Math.abs(targetValue - maxAttr) < Math.abs(targetValue - current)
		) {
			await slider.press('End');
			current = await readCurrent();
		}

		for (let i = 0; i < 120 && current !== targetValue; i += 1) {
			const prev = current;
			await slider.press(current < targetValue ? 'ArrowRight' : 'ArrowLeft');
			current = await readCurrent();
			if (current === prev) break;
		}
	}

	await expect
		.poll(
			async () =>
				await slider.evaluate(
					(el) =>
						el.getAttribute('aria-valuenow') ?? (el instanceof HTMLInputElement ? el.value : '')
				)
		)
		.toBe(String(targetValue));
}

async function getVisibleDragTargetBox(
	slider: Locator,
	label: string
): Promise<{ x: number; y: number; width: number; height: number }> {
	const dialBox = await slider.evaluate((el, knobLabel) => {
		const isVisibleBox = (r: DOMRect): boolean => r.width >= 20 && r.height >= 20;
		let container: Element | null = el.parentElement;
		const re = new RegExp(knobLabel, 'i');
		while (container && container.parentElement && !re.test(container.textContent ?? '')) {
			container = container.parentElement;
		}
		const scope = container ?? el.parentElement ?? el;
		const candidates = [
			...Array.from(scope.querySelectorAll('[title*="drag" i]')),
			...Array.from(scope.querySelectorAll('svg, [role="slider"]'))
		];
		for (const cand of candidates) {
			const style = getComputedStyle(cand);
			if (style.visibility === 'hidden' || style.display === 'none') continue;
			const r = cand.getBoundingClientRect();
			if (isVisibleBox(r)) {
				return { x: r.x, y: r.y, width: r.width, height: r.height };
			}
		}
		return null;
	}, label);
	if (dialBox) {
		return dialBox;
	}
	const directBox = await slider.boundingBox();
	if (directBox && directBox.width >= 16 && directBox.height >= 16) {
		return directBox;
	}
	throw new Error(`No visible drag target found for slider "${label}"`);
}

async function selectAlternateStudy(page: Page): Promise<void> {
	await openMoreOptions(page);
	const studyCombobox = page.getByRole('combobox', { name: /Stud/i });
	if ((await studyCombobox.count()) > 0 && (await studyCombobox.first().isVisible())) {
		const options = await studyCombobox.first().evaluate((el) => {
			if (!(el instanceof HTMLSelectElement)) return [] as string[];
			return Array.from(el.options).map((opt) => opt.value);
		});
		const currentVal = await studyCombobox.first().inputValue();
		const alternate = options.find((opt) => opt && opt !== currentVal);
		expect(alternate).toBeTruthy();
		await studyCombobox.first().selectOption(alternate!);
		return;
	}

	const studyRadios = page.getByRole('radio');
	if ((await studyRadios.count()) >= 2) {
		const count = await studyRadios.count();
		for (let i = 0; i < count; i += 1) {
			const radio = studyRadios.nth(i);
			if ((await radio.isVisible()) && !(await radio.isChecked())) {
				await radio.click();
				return;
			}
		}
	}

	const roleGroup = page.getByRole('group', { name: /Stud/i });
	const studyGroup =
		(await roleGroup.count()) > 0
			? roleGroup
			: page.locator('[data-testid*="stud" i], fieldset').filter({
					hasText: /Stud/i
				});
	const buttons = studyGroup.locator('button');
	const btnCount = await buttons.count();
	expect(btnCount).toBeGreaterThanOrEqual(2);
	for (let i = 0; i < btnCount; i += 1) {
		const btn = buttons.nth(i);
		const pressed = await btn.getAttribute('aria-pressed');
		if (pressed !== 'true' && (await btn.isVisible())) {
			await btn.click();
			return;
		}
	}
	await buttons.nth(1).click();
}

async function readVisibleSeed(page: Page): Promise<string> {
	const params = new URL(page.url()).searchParams;
	const urlSeed = params.get('seed') ?? params.get('s');
	if (urlSeed) return urlSeed;

	const controlsBtn = page.getByRole('button', { name: 'Controls', exact: true });
	const wasExpanded = (await controlsBtn.getAttribute('aria-expanded')) === 'true';
	const applyBtn = page.getByRole('button', { name: /^Apply$/i });
	const wasMoreOpen = (await applyBtn.count()) > 0 && (await applyBtn.first().isVisible());

	await openMoreOptions(page);
	const seedInput = page.getByLabel(/Painting seed|^Seed$/i).first();
	const seedValue = (await seedInput.inputValue()).trim();

	if (!wasExpanded) {
		await ensureControlsCollapsed(page);
	} else if (!wasMoreOpen) {
		const moreSummary = page.getByText('More options', { exact: false }).first();
		if ((await moreSummary.count()) > 0 && (await moreSummary.isVisible())) {
			await moreSummary.click();
		}
	}
	return seedValue;
}

async function applyCustomSeed(page: Page, seed: string): Promise<void> {
	await openMoreOptions(page);
	const seedInput = page.getByLabel(/Painting seed|^Seed$/i).first();
	await seedInput.scrollIntoViewIfNeeded();
	await seedInput.fill(seed);
	await page.getByRole('button', { name: /^Apply$/i }).click();
}

async function readAccessibleSummary(page: Page): Promise<string> {
	const canvas = getCanvas(page);
	const describedById = await canvas.getAttribute('aria-describedby');
	if (describedById) {
		const texts: string[] = [];
		for (const id of describedById.trim().split(/\s+/)) {
			const text = await page.evaluate((targetId) => {
				return document.getElementById(targetId)?.textContent?.trim() ?? '';
			}, id);
			if (text) texts.push(text);
		}
		if (texts.length > 0) return texts.join(' ');
	}
	return (await canvas.getAttribute('aria-label'))?.trim() ?? '';
}

async function panInspect(page: Page, direction: 'left' | 'right' | 'up' | 'down'): Promise<void> {
	const btn = page.getByRole('button', { name: new RegExp(`Pan.*${direction}`, 'i') });
	if ((await btn.count()) > 0 && (await btn.first().isVisible())) {
		await btn.first().click();
		return;
	}
	const keyMap = {
		left: 'ArrowLeft',
		right: 'ArrowRight',
		up: 'ArrowUp',
		down: 'ArrowDown'
	} as const;
	await getCanvas(page).focus();
	await page.keyboard.press(keyMap[direction]);
}

async function finishIfPlaying(page: Page): Promise<void> {
	const finishBtn = page.getByRole('button', { name: 'Finish now', exact: true });
	if ((await finishBtn.count()) > 0 && (await finishBtn.first().isVisible())) {
		await finishBtn.first().click();
		await expect(finishBtn).toHaveCount(0);
	}
}

async function exportPng(
	page: Page,
	longerSide: 2048 | 4096
): Promise<{ filename: string; bytes: Buffer; width: number; height: number }> {
	await page.getByRole('button', { name: 'Save image', exact: true }).click();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: new RegExp(`${longerSide}\\s*px`, 'i') }).click();
	const download = await downloadPromise;
	const filename = download.suggestedFilename();
	const filePath = await download.path();
	expect(filePath).toBeTruthy();
	const bytes = await readFile(filePath!);
	const { width, height } = verifyPngHeaders(bytes, longerSide);
	return { filename, bytes, width, height };
}

async function getEffectiveOpacity(locator: Locator): Promise<number> {
	return await locator.evaluate((el) => {
		let acc = 1;
		let cur: Element | null = el;
		while (cur) {
			const op = Number.parseFloat(getComputedStyle(cur).opacity || '1');
			if (Number.isFinite(op)) {
				acc *= Math.max(0, Math.min(1, op));
			}
			cur = cur.parentElement;
		}
		return acc;
	});
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
	const overflow = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		innerWidth: window.innerWidth
	}));
	expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

async function assertCanvasAspectUniform(page: Page): Promise<void> {
	const info = await page.evaluate((selector) => {
		const canvas = document.querySelector(selector);
		if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
			return null;
		}
		const rect = canvas.getBoundingClientRect();
		const objectFit = getComputedStyle(canvas).objectFit;
		const cssRatio = rect.width / Math.max(1, rect.height);
		const backingRatio = canvas.width / Math.max(1, canvas.height);
		return {
			objectFit,
			isUniform:
				objectFit === 'cover' || objectFit === 'contain' || Math.abs(cssRatio - backingRatio) < 0.05
		};
	}, CANVAS_SELECTOR);
	expect(info).not.toBeNull();
	expect(info!.isUniform).toBe(true);
}

async function assertMobileTouchTargets(page: Page): Promise<void> {
	const targets = await page.evaluate(() => {
		const effectiveOpacity = (el: Element): number => {
			let acc = 1;
			let cur: Element | null = el;
			while (cur) {
				const op = Number.parseFloat(getComputedStyle(cur).opacity || '1');
				if (Number.isFinite(op)) acc *= Math.max(0, Math.min(1, op));
				cur = cur.parentElement;
			}
			return acc;
		};

		const elements = Array.from(
			document.querySelectorAll(
				'button, [role="button"], summary, select, a, input[type="range"], [role="slider"], input[type="text"], [role="switch"]'
			)
		);
		const measured: Array<{ label: string; w: number; h: number }> = [];
		const sliderSelector = 'input[type="range"], [role="slider"]';

		for (const el of elements) {
			if (el.classList.contains('skip-link')) continue;
			if (el.closest('article')) continue;
			if (el.tagName === 'A' && el.closest('dialog p') !== null) continue;
			const closedDetails = el.closest('details:not([open])');
			if (closedDetails && !el.closest('summary')) continue;
			if (
				el.matches(':disabled') ||
				el.getAttribute('aria-disabled') === 'true' ||
				el.getAttribute('aria-hidden') === 'true' ||
				el.closest('[aria-hidden="true"]') !== null ||
				el.closest(':disabled, [aria-disabled="true"]') !== null
			) {
				continue;
			}
			const style = getComputedStyle(el);
			if (style.visibility === 'hidden' || style.display === 'none') continue;
			const r = el.getBoundingClientRect();
			if (r.width <= 0 || r.height <= 0) continue;

			const isSlider =
				(el instanceof HTMLInputElement && el.type === 'range') ||
				el.getAttribute('role') === 'slider';
			const elOpacity = effectiveOpacity(el);
			const isSrOnlyRange = isSlider && (r.width <= 2 || r.height <= 2 || elOpacity <= 0.05);
			if (isSrOnlyRange) {
				const hostOpacity = el.parentElement ? effectiveOpacity(el.parentElement) : 1;
				if (hostOpacity <= 0.05) continue;
			} else if (elOpacity <= 0.05) {
				continue;
			}

			if (isSlider) {
				if (r.width <= 4 || r.height <= 4 || isSrOnlyRange) {
					let scope: Element | null = el.parentElement;
					while (
						scope &&
						scope.parentElement &&
						scope.querySelector('[title*="drag" i]') === null &&
						(scope.getBoundingClientRect().height < 43.5 ||
							scope.getBoundingClientRect().width < 43.5) &&
						scope.parentElement.querySelectorAll(sliderSelector).length <= 1
					) {
						scope = scope.parentElement;
					}
					const isSingleSliderScope =
						scope !== null && scope.querySelectorAll(sliderSelector).length <= 1;
					const visibleDragTarget =
						isSingleSliderScope && scope !== null
							? Array.from(scope.querySelectorAll('[title*="drag" i]')).find((cand) => {
									const cs = getComputedStyle(cand);
									if (cs.display === 'none' || cs.visibility === 'hidden') return false;
									const cr = cand.getBoundingClientRect();
									return cr.width > 0 && cr.height > 0;
								})
							: null;
					const dialOrWrap = visibleDragTarget ?? el;
					const dr = dialOrWrap.getBoundingClientRect();
					measured.push({
						label: (el.getAttribute('aria-label') ?? el.id ?? 'slider').trim(),
						w: dr.width,
						h: dr.height
					});
				} else {
					measured.push({
						label: (el.getAttribute('aria-label') ?? el.id ?? 'slider').trim(),
						w: r.width,
						h: r.height
					});
				}
				continue;
			}

			measured.push({
				label:
					el.textContent?.trim() ||
					(el instanceof HTMLInputElement ? el.value.trim() : '') ||
					el.getAttribute('aria-label')?.trim() ||
					el.tagName,
				w: r.width,
				h: r.height
			});
		}
		return measured;
	});

	expect(targets.length).toBeGreaterThan(0);
	for (const target of targets) {
		expect(target.w, `${target.label} width`).toBeGreaterThanOrEqual(43.5);
		expect(target.h, `${target.label} height`).toBeGreaterThanOrEqual(43.5);
	}
}

async function measureToolbarContrast(page: Page): Promise<ContrastMetric[]> {
	return await page.evaluate(() => {
		const parseAlpha = (token: string | undefined): number => {
			if (!token) return 1;
			const trimmed = token.trim();
			if (trimmed.endsWith('%')) {
				const pct = Number.parseFloat(trimmed.slice(0, -1));
				return Number.isFinite(pct) ? Math.max(0, Math.min(1, pct / 100)) : 1;
			}
			const num = Number.parseFloat(trimmed);
			return Number.isFinite(num) ? Math.max(0, Math.min(1, num)) : 1;
		};

		const parseChannel = (token: string | undefined): number => {
			if (!token) return 0;
			const trimmed = token.trim();
			if (trimmed.endsWith('%')) {
				const pct = Number.parseFloat(trimmed.slice(0, -1));
				return Number.isFinite(pct) ? (pct / 100) * 255 : 0;
			}
			const num = Number.parseFloat(trimmed);
			return Number.isFinite(num) ? num : 0;
		};

		const parseRgba = (raw: string): [number, number, number, number] => {
			const rgbMatch = raw.match(/rgba?\(([^)]+)\)/i);
			if (rgbMatch) {
				const parts = rgbMatch[1]!
					.split(/[\s,/]+/)
					.map((v) => v.trim())
					.filter(Boolean);
				return [
					parseChannel(parts[0]),
					parseChannel(parts[1]),
					parseChannel(parts[2]),
					parseAlpha(parts[3])
				];
			}
			const srgbMatch = raw.match(/color\(\s*srgb\s+([^)]+)\)/i);
			if (srgbMatch) {
				const parts = srgbMatch[1]!
					.split(/[\s/]+/)
					.map((v) => v.trim())
					.filter(Boolean);
				return [
					(Number.parseFloat(parts[0] ?? '0') || 0) * 255,
					(Number.parseFloat(parts[1] ?? '0') || 0) * 255,
					(Number.parseFloat(parts[2] ?? '0') || 0) * 255,
					parseAlpha(parts[3])
				];
			}
			return [0, 0, 0, 0];
		};

		const compositeOver = (
			fg: [number, number, number, number],
			bg: [number, number, number]
		): [number, number, number] => {
			const a = Math.max(0, Math.min(1, fg[3]));
			return [
				fg[0] * a + bg[0] * (1 - a),
				fg[1] * a + bg[1] * (1 - a),
				fg[2] * a + bg[2] * (1 - a)
			];
		};

		const luminance = (rgb: [number, number, number]): number => {
			const lin = rgb.map((ch) => {
				const s = ch / 255;
				return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
		};

		const ratio = (a: [number, number, number], b: [number, number, number]): number => {
			const la = luminance(a);
			const lb = luminance(b);
			return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
		};

		const effectiveOpacity = (el: Element): number => {
			let acc = 1;
			let cur: Element | null = el;
			while (cur) {
				const op = Number.parseFloat(getComputedStyle(cur).opacity || '1');
				if (Number.isFinite(op)) acc *= Math.max(0, Math.min(1, op));
				cur = cur.parentElement;
			}
			return acc;
		};

		interface StackNode {
			bg: [number, number, number, number];
			opacity: number;
		}

		const buildChain = (el: Element): StackNode[] => {
			const nodes: StackNode[] = [];
			let cur: Element | null = el;
			while (cur && cur !== document.body && cur !== document.documentElement) {
				const st = getComputedStyle(cur);
				const op = Number.parseFloat(st.opacity || '1');
				nodes.unshift({
					bg: parseRgba(st.backgroundColor),
					opacity: Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 1
				});
				cur = cur.parentElement;
			}
			return nodes;
		};

		const renderStack = (
			nodes: StackNode[],
			idx: number,
			backdrop: [number, number, number],
			leafFg: [number, number, number, number] | null
		): [number, number, number] => {
			if (idx >= nodes.length) return backdrop;
			const node = nodes[idx]!;
			const innerBg = compositeOver(node.bg, backdrop);
			const inner =
				idx === nodes.length - 1
					? leafFg
						? compositeOver(leafFg, innerBg)
						: innerBg
					: renderStack(nodes, idx + 1, innerBg, leafFg);
			return compositeOver([inner[0], inner[1], inner[2], node.opacity], backdrop);
		};

		const isVisuallyHidden = (el: Element, rect: DOMRect, style: CSSStyleDeclaration): boolean => {
			if (rect.width <= 2 || rect.height <= 2) return true;
			if (style.visibility === 'hidden' || style.display === 'none') return true;
			if (style.clip === 'rect(0px, 0px, 0px, 0px)') return true;
			if (style.clipPath === 'inset(50%)' || style.clipPath.startsWith('inset(50%')) return true;
			if (el.closest('article') || el.tagName === 'CANVAS') return true;
			return false;
		};

		const darkBackdrop: [number, number, number] = [0x1c, 0x1b, 0x1a];
		const lightBackdrop: [number, number, number] = [0xe6, 0xdf, 0xd1];
		const candidates = Array.from(
			document.querySelectorAll(
				'button, label, summary, a, p, span, h2, h3, input, select, dt, dd, [role="status"], [role="alert"]'
			)
		).filter((el) => {
			if (el.classList.contains('skip-link')) return false;
			const closedDetails = el.closest('details:not([open])');
			if (closedDetails && !el.closest('summary')) return false;
			if (
				el.matches(':disabled') ||
				el.getAttribute('aria-disabled') === 'true' ||
				el.closest(':disabled, [aria-disabled="true"]') !== null
			) {
				return false;
			}
			const rect = el.getBoundingClientRect();
			const style = getComputedStyle(el);
			if (isVisuallyHidden(el, rect, style)) return false;
			if (effectiveOpacity(el) <= 0.05) return false;
			if (el instanceof HTMLInputElement) {
				if (el.type === 'range' || el.type === 'checkbox' || el.type === 'radio') {
					return false;
				}
				return el.value.trim().length > 0;
			}
			const text = (el.textContent ?? '').trim();
			const ariaLabel = (el.getAttribute('aria-label') ?? '').trim();
			if (el.tagName === 'BUTTON' || el.tagName === 'A') {
				return text.length > 0 || ariaLabel.length > 0;
			}
			if (el.tagName === 'P' || el.tagName === 'SPAN') {
				return Array.from(el.childNodes).some(
					(n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0
				);
			}
			return text.length > 0;
		});

		const results: ContrastMetric[] = [];
		for (const el of candidates) {
			const style = getComputedStyle(el);
			const fg = parseRgba(style.color);
			const chain = buildChain(el);
			const bgDark = renderStack(chain, 0, darkBackdrop, null);
			const bgLight = renderStack(chain, 0, lightBackdrop, null);
			const fgDark = renderStack(chain, 0, darkBackdrop, fg);
			const fgLight = renderStack(chain, 0, lightBackdrop, fg);

			const fontSize = Number.parseFloat(style.fontSize || '16');
			const fontWeightNum = Number.parseInt(style.fontWeight || '400', 10);
			const isBold =
				style.fontWeight === 'bold' || (Number.isFinite(fontWeightNum) && fontWeightNum >= 700);
			const isLargeText = fontSize >= 24 || (isBold && fontSize >= 18.66);
			const inputVal = el instanceof HTMLInputElement ? el.value.trim() : '';
			const hasVisibleText = (el.textContent ?? '').trim().length > 0 || inputVal.length > 0;
			const minRequiredRatio = hasVisibleText && !isLargeText ? 4.5 : 3.0;

			results.push({
				label:
					el.textContent?.trim() || inputVal || el.getAttribute('aria-label')?.trim() || el.tagName,
				contrastOverDark: ratio(fgDark, bgDark),
				contrastOverLight: ratio(fgLight, bgLight),
				minRequiredRatio
			});
		}
		return results;
	});
}

async function assertNoButtonOverlapOrClipping(page: Page): Promise<void> {
	const check = await page.evaluate(() => {
		const vpW = window.innerWidth;
		const vpH = window.innerHeight;
		const buttons = Array.from(document.querySelectorAll('button, a'))
			.filter(
				(el) =>
					!el.classList.contains('skip-link') &&
					!el.closest('article') &&
					!el.closest('details:not([open])')
			)
			.map((el) => {
				const st = getComputedStyle(el);
				const r = el.getBoundingClientRect();
				return {
					label: el.textContent?.trim() || el.getAttribute('aria-label') || el.tagName,
					visible:
						st.display !== 'none' && st.visibility !== 'hidden' && r.width > 2 && r.height > 2,
					left: r.left,
					top: r.top,
					right: r.right,
					bottom: r.bottom
				};
			})
			.filter((b) => b.visible);

		const clipped = buttons.filter(
			(b) => b.left < -1 || b.top < -1 || b.right > vpW + 1 || b.bottom > vpH + 1
		);

		const overlaps: string[] = [];
		for (let i = 0; i < buttons.length; i += 1) {
			for (let j = i + 1; j < buttons.length; j += 1) {
				const a = buttons[i]!;
				const b = buttons[j]!;
				const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
				const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
				if (xOverlap > 2 && yOverlap > 2) {
					overlaps.push(`${a.label} <-> ${b.label}`);
				}
			}
		}

		return { count: buttons.length, clipped, overlaps };
	});

	expect(check.count).toBeGreaterThan(0);
	expect(check.clipped).toEqual([]);
	expect(check.overlaps).toEqual([]);
}

test.describe('Tier 1 - Feature Coverage', () => {
	test('F1.1 — Desktop (1440x900) fullscreen canvas rendering with zero runtime errors', async ({
		browser,
		baseURL
	}) => {
		const vp = { width: 1440, height: 900 };
		await withContext(
			browser,
			{ viewport: vp, reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				const canvas = getCanvas(page);
				await expect(canvas).toBeVisible();
				await expect(page.getByRole('dialog')).toHaveCount(0);

				const box = await canvas.boundingBox();
				expect(box).not.toBeNull();
				expect(box!.width).toBeGreaterThanOrEqual(vp.width - 1);
				expect(box!.height).toBeGreaterThanOrEqual(vp.height - 1);
				expect(box!.x).toBeLessThanOrEqual(1);
				expect(box!.y).toBeLessThanOrEqual(1);
				expect(box!.x + box!.width).toBeGreaterThanOrEqual(vp.width - 1);
				expect(box!.y + box!.height).toBeGreaterThanOrEqual(vp.height - 1);
				await assertCanvasAspectUniform(page);

				await finishIfPlaying(page);
				await assertNoHorizontalOverflow(page);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F1.2 — Mobile (390x844) fullscreen canvas rendering with zero runtime errors', async ({
		browser,
		baseURL
	}) => {
		const vp = { width: 390, height: 844 };
		await withContext(
			browser,
			{ viewport: vp, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				const canvas = getCanvas(page);
				await expect(canvas).toBeVisible();
				await expect(page.getByRole('dialog')).toHaveCount(0);

				const box = await canvas.boundingBox();
				expect(box).not.toBeNull();
				expect(box!.width).toBeGreaterThanOrEqual(vp.width - 1);
				expect(box!.height).toBeGreaterThanOrEqual(vp.height - 1);
				expect(box!.x).toBeLessThanOrEqual(1);
				expect(box!.y).toBeLessThanOrEqual(1);
				expect(box!.x + box!.width).toBeGreaterThanOrEqual(vp.width - 1);
				expect(box!.y + box!.height).toBeGreaterThanOrEqual(vp.height - 1);
				await assertCanvasAspectUniform(page);

				await finishIfPlaying(page);
				await assertNoHorizontalOverflow(page);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F1.3 — Primary studio toolbar controls render on initial load', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(getCanvas(page)).toBeVisible();

				for (const name of [
					'New painting',
					'Replay',
					'Pause',
					'Finish now',
					'Controls',
					'Inspect surface',
					'Save image',
					'Fullscreen',
					'Read the essay'
				]) {
					await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
				}

				await finishIfPlaying(page);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F1.4 — Clean isolated contexts produce identical deterministic initial painting', async ({
		browser,
		baseURL
	}) => {
		const runA = await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(getCanvas(page)).toBeVisible();
				const seed = await readVisibleSeed(page);
				const hash = await sha256CanvasPixels(page);
				await assertCleanRuntime(tracker);
				return { seed, hash };
			}
		);

		const runB = await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(getCanvas(page)).toBeVisible();
				const seed = await readVisibleSeed(page);
				const hash = await sha256CanvasPixels(page);
				await assertCleanRuntime(tracker);
				return { seed, hash };
			}
		);

		expect(runA.seed).toBeTruthy();
		expect(runA.seed).toBe(runB.seed);
		expect(runA.hash).toBe(runB.hash);
	});

	test('F1.5 — New painting generates a new seed & pixels while preserving slider settings', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Color areas', 4);
				await setSliderValue(page, 'Edge softness', 72);

				const seedBefore = await readVisibleSeed(page);
				const hashBefore = await sha256CanvasPixels(page);

				await page.getByRole('button', { name: 'New painting', exact: true }).click();
				const seedAfter = await readVisibleSeed(page);
				const hashAfter = await sha256CanvasPixels(page);

				expect(seedAfter).not.toBe(seedBefore);
				expect(hashAfter).not.toBe(hashBefore);
				await expect(getKnobSlider(page, 'Color areas')).toHaveAttribute('aria-valuenow', '4');
				await expect(getKnobSlider(page, 'Edge softness')).toHaveAttribute('aria-valuenow', '72');
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F2.1 — Default Color Field render is opaque with pigment & weave variance', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(getCanvas(page)).toBeVisible();

				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				expect(stats.transparentEdgePixels).toBe(0);
				expect(stats.distinctSampleColors).toBeGreaterThan(4);
				expect(stats.lumaVariance).toBeGreaterThan(1.5);
				expect(stats.chromaticSampleRatio).toBeGreaterThan(0.05);
				expect(stats.meanLocalGradient).toBeGreaterThan(0.05);
				expect(stats.pureWhiteGlareRatio).toBeLessThan(0.01);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F2.2 — Switching studies updates palette & rendered Color Field pixels', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				const hashBefore = await sha256CanvasPixels(page);
				await selectAlternateStudy(page);
				const hashAfter = await sha256CanvasPixels(page);

				expect(hashAfter).not.toBe(hashBefore);
				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				expect(stats.distinctSampleColors).toBeGreaterThan(4);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F2.3 — Canvas texture slider in More options changes surface weave & pixels', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);

				await setSliderValue(page, 'Canvas texture', 0);
				const hash0 = await sha256CanvasPixels(page);
				const stats0 = await analyzeCanvasPixels(page);

				await setSliderValue(page, 'Canvas texture', 100);
				const hash100 = await sha256CanvasPixels(page);
				const stats100 = await analyzeCanvasPixels(page);

				expect(hash100).not.toBe(hash0);
				expect(stats100.opaqueAll).toBe(true);
				expect(stats100.lumaVariance).not.toBe(stats0.lumaVariance);
				expect(stats100.meanLocalGradient).toBeGreaterThan(stats0.meanLocalGradient);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F2.4 — Fill screen / Fit painting framing preserves uniform aspect & opaque edges', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);

				const fillBtn = page.getByRole('button', { name: 'Fill screen', exact: true });
				const fitBtn = page.getByRole('button', { name: 'Fit painting', exact: true });
				await expect(fillBtn).toBeVisible();
				await expect(fitBtn).toBeVisible();
				await assertCanvasAspectUniform(page);

				const assertFitContained = async (): Promise<void> => {
					const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
					const fitBox = await getCanvas(page).boundingBox();
					expect(fitBox).not.toBeNull();
					expect(fitBox!.x).toBeGreaterThanOrEqual(0);
					expect(fitBox!.y).toBeGreaterThanOrEqual(0);
					expect(fitBox!.x + fitBox!.width).toBeLessThanOrEqual(viewport.width + 1);
					expect(fitBox!.y + fitBox!.height).toBeLessThanOrEqual(viewport.height + 1);
				};

				const fillPressed = (await fillBtn.getAttribute('aria-pressed')) === 'true';
				const targetBtn = fillPressed ? fitBtn : fillBtn;
				const otherBtn = fillPressed ? fillBtn : fitBtn;

				await expect(otherBtn).toHaveAttribute('aria-pressed', 'true');
				await expect(targetBtn).toHaveAttribute('aria-pressed', 'false');
				if (!fillPressed) {
					await assertFitContained();
				}
				await targetBtn.click();
				await expect(targetBtn).toHaveAttribute('aria-pressed', 'true');
				await expect(otherBtn).toHaveAttribute('aria-pressed', 'false');
				if (fillPressed) {
					await expect.poll(() => new URL(page.url()).searchParams.get('vm')).toBe('fit');
					await assertCanvasAspectUniform(page);
					await assertFitContained();

					await fillBtn.click();
					await expect(fillBtn).toHaveAttribute('aria-pressed', 'true');
					await expect(fitBtn).toHaveAttribute('aria-pressed', 'false');
					await expect.poll(() => new URL(page.url()).searchParams.get('vm')).toBeNull();
				} else {
					await expect
						.poll(() => {
							const vm = new URL(page.url()).searchParams.get('vm');
							return vm === null || vm === 'fill';
						})
						.toBe(true);
				}

				await assertCanvasAspectUniform(page);
				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				expect(stats.transparentEdgePixels).toBe(0);
				expect(stats.distinctSampleColors).toBeGreaterThan(2);
				expect(stats.lumaVariance).toBeGreaterThan(0.2);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F2.5 — Undo reverts last edit to exact pixels & Reset restores defaults', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);

				const defaultHash = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Color areas', 5);
				const editedHash = await sha256CanvasPixels(page);
				expect(editedHash).not.toBe(defaultHash);

				const undoBtn = page.getByRole('button', { name: /^Undo/i }).first();
				await expect(undoBtn).toBeEnabled();
				await undoBtn.click();
				expect(await sha256CanvasPixels(page)).toBe(defaultHash);

				await setSliderValue(page, 'Edge softness', 12);
				expect(await sha256CanvasPixels(page)).not.toBe(defaultHash);

				await page
					.getByRole('button', { name: /^Reset/i })
					.first()
					.click();
				expect(await sha256CanvasPixels(page)).toBe(defaultHash);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F3.1 — Color areas primary control exposes ARIA semantics & updates canvas pixels', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				const slider = getKnobSlider(page, 'Color areas');
				await expect(slider).toHaveAttribute('aria-valuemin', '2');
				await expect(slider).toHaveAttribute('aria-valuemax', '6');
				expect(await slider.getAttribute('aria-valuenow')).toBeTruthy();
				expect((await slider.getAttribute('aria-valuetext')) ?? '').toMatch(/area/i);

				await setSliderValue(page, 'Color areas', 2);
				const hash2 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Color areas', 5);
				const hash5 = await sha256CanvasPixels(page);
				expect(hash5).not.toBe(hash2);

				await setSliderValue(page, 'Color areas', 2);
				expect(await sha256CanvasPixels(page)).toBe(hash2);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F3.2 — Area size primary control exposes ARIA semantics & updates canvas pixels', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				const slider = getKnobSlider(page, 'Area size');
				await expect(slider).toHaveAttribute('aria-valuemin', '25');
				await expect(slider).toHaveAttribute('aria-valuemax', '90');
				expect(await slider.getAttribute('aria-valuenow')).toBeTruthy();
				expect((await slider.getAttribute('aria-valuetext')) ?? '').toMatch(
					/%|compact|broad|size/i
				);

				await setSliderValue(page, 'Area size', 30);
				const hash30 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Area size', 85);
				const hash85 = await sha256CanvasPixels(page);
				expect(hash85).not.toBe(hash30);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F3.3 — Edge softness primary control exposes ARIA semantics & updates canvas pixels', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				const slider = getKnobSlider(page, 'Edge softness');
				await expect(slider).toHaveAttribute('aria-valuemin', '0');
				await expect(slider).toHaveAttribute('aria-valuemax', '100');
				expect(await slider.getAttribute('aria-valuenow')).toBeTruthy();
				expect((await slider.getAttribute('aria-valuetext')) ?? '').toMatch(
					/%|sharp|soft|feathered|edge/i
				);

				await setSliderValue(page, 'Edge softness', 5);
				const hashSharp = await sha256CanvasPixels(page);
				const statsSharp = await analyzeCanvasPixels(page);
				await setSliderValue(page, 'Edge softness', 95);
				const hashSoft = await sha256CanvasPixels(page);
				const statsSoft = await analyzeCanvasPixels(page);
				expect(hashSoft).not.toBe(hashSharp);
				expect(statsSoft.opaqueAll).toBe(true);
				expect(statsSoft.distinctSampleColors32).toBeGreaterThan(statsSharp.distinctSampleColors32);
				expect(statsSharp.meanLocalGradient).toBeGreaterThan(statsSoft.meanLocalGradient);
				expect(statsSharp.lumaVariance).toBeGreaterThan(statsSoft.lumaVariance);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F3.4 — Paint transparency primary control exposes ARIA semantics & updates canvas pixels', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				const slider = getKnobSlider(page, 'Paint transparency');
				await expect(slider).toHaveAttribute('aria-valuemin', '10');
				await expect(slider).toHaveAttribute('aria-valuemax', '95');
				expect(await slider.getAttribute('aria-valuenow')).toBeTruthy();
				expect((await slider.getAttribute('aria-valuetext')) ?? '').toMatch(
					/%|opaque|translucent|glaze|sheer/i
				);

				await setSliderValue(page, 'Paint transparency', 15);
				const hashOpaque = await sha256CanvasPixels(page);
				const statsOpaque = await analyzeCanvasPixels(page);
				await setSliderValue(page, 'Paint transparency', 90);
				const hashTranslucent = await sha256CanvasPixels(page);
				const statsTranslucent = await analyzeCanvasPixels(page);
				expect(hashTranslucent).not.toBe(hashOpaque);
				expect(statsTranslucent.opaqueAll).toBe(true);
				expect(statsTranslucent.meanLuma).toBeGreaterThan(statsOpaque.meanLuma);
				expect(Math.abs(statsTranslucent.meanLuma - statsOpaque.meanLuma)).toBeGreaterThan(2);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F3.5 — Keyboard slider navigation, URL query sync & custom Seed Apply', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				const areaSlider = getKnobSlider(page, 'Color areas');
				await areaSlider.focus();
				await areaSlider.press('Home');
				await expect(areaSlider).toHaveAttribute('aria-valuenow', '2');
				await areaSlider.press('ArrowRight');
				await expect(areaSlider).toHaveAttribute('aria-valuenow', '3');
				await areaSlider.press('End');
				await expect(areaSlider).toHaveAttribute('aria-valuenow', '6');
				await areaSlider.press('ArrowLeft');
				await expect(areaSlider).toHaveAttribute('aria-valuenow', '5');

				await setSliderValue(page, 'Area size', 48);
				await setSliderValue(page, 'Edge softness', 33);
				await setSliderValue(page, 'Paint transparency', 64);

				await expect.poll(() => readStudioQueryParams(page).areas).toBe('5');
				await expect.poll(() => readStudioQueryParams(page).size).toBe('48');
				await expect.poll(() => readStudioQueryParams(page).edge).toBe('33');
				await expect.poll(() => readStudioQueryParams(page).trans).toBe('64');

				const beforeSeedHash = await sha256CanvasPixels(page);
				await applyCustomSeed(page, '718293');
				await expect.poll(() => readVisibleSeed(page)).toBe('718293');
				expect(await sha256CanvasPixels(page)).not.toBe(beforeSeedHash);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F4.1 — Progressive layered animation evolves canvas pixels across frames', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(getCanvas(page)).toBeVisible();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

				const frameA = await sha256CanvasPixels(page);
				await expect
					.poll(async () => await sha256CanvasPixels(page), { timeout: 6_000 })
					.not.toBe(frameA);
				const frameB = await sha256CanvasPixels(page);
				expect(frameB).not.toBe(frameA);

				await finishIfPlaying(page);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F4.2 — Pause freezes rendered pixels and Resume continues layered playback', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				const pauseBtn = page.getByRole('button', { name: 'Pause', exact: true });
				await expect(pauseBtn).toBeVisible();
				await pauseBtn.click();

				const resumeBtn = page.getByRole('button', { name: 'Resume', exact: true });
				await expect(resumeBtn).toBeVisible();

				const pausedA = await sha256CanvasPixels(page);
				await page.waitForTimeout(260);
				const pausedB = await sha256CanvasPixels(page);
				expect(pausedB).toBe(pausedA);

				await resumeBtn.click();
				await expect(pauseBtn).toBeVisible();
				await expect
					.poll(async () => await sha256CanvasPixels(page), { timeout: 6_000 })
					.not.toBe(pausedA);

				await finishIfPlaying(page);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F4.3 — Finish now completes layered rendering immediately and holds pixels steady', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await page.getByRole('button', { name: 'Finish now', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
				await expect(page.getByRole('button', { name: 'Finish now', exact: true })).toHaveCount(0);

				const settledA = await sha256CanvasPixels(page);
				await page.waitForTimeout(280);
				const settledB = await sha256CanvasPixels(page);
				expect(settledB).toBe(settledA);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F4.4 — Replay restarts layered pass progression from a settled painting', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await finishIfPlaying(page);
				const finalHash = await sha256CanvasPixels(page);

				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				const earlyHash = await sha256CanvasPixels(page);
				expect(earlyHash).not.toBe(finalHash);

				await finishIfPlaying(page);
				expect(await sha256CanvasPixels(page)).toBe(finalHash);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F4.5 — Inspect surface reveals close-up texture, pans cleanly & Whole painting restores pixels', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				const wholeHash = await sha256CanvasPixels(page);

				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				const wholeBtn = page.getByRole('button', { name: 'Whole painting', exact: true });
				await expect(wholeBtn).toBeVisible();

				const inspectHashA = await sha256CanvasPixels(page);
				expect(inspectHashA).not.toBe(wholeHash);
				const inspectStats = await analyzeCanvasPixels(page);
				expect(inspectStats.opaqueAll).toBe(true);
				expect(inspectStats.transparentEdgePixels).toBe(0);
				expect(inspectStats.distinctSampleColors).toBeGreaterThan(2);
				expect(inspectStats.lumaVariance).toBeGreaterThan(0.2);

				await panInspect(page, 'right');
				const inspectHashB = await sha256CanvasPixels(page);
				expect(inspectHashB).not.toBe(inspectHashA);

				await wholeBtn.click();
				await expect(
					page.getByRole('button', { name: 'Inspect surface', exact: true })
				).toBeVisible();
				expect(await sha256CanvasPixels(page)).toBe(wholeHash);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F5.1 — Controls toggle updates aria-expanded & keeps meaningful desktop canvas visible', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				const controlsBtn = page.getByRole('button', { name: 'Controls', exact: true });
				await expect(controlsBtn).toBeVisible();

				await ensureControlsExpanded(page);
				await expect(controlsBtn).toHaveAttribute('aria-expanded', 'true');
				for (const label of ['Color areas', 'Area size', 'Edge softness', 'Paint transparency']) {
					await expect(getKnobSlider(page, label)).toBeVisible();
				}

				const canvasBox = await getCanvas(page).boundingBox();
				expect(canvasBox).not.toBeNull();
				expect(canvasBox!.height).toBeGreaterThanOrEqual(450);

				await ensureControlsCollapsed(page);
				await expect(controlsBtn).toHaveAttribute('aria-expanded', 'false');
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F5.2 — Desktop & mobile HUD controls render without overlap or viewport clipping', async ({
		browser,
		baseURL
	}) => {
		for (const vp of [
			{ width: 1440, height: 900, mobile: false },
			{ width: 390, height: 844, mobile: true }
		]) {
			await withContext(
				browser,
				{
					viewport: { width: vp.width, height: vp.height },
					hasTouch: vp.mobile,
					isMobile: vp.mobile,
					reducedMotion: 'reduce'
				},
				baseURL,
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await assertNoButtonOverlapOrClipping(page);
					await ensureControlsExpanded(page);
					await assertNoButtonOverlapOrClipping(page);
					await assertCleanRuntime(tracker);
				}
			);
		}
	});

	test('F5.3 — More options reveals All visualizations link & Privacy & cookies trigger', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);

				const allVizLink = page.getByRole('link', { name: /All visualizations/i });
				await expect(allVizLink).toBeVisible();
				await expect(allVizLink).toHaveAttribute('href', /\/blog\/visualizations/);
				await expect(page.getByRole('button', { name: /Privacy & cookies/i })).toBeVisible();
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F5.4 — Privacy & cookies opens accessible dialog & closes via Escape', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);

				await page.getByRole('button', { name: /Privacy & cookies/i }).click();
				const dialog = page.getByRole('dialog');
				await expect(dialog).toBeVisible();

				await page.keyboard.press('Escape');
				await expect(dialog).toBeHidden();
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F5.5 — Canvas exposes non-empty accessible description summarizing the Color Field work', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				const summary = await readAccessibleSummary(page);
				expect(summary.length).toBeGreaterThan(20);
				expect(summary).toMatch(/color|area|field|edge/i);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F6.1 — Embedded ?view=article overlay shows essay title, scrolls & hides launch card', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();

				await assertEmbeddedEssayLoaded(page);
				expect(page.url()).toContain('view=article');
				await expect(page.getByRole('button', { name: 'Read the essay', exact: true })).toHaveCount(
					0
				);

				const scrollInfo = await page.evaluate(() => ({
					scrollHeight: document.documentElement.scrollHeight,
					clientHeight: document.documentElement.clientHeight
				}));
				expect(scrollInfo.scrollHeight).toBeGreaterThan(scrollInfo.clientHeight);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F6.2 — Essay covers Rothko & Frankenthaler, regions/edge masks/layers & non-prescriptive color', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(`${ROUTE_PATH}?view=article`);
				await assertEmbeddedEssayLoaded(page);

				const articleText = await page.locator('article').first().innerText();
				expect(articleText).toMatch(/Color Field/i);
				expect(articleText).toMatch(/Mark Rothko|Rothko/i);
				expect(articleText).toMatch(/Helen Frankenthaler|Frankenthaler/i);
				expect(articleText).toMatch(/edge/i);
				expect(articleText).toMatch(/transparen|translucen|glaze|layer/i);
				expect(articleText).toMatch(/scale/i);
				expect(articleText).toMatch(/adjacen/i);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F6.3 — Embedded essay opening two-area plates & all article images render cleanly without overflow', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(`${ROUTE_PATH}?view=article`);
				await assertEmbeddedEssayLoaded(page);

				const sharpImg = page.locator(`article img[src*="${OPENING_SHARP_PLATE}"]`).first();
				const softImg = page.locator(`article img[src*="${OPENING_SOFT_PLATE}"]`).first();
				await expect(sharpImg).toBeVisible();
				await expect(softImg).toBeVisible();

				const imgs = page.locator('article img');
				const count = await imgs.count();
				expect(count).toBeGreaterThanOrEqual(5);
				for (let i = 0; i < count; i += 1) {
					const img = imgs.nth(i);
					await img.scrollIntoViewIfNeeded();
					const alt = (await img.getAttribute('alt')) ?? '';
					expect(alt.trim().length).toBeGreaterThan(0);
					await expect
						.poll(() =>
							img.evaluate(
								(el) =>
									el instanceof HTMLImageElement &&
									el.complete &&
									el.naturalWidth > 0 &&
									el.naturalHeight > 0
							)
						)
						.toBe(true);
				}

				const openingCheck = await page.evaluate(
					({ sharpSrc, softSrc }) => {
						const article = document.querySelector('article');
						if (!article) return null;
						const sharp = article.querySelector(`img[src*="${sharpSrc}"]`);
						const soft = article.querySelector(`img[src*="${softSrc}"]`);
						const firstH2 = article.querySelector('h2');
						if (!(sharp instanceof HTMLImageElement) || !(soft instanceof HTMLImageElement)) {
							return null;
						}
						const sharpBeforeSoft = Boolean(
							sharp.compareDocumentPosition(soft) & Node.DOCUMENT_POSITION_FOLLOWING
						);
						const sharpBeforeFirstH2 =
							!firstH2 ||
							Boolean(sharp.compareDocumentPosition(firstH2) & Node.DOCUMENT_POSITION_FOLLOWING);
						const softBeforeFirstH2 =
							!firstH2 ||
							Boolean(soft.compareDocumentPosition(firstH2) & Node.DOCUMENT_POSITION_FOLLOWING);
						const sampleSignature = (img: HTMLImageElement): string => {
							const c = document.createElement('canvas');
							c.width = 64;
							c.height = 48;
							const ctx = c.getContext('2d');
							if (!ctx) return '';
							ctx.drawImage(img, 0, 0, c.width, c.height);
							const data = ctx.getImageData(0, 0, c.width, c.height).data;
							const parts: number[] = [];
							for (let i = 0; i < data.length; i += 48) {
								parts.push(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
							}
							return parts.join(',');
						};
						return {
							sharpBeforeSoft,
							sharpBeforeFirstH2,
							softBeforeFirstH2,
							sharpDims: { w: sharp.naturalWidth, h: sharp.naturalHeight },
							softDims: { w: soft.naturalWidth, h: soft.naturalHeight },
							sharpSig: sampleSignature(sharp),
							softSig: sampleSignature(soft)
						};
					},
					{ sharpSrc: OPENING_SHARP_PLATE, softSrc: OPENING_SOFT_PLATE }
				);
				expect(openingCheck).not.toBeNull();
				expect(openingCheck!.sharpBeforeSoft).toBe(true);
				expect(openingCheck!.sharpBeforeFirstH2).toBe(true);
				expect(openingCheck!.softBeforeFirstH2).toBe(true);
				expect(openingCheck!.sharpDims.w).toBeGreaterThan(0);
				expect(openingCheck!.sharpDims.h).toBeGreaterThan(0);
				expect(Math.abs(openingCheck!.sharpDims.w / openingCheck!.sharpDims.h - 1.5)).toBeLessThan(
					0.05
				);
				expect(openingCheck!.softDims.w).toBeGreaterThan(0);
				expect(openingCheck!.softDims.h).toBeGreaterThan(0);
				expect(Math.abs(openingCheck!.softDims.w / openingCheck!.softDims.h - 1.5)).toBeLessThan(
					0.05
				);
				expect(openingCheck!.sharpSig.length).toBeGreaterThan(0);
				expect(openingCheck!.sharpSig).not.toBe(openingCheck!.softSig);

				for (const platePath of [OPENING_SHARP_PLATE, OPENING_SOFT_PLATE]) {
					const res = await page.request.get(platePath);
					expect(res.ok()).toBe(true);
					expect(res.headers()['content-type']).toContain('image/png');
					const body = await res.body();
					const ihdr = readPngIhdrDimensions(body);
					expect(ihdr.width).toBeGreaterThanOrEqual(960);
					expect(ihdr.height).toBeGreaterThanOrEqual(640);
				}

				await assertNoHorizontalOverflow(page);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F6.4 — Full-site companion blog post SSR HTTP 200, single H1, canonical & launch link', async ({
		browser,
		baseURL
	}) => {
		test.skip(
			!process.env.COLOR_FIELD_BASE_URL,
			'Full-site blog route requires COLOR_FIELD_BASE_URL pointing to built SvelteKit preview.'
		);
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (context, page, tracker) => {
				const ssr = await context.request.get(ARTICLE_PATH);
				expect(ssr.ok()).toBe(true);
				const html = await ssr.text();
				expect((html.match(/<h1\b/gu) ?? []).length).toBe(1);
				expect(html).toContain('<link rel="canonical"');

				await page.goto(ARTICLE_PATH, { waitUntil: 'domcontentloaded' });
				await expect(getEssayHeading(page)).toHaveCount(1);

				const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute('href');
				expect(canonicalHref).toBeTruthy();
				expect(canonicalHref).toContain(ARTICLE_PATH);
				expect(canonicalHref).not.toContain('?');

				const launchLink = page.locator(`article a[href="${ROUTE_PATH}"]`).first();
				await expect(launchLink).toBeVisible();
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F6.5 — Full-site blog post opening plates (<= 750 KiB) & desktop/mobile zero horizontal overflow', async ({
		browser,
		baseURL
	}) => {
		test.skip(
			!process.env.COLOR_FIELD_BASE_URL,
			'Full-site blog route requires COLOR_FIELD_BASE_URL pointing to built SvelteKit preview.'
		);
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				for (const vp of [
					{ width: 1440, height: 900 },
					{ width: 390, height: 844 },
					{ width: 320, height: 568 }
				]) {
					await page.setViewportSize(vp);
					await page.goto(ARTICLE_PATH, { waitUntil: 'domcontentloaded' });
					await expect(getEssayHeading(page)).toBeVisible();
					await assertNoHorizontalOverflow(page);
				}

				await page.setViewportSize({ width: 1440, height: 900 });
				const allArticleImgs = page.locator('article img');
				const imgCount = await allArticleImgs.count();
				expect(imgCount).toBeGreaterThanOrEqual(5);
				for (let i = 0; i < imgCount; i += 1) {
					const img = allArticleImgs.nth(i);
					await img.scrollIntoViewIfNeeded();
					await expect(img).toBeVisible();
					const alt = (await img.getAttribute('alt')) ?? '';
					expect(alt.trim().length).toBeGreaterThan(0);
					await expect
						.poll(() =>
							img.evaluate(
								(el) =>
									el instanceof HTMLImageElement &&
									el.complete &&
									el.naturalWidth > 0 &&
									el.naturalHeight > 0
							)
						)
						.toBe(true);
				}

				const plateHashes: string[] = [];
				for (const platePath of [OPENING_SHARP_PLATE, OPENING_SOFT_PLATE]) {
					const img = page.locator(`article img[src*="${platePath}"]`).first();
					await img.scrollIntoViewIfNeeded();
					await expect(img).toBeVisible();
					const alt = (await img.getAttribute('alt')) ?? '';
					expect(alt.trim().length).toBeGreaterThan(0);
					await expect
						.poll(() =>
							img.evaluate(
								(el) =>
									el instanceof HTMLImageElement &&
									el.complete &&
									el.naturalWidth > 0 &&
									el.naturalHeight > 0
							)
						)
						.toBe(true);

					const res = await page.request.get(platePath);
					expect(res.ok()).toBe(true);
					expect(res.headers()['content-type']).toContain('image/png');
					const body = await res.body();
					const ihdr = readPngIhdrDimensions(body);
					expect(ihdr.width).toBeGreaterThanOrEqual(960);
					expect(ihdr.height).toBeGreaterThanOrEqual(640);
					expect(body.byteLength).toBeLessThanOrEqual(750 * 1024);
					plateHashes.push(createHash('sha256').update(body).digest('hex'));
				}
				expect(plateHashes[0]).not.toBe(plateHashes[1]);

				const orderCheck = await page.evaluate(
					({ sharpSrc, softSrc }) => {
						const article = document.querySelector('article');
						if (!article) return null;
						const sharp = article.querySelector(`img[src*="${sharpSrc}"]`);
						const soft = article.querySelector(`img[src*="${softSrc}"]`);
						const firstH2 = article.querySelector('h2');
						if (!sharp || !soft) return null;
						return {
							sharpBeforeSoft: Boolean(
								sharp.compareDocumentPosition(soft) & Node.DOCUMENT_POSITION_FOLLOWING
							),
							sharpBeforeFirstH2:
								!firstH2 ||
								Boolean(sharp.compareDocumentPosition(firstH2) & Node.DOCUMENT_POSITION_FOLLOWING),
							softBeforeFirstH2:
								!firstH2 ||
								Boolean(soft.compareDocumentPosition(firstH2) & Node.DOCUMENT_POSITION_FOLLOWING)
						};
					},
					{ sharpSrc: OPENING_SHARP_PLATE, softSrc: OPENING_SOFT_PLATE }
				);
				expect(orderCheck).not.toBeNull();
				expect(orderCheck!.sharpBeforeSoft).toBe(true);
				expect(orderCheck!.sharpBeforeFirstH2).toBe(true);
				expect(orderCheck!.softBeforeFirstH2).toBe(true);

				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F6.6 — Full-site gallery integration & studio shell omits site Header/Footer', async ({
		browser,
		baseURL
	}) => {
		test.skip(
			!process.env.COLOR_FIELD_BASE_URL,
			'Full-site gallery & layout checks require COLOR_FIELD_BASE_URL pointing to built SvelteKit preview.'
		);
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(LISTING_PATH, { waitUntil: 'domcontentloaded' });
				const card = page.locator(`a[href="${ARTICLE_PATH}"]`).first();
				await expect(card).toBeVisible();

				await page.goto(ROUTE_PATH, { waitUntil: 'domcontentloaded' });
				await expect(getCanvas(page)).toBeVisible();
				await expect(page.locator('header nav, footer')).toHaveCount(0);
				await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
				await assertCleanRuntime(tracker);
			}
		);
	});
});

test.describe('Tier 2 - Boundary & Corner Cases', () => {
	test('F1.B1 — Extreme narrow mobile (320x568) renders visible canvas with zero overflow', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{
				viewport: { width: 320, height: 568 },
				hasTouch: true,
				isMobile: true,
				reducedMotion: 'reduce'
			},
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(getCanvas(page)).toBeVisible();
				await assertNoHorizontalOverflow(page);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F1.B2 — Short landscape viewports (740x380 & 844x390) render visible canvas without overflow', async ({
		browser,
		baseURL
	}) => {
		for (const vp of [
			{ width: 740, height: 380 },
			{ width: 844, height: 390 }
		]) {
			await withContext(
				browser,
				{
					viewport: vp,
					hasTouch: true,
					isMobile: true,
					reducedMotion: 'reduce'
				},
				baseURL,
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await expect(getCanvas(page)).toBeVisible();
					await assertNoHorizontalOverflow(page);
					await assertCleanRuntime(tracker);
				}
			);
		}
	});

	test('F1.B3 — Tablet portrait (820x1180) renders fullscreen canvas without overflow', async ({
		browser,
		baseURL
	}) => {
		const vp = { width: 820, height: 1180 };
		await withContext(
			browser,
			{ viewport: vp, reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				const canvas = getCanvas(page);
				await expect(canvas).toBeVisible();
				const box = await canvas.boundingBox();
				expect(box).not.toBeNull();
				expect(box!.width).toBeGreaterThanOrEqual(vp.width - 1);
				expect(box!.height).toBeGreaterThanOrEqual(vp.height - 1);
				expect(box!.x).toBeLessThanOrEqual(1);
				expect(box!.y).toBeLessThanOrEqual(1);
				expect(box!.x + box!.width).toBeGreaterThanOrEqual(vp.width - 1);
				expect(box!.y + box!.height).toBeGreaterThanOrEqual(vp.height - 1);
				await assertCanvasAspectUniform(page);
				await assertNoHorizontalOverflow(page);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F1.B4 — Out-of-range numeric URL query params clamp cleanly within valid slider bounds', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(
					`${ROUTE_PATH}?areas=99&size=-5&edge=500&trans=1&texture=999&time=0&seed=bad`
				);
				await expect(getCanvas(page)).toBeVisible();
				await openMoreOptions(page);

				await expect(getKnobSlider(page, 'Color areas')).toHaveAttribute('aria-valuenow', '6');
				await expect(getKnobSlider(page, 'Area size')).toHaveAttribute('aria-valuenow', '25');
				await expect(getKnobSlider(page, 'Edge softness')).toHaveAttribute('aria-valuenow', '100');
				await expect(getKnobSlider(page, 'Paint transparency')).toHaveAttribute(
					'aria-valuenow',
					'10'
				);
				await expect(getKnobSlider(page, 'Canvas texture')).toHaveAttribute('aria-valuenow', '100');
				await expect(getKnobSlider(page, 'Painting time')).toHaveAttribute('aria-valuenow', '4');

				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F1.B5 — Invalid study & artboard query values fall back gracefully without crash', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(`${ROUTE_PATH}?study=nonexistent-study&artboard=diagonal&view=unknown`);
				await expect(getCanvas(page)).toBeVisible();
				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				expect(stats.distinctSampleColors).toBeGreaterThan(4);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F2.B1 — Color areas extremes (2 vs 6) yield distinct valid opaque renders', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				await setSliderValue(page, 'Color areas', 2);
				const hashMin = await sha256CanvasPixels(page);
				const statsMin = await analyzeCanvasPixels(page);

				await setSliderValue(page, 'Color areas', 6);
				const hashMax = await sha256CanvasPixels(page);
				const statsMax = await analyzeCanvasPixels(page);

				expect(hashMax).not.toBe(hashMin);
				expect(statsMin.opaqueAll).toBe(true);
				expect(statsMax.opaqueAll).toBe(true);
				expect(statsMax.distinctSampleColors).toBeGreaterThan(4);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F2.B2 — Area size extremes (25 vs 90) yield distinct valid opaque renders', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				await setSliderValue(page, 'Area size', 25);
				const hashMin = await sha256CanvasPixels(page);
				const statsMin = await analyzeCanvasPixels(page);

				await setSliderValue(page, 'Area size', 90);
				const hashMax = await sha256CanvasPixels(page);
				const statsMax = await analyzeCanvasPixels(page);

				expect(hashMax).not.toBe(hashMin);
				expect(statsMin.opaqueAll).toBe(true);
				expect(statsMax.opaqueAll).toBe(true);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F2.B3 — Edge softness extremes (0 sharp vs 100 soft) produce distinct edge renders', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				await setSliderValue(page, 'Edge softness', 0);
				const hashSharp = await sha256CanvasPixels(page);
				const statsSharp = await analyzeCanvasPixels(page);

				await setSliderValue(page, 'Edge softness', 100);
				const hashSoft = await sha256CanvasPixels(page);
				const statsSoft = await analyzeCanvasPixels(page);

				expect(hashSoft).not.toBe(hashSharp);
				expect(statsSharp.opaqueAll).toBe(true);
				expect(statsSoft.opaqueAll).toBe(true);
				expect(statsSoft.distinctSampleColors32).toBeGreaterThan(statsSharp.distinctSampleColors32);
				expect(statsSharp.meanLocalGradient).toBeGreaterThan(statsSoft.meanLocalGradient);
				expect(statsSharp.lumaVariance).toBeGreaterThan(statsSoft.lumaVariance);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F2.B4 — Paint transparency extremes (10 opaque vs 95 sheer) alter glaze depth & pixels', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				await setSliderValue(page, 'Paint transparency', 10);
				const hashLow = await sha256CanvasPixels(page);
				const statsLow = await analyzeCanvasPixels(page);

				await setSliderValue(page, 'Paint transparency', 95);
				const hashHigh = await sha256CanvasPixels(page);
				const statsHigh = await analyzeCanvasPixels(page);

				expect(hashHigh).not.toBe(hashLow);
				expect(statsLow.opaqueAll).toBe(true);
				expect(statsHigh.opaqueAll).toBe(true);
				expect(statsHigh.meanLuma).toBeGreaterThan(statsLow.meanLuma);
				expect(Math.abs(statsHigh.meanLuma - statsLow.meanLuma)).toBeGreaterThan(2);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F2.B5 — Canvas texture bounds (0 & 100) & uint32 boundary seeds (0, 4294967295) stay valid', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);

				await setSliderValue(page, 'Canvas texture', 0);
				await applyCustomSeed(page, '0');
				const statsZero = await analyzeCanvasPixels(page);
				expect(statsZero.opaqueAll).toBe(true);
				expect(statsZero.distinctSampleColors).toBeGreaterThan(3);

				await setSliderValue(page, 'Canvas texture', 100);
				await applyCustomSeed(page, '4294967295');
				const statsMax = await analyzeCanvasPixels(page);
				expect(statsMax.opaqueAll).toBe(true);
				expect(statsMax.distinctSampleColors).toBeGreaterThan(3);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F3.B1 — Out-of-bounds input clamping on all 4 primary sliders preserves valid state', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				const specs = [
					{ label: 'Color areas', low: -10, min: 2, high: 99, max: 6 },
					{ label: 'Area size', low: 0, min: 25, high: 200, max: 90 },
					{ label: 'Edge softness', low: -50, min: 0, high: 250, max: 100 },
					{ label: 'Paint transparency', low: -5, min: 10, high: 150, max: 95 }
				] as const;

				for (const spec of specs) {
					const slider = getKnobSlider(page, spec.label);
					const tag = await slider.evaluate((el) => el.tagName.toUpperCase());

					if (tag === 'INPUT') {
						await slider.evaluate((el, val) => {
							if (!(el instanceof HTMLInputElement)) return;
							const setter = Object.getOwnPropertyDescriptor(
								HTMLInputElement.prototype,
								'value'
							)?.set;
							setter?.call(el, String(val));
							el.dispatchEvent(new Event('input', { bubbles: true }));
							el.dispatchEvent(new Event('change', { bubbles: true }));
						}, spec.low);
						await expect(slider).toHaveAttribute('aria-valuenow', String(spec.min));

						await slider.evaluate((el, val) => {
							if (!(el instanceof HTMLInputElement)) return;
							const setter = Object.getOwnPropertyDescriptor(
								HTMLInputElement.prototype,
								'value'
							)?.set;
							setter?.call(el, String(val));
							el.dispatchEvent(new Event('input', { bubbles: true }));
							el.dispatchEvent(new Event('change', { bubbles: true }));
						}, spec.high);
						await expect(slider).toHaveAttribute('aria-valuenow', String(spec.max));
					} else {
						await slider.focus();
						await slider.press('Home');
						await slider.press('ArrowLeft');
						await expect(slider).toHaveAttribute('aria-valuenow', String(spec.min));

						await slider.press('End');
						await slider.press('ArrowRight');
						await expect(slider).toHaveAttribute('aria-valuenow', String(spec.max));
					}
				}

				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F3.B2 — Rotary dial pointercancel aborts drag without mutating committed value or canvas', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				const slider = getKnobSlider(page, 'Edge softness');
				const initialValue = await slider.getAttribute('aria-valuenow');
				const initialHash = await sha256CanvasPixels(page);
				const box = await getVisibleDragTargetBox(slider, 'Edge softness');
				const cx = box.x + box.width / 2;
				const cy = box.y + box.height / 2;

				await page.evaluate(
					({ x, y }) => {
						const hit = document.elementFromPoint(x, y);
						const target = hit?.closest('[title*="drag" i]') ?? hit;
						if (!target) {
							throw new Error('Missing rotary dial drag target at center coordinates');
						}
						target.dispatchEvent(
							new PointerEvent('pointerdown', {
								bubbles: true,
								cancelable: true,
								pointerId: 77,
								pointerType: 'mouse',
								button: 0,
								clientX: x,
								clientY: y
							})
						);
						target.dispatchEvent(
							new PointerEvent('pointermove', {
								bubbles: true,
								cancelable: true,
								pointerId: 77,
								pointerType: 'mouse',
								clientX: x + 48,
								clientY: y - 32
							})
						);
					},
					{ x: cx, y: cy }
				);

				await expect(slider).not.toHaveAttribute('aria-valuenow', initialValue!);

				await page.evaluate(
					({ x, y }) => {
						const hit = document.elementFromPoint(x, y);
						const target = hit?.closest('[title*="drag" i]') ?? hit;
						if (!target) {
							throw new Error('Missing rotary dial drag target during pointercancel');
						}
						target.dispatchEvent(
							new PointerEvent('pointercancel', {
								bubbles: true,
								cancelable: true,
								pointerId: 77,
								pointerType: 'mouse',
								clientX: x + 48,
								clientY: y - 32
							})
						);
					},
					{ x: cx, y: cy }
				);

				await expect(slider).toHaveAttribute('aria-valuenow', initialValue!);
				expect(await sha256CanvasPixels(page)).toBe(initialHash);

				await page.evaluate(
					({ x, y }) => {
						const hit = document.elementFromPoint(x, y);
						const target = hit?.closest('[title*="drag" i]') ?? hit;
						if (!target) {
							throw new Error('Missing rotary dial drag target for commit check');
						}
						target.dispatchEvent(
							new PointerEvent('pointerdown', {
								bubbles: true,
								cancelable: true,
								pointerId: 78,
								pointerType: 'mouse',
								button: 0,
								clientX: x,
								clientY: y
							})
						);
						target.dispatchEvent(
							new PointerEvent('pointermove', {
								bubbles: true,
								cancelable: true,
								pointerId: 78,
								pointerType: 'mouse',
								clientX: x + 48,
								clientY: y - 32
							})
						);
						target.dispatchEvent(
							new PointerEvent('pointerup', {
								bubbles: true,
								cancelable: true,
								pointerId: 78,
								pointerType: 'mouse',
								button: 0,
								clientX: x + 48,
								clientY: y - 32
							})
						);
					},
					{ x: cx, y: cy }
				);

				await expect(slider).not.toHaveAttribute('aria-valuenow', initialValue!);
				expect(await sha256CanvasPixels(page)).not.toBe(initialHash);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F3.B3 — Painting time bounds (4s min & 20s max) update ARIA & complete cleanly', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);

				const timeSlider = getKnobSlider(page, 'Painting time');
				await expect(timeSlider).toHaveAttribute('aria-valuemin', '4');
				await expect(timeSlider).toHaveAttribute('aria-valuemax', '20');

				await setSliderValue(page, 'Painting time', 4);
				await expect.poll(() => readStudioQueryParams(page).time).toBe('4');

				await setSliderValue(page, 'Painting time', 20);
				await expect.poll(() => readStudioQueryParams(page).time).toBe('20');
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F3.B4 — Copy link shares URL reflecting active studio state', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.addInitScript(() => {
					Object.defineProperty(navigator, 'clipboard', {
						configurable: true,
						value: {
							writeText: async (text: string) => {
								Reflect.set(window, '__copiedColorFieldLink', text);
							}
						}
					});
				});
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);
				await setSliderValue(page, 'Color areas', 4);
				await setSliderValue(page, 'Edge softness', 20);

				await page.getByRole('button', { name: /Copy link/i }).click();
				const copied = await page.evaluate(
					() => (Reflect.get(window, '__copiedColorFieldLink') as string | undefined) ?? ''
				);
				expect(copied).toContain(ROUTE_PATH);
				expect(copied).toContain('areas=4');
				expect(copied).toContain('edge=20');
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F3.B5 — Rapid sequential primary slider adjustments settle cleanly without errors', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				await setSliderValue(page, 'Color areas', 2);
				await setSliderValue(page, 'Color areas', 6);
				await setSliderValue(page, 'Area size', 40);
				await setSliderValue(page, 'Edge softness', 10);
				await setSliderValue(page, 'Edge softness', 90);
				await setSliderValue(page, 'Paint transparency', 25);
				await setSliderValue(page, 'Paint transparency', 85);

				await expect(getKnobSlider(page, 'Color areas')).toHaveAttribute('aria-valuenow', '6');
				await expect(getKnobSlider(page, 'Area size')).toHaveAttribute('aria-valuenow', '40');
				await expect(getKnobSlider(page, 'Edge softness')).toHaveAttribute('aria-valuenow', '90');
				await expect(getKnobSlider(page, 'Paint transparency')).toHaveAttribute(
					'aria-valuenow',
					'85'
				);

				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F4.B1 — prefers-reduced-motion: reduce loads & edits immediately settled', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(getCanvas(page)).toBeVisible();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
				await expect(page.getByRole('button', { name: 'Finish now', exact: true })).toHaveCount(0);

				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Edge softness', 80);
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);

				await page.getByRole('button', { name: 'New painting', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F4.B2 — prefers-reduced-motion: reduce allows explicit Replay animation & Finish now', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);

				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await page.getByRole('button', { name: 'Finish now', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F4.B3 — Natural 4s playback completion matches reduced-motion final still SHA-256', async ({
		browser,
		baseURL
	}) => {
		const playbackResult = await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await finishIfPlaying(page);
				await openMoreOptions(page);
				await setSliderValue(page, 'Painting time', 4);
				await ensureControlsCollapsed(page);

				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0, {
					timeout: 15_000
				});

				const result = { url: page.url(), hash: await sha256CanvasPixels(page) };
				await assertCleanRuntime(tracker);
				return result;
			}
		);

		const stillHash = await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(playbackResult.url);
				await expect(getCanvas(page)).toBeVisible();
				const hash = await sha256CanvasPixels(page);
				await assertCleanRuntime(tracker);
				return hash;
			}
		);

		expect(playbackResult.hash).toBe(stillHash);
	});

	test('F4.B4 — Inspect surface boundary panning clamps within painting with zero transparent edges', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await expect(
					page.getByRole('button', { name: 'Whole painting', exact: true })
				).toBeVisible();

				for (let i = 0; i < 10; i += 1) {
					await panInspect(page, 'left');
					await panInspect(page, 'up');
				}
				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				expect(stats.transparentEdgePixels).toBe(0);
				expect(stats.distinctSampleColors).toBeGreaterThan(2);
				expect(stats.lumaVariance).toBeGreaterThan(0.2);

				await page.getByRole('button', { name: 'Whole painting', exact: true }).click();
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F4.B5 — Save image Escape cancels cleanly & 4096 px allocation failure falls back gracefully', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				let downloadCount = 0;
				page.on('download', () => {
					downloadCount += 1;
				});
				await page.goto(ROUTE_PATH);
				await page.getByRole('button', { name: 'Save image', exact: true }).click();
				await expect(page.getByRole('button', { name: /2048\s*px/i })).toBeVisible();
				await page.keyboard.press('Escape');
				await expect(page.getByRole('button', { name: /2048\s*px/i })).toHaveCount(0);
				expect(downloadCount).toBe(0);
				await assertCleanRuntime(tracker);
			}
		);

		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.addInitScript(() => {
					const isLargeCanvas = (target: { width?: number; height?: number }): boolean =>
						(target.width ?? 0) >= 4000 || (target.height ?? 0) >= 4000;

					const origHtmlGetContext = HTMLCanvasElement.prototype.getContext;
					HTMLCanvasElement.prototype.getContext = function (
						this: HTMLCanvasElement,
						...args: unknown[]
					) {
						if (isLargeCanvas(this)) return null;
						return Reflect.apply(origHtmlGetContext, this, args);
					} as typeof HTMLCanvasElement.prototype.getContext;

					const origHtmlToBlob = HTMLCanvasElement.prototype.toBlob;
					HTMLCanvasElement.prototype.toBlob = function (
						this: HTMLCanvasElement,
						callback: BlobCallback,
						...rest: unknown[]
					) {
						if (isLargeCanvas(this)) {
							callback(null);
							return;
						}
						return Reflect.apply(origHtmlToBlob, this, [callback, ...rest]);
					};

					if (typeof OffscreenCanvas !== 'undefined') {
						const origOffscreenGetContext = OffscreenCanvas.prototype.getContext;
						OffscreenCanvas.prototype.getContext = function (
							this: OffscreenCanvas,
							...args: unknown[]
						) {
							if (isLargeCanvas(this)) return null;
							return Reflect.apply(origOffscreenGetContext, this, args);
						} as typeof OffscreenCanvas.prototype.getContext;

						if (typeof OffscreenCanvas.prototype.convertToBlob === 'function') {
							const origConvertToBlob = OffscreenCanvas.prototype.convertToBlob;
							OffscreenCanvas.prototype.convertToBlob = function (
								this: OffscreenCanvas,
								...args: unknown[]
							) {
								if (isLargeCanvas(this)) {
									return Promise.reject(
										new Error('Simulated 4096 px OffscreenCanvas allocation failure')
									);
								}
								return Reflect.apply(origConvertToBlob, this, args);
							};
						}
					}
				});
				await page.goto(ROUTE_PATH);
				await page.getByRole('button', { name: 'Save image', exact: true }).click();
				const downloadPromise = page.waitForEvent('download');
				await page.getByRole('button', { name: /4096\s*px/i }).click();
				const download = await downloadPromise;
				const filePath = await download.path();
				expect(filePath).toBeTruthy();
				const bytes = await readFile(filePath!);
				expect(bytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
				const fbWidth = bytes.readUInt32BE(16);
				const fbHeight = bytes.readUInt32BE(20);
				expect(Math.min(fbWidth, fbHeight)).toBeGreaterThanOrEqual(512);
				expect(Math.max(fbWidth, fbHeight)).toBeLessThanOrEqual(2048);
				const decodedFallback = await analyzeDecodedPng(page, bytes);
				expect(decodedFallback.width).toBe(fbWidth);
				expect(decodedFallback.height).toBe(fbHeight);
				expect(decodedFallback.opaqueAll).toBe(true);
				expect(decodedFallback.distinctSampleColors).toBeGreaterThan(4);
				expect(decodedFallback.chromaticSampleRatio).toBeGreaterThan(0.05);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F5.B1 — Mobile (390x844) expanded Controls tray stays <= 55% of viewport height', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{
				viewport: { width: 390, height: 844 },
				hasTouch: true,
				isMobile: true,
				reducedMotion: 'reduce'
			},
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				const sliderBox = await getKnobSlider(page, 'Color areas').boundingBox();
				expect(sliderBox).not.toBeNull();
				expect(sliderBox!.y).toBeGreaterThan(844 * 0.35);

				const sheetBox = await page.evaluate(() => {
					const controlsBtn = Array.from(document.querySelectorAll('button')).find(
						(b) => b.textContent?.trim() === 'Controls'
					);
					const controlledId = controlsBtn?.getAttribute('aria-controls');
					const controlled = controlledId ? document.getElementById(controlledId) : null;
					if (controlled) {
						const r = controlled.getBoundingClientRect();
						return { y: r.y, height: r.height };
					}
					const slider = document.querySelector('[role="slider"], input[type="range"]');
					let cur: Element | null = slider?.parentElement ?? null;
					while (cur && cur !== document.body) {
						const r = cur.getBoundingClientRect();
						if (
							r.width >= 300 &&
							cur.querySelectorAll('[role="slider"], input[type="range"]').length >= 4
						) {
							return { y: r.y, height: r.height };
						}
						cur = cur.parentElement;
					}
					return null;
				});

				expect(sheetBox).not.toBeNull();
				expect(sheetBox!.height).toBeLessThanOrEqual(844 * 0.55);
				expect(sheetBox!.y).toBeGreaterThanOrEqual(844 * 0.44);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F5.B2 — Mobile interactive touch targets >= 43.5px across HUD states at 390x844 & 320x568', async ({
		browser,
		baseURL
	}) => {
		for (const vp of [
			{ width: 390, height: 844 },
			{ width: 320, height: 568 }
		]) {
			await withContext(
				browser,
				{ viewport: vp, hasTouch: true, isMobile: true, reducedMotion: 'reduce' },
				baseURL,
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await assertMobileTouchTargets(page);

					await openMoreOptions(page);
					await assertMobileTouchTargets(page);
					await ensureControlsCollapsed(page);

					await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
					await assertMobileTouchTargets(page);
					await page.getByRole('button', { name: 'Whole painting', exact: true }).click();

					await page.getByRole('button', { name: 'Save image', exact: true }).click();
					await assertMobileTouchTargets(page);
					await page.keyboard.press('Escape');
					await assertCleanRuntime(tracker);
				}
			);
		}
	});

	test('F5.B3 — @axe-core/playwright zero serious or critical violations across studio & essay', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);
				const desktopAxe = await new AxeBuilder({ page }).analyze();
				expect(
					desktopAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
				).toEqual([]);

				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await assertEmbeddedEssayLoaded(page);
				const essayAxe = await new AxeBuilder({ page }).analyze();
				expect(
					essayAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
				).toEqual([]);
				await assertCleanRuntime(tracker);
			}
		);

		await withContext(
			browser,
			{
				viewport: { width: 390, height: 844 },
				hasTouch: true,
				isMobile: true,
				reducedMotion: 'reduce'
			},
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);
				const mobileAxe = await new AxeBuilder({ page }).analyze();
				expect(
					mobileAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
				).toEqual([]);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F5.B4 — HUD & tray text maintains WCAG contrast over dark and light backdrops', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);

				const contrasts = await measureToolbarContrast(page);
				expect(contrasts.length).toBeGreaterThan(0);
				for (const metric of contrasts) {
					expect(metric.contrastOverDark, `${metric.label} over #1C1B1A`).toBeGreaterThanOrEqual(
						metric.minRequiredRatio
					);
					expect(metric.contrastOverLight, `${metric.label} over #E6DFD1`).toBeGreaterThanOrEqual(
						metric.minRequiredRatio
					);
				}
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F5.B5 — Idle toolbar dims when unfocused and restores opacity >= 0.9 on focus', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await finishIfPlaying(page);
				await ensureControlsCollapsed(page);

				const controlsBtn = page.getByRole('button', { name: 'Controls', exact: true });
				await page.evaluate(() => {
					const active = document.activeElement;
					if (active instanceof HTMLElement) active.blur();
				});
				await page.mouse.move(10, 500);
				await expect
					.poll(async () => await getEffectiveOpacity(controlsBtn), { timeout: 8_000 })
					.toBeLessThan(0.9);

				await controlsBtn.focus();
				await expect
					.poll(async () => await getEffectiveOpacity(controlsBtn))
					.toBeGreaterThanOrEqual(0.9);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F6.B1 — Direct navigation to ?view=article renders essay & Return initializes studio', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(`${ROUTE_PATH}?view=article`);
				await assertEmbeddedEssayLoaded(page);
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				await expect(getCanvas(page)).toBeVisible();
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F6.B2 — Read the essay mid-playback & Return to painting resets scrollY to 0', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await assertEmbeddedEssayLoaded(page);
				await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
				expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(150);

				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				await expect(getCanvas(page)).toBeVisible();
				expect(await page.evaluate(() => window.scrollY)).toBe(0);

				await finishIfPlaying(page);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F6.B3 — Browser Back / Forward between studio & ?view=article never leaves blank screen', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(getCanvas(page)).toBeVisible();
				await expect.poll(() => readStudioQueryParams(page).seed).toBeTruthy();
				const preParams = readStudioQueryParams(page);

				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await assertEmbeddedEssayLoaded(page);
				await expect.poll(() => readStudioQueryParams(page).view).toBe('article');

				await page.goBack();
				await expect(getCanvas(page)).toBeVisible();
				await expect(getEssayHeading(page)).toHaveCount(0);
				await expect.poll(() => readStudioQueryParams(page)).toEqual(preParams);

				await page.goForward();
				await assertEmbeddedEssayLoaded(page);
				await expect.poll(() => readStudioQueryParams(page).view).toBe('article');
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F6.B4 — Sequential deep links inside embedded essay override studio params cleanly', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(`${ROUTE_PATH}?view=article`);
				await assertEmbeddedEssayLoaded(page);

				const deepLinks = page.locator(`article a[href*="${ROUTE_PATH}?"]`);
				const count = await deepLinks.count();
				expect(count).toBeGreaterThanOrEqual(2);

				const hashes: string[] = [];
				const sampleCount = Math.min(count, 3);
				for (let i = 0; i < sampleCount; i += 1) {
					if (i > 0) {
						await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
						await assertEmbeddedEssayLoaded(page);
					}
					const href = (await deepLinks.nth(i).getAttribute('href')) ?? '';
					const expected = readExpectedStudioQueryParams(href);
					await deepLinks.nth(i).click();
					await expect(getCanvas(page)).toBeVisible();
					await expect(getEssayHeading(page)).toHaveCount(0);
					await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBeNull();

					const actual = readStudioQueryParams(page);
					for (const key of ['areas', 'size', 'edge', 'trans'] as const) {
						if (expected[key] !== null) {
							expect(actual[key]).toBe(expected[key]);
						}
					}
					hashes.push(await sha256CanvasPixels(page));
				}

				expect(new Set(hashes).size).toBeGreaterThanOrEqual(2);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('F6.B5 — Full-site blog post renders opening two-area plates with JavaScript disabled', async ({
		browser,
		baseURL
	}) => {
		test.skip(
			!process.env.COLOR_FIELD_BASE_URL,
			'Full-site JS-disabled blog check requires COLOR_FIELD_BASE_URL.'
		);
		await withContext(
			browser,
			{ javaScriptEnabled: false, viewport: { width: 390, height: 844 } },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ARTICLE_PATH, { waitUntil: 'load' });
				await expect(getEssayHeading(page)).toBeVisible();

				const allArticleImgs = page.locator('article img');
				const imgCount = await allArticleImgs.count();
				expect(imgCount).toBeGreaterThanOrEqual(5);
				for (let i = 0; i < imgCount; i += 1) {
					const img = allArticleImgs.nth(i);
					await img.scrollIntoViewIfNeeded();
					await expect(img).toBeVisible();
					await expect
						.poll(() =>
							img.evaluate(
								(el) =>
									el instanceof HTMLImageElement &&
									el.complete &&
									el.naturalWidth > 0 &&
									el.naturalHeight > 0
							)
						)
						.toBe(true);
				}

				for (const platePath of [OPENING_SHARP_PLATE, OPENING_SOFT_PLATE]) {
					const img = page.locator(`article img[src*="${platePath}"]`).first();
					await img.scrollIntoViewIfNeeded();
					await expect(img).toBeVisible();
					await expect
						.poll(() =>
							img.evaluate(
								(el) =>
									el instanceof HTMLImageElement &&
									el.complete &&
									el.naturalWidth > 0 &&
									el.naturalHeight > 0
							)
						)
						.toBe(true);
				}

				await assertNoHorizontalOverflow(page);
				await assertCleanRuntime(tracker);
			}
		);
	});
});

test.describe('Tier 3 - Cross-Feature Combinations (Pairwise)', () => {
	test('T3.1 — Pairwise combinations of Color areas, Edge softness & Paint transparency produce distinct non-flat renders', async ({
		browser,
		baseURL
	}) => {
		const tuples = [
			{ areas: 2, edge: 0, trans: 10 },
			{ areas: 2, edge: 100, trans: 90 },
			{ areas: 6, edge: 50, trans: 50 },
			{ areas: 4, edge: 15, trans: 80 }
		] as const;

		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				const hashes: string[] = [];
				for (const tuple of tuples) {
					await setSliderValue(page, 'Color areas', tuple.areas);
					await setSliderValue(page, 'Edge softness', tuple.edge);
					await setSliderValue(page, 'Paint transparency', tuple.trans);

					const stats = await analyzeCanvasPixels(page);
					expect(stats.opaqueAll).toBe(true);
					expect(stats.distinctSampleColors).toBeGreaterThan(4);
					expect(stats.lumaVariance).toBeGreaterThan(1.0);
					hashes.push(await sha256CanvasPixels(page));
				}

				expect(new Set(hashes).size).toBe(tuples.length);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('T3.2 — Pairwise Area size, Canvas texture (More options) & Study combinations produce distinct renders', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);

				await setSliderValue(page, 'Area size', 30);
				await setSliderValue(page, 'Canvas texture', 15);
				const hashA = await sha256CanvasPixels(page);

				await setSliderValue(page, 'Area size', 85);
				await setSliderValue(page, 'Canvas texture', 90);
				const hashB = await sha256CanvasPixels(page);
				expect(hashB).not.toBe(hashA);

				await selectAlternateStudy(page);
				await setSliderValue(page, 'Area size', 30);
				const hashC = await sha256CanvasPixels(page);
				expect(hashC).not.toBe(hashA);
				expect(hashC).not.toBe(hashB);

				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('T3.3 — Embedded ?view=article deep-link updates live studio without full page reload & supports Return/History', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await page.evaluate(() => {
					Reflect.set(window, '__cfNavSentinel', 'alive');
				});
				const initialHash = await sha256CanvasPixels(page);

				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await assertEmbeddedEssayLoaded(page);

				const deepLink = page.locator(`article a[href*="${ROUTE_PATH}?"]`).first();
				await expect(deepLink).toBeVisible();
				await deepLink.click();

				await expect(getCanvas(page)).toBeVisible();
				await expect(getEssayHeading(page)).toHaveCount(0);
				expect(
					await page.evaluate(() => Reflect.get(window, '__cfNavSentinel') as string | undefined)
				).toBe('alive');
				expect(await sha256CanvasPixels(page)).not.toBe(initialHash);

				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await assertEmbeddedEssayLoaded(page);
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				await expect(getCanvas(page)).toBeVisible();

				await page.goBack();
				await assertEmbeddedEssayLoaded(page);
				await page.goForward();
				await expect(getCanvas(page)).toBeVisible();
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('T3.4 — Inspect surface + Controls toggle + panning/zooming preserves clean layout & opaque edges', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await expect(
					page.getByRole('button', { name: 'Whole painting', exact: true })
				).toBeVisible();

				await ensureControlsExpanded(page);
				await assertNoButtonOverlapOrClipping(page);
				await assertNoHorizontalOverflow(page);

				const hashBeforePan = await sha256CanvasPixels(page);
				await panInspect(page, 'right');
				await panInspect(page, 'down');

				const zoomIn = page.getByRole('button', { name: /Zoom in/i });
				if ((await zoomIn.count()) > 0 && (await zoomIn.first().isVisible())) {
					await zoomIn.first().click();
				}

				expect(await sha256CanvasPixels(page)).not.toBe(hashBeforePan);
				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				expect(stats.transparentEdgePixels).toBe(0);
				expect(stats.distinctSampleColors).toBeGreaterThan(2);
				expect(stats.lumaVariance).toBeGreaterThan(0.2);

				await ensureControlsCollapsed(page);
				await page.getByRole('button', { name: 'Whole painting', exact: true }).click();
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('T3.5 — Pause mid-animation + primary slider adjustment + Resume / Finish now settles cleanly', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await page.getByRole('button', { name: 'Pause', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();

				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Edge softness', 92);
				await setSliderValue(page, 'Paint transparency', 80);

				const resumeBtn = page.getByRole('button', { name: 'Resume', exact: true });
				if ((await resumeBtn.count()) > 0 && (await resumeBtn.first().isVisible())) {
					await resumeBtn.first().click();
				}
				await finishIfPlaying(page);

				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				expect(stats.distinctSampleColors).toBeGreaterThan(4);
				await assertCleanRuntime(tracker);
			}
		);
	});
});

test.describe('Tier 4 - Real-World Application Scenarios', () => {
	test('S1 — Guided reader sequence matching the blog essay (2 sharp -> 2 soft/translucent -> resized -> multi-field)', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				// Step 1: Two fixed areas with sharp boundaries
				await setSliderValue(page, 'Color areas', 2);
				await setSliderValue(page, 'Edge softness', 0);
				await setSliderValue(page, 'Paint transparency', 15);
				const hashSharp = await sha256CanvasPixels(page);

				// Step 2: Same two areas with softened edges and increased transparency
				await setSliderValue(page, 'Edge softness', 85);
				await setSliderValue(page, 'Paint transparency', 75);
				const hashSoft = await sha256CanvasPixels(page);
				expect(hashSoft).not.toBe(hashSharp);

				// Step 3: Adjust relative area size to explore scale & adjacency
				await setSliderValue(page, 'Area size', 84);
				const hashResized = await sha256CanvasPixels(page);
				expect(hashResized).not.toBe(hashSoft);

				// Step 4: Expand into a multi-field layered composition
				await setSliderValue(page, 'Color areas', 5);
				await setSliderValue(page, 'Edge softness', 65);
				await setSliderValue(page, 'Paint transparency', 60);
				const hashMulti = await sha256CanvasPixels(page);
				expect(hashMulti).not.toBe(hashResized);

				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				expect(stats.chromaticSampleRatio).toBeGreaterThan(0.05);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('S2 — Live essay-to-studio exploration: ?view=article -> deep link -> Replay/Pause/Finish -> Inspect -> Return', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(`${ROUTE_PATH}?view=article`);
				await assertEmbeddedEssayLoaded(page);

				const deepLink = page.locator(`article a[href*="${ROUTE_PATH}?"]`).first();
				await deepLink.click();
				await expect(getCanvas(page)).toBeVisible();
				await finishIfPlaying(page);

				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await page.getByRole('button', { name: 'Pause', exact: true }).click();
				await page.getByRole('button', { name: 'Finish now', exact: true }).click();

				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await panInspect(page, 'right');
				await page.getByRole('button', { name: 'Whole painting', exact: true }).click();

				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await assertEmbeddedEssayLoaded(page);
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				await expect(getCanvas(page)).toBeVisible();
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('S3 — High-resolution PNG export (Save image 2048 px & 4096 px) emits valid non-flat PNGs', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(getCanvas(page)).toBeVisible();

				const export2048 = await exportPng(page, 2048);
				expect(export2048.filename.toLowerCase()).toContain('.png');
				const decoded2048 = await analyzeDecodedPng(page, export2048.bytes);
				expect(decoded2048.width).toBe(export2048.width);
				expect(decoded2048.height).toBe(export2048.height);
				expect(decoded2048.opaqueAll).toBe(true);
				expect(decoded2048.distinctSampleColors).toBeGreaterThan(4);
				expect(decoded2048.chromaticSampleRatio).toBeGreaterThan(0.05);

				const export4096 = await exportPng(page, 4096);
				expect(export4096.filename.toLowerCase()).toContain('.png');
				const decoded4096 = await analyzeDecodedPng(page, export4096.bytes);
				expect(decoded4096.width).toBe(export4096.width);
				expect(decoded4096.height).toBe(export4096.height);
				expect(decoded4096.opaqueAll).toBe(true);
				expect(decoded4096.distinctSampleColors).toBeGreaterThan(4);
				expect(decoded4096.chromaticSampleRatio).toBeGreaterThan(0.05);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('S4 — Live viewport resize transitions (1440x900 -> 740x380 -> 390x844 -> 1440x900) recover cleanly', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);

				for (const vp of [
					{ width: 1440, height: 900 },
					{ width: 740, height: 380 },
					{ width: 390, height: 844 },
					{ width: 1440, height: 900 }
				]) {
					await page.setViewportSize(vp);
					await expect(getCanvas(page)).toBeVisible();
					await assertCanvasAspectUniform(page);
					await assertNoHorizontalOverflow(page);
					const stats = await analyzeCanvasPixels(page);
					expect(stats.opaqueAll).toBe(true);
				}

				await assertCleanRuntime(tracker);
			}
		);
	});

	test('S5 — Fullscreen API toggle, NotAllowedError fallback & keyboard-accessible studio workflow', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.addInitScript(() => {
					let fsEl: Element | null = null;
					const setFsEl = (el: Element | null): void => {
						fsEl = el;
					};
					Reflect.set(window, '__fsRequestCount', 0);
					Object.defineProperty(document, 'fullscreenEnabled', {
						configurable: true,
						get: () => true
					});
					Object.defineProperty(document, 'fullscreenElement', {
						configurable: true,
						get: () => fsEl
					});
					HTMLElement.prototype.requestFullscreen = function (this: HTMLElement) {
						const count = (Reflect.get(window, '__fsRequestCount') as number | undefined) ?? 0;
						Reflect.set(window, '__fsRequestCount', count + 1);
						setFsEl(this);
						queueMicrotask(() => document.dispatchEvent(new Event('fullscreenchange')));
						return Promise.resolve();
					};
					document.exitFullscreen = () => {
						setFsEl(null);
						queueMicrotask(() => document.dispatchEvent(new Event('fullscreenchange')));
						return Promise.resolve();
					};
				});

				await page.goto(ROUTE_PATH);
				const fsBtn = page.getByRole('button', { name: 'Fullscreen', exact: true });
				await fsBtn.click();
				await expect(
					page.getByRole('button', { name: 'Exit fullscreen', exact: true })
				).toBeVisible();
				expect(await page.evaluate(() => Reflect.get(window, '__fsRequestCount') as number)).toBe(
					1
				);

				await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
				await expect(fsBtn).toBeVisible();

				await ensureControlsExpanded(page);
				const edgeSlider = getKnobSlider(page, 'Edge softness');
				await edgeSlider.focus();
				await edgeSlider.press('PageUp');
				expect(Number(await edgeSlider.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(0);
				await assertCleanRuntime(tracker);
			}
		);

		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.addInitScript(() => {
					Object.defineProperty(document, 'fullscreenEnabled', {
						configurable: true,
						get: () => true
					});
					HTMLElement.prototype.requestFullscreen = () =>
						Promise.reject(new DOMException('Denied', 'NotAllowedError'));
				});

				await page.goto(ROUTE_PATH);
				await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();
				await expect(page.getByRole('status').first()).toBeVisible();
				await assertCleanRuntime(tracker);
			}
		);
	});
});

test.describe('Tier 5 - Adversarial Edge Cases & Hardening', () => {
	test('T5.1 — All 5 studies, all 4 presets, cobalt-veil edge softness & Inspect vs Whole export parity', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);

				const studyGroup = page.getByRole('group', { name: 'Studies' });
				const studyBtns = studyGroup.locator('button');
				const studyCount = await studyBtns.count();
				expect(studyCount).toBe(5);

				const studyHashes: string[] = [];
				for (let i = 0; i < studyCount; i += 1) {
					const btn = studyBtns.nth(i);
					await btn.click();
					await expect(btn).toHaveAttribute('aria-pressed', 'true');
					studyHashes.push(await sha256CanvasPixels(page));
				}
				expect(new Set(studyHashes).size).toBe(5);

				// Presets preserve active seed & clear aria-pressed when manually overridden
				const seedBeforePreset = await readVisibleSeed(page);
				const presetGroup = page.getByRole('group', { name: 'Presets' });
				const presetBtns = presetGroup.locator('button');
				expect(await presetBtns.count()).toBe(4);
				const luminousBtn = presetGroup.getByRole('button', { name: 'Luminous Veil', exact: true });
				await luminousBtn.click();
				await expect(luminousBtn).toHaveAttribute('aria-pressed', 'true');
				expect(await readVisibleSeed(page)).toBe(seedBeforePreset);
				await expect(page.getByRole('status')).toContainText(/Luminous Veil/i);

				await setSliderValue(page, 'Edge softness', 45);
				await expect(luminousBtn).toHaveAttribute('aria-pressed', 'false');

				// Inspect surface export must match Whole painting export pixel-for-pixel & include study slug/seed
				const wholeExport = await exportPng(page, 2048);
				expect(wholeExport.filename).toContain('terra-stillness');
				expect(wholeExport.filename).toContain(seedBeforePreset);
				const wholeSha = createHash('sha256').update(wholeExport.bytes).digest('hex');

				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				const inspectExport = await exportPng(page, 2048);
				const inspectSha = createHash('sha256').update(inspectExport.bytes).digest('hex');
				expect(inspectSha).toBe(wholeSha);

				// Multi-study edge softness check on cobalt-veil seed 3912847101 (gradient & variance, per TEST_READY.md:46)
				await page.goto(`${ROUTE_PATH}?study=cobalt-veil&seed=3912847101&edge=0`);
				const sharpStats = await analyzeCanvasPixels(page);
				await page.goto(`${ROUTE_PATH}?study=cobalt-veil&seed=3912847101&edge=100`);
				const softStats = await analyzeCanvasPixels(page);
				expect(sharpStats.meanLocalGradient).toBeGreaterThan(softStats.meanLocalGradient);
				expect(sharpStats.lumaVariance).toBeGreaterThan(softStats.lumaVariance);

				await assertCleanRuntime(tracker);
			}
		);
	});

	test('T5.2 — Dial drag Escape unmount consistency, active-playback keyboard/time edits & ARIA stability', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

				// Accessible description must not thrash while frames advance
				const summaries = new Set<string>();
				for (let i = 0; i < 5; i += 1) {
					summaries.add(await readAccessibleSummary(page));
					await page.waitForTimeout(80);
				}
				expect(summaries.size).toBe(1);

				// Adjusting Painting time mid-playback keeps playback running
				await openMoreOptions(page);
				const timeSlider = getKnobSlider(page, 'Painting time');
				await timeSlider.focus();
				await timeSlider.press('Home');
				await expect(timeSlider).toHaveAttribute('aria-valuenow', '4');
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

				// Keyboard PageUp on primary slider during active playback updates & settles cleanly
				const edgeSlider = getKnobSlider(page, 'Edge softness');
				await edgeSlider.focus();
				await edgeSlider.press('PageUp');
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);

				// Regression guard (Bug 1): closing Controls via Escape mid-dial-drag must not desync state/URL/ARIA/backing resolution
				const beforeEdge = await edgeSlider.getAttribute('aria-valuenow');
				const box = await getVisibleDragTargetBox(edgeSlider, 'Edge softness');
				const cx = box.x + box.width / 2;
				const cy = box.y + box.height / 2;
				await page.evaluate(
					({ x, y }) => {
						const el = document.elementFromPoint(x, y)?.closest('[title*="drag" i]');
						if (!el) throw new Error('Missing dial target');
						el.dispatchEvent(
							new PointerEvent('pointerdown', {
								bubbles: true,
								pointerId: 91,
								pointerType: 'mouse',
								button: 0,
								clientX: x,
								clientY: y
							})
						);
						el.dispatchEvent(
							new PointerEvent('pointermove', {
								bubbles: true,
								pointerId: 91,
								pointerType: 'mouse',
								clientX: x + 60,
								clientY: y
							})
						);
					},
					{ x: cx, y: cy }
				);
				await expect(edgeSlider).not.toHaveAttribute('aria-valuenow', beforeEdge!);
				await page.keyboard.press('Escape');
				await ensureControlsExpanded(page);
				const committedEdge = await getKnobSlider(page, 'Edge softness').getAttribute(
					'aria-valuenow'
				);
				expect(readStudioQueryParams(page).edge).toBe(committedEdge);
				expect(await readAccessibleSummary(page)).toContain(`${committedEdge}% edge softness`);
				const canvasWidth = await getCanvas(page).evaluate((c) => (c as HTMLCanvasElement).width);
				expect(canvasWidth).toBeGreaterThanOrEqual(1000);

				// Regression guard (edge1E): Replay & Inspect surface mid-dial-drag must flush pending preview commit
				await openMoreOptions(page);
				const undoBtn = page.getByRole('button', { name: /^Undo/i });
				const undoLabelBeforeReplay = (await undoBtn.textContent())?.trim() ?? '';
				const undoCountBeforeReplay = Number(undoLabelBeforeReplay.match(/\d+/)?.[0] ?? '0');

				const sizeSlider = getKnobSlider(page, 'Area size');
				const beforeSize = await sizeSlider.getAttribute('aria-valuenow');
				const sizeBox = await getVisibleDragTargetBox(sizeSlider, 'Area size');
				const sx = sizeBox.x + sizeBox.width / 2;
				const sy = sizeBox.y + sizeBox.height / 2;
				await page.evaluate(
					({ x, y }) => {
						const el = document.elementFromPoint(x, y)?.closest('[title*="drag" i]');
						if (!el) throw new Error('Missing Area size dial target');
						el.dispatchEvent(
							new PointerEvent('pointerdown', {
								bubbles: true,
								pointerId: 92,
								pointerType: 'mouse',
								button: 0,
								clientX: x,
								clientY: y
							})
						);
						el.dispatchEvent(
							new PointerEvent('pointermove', {
								bubbles: true,
								pointerId: 92,
								pointerType: 'mouse',
								clientX: x + 60,
								clientY: y
							})
						);
					},
					{ x: sx, y: sy }
				);
				const previewSize = await sizeSlider.getAttribute('aria-valuenow');
				expect(previewSize).not.toBe(beforeSize);

				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				expect(readStudioQueryParams(page).size).toBe(previewSize);
				expect(await readAccessibleSummary(page)).toContain(`at ${previewSize}% size`);
				const storedAfterReplay = await page.evaluate(() =>
					JSON.parse(localStorage.getItem('color-field-studio.state.v1') ?? 'null')
				);
				expect(String(storedAfterReplay?.areaSize)).toBe(previewSize);
				await expect(undoBtn).toHaveText(`Undo (${undoCountBeforeReplay + 1})`);

				await finishIfPlaying(page);
				const transSlider = getKnobSlider(page, 'Paint transparency');
				const beforeTrans = await transSlider.getAttribute('aria-valuenow');
				const transBox = await getVisibleDragTargetBox(transSlider, 'Paint transparency');
				const tx = transBox.x + transBox.width / 2;
				const ty = transBox.y + transBox.height / 2;
				await page.evaluate(
					({ x, y }) => {
						const el = document.elementFromPoint(x, y)?.closest('[title*="drag" i]');
						if (!el) throw new Error('Missing Paint transparency dial target');
						el.dispatchEvent(
							new PointerEvent('pointerdown', {
								bubbles: true,
								pointerId: 93,
								pointerType: 'mouse',
								button: 0,
								clientX: x,
								clientY: y
							})
						);
						el.dispatchEvent(
							new PointerEvent('pointermove', {
								bubbles: true,
								pointerId: 93,
								pointerType: 'mouse',
								clientX: x + 60,
								clientY: y
							})
						);
					},
					{ x: tx, y: ty }
				);
				const previewTrans = await transSlider.getAttribute('aria-valuenow');
				expect(previewTrans).not.toBe(beforeTrans);

				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				expect(new URL(page.url()).searchParams.get('vm')).toBe('inspect');
				expect(readStudioQueryParams(page).trans).toBe(previewTrans);
				expect(await readAccessibleSummary(page)).toContain(
					`(${previewTrans}% paint transparency)`
				);
				const storedAfterInspect = await page.evaluate(() =>
					JSON.parse(localStorage.getItem('color-field-studio.state.v1') ?? 'null')
				);
				expect(String(storedAfterInspect?.transparency)).toBe(previewTrans);
				await expect(undoBtn).toHaveText(`Undo (${undoCountBeforeReplay + 2})`);

				await undoBtn.click();
				await expect(transSlider).toHaveAttribute('aria-valuenow', beforeTrans!);
				expect(readStudioQueryParams(page).trans).toBe(beforeTrans);
				expect(await readAccessibleSummary(page)).toContain(`(${beforeTrans}% paint transparency)`);
				const storedAfterUndo = await page.evaluate(() =>
					JSON.parse(localStorage.getItem('color-field-studio.state.v1') ?? 'null')
				);
				expect(String(storedAfterUndo?.transparency)).toBe(beforeTrans);
				await expect(undoBtn).toHaveText(`Undo (${undoCountBeforeReplay + 1})`);

				// Regression guard: Zoom in close-up & Copy link mid-dial-drag flush pending preview commit
				await sizeSlider.scrollIntoViewIfNeeded();
				const beforeZoomSize = await sizeSlider.getAttribute('aria-valuenow');
				const zoomSizeBox = await getVisibleDragTargetBox(sizeSlider, 'Area size');
				await page.evaluate(
					({ x, y }) => {
						const el = document.elementFromPoint(x, y)?.closest('[title*="drag" i]');
						if (!el) throw new Error('Missing Area size dial target');
						el.dispatchEvent(
							new PointerEvent('pointerdown', {
								bubbles: true,
								pointerId: 94,
								pointerType: 'mouse',
								button: 0,
								clientX: x,
								clientY: y
							})
						);
						el.dispatchEvent(
							new PointerEvent('pointermove', {
								bubbles: true,
								pointerId: 94,
								pointerType: 'mouse',
								clientX: x - 50,
								clientY: y
							})
						);
					},
					{ x: zoomSizeBox.x + zoomSizeBox.width / 2, y: zoomSizeBox.y + zoomSizeBox.height / 2 }
				);
				const previewZoomSize = await sizeSlider.getAttribute('aria-valuenow');
				expect(previewZoomSize).not.toBe(beforeZoomSize);

				await page.getByRole('button', { name: 'Zoom in close-up', exact: true }).click();
				expect(readStudioQueryParams(page).size).toBe(previewZoomSize);
				expect(await readAccessibleSummary(page)).toContain(`at ${previewZoomSize}% size`);
				const storedAfterZoom = await page.evaluate(() =>
					JSON.parse(localStorage.getItem('color-field-studio.state.v1') ?? 'null')
				);
				expect(String(storedAfterZoom?.areaSize)).toBe(previewZoomSize);
				await expect(undoBtn).toHaveText(`Undo (${undoCountBeforeReplay + 2})`);

				await transSlider.scrollIntoViewIfNeeded();
				const beforeCopyTrans = await transSlider.getAttribute('aria-valuenow');
				const copyTransBox = await getVisibleDragTargetBox(transSlider, 'Paint transparency');
				await page.evaluate(
					({ x, y }) => {
						const el = document.elementFromPoint(x, y)?.closest('[title*="drag" i]');
						if (!el) throw new Error('Missing Paint transparency dial target');
						el.dispatchEvent(
							new PointerEvent('pointerdown', {
								bubbles: true,
								pointerId: 95,
								pointerType: 'mouse',
								button: 0,
								clientX: x,
								clientY: y
							})
						);
						el.dispatchEvent(
							new PointerEvent('pointermove', {
								bubbles: true,
								pointerId: 95,
								pointerType: 'mouse',
								clientX: x + 50,
								clientY: y
							})
						);
					},
					{
						x: copyTransBox.x + copyTransBox.width / 2,
						y: copyTransBox.y + copyTransBox.height / 2
					}
				);
				const previewCopyTrans = await transSlider.getAttribute('aria-valuenow');
				expect(previewCopyTrans).not.toBe(beforeCopyTrans);

				await page.getByRole('button', { name: 'Copy link', exact: true }).click();
				expect(readStudioQueryParams(page).trans).toBe(previewCopyTrans);
				expect(await readAccessibleSummary(page)).toContain(
					`(${previewCopyTrans}% paint transparency)`
				);
				const storedAfterCopy = await page.evaluate(() =>
					JSON.parse(localStorage.getItem('color-field-studio.state.v1') ?? 'null')
				);
				expect(String(storedAfterCopy?.transparency)).toBe(previewCopyTrans);
				await expect(undoBtn).toHaveText(`Undo (${undoCountBeforeReplay + 3})`);

				await undoBtn.click();
				await expect(transSlider).toHaveAttribute('aria-valuenow', beforeCopyTrans!);
				expect(readStudioQueryParams(page).trans).toBe(beforeCopyTrans);
				expect(await readAccessibleSummary(page)).toContain(
					`(${beforeCopyTrans}% paint transparency)`
				);
				const storedAfterCopyUndo = await page.evaluate(() =>
					JSON.parse(localStorage.getItem('color-field-studio.state.v1') ?? 'null')
				);
				expect(String(storedAfterCopyUndo?.transparency)).toBe(beforeCopyTrans);
				await expect(undoBtn).toHaveText(`Undo (${undoCountBeforeReplay + 2})`);

				await assertCleanRuntime(tracker);
			}
		);
	});

	test('T5.3 — Escape precedence, focus restoration, intro dismiss & Copy link fallback', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.addInitScript(() => {
					let fsEl: Element | null = null;
					const setFsEl = (el: Element | null): void => {
						fsEl = el;
					};
					Object.defineProperty(document, 'fullscreenEnabled', {
						configurable: true,
						get: () => true
					});
					Object.defineProperty(document, 'fullscreenElement', {
						configurable: true,
						get: () => fsEl
					});
					HTMLElement.prototype.requestFullscreen = function (this: HTMLElement) {
						setFsEl(this);
						queueMicrotask(() => document.dispatchEvent(new Event('fullscreenchange')));
						return Promise.resolve();
					};
					document.exitFullscreen = () => {
						setFsEl(null);
						queueMicrotask(() => document.dispatchEvent(new Event('fullscreenchange')));
						return Promise.resolve();
					};
					Object.defineProperty(navigator, 'clipboard', {
						configurable: true,
						value: {
							writeText: async () => {
								throw new DOMException('Denied', 'NotAllowedError');
							}
						}
					});
				});

				await page.goto(ROUTE_PATH);

				// Dismiss intro pill
				const dismissBtn = page.getByRole('button', { name: 'Dismiss intro note', exact: true });
				await dismissBtn.click();
				await expect(page.locator('.cf-intro-pill')).toHaveCount(0);

				// Copy link fallback shows selectable readonly URL input when clipboard fails
				await openMoreOptions(page);
				await page.getByRole('button', { name: 'Copy link', exact: true }).click();
				const shareInput = page.getByLabel('Copyable painting URL');
				await expect(shareInput).toBeVisible();
				await expect(shareInput).toHaveAttribute('readonly', '');
				expect(await shareInput.inputValue()).toContain(ROUTE_PATH);

				// Escape precedence: Save image > Fullscreen > Article > Controls tray > Inspect surface
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
				const saveBtn = page.getByRole('button', { name: 'Save image', exact: true });
				await saveBtn.click();
				await expect(page.getByRole('button', { name: /2048\s*px/i })).toBeVisible();

				// 1. Escape closes Save image popover & focuses Save image button
				await page.keyboard.press('Escape');
				await expect(page.getByRole('button', { name: /2048\s*px/i })).toHaveCount(0);
				await expect(saveBtn).toBeFocused();

				// 2. Escape exits Fullscreen before article/tray/inspect
				await page.keyboard.press('Escape');
				await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();

				// 3. Open article -> Escape closes article & focuses Read the essay
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await assertEmbeddedEssayLoaded(page);
				await page.keyboard.press('Escape');
				await expect(getEssayHeading(page)).toHaveCount(0);
				await expect(
					page.getByRole('button', { name: 'Read the essay', exact: true })
				).toBeFocused();

				// 4. Escape closes Controls tray & focuses Controls
				await page.keyboard.press('Escape');
				await expect(page.getByRole('button', { name: 'Controls', exact: true })).toHaveAttribute(
					'aria-expanded',
					'false'
				);
				await expect(page.getByRole('button', { name: 'Controls', exact: true })).toBeFocused();

				// 5. Escape from inside Inspect HUD exits Inspect surface & restores focus to Inspect surface button (Bug 2)
				await page.getByRole('button', { name: 'Zoom in close-up', exact: true }).focus();
				await page.keyboard.press('Escape');
				const inspectToggle = page.getByRole('button', { name: 'Inspect surface', exact: true });
				await expect(inspectToggle).toBeVisible();
				await expect(inspectToggle).toBeFocused();

				await assertCleanRuntime(tracker);
			}
		);
	});

	test('T5.4 — Undo 24-cap, cross-artboard Undo, Reset from Inspect & Seed invalid/hash/overflow inputs', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);

				const undoBtn = page.getByRole('button', { name: /^Undo/i });
				await expect(undoBtn).toBeDisabled();

				// Seed validation: 0 and whitespace keep current seed; alpha hashes deterministically; overflow wraps
				const seedInput = page.getByLabel(/Painting seed|^Seed$/i).first();
				const applyBtn = page.getByRole('button', { name: /^Apply$/i });
				const initialSeed = await seedInput.inputValue();
				for (const rejected of ['0', '   ']) {
					await seedInput.fill(rejected);
					await applyBtn.click();
					await expect(seedInput).toHaveValue(initialSeed);
				}
				await expect(undoBtn).toBeDisabled();

				await seedInput.fill('monet');
				await applyBtn.click();
				const hashedSeed = await seedInput.inputValue();
				expect(hashedSeed).not.toBe(initialSeed);
				expect(Number(hashedSeed)).toBeGreaterThan(0);

				await seedInput.fill('1000000000');
				await applyBtn.click();
				await expect(seedInput).toHaveValue('1');

				// Cross-artboard New painting + Undo restores previous landscape artboard
				await page.setViewportSize({ width: 390, height: 844 });
				await page.getByRole('button', { name: 'New painting', exact: true }).click();
				await expect(getCanvas(page)).toHaveAttribute('data-artboard', '960x1080');
				await undoBtn.click();
				await expect(getCanvas(page)).toHaveAttribute('data-artboard', '1200x800');

				// Reset settings from Inspect surface exits inspect & restores default fill view
				await page.setViewportSize({ width: 1440, height: 900 });
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await page.getByRole('button', { name: /^Reset/i }).click();
				await expect(getCanvas(page)).toHaveAttribute('data-view-mode', 'fill');
				expect(new URL(page.url()).searchParams.get('vm')).toBeNull();

				// Undo 24-entry cap
				for (let val = 26; val <= 55; val += 1) {
					await setSliderValue(page, 'Area size', val);
				}
				await expect(undoBtn).toHaveText('Undo (24)');
				for (let i = 0; i < 24; i += 1) {
					await undoBtn.click();
				}
				await expect(undoBtn).toBeDisabled();
				await expect(undoBtn).toHaveText('Undo');

				await assertCleanRuntime(tracker);
			}
		);
	});

	test('T5.5 — Inspect zoom bounds, wheel zoom, pointer drag pan, Recenter, Return & seed Arrow isolation', async ({
		browser,
		baseURL
	}) => {
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsCollapsed(page);

				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				const zoomInBtn = page.getByRole('button', { name: 'Zoom in close-up', exact: true });
				const zoomOutBtn = page.getByRole('button', { name: 'Zoom out close-up', exact: true });

				for (let i = 0; i < 5; i += 1) {
					if (await zoomInBtn.isEnabled()) await zoomInBtn.click();
				}
				await expect(zoomInBtn).toBeDisabled();
				expect(Number(new URL(page.url()).searchParams.get('iz'))).toBeCloseTo(5.0, 2);

				for (let i = 0; i < 10; i += 1) {
					if (await zoomOutBtn.isEnabled()) await zoomOutBtn.click();
				}
				await expect(zoomOutBtn).toBeDisabled();
				expect(Number(new URL(page.url()).searchParams.get('iz'))).toBeCloseTo(2.0, 2);

				// Mouse wheel zoom & pointer drag pan on stage
				const box = await getCanvas(page).boundingBox();
				expect(box).not.toBeNull();
				const cx = box!.x + box!.width / 2;
				const cy = box!.y + box!.height / 2;
				await page.mouse.move(cx, cy);
				await page.mouse.wheel(0, -120);
				expect(Number(new URL(page.url()).searchParams.get('iz'))).toBeGreaterThan(2.0);

				const ixBefore = new URL(page.url()).searchParams.get('ix');
				await page.mouse.down();
				await page.mouse.move(cx - 180, cy - 100, { steps: 5 });
				await page.mouse.up();
				expect(new URL(page.url()).searchParams.get('ix')).not.toBe(ixBefore);

				// Recenter resets zoom to 3.5x
				await page.getByRole('button', { name: 'Recenter', exact: true }).click();
				expect(Number(new URL(page.url()).searchParams.get('iz'))).toBeCloseTo(3.5, 2);

				// Arrow keys inside Seed input must not pan Inspect surface
				await openMoreOptions(page);
				const seedInput = page.getByLabel(/Painting seed|^Seed$/i).first();
				const ixFixed = new URL(page.url()).searchParams.get('ix');
				const hashFixed = await sha256CanvasPixels(page);
				await seedInput.focus();
				await seedInput.press('ArrowLeft');
				await seedInput.press('ArrowRight');
				expect(new URL(page.url()).searchParams.get('ix')).toBe(ixFixed);
				expect(await sha256CanvasPixels(page)).toBe(hashFixed);

				await ensureControlsCollapsed(page);
				await page.getByRole('button', { name: 'Return to whole painting', exact: true }).click();
				const inspectToggle = page.getByRole('button', { name: 'Inspect surface', exact: true });
				await expect(inspectToggle).toBeVisible();
				await expect(inspectToggle).toBeFocused();
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('T5.6 — visibilitychange auto-pause/resume, manual pause invariance & reduced-motion while hidden', async ({
		browser,
		baseURL
	}) => {
		// 1. Auto-pause on hidden, essay round-trip, auto-resume on Return
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

				await page.evaluate(() => {
					Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
					document.dispatchEvent(new Event('visibilitychange'));
				});
				await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();

				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await assertEmbeddedEssayLoaded(page);

				await page.evaluate(() => {
					Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
					document.dispatchEvent(new Event('visibilitychange'));
				});
				await page.getByRole('button', { name: /Return to painting/i }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await finishIfPlaying(page);
				await assertCleanRuntime(tracker);
			}
		);

		// 2. Manual Pause remains paused across visibilitychange bounce
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await page.getByRole('button', { name: 'Pause', exact: true }).click();
				const pausedHash = await sha256CanvasPixels(page);

				await page.evaluate(() => {
					Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
					document.dispatchEvent(new Event('visibilitychange'));
				});
				await page.waitForTimeout(80);
				await page.evaluate(() => {
					Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
					document.dispatchEvent(new Event('visibilitychange'));
				});
				await page.waitForTimeout(220);

				await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
				expect(await sha256CanvasPixels(page)).toBe(pausedHash);
				await finishIfPlaying(page);
				await assertCleanRuntime(tracker);
			}
		);

		// 3. Reduced motion enabled while hidden finishes playback on visibility restore
		await withContext(
			browser,
			{ reducedMotion: 'no-preference' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await page.evaluate(() => {
					Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
					document.dispatchEvent(new Event('visibilitychange'));
				});
				await page.emulateMedia({ reducedMotion: 'reduce' });
				await page.evaluate(() => {
					Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
					document.dispatchEvent(new Event('visibilitychange'));
				});
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
				await expect(page.getByRole('button', { name: 'Resume', exact: true })).toHaveCount(0);
				await assertCleanRuntime(tracker);
			}
		);
	});

	test('T5.7 — Malformed popstate, corrupt/throwing localStorage, export concurrency & multi-panel resize recovery', async ({
		browser,
		baseURL
	}) => {
		// 1. Malformed popstate + export concurrency guard
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);

				await page.evaluate(() => {
					window.history.pushState(
						null,
						'',
						'/tools/color-field-studio?areas=bad&size=-999&edge=9999&trans=NaN&study=invalid&seed=bad&artboard=weird&vm=bogus&iz=99&ix=-5&iy=5&view=bogus'
					);
					window.dispatchEvent(new PopStateEvent('popstate'));
				});
				await expect(getKnobSlider(page, 'Color areas')).toHaveAttribute('aria-valuenow', '3');
				await expect(getKnobSlider(page, 'Area size')).toHaveAttribute('aria-valuenow', '25');
				await expect(getKnobSlider(page, 'Edge softness')).toHaveAttribute('aria-valuenow', '100');
				await expect(getCanvas(page)).toHaveAttribute('data-view-mode', 'fill');

				// Export concurrency guard: synchronous 2048 + 4096 clicks emit 1 download & restore focus
				let downloadCount = 0;
				page.on('download', () => {
					downloadCount += 1;
				});
				const saveBtn = page.getByRole('button', { name: 'Save image', exact: true });
				await saveBtn.click();
				const dlPromise = page.waitForEvent('download');
				await page.evaluate(() => {
					const btns = Array.from(document.querySelectorAll('button'));
					btns.find((b) => /2048\s*px/i.test(b.textContent ?? ''))?.click();
					btns.find((b) => /4096\s*px/i.test(b.textContent ?? ''))?.click();
				});
				await dlPromise;
				await page.waitForTimeout(200);
				expect(downloadCount).toBe(1);
				await expect(saveBtn).toBeFocused();

				// Multi-panel resize recovery with Controls + More options + Inspect surface open
				await openMoreOptions(page);
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				for (const vp of [
					{ width: 770, height: 800 },
					{ width: 740, height: 380 },
					{ width: 390, height: 844 },
					{ width: 320, height: 568 },
					{ width: 1440, height: 900 }
				]) {
					await page.setViewportSize(vp);
					await assertNoHorizontalOverflow(page);
					await assertCanvasAspectUniform(page);
				}

				// Resize while ?view=article is open, then Return to painting
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await assertEmbeddedEssayLoaded(page);
				await page.setViewportSize({ width: 390, height: 844 });
				await assertNoHorizontalOverflow(page);
				await page.getByRole('button', { name: /Return to painting/i }).click();
				await expect(getCanvas(page)).toBeVisible();
				await assertNoHorizontalOverflow(page);
				await assertCanvasAspectUniform(page);
				await assertCleanRuntime(tracker);
			}
		);

		// 2. Corrupt JSON / wrong-version / corrupt-types localStorage recovery
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Color areas', 5);

				await page.evaluate(() => {
					for (const k of Object.keys(localStorage)) {
						localStorage.setItem(k, '{broken json');
					}
					window.history.replaceState(null, '', window.location.pathname);
				});
				await page.reload();
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Color areas')).toHaveAttribute('aria-valuenow', '3');

				await page.evaluate(() => {
					localStorage.setItem(
						'color-field-studio.state.v1',
						JSON.stringify({
							version: 1,
							generatorVersion: 1,
							studyId: 'bogus',
							seed: null,
							areaCount: 'NaN',
							areaSize: -10,
							edgeSoftness: 999,
							transparency: 0,
							canvasTexture: 'bad',
							paintingTime: null,
							artboard: 'bad'
						})
					);
					window.history.replaceState(null, '', window.location.pathname);
				});
				await page.reload();
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Color areas')).toHaveAttribute('aria-valuenow', '3');
				await expect(getKnobSlider(page, 'Area size')).toHaveAttribute('aria-valuenow', '25');
				await expect(getKnobSlider(page, 'Edge softness')).toHaveAttribute('aria-valuenow', '100');
				await assertCleanRuntime(tracker);
			}
		);

		// 3. Throwing localStorage (SecurityError) & QuotaExceededError
		await withContext(
			browser,
			{ reducedMotion: 'reduce' },
			baseURL,
			async (_ctx, page, tracker) => {
				await page.addInitScript(() => {
					const err = () => {
						throw new DOMException('Blocked', 'SecurityError');
					};
					Object.defineProperty(window, 'localStorage', {
						configurable: true,
						get: () => ({
							getItem: err,
							setItem: err,
							removeItem: err,
							clear: err,
							key: err,
							length: 0
						})
					});
				});
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Color areas', 6);
				await expect(getKnobSlider(page, 'Color areas')).toHaveAttribute('aria-valuenow', '6');
				await assertCleanRuntime(tracker);
			}
		);
	});
});
