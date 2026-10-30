import { createHash } from 'node:crypto';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';

const articlePath = '/blog/visualizations/why-soap-bubbles-change-colour';
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
	const collected: string[] = [];
	errors.set(page, collected);
	page.on('pageerror', (error) => collected.push(error.message));
});

test.afterEach(async ({ page }) => {
	expect(errors.get(page) ?? [], 'The film should not raise unhandled browser errors').toEqual([]);
});

async function dismissMediaPrompt(page: Page) {
	for (const name of ['Keep videos paused', 'Reject optional', 'Dismiss privacy confirmation']) {
		const button = page.getByRole('button', { name, exact: true });
		if (await button.isVisible()) await button.click();
	}
}

async function ready(page: Page, query = '') {
	await page.goto(articlePath + query, { waitUntil: 'domcontentloaded' });
	await dismissMediaPrompt(page);
	const shell = page.getByRole('region', { name: 'Soap film interactive explanation' });
	await shell.scrollIntoViewIfNeeded();
	const app = shell.locator('.sf-experiment');
	await expect(app).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
	const canvas = app.locator('canvas');
	await canvas.scrollIntoViewIfNeeded();
	await expect(canvas).toHaveAttribute('data-frames', /[1-9]\d*/);
	return { shell, app, canvas };
}

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function canvasFingerprint(canvas: Locator) {
	// A screenshot reads the actual presented canvas; preserveDrawingBuffer is
	// intentionally disabled, so an arbitrary toDataURL call is not a valid probe.
	return hash(await canvas.screenshot());
}

async function centralChroma(screenshot: Buffer) {
	const metadata = await sharp(screenshot).metadata();
	// This central square lies inside the sphere, excluding its grazing rim,
	// background and labels. Normalised linear RGB separates optical colour
	// from neutral studio highlights that can change brightness during orbit.
	const side = Math.floor(Math.min(metadata.width!, metadata.height!) * 0.45);
	const { data, info } = await sharp(screenshot)
		.extract({
			left: Math.floor((metadata.width! - side) / 2),
			top: Math.floor((metadata.height! - side) / 2),
			width: side,
			height: side
		})
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const linear = (byte: number) => {
		const channel = byte / 255;
		return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	};
	const chroma: [number, number][] = [];
	for (let i = 0; i < data.length; i += info.channels) {
		const r = linear(data[i]);
		const g = linear(data[i + 1]);
		const b = linear(data[i + 2]);
		const total = r + g + b;
		chroma.push(total > 0.005 ? [r / total, g / total] : [0, 0]);
	}
	return chroma;
}

async function chromaDifference(before: Buffer, after: Buffer) {
	const a = await centralChroma(before);
	const b = await centralChroma(after);
	expect(b.length).toBe(a.length);
	let difference = 0;
	for (let i = 0; i < a.length; i++) {
		difference += Math.abs(a[i][0] - b[i][0]) + Math.abs(a[i][1] - b[i][1]);
	}
	return difference / (2 * a.length);
}

async function bubbleSilhouette(screenshot: Buffer) {
	const { data, info } = await sharp(screenshot)
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const cx = Math.floor(info.width / 2);
	const cy = Math.floor(info.height / 2);
	const lit = (x: number, y: number) => {
		const i = (y * info.width + x) * info.channels;
		return Math.max(data[i], data[i + 1], data[i + 2]) > 30;
	};
	// A five-pixel central cross measures the luminous bubble silhouette without
	// picking up the stage labels near its corners. Ignore the outer 4% to exclude
	// fractional screenshot rounding onto the UI border; the sphere has at least
	// a 9.5% background margin. A tilted flat disk still fails this measurement.
	const horizontal: number[] = [];
	const vertical: number[] = [];
	const marginX = Math.ceil(info.width * 0.04);
	const marginY = Math.ceil(info.height * 0.04);
	for (let x = marginX; x < info.width - marginX; x++) {
		if ([-2, -1, 0, 1, 2].some((dy) => lit(x, cy + dy))) horizontal.push(x);
	}
	for (let y = marginY; y < info.height - marginY; y++) {
		if ([-2, -1, 0, 1, 2].some((dx) => lit(cx + dx, y))) vertical.push(y);
	}
	expect(horizontal.length).toBeGreaterThan(info.height * 0.4);
	expect(vertical.length).toBeGreaterThan(info.height * 0.4);
	return {
		width: horizontal[horizontal.length - 1] - horizontal[0] + 1,
		height: vertical[vertical.length - 1] - vertical[0] + 1
	};
}

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

