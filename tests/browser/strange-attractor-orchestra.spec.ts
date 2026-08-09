import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

const articlePath = '/blog/visualizations/the-strange-attractor-orchestra';
const articleTitle = 'The Strange Attractor Orchestra: When Chaos Learns to Sing';
const artifactDirectory = resolve(process.cwd(), 'artifacts', 'strange-attractor-orchestra');
const diagnosticsByPage = new WeakMap<Page, string[]>();

const fixedQuery = new URLSearchParams({
	qa: 'acceptance',
	sa_v: '1',
	sa_seed: 'langford-1847',
	sa_attractor: 'langford',
	sa_preset: 'canonical',
	sa_initial: 'canonical',
	sa_integrator: 'fixed-step-rk4-direct-delay-1',
	sa_mapping: 'causal-score-1',
	sa_noise: 'curl',
	sa_lens: 'warp',
	sa_influence: '0.55',
	sa_sound: 'glass',
	sa_timing: 'composed',
	sa_rate: '1',
	sa_step: '0.005'
}).toString();
const fixedArticlePath = `${articlePath}?${fixedQuery}`;
const portraitRestorationQuery = new URLSearchParams(fixedQuery);
portraitRestorationQuery.set('sa_attractor', 'rossler');
portraitRestorationQuery.set('sa_sound', 'radio');
portraitRestorationQuery.set('sa_step', '0.01');
const portraitRestorationPath = `${articlePath}?${portraitRestorationQuery.toString()}`;

type ResourceAudit = {
	canvasElements: number;
	workerConstructions: number;
	workerTerminations: number;
	audioContextConstructions: number;
	audioContextCloses: number;
	audioContextSuspends: number;
	audioContextResumes: number;
	offlineAudioContextConstructions: number;
};

type ManifestEntry = {
	file?: unknown;
	name?: unknown;
	src?: unknown;
	css?: unknown;
};

type LocatedManifestEntry = {
	keyPath: string;
	entry: ManifestEntry;
};

type WavAudit = {
	format: number;
	channels: number;
	sampleRate: number;
	bitsPerSample: number;
	frames: number;
	peak: number;
	rms: number;
	dcOffset: number;
};

const acceptanceMetrics: {
	desktop?: { renderer: string; fps: number; fpsSamples: number[]; generationMs: number };
	wav: Record<string, WavAudit>;
} = { wav: {} };

function experience(page: Page): Locator {
	return page.getByTestId('strange-attractor-orchestra');
}

