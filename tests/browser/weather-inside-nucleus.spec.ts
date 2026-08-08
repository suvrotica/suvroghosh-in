import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/weather-inside-the-nucleus';
const articleTitle = 'Weather Inside the Nucleus';
const diagnosticsByPage = new WeakMap<Page, string[]>();

type ResourceAudit = {
	canvasElements: number;
	getContextCalls: number;
	webglContextCalls: number;
	webglContexts: number;
	offscreenCanvasConstructions: number;
	workerConstructions: number;
	workerTerminations: number;
	audioContextConstructions: number;
	audioContextCloses: number;
};

type ViteManifestEntry = {
	file?: unknown;
	name?: unknown;
	src?: unknown;
	css?: unknown;
};

type LocatedManifestEntry = {
	keyPath: string;
	entry: ViteManifestEntry;
};

type ManifestTarget = {
	label: string;
	pattern: RegExp;
};

const zeroResourceAudit: ResourceAudit = {
	canvasElements: 0,
	getContextCalls: 0,
	webglContextCalls: 0,
	webglContexts: 0,
	offscreenCanvasConstructions: 0,
	workerConstructions: 0,
	workerTerminations: 0,
	audioContextConstructions: 0,
	audioContextCloses: 0
};

function manifestEntries(value: unknown, keyPath = ''): LocatedManifestEntry[] {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];

	const record = value as Record<string, unknown>;
	if (typeof record.file === 'string') {
		return [{ keyPath, entry: record }];
	}

	return Object.entries(record).flatMap(([key, child]) =>
		manifestEntries(child, keyPath ? `${keyPath}/${key}` : key)
	);
}

function artifactBasename(path: string): string {
	return path.split(/[\\/]/u).at(-1) ?? path;
}

async function interactiveArtifactBasenames(): Promise<ReadonlySet<string>> {
	const [manifestArtifacts, workerArtifacts] = await Promise.all([
		manifestArtifactBasenames(interactiveManifestTargets),
		simulationWorkerArtifactBasenames()
	]);
	return new Set([...manifestArtifacts, ...workerArtifacts]);
}

async function threeRendererArtifactBasenames(): Promise<ReadonlySet<string>> {
	return manifestArtifactBasenames([weatherRendererManifestTarget, threeModuleManifestTarget]);
}

const weatherRendererManifestTarget: ManifestTarget = {
	label: 'weather three-renderer',
	pattern: /(?:^|[\\/])weather-inside-nucleus[\\/]render[\\/]three-renderer\.ts$/iu
};

const weatherStageManifestTarget: ManifestTarget = {
	label: 'WeatherStage',
	pattern: /(?:^WeatherStage$|(?:^|[\\/])weather-inside-nucleus[\\/]WeatherStage\.svelte$)/iu
};

const threeModuleManifestTarget: ManifestTarget = {
	label: 'three.module',
	pattern: /(?:^three\.module$|(?:^|[\\/])three[\\/]build[\\/]three\.module\.js$)/iu
};

const interactiveManifestTargets: readonly ManifestTarget[] = [
	{
		label: 'WeatherGuidedFilm',
		pattern: /(?:^|[\\/])weather-inside-nucleus[\\/]WeatherGuidedFilm\.svelte$/iu
	},
	{
		label: 'WeatherExperiment',
		pattern: /(?:^|[\\/])weather-inside-nucleus[\\/]WeatherExperiment\.svelte$/iu
	},
	weatherStageManifestTarget,
	weatherRendererManifestTarget,
	threeModuleManifestTarget
];

