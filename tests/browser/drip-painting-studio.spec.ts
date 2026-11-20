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

const ROUTE_PATH = '/tools/drip-painting-studio';
const INTRO_SENTENCE =
	'Hold the path steady. Change the flow, passes, sweep, and layers—and watch single gestures tangle into an opaque web.';
const ESSAY_TITLE =
	'Abstract Expressionist Drip Painting: Corruption in India — Gesture, Chance, and Control';
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const STUDY_NAMES = [
	'Pending File',
	'Public Works & Tenders',
	'Counter & Middleman',
	'Whitewash & Record'
] as const;

const PRESET_NAMES = ['Single Trail', 'Thin Flow', 'Tangled Ledger', 'Heavy Whitewash'] as const;

interface RuntimeTracker {
	pageErrors: string[];
	consoleErrors: string[];
	failedRequests: string[];
}

interface PixelStats {
	width: number;
	height: number;
	opaqueAll: boolean;
	meanLuma: number;
	darkCarbonRatio: number;
	paleWhitewashRatio: number;
	midPigmentRatio: number;
	pureWhiteGlareRatio: number;
	groundVariance: number;
	perimeterPigmentRatio: number;
	distinctSampleColors: number;
	transparentEdgePixels: number;
}

interface ContrastMetric {
	label: string;
	contrastOverDark: number;
	contrastOverLight: number;
	minRequiredRatio: number;
	opacity: number;
	isLargeText: boolean;
}

interface DecodedPngStats {
	width: number;
	height: number;
	opaqueAll: boolean;
	distinctSampleColors: number;
	darkCarbonRatio: number;
	midPigmentRatio: number;
}

interface CanvasRgbaSnapshot {
	width: number;
	height: number;
	data: Uint8Array;
}

interface InspectUrlParams {
	vm: string | null;
	iz: string | null;
	ix: string | null;
	iy: string | null;
}

function trackRuntime(page: Page): RuntimeTracker {
	const tracker: RuntimeTracker = {
		pageErrors: [],
		consoleErrors: [],
		failedRequests: []
	};
	page.on('pageerror', (err) => tracker.pageErrors.push(err.message));
	page.on('console', (msg) => {
		if (msg.type() === 'error') {
			tracker.consoleErrors.push(msg.text());
		}
	});
	page.on('requestfailed', (req) => {
		const url = req.url();
		if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
			tracker.failedRequests.push(
				`${req.method()} ${url}: ${req.failure()?.errorText ?? 'failed'}`
			);
		}
	});
	return tracker;
}

async function withContext<T>(
	browser: Browser,
	options: BrowserContextOptions,
	fn: (context: BrowserContext, page: Page, tracker: RuntimeTracker) => Promise<T>
): Promise<T> {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		reducedMotion: 'reduce',
		acceptDownloads: true,
		...options,
		serviceWorkers: 'block'
	});
	const page = await context.newPage();
	const tracker = trackRuntime(page);
	try {
		return await fn(context, page, tracker);
	} finally {
		await context.close();
	}
}

function getCanvas(page: Page): Locator {
	return page.getByTestId('drip-canvas');
}

async function sha256CanvasPixels(page: Page): Promise<string> {
	const dataUrl = await page.evaluate(() => {
		const canvas = document.querySelector('[data-testid="drip-canvas"]');
		if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
			return '';
		}
		return canvas.toDataURL('image/png');
	});
	expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
	const payload = dataUrl.slice('data:image/png;base64,'.length);
	return createHash('sha256').update(Buffer.from(payload, 'base64')).digest('hex');
}

async function captureCanvasRgba(canvas: Locator): Promise<CanvasRgbaSnapshot> {
	const raw = await canvas.evaluate((el) => {
		if (!(el instanceof HTMLCanvasElement) || el.width === 0 || el.height === 0) {
			throw new Error('Missing or zero-sized drip-canvas');
		}
		const ctx = el.getContext('2d');
		if (!ctx) {
			throw new Error('Missing 2D canvas context');
		}
		const img = ctx.getImageData(0, 0, el.width, el.height);
		const bytes = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
		const chunks: string[] = [];
		const chunkSize = 0x8000;
		for (let i = 0; i < bytes.length; i += chunkSize) {
			chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
		}
		return {
			width: el.width,
			height: el.height,
			base64: btoa(chunks.join(''))
		};
	});
	return {
		width: raw.width,
		height: raw.height,
		data: Uint8Array.from(Buffer.from(raw.base64, 'base64'))
	};
}

function assertCanvasRgbaNearEqual(
	a: CanvasRgbaSnapshot,
	b: CanvasRgbaSnapshot,
	options: { maxChannelDiff: number; maxDiffByteRatio: number } = {
		maxChannelDiff: 2,
		maxDiffByteRatio: 0.001
	}
): void {
	expect(a.width).toBe(b.width);
	expect(a.height).toBe(b.height);
	expect(a.data.length).toBe(b.data.length);
	expect(a.data.length).toBeGreaterThan(0);

	let maxObservedDiff = 0;
	let diffBytes = 0;
	for (let i = 0; i < a.data.length; i += 1) {
		const diff = Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0));
		if (diff > 0) {
			diffBytes += 1;
			if (diff > maxObservedDiff) {
				maxObservedDiff = diff;
			}
		}
	}
	const diffRatio = diffBytes / a.data.length;
	expect(maxObservedDiff).toBeLessThanOrEqual(options.maxChannelDiff);
	expect(diffRatio).toBeLessThanOrEqual(options.maxDiffByteRatio);
}

function readInspectUrlParams(page: Page): InspectUrlParams {
	const params = new URL(page.url()).searchParams;
	return {
		vm: params.get('vm'),
		iz: params.get('iz'),
		ix: params.get('ix'),
		iy: params.get('iy')
	};
}

const STUDIO_QUERY_KEYS = [
	'v',
	'st',
	's',
	'p',
	'pf',
	'sw',
	'pl',
	'pt',
	't',
	'aw',
	'ah',
	'vm',
	'iz',
	'ix',
	'iy'
] as const;

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
	const params = new URL(href, 'http://127.0.0.1:4330').searchParams;
	return Object.fromEntries(STUDIO_QUERY_KEYS.map((key) => [key, params.get(key)])) as Record<
		(typeof STUDIO_QUERY_KEYS)[number],
		string | null
	>;
}

async function analyzeCanvasPixels(page: Page): Promise<PixelStats> {
	return await page.evaluate(() => {
		const canvas = document.querySelector('[data-testid="drip-canvas"]');
		if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
			throw new Error('Missing or zero-sized drip-canvas');
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Missing 2D canvas context');
		}
		const { width, height } = canvas;
		const data = ctx.getImageData(0, 0, width, height).data;

		let opaqueAll = true;
		let lumaSum = 0;
		let darkCarbon = 0;
		let paleWhitewash = 0;
		let midPigment = 0;
		let pureWhiteGlare = 0;
		let perimeterTotal = 0;
		let perimeterDarkOrRich = 0;
		let transparentEdgePixels = 0;
		let groundLumaSum = 0;
		let groundLumaSqSum = 0;
		let groundCount = 0;
		const quantizedColors = new Set<number>();

		const step = 2;
		let totalSamples = 0;
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

				if (luma < 65) darkCarbon += 1;
				if (luma >= 210 && luma <= 245 && Math.abs(r - b) < 28) paleWhitewash += 1;
				if (luma >= 65 && luma < 175 && Math.max(r, g, b) - Math.min(r, g, b) >= 18) {
					midPigment += 1;
				}
				if (r >= 252 && g >= 252 && b >= 252) pureWhiteGlare += 1;

				if (luma >= 185 && luma <= 238 && r >= g && g >= b - 4) {
					groundLumaSum += luma;
					groundLumaSqSum += luma * luma;
					groundCount += 1;
				}

				const inPerimeter =
					x < width * 0.14 || x > width * 0.86 || y < height * 0.14 || y > height * 0.86;
				if (inPerimeter) {
					perimeterTotal += 1;
					const groundDelta = Math.abs(r - 228) + Math.abs(g - 219) + Math.abs(b - 202);
					if (luma < 175 || groundDelta > 45) {
						perimeterDarkOrRich += 1;
					}
				}

				const q = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
				quantizedColors.add(q);
			}
		}

		const groundMean = groundCount > 0 ? groundLumaSum / groundCount : 0;
		const groundVariance =
			groundCount > 1 ? Math.max(0, groundLumaSqSum / groundCount - groundMean * groundMean) : 0;

		return {
			width,
			height,
			opaqueAll,
			meanLuma: totalSamples > 0 ? lumaSum / totalSamples : 0,
			darkCarbonRatio: totalSamples > 0 ? darkCarbon / totalSamples : 0,
			paleWhitewashRatio: totalSamples > 0 ? paleWhitewash / totalSamples : 0,
			midPigmentRatio: totalSamples > 0 ? midPigment / totalSamples : 0,
			pureWhiteGlareRatio: totalSamples > 0 ? pureWhiteGlare / totalSamples : 0,
			groundVariance,
			perimeterPigmentRatio: perimeterTotal > 0 ? perimeterDarkOrRich / perimeterTotal : 0,
			distinctSampleColors: quantizedColors.size,
			transparentEdgePixels
		};
	});
}

async function decodedPngSha256(page: Page, pngBytes: Buffer): Promise<string> {
	const base64Canvas = await page.evaluate(async (encoded) => {
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
		return offscreen.toDataURL('image/png').split(',')[1] ?? '';
	}, pngBytes.toString('base64'));
	return createHash('sha256').update(Buffer.from(base64Canvas, 'base64')).digest('hex');
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
		let darkCarbon = 0;
		let midPigment = 0;
		for (let y = 0; y < height; y += step) {
			for (let x = 0; x < width; x += step) {
				const idx = (y * width + x) * 4;
				const r = data[idx] ?? 0;
				const g = data[idx + 1] ?? 0;
				const b = data[idx + 2] ?? 0;
				totalSamples += 1;
				const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
				if (luma < 65) darkCarbon += 1;
				if (luma >= 65 && luma < 175 && Math.max(r, g, b) - Math.min(r, g, b) >= 18) {
					midPigment += 1;
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
			darkCarbonRatio: totalSamples > 0 ? darkCarbon / totalSamples : 0,
			midPigmentRatio: totalSamples > 0 ? midPigment / totalSamples : 0
		};
	}, pngBytes.toString('base64'));
}

function verifyPngHeaders(
	pngBytes: Buffer,
	expectedLongSide: number
): { width: number; height: number } {
	expect(pngBytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
	const width = pngBytes.readUInt32BE(16);
	const height = pngBytes.readUInt32BE(20);
	expect(Math.max(width, height)).toBe(expectedLongSide);
	expect(Math.min(width, height)).toBeGreaterThan(Math.floor(expectedLongSide * 0.5));
	return { width, height };
}

async function getCanvasAspectInfo(page: Page): Promise<{
	cssRatio: number;
	backingRatio: number;
	objectFit: string;
	isUniform: boolean;
}> {
	const box = await getCanvas(page).boundingBox();
	expect(box).not.toBeNull();
	const backing = await page.evaluate(() => {
		const canvas = document.querySelector('[data-testid="drip-canvas"]');
		if (!(canvas instanceof HTMLCanvasElement)) return { w: 0, h: 0, objectFit: '' };
		return {
			w: canvas.width,
			h: canvas.height,
			objectFit: getComputedStyle(canvas).objectFit
		};
	});
	expect(backing.w).toBeGreaterThan(0);
	expect(backing.h).toBeGreaterThan(0);
	const cssRatio = box!.width / box!.height;
	const backingRatio = backing.w / backing.h;
	const isUniform =
		backing.objectFit === 'cover' ||
		backing.objectFit === 'contain' ||
		Math.abs(cssRatio - backingRatio) < 0.05;
	return {
		cssRatio,
		backingRatio,
		objectFit: backing.objectFit,
		isUniform
	};
}

async function assertUniformCanvasAspect(page: Page): Promise<void> {
	await expect.poll(async () => (await getCanvasAspectInfo(page)).isUniform).toBe(true);
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
	const seedLocator = page.getByRole('button', { name: /^Apply$/i });
	if ((await seedLocator.count()) > 0 && (await seedLocator.first().isVisible())) {
		return;
	}
	const moreSummary = page.getByText('More options', { exact: false }).first();
	await moreSummary.scrollIntoViewIfNeeded();
	await moreSummary.click();
	await expect(page.getByRole('button', { name: /Reset settings/i })).toBeVisible();
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
			const key = current < targetValue ? 'ArrowRight' : 'ArrowLeft';
			await slider.press(key);
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
	const directBox = await slider.boundingBox();
	if (directBox && directBox.width >= 16 && directBox.height >= 16) {
		return directBox;
	}
	const fallbackBox = await slider.evaluate((el, knobLabel) => {
		const isVisibleBox = (r: DOMRect) => r.width >= 20 && r.height >= 20;
		let container: Element | null = el.parentElement;
		const re = new RegExp(knobLabel, 'i');
		while (container && container.parentElement && !re.test(container.textContent ?? '')) {
			container = container.parentElement;
		}
		const scope = container ?? el.parentElement ?? el;
		const candidates = [
			...Array.from(scope.querySelectorAll('[title*="drag" i], svg, [role="slider"]')),
			scope
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
	expect(fallbackBox).not.toBeNull();
	return fallbackBox!;
}

async function selectStudy(page: Page, studyName: string): Promise<void> {
	await openMoreOptions(page);
	const studyCombobox = page.getByRole('combobox', { name: /Study/i });
	if ((await studyCombobox.count()) > 0 && (await studyCombobox.first().isVisible())) {
		await studyCombobox.first().selectOption({ label: studyName });
		return;
	}
	const studyRadio = page.getByRole('radio', { name: studyName, exact: true });
	if ((await studyRadio.count()) > 0 && (await studyRadio.first().isVisible())) {
		await studyRadio.first().click();
		return;
	}
	const studyBtn = page.getByRole('button', { name: new RegExp(`^${studyName}$`, 'i') });
	await studyBtn.first().scrollIntoViewIfNeeded();
	await studyBtn.first().click();
}

async function getSeedInput(page: Page): Promise<Locator> {
	await openMoreOptions(page);
	return page.getByLabel(/Painting seed|^Seed$/i).first();
}

async function readVisibleSeed(page: Page): Promise<string> {
	const params = new URL(page.url()).searchParams;
	const urlSeed = params.get('s') ?? params.get('seed');
	if (urlSeed) return urlSeed;
	const controlsBtn = page.getByRole('button', { name: 'Controls', exact: true });
	const wasExpanded = (await controlsBtn.getAttribute('aria-expanded')) === 'true';
	const applyBtn = page.getByRole('button', { name: /^Apply$/i });
	const wasMoreOpen = (await applyBtn.count()) > 0 && (await applyBtn.first().isVisible());

	const seedInput = await getSeedInput(page);
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
	const seedInput = await getSeedInput(page);
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
	const finishBtn = page.getByRole('button', { name: 'Finish now' });
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

		const darkCarbon: [number, number, number] = [0x1c, 0x1b, 0x1a];
		const paleWhitewash: [number, number, number] = [0xe6, 0xdf, 0xd1];
		const candidates = Array.from(
			document.querySelectorAll(
				'button, label, summary, a, p, span, h2, h3, input, select, dt, dd, [role="status"], [role="alert"]'
			)
		).filter((el) => {
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
				const hasDirectText = Array.from(el.childNodes).some(
					(n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0
				);
				return hasDirectText;
			}
			return text.length > 0;
		});

		const results: ContrastMetric[] = [];
		for (const el of candidates) {
			const style = getComputedStyle(el);
			const fg = parseRgba(style.color);
			const chain = buildChain(el);
			const bgDark = renderStack(chain, 0, darkCarbon, null);
			const bgLight = renderStack(chain, 0, paleWhitewash, null);
			const fgDark = renderStack(chain, 0, darkCarbon, fg);
			const fgLight = renderStack(chain, 0, paleWhitewash, fg);

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
				minRequiredRatio,
				opacity: effectiveOpacity(el),
				isLargeText
			});
		}
		return results;
	});
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
					// sr-only range input paired with visible interactive drag target inside a single-slider knob container
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

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
	const overflow = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		innerWidth: window.innerWidth
	}));
	expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

async function assertCleanRuntime(tracker: RuntimeTracker): Promise<void> {
	expect(tracker.pageErrors).toEqual([]);
	expect(tracker.consoleErrors).toEqual([]);
	expect(tracker.failedRequests).toEqual([]);
}

