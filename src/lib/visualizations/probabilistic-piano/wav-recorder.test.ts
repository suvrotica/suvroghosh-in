import { describe, expect, it, vi } from 'vitest';
import { FACTORY_PRESETS } from './synth-patch';
import {
	encodePcm16Wav,
	WAV_BITS_PER_SAMPLE,
	WAV_HEADER_BYTES,
	type WavEncodeRequest,
	type WavWorkerResponse
} from './wav-encoder.worker';
import { createWavRecorder, type OfflineAudioContextLike } from './wav-recorder';

class FakeParam {
	value = 0;
	setValueAtTime = vi.fn<(value: number, at: number) => FakeParam>(() => this);
	linearRampToValueAtTime = vi.fn<(value: number, at: number) => FakeParam>(() => this);
	exponentialRampToValueAtTime = vi.fn<(value: number, at: number) => FakeParam>(() => this);
	setTargetAtTime = vi.fn<(value: number, at: number, constant: number) => FakeParam>(() => this);
	cancelScheduledValues = vi.fn<(at: number) => FakeParam>(() => this);
}

class FakeNode {
	connect = vi.fn((dest: unknown) => dest);
	disconnect = vi.fn();
}

class FakeGain extends FakeNode {
	gain = new FakeParam();
}

class FakeOscillator extends FakeNode {
	frequency = new FakeParam();
	detune = new FakeParam();
	type = 'sine';
	onended: (() => void) | null = null;
	start = vi.fn<(when?: number) => void>();
	stop = vi.fn<(when?: number) => void>();
	setPeriodicWave = vi.fn();
}

class FakeConstantSource extends FakeNode {
	offset = new FakeParam();
	onended: (() => void) | null = null;
	start = vi.fn();
	stop = vi.fn();
}

class FakeBufferSource extends FakeNode {
	buffer: unknown = null;
	loop = false;
	playbackRate = new FakeParam();
	onended: (() => void) | null = null;
	start = vi.fn();
	stop = vi.fn();
}

class FakeBiquadFilter extends FakeNode {
	type = 'lowpass';
	frequency = new FakeParam();
	detune = new FakeParam();
	Q = new FakeParam();
	gain = new FakeParam();
}

class FakeWaveShaper extends FakeNode {
	curve: Float32Array | null = null;
	oversample = 'none';
}

class FakeDelay extends FakeNode {
	delayTime = new FakeParam();
}

class FakeConvolver extends FakeNode {
	buffer: unknown = null;
	normalize = true;
}

class FakeCompressor extends FakeNode {
	threshold = new FakeParam();
	knee = new FakeParam();
	ratio = new FakeParam();
	attack = new FakeParam();
	release = new FakeParam();
}

class FakeAnalyser extends FakeNode {
	fftSize = 2048;
	smoothingTimeConstant = 0.8;
	getFloatTimeDomainData = vi.fn();
	getByteTimeDomainData = vi.fn();
	getByteFrequencyData = vi.fn();
}

class FakeStereoPanner extends FakeNode {
	pan = new FakeParam();
}

class FakeAudioBuffer {
	readonly channels: Float32Array[];
	constructor(
		readonly numberOfChannels: number,
		readonly length: number,
		readonly sampleRate: number
	) {
		this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
	}
	getChannelData(index: number): Float32Array {
		return this.channels[index];
	}
}

class FakeOfflineAudioContext {
	state: AudioContextState = 'suspended';
	currentTime = 0;
	destination = {};
	oscillators: FakeOscillator[] = [];
	constantSources: FakeConstantSource[] = [];
	renderedBuffer: FakeAudioBuffer;

	constructor(
		readonly numberOfChannels: number,
		readonly length: number,
		readonly sampleRate: number
	) {
		this.renderedBuffer = new FakeAudioBuffer(numberOfChannels, length, sampleRate);
		// Fill deterministic stereo test tone samples
		const left = this.renderedBuffer.getChannelData(0);
		const right = this.renderedBuffer.getChannelData(1);
		for (let i = 0; i < Math.min(length, 16); i++) {
			left[i] = 0.5;
			right[i] = -0.5;
		}
	}

