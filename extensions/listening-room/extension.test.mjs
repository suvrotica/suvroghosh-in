import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { unzipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const build = path.join(root, '.tmp/listening-room-extension');
execFileSync(process.execPath, ['scripts/build-listening-room-extension.mjs'], { cwd: root });
const { isListeningRoomUrl, isPageSender, soundSettings, SETTINGS_KEY } = await import(
	pathToFileURL(path.join(build, 'protocol.js')).href
);
const appUrl = 'https://www.suvroghosh.in/blog/visualizations/listening-room';

test('package has minimal permissions, exact-site bridge, and shared DSP', async () => {
	const manifest = JSON.parse(await readFile(path.join(build, 'manifest.json'), 'utf8'));
	assert.deepEqual(manifest.permissions, [
		'activeTab',
		'tabCapture',
		'offscreen',
		'storage',
		'scripting'
	]);
	assert.equal(manifest.host_permissions, undefined);
	assert.equal(manifest.content_scripts[0].all_frames, false);
	const archive = unzipSync(
		await readFile(path.join(root, 'static/downloads/listening-room-extension.zip'))
	);
	for (const file of [
		'manifest.json',
		'dsp.js',
		'graph.js',
		'content.js',
		'background.js',
		'offscreen.html',
		'offscreen.js',
		'README.md'
	])
		assert.ok(archive[file], file);
	assert.equal(archive['extension.test.mjs'], undefined);
	assert.deepEqual(archive['dsp.js'], new Uint8Array(await readFile(path.join(build, 'dsp.js'))));
});

test('rejects lookalike origins, paths and child frames; bounds sound settings', () => {
	assert.equal(isListeningRoomUrl(appUrl), true);
	assert.equal(isListeningRoomUrl(appUrl + '/?from=apps'), true);
	for (const url of [
		appUrl + '-fake',
		appUrl + '/other',
		appUrl.replace('https:', 'http:'),
		appUrl.replace('.in/', '.in.attacker.test/'),
		appUrl.replace('.in/', '.in:8443/'),
		appUrl.replace('www.', 'user@www.'),
		'not a url'
	])
		assert.equal(isListeningRoomUrl(url), false, url);
	const sender = { id: 'ours', frameId: 0, url: appUrl, tab: { id: 9, url: appUrl } };
	assert.equal(isPageSender(sender, 'ours'), true);
	assert.equal(isPageSender({ ...sender, frameId: 1 }, 'ours'), false);
	assert.equal(isPageSender({ ...sender, id: 'other' }, 'ours'), false);
	assert.equal(
		isPageSender({ ...sender, tab: { id: 9, url: 'https://youtube.com/' } }, 'ours'),
		false
	);
	const settings = soundSettings({
		eq: [100, -100, NaN],
		trimDb: 99,
		width: -1,
		balance: Infinity,
		volume: 0,
		mono: 'true'
	});
	assert.deepEqual(settings.eq, [6, -6, 0, 0, 0, 0, 0, 0, 0, 0]);
	assert.equal(settings.volume, 100);
	assert.equal(settings.trimDb, 6);
	assert.equal(settings.width, 0);
	assert.equal(settings.balance, 0);
	assert.equal(settings.mono, false);
});

test('worker starts only after toolbar invocation, toggles capture and stops on navigation', async () => {
	const listeners = {};
	const event = (name) => ({
		addListener(fn) {
			listeners[name] = fn;
		}
	});
	const calls = [];
	let contextExists = false;
	let session = { active: false };
	let saved = {};
	let fail = false;
	const chrome = {
		runtime: {
			id: 'ours',
			getURL: (file) => `chrome-extension://ours/${file}`,
			getContexts: async () => (contextExists ? [{}] : []),
			sendMessage: async (message) => {
				calls.push(message);
				if (message.type === 'start')
					session = fail
						? { active: false, error: 'Capture failed' }
						: { active: true, tabId: message.tabId };
				if (message.type === 'stop') session = { active: false };
				return session;
			},
			onMessage: event('message')
		},
		action: { onClicked: event('click'), setBadgeText: async () => {}, setTitle: async () => {} },
		tabs: {
			sendMessage: async () => ({ connected: true }),
			get: async () => ({ id: 9, url: appUrl }),
			onRemoved: event('removed'),
			onUpdated: event('updated')
		},
		scripting: { executeScript: async () => {} },
		offscreen: {
			createDocument: async () => {
				contextExists = true;
			},
			closeDocument: async () => {
				contextExists = false;
			}
		},
		tabCapture: {
			getMediaStreamId: async () => {
				calls.push({ type: 'capture' });
				return 'stream-token';
			}
		},
		storage: {
			local: {
				get: async () => saved,
				set: async (value) => {
					saved = value;
				}
			}
		}
	};
	const source = (await readFile(path.join(build, 'background.js'), 'utf8')).replace(
		/^import .*;\s*/u,
		''
	);
	vm.runInNewContext(source, {
		chrome,
		SETTINGS_KEY,
		isListeningRoomUrl,
		isPageSender,
		soundSettings,
		console
	});
	const settle = async () => {
		for (let i = 0; i < 30; i++) await new Promise((resolve) => setImmediate(resolve));
	};
	const sender = { id: 'ours', frameId: 0, url: appUrl, tab: { id: 9, url: appUrl } };
	const message = (type, extra = {}) =>
		new Promise((resolve) =>
			listeners.message({ target: 'worker', type, ...extra }, sender, resolve)
		);
	assert.equal((await message('hello')).active, false);
	await message('settings', { settings: { eq: [-3], volume: 17 } });
	assert.equal(
		calls.some((call) => call.type === 'capture'),
		false
	);
	assert.equal(saved[SETTINGS_KEY].volume, 100);
	listeners.click({ id: 9, url: 'https://youtube.com/' });
	await settle();
	assert.equal(
		calls.some((call) => call.type === 'capture'),
		false
	);
	listeners.click({ id: 9, url: appUrl });
	await settle();
	assert.equal(session.active, true);
	assert.equal(calls.find((call) => call.type === 'start').settings.eq[0], -3);
	assert.equal((await message('hello')).active, true);
	listeners.updated(9, { status: 'loading' });
	await settle();
	assert.equal(contextExists, false);
	listeners.click({ id: 9, url: appUrl });
	await settle();
	listeners.updated(9, { url: 'https://www.suvroghosh.in/blog/apps' });
	await settle();
	assert.equal(contextExists, false);
	listeners.click({ id: 9, url: appUrl });
	await settle();
	listeners.click({ id: 9, url: appUrl });
	await settle();
	assert.equal(contextExists, false);
	fail = true;
	listeners.click({ id: 9, url: appUrl });
	await settle();
	assert.equal(contextExists, false);
	assert.equal((await message('hello')).error, 'Capture failed');
});

test('content bridge ignores other origins and frames without starting capture', async () => {
	const listeners = {};
	const sent = [];
	const published = [];
	const window = {
		addEventListener: (name, fn) => {
			listeners[name] = fn;
		},
		removeEventListener() {},
		postMessage: (value) => published.push(value)
	};
	window.top = window;
	const chrome = {
		runtime: {
			id: 'ours',
			sendMessage: async (value) => {
				sent.push(value);
				return { active: false };
			},
			onMessage: { addListener() {} }
		}
	};
	vm.runInNewContext(await readFile(path.join(build, 'content.js'), 'utf8'), {
		window,
		location: new URL(appUrl),
		URL,
		chrome,
		document: { hidden: false },
		setInterval: () => 1,
		clearInterval() {}
	});
	await new Promise((resolve) => setImmediate(resolve));
	const data = { channel: 'listening-room:page', v: 1, type: 'settings', settings: { eq: [-2] } };
	const origin = new URL(appUrl).origin;
	listeners.message({ source: {}, origin, data });
	listeners.message({ source: window, origin: 'https://attacker.test', data });
	assert.deepEqual(
		sent.map((item) => item.type),
		['hello']
	);
	listeners.message({ source: window, origin, data });
	assert.equal(sent.at(-1).type, 'settings');
	assert.equal(published[0].installed, true);
	listeners.pagehide();
	assert.equal(sent.at(-1).type, 'stop');
});

test('stopping a pending offscreen capture replies immediately and closes a late stream', async () => {
	let receive;
	let resolveCapture;
	let stoppedTracks = 0;
	const chrome = {
		runtime: {
			id: 'ours',
			onMessage: {
				addListener(fn) {
					receive = fn;
				}
			}
		}
	};
	const source = (await readFile(path.join(build, 'offscreen.js'), 'utf8')).replace(
		/^import .*;\s*/u,
		''
	);
	vm.runInNewContext(source, {
		chrome,
		setTimeout,
		clearTimeout,
		navigator: {
			mediaDevices: {
				getUserMedia: () =>
					new Promise((resolve) => {
						resolveCapture = resolve;
					})
			}
		},
		AudioContext: class {
			constructor() {
				throw new Error('Cancelled capture must not create an audio context');
			}
		},
		createSoundGraph() {
			throw new Error('Cancelled capture must not create a graph');
		}
	});
	const message = (type) =>
		new Promise((resolve) =>
			receive({ target: 'offscreen', type, tabId: 9, streamId: 'token' }, { id: 'ours' }, resolve)
		);
	const pending = message('start');
	await new Promise((resolve) => setImmediate(resolve));
	await message('stop');
	const result = await Promise.race([
		pending,
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error('Cancellation waited for capture timeout')), 500)
		)
	]);
	assert.equal(result.active, false);
	assert.match(result.error, /cancelled/);
	resolveCapture({
		getTracks: () => [
			{
				stop() {
					stoppedTracks++;
				}
			}
		]
	});
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(stoppedTracks, 1);
});