async function simulationWorkerArtifactBasenames(): Promise<ReadonlySet<string>> {
	const workersPath = resolve(
		process.cwd(),
		'.svelte-kit',
		'output',
		'client',
		'_app',
		'immutable',
		'workers'
	);
	const workerArtifacts = (await readdir(workersPath, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && /^simulation\.worker-[\w-]+\.js$/iu.test(entry.name))
		.map((entry) => entry.name);
	if (workerArtifacts.length === 0) {
		throw new Error(`Could not resolve the weather simulation worker from ${workersPath}.`);
	}
	return new Set(workerArtifacts);
}

async function manifestArtifactBasenames(
	targets: readonly ManifestTarget[]
): Promise<ReadonlySet<string>> {
	const manifestPath = resolve(
		process.cwd(),
		'.svelte-kit',
		'output',
		'client',
		'.vite',
		'manifest.json'
	);
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
	const entries = manifestEntries(manifest);
	const basenames = new Set<string>();

	for (const target of targets) {
		const matches = entries.filter(({ keyPath, entry }) => {
			return [keyPath, entry.src, entry.name].some(
				(part) => typeof part === 'string' && target.pattern.test(part)
			);
		});
		if (matches.length === 0) {
			throw new Error(`Could not resolve ${target.label} from ${manifestPath}.`);
		}

		for (const { entry } of matches) {
			if (typeof entry.file === 'string') basenames.add(artifactBasename(entry.file));
			if (Array.isArray(entry.css)) {
				for (const css of entry.css) {
					if (typeof css === 'string') basenames.add(artifactBasename(css));
				}
			}
		}
	}

	return basenames;
}

function requestedInteractiveArtifacts(
	requests: readonly string[],
	basenames: ReadonlySet<string>,
	sourcePattern = /WeatherGuidedFilm|WeatherExperiment|three-renderer|simulation\.worker/iu
): string[] {
	return requests.filter((requestUrl) => {
		const pathname = new URL(requestUrl).pathname;
		return basenames.has(artifactBasename(pathname)) || sourcePattern.test(pathname);
	});
}

function experience(page: Page): Locator {
	return page.getByTestId('weather-inside-nucleus');
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

async function installResourceAudit(context: BrowserContext): Promise<void> {
	await context.addInitScript(() => {
		const audit: ResourceAudit = {
			canvasElements: 0,
			getContextCalls: 0,
			webglContextCalls: 0,
			webglContexts: 0,
			offscreenCanvasConstructions: 0,
			workerConstructions: 0,
			workerTerminations: 0,
			audioContextConstructions: 0,
			audioContextCloses: 0
		};
		Object.defineProperty(window, '__weatherResourceAudit', { value: audit, configurable: true });

		const canvases = new WeakSet<HTMLCanvasElement>();
		const recordCanvas = (canvas: HTMLCanvasElement): void => {
			if (canvases.has(canvas)) return;
			canvases.add(canvas);
			audit.canvasElements += 1;
		};
		const recordCanvasTree = (node: Node): void => {
			if (node instanceof HTMLCanvasElement) recordCanvas(node);
			if (node instanceof Element) {
				for (const canvas of node.querySelectorAll('canvas')) recordCanvas(canvas);
			}
		};

		for (const canvas of document.querySelectorAll('canvas')) recordCanvas(canvas);
		new MutationObserver((records) => {
			for (const record of records) {
				for (const node of record.addedNodes) recordCanvasTree(node);
			}
		}).observe(document, { childList: true, subtree: true });

		const nativeCreateElement = Document.prototype.createElement;
		Object.defineProperty(Document.prototype, 'createElement', {
			configurable: true,
			value(this: Document, localName: string, options?: ElementCreationOptions) {
				const element = Reflect.apply(nativeCreateElement, this, [localName, options]);
				if (element instanceof HTMLCanvasElement) recordCanvas(element);
				return element;
			}
		});

		const nativeCreateElementNs = Document.prototype.createElementNS;
		Object.defineProperty(Document.prototype, 'createElementNS', {
			configurable: true,
			value(
				this: Document,
				namespace: string | null,
				qualifiedName: string,
				options?: string | ElementCreationOptions
			) {
				const element = Reflect.apply(nativeCreateElementNs, this, [
					namespace,
					qualifiedName,
					options
				]);
				if (element instanceof HTMLCanvasElement) recordCanvas(element);
				return element;
			}
		});

		const nativeGetContext = HTMLCanvasElement.prototype.getContext;
		Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
			configurable: true,
			value(this: HTMLCanvasElement, contextId: string, ...arguments_: unknown[]) {
				audit.getContextCalls += 1;
				const webgl = /^webgl2?$/iu.test(contextId);
				if (webgl) audit.webglContextCalls += 1;
				const context = Reflect.apply(nativeGetContext, this, [contextId, ...arguments_]);
				if (webgl && context !== null) audit.webglContexts += 1;
				return context;
			}
		});

		if (typeof OffscreenCanvas !== 'undefined') {
			const nativeOffscreenCanvas = OffscreenCanvas;
			Object.defineProperty(window, 'OffscreenCanvas', {
				configurable: true,
				value: new Proxy(nativeOffscreenCanvas, {
					construct(target, argumentsList) {
						audit.offscreenCanvasConstructions += 1;
						return Reflect.construct(target, argumentsList);
					}
				})
			});

			const nativeOffscreenGetContext = nativeOffscreenCanvas.prototype.getContext;
			Object.defineProperty(nativeOffscreenCanvas.prototype, 'getContext', {
				configurable: true,
				value(
					this: OffscreenCanvas,
					contextId: OffscreenRenderingContextId,
					...arguments_: unknown[]
				) {
					audit.getContextCalls += 1;
					const webgl = /^webgl2?$/iu.test(contextId);
					if (webgl) audit.webglContextCalls += 1;
					const context = Reflect.apply(nativeOffscreenGetContext, this, [
						contextId,
						...arguments_
					]);
					if (webgl && context !== null) audit.webglContexts += 1;
					return context;
				}
			});
		}

		if (typeof Worker !== 'undefined') {
			const nativeWorker = Worker;
			const nativeTerminate = nativeWorker.prototype.terminate;
			Object.defineProperty(nativeWorker.prototype, 'terminate', {
				configurable: true,
				value(this: Worker) {
					audit.workerTerminations += 1;
					return Reflect.apply(nativeTerminate, this, []);
				}
			});
			Object.defineProperty(window, 'Worker', {
				configurable: true,
				value: new Proxy(nativeWorker, {
					construct(target, argumentsList) {
						audit.workerConstructions += 1;
						return Reflect.construct(target, argumentsList);
					}
				})
			});
		}

		const nativeAudioContext = window.AudioContext;
		if (nativeAudioContext) {
			const nativeClose = nativeAudioContext.prototype.close;
			Object.defineProperty(nativeAudioContext.prototype, 'close', {
				configurable: true,
				value(this: AudioContext) {
					audit.audioContextCloses += 1;
					return Reflect.apply(nativeClose, this, []);
				}
			});
			Object.defineProperty(window, 'AudioContext', {
				configurable: true,
				value: new Proxy(nativeAudioContext, {
					construct(target, argumentsList) {
						audit.audioContextConstructions += 1;
						return Reflect.construct(target, argumentsList);
					}
				})
			});
		}
	});
}

