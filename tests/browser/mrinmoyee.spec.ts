import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import type { AtelierDesign } from '../../src/lib/visualizations/mrinmoyee/types';

const articlePath = '/blog/visualizations/mrinmoyee-the-durga-atelier';
const posterPath = '/images/visualizations/mrinmoyee/mrinmoyee-poster.jpg';
const presetNames = [
	'Kumartuli Atelier',
	'Shola and Vermilion',
	'Golden Evening',
	'Terracotta Reverie',
	'Moonlit Silver',
	'Contemporary Pandal'
];
const root = (page: Page) => page.getByTestId('mrinmoyee-atelier');
const viewport = (page: Page) => page.getByTestId('atelier-viewport');
const canvas = (page: Page) => viewport(page).locator('canvas');

function diagnostics(page: Page): string[] {
	const messages: string[] = [];
	page.on('pageerror', (error) => messages.push(error.message));
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		if (/\/_vercel\/|favicon/iu.test(`${message.location().url} ${message.text()}`)) return;
		messages.push(message.text());
	});
	return messages;
}

async function ready(page: Page, path = articlePath): Promise<Locator> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	await expect(root(page)).toBeVisible();
	await root(page).locator('.m-stage').scrollIntoViewIfNeeded();
	await expect(root(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
	await expect(viewport(page)).toHaveAttribute('data-render-status', 'ready');
	await expect(canvas(page)).toHaveCount(1);
	await expect(canvas(page)).toHaveAttribute('tabindex', '0');
	return root(page);
}

async function currentDesign(page: Page): Promise<AtelierDesign | null> {
	return page.evaluate(() => {
		const encoded = location.hash.slice('#atelier='.length);
		if (!location.hash.startsWith('#atelier=') || !encoded) return null;
		try {
			const binary = atob(encoded.replace(/-/gu, '+').replace(/_/gu, '/'));
			return JSON.parse(
				new TextDecoder().decode(Uint8Array.from(binary, (value) => value.charCodeAt(0)))
			);
		} catch {
			return null;
		}
	});
}

async function waitDesign(page: Page, properties: Partial<AtelierDesign>): Promise<void> {
	const { camera: expectedCamera, ...expected } = properties;
	await expect.poll(() => currentDesign(page)).toMatchObject(expected);
	if (expectedCamera) {
		await expect
			.poll(async () => {
				const actual = (await currentDesign(page))?.camera;
				return (
					actual &&
					(['position', 'target'] as const).every((key) =>
						actual[key].every((value, index) => Math.abs(value - expectedCamera[key][index]) < 1e-8)
					)
				);
			})
			.toBe(true);
	}
}

function expectSameDesign(actual: AtelierDesign, expected: AtelierDesign): void {
	const { camera: actualCamera, ...actualFields } = actual;
	const { camera: expectedCamera, ...expectedFields } = expected;
	expect(actualFields).toEqual(expectedFields);
	for (const key of ['position', 'target'] as const) {
		for (let index = 0; index < 3; index++) {
			expect(actualCamera[key][index]).toBeCloseTo(expectedCamera[key][index], 8);
		}
	}
}

async function tab(page: Page, name: string): Promise<void> {
	await root(page)
		.getByRole('tab', { name: new RegExp(name, 'iu') })
		.click();
}

async function details(page: Page, name: string): Promise<void> {
	const summary = root(page).locator('details > summary').filter({ hasText: name }).first();
	if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
}

async function setRange(page: Page, name: string, value: number): Promise<void> {
	const control = root(page).getByRole('slider', { name: new RegExp(`^${name}`, 'iu') });
	await control.evaluate((element, next) => {
		const input = element as HTMLInputElement;
		input.value = String(next);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}, value);
}

async function bytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream)
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks);
}

