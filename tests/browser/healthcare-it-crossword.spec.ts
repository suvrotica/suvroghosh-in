import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	CROSSWORD_STORAGE_KEY,
	buildPuzzleModel,
	type CrosswordPuzzle,
	type PuzzleModel
} from '../../src/lib/games/crossword';
import { healthcareItPack } from '../../src/lib/games/crossword/content/packs/healthcare-it';

const articlePath = '/blog/games/healthcare-it-crossword-systems-rounds';
const articleTitle = 'The Healthcare IT Crossword: Systems Rounds';
const terminologyPuzzleId = 'terminology-passports';

type RuntimeDiagnostics = {
	errors: string[];
	failedRequests: string[];
};

function crossword(page: Page): Locator {
	return page.getByTestId('crossword-game');
}

function ignorablePlatformRequest(url: string): boolean {
	const pathname = new URL(url).pathname;
	return pathname.startsWith('/_vercel/') || /(?:^|\/)favicon(?:\.|$)/iu.test(pathname);
}

function observeRuntime(page: Page): RuntimeDiagnostics {
	const diagnostics: RuntimeDiagnostics = { errors: [], failedRequests: [] };
	page.on('pageerror', (error) => diagnostics.errors.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		const text = message.text();
		const hydrationWarning = /hydrat(?:e|ion|ing)|server-rendered html/iu.test(text);
		if (message.type() !== 'error' && !hydrationWarning) return;
		if (/\/_vercel\/(?:insights|speed-insights)\//iu.test(text)) return;
		if (ignorablePlatformRequest(message.location().url || 'http://local.invalid/')) return;
		diagnostics.errors.push(`${message.type()}: ${text}`);
	});
	page.on('requestfailed', (request) => {
		if (ignorablePlatformRequest(request.url())) return;
		const reason = request.failure()?.errorText ?? 'unknown failure';
		if (reason === 'net::ERR_ABORTED' && request.isNavigationRequest()) return;
		diagnostics.failedRequests.push(`${request.method()} ${request.url()} — ${reason}`);
	});
	page.on('response', (response) => {
		if (response.status() < 400 || ignorablePlatformRequest(response.url())) return;
		diagnostics.failedRequests.push(
			`${response.request().method()} ${response.url()} — HTTP ${response.status()}`
		);
	});
	return diagnostics;
}

async function assertNoRuntimeDiagnostics(diagnostics: RuntimeDiagnostics): Promise<void> {
	expect(diagnostics.errors, 'console, page, and hydration errors').toEqual([]);
	expect(diagnostics.failedRequests, 'failed runtime requests').toEqual([]);
}

