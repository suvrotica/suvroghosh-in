import AxeBuilder from '@axe-core/playwright';
import {
	expect,
	test,
	type Browser,
	type Download,
	type Locator,
	type Page
} from '@playwright/test';

const articlePath = '/blog/visualizations/the-chitin-engine';
const articleTitle = 'The Chitin Engine: A Xenobiological Creature Foundry';
const fixedPath = `${articlePath}?ce_v=1&ce_seed=browser-audit-1847&ce_preset=glassback-knifemite&ce_world=terminator-line&ce_view=specimen`;
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const runtimeDiagnostics = new WeakMap<Page, string[]>();

function foundry(page: Page): Locator {
	return page.getByTestId('chitin-engine');
}

function viewport(page: Page): Locator {
	return page.getByTestId('chitin-viewport');
}

function liveCanvas(page: Page): Locator {
	return viewport(page).locator('canvas[data-chitin-canvas="true"]');
}

function readout(page: Page): Locator {
	return page.getByTestId('chitin-readout');
}

function collectUnexpectedRuntimeDiagnostics(page: Page): string[] {
	const diagnostics: string[] = [];
	page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/') || /favicon/iu.test(source)) return;
		diagnostics.push(`console error: ${message.text()}`);
	});
	return diagnostics;
}

async function waitForFoundry(page: Page, path = fixedPath): Promise<Locator> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	return waitForCurrentFoundry(page);
}

async function waitForCurrentFoundry(page: Page): Promise<Locator> {
	const root = foundry(page);
	await expect(root).toHaveCount(1);
	await root.scrollIntoViewIfNeeded();
	await expect(root).toBeVisible();
	await expect(viewport(page)).toBeVisible();
	await expect(liveCanvas(page)).toHaveCount(1, { timeout: 60_000 });
	await expect(viewport(page)).toHaveAttribute('data-renderer-status', /^(ready|fallback)$/u, {
		timeout: 60_000
	});
	await expect(viewport(page)).toHaveAttribute('data-renderer', /^(webgl2|canvas2d)$/u);
	await expect(liveCanvas(page)).toHaveAttribute('data-renderer-status', /^(ready|fallback)$/u);
	const box = await liveCanvas(page).boundingBox();
	expect(box?.width ?? 0).toBeGreaterThan(250);
	expect(box?.height ?? 0).toBeGreaterThan(260);
	return root;
}

async function openControlsSection(root: Locator, name: string): Promise<Locator> {
	const summary = root
		.getByTestId('chitin-controls')
		.locator('details > summary')
		.filter({ hasText: new RegExp(`^\\s*${name}\\s*$`, 'iu') })
		.first();
	const details = summary.locator('..');
	if ((await details.getAttribute('open')) === null) await summary.click();
	await expect(details).toHaveAttribute('open', '');
	return details;
}

async function seedValue(page: Page): Promise<string> {
	return foundry(page).getByLabel('Deterministic seed').inputValue();
}

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