	createGain = vi.fn(() => new FakeGain());
	createOscillator = vi.fn(() => {
		const osc = new FakeOscillator();
		this.oscillators.push(osc);
		return osc;
	});
	createConstantSource = vi.fn(() => {
		const src = new FakeConstantSource();
		this.constantSources.push(src);
		return src;
	});
	createBufferSource = vi.fn(() => new FakeBufferSource());
	createBiquadFilter = vi.fn(() => new FakeBiquadFilter());
	createWaveShaper = vi.fn(() => new FakeWaveShaper());
	createDelay = vi.fn(() => new FakeDelay());
	createConvolver = vi.fn(() => new FakeConvolver());
	createDynamicsCompressor = vi.fn(() => new FakeCompressor());
	createAnalyser = vi.fn(() => new FakeAnalyser());
	createStereoPanner = vi.fn(() => new FakeStereoPanner());
	createBuffer = vi.fn((ch: number, len: number, sr: number) => new FakeAudioBuffer(ch, len, sr));
	createPeriodicWave = vi.fn(() => ({}));
	startRendering = vi.fn(async () => this.renderedBuffer as unknown as AudioBuffer);
}

class FakeWorker {
	private readonly messageListeners = new Set<(ev: MessageEvent<WavWorkerResponse>) => void>();
	private readonly errorListeners = new Set<(ev: ErrorEvent) => void>();
	lastTransfer: Transferable[] = [];
	terminated = false;

	constructor(private readonly autoRespond = true) {}

	addEventListener = vi.fn((type: string, cb: EventListenerOrEventListenerObject) => {
		if (type === 'message' && typeof cb === 'function') {
			this.messageListeners.add(cb as (ev: MessageEvent<WavWorkerResponse>) => void);
		} else if (type === 'error' && typeof cb === 'function') {
			this.errorListeners.add(cb as (ev: ErrorEvent) => void);
		}
	});

	removeEventListener = vi.fn((type: string, cb: EventListenerOrEventListenerObject) => {
		if (type === 'message' && typeof cb === 'function') {
			this.messageListeners.delete(cb as (ev: MessageEvent<WavWorkerResponse>) => void);
		} else if (type === 'error' && typeof cb === 'function') {
			this.errorListeners.delete(cb as (ev: ErrorEvent) => void);
		}
	});

	postMessage = vi.fn((message: WavEncodeRequest, transfer: Transferable[] = []) => {
		this.lastTransfer = transfer;
		if (!this.autoRespond) return;
		const pcm = message.channels.map((buf) => new Float32Array(buf));
		const wav = encodePcm16Wav(message.sampleRate, pcm);
		queueMicrotask(() => {
			if (this.terminated) return;
			const response: WavWorkerResponse = {
				type: 'complete',
				jobId: message.jobId,
				wav
			};
			const event = { data: response } as MessageEvent<WavWorkerResponse>;
			for (const cb of this.messageListeners) cb(event);
		});
	});

	terminate = vi.fn(() => {
		this.terminated = true;
	});
}