function escaped(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function selectRadio(scope: Locator, labelPrefix: string): Promise<void> {
	const radio = scope.getByRole('radio', {
		name: new RegExp(`^${escaped(labelPrefix)}(?:\\s|$)`, 'iu')
	});
	await expect(radio).toHaveCount(1);
	await radio.check({ force: true });
	await expect(radio).toBeChecked();
}

async function enterTerminologyRound(page: Page): Promise<Locator> {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = crossword(page);
	await expect(root).toBeVisible();
	await expect(root).toHaveAttribute('data-view', 'landing');
	await selectRadio(root, 'Terminology');
	await selectRadio(root, 'Refresh');
	await selectRadio(root, 'Quick Round');
	await root.getByRole('button', { name: 'Start a round', exact: true }).click();
	await expect(root).toHaveAttribute('data-view', 'playing');
	await expect(root).toHaveAttribute('data-puzzle-id', terminologyPuzzleId);
	await expect(
		root.getByRole('heading', { name: 'Terminology Passports', exact: true })
	).toBeVisible();
	return root;
}

async function selectedCell(root: Locator): Promise<Locator> {
	const cell = root.locator('[data-cell-key].selected');
	await expect(cell).toHaveCount(1);
	await expect(cell).toBeFocused();
	return cell;
}

function puzzleById(puzzleId: string): CrosswordPuzzle {
	const puzzle = healthcareItPack.puzzles.find((candidate) => candidate.id === puzzleId);
	if (!puzzle) throw new Error(`Missing test puzzle ${puzzleId}`);
	return puzzle;
}

function modelById(puzzleId: string): PuzzleModel {
	return buildPuzzleModel(puzzleById(puzzleId));
}

async function openSettings(root: Locator): Promise<Locator> {
	await root.getByRole('button', { name: /settings/iu }).click();
	const dialog = root.getByRole('dialog', { name: 'How the grid should behave', exact: true });
	await expect(dialog).toBeVisible();
	return dialog;
}

async function switchToList(root: Locator): Promise<void> {
	await root.getByRole('button', { name: 'Solve as a list', exact: true }).click();
	await expect(root).toHaveAttribute('data-solver-mode', 'list');
	await expect(
		root.getByRole('heading', { name: 'Solve by clue and answer field', exact: true })
	).toBeVisible();
}

async function switchToGrid(root: Locator): Promise<void> {
	await root.getByRole('button', { name: 'Solve on the grid', exact: true }).click();
	await expect(root).toHaveAttribute('data-solver-mode', 'grid');
	await expect(root.getByRole('grid')).toBeVisible();
}

async function readStoredProgress(page: Page): Promise<Record<string, unknown> | null> {
	return page.evaluate((key) => {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
	}, CROSSWORD_STORAGE_KEY);
}

function seriousViolations(
	results: Awaited<ReturnType<AxeBuilder['analyze']>>
): Array<{ id: string; impact: string | null; targets: unknown[] }> {
	return results.violations
		.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
		.map((violation) => ({
			id: violation.id,
			impact: violation.impact ?? null,
			targets: violation.nodes.map((node) => node.target)
		}));
}

test('SSR and no-JavaScript output retain the useful introduction, privacy note, and fallback', async ({
	browser,
	baseURL,
	request
}) => {
	const htmlResponse = await request.get(articlePath);
	expect(htmlResponse.status()).toBe(200);
	const serverHtml = await htmlResponse.text();
	expect(serverHtml).toMatch(
		/<noscript>[\s\S]*?JavaScript is required for the interactive crossword/iu
	);

	const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
	const page = await context.newPage();
	try {
		const response = await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		expect(response?.status()).toBe(200);
		await expect(
			page.getByRole('heading', { name: articleTitle, exact: true }).first()
		).toBeVisible();
		await expect(page.getByText(/Forgetting is expected/iu).first()).toBeVisible();
		await expect(
			page.getByText(/progress remains on (?:this|your) device/iu).first()
		).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Breadcrumb', exact: true })).toBeVisible();
	} finally {
		await context.close();
	}
});

test('the landing screen separates topic, difficulty, and format before starting the chosen round', async ({
	page
}) => {
	const diagnostics = observeRuntime(page);
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = crossword(page);
	await expect(root).toHaveAttribute('data-view', 'landing');
	await expect(root.getByRole('heading', { name: articleTitle, exact: true })).toBeVisible();
	await expect(root.getByRole('radio', { name: /^Mixed systems/iu })).toBeChecked();
	await expect(root.getByRole('radio', { name: /^Adaptive Mix/iu })).toBeChecked();
	await expect(root.getByRole('radio', { name: /^Coffee Round/iu })).toBeChecked();

	await selectRadio(root, 'Terminology');
	await selectRadio(root, 'Refresh');
	await selectRadio(root, 'Quick Round');
	await root.getByRole('button', { name: 'Start a round', exact: true }).click();
	await expect(root).toHaveAttribute('data-puzzle-id', terminologyPuzzleId);
	await expect(
		root.getByRole('heading', { name: 'Terminology Passports', exact: true })
	).toBeVisible();
	await assertNoRuntimeDiagnostics(diagnostics);
});

test('the guided first crossing exposes four concise steps without blocking the grid', async ({
	page
}) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = crossword(page);
	await root
		.getByRole('button', { name: 'New to the instrument? Take the guided first crossing.' })
		.click();
	await expect(root).toHaveAttribute('data-view', 'playing');
	await expect(root).toHaveAttribute('data-puzzle-id', 'first-crossing');
	await expect(root.getByRole('grid')).toBeVisible();

	for (const [index, title] of [
		'Choose a clue',
		'Let crossings help',
		'Hints teach in stages',
		'Keep the thread'
	].entries()) {
		await expect(root.getByText(`Guided first crossing · ${index + 1} of 4`)).toBeVisible();
		await expect(root.getByRole('heading', { name: title, exact: true })).toBeVisible();
		await root
			.getByRole('button', { name: index === 3 ? 'Finish guide' : 'Next step', exact: true })
			.click();
	}
	await expect(root.getByText(/Guided first crossing ·/u)).toHaveCount(0);
	await expect(root.getByRole('grid')).toBeVisible();
	await root.getByRole('button', { name: 'Rounds', exact: true }).click();
	await expect(root.locator('input[name="crossword-topic"]:checked')).toHaveCount(1);
	await expect(root.locator('input[name="crossword-format"]:checked')).toHaveValue('coffee');
});

