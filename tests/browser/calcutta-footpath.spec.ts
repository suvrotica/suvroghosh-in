import { expect, test, type Page } from '@playwright/test';

const GAME_PATH = '/blog/games/calcutta-footpath-simulator-ekdom-side-diye-jaan';
const SETTINGS_STORAGE_KEY = 'calcutta-footpath.settings';

type LifecycleAudit = {
	canvasCreations: number;
	webglContextCalls: number;
	webglContexts: number;
	audioContextConstructions: number;
	audioContextCloses: number;
	fullscreenRequests: number;
	fullscreenExits: number;
	listenerAdds: number;
	listenerRemoves: number;
	activeListeners: Record<string, number>;
};

type PageFailures = {
	pageErrors: string[];
	consoleErrors: string[];
};

const RELEVANT_LISTENER_TYPES = [
	'fullscreenchange',
	'visibilitychange',
	'blur',
	'focus',
	'resize',
	'keydown',
	'pointerdown',
	'pointermove',
	'pointerup',
	'pointercancel',
	'lostpointercapture',
	'contextmenu',
	'webglcontextlost',
	'webglcontextrestored'
] as const;

function game(page: Page) {
	return page.locator('#game-experience');
}

function collectPageFailures(page: Page): PageFailures {
	const failures: PageFailures = { pageErrors: [], consoleErrors: [] };
	page.on('pageerror', (error) => failures.pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') failures.consoleErrors.push(message.text());
	});
	return failures;
}

function expectNoPageFailures(failures: PageFailures): void {
	expect(failures.pageErrors, 'uncaught page errors').toEqual([]);
	expect(failures.consoleErrors, 'console errors').toEqual([]);
}