describe('16-bit PCM RIFF/WAVE encoder', () => {
	it('writes a valid 44-byte RIFF/WAVE PCM header and interleaved Int16 frames with clamping', () => {
		const left = new Float32Array([-1, 0, 1, 2.5, NaN]);
		const right = new Float32Array([1, -0.5, -2.0, Infinity, -Infinity]);
		const buffer = encodePcm16Wav(48_000, [left, right]);

		expect(buffer.byteLength).toBe(WAV_HEADER_BYTES + 5 * 4);
		const view = new DataView(buffer);
		const ascii = (offset: number, len: number) =>
			String.fromCharCode(...new Uint8Array(buffer, offset, len));

		expect(ascii(0, 4)).toBe('RIFF');
		expect(view.getUint32(4, true)).toBe(36 + 5 * 4);
		expect(ascii(8, 4)).toBe('WAVE');
		expect(ascii(12, 4)).toBe('fmt ');
		expect(view.getUint32(16, true)).toBe(16);
		expect(view.getUint16(20, true)).toBe(1); // PCM
		expect(view.getUint16(22, true)).toBe(2); // Stereo
		expect(view.getUint32(24, true)).toBe(48_000);
		expect(view.getUint32(28, true)).toBe(48_000 * 4);
		expect(view.getUint16(32, true)).toBe(4);
		expect(view.getUint16(34, true)).toBe(WAV_BITS_PER_SAMPLE);
		expect(ascii(36, 4)).toBe('data');
		expect(view.getUint32(40, true)).toBe(5 * 4);

		// Frame 0: L = -1 (-32768), R = +1 (+32767)
		expect(view.getInt16(44, true)).toBe(-32768);
		expect(view.getInt16(46, true)).toBe(32767);
		// Frame 1: L = 0, R = -0.5 (-16384)
		expect(view.getInt16(48, true)).toBe(0);
		expect(view.getInt16(50, true)).toBe(-16384);
		// Frame 2: L = +1, R = -2.0 clamped (-32768)
		expect(view.getInt16(52, true)).toBe(32767);
		expect(view.getInt16(54, true)).toBe(-32768);
		// Frame 3: L = +2.5 clamped (+32767), R = Infinity -> 0
		expect(view.getInt16(56, true)).toBe(32767);
		expect(view.getInt16(58, true)).toBe(0);
		// Frame 4: NaN & -Infinity -> 0
		expect(view.getInt16(60, true)).toBe(0);
		expect(view.getInt16(62, true)).toBe(0);
	});

	it('rejects invalid channel counts, empty buffers, and mismatched channel lengths', () => {
		expect(() => encodePcm16Wav(48_000, [])).toThrow(RangeError);
		expect(() =>
			encodePcm16Wav(48_000, [new Float32Array(4), new Float32Array(4), new Float32Array(4)])
		).toThrow(RangeError);
		expect(() => encodePcm16Wav(48_000, [new Float32Array(0)])).toThrow(RangeError);
		expect(() => encodePcm16Wav(48_000, [new Float32Array(4), new Float32Array(3)])).toThrow(
			RangeError
		);
	});
});