test('physical keyboard entry, Backspace, spatial movement, and crossing direction share grid focus', async ({
	page
}) => {
	const diagnostics = observeRuntime(page);
	const root = await enterTerminologyRound(page);
	const first = await selectedCell(root);
	const firstKey = await first.getAttribute('data-cell-key');
	expect(firstKey).not.toBeNull();

	await page.keyboard.press('V');
	await expect(root.locator(`[data-cell-key="${firstKey}"]`)).toHaveAccessibleName(/Letter V/iu);
	const advanced = await selectedCell(root);
	await expect(advanced).not.toHaveAttribute('data-cell-key', firstKey ?? '');
	await page.keyboard.press('Backspace');
	await expect(root.locator(`[data-cell-key="${firstKey}"]`)).toHaveAccessibleName(
		/Letter blank/iu
	);

	const model = modelById(terminologyPuzzleId);
	const crossingKey = model.cellOrder.find((key) => model.cells[key].entryIds.length === 2);
	expect(crossingKey).toBeTruthy();
	const crossing = root.locator(`[data-cell-key="${crossingKey}"]`);
	await crossing.click();
	const beforeToggle = await crossing.getAttribute('aria-label');
	await page.keyboard.press('Space');
	const afterToggle = await crossing.getAttribute('aria-label');
	expect(afterToggle).not.toBe(beforeToggle);
	expect(beforeToggle).toMatch(/Selected (?:across|down)/iu);
	expect(afterToggle).toMatch(/Selected (?:across|down)/iu);

	await page.keyboard.press('ArrowRight');
	await expect(root.locator('[data-cell-key].selected')).toBeFocused();
	await assertNoRuntimeDiagnostics(diagnostics);
});

test('a touch phone can enter and erase letters with the seven-column on-screen keyboard', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		hasTouch: true,
		isMobile: true,
		viewport: { width: 360, height: 800 }
	});
	const page = await context.newPage();
	const diagnostics = observeRuntime(page);
	try {
		const root = await enterTerminologyRound(page);
		const first = await selectedCell(root);
		const firstKey = await first.getAttribute('data-cell-key');
		const letter = root.getByRole('button', { name: 'Enter V', exact: true });
		const erase = root.getByRole('button', { name: 'Erase letter', exact: true });
		for (const [label, control] of [
			['letter', letter],
			['erase', erase]
		] as const) {
			const size = await control.evaluate((element) => {
				const rect = element.getBoundingClientRect();
				return { width: rect.width, height: rect.height };
			});
			expect(size.width, `${label} key width`).toBeGreaterThanOrEqual(44);
			expect(size.height, `${label} key height`).toBeGreaterThanOrEqual(44);
		}

		await letter.tap();
		await expect(root.locator(`[data-cell-key="${firstKey}"]`)).toHaveAccessibleName(/Letter V/iu);
		await erase.tap();
		await expect(root.locator(`[data-cell-key="${firstKey}"]`)).toHaveAccessibleName(
			/Letter blank/iu
		);
		await assertNoRuntimeDiagnostics(diagnostics);
	} finally {
		await context.close();
	}
});

