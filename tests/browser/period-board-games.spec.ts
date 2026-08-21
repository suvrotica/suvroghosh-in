import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
	DEFAULT_LUDO_SETUP,
	startLudoGame
} from '../../src/lib/games/period-board-games/ludo/engine';
import {
	LUDO_STORAGE_KEY,
	serializeLudoState
} from '../../src/lib/games/period-board-games/ludo/persistence';
import type { LudoPosition, LudoState } from '../../src/lib/games/period-board-games/ludo/types';
import { PREFERENCES_STORAGE_KEY } from '../../src/lib/games/period-board-games/preferences';
import { nextDie } from '../../src/lib/games/period-board-games/rng';
import {
	DEFAULT_SNAKES_SETUP,
	startSnakesGame
} from '../../src/lib/games/period-board-games/snakes/engine';
import {
	SNAKES_STORAGE_KEY,
	serializeSnakesState
} from '../../src/lib/games/period-board-games/snakes/persistence';
import type { SnakesState } from '../../src/lib/games/period-board-games/snakes/types';

const articlePath = '/blog/games/ludo-and-saap-ludo';
const screenshotDirectory = resolve('test-results', 'period-board-games');

type RuntimeDiagnostics = {
	errors: string[];
	failedRequests: string[];
};

type StoredEnvelope<T> = { version: 1; state: T };

function root(page: Page): Locator {
	return page.locator('#game-experience');
}

function game(page: Page, name: 'ludo' | 'saap-ludo'): Locator {
	return root(page).locator(`.game-layout[data-game="${name}"]`);
}

function controls(page: Page, name: 'Ludo' | 'Saap-Ludo'): Locator {
	return root(page).getByRole('complementary', { name: `${name} match controls` });
}

function ignorablePlatformRequest(url: string): boolean {
	const pathname = new URL(url).pathname;
	return pathname.startsWith('/_vercel/') || /(?:^|\/)favicon(?:\.|$)/iu.test(pathname);
}

