import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/lightning-atlas';
const articleTitle = 'Lightning Atlas: How the Sky Finds the Ground';
const runtimeDiagnostics = new WeakMap<Page, string[]>();

function laboratory(page: Page): Locator {
	return page.locator('figure.lightning-atlas');
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

async function waitForLaboratory(page: Page): Promise<Locator> {
	const lab = laboratory(page);
	await expect(lab).toBeVisible();
	await lab.scrollIntoViewIfNeeded();
	const viewport = lab.locator('.viewport-frame');
	await expect(viewport).toBeVisible();
	await expect(viewport).toHaveAttribute('data-renderer-status', 'ready', { timeout: 60_000 });
	await expect(viewport.locator('canvas')).toBeVisible();
	await expect(lab.locator('.inspector code')).toBeVisible({ timeout: 60_000 });
	return lab;
}

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream)
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks);
}

async function inspectorValue(lab: Locator, label: string): Promise<string> {
	return (
		await lab
			.locator('.inspector dl > div')
			.filter({ hasText: new RegExp(`^${label}`, 'u') })
			.locator('dd')
			.first()
			.innerText()
	).trim();
}

function distanceMetres(value: string): number {
	const amount = Number.parseFloat(value);
	return value.includes('km') ? amount * 1_000 : amount;
}

test.beforeEach(({ page }) => {
	runtimeDiagnostics.set(page, collectUnexpectedRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(runtimeDiagnostics.get(page) ?? []).toEqual([]);
});

test('the canonical article renders one live deterministic laboratory', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html).toContain(articleTitle);
	expect(html).toContain('/images/lightning-atlas.png');
	expect(html).toContain('Physically inspired procedural model');

	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { level: 1, name: articleTitle })).toHaveCount(1);
	await expect(laboratory(page)).toHaveCount(1);
	const lab = await waitForLaboratory(page);
	await expect(lab.locator('.mode-tabs > button')).toHaveCount(4);
	const channelHash = (await lab.locator('.inspector code').textContent())?.trim();
	expect(channelHash).toMatch(/^[a-f0-9]{8}$/u);
	await expect(lab.getByRole('button', { name: 'Sound off' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await expect(lab.locator('.scene-telemetry')).toContainText('branches');
});

test('Kalbaisakhi hero controls produce a larger deterministic morphology and readable replay', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(
		`${articlePath}?v=1&terrain=kalbaisakhi-bengal&seed=morphology-stat-0&flash=negative-cg&scale=standard&strike=0`,
		{ waitUntil: 'domcontentloaded' }
	);
	const lab = await waitForLaboratory(page);
	await expect(
		lab.getByRole('heading', { name: "Kalbaisakhi / Bengal Nor'wester", exact: true })
	).toBeVisible();
	await expect(lab).toHaveAttribute('data-terrain', 'kalbaisakhi-bengal');
	await expect(lab.getByLabel('Strike scale')).toHaveValue('standard');
	await expect(lab.locator('.inspector')).toHaveAttribute('data-strike-scale', 'standard');

	const heroButton = lab.getByRole('button', { name: 'Call a hero strike' });
	await expect(heroButton).toHaveAttribute(
		'title',
		'Generates a high-energy, highly branched strike within the current storm model.'
	);
	const standardHash = (await lab.locator('.inspector code').innerText()).trim();
	const standardBranches = Number(await inspectorValue(lab, 'Visible branches'));
	const standardChannelMetres = distanceMetres(await inspectorValue(lab, 'Total channel'));

	await lab.getByLabel('Strike scale').selectOption('heroic');
	await expect.poll(() => new URL(page.url()).searchParams.get('scale')).toBe('heroic');
	await expect(lab.locator('.inspector')).toHaveAttribute('data-strike-scale', 'heroic', {
		timeout: 60_000
	});
	await expect
		.poll(async () => (await lab.locator('.inspector code').innerText()).trim())
		.not.toBe(standardHash);
	const heroicBranches = Number(await inspectorValue(lab, 'Visible branches'));
	const heroicChannelMetres = distanceMetres(await inspectorValue(lab, 'Total channel'));
	expect(heroicBranches).toBeGreaterThan(standardBranches);
	expect(heroicChannelMetres).toBeGreaterThan(standardChannelMetres);

	await lab.getByLabel('Camera').selectOption('wide');
	await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('wide');
	await heroButton.click();
	await expect(lab.getByRole('heading', { name: 'Flash 2' })).toBeVisible({ timeout: 60_000 });
	await expect.poll(() => new URL(page.url()).searchParams.get('strike')).toBe('1');
	await expect.poll(() => new URL(page.url()).searchParams.get('scale')).toBe('heroic');
	await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('hero');
	await expect(lab.getByLabel('Camera')).toHaveValue('hero');

	await lab.getByRole('button', { name: 'Replay last flash' }).click();
	await expect(lab.getByRole('combobox', { name: 'Speed' })).toHaveValue('0.5');
	const majorRoutes = lab.getByRole('button', { name: 'Main + primary' });
	const fullNetwork = lab.getByRole('button', { name: 'Full network' });
	await expect(majorRoutes).toHaveAttribute('aria-pressed', 'true');
	const replayHash = (await lab.locator('.inspector code').innerText()).trim();
	await fullNetwork.click();
	await expect(fullNetwork).toHaveAttribute('aria-pressed', 'true');
	await expect(lab).toHaveAttribute('data-branch-emphasis', 'full');
	await expect(lab.locator('.inspector code')).toHaveText(replayHash);
});