test('all six hint levels culminate in show-and-teach and a sourced teaching card', async ({
	page
}) => {
	const root = await enterTerminologyRound(page);
	await root.getByRole('tab', { name: /^Hints/iu }).click();
	const panel = root.locator('#crossword-panel-hints');
	for (let level = 1; level <= 6; level += 1) {
		const name = level === 1 ? 'Show the first nudge' : `Show hint ${level}`;
		await panel.getByRole('button', { name, exact: true }).click();
		await expect(panel.getByRole('listitem')).toHaveCount(level);
	}
	await expect(panel.getByText('reveal', { exact: true })).toBeVisible();
	await expect(root.locator('[data-cell-key].revealed').first()).toBeVisible();
	await panel.getByRole('button', { name: 'Open the teaching card', exact: true }).click();
	const learn = root.locator('#crossword-panel-learn');
	await expect(learn.getByRole('heading', { name: 'SNOMED CT', exact: true })).toBeVisible();
	await expect(learn.getByText('What it is', { exact: true })).toBeVisible();
	await learn.getByText('Sources and freshness', { exact: true }).click();
	await expect(learn.getByRole('link').first()).toHaveAttribute('href', /^https:\/\//u);
	await expect(root.getByRole('status')).toContainText(/Hint 6.*SNOMED CT/isu);
});

test('the accessible clue list edits the same cells and can complete the round', async ({
	page
}) => {
	const root = await enterTerminologyRound(page);
	const model = modelById(terminologyPuzzleId);
	await switchToList(root);

	const firstEntry = model.puzzle.entries[0];
	await root.locator(`#list-answer-${firstEntry.id}`).fill(firstEntry.answer);
	await switchToGrid(root);
	for (const [index, key] of model.entryCells[firstEntry.id].entries()) {
		await expect(root.locator(`[data-cell-key="${key}"]`)).toHaveAccessibleName(
			new RegExp(`Letter ${firstEntry.answer[index]}`, 'iu')
		);
	}

	await switchToList(root);
	for (const entry of model.puzzle.entries.slice(1)) {
		await root.locator(`#list-answer-${entry.id}`).fill(entry.answer);
	}
	await expect(root).toHaveAttribute('data-view', 'complete');
	await expect(root.getByRole('heading', { name: /grid is complete/iu })).toBeVisible();
	await expect(root.getByText(/independent/iu).first()).toBeVisible();
});

test('letters and checking settings persist across reload and resume', async ({ page }) => {
	const diagnostics = observeRuntime(page);
	let root = await enterTerminologyRound(page);
	const first = await selectedCell(root);
	const firstKey = await first.getAttribute('data-cell-key');
	await page.keyboard.press('V');
	const settingsTrigger = root.getByRole('button', { name: 'Settings', exact: true });
	let settings = await openSettings(root);
	await expect(settings.getByRole('button', { name: 'Close settings', exact: true })).toBeFocused();
	await selectRadio(settings, 'Traditional');
	await settings.getByRole('checkbox', { name: /^Show elapsed time/iu }).check();
	await page.keyboard.press('Escape');
	await expect(settings).toBeHidden();
	await expect(settingsTrigger).toBeFocused();
	await expect(root.getByText(/0:0[1-9] elapsed/u)).toBeVisible({ timeout: 5_000 });
	await expect
		.poll(
			async () => {
				const progress = await readStoredProgress(page);
				const saved = Object.values(
					(progress?.savedPuzzles ?? {}) as Record<string, { state?: { elapsedMs?: number } }>
				);
				return Math.max(0, ...saved.map((item) => item.state?.elapsedMs ?? 0));
			},
			{ timeout: 15_000 }
		)
		.toBeGreaterThanOrEqual(10_000);

	await expect.poll(async () => Boolean(await readStoredProgress(page))).toBe(true);
	await page.reload({ waitUntil: 'domcontentloaded' });
	root = crossword(page);
	await expect(root).toBeVisible();
	if ((await root.getAttribute('data-view')) === 'landing') {
		await root.getByRole('button', { name: 'Resume previous round', exact: true }).click();
	}
	await expect(root).toHaveAttribute('data-view', 'playing');
	await expect(root).toHaveAttribute('data-puzzle-id', terminologyPuzzleId);
	await expect(root.locator(`[data-cell-key="${firstKey}"]`)).toHaveAccessibleName(/Letter V/iu);
	settings = await openSettings(root);
	await expect(settings.getByRole('radio', { name: /^Traditional/iu })).toBeChecked();
	await expect(settings.getByRole('checkbox', { name: /^Show elapsed time/iu })).toBeChecked();
	await assertNoRuntimeDiagnostics(diagnostics);
});

test('the dense Deep Round pans inside its workspace instead of overflowing the page', async ({
	page
}) => {
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const root = crossword(page);
	await selectRadio(root, 'Mixed systems');
	await selectRadio(root, 'Architect');
	await selectRadio(root, 'Deep Round');
	await root.getByRole('button', { name: 'Start a round', exact: true }).click();
	await expect(root).toHaveAttribute('data-puzzle-id', 'record-crosses-enterprise');
	const workspace = root.locator('.grid-workspace.dense-grid');
	await expect(workspace).toBeVisible();
	const before = await workspace.evaluate((element) => ({
		clientHeight: element.clientHeight,
		scrollHeight: element.scrollHeight,
		clientWidth: element.clientWidth,
		scrollWidth: element.scrollWidth,
		overflowX: getComputedStyle(element).overflowX,
		overflowY: getComputedStyle(element).overflowY
	}));
	expect(before.overflowX).toBe('auto');
	expect(before.overflowY).toBe('auto');
	expect(
		before.scrollWidth > before.clientWidth || before.scrollHeight > before.clientHeight,
		'dense grid has a pannable internal axis when it cannot fit at useful cell sizes'
	).toBe(true);
	await workspace.evaluate((element) =>
		element.scrollTo({ left: element.scrollWidth, top: element.scrollHeight })
	);
	await expect
		.poll(() => workspace.evaluate((element) => Math.max(element.scrollLeft, element.scrollTop)))
		.toBeGreaterThan(0);
	const pageOverflow = await page.evaluate(() => ({
		clientWidth: document.documentElement.clientWidth,
		scrollWidth: document.documentElement.scrollWidth
	}));
	expect(pageOverflow.scrollWidth).toBeLessThanOrEqual(pageOverflow.clientWidth + 2);
});

test('unsupported Fullscreen API uses the immersive fallback, preserves state, and restores focus', async ({
	page
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(Document.prototype, 'fullscreenEnabled', {
			configurable: true,
			get: () => false
		});
		Object.defineProperty(Element.prototype, 'requestFullscreen', {
			configurable: true,
			value: undefined
		});
	});
	const root = await enterTerminologyRound(page);
	const first = await selectedCell(root);
	const firstKey = await first.getAttribute('data-cell-key');
	await page.keyboard.press('V');
	await expect(root).toHaveAttribute('data-immersive', 'false');
	const enter = root.getByRole('button', { name: 'Full screen', exact: true });
	await enter.click();
	await expect(root).toHaveAttribute('data-immersive', 'true');
	await expect(root.getByRole('button', { name: 'Exit full screen', exact: true })).toBeVisible();
	expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
	await expect(root.locator(`[data-cell-key="${firstKey}"]`)).toHaveAccessibleName(/Letter V/iu);

	await root.getByRole('button', { name: 'Exit full screen', exact: true }).click();
	await expect(root).toHaveAttribute('data-immersive', 'false');
	await expect(root.getByRole('button', { name: 'Full screen', exact: true })).toBeFocused();
});