async function cornerAlpha(png: Buffer): Promise<number[]> {
	// stats() measures its original input, so materialise the crop before inspecting pixels.
	const crop = await sharp(png)
		.extract({ left: 0, top: 0, width: 8, height: 8 })
		.ensureAlpha()
		.raw()
		.toBuffer();
	return Array.from(crop).filter((_, index) => index % 4 === 3);
}

async function downloadJson(page: Page): Promise<AtelierDesign> {
	const downloading = page.waitForEvent('download');
	await root(page).getByRole('button', { name: 'Download design JSON' }).click();
	return JSON.parse((await bytes(await downloading)).toString('utf8'));
}

test('SSR and the JavaScript-free page preserve the artwork, article and cultural references', async ({
	browser,
	request,
	baseURL
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain('data-testid="mrinmoyee-atelier"');
	expect(html).toContain(posterPath);
	expect(html).toContain('A face before a spectacle');
	expect(html).not.toContain('renderer.ts');
	expect(html.match(/<h1(?=\s|>)/giu)).toHaveLength(1);
	const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Mrinmoyee');
		await expect(
			page
				.locator('p')
				.filter({ hasText: /Published\s+20 October 2026\s+·\s+Updated\s+20 October 2026/u })
		).toBeVisible();
		await expect(page.getByRole('heading', { name: 'A face before a spectacle' })).toBeVisible();
		await expect(page.locator(`noscript img[src="${posterPath}"]`)).toBeVisible();
		await expect(
			page.getByRole('link', { name: 'Durga Puja in Kolkata', exact: true })
		).toHaveAttribute('href', /ich\.unesco\.org/u);
		await expect(
			page.getByRole('link', { name: /twelfth-century Bengal sculpture/iu })
		).toHaveAttribute('href', /metmuseum\.org/u);
		const poster = await request.get(posterPath);
		expect(poster.ok()).toBe(true);
		expect(poster.headers()['content-type']).toContain('image/jpeg');
	} finally {
		await context.close();
	}
});

test('the six curated compositions render through one real WebGL canvas without runtime errors', async ({
	page
}) => {
	const messages = diagnostics(page);
	await ready(page);
	const bounds = await root(page).boundingBox();
	expect(bounds).not.toBeNull();
	expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
	expect((bounds?.x ?? 0) + (bounds?.width ?? Infinity)).toBeLessThanOrEqual(
		(page.viewportSize()?.width ?? 1440) + 1
	);
	expect(
		await canvas(page).evaluate((element) =>
			Boolean((element as HTMLCanvasElement).getContext('webgl2'))
		)
	).toBe(true);
	for (const name of presetNames) {
		const preset = root(page).getByRole('button', { name, exact: true });
		await preset.click();
		await expect(preset).toHaveAttribute('aria-pressed', 'true');
		await expect(root(page).locator('.m-view-label')).toContainText(name);
		await expect(root(page)).toHaveAttribute('data-status', 'ready');
		await expect(canvas(page)).toHaveCount(1);
		await waitDesign(page, {
			presetId: [
				'kumartuli',
				'shola-vermilion',
				'golden-evening',
				'terracotta',
				'moonlit-silver',
				'contemporary'
			][presetNames.indexOf(name)]
		});
		await canvas(page).scrollIntoViewIfNeeded();
		const capture = await canvas(page).screenshot();
		const statistics = await sharp(capture).stats();
		expect(statistics.channels[0].max - statistics.channels[0].min).toBeGreaterThan(30);
	}
	expect(messages).toEqual([]);
});

