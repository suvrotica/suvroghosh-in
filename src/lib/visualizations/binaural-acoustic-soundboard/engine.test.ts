import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimPlayback, releasePlayback } from '$lib/components/blog/tts/playback';
import {
	buildOfflineTestGraph,
	createSoundboardEngine,
	type AudioBufferLike,
	type AudioBufferSourceNodeLike,
	type AudioContextLike,
	type AudioNodeLike,
	type AudioParamLike,
	type AnalyserNodeLike,
	type GainNodeLike,
	type OscillatorNodeLike,
	type SoundboardState
} from './engine';
import {
	BINAURAL_BASE_HZ,
	BINAURAL_PRESETS,
	CHANNEL_IDS,
	STARTING_PRESETS,
	channelLinearGain,
	matchingStartingPresetId,
	maxCombinedLinearGain,
	resolveBinauralFrequencies,
	synthesizeProceduralFanChannels,
	synthesizeProceduralNoiseChannels,
	toggleChannelMute,
	updateChannelLevel
} from './sounds';
import {
	SOUNDBOARD_STORAGE_KEY,
	createSavedMix,
	loadSoundboardStorage,
	parseSoundboardStorage,
	saveSoundboardStorage
} from './storage';

class FakeAudioParam implements AudioParamLike {
	value: number;
	events: Array<{ type: 'set' | 'linear' | 'cancel'; value?: number; time: number }> = [];

	constructor(initial = 1) {
		this.value = initial;
	}

	setValueAtTime(value: number, startTime: number) {
		this.value = value;
		this.events.push({ type: 'set', value, time: startTime });
	}

	linearRampToValueAtTime(value: number, endTime: number) {
		this.value = value;
		this.events.push({ type: 'linear', value, time: endTime });
	}

	cancelScheduledValues(startTime: number) {
		this.events = this.events.filter((e) => e.time < startTime);
		this.events.push({ type: 'cancel', time: startTime });
	}

	valueAt(time: number): number {
		let current = this.value;
		let prevTime = 0;
		let prevVal = current;
		for (const ev of this.events) {
			if (ev.type === 'cancel') continue;
			if (ev.type === 'set') {
				if (time >= ev.time) {
					current = ev.value!;
					prevTime = ev.time;
					prevVal = ev.value!;
				} else {
					return current;
				}
			} else if (ev.type === 'linear') {
				if (time <= prevTime) {
					return prevVal;
				}
				if (time >= ev.time) {
					current = ev.value!;
					prevTime = ev.time;
					prevVal = ev.value!;
				} else {
					const frac = (time - prevTime) / Math.max(1e-6, ev.time - prevTime);
					return prevVal + frac * (ev.value! - prevVal);
				}
			}
		}
		return current;
	}
}

class FakeAudioNode implements AudioNodeLike {
	connections: Array<{ destination: unknown; output?: number; input?: number }> = [];
	disconnected = false;
	channelCount = 2;
	channelCountMode = 'explicit';
	channelInterpretation = 'speakers';

	connect(destination: unknown, output?: number, input?: number) {
		this.connections.push({ destination, output, input });
		return destination;
	}

	disconnect() {
		this.disconnected = true;
		this.connections = [];
	}
}

class FakeGainNode extends FakeAudioNode implements GainNodeLike {
	gain = new FakeAudioParam(1);
}

class FakeOscillatorNode extends FakeAudioNode implements OscillatorNodeLike {
	type: OscillatorType = 'sine';
	frequency = new FakeAudioParam(220);
	startedAt: number | null = null;
	stoppedAt: number | null = null;

	start(when = 0) {
		this.startedAt = when;
	}

	stop(when = 0) {
		this.stoppedAt = when;
	}
}

class FakeAudioBuffer implements AudioBufferLike {
	readonly numberOfChannels: number;
	readonly length: number;
	readonly sampleRate: number;
	readonly duration: number;
	private channels: Float32Array[];

	constructor(numberOfChannels: number, length: number, sampleRate: number) {
		this.numberOfChannels = numberOfChannels;
		this.length = length;
		this.sampleRate = sampleRate;
		this.duration = length / sampleRate;
		this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
	}

	getChannelData(channel: number): Float32Array {
		return this.channels[channel];
	}
}

class FakeAudioBufferSourceNode extends FakeAudioNode implements AudioBufferSourceNodeLike {
	buffer: AudioBufferLike | null = null;
	loop = false;
	playbackRate = new FakeAudioParam(1);
	started = false;
	stopped = false;
	startOffset = 0;