test('reset current, clear pack, and clear all remove the intended local state', async ({
	page
}) => {
	page.on('dialog', (dialog) => dialog.accept());
	let root = await enterTerminologyRound(page);
	const first = await selectedCell(root);
	const firstKey = await first.getAttribute('data-cell-key');
	await page.keyboard.press('V');
	let settings = await openSettings(root);
	await settings.getByText('Reset or clear progress', { exact: true }).click();
	await settings.getByRole('button', { name: 'Reset current puzzle', exact: true }).click();
	await expect(root.locator(`[data-cell-key="${firstKey}"]`)).toHaveAccessibleName(
		/Letter blank/iu
	);

	if (await settings.isVisible()) {
		await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
	}
	await selectedCell(root);
	await page.keyboard.press('V');
	settings = await openSettings(root);
	await settings.getByText('Reset or clear progress', { exact: true }).click();
	await settings.getByRole('button', { name: 'Clear this pack', exact: true }).click();
	await expect(root).toHaveAttribute('data-view', 'landing');
	await expect(
		root.getByRole('button', { name: 'Resume previous round', exact: true })
	).toHaveCount(0);
	await expect
		.poll(async () => {
			const progress = await readStoredProgress(page);
			if (!progress) return true;
			const saved = (progress.savedPuzzles ?? {}) as Record<string, { packId?: string }>;
			const mastery = (progress.masteryByPack ?? {}) as Record<string, unknown>;
			return (
				Object.values(saved).every((item) => item.packId !== 'healthcare-it') &&
				!('healthcare-it' in mastery)
			);
		})
		.toBe(true);

	root = await enterTerminologyRound(page);
	await selectedCell(root);
	await page.keyboard.press('V');
	settings = await openSettings(root);
	await settings.getByText('Reset or clear progress', { exact: true }).click();
	await settings.getByRole('button', { name: 'Clear all crossword data', exact: true }).click();
	await expect(root).toHaveAttribute('data-view', 'landing');
	await expect
		.poll(async () => {
			const progress = await readStoredProgress(page);
			if (!progress) return true;
			return (
				Object.keys((progress.savedPuzzles ?? {}) as Record<string, unknown>).length === 0 &&
				Object.keys((progress.masteryByPack ?? {}) as Record<string, unknown>).length === 0
			);
		})
		.toBe(true);
	await expect(
		root.getByRole('button', { name: 'Resume previous round', exact: true })
	).toHaveCount(0);
});

