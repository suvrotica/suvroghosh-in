import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractNarration } from '../../src/lib/components/blog/tts/narration.mjs';

const shortArticle = '/blog/personal-essay/a-trapezoid-in-low-light';
const longArticle = '/blog/short-fiction/ashtami-approach';
const folioArticle = '/blog/healthcare-it/why-read-a-healthcare-it-blog-in-the-age-of-ai';
const mixedLanguageArticle = '/blog/short-fiction/ashruto-the-unheard';
const pianoArticle = '/blog/visualizations/the-piano-that-forgives';
const playerSelector = '[data-testid="article-tts"]';

interface TestMedia {
	element: HTMLAudioElement;
	playCalls: number;
	pauseCalls: number;
	loadCalls: number;
}

declare global {
	interface Window {
		__ttsTest: {
			media: TestMedia[];
			speech: Array<{ text: string; lang: string; voice: string }>;
			cancelCalls: number;
			nextPlayFails: boolean;
			voicesReady: boolean;
		};
	}
}

/** Deterministic browser APIs; provider synthesis and audible playback are deliberately absent. */
async function installPlaybackFakes(page: Page) {
	await page.addInitScript(() => {
		const state = {
			media: [] as TestMedia[],
			speech: [] as Array<{ text: string; lang: string; voice: string }>,
			cancelCalls: 0,
			nextPlayFails: false,
			voicesReady: !new URL(location.href).searchParams.has('tts-delayed-voices')
		};
		window.__ttsTest = state;
		Object.defineProperty(window, 'SpeechSynthesisUtterance', {
			configurable: true,
			value: class TestUtterance {
				text: string;
				lang = '';
				voice: SpeechSynthesisVoice | null = null;
				rate = 1;
				onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
				constructor(text: string) {
					this.text = text;
				}
			}
		});
		const voices = [
			{ name: 'Test Indian English', voiceURI: 'test-in', lang: 'en-IN' },
			{ name: 'Google US English', voiceURI: 'test-us', lang: 'en-US' },
			{ name: 'Test British English', voiceURI: 'test-gb', lang: 'en-GB' }
		].map((voice) => ({ ...voice, localService: true, default: false }));
		const synthesis = Object.assign(new EventTarget(), {
			speaking: false,
			paused: false,
			pending: false,
			getVoices: () => (state.voicesReady ? voices : []),
			speak(utterance: SpeechSynthesisUtterance) {
				this.speaking = true;
				this.paused = false;
				state.speech.push({
					text: utterance.text,
					lang: utterance.lang,
					voice: utterance.voice?.voiceURI ?? ''
				});
				queueMicrotask(() => utterance.onstart?.(new Event('start') as SpeechSynthesisEvent));
			},
			cancel() {
				state.cancelCalls++;
				this.speaking = false;
				this.paused = false;
			},
			pause() {
				this.paused = true;
			},
			resume() {
				this.paused = false;
			}
		});
		Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis });
		// Use real detached audio elements for native event dispatch, with deterministic media methods.
		Object.defineProperty(window, 'Audio', {
			configurable: true,
			value: function Audio(source?: string) {
				const element = document.createElement('audio');
				const record = { element, playCalls: 0, pauseCalls: 0, loadCalls: 0 };
				state.media.push(record);
				let currentTime = 0;
				let paused = true;
				let mediaSource = '';
				Object.defineProperties(element, {
					src: {
						get: () => mediaSource,
						set: (value: string) => {
							mediaSource = value;
						}
					},
					duration: { get: () => 120 },
					readyState: { get: () => 4 },
					paused: { get: () => paused },
					currentTime: {
						get: () => currentTime,
						set: (value: number) => {
							currentTime = value;
							queueMicrotask(() => element.dispatchEvent(new Event('timeupdate')));
						}
					}
				});
				element.load = () => {
					record.loadCalls++;
					element.playbackRate = element.defaultPlaybackRate;
					queueMicrotask(() => element.dispatchEvent(new Event('loadedmetadata')));
				};
				element.play = async () => {
					record.playCalls++;
					if (state.nextPlayFails) {
						state.nextPlayFails = false;
						throw new DOMException('Playback unavailable for test', 'NotSupportedError');
					}
					paused = false;
					element.dispatchEvent(new Event('loadedmetadata'));
					element.dispatchEvent(new Event('playing'));
				};
				element.pause = () => {
					record.pauseCalls++;
					paused = true;
					element.dispatchEvent(new Event('pause'));
				};
				if (source) element.src = source;
				return element;
			}
		});
	});
}