async function installLifecycleAudit(page: Page, stubFullscreen = false): Promise<void> {
	await page.addInitScript(
		({ listenerTypes, fullscreenStub }) => {
			type WindowWithAudit = typeof window & {
				__calcuttaFootpathAudit: LifecycleAudit;
				webkitAudioContext?: typeof AudioContext;
			};

			const activeListeners = Object.fromEntries(listenerTypes.map((type) => [type, 0])) as Record<
				string,
				number
			>;
			const audit: LifecycleAudit = {
				canvasCreations: 0,
				webglContextCalls: 0,
				webglContexts: 0,
				audioContextConstructions: 0,
				audioContextCloses: 0,
				fullscreenRequests: 0,
				fullscreenExits: 0,
				listenerAdds: 0,
				listenerRemoves: 0,
				activeListeners
			};
			(window as WindowWithAudit).__calcuttaFootpathAudit = audit;

			const relevantTypes = new Set<string>(listenerTypes);
			const targetIds = new WeakMap<object, number>();
			const listenerIds = new WeakMap<object, number>();
			const activeRegistrations = new Set<string>();
			let nextTargetId = 1;
			let nextListenerId = 1;
			const identity = (
				map: WeakMap<object, number>,
				value: object,
				next: () => number
			): number => {
				const existing = map.get(value);
				if (existing !== undefined) return existing;
				const id = next();
				map.set(value, id);
				return id;
			};
			const listenerToken = (
				target: EventTarget,
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | AddEventListenerOptions
			): string => {
				const targetId = identity(targetIds, target, () => nextTargetId++);
				const listenerId = identity(listenerIds, listener, () => nextListenerId++);
				const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
				return targetId + ':' + type + ':' + listenerId + ':' + Number(capture);
			};

			const nativeAddEventListener = EventTarget.prototype.addEventListener;
			const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;
			Object.defineProperty(EventTarget.prototype, 'addEventListener', {
				configurable: true,
				writable: true,
				value: function (
					this: EventTarget,
					type: string,
					listener: EventListenerOrEventListenerObject | null,
					options?: boolean | AddEventListenerOptions
				) {
					if (listener && relevantTypes.has(type)) {
						const token = listenerToken(this, type, listener, options);
						if (!activeRegistrations.has(token)) {
							activeRegistrations.add(token);
							audit.listenerAdds += 1;
							audit.activeListeners[type] = (audit.activeListeners[type] ?? 0) + 1;
						}
					}
					return Reflect.apply(nativeAddEventListener, this, [type, listener, options]);
				}
			});
			Object.defineProperty(EventTarget.prototype, 'removeEventListener', {
				configurable: true,
				writable: true,
				value: function (
					this: EventTarget,
					type: string,
					listener: EventListenerOrEventListenerObject | null,
					options?: boolean | EventListenerOptions
				) {
					if (listener && relevantTypes.has(type)) {
						const token = listenerToken(this, type, listener, options);
						if (activeRegistrations.delete(token)) {
							audit.listenerRemoves += 1;
							audit.activeListeners[type] = Math.max(0, (audit.activeListeners[type] ?? 0) - 1);
						}
					}
					return Reflect.apply(nativeRemoveEventListener, this, [type, listener, options]);
				}
			});

			const nativeCreateElement = Document.prototype.createElement;
			Object.defineProperty(Document.prototype, 'createElement', {
				configurable: true,
				writable: true,
				value: function (this: Document, tagName: string, options?: ElementCreationOptions) {
					const element = Reflect.apply(nativeCreateElement, this, [tagName, options]) as Element;
					if (tagName.toLocaleLowerCase('en') === 'canvas') audit.canvasCreations += 1;
					return element;
				}
			});

			const nativeGetContext = HTMLCanvasElement.prototype.getContext;
			const webglContexts = new WeakSet<object>();
			Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
				configurable: true,
				writable: true,
				value: function (this: HTMLCanvasElement, contextId: string, ...arguments_: unknown[]) {
					const isWebGl = contextId === 'webgl' || contextId === 'webgl2';
					if (isWebGl) audit.webglContextCalls += 1;
					const context = Reflect.apply(nativeGetContext, this, [contextId, ...arguments_]) as
						| object
						| null;
					if (isWebGl && context && !webglContexts.has(context)) {
						webglContexts.add(context);
						audit.webglContexts += 1;
					}
					return context;
				}
			});

			const browserWindow = window as WindowWithAudit;
			const NativeAudioContext =
				browserWindow.AudioContext ?? browserWindow.webkitAudioContext ?? null;
			if (NativeAudioContext) {
				const nativeClose = NativeAudioContext.prototype.close;
				Object.defineProperty(NativeAudioContext.prototype, 'close', {
					configurable: true,
					writable: true,
					value: function (this: AudioContext) {
						audit.audioContextCloses += 1;
						return Reflect.apply(nativeClose, this, []);
					}
				});
				const InstrumentedAudioContext = new Proxy(NativeAudioContext, {
					construct(target, argumentsList) {
						audit.audioContextConstructions += 1;
						return Reflect.construct(target, argumentsList);
					}
				});
				Object.defineProperty(window, 'AudioContext', {
					configurable: true,
					value: InstrumentedAudioContext
				});
				if ('webkitAudioContext' in browserWindow) {
					Object.defineProperty(window, 'webkitAudioContext', {
						configurable: true,
						value: InstrumentedAudioContext
					});
				}
			}

			if (fullscreenStub) {
				let fullscreenElement: Element | null = null;
				const enterFullscreen = (element: Element): void => {
					fullscreenElement = element;
				};
				Object.defineProperty(document, 'fullscreenEnabled', {
					configurable: true,
					get: () => true
				});
				Object.defineProperty(document, 'fullscreenElement', {
					configurable: true,
					get: () => fullscreenElement
				});
				Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
					configurable: true,
					writable: true,
					value: function (this: HTMLElement): Promise<void> {
						audit.fullscreenRequests += 1;
						enterFullscreen(this);
						queueMicrotask(() => document.dispatchEvent(new Event('fullscreenchange')));
						return Promise.resolve();
					}
				});
				Object.defineProperty(document, 'exitFullscreen', {
					configurable: true,
					writable: true,
					value: (): Promise<void> => {
						audit.fullscreenExits += 1;
						fullscreenElement = null;
						queueMicrotask(() => document.dispatchEvent(new Event('fullscreenchange')));
						return Promise.resolve();
					}
				});
			}
		},
		{ listenerTypes: [...RELEVANT_LISTENER_TYPES], fullscreenStub: stubFullscreen }
	);
}

async function readLifecycleAudit(page: Page): Promise<LifecycleAudit> {
	return page.evaluate(
		() =>
			(
				window as typeof window & {
					__calcuttaFootpathAudit: LifecycleAudit;
				}
			).__calcuttaFootpathAudit
	);
}

async function openTitle(page: Page): Promise<void> {
	await page.goto(GAME_PATH, { waitUntil: 'networkidle' });
	await page.waitForLoadState('load');
	await expect(game(page)).toHaveAttribute('data-phase', 'title');
	await expect(game(page).getByRole('button', { name: 'Play in page', exact: true })).toBeVisible();
	await expect
		.poll(() => page.evaluate((key) => localStorage.getItem(key) !== null, SETTINGS_STORAGE_KEY))
		.toBe(true);
}