test('required phone, tablet, laptop, and desktop viewports retain the grid and controls', async ({
	browser,
	baseURL
}) => {
	const viewports = [
		{ label: 'small portrait phone', width: 360, height: 800 },
		{ label: 'large portrait phone', width: 412, height: 915 },
		{ label: 'landscape phone', width: 844, height: 390 },
		{ label: 'portrait tablet', width: 768, height: 1024 },
		{ label: 'landscape tablet', width: 1024, height: 768 },
		{ label: 'laptop', width: 1366, height: 768 },
		{ label: 'desktop', width: 1440, height: 900 }
	] as const;

	for (const viewport of viewports) {
		const context = await browser.newContext({
			baseURL,
			hasTouch: viewport.width < 1024,
			viewport: { width: viewport.width, height: viewport.height }
		});
		const page = await context.newPage();
		const diagnostics = observeRuntime(page);
		try {
			const root = await enterTerminologyRound(page);
			const grid = root.getByRole('grid');
			await expect(grid, `${viewport.label} grid`).toBeVisible();
			await expect(
				root.getByRole('button', { name: 'Solve as a list', exact: true }),
				`${viewport.label} list-mode control`
			).toBeVisible();
			await expect(
				root.getByRole('button', { name: 'Full screen', exact: true }),
				`${viewport.label} full-screen control`
			).toBeVisible();
			const dimensions = await root.evaluate((element) => ({
				clientWidth: element.clientWidth,
				scrollWidth: element.scrollWidth
			}));
			expect(
				dimensions.scrollWidth,
				`${viewport.label} has no accidental horizontal game overflow`
			).toBeLessThanOrEqual(dimensions.clientWidth + 2);
			const box = await grid.boundingBox();
			expect(box, `${viewport.label} grid box`).not.toBeNull();
			expect(box?.width ?? 0, `${viewport.label} useful grid width`).toBeGreaterThan(120);
			expect(box?.width ?? Infinity, `${viewport.label} grid width`).toBeLessThanOrEqual(
				viewport.width
			);
			expect(box?.height ?? Infinity, `${viewport.label} grid height`).toBeLessThanOrEqual(
				viewport.height
			);
			if (viewport.width >= 901 && viewport.height >= 501 && box) {
				const workspaceBox = await root.locator('.grid-workspace').boundingBox();
				expect(workspaceBox, `${viewport.label} grid workspace`).not.toBeNull();
				expect(
					box.y + box.height,
					`${viewport.label} renders every grid row inside the solving workspace`
				).toBeLessThanOrEqual((workspaceBox?.y ?? 0) + (workspaceBox?.height ?? 0) + 2);
			}
			await assertNoRuntimeDiagnostics(diagnostics);
		} finally {
			await context.close();
		}
	}
});

test('axe has no serious violations and reduced-motion plus forced-colour modes retain focus parity', async ({
	page
}) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const landingResults = await new AxeBuilder({ page })
		.include('[data-testid="crossword-game"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
		.analyze();
	expect(seriousViolations(landingResults)).toEqual([]);

	const root = await enterTerminologyRound(page);
	const interactiveResults = await new AxeBuilder({ page })
		.include('[data-testid="crossword-game"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
		.analyze();
	expect(seriousViolations(interactiveResults)).toEqual([]);

	// Axe cannot reliably resolve system colour keywords while forced-colour emulation is active,
	// so forced-colour parity is verified from focus/state geometry after the normal-state scans.
	await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
	expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
		true
	);
	expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
	const cell = await selectedCell(root);
	const focusStyle = await cell.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			animationName: style.animationName,
			backgroundColor: style.backgroundColor,
			outlineStyle: style.outlineStyle,
			outlineWidth: Number.parseFloat(style.outlineWidth),
			boxShadow: style.boxShadow
		};
	});
	const unselectedBackground = await root
		.locator('[data-cell-key]:not(.selected)')
		.first()
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	expect(focusStyle.animationName).toBe('none');
	expect(
		(focusStyle.outlineStyle !== 'none' && focusStyle.outlineWidth >= 2) ||
			focusStyle.boxShadow !== 'none' ||
			focusStyle.backgroundColor !== unselectedBackground,
		'forced-colour selection retains an outline, inset ring, or system Highlight background'
	).toBe(true);
});