async function readResourceAudit(page: Page): Promise<ResourceAudit> {
	return page.evaluate(
		() =>
			(
				window as typeof window & {
					__weatherResourceAudit: ResourceAudit;
				}
			).__weatherResourceAudit
	);
}

async function waitForColdTableau(page: Page): Promise<Locator> {
	const lab = experience(page);
	await expect(lab).toHaveAttribute('data-experience-mode', 'cold-open');
	const stage = lab.locator('.cinematic-stage');
	await expect(stage).toHaveAttribute('data-cold-complete', 'true', { timeout: 8_000 });
	await expect(stage).toHaveAttribute('data-cold-elapsed-ms', '3000');
	await expect(lab.getByRole('button', { name: 'Follow the signal', exact: true })).toBeVisible();
	return lab;
}

async function enterGuidedFilm(page: Page): Promise<Locator> {
	const lab = await waitForColdTableau(page);
	await lab.getByRole('button', { name: 'Follow the signal', exact: true }).click();
	const film = page.getByTestId('weather-guided-film');
	await expect(film).toBeVisible({ timeout: 60_000 });
	await expect(film).toHaveAttribute('data-model-status', 'ready', { timeout: 60_000 });
	const filmBox = await film.boundingBox();
	expect(filmBox?.y ?? Number.POSITIVE_INFINITY).toBeGreaterThanOrEqual(0);
	expect(filmBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(96);
	return film;
}

async function finishCurrentBeat(film: Locator): Promise<void> {
	if ((await film.getAttribute('data-film-status')) !== 'held') {
		await film.getByRole('button', { name: 'Finish beat →', exact: true }).click();
	}
	await expect(film).toHaveAttribute('data-film-status', 'held');
}

async function moveToBeat(film: Locator, targetBeat: number): Promise<void> {
	while (Number(await film.getAttribute('data-beat')) < targetBeat) {
		await finishCurrentBeat(film);
		await film.getByRole('button', { name: 'Next →', exact: true }).click();
	}
	await expect(film).toHaveAttribute('data-beat', String(targetBeat));
	await finishCurrentBeat(film);
}

test.beforeEach(({ page }) => {
	diagnosticsByPage.set(page, collectUnexpectedRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(diagnosticsByPage.get(page) ?? []).toEqual([]);
});

test('SSRs one H1 and both desktop and portrait first-paint art without an interactive renderer', async ({
	page,
	request
}) => {
	const response = await request.get(articlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	expect(html.match(/<h1(?:\s[^>]*)?>Weather Inside the Nucleus<\/h1>/gu)).toHaveLength(1);
	expect(html).toContain('weather-cold-open');
	expect(html).toContain('weather-portrait-poster');
	expect(html).toContain('/images/weather-inside-nucleus/portrait/weather-nucleus-540.webp');
	expect(html).not.toContain('<canvas');

	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	await expect(
		page.getByRole('heading', { level: 1, name: articleTitle, exact: true })
	).toHaveCount(1);
	await expect(experience(page)).toBeVisible();
});

test('the three-second cold open contains no future cast and freezes on the authored tableau', async ({
	page
}) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = experience(page);
	await expect(lab).toHaveAttribute('data-eligibility', /^(eligible|static-failure)$/u);
	if ((await lab.getAttribute('data-eligibility')) !== 'eligible') {
		test.skip(true, 'This browser does not expose an eligible WebGL2 stage.');
	}

	await expect(lab).toHaveAttribute('data-experience-mode', 'cold-open');
	await expect(lab.getByRole('button', { name: 'Pause opening', exact: true })).toBeVisible();
	const firstText = await lab.locator('.cinematic-stage').innerText();
	for (const futureTerm of [
		'enhancer',
		'promoter',
		'contact state',
		'RNA',
		'ensemble',
		'model ribbon'
	]) {
		expect(firstText.toLowerCase()).not.toContain(futureTerm.toLowerCase());
	}
	await expect(lab.getByRole('button', { name: 'Follow the signal', exact: true })).toHaveCount(0);

	await waitForColdTableau(page);
	await expect(lab.getByTestId('weather-cold-open')).toHaveAttribute(
		'data-cold-open-progress',
		'1.0000'
	);
	const frozenProgress = await lab
		.getByTestId('weather-cold-open')
		.getAttribute('data-cold-open-progress');
	await page.waitForTimeout(350);
	expect(await lab.getByTestId('weather-cold-open').getAttribute('data-cold-open-progress')).toBe(
		frozenProgress
	);
	await expect(lab.getByText('Weather Inside', { exact: true })).toBeVisible();
	await expect(lab.getByText('the Nucleus', { exact: true })).toBeVisible();
});

test('portrait and short viewports load one responsive poster and zero weather scene resources', async ({
	browser,
	baseURL
}) => {
	const interactiveArtifacts = await interactiveArtifactBasenames();
	const viewports = [
		{ width: 360, height: 800 },
		{ width: 390, height: 844 },
		{ width: 412, height: 915 },
		{ width: 430, height: 932 },
		{ width: 820, height: 1_180 },
		{ width: 844, height: 390 }
	];

	for (const viewport of viewports) {
		const context = await browser.newContext({ baseURL, viewport, isMobile: viewport.width < 600 });
		await installResourceAudit(context);
		const page = await context.newPage();
		const diagnostics = collectUnexpectedRuntimeDiagnostics(page);
		const requests: string[] = [];
		page.on('request', (request) => requests.push(request.url()));
		try {
			await page.goto(articlePath, { waitUntil: 'networkidle' });
			const lab = experience(page);
			await expect(lab).toHaveAttribute('data-eligibility', 'static-viewport');
			await expect(lab.getByTestId('weather-portrait-poster')).toBeVisible();
			await expect(lab.locator('canvas')).toHaveCount(0);
			await expect(lab.getByText('This model needs a wider stage.')).toBeVisible();
			await expect(lab.getByRole('button', { name: /renderer|2D|3D/iu })).toHaveCount(0);
			const geometry = await lab.evaluate((element) => ({
				documentOverflow:
					document.documentElement.scrollWidth - document.documentElement.clientWidth,
				labOverflow: element.scrollWidth - element.clientWidth
			}));
			expect(
				geometry.documentOverflow,
				`${viewport.width}×${viewport.height} document overflow`
			).toBeLessThanOrEqual(1);
			expect(
				geometry.labOverflow,
				`${viewport.width}×${viewport.height} stage overflow`
			).toBeLessThanOrEqual(1);
			expect(await readResourceAudit(page)).toEqual(zeroResourceAudit);
			expect(requestedInteractiveArtifacts(requests, interactiveArtifacts)).toEqual([]);
			expect(diagnostics).toEqual([]);
		} finally {
			await context.close();
		}
	}
});

test('rotation offers an explicit load action and does not silently mount the scene', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
	await installResourceAudit(context);
	const page = await context.newPage();
	try {
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(experience(page).getByTestId('weather-portrait-poster')).toBeVisible();
		expect(await readResourceAudit(page)).toEqual(zeroResourceAudit);
		await page.setViewportSize({ width: 1_440, height: 900 });
		const load = experience(page).getByRole('button', {
			name: 'Load interactive version',
			exact: true
		});
		await expect(load).toBeVisible();
		await expect(experience(page).locator('canvas')).toHaveCount(0);
		expect(await readResourceAudit(page)).toEqual(zeroResourceAudit);
		await load.click();
		await expect(experience(page)).toHaveAttribute('data-experience-mode', 'cold-open');
		await expect(experience(page).getByTestId('weather-portrait-poster')).toHaveCount(0);
	} finally {
		await context.close();
	}
});

test('Save-Data keeps a desktop viewport on the static poster without scene resources', async ({
	browser,
	baseURL
}) => {
	const interactiveArtifacts = await interactiveArtifactBasenames();
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 1_440, height: 900 }
	});
	await installResourceAudit(context);
	await context.addInitScript(() => {
		Object.defineProperty(navigator, 'connection', {
			configurable: true,
			value: { saveData: true }
		});
	});
	const page = await context.newPage();
	const diagnostics = collectUnexpectedRuntimeDiagnostics(page);
	const requests: string[] = [];
	page.on('request', (request) => requests.push(request.url()));
	try {
		await page.goto(articlePath, { waitUntil: 'networkidle' });
		const lab = experience(page);
		await expect(lab).toHaveAttribute('data-eligibility', 'static-save-data');
		await expect(lab.getByTestId('weather-portrait-poster')).toBeVisible();
		await expect(lab).toContainText(
			'Data saving is active, so the cinematic scene has not been requested.'
		);
		await expect(
			lab.getByRole('button', { name: 'Load interactive version', exact: true })
		).toBeVisible();
		await expect(lab.locator('canvas')).toHaveCount(0);
		expect(await readResourceAudit(page)).toEqual(zeroResourceAudit);
		expect(requestedInteractiveArtifacts(requests, interactiveArtifacts)).toEqual([]);
		expect(diagnostics).toEqual([]);
	} finally {
		await context.close();
	}
});