async function noHorizontalOverflow(page: Page) {
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
		'The article and controls should fit the viewport without horizontal scrolling'
	).toBe(true);
}

async function expectFrozen(canvas: Locator) {
	// Let a final input/visibility frame settle before measuring a stopped clock.
	await canvas.page().waitForTimeout(100);
	const time = await canvas.getAttribute('data-time');
	const frames = await canvas.getAttribute('data-frames');
	await canvas.page().waitForTimeout(250);
	await expect(canvas).toHaveAttribute('data-time', time!);
	await expect(canvas).toHaveAttribute('data-frames', frames!);
}

async function seedSiteMotion(page: Page, preference: 'still' | 'alive') {
	// Full-site bootstrap reads storage; the isolated feature preview has no site
	// bootstrap, so seed the same document contract before its lazy runtime mounts.
	await page.addInitScript((storedPreference) => {
		try {
			localStorage.setItem('site-motion', storedPreference);
		} catch {
			// The document attribute is still the feature's integration boundary.
		}
		const apply = () => {
			if (!document.documentElement) return false;
			document.documentElement.dataset.motionPreference = storedPreference;
			document.documentElement.dataset.motion = storedPreference;
			return true;
		};
		if (!apply()) {
			const observer = new MutationObserver(() => {
				if (apply()) observer.disconnect();
			});
			observer.observe(document, { childList: true });
		}
	}, preference);
}

async function changeSiteMotion(page: Page, preference: 'still' | 'alive' | 'gentle') {
	// Match the shared MotionSelect contract instead of changing private film state.
	await page.evaluate((next) => {
		document.documentElement.dataset.motionPreference = next;
		document.documentElement.dataset.motion = next;
		window.dispatchEvent(new CustomEvent('site-motion-change', { detail: next }));
	}, preference);
}

test('saved Still preference and live site changes pause the film while explicit Play remains available', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await seedSiteMotion(page, 'still');
	const { canvas } = await ready(page);
	await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'still');
	await expect(canvas).toHaveAttribute('data-time', '0.000');
	await expect(page.getByRole('button', { name: /Play/ })).toBeEnabled();
	await expectFrozen(canvas);

	await page.getByRole('button', { name: /Play/ }).click();
	await expect
		.poll(async () => Number(await canvas.getAttribute('data-time')))
		.toBeGreaterThan(0.1);
	await changeSiteMotion(page, 'alive');
	await expect(page.getByRole('button', { name: /Pause/ })).toBeEnabled();
	await changeSiteMotion(page, 'still');
	await expect(page.getByRole('button', { name: /Play/ })).toBeEnabled();
	await expectFrozen(canvas);

	const pausedTime = Number(await canvas.getAttribute('data-time'));
	await page.getByRole('button', { name: /Play/ }).click();
	await expect
		.poll(async () => Number(await canvas.getAttribute('data-time')))
		.toBeGreaterThan(pausedTime);
	await page.getByRole('button', { name: /Reset/ }).click();
	await expect(canvas).toHaveAttribute('data-time', '0.000');
	await expectFrozen(canvas);
});