test('URL state and strike geometry survive reload while rendering quality remains decorative', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	let lab = await waitForLaboratory(page);
	await lab.getByLabel('Flash type').selectOption('negative-cg');
	await expect(lab.locator('.inspector')).toContainText('Negative');
	const initialHash = (await lab.locator('.inspector code').textContent())?.trim();
	expect(initialHash).toMatch(/^[a-f0-9]{8}$/u);
	await lab.locator('details.advanced > summary').click();
	await lab.getByLabel('Quality').selectOption('high');
	await expect.poll(() => new URL(page.url()).searchParams.get('quality')).toBe('high');
	await expect(lab.locator('.inspector code')).toHaveText(initialHash!);
	const sharedURL = page.url();

	await page.reload({ waitUntil: 'domcontentloaded' });
	lab = await waitForLaboratory(page);
	expect(page.url()).toBe(sharedURL);
	await expect(lab.locator('.inspector code')).toHaveText(initialHash!);
	await expect(lab.getByLabel('Quality')).toHaveValue('high');
	await expect(lab.getByRole('button', { name: 'Play', exact: true }).first()).toBeVisible();
});

test('a shared cross-section URL opens its disclosure on first load', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${articlePath}?v=1&mode=cross-section`, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	const crossSectionTrigger = lab.locator('#lightning-atlas-cross-section-trigger');
	await expect(crossSectionTrigger).toHaveAttribute('aria-expanded', 'true');
	await expect(crossSectionTrigger).toHaveAccessibleName('Close cross-section');
	await expect(lab.locator('#lightning-atlas-cross-section')).toBeVisible();
});

test('shared strike indices rebuild bounded history and stop at 1,000 flashes', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${articlePath}?v=1&seed=history-audit&flash=negative-cg&strike=4`, {
		waitUntil: 'domcontentloaded'
	});
	let lab = await waitForLaboratory(page);
	let historyButtons = lab.locator('.table-wrap tbody th button');
	await expect(historyButtons).toHaveCount(5);
	await expect(historyButtons.first()).toHaveText('1');
	await expect(historyButtons.last()).toHaveText('5');
	await expect(historyButtons.last()).toHaveAttribute('aria-pressed', 'true');

	await page.goto(`${articlePath}?v=1&seed=history-cap&flash=negative-cg&strike=999`, {
		waitUntil: 'domcontentloaded'
	});
	lab = await waitForLaboratory(page);
	historyButtons = lab.locator('.table-wrap tbody th button');
	await expect(historyButtons).toHaveCount(12);
	await expect(historyButtons.first()).toHaveText('989');
	await expect(historyButtons.last()).toHaveText('1000');
	await lab.getByRole('button', { name: 'Call a strike' }).click();
	await expect(lab.locator('.rail-footer p')).toContainText('reached 1,000 flashes');
	await expect.poll(() => new URL(page.url()).searchParams.get('strike')).toBe('999');
	await expect(historyButtons).toHaveCount(12);
});