async function startInPage(page: Page) {
	const experience = game(page);
	await experience.getByRole('button', { name: 'Play in page', exact: true }).click();
	const canvas = experience.locator('.game-surface canvas');
	await expect(canvas).toHaveCount(1);
	await expect(canvas).toBeVisible();
	await expect(experience).toHaveAttribute('data-phase', /^(tutorial|playing)$/);
	return canvas;
}

async function destinationMetres(page: Page): Promise<number> {
	const text = await game(page).locator('.destination-card strong').innerText();
	const value = Number.parseFloat(text);
	if (!Number.isFinite(value))
		throw new Error('Destination HUD did not contain a metre value: ' + text);
	return value;
}

async function beginAutomaticWalk(page: Page, touch = false): Promise<void> {
	const experience = game(page);
	const canvas = experience.locator('.game-surface canvas');
	const box = await canvas.boundingBox();
	if (!box) throw new Error('Game canvas did not have layout bounds.');
	const stopName = touch ? 'Stop' : 'Stop walking';
	const stop = experience.getByRole('button', { name: stopName, exact: true });
	const targets = [
		{ x: box.width * 0.5, y: box.height * 0.6 },
		{ x: box.width * 0.5, y: box.height * 0.48 },
		{ x: box.width * 0.42, y: box.height * 0.58 },
		{ x: box.width * 0.58, y: box.height * 0.58 }
	];
	for (const position of targets) {
		if (touch) await canvas.tap({ position });
		else await canvas.click({ position });
		await page.waitForTimeout(180);
		if (await stop.isVisible()) return;
	}
	await expect(stop).toBeVisible();
}

test('the title is lazy, defaults to sound on, and starts one error-free WebGL canvas', async ({
	page
}) => {
	await installLifecycleAudit(page);
	const failures = collectPageFailures(page);
	await openTitle(page);

	const experience = game(page);
	await expect(experience.locator('canvas')).toHaveCount(0);
	const sound = experience.getByRole('button', { name: 'Sound', exact: true });
	await expect(sound).toHaveAttribute('aria-pressed', 'true');
	await expect(sound).toContainText('Sound: On');
	expect((await readLifecycleAudit(page)).webglContexts).toBe(0);
	expect((await readLifecycleAudit(page)).audioContextConstructions).toBe(0);

	const canvas = await startInPage(page);
	await expect.poll(async () => (await readLifecycleAudit(page)).webglContexts).toBe(1);
	await expect.poll(async () => (await readLifecycleAudit(page)).audioContextConstructions).toBe(1);
	await expect(canvas).toHaveCount(1);
	await page.waitForTimeout(250);
	expectNoPageFailures(failures);
});

test('the labelled HUD, map, immediate actions, and keyboard movement remain functional', async ({
	page
}) => {
	await openTitle(page);
	const canvas = await startInPage(page);
	const experience = game(page);
	const hud = experience.locator('[aria-label="Current walk status"]');
	await expect(hud).toBeVisible();
	await expect(hud.locator('[aria-label="Journey"]')).toContainText('Destination');
	await expect(hud.locator('[aria-label="Walk controls"]')).toBeVisible();
	await expect(experience.getByRole('button', { name: 'Turn around', exact: true })).toBeVisible();

	await experience.getByRole('button', { name: 'Map', exact: true }).click();
	const map = experience.getByRole('dialog', { name: 'Where am I going?' });
	await expect(map).toBeVisible();
	await expect(
		map.getByRole('img', { name: 'Street map showing your location and destination' })
	).toBeVisible();
	await map.getByRole('button', { name: 'Close map', exact: true }).click();
	await expect(map).toBeHidden();
	await expect(experience).toHaveAttribute('data-phase', /^(tutorial|playing)$/);

	const before = await destinationMetres(page);
	await canvas.focus();
	await page.keyboard.down('ArrowUp');
	try {
		await expect
			.poll(() => destinationMetres(page), { timeout: 10_000, intervals: [250] })
			.not.toBe(before);
	} finally {
		await page.keyboard.up('ArrowUp');
	}

	await beginAutomaticWalk(page);
	const stop = experience.getByRole('button', { name: 'Stop walking', exact: true });
	await expect(stop).toBeVisible();
	await stop.click();
	await expect(stop).toBeHidden();
});