test('the motion=reduce override remains effective after later site preference updates', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await seedSiteMotion(page, 'alive');
	const { canvas } = await ready(page, '?motion=reduce');
	await expect(page.locator('html')).toHaveAttribute('data-motion-preference', 'alive');
	await expect(canvas).toHaveAttribute('data-time', '0.000');
	await expectFrozen(canvas);

	await page.getByRole('button', { name: /Play/ }).click();
	await expect
		.poll(async () => Number(await canvas.getAttribute('data-time')))
		.toBeGreaterThan(0.1);
	await changeSiteMotion(page, 'gentle');
	await expect(page.getByRole('button', { name: /Play/ })).toBeEnabled();
	await expectFrozen(canvas);
	await changeSiteMotion(page, 'alive');
	await page.getByRole('button', { name: /Reset/ }).click();
	await expect(canvas).toHaveAttribute('data-time', '0.000');
	await expectFrozen(canvas);
});

test('reduced motion, worked example, keyboard changes and a real PNG export', async ({ page }) => {
	const { canvas } = await ready(page);
	await expect(page.getByRole('button', { name: /Play/ })).toBeEnabled();
	await expect(canvas).toHaveAttribute('data-time', '0.000');
	await expectFrozen(canvas);
	await noHorizontalOverflow(page);

	const flowingDefault = await canvas.screenshot();
	const framesBeforeEven = Number(await canvas.getAttribute('data-frames'));
	await page.getByRole('button', { name: 'Even thickness', exact: true }).click();
	await expect
		.poll(async () => Number(await canvas.getAttribute('data-frames')))
		.toBeGreaterThan(framesBeforeEven);
	await expect(canvas).toHaveAttribute('data-thickness', '480');
	await expect(canvas).toHaveAttribute('data-angle', '12');
	const evenDefault = await canvas.screenshot();
	expect(
		await chromaDifference(flowingDefault, evenDefault),
		'Even thickness must visibly replace flowing patches with radial colour bands'
	).toBeGreaterThan(0.025);
	const view = page.getByRole('slider', { name: /^Viewing angle/ });
	await view.focus();
	await view.press('Home');
	await expect(canvas).toHaveAttribute('data-angle', '0');
	const evenFront = await canvas.screenshot();
	await view.press('End');
	await expect(canvas).toHaveAttribute('data-angle', '65');
	const evenSide = await canvas.screenshot();
	const frontShape = await bubbleSilhouette(evenFront);
	const sideShape = await bubbleSilhouette(evenSide);
	for (const shape of [frontShape, sideShape]) {
		expect(
			shape.width / shape.height,
			'The spherical bubble must retain a round outline'
		).toBeGreaterThan(0.97);
		expect(shape.width / shape.height).toBeLessThan(1.03);
	}
	expect(
		Math.abs(frontShape.width - sideShape.width),
		'Orbit must not flatten the sphere'
	).toBeLessThanOrEqual(3);
	expect(Math.abs(frontShape.height - sideShape.height)).toBeLessThanOrEqual(3);
	expect(
		await chromaDifference(evenFront, evenSide),
		'Uniform thickness retains its radial optical pattern when orbiting'
	).toBeLessThan(0.02);

	await page.getByRole('button', { name: 'Flowing film', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Flowing film', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const flowFrames = Number(await canvas.getAttribute('data-frames'));
	await view.press('Home');
	await expect(canvas).toHaveAttribute('data-angle', '0');
	await expect
		.poll(async () => Number(await canvas.getAttribute('data-frames')))
		.toBeGreaterThan(flowFrames);
	const flowingFront = await canvas.screenshot();
	await view.press('End');
	await expect(canvas).toHaveAttribute('data-angle', '65');
	const flowingSide = await canvas.screenshot();
	expect(
		await chromaDifference(flowingFront, flowingSide),
		'Orbiting a flowing bubble reveals different surface patches'
	).toBeGreaterThan(0.025);

	await page.getByRole('button', { name: /Set it up/ }).click();
	await canvas.scrollIntoViewIfNeeded();
	await expect(canvas).toHaveAttribute('data-thickness', '400');
	await expect(canvas).toHaveAttribute('data-angle', '0');
	await expect(page.getByRole('button', { name: 'Even thickness', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const even400 = await canvasFingerprint(canvas);
	const thickness = page.getByRole('slider', { name: /^Film thickness/ });
	await thickness.focus();
	await thickness.press('ArrowLeft');
	await expect(thickness).toHaveValue('395');
	await expect(canvas).toHaveAttribute('data-thickness', '395');
	expect(
		await canvasFingerprint(canvas),
		'Changing wall thickness must change the radial colour pattern'
	).not.toBe(even400);
	const angle = page.getByRole('slider', { name: /^Viewing angle/ });
	await angle.focus();
	await angle.press('End');
	await expect(angle).toHaveValue('65');
	await expect(canvas).toHaveAttribute('data-angle', '65');

	await page.getByRole('button', { name: /Reset/ }).click();
	await expect(canvas).toHaveAttribute('data-thickness', '480');
	await expect(canvas).toHaveAttribute('data-angle', '12');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: /Save image/ }).click()
	]);
	expect(download.suggestedFilename()).toMatch(/^soap-film-480nm-12deg\.png$/);
	const bytes = await downloadBytes(download);
	const metadata = await sharp(bytes).metadata();
	const dimensions = await canvas.evaluate((element) => ({
		width: (element as HTMLCanvasElement).width,
		height: (element as HTMLCanvasElement).height
	}));
	expect(metadata.format).toBe('png');
	expect(metadata.width).toBe(dimensions.width);
	expect(metadata.height).toBe(dimensions.height);
	const stats = await sharp(bytes).stats();
	expect(stats.entropy, 'The download must contain an image, not a blank canvas').toBeGreaterThan(
		3
	);
	expect(stats.channels.some((channel) => channel.stdev > 20)).toBe(true);
	const { data, info } = await sharp(bytes)
		.resize({ width: 320 })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	let bright = 0;
	for (let i = 0; i < data.length; i += info.channels) {
		if (Math.max(data[i], data[i + 1], data[i + 2]) > 70) bright++;
	}
	expect(bright, 'The film should occupy substantial visible pixels').toBeGreaterThan(2000);
	await expect(page.getByText('Image saved.', { exact: true })).toBeVisible();
});

test('playback stops when paused or offscreen and reset restores the starting state', async ({
	page
}) => {
	const { canvas } = await ready(page);
	await page.getByRole('button', { name: /Play/ }).click();
	await expect
		.poll(async () => Number(await canvas.getAttribute('data-time')))
		.toBeGreaterThan(0.1);
	await page.getByRole('button', { name: /Pause/ }).click();
	await expectFrozen(canvas);
	await page.getByRole('button', { name: /Play/ }).click();
	const resumed = Number(await canvas.getAttribute('data-time'));
	await expect
		.poll(async () => Number(await canvas.getAttribute('data-time')))
		.toBeGreaterThan(resumed);
	await page
		.getByRole('heading', { name: 'What this example calculates', exact: true })
		.scrollIntoViewIfNeeded();
	await expectFrozen(canvas);
	const offscreenTime = Number(await canvas.getAttribute('data-time'));
	await canvas.scrollIntoViewIfNeeded();
	await expect
		.poll(async () => Number(await canvas.getAttribute('data-time')))
		.toBeGreaterThan(offscreenTime);
	await page.getByRole('button', { name: /Pause/ }).click();
	expect(Number(await canvas.getAttribute('data-time')) - offscreenTime).toBeLessThan(0.5);
	await page.getByRole('button', { name: /Reset/ }).click();
	await expect(canvas).toHaveAttribute('data-time', '0.000');
	await expect(canvas).toHaveAttribute('data-thickness', '480');
	await expect(page.getByRole('button', { name: 'Flowing film', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expectFrozen(canvas);

	// A fresh mount must start with one fresh clock, not carry an old animation on.
	await page.goto('about:blank');
	const remounted = await ready(page);
	await expect(remounted.canvas).toHaveAttribute('data-time', '0.000');
	await expectFrozen(remounted.canvas);
});

test('mobile touch controls work and the canvas and article fit the screen', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 1,
		isMobile: true,
		hasTouch: true,
		reducedMotion: 'reduce',
		serviceWorkers: 'block'
	});
	try {
		const page = await context.newPage();
		const collected: string[] = [];
		page.on('pageerror', (error) => collected.push(error.message));
		const { canvas } = await ready(page);
		await noHorizontalOverflow(page);
		const bounds = await canvas.boundingBox();
		expect(bounds!.width).toBeLessThanOrEqual(390);
		const evenButton = page.getByRole('button', { name: 'Even thickness', exact: true });
		// Reproduce reaching a control after scrolling past the film. Changing its
		// appearance must bring the actual result back into view without another swipe.
		await evenButton.evaluate((element) =>
			element.scrollIntoView({ block: 'start', behavior: 'instant' })
		);
		await expect(canvas).not.toBeInViewport();
		await evenButton.tap();
		await expect(canvas).toBeInViewport({ ratio: 0.95 });
		await expect(page.getByRole('button', { name: 'Even thickness', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		const angle = page.getByRole('slider', { name: /^Viewing angle/ });
		await angle.scrollIntoViewIfNeeded();
		const range = await angle.boundingBox();
		await page.touchscreen.tap(range!.x + range!.width * 0.75, range!.y + range!.height / 2);
		expect(Number(await angle.inputValue())).toBeGreaterThan(30);
		await canvas.scrollIntoViewIfNeeded();
		await expect(canvas).toHaveAttribute('data-angle', await angle.inputValue());
		await noHorizontalOverflow(page);
		expect(collected).toEqual([]);
	} finally {
		await context.close();
	}
});

test('context loss and explicit no-WebGL mode retain a readable poster and explanation', async ({
	page
}) => {
	const { app, canvas } = await ready(page);
	const lost = await canvas.evaluate((element) => {
		const gl = (element as HTMLCanvasElement).getContext('webgl');
		const extension = gl?.getExtension('WEBGL_lose_context');
		if (!extension) return false;
		extension.loseContext();
		return true;
	});
	expect(lost, 'Chromium should expose a context-loss test extension').toBe(true);
	await expect(app).toHaveAttribute('data-ready', 'false');
	await expect(page.getByText(/graphics connection was interrupted/)).toBeVisible();
	await expect(app.locator('img.sf-fallback')).toBeVisible();
	await expect(page.getByRole('button', { name: /Save image/ })).toBeDisabled();

	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	await dismissMediaPrompt(page);
	await expect(page.getByText(/Interactive graphics are unavailable/)).toBeVisible();
	const poster = page.locator('.sf-fallback');
	await expect(poster).toBeVisible();
	expect(
		await poster.evaluate((element) => (element as HTMLImageElement).naturalWidth)
	).toBeGreaterThan(0);
	await expect(page.getByRole('slider', { name: /^Average thickness/ })).toBeDisabled();
	await expect(
		page.getByRole('heading', { name: 'Two surfaces, one reflected colour', exact: true })
	).toBeVisible();
});

test('without JavaScript the server-rendered poster and full article remain usable', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		serviceWorkers: 'block'
	});
	try {
		const page = await context.newPage();
		const response = await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		expect(response?.ok()).toBe(true);
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
		await expect(page.getByText(/Enable JavaScript to change its film thickness/)).toBeVisible();
		const poster = page.locator('.sf-placeholder img');
		await expect(poster).toBeVisible();
		expect(
			await poster.evaluate((element) => (element as HTMLImageElement).naturalWidth)
		).toBeGreaterThan(0);
		await expect(
			page.getByRole('heading', { name: 'Change one thing first', exact: true })
		).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'What this example calculates', exact: true })
		).toBeVisible();
	} finally {
		await context.close();
	}
});