test('sculpture and setting controls survive sharing, undo and locked variations', async ({
	page
}) => {
	const messages = diagnostics(page);
	await ready(page, `${articlePath}?from=browser-test`);
	await tab(page, 'Sculpt & dress');
	await root(page)
		.getByRole('combobox', { name: 'Expression', exact: true })
		.selectOption('gentle');
	await setRange(page, 'Face width', 1.06);
	await setRange(page, 'Painted eyes', 1.1);
	await setRange(page, 'Head inclination', 4);
	await root(page).getByRole('combobox', { name: 'Arm composition' }).selectOption('open');
	await details(page, 'Dress & colour');
	for (const [name, value] of [
		['Sari', '#463e82'],
		['Border', '#d5ab62'],
		['Blouse', '#281c49'],
		['Painted clay', '#e4b67b']
	]) {
		await root(page)
			.getByLabel(new RegExp(`^${name}`, 'iu'))
			.evaluate((element, next) => {
				const input = element as HTMLInputElement;
				input.value = next;
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.dispatchEvent(new Event('change', { bubbles: true }));
			}, value);
	}
	await root(page).getByRole('combobox', { name: 'Woven motif' }).selectOption('vine');
	await details(page, 'Crown & ornament');
	await root(page).getByRole('combobox', { name: 'Crown finish' }).selectOption('silver');
	await setRange(page, 'Crown scale', 1.12);
	await setRange(page, 'Ornament density', 0.55);
	await root(page).getByRole('combobox', { name: 'Halo', exact: true }).selectOption('sunburst');
	await details(page, 'Material');
	await root(page).getByRole('button', { name: 'Aged bronze', exact: true }).click();
	await tab(page, 'Light & setting');
	await setRange(page, 'Warmth', 0.35);
	await setRange(page, 'Light direction', 35);
	await setRange(page, 'Exposure', 1.25);
	await setRange(page, 'Lamplight', 0.5);
	await root(page).getByRole('button', { name: 'Extinguish the lamps' }).click();
	await root(page).getByRole('combobox', { name: 'Setting', exact: true }).selectOption('indigo');
	await root(page).getByRole('combobox', { name: 'Garland', exact: true }).selectOption('jasmine');
	await root(page).getByRole('checkbox', { name: 'Flower garlands' }).uncheck();
	await root(page).getByRole('checkbox', { name: 'Hanging brass bells' }).uncheck();
	await root(page).getByRole('checkbox', { name: 'Lion on the pedestal' }).uncheck();
	await setRange(page, 'Incense & atmosphere', 0.1);
	await setRange(page, 'Construction stage', 4);
	await root(page).getByRole('button', { name: 'Three-quarter', exact: true }).click();
	await waitDesign(page, {
		presetId: 'custom',
		face: 'gentle',
		faceWidth: 1.06,
		eyeScale: 1.1,
		headTilt: 4,
		pose: 'open',
		material: 'bronze',
		sariColor: '#463e82',
		borderColor: '#d5ab62',
		blouseColor: '#281c49',
		skinColor: '#e4b67b',
		sariPattern: 'vine',
		crown: 'silver',
		crownScale: 1.12,
		ornamentDensity: 0.55,
		halo: 'sunburst',
		backdrop: 'indigo',
		garland: 'jasmine',
		flowers: false,
		bells: false,
		lion: false,
		atmosphere: 0.1,
		lightWarmth: 0.35,
		lightAngle: 35,
		exposure: 1.25,
		lampIntensity: 0.5,
		lamps: false,
		stage: 4,
		camera: { position: [8, 5, 12], target: [0, 3.8, 0] }
	});
	const chosen = await currentDesign(page);
	await root(page)
		.getByRole('button', { name: /Share design/iu })
		.click();
	const shared = await root(page)
		.getByRole('textbox', { name: 'Your complete design link' })
		.inputValue();
	expect(shared).toContain('from=browser-test');
	await ready(page, shared);
	expectSameDesign((await currentDesign(page))!, chosen!);
	await tab(page, 'Inspiration');
	for (const name of ['Keep face', 'Keep pose', 'Keep dress', 'Keep ornament', 'Keep setting']) {
		await root(page)
			.getByRole('button', { name: new RegExp(name, 'iu') })
			.click();
	}
	await root(page)
		.getByRole('button', { name: /Create a variation/iu })
		.click();
	await expect(root(page).locator('.m-status')).toContainText(/locked/iu);
	expectSameDesign((await currentDesign(page))!, chosen!);
	const seed = root(page).getByLabel('Pattern seed');
	await seed.fill('A new pattern');
	await seed.press('Tab');
	await waitDesign(page, { seed: 'A new pattern' });
	await root(page).getByRole('button', { name: 'Undo design change' }).click();
	await waitDesign(page, { seed: chosen?.seed });
	await root(page).getByRole('button', { name: 'Redo design change' }).click();
	await waitDesign(page, { seed: 'A new pattern' });
	await page.evaluate((url) => {
		location.hash = new URL(url).hash;
	}, shared);
	await expect(seed).toHaveValue(chosen?.seed ?? '');
	await expect(root(page).locator('.m-status')).toContainText('Shared composition restored');
	await expect(root(page).getByRole('button', { name: 'Undo design change' })).toBeDisabled();
	expectSameDesign((await currentDesign(page))!, chosen!);
	expect(messages).toEqual([]);
});