test.describe('Tier 1 — Feature Coverage (FA1–FA8)', () => {
	test('FA1 — Initial experience, playback, reduced motion & non-figurative palette', async ({
		browser
	}) => {
		await test.step('T1-FA1-01: Direct canvas-first load with intro sentence & visible primary toolbar', async () => {
			await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					const canvas = getCanvas(page);
					await expect(canvas).toBeVisible();
					await expect(page.getByRole('dialog')).toHaveCount(0);
					await expect(page.getByText(INTRO_SENTENCE)).toBeVisible();

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

		await test.step('T1-FA1-02: Curated default composition, frame-1 strokes & identical initial seed across clean contexts', async () => {
			const frame1Stats = await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
				async (_ctx, page) => {
					await page.goto(ROUTE_PATH);
					await expect(getCanvas(page)).toBeVisible();
					return await analyzeCanvasPixels(page);
				}
			);
			expect(frame1Stats.distinctSampleColors).toBeGreaterThan(3);
			expect(frame1Stats.darkCarbonRatio > 0 || frame1Stats.midPigmentRatio > 0).toBe(true);

			const firstRun = await withContext(
				browser,
				{ reducedMotion: 'reduce' },
				async (_ctx, page) => {
					await page.goto(ROUTE_PATH);
					await expect(getCanvas(page)).toBeVisible();
					await ensureControlsExpanded(page);
					await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '18');
					await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '45');
					await expect(getKnobSlider(page, 'Sweep width')).toHaveAttribute('aria-valuenow', '68');
					await expect(getKnobSlider(page, 'Paint layers')).toHaveAttribute('aria-valuenow', '4');
					const seed = await readVisibleSeed(page);
					const summary = await readAccessibleSummary(page);
					const hash = await sha256CanvasPixels(page);
					return { seed, summary, hash };
				}
			);

			const secondRun = await withContext(
				browser,
				{ reducedMotion: 'reduce' },
				async (_ctx, page) => {
					await page.goto(ROUTE_PATH);
					await expect(getCanvas(page)).toBeVisible();
					const seed = await readVisibleSeed(page);
					const hash = await sha256CanvasPixels(page);
					return { seed, hash };
				}
			);

			expect(firstRun.seed).toBeTruthy();
			expect(firstRun.seed).toBe(secondRun.seed);
			expect(firstRun.hash).toBe(secondRun.hash);
			expect(firstRun.summary.toLowerCase()).toContain('pending file');
		});

		await test.step('T1-FA1-03: Pause freezes pixels and Resume advances playback', async () => {
			await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
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
					await page.waitForTimeout(320);
					const resumedHash = await sha256CanvasPixels(page);
					expect(resumedHash).not.toBe(pausedA);
					await finishIfPlaying(page);
					await assertCleanRuntime(tracker);
				}
			);
		});

		await test.step('T1-FA1-04: Finish now completes painting immediately and stays still', async () => {
			await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await page.getByRole('button', { name: 'Finish now', exact: true }).click();
					await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
					await expect(page.getByRole('button', { name: 'Finish now', exact: true })).toHaveCount(
						0
					);

					const settledA = await sha256CanvasPixels(page);
					await page.waitForTimeout(320);
					const settledB = await sha256CanvasPixels(page);
					expect(settledB).toBe(settledA);
					await assertCleanRuntime(tracker);
				}
			);
		});

		await test.step('T1-FA1-05: Natural playback completion at 4s matches reduced-motion direct still render', async () => {
			const playbackResult = await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
				async (_ctx, page) => {
					await page.goto(ROUTE_PATH);
					await finishIfPlaying(page);
					await openMoreOptions(page);
					await setSliderValue(page, 'Painting time', 4);
					await ensureControlsCollapsed(page);
					await page.getByRole('button', { name: 'Replay', exact: true }).click();
					await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
					await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0, {
						timeout: 12_000
					});
					return {
						url: page.url(),
						hash: await sha256CanvasPixels(page)
					};
				}
			);

			const stillHash = await withContext(
				browser,
				{ reducedMotion: 'reduce' },
				async (_ctx, page) => {
					await page.goto(playbackResult.url);
					await expect(getCanvas(page)).toBeVisible();
					return await sha256CanvasPixels(page);
				}
			);

			expect(playbackResult.hash).toBe(stillHash);
		});

		await test.step('T1-FA1-06: prefers-reduced-motion loads & New painting still, while Replay animates', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
				await expect(page.getByRole('button', { name: 'Finish now', exact: true })).toHaveCount(0);

				const initialSeed = await readVisibleSeed(page);
				await page.getByRole('button', { name: 'New painting', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
				expect(await readVisibleSeed(page)).not.toBe(initialSeed);

				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await finishIfPlaying(page);
				await assertCleanRuntime(tracker);
			});
		});

		await test.step('T1-FA1-07: New painting changes seed & pixels while preserving study and knobs', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Passes', 25);
				await setSliderValue(page, 'Paint flow', 60);
				const seedBefore = await readVisibleSeed(page);
				const hashBefore = await sha256CanvasPixels(page);

				await page.getByRole('button', { name: 'New painting', exact: true }).click();
				const seedAfter = await readVisibleSeed(page);
				const hashAfter = await sha256CanvasPixels(page);
				expect(seedAfter).not.toBe(seedBefore);
				expect(hashAfter).not.toBe(hashBefore);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '25');
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '60');
				await assertCleanRuntime(tracker);
			});
		});

		await test.step('T1-FA1-08: Non-figurative R2 palette, opaque woven ground & zero pure-white glare', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page) => {
				await page.goto(ROUTE_PATH);
				await expect(getCanvas(page)).toBeVisible();
				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				expect(stats.groundVariance).toBeGreaterThan(1.5);
				expect(stats.darkCarbonRatio).toBeGreaterThan(0.01);
				expect(stats.midPigmentRatio).toBeGreaterThan(0.01);
				expect(stats.pureWhiteGlareRatio).toBeLessThan(0.005);
			});
		});
	});

	test('FA2 — Primary knobs & collapsible controls tray', async ({ browser }) => {
		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await expect(getCanvas(page)).toBeVisible();

			await test.step('T1-FA2-01: Desktop Controls tray toggle & 4 primary knobs visibility', async () => {
				const controlsBtn = page.getByRole('button', { name: 'Controls', exact: true });
				const initialExpanded = await controlsBtn.getAttribute('aria-expanded');
				if (initialExpanded === 'true') {
					await controlsBtn.click();
					await expect(controlsBtn).toHaveAttribute('aria-expanded', 'false');
					await controlsBtn.click();
				} else {
					await controlsBtn.click();
					await expect(controlsBtn).toHaveAttribute('aria-expanded', 'true');
					await controlsBtn.click();
					await expect(controlsBtn).toHaveAttribute('aria-expanded', 'false');
					await controlsBtn.click();
				}
				await expect(controlsBtn).toHaveAttribute('aria-expanded', 'true');
				for (const knob of ['Passes', 'Paint flow', 'Sweep width', 'Paint layers']) {
					await expect(getKnobSlider(page, knob)).toBeVisible();
				}
				const canvasBox = await getCanvas(page).boundingBox();
				expect(canvasBox).not.toBeNull();
				expect(canvasBox!.height).toBeGreaterThanOrEqual(450);
			});

			await test.step('T1-FA2-03: Accessible range semantics & readable units on all 4 primary knobs', async () => {
				const expectations: Array<{ name: string; min: string; max: string; unitRe: RegExp }> = [
					{ name: 'Passes', min: '4', max: '40', unitRe: /pass/i },
					{ name: 'Paint flow', min: '10', max: '100', unitRe: /%|thin|heavy|flow/i },
					{ name: 'Sweep width', min: '20', max: '100', unitRe: /%|tight|wide/i },
					{ name: 'Paint layers', min: '2', max: '6', unitRe: /layer/i }
				];
				for (const item of expectations) {
					const slider = getKnobSlider(page, item.name);
					await expect(slider).toHaveAttribute('aria-valuemin', item.min);
					await expect(slider).toHaveAttribute('aria-valuemax', item.max);
					const valueNow = await slider.getAttribute('aria-valuenow');
					const valueText = (await slider.getAttribute('aria-valuetext')) ?? '';
					expect(valueNow).toBeTruthy();
					expect(valueText).toMatch(item.unitRe);
				}
			});

			await test.step('T1-FA2-04: Passes prefix invariance (18 -> 30 -> 18 restores exact pixels)', async () => {
				const hash18 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Passes', 30);
				const hash30 = await sha256CanvasPixels(page);
				expect(hash30).not.toBe(hash18);
				await setSliderValue(page, 'Passes', 18);
				expect(await sha256CanvasPixels(page)).toBe(hash18);
			});

			await test.step('T1-FA2-05: Paint flow Thin (20%) vs Heavy (80%) density & restoration', async () => {
				await setSliderValue(page, 'Paint flow', 20);
				const hash20 = await sha256CanvasPixels(page);
				const stats20 = await analyzeCanvasPixels(page);

				await setSliderValue(page, 'Paint flow', 80);
				const hash80 = await sha256CanvasPixels(page);
				const stats80 = await analyzeCanvasPixels(page);

				expect(hash80).not.toBe(hash20);
				expect(stats80.meanLuma).toBeLessThan(stats20.meanLuma);
				expect(stats80.darkCarbonRatio).toBeGreaterThan(stats20.darkCarbonRatio);

				await setSliderValue(page, 'Paint flow', 20);
				expect(await sha256CanvasPixels(page)).toBe(hash20);
				await setSliderValue(page, 'Paint flow', 45);
			});

			await test.step('T1-FA2-06: Sweep width (20% vs 100%) expands perimeter coverage while preserving seed', async () => {
				const seedBefore = await readVisibleSeed(page);
				await setSliderValue(page, 'Sweep width', 20);
				const stats20 = await analyzeCanvasPixels(page);
				await setSliderValue(page, 'Sweep width', 100);
				const stats100 = await analyzeCanvasPixels(page);
				expect(stats100.perimeterPigmentRatio).toBeGreaterThan(stats20.perimeterPigmentRatio);
				expect(await readVisibleSeed(page)).toBe(seedBefore);
				await setSliderValue(page, 'Sweep width', 68);
			});

			await test.step('T1-FA2-07: Paint layers (2 -> 6 -> 2) adds upper strata and restores 2-layer pixels', async () => {
				await setSliderValue(page, 'Paint layers', 2);
				const hash2 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Paint layers', 6);
				const hash6 = await sha256CanvasPixels(page);
				expect(hash6).not.toBe(hash2);
				await setSliderValue(page, 'Paint layers', 2);
				expect(await sha256CanvasPixels(page)).toBe(hash2);
			});

			await assertCleanRuntime(tracker);
		});

		await test.step('T1-FA2-02: Mobile bottom sheet (390x844) leaves meaningful canvas visible above', async () => {
			await withContext(
				browser,
				{
					viewport: { width: 390, height: 844 },
					reducedMotion: 'reduce',
					hasTouch: true,
					isMobile: true
				},
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await ensureControlsExpanded(page);
					const sliderBox = await getKnobSlider(page, 'Passes').boundingBox();
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

					await ensureControlsCollapsed(page);
					await assertCleanRuntime(tracker);
				}
			);
		});
	});

	test('FA3 — Secondary controls, Studies, Presets, Seed, Undo & Reset', async ({ browser }) => {
		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await openMoreOptions(page);

			await test.step('T1-FA3-01: More options exposes Study, Paint texture, Painting time, Presets, Seed, Undo, Reset, Privacy', async () => {
				for (const preset of PRESET_NAMES) {
					await expect(page.getByRole('button', { name: preset, exact: true })).toBeVisible();
				}
				await expect(getKnobSlider(page, 'Paint texture')).toBeVisible();
				await expect(getKnobSlider(page, 'Painting time')).toBeVisible();
				await expect(page.getByRole('button', { name: /^Apply$/i })).toBeVisible();
				await expect(page.getByRole('button', { name: /^Undo/i })).toBeVisible();
				await expect(page.getByRole('button', { name: /Reset settings/i })).toBeVisible();
				await expect(page.getByRole('button', { name: /Privacy & cookies/i })).toBeVisible();
			});

			await test.step('T1-FA3-02: All 4 Studies switch to curated seeds with distinct hashes & summaries while preserving primary knobs', async () => {
				await setSliderValue(page, 'Passes', 22);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '22');

				const hashes: string[] = [];
				const descriptions: string[] = [];
				const seedsByStudy = new Map<string, string>();

				for (const study of STUDY_NAMES) {
					await selectStudy(page, study);
					await finishIfPlaying(page);
					const seed = await readVisibleSeed(page);
					expect(seed).toMatch(/^[1-9]\d*$/);
					seedsByStudy.set(study, seed);
					await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '22');
					const summary = await readAccessibleSummary(page);
					expect(summary.toLowerCase()).toContain(study.toLowerCase());
					descriptions.push(summary);
					hashes.push(await sha256CanvasPixels(page));
				}

				expect(new Set(hashes).size).toBe(4);
				expect(new Set(descriptions).size).toBe(4);

				await selectStudy(page, 'Pending File');
				await finishIfPlaying(page);
				expect(await readVisibleSeed(page)).toBe(seedsByStudy.get('Pending File'));
				expect(await sha256CanvasPixels(page)).toBe(hashes[0]);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '22');
				await setSliderValue(page, 'Passes', 18);
			});

			await test.step('T1-FA3-03: Paint texture (0% vs 50% vs 100%) alters surface micro-relief & restores', async () => {
				await setSliderValue(page, 'Paint texture', 50);
				const hash50 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Paint texture', 0);
				const hash0 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Paint texture', 100);
				const hash100 = await sha256CanvasPixels(page);
				expect(new Set([hash0, hash50, hash100]).size).toBe(3);
				await setSliderValue(page, 'Paint texture', 50);
				expect(await sha256CanvasPixels(page)).toBe(hash50);
			});

			await test.step('T1-FA3-04: Painting time (4s vs 12s) preserves final pixels upon replay completion', async () => {
				await setSliderValue(page, 'Painting time', 4);
				await expect(getKnobSlider(page, 'Painting time')).toHaveAttribute('aria-valuenow', '4');
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await finishIfPlaying(page);
				const hash4 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Painting time', 12);
				await expect(getKnobSlider(page, 'Painting time')).toHaveAttribute('aria-valuenow', '12');
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await finishIfPlaying(page);
				expect(await sha256CanvasPixels(page)).toBe(hash4);
			});

			await test.step('T1-FA3-05: All 4 Presets update knobs and strictly preserve current seed', async () => {
				const seedBefore = await readVisibleSeed(page);
				const presetHashes = new Set<string>();
				for (const preset of PRESET_NAMES) {
					await page.getByRole('button', { name: preset, exact: true }).click();
					expect(await readVisibleSeed(page)).toBe(seedBefore);
					presetHashes.add(await sha256CanvasPixels(page));
				}
				expect(presetHashes.size).toBe(4);
			});

			await test.step('T1-FA3-06: Custom Seed input + Apply deterministically reproduces composition', async () => {
				await applyCustomSeed(page, '512094');
				expect(await readVisibleSeed(page)).toBe('512094');
				const hashA = await sha256CanvasPixels(page);
				await applyCustomSeed(page, '777888');
				expect(await sha256CanvasPixels(page)).not.toBe(hashA);
				await applyCustomSeed(page, '512094');
				expect(await sha256CanvasPixels(page)).toBe(hashA);
			});

			await test.step('T1-FA3-07: Undo reverts committed edits cleanly', async () => {
				const undoBtn = page.getByRole('button', { name: /^Undo/i });
				const beforeHash = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Paint flow', 77);
				expect(await sha256CanvasPixels(page)).not.toBe(beforeHash);
				await undoBtn.click();
				expect(await sha256CanvasPixels(page)).toBe(beforeHash);
			});

			await test.step('T1-FA3-08: Reset settings restores defaults & Privacy & cookies opens cleanly', async () => {
				await page.getByRole('button', { name: /Reset settings/i }).click();
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '18');
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '45');
				await expect(getKnobSlider(page, 'Sweep width')).toHaveAttribute('aria-valuenow', '68');
				await expect(getKnobSlider(page, 'Paint layers')).toHaveAttribute('aria-valuenow', '4');
				await expect(getKnobSlider(page, 'Paint texture')).toHaveAttribute('aria-valuenow', '50');
				await expect(getKnobSlider(page, 'Painting time')).toHaveAttribute('aria-valuenow', '10');

				const hashBeforePrivacy = await sha256CanvasPixels(page);
				await page.getByRole('button', { name: /Privacy & cookies/i }).click();
				const privacyDialog = page.getByRole('dialog');
				await expect(privacyDialog).toBeVisible();
				await expect(privacyDialog).toContainText(/Your visit|choices|essentials|media|Vercel/i);
				await page.keyboard.press('Escape');
				await expect(privacyDialog).toBeHidden();
				await expect(page.getByRole('button', { name: 'Controls', exact: true })).toHaveAttribute(
					'aria-expanded',
					'true'
				);
				expect(await sha256CanvasPixels(page)).toBe(hashBeforePrivacy);
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('FA4 — Inspect surface zoom, pan, recenter & Whole painting', async ({ browser }) => {
		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await ensureControlsExpanded(page);
			const seedBefore = await readVisibleSeed(page);
			const wholeHash = await sha256CanvasPixels(page);

			let inspectCenterHash = '';
			let inspectCenterRgba!: CanvasRgbaSnapshot;
			let inspectCenterParams!: InspectUrlParams;
			await test.step('T1-FA4-01: One-click Inspect surface zooms without altering seed or knobs', async () => {
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await expect(
					page.getByRole('button', { name: 'Whole painting', exact: true })
				).toBeVisible();
				inspectCenterHash = await sha256CanvasPixels(page);
				inspectCenterRgba = await captureCanvasRgba(getCanvas(page));
				inspectCenterParams = readInspectUrlParams(page);
				expect(inspectCenterParams.vm).toBe('inspect');
				expect(inspectCenterParams.iz).toBeTruthy();
				expect(inspectCenterHash).not.toBe(wholeHash);
				expect(await readVisibleSeed(page)).toBe(seedBefore);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '18');
			});

			let pannedHash = '';
			await test.step('T1-FA4-02: Panning via controls/keyboard shifts magnified crop', async () => {
				await panInspect(page, 'right');
				pannedHash = await sha256CanvasPixels(page);
				expect(pannedHash).not.toBe(inspectCenterHash);
				await expect(
					page.getByRole('button', { name: 'Whole painting', exact: true })
				).toBeVisible();
			});

			await test.step('T1-FA4-03: Panning via pointer drag on canvas shifts crop cleanly', async () => {
				await ensureControlsCollapsed(page);
				const box = await getCanvas(page).boundingBox();
				expect(box).not.toBeNull();
				const cx = box!.x + box!.width * 0.5;
				const cy = box!.y + box!.height * 0.5;
				await page.mouse.move(cx, cy);
				await page.mouse.down();
				await page.mouse.move(cx - 120, cy - 80, { steps: 6 });
				await page.mouse.up();
				const draggedHash = await sha256CanvasPixels(page);
				expect(draggedHash).not.toBe(pannedHash);
			});

			await test.step('T1-FA4-04: Recenter restores initial centered Inspect surface view', async () => {
				const recenterBtn = page
					.getByRole('button', { name: /recenter|reset view|center/i })
					.first();
				await expect(recenterBtn).toBeVisible();
				await recenterBtn.click();
				expect(readInspectUrlParams(page)).toEqual(inspectCenterParams);
				assertCanvasRgbaNearEqual(await captureCanvasRgba(getCanvas(page)), inspectCenterRgba, {
					maxChannelDiff: 2,
					maxDiffByteRatio: 0.001
				});
			});

			await test.step('T1-FA4-05: Whole painting exits inspect and restores pre-inspect canvas pixels', async () => {
				await page.getByRole('button', { name: 'Whole painting', exact: true }).click();
				await expect(
					page.getByRole('button', { name: 'Inspect surface', exact: true })
				).toBeVisible();
				expect(await sha256CanvasPixels(page)).toBe(wholeHash);
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('FA5 — Viewport resize, aspect invariance, Fullscreen, idle dimming & WCAG contrast', async ({
		browser
	}) => {
		await test.step('T1-FA5-01: Wide desktop (1440x900) & tablet (820x1180) layouts fill viewport without overflow', async () => {
			for (const vp of [
				{ width: 1440, height: 900 },
				{ width: 820, height: 1180 }
			]) {
				await withContext(
					browser,
					{
						viewport: { width: vp.width, height: vp.height },
						reducedMotion: 'reduce'
					},
					async (_ctx, page, tracker) => {
						await page.goto(ROUTE_PATH);
						await expect(getCanvas(page)).toBeVisible();
						await assertNoHorizontalOverflow(page);
						await expect(page.getByRole('button', { name: 'Controls', exact: true })).toBeVisible();
						await assertCleanRuntime(tracker);
					}
				);
			}
		});

		await test.step('T1-FA5-02: Portrait mobile (390x844) & short landscape (844x390) layouts stay overflow-free', async () => {
			for (const vp of [
				{ width: 390, height: 844 },
				{ width: 844, height: 390 }
			]) {
				await withContext(
					browser,
					{
						viewport: { width: vp.width, height: vp.height },
						hasTouch: true,
						isMobile: true,
						reducedMotion: 'reduce'
					},
					async (_ctx, page, tracker) => {
						await page.goto(ROUTE_PATH);
						await expect(getCanvas(page)).toBeVisible();
						await assertNoHorizontalOverflow(page);
						await expect(page.getByRole('button', { name: 'Controls', exact: true })).toBeVisible();
						await assertCleanRuntime(tracker);
					}
				);
			}
		});

		await test.step('T1-FA5-03: Resize preserves seed & uniform aspect ratio (no oval droplet stretching)', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page) => {
				await page.goto(ROUTE_PATH);
				const seedStart = await readVisibleSeed(page);
				const hashStart = await sha256CanvasPixels(page);
				await assertUniformCanvasAspect(page);

				await page.setViewportSize({ width: 900, height: 700 });
				await assertUniformCanvasAspect(page);
				expect(await readVisibleSeed(page)).toBe(seedStart);

				await page.setViewportSize({ width: 1440, height: 900 });
				await assertUniformCanvasAspect(page);
				await expect.poll(async () => await sha256CanvasPixels(page)).toBe(hashStart);
			});
		});

		await test.step('T1-FA5-04: Fullscreen click-only transition and Escape / Exit fullscreen recovery', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.addInitScript(() => {
					let fsEl: Element | null = null;
					const setFsEl = (el: Element | null): void => {
						fsEl = el;
					};
					(window as unknown as { __fsRequestCount: number }).__fsRequestCount = 0;
					Object.defineProperty(document, 'fullscreenEnabled', {
						configurable: true,
						get: () => true
					});
					Object.defineProperty(document, 'fullscreenElement', {
						configurable: true,
						get: () => fsEl
					});
					HTMLElement.prototype.requestFullscreen = function (this: HTMLElement) {
						(window as unknown as { __fsRequestCount: number }).__fsRequestCount += 1;
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
				await expect(fsBtn).toBeVisible();
				expect(
					await page.evaluate(
						() => (window as unknown as { __fsRequestCount: number }).__fsRequestCount
					)
				).toBe(0);

				await fsBtn.click();
				const exitBtn = page.getByRole('button', { name: 'Exit fullscreen', exact: true });
				await expect(exitBtn).toBeVisible();
				expect(
					await page.evaluate(
						() => (window as unknown as { __fsRequestCount: number }).__fsRequestCount
					)
				).toBe(1);
				await exitBtn.click();
				await expect(fsBtn).toBeVisible();

				await fsBtn.click();
				await expect(exitBtn).toBeVisible();
				await page.keyboard.press('Escape');
				await expect(fsBtn).toBeVisible();
				expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
				await assertCleanRuntime(tracker);
			});
		});

		await test.step('T1-FA5-05: Idle toolbar dims when unfocused/unhovered and restores focus protection (opacity >= 0.9)', async () => {
			await withContext(browser, { reducedMotion: 'no-preference' }, async (_ctx, page) => {
				await page.goto(ROUTE_PATH);
				await finishIfPlaying(page);
				await ensureControlsCollapsed(page);
				const controlsBtn = page.getByRole('button', { name: 'Controls', exact: true });
				await page.evaluate(() => {
					const active = document.activeElement;
					if (active instanceof HTMLElement) active.blur();
				});
				await page.mouse.move(10, 500);
				await page.waitForTimeout(4700);
				const dimmedOpacity = await getEffectiveOpacity(controlsBtn);
				expect(dimmedOpacity).toBeLessThan(0.9);

				await controlsBtn.focus();
				await expect
					.poll(async () => await getEffectiveOpacity(controlsBtn))
					.toBeGreaterThanOrEqual(0.9);
				await page.waitForTimeout(4700);
				const protectedOpacity = await getEffectiveOpacity(controlsBtn);
				expect(protectedOpacity).toBeGreaterThanOrEqual(0.9);
			});
		});

		await test.step('T1-FA5-06: WCAG contrast (>= 4.5:1 / >= 3:1) & >= 44x44 touch targets across mobile/short viewports', async () => {
			for (const vp of [
				{ width: 390, height: 844 },
				{ width: 320, height: 568 },
				{ width: 667, height: 375 }
			]) {
				await withContext(
					browser,
					{
						viewport: vp,
						hasTouch: true,
						isMobile: true,
						reducedMotion: 'reduce'
					},
					async (_ctx, page) => {
						await page.goto(ROUTE_PATH);
						await expect(getCanvas(page)).toBeVisible();

						const verifyContrast = async (stateLabel: string) => {
							const contrasts = await measureToolbarContrast(page);
							expect(contrasts.length).toBeGreaterThan(0);
							for (const metric of contrasts) {
								expect(
									metric.contrastOverDark,
									`${vp.width}x${vp.height} ${stateLabel} ${metric.label} over #1C1B1A`
								).toBeGreaterThanOrEqual(metric.minRequiredRatio);
								expect(
									metric.contrastOverLight,
									`${vp.width}x${vp.height} ${stateLabel} ${metric.label} over #E6DFD1`
								).toBeGreaterThanOrEqual(metric.minRequiredRatio);
							}
						};

						// 1. Initial toolbar
						await assertMobileTouchTargets(page);
						await verifyContrast('initial');

						// 2. Open Controls + More options
						await openMoreOptions(page);
						await assertMobileTouchTargets(page);
						await verifyContrast('controls-more');

						// 3. Privacy & cookies <dialog>
						await page.getByRole('button', { name: /Privacy & cookies/i }).click();
						const privacyDialog = page.getByRole('dialog');
						await expect(privacyDialog).toBeVisible();
						await assertMobileTouchTargets(page);
						await verifyContrast('privacy-dialog');
						await page.keyboard.press('Escape');
						await expect(privacyDialog).toBeHidden();
						await ensureControlsCollapsed(page);

						// 4. Inspect surface HUD
						await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
						await assertMobileTouchTargets(page);
						await verifyContrast('inspect');
						await page.getByRole('button', { name: 'Whole painting', exact: true }).click();

						// 5. Save image popover (2048 px & 4096 px)
						await page.getByRole('button', { name: 'Save image', exact: true }).click();
						await expect(page.getByRole('button', { name: /2048\s*px/i })).toBeVisible();
						await expect(page.getByRole('button', { name: /4096\s*px/i })).toBeVisible();
						await assertMobileTouchTargets(page);
						await verifyContrast('save-popover');
						await page.keyboard.press('Escape');
					}
				);
			}
		});
	});

	test('FA6 — Companion essay overlay, citations, state preservation & deep links', async ({
		browser
	}) => {
		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await selectStudy(page, 'Counter & Middleman');
			await setSliderValue(page, 'Passes', 26);
			await setSliderValue(page, 'Paint flow', 75);
			const customSeed = await readVisibleSeed(page);
			const preEssayHash = await sha256CanvasPixels(page);

			await test.step('T1-FA6-01: Read the essay opens ?view=article with exact H1 & vertical scroll', async () => {
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await expect(page.getByRole('heading', { level: 1, name: ESSAY_TITLE })).toBeVisible();
				expect(page.url()).toContain('view=article');
				const scrollInfo = await page.evaluate(() => ({
					scrollHeight: document.documentElement.scrollHeight,
					clientHeight: document.documentElement.clientHeight
				}));
				expect(scrollInfo.scrollHeight).toBeGreaterThan(scrollInfo.clientHeight);
			});

			await test.step('T1-FA6-02: Essay includes verified MoMA/Met/India civic sources & hides launch card', async () => {
				const articleText = await page.locator('article').first().innerText();
				expect(articleText).toMatch(/Pollock/i);
				expect(articleText).toMatch(/Santhanam|Central Vigilance|Prevention of Corruption|RTI/i);
				const hasExternalAuthority = await page
					.locator('article a[href*="moma.org"], article a[href*="metmuseum.org"]')
					.count();
				expect(hasExternalAuthority).toBeGreaterThan(0);
				await expect(page.getByRole('button', { name: 'Read the essay', exact: true })).toHaveCount(
					0
				);
			});

			await test.step('T1-FA6-03: Return to painting preserves exact study, seed, knobs & pixel hash', async () => {
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				await expect(getCanvas(page)).toBeVisible();
				expect(await readVisibleSeed(page)).toBe(customSeed);
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '26');
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '75');
				expect(await sha256CanvasPixels(page)).toBe(preEssayHash);
			});

			await test.step('T1-FA6-04: Return to painting preserves active Inspect surface pan state', async () => {
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await panInspect(page, 'right');
				const inspectParams = readInspectUrlParams(page);
				expect(inspectParams.vm).toBe('inspect');
				expect(inspectParams.iz).toBeTruthy();
				const inspectRgba = await captureCanvasRgba(getCanvas(page));
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await expect(page.getByRole('heading', { level: 1, name: ESSAY_TITLE })).toBeVisible();
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				await expect(
					page.getByRole('button', { name: 'Whole painting', exact: true })
				).toBeVisible();
				expect(readInspectUrlParams(page)).toEqual(inspectParams);
				assertCanvasRgbaNearEqual(await captureCanvasRgba(getCanvas(page)), inspectRgba, {
					maxChannelDiff: 2,
					maxDiffByteRatio: 0.001
				});
				await page.getByRole('button', { name: 'Whole painting', exact: true }).click();
			});

			await test.step('T1-FA6-05: In-essay deep link updates studio state in-place', async () => {
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				const deepLinks = page.locator('article a[href*="/tools/drip-painting-studio?"]');
				expect(await deepLinks.count()).toBeGreaterThan(0);
				const targetHref = (await deepLinks.first().getAttribute('href')) ?? '';
				await deepLinks.first().click();
				await expect(getCanvas(page)).toBeVisible();
				await expect(page.getByRole('heading', { level: 1, name: ESSAY_TITLE })).toHaveCount(0);
				if (targetHref.includes('s=') || targetHref.includes('seed=')) {
					const targetParams = new URL(targetHref, 'http://127.0.0.1:4330').searchParams;
					const linkedSeed = targetParams.get('s') ?? targetParams.get('seed');
					if (linkedSeed) {
						expect(await readVisibleSeed(page)).toBe(linkedSeed);
					}
				}
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('FA7 — Save image high-resolution PNG export (2048 px & 4096 px)', async ({ browser }) => {
		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await expect(getCanvas(page)).toBeVisible();
			const activeSeed = await readVisibleSeed(page);

			await test.step('T1-FA7-01: Save image popover exposes 2048 px and 4096 px options', async () => {
				await page.getByRole('button', { name: 'Save image', exact: true }).click();
				await expect(page.getByRole('button', { name: /2048\s*px/i })).toBeVisible();
				await expect(page.getByRole('button', { name: /4096\s*px/i })).toBeVisible();
				await page.keyboard.press('Escape');
			});

			await test.step('T1-FA7-02: 2048 px PNG export has valid IHDR, filename with study+seed & opaque pixels', async () => {
				const out = await exportPng(page, 2048);
				expect(out.filename).toContain('pending-file');
				expect(out.filename).toContain(activeSeed);
				expect(out.bytes.length).toBeGreaterThan(20_000);
				const decoded = await analyzeDecodedPng(page, out.bytes);
				expect(decoded.opaqueAll).toBe(true);
				expect(decoded.distinctSampleColors).toBeGreaterThan(3);
				expect(decoded.darkCarbonRatio > 0 || decoded.midPigmentRatio > 0).toBe(true);
			});

			await test.step('T1-FA7-03: 4096 px PNG export has valid IHDR 4096 longer side & study+seed filename', async () => {
				const out = await exportPng(page, 4096);
				expect(out.filename).toContain('pending-file');
				expect(out.filename).toContain(activeSeed);
				expect(Math.max(out.width, out.height)).toBe(4096);
				const decoded = await analyzeDecodedPng(page, out.bytes);
				expect(decoded.opaqueAll).toBe(true);
				expect(decoded.distinctSampleColors).toBeGreaterThan(3);
				expect(decoded.darkCarbonRatio > 0 || decoded.midPigmentRatio > 0).toBe(true);
			});

			await test.step('T1-FA7-04: Export during Inspect surface still outputs complete whole painting', async () => {
				const wholeExport = await exportPng(page, 2048);
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				const inspectExport = await exportPng(page, 2048);
				expect(inspectExport.width).toBe(wholeExport.width);
				expect(inspectExport.height).toBe(wholeExport.height);
				expect(await decodedPngSha256(page, inspectExport.bytes)).toBe(
					await decodedPngSha256(page, wholeExport.bytes)
				);
				await page.getByRole('button', { name: 'Whole painting', exact: true }).click();
			});

			await assertCleanRuntime(tracker);
		});

		await test.step('T1-FA7-05: Export during active playback outputs full finished 2048 px PNG cleanly', async () => {
			await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
					const out = await exportPng(page, 2048);
					expect(Math.max(out.width, out.height)).toBe(2048);
					await finishIfPlaying(page);
					await assertCleanRuntime(tracker);
				}
			);
		});
	});

	test('FA8 — URL query, localStorage, keyboard accessibility, ARIA & Axe checks', async ({
		browser
	}) => {
		let sharedUrl = '';
		let originalHash = '';

		await test.step('T1-FA8-01: URL query persistence reproduces identical painting in fresh context', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page) => {
				await page.goto(ROUTE_PATH);
				await selectStudy(page, 'Whitewash & Record');
				await setSliderValue(page, 'Passes', 24);
				await applyCustomSeed(page, '604219');
				sharedUrl = page.url();
				expect(sharedUrl).toContain('v=1');
				expect(sharedUrl).toContain('604219');
				originalHash = await sha256CanvasPixels(page);
			});

			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page) => {
				await page.goto(sharedUrl);
				await expect(getCanvas(page)).toBeVisible();
				await ensureControlsExpanded(page);
				expect(await readVisibleSeed(page)).toBe('604219');
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '24');
				expect(await sha256CanvasPixels(page)).toBe(originalHash);
			});
		});

		await test.step('T1-FA8-02: localStorage reload persistence restores state on bare route', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page) => {
				await page.goto(ROUTE_PATH);
				await applyCustomSeed(page, '918273');
				await setSliderValue(page, 'Paint flow', 72);
				await page.goto(ROUTE_PATH);
				await expect(getCanvas(page)).toBeVisible();
				await ensureControlsExpanded(page);
				expect(await readVisibleSeed(page)).toBe('918273');
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '72');
			});
		});

		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await ensureControlsExpanded(page);

			await test.step('T1-FA8-03: Keyboard Tab traversal moves cleanly across toolbar & controls without traps', async () => {
				const visitedLabels = new Set<string>();
				for (let i = 0; i < 16; i += 1) {
					await page.keyboard.press('Tab');
					const label = await page.evaluate(() => {
						const active = document.activeElement;
						return active
							? (active.getAttribute('aria-label') ?? active.textContent ?? active.tagName).trim()
							: '';
					});
					if (label) visitedLabels.add(label);
				}
				expect(visitedLabels.size).toBeGreaterThan(4);
			});

			await test.step('T1-FA8-04: Keyboard slider keys (Arrow/Page/Home/End) update aria-valuenow monotonically', async () => {
				const passesSlider = getKnobSlider(page, 'Passes');
				await passesSlider.focus();
				await passesSlider.press('Home');
				await expect(passesSlider).toHaveAttribute('aria-valuenow', '4');
				await passesSlider.press('ArrowRight');
				await expect(passesSlider).toHaveAttribute('aria-valuenow', '5');
				await passesSlider.press('PageUp');
				const afterPageUp = Number(await passesSlider.getAttribute('aria-valuenow'));
				expect(afterPageUp).toBeGreaterThan(5);
				await passesSlider.press('PageDown');
				expect(Number(await passesSlider.getAttribute('aria-valuenow'))).toBeLessThan(afterPageUp);
				await passesSlider.press('End');
				await expect(passesSlider).toHaveAttribute('aria-valuenow', '40');
				await passesSlider.press('ArrowLeft');
				await expect(passesSlider).toHaveAttribute('aria-valuenow', '39');
			});

			await test.step('T1-FA8-05: Committed accessible canvas summary reflects study, seed & knobs', async () => {
				const summaryBefore = await readAccessibleSummary(page);
				await applyCustomSeed(page, '246810');
				const summaryAfter = await readAccessibleSummary(page);
				expect(summaryAfter).not.toBe(summaryBefore);
				expect(summaryAfter).toContain('246810');
			});

			await test.step('T1-FA8-06: Clean runtime diagnostics & Axe accessibility audit', async () => {
				const axeReport = await new AxeBuilder({ page }).analyze();
				const seriousOrCritical = axeReport.violations.filter(
					(v) => v.impact === 'serious' || v.impact === 'critical'
				);
				expect(seriousOrCritical).toEqual([]);
				await assertCleanRuntime(tracker);
			});
		});
	});
});