test('ten fullscreen cycles retain one canvas, one audio graph, one WebGL context, and stable listeners', async ({
	page
}) => {
	await installLifecycleAudit(page, true);
	const failures = collectPageFailures(page);
	await openTitle(page);
	const canvas = await startInPage(page);
	await expect.poll(async () => (await readLifecycleAudit(page)).webglContexts).toBe(1);
	await expect.poll(async () => (await readLifecycleAudit(page)).audioContextConstructions).toBe(1);
	await page.waitForTimeout(600);
	const originalCanvas = await canvas.elementHandle();
	expect(originalCanvas).not.toBeNull();

	const cycleFullscreen = async (): Promise<void> => {
		await canvas.focus();
		await page.keyboard.press('f');
		await expect
			.poll(() =>
				page.evaluate(() => (document.fullscreenElement as HTMLElement | null)?.id ?? null)
			)
			.toBe('game-experience');
		await page.keyboard.press('f');
		await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
	};

	// The first synthetic transition lets Playwright and Svelte install their one-time delegated
	// interaction listeners. The ten measured cycles below must not add another registration.
	await cycleFullscreen();
	await page.waitForTimeout(100);
	const baseline = await readLifecycleAudit(page);
	for (let cycle = 0; cycle < 10; cycle += 1) {
		await cycleFullscreen();
	}

	const after = await readLifecycleAudit(page);
	expect(after.fullscreenRequests - baseline.fullscreenRequests).toBe(10);
	expect(after.fullscreenExits - baseline.fullscreenExits).toBe(10);
	expect(after.webglContexts).toBe(1);
	expect(after.audioContextConstructions).toBe(1);
	expect(after.audioContextCloses).toBe(0);
	expect(after.canvasCreations).toBe(baseline.canvasCreations);
	expect(after.activeListeners).toEqual(baseline.activeListeners);
	await expect(canvas).toHaveCount(1);
	expect(await originalCanvas!.evaluate((element) => element.isConnected)).toBe(true);
	expectNoPageFailures(failures);
});

test('the portrait and short-landscape touch layouts avoid overflow and keep 44px controls', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
		reducedMotion: 'no-preference'
	});
	const page = await context.newPage();
	try {
		await openTitle(page);
		await game(page).getByRole('button', { name: 'Settings', exact: true }).click();
		const settings = page.getByRole('dialog', { name: 'Street settings' });
		await settings.getByLabel(/Walking controls/i).selectOption('experienced');
		await settings.getByRole('button', { name: 'Done', exact: true }).click();
		await startInPage(page);
		const experience = game(page);
		await expect(experience.locator('.touch-controls')).toBeVisible();
		const virtualWalk = experience.getByRole('button', { name: 'Walk', exact: true });
		await expect(virtualWalk).toBeVisible();
		const virtualClickStates = await virtualWalk.evaluate(async (button) => {
			button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
			await Promise.resolve();
			const activeImmediately = button.classList.contains('active');
			await new Promise((resolve) => setTimeout(resolve, 180));
			return { activeImmediately, activeAfterPulse: button.classList.contains('active') };
		});
		expect(virtualClickStates).toEqual({ activeImmediately: true, activeAfterPulse: false });
		await expect(
			experience.getByRole('button', { name: 'Turn around', exact: true })
		).toBeVisible();
		await beginAutomaticWalk(page, true);
		await expect(experience.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();

		const layout = await page.evaluate(() => {
			const root = document.documentElement;
			const gameElement = document.querySelector<HTMLElement>('#game-experience');
			const gameBounds = gameElement?.getBoundingClientRect() ?? null;
			return {
				viewportWidth: root.clientWidth,
				scrollWidth: root.scrollWidth,
				bodyScrollWidth: document.body.scrollWidth,
				gameLeft: gameBounds?.left ?? 0,
				gameRight: gameBounds?.right ?? 0
			};
		});
		expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
		expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
		expect(layout.gameLeft).toBeGreaterThanOrEqual(-1);
		expect(layout.gameRight).toBeLessThanOrEqual(layout.viewportWidth + 1);

		const sizes = await experience.locator('button:visible').evaluateAll((buttons) =>
			buttons.map((button) => {
				const bounds = button.getBoundingClientRect();
				return {
					name: button.textContent?.trim() ?? '',
					width: bounds.width,
					height: bounds.height
				};
			})
		);
		expect(sizes.length).toBeGreaterThanOrEqual(4);
		for (const size of sizes) {
			expect(size.width, size.name + ' touch-target width').toBeGreaterThanOrEqual(44);
			expect(size.height, size.name + ' touch-target height').toBeGreaterThanOrEqual(44);
		}

		await page.setViewportSize({ width: 844, height: 390 });
		await page.waitForTimeout(100);
		const landscapeLayout = await page.evaluate(() => ({
			viewportWidth: document.documentElement.clientWidth,
			scrollWidth: document.documentElement.scrollWidth,
			bodyScrollWidth: document.body.scrollWidth
		}));
		expect(landscapeLayout.scrollWidth).toBeLessThanOrEqual(landscapeLayout.viewportWidth + 1);
		expect(landscapeLayout.bodyScrollWidth).toBeLessThanOrEqual(landscapeLayout.viewportWidth + 1);
		const landscapeSizes = await experience.locator('button:visible').evaluateAll((buttons) =>
			buttons.map((button) => {
				const bounds = button.getBoundingClientRect();
				return {
					name: button.textContent?.trim() ?? '',
					width: bounds.width,
					height: bounds.height
				};
			})
		);
		for (const size of landscapeSizes) {
			expect(size.width, size.name + ' landscape touch-target width').toBeGreaterThanOrEqual(44);
			expect(size.height, size.name + ' landscape touch-target height').toBeGreaterThanOrEqual(44);
		}
	} finally {
		await context.close();
	}
});