async function mockNarration(
	page: Page,
	mode: 'ready' | 'missing' | 'stale' = 'ready',
	segmentCount: 1 | 2 = 1
) {
	const requests = { manifest: 0, audio: 0, provider: 0 };
	page.on('request', (request) => {
		if (/generativelanguage\.googleapis\.com|texttospeech\.googleapis\.com/u.test(request.url()))
			requests.provider++;
	});
	await page.route('**/audio/articles/**', async (route) => {
		if (!route.request().url().endsWith('/manifest.json')) {
			requests.audio++;
			await route.abort();
			return;
		}
		requests.manifest++;
		if (mode === 'missing') {
			await route.fulfill({ status: 404, body: '' });
			return;
		}
		const text = await page.locator('[data-article-reading-region]').evaluate(extractNarration);
		const textHash = createHash('sha256').update(text).digest('hex');
		const slug = new URL(route.request().url()).pathname.split('/').at(-2);
		const midpoint = text.lastIndexOf('\n\n', Math.floor(text.length / 2));
		const ranges =
			segmentCount === 2
				? [
						[0, midpoint],
						[midpoint + 2, text.length]
					]
				: [[0, text.length]];
		const segments = ranges.map(([textStart, textEnd]) => ({
			src: `/audio/articles/${slug}/${createHash('sha256').update(text.slice(textStart, textEnd)).digest('hex')}.wav`,
			duration: 120 / segmentCount,
			textStart,
			textEnd
		}));
		await route.fulfill({
			json: {
				version: 1,
				textHash: mode === 'stale' ? '0'.repeat(64) : textHash,
				language: 'en-US',
				model: 'gemini-2.5-flash-preview-tts',
				voice: 'Kore',
				style: 'Natural US English editorial narration',
				segments
			}
		});
	});
	return requests;
}

async function navigateArticle(page: Page, path: string) {
	await page.evaluate((destination) => {
		document.getElementById('tts-test-navigation')?.remove();
		const link = document.createElement('a');
		link.id = 'tts-test-navigation';
		link.href = destination;
		link.textContent = 'TTS test navigation';
		document.body.append(link);
	}, path);
	await page.getByRole('link', { name: 'TTS test navigation' }).click();
	await expect(page).toHaveURL(path);
}

test.beforeEach(async ({ page }) => {
	await installPlaybackFakes(page);
});

test('extraction respects leaf order and exclusions without losing Bengali or the final sentence', async ({
	page
}) => {
	await page.setContent(`<main><div class="prose">Wrong region</div>
		<article data-article-reading-region><h1>Essay title</h1>
		<div data-side="left"><p>First <em>paragraph</em>.</p><blockquote><p>“A quotation?”</p></blockquote></div>
		<div data-side="right"><h2>Second leaf</h2><p>বাংলা লেখা। Natural English.</p>
		<ul><li>First item</li><li>Final item</li></ul></div><button>Play</button><aside>Related</aside>
		<pre>Code block</pre><p data-tts-exclude>Duplicate summary</p><p hidden>Hidden</p>
		<p aria-hidden="true">Responsive duplicate</p><script type="application/json">"secret"</script>
		<p>The final sentence.</p></article></main>`);
	const text = await page.locator('[data-article-reading-region]').evaluate(extractNarration);
	expect(text).toBe(
		'Essay title\n\nFirst paragraph.\n\n“A quotation?”\n\nSecond leaf\n\nবাংলা লেখা। Natural English.\n\nFirst item\n\nFinal item\n\nThe final sentence.'
	);
});