test.describe('Tier 2 — Boundary & Corner Cases (FA1–FA8)', () => {
	test('FA1 Boundaries — Burst clicks, Replay races, document.hidden & intro tuck', async ({
		browser
	}) => {
		await withContext(browser, { reducedMotion: 'no-preference' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);

			await test.step('T2-FA1-01: Rapid Pause/Resume/Finish now burst settles cleanly', async () => {
				for (let i = 0; i < 4; i += 1) {
					await page.getByRole('button', { name: 'Pause', exact: true }).click();
					await page.getByRole('button', { name: 'Resume', exact: true }).click();
				}
				await page.getByRole('button', { name: 'Finish now', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
				const settledA = await sha256CanvasPixels(page);
				await page.waitForTimeout(200);
				expect(await sha256CanvasPixels(page)).toBe(settledA);
			});

			await test.step('T2-FA1-02: Rapid 6x New painting clicks leave consistent seed & ARIA summary', async () => {
				const newBtn = page.getByRole('button', { name: 'New painting', exact: true });
				for (let i = 0; i < 6; i += 1) {
					await newBtn.click();
				}
				await finishIfPlaying(page);
				const finalSeed = await readVisibleSeed(page);
				const summary = await readAccessibleSummary(page);
				expect(summary).toContain(finalSeed);
			});

			await test.step('T2-FA1-03: Repeated Replay mid-animation restarts cleanly without timer overlap', async () => {
				const replayBtn = page.getByRole('button', { name: 'Replay', exact: true });
				await replayBtn.click();
				await page.waitForTimeout(150);
				await replayBtn.click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await finishIfPlaying(page);
			});

			await test.step('T2-FA1-04: document.hidden pauses playback advancement cleanly', async () => {
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await page.evaluate(() => {
					Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
					Object.defineProperty(document, 'visibilityState', {
						configurable: true,
						get: () => 'hidden'
					});
					document.dispatchEvent(new Event('visibilitychange'));
				});
				const hiddenA = await sha256CanvasPixels(page);
				await page.waitForTimeout(260);
				const hiddenB = await sha256CanvasPixels(page);
				expect(hiddenB).toBe(hiddenA);
				await page.evaluate(() => {
					Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
					Object.defineProperty(document, 'visibilityState', {
						configurable: true,
						get: () => 'visible'
					});
					document.dispatchEvent(new Event('visibilitychange'));
				});
				await expect
					.poll(async () => await sha256CanvasPixels(page), { timeout: 5000 })
					.not.toBe(hiddenB);
				await finishIfPlaying(page);
			});

			await test.step('T2-FA1-05: Replay after natural/settled completion restarts progression cleanly', async () => {
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await finishIfPlaying(page);
			});

			await test.step('T2-FA1-06: Intro sentence remains non-intrusive or cleanly dismissed across edits', async () => {
				const dismissIntro = page.getByRole('button', {
					name: /dismiss|hide.*intro|close.*intro/i
				});
				if ((await dismissIntro.count()) > 0 && (await dismissIntro.first().isVisible())) {
					await dismissIntro.first().click();
					await ensureControlsExpanded(page);
					await setSliderValue(page, 'Passes', 20);
					await expect(page.getByText(INTRO_SENTENCE)).toBeHidden();
				} else {
					await expect(page.getByText(INTRO_SENTENCE)).toBeVisible();
					const box = await page.getByText(INTRO_SENTENCE).boundingBox();
					expect(box).not.toBeNull();
					expect(box!.height).toBeLessThan(120);
				}
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('FA2 Boundaries — Min/max/step-1 bounds, mid-playback cancel, rapid drag & no vague knobs', async ({
		browser
	}) => {
		await withContext(browser, { reducedMotion: 'no-preference' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await ensureControlsExpanded(page);

			await test.step('T2-FA2-04: Mid-playback knob edit cancels animation cleanly to updated still', async () => {
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await setSliderValue(page, 'Paint flow', 62);
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
				await expect(page.getByRole('button', { name: 'Finish now', exact: true })).toHaveCount(0);
			});

			let minStats!: PixelStats;
			await test.step('T2-FA2-01: Minimum bounds (Passes=4, flow=10%, sweep=20%, layers=2) render valid painting', async () => {
				await setSliderValue(page, 'Passes', 4);
				await setSliderValue(page, 'Paint flow', 10);
				await setSliderValue(page, 'Sweep width', 20);
				await setSliderValue(page, 'Paint layers', 2);
				minStats = await analyzeCanvasPixels(page);
				expect(minStats.opaqueAll).toBe(true);
				expect(minStats.distinctSampleColors).toBeGreaterThan(2);
			});

			await test.step('T2-FA2-02: Maximum bounds (Passes=40, flow=100%, sweep=100%, layers=6) render without overflow', async () => {
				await setSliderValue(page, 'Passes', 40);
				await setSliderValue(page, 'Paint flow', 100);
				await setSliderValue(page, 'Sweep width', 100);
				await setSliderValue(page, 'Paint layers', 6);
				const maxStats = await analyzeCanvasPixels(page);
				expect(maxStats.opaqueAll).toBe(true);
				expect(maxStats.darkCarbonRatio).toBeGreaterThan(minStats.darkCarbonRatio);
			});

			await test.step('T2-FA2-03: Step-1 boundary changes (Passes 4 vs 5, 39 vs 40; Layers 2 vs 3, 5 vs 6)', async () => {
				await setSliderValue(page, 'Passes', 4);
				const h4 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Passes', 5);
				expect(await sha256CanvasPixels(page)).not.toBe(h4);

				await setSliderValue(page, 'Passes', 39);
				const h39 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Passes', 40);
				expect(await sha256CanvasPixels(page)).not.toBe(h39);

				await setSliderValue(page, 'Paint layers', 2);
				const l2 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Paint layers', 3);
				expect(await sha256CanvasPixels(page)).not.toBe(l2);

				await setSliderValue(page, 'Paint layers', 5);
				const l5 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Paint layers', 6);
				expect(await sha256CanvasPixels(page)).not.toBe(l5);
			});

			await test.step('T2-FA2-05: Rapid continuous pointer drag on Passes settles cleanly', async () => {
				await setSliderValue(page, 'Passes', 12);
				const slider = getKnobSlider(page, 'Passes');
				const beforeValue = Number(await slider.getAttribute('aria-valuenow'));
				const box = await getVisibleDragTargetBox(slider, 'Passes');
				await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
				await page.mouse.down();
				await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.5, { steps: 14 });
				await page.mouse.up();
				await expect
					.poll(async () => Number(await slider.getAttribute('aria-valuenow')))
					.not.toBe(beforeValue);
				const afterValue = Number(await slider.getAttribute('aria-valuenow'));
				expect(afterValue).toBeGreaterThanOrEqual(4);
				expect(afterValue).toBeLessThanOrEqual(40);
			});

			await test.step('T2-FA2-06: Negative scope check — zero vague knobs or shader math exposed', async () => {
				const bodyText = await page.locator('body').innerText();
				for (const banned of [
					'Chaos',
					'Corruption Level',
					'Authenticity',
					'Creativity',
					'Shader'
				]) {
					expect(bodyText).not.toContain(banned);
				}
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('FA3 Boundaries — Invalid seeds, empty Undo, texture/time bounds, redundant clicks & reset mid-playback', async ({
		browser
	}) => {
		await withContext(browser, { reducedMotion: 'no-preference' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await finishIfPlaying(page);
			await openMoreOptions(page);

			await test.step('T2-FA3-02: Undo disabled when empty & Undo immediately after Reset settings restores', async () => {
				const undoBtn = page.getByRole('button', { name: /^Undo/i });
				await expect(undoBtn).toBeDisabled();
				await setSliderValue(page, 'Passes', 32);
				const editedHash = await sha256CanvasPixels(page);
				await page.getByRole('button', { name: /Reset settings/i }).click();
				expect(await sha256CanvasPixels(page)).not.toBe(editedHash);
				await undoBtn.click();
				expect(await sha256CanvasPixels(page)).toBe(editedHash);
			});

			await test.step('T2-FA3-01: Invalid Seed inputs are rejected or normalized safely without NaN', async () => {
				for (const badSeed of ['', 'abc', '-999', '9999999999999', '0']) {
					const input = await getSeedInput(page);
					await input.fill(badSeed);
					await page.getByRole('button', { name: /^Apply$/i }).click();
					const currentSeed = await readVisibleSeed(page);
					expect(currentSeed).toMatch(/^\d+$/);
					expect(Number(currentSeed)).toBeGreaterThan(0);
					const stats = await analyzeCanvasPixels(page);
					expect(stats.opaqueAll).toBe(true);
				}
			});

			await test.step('T2-FA3-03: Paint texture 0% flat vs 100% textured relief boundaries', async () => {
				await setSliderValue(page, 'Paint texture', 0);
				const h0 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Paint texture', 100);
				const h100 = await sha256CanvasPixels(page);
				expect(h100).not.toBe(h0);
			});

			await test.step('T2-FA3-04: Painting time 4s vs 20s boundaries match final still via Finish now', async () => {
				await setSliderValue(page, 'Painting time', 4);
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await finishIfPlaying(page);
				const h4 = await sha256CanvasPixels(page);

				await setSliderValue(page, 'Painting time', 20);
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await finishIfPlaying(page);
				expect(await sha256CanvasPixels(page)).toBe(h4);
			});

			await test.step('T2-FA3-05: Redundant click on already-active Study or Preset is idempotent', async () => {
				await selectStudy(page, 'Pending File');
				const beforeHash = await sha256CanvasPixels(page);
				const beforeSeed = await readVisibleSeed(page);
				await selectStudy(page, 'Pending File');
				expect(await sha256CanvasPixels(page)).toBe(beforeHash);
				expect(await readVisibleSeed(page)).toBe(beforeSeed);

				await page.getByRole('button', { name: 'Thin Flow', exact: true }).click();
				const presetHash = await sha256CanvasPixels(page);
				await page.getByRole('button', { name: 'Thin Flow', exact: true }).click();
				expect(await sha256CanvasPixels(page)).toBe(presetHash);
			});

			await test.step('T2-FA3-06: Reset settings mid-playback cancels playback cleanly', async () => {
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await page.getByRole('button', { name: /Reset settings/i }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
				await expect(page.getByRole('button', { name: 'Finish now', exact: true })).toHaveCount(0);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '18');
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('FA4 Boundaries — Pan clamping, mid-playback inspect, Escape, rapid toggles & knob edit in inspect', async ({
		browser
	}) => {
		await withContext(browser, { reducedMotion: 'no-preference' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);

			await test.step('T2-FA4-02: Inspect surface entered mid-playback settles cleanly', async () => {
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await expect(
					page.getByRole('button', { name: 'Whole painting', exact: true })
				).toBeVisible();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
				const settledA = await sha256CanvasPixels(page);
				await page.waitForTimeout(250);
				expect(await sha256CanvasPixels(page)).toBe(settledA);
			});

			await test.step('T2-FA4-01: Out-of-bounds panning (15x) clamps inside opaque canvas without transparent margin', async () => {
				for (let i = 0; i < 15; i += 1) {
					await panInspect(page, 'left');
				}
				const leftStats = await analyzeCanvasPixels(page);
				expect(leftStats.opaqueAll).toBe(true);
				expect(leftStats.transparentEdgePixels).toBe(0);

				for (let i = 0; i < 15; i += 1) {
					await panInspect(page, 'down');
				}
				const downStats = await analyzeCanvasPixels(page);
				expect(downStats.opaqueAll).toBe(true);
				expect(downStats.transparentEdgePixels).toBe(0);
			});

			await test.step('T2-FA4-05: Knob edit while in Inspect surface updates magnified relief in place', async () => {
				const beforeInspectEdit = await sha256CanvasPixels(page);
				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Paint flow', 88);
				expect(await sha256CanvasPixels(page)).not.toBe(beforeInspectEdit);
				await expect(
					page.getByRole('button', { name: 'Whole painting', exact: true })
				).toBeVisible();
				await ensureControlsCollapsed(page);
			});

			await test.step('T2-FA4-03: Escape closes open Controls drawer or Save image popover inside Inspect surface without disrupting inspect or Seed', async () => {
				const seedBefore = await readVisibleSeed(page);
				const inspectHashBefore = await sha256CanvasPixels(page);

				await ensureControlsExpanded(page);
				await page.keyboard.press('Escape');
				await expect(page.getByRole('button', { name: 'Controls', exact: true })).toHaveAttribute(
					'aria-expanded',
					'false'
				);
				await expect(
					page.getByRole('button', { name: 'Whole painting', exact: true })
				).toBeVisible();

				await page.getByRole('button', { name: 'Save image', exact: true }).click();
				await expect(page.getByRole('button', { name: /2048\s*px/i })).toBeVisible();
				await page.keyboard.press('Escape');
				await expect(page.getByRole('button', { name: /2048\s*px/i })).toHaveCount(0);
				await expect(
					page.getByRole('button', { name: 'Whole painting', exact: true })
				).toBeVisible();
				expect(await readVisibleSeed(page)).toBe(seedBefore);
				expect(await sha256CanvasPixels(page)).toBe(inspectHashBefore);

				await page.getByRole('button', { name: 'Whole painting', exact: true }).click();
				await expect(
					page.getByRole('button', { name: 'Inspect surface', exact: true })
				).toBeVisible();
			});

			await test.step('T2-FA4-04: Rapid 5x Inspect surface <-> Whole painting toggles preserve exact pixels', async () => {
				const baseHash = await sha256CanvasPixels(page);
				for (let i = 0; i < 5; i += 1) {
					await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
					await page.getByRole('button', { name: 'Whole painting', exact: true }).click();
				}
				expect(await sha256CanvasPixels(page)).toBe(baseHash);
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('FA5 Boundaries — Extreme mobile, rapid resize, rejected Fullscreen, Escape, focus dimming & contrast', async ({
		browser
	}) => {
		await test.step('T2-FA5-01: Extreme narrow mobile (320x568) & ultra-short landscape (667x375)', async () => {
			for (const vp of [
				{ width: 320, height: 568 },
				{ width: 667, height: 375 }
			]) {
				await withContext(
					browser,
					{ viewport: vp, hasTouch: true, isMobile: true, reducedMotion: 'reduce' },
					async (_ctx, page, tracker) => {
						await page.goto(ROUTE_PATH);
						await expect(getCanvas(page)).toBeVisible();
						await assertNoHorizontalOverflow(page);
						await assertCleanRuntime(tracker);
					}
				);
			}
		});

		await test.step('T2-FA5-02: Rapid multi-resize mid-playback preserves seed & uniform aspect', async () => {
			await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					const seed0 = await readVisibleSeed(page);
					for (const vp of [
						{ width: 390, height: 844 },
						{ width: 820, height: 1180 },
						{ width: 1280, height: 720 },
						{ width: 1440, height: 900 }
					]) {
						await page.setViewportSize(vp);
						await assertUniformCanvasAspect(page);
					}
					expect(await readVisibleSeed(page)).toBe(seed0);
					await finishIfPlaying(page);
					await assertCleanRuntime(tracker);
				}
			);
		});

		await test.step('T2-FA5-03: Rejected / unsupported Fullscreen API recovers gracefully', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.addInitScript(() => {
					HTMLElement.prototype.requestFullscreen = () =>
						Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
				});
				await page.goto(ROUTE_PATH);
				const fsBtn = page.getByRole('button', { name: 'Fullscreen', exact: true });
				await fsBtn.click();
				await expect(fsBtn).toBeVisible();
				await expect(page.getByRole('status')).toContainText(/declined|not supported|full-window/i);
				await assertCleanRuntime(tracker);
			});
		});

		await test.step('T2-FA5-04: Escape closes open Save image popover & Controls drawer cleanly', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page) => {
				await page.goto(ROUTE_PATH);
				await page.getByRole('button', { name: 'Save image', exact: true }).click();
				await expect(page.getByRole('button', { name: /2048\s*px/i })).toBeVisible();
				await page.keyboard.press('Escape');
				await expect(page.getByRole('button', { name: /2048\s*px/i })).toHaveCount(0);

				await ensureControlsExpanded(page);
				await page.keyboard.press('Escape');
				await expect(page.getByRole('button', { name: 'Controls', exact: true })).toHaveAttribute(
					'aria-expanded',
					'false'
				);
			});
		});

		await test.step('T2-FA5-05: Focus inside controls protects against idle dimming for >4s', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);
				const slider = getKnobSlider(page, 'Passes');
				await slider.focus();
				await page.waitForTimeout(4200);
				const opacity = await getEffectiveOpacity(
					page.getByRole('button', { name: 'Controls', exact: true })
				);
				expect(opacity).toBeGreaterThanOrEqual(0.9);
			});
		});

		await test.step('T2-FA5-06: Worst-case WCAG contrast under Heavy Whitewash & Tangled Ledger', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);
				for (const preset of ['Heavy Whitewash', 'Tangled Ledger']) {
					await page.getByRole('button', { name: preset, exact: true }).click();
					const metrics = await measureToolbarContrast(page);
					expect(metrics.length).toBeGreaterThan(14);
					for (const m of metrics) {
						expect(m.contrastOverDark, `${preset} ${m.label} dark`).toBeGreaterThanOrEqual(
							m.minRequiredRatio
						);
						expect(m.contrastOverLight, `${preset} ${m.label} light`).toBeGreaterThanOrEqual(
							m.minRequiredRatio
						);
					}
				}
			});
		});
	});

	test('FA6 Boundaries — Direct article URL, mid-playback article, Back/Forward, deep links & scroll reset', async ({
		browser
	}) => {
		await withContext(browser, { reducedMotion: 'no-preference' }, async (_ctx, page, tracker) => {
			await test.step('T2-FA6-01: Direct navigation to ?view=article loads essay and Return initializes canvas', async () => {
				await page.goto(`${ROUTE_PATH}?view=article`);
				await expect(page.getByRole('heading', { level: 1, name: ESSAY_TITLE })).toBeVisible();
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				await expect(getCanvas(page)).toBeVisible();
				await finishIfPlaying(page);
			});

			await test.step('T2-FA6-02: Read the essay mid-playback -> Return to painting recovers cleanly', async () => {
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await expect(page.getByRole('heading', { level: 1, name: ESSAY_TITLE })).toBeVisible();
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				await expect(getCanvas(page)).toBeVisible();
				await finishIfPlaying(page);
			});

			await test.step('T2-FA6-05: Scrolling deep inside essay resets cleanly upon Return to painting', async () => {
				const preEssayBox = await getCanvas(page).boundingBox();
				expect(preEssayBox).not.toBeNull();
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await expect(page.getByRole('heading', { level: 1, name: ESSAY_TITLE })).toBeVisible();
				await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
				const scrolledY = await page.evaluate(() => window.scrollY);
				expect(scrolledY).toBeGreaterThan(200);
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				await expect(getCanvas(page)).toBeVisible();
				const scrollY = await page.evaluate(() => window.scrollY);
				expect(scrollY).toBe(0);
				const box = await getCanvas(page).boundingBox();
				expect(box).not.toBeNull();
				expect(Math.abs(box!.y - preEssayBox!.y)).toBeLessThanOrEqual(2);
			});

			await test.step('T2-FA6-04: Multiple sequential deep-link clicks override studio state cleanly', async () => {
				const essayHeading = page.getByRole('heading', { level: 1, name: ESSAY_TITLE });
				const inspectBtn = page.getByRole('button', { name: 'Inspect surface', exact: true });
				const wholeBtn = page.getByRole('button', { name: 'Whole painting', exact: true });
				const readEssayBtn = page.getByRole('button', { name: 'Read the essay', exact: true });

				await inspectBtn.click();
				await expect(wholeBtn).toBeVisible();
				await panInspect(page, 'right');
				expect(readInspectUrlParams(page).vm).toBe('inspect');

				await readEssayBtn.click();
				await expect(essayHeading).toBeVisible();
				const deepLinks = page.locator('article a[href*="/tools/drip-painting-studio?"]');
				const count = await deepLinks.count();
				expect(count).toBeGreaterThanOrEqual(2);

				const linkInventory: Array<{
					index: number;
					href: string;
					expected: ReturnType<typeof readExpectedStudioQueryParams>;
				}> = [];
				for (let i = 0; i < count; i += 1) {
					const href = (await deepLinks.nth(i).getAttribute('href')) ?? '';
					linkInventory.push({
						index: i,
						href,
						expected: readExpectedStudioQueryParams(href)
					});
				}
				const nonInspect = linkInventory.filter((item) => item.expected.vm !== 'inspect');
				const inspectLinks = linkInventory.filter((item) => item.expected.vm === 'inspect');
				expect(nonInspect.length).toBeGreaterThanOrEqual(3);
				expect(inspectLinks.length).toBeGreaterThanOrEqual(1);

				const link1 = nonInspect[0]!;
				const link2 = nonInspect[1]!;
				const link3 = nonInspect[2]!;
				const inspectLink = inspectLinks[0]!;

				// Click Link 1 (nonInspect[0], pf=20): closes essay, clears pre-essay Inspect surface, applies URL/knobs/seed
				await deepLinks.nth(link1.index).click();
				await expect(getCanvas(page)).toBeVisible();
				await expect(essayHeading).toHaveCount(0);
				await expect(inspectBtn).toBeVisible();
				await expect(wholeBtn).toHaveCount(0);
				await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBeNull();
				await expect.poll(() => readStudioQueryParams(page)).toEqual(link1.expected);
				expect(readInspectUrlParams(page)).toEqual({
					vm: null,
					iz: null,
					ix: null,
					iy: null
				});
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute(
					'aria-valuenow',
					link1.expected.p!
				);
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '20');
				await expect(getKnobSlider(page, 'Sweep width')).toHaveAttribute(
					'aria-valuenow',
					link1.expected.sw!
				);
				await expect(getKnobSlider(page, 'Paint layers')).toHaveAttribute(
					'aria-valuenow',
					link1.expected.pl!
				);
				expect(await readVisibleSeed(page)).toBe(link1.expected.s);
				const hash1 = await sha256CanvasPixels(page);

				// Click Link 2 (nonInspect[1], pf=80): overrides Paint flow & canvas pixels
				await readEssayBtn.click();
				await expect(essayHeading).toBeVisible();
				await deepLinks.nth(link2.index).click();
				await expect(getCanvas(page)).toBeVisible();
				await expect(essayHeading).toHaveCount(0);
				await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBeNull();
				await expect.poll(() => readStudioQueryParams(page)).toEqual(link2.expected);
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '80');
				const hash2 = await sha256CanvasPixels(page);
				expect(hash2).not.toBe(hash1);

				// Click Link 5 (inspectLink, vm=inspect): enters Inspect surface, sets exact inspect URL params & 36/6 knobs
				await readEssayBtn.click();
				await expect(essayHeading).toBeVisible();
				await deepLinks.nth(inspectLink.index).click();
				await expect(getCanvas(page)).toBeVisible();
				await expect(essayHeading).toHaveCount(0);
				await expect(wholeBtn).toBeVisible();
				await expect(inspectBtn).toHaveCount(0);
				await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBeNull();
				await expect.poll(() => readStudioQueryParams(page)).toEqual(inspectLink.expected);
				expect(readInspectUrlParams(page)).toEqual({
					vm: 'inspect',
					iz: inspectLink.expected.iz,
					ix: inspectLink.expected.ix,
					iy: inspectLink.expected.iy
				});
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '36');
				await expect(getKnobSlider(page, 'Paint layers')).toHaveAttribute('aria-valuenow', '6');
				const hash3 = await sha256CanvasPixels(page);
				expect(hash3).not.toBe(hash2);

				// Click Link 3 (nonInspect[2], sw=38, no vm): clears vm=inspect & restores clean whole-painting state 16/80/38/4
				await readEssayBtn.click();
				await expect(essayHeading).toBeVisible();
				await deepLinks.nth(link3.index).click();
				await expect(getCanvas(page)).toBeVisible();
				await expect(essayHeading).toHaveCount(0);
				await expect(inspectBtn).toBeVisible();
				await expect(wholeBtn).toHaveCount(0);
				await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBeNull();
				await expect.poll(() => readStudioQueryParams(page)).toEqual(link3.expected);
				expect(readInspectUrlParams(page)).toEqual({
					vm: null,
					iz: null,
					ix: null,
					iy: null
				});
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '16');
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '80');
				await expect(getKnobSlider(page, 'Sweep width')).toHaveAttribute('aria-valuenow', '38');
				await expect(getKnobSlider(page, 'Paint layers')).toHaveAttribute('aria-valuenow', '4');
				const hash4 = await sha256CanvasPixels(page);
				expect(hash4).not.toBe(hash3);
				expect(hash4).not.toBe(hash2);
			});

			await test.step('T2-FA6-03: Browser Back / Forward navigation never leaves blank screen', async () => {
				const essayHeading = page.getByRole('heading', { level: 1, name: ESSAY_TITLE });
				await expect(getCanvas(page)).toBeVisible();
				await expect(essayHeading).toHaveCount(0);
				expect(page.url()).not.toContain('view=article');
				expect(new URL(page.url()).searchParams.get('view')).toBeNull();
				const preEssayParams = readStudioQueryParams(page);
				expect(preEssayParams.st).toBeTruthy();
				expect(preEssayParams.s).toBeTruthy();

				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await expect(essayHeading).toBeVisible();
				await expect(getCanvas(page)).toHaveCount(0);
				expect(page.url()).toContain('view=article');
				expect(new URL(page.url()).searchParams.get('view')).toBe('article');
				expect(readStudioQueryParams(page)).toEqual(preEssayParams);

				await page.goBack();
				await expect(getCanvas(page)).toBeVisible();
				await expect(essayHeading).toHaveCount(0);
				expect(page.url()).not.toContain('view=article');
				expect(new URL(page.url()).searchParams.get('view')).toBeNull();
				expect(readStudioQueryParams(page)).toEqual(preEssayParams);

				await page.goForward();
				await expect(essayHeading).toBeVisible();
				await expect(getCanvas(page)).toHaveCount(0);
				expect(page.url()).toContain('view=article');
				expect(new URL(page.url()).searchParams.get('view')).toBe('article');
				expect(readStudioQueryParams(page)).toEqual(preEssayParams);
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('FA7 Boundaries — 4096 allocation fallback, max settings export, filenames, non-mutation & cancel', async ({
		browser
	}) => {
		await test.step('T2-FA7-01: 4096 px allocation failure triggers explicit fallback status without crash', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
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
				const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
				await page.getByRole('button', { name: /4096\s*px/i }).click();
				const download = await downloadPromise;
				const path = await download.path();
				expect(path).toBeTruthy();
				const bytes = await readFile(path!);
				expect(bytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
				const fallbackW = bytes.readUInt32BE(16);
				const fallbackH = bytes.readUInt32BE(20);
				expect(Math.max(fallbackW, fallbackH)).toBeGreaterThan(0);
				expect(Math.max(fallbackW, fallbackH)).toBeLessThanOrEqual(2048);
				expect(download.suggestedFilename()).not.toContain('4096');

				await expect(page.getByRole('status')).toContainText(
					/Memory limit reached|saved whole painting at (2048|1280)|fallback/i
				);
				await assertCleanRuntime(tracker);
			});
		});

		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);

			await test.step('T2-FA7-02: Max complexity export succeeds cleanly at 2048 px', async () => {
				await openMoreOptions(page);
				await setSliderValue(page, 'Passes', 40);
				await setSliderValue(page, 'Paint flow', 100);
				await setSliderValue(page, 'Paint texture', 100);
				await selectStudy(page, 'Whitewash & Record');
				const out = await exportPng(page, 2048);
				expect(Math.max(out.width, out.height)).toBe(2048);
			});

			await test.step('T2-FA7-03: Deterministic filenames include study slug, seed & IHDR dimensions across all 4 studies', async () => {
				const expectedSlugs = [
					['Pending File', 'pending-file'],
					['Public Works & Tenders', 'public-works-tenders'],
					['Counter & Middleman', 'counter-middleman'],
					['Whitewash & Record', 'whitewash-record']
				] as const;

				for (const [studyName, slugFragment] of expectedSlugs) {
					await selectStudy(page, studyName);
					const seed = await readVisibleSeed(page);
					const out = await exportPng(page, 2048);
					expect(out.filename.toLowerCase()).toContain(slugFragment.split('-')[0]!);
					expect(out.filename).toContain(seed);
					expect(out.filename).toContain(`${out.width}x${out.height}`);
				}
			});

			await test.step('T2-FA7-04: Export does not mutate live studio canvas pixels', async () => {
				const beforeExport = await sha256CanvasPixels(page);
				await exportPng(page, 2048);
				expect(await sha256CanvasPixels(page)).toBe(beforeExport);
			});

			await test.step('T2-FA7-05: Closing Save image popover via Escape triggers 0 downloads', async () => {
				let downloads = 0;
				page.on('download', () => {
					downloads += 1;
				});
				await page.getByRole('button', { name: 'Save image', exact: true }).click();
				await expect(page.getByRole('button', { name: /2048\s*px/i })).toBeVisible();
				await page.keyboard.press('Escape');
				await page.waitForTimeout(150);
				expect(downloads).toBe(0);
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('FA8 Boundaries — Malformed URLs, unknown versions, corrupt/throwing localStorage, no ARIA thrash, touch scroll', async ({
		browser
	}) => {
		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await test.step('T2-FA8-01: Malformed/out-of-bounds URL params clamp/default safely with 0 errors', async () => {
				await page.goto(
					`${ROUTE_PATH}?v=1&st=nonexistent&s=notanumber&p=999&pf=-20&sw=200&pl=99&pt=-5&t=999`
				);
				await expect(getCanvas(page)).toBeVisible();
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '40');
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '10');
				await expect(getKnobSlider(page, 'Sweep width')).toHaveAttribute('aria-valuenow', '100');
				await expect(getKnobSlider(page, 'Paint layers')).toHaveAttribute('aria-valuenow', '6');
				await assertCleanRuntime(tracker);
			});

			await test.step('T2-FA8-02: Unknown state version falls back safely without crashing', async () => {
				await page.goto(`${ROUTE_PATH}?v=999&st=pending-file`);
				await expect(getCanvas(page)).toBeVisible();
				await assertCleanRuntime(tracker);
			});
		});

		await test.step('T2-FA8-03: Corrupted localStorage JSON recovers to valid curated default', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Passes', 25);

				const corruptedCount = await page.evaluate(() => {
					const keys = Object.keys(localStorage);
					for (const k of keys) {
						localStorage.setItem(k, '{broken json');
					}
					window.history.replaceState(null, '', window.location.pathname);
					return keys.length;
				});
				expect(corruptedCount).toBeGreaterThan(0);

				await page.reload();
				await expect(getCanvas(page)).toBeVisible();
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '18');
				const stats = await analyzeCanvasPixels(page);
				expect(stats.opaqueAll).toBe(true);
				await assertCleanRuntime(tracker);
			});
		});

		await test.step('T2-FA8-04: Throwing localStorage (SecurityError) leaves studio fully usable', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
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
				await expect(getCanvas(page)).toBeVisible();
				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Passes', 22);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '22');
				await assertCleanRuntime(tracker);
			});
		});

		await test.step('T2-FA8-05: Accessible canvas summary does not thrash during active playback', async () => {
			await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
					const samples = new Set<string>();
					for (let i = 0; i < 5; i += 1) {
						samples.add(await readAccessibleSummary(page));
						await page.waitForTimeout(100);
					}
					expect(samples.size).toBe(1);
					expect([...samples][0]!.length).toBeGreaterThan(10);
					await finishIfPlaying(page);
					await assertCleanRuntime(tracker);
				}
			);
		});

		await test.step('T2-FA8-06: Mobile touch drag outside sliders does not break layout while slider updates', async () => {
			await withContext(
				browser,
				{
					viewport: { width: 390, height: 844 },
					hasTouch: true,
					isMobile: true,
					reducedMotion: 'reduce'
				},
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await ensureControlsExpanded(page);

					// Exercise touch tap & vertical touch swipe outside sliders (on canvas area)
					await page.touchscreen.tap(195, 160);
					await page.evaluate(() => {
						const target = document.elementFromPoint(195, 160) ?? document.body;
						const mkTouch = (y: number) =>
							new Touch({
								identifier: 1,
								target,
								clientX: 195,
								clientY: y,
								pageX: 195,
								pageY: y
							});
						target.dispatchEvent(
							new TouchEvent('touchstart', {
								bubbles: true,
								cancelable: true,
								touches: [mkTouch(160)],
								changedTouches: [mkTouch(160)]
							})
						);
						for (const y of [190, 220, 250, 280]) {
							target.dispatchEvent(
								new TouchEvent('touchmove', {
									bubbles: true,
									cancelable: true,
									touches: [mkTouch(y)],
									changedTouches: [mkTouch(y)]
								})
							);
						}
						target.dispatchEvent(
							new TouchEvent('touchend', {
								bubbles: true,
								cancelable: true,
								touches: [],
								changedTouches: [mkTouch(280)]
							})
						);
					});

					const slider = getKnobSlider(page, 'Passes');
					const passesBefore = Number(await slider.getAttribute('aria-valuenow'));
					const targetBox = await getVisibleDragTargetBox(slider, 'Passes');
					await page.touchscreen.tap(
						targetBox.x + targetBox.width * 0.8,
						targetBox.y + targetBox.height * 0.5
					);
					const afterTap = Number(await slider.getAttribute('aria-valuenow'));
					if (afterTap === passesBefore) {
						// Rotary dial or pointer-drag fallback using touch pointer events
						await page.evaluate(
							({ x0, x1, y }) => {
								const el = document.elementFromPoint(x0, y);
								if (!el) return;
								el.dispatchEvent(
									new PointerEvent('pointerdown', {
										bubbles: true,
										pointerType: 'touch',
										pointerId: 2,
										clientX: x0,
										clientY: y
									})
								);
								for (let i = 1; i <= 6; i += 1) {
									const cx = x0 + ((x1 - x0) * i) / 6;
									el.dispatchEvent(
										new PointerEvent('pointermove', {
											bubbles: true,
											pointerType: 'touch',
											pointerId: 2,
											clientX: cx,
											clientY: y
										})
									);
								}
								el.dispatchEvent(
									new PointerEvent('pointerup', {
										bubbles: true,
										pointerType: 'touch',
										pointerId: 2,
										clientX: x1,
										clientY: y
									})
								);
							},
							{
								x0: targetBox.x + targetBox.width * 0.2,
								x1: targetBox.x + targetBox.width * 0.85,
								y: targetBox.y + targetBox.height * 0.5
							}
						);
					}
					await expect
						.poll(async () => Number(await slider.getAttribute('aria-valuenow')))
						.not.toBe(passesBefore);
					await assertNoHorizontalOverflow(page);
					await assertCleanRuntime(tracker);
				}
			);
		});
	});
});