describe('event recorder and OfflineAudioContext + Worker WAV exporter', () => {
	it('records timestamped events, closes hanging notes on stop, and rejects empty recordings', async () => {
		let now = 10;
		const recorder = createWavRecorder({ nowSeconds: () => now });

		recorder.start();
		expect(recorder.recording).toBe(true);
		// Empty recording rejects cleanly
		recorder.stop();
		expect(recorder.recording).toBe(false);
		await expect(recorder.exportWav(FACTORY_PRESETS[0])).rejects.toThrow(/No playable notes/i);

		now = 20;
		recorder.start(FACTORY_PRESETS[0]);
		now = 20.1;
		recorder.recordEvent({ type: 'noteOn', pitch: 60, velocity: 0.8, voiceKey: 'k1' });
		recorder.recordEvent({ type: 'sustain', value: true });
		now = 20.5;
		// Hanging k1 and sustain=true should be closed automatically at stopTime = 0.5
		const recorded = recorder.stop();
		expect(recorded.some((e) => e.type === 'noteOff' && e.voiceKey === 'k1' && e.at === 0.5)).toBe(
			true
		);
		expect(recorded.some((e) => e.type === 'sustain' && e.value === false && e.at === 0.5)).toBe(
			true
		);
		recorder.dispose();
	});

	it('renders recorded events via OfflineAudioContext and transfers stereo PCM to Worker', async () => {
		let now = 0;
		let offlineCtx: FakeOfflineAudioContext | null = null;
		let worker: FakeWorker | null = null;

		const recorder = createWavRecorder({
			sampleRate: 48_000,
			tailSeconds: 0.5,
			nowSeconds: () => now,
			offlineContextFactory: (ch, len, sr) => {
				offlineCtx = new FakeOfflineAudioContext(ch, len, sr);
				return offlineCtx as unknown as OfflineAudioContextLike;
			},
			workerFactory: () => {
				worker = new FakeWorker(true);
				return worker as unknown as Worker;
			}
		});

		recorder.start(FACTORY_PRESETS[0]);
		now = 0.1;
		recorder.recordEvent({ type: 'noteOn', pitch: 60, velocity: 0.9, voiceKey: 'v1' });
		now = 0.25;
		recorder.recordEvent({ type: 'pitchBend', value: 0.5 });
		recorder.recordEvent({ type: 'modWheel', value: 0.6 });
		now = 0.4;
		recorder.recordEvent({ type: 'noteOff', voiceKey: 'v1' });
		now = 0.6;
		recorder.recordEvent({ type: 'patch', patch: FACTORY_PRESETS[1] });
		recorder.recordEvent({ type: 'noteOn', pitch: 64, velocity: 0.7, voiceKey: 'v2' });
		now = 0.8;
		recorder.recordEvent({ type: 'stopAll' });
		recorder.stop();

		const blob = await recorder.exportWav(FACTORY_PRESETS[0]);
		expect(blob.type).toBe('audio/wav');

		// Verify OfflineAudioContext scheduled oscillators at explicit timestamps
		expect(offlineCtx).not.toBeNull();
		expect(offlineCtx!.numberOfChannels).toBe(2);
		expect(offlineCtx!.sampleRate).toBe(48_000);
		expect(offlineCtx!.startRendering).toHaveBeenCalledOnce();
		expect(offlineCtx!.oscillators.length).toBeGreaterThanOrEqual(5);
		expect(offlineCtx!.oscillators[0].start).toHaveBeenCalledWith(0.1);

		// Verify Worker received transferable ArrayBuffers and was terminated
		expect(worker).not.toBeNull();
		expect(worker!.postMessage).toHaveBeenCalledOnce();
		expect(worker!.lastTransfer).toHaveLength(2);
		expect(worker!.lastTransfer[0]).toBeInstanceOf(ArrayBuffer);
		expect(worker!.terminate).toHaveBeenCalledOnce();

		// Verify output Blob contains valid RIFF/WAVE bytes
		const bytes = new Uint8Array(await blob.arrayBuffer());
		expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
		expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
		expect(bytes.byteLength).toBeGreaterThan(WAV_HEADER_BYTES);

		recorder.dispose();
	});

	it('revokes managed blob URLs and terminates active Worker on cancel and dispose', async () => {
		let now = 0;
		let worker: FakeWorker | null = null;
		const createdUrls: string[] = [];
		const revokedUrls: string[] = [];

		const recorder = createWavRecorder({
			sampleRate: 48_000,
			tailSeconds: 0.25,
			nowSeconds: () => now,
			offlineContextFactory: (ch, len, sr) =>
				new FakeOfflineAudioContext(ch, len, sr) as unknown as OfflineAudioContextLike,
			workerFactory: () => {
				worker = new FakeWorker(false); // holds job open until cancelled
				return worker as unknown as Worker;
			},
			createObjectUrl: () => {
				const url = `blob:test-${createdUrls.length + 1}`;
				createdUrls.push(url);
				return url;
			},
			revokeObjectUrl: (url) => {
				revokedUrls.push(url);
			}
		});

		const url1 = recorder.createBlobUrl(new Blob(['a']));
		const url2 = recorder.createBlobUrl(new Blob(['b']));
		expect(revokedUrls).toEqual([url1]);

		recorder.start(FACTORY_PRESETS[0]);
		now = 0.1;
		recorder.recordEvent({ type: 'noteOn', pitch: 60, velocity: 0.8 });
		recorder.stop();

		const pendingExport = recorder.exportWav(FACTORY_PRESETS[0]);
		await Promise.resolve();
		await Promise.resolve();
		recorder.cancel();

		await expect(pendingExport).rejects.toThrow(/cancelled/i);
		expect(worker!.terminate).toHaveBeenCalledOnce();

		recorder.dispose();
		expect(revokedUrls).toEqual([url1, url2]);
		await expect(recorder.exportWav(FACTORY_PRESETS[0])).rejects.toThrow(/disposed/i);
	});

	it('closes all duplicate-voiceKey offline voices and honors out-of-order max event timestamps on stop()', async () => {
		let offlineCtx: FakeOfflineAudioContext | null = null;
		const recorder = createWavRecorder({
			sampleRate: 48_000,
			tailSeconds: 0.5,
			nowSeconds: () => 0,
			offlineContextFactory: (ch, len, sr) => {
				offlineCtx = new FakeOfflineAudioContext(ch, len, sr);
				return offlineCtx as unknown as OfflineAudioContextLike;
			},
			workerFactory: () => new FakeWorker(true) as unknown as Worker
		});

		// Out-of-order explicit timestamps: maxAt is 5.0 even though last pushed event is at 1.0
		recorder.start(FACTORY_PRESETS[1]);
		recorder.recordEvent({ type: 'noteOn', pitch: 60, velocity: 0.8, voiceKey: 'k5', at: 5.0 });
		recorder.recordEvent({ type: 'noteOn', pitch: 64, velocity: 0.8, voiceKey: 'k1', at: 1.0 });
		const stopped = recorder.stop();
		const autoOffs = stopped.filter((e) => e.type === 'noteOff');
		expect(autoOffs).toHaveLength(2);
		for (const off of autoOffs) {
			expect(off.at).toBeGreaterThanOrEqual(5.0);
		}

		// Duplicate voiceKey on sustained preset followed by single noteOff leaves zero unstopped note oscillators at startRendering()
		let unstoppedVoiceOscsAtRender = -1;
		const origFactoryCtx = (ch: number, len: number, sr: number) => {
			const ctx = new FakeOfflineAudioContext(ch, len, sr);
			const origRender = ctx.startRendering;
			ctx.startRendering = vi.fn(async () => {
				// Audio-rate voice oscillators (>= 20 Hz), excluding sub-audio global LFO / Chorus LFO
				const voiceOscs = ctx.oscillators.filter((o) => {
					const hz = o.frequency.setValueAtTime.mock.calls[0]?.[0];
					return typeof hz === 'number' && hz >= 20;
				});
				unstoppedVoiceOscsAtRender = voiceOscs.filter((o) => {
					const stopAt = o.stop.mock.calls.at(-1)?.[0];
					return typeof stopAt !== 'number' || !Number.isFinite(stopAt);
				}).length;
				expect(voiceOscs.length).toBeGreaterThanOrEqual(6);
				return origRender();
			});
			offlineCtx = ctx;
			return ctx as unknown as OfflineAudioContextLike;
		};
		const dupRecorder = createWavRecorder({
			sampleRate: 48_000,
			tailSeconds: 0.5,
			nowSeconds: () => 0,
			offlineContextFactory: origFactoryCtx,
			workerFactory: () => new FakeWorker(true) as unknown as Worker
		});
		dupRecorder.start(FACTORY_PRESETS[1]);
		dupRecorder.recordEvent({ type: 'noteOn', pitch: 60, velocity: 0.8, at: 0.1 });
		dupRecorder.recordEvent({ type: 'noteOn', pitch: 60, velocity: 0.9, at: 0.25 });
		dupRecorder.recordEvent({ type: 'noteOff', pitch: 60, at: 0.5 });
		dupRecorder.stop();

		await dupRecorder.exportWav(FACTORY_PRESETS[1]);
		expect(offlineCtx).not.toBeNull();
		expect(unstoppedVoiceOscsAtRender).toBe(0);
		dupRecorder.dispose();
		recorder.dispose();
	});

	it('terminates worker and removes listeners if worker.postMessage throws synchronously', async () => {
		let worker: FakeWorker | null = null;
		const recorder = createWavRecorder({
			sampleRate: 48_000,
			tailSeconds: 0.25,
			nowSeconds: () => 0,
			offlineContextFactory: (ch, len, sr) =>
				new FakeOfflineAudioContext(ch, len, sr) as unknown as OfflineAudioContextLike,
			workerFactory: () => {
				worker = new FakeWorker(false);
				worker.postMessage.mockImplementation(() => {
					throw new Error('DataCloneError: transfer failed');
				});
				return worker as unknown as Worker;
			}
		});

		recorder.start(FACTORY_PRESETS[0]);
		recorder.recordEvent({ type: 'noteOn', pitch: 60, velocity: 0.8, at: 0.1 });
		recorder.stop();

		await expect(recorder.exportWav(FACTORY_PRESETS[0])).rejects.toThrow(/DataCloneError/);
		expect(worker).not.toBeNull();
		expect(worker!.terminate).toHaveBeenCalledOnce();
		expect(worker!.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
		expect(worker!.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function));
		expect(recorder.exporting).toBe(false);
		recorder.dispose();
	});

	it('preserves all 30 sequential staccato notes and 10 Unison-3 notes in offline export without pre-render stop(0) or disconnect()', async () => {
		for (const scenario of [
			{
				name: '30 sequential poly staccato notes',
				patch: FACTORY_PRESETS[1],
				noteCount: 30,
				stepSec: 0.1,
				minVoiceOscs: 30,
				noteDuration: 0.05
			},
			{
				name: '10 sequential Unison-3 staccato notes',
				patch: { ...FACTORY_PRESETS[1], voiceMode: 'unison' as const, unisonVoices: 3 as const },
				noteCount: 10,
				stepSec: 0.2,
				minVoiceOscs: 30,
				noteDuration: 0.05
			},
			{
				name: '30 overlapping sustained notes (stealing in offline mode)',
				patch: { ...FACTORY_PRESETS[1], ampEnv: { ...FACTORY_PRESETS[1].ampEnv, release: 2.5 } },
				noteCount: 30,
				stepSec: 0.04,
				minVoiceOscs: 30,
				noteDuration: 2.0
			}
		]) {
			let preRenderDisconnects = -1;
			let preRenderBareStops = -1;
			let preRenderInvalidStops = -1;
			let voiceOscCountAtRender = 0;
			let offlineCtx: FakeOfflineAudioContext | null = null;

			const recorder = createWavRecorder({
				sampleRate: 48_000,
				tailSeconds: 0.5,
				nowSeconds: () => 0,
				offlineContextFactory: (ch, len, sr) => {
					const ctx = new FakeOfflineAudioContext(ch, len, sr);
					const origRender = ctx.startRendering;
					ctx.startRendering = vi.fn(async () => {
						const voiceOscs = ctx.oscillators.filter((o) => {
							const hz = o.frequency.setValueAtTime.mock.calls[0]?.[0];
							return typeof hz === 'number' && hz >= 20;
						});
						voiceOscCountAtRender = voiceOscs.length;
						preRenderDisconnects = voiceOscs.filter(
							(o) => o.disconnect.mock.calls.length > 0
						).length;
						preRenderBareStops = voiceOscs.filter((o) =>
							o.stop.mock.calls.some((call) => call.length === 0 || call[0] === undefined)
						).length;
						preRenderInvalidStops = voiceOscs.filter((o) => {
							const startAt = o.start.mock.calls[0]?.[0] ?? 0;
							return o.stop.mock.calls.some(
								(call) =>
									typeof call[0] !== 'number' || !Number.isFinite(call[0]) || call[0] <= startAt
							);
						}).length;
						return origRender();
					});
					offlineCtx = ctx;
					return ctx as unknown as OfflineAudioContextLike;
				},
				workerFactory: () => new FakeWorker(true) as unknown as Worker
			});

			recorder.start(scenario.patch);
			for (let i = 0; i < scenario.noteCount; i++) {
				const at = i * scenario.stepSec;
				const key = `seq-${i}`;
				recorder.recordEvent({
					type: 'noteOn',
					pitch: 60 + (i % 12),
					velocity: 0.85,
					voiceKey: key,
					at
				});
				recorder.recordEvent({ type: 'noteOff', voiceKey: key, at: at + scenario.noteDuration });
			}
			recorder.stop();

			const blob = await recorder.exportWav(scenario.patch);
			expect(blob.type, scenario.name).toBe('audio/wav');
			expect(offlineCtx, scenario.name).not.toBeNull();
			expect(voiceOscCountAtRender, scenario.name).toBeGreaterThanOrEqual(scenario.minVoiceOscs);
			expect(preRenderDisconnects, scenario.name).toBe(0);
			expect(preRenderBareStops, scenario.name).toBe(0);
			expect(preRenderInvalidStops, scenario.name).toBe(0);

			// After startRendering() + graph.dispose(), all voice oscillators should be disconnected
			expect(offlineCtx!.oscillators.every((o) => o.disconnect.mock.calls.length > 0)).toBe(true);
			recorder.dispose();
		}
	});

	it('allows calling destructured unbound dispose() and cancel() without throwing', () => {
		const { dispose, cancel } = createWavRecorder();
		expect(() => cancel()).not.toThrow();
		expect(() => dispose()).not.toThrow();
	});
});