function observeRuntime(page: Page): RuntimeDiagnostics {
	const diagnostics: RuntimeDiagnostics = { errors: [], failedRequests: [] };
	page.on('pageerror', (error) => diagnostics.errors.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		const value = message.text();
		const hydrationWarning = /hydrat(?:e|ion|ing)|server-rendered html/iu.test(value);
		if (message.type() !== 'error' && !hydrationWarning) return;
		if (/\/_vercel\/(?:insights|speed-insights)\//iu.test(value)) return;
		if (ignorablePlatformRequest(message.location().url || 'http://local.invalid/')) return;
		diagnostics.errors.push(`${message.type()}: ${value}`);
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

function rngStateForDie(value: number): number {
	for (let seed = 1; seed < 100_000; seed += 1) {
		if (nextDie(seed).value === value) return seed;
	}
	throw new Error(`Could not find a deterministic seed for die value ${value}`);
}

function playableLudo(nextValue = 6, computerTurn = false, computerCount: 1 | 2 | 3 = 1) {
	const state = startLudoGame(
		{ ...DEFAULT_LUDO_SETUP, humanName: 'Suvro', computerCount },
		0x1984cafe
	);
	const turnIndex = computerTurn
		? state.players.findIndex((player) => player.kind === 'computer')
		: state.players.findIndex((player) => player.id === 'human');
	return {
		...state,
		phase: 'awaiting-roll' as const,
		opening: { ...state.opening, contenders: [], cursor: 0 },
		turnIndex,
		turnId: 2,
		effectId: 2,
		rngState: rngStateForDie(nextValue),
		die: null,
		consecutiveSixes: 0,
		legalMoves: [],
		pendingMove: null,
		pendingBonus: false,
		announcement: computerTurn ? 'Computer throw.' : 'তোমার দান / Your throw',
		history: []
	} satisfies LudoState;
}

function playableSnakes(nextValue = 1, computerTurn = false, computerCount: 1 | 2 | 3 = 1) {
	const state = startSnakesGame(
		{ ...DEFAULT_SNAKES_SETUP, humanName: 'Suvro', computerCount },
		0x1984cafe
	);
	const turnIndex = computerTurn
		? state.players.findIndex((player) => player.kind === 'computer')
		: state.players.findIndex((player) => player.id === 'human');
	return {
		...state,
		phase: 'awaiting-roll' as const,
		opening: { ...state.opening, contenders: [], cursor: 0 },
		turnIndex,
		turnId: 2,
		effectId: 2,
		rngState: rngStateForDie(nextValue),
		die: null,
		pendingMove: null,
		pendingBonus: false,
		announcement: computerTurn ? 'Computer throw.' : 'তোমার দান / Your throw',
		history: []
	} satisfies SnakesState;
}

function visualLudoFixture(): LudoState {
	const state = playableLudo(4, false, 3);
	const humanPositions: LudoPosition[] = [
		{ kind: 'track', progress: 0 },
		{ kind: 'track', progress: 17 },
		{ kind: 'home', index: 2 },
		{ kind: 'yard' }
	];
	return {
		...state,
		tokens: state.tokens.map((token) => {
			if (token.playerId === 'human') return { ...token, position: humanPositions[token.number] };
			const computerNumber = Number(token.playerId.split('-')[1] ?? 1);
			const positions: LudoPosition[] = [
				{ kind: 'track', progress: (computerNumber * 9 + token.number * 6) % 52 },
				{ kind: 'track', progress: (computerNumber * 9 + token.number * 6) % 52 },
				{ kind: 'yard' },
				{ kind: 'finished' }
			];
			return { ...token, position: positions[token.number] };
		})
	};
}

function visualSnakesFixture(): SnakesState {
	const state = playableSnakes(4, false, 3);
	const positions = [5, 33, 33, 76];
	return {
		...state,
		counters: state.counters.map((counter, index) => ({
			...counter,
			position: positions[index]
		}))
	};
}

async function preload(
	page: Page,
	ludo: LudoState,
	snakes: SnakesState,
	pace: 'relaxed' | 'normal' | 'brisk' = 'brisk'
) {
	await page.addInitScript(
		({ ludoKey, ludoValue, snakesKey, snakesValue, preferencesKey, preferencesValue }) => {
			if (!localStorage.getItem(ludoKey)) localStorage.setItem(ludoKey, ludoValue);
			if (!localStorage.getItem(snakesKey)) localStorage.setItem(snakesKey, snakesValue);
			if (!localStorage.getItem(preferencesKey)) {
				localStorage.setItem(preferencesKey, preferencesValue);
			}
		},
		{
			ludoKey: LUDO_STORAGE_KEY,
			ludoValue: serializeLudoState(ludo),
			snakesKey: SNAKES_STORAGE_KEY,
			snakesValue: serializeSnakesState(snakes),
			preferencesKey: PREFERENCES_STORAGE_KEY,
			preferencesValue: JSON.stringify({
				version: 1,
				preferences: { pace, sound: false }
			})
		}
	);
}

async function storedState<T>(page: Page, key: string): Promise<T> {
	return page.evaluate((storageKey) => {
		const raw = localStorage.getItem(storageKey);
		if (!raw) throw new Error(`Missing local state for ${storageKey}`);
		return (JSON.parse(raw) as StoredEnvelope<T>).state;
	}, key);
}

async function assertNoOverflow(page: Page) {
	const measurements = await root(page).evaluate((element) => ({
		documentClient: document.documentElement.clientWidth,
		documentScroll: document.documentElement.scrollWidth,
		rootClient: element.clientWidth,
		rootScroll: element.scrollWidth
	}));
	expect(measurements.documentScroll).toBeLessThanOrEqual(measurements.documentClient + 2);
	expect(measurements.rootScroll).toBeLessThanOrEqual(measurements.rootClient + 2);
}

test('SSR and no-JavaScript output expose exactly two useful game tabs and the fallback copy', async ({
	browser,
	baseURL,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.status()).toBe(200);
	const serverHtml = await response.text();
	expect(serverHtml.match(/role="tab"/gu)).toHaveLength(2);
	expect(serverHtml).toMatch(/JavaScript is required to roll the die/iu);

	const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
	const page = await context.newPage();
	try {
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(
			page.getByRole('heading', { name: 'Ludo & Saap-Ludo', exact: true }).first()
		).toBeVisible();
		await expect(page.getByRole('tab')).toHaveCount(2);
		await expect(page.getByTestId('ludo-board')).toBeVisible();
		await expect(page.getByText(/JavaScript is required to roll the die/iu)).toBeVisible();
	} finally {
		await context.close();
	}
});

test('tabs support arrows, Home, End, exact deep links, preserved URL state, and browser history', async ({
	page
}) => {
	const diagnostics = observeRuntime(page);
	await page.goto(`${articlePath}?from=family#game-experience`, { waitUntil: 'domcontentloaded' });
	const tablist = root(page).getByRole('tablist', {
		name: 'Choose a side of the folding game board'
	});
	const ludoTab = tablist.getByRole('tab', { name: /\bLUDO\b/u });
	const snakesTab = tablist.getByRole('tab', { name: /SNAKES & LADDERS/u });
	await expect(tablist.getByRole('tab')).toHaveCount(2);
	await expect(ludoTab).toHaveAttribute('aria-selected', 'true');
	await expect(root(page)).toHaveAttribute('data-active-board', 'ludo');

	await ludoTab.focus();
	await ludoTab.press('ArrowRight');
	await expect(snakesTab).toBeFocused();
	await expect(snakesTab).toHaveAttribute('aria-selected', 'true');
	await expect(page).toHaveURL(/\?from=family&board=saap-ludo#game-experience$/u);
	await expect(root(page).locator('#ludo-panel')).toBeHidden();
	await expect(root(page).locator('#snakes-panel')).toBeVisible();

	await snakesTab.press('Home');
	await expect(ludoTab).toBeFocused();
	await expect(page).toHaveURL(/\?from=family#game-experience$/u);
	await ludoTab.press('End');
	await expect(snakesTab).toBeFocused();
	await snakesTab.press('ArrowLeft');
	await expect(ludoTab).toBeFocused();

	await page.goBack();
	await expect(snakesTab).toHaveAttribute('aria-selected', 'true');
	await page.goForward();
	await expect(ludoTab).toHaveAttribute('aria-selected', 'true');

	await page.goto(`${articlePath}?board=saap-ludo`, { waitUntil: 'domcontentloaded' });
	await expect(snakesTab).toHaveAttribute('aria-selected', 'true');
	await page.goto(`${articlePath}?notboard=saap-ludo`, { waitUntil: 'domcontentloaded' });
	await expect(ludoTab).toHaveAttribute('aria-selected', 'true');
	await page.goto(`${articlePath}?board=saap-ludo-extra`, { waitUntil: 'domcontentloaded' });
	await expect(ludoTab).toHaveAttribute('aria-selected', 'true');
	expect(diagnostics.errors).toEqual([]);
	expect(diagnostics.failedRequests).toEqual([]);
});

test('keyboard play, rapid activation, independent saves, shared preferences, refresh, and confirmations work', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await preload(page, playableLudo(6), playableSnakes(1));
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });

	const ludoControls = controls(page, 'Ludo');
	const ludoDie = ludoControls.getByRole('button', { name: 'Roll the Ludo die', exact: true });
	await expect(ludoDie).toBeEnabled();
	await ludoDie.evaluate((button: HTMLButtonElement) => {
		button.click();
		button.click();
	});
	await expect(game(page, 'ludo')).toHaveAttribute('data-phase', 'awaiting-human-token');
	let ludoState = await storedState<LudoState>(page, LUDO_STORAGE_KEY);
	expect(ludoState.history.filter((entry) => /rolled 6/u.test(entry.text))).toHaveLength(1);
	const firstMove = ludoControls
		.getByRole('group', { name: 'Choose your move' })
		.getByRole('button')
		.first();
	await firstMove.press('Enter');
	await expect(game(page, 'ludo')).toHaveAttribute('data-phase', 'awaiting-roll');
	ludoState = await storedState<LudoState>(page, LUDO_STORAGE_KEY);
	expect(
		ludoState.tokens.some((token) => token.playerId === 'human' && token.position.kind === 'track')
	).toBe(true);
	const committedLudo = JSON.stringify(ludoState.tokens);

	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(game(page, 'ludo')).toHaveAttribute('data-phase', 'awaiting-roll');
	expect(JSON.stringify((await storedState<LudoState>(page, LUDO_STORAGE_KEY)).tokens)).toBe(
		committedLudo
	);

	const snakesTab = root(page).getByRole('tab', { name: /SNAKES & LADDERS/u });
	await snakesTab.click();
	const snakesBefore = await page.evaluate((key) => localStorage.getItem(key), SNAKES_STORAGE_KEY);
	const ludoBeforeSnakesRoll = await page.evaluate(
		(key) => localStorage.getItem(key),
		LUDO_STORAGE_KEY
	);
	const snakesDie = controls(page, 'Saap-Ludo').getByRole('button', {
		name: 'Roll the Saap-Ludo die',
		exact: true
	});
	await snakesDie.press('Space');
	await expect
		.poll(async () => {
			const state = await storedState<SnakesState>(page, SNAKES_STORAGE_KEY);
			return state.counters.find((counter) => counter.playerId === 'human')?.position;
		})
		.toBe(1);
	expect(await page.evaluate((key) => localStorage.getItem(key), LUDO_STORAGE_KEY)).toBe(
		ludoBeforeSnakesRoll
	);
	expect(await page.evaluate((key) => localStorage.getItem(key), SNAKES_STORAGE_KEY)).not.toBe(
		snakesBefore
	);

	const snakesControls = controls(page, 'Saap-Ludo');
	await snakesControls.getByLabel('Pace').selectOption('relaxed');
	await snakesControls.getByRole('button', { name: 'Sound off', exact: true }).click();
	await root(page)
		.getByRole('tab', { name: /\bLUDO\b/u })
		.click();
	await expect(ludoControls.getByLabel('Pace')).toHaveValue('relaxed');
	await expect(ludoControls.getByRole('button', { name: 'Sound on', exact: true })).toBeVisible();
	await page.addInitScript(() => {
		const soundWindow = window as typeof window & {
			__periodSoundResumes?: number;
			__periodSoundStarts?: number;
		};
		soundWindow.__periodSoundResumes = 0;
		soundWindow.__periodSoundStarts = 0;
		class TestAudioContext {
			state: AudioContextState = 'suspended';
			currentTime = 0;
			destination = {};
			resume() {
				this.state = 'running';
				soundWindow.__periodSoundResumes = (soundWindow.__periodSoundResumes ?? 0) + 1;
				return Promise.resolve();
			}
			createGain() {
				return {
					gain: {
						setValueAtTime() {},
						exponentialRampToValueAtTime() {}
					},
					connect() {}
				};
			}
			createOscillator() {
				return {
					type: 'sine',
					frequency: {
						setValueAtTime() {},
						exponentialRampToValueAtTime() {}
					},
					connect() {},
					start() {
						soundWindow.__periodSoundStarts = (soundWindow.__periodSoundStarts ?? 0) + 1;
					},
					stop() {}
				};
			}
			close() {
				this.state = 'closed';
				return Promise.resolve();
			}
		}
		Object.defineProperty(window, 'AudioContext', {
			configurable: true,
			value: TestAudioContext
		});
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(controls(page, 'Ludo').getByLabel('Pace')).toHaveValue('relaxed');
	await expect(controls(page, 'Ludo').getByRole('button', { name: 'Sound on' })).toBeVisible();
	await controls(page, 'Ludo')
		.getByRole('button', { name: 'Roll the Ludo die', exact: true })
		.press('Space');
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as typeof window & { __periodSoundStarts?: number }).__periodSoundStarts ?? 0
			)
		)
		.toBeGreaterThan(0);

	const snakesRawBeforeLudoReset = await page.evaluate(
		(key) => localStorage.getItem(key),
		SNAKES_STORAGE_KEY
	);
	page.once('dialog', (dialog) => dialog.accept());
	await controls(page, 'Ludo').getByRole('button', { name: 'New game', exact: true }).click();
	await expect(game(page, 'ludo')).toHaveAttribute('data-phase', 'setup');
	expect(await page.evaluate((key) => localStorage.getItem(key), SNAKES_STORAGE_KEY)).toBe(
		snakesRawBeforeLudoReset
	);

	await root(page)
		.getByRole('tab', { name: /SNAKES & LADDERS/u })
		.click();
	page.once('dialog', (dialog) => dialog.dismiss());
	await controls(page, 'Saap-Ludo').getByRole('button', { name: 'New game', exact: true }).click();
	const afterDismiss = await storedState<SnakesState>(page, SNAKES_STORAGE_KEY);
	expect(afterDismiss.phase).not.toBe('setup');
	expect(afterDismiss.counters.find((counter) => counter.playerId === 'human')?.position).toBe(1);
});

test('an inactive or browser-hidden board cancels delayed computer work without consuming a roll', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await preload(page, playableLudo(2, true), playableSnakes(3));
	await page.goto(`${articlePath}?board=saap-ludo`, { waitUntil: 'domcontentloaded' });
	await expect(root(page)).toHaveAttribute('data-active-board', 'snakes');
	await expect
		.poll(async () => (await storedState<LudoState>(page, LUDO_STORAGE_KEY)).phase)
		.toBe('paused');
	const inactiveSnapshot = await storedState<LudoState>(page, LUDO_STORAGE_KEY);
	await page.waitForTimeout(700);
	const inactiveAfter = await storedState<LudoState>(page, LUDO_STORAGE_KEY);
	expect(inactiveAfter.rngState).toBe(inactiveSnapshot.rngState);
	expect(inactiveAfter.turnId).toBe(inactiveSnapshot.turnId);
	expect(inactiveAfter.tokens).toEqual(inactiveSnapshot.tokens);
	expect(inactiveAfter.history).toEqual(inactiveSnapshot.history);

	await root(page)
		.getByRole('tab', { name: /\bLUDO\b/u })
		.click();
	await expect
		.poll(async () => {
			const state = await storedState<LudoState>(page, LUDO_STORAGE_KEY);
			return state.phase === 'awaiting-roll' && state.players[state.turnIndex]?.id === 'human'
				? state.history.filter((entry) => / rolled /u.test(entry.text)).length
				: -1;
		})
		.toBe(1);
	const afterOneComputerRoll = await storedState<LudoState>(page, LUDO_STORAGE_KEY);
	expect(afterOneComputerRoll.rngState).not.toBe(inactiveSnapshot.rngState);

	await root(page)
		.getByRole('tab', { name: /SNAKES & LADDERS/u })
		.click();
	await page.addInitScript(() => {
		(window as typeof window & { __periodGameHidden?: boolean }).__periodGameHidden = true;
		Object.defineProperty(document, 'hidden', {
			configurable: true,
			get: () => (window as typeof window & { __periodGameHidden?: boolean }).__periodGameHidden
		});
	});
	await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
		key: LUDO_STORAGE_KEY,
		value: serializeLudoState(playableLudo(3, true))
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await root(page)
		.getByRole('tab', { name: /\bLUDO\b/u })
		.click();
	await expect
		.poll(async () => (await storedState<LudoState>(page, LUDO_STORAGE_KEY)).phase)
		.toBe('paused');
	const hiddenSnapshot = await storedState<LudoState>(page, LUDO_STORAGE_KEY);
	await page.waitForTimeout(700);
	expect((await storedState<LudoState>(page, LUDO_STORAGE_KEY)).rngState).toBe(
		hiddenSnapshot.rngState
	);
	await page.evaluate(() => {
		(window as typeof window & { __periodGameHidden?: boolean }).__periodGameHidden = false;
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect
		.poll(async () => {
			const state = await storedState<LudoState>(page, LUDO_STORAGE_KEY);
			return state.phase === 'awaiting-roll' && state.players[state.turnIndex]?.id === 'human'
				? state.history.filter((entry) => / rolled /u.test(entry.text)).length
				: -1;
		})
		.toBe(1);
});

test('malformed saves recover safely; reduced motion, fallback fullscreen, and accessibility remain sound', async ({
	page
}) => {
	const diagnostics = observeRuntime(page);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await preload(page, playableLudo(6), playableSnakes(1));
	await page.addInitScript(() => {
		Object.defineProperty(Element.prototype, 'requestFullscreen', {
			configurable: true,
			value: undefined
		});
	});
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });

	const a11y = await new AxeBuilder({ page })
		.include('#game-experience')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(seriousViolations(a11y)).toEqual([]);

	await root(page)
		.getByRole('tab', { name: /SNAKES & LADDERS/u })
		.click();
	const motion = await root(page)
		.locator('.board-paper')
		.evaluate((element) => {
			const style = getComputedStyle(element);
			return { animationName: style.animationName, transitionDuration: style.transitionDuration };
		});
	expect(motion.animationName).toBe('none');
	expect(motion.transitionDuration).toMatch(/^0s(?:, 0s)*$/u);

	const fullscreenButton = controls(page, 'Saap-Ludo').getByRole('button', {
		name: 'Fullscreen',
		exact: true
	});
	await fullscreenButton.click();
	await expect(root(page)).toHaveAttribute('data-fullscreen', 'fallback');
	await expect(page.locator('html')).toHaveAttribute('data-game-immersive', 'true');
	expect(
		await root(page).evaluate((element) => {
			let branch: HTMLElement = element as HTMLElement;
			while (branch.parentElement) {
				const parent = branch.parentElement;
				for (const sibling of parent.children) {
					if (sibling !== branch && sibling instanceof HTMLElement && !sibling.inert) return false;
				}
				if (parent === document.body) break;
				branch = parent;
			}
			return true;
		})
	).toBe(true);
	await expect(
		controls(page, 'Saap-Ludo').getByRole('button', { name: 'Exit fullscreen', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	expect(await root(page).evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
	expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
	await page.keyboard.press('Escape');
	await expect(root(page)).toHaveAttribute('data-fullscreen', 'off');
	await expect(page.locator('html')).not.toHaveAttribute('data-game-immersive', 'true');
	await expect(fullscreenButton).toBeFocused();

	await root(page)
		.getByRole('tab', { name: /\bLUDO\b/u })
		.click();
	await expect
		.poll(async () => (await storedState<SnakesState>(page, SNAKES_STORAGE_KEY)).phase)
		.toBe('paused');
	const snakesBefore = await page.evaluate((key) => localStorage.getItem(key), SNAKES_STORAGE_KEY);
	const malformed = JSON.parse(serializeLudoState(playableLudo(6))) as StoredEnvelope<LudoState>;
	(malformed.state.setup as unknown) = {};
	await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
		key: LUDO_STORAGE_KEY,
		value: JSON.stringify(malformed)
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(game(page, 'ludo')).toHaveAttribute('data-phase', 'setup');
	expect(await page.evaluate((key) => localStorage.getItem(key), SNAKES_STORAGE_KEY)).toBe(
		snakesBefore
	);
	expect(diagnostics.errors).toEqual([]);
	expect(diagnostics.failedRequests).toEqual([]);
});

async function driveCompleteMatch(page: Page, kind: 'ludo' | 'saap-ludo') {
	const key = kind === 'ludo' ? LUDO_STORAGE_KEY : SNAKES_STORAGE_KEY;
	const layout = game(page, kind);
	for (let step = 0; step < 4_000; step += 1) {
		const state = await storedState<LudoState | SnakesState>(page, key);
		if (state.phase === 'game-over') return state;
		const currentPlayer = state.players[state.turnIndex];
		const openingId = state.opening.contenders[state.opening.cursor];
		const humanCanRoll =
			(state.phase === 'opening-roll' && openingId === 'human') ||
			(state.phase === 'awaiting-roll' && currentPlayer?.id === 'human');
		if (humanCanRoll) {
			const label =
				state.phase === 'opening-roll'
					? 'Make your opening throw'
					: kind === 'ludo'
						? 'Roll the Ludo die'
						: 'Roll the Saap-Ludo die';
			await layout.getByRole('button', { name: label, exact: true }).press('Space');
			await page.clock.runFor(10_000);
			continue;
		}
		if (kind === 'ludo' && state.phase === 'awaiting-human-token') {
			await layout
				.getByRole('group', { name: 'Choose your move' })
				.getByRole('button')
				.first()
				.press('Enter');
			await page.clock.runFor(10_000);
			continue;
		}
		await page.clock.runFor(20_000);
	}
	throw new Error(
		`Seeded ${kind} browser match did not finish; phase=${await layout.getAttribute('data-phase')}`
	);
}

test('a complete seeded Ludo match runs through the browser controller', async ({ page }) => {
	test.setTimeout(180_000);
	const initial = startLudoGame(
		{ ...DEFAULT_LUDO_SETUP, humanName: 'Suvro', computerCount: 1 },
		0x1984cafe
	);
	await preload(page, initial, playableSnakes());
	await page.clock.install();
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const finished = await driveCompleteMatch(page, 'ludo');
	expect(finished.winnerId).toBeTruthy();
	const winner = finished.players.find((player) => player.id === finished.winnerId)!;
	await expect(game(page, 'ludo')).toHaveAttribute('data-phase', 'game-over');
	await expect(
		controls(page, 'Ludo').getByRole('heading', { name: `${winner.name} wins`, exact: true })
	).toBeVisible();
	await expect(controls(page, 'Ludo').getByRole('button', { name: 'Play again' })).toBeVisible();
});

test('a complete seeded Saap-Ludo match runs through the browser controller', async ({ page }) => {
	test.setTimeout(180_000);
	const initial = startSnakesGame(
		{ ...DEFAULT_SNAKES_SETUP, humanName: 'Suvro', computerCount: 1 },
		0x1984cafe
	);
	await preload(page, playableLudo(), initial);
	await page.clock.install();
	await page.goto(`${articlePath}?board=saap-ludo`, { waitUntil: 'domcontentloaded' });
	const finished = await driveCompleteMatch(page, 'saap-ludo');
	expect(finished.winnerId).toBeTruthy();
	const winner = finished.players.find((player) => player.id === finished.winnerId)!;
	await expect(game(page, 'saap-ludo')).toHaveAttribute('data-phase', 'game-over');
	await expect(
		controls(page, 'Saap-Ludo').getByRole('heading', {
			name: `${winner.name} wins`,
			exact: true
		})
	).toBeVisible();
	await expect(
		controls(page, 'Saap-Ludo').getByRole('button', { name: 'Play again' })
	).toBeVisible();
});

async function screenshotContext(browser: Browser, baseURL: string, width: number, height: number) {
	const context = await browser.newContext({
		baseURL,
		viewport: { width, height },
		reducedMotion: 'reduce'
	});
	await context.addInitScript(
		({ ludoKey, ludoValue, snakesKey, snakesValue, preferencesKey }) => {
			localStorage.setItem(ludoKey, ludoValue);
			localStorage.setItem(snakesKey, snakesValue);
			localStorage.setItem(
				preferencesKey,
				JSON.stringify({ version: 1, preferences: { pace: 'brisk', sound: false } })
			);
		},
		{
			ludoKey: LUDO_STORAGE_KEY,
			ludoValue: serializeLudoState(visualLudoFixture()),
			snakesKey: SNAKES_STORAGE_KEY,
			snakesValue: serializeSnakesState(visualSnakesFixture()),
			preferencesKey: PREFERENCES_STORAGE_KEY
		}
	);
	return context;
}

test('both boards remain square and overflow-free in the three requested responsive viewports', async ({
	browser,
	baseURL
}) => {
	if (!baseURL) throw new Error('Playwright baseURL is required');
	await mkdir(screenshotDirectory, { recursive: true });
	for (const { width, height } of [
		{ width: 360, height: 800 },
		{ width: 768, height: 1024 },
		{ width: 1440, height: 900 }
	]) {
		const context = await screenshotContext(browser, baseURL, width, height);
		const page = await context.newPage();
		try {
			await page.goto(`${articlePath}#game-experience`, { waitUntil: 'domcontentloaded' });
			await page.evaluate(() => document.fonts.ready);
			await root(page).scrollIntoViewIfNeeded();
			await assertNoOverflow(page);
			for (const [name, testId] of [
				['ludo', 'ludo-board'],
				['saap-ludo', 'saap-ludo-board']
			] as const) {
				if (name === 'saap-ludo') {
					await root(page)
						.getByRole('tab', { name: /SNAKES & LADDERS/u })
						.click();
				}
				await expect(
					controls(page, name === 'ludo' ? 'Ludo' : 'Saap-Ludo').getByRole('heading', {
						name: "Suvro's turn",
						exact: true
					})
				).toHaveText("Suvro's turn");
				const board = page.getByTestId(testId);
				await expect(board).toBeVisible();
				const box = await board.boundingBox();
				expect(box).not.toBeNull();
				expect(box!.width).toBeGreaterThan(0);
				expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(2);
				expect(box!.width).toBeLessThanOrEqual(width + 1);
				await assertNoOverflow(page);
				await root(page).scrollIntoViewIfNeeded();
				await page.screenshot({
					path: resolve(screenshotDirectory, `${name}-${width}x${height}.png`),
					animations: 'disabled',
					fullPage: false
				});
			}
		} finally {
			await context.close();
		}
	}
});