test.describe('Tier 3 — Cross-Feature Pairwise Combinations (All 28 Pairs)', () => {
	test('Pairwise FA1 × (FA2..FA8) combinations (T3-01 .. T3-07)', async ({ browser }) => {
		await withContext(browser, { reducedMotion: 'no-preference' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);

			await test.step('T3-01 (FA1 × FA2): Active playback + primary knob edit cancels reveal to updated still', async () => {
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Paint flow', 55);
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
			});

			await test.step('T3-03 (FA1 × FA4): Active playback + Inspect surface & Whole painting', async () => {
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await expect(
					page.getByRole('button', { name: 'Whole painting', exact: true })
				).toBeVisible();
				await page.getByRole('button', { name: 'Whole painting', exact: true }).click();
				await finishIfPlaying(page);
			});

			await test.step('T3-04 (FA1 × FA5): Active playback + viewport resize preserves seed & uniform aspect', async () => {
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				const seed = await readVisibleSeed(page);
				await page.setViewportSize({ width: 820, height: 1180 });
				await assertUniformCanvasAspect(page);
				expect(await readVisibleSeed(page)).toBe(seed);
				await page.setViewportSize({ width: 1440, height: 900 });
				await assertUniformCanvasAspect(page);
				await finishIfPlaying(page);
			});

			await test.step('T3-05 (FA1 × FA6): Paused playback + Read the essay -> Return preserves seed & state', async () => {
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await page.getByRole('button', { name: 'Pause', exact: true }).click();
				const seed = await readVisibleSeed(page);
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await expect(page.getByRole('heading', { level: 1, name: ESSAY_TITLE })).toBeVisible();
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				expect(await readVisibleSeed(page)).toBe(seed);
				await finishIfPlaying(page);
			});

			await test.step('T3-06 (FA1 × FA7): Active playback + Save image (2048 px) exports valid complete PNG', async () => {
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				const out = await exportPng(page, 2048);
				expect(Math.max(out.width, out.height)).toBe(2048);
				await finishIfPlaying(page);
			});

			await test.step('T3-07 (FA1 × FA8): New painting updates URL, storage & ARIA summary; reload reproduces', async () => {
				await page.getByRole('button', { name: 'New painting', exact: true }).click();
				await finishIfPlaying(page);
				const nextSeed = await readVisibleSeed(page);
				expect(await readAccessibleSummary(page)).toContain(nextSeed);
				const hash = await sha256CanvasPixels(page);
				await page.reload();
				await finishIfPlaying(page);
				expect(await readVisibleSeed(page)).toBe(nextSeed);
				expect(await sha256CanvasPixels(page)).toBe(hash);
			});

			await assertCleanRuntime(tracker);
		});

		await test.step('T3-02 (FA1 × FA3): reducedMotion + Study/Preset settles immediately, Replay animates', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await selectStudy(page, 'Counter & Middleman');
				await page.getByRole('button', { name: 'Single Trail', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
				await page.getByRole('button', { name: 'Replay', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await finishIfPlaying(page);
				await assertCleanRuntime(tracker);
			});
		});
	});

	test('Pairwise FA2 × (FA3..FA8) combinations (T3-08 .. T3-13)', async ({ browser }) => {
		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await openMoreOptions(page);

			await test.step('T3-08 (FA2 × FA3): Thin 20% -> Heavy 80% -> Buried + Undo restores step-by-step pixels', async () => {
				await setSliderValue(page, 'Paint flow', 20);
				const hThin = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Paint flow', 80);
				const hHeavy = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Passes', 34);
				await setSliderValue(page, 'Paint layers', 6);
				const hBuried = await sha256CanvasPixels(page);
				expect(new Set([hThin, hHeavy, hBuried]).size).toBe(3);

				const undoBtn = page.getByRole('button', { name: /^Undo/i });
				await undoBtn.click();
				await undoBtn.click();
				expect(await sha256CanvasPixels(page)).toBe(hHeavy);
				await undoBtn.click();
				expect(await sha256CanvasPixels(page)).toBe(hThin);
			});

			await test.step('T3-09 (FA2 × FA4): Inspect surface + primary knob edit updates zoomed ridges in place', async () => {
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				const hBefore = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Paint flow', 90);
				expect(await sha256CanvasPixels(page)).not.toBe(hBefore);
				await page.getByRole('button', { name: 'Whole painting', exact: true }).click();
			});

			await test.step('T3-10 (FA2 × FA5): Open Controls tray adapts between desktop and mobile preserving values', async () => {
				await setSliderValue(page, 'Sweep width', 82);
				await page.setViewportSize({ width: 390, height: 844 });
				await expect(getKnobSlider(page, 'Sweep width')).toHaveAttribute('aria-valuenow', '82');
				await assertNoHorizontalOverflow(page);
				await page.setViewportSize({ width: 1440, height: 900 });
			});

			await test.step('T3-11 (FA2 × FA6): Customized primary knobs survive Read the essay -> Return to painting', async () => {
				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Passes', 29);
				await setSliderValue(page, 'Paint layers', 5);
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '29');
				await expect(getKnobSlider(page, 'Paint layers')).toHaveAttribute('aria-valuenow', '5');
			});

			await test.step('T3-12 (FA2 × FA7): Max primary knobs + Save image 2048 px exports cleanly', async () => {
				await setSliderValue(page, 'Passes', 40);
				await setSliderValue(page, 'Paint flow', 100);
				const out = await exportPng(page, 2048);
				expect(Math.max(out.width, out.height)).toBe(2048);
			});

			await assertCleanRuntime(tracker);
		});

		await test.step('T3-13 (FA2 × FA8): Keyboard slider edits + URL share reproduce exact canvas in new context', async () => {
			let shareUrl = '';
			let expectedHash = '';
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);
				const flow = getKnobSlider(page, 'Paint flow');
				await flow.focus();
				await flow.press('PageUp');
				await flow.press('ArrowRight');
				const expectedFlow = await flow.getAttribute('aria-valuenow');
				await expect
					.poll(() => {
						const params = new URL(page.url()).searchParams;
						return params.get('pf') ?? params.get('flow');
					})
					.toBe(expectedFlow);
				shareUrl = page.url();
				expectedHash = await sha256CanvasPixels(page);
			});
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page) => {
				await page.goto(shareUrl);
				expect(await sha256CanvasPixels(page)).toBe(expectedHash);
			});
		});
	});

	test('Pairwise FA3 × (FA4..FA8) combinations (T3-14 .. T3-18)', async ({ browser }) => {
		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await openMoreOptions(page);

			await test.step('T3-14 (FA3 × FA4): Paint texture (0% vs 100%) visible under Inspect surface zoom', async () => {
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await setSliderValue(page, 'Paint texture', 0);
				const h0 = await sha256CanvasPixels(page);
				await setSliderValue(page, 'Paint texture', 100);
				expect(await sha256CanvasPixels(page)).not.toBe(h0);
				await page.getByRole('button', { name: 'Whole painting', exact: true }).click();
			});

			await test.step('T3-15 (FA3 × FA5): More options remains scrollable/reachable in short landscape (844x390)', async () => {
				await page.setViewportSize({ width: 844, height: 390 });
				await page.getByRole('button', { name: /Reset settings/i }).scrollIntoViewIfNeeded();
				await expect(page.getByRole('button', { name: /Reset settings/i })).toBeVisible();
				await assertNoHorizontalOverflow(page);
				await page.setViewportSize({ width: 1440, height: 900 });
			});

			await test.step('T3-16 (FA3 × FA6): Custom Study + Seed + Preset survives essay round-trip; deep link overrides', async () => {
				await selectStudy(page, 'Whitewash & Record');
				await applyCustomSeed(page, '424242');
				await page.getByRole('button', { name: 'Tangled Ledger', exact: true }).click();
				const presetPasses = await getKnobSlider(page, 'Passes').getAttribute('aria-valuenow');
				const presetFlow = await getKnobSlider(page, 'Paint flow').getAttribute('aria-valuenow');
				const preEssaySummary = await readAccessibleSummary(page);
				expect(preEssaySummary.toLowerCase()).toContain('whitewash');
				const preEssayUrl = page.url();

				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await expect(page.getByRole('heading', { level: 1, name: ESSAY_TITLE })).toBeVisible();
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				expect(await readVisibleSeed(page)).toBe('424242');
				expect((await readAccessibleSummary(page)).toLowerCase()).toContain('whitewash');
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute(
					'aria-valuenow',
					presetPasses ?? ''
				);
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute(
					'aria-valuenow',
					presetFlow ?? ''
				);

				// Verify embedded deep-link overrides state cleanly, then restore pre-essay state for T3-17.
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				const deepLinks = page.locator('article a[href*="/tools/drip-painting-studio?"]');
				expect(await deepLinks.count()).toBeGreaterThan(0);
				const deepLink = deepLinks.first();
				const href = (await deepLink.getAttribute('href')) ?? '';
				await deepLink.click();
				await expect(getCanvas(page)).toBeVisible();
				await expect(page.getByRole('heading', { level: 1, name: ESSAY_TITLE })).toHaveCount(0);
				if (href.includes('s=') || href.includes('seed=')) {
					const hrefParams = new URL(href, 'http://127.0.0.1:4330').searchParams;
					const linkedSeed = hrefParams.get('s') ?? hrefParams.get('seed');
					if (linkedSeed) {
						expect(await readVisibleSeed(page)).toBe(linkedSeed);
					}
				}
				await page.goto(preEssayUrl);
				await expect(getCanvas(page)).toBeVisible();
				await openMoreOptions(page);
			});

			await test.step('T3-17 (FA3 × FA7): Whitewash & Record + custom Seed + Save image filename accuracy', async () => {
				const out = await exportPng(page, 2048);
				expect(out.filename.toLowerCase()).toContain('whitewash');
				expect(out.filename).toContain('424242');
			});

			await test.step('T3-18 (FA3 × FA8): Reset settings syncs URL & localStorage across reload', async () => {
				await page.getByRole('button', { name: /Reset settings/i }).click();
				await page.reload();
				await expect(getCanvas(page)).toBeVisible();
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '18');
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '45');
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('Pairwise FA4..FA8 remaining combinations (T3-19 .. T3-28)', async ({ browser }) => {
		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);

			await test.step('T3-19 (FA4 × FA5): Inspect surface + resize preserves un-stretched crop', async () => {
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await page.setViewportSize({ width: 1024, height: 768 });
				await assertUniformCanvasAspect(page);
				await page.setViewportSize({ width: 1440, height: 900 });
				await assertUniformCanvasAspect(page);
			});

			await test.step('T3-20 (FA4 × FA6): Inspect surface + pan + essay round-trip preserves crop pixels', async () => {
				await panInspect(page, 'left');
				const cropParams = readInspectUrlParams(page);
				expect(cropParams.vm).toBe('inspect');
				expect(cropParams.iz).toBeTruthy();
				const cropRgba = await captureCanvasRgba(getCanvas(page));
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				expect(readInspectUrlParams(page)).toEqual(cropParams);
				assertCanvasRgbaNearEqual(await captureCanvasRgba(getCanvas(page)), cropRgba, {
					maxChannelDiff: 2,
					maxDiffByteRatio: 0.001
				});
			});

			await test.step('T3-21 (FA4 × FA7): Inspect surface + Save image exports un-cropped full composition', async () => {
				const out = await exportPng(page, 2048);
				expect(Math.max(out.width, out.height)).toBe(2048);
				await page.getByRole('button', { name: 'Whole painting', exact: true }).click();
			});

			await test.step('T3-22 (FA4 × FA8): Keyboard Inspect pan + ARIA summary + reload persistence', async () => {
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await panInspect(page, 'down');
				const seedBefore = await readVisibleSeed(page);
				const summaryBefore = await readAccessibleSummary(page);
				expect(summaryBefore.length).toBeGreaterThan(10);
				await page.reload();
				await expect(getCanvas(page)).toBeVisible();
				expect(readInspectUrlParams(page).vm).toBe('inspect');
				expect(await readVisibleSeed(page)).toBe(seedBefore);
				expect(await readAccessibleSummary(page)).toBe(summaryBefore);
				const wholeBtn = page.getByRole('button', { name: 'Whole painting', exact: true });
				await expect(wholeBtn).toBeVisible();
				await wholeBtn.click();
			});

			await test.step('T3-26 (FA6 × FA7): Essay round-trip -> Save image preserves exported pixels', async () => {
				const preExport = await exportPng(page, 2048);
				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				const postExport = await exportPng(page, 2048);
				expect(await decodedPngSha256(page, postExport.bytes)).toBe(
					await decodedPngSha256(page, preExport.bytes)
				);
			});

			await assertCleanRuntime(tracker);
		});

		await withContext(
			browser,
			{
				viewport: { width: 390, height: 844 },
				hasTouch: true,
				isMobile: true,
				reducedMotion: 'reduce'
			},
			async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await applyCustomSeed(page, '135791');

				await test.step('T3-23 (FA5 × FA6): Mobile (390x844) Read the essay overlay has zero overflow', async () => {
					await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
					await expect(page.getByRole('heading', { level: 1, name: ESSAY_TITLE })).toBeVisible();
					await assertNoHorizontalOverflow(page);
					await page
						.getByRole('button', { name: /Return to painting/i })
						.first()
						.click();
				});

				await test.step('T3-24 (FA5 × FA7): Mobile (390x844) Save image meets >=44x44 target & exports 2048 px PNG', async () => {
					await page.getByRole('button', { name: 'Save image', exact: true }).click();
					const btn2048 = page.getByRole('button', { name: /2048\s*px/i });
					const btn4096 = page.getByRole('button', { name: /4096\s*px/i });
					const box2048 = await btn2048.boundingBox();
					const box4096 = await btn4096.boundingBox();
					expect(box2048).not.toBeNull();
					expect(box4096).not.toBeNull();
					expect(box2048!.width).toBeGreaterThanOrEqual(43.5);
					expect(box2048!.height).toBeGreaterThanOrEqual(43.5);
					expect(box4096!.width).toBeGreaterThanOrEqual(43.5);
					expect(box4096!.height).toBeGreaterThanOrEqual(43.5);
					const dlPromise = page.waitForEvent('download');
					await btn2048.click();
					const dl = await dlPromise;
					verifyPngHeaders(await readFile((await dl.path())!), 2048);
				});

				await test.step('T3-25 (FA5 × FA8): Mobile (390x844) reload restores persisted state cleanly', async () => {
					await page.reload();
					expect(await readVisibleSeed(page)).toBe('135791');
					await assertNoHorizontalOverflow(page);
					await assertCleanRuntime(tracker);
				});
			}
		);

		await test.step('T3-27 (FA6 × FA8): Direct ?view=article deep link updates URL & storage', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(`${ROUTE_PATH}?view=article`);
				const deepLink = page.locator('article a[href*="/tools/drip-painting-studio?"]').first();
				await deepLink.click();
				await expect(getCanvas(page)).toBeVisible();
				expect(page.url()).not.toContain('view=article');
				await assertCleanRuntime(tracker);
			});
		});

		await test.step('T3-28 (FA7 × FA8): Exported PNG from URL-reproduced context matches original', async () => {
			const customUrl = `${ROUTE_PATH}?v=1&st=pending-file&s=246813&p=20&pf=55`;
			const bytesA = await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page) => {
				await page.goto(customUrl);
				expect(await readVisibleSeed(page)).toBe('246813');
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '20');
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '55');
				await ensureControlsCollapsed(page);
				return (await exportPng(page, 2048)).bytes;
			});
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page) => {
				await page.goto(customUrl);
				expect(await readVisibleSeed(page)).toBe('246813');
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '20');
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '55');
				await ensureControlsCollapsed(page);
				const exportB = await exportPng(page, 2048);
				expect(await decodedPngSha256(page, exportB.bytes)).toBe(
					await decodedPngSha256(page, bytesA)
				);
			});
		});
	});
});