test('one startup deadline also cleans up a stalled AudioContext resume', async () => {
	let receive;
	let expire;
	let resumed = false;
	let stopped = 0;
	let destroyed = 0;
	let closed = 0;
	const track = {
		stop() {
			stopped++;
		}
	};
	const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
	const source = (await readFile(path.join(build, 'offscreen.js'), 'utf8')).replace(
		/^import .*;\s*/u,
		''
	);
	vm.runInNewContext(source, {
		chrome: {
			runtime: {
				id: 'ours',
				onMessage: {
					addListener(fn) {
						receive = fn;
					}
				}
			}
		},
		setTimeout(fn, delay) {
			assert.equal(delay, 10000);
			expire = fn;
			return 1;
		},
		clearTimeout() {},
		navigator: { mediaDevices: { getUserMedia: async () => stream } },
		AudioContext: class {
			state = 'suspended';
			createMediaStreamSource() {
				return { disconnect() {} };
			}
			resume() {
				resumed = true;
				return new Promise(() => {});
			}
			async close() {
				this.state = 'closed';
				closed++;
			}
		},
		createSoundGraph() {
			return {
				destroy() {
					destroyed++;
				}
			};
		}
	});
	const pending = new Promise((resolve) =>
		receive(
			{ target: 'offscreen', type: 'start', tabId: 9, streamId: 'token' },
			{ id: 'ours' },
			resolve
		)
	);
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(resumed, true);
	expire();
	const result = await pending;
	assert.equal(result.active, false);
	assert.match(result.error, /timed out/);
	assert.equal(stopped, 1);
	assert.equal(destroyed, 1);
	assert.equal(closed, 1);
});