test('phase replay, strike creation and versioned exports share one generated flash', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${articlePath}?v=1&flash=negative-cg&seed=browser-audit`, {
		waitUntil: 'domcontentloaded'
	});
	const lab = await waitForLaboratory(page);
	const phaseList = lab.getByRole('list', { name: 'Strike phases' });
	await expect(phaseList.getByRole('button', { name: 'Leader descending' })).toBeVisible();
	await expect(phaseList.getByRole('button', { name: 'Return stroke' })).toBeVisible();
	await phaseList.getByRole('button', { name: 'Return stroke' }).click();
	await expect(lab.locator('.timeline-heading')).toContainText('Return stroke');
	const beforeHash = (await lab.locator('.inspector code').textContent())?.trim();

	await lab.getByRole('button', { name: 'Call a strike' }).click();
	await expect(lab.getByRole('heading', { name: 'Flash 2' })).toBeVisible();
	await expect(lab).toHaveAttribute('data-worker-mode', 'worker');
	await expect.poll(() => new URL(page.url()).searchParams.get('strike')).toBe('1');
	const afterHash = (await lab.locator('.inspector code').textContent())?.trim();
	expect(afterHash).not.toBe(beforeHash);

	const [jsonDownload] = await Promise.all([
		page.waitForEvent('download'),
		lab.getByRole('button', { name: 'Save replay JSON' }).click()
	]);
	const replay = JSON.parse((await downloadBytes(jsonDownload)).toString('utf8')) as {
		schemaVersion: number;
		modelVersion: string;
		strike: { channelHash: string; phaseEvents: unknown[] };
		disclaimer: string;
	};
	expect(replay.schemaVersion).toBe(1);
	expect(replay.modelVersion).toMatch(/^lightning-atlas-/u);
	expect(replay.strike.channelHash).toBe(afterHash);
	expect(replay.strike.phaseEvents.length).toBeGreaterThanOrEqual(9);
	expect(replay.disclaimer).toContain('not observations');

	const [csvDownload] = await Promise.all([
		page.waitForEvent('download'),
		lab.getByRole('button', { name: 'Save strike CSV' }).click()
	]);
	const csv = (await downloadBytes(csvDownload)).toString('utf8');
	expect(csv).toContain('simulated_thunder_delay_s');
	expect(csv).toContain(afterHash!);
	await expect(lab.locator('table caption')).toContainText('every value is simulated');
});

test('study mode places semantic features and completes a bounded 100-flash analysis', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	await lab.getByRole('button', { name: 'Terrain Study', exact: true }).click();
	await expect(lab.getByRole('heading', { name: 'Place a feature' })).toBeVisible();
	await lab.locator('.placement').getByRole('combobox').selectOption('wind-turbine');
	await lab.getByRole('button', { name: 'Place at coordinates' }).click();
	await expect
		.poll(() => new URL(page.url()).searchParams.get('features'))
		.toContain('wind-turbine');
	await expect(lab.locator('.placement li')).toContainText('wind turbine');

	await lab.getByRole('button', { name: 'Run 100 virtual flashes' }).click();
	await expect(lab.locator('.frequency-table caption')).toContainText(
		'100 deterministic model flashes',
		{
			timeout: 60_000
		}
	);
	await expect(lab.locator('.caveat')).toContainText('not real-world strike risk');
	await expect(lab.locator('.frequency-table tbody tr').first()).toBeVisible();
	await expect(lab).toHaveAttribute('data-worker-mode', 'worker');
});

test('the Atlas modal traps focus, inerts the laboratory and restores its opener', async ({
	page
}) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	const opener = lab.getByRole('button', { name: 'Open Atlas' });
	await opener.click();
	const dialog = page.getByRole('dialog', { name: /Procedural storm regions/u });
	await expect(dialog).toBeVisible();
	await expect(lab).toHaveAttribute('inert', '');
	const replayClock = lab.getByLabel(/Storm replay time:/u);
	await page.waitForTimeout(80);
	const modalClockStart = Number(await replayClock.inputValue());
	await page.waitForTimeout(250);
	expect(Number(await replayClock.inputValue())).toBeCloseTo(modalClockStart, 3);
	await expect(dialog.getByRole('button', { name: 'Close atlas' })).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(dialog.getByRole('button', { name: 'Volcanic Island' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(opener).toBeFocused();
});

test('manual phase selection disarms the live auto-strike scheduler', async ({ page }) => {
	await page.addInitScript(() => {
		const nativeSetTimeout = window.setTimeout.bind(window);
		window.setTimeout = ((handler: TimerHandler, timeout?: number, ...arguments_: unknown[]) =>
			nativeSetTimeout(
				handler,
				timeout === 12_000 ? 80 : timeout,
				...arguments_
			)) as typeof window.setTimeout;
	});
	await page.goto(`${articlePath}?v=1&seed=manual-phase-audit&flash=negative-cg`, {
		waitUntil: 'domcontentloaded'
	});
	const lab = await waitForLaboratory(page);
	const initialHash = (await lab.locator('.inspector code').textContent())?.trim();
	const phaseList = lab.getByRole('list', { name: 'Strike phases' });
	await phaseList.getByRole('button', { name: 'Return stroke' }).click();
	await expect(lab.locator('.timeline-heading')).toContainText('Return stroke');
	await page.waitForTimeout(350);
	await expect(lab.locator('.inspector code')).toHaveText(initialHash!);
	await expect(lab.getByRole('heading', { name: 'Flash 1' })).toBeVisible();
});

test('reduced motion, WebGL failure and no-JavaScript paths keep the science readable', async ({
	page,
	browser,
	baseURL
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${articlePath}?webgl=off`, { waitUntil: 'domcontentloaded' });
	const lab = laboratory(page);
	await expect(lab).toBeVisible();
	await lab.scrollIntoViewIfNeeded();
	await expect(lab.locator('.viewport-frame')).toHaveAttribute('data-renderer-status', 'fallback');
	await expect(lab.locator('.fallback-card')).toContainText(
		'cross-section, strike replay and storm records'
	);
	const fallbackTimeline = lab.getByLabel(/Storm replay time:/u);
	const fallbackStart = Number(await fallbackTimeline.inputValue());
	await lab.getByRole('button', { name: 'Play', exact: true }).first().click();
	await expect
		.poll(async () => Number(await fallbackTimeline.inputValue()))
		.toBeGreaterThan(fallbackStart);
	await expect(lab.getByRole('button', { name: 'Sound off' })).toBeVisible();

	const context = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	const noScriptPage = await context.newPage();
	try {
		await noScriptPage.goto(`${baseURL}${articlePath}`, { waitUntil: 'domcontentloaded' });
		const staticLab = laboratory(noScriptPage);
		await expect(staticLab).toBeVisible();
		await expect(staticLab.locator('.atlas-js')).toBeHidden();
		await expect(staticLab.locator('.noscript-fallback img')).toBeVisible();
		await expect(staticLab.locator('.noscript-fallback')).toContainText('Static Lightning Atlas');
		await expect(
			noScriptPage.getByRole('heading', {
				name: 'What the model preserves—and what it refuses to claim'
			})
		).toBeVisible();
		const overflow = await noScriptPage.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);
	} finally {
		await context.close();
	}
});