test.describe('Tier 4 — Real-World Application Scenarios', () => {
	test('T4-01: Reproducible article visual experiment (Thin 20% -> Heavy 80% -> Buried whitewash)', async ({
		browser
	}) => {
		await test.step('T4-01: Execute reproducible experiment on Pending File fixed seed', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Passes', 18);
				await setSliderValue(page, 'Sweep width', 68);
				await setSliderValue(page, 'Paint layers', 4);
				await setSliderValue(page, 'Paint flow', 20);

				const thinHash = await sha256CanvasPixels(page);
				const thinStats = await analyzeCanvasPixels(page);

				// Raise ONLY Paint flow to 80% while holding Passes, Sweep width, Paint layers fixed.
				await setSliderValue(page, 'Paint flow', 80);
				const heavyHash = await sha256CanvasPixels(page);
				const heavyStats = await analyzeCanvasPixels(page);

				expect(heavyHash).not.toBe(thinHash);
				expect(heavyStats.meanLuma).toBeLessThan(thinStats.meanLuma);
				expect(heavyStats.darkCarbonRatio).toBeGreaterThan(thinStats.darkCarbonRatio);

				// Raise Passes & Paint layers so late coats bury earlier paths with chalky whitewash & ridges.
				await setSliderValue(page, 'Passes', 38);
				await setSliderValue(page, 'Paint layers', 6);
				const buriedHash = await sha256CanvasPixels(page);
				const buriedStats = await analyzeCanvasPixels(page);
				expect(buriedHash).not.toBe(heavyHash);
				expect(buriedStats.distinctSampleColors).toBeGreaterThan(4);

				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				const inspectStats = await analyzeCanvasPixels(page);
				expect(inspectStats.opaqueAll).toBe(true);
				await assertCleanRuntime(tracker);
			});
		});
	});

	test('T4-02: Mobile portrait touch visitor workflow (390x844)', async ({ browser }) => {
		await test.step('T4-02: Touch visitor completes reveal, edits knobs, pans inspect, and exports 2048 px PNG', async () => {
			await withContext(
				browser,
				{
					viewport: { width: 390, height: 844 },
					hasTouch: true,
					isMobile: true,
					reducedMotion: 'no-preference'
				},
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
					await page.getByRole('button', { name: 'Finish now', exact: true }).click();
					await assertNoHorizontalOverflow(page);

					await ensureControlsExpanded(page);
					await setSliderValue(page, 'Paint flow', 65);
					await setSliderValue(page, 'Passes', 24);
					await ensureControlsCollapsed(page);

					await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
					await panInspect(page, 'right');
					await page.getByRole('button', { name: 'Whole painting', exact: true }).click();

					const out = await exportPng(page, 2048);
					expect(Math.max(out.width, out.height)).toBe(2048);
					await assertCleanRuntime(tracker);
				}
			);
		});
	});

	test('T4-03: Keyboard-only & screen-reader accessibility visitor workflow', async ({
		browser
	}) => {
		await test.step('T4-03: Complete studio workflow using keyboard & ARIA semantics alone', async () => {
			await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await page.getByRole('button', { name: 'Finish now', exact: true }).focus();
					await page.keyboard.press('Enter');
					await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);

					const controlsBtn = page.getByRole('button', { name: 'Controls', exact: true });
					const expandedBefore = await controlsBtn.getAttribute('aria-expanded');
					const expectedToggled = expandedBefore === 'true' ? 'false' : 'true';
					await controlsBtn.focus();
					await page.keyboard.press('Space');
					await expect(controlsBtn).toHaveAttribute('aria-expanded', expectedToggled);
					if (expectedToggled === 'false') {
						await page.keyboard.press('Space');
						await expect(controlsBtn).toHaveAttribute('aria-expanded', 'true');
					}

					// Hold focus > 3s to confirm idle dimming never hides active controls.
					const passesSlider = getKnobSlider(page, 'Passes');
					await passesSlider.focus();
					await page.waitForTimeout(3200);
					const opacity = await getEffectiveOpacity(passesSlider);
					expect(opacity).toBeGreaterThanOrEqual(0.9);

					await passesSlider.press('PageUp');
					await selectStudy(page, 'Counter & Middleman');
					await page.getByRole('button', { name: /^Undo/i }).click();
					await page.keyboard.press('Escape');
					await assertCleanRuntime(tracker);
				}
			);
		});
	});

	test('T4-04: Curator / print export workflow (Public Works & Tenders + 4096 px PNG)', async ({
		browser
	}) => {
		await test.step('T4-04: Customize Public Works & Tenders, inspect ridges, and export 2048 & 4096 PNGs', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await selectStudy(page, 'Public Works & Tenders');
				await page.getByRole('button', { name: 'Heavy Whitewash', exact: true }).click();
				await applyCustomSeed(page, '842105');

				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await panInspect(page, 'right');

				const png2048 = await exportPng(page, 2048);
				const png4096 = await exportPng(page, 4096);
				expect(png2048.filename).toContain('public-works');
				expect(png2048.filename).toContain('842105');
				expect(png4096.filename).toContain('public-works');
				expect(png4096.filename).toContain('842105');
				expect(Math.max(png4096.width, png4096.height)).toBe(4096);
				const decoded4096 = await analyzeDecodedPng(page, png4096.bytes);
				expect(decoded4096.opaqueAll).toBe(true);
				expect(decoded4096.distinctSampleColors).toBeGreaterThan(3);
				await assertCleanRuntime(tracker);
			});
		});
	});

	test('T4-05: Essay reader & deep-link round-trip workflow', async ({ browser }) => {
		await test.step('T4-05: Configure Whitewash & Record, inspect pan, read/scroll essay, return, then apply deep link', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await selectStudy(page, 'Whitewash & Record');
				await setSliderValue(page, 'Passes', 24);
				await setSliderValue(page, 'Paint flow', 65);
				await page.getByRole('button', { name: 'New painting', exact: true }).click();
				const customSeed = await readVisibleSeed(page);

				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				await panInspect(page, 'down');
				const preEssayParams = readInspectUrlParams(page);
				expect(preEssayParams.vm).toBe('inspect');
				expect(preEssayParams.iz).toBeTruthy();
				const preEssayRgba = await captureCanvasRgba(getCanvas(page));

				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await expect(page.getByRole('heading', { level: 1, name: ESSAY_TITLE })).toBeVisible();
				await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
				const scrolledY = await page.evaluate(() => window.scrollY);
				expect(scrolledY).toBeGreaterThan(200);
				await page
					.getByRole('button', { name: /Return to painting/i })
					.first()
					.click();
				await expect(getCanvas(page)).toBeVisible();
				expect(await page.evaluate(() => window.scrollY)).toBe(0);

				expect(await readVisibleSeed(page)).toBe(customSeed);
				expect(readInspectUrlParams(page)).toEqual(preEssayParams);
				assertCanvasRgbaNearEqual(await captureCanvasRgba(getCanvas(page)), preEssayRgba, {
					maxChannelDiff: 2,
					maxDiffByteRatio: 0.001
				});

				await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
				await page.locator('article a[href*="/tools/drip-painting-studio?"]').first().click();
				await expect(getCanvas(page)).toBeVisible();
				await assertCleanRuntime(tracker);
			});
		});
	});

	test('T4-06: Multi-viewport resize & playback continuity workflow (844x390 -> 820x1180 -> 1440x900)', async ({
		browser
	}) => {
		await test.step('T4-06: Resize across short landscape, tablet & desktop mid-playback, test Fullscreen & Undo', async () => {
			await withContext(
				browser,
				{ viewport: { width: 844, height: 390 }, reducedMotion: 'no-preference' },
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
					});

					await page.goto(ROUTE_PATH);
					const seed0 = await readVisibleSeed(page);
					for (const vp of [
						{ width: 820, height: 1180 },
						{ width: 1440, height: 900 }
					]) {
						await page.setViewportSize(vp);
						await assertNoHorizontalOverflow(page);
						await assertUniformCanvasAspect(page);
					}
					expect(await readVisibleSeed(page)).toBe(seed0);
					await finishIfPlaying(page);

					const fsBtn = page.getByRole('button', { name: 'Fullscreen', exact: true });
					const exitFsBtn = page.getByRole('button', { name: 'Exit fullscreen', exact: true });
					await fsBtn.click();
					await expect(exitFsBtn).toBeVisible();
					await page.keyboard.press('Escape');
					await expect(fsBtn).toBeVisible();
					expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();

					await openMoreOptions(page);
					await setSliderValue(page, 'Passes', 31);
					await page.getByRole('button', { name: /Reset settings/i }).click();
					await page.getByRole('button', { name: /^Undo/i }).click();
					await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '31');
					await assertCleanRuntime(tracker);
				}
			);
		});
	});

	test('T4-07: Cross-session persistence & shareable URL workflow', async ({ browser }) => {
		await test.step('T4-07: Persist via localStorage reload and share URL across isolated browser context', async () => {
			let shareUrl = '';
			let expectedHash = '';
			let expectedSeed = '';

			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await selectStudy(page, 'Counter & Middleman');
				await page.getByRole('button', { name: 'Tangled Ledger', exact: true }).click();
				await setSliderValue(page, 'Paint texture', 85);
				expectedSeed = await readVisibleSeed(page);
				expectedHash = await sha256CanvasPixels(page);

				await page.reload();
				expect(await readVisibleSeed(page)).toBe(expectedSeed);
				expect(await sha256CanvasPixels(page)).toBe(expectedHash);
				shareUrl = page.url();
				await assertCleanRuntime(tracker);
			});

			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(shareUrl);
				await expect(getCanvas(page)).toBeVisible();
				expect(await readVisibleSeed(page)).toBe(expectedSeed);
				await ensureControlsExpanded(page);
				await openMoreOptions(page);
				await expect(getKnobSlider(page, 'Paint texture')).toHaveAttribute('aria-valuenow', '85');
				expect(await sha256CanvasPixels(page)).toBe(expectedHash);
				await assertCleanRuntime(tracker);
			});
		});
	});
});