test('the device gallery survives reload and supports compare, restore and removal', async ({
	page
}) => {
	await ready(page);
	await root(page).getByRole('button', { name: 'Moonlit Silver', exact: true }).click();
	await waitDesign(page, { presetId: 'moonlit-silver' });
	await tab(page, 'Your collection');
	await root(page).getByLabel('Design name').fill('Moon over the atelier');
	await root(page).getByRole('button', { name: 'Save on this device' }).click();
	await expect(root(page).locator('.m-saved')).toHaveCount(1);
	await expect(root(page).locator('.m-saved')).toContainText('Moon over the atelier');
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(root(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
	await tab(page, 'Inspiration');
	await root(page).getByRole('button', { name: 'Golden Evening', exact: true }).click();
	await tab(page, 'Your collection');
	const saved = root(page).locator('.m-saved').filter({ hasText: 'Moon over the atelier' });
	await saved.getByRole('button', { name: 'Compare', exact: true }).click();
	await expect(root(page).locator('.m-comparison-label')).toContainText('Viewing the saved design');
	await expect(root(page).locator('.m-view-label')).toContainText('Moon over the atelier');
	const compared = await downloadJson(page);
	expect(compared.presetId).toBe('moonlit-silver');
	await root(page)
		.getByRole('button', { name: /Share design/iu })
		.click();
	const comparisonLink = await root(page)
		.getByRole('textbox', { name: 'Your complete design link' })
		.inputValue();
	const linked = JSON.parse(
		Buffer.from(new URL(comparisonLink).hash.slice('#atelier='.length), 'base64url').toString(
			'utf8'
		)
	);
	expect(linked).toEqual(compared);
	await root(page).getByLabel('Design name').fill('Moonlit comparison copy');
	await root(page).getByRole('button', { name: 'Save on this device' }).click();
	await expect(root(page).locator('.m-saved')).toHaveCount(2);
	const latestSaved = await page.evaluate(
		() => JSON.parse(localStorage.getItem('mrinmoyee.designs.v1') ?? '[]')[0]
	);
	expect(latestSaved).toMatchObject({ name: 'Moonlit comparison copy', design: compared });
	expect(latestSaved.thumbnail).toMatch(/^data:image\/jpeg;base64,/u);
	await root(page)
		.getByRole('button', { name: /Return to current/iu })
		.click();
	await expect(root(page).locator('.m-view-label')).toContainText('Golden Evening');
	await saved.getByRole('button', { name: 'Open', exact: true }).click();
	await waitDesign(page, { presetId: 'moonlit-silver' });
	await root(page).getByRole('button', { name: 'Remove Moonlit comparison copy' }).click();
	await saved.getByRole('button', { name: 'Remove Moon over the atelier' }).click();
	await expect(saved).toHaveCount(0);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(root(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
	await tab(page, 'Your collection');
	await expect(root(page).locator('.m-empty')).toContainText('Your first composition');
});

test('JSON downloads are complete and malformed imports do not replace the artwork', async ({
	page
}) => {
	await ready(page);
	await root(page).getByRole('button', { name: 'Contemporary Pandal', exact: true }).click();
	await waitDesign(page, { presetId: 'contemporary' });
	await tab(page, 'Your collection');
	const original = await downloadJson(page);
	expect(original).toMatchObject({
		version: 1,
		presetId: 'contemporary',
		pose: 'open',
		backdrop: 'pandal'
	});
	const file = root(page).getByLabel('Import design JSON file');
	await file.setInputFiles({
		name: 'bad.json',
		mimeType: 'application/json',
		buffer: Buffer.from('{"version":2}')
	});
	await expect(root(page).locator('.m-status')).toContainText('version 1');
	expect((await currentDesign(page))?.presetId).toBe('contemporary');
	await file.setInputFiles({
		name: 'broken.json',
		mimeType: 'application/json',
		buffer: Buffer.from('{')
	});
	await expect(root(page).locator('.m-status')).toContainText('valid JSON');
	const imported = {
		...original,
		presetId: 'custom',
		seed: 'Portable Bengali composition',
		sariColor: '#831b4a',
		camera: { position: [8, 5, 12], target: [0, 3.8, 0] }
	};
	await file.setInputFiles({
		name: 'composition.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(imported))
	});
	await expect(root(page).locator('.m-status')).toContainText('Imported design restored');
	await waitDesign(page, imported as AtelierDesign);
	expectSameDesign(await downloadJson(page), imported as AtelierDesign);
});

test('PNG exports use the selected dimensions and preserve transparent background alpha', async ({
	page
}) => {
	await ready(page);
	await root(page)
		.getByRole('button', { name: /Export artwork/iu })
		.click();
	const dialog = root(page).getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('combobox', { name: 'Composition', exact: true }).selectOption('square');
	const first = page.waitForEvent('download');
	await dialog.getByRole('button', { name: /Download artwork/iu }).click();
	const firstDownload = await first;
	await firstDownload.saveAs(test.info().outputPath('opaque-artwork.png'));
	const opaque = await bytes(firstDownload);
	expect(await sharp(opaque).metadata()).toMatchObject({
		width: 1600,
		height: 1600,
		format: 'png'
	});
	expect(await cornerAlpha(opaque)).toEqual(Array(64).fill(255));
	await expect(dialog).not.toBeVisible();
	await root(page)
		.getByRole('button', { name: /Export artwork/iu })
		.click();
	await dialog.getByRole('combobox', { name: 'Composition', exact: true }).selectOption('portrait');
	await dialog.getByRole('checkbox', { name: 'Transparent background' }).check();
	const second = page.waitForEvent('download');
	await dialog.getByRole('button', { name: /Download artwork/iu }).click();
	const secondDownload = await second;
	await secondDownload.saveAs(test.info().outputPath('transparent-artwork.png'));
	const transparent = await bytes(secondDownload);
	expect(await sharp(transparent).metadata()).toMatchObject({
		width: 1200,
		height: 1600,
		format: 'png',
		hasAlpha: true
	});
	const alpha = await sharp(transparent).ensureAlpha().stats();
	expect(alpha.channels[3].min).toBe(0);
	expect(alpha.channels[3].max).toBe(255);
	expect(await cornerAlpha(transparent)).toEqual(Array(64).fill(0));
});

test('phone layout, keyboard tabs and reduced motion keep the sculpture usable and still', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await ready(page);
	await expect(root(page).getByRole('button', { name: /Sound off/iu })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	const overflow = await root(page).evaluate((element) => ({
		document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		exhibit: element.scrollWidth - element.clientWidth
	}));
	expect(overflow.document).toBeLessThanOrEqual(1);
	expect(overflow.exhibit).toBeLessThanOrEqual(1);
	const inspiration = root(page).getByRole('tab', { name: /Inspiration/iu });
	await inspiration.focus();
	await page.keyboard.press('ArrowRight');
	await expect(root(page).getByRole('tab', { name: /Sculpt & dress/iu })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(root(page).getByRole('tab', { name: /Sculpt & dress/iu })).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(root(page).getByRole('tab', { name: /Light & setting/iu })).toBeFocused();
	await expect(
		root(page).getByRole('checkbox', { name: 'Gentle ambient movement' })
	).toBeDisabled();
	await expect(
		root(page).getByRole('checkbox', { name: 'Gentle ambient movement' })
	).not.toBeChecked();
	await canvas(page).scrollIntoViewIfNeeded();
	await expect.poll(() => canvas(page).getAttribute('data-render-count')).not.toBeNull();
	await page.waitForTimeout(350);
	const frame = await canvas(page).getAttribute('data-render-count');
	await page.waitForTimeout(350);
	expect(await canvas(page).getAttribute('data-render-count')).toBe(frame);
	const presentationButton = root(page).getByRole('button', { name: /Present/iu });
	await presentationButton.click();
	await expect(root(page).getByRole('button', { name: /Return to atelier/iu })).toBeFocused();
	await expect(root(page).getByRole('button', { name: 'Slow camera orbit' })).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(presentationButton).toBeVisible();
	await expect(presentationButton).toBeFocused();
	await canvas(page).focus();
	await page.keyboard.press('ArrowRight');
	await expect.poll(async () => (await currentDesign(page))?.camera.position[0] ?? 0).not.toBe(0);
});

test('real context loss shows a poster, retry restores the design and navigation disposes the renderer', async ({
	page
}) => {
	const messages = diagnostics(page);
	await ready(page);
	await root(page).getByRole('button', { name: 'Terracotta Reverie', exact: true }).click();
	await waitDesign(page, { presetId: 'terracotta' });
	const oldCanvas = await canvas(page).elementHandle();
	const lost = await canvas(page).evaluate((element) => {
		const gl = (element as HTMLCanvasElement).getContext('webgl2');
		const extension = gl?.getExtension('WEBGL_lose_context');
		if (!extension) return false;
		extension.loseContext();
		return true;
	});
	expect(lost).toBe(true);
	await expect(root(page)).toHaveAttribute('data-status', 'fallback');
	await expect(viewport(page).locator(`img[src="${posterPath}"]`)).toBeVisible();
	await expect(root(page).getByRole('button', { name: /Export artwork/iu })).toBeDisabled();
	await root(page).getByRole('button', { name: 'Retry interactive view' }).click();
	await expect(root(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
	await expect(canvas(page)).toHaveCount(1);
	await expect.poll(() => oldCanvas?.evaluate((element) => element.dataset.disposed)).toBe('true');
	expect((await currentDesign(page))?.presetId).toBe('terracotta');
	const activeCanvas = await canvas(page).elementHandle();
	await root(page)
		.getByRole('link', { name: /Visualizations/iu })
		.click();
	await expect(page).toHaveURL(/\/blog\/visualizations\/?$/u);
	await expect
		.poll(() => activeCanvas?.evaluate((element) => element.dataset.disposed))
		.toBe('true');
	await expect(root(page)).toHaveCount(0);
	const count = await activeCanvas?.evaluate((element) => element.dataset.renderCount);
	await page.waitForTimeout(150);
	expect(await activeCanvas?.evaluate((element) => element.dataset.renderCount)).toBe(count);
	expect(messages).toEqual([]);
});

type AudioRaceProbe = {
	pendingResumes: number;
	createdOscillators: number;
	startedTones: number;
	suspends: number;
	resolveResume: () => void;
	setHidden: (hidden: boolean) => void;
};

test('hiding during pending audio startup cancels that sound request even after returning', async ({
	page
}) => {
	await page.addInitScript(() => {
		let hidden = false;
		const pending: (() => void)[] = [];
		const probe: AudioRaceProbe = {
			pendingResumes: 0,
			createdOscillators: 0,
			startedTones: 0,
			suspends: 0,
			resolveResume() {
				const finish = pending.shift();
				probe.pendingResumes = pending.length;
				finish?.();
			},
			setHidden(value) {
				hidden = value;
				document.dispatchEvent(new Event('visibilitychange'));
			}
		};
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => (hidden ? 'hidden' : 'visible')
		});
		const parameter = () => ({
			value: 0,
			setTargetAtTime() {},
			setValueAtTime() {},
			exponentialRampToValueAtTime() {}
		});
		class DeferredAudioContext {
			state = 'suspended';
			currentTime = 0;
			destination = {};
			resume() {
				return new Promise<void>((resolve) => {
					pending.push(resolve);
					probe.pendingResumes = pending.length;
				});
			}
			suspend() {
				probe.suspends++;
				this.state = 'suspended';
				return Promise.resolve();
			}
			close() {
				this.state = 'closed';
				return Promise.resolve();
			}
			createGain() {
				return { gain: parameter(), connect() {}, disconnect() {} };
			}
			createOscillator() {
				probe.createdOscillators++;
				return {
					type: 'sine',
					frequency: parameter(),
					onended: null,
					connect() {},
					disconnect() {},
					start() {
						probe.startedTones++;
					},
					stop() {}
				};
			}
		}
		Object.defineProperty(window, 'AudioContext', {
			configurable: true,
			value: DeferredAudioContext
		});
		Object.assign(window, { __atelierAudioProbe: probe });
	});
	const messages = diagnostics(page);
	await ready(page);
	const sound = root(page)
		.locator('.m-heading')
		.getByRole('button', { name: /Sound off/iu });
	await sound.click();
	await expect(sound).toBeDisabled();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as Window & { __atelierAudioProbe: AudioRaceProbe })
						.__atelierAudioProbe.pendingResumes
			)
		)
		.toBe(1);
	await page.evaluate(() => {
		const probe = (window as unknown as Window & { __atelierAudioProbe: AudioRaceProbe })
			.__atelierAudioProbe;
		probe.setHidden(true);
		probe.setHidden(false);
		probe.resolveResume();
	});
	await expect(sound).toBeEnabled();
	await expect(sound).toHaveAttribute('aria-pressed', 'false');
	await expect(sound).toContainText('Sound off');
	const canceled = await page.evaluate(() => {
		const probe = (window as unknown as Window & { __atelierAudioProbe: AudioRaceProbe })
			.__atelierAudioProbe;
		return {
			pendingResumes: probe.pendingResumes,
			createdOscillators: probe.createdOscillators,
			startedTones: probe.startedTones,
			suspends: probe.suspends
		};
	});
	expect(canceled).toEqual({
		pendingResumes: 0,
		createdOscillators: 0,
		startedTones: 0,
		suspends: expect.any(Number)
	});
	expect(canceled.suspends).toBeGreaterThanOrEqual(1);
	// A new explicit request still works; cancellation must not permanently disable sound.
	await sound.click();
	await expect(sound).toBeDisabled();
	await page.evaluate(() =>
		(
			window as unknown as Window & { __atelierAudioProbe: AudioRaceProbe }
		).__atelierAudioProbe.resolveResume()
	);
	const enabledSound = root(page)
		.locator('.m-heading')
		.getByRole('button', { name: /Sound on/iu });
	await expect(enabledSound).toBeEnabled();
	await expect(enabledSound).toHaveAttribute('aria-pressed', 'true');
	expect(
		await page.evaluate(
			() =>
				(window as unknown as Window & { __atelierAudioProbe: AudioRaceProbe }).__atelierAudioProbe
					.startedTones
		)
	).toBe(4);
	await enabledSound.click();
	await expect(sound).toHaveAttribute('aria-pressed', 'false');
	expect(messages).toEqual([]);
});