test(
	'packaged extension loads in isolated Chromium and saves only validated page settings',
	{ timeout: 45000 },
	async () => {
		const context = await chromium.launchPersistentContext('', {
			headless: true,
			channel: 'chromium',
			serviceWorkers: 'allow',
			args: [`--disable-extensions-except=${build}`, `--load-extension=${build}`]
		});
		try {
			const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
			const page = await context.newPage();
			await page.route('**/*', (route) =>
				route.fulfill({
					contentType: 'text/html',
					body: '<!doctype html><title>Listening Room bridge fixture</title><h1>Bridge fixture</h1>'
				})
			);
			await page.addInitScript(() => {
				window.bridgeStatuses = [];
				window.addEventListener('message', (event) => {
					if (event.data?.channel === 'listening-room:extension')
						window.bridgeStatuses.push(event.data);
				});
			});
			await page.goto(appUrl);
			await page.waitForFunction(() =>
				window.bridgeStatuses?.some((status) => status.installed && !status.active)
			);
			await page.evaluate(() =>
				window.postMessage(
					{
						channel: 'listening-room:page',
						v: 1,
						type: 'settings',
						settings: { eq: [99, -99], trimDb: -4, volume: 7, privateFile: 'should-not-be-saved' }
					},
					location.origin
				)
			);
			const stored = await (async () => {
				for (let i = 0; i < 50; i++) {
					const value = await worker.evaluate(
						async (key) => (await chrome.storage.local.get(key))[key],
						SETTINGS_KEY
					);
					if (value?.trimDb === -4) return value;
					await new Promise((resolve) => setTimeout(resolve, 40));
				}
				throw new Error('Page settings did not reach extension storage');
			})();
			assert.equal(stored.volume, 100);
			assert.deepEqual(stored.eq, [6, -6, 0, 0, 0, 0, 0, 0, 0, 0]);
			assert.equal(stored.privateFile, undefined);
			const captured = await worker.evaluate(async () => chrome.tabCapture.getCapturedTabs());
			assert.deepEqual(captured, []);
			await page.goto(appUrl + '-not-the-app');
			await page.evaluate(() =>
				window.postMessage(
					{ channel: 'listening-room:page', v: 1, type: 'settings', settings: { trimDb: -12 } },
					location.origin
				)
			);
			await new Promise((resolve) => setTimeout(resolve, 100));
			assert.equal(
				(
					await worker.evaluate(
						async (key) => (await chrome.storage.local.get(key))[key],
						SETTINGS_KEY
					)
				).trimDb,
				-4
			);
			assert.equal(await page.evaluate(() => window.bridgeStatuses.length), 0);
		} finally {
			await context.close();
		}
	}
);