test('reduced motion and high-contrast warnings persist across reloads', async ({ page }) => {
	await openTitle(page);
	await game(page).getByRole('button', { name: 'Settings', exact: true }).click();
	let dialog = page.getByRole('dialog', { name: 'Street settings' });
	await expect(dialog).toBeVisible();
	const reducedMotion = dialog.getByRole('checkbox', { name: /Reduced motion/i });
	const highContrast = dialog.getByRole('checkbox', { name: /High-contrast warnings/i });
	await reducedMotion.check();
	await highContrast.check();
	await dialog.getByRole('button', { name: 'Done', exact: true }).click();

	await expect
		.poll(() =>
			page.evaluate((key) => {
				const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as {
					reducedMotion?: boolean;
					highContrastWarnings?: boolean;
				};
				return {
					reducedMotion: parsed.reducedMotion,
					highContrastWarnings: parsed.highContrastWarnings
				};
			}, SETTINGS_STORAGE_KEY)
		)
		.toEqual({ reducedMotion: true, highContrastWarnings: true });

	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForLoadState('load');
	await expect(game(page)).toHaveAttribute('data-phase', 'title');
	await expect(game(page)).toHaveClass(/reduced-motion/);
	await page.waitForTimeout(100);
	await game(page).getByRole('button', { name: 'Settings', exact: true }).click();
	dialog = page.getByRole('dialog', { name: 'Street settings' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('checkbox', { name: /Reduced motion/i })).toBeChecked();
	await expect(dialog.getByRole('checkbox', { name: /High-contrast warnings/i })).toBeChecked();
	await dialog.getByRole('button', { name: 'Done', exact: true }).click();

	await startInPage(page);
	await expect(game(page).locator('.game-hud.high-contrast')).toBeVisible();
});

test('DEV renderer and audio diagnostics are finite when the runtime exposes them', async ({
	page
}) => {
	await openTitle(page);
	await startInPage(page);
	const surface = game(page).locator('.game-surface');
	await expect
		.poll(() =>
			surface.evaluate((element) =>
				Object.keys((element as HTMLElement).dataset).some(
					(key) => key.startsWith('render') || key.startsWith('audio')
				)
			)
		)
		.toBe(true);

	const diagnostics = await surface.evaluate((element) => ({
		...(element as HTMLElement).dataset
	}));
	const numericKeys = [
		'renderFps',
		'renderFrameMs',
		'renderDrawCalls',
		'renderTriangles',
		'renderEntities',
		'renderTextureBytes',
		'audioNodes',
		'audioSources'
	] as const;
	for (const key of numericKeys) {
		const value = diagnostics[key];
		if (value === undefined) continue;
		expect(Number.isFinite(Number(value)), key + ' should be finite').toBe(true);
		expect(Number(value), key + ' should be non-negative').toBeGreaterThanOrEqual(0);
	}
	if (diagnostics.renderQuality !== undefined) {
		expect(['low', 'high']).toContain(diagnostics.renderQuality);
	}
	if (diagnostics.audioContext !== undefined) {
		expect(['running', 'suspended', 'interrupted', 'closed', 'unavailable']).toContain(
			diagnostics.audioContext
		);
	}
});