describe('Tier 5: wav-recorder and wav-encoder.worker adversarial coverage', () => {
	it('computes export tail across mid-recording patch switches so late reverb/release tails are not truncated', async () => {
		let now = 0;
		let requestedLength = 0;
		let requestedSampleRate = 48_000;
		const recorder = createWavRecorder({
			sampleRate: 48_000,
			nowSeconds: () => now,
			offlineContextFactory: (ch, len, sr) => {
				requestedLength = len;
				requestedSampleRate = sr;
				return new FakeOfflineAudioContext(ch, len, sr) as unknown as OfflineAudioContextLike;
			},
			workerFactory: () => new FakeWorker(true) as unknown as Worker
		});

		recorder.start(FACTORY_PRESETS[0]); // tail = 0.40s
		now = 0.2;
		recorder.recordEvent({ type: 'patch', patch: FACTORY_PRESETS[13] }); // release = 2.8s, canyon reverb = 1.5s -> 4.30s
		recorder.recordEvent({ type: 'noteOn', pitch: 60, velocity: 0.9, voiceKey: 'k1' });
		now = 0.5;
		recorder.recordEvent({ type: 'noteOff', voiceKey: 'k1' });
		now = 0.6;
		recorder.stop();

		await recorder.exportWav(FACTORY_PRESETS[0]);
		expect(requestedLength / requestedSampleRate).toBeGreaterThanOrEqual(0.6 + 4.0);
		recorder.dispose();
	});

	it('handles wrong jobId, worker error/cancelled messages, ErrorEvent, and mono AudioBuffer fallback cleanly', async () => {
		for (const mode of ['error', 'cancelled', 'errorEvent'] as const) {
			let worker: FakeWorker | null = null;
			const recorder = createWavRecorder({
				sampleRate: 48_000,
				tailSeconds: 0.25,
				nowSeconds: () => 0,
				offlineContextFactory: (ch, len, sr) => {
					const ctx = new FakeOfflineAudioContext(ch, len, sr);
					ctx.renderedBuffer = new FakeAudioBuffer(1, 100, sr);
					ctx.renderedBuffer.getChannelData(0).fill(0.25);
					return ctx as unknown as OfflineAudioContextLike;
				},
				workerFactory: () => {
					worker = new FakeWorker(false);
					worker.postMessage.mockImplementation((req: WavEncodeRequest) => {
						queueMicrotask(() => {
							if (mode === 'errorEvent') {
								for (const cb of (
									worker as unknown as { errorListeners: Set<(ev: ErrorEvent) => void> }
								).errorListeners) {
									cb({ message: 'boom' } as ErrorEvent);
								}
								return;
							}
							const listeners = (
								worker as unknown as {
									messageListeners: Set<(ev: MessageEvent<WavWorkerResponse>) => void>;
								}
							).messageListeners;
							// Emit wrong jobId first; must be ignored
							for (const cb of listeners) {
								cb({
									data: { type: 'error', jobId: 'wrong-job', message: 'ignore' }
								} as MessageEvent<WavWorkerResponse>);
							}
							const resp: WavWorkerResponse =
								mode === 'error'
									? { type: 'error', jobId: req.jobId, message: 'OOM' }
									: { type: 'cancelled', jobId: req.jobId };
							for (const cb of listeners) {
								cb({ data: resp } as MessageEvent<WavWorkerResponse>);
							}
						});
					});
					return worker as unknown as Worker;
				}
			});

			recorder.start(FACTORY_PRESETS[0]);
			recorder.recordEvent({ type: 'noteOn', pitch: 60, velocity: 0.8, at: 0.05 });
			recorder.stop();

			const expected = mode === 'error' ? /OOM/ : mode === 'cancelled' ? /cancelled/i : /boom/;
			await expect(recorder.exportWav(FACTORY_PRESETS[0])).rejects.toThrow(expected);
			expect(recorder.exporting).toBe(false);
			expect(worker!.terminate).toHaveBeenCalledOnce();
			recorder.dispose();
		}
	});

	it('encodes mono PCM16 WAV with clamped sample rates [8000..96000] and exercises wav-encoder.worker scope', async () => {
		const lowWav = encodePcm16Wav(4000, [new Float32Array([0.5, -0.5])]);
		const lowView = new DataView(lowWav);
		expect(lowView.getUint16(22, true)).toBe(1);
		expect(lowView.getUint32(24, true)).toBe(8000);
		expect(lowView.getUint32(28, true)).toBe(8000 * 2);
		expect(lowView.getUint16(32, true)).toBe(2);

		const highWav = encodePcm16Wav(200_000, [new Float32Array([0.5])]);
		const highView = new DataView(highWav);
		expect(highView.getUint16(22, true)).toBe(1);
		expect(highView.getUint32(24, true)).toBe(96_000);
		expect(highView.getUint32(28, true)).toBe(96_000 * 2);

		// Exercise wav-encoder.worker.ts message handler in simulated DedicatedWorkerGlobalScope
		const prevSelf = (globalThis as Record<string, unknown>).self;
		const posted: Array<{ msg: WavWorkerResponse; transfer?: Transferable[] }> = [];
		const listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
		const closeSpy = vi.fn();
		const fakeWorkerSelf = {
			postMessage: (msg: WavWorkerResponse, transfer?: Transferable[]) => {
				posted.push({ msg, transfer });
			},
			addEventListener: (type: string, cb: (ev: MessageEvent) => void) => {
				const arr = listeners.get(type) ?? [];
				arr.push(cb);
				listeners.set(type, arr);
			},
			close: closeSpy
		};
		vi.resetModules();
		Object.defineProperty(globalThis, 'self', {
			configurable: true,
			value: fakeWorkerSelf
		});
		try {
			await import('./wav-encoder.worker');
			const onMsg = listeners.get('message')?.[0];
			expect(onMsg).toBeDefined();

			// 1. Cancel before encode
			onMsg!({ data: { type: 'cancel', jobId: 'j1' } } as MessageEvent);
			onMsg!({
				data: {
					type: 'encode',
					jobId: 'j1',
					sampleRate: 48_000,
					channels: [new Float32Array(4).buffer]
				}
			} as MessageEvent);
			expect(posted.at(-1)?.msg).toEqual({ type: 'cancelled', jobId: 'j1' });

			// 2. Successful encode
			onMsg!({
				data: {
					type: 'encode',
					jobId: 'j2',
					sampleRate: 48_000,
					channels: [new Float32Array([0.25, -0.25]).buffer]
				}
			} as MessageEvent);
			expect(posted.at(-1)?.msg.type).toBe('complete');
			expect(posted.at(-1)?.transfer).toHaveLength(1);

			// 3. Malformed ArrayBuffer (byteLength 3 is not multiple of 4 -> RangeError)
			onMsg!({
				data: { type: 'encode', jobId: 'j3', sampleRate: 48_000, channels: [new ArrayBuffer(3)] }
			} as MessageEvent);
			expect(posted.at(-1)?.msg.type).toBe('error');

			// 4. Dispose closes worker and cancels subsequent encode
			onMsg!({ data: { type: 'dispose' } } as MessageEvent);
			expect(closeSpy).toHaveBeenCalledOnce();
			onMsg!({
				data: {
					type: 'encode',
					jobId: 'j4',
					sampleRate: 48_000,
					channels: [new Float32Array(4).buffer]
				}
			} as MessageEvent);
			expect(posted.at(-1)?.msg).toEqual({ type: 'cancelled', jobId: 'j4' });
		} finally {
			if (prevSelf === undefined) {
				delete (globalThis as Record<string, unknown>).self;
			} else {
				Object.defineProperty(globalThis, 'self', { configurable: true, value: prevSelf });
			}
			vi.resetModules();
		}
	});
});