test('authored UI narration aliases are plain text and never override exclusions or article prose', async ({
	page
}) => {
	await page.setContent(`<article data-article-reading-region><p>Authored paragraph.</p>
		<div data-tts-text="Initial &lt;em&gt;display&lt;/em&gt;."><p>Changing display.</p></div>
		<p hidden data-tts-text="Still hidden">Hidden display.</p>
		<button data-tts-text="Still excluded">A control.</button><p>The final sentence.</p></article>`);
	const text = await page.locator('[data-article-reading-region]').evaluate(extractNarration);
	expect(text).toBe('Authored paragraph.\n\nInitial <em>display</em>.\n\nThe final sentence.');
	await page
		.locator('[data-tts-text]')
		.first()
		.evaluate((element) => {
			element.textContent = 'A new live display.';
		});
	expect(await page.locator('[data-article-reading-region]').evaluate(extractNarration)).toBe(text);
	await page
		.locator('article > p')
		.first()
		.evaluate((element) => {
			element.textContent = 'An edited authored paragraph.';
		});
	expect(await page.locator('[data-article-reading-region]').evaluate(extractNarration)).not.toBe(
		text
	);
});

test('saved piano narration retains its SSR transcript through hydration, motion and musical controls', async ({
	page,
	browser
}) => {
	const saved = JSON.parse(
		readFileSync(
			join(process.cwd(), 'static/audio/articles/the-piano-that-forgives/manifest.json'),
			'utf8'
		)
	);
	const requests = { audio: 0, provider: 0 };
	page.on('request', (request) => {
		if (/generativelanguage\.googleapis\.com|texttospeech\.googleapis\.com/u.test(request.url()))
			requests.provider++;
	});
	await page.route('**/audio/articles/**', async (route) => {
		if (route.request().url().endsWith('/manifest.json')) await route.fulfill({ json: saved });
		else {
			requests.audio++;
			await route.abort();
		}
	});
	await page.goto(pianoArticle);
	const piano = page.locator('[data-piano-root]');
	await expect(piano.getByRole('button', { name: /^Enable sound/ })).toBeEnabled();
	const privacy = page.getByRole('button', {
		name: 'Dismiss privacy notice without choosing',
		exact: true
	});
	if (await privacy.isVisible()) await privacy.click();
	await expect(page.locator(playerSelector)).toContainText('Google narration');
	const noJsPage = await browser.newPage({ javaScriptEnabled: false, serviceWorkers: 'block' });
	let serverRendered: string;
	try {
		await noJsPage.goto(new URL(pianoArticle, page.url()).href);
		serverRendered = await noJsPage
			.locator('[data-article-reading-region]')
			.evaluate(extractNarration);
	} finally {
		await noJsPage.close();
	}
	const hash = (text: string) => createHash('sha256').update(text).digest('hex');
	expect(hash(serverRendered)).toBe(saved.textHash);
	expect(await page.locator('[data-article-reading-region]').evaluate(extractNarration)).toBe(
		serverRendered
	);
	await piano.locator('.piano-workbench > summary').click();
	await piano.getByRole('button', { name: /Try the space between/ }).click();
	await expect(piano.locator('[data-decision-reason]')).toBeVisible();
	await piano.getByLabel('Temperature', { exact: true }).evaluate((element) => {
		(element as HTMLInputElement).value = '1.25';
		element.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await piano.getByRole('button', { name: 'Higher computer-keyboard octave', exact: true }).click();
	await piano.getByLabel('Painting and harmony preset', { exact: true }).selectOption('1');
	await piano.getByRole('button', { name: 'Raw', exact: true }).click();
	await piano.locator('[data-piano-key="61"]').click();
	await page.evaluate(() => {
		document.documentElement.dataset.motion = 'still';
	});
	await expect(piano).toHaveClass(/still/);
	expect(await page.locator('[data-article-reading-region]').evaluate(extractNarration)).toBe(
		serverRendered
	);
	await page.evaluate(() => {
		document.documentElement.dataset.motion = 'gentle';
	});
	await expect(piano).not.toHaveClass(/still/);
	expect(await page.locator('[data-article-reading-region]').evaluate(extractNarration)).toBe(
		serverRendered
	);
	await page
		.getByRole('heading', { name: 'A small act of forgiveness', exact: true })
		.evaluate((element) => {
			element.textContent += ' An editorial change.';
		});
	expect(
		hash(await page.locator('[data-article-reading-region]').evaluate(extractNarration))
	).not.toBe(saved.textHash);
	expect(requests).toEqual({ audio: 0, provider: 0 });
});

test('saved Google audio is lazy and supports pause, resume, speed, seeking, completion and replay', async ({
	page
}) => {
	const requests = await mockNarration(page);
	await page.goto(shortArticle);
	const player = page.locator(playerSelector);
	await expect(player).toContainText('Google narration');
	expect(requests.manifest).toBe(1);
	expect(requests.audio).toBe(0);
	expect(requests.provider).toBe(0);
	expect(await page.evaluate(() => window.__ttsTest.media.length)).toBe(0);

	await player.getByRole('button', { name: 'Listen to article', exact: true }).click();
	await expect(player.getByRole('button', { name: 'Pause article audio' })).toBeVisible();
	await player.getByRole('button', { name: 'Pause article audio' }).click();
	await expect(player.getByRole('button', { name: 'Resume article audio' })).toBeVisible();
	await player.getByRole('button', { name: 'Resume article audio' }).click();
	expect(await page.evaluate(() => window.__ttsTest.media.length)).toBe(1);
	expect(await page.evaluate(() => window.__ttsTest.media[0].playCalls)).toBe(2);

	await player.getByLabel('Playback speed').selectOption('1.25');
	expect(await page.evaluate(() => window.__ttsTest.media[0].element.playbackRate)).toBe(1.25);
	await player.getByLabel('Playback position').focus();
	await player.getByLabel('Playback position').press('Home');
	await player.getByLabel('Playback position').press('ArrowRight');
	await expect
		.poll(() => page.evaluate(() => window.__ttsTest.media.at(-1)?.element.currentTime))
		.toBeCloseTo(0.1);
	expect(await page.evaluate(() => window.__ttsTest.media.length)).toBe(1);
	await page.evaluate(() =>
		window.__ttsTest.media.at(-1)?.element.dispatchEvent(new Event('ended'))
	);
	await expect(player.getByRole('button', { name: 'Listen to article again' })).toBeVisible();
	await player.getByRole('button', { name: 'Listen to article again' }).click();
	await player.getByRole('button', { name: 'Stop article audio' }).click();
	await expect(
		player.getByRole('button', { name: 'Listen to article', exact: true })
	).toBeVisible();
	expect(requests.provider).toBe(0);
});

test('Google segments reuse the permitted audio element and switching after completion starts device speech at the opening', async ({
	page
}) => {
	await mockNarration(page, 'ready', 2);
	await page.goto(shortArticle);
	const player = page.locator(playerSelector);
	await expect(player).toContainText('Google narration');
	await player.getByRole('button', { name: 'Listen to article', exact: true }).click();
	await expect(player.getByRole('button', { name: 'Pause article audio' })).toBeVisible();
	await player.getByLabel('Playback speed').selectOption('1.25');
	const firstSource = await page.evaluate(() => window.__ttsTest.media[0].element.src);
	await page.evaluate(() => window.__ttsTest.media[0].element.dispatchEvent(new Event('ended')));
	await expect
		.poll(() => page.evaluate(() => window.__ttsTest.media[0].element.src))
		.not.toBe(firstSource);
	expect(await page.evaluate(() => window.__ttsTest.media.length)).toBe(1);
	expect(await page.evaluate(() => window.__ttsTest.media[0].element.playbackRate)).toBe(1.25);
	await expect(player.getByText('Playing article', { exact: true })).toBeVisible();
	await page.evaluate(() => window.__ttsTest.media[0].element.dispatchEvent(new Event('ended')));
	await expect(player.getByRole('button', { name: 'Listen to article again' })).toBeVisible();
	await player.getByRole('combobox', { name: 'Narration source' }).selectOption('device');
	await player.getByRole('button', { name: 'Listen to article', exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__ttsTest.speech.length)).toBeGreaterThan(0);
	expect(await page.evaluate(() => window.__ttsTest.speech[0].text)).toMatch(
		/^The tea had grown a thin brown skin on top\./u
	);
});

test('a rejected media play recovers with the US English device voice', async ({ page }) => {
	await mockNarration(page);
	await page.goto(shortArticle);
	const player = page.locator(playerSelector);
	await expect(player).toContainText('Google narration');
	await page.evaluate(() => (window.__ttsTest.nextPlayFails = true));
	await player.getByRole('button', { name: 'Listen to article', exact: true }).click();
	await expect(player.getByRole('button', { name: /Use device voice/iu })).toBeVisible();
	await player.getByRole('button', { name: /Use device voice/iu }).click();
	await expect.poll(() => page.evaluate(() => window.__ttsTest.speech.length)).toBeGreaterThan(0);
	expect(await page.evaluate(() => window.__ttsTest.speech[0].voice)).toBe('test-us');
	expect(await page.evaluate(() => window.__ttsTest.speech[0].lang)).toBe('en-US');
});

for (const mode of ['missing', 'stale'] as const) {
	test(`${mode} narration uses device speech and remembers a selected voice`, async ({ page }) => {
		await mockNarration(page, mode);
		await page.goto(shortArticle);
		const player = page.locator(playerSelector);
		await expect(player.getByRole('combobox', { name: 'Device voice', exact: true })).toBeVisible();
		await expect(player.getByRole('combobox', { name: 'Device voice', exact: true })).toHaveValue(
			''
		);
		await player
			.getByRole('combobox', { name: 'Device voice', exact: true })
			.selectOption('test-gb');
		await player.getByRole('button', { name: 'Listen to article', exact: true }).click();
		await expect.poll(() => page.evaluate(() => window.__ttsTest.speech.length)).toBeGreaterThan(0);
		expect(await page.evaluate(() => window.__ttsTest.speech[0].voice)).toBe('test-gb');
		await player.getByRole('button', { name: 'Stop article audio' }).click();
		await page.reload();
		await expect(
			page.locator(playerSelector).getByRole('combobox', { name: 'Device voice', exact: true })
		).toHaveValue('test-gb');
	});
}

test('an asynchronously loaded device voice list selects US English', async ({ page }) => {
	await mockNarration(page, 'missing');
	await page.goto(`${shortArticle}?tts-delayed-voices=1`);
	const player = page.locator(playerSelector);
	await expect(player).toBeVisible();
	await page.evaluate(() => {
		window.__ttsTest.voicesReady = true;
		window.speechSynthesis.dispatchEvent(new Event('voiceschanged'));
	});
	await expect(player.getByRole('combobox', { name: 'Device voice', exact: true })).toHaveValue('');
	await player.getByRole('button', { name: 'Listen to article', exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__ttsTest.speech.length)).toBeGreaterThan(0);
	expect(await page.evaluate(() => window.__ttsTest.speech[0].voice)).toBe('test-us');
});

test('an unrecorded article skips absent narration on load, reload and client navigation while saved audio remains available', async ({
	page
}) => {
	const unrecordedSlug = 'ashtami-approach';
	const unrecordedArticle = longArticle;
	test.skip(
		existsSync(join(process.cwd(), 'static/audio/articles', unrecordedSlug, 'manifest.json')),
		'This article now has committed narration; select another absent-delivery fixture.'
	);
	const requests = await mockNarration(page);
	const unrecordedRequests: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname.startsWith(`/audio/articles/${unrecordedSlug}/`))
			unrecordedRequests.push(request.url());
	});
	const player = page.locator(playerSelector);
	const fallbackDetail =
		'Google narration is not available for this article. Device voice uses US English when available.';
	await page.goto(unrecordedArticle);
	await expect(player).toContainText(fallbackDetail);
	await expect(player.getByRole('combobox', { name: 'Device voice', exact: true })).toBeVisible();
	expect(requests).toEqual({ manifest: 0, audio: 0, provider: 0 });
	await page.reload();
	await expect(player).toContainText(fallbackDetail);
	expect(requests).toEqual({ manifest: 0, audio: 0, provider: 0 });
	await player.getByRole('button', { name: 'Listen to article', exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__ttsTest.speech.length)).toBe(1);
	expect(await page.evaluate(() => window.__ttsTest.speech[0].voice)).toBe('test-us');
	const cancellations = await page.evaluate(() => window.__ttsTest.cancelCalls);

	await navigateArticle(page, shortArticle);
	await expect(player.getByRole('combobox', { name: 'Narration source' })).toBeVisible();
	expect(requests.manifest).toBe(1);
	expect(await page.evaluate(() => window.__ttsTest.speech.length)).toBe(1);
	expect(await page.evaluate(() => window.speechSynthesis.speaking)).toBe(false);
	expect(await page.evaluate(() => window.__ttsTest.cancelCalls)).toBeGreaterThan(cancellations);
	await player.getByRole('button', { name: 'Listen to article', exact: true }).click();
	await expect(player.getByRole('button', { name: 'Pause article audio' })).toBeVisible();
	expect(await page.evaluate(() => window.__ttsTest.media.length)).toBe(1);
	expect(await page.evaluate(() => window.__ttsTest.media[0].element.paused)).toBe(false);

	await navigateArticle(page, unrecordedArticle);
	await expect(player).toContainText(fallbackDetail);
	await expect(player.getByRole('combobox', { name: 'Device voice', exact: true })).toBeVisible();
	expect(await page.evaluate(() => window.__ttsTest.media[0].element.paused)).toBe(true);
	await player.getByRole('button', { name: 'Listen to article', exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__ttsTest.speech.length)).toBe(2);
	expect(await page.evaluate(() => window.__ttsTest.media.length)).toBe(1);
	expect(unrecordedRequests).toEqual([]);
	expect(requests).toEqual({ manifest: 1, audio: 0, provider: 0 });
});