test('reduced motion is an eight-still manual route with no canvas or autoplay', async ({
	page,
	context
}) => {
	await installResourceAudit(context);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${articlePath}?motion=reduce`, { waitUntil: 'domcontentloaded' });
	const lab = experience(page);
	await expect(lab).toHaveAttribute('data-eligibility', 'reduced-stills');
	await expect(lab.locator('.cinematic-stage')).toHaveAttribute('data-cold-complete', 'true');
	expect(await readResourceAudit(page)).toEqual(zeroResourceAudit);
	await lab.getByRole('button', { name: 'Follow the signal', exact: true }).click();
	const film = page.getByTestId('weather-guided-film');
	await expect(film).toHaveAttribute('data-beat', '1');
	await expect(film).toHaveAttribute('data-film-status', 'held');
	await expect(film.locator('canvas')).toHaveCount(0);
	await expect(film.getByRole('button', { name: 'Autoplay off · Still mode' })).toBeDisabled();
	const reducedAudit = await readResourceAudit(page);
	expect(reducedAudit).toMatchObject({
		canvasElements: 0,
		getContextCalls: 0,
		webglContextCalls: 0,
		webglContexts: 0,
		offscreenCanvasConstructions: 0,
		audioContextConstructions: 0,
		audioContextCloses: 0
	});
	expect(reducedAudit.workerConstructions).toBeGreaterThan(0);

	for (let beat = 2; beat <= 8; beat += 1) {
		await film.getByRole('button', { name: 'Next →', exact: true }).click();
		await expect(film).toHaveAttribute('data-beat', String(beat));
		await expect(film).toHaveAttribute('data-film-status', 'held');
	}
	await expect(film.getByText('Probability, not obedience.', { exact: true })).toBeVisible();
});

test('every reduced or Still policy keeps Skip to experiment on the 2D route', async ({
	browser,
	baseURL
}) => {
	const rendererArtifacts = await threeRendererArtifactBasenames();
	const cases = [
		{ name: 'OS reduced motion', reducedMotion: 'reduce' as const, query: '' },
		{ name: 'motion=reduce', reducedMotion: 'no-preference' as const, query: '?motion=reduce' },
		{ name: 'motion=still', reducedMotion: 'no-preference' as const, query: '?motion=still' },
		{
			name: 'document Still setting',
			reducedMotion: 'no-preference' as const,
			query: '',
			documentStill: true
		}
	];

	for (const policy of cases) {
		const context = await browser.newContext({
			baseURL,
			viewport: { width: 1_440, height: 900 },
			reducedMotion: policy.reducedMotion
		});
		await installResourceAudit(context);
		const requests: string[] = [];
		if (policy.documentStill) {
			await context.addInitScript(() => {
				const applyStillSetting = (): boolean => {
					if (!document.documentElement) return false;
					document.documentElement.dataset.motionPreference = 'still';
					document.documentElement.dataset.motion = 'still';
					return true;
				};
				if (!applyStillSetting()) {
					const observer = new MutationObserver(() => {
						if (!applyStillSetting()) return;
						observer.disconnect();
					});
					observer.observe(document, { childList: true, subtree: true });
					document.addEventListener('DOMContentLoaded', applyStillSetting, { once: true });
				}
			});
		}
		const page = await context.newPage();
		page.on('request', (request) => requests.push(request.url()));
		try {
			await page.goto(`${articlePath}${policy.query}`, { waitUntil: 'domcontentloaded' });
			const lab = page.locator('.weather-directed-experience');
			if (policy.documentStill) {
				await expect(page.locator('html'), policy.name).toHaveAttribute('data-motion', 'still');
			}
			await expect(lab, policy.name).toHaveAttribute('data-eligibility', 'reduced-stills');
			expect(await readResourceAudit(page), policy.name).toEqual(zeroResourceAudit);
			await lab.getByRole('button', { name: 'Skip to the experiment', exact: true }).click();
			await expect(lab, policy.name).toHaveAttribute('data-experience-mode', 'experiment');

			const experiment = lab.locator('.weather-experience');
			await expect(experiment.getByText('2D still view · motion preference active')).toBeVisible();
			await expect(experiment.locator('.weather-stage')).toHaveCount(0);
			await expect(experiment.locator('canvas')).toHaveCount(0);
			await expect(experiment.getByRole('button', { name: '3D', exact: true })).toHaveCount(0);
			const audit = await readResourceAudit(page);
			expect(audit, policy.name).toMatchObject({
				canvasElements: 0,
				getContextCalls: 0,
				webglContextCalls: 0,
				webglContexts: 0,
				offscreenCanvasConstructions: 0,
				audioContextConstructions: 0,
				audioContextCloses: 0
			});
			expect(
				requestedInteractiveArtifacts(requests, rendererArtifacts, /three-renderer/iu),
				`${policy.name} requested the Three renderer`
			).toEqual([]);
		} finally {
			await context.close();
		}
	}
});

test('the guided seed-0 route holds silence, then shows only the authentic later events', async ({
	page
}) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = experience(page);
	await expect(lab).toHaveAttribute('data-eligibility', /^(eligible|static-failure)$/u);
	if ((await lab.getAttribute('data-eligibility')) !== 'eligible') {
		test.skip(true, 'This browser does not expose an eligible WebGL2 stage.');
	}
	const film = await enterGuidedFilm(page);

	await moveToBeat(film, 6);
	const silent = film.getByTestId('weather-directed-tableau');
	await expect(silent).toHaveAttribute('data-directed-beat', 'silent');
	await expect(silent).toHaveAttribute('data-model-boundary', 'before');
	await expect(silent).toHaveAttribute('data-contact-state', 'near');
	await expect(silent).toHaveAttribute('data-promoter-state', 'off');
	await expect(silent).toHaveAttribute('data-initiation-count', '0');
	await expect(film).toContainText('Contact changes odds. It does not command the gene.');

	await film.getByRole('button', { name: 'Next →', exact: true }).click();
	await expect(film).toHaveAttribute('data-beat', '7');
	await finishCurrentBeat(film);
	const burst = film.getByTestId('weather-directed-tableau');
	await expect(burst).toHaveAttribute('data-directed-beat', 'burst');
	await expect(burst).toHaveAttribute('data-model-boundary', 'after');
	await expect(burst).toHaveAttribute('data-contact-state', 'far');
	await expect(burst).toHaveAttribute('data-promoter-state', 'off');
	await expect(burst).toHaveAttribute('data-initiation-count', '3');
	await expect(film.getByText('later · same seed 0 history', { exact: true })).toBeVisible();
	await expect(film).toContainText('This is one possible history.');

	await film.getByRole('button', { name: 'Next →', exact: true }).click();
	await expect(film).toHaveAttribute('data-beat', '8');
	await finishCurrentBeat(film);
	await expect(film).toContainText('26/48');
	await expect(film).toContainText('41/48');
	await expect(film).toContainText('These are paired model histories, not cells.');
	await expect(film).toContainText('The odds moved. The outcome did not obey.');
});

test('replaying the opening tears down every guided-film worker', async ({ page, context }) => {
	await installResourceAudit(context);
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = experience(page);
	await expect(lab).toHaveAttribute('data-eligibility', /^(eligible|static-failure)$/u);
	if ((await lab.getAttribute('data-eligibility')) !== 'eligible') {
		test.skip(true, 'This browser does not expose an eligible WebGL2 stage.');
	}

	const film = await enterGuidedFilm(page);
	const mountedAudit = await readResourceAudit(page);
	expect(mountedAudit.workerConstructions).toBeGreaterThan(0);
	expect(mountedAudit.workerTerminations).toBeLessThan(mountedAudit.workerConstructions);

	await film.getByRole('button', { name: 'Replay opening', exact: true }).click();
	await expect(lab).toHaveAttribute('data-experience-mode', 'cold-open');
	await expect(page.getByTestId('weather-guided-film')).toHaveCount(0);
	await expect
		.poll(async () => (await readResourceAudit(page)).workerTerminations)
		.toBe(mountedAudit.workerConstructions);
});

test('WebGL context loss disposes the guided scene and restores the accessible poster', async ({
	page
}) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = experience(page);
	await expect(lab).toHaveAttribute('data-eligibility', /^(eligible|static-failure)$/u);
	if ((await lab.getAttribute('data-eligibility')) !== 'eligible') {
		test.skip(true, 'This browser does not expose an eligible WebGL2 stage.');
	}

	const film = await enterGuidedFilm(page);
	const stage = film.locator('.weather-stage');
	await expect(stage).toHaveAttribute('data-renderer-status', 'ready', { timeout: 60_000 });
	await stage.locator('canvas').dispatchEvent('webglcontextlost', { cancelable: true });

	await expect(lab).toHaveAttribute('data-eligibility', 'static-failure');
	await expect(lab.getByTestId('weather-portrait-poster')).toBeVisible();
	await expect(lab).toContainText('The WebGL 2 context was interrupted');
	await expect(lab.locator('canvas')).toHaveCount(0);
	await expect(page.getByTestId('weather-guided-film')).toHaveCount(0);
});

test('pause and visibility changes do not advance film or model clocks', async ({ page }) => {
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = experience(page);
	await expect(lab).toHaveAttribute('data-eligibility', /^(eligible|static-failure)$/u);
	if ((await lab.getAttribute('data-eligibility')) !== 'eligible') {
		test.skip(true, 'This browser does not expose an eligible WebGL2 stage.');
	}
	const film = await enterGuidedFilm(page);
	await film.getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(film).toHaveAttribute('data-film-status', 'paused');
	const filmTime = await film.getAttribute('data-beat-time-ms');
	const modelTime = await film.getAttribute('data-model-time');
	await page.waitForTimeout(400);
	expect(await film.getAttribute('data-beat-time-ms')).toBe(filmTime);
	expect(await film.getAttribute('data-model-time')).toBe(modelTime);

	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	expect(await film.getAttribute('data-beat-time-ms')).toBe(filmTime);
});

test('failed WebGL initialization returns the same accessible static poster', async ({ page }) => {
	await page.addInitScript(() => {
		const nativeGetContext = HTMLCanvasElement.prototype.getContext;
		Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
			configurable: true,
			value(this: HTMLCanvasElement, contextId: string, ...arguments_: unknown[]) {
				if (contextId.toLowerCase() === 'webgl2') return null;
				return Reflect.apply(nativeGetContext, this, [contextId, ...arguments_]);
			}
		});
	});
	await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
	const lab = experience(page);
	await expect(lab).toHaveAttribute('data-eligibility', 'static-failure');
	await expect(lab.getByTestId('weather-portrait-poster')).toBeVisible();
	await expect(lab).toContainText('The live stage could not continue safely');
	await expect(lab.locator('canvas')).toHaveCount(0);
});

test('the no-JavaScript phone route retains the poster, transcript, equations, and limitations', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	try {
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' });
		await expect(
			page.getByRole('heading', { level: 1, name: articleTitle, exact: true })
		).toHaveCount(1);
		const poster = page.getByTestId('weather-portrait-poster');
		await expect(poster).toBeVisible();
		await expect(
			poster.locator('img[src="/images/weather-inside-nucleus/portrait/weather-nucleus-540.webp"]')
		).toBeVisible();
		await expect(page.getByRole('heading', { name: 'How the reduced model works' })).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'What this model can and cannot say' })
		).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Accessible transcript and results path' })
		).toBeVisible();
	} finally {
		await context.close();
	}
});