function pngDimensions(png: Buffer): { width: number; height: number } {
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

async function openExportMenu(root: Locator): Promise<Locator> {
	const details = root.locator('details.export-menu');
	if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
	await expect(details).toHaveAttribute('open', '');
	return details;
}

async function expectNoDuplicateIds(page: Page): Promise<void> {
	const duplicates = await foundry(page).evaluate((root) => {
		const counts = new Map<string, number>();
		for (const element of root.querySelectorAll<HTMLElement>('[id]')) {
			counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
		}
		return [...counts].filter(([, count]) => count > 1);
	});
	expect(duplicates).toEqual([]);
}

test.beforeEach(({ page }) => {
	runtimeDiagnostics.set(page, collectUnexpectedRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(runtimeDiagnostics.get(page) ?? []).toEqual([]);
});

test('SSR semantics hydrate into exactly one live renderer with a clean canonical URL', async ({
	page,
	request
}) => {
	const response = await request.get(`${fixedPath}&utm_source=browser-audit`);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain(articleTitle);
	expect(html).toContain('data-testid="chitin-engine"');
	expect(html).toContain('ARCHIVE FICTION — NOT A REAL DISCOVERY');
	expect(html).toContain('Static Chitin Engine fallback');
	expect(html).not.toContain('data-chitin-canvas="true"');
	const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/iu)?.[1] ?? '';
	expect(canonical).toMatch(/\/blog\/visualizations\/the-chitin-engine\/?$/u);
	expect(canonical).not.toContain('ce_');
	expect(canonical).not.toContain('utm_source');

	await waitForFoundry(page, `${fixedPath}&utm_source=browser-audit`);
	await expect(page.getByRole('heading', { level: 1, name: /The Chitin Engine/iu })).toHaveCount(1);
	await expect(viewport(page)).toHaveAttribute(
		'aria-label',
		'Interactive rendering of the current Chitin Engine specimen'
	);
	await expect(viewport(page)).toHaveAttribute('aria-describedby', 'chitin-access-description');
	await expect(page.locator('#chitin-access-description')).toContainText('text equivalent');
	await expect(liveCanvas(page)).toHaveCount(1);
	await expect(readout(page)).toContainText('browser-audit-1847');
	await expect(readout(page)).toContainText('World transforms are speculative visual heuristics');
	await expectNoDuplicateIds(page);

	await page.goto('/blog', { waitUntil: 'domcontentloaded' });
	await page.goBack({ waitUntil: 'domcontentloaded' });
	await waitForCurrentFoundry(page);
	await expect(liveCanvas(page)).toHaveCount(1);
	await expect(readout(page)).toContainText('browser-audit-1847');
});

test('the same versioned seed restores the same genome identity across reload and JSON export', async ({
	page
}) => {
	const root = await waitForFoundry(page);
	const designation = (await readout(page).locator('.identity code').innerText()).trim();
	const specimenName = (await readout(page).locator('.identity h3').innerText()).trim();
	expect(designation).toMatch(/^[A-Z]{2}-\d{4}$/u);
	expect(specimenName.length).toBeGreaterThan(4);

	const firstMenu = await openExportMenu(root);
	const firstDownloadPromise = page.waitForEvent('download');
	await firstMenu.getByRole('button', { name: 'Genome JSON', exact: true }).click();
	const firstDownload = await firstDownloadPromise;
	const firstBytes = await downloadBytes(firstDownload);
	const firstGenome = JSON.parse(firstBytes.toString('utf8')) as {
		format: string;
		version: number;
		genome: { seed: string; preset: string; world: string };
	};
	expect(firstDownload.suggestedFilename()).toMatch(/^chitin-engine-.+-browser-audit-1847\.json$/u);
	expect(firstGenome).toMatchObject({
		format: 'suvro-chitin-genome',
		version: 1,
		genome: {
			seed: 'browser-audit-1847',
			preset: 'glassback-knifemite',
			world: 'terminator-line'
		}
	});

	await page.reload({ waitUntil: 'domcontentloaded' });
	const reloaded = await waitForCurrentFoundry(page);
	await expect(readout(page).locator('.identity code')).toHaveText(designation);
	await expect(readout(page).locator('.identity h3')).toHaveText(specimenName);
	const secondMenu = await openExportMenu(reloaded);
	const secondDownloadPromise = page.waitForEvent('download');
	await secondMenu.getByRole('button', { name: 'Genome JSON', exact: true }).click();
	const secondBytes = await downloadBytes(await secondDownloadPromise);
	expect(secondBytes.equals(firstBytes)).toBe(true);
	await expect(liveCanvas(page)).toHaveCount(1);
});

test('rebuild, mutation, hatch, world and diagnostic views update one shareable specimen', async ({
	page
}) => {
	const root = await waitForFoundry(page);
	const seed = root.getByLabel('Deterministic seed');
	await seed.fill('rebuilt-browser-specimen');
	await root.getByRole('button', { name: 'Rebuild', exact: true }).click();
	await expect(readout(page)).toContainText('rebuilt-browser-specimen');
	await expect
		.poll(() => new URL(page.url()).searchParams.get('ce_seed'))
		.toBe('rebuilt-browser-specimen');

	await root.getByTestId('chitin-mutate').click();
	await expect.poll(() => seedValue(page)).toMatch(/^m1-[a-z0-9]+-rebuilt-browser-specimen$/u);
	const mutatedSeed = await seedValue(page);
	await expect(readout(page)).toContainText(mutatedSeed);
	await expect(root.locator('.live-region')).toContainText(/Mutation 1 changed/iu);

	const worldControls = await openControlsSection(root, 'World');
	await worldControls
		.getByRole('combobox', { name: 'World preset' })
		.selectOption('brine-under-ice');
	await expect(readout(page)).toContainText('Brine Under Ice');
	await expect.poll(() => new URL(page.url()).searchParams.get('ce_world')).toBe('brine-under-ice');

	await root.getByRole('button', { name: 'gait', exact: true }).click();
	await expect(root.getByRole('button', { name: 'gait', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(readout(page)).toContainText(/View\s+gait/iu);
	await expect.poll(() => new URL(page.url()).searchParams.get('ce_view')).toBe('gait');

	const motionControls = await openControlsSection(root, 'Motion');
	const cadence = motionControls.getByRole('slider', { name: 'Cadence' });
	await cadence.fill('0.08');
	await expect(cadence).toHaveValue('0.08');

	let previousSeed = mutatedSeed;
	for (let hatch = 0; hatch < 3; hatch += 1) {
		await root.getByTestId('chitin-hatch').click();
		await expect.poll(() => seedValue(page)).not.toBe(previousSeed);
		previousSeed = await seedValue(page);
	}
	await expect(root.locator('.live-region')).toContainText(/Hatched deterministic specimen/iu);
	await expect(liveCanvas(page)).toHaveCount(1);
});

test('reduced motion remains still while keyboard controls and a single gait step stay usable', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const root = await waitForFoundry(page);
	const before = await liveCanvas(page).screenshot({ animations: 'disabled' });
	await page.waitForTimeout(300);
	const held = await liveCanvas(page).screenshot({ animations: 'disabled' });
	expect(held.equals(before)).toBe(true);

	await viewport(page).focus();
	await page.keyboard.press('KeyA');
	await expect(root.getByRole('button', { name: 'anatomy', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.keyboard.press('ArrowRight');
	await expect(readout(page).locator('.selection')).toContainText('Plate 2');
	await page.keyboard.press('Space');
	await expect(root.getByRole('button', { name: /^Wake\b/iu })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	const seed = root.getByLabel('Deterministic seed');
	await seed.fill('native-input-probe');
	await seed.press('KeyM');
	await expect(seed).toHaveValue('native-input-probem');
	await expect(root.getByRole('button', { name: 'anatomy', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	const motionControls = await openControlsSection(root, 'Motion');
	await motionControls.getByRole('button', { name: 'Single gait step' }).click();
	await expect(root.locator('.instrument-line')).toContainText('clock held');
	await expect(liveCanvas(page)).toHaveCount(1);
});

test('the local archive can pin two parents and splice deterministic parameter blocks', async ({
	page
}) => {
	await page.addInitScript(() => localStorage.clear());
	const root = await waitForFoundry(page);
	await root.getByRole('button', { name: 'Pin', exact: true }).click();
	await root.getByTestId('chitin-mutate').click();
	const childSeed = await seedValue(page);
	await root.getByRole('button', { name: 'Pin', exact: true }).click();

	const archive = root.getByRole('region', { name: /Pinned specimens/iu });
	await archive.scrollIntoViewIfNeeded();
	await expect(archive.locator('li')).toHaveCount(2);
	await expect(archive.getByRole('heading', { name: /Pinned specimens/iu })).toContainText('2/12');
	await archive.locator('li').nth(0).getByRole('button', { name: 'Parent A' }).click();
	await archive.locator('li').nth(1).getByRole('button', { name: 'Parent B' }).click();
	const splice = archive.getByRole('button', { name: 'Splice parents' });
	await expect(splice).toBeEnabled();
	await splice.click();

	await expect.poll(() => seedValue(page)).toMatch(/^x1-[a-z0-9]+-/u);
	expect(await seedValue(page)).not.toBe(childSeed);
	await expect(
		root.getByRole('heading', { name: 'Parent and child, held to one pose' })
	).toBeVisible();
	await expect(root.locator('.mutation-comparison .changes')).toContainText('Changed groups');
	await expect(liveCanvas(page)).toHaveCount(1);
});

test('PNG and genome exports are versioned, non-empty and use safe filenames', async ({ page }) => {
	const root = await waitForFoundry(page);
	const menu = await openExportMenu(root);
	await expect(menu.getByRole('button', { name: /^PNG/iu })).toHaveCount(3);

	const pngPromise = page.waitForEvent('download');
	await menu.getByRole('button', { name: 'PNG 1×', exact: true }).click();
	const pngDownload = await pngPromise;
	const png = await downloadBytes(pngDownload);
	expect([...png.subarray(0, 8)]).toEqual(pngSignature);
	expect(pngDownload.suggestedFilename()).toMatch(/^chitin-engine-[a-z0-9-]+\.png$/u);
	const dimensions = pngDimensions(png);
	expect(dimensions.width).toBeGreaterThanOrEqual(500);
	expect(dimensions.height).toBeGreaterThanOrEqual(300);
	expect(png.byteLength).toBeGreaterThan(10_000);

	const jsonPromise = page.waitForEvent('download');
	await menu.getByRole('button', { name: 'Genome JSON', exact: true }).click();
	const jsonDownload = await jsonPromise;
	const record = JSON.parse((await downloadBytes(jsonDownload)).toString('utf8')) as {
		format: string;
		version: number;
		genome: { schemaVersion: number; seed: string };
	};
	expect(jsonDownload.suggestedFilename()).toMatch(/^chitin-engine-[a-z0-9-]+\.json$/u);
	expect(record.format).toBe('suvro-chitin-genome');
	expect(record.version).toBe(1);
	expect(record.genome.schemaVersion).toBe(1);
	expect(record.genome.seed).toBe('browser-audit-1847');
});

test('mobile reflow keeps the chamber, controls and touch targets inside the viewport', async ({
	page
}) => {
	await page.setViewportSize({ width: 360, height: 800 });
	const root = await waitForFoundry(page);
	const layout = await root.evaluate((element) => {
		const box = element.getBoundingClientRect();
		const chamber = element.querySelector<HTMLElement>('.chamber-shell')?.getBoundingClientRect();
		const exhibitBounds = element.getBoundingClientRect();
		const internallyOverflowing = [...element.querySelectorAll<HTMLElement>('*')]
			.map((candidate) => {
				const bounds = candidate.getBoundingClientRect();
				return {
					tag: candidate.tagName.toLowerCase(),
					className: String(candidate.className).slice(0, 100),
					left: Math.round(bounds.left),
					right: Math.round(bounds.right),
					clientWidth: candidate.clientWidth,
					scrollWidth: candidate.scrollWidth
				};
			})
			.filter(
				(candidate) =>
					candidate.scrollWidth > candidate.clientWidth + 1 ||
					candidate.left < exhibitBounds.left - 2 ||
					candidate.right > exhibitBounds.right + 2
			)
			.slice(0, 16);
		const overflowing = [...document.querySelectorAll<HTMLElement>('body *')]
			.map((candidate) => {
				const bounds = candidate.getBoundingClientRect();
				return {
					tag: candidate.tagName.toLowerCase(),
					className: String(candidate.className).slice(0, 100),
					left: Math.round(bounds.left),
					right: Math.round(bounds.right),
					width: Math.round(bounds.width)
				};
			})
			.filter((candidate) => candidate.left < -2 || candidate.right > innerWidth + 2)
			.slice(0, 16);
		const primaryControls = [
			...element.querySelectorAll<HTMLElement>('.action-bar button, .action-bar summary')
		]
			.filter((control) => control.offsetParent !== null)
			.map((control) => {
				const bounds = control.getBoundingClientRect();
				return { width: bounds.width, height: bounds.height };
			});
		return {
			left: box.left,
			right: box.right,
			viewport: innerWidth,
			documentOverflow: document.documentElement.scrollWidth - innerWidth,
			exhibitOverflow: element.scrollWidth - element.clientWidth,
			overflowing,
			internallyOverflowing,
			chamber: chamber ? { width: chamber.width, height: chamber.height } : null,
			primaryControls,
			undersized: primaryControls.filter((control) => control.width < 43.5 || control.height < 43.5)
		};
	});
	expect(layout.left).toBeGreaterThanOrEqual(-1);
	expect(layout.right).toBeLessThanOrEqual(layout.viewport + 1);
	expect(layout.documentOverflow, JSON.stringify(layout.overflowing)).toBeLessThanOrEqual(2);
	expect(layout.exhibitOverflow, JSON.stringify(layout.internallyOverflowing)).toBeLessThanOrEqual(
		1
	);
	expect(layout.chamber).not.toBeNull();
	expect(layout.chamber!.height).toBeGreaterThan(layout.chamber!.width);
	expect(layout.primaryControls.length).toBeGreaterThanOrEqual(8);
	expect(layout.undersized).toEqual([]);
	await expect(liveCanvas(page)).toHaveCount(1);
	await expect(root.getByTestId('chitin-controls')).toBeVisible();
	await expectNoDuplicateIds(page);
});

test('Canvas2D fallback and the no-JavaScript reading experience preserve the specimen', async ({
	page,
	browser
}) => {
	await page.addInitScript(() => {
		const nativeGetContext = HTMLCanvasElement.prototype.getContext;
		Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
			configurable: true,
			value(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
				if (contextId === 'webgl2') return null;
				return Reflect.apply(nativeGetContext, this, [contextId, ...args]);
			}
		});
	});
	await waitForFoundry(page);
	await expect(viewport(page)).toHaveAttribute('data-renderer', 'canvas2d');
	await expect(viewport(page)).toHaveAttribute('data-renderer-status', 'fallback');
	await expect(viewport(page).locator('.fallback-badge')).toHaveText('Canvas2D fallback');
	await expect(liveCanvas(page)).toHaveCount(1);

	await assertNoJavaScriptFallback(browser);
});

test('feature-scoped axe checks pass for the hydrated foundry and open controls', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const root = await waitForFoundry(page);
	for (const section of ['Armour', 'World', 'Mutation laboratory', 'Output and diagnostics']) {
		await openControlsSection(root, section);
	}
	const results = await new AxeBuilder({ page })
		.include('[data-testid="chitin-engine"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
});

async function assertNoJavaScriptFallback(browser: Browser): Promise<void> {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	try {
		const response = await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		expect(response?.ok()).toBe(true);
		await expect(page.getByRole('heading', { level: 1, name: /The Chitin Engine/iu })).toHaveCount(
			1
		);
		const fallback = page.getByRole('region', { name: 'Static Chitin Engine fallback' });
		await expect(fallback).toBeVisible();
		await expect(
			fallback.getByRole('img', { name: /original ultraviolet-black segmented creature/iu })
		).toHaveAttribute('alt', /ultraviolet-black segmented creature/iu);
		await expect(fallback).toContainText('The live foundry requires JavaScript');
		await expect(fallback).toContainText('Plain-language mechanism');
		await expect(fallback).toContainText('not a simulation of DNA');
		await expect(page.locator('canvas[data-chitin-canvas="true"]')).toHaveCount(0);
		await expect(page.getByRole('heading', { name: 'Sources', exact: true })).toBeVisible();
	} finally {
		await context.close();
	}
}