test.describe('Tier 5 — Adversarial Edge Cases, Bug Regressions & Full Control Coverage', () => {
	test('T5-01: Canvas framing, Pending File flow experiment steps & Copy link with clipboard fallback', async ({
		browser
	}) => {
		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await openMoreOptions(page);

			await test.step('T5-01a: Fill screen vs Fit painting framing updates URL and fits artboard inside viewport', async () => {
				const fillBtn = page.getByRole('button', { name: 'Fill screen', exact: true });
				const fitBtn = page.getByRole('button', { name: 'Fit painting', exact: true });
				await expect(fillBtn).toHaveAttribute('aria-pressed', 'true');
				await expect(fitBtn).toHaveAttribute('aria-pressed', 'false');

				await fitBtn.click();
				await expect(fitBtn).toHaveAttribute('aria-pressed', 'true');
				await expect(fillBtn).toHaveAttribute('aria-pressed', 'false');
				expect(readInspectUrlParams(page).vm).toBe('fit');

				const box = await getCanvas(page).boundingBox();
				expect(box).not.toBeNull();
				expect(box!.x).toBeGreaterThanOrEqual(-1);
				expect(box!.y).toBeGreaterThanOrEqual(-1);
				expect(box!.x + box!.width).toBeLessThanOrEqual(1441);
				expect(box!.y + box!.height).toBeLessThanOrEqual(901);

				await fillBtn.click();
				await expect(fillBtn).toHaveAttribute('aria-pressed', 'true');
				expect(readInspectUrlParams(page).vm).toBeNull();
			});

			await test.step('T5-01b: Pending File flow experiment quick-step buttons apply Thin 20%, Heavy 80% & Buried 36/6', async () => {
				const thinBtn = page.getByRole('button', { name: '1. Thin flow (20%)', exact: true });
				const heavyBtn = page.getByRole('button', { name: '2. Heavy flow (80%)', exact: true });
				const buriedBtn = page.getByRole('button', {
					name: '3. Buried layers (36 passes, 6 layers)',
					exact: true
				});

				await thinBtn.click();
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '16');
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '20');
				await expect(getKnobSlider(page, 'Paint layers')).toHaveAttribute('aria-valuenow', '4');
				expect(await readVisibleSeed(page)).toBe('729104');
				const thinHash = await sha256CanvasPixels(page);
				const thinStats = await analyzeCanvasPixels(page);

				await heavyBtn.click();
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '16');
				await expect(getKnobSlider(page, 'Paint flow')).toHaveAttribute('aria-valuenow', '80');
				await expect(getKnobSlider(page, 'Paint layers')).toHaveAttribute('aria-valuenow', '4');
				expect(await readVisibleSeed(page)).toBe('729104');
				const heavyHash = await sha256CanvasPixels(page);
				const heavyStats = await analyzeCanvasPixels(page);
				expect(heavyHash).not.toBe(thinHash);
				expect(heavyStats.meanLuma).toBeLessThan(thinStats.meanLuma);
				expect(heavyStats.darkCarbonRatio).toBeGreaterThan(thinStats.darkCarbonRatio);

				await buriedBtn.click();
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '36');
				await expect(getKnobSlider(page, 'Paint layers')).toHaveAttribute('aria-valuenow', '6');
				expect(await readVisibleSeed(page)).toBe('729104');
				expect(await sha256CanvasPixels(page)).not.toBe(heavyHash);
			});

			await test.step('T5-01c: Copy link writes clipboard URL when permitted and shows Copyable painting URL fallback when denied', async () => {
				await page.evaluate(() => {
					(window as unknown as { __copiedUrl: string; __denyCopy: boolean }).__copiedUrl = '';
					(window as unknown as { __copiedUrl: string; __denyCopy: boolean }).__denyCopy = false;
					Object.defineProperty(navigator, 'clipboard', {
						configurable: true,
						value: {
							writeText: async (text: string) => {
								const win = window as unknown as { __copiedUrl: string; __denyCopy: boolean };
								if (win.__denyCopy) {
									throw new DOMException('Denied', 'NotAllowedError');
								}
								win.__copiedUrl = text;
							}
						}
					});
				});

				const copyBtn = page.getByRole('button', { name: 'Copy link', exact: true });
				await copyBtn.click();
				const copied = await page.evaluate(
					() => (window as unknown as { __copiedUrl: string }).__copiedUrl
				);
				expect(copied).toContain('v=1');
				expect(copied).toContain('729104');
				await expect(page.getByRole('status')).toContainText(/Copied reproducible painting link/i);
				await expect(page.getByLabel('Copyable painting URL')).toHaveCount(0);

				await page.evaluate(() => {
					(window as unknown as { __denyCopy: boolean }).__denyCopy = true;
				});
				await copyBtn.click();
				const fallbackInput = page.getByLabel('Copyable painting URL');
				await expect(fallbackInput).toBeVisible();
				await expect(fallbackInput).toHaveAttribute('readonly', '');
				const fallbackVal = await fallbackInput.inputValue();
				expect(fallbackVal).toContain('v=1');
				expect(fallbackVal).toContain('729104');
				await expect(page.getByRole('status')).toContainText(/Clipboard permission unavailable/i);
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('T5-02: Inspect surface zoom buttons, mouse wheel zoom, Return to whole painting & seed Arrow non-panning', async ({
		browser
	}) => {
		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await ensureControlsCollapsed(page);

			await test.step('T5-02a: Zoom in close-up, Zoom out close-up & mouse wheel zoom obey [2.0, 5.0] bounds', async () => {
				await page.getByRole('button', { name: 'Inspect surface', exact: true }).click();
				expect(Number(readInspectUrlParams(page).iz)).toBeCloseTo(3.5, 2);

				const zoomInBtn = page.getByRole('button', { name: 'Zoom in close-up', exact: true });
				const zoomOutBtn = page.getByRole('button', { name: 'Zoom out close-up', exact: true });
				const hash35 = await sha256CanvasPixels(page);

				await zoomInBtn.click();
				expect(Number(readInspectUrlParams(page).iz)).toBeCloseTo(3.9, 2);
				expect(await sha256CanvasPixels(page)).not.toBe(hash35);

				for (let i = 0; i < 4; i += 1) {
					if (await zoomInBtn.isEnabled()) {
						await zoomInBtn.click();
					}
				}
				expect(Number(readInspectUrlParams(page).iz)).toBeCloseTo(5.0, 2);
				await expect(zoomInBtn).toBeDisabled();

				for (let i = 0; i < 9; i += 1) {
					if (await zoomOutBtn.isEnabled()) {
						await zoomOutBtn.click();
					}
				}
				expect(Number(readInspectUrlParams(page).iz)).toBeCloseTo(2.0, 2);
				await expect(zoomOutBtn).toBeDisabled();

				const box = await getCanvas(page).boundingBox();
				expect(box).not.toBeNull();
				await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
				await page.mouse.wheel(0, -120);
				expect(Number(readInspectUrlParams(page).iz)).toBeGreaterThan(2.0);
				await page.mouse.wheel(0, 120);
				expect(Number(readInspectUrlParams(page).iz)).toBeCloseTo(2.0, 2);
			});

			await test.step('T5-02b: Arrow keys inside Painting seed do not pan Inspect surface and Return to whole painting exits', async () => {
				await openMoreOptions(page);
				const seedInput = await getSeedInput(page);
				const paramsBefore = readInspectUrlParams(page);
				const hashBefore = await sha256CanvasPixels(page);

				await seedInput.focus();
				await seedInput.press('ArrowRight');
				await seedInput.press('ArrowLeft');
				expect(readInspectUrlParams(page)).toEqual(paramsBefore);
				expect(await sha256CanvasPixels(page)).toBe(hashBefore);

				await ensureControlsCollapsed(page);
				await page.getByRole('button', { name: 'Return to whole painting', exact: true }).click();
				await expect(
					page.getByRole('button', { name: 'Inspect surface', exact: true })
				).toBeVisible();
				expect(readInspectUrlParams(page).vm).toBeNull();
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('T5-03: Rotary dial pointercancel reverts uncommitted preview, full-res buffer & Undo cleanliness', async ({
		browser
	}) => {
		await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
			await page.goto(ROUTE_PATH);
			await openMoreOptions(page);

			await test.step('T5-03a: pointercancel mid-dial-drag reverts knob value, full-res pixels, URL, storage & ARIA summary without Undo entry', async () => {
				const passesSlider = getKnobSlider(page, 'Passes');
				const undoBtn = page.getByRole('button', { name: /^Undo/i });
				await expect(passesSlider).toHaveAttribute('aria-valuenow', '18');
				await expect(undoBtn).toBeDisabled();

				const beforeHash = await sha256CanvasPixels(page);
				const beforeUrl = page.url();
				const beforeSummary = await readAccessibleSummary(page);

				const dial = page.getByTitle(/Drag.*Passes/i);
				await expect(dial).toBeVisible();

				await dial.evaluate((el) => {
					el.dispatchEvent(
						new PointerEvent('pointerdown', {
							bubbles: true,
							pointerId: 11,
							pointerType: 'mouse',
							button: 0,
							clientX: 100,
							clientY: 100
						})
					);
					el.dispatchEvent(
						new PointerEvent('pointermove', {
							bubbles: true,
							pointerId: 11,
							pointerType: 'mouse',
							clientX: 250,
							clientY: 100
						})
					);
				});

				await expect(passesSlider).toHaveAttribute('aria-valuenow', '40');
				expect(await sha256CanvasPixels(page)).not.toBe(beforeHash);

				await dial.evaluate((el) => {
					el.dispatchEvent(
						new PointerEvent('pointercancel', {
							bubbles: true,
							pointerId: 11,
							pointerType: 'mouse'
						})
					);
				});

				await expect(passesSlider).toHaveAttribute('aria-valuenow', '18');
				expect(await sha256CanvasPixels(page)).toBe(beforeHash);
				expect(page.url()).toBe(beforeUrl);
				expect(await readAccessibleSummary(page)).toBe(beforeSummary);
				await expect(undoBtn).toBeDisabled();

				const storedPasses = await page.evaluate(() => {
					for (const k of Object.keys(localStorage)) {
						try {
							const parsed = JSON.parse(localStorage.getItem(k) ?? 'null');
							if (parsed && typeof parsed === 'object' && 'passes' in parsed) {
								return parsed.passes;
							}
						} catch {
							// Ignore non-JSON storage entries.
						}
					}
					return null;
				});
				expect(storedPasses).not.toBe(40);
			});

			await assertCleanRuntime(tracker);
		});
	});

	test('T5-04: Visibility & essay lifecycle races, manual pause bounce, reduced-motion while hidden & no-op Seed', async ({
		browser
	}) => {
		await test.step('T5-04a: document.hidden auto-pause -> Read the essay -> unhide -> Return to painting resumes playback', async () => {
			await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

					await page.evaluate(() => {
						Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
						Object.defineProperty(document, 'visibilityState', {
							configurable: true,
							get: () => 'hidden'
						});
						document.dispatchEvent(new Event('visibilitychange'));
					});
					await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();

					await page.getByRole('button', { name: 'Read the essay', exact: true }).click();
					await expect(page.getByRole('heading', { level: 1, name: ESSAY_TITLE })).toBeVisible();

					await page.evaluate(() => {
						Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
						Object.defineProperty(document, 'visibilityState', {
							configurable: true,
							get: () => 'visible'
						});
						document.dispatchEvent(new Event('visibilitychange'));
					});

					await page
						.getByRole('button', { name: /Return to painting/i })
						.first()
						.click();
					await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
					const hashAtReturn = await sha256CanvasPixels(page);
					await expect
						.poll(async () => await sha256CanvasPixels(page), { timeout: 5000 })
						.not.toBe(hashAtReturn);
					await finishIfPlaying(page);
					await assertCleanRuntime(tracker);
				}
			);
		});

		await test.step('T5-04b: Manual Pause remains paused across visibilitychange bounce', async () => {
			await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await page.getByRole('button', { name: 'Pause', exact: true }).click();
					await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
					const pausedHash = await sha256CanvasPixels(page);

					await page.evaluate(() => {
						Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
						document.dispatchEvent(new Event('visibilitychange'));
					});
					await page.waitForTimeout(100);
					await page.evaluate(() => {
						Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
						document.dispatchEvent(new Event('visibilitychange'));
					});
					await page.waitForTimeout(250);

					await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
					await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
					expect(await sha256CanvasPixels(page)).toBe(pausedHash);
					await finishIfPlaying(page);
					await assertCleanRuntime(tracker);
				}
			);
		});

		await test.step('T5-04c: prefers-reduced-motion activated while hidden settles playback upon visibility restore', async () => {
			await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

					await page.evaluate(() => {
						Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
						document.dispatchEvent(new Event('visibilitychange'));
					});
					await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();

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

		await test.step('T5-04d: Applying rejected or unchanged Seed preserves active playback and normalizes input', async () => {
			await withContext(
				browser,
				{ reducedMotion: 'no-preference' },
				async (_ctx, page, tracker) => {
					await page.goto(ROUTE_PATH);
					await finishIfPlaying(page);
					await openMoreOptions(page);
					await setSliderValue(page, 'Painting time', 20);
					const activeSeed = await readVisibleSeed(page);

					await page.getByRole('button', { name: 'Replay', exact: true }).click();
					const pauseBtn = page.getByRole('button', { name: 'Pause', exact: true });
					await expect(pauseBtn).toBeVisible();

					const seedInput = await getSeedInput(page);
					const applyBtn = page.getByRole('button', { name: /^Apply$/i });
					for (const noopSeed of ['0', '', activeSeed]) {
						await seedInput.fill(noopSeed);
						await applyBtn.click();
						await expect(pauseBtn).toBeVisible();
						await expect(seedInput).toHaveValue(activeSeed);
					}

					await finishIfPlaying(page);
					await assertCleanRuntime(tracker);
				}
			);
		});
	});

	test('T5-05: Export concurrency, focus restoration, narrow Save image toggle, storage resilience & Undo 24-cap', async ({
		browser
	}) => {
		await test.step('T5-05a: Synchronous 2048 px + 4096 px export clicks trigger one download and restore focus to Save image', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				let downloadCount = 0;
				page.on('download', () => {
					downloadCount += 1;
				});

				const saveBtn = page.getByRole('button', { name: 'Save image', exact: true });
				await saveBtn.click();
				const btn2048 = page.getByRole('button', { name: /2048\s*px/i });
				const btn4096 = page.getByRole('button', { name: /4096\s*px/i });
				await expect(btn2048).toBeVisible();
				await expect(btn4096).toBeVisible();

				const dlPromise = page.waitForEvent('download');
				await page.evaluate(() => {
					const buttons = Array.from(document.querySelectorAll('button'));
					const b2048 = buttons.find((b) => /2048\s*px/i.test(b.textContent ?? ''));
					const b4096 = buttons.find((b) => /4096\s*px/i.test(b.textContent ?? ''));
					b2048?.click();
					b4096?.click();
				});
				await dlPromise;
				await expect(btn2048).toHaveCount(0);
				await expect(saveBtn).toBeFocused();
				await page.waitForTimeout(250);
				expect(downloadCount).toBe(1);
				await assertCleanRuntime(tracker);
			});
		});

		await test.step('T5-05b: Narrow and short viewports (390x844, 320x568, 667x375) do not occlude Save image and second tap closes popover', async () => {
			for (const vp of [
				{ width: 390, height: 844 },
				{ width: 320, height: 568 },
				{ width: 667, height: 375 }
			]) {
				await withContext(
					browser,
					{
						viewport: vp,
						hasTouch: true,
						isMobile: true,
						reducedMotion: 'reduce'
					},
					async (_ctx, page, tracker) => {
						await page.goto(ROUTE_PATH);
						const saveBtn = page.getByRole('button', { name: 'Save image', exact: true });
						await saveBtn.click();
						const btn2048 = page.getByRole('button', { name: /2048\s*px/i });
						await expect(btn2048).toBeVisible();

						const btnBox = await saveBtn.boundingBox();
						expect(btnBox).not.toBeNull();
						const hitSelf = await saveBtn.evaluate((el) => {
							const r = el.getBoundingClientRect();
							const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
							return hit !== null && (hit === el || el.contains(hit));
						});
						expect(hitSelf, `${vp.width}x${vp.height} Save image center hit`).toBe(true);

						const popoverBox = await page
							.getByRole('region', { name: 'Save finished painting options' })
							.boundingBox();
						expect(popoverBox).not.toBeNull();
						expect(popoverBox!.y).toBeGreaterThanOrEqual(btnBox!.y + btnBox!.height - 1);
						expect(popoverBox!.y + popoverBox!.height).toBeLessThanOrEqual(vp.height + 1);

						await saveBtn.click();
						await expect(btn2048).toHaveCount(0);
						await assertCleanRuntime(tracker);
					}
				);
			}
		});

		await test.step('T5-05c: QuotaExceededError on localStorage.setItem and corrupt-type stored JSON keep studio usable', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.addInitScript(() => {
					const origSetItem = Storage.prototype.setItem;
					Storage.prototype.setItem = function (key: string, value: string) {
						if (value.includes('"passes"') || value.includes('"study"')) {
							throw new DOMException('Quota exceeded', 'QuotaExceededError');
						}
						return origSetItem.call(this, key, value);
					};
				});
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);
				await setSliderValue(page, 'Passes', 25);
				await selectStudy(page, 'Whitewash & Record');
				await applyCustomSeed(page, '123456');
				expect(await readVisibleSeed(page)).toBe('123456');
				expect((await analyzeCanvasPixels(page)).opaqueAll).toBe(true);
				await assertCleanRuntime(tracker);
			});

			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await ensureControlsExpanded(page);
				await setSliderValue(page, 'Passes', 25);

				const updatedKeys = await page.evaluate(() => {
					const bogus = JSON.stringify({
						version: 1,
						study: 'bogus',
						seed: null,
						passes: 'NaN',
						paintFlow: -10,
						sweepWidth: 999,
						paintLayers: 0,
						paintTexture: 'bad',
						paintingTime: null,
						artboardWidth: -500,
						artboardHeight: 'Infinity'
					});
					const keys = Object.keys(localStorage);
					for (const k of keys) {
						localStorage.setItem(k, bogus);
					}
					window.history.replaceState(null, '', window.location.pathname);
					return keys.length;
				});
				expect(updatedKeys).toBeGreaterThan(0);

				await page.reload();
				await expect(getCanvas(page)).toBeVisible();
				await ensureControlsExpanded(page);
				await expect(getKnobSlider(page, 'Passes')).toHaveAttribute('aria-valuenow', '18');
				expect((await analyzeCanvasPixels(page)).opaqueAll).toBe(true);
				await assertCleanRuntime(tracker);
			});
		});

		await test.step('T5-05d: Undo history caps cleanly at 24 entries across 29 committed edits', async () => {
			await withContext(browser, { reducedMotion: 'reduce' }, async (_ctx, page, tracker) => {
				await page.goto(ROUTE_PATH);
				await openMoreOptions(page);

				for (let val = 4; val <= 33; val += 1) {
					if (val === 18) continue;
					await setSliderValue(page, 'Passes', val);
				}

				const undoBtn = page.getByRole('button', { name: /^Undo/i });
				await expect(undoBtn).toHaveText('Undo (24)');
				for (let i = 0; i < 24; i += 1) {
					await undoBtn.click();
				}
				await expect(undoBtn).toBeDisabled();
				await assertCleanRuntime(tracker);
			});
		});
	});
});
