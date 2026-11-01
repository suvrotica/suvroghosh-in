/** Native Web Audio regression; run: node --test src/lib/visualizations/listening-room/audio.browser.mjs */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

test(
	'native audio: mono upmix, stereo matrix, bypass, file replacement and teardown',
	{ timeout: 20000 },
	async () => {
		const bundle = await build({
			entryPoints: [fileURLToPath(new URL('./audio.ts', import.meta.url))],
			bundle: true,
			write: false,
			format: 'iife',
			globalName: 'ListeningRoom',
			platform: 'browser'
		});
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage();
			await page.setContent('<button id="start">Play mono fixture</button>');
			await page.addScriptTag({ content: bundle.outputFiles[0].text });
			await page.evaluate(() => {
				document.querySelector('#start').onclick = async () => {
					const stereo = await ListeningRoom.createDemoWav().arrayBuffer();
					const source = new DataView(stereo);
					const frames = (source.byteLength - 44) / 4;
					const mono = new ArrayBuffer(44 + frames * 2);
					new Uint8Array(mono, 0, 44).set(new Uint8Array(stereo, 0, 44));
					const output = new DataView(mono);
					output.setUint32(4, mono.byteLength - 8, true);
					output.setUint16(22, 1, true);
					output.setUint32(28, 44100 * 2, true);
					output.setUint16(32, 2, true);
					output.setUint32(40, frames * 2, true);
					for (let i = 0; i < frames; i++) {
						output.setInt16(44 + i * 2, source.getInt16(44 + i * 4, true), true);
					}
					window.probeUrls = [URL.createObjectURL(new Blob([mono], { type: 'audio/wav' }))];
					window.probeAudio = new Audio(window.probeUrls[0]);
					window.probeEngine = new ListeningRoom.LocalAudioEngine(window.probeAudio);
					await window.probeEngine.resume();
					window.probeContext = window.probeEngine.context;
					window.probeSourceChannels = (
						await window.probeContext.decodeAudioData(mono.slice(0))
					).numberOfChannels;
					await window.probeAudio.play();
				};
			});
			await page.click('#start');
			await page.waitForFunction(
				() =>
					window.probeAudio?.currentTime > 0.1 && window.probeEngine.getSnapshot().peakLeft > 0.01
			);
			const mono = await page.evaluate(() => ({
				channels: window.probeSourceChannels,
				...window.probeEngine.getSnapshot()
			}));
			assert.equal(mono.channels, 1, 'Fixture must actually decode to one channel');
			assert.ok(mono.rmsLeft > 0.01);
			assert.ok(
				Math.abs(mono.rmsLeft - mono.rmsRight) < 1e-6,
				'Mono input must reach both output channels'
			);
			assert.ok(mono.spectrum.some((value) => value > 0));

			await page.evaluate(() =>
				window.probeEngine.setSettings(ListeningRoom.normalizeAudioSettings({ width: 1.25 }))
			);
			await page.waitForTimeout(300);
			const wideMono = await page.evaluate(() => window.probeEngine.getSnapshot());
			assert.ok(wideMono.rmsRight > 0.01);
			assert.ok(
				Math.abs(wideMono.rmsLeft - wideMono.rmsRight) < 1e-6,
				'Width must preserve centred mono'
			);

			await page.evaluate(() =>
				window.probeEngine.setSettings(ListeningRoom.normalizeAudioSettings({ balance: -1 }))
			);
			await page.waitForTimeout(300);
			const left = await page.evaluate(() => window.probeEngine.getSnapshot());
			assert.ok(left.rmsLeft > 0.01);
			assert.ok(left.rmsRight < 1e-5);

			await page.evaluate(() =>
				window.probeEngine.setSettings(ListeningRoom.normalizeAudioSettings({ volume: 0 }))
			);
			await page.waitForTimeout(300);
			const silent = await page.evaluate(() => window.probeEngine.getSnapshot());
			assert.ok(silent.peakLeft < 1e-5 && silent.peakRight < 1e-5);

			await page.evaluate(() =>
				window.probeEngine.setSettings(
					ListeningRoom.normalizeAudioSettings({ balance: -1, bypass: true })
				)
			);
			await page.waitForTimeout(300);
			assert.ok((await page.evaluate(() => window.probeEngine.getSnapshot())).rmsRight > 0.01);

			await page.evaluate(async () => {
				window.probeAudio.pause();
				const url = URL.createObjectURL(ListeningRoom.createDemoWav());
				window.probeUrls.push(url);
				window.probeAudio.src = url;
				window.probeAudio.load();
				window.probeEngine.setSettings(ListeningRoom.normalizeAudioSettings());
				await window.probeEngine.resume();
				await window.probeAudio.play();
			});
			await page.waitForFunction(
				() =>
					window.probeAudio.currentTime > 0.8 &&
					Math.abs(
						window.probeEngine.getSnapshot().rmsLeft - window.probeEngine.getSnapshot().rmsRight
					) > 0.0001
			);
			assert.equal(
				await page.evaluate(() => window.probeEngine.context === window.probeContext),
				true,
				'File changes must reuse the media-source context'
			);

			await page.evaluate(() =>
				window.probeEngine.setSettings(
					ListeningRoom.normalizeAudioSettings({ eq: [2, 3, 1, -2, -3, 4, 5, -1, 2, 3] })
				)
			);
			await page.waitForTimeout(300);
			const responseError = await page.evaluate(() => {
				const frequencies = new Float32Array(ListeningRoom.RESPONSE_FREQUENCIES);
				const magnitude = new Float32Array(frequencies.length);
				const phase = new Float32Array(frequencies.length);
				const response = Array(frequencies.length).fill(0);
				window.probeEngine.filters.forEach((filter) => {
					filter.getFrequencyResponse(frequencies, magnitude, phase);
					magnitude.forEach((value, i) => (response[i] += 20 * Math.log10(value)));
				});
				return Math.max(
					...window.probeEngine
						.getFrequencyResponse()
						.map((value, i) => Math.abs(value - response[i]))
				);
			});
			assert.ok(responseError < 0.002, `EQ response differs from browser by ${responseError} dB`);

			const closed = await page.evaluate(async () => {
				window.probeEngine.destroy();
				window.probeEngine.destroy();
				window.probeUrls.forEach((url) => URL.revokeObjectURL(url));
				return {
					paused: window.probeAudio.paused,
					sampleRate: window.probeEngine.getSnapshot().sampleRate
				};
			});
			assert.deepEqual(closed, { paused: true, sampleRate: 0 });
		} finally {
			await browser.close();
		}
	}
);