test('a 1024-pixel tablet layout supports the light theme without horizontal overflow', async ({
	page
}) => {
	await page.setViewportSize({ width: 1024, height: 768 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.addInitScript(() => window.localStorage.setItem('site-theme', 'light'));
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await expect(lab.locator('.viewport-frame')).toBeVisible();
	const geometry = await lab.evaluate((element) => ({
		documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		labOverflow: element.scrollWidth - element.clientWidth,
		labWidth: element.getBoundingClientRect().width,
		offenders: [...document.body.querySelectorAll<HTMLElement>('*')]
			.map((candidate) => {
				const bounds = candidate.getBoundingClientRect();
				return {
					tag: candidate.tagName.toLowerCase(),
					className: candidate.className,
					left: Math.round(bounds.left + window.scrollX),
					right: Math.round(bounds.right + window.scrollX),
					width: Math.round(bounds.width)
				};
			})
			.filter((candidate) => candidate.left < -1 || candidate.right > window.innerWidth + 1)
			.slice(0, 12)
	}));
	expect(geometry.documentOverflow, JSON.stringify(geometry.offenders)).toBeLessThanOrEqual(1);
	expect(geometry.labOverflow).toBeLessThanOrEqual(1);
	expect(geometry.labWidth).toBeLessThanOrEqual(1024);
});

test('a 320-pixel viewport has no page overflow and retains 44-pixel controls', async ({
	page
}) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = await waitForLaboratory(page);
	await lab.locator('details.advanced > summary').click();
	const crossSectionTrigger = lab.locator('#lightning-atlas-cross-section-trigger');
	await expect(crossSectionTrigger).toHaveAccessibleName('Open cross-section');
	await expect(crossSectionTrigger).toHaveAttribute('aria-expanded', 'false');
	await expect(crossSectionTrigger).toHaveAttribute(
		'aria-controls',
		'lightning-atlas-cross-section'
	);
	await crossSectionTrigger.click();
	await expect(crossSectionTrigger).toHaveAccessibleName('Close cross-section');
	await expect(crossSectionTrigger).toHaveAttribute('aria-expanded', 'true');
	const crossSection = lab.locator('#lightning-atlas-cross-section');
	await expect(crossSection).toHaveAttribute('tabindex', '-1');
	await expect(crossSection).toBeFocused();
	const geometry = await lab.evaluate((element) => {
		const controls = [
			...element.querySelectorAll<HTMLElement>(
				"button, summary, select, input[type='number'], input[type='range']"
			)
		].filter((control) => control.getBoundingClientRect().height > 0);
		const checkboxTargets = [
			...element.querySelectorAll<HTMLElement>("label:has(input[type='checkbox'])")
		].filter((label) => label.getBoundingClientRect().height > 0);
		const targets = [...controls, ...checkboxTargets].map((control) => {
			const bounds = control.getBoundingClientRect();
			return {
				name:
					control.getAttribute('aria-label') ??
					control.textContent?.trim().replace(/\s+/gu, ' ').slice(0, 80) ??
					control.tagName.toLowerCase(),
				width: bounds.width,
				height: bounds.height
			};
		});
		return {
			documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			labOverflow: element.scrollWidth - element.clientWidth,
			minimumControlWidth: Math.min(...targets.map((target) => target.width)),
			minimumControlHeight: Math.min(...targets.map((target) => target.height)),
			undersizedTargets: targets.filter((target) => target.width < 43.5 || target.height < 43.5),
			labWidth: element.getBoundingClientRect().width
		};
	});
	expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
	expect(geometry.labOverflow).toBeLessThanOrEqual(1);
	expect(geometry.labWidth).toBeLessThanOrEqual(320);
	expect(geometry.minimumControlWidth).toBeGreaterThanOrEqual(43.5);
	expect(geometry.minimumControlHeight).toBeGreaterThanOrEqual(43.5);
	expect(geometry.undersizedTargets).toEqual([]);
	await expect(lab.locator('.accessible-view')).toBeVisible();
	await crossSectionTrigger.click();
	await expect(crossSection).toBeHidden();
	await expect(crossSectionTrigger).toBeFocused();
});