test(
	'native Web Audio graph changes PCM, preserves bypass and ignores double volume',
	{ timeout: 45000 },
	async () => {
		const server = createServer(async (request, response) => {
			const file = decodeURIComponent(new URL(request.url, 'http://local').pathname).slice(1);
			if (!/^[a-z-]+\.js$/.test(file)) {
				response.end('<!doctype html><title>Audio fixture</title>');
				return;
			}
			try {
				response.setHeader('Content-Type', 'text/javascript');
				response.end(await readFile(path.join(build, file)));
			} catch {
				response.statusCode = 404;
				response.end();
			}
		});
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const browser = await chromium.launch({
			channel: 'chromium',
			headless: true,
			args: ['--autoplay-policy=no-user-gesture-required']
		});
		try {
			const page = await browser.newPage();
			await page.goto(`http://127.0.0.1:${server.address().port}`);
			const result = await page.evaluate(async () => {
				const { createSoundGraph } = await import('/graph.js');
				async function render(settings, rightGain = 1) {
					const context = new OfflineAudioContext(2, 48000, 48000);
					const buffer = context.createBuffer(2, 48000, 48000);
					for (let i = 0; i < 48000; i++) {
						buffer.getChannelData(0)[i] = 0.2 * Math.sin((2 * Math.PI * 1000 * i) / 48000);
						buffer.getChannelData(1)[i] = buffer.getChannelData(0)[i] * rightGain;
					}
					const source = context.createBufferSource();
					source.buffer = buffer;
					const graph = createSoundGraph(context, source, settings);
					source.start();
					const output = await context.startRendering();
					graph.destroy();
					const rms = (channel) =>
						Math.sqrt(
							output
								.getChannelData(channel)
								.slice(24000)
								.reduce((sum, value) => sum + value * value, 0) / 24000
						);
					return [rms(0), rms(1)];
				}
				const cut = Array(10).fill(0);
				cut[5] = -6;
				// Exercise the same native MediaStreamAudioSourceNode used by tab capture,
				// using an original synthetic source rather than a YouTube recording.
				const producer = new AudioContext();
				const oscillator = producer.createOscillator();
				oscillator.frequency.value = 1000;
				const gain = producer.createGain();
				gain.gain.value = 0.2;
				const streamOutput = producer.createMediaStreamDestination();
				oscillator.connect(gain);
				gain.connect(streamOutput);
				oscillator.start();
				const producerSilent = producer.createGain();
				producerSilent.gain.value = 0;
				gain.connect(producerSilent);
				producerSilent.connect(producer.destination);
				const consumer = new AudioContext();
				const source = consumer.createMediaStreamSource(streamOutput.stream);
				const analyser = consumer.createAnalyser();
				analyser.fftSize = 2048;
				const silentOutput = consumer.createGain();
				silentOutput.gain.value = 0;
				analyser.connect(silentOutput);
				silentOutput.connect(consumer.destination);
				const liveGraph = createSoundGraph(consumer, source, {}, analyser);
				await Promise.all([producer.resume(), consumer.resume()]);
				const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
				const liveRms = () => {
					const data = new Float32Array(2048);
					analyser.getFloatTimeDomainData(data);
					return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
				};
				let streamNeutral = 0;
				for (let i = 0; i < 50 && streamNeutral < 0.135; i++) {
					await wait(100);
					streamNeutral = liveRms();
				}
				liveGraph.setSettings({ eq: cut });
				await wait(350);
				const streamCut = liveRms();
				liveGraph.destroy();
				source.disconnect();
				streamOutput.stream.getTracks().forEach((track) => track.stop());
				oscillator.stop();
				await Promise.all([producer.close(), consumer.close()]);
				return {
					streamNeutral,
					streamCut,
					neutral: await render({}),
					cut: await render({ eq: cut }),
					bypass: await render({
						eq: cut,
						width: 0,
						balance: 1,
						trimDb: -18,
						bypass: true,
						volume: 0
					}),
					balance: await render({ balance: 1 }),
					mono: await render({ mono: true }, -1),
					trim: await render({ trimDb: -6 }),
					ignoredVolume: await render({ volume: 0 })
				};
			});
			assert.ok(Math.abs(result.neutral[0] - 0.2 / Math.SQRT2) < 0.0001);
			assert.ok(result.streamNeutral > 0.12 && result.streamNeutral < 0.16, JSON.stringify(result));
			assert.ok(Math.abs(result.streamCut / result.streamNeutral - 10 ** (-6 / 20)) < 0.03);
			assert.ok(Math.abs(result.cut[0] / result.neutral[0] - 10 ** (-6 / 20)) < 0.005);
			assert.ok(Math.abs(result.trim[0] / result.neutral[0] - 10 ** (-6 / 20)) < 0.005);
			assert.deepEqual(result.bypass, result.neutral);
			assert.deepEqual(result.ignoredVolume, result.neutral);
			assert.equal(result.balance[0], 0);
			assert.ok(Math.abs(result.balance[1] - result.neutral[1]) < 0.0001);
			assert.ok(result.mono.every((rms) => rms < 1e-8));
		} finally {
			await browser.close();
			await new Promise((resolve) => server.close(resolve));
		}
	}
);