	start(_when = 0, offset = 0) {
		if (this.started) throw new Error('AudioBufferSourceNode cannot be started twice');
		this.started = true;
		this.startOffset = offset;
	}

	stop() {
		this.stopped = true;
	}
}

class FakeAnalyserNode extends FakeAudioNode implements AnalyserNodeLike {
	fftSize = 256;
	rmsSample = 0.12;

	getByteTimeDomainData(array: Uint8Array) {
		array.fill(128 + Math.round(this.rmsSample * 64));
	}

	getFloatTimeDomainData(array: Float32Array) {
		for (let i = 0; i < array.length; i++) {
			array[i] = Math.sin((2 * Math.PI * i) / 16) * this.rmsSample;
		}
	}
}

class FakeAudioContext implements AudioContextLike {
	currentTime = 0;
	sampleRate = 16000;
	state: 'suspended' | 'running' | 'closed' = 'suspended';
	destination = new FakeAudioNode();

	gains: FakeGainNode[] = [];
	oscillators: FakeOscillatorNode[] = [];
	mergers: FakeAudioNode[] = [];
	sources: FakeAudioBufferSourceNode[] = [];
	analysers: FakeAnalyserNode[] = [];

	resume = vi.fn(async () => {
		this.state = 'running';
	});
	suspend = vi.fn(async () => {
		this.state = 'suspended';
	});
	close = vi.fn(async () => {
		this.state = 'closed';
	});

	createGain() {
		const node = new FakeGainNode();
		this.gains.push(node);
		return node;
	}

	createOscillator() {
		const osc = new FakeOscillatorNode();
		this.oscillators.push(osc);
		return osc;
	}

	createChannelMerger() {
		const merger = new FakeAudioNode();
		this.mergers.push(merger);
		return merger;
	}

	createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
		return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
	}

	createBufferSource() {
		const src = new FakeAudioBufferSourceNode();
		this.sources.push(src);
		return src;
	}

	createAnalyser() {
		const analyser = new FakeAnalyserNode();
		this.analysers.push(analyser);
		return analyser;
	}

	decodeAudioData = vi.fn(async (_bytes: ArrayBuffer) => {
		return new FakeAudioBuffer(2, this.sampleRate * 2, this.sampleRate);
	});
}

/**
 * Sample-accurate stereo offline audio renderer for verifying exact left/right
 * oscillator frequencies, ChannelMergerNode routing, and timer fade automation.
 */
function renderOfflineGraphStereo(
	ctx: FakeAudioContext,
	durationSeconds: number
): [Float32Array, Float32Array] {
	const totalSamples = Math.round(durationSeconds * ctx.sampleRate);
	const outL = new Float32Array(totalSamples);
	const outR = new Float32Array(totalSamples);

	// Trace binaural merger path: osc -> earGain -> merger(input 0 or 1) -> binauralGain -> mixBus -> masterGain -> timerFadeGain -> destination
	const findTargetGain = (source: FakeAudioNode): FakeGainNode | null => {
		const conn = source.connections[0];
		return conn?.destination instanceof FakeGainNode ? conn.destination : null;
	};

	for (const osc of ctx.oscillators) {
		const earGain = findTargetGain(osc);
		if (!earGain) continue;
		const mergerConn = earGain.connections[0];
		if (!mergerConn) continue;
		const channelIndex = mergerConn.input ?? 0;
		const merger = mergerConn.destination as FakeAudioNode;
		const binauralGain = findTargetGain(merger);
		const mixBus = binauralGain ? findTargetGain(binauralGain) : null;
		const masterGain = mixBus ? findTargetGain(mixBus) : null;
		const timerFadeGain = masterGain ? findTargetGain(masterGain) : null;
		if (!binauralGain || !mixBus || !masterGain || !timerFadeGain) continue;

		const freq = osc.frequency.value;
		const targetArray = channelIndex === 0 ? outL : outR;
		for (let i = 0; i < totalSamples; i++) {
			const t = i / ctx.sampleRate;
			const g =
				earGain.gain.valueAt(t) *
				binauralGain.gain.valueAt(t) *
				mixBus.gain.valueAt(t) *
				masterGain.gain.valueAt(t) *
				timerFadeGain.gain.valueAt(t);
			targetArray[i] += Math.sin(2 * Math.PI * freq * t) * g;
		}
	}

	for (const src of ctx.sources) {
		if (!src.buffer) continue;
		const chGain = findTargetGain(src);
		const mixBus = chGain ? findTargetGain(chGain) : null;
		const masterGain = mixBus ? findTargetGain(mixBus) : null;
		const timerFadeGain = masterGain ? findTargetGain(masterGain) : null;
		if (!chGain || !mixBus || !masterGain || !timerFadeGain) continue;

		const bufL = src.buffer.getChannelData(0);
		const bufR = src.buffer.getChannelData(Math.min(1, src.buffer.numberOfChannels - 1));
		for (let i = 0; i < totalSamples; i++) {
			const t = i / ctx.sampleRate;
			const g =
				chGain.gain.valueAt(t) *
				mixBus.gain.valueAt(t) *
				masterGain.gain.valueAt(t) *
				timerFadeGain.gain.valueAt(t);
			const idx = i % bufL.length;
			outL[i] += bufL[idx] * g;
			outR[i] += bufR[idx] * g;
		}
	}

	return [outL, outR];
}