test('long article device narration stops on client navigation before a folio player starts', async ({
	page
}) => {
	const requests = await mockNarration(page, 'missing');
	await page.goto(longArticle);
	const player = page.locator(playerSelector);
	await expect(player.getByRole('combobox', { name: 'Device voice', exact: true })).toBeVisible();
	await player.getByRole('button', { name: 'Listen to article', exact: true }).click();
	await expect(player.getByRole('button', { name: 'Pause article audio' })).toBeVisible();
	await expect.poll(() => page.evaluate(() => window.__ttsTest.speech.length)).toBe(1);
	const cancellations = await page.evaluate(() => window.__ttsTest.cancelCalls);
	await navigateArticle(page, folioArticle);
	await expect(page.locator('[data-thought-folio="healthcare-human-margin"]')).toBeVisible();
	await expect(player.getByRole('combobox', { name: 'Device voice', exact: true })).toBeVisible();
	expect(await page.evaluate(() => window.speechSynthesis.speaking)).toBe(false);
	expect(await page.evaluate(() => window.__ttsTest.cancelCalls)).toBeGreaterThan(cancellations);
	await page
		.locator(playerSelector)
		.getByRole('button', { name: 'Listen to article', exact: true })
		.click();
	await expect.poll(() => page.evaluate(() => window.__ttsTest.speech.length)).toBe(2);
	expect(await page.evaluate(() => window.speechSynthesis.speaking)).toBe(true);
	expect(await page.evaluate(() => window.__ttsTest.media.length)).toBe(0);
	expect(requests.audio).toBe(0);
	expect(requests.provider).toBe(0);
});

test('published SSR and hydrated reading order match for standard, mixed-language and folio articles', async ({
	page,
	browser
}) => {
	test.setTimeout(120_000);
	await mockNarration(page, 'missing');
	const noJsPage = await browser.newPage({ javaScriptEnabled: false });
	try {
		for (const article of [shortArticle, mixedLanguageArticle, folioArticle]) {
			await page.goto(article);
			await expect(page.locator(playerSelector)).toBeVisible();
			await noJsPage.goto(new URL(article, page.url()).href);
			const hydrated = await page
				.locator('[data-article-reading-region]')
				.evaluate(extractNarration);
			const serverRendered = await noJsPage
				.locator('[data-article-reading-region]')
				.evaluate(extractNarration);
			expect(hydrated.length).toBeGreaterThan(100);
			expect(hydrated, article).toBe(serverRendered);
			expect(hydrated).not.toContain('Playback speed');
			if (article === mixedLanguageArticle) expect(hydrated).toContain('অশ্রুত');
		}
	} finally {
		await noJsPage.close();
	}
});