function desktopExperience(page: Page): Locator {
	return page.getByTestId('sa-desktop-experience');
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
			workerConstructions: 0,
			workerTerminations: 0,
			audioContextConstructions: 0,
			audioContextCloses: 0,
			audioContextSuspends: 0,
			audioContextResumes: 0,
			offlineAudioContextConstructions: 0
		};
		Object.defineProperty(window, '__saResourceAudit', { value: audit, configurable: true });
		const audioContexts: AudioContext[] = [];
		Object.defineProperty(window, '__saAudioContexts', {
			value: audioContexts,
			configurable: true
		});

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
			const nativeSuspend = nativeAudioContext.prototype.suspend;
			const nativeResume = nativeAudioContext.prototype.resume;
			Object.defineProperty(nativeAudioContext.prototype, 'close', {
				configurable: true,
				value(this: AudioContext) {
					audit.audioContextCloses += 1;
					return Reflect.apply(nativeClose, this, []);
				}
			});
			Object.defineProperty(nativeAudioContext.prototype, 'suspend', {
				configurable: true,
				value(this: AudioContext) {
					audit.audioContextSuspends += 1;
					return Reflect.apply(nativeSuspend, this, []);
				}
			});
			Object.defineProperty(nativeAudioContext.prototype, 'resume', {
				configurable: true,
				value(this: AudioContext) {
					audit.audioContextResumes += 1;
					return Reflect.apply(nativeResume, this, []);
				}
			});
			Object.defineProperty(window, 'AudioContext', {
				configurable: true,
				value: new Proxy(nativeAudioContext, {
					construct(target, argumentsList) {
						audit.audioContextConstructions += 1;
						const context = Reflect.construct(target, argumentsList) as AudioContext;
						audioContexts.push(context);
						return context;
					}
				})
			});
		}

		const nativeOfflineContext = window.OfflineAudioContext;
		if (nativeOfflineContext) {
			Object.defineProperty(window, 'OfflineAudioContext', {
				configurable: true,
				value: new Proxy(nativeOfflineContext, {
					construct(target, argumentsList) {
						audit.offlineAudioContextConstructions += 1;
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
					__saResourceAudit: ResourceAudit;
				}
			).__saResourceAudit
	);
}

async function readLiveAudioContext(
	page: Page
): Promise<{ count: number; state: AudioContextState | 'unavailable'; currentTime: number }> {
	return page.evaluate(() => {
		const contexts = (
			window as typeof window & {
				__saAudioContexts: AudioContext[];
			}
		).__saAudioContexts;
		const context = contexts.at(-1);
		return {
			count: contexts.length,
			state: context?.state ?? 'unavailable',
			currentTime: context?.currentTime ?? 0
		};
	});
}

function manifestEntries(value: unknown, keyPath = ''): LocatedManifestEntry[] {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
	const record = value as Record<string, unknown>;
	if (typeof record.file === 'string') return [{ keyPath, entry: record }];
	return Object.entries(record).flatMap(([key, child]) =>
		manifestEntries(child, keyPath ? `${keyPath}/${key}` : key)
	);
}

function artifactBasename(path: string): string {
	return path.split(/[\\/]/u).at(-1) ?? path;
}

async function heavyDesktopArtifactBasenames(): Promise<ReadonlySet<string>> {
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
	const targets = [
		/(?:^|[\\/])strange-attractor-orchestra[\\/]ExperienceShell\.svelte$/iu,
		/(?:^|[\\/])strange-attractor-orchestra[\\/]renderer[\\/]index\.ts$/iu
	];
	const basenames = new Set<string>();
	for (const target of targets) {
		const matches = entries.filter(({ keyPath, entry }) =>
			[keyPath, entry.src, entry.name].some((part) => typeof part === 'string' && target.test(part))
		);
		if (matches.length === 0) {
			throw new Error(`Could not resolve ${target.source} from ${manifestPath}.`);
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

	const workersPath = resolve(
		process.cwd(),
		'.svelte-kit',
		'output',
		'client',
		'_app',
		'immutable',
		'workers'
	);
	const workerFiles = (await readdir(workersPath, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && /^trajectory\.worker-[\w-]+\.js$/iu.test(entry.name))
		.map((entry) => entry.name);
	if (workerFiles.length === 0) {
		throw new Error(`Could not resolve the orchestra trajectory Worker from ${workersPath}.`);
	}
	for (const worker of workerFiles) basenames.add(worker);
	return basenames;
}

function requestedHeavyArtifacts(
	requests: readonly string[],
	basenames: ReadonlySet<string>
): string[] {
	return requests.filter((requestUrl) => {
		const pathname = new URL(requestUrl).pathname;
		return (
			basenames.has(artifactBasename(pathname)) ||
			/ExperienceShell|trajectory\.worker|strange-attractor-orchestra\/renderer/iu.test(pathname)
		);
	});
}

async function requestedForbiddenScienceChunks(
	requests: readonly string[]
): Promise<Array<{ artifact: string; markers: string[] }>> {
	const clientRoot = resolve(process.cwd(), '.svelte-kit', 'output', 'client');
	const markers = [
		'strange-attractor-orchestra-trajectory',
		'diagnosticPointCount',
		'finiteTimeLyapunov',
		'runScientificDiagnostics'
	] as const;
	const findings: Array<{ artifact: string; markers: string[] }> = [];
	const scriptPaths = new Set(
		requests
			.map((requestUrl) => decodeURIComponent(new URL(requestUrl).pathname))
			.filter((pathname) => pathname.startsWith('/_app/') && pathname.endsWith('.js'))
	);
	for (const pathname of scriptPaths) {
		const artifactPath = resolve(clientRoot, pathname.replace(/^\/+/, ''));
		if (!artifactPath.startsWith(clientRoot)) continue;
		let source: string;
		try {
			source = await readFile(artifactPath, 'utf8');
		} catch (error) {
			// SvelteKit serves this generated public-env shim from the preview server rather
			// than emitting it into the immutable client tree we are auditing here.
			if (
				pathname === '/_app/env.js' &&
				error instanceof Error &&
				'code' in error &&
				error.code === 'ENOENT'
			)
				continue;
			throw error;
		}
		const found = markers.filter((marker) => source.includes(marker));
		if (found.length > 0) findings.push({ artifact: artifactBasename(pathname), markers: found });
	}
	return findings;
}

async function waitForFonts(page: Page): Promise<void> {
	await page.evaluate(() => document.fonts.ready);
}

async function waitForDesktopReady(page: Page, path = fixedArticlePath): Promise<Locator> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	const root = experience(page);
	await expect(root).toHaveAttribute('data-eligibility', 'desktop', { timeout: 60_000 });
	const desktop = desktopExperience(page);
	await expect(desktop).toBeVisible();
	await expect(desktop).toHaveAttribute('data-score-hash', /^[0-9a-f]{8}$/u, {
		timeout: 90_000
	});
	await expect(desktop.locator('.stage-shell')).toHaveAttribute(
		'data-renderer',
		/^(?:webgl2|canvas2d)$/u,
		{ timeout: 60_000 }
	);
	await waitForFonts(page);
	return desktop;
}

async function enterFreeInstrumentSilently(page: Page): Promise<Locator> {
	const desktop = desktopExperience(page);
	await desktop.getByRole('button', { name: 'Continue silently', exact: true }).click();
	await expect(page.getByTestId('sa-choreography')).toBeVisible();
	await desktop.getByRole('button', { name: 'Skip introduction', exact: true }).click();
	const instrument = page.getByTestId('sa-free-instrument');
	await expect(instrument).toBeVisible();
	return instrument;
}

async function assertAxeClean(page: Page): Promise<void> {
	const results = await new AxeBuilder({ page })
		.include('[data-testid="strange-attractor-orchestra"]')
		.analyze();
	expect(
		results.violations.map((violation) => ({
			id: violation.id,
			impact: violation.impact,
			nodes: violation.nodes.map((node) => node.target)
		}))
	).toEqual([]);
}

async function captureViewport(page: Page, filename: string): Promise<Buffer> {
	await waitForFonts(page);
	await page.evaluate(() => window.scrollTo(0, 0));
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
	return page.screenshot({
		path: resolve(artifactDirectory, filename),
		animations: 'disabled',
		caret: 'hide',
		fullPage: false
	});
}

function parseWav(bytes: Buffer): WavAudit {
	expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
	expect(bytes.subarray(8, 12).toString('ascii')).toBe('WAVE');
	let offset = 12;
	let format = 0;
	let channels = 0;
	let sampleRate = 0;
	let bitsPerSample = 0;
	let dataOffset = -1;
	let dataBytes = 0;
	while (offset + 8 <= bytes.length) {
		const id = bytes.subarray(offset, offset + 4).toString('ascii');
		const size = bytes.readUInt32LE(offset + 4);
		const body = offset + 8;
		if (id === 'fmt ' && size >= 16) {
			format = bytes.readUInt16LE(body);
			channels = bytes.readUInt16LE(body + 2);
			sampleRate = bytes.readUInt32LE(body + 4);
			bitsPerSample = bytes.readUInt16LE(body + 14);
		}
		if (id === 'data') {
			dataOffset = body;
			dataBytes = Math.min(size, bytes.length - body);
			break;
		}
		offset = body + size + (size % 2);
	}
	expect(dataOffset).toBeGreaterThan(0);
	expect(bitsPerSample).toBe(16);
	const samples = Math.floor(dataBytes / 2);
	let peak = 0;
	let sum = 0;
	let sumSquares = 0;
	for (let index = 0; index < samples; index += 1) {
		const sample = bytes.readInt16LE(dataOffset + index * 2) / 32_768;
		peak = Math.max(peak, Math.abs(sample));
		sum += sample;
		sumSquares += sample * sample;
	}
	return {
		format,
		channels,
		sampleRate,
		bitsPerSample,
		frames: Math.floor(samples / Math.max(1, channels)),
		peak,
		rms: Math.sqrt(sumSquares / Math.max(1, samples)),
		dcOffset: sum / Math.max(1, samples)
	};
}

test.beforeAll(async () => {
	await mkdir(artifactDirectory, { recursive: true });
});

test.afterAll(async () => {
	const { format } = await import('prettier');
	const metricsJson = await format(JSON.stringify(acceptanceMetrics), {
		parser: 'json',
		printWidth: 100,
		useTabs: true
	});
	await writeFile(resolve(artifactDirectory, 'acceptance-metrics.json'), metricsJson, 'utf8');
});

test.beforeEach(({ page }) => {
	diagnosticsByPage.set(page, collectUnexpectedRuntimeDiagnostics(page));
});

test.afterEach(({ page }) => {
	expect(diagnosticsByPage.get(page) ?? []).toEqual([]);
});

test('SSR emits the sole H1 and desktop hydration constructs no AudioContext before a gesture', async ({
	page,
	request,
	context
}) => {
	const response = await request.get(fixedArticlePath);
	expect(response.ok()).toBe(true);
	const html = await response.text();
	const h1s = html.match(/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/gu) ?? [];
	expect(h1s).toHaveLength(1);
	expect(h1s[0]).toContain(articleTitle);
	expect(html).toContain('/images/visualizations/strange-attractor-orchestra/langford-poster.png');
	expect(html).not.toContain('<canvas');

	await installResourceAudit(context);
	await waitForDesktopReady(page);
	await expect(
		page.getByRole('heading', { level: 1, name: articleTitle, exact: true })
	).toHaveCount(1);
	const audit = await readResourceAudit(page);
	expect(audit.audioContextConstructions).toBe(0);
	expect(audit.offlineAudioContextConstructions).toBe(0);
	await desktopExperience(page)
		.getByRole('button', { name: 'Continue silently', exact: true })
		.click();
	await desktopExperience(page)
		.getByRole('button', { name: 'Pause introduction', exact: true })
		.click();
	await expect(page.getByTestId('sa-choreography')).toHaveAttribute('data-shot', '0');
	await captureViewport(page, 'desktop-1440x900.png');
});

test('silent entry stays silent; keyboard, focus order, rapid switches and URL restoration are deterministic', async ({
	page,
	context
}) => {
	await installResourceAudit(context);
	const desktop = await waitForDesktopReady(page);
	const firstHash = await desktop.getAttribute('data-score-hash');
	const instrument = await enterFreeInstrumentSilently(page);
	expect((await readResourceAudit(page)).audioContextConstructions).toBe(0);

	const fullscreen = desktop.getByRole('button', { name: /Full screen/iu });
	await fullscreen.focus();
	await page.keyboard.press('Tab');
	await expect(desktop.locator('canvas')).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(desktop.locator('.live-status')).toContainText('Conducting:');
	await page.keyboard.press('Home');
	await expect(desktop.locator('.live-status')).toContainText('deterministic baseline');
	await page.keyboard.press('Tab');
	await expect(instrument.getByRole('button', { name: 'Pause', exact: true })).toBeFocused();

	await fullscreen.focus();
	await page.keyboard.press('n');
	await expect.poll(() => new URL(page.url()).searchParams.get('sa_lens')).toBe('wake');
	await page.keyboard.press('s');
	await expect.poll(() => new URL(page.url()).searchParams.get('sa_sound')).toBe('magnetic');
	await page.keyboard.press('r');
	await expect.poll(() => new URL(page.url()).searchParams.get('sa_seed')).toBe('langford-1847');

	const attractor = instrument.getByRole('combobox', { name: /^Attractor/u });
	const soundWorld = instrument.getByRole('combobox', { name: /^Voice · sound world/u });
	await attractor.evaluate((select) => {
		for (const value of ['rossler', 'sprott-b', 'lorenz-63', 'rossler']) {
			(select as HTMLSelectElement).value = value;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		}
	});
	await soundWorld.evaluate((select) => {
		for (const value of ['swarm', 'glass', 'radio']) {
			(select as HTMLSelectElement).value = value;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		}
	});
	const exportButtons = [
		instrument.getByRole('button', { name: 'PNG poster', exact: true }),
		instrument.getByRole('button', { name: 'State JSON', exact: true }),
		instrument.getByRole('button', { name: 'Score JSON', exact: true }),
		instrument.getByRole('button', { name: 'WAV composition', exact: true })
	];
	for (const button of exportButtons) await expect(button).toBeDisabled();
	await expect(
		instrument.getByRole('button', { name: 'Copy deterministic URL', exact: true })
	).toBeEnabled();
	await expect(attractor).toHaveValue('rossler');
	await expect(soundWorld).toHaveValue('radio');
	await expect(attractor).toBeEnabled({ timeout: 90_000 });
	await expect(desktop).toHaveAttribute('data-score-hash', /^[0-9a-f]{8}$/u, {
		timeout: 90_000
	});
	await expect(desktop.locator('.generation')).toHaveText(/^\s*[0-9a-f]{8} score\s*$/u, {
		timeout: 90_000
	});
	for (const button of exportButtons) await expect(button).toBeEnabled();
	const switchedHash = await desktop.getAttribute('data-score-hash');
	expect(switchedHash).not.toBe(firstHash);
	const restoredUrl = page.url();
	expect(new URL(restoredUrl).searchParams.get('qa')).toBe('acceptance');
	expect(new URL(restoredUrl).searchParams.get('sa_attractor')).toBe('rossler');
	expect(new URL(restoredUrl).searchParams.get('sa_sound')).toBe('radio');
	await assertAxeClean(page);

	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(experience(page)).toHaveAttribute('data-eligibility', 'desktop', {
		timeout: 60_000
	});
	await expect(desktopExperience(page)).toHaveAttribute('data-score-hash', switchedHash ?? '', {
		timeout: 90_000
	});
	await expect(page.getByRole('heading', { level: 1, name: articleTitle })).toHaveCount(1);
});

test('explicit sound supports play, pause, mute, emergency stop and full-screen when available', async ({
	page,
	context
}) => {
	await installResourceAudit(context);
	const desktop = await waitForDesktopReady(page);
	await desktop.getByRole('button', { name: 'Start the instrument', exact: true }).click();
	await expect.poll(async () => (await readResourceAudit(page)).audioContextConstructions).toBe(1);
	await expect(page.getByTestId('sa-choreography')).toBeVisible();
	await desktop.getByRole('button', { name: 'Skip introduction', exact: true }).click();
	const instrument = page.getByTestId('sa-free-instrument');
	const diagnostics = desktop.locator('.diagnostics');
	const fpsValue = diagnostics.getByText(/^\d+ fps$/u);
	await expect(fpsValue).toHaveText(/^\d+ fps$/u, { timeout: 15_000 });
	const rendererValue = diagnostics
		.locator('dt', { hasText: 'Renderer' })
		.locator('..')
		.locator('dd');
	const generationValue = diagnostics
		.locator('dt', { hasText: 'Trajectory generation' })
		.locator('..')
		.locator('dd');
	await expect(rendererValue).toHaveText(/^(?:webgl2|canvas2d) · ready$/u);
	await expect(generationValue).toHaveText(/^\d+(?:\.\d+)? ms$/u);
	await page.waitForTimeout(1_000);
	const fpsSamples: number[] = [];
	for (let sample = 0; sample < 5; sample += 1) {
		await page.waitForTimeout(500);
		const value = Number.parseFloat(((await fpsValue.textContent()) ?? '').replace(/[^\d.]/gu, ''));
		expect(Number.isFinite(value), `warmed FPS sample ${sample + 1} is finite`).toBe(true);
		fpsSamples.push(value);
	}
	const orderedFps = [...fpsSamples].sort((first, second) => first - second);
	const fps = orderedFps.at(Math.floor(orderedFps.length / 2)) ?? Number.NaN;
	const rendererText = (await rendererValue.textContent())?.trim() ?? '';
	const generationMs = Number.parseFloat(
		((await generationValue.textContent()) ?? '').replace(/[^\d.]/gu, '')
	);
	expect(rendererText).toMatch(/^(?:webgl2|canvas2d) · ready$/u);
	expect(Number.isFinite(fps)).toBe(true);
	expect(Number.isFinite(generationMs)).toBe(true);
	acceptanceMetrics.desktop = {
		renderer: rendererText,
		fps,
		fpsSamples,
		generationMs
	};

	const pause = instrument.getByRole('button', { name: 'Pause', exact: true });
	await expect(pause).toBeVisible();
	await pause.click();
	const play = instrument.getByRole('button', { name: 'Play', exact: true });
	await expect(play).toBeVisible();
	await play.click();
	await expect(pause).toBeVisible();
	const mute = instrument.getByRole('button', { name: /Mute/iu });
	await mute.click();
	await expect(instrument.getByRole('button', { name: /Unmute/iu })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await desktop.locator('.stage-stop').click();
	await expect(instrument.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
	await expect(desktop.locator('.live-status')).toContainText('Emergency fade complete');

	const supportsFullscreen = await page.evaluate(
		() =>
			document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function'
	);
	if (supportsFullscreen) {
		await desktop.getByRole('button', { name: /Full screen/iu }).click();
		await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
		await desktop.getByRole('button', { name: /Full screen/iu }).click();
		await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
	}
});

test('Web Audio failure keeps the visual instrument active and labelled', async ({
	page,
	context
}) => {
	await installResourceAudit(context);
	await context.addInitScript(() => {
		Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
		Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
	});
	const desktop = await waitForDesktopReady(page);
	await desktop.getByRole('button', { name: 'Start the instrument', exact: true }).click();
	await expect(page.getByTestId('sa-choreography')).toBeVisible();
	await expect(desktop.locator('.live-status')).toContainText(/unavailable.*visual instrument/iu);
	await expect(desktop.locator('canvas')).toBeVisible();
	expect((await readResourceAudit(page)).audioContextConstructions).toBe(0);
	await expect(desktop.getByRole('button', { name: 'Enable sound', exact: true })).toBeVisible();
});

test('Canvas-only mode is explicit, interactive and visually stable', async ({ page, context }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await installResourceAudit(context);
	const desktop = await waitForDesktopReady(page, `${fixedArticlePath}&webgl=off`);
	await expect(desktop.locator('.stage-shell')).toHaveAttribute('data-renderer', 'canvas2d');
	await expect(desktop.locator('.renderer-line')).toContainText('Canvas 2D fallback');
	await desktop.getByRole('button', { name: 'Continue silently', exact: true }).click();
	await expect(page.getByTestId('sa-choreography')).toHaveAttribute('data-shot', '0');
	const capture = await captureViewport(page, 'canvas-fallback-1440x900.png');
	const repeatedCapture = await page.screenshot({
		animations: 'disabled',
		caret: 'hide',
		fullPage: false
	});
	expect(repeatedCapture.equals(capture)).toBe(true);
});

test('failed WebGL2 initialization falls back to the accessible Canvas renderer', async ({
	page,
	context
}) => {
	await context.addInitScript(() => {
		const nativeGetContext = HTMLCanvasElement.prototype.getContext;
		Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
			configurable: true,
			value(this: HTMLCanvasElement, contextId: string, ...arguments_: unknown[]) {
				if (contextId.toLowerCase() === 'webgl2') return null;
				return Reflect.apply(nativeGetContext, this, [contextId, ...arguments_]);
			}
		});
	});
	const desktop = await waitForDesktopReady(page);
	await expect(desktop.locator('.stage-shell')).toHaveAttribute('data-renderer', 'canvas2d');
	await expect(desktop.locator('.renderer-line')).toContainText('Canvas 2D fallback');
});

test('route exit terminates the trajectory Worker and closes live audio', async ({
	page,
	context
}) => {
	await installResourceAudit(context);
	const desktop = await waitForDesktopReady(page);
	await desktop.getByRole('button', { name: 'Start the instrument', exact: true }).click();
	await expect.poll(async () => (await readResourceAudit(page)).audioContextConstructions).toBe(1);
	const mounted = await readResourceAudit(page);
	expect(mounted.workerConstructions).toBeGreaterThan(0);
	expect(mounted.workerTerminations).toBeLessThan(mounted.workerConstructions);

	await page.locator('a[href="/"]').first().click();
	await page.waitForURL((url) => url.pathname === '/');
	await expect
		.poll(async () => (await readResourceAudit(page)).workerTerminations)
		.toBeGreaterThanOrEqual(mounted.workerConstructions);
	await expect
		.poll(async () => (await readResourceAudit(page)).audioContextCloses)
		.toBeGreaterThanOrEqual(mounted.audioContextConstructions);
});

test('portrait 390×844 remains a zero-canvas poster with no desktop renderer request', async ({
	browser,
	baseURL
}) => {
	const heavyArtifacts = await heavyDesktopArtifactBasenames();
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true
	});
	await installResourceAudit(context);
	const page = await context.newPage();
	const diagnostics = collectUnexpectedRuntimeDiagnostics(page);
	const requests: string[] = [];
	page.on('request', (request) => requests.push(request.url()));
	try {
		await page.goto(portraitRestorationPath, { waitUntil: 'networkidle' });
		const root = experience(page);
		await expect(root).toHaveAttribute('data-eligibility', 'portrait');
		const portrait = page.getByTestId('sa-portrait-mode');
		await expect(portrait).toBeVisible();
		await expect(portrait.locator('canvas')).toHaveCount(0);
		await expect(portrait.getByRole('button', { name: 'Play the composition' })).toBeVisible();
		await expect(portrait.getByRole('combobox', { name: 'Attractor', exact: true })).toHaveValue(
			'rossler'
		);
		await expect(portrait.getByRole('combobox', { name: 'Sound world', exact: true })).toHaveValue(
			'radio'
		);
		await expect(portrait).toContainText('full conducting instrument is available on a wider');
		await expect(portrait.locator('img')).toHaveJSProperty('complete', true);
		expect(
			await portrait.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth)
		).toBeGreaterThan(0);

		const geometry = await root.evaluate((element) => ({
			documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			rootOverflow: element.scrollWidth - element.clientWidth
		}));
		expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
		expect(geometry.rootOverflow).toBeLessThanOrEqual(1);
		const targets = portrait.locator('button, select');
		for (let index = 0; index < (await targets.count()); index += 1) {
			const box = await targets.nth(index).boundingBox();
			expect(box?.height ?? 0, `touch target ${index} height`).toBeGreaterThanOrEqual(44);
			expect(box?.width ?? 0, `touch target ${index} width`).toBeGreaterThanOrEqual(44);
		}

		const audit = await readResourceAudit(page);
		expect(audit.canvasElements).toBe(0);
		expect(audit.workerConstructions).toBe(0);
		expect(audit.audioContextConstructions).toBe(0);
		expect(requestedHeavyArtifacts(requests, heavyArtifacts)).toEqual([]);
		expect(await requestedForbiddenScienceChunks(requests)).toEqual([]);
		await assertAxeClean(page);
		await waitForFonts(page);
		await captureViewport(page, 'portrait-390x844.png');
		expect(diagnostics).toEqual([]);
	} finally {
		await context.close();
	}
});

test('portrait play starts real audio and a Worker, then stop closes both cleanly', async ({
	page,
	context
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await installResourceAudit(context);
	await page.goto(fixedArticlePath, { waitUntil: 'domcontentloaded' });
	const root = experience(page);
	await expect(root).toHaveAttribute('data-eligibility', 'portrait');
	const portrait = page.getByTestId('sa-portrait-mode');
	const play = portrait.getByRole('button', { name: 'Play the composition', exact: true });
	await play.click();
	await expect.poll(async () => (await readResourceAudit(page)).audioContextConstructions).toBe(1);
	await expect
		.poll(async () => (await readResourceAudit(page)).workerConstructions)
		.toBeGreaterThan(0);
	const stop = portrait.getByRole('button', { name: 'Stop the composition', exact: true });
	await expect(stop).toBeVisible({ timeout: 90_000 });
	await stop.click();
	await expect(play).toBeVisible();
	await expect(portrait.locator('.caption')).toContainText('stopped');
	const started = await readResourceAudit(page);
	await expect
		.poll(async () => (await readResourceAudit(page)).workerTerminations)
		.toBeGreaterThanOrEqual(started.workerConstructions);
	await expect
		.poll(async () => (await readResourceAudit(page)).audioContextCloses)
		.toBeGreaterThanOrEqual(started.audioContextConstructions);
	await expect(portrait.locator('canvas')).toHaveCount(0);
});

test('1024×768 tablet keeps the full causal instrument readable without overflow', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({ baseURL, viewport: { width: 1_024, height: 768 } });
	await installResourceAudit(context);
	const page = await context.newPage();
	const diagnostics = collectUnexpectedRuntimeDiagnostics(page);
	try {
		const desktop = await waitForDesktopReady(page);
		await expect(desktop.getByTestId('sa-start-gate')).toBeVisible();
		const overflow = await desktop.evaluate((element) => ({
			document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			experience: element.scrollWidth - element.clientWidth
		}));
		expect(overflow.document).toBeLessThanOrEqual(1);
		expect(overflow.experience).toBeLessThanOrEqual(1);
		await desktop.getByRole('button', { name: 'Continue silently', exact: true }).click();
		await desktop.getByRole('button', { name: 'Pause introduction', exact: true }).click();
		await expect(page.getByTestId('sa-choreography')).toHaveAttribute('data-shot', '0');
		await captureViewport(page, 'tablet-1024x768.png');
		expect(diagnostics).toEqual([]);
	} finally {
		await context.close();
	}
});

test('reduced motion presents a manual five-still introduction and no autoplay choreography', async ({
	page,
	context
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await installResourceAudit(context);
	const desktop = await waitForDesktopReady(page);
	await desktop.getByRole('button', { name: 'Continue silently', exact: true }).click();
	const choreography = page.getByTestId('sa-choreography');
	await expect(choreography).toHaveAttribute('data-shot', '0');
	await expect(choreography.getByRole('button', { name: 'Previous still' })).toBeDisabled();
	await expect(choreography.getByRole('button', { name: 'Next still' })).toBeVisible();
	await page.waitForTimeout(350);
	await expect(choreography).toHaveAttribute('data-shot', '0');
	await choreography.getByRole('button', { name: 'Next still' }).click();
	await expect(choreography).toHaveAttribute('data-shot', '1');
	await expect(choreography).toContainText('seeded field of smooth noise');
	expect((await readResourceAudit(page)).audioContextConstructions).toBe(0);
	await captureViewport(page, 'reduced-motion-1440x900.png');
});

test('tab hiding suspends audio and both timelines; restoration resumes without catch-up', async ({
	page,
	context
}) => {
	await installResourceAudit(context);
	const desktop = await waitForDesktopReady(page);
	await desktop.getByRole('button', { name: 'Start the instrument', exact: true }).click();
	await expect.poll(async () => (await readResourceAudit(page)).audioContextConstructions).toBe(1);
	await desktop.getByRole('button', { name: 'Skip introduction', exact: true }).click();
	const legend = page.getByTestId('sa-causal-legend');
	await page.waitForTimeout(220);
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect
		.poll(async () => (await readResourceAudit(page)).audioContextSuspends)
		.toBeGreaterThan(0);
	await expect.poll(async () => (await readLiveAudioContext(page)).state).toBe('suspended');
	const hiddenAudio = await readLiveAudioContext(page);
	const hiddenLegend = await legend.innerText();
	await page.waitForTimeout(450);
	const heldAudio = await readLiveAudioContext(page);
	expect(Math.abs(heldAudio.currentTime - hiddenAudio.currentTime)).toBeLessThan(0.02);
	expect(await legend.innerText()).toBe(hiddenLegend);
	const resumeCallsBeforeRestore = (await readResourceAudit(page)).audioContextResumes;
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	expect(await legend.innerText()).toBe(hiddenLegend);
	await expect.poll(async () => (await readLiveAudioContext(page)).state).toBe('running');
	await expect
		.poll(async () => (await readResourceAudit(page)).audioContextResumes)
		.toBeGreaterThan(resumeCallsBeforeRestore);
	await page.waitForTimeout(180);
	const resumedAudio = await readLiveAudioContext(page);
	expect(resumedAudio.currentTime).toBeGreaterThan(hiddenAudio.currentTime);
	expect(resumedAudio.currentTime - hiddenAudio.currentTime).toBeLessThan(0.45);
	expect(resumedAudio.count).toBe(1);
});

test('WAV export cancellation releases the UI without producing a download', async ({
	page,
	context
}) => {
	await installResourceAudit(context);
	await waitForDesktopReady(page);
	const instrument = await enterFreeInstrumentSilently(page);
	await instrument.getByRole('button', { name: 'Pause', exact: true }).click();
	let downloadCount = 0;
	const recordDownload = () => {
		downloadCount += 1;
	};
	page.on('download', recordDownload);
	try {
		await instrument.getByRole('button', { name: 'WAV composition', exact: true }).click();
		await expect(instrument.getByRole('progressbar')).toBeVisible();
		await instrument.getByRole('button', { name: 'Cancel export', exact: true }).click();
		await expect(instrument.getByText('Export cancelled cleanly.')).toBeVisible();
		await expect(instrument.getByRole('progressbar')).toHaveCount(0);
		await page.waitForTimeout(300);
		expect(downloadCount).toBe(0);
		expect((await readResourceAudit(page)).offlineAudioContextConstructions).toBe(1);
	} finally {
		page.off('download', recordDownload);
	}
});

test('every sound world exports finite, non-silent, bounded browser-native WAV audio', async ({
	page,
	context
}) => {
	await installResourceAudit(context);
	const desktop = await waitForDesktopReady(page);
	const instrument = await enterFreeInstrumentSilently(page);
	await instrument.getByRole('button', { name: 'Pause', exact: true }).click();
	const soundWorld = instrument.getByRole('combobox', { name: /^Voice · sound world/u });
	for (const world of ['glass', 'magnetic', 'swarm', 'radio']) {
		if ((await soundWorld.inputValue()) !== world) {
			const previousHash = await desktop.getAttribute('data-score-hash');
			await soundWorld.selectOption(world);
			await expect(desktop).not.toHaveAttribute('data-score-hash', previousHash ?? 'warming', {
				timeout: 90_000
			});
			await expect(desktop.locator('.generation')).toHaveText(/^\s*[0-9a-f]{8} score\s*$/u, {
				timeout: 90_000
			});
		}

		const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
		await instrument.getByRole('button', { name: 'WAV composition', exact: true }).click();
		await expect(instrument.getByRole('progressbar')).toBeVisible();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(
			/^strange-attractor-langford-langford-1847\.wav$/u
		);
		const path = await download.path();
		expect(path).not.toBeNull();
		const wav = parseWav(await readFile(path!));
		acceptanceMetrics.wav[world] = wav;
		expect(wav, `${world} WAV format`).toMatchObject({
			format: 1,
			channels: 2,
			sampleRate: 48_000,
			bitsPerSample: 16
		});
		for (const [metric, value] of Object.entries({
			frames: wav.frames,
			peak: wav.peak,
			rms: wav.rms,
			dcOffset: wav.dcOffset
		})) {
			expect(Number.isFinite(value), `${world} ${metric} is finite`).toBe(true);
		}
		expect(wav.frames, `${world} duration`).toBeGreaterThanOrEqual(29 * wav.sampleRate);
		expect(wav.peak, `${world} peak floor`).toBeGreaterThanOrEqual(0.1);
		expect(wav.peak, `${world} peak ceiling`).toBeLessThanOrEqual(0.231);
		expect(wav.rms, `${world} RMS floor`).toBeGreaterThanOrEqual(0.008);
		expect(wav.rms, `${world} RMS ceiling`).toBeLessThanOrEqual(0.08);
		expect(Math.abs(wav.dcOffset), `${world} DC offset`).toBeLessThan(0.001);
		await expect(instrument.getByText('WAV composition downloaded.')).toBeVisible();
	}
	const audit = await readResourceAudit(page);
	expect(audit.offlineAudioContextConstructions).toBe(4);
	expect(audit.workerTerminations).toBeGreaterThanOrEqual(4);
});