function goertzelMagnitude(samples: Float32Array, sampleRate: number, targetFreqHz: number): number {
	const N = samples.length;
	const k = Math.round((N * targetFreqHz) / sampleRate);
	const omega = (2 * Math.PI * k) / N;
	const coeff = 2 * Math.cos(omega);
	let s0 = 0;
	let s1 = 0;
	let s2 = 0;
	for (let i = 0; i < N; i++) {
		s0 = samples[i] + coeff * s1 - s2;
		s2 = s1;
		s1 = s0;
	}
	const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
	return Math.sqrt(Math.max(0, power)) / (N / 2);
}

describe('Binaural Acoustic Soundboard engine, synthesis, timer fade, and persistence', () => {
	let contexts: FakeAudioContext[];
	let fetchedUrls: string[];
	let currentNow: number;
	let state: SoundboardState;
	let engine: ReturnType<typeof createSoundboardEngine>;

	beforeEach(() => {
		vi.useFakeTimers();
		contexts = [];
		fetchedUrls = [];
		currentNow = 1_700_000_000_000;
		engine = createSoundboardEngine(
			(next) => {
				state = next;
			},
			{
				createContext: () => {
					const c = new FakeAudioContext();
					contexts.push(c);
					return c;
				},
				fetchAsset: async (url) => {
					fetchedUrls.push(url);
					return new ArrayBuffer(64);
				},
				now: () => currentNow
			}
		);
	});

	afterEach(() => {
		engine.destroy();
		vi.useRealTimers();
	});

	it('starts on Reading with playback stopped, binaural tones off, and creates no AudioContext before Play', () => {
		expect(contexts).toHaveLength(0);
		expect(fetchedUrls).toHaveLength(0);
		expect(state.status).toBe('stopped');
		expect(matchingStartingPresetId(state.mix)).toBe('reading');
		expect(state.mix.channels.rain.level).toBe(30);
		expect(state.mix.channels.fan.level).toBe(15);
		expect(state.mix.channels.city.level).toBe(0);
		expect(state.mix.channels.noise.level).toBe(10);
		expect(state.mix.channels.noise.muted).toBe(false);
		expect(state.mix.noiseColor).toBe('brown');
		expect(state.mix.channels.binaural.muted).toBe(true);
		expect(state.sleepEndsAt).toBeNull();
	});

	it('loads only needed recorded assets on Play, reuses decoded buffers on restart, and recreates one-use source nodes', async () => {
		await engine.play();
		expect(contexts).toHaveLength(1);
		expect(state.status).toBe('playing');
		// Reading uses Rain (30%) and leaves Distant city at 0%, so only rain-window.wav is fetched
		expect(fetchedUrls).toEqual(['/audio/binaural-acoustic-soundboard/rain-window.wav']);
		const firstSourceCount = contexts[0].sources.length;
		expect(firstSourceCount).toBeGreaterThan(0);

		engine.stop();
		expect(state.status).toBe('stopped');

		// Playing again reuses the decoded Rain buffer without another fetch, while creating fresh AudioBufferSourceNodes
		await engine.play();
		expect(state.status).toBe('playing');
		expect(fetchedUrls).toEqual(['/audio/binaural-acoustic-soundboard/rain-window.wav']);
		expect(contexts[0].sources.length).toBeGreaterThan(firstSourceCount);

		// Raising Distant city above 0% while playing loads distant-city.wav on demand
		engine.setChannelLevel('city', 25);
		await Promise.resolve();
		await Promise.resolve();
		expect(fetchedUrls).toEqual([
			'/audio/binaural-acoustic-soundboard/rain-window.wav',
			'/audio/binaural-acoustic-soundboard/distant-city.wav'
		]);
	});

	it('isolates a failed recording channel while keeping procedural and binaural channels playing', async () => {
		engine.destroy();
		let failRain = true;
		engine = createSoundboardEngine(
			(next) => {
				state = next;
			},
			{
				createContext: () => {
					const c = new FakeAudioContext();
					contexts.push(c);
					return c;
				},
				fetchAsset: async (url) => {
					if (url.includes('rain-window') && failRain) {
						throw new Error('Network timeout');
					}
					return new ArrayBuffer(64);
				},
				now: () => currentNow
			}
		);

		await engine.play();
		expect(state.status).toBe('playing');
		expect(state.unavailableChannels).toEqual(['rain']);
		expect(state.channelErrors.rain).toContain('Rain audio could not be loaded');
		expect(engine.getOutputLevel()).toBeGreaterThan(0);

		// Retrying after recovery clears the channel error and attaches the loop
		failRain = false;
		engine.retryChannel('rain');
		await Promise.resolve();
		await Promise.resolve();
		expect(state.unavailableChannels).toEqual([]);
		expect(state.channelErrors.rain).toBeUndefined();
	});

	it('retains previous channel level when muted and restores it on unmute', () => {
		expect(state.mix.channels.rain.level).toBe(30);
		expect(state.mix.channels.rain.muted).toBe(false);

		engine.setChannelMuted('rain', true);
		expect(state.mix.channels.rain.muted).toBe(true);
		expect(state.mix.channels.rain.level).toBe(30);
		expect(
			channelLinearGain('rain', state.mix.channels.rain.level, state.mix.channels.rain.muted)
		).toBe(0);

		engine.setChannelMuted('rain', false);
		expect(state.mix.channels.rain.muted).toBe(false);
		expect(state.mix.channels.rain.level).toBe(30);

		// Unmuting Binaural tones from initial Off (level 0, muted true) restores its saved 15% level
		expect(state.mix.channels.binaural.muted).toBe(true);
		expect(state.mix.channels.binaural.level).toBe(0);
		engine.setChannelMuted('binaural', false);
		expect(state.mix.channels.binaural.muted).toBe(false);
		expect(state.mix.channels.binaural.level).toBe(15);

		// Pure helper also preserves level across mute/unmute
		let mix = STARTING_PRESETS.work.mix;
		mix = toggleChannelMute(mix, 'fan');
		expect(mix.channels.fan.muted).toBe(true);
		expect(mix.channels.fan.level).toBe(20);
		mix = toggleChannelMute(mix, 'fan');
		expect(mix.channels.fan.muted).toBe(false);
		expect(mix.channels.fan.level).toBe(20);
		mix = updateChannelLevel(mix, 'fan', 45);
		expect(mix.channels.fan.level).toBe(45);
	});

	it('coordinates playback ownership with Calcutta Radio and article narration in both directions', async () => {
		const externalOwner = {};
		const externalStop = vi.fn(() => releasePlayback(externalOwner));
		claimPlayback(externalOwner, externalStop);

		await engine.play();
		expect(externalStop).toHaveBeenCalledOnce();
		expect(state.status).toBe('playing');

		engine.setSleep(30);
		expect(state.sleepEndsAt).not.toBeNull();

		// External player claiming ownership stops the soundboard and cancels its sleep timer
		claimPlayback(externalOwner, externalStop);
		expect(state.status).toBe('stopped');
		expect(state.sleepEndsAt).toBeNull();
		releasePlayback(externalOwner);
	});

	it('schedules a dedicated 10-second Web Audio timer fade that Master Volume changes cannot override, and reconciles expiry on visibility restoration', async () => {
		await engine.play();
		const ctx = contexts[0];
		// Gains created: 0=mixBus, 1=masterVolume, 2=timerFade
		const masterGain = ctx.gains[1];
		const timerFadeGain = ctx.gains[2];

		engine.setSleep(15);
		const expectedDeadline = currentNow + 15 * 60_000;
		expect(state.sleepEndsAt).toBe(expectedDeadline);

		// Changing presets, frequencies, or channels preserves the active deadline
		engine.setMix(STARTING_PRESETS.work.mix);
		engine.setBinauralDifferenceHz(6);
		engine.setChannelLevel('fan', 35);
		expect(state.sleepEndsAt).toBe(expectedDeadline);

		// Verify Web Audio automation scheduled on timerFadeGain: 1.0 until (900 - 10 = 890s), then linear ramp to 0 at 900s
		expect(timerFadeGain.gain.valueAt(100)).toBeCloseTo(1, 5);
		expect(timerFadeGain.gain.valueAt(890)).toBeCloseTo(1, 5);
		expect(timerFadeGain.gain.valueAt(895)).toBeCloseTo(0.5, 2);
		expect(timerFadeGain.gain.valueAt(900)).toBeCloseTo(0, 5);

		// Moving Master Volume during the fade modifies masterGain, never timerFadeGain
		ctx.currentTime = 895;
		engine.setMasterVolume(0.9);
		expect(masterGain.gain.value).toBeCloseTo(0.9, 5);
		expect(timerFadeGain.gain.valueAt(895)).toBeCloseTo(0.5, 2);

		// Replacing timer duration cancels obsolete automation and sets a new deadline
		currentNow += 14 * 60_000 + 55_000; // 5 seconds remaining
		engine.setSleep(30);
		expect(state.sleepEndsAt).toBe(currentNow + 30 * 60_000);
		expect(state.fadingOut).toBe(false);

		// Cancelling timer with Off restores timerFadeGain to 1
		engine.setSleep(0);
		expect(state.sleepEndsAt).toBeNull();

		// Re-arm 15 minutes and simulate browser suspension past the deadline
		engine.setSleep(15);
		currentNow += 16 * 60_000;
		engine.checkSleep();
		expect(timerFadeGain.gain.value).toBe(0);
		expect(state.status).toBe('stopped');
		expect(state.sleepEndsAt).toBeNull();
	});

	it('verifies generated binaural frequencies (2, 6, 10, 20, 40 Hz) and strict left/right stereo separation via audio rendering', () => {
		for (const preset of BINAURAL_PRESETS) {
			const freqs = resolveBinauralFrequencies(preset.differenceHz);
			expect(freqs.leftHz).toBe(BINAURAL_BASE_HZ);
			expect(freqs.rightHz).toBe(BINAURAL_BASE_HZ + preset.differenceHz);
			expect(freqs.presetId).toBe(preset.id);
		}

		// Render 1.0 second of Alpha (10 Hz difference: 220 Hz Left / 230 Hz Right) + procedural channels
		const offlineCtx = new FakeAudioContext();
		const testMix = structuredClone(STARTING_PRESETS.reading.mix);
		testMix.channels.binaural = { level: 80, muted: false, savedLevel: 80 };
		testMix.channels.fan = { level: 0, muted: true, savedLevel: 15 };
		testMix.channels.noise = { level: 0, muted: true, savedLevel: 10 };
		testMix.binauralDifferenceHz = 10;

		buildOfflineTestGraph(offlineCtx, testMix, {
			masterVolume: 1,
			durationSeconds: 1.0
		});

		const [leftChannel, rightChannel] = renderOfflineGraphStereo(offlineCtx, 1.0);

		const leftAt220 = goertzelMagnitude(leftChannel, offlineCtx.sampleRate, 220);
		const leftAt230 = goertzelMagnitude(leftChannel, offlineCtx.sampleRate, 230);
		const rightAt230 = goertzelMagnitude(rightChannel, offlineCtx.sampleRate, 230);
		const rightAt220 = goertzelMagnitude(rightChannel, offlineCtx.sampleRate, 220);
		// Check absence of amplitude-modulation sidebands (210 Hz / 240 Hz)
		const leftAt210 = goertzelMagnitude(leftChannel, offlineCtx.sampleRate, 210);

		expect(leftAt220).toBeGreaterThan(0.03);
		expect(leftAt230).toBeLessThan(1e-6);
		expect(rightAt230).toBeGreaterThan(0.03);
		expect(rightAt220).toBeLessThan(1e-6);
		expect(leftAt210).toBeLessThan(1e-6);
	});

	it('verifies seamless loop boundaries on shipped WAV assets and procedural buffers, and headroom at 100% across all channels', () => {
		expect(maxCombinedLinearGain()).toBeLessThan(0.95);

		const [brownL, brownR] = synthesizeProceduralNoiseChannels('brown', 16000, 3.0);
		const [pinkL] = synthesizeProceduralNoiseChannels('pink', 16000, 3.0);
		const [fanL] = synthesizeProceduralFanChannels(16000, 3.0);

		// Verify loop wrap continuity (difference between last and first sample is small and bounded)
		expect(Math.abs(brownL[0] - brownL[brownL.length - 1])).toBeLessThan(0.08);
		expect(Math.abs(brownR[0] - brownR[brownR.length - 1])).toBeLessThan(0.08);
		expect(Math.abs(pinkL[0] - pinkL[pinkL.length - 1])).toBeLessThan(0.15);
		expect(Math.abs(fanL[0] - fanL[fanL.length - 1])).toBeLessThan(0.08);

		// Verify shipped WAV files exist and have valid RIFF headers and smooth wrap-around
		for (const file of ['rain-window.wav', 'distant-city.wav']) {
			const fullPath = path.join(
				process.cwd(),
				'static',
				'audio',
				'binaural-acoustic-soundboard',
				file
			);
			expect(fs.existsSync(fullPath)).toBe(true);
			const buf = fs.readFileSync(fullPath);
			expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
			expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
			const firstLeft = buf.readInt16LE(44) / 32768;
			const lastLeft = buf.readInt16LE(buf.length - 4) / 32768;
			expect(Math.abs(firstLeft - lastLeft)).toBeLessThan(0.05);
		}
	});

	it('validates localStorage records, separates master volume from named mixes, strips active timers/playback, and handles blocked storage', () => {
		const rawCorrupt = JSON.stringify({
			version: 1,
			playing: true,
			sleepEndsAt: 9999999999999,
			master: { volume: 4.5, muted: 'invalid' },
			savedMixes: [
				{
					id: 'valid_1',
					name: '  Evening Rain   ',
					updatedAt: 12345,
					mix: {
						channels: {
							rain: { level: 140, muted: false, savedLevel: 140 },
							fan: { level: -20, muted: false, savedLevel: 15 },
							city: { level: 10, muted: true, savedLevel: 10 },
							noise: { level: 25, muted: false, savedLevel: 25 },
							binaural: { level: 20, muted: false, savedLevel: 20 }
						},
						noiseColor: 'pink',
						binauralDifferenceHz: 95
					}
				},
				{ id: 'bad id with spaces', name: 'Bad', mix: {} }
			]
		});

		const parsed = parseSoundboardStorage(rawCorrupt);
		expect(parsed.master.volume).toBe(1);
		expect(parsed.master.muted).toBe(false);
		expect(parsed.savedMixes).toHaveLength(1);
		expect(parsed.savedMixes[0].name).toBe('Evening Rain');
		expect(parsed.savedMixes[0].mix.channels.rain.level).toBe(100);
		expect(parsed.savedMixes[0].mix.channels.fan.level).toBe(0);
		expect(parsed.savedMixes[0].mix.binauralDifferenceHz).toBe(40);
		expect('playing' in (parsed as unknown as Record<string, unknown>)).toBe(false);
		expect('sleepEndsAt' in (parsed as unknown as Record<string, unknown>)).toBe(false);

		const memoryStore = new Map<string, string>();
		const mockStorage = {
			getItem: (k: string) => memoryStore.get(k) ?? null,
			setItem: (k: string, v: string) => {
				memoryStore.set(k, v);
			}
		};

		const entry = createSavedMix('Quiet Study', STARTING_PRESETS.reading.mix, 1000, 'mix_study');
		const ok = saveSoundboardStorage(
			{
				version: 1,
				master: { volume: 0.45, muted: false },
				savedMixes: [entry]
			},
			mockStorage
		);
		expect(ok).toBe(true);
		const loaded = loadSoundboardStorage(mockStorage);
		expect(loaded.available).toBe(true);
		expect(loaded.record.master.volume).toBe(0.45);
		expect(loaded.record.savedMixes[0].id).toBe('mix_study');

		// Blocked storage returns available: false without throwing
		const blockedStorage = {
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {
				throw new Error('QuotaExceededError');
			}
		};
		expect(loadSoundboardStorage(blockedStorage).available).toBe(false);
		expect(saveSoundboardStorage(loaded.record, blockedStorage)).toBe(false);
		expect(SOUNDBOARD_STORAGE_KEY).toBe('binaural-acoustic-soundboard:v1');
	});
});
