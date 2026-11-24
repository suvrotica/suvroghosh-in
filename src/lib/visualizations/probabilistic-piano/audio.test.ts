import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	buildSynthOfflineGraph,
	PianoAudio,
	PIANO_MASTER_GAIN,
	PIANO_MAX_NODE_VOICES,
	PIANO_PLAYABLE_VOICES,
	SUPERSAW_POLY_FALLBACK_THRESHOLD,
	SynthAudio,
	UNISON_PLAYABLE_NOTES
} from './audio';
import { FACTORY_PRESETS, validateSynthPatch } from './synth-patch';
import { claimPlayback, releasePlayback } from '$lib/components/blog/tts/playback';

function deferred() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

class FakeParam {
	value = 0;
	events: Array<{ kind: string; value: number; at: number }> = [];
	setValueAtTime = vi.fn<(value: number, at: number) => FakeParam>((value, at) => {
		this.value = value;
		this.events.push({ kind: 'setValueAtTime', value, at });
		return this;
	});
	linearRampToValueAtTime = vi.fn<(value: number, at: number) => FakeParam>((value, at) => {
		this.events.push({ kind: 'linearRampToValueAtTime', value, at });
		return this;
	});
	exponentialRampToValueAtTime = vi.fn<(value: number, at: number) => FakeParam>((value, at) => {
		this.events.push({ kind: 'exponentialRampToValueAtTime', value, at });
		return this;
	});
	setTargetAtTime = vi.fn<(value: number, at: number, constant: number) => FakeParam>(() => this);
	cancelScheduledValues = vi.fn<(at: number) => FakeParam>((at) => {
		this.events = this.events.filter((e) => e.at < at);
		return this;
	});
}

class FakeGain {
	gain = new FakeParam();
	connections: unknown[] = [];
	connect = vi.fn((dest: unknown) => {
		this.connections.push(dest);
		return dest;
	});
	disconnect = vi.fn();
}

class FakeOscillator {
	frequency = new FakeParam();
	detune = new FakeParam();
	type = 'sine';
	periodicWave: FakePeriodicWave | null = null;
	onended: (() => void) | null = null;
	stopAt = Infinity;
	stopCalled = false;
	ended = false;
	connections: unknown[] = [];
	connect = vi.fn((dest: unknown) => {
		this.connections.push(dest);
		return dest;
	});
	disconnect = vi.fn();
	setPeriodicWave = vi.fn((wave: FakePeriodicWave) => {
		this.periodicWave = wave;
	});
	start = vi.fn();
	stop = vi.fn((at = 0) => {
		if (this.stopCalled) {
			throw new DOMException('cannot call stop more than once', 'InvalidStateError');
		}
		this.stopCalled = true;
		if (!this.ended) this.stopAt = at;
	});
}

class FakeConstantSource {
	offset = new FakeParam();
	onended: (() => void) | null = null;
	stopAt = Infinity;
	stopCalled = false;
	ended = false;
	connections: unknown[] = [];
	connect = vi.fn((dest: unknown) => {
		this.connections.push(dest);
		return dest;
	});
	disconnect = vi.fn();
	start = vi.fn();
	stop = vi.fn((at = 0) => {
		if (this.stopCalled) {
			throw new DOMException('cannot call stop more than once', 'InvalidStateError');
		}
		this.stopCalled = true;
		if (!this.ended) this.stopAt = at;
	});
}

class FakeBufferSource {
	buffer: FakeAudioBuffer | null = null;
	loop = false;
	playbackRate = new FakeParam();
	onended: (() => void) | null = null;
	stopAt = Infinity;
	stopCalled = false;
	ended = false;
	connections: unknown[] = [];
	connect = vi.fn((dest: unknown) => {
		this.connections.push(dest);
		return dest;
	});
	disconnect = vi.fn();
	start = vi.fn();
	stop = vi.fn((at = 0) => {
		if (this.stopCalled) {
			throw new DOMException('cannot call stop more than once', 'InvalidStateError');
		}
		this.stopCalled = true;
		if (!this.ended) this.stopAt = at;
	});
}

class FakeBiquadFilter {
	type = 'lowpass';
	frequency = new FakeParam();
	detune = new FakeParam();
	Q = new FakeParam();
	gain = new FakeParam();
	connect = vi.fn((dest: unknown) => dest);
	disconnect = vi.fn();
}

class FakeWaveShaper {
	curve: Float32Array | null = null;
	oversample = 'none';
	connect = vi.fn((dest: unknown) => dest);
	disconnect = vi.fn();
}

class FakeDelay {
	delayTime = new FakeParam();
	connect = vi.fn((dest: unknown) => dest);
	disconnect = vi.fn();
}

class FakeConvolver {
	buffer: FakeAudioBuffer | null = null;
	normalize = true;
	connect = vi.fn((dest: unknown) => dest);
	disconnect = vi.fn();
}

class FakeDynamicsCompressor {
	threshold = new FakeParam();
	knee = new FakeParam();
	ratio = new FakeParam();
	attack = new FakeParam();
	release = new FakeParam();
	connect = vi.fn((dest: unknown) => dest);
	disconnect = vi.fn();
}

class FakeAnalyser {
	fftSize = 2048;
	smoothingTimeConstant = 0.8;
	getFloatTimeDomainData = vi.fn((arr: Float32Array) => {
		arr.fill(0.25);
	});
	getByteTimeDomainData = vi.fn((arr: Uint8Array) => {
		arr.fill(129);
	});
	getByteFrequencyData = vi.fn((arr: Uint8Array) => {
		arr.fill(64);
	});
	connect = vi.fn((dest: unknown) => dest);
	disconnect = vi.fn();
}

class FakeStereoPanner {
	pan = new FakeParam();
	connect = vi.fn((dest: unknown) => dest);
	disconnect = vi.fn();
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
	getChannelData(channel: number): Float32Array {
		return this.channels[channel];
	}
}

class FakePeriodicWave {
	constructor(
		readonly real: Float32Array,
		readonly imag: Float32Array
	) {}
}

/** Clock-controlled sources let ownership tests exercise natural decay and rescheduled release. */
class FakeContext {
	state: AudioContextState = 'suspended';
	currentTime = 8;
	sampleRate = 48_000;
	destination = {};
	gains: FakeGain[] = [];
	sources: FakeOscillator[] = [];
	constantSources: FakeConstantSource[] = [];
	bufferSources: FakeBufferSource[] = [];
	filters: FakeBiquadFilter[] = [];
	waveShapers: FakeWaveShaper[] = [];
	delays: FakeDelay[] = [];
	convolvers: FakeConvolver[] = [];
	compressors: FakeDynamicsCompressor[] = [];
	analysers: FakeAnalyser[] = [];
	panners: FakeStereoPanner[] = [];
	buffers: FakeAudioBuffer[] = [];
	periodicWaves: FakePeriodicWave[] = [];
	resumes: ReturnType<typeof deferred>[] = [];
	resume = vi.fn(() => {
		const request = deferred();
		this.resumes.push(request);
		return request.promise;
	});
	close = vi.fn(async () => {
		this.state = 'closed';
	});
	createGain = vi.fn(() => {
		const gain = new FakeGain();
		this.gains.push(gain);
		return gain;
	});
	createOscillator = vi.fn(() => {
		const oscillator = new FakeOscillator();
		this.sources.push(oscillator);
		return oscillator;
	});
	createConstantSource = vi.fn(() => {
		const constant = new FakeConstantSource();
		this.constantSources.push(constant);
		return constant;
	});
	createBufferSource = vi.fn(() => {
		const bufSrc = new FakeBufferSource();
		this.bufferSources.push(bufSrc);
		return bufSrc;
	});
	createBiquadFilter = vi.fn(() => {
		const filter = new FakeBiquadFilter();
		this.filters.push(filter);
		return filter;
	});
	createWaveShaper = vi.fn(() => {
		const shaper = new FakeWaveShaper();
		this.waveShapers.push(shaper);
		return shaper;
	});
	createDelay = vi.fn(() => {
		const delay = new FakeDelay();
		this.delays.push(delay);
		return delay;
	});
	createConvolver = vi.fn(() => {
		const convolver = new FakeConvolver();
		this.convolvers.push(convolver);
		return convolver;
	});
	createDynamicsCompressor = vi.fn(() => {
		const comp = new FakeDynamicsCompressor();
		this.compressors.push(comp);
		return comp;
	});
	createAnalyser = vi.fn(() => {
		const analyser = new FakeAnalyser();
		this.analysers.push(analyser);
		return analyser;
	});
	createStereoPanner = vi.fn(() => {
		const panner = new FakeStereoPanner();
		this.panners.push(panner);
		return panner;
	});
	createBuffer = vi.fn((channels: number, length: number, sampleRate: number) => {
		const buf = new FakeAudioBuffer(channels, length, sampleRate);
		this.buffers.push(buf);
		return buf;
	});
	createPeriodicWave = vi.fn((real: Float32Array, imag: Float32Array) => {
		const wave = new FakePeriodicWave(real, imag);
		this.periodicWaves.push(wave);
		return wave;
	});
	advance(seconds: number): void {
		const startTime = this.currentTime;
		const targetTime = startTime + seconds;
		const steps = seconds <= 0 ? 1 : Math.min(1200, Math.max(1, Math.ceil(seconds / 0.005)));
		const dt = seconds / steps;
		for (let s = 1; s <= steps; s++) {
			this.currentTime = s === steps ? targetTime : startTime + dt * s;
			vi.advanceTimersByTime(dt * 1000);
			for (const source of this.sources) {
				if (!source.ended && source.stopAt <= this.currentTime) {
					source.ended = true;
					source.onended?.();
				}
			}
			for (const constant of this.constantSources) {
				if (!constant.ended && constant.stopAt <= this.currentTime) {
					constant.ended = true;
					constant.onended?.();
				}
			}
			for (const bufSrc of this.bufferSources) {
				if (!bufSrc.ended && bufSrc.stopAt <= this.currentTime) {
					bufSrc.ended = true;
					bufSrc.onended?.();
				}
			}
		}
	}
	resolveResume(index = 0): void {
		this.state = 'running';
		this.resumes[index].resolve();
	}
}

function instrument(
	options: { patch?: (typeof FACTORY_PRESETS)[number]; onExternalStop?: () => void } = {}
) {
	const context = new FakeContext();
	const factory = vi.fn(() => context as unknown as AudioContext);
	return {
		context,
		factory,
		audio: new SynthAudio({
			contextFactory: factory,
			patch: options.patch,
			onExternalStop: options.onExternalStop
		})
	};
}

async function enabledInstrument(
	options: { patch?: (typeof FACTORY_PRESETS)[number]; onExternalStop?: () => void } = {}
) {
	const setup = instrument(options);
	const enabling = setup.audio.enable();
	setup.context.resolveResume();
	await enabling;
	return setup;
}

describe('piano and synth audio activation and resource ownership', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});
	it('preserves PianoAudio backward-compatible alias and SSR-inert construction', async () => {
		expect(PianoAudio).toBe(SynthAudio);
		const { audio, context, factory } = instrument();
		audio.setVolume(0.2);
		audio.setMuted(false);
		audio.setSustain(true);
		expect(audio.noteOn(60)).toBe('');
		expect(audio.context).toBeNull();
		expect(factory).not.toHaveBeenCalled();
		const enabling = audio.enable();
		expect(factory).toHaveBeenCalledOnce();
		expect(context.resume).toHaveBeenCalledOnce();
		expect(audio.ready).toBe(false);
		expect(audio.context).toBe(context);
		context.resolveResume();
		await enabling;
		expect(audio.ready).toBe(true);
		await audio.enable();
		expect(factory).toHaveBeenCalledOnce();
		audio.dispose();
	});

	it('does not resurrect sound when Stop all sound invalidates a pending unlock', async () => {
		const { audio, context } = instrument();
		const enabling = audio.enable();
		audio.stopAll();
		context.resolveResume();
		await enabling;
		expect(audio.ready).toBe(false);
		expect(audio.noteOn(60)).toBe('');
		expect(context.sources).toHaveLength(0);
		audio.dispose();
	});

	it('closes and cannot recreate audio when navigation disposes a pending unlock', async () => {
		const { audio, context, factory } = instrument();
		const enabling = audio.enable();
		audio.dispose();
		context.resumes[0].resolve();
		await enabling;
		expect(audio.ready).toBe(false);
		await expect(audio.enable()).rejects.toThrow(/disposed/);
		expect(factory).toHaveBeenCalledOnce();
		expect(context.close).toHaveBeenCalledOnce();
		expect(context.sources).toHaveLength(0);
	});

	it('handles denied startup and out-of-order retries without losing a successful newer attempt', async () => {
		const { audio, context, factory } = instrument();
		const older = audio.enable();
		const newer = audio.enable();
		context.resolveResume(1);
		await newer;
		context.resumes[0].reject(new Error('older gesture denied'));
		await older;
		expect(audio.ready).toBe(true);
		expect(factory).toHaveBeenCalledOnce();
		audio.dispose();
		const retry = instrument();
		const denied = retry.audio.enable();
		retry.context.resumes[0].reject(new Error('gesture denied'));
		await expect(denied).rejects.toThrow(/denied/);
		expect(retry.audio.ready).toBe(false);
		const reenabled = retry.audio.enable();
		retry.context.resolveResume(1);
		await reenabled;
		expect(retry.audio.ready).toBe(true);
		retry.audio.dispose();
	});

	it('schedules pitch and envelopes against the audio clock and bounds gain settings on Preset 01', async () => {
		const { audio, context } = await enabledInstrument();
		const gainsBefore = context.gains.length;
		const id = audio.noteOn(69, 0.8);
		expect(id).not.toBe('');
		expect(context.sources).toHaveLength(5);
		expect(context.sources[0].frequency.setValueAtTime).toHaveBeenCalledWith(440, 8);
		for (const source of context.sources) {
			expect(source.start).toHaveBeenCalledWith(8);
			expect(source.stopAt).toBeGreaterThan(8);
		}
		const partialGains = context.gains
			.slice(gainsBefore)
			.filter((g) => g.gain.linearRampToValueAtTime.mock.calls.length > 0);
		expect(partialGains).toHaveLength(5);
		for (const gain of partialGains) {
			expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 8);
			expect(gain.gain.linearRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(8.006);
		}
		audio.setVolume(100);
		expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(
			PIANO_MASTER_GAIN,
			8,
			0.012
		);
		audio.setMuted(true);
		audio.setVolume(0.7);
		expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 8, 0.012);
		audio.setMuted(false);
		expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(
			0.7 * PIANO_MASTER_GAIN,
			8,
			0.012
		);
		audio.setVolume(NaN);
		expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 8, 0.012);
		for (const pitch of [NaN, Infinity, 60.5, -1, 128]) expect(audio.noteOn(pitch)).toBe('');
		expect(audio.noteOn(60, 0)).toBe('');
		expect(context.sources).toHaveLength(5);
		audio.dispose();
	});

	it('owns same-pitch notes separately and sustains released inputs until pedal-up', async () => {
		const { audio, context } = await enabledInstrument();
		const first = audio.noteOn(60);
		const second = audio.noteOn(60);
		expect(first).not.toBe(second);
		audio.noteOff(first);
		expect(audio.hasVoice(first)).toBe(false);
		expect(audio.hasVoice(second)).toBe(true);
		context.advance(0.2);
		expect(audio.activeCount).toBe(1);
		audio.setSustain(true);
		audio.noteOff(second);
		context.advance(0.2);
		expect(audio.hasVoice(second)).toBe(true);
		audio.setSustain(false);
		expect(audio.hasVoice(second)).toBe(false);
		context.advance(0.2);
		expect(audio.activeCount).toBe(0);
		expect(context.sources.every((source) => source.disconnect.mock.calls.length === 1)).toBe(true);
		audio.dispose();
	});

	it.each([32_000, 44_100, 48_000])(
		'plays every A0–C8 fundamental with bounded, below-Nyquist partials at %i Hz',
		async (sampleRate) => {
			const { audio, context } = await enabledInstrument();
			context.sampleRate = sampleRate;
			for (let pitch = 21; pitch <= 108; pitch++) {
				const firstSource = context.sources.length;
				const id = audio.noteOn(pitch, 0.7);
				expect(id).not.toBe('');
				expect(audio.activeCount).toBe(1);
				const partials = context.sources.slice(firstSource);
				expect(partials.length).toBeGreaterThanOrEqual(1);
				expect(partials.length).toBeLessThanOrEqual(5);
				expect(partials[0].frequency.setValueAtTime.mock.calls[0][0]).toBeCloseTo(
					440 * 2 ** ((pitch - 69) / 12),
					10
				);
				for (const partial of partials) {
					expect(partial.frequency.setValueAtTime.mock.calls[0][0]).toBeLessThan(sampleRate * 0.46);
				}
				audio.noteOff(id);
				context.advance(0.2);
				expect(audio.activeCount).toBe(0);
			}
			expect(context.sources.every((source) => source.disconnect.mock.calls.length === 1)).toBe(
				true
			);
			audio.dispose();
		}
	);

	it('gives bass more decay and treble a softer overtone balance without changing the attack', async () => {
		const { audio, context } = await enabledInstrument();
		const bassGainStart = context.gains.length;
		audio.noteOn(21, 0.8);
		const bassSources = [...context.sources];
		const bassPartialGains = context.gains
			.slice(bassGainStart)
			.filter((g) => g.gain.linearRampToValueAtTime.mock.calls.length > 0);
		const bassOvertone = bassPartialGains[1].gain.linearRampToValueAtTime.mock.calls[0][0];

		const trebleGainStart = context.gains.length;
		audio.noteOn(108, 0.8);
		const trebleSources = context.sources.slice(bassSources.length);
		const treblePartialGains = context.gains
			.slice(trebleGainStart)
			.filter((g) => g.gain.linearRampToValueAtTime.mock.calls.length > 0);
		const trebleOvertone = treblePartialGains[1].gain.linearRampToValueAtTime.mock.calls[0][0];

		expect(bassSources[0].frequency.setValueAtTime).toHaveBeenCalledWith(27.5, 8);
		expect(
			bassPartialGains[0].gain.exponentialRampToValueAtTime.mock.calls.at(-1)?.[1]
		).toBeCloseTo(8 + 5.4, 12);
		expect(
			treblePartialGains[0].gain.exponentialRampToValueAtTime.mock.calls.at(-1)?.[1]
		).toBeCloseTo(8 + 2.4, 12);
		expect(trebleSources).toHaveLength(4);
		expect(trebleOvertone).toBeCloseTo(bassOvertone * 0.6, 12);
		for (const gain of [bassPartialGains[0], treblePartialGains[0]])
			expect(gain.gain.linearRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(8.006, 12);
		context.advance(2.5);
		expect(trebleSources[0].ended).toBe(true);
		expect(trebleSources[0].stopAt).toBeGreaterThanOrEqual(8 + 2.4 + 0.025);
		expect(bassSources[0].ended).toBe(false);
		context.advance(3.0);
		expect(bassSources[0].ended).toBe(true);
		expect(bassSources[0].stopAt).toBeGreaterThanOrEqual(8 + 5.4 + 0.025);
		expect(audio.activeCount).toBe(0);
		audio.dispose();
	});

	it('returns a silent result and cleans its output if the device cannot represent a fundamental', async () => {
		const { audio, context } = await enabledInstrument();
		context.sampleRate = 8_000;
		const gainsBefore = context.gains.length;
		expect(audio.noteOn(108)).toBe('');
		expect(audio.activeCount).toBe(0);
		expect(context.sources).toHaveLength(0);
		expect(context.gains.length).toBeGreaterThan(gainsBefore);
		for (const g of context.gains.slice(gainsBefore)) {
			expect(g.disconnect).toHaveBeenCalledOnce();
		}
		audio.dispose();
	});

	it('reclaims releasing tails before dropping notes and caps node voices under a pathological burst', async () => {
		const { audio, context } = await enabledInstrument();
		const ids = Array.from({ length: PIANO_MAX_NODE_VOICES + 500 }, () => audio.noteOn(60));
		expect(ids.filter(Boolean)).toHaveLength(PIANO_MAX_NODE_VOICES + 500);
		expect(audio.activeCount).toBe(PIANO_MAX_NODE_VOICES);
		expect(ids.filter((id) => audio.hasVoice(id))).toHaveLength(PIANO_PLAYABLE_VOICES);
		expect(audio.hasVoice(ids[0])).toBe(false);
		context.advance(0);
		expect(context.sources.filter((source) => !source.ended)).toHaveLength(
			PIANO_MAX_NODE_VOICES * 5
		);
		context.advance(0.025);
		expect(audio.activeCount).toBe(PIANO_PLAYABLE_VOICES);
		expect(audio.noteOn(62)).not.toBe('');
		audio.stopAll();
		context.advance(0.025);
		expect(audio.activeCount).toBe(0);
		expect(audio.ready).toBe(true);
		audio.dispose();
	});

	it('steals oldest released tail first when 20 notes are held and 4 tails are retiring', async () => {
		const { audio, context } = await enabledInstrument();
		const heldIds: string[] = [];
		for (let i = 0; i < PIANO_PLAYABLE_VOICES; i++) {
			heldIds.push(audio.noteOn(48 + i));
		}
		const tailIds: string[] = [];
		for (let i = 0; i < 4; i++) {
			const tail = audio.noteOn(72 + i);
			tailIds.push(tail);
			audio.noteOff(tail);
		}
		expect(audio.activeCount).toBe(PIANO_MAX_NODE_VOICES);

		// 25th note must succeed by reclaiming oldest released tail, NOT dropping or stealing held notes
		const extra = audio.noteOn(80);
		expect(extra).not.toBe('');
		expect(audio.activeCount).toBe(PIANO_MAX_NODE_VOICES);
		expect(audio.hasVoice(extra)).toBe(true);
		expect(heldIds.filter((id) => audio.hasVoice(id)).length).toBeGreaterThanOrEqual(
			PIANO_PLAYABLE_VOICES - 1
		);
		context.advance(0.2);
		audio.dispose();
	});

	it('schedules floor-clamped exponential release curves and cancels future notes on Stop', async () => {
		const { audio, context } = await enabledInstrument();
		expect(audio.currentTime).toBe(8);
		const gainsBefore = context.gains.length;
		const scheduled = audio.scheduleNote(60, 0.4, 8.12, 0.5);
		expect(scheduled).not.toBe('');
		for (const source of context.sources) {
			expect(source.start).toHaveBeenCalledWith(8.12);
		}
		const ampVca = context.gains
			.slice(gainsBefore)
			.find((g) => g.gain.exponentialRampToValueAtTime.mock.calls.length > 0);
		expect(ampVca).toBeDefined();
		expect(ampVca!.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
			0.0001,
			8.12 + 0.5 + 0.15
		);
		expect(ampVca!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 8.12 + 0.5 + 0.15 + 0.002);

		audio.stopAll();
		expect(audio.activeCount).toBe(0);
		expect(context.sources.every((source) => source.stopAt === 0 && source.stopCalled)).toBe(true);
		expect(audio.hasVoice(scheduled)).toBe(false);

		const sourcesBeforeBounded = context.sources.length;
		const bounded = audio.scheduleNote(62, 0.4, 99_999, 99_999);
		expect(bounded).not.toBe('');
		expect(context.sources[sourcesBeforeBounded].start).toHaveBeenCalledWith(8.25);
		expect(audio.scheduleNote(60, 0.4, NaN, 0.5)).toBe('');
		expect(audio.scheduleNote(60, 0.4, 8, Infinity)).toBe('');
		audio.stopAll();

		const naturalStartCount = context.sources.length;
		const natural = audio.scheduleNote(64, 0.4, 8.05, 0.2);
		expect(natural).not.toBe('');
		context.advance(0.41);
		expect(audio.activeCount).toBe(0);
		for (const source of context.sources.slice(naturalStartCount)) {
			expect(source.ended).toBe(true);
			expect(source.stopAt).toBeGreaterThanOrEqual(8.402);
		}
		audio.dispose();
	});

	it('naturally cleans held or pedal-held notes and closes all remaining resources exactly once', async () => {
		const { audio, context } = await enabledInstrument();
		audio.setSustain(true);
		const note = audio.noteOn(48);
		audio.noteOff(note);
		context.advance(6);
		expect(audio.activeCount).toBe(0);
		audio.noteOn(72);
		audio.dispose();
		audio.dispose();
		expect(audio.activeCount).toBe(0);
		expect(context.close).toHaveBeenCalledOnce();
		for (const source of context.sources) {
			expect(source.onended).toBeNull();
			expect(source.disconnect).toHaveBeenCalledOnce();
		}
		for (const gain of context.gains) expect(gain.disconnect).toHaveBeenCalledOnce();
	});
});

describe('synth DSP engines, voice modes, mod matrix, FX bus, and offline graph', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});
	it('guards releaseVoice against double noteOff re-entry', async () => {
		const patch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { ...FACTORY_PRESETS[0].osc1, wave: 'saw' }
		});
		const { audio, context } = await enabledInstrument({ patch });
		const gainsBefore = context.gains.length;
		const id = audio.noteOn(60, 0.8);
		const vca = context.gains
			.slice(gainsBefore)
			.find((g) => g.gain.exponentialRampToValueAtTime.mock.calls.length > 0)!;
		const callsBeforeOff = vca.gain.exponentialRampToValueAtTime.mock.calls.length;
		audio.noteOff(id);
		const callsAfterFirst = vca.gain.exponentialRampToValueAtTime.mock.calls.length;
		expect(callsAfterFirst).toBe(callsBeforeOff + 1);
		audio.noteOff(id);
		expect(vca.gain.exponentialRampToValueAtTime.mock.calls.length).toBe(callsAfterFirst);
		audio.dispose();
	});

	it('supports all Osc 1 waveforms including PWM, carrier-scaled 2-Op FM, Harmonic, and Supersaw fallback', async () => {
		// PWM
		const pwmPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'pwm', oct: 0, semi: 0, fine: 0, shape: 0.7, fmRatio: 1 }
		});
		const pwmSetup = await enabledInstrument({ patch: pwmPatch });
		const constantsBeforePwm = pwmSetup.context.constantSources.length;
		pwmSetup.audio.noteOn(60, 0.8);
		expect(pwmSetup.context.sources[0].type).toBe('triangle');
		expect(pwmSetup.context.constantSources.length).toBe(constantsBeforePwm + 1);
		expect(pwmSetup.context.filters.some((f) => f.type === 'highpass')).toBe(true);
		pwmSetup.audio.dispose();

		// 2-Op FM (carrier-scaled index)
		const fmPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'fm', oct: 0, semi: 0, fine: 0, shape: 0.5, fmRatio: 2 }
		});
		const fmSetup = await enabledInstrument({ patch: fmPatch });
		const fmGainsBefore = fmSetup.context.gains.length;
		fmSetup.audio.noteOn(69, 0.8); // 440 Hz
		expect(fmSetup.context.sources).toHaveLength(2);
		expect(fmSetup.context.sources[0].frequency.setValueAtTime).toHaveBeenCalledWith(440, 8);
		expect(fmSetup.context.sources[1].frequency.setValueAtTime).toHaveBeenCalledWith(880, 8);
		const fmGain = fmSetup.context.gains
			.slice(fmGainsBefore)
			.find((g) => Math.abs(g.gain.value - 0.5 * 5 * 440) < 1e-6);
		expect(fmGain).toBeDefined();
		fmSetup.audio.dispose();

		// Harmonic PeriodicWave
		const harmPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'harmonic', oct: 0, semi: 0, fine: 0, shape: 0.6, fmRatio: 1 }
		});
		const harmSetup = await enabledInstrument({ patch: harmPatch });
		harmSetup.audio.noteOn(60, 0.8);
		expect(harmSetup.context.periodicWaves).toHaveLength(1);
		expect(harmSetup.context.sources[0].setPeriodicWave).toHaveBeenCalledOnce();
		harmSetup.audio.dispose();

		// Supersaw 3-osc -> 1-osc fallback above threshold (8)
		const sawPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'supersaw', oct: 0, semi: 0, fine: 0, shape: 0.5, fmRatio: 1 }
		});
		const sawSetup = await enabledInstrument({ patch: sawPatch });
		for (let i = 0; i < SUPERSAW_POLY_FALLBACK_THRESHOLD; i++) {
			const before = sawSetup.context.sources.length;
			sawSetup.audio.noteOn(48 + i, 0.8);
			expect(sawSetup.context.sources.length - before).toBe(3);
		}
		const beforeFallback = sawSetup.context.sources.length;
		sawSetup.audio.noteOn(72, 0.8);
		expect(sawSetup.context.sources.length - beforeFallback).toBe(1);
		sawSetup.audio.dispose();
	});

	it('supports Osc 2 Ring Mod, Sub Osc, and lazy deterministic White/Pink Noise', async () => {
		const noNoisePatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			osc2: { wave: 'sine', oct: 1, semi: 0, fine: 0, shape: 0.5, ringMod: true },
			sub: { oct: -2, wave: 'square' },
			noise: { type: 'pink' },
			mix: { osc1: 0.8, osc2: 0.5, sub: 0.4, noise: 0 }
		});
		const setup = await enabledInstrument({ patch: noNoisePatch });
		setup.audio.noteOn(60, 0.8);
		// Osc1 (1) + Osc2 (1) + Sub (1) = 3 oscillators, 0 bufferSources because mix.noise === 0
		expect(setup.context.sources).toHaveLength(3);
		expect(setup.context.bufferSources).toHaveLength(0);

		const withNoise = validateSynthPatch({
			...noNoisePatch,
			mix: { osc1: 0.8, osc2: 0.5, sub: 0.4, noise: 0.3 }
		});
		setup.audio.setPatch(withNoise);
		setup.audio.noteOn(64, 0.8);
		expect(setup.context.bufferSources).toHaveLength(1);
		expect(setup.context.bufferSources[0].loop).toBe(true);
		setup.audio.dispose();
	});

	it('implements mono, legato glide, and unison (6-note cap) voice modes cleanly', async () => {
		// Mono
		const monoPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			voiceMode: 'mono'
		});
		const monoSetup = await enabledInstrument({ patch: monoPatch });
		const m1 = monoSetup.audio.noteOn(60, 0.8);
		const m2 = monoSetup.audio.noteOn(64, 0.8);
		expect(monoSetup.audio.hasVoice(m1)).toBe(false);
		expect(monoSetup.audio.hasVoice(m2)).toBe(true);
		monoSetup.audio.dispose();

		// Legato: glides existing voice without spawning extra oscillators or retriggering ADSR
		const legatoPatch = validateSynthPatch({
			...monoPatch,
			voiceMode: 'legato',
			glideMs: 80
		});
		const legSetup = await enabledInstrument({ patch: legatoPatch });
		const l1 = legSetup.audio.noteOn(60, 0.8);
		const oscCountAfterFirst = legSetup.context.sources.length;
		const l2 = legSetup.audio.noteOn(67, 0.8);
		expect(l2).not.toBe(l1);
		expect(legSetup.context.sources.length).toBe(oscCountAfterFirst);
		expect(legSetup.context.sources[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalled();
		expect(legSetup.audio.hasVoice(l1)).toBe(false);
		expect(legSetup.audio.hasVoice(l2)).toBe(true);
		legSetup.audio.noteOff(l1); // lifting first key must NOT release legato voice
		expect(legSetup.audio.hasVoice(l2)).toBe(true);
		legSetup.audio.noteOff(l2);
		expect(legSetup.audio.hasVoice(l2)).toBe(false);
		legSetup.audio.dispose();

		// Unison: 3 voices per note, capped at 6 playable notes
		const uniPatch = validateSynthPatch({
			...monoPatch,
			voiceMode: 'unison',
			unisonVoices: 3,
			unisonSpreadCt: 24
		});
		const uniSetup = await enabledInstrument({ patch: uniPatch });
		const uniIds: string[] = [];
		for (let i = 0; i < UNISON_PLAYABLE_NOTES + 2; i++) {
			uniIds.push(uniSetup.audio.noteOn(48 + i, 0.8));
		}
		expect(uniIds.filter((id) => uniSetup.audio.hasVoice(id))).toHaveLength(UNISON_PLAYABLE_NOTES);
		expect(uniSetup.audio.activeCount).toBeLessThanOrEqual(8); // 6*3=18 + up to 2 tails*3=24
		uniSetup.audio.dispose();
	});

	it('enforces lazy LFO 1/2 and Chorus LFO lifecycle so stopped synth has zero live oscillators', async () => {
		const modPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			lfo1: { wave: 'sine', rateHz: 4, syncDiv: '1/4', depth: 0.6, bpmSync: false, keySync: false },
			lfo2: { wave: 'sh', rateHz: 6, syncDiv: '1/8', depth: 0.5, bpmSync: true, keySync: false },
			modMatrix: [
				[0.3, 0, 0.4, 0, 0],
				[0, 0, 0.25, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0]
			],
			fx: {
				...FACTORY_PRESETS[0].fx,
				chorus: { bypass: false, rateHz: 1.2, depth: 0.5, mix: 0.4 },
				crush: { bypass: false, drive: 0.4, bitDepth: 6, toneHz: 4000, mix: 0.5 },
				delay: {
					bypass: false,
					timeMs: 300,
					bpmSync: false,
					syncDiv: '1/8d',
					feedback: 0.5,
					toneHz: 5000,
					mix: 0.3
				},
				reverb: { room: 'hall', mix: 0.4 }
			}
		});
		const setup = await enabledInstrument({ patch: modPatch });
		// Before any note is played, lazy LFOs and Chorus LFO must NOT be started!
		expect(setup.context.sources).toHaveLength(0);
		expect(setup.context.convolvers[0].buffer).not.toBeNull();
		expect(setup.context.compressors[0].threshold.value).toBe(-3);
		expect(setup.context.compressors[0].ratio.value).toBe(12);
		expect(setup.context.analysers[0].fftSize).toBe(2048);

		setup.audio.noteOn(60, 0.8);
		// Osc1 (1) + LFO1 (1) + Chorus LFO (1) = 3 oscillators, plus 1 bufferSource for LFO2 S&H
		expect(setup.context.sources).toHaveLength(3);
		expect(setup.context.bufferSources).toHaveLength(1);

		// Analyser readout works when ready
		const td = new Float32Array(2048);
		const freq = new Uint8Array(1024);
		expect(setup.audio.getAnalyserData(td, freq)).toBe(true);
		expect(td[0]).toBe(0.25);
		expect(freq[0]).toBe(64);

		setup.audio.setPitchBend(0.5);
		setup.audio.setModWheel(0.75);
		expect(setup.context.constantSources[0].offset.setValueAtTime).toHaveBeenCalledWith(100, 8);
		expect(setup.context.constantSources[1].offset.setValueAtTime).toHaveBeenCalledWith(0.75, 8);

		// Stop all stops voice AND lazy LFO/Chorus oscillators cleanly
		setup.audio.stopAll();
		setup.context.advance(0.025);
		expect(setup.context.sources.every((s) => s.ended)).toBe(true);
		expect(setup.context.bufferSources.every((s) => s.ended)).toBe(true);
		setup.audio.dispose();
	});

	it('never mutates frozen FACTORY_PRESETS and coordinates claimPlayback/releasePlayback', async () => {
		const externalStop = vi.fn();
		const setup = await enabledInstrument({
			patch: FACTORY_PRESETS[1],
			onExternalStop: externalStop
		});
		expect(() => setup.audio.setPatch(FACTORY_PRESETS[2])).not.toThrow();
		expect(Object.isFrozen(FACTORY_PRESETS[1])).toBe(true);
		expect(Object.isFrozen(FACTORY_PRESETS[2].modMatrix)).toBe(true);

		const id = setup.audio.noteOn(60, 0.8);
		expect(id).not.toBe('');

		// Another audio player (e.g. TTS) claims playback -> invokes our stopAll + onExternalStop
		const ttsOwner = {};
		const ttsStop = vi.fn();
		claimPlayback(ttsOwner, ttsStop);
		expect(externalStop).toHaveBeenCalledOnce();
		expect(setup.audio.hasVoice(id)).toBe(false);
		setup.context.advance(0.025);
		expect(setup.audio.activeCount).toBe(0);

		// Playing another note reclaims playback from TTS
		setup.audio.noteOn(64, 0.8);
		expect(ttsStop).toHaveBeenCalledOnce();

		// stopAll & dispose release ownership cleanly
		setup.audio.stopAll();
		setup.audio.dispose();
		releasePlayback(ttsOwner);
	});

	it('builds an OfflineAudioContext graph honoring explicit future timestamps even while suspended', () => {
		const context = new FakeContext();
		context.state = 'suspended';
		context.currentTime = 0;

		const graph = buildSynthOfflineGraph(context as unknown as BaseAudioContext, {
			patch: FACTORY_PRESETS[2],
			volume: 0.8
		});

		const v1 = graph.noteOn(60, 0.9, 0.25);
		expect(v1).not.toBe('');
		expect(graph.activeCount).toBe(1);
		expect(context.sources[0].start).toHaveBeenCalledWith(0.25);

		graph.setPitchBend(-0.5, 0.4);
		graph.setModWheel(0.8, 0.45);
		graph.noteOff(v1, 0.75);

		// Even though currentTime === 0 and state === 'suspended', noteOff must schedule release, NOT drop the voice
		expect(context.sources[0].stopAt).toBeGreaterThan(0.75);
		graph.dispose();
		expect(graph.activeCount).toBe(0);
	});

	it('supports lp12/bp12/hp12 filters, key tracking, Filter Env, 5x5 Mod Matrix, and clamped delay feedback', async () => {
		const fxPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'pwm', oct: 0, semi: 0, fine: 0, shape: 0.4, fmRatio: 1 },
			filter: { type: 'bp12', cutoffHz: 1000, resonance: 4, drive: 0.6, envAmt: 0.5, keyTrack: 1 },
			filterEnv: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.2 },
			modMatrix: [
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0.2, 0.3, 0.4, 0.25, 0.1],
				[0.1, 0.2, 0.3, 0.15, 0.2],
				[0.25, 0.35, 0.5, 0.3, 0.4]
			],
			fx: {
				...FACTORY_PRESETS[0].fx,
				delay: {
					bypass: false,
					timeMs: 250,
					bpmSync: true,
					syncDiv: '1/8',
					feedback: 99, // clamped to 0.88 by validateSynthPatch
					toneHz: 4000,
					mix: 0.5
				}
			}
		});
		const setup = await enabledInstrument({ patch: fxPatch });
		expect(setup.audio.patch.fx.delay.feedback).toBe(0.88);
		setup.audio.setModWheel(0.8);
		const id = setup.audio.noteOn(72, 0.9); // +1 octave above C4 -> keyTrack doubles 1000 Hz -> 2000 Hz
		expect(id).not.toBe('');
		const bpFilter = setup.context.filters.find((f) => f.type === 'bandpass');
		expect(bpFilter).toBeDefined();
		expect(bpFilter!.frequency.setValueAtTime).toHaveBeenCalledWith(2000, 8);
		expect(
			setup.context.waveShapers.some((ws) => ws.curve !== null && ws.curve.length === 257)
		).toBe(true);
		setup.audio.noteOff(id);
		setup.context.advance(0.25);
		expect(setup.audio.activeCount).toBe(0);
		setup.audio.dispose();
	});

	it('shortens already-releasing voices on stopAll() including Preset 14 long release tails', async () => {
		const preset14 = FACTORY_PRESETS[13];
		expect(preset14.ampEnv.release).toBeGreaterThan(2);
		const { audio, context } = await enabledInstrument({ patch: preset14 });
		const id = audio.noteOn(60, 0.8);
		expect(id).not.toBe('');
		audio.noteOff(id);
		context.advance(0.05);
		expect(audio.activeCount).toBe(1);

		audio.stopAll();
		context.advance(0.05);
		expect(audio.activeCount).toBe(0);
		expect(context.sources.every((s) => s.ended)).toBe(true);
		// Slice past the 2 global control ConstantSourceNodes (pitchBendSource, modWheelSource)
		expect(context.constantSources.slice(2).every((c) => c.stopAt === 0 || c.ended)).toBe(true);
		audio.dispose();
	});

	it('applies modMatrix[2][2] (Filter Env -> Cutoff) exactly once and supports exact cancellation', async () => {
		const singleGainPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			filter: { type: 'lp12', cutoffHz: 400, resonance: 0.7, drive: 0, envAmt: 0, keyTrack: 0 },
			modMatrix: [
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0.25, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0]
			]
		});
		const setup1 = await enabledInstrument({ patch: singleGainPatch });
		const filtersBefore1 = setup1.context.filters.length;
		setup1.audio.noteOn(60, 0.8);
		const lp1 = setup1.context.filters.slice(filtersBefore1).find((f) => f.type === 'lowpass')!;
		const detuneModGains = setup1.context.gains.filter((g) => g.connections.includes(lp1.detune));
		expect(detuneModGains).toHaveLength(1);
		expect(detuneModGains[0].gain.value).toBeCloseTo(0.25 * 4800, 6);
		setup1.audio.dispose();

		const cancelPatch = validateSynthPatch({
			...singleGainPatch,
			filter: { type: 'lp12', cutoffHz: 400, resonance: 0.7, drive: 0, envAmt: 0.5, keyTrack: 0 },
			modMatrix: [
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, -0.5, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0]
			]
		});
		const setup2 = await enabledInstrument({ patch: cancelPatch });
		const filtersBefore2 = setup2.context.filters.length;
		setup2.audio.noteOn(60, 0.8);
		const lp2 = setup2.context.filters.slice(filtersBefore2).find((f) => f.type === 'lowpass')!;
		const cancelGains = setup2.context.gains.filter((g) => g.connections.includes(lp2.detune));
		expect(cancelGains).toHaveLength(0);
		setup2.audio.dispose();
	});

	it('bounds positive filter detune modulation so effective cutoff never exceeds min(18000, 0.46*sr)', async () => {
		for (const sampleRate of [32_000, 48_000]) {
			const extremePatch = validateSynthPatch({
				...FACTORY_PRESETS[1], // 02 Electric Tines (cutoff 7200)
				filter: { type: 'lp12', cutoffHz: 7200, resonance: 1, drive: 0, envAmt: 1, keyTrack: 0 },
				modMatrix: [
					[0, 0, 1, 0, 0],
					[0, 0, 1, 0, 0],
					[0, 0, 1, 0, 0],
					[0, 0, 1, 0, 0],
					[0, 0, 1, 0, 0]
				]
			});
			const setup = await enabledInstrument({ patch: extremePatch });
			setup.context.sampleRate = sampleRate;
			const filtersBefore = setup.context.filters.length;
			setup.audio.noteOn(60, 1.0);
			const lp = setup.context.filters.slice(filtersBefore).find((f) => f.type === 'lowpass')!;
			const trackedCutoff = lp.frequency.value;
			const staticDetune = Math.max(0, lp.detune.value);
			const dynamicPosDetune = setup.context.gains
				.filter((g) => g.connections.includes(lp.detune))
				.reduce((sum, g) => sum + Math.max(0, Math.abs(g.gain.value)), 0);
			const effectiveMaxHz = trackedCutoff * 2 ** ((staticDetune + dynamicPosDetune) / 1200);
			expect(effectiveMaxHz).toBeLessThan(sampleRate * 0.46);
			expect(effectiveMaxHz).toBeLessThanOrEqual(18_000.01);
			setup.audio.dispose();
		}
	});

	it('keeps scheduleNote AudioParam timelines strictly chronological for short durations and 5-partial long attack', async () => {
		const assertChronological = (events: Array<{ kind: string; value: number; at: number }>) => {
			expect(events.length).toBeGreaterThanOrEqual(3);
			for (let i = 1; i < events.length; i++) {
				expect(events[i].at).toBeGreaterThanOrEqual(events[i - 1].at);
				if (events[i].kind === 'exponentialRampToValueAtTime') {
					expect(events[i - 1].value).toBeGreaterThan(0);
				}
			}
			expect(events[events.length - 1].value).toBe(0);
		};

		const padPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			ampEnv: { attack: 0.4, decay: 0.8, sustain: 0.6, release: 0.2 },
			filter: { type: 'lp12', cutoffHz: 800, resonance: 1, drive: 0, envAmt: 0.5, keyTrack: 0 },
			filterEnv: { attack: 0.5, decay: 0.9, sustain: 0.4, release: 0.2 }
		});
		const setup1 = await enabledInstrument({ patch: padPatch });
		const gainsBefore1 = setup1.context.gains.length;
		// duration (0.1) < attack (0.4)
		expect(setup1.audio.scheduleNote(60, 0.8, 8.0, 0.1)).not.toBe('');
		const envGains1 = setup1.context.gains
			.slice(gainsBefore1)
			.filter((g) => g.gain.exponentialRampToValueAtTime.mock.calls.length > 0);
		expect(envGains1).toHaveLength(2); // ampVca + filterEnvGain
		for (const g of envGains1) {
			assertChronological(g.gain.events);
			expect(Math.max(...g.gain.events.map((e) => e.at))).toBeCloseTo(8.302, 6);
		}
		setup1.audio.dispose();

		// attack < duration < attack + decay, with sustain === 0
		const pluckPatch = validateSynthPatch({
			...padPatch,
			ampEnv: { attack: 0.1, decay: 0.8, sustain: 0, release: 0.2 }
		});
		const setup2 = await enabledInstrument({ patch: pluckPatch });
		const gainsBefore2 = setup2.context.gains.length;
		expect(setup2.audio.scheduleNote(60, 0.8, 8.0, 0.3)).not.toBe('');
		const vca2 = setup2.context.gains
			.slice(gainsBefore2)
			.find((g) => g.gain.exponentialRampToValueAtTime.mock.calls.length > 0)!;
		assertChronological(vca2.gain.events);
		setup2.audio.dispose();

		// 5-partial with attack = 0.3 > 0.17 (5 partial envelopes + 1 ampVca = 6 gains)
		const fivePartialLongAtk = validateSynthPatch({
			...FACTORY_PRESETS[0],
			ampEnv: { attack: 0.3, decay: 0.5, sustain: 1, release: 0.2 }
		});
		const setup3 = await enabledInstrument({ patch: fivePartialLongAtk });
		const gainsBefore3 = setup3.context.gains.length;
		setup3.audio.noteOn(60, 0.8);
		const envGains3 = setup3.context.gains
			.slice(gainsBefore3)
			.filter((g) => g.gain.linearRampToValueAtTime.mock.calls.length > 0);
		expect(envGains3).toHaveLength(6);
		for (const eg of envGains3) {
			for (let i = 1; i < eg.gain.events.length; i++) {
				expect(eg.gain.events[i].at).toBeGreaterThan(eg.gain.events[i - 1].at);
			}
		}
		setup3.audio.dispose();
	});

	it('preserves lookahead scheduled notes in mono mode without dropping unstarted steps', async () => {
		const monoPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			voiceMode: 'mono'
		});
		const { audio, context } = await enabledInstrument({ patch: monoPatch });
		const step1 = audio.scheduleNote(60, 0.8, 8.05, 0.2);
		const step1Osc = context.sources[0];
		const step2 = audio.scheduleNote(62, 0.8, 8.1, 0.2);
		expect(step1).not.toBe('');
		expect(step2).not.toBe('');

		// Step 1 must NOT be cancelled at t=8.0; its stop must be scheduled after step 2's start (8.10)
		expect(step1Osc.stopAt).toBeGreaterThan(8.1);
		context.advance(0.06); // t = 8.06: step 1 is playing
		expect(step1Osc.ended).toBe(false);
		context.advance(0.06); // t = 8.12: step 1 has finished cleanly, step 2 active
		expect(step1Osc.ended).toBe(true);
		expect(audio.hasVoice(step2)).toBe(true);
		audio.dispose();
	});

	it('handles OfflineAudioContext mid-bounce setPatch without stopping LFO/Chorus at t=0', () => {
		const context = new FakeContext();
		context.state = 'suspended';
		context.currentTime = 0;

		const graph = buildSynthOfflineGraph(context as unknown as BaseAudioContext, {
			patch: FACTORY_PRESETS[0]
		});
		const lfoPreset = validateSynthPatch({
			...FACTORY_PRESETS[10], // has chorus + lfo1
			lfo1: { wave: 'sine', rateHz: 2, syncDiv: '1/4', depth: 0.5, bpmSync: false, keySync: false },
			modMatrix: [
				[0, 0, 0.4, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0]
			]
		});
		graph.setPatch(lfoPreset, 0.2);
		graph.noteOn(60, 0.9, 0.25);
		const lfoOsc = context.sources.find((s) => s.start.mock.calls[0]?.[0] === 0.2);
		expect(lfoOsc).toBeDefined();

		graph.setPatch(FACTORY_PRESETS[0], 0.6);
		expect(lfoOsc!.stopAt).toBeGreaterThanOrEqual(0.6);
		expect(lfoOsc!.disconnect).not.toHaveBeenCalled();

		graph.dispose();
		expect(lfoOsc!.disconnect).toHaveBeenCalled();
	});

	it('recreates LFO sources when setPatch changes LFO waveform (sine -> square -> sh)', async () => {
		const sinePatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			lfo1: { wave: 'sine', rateHz: 3, syncDiv: '1/4', depth: 0.6, bpmSync: false, keySync: false },
			modMatrix: [
				[0, 0, 0.3, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0]
			]
		});
		const { audio, context } = await enabledInstrument({ patch: sinePatch });
		audio.noteOn(60, 0.8);
		expect(context.sources).toHaveLength(2); // Osc1 + LFO1 sine
		expect(context.sources[1].type).toBe('sine');

		audio.setPatch({ ...sinePatch, lfo1: { ...sinePatch.lfo1, wave: 'square' } });
		expect(context.sources[1].disconnect).toHaveBeenCalledOnce();
		expect(context.sources).toHaveLength(3);
		expect(context.sources[2].type).toBe('square');

		audio.setPatch({ ...sinePatch, lfo1: { ...sinePatch.lfo1, wave: 'sh' } });
		expect(context.sources[2].disconnect).toHaveBeenCalledOnce();
		expect(context.bufferSources).toHaveLength(1);
		expect(context.bufferSources[0].loop).toBe(true);
		audio.dispose();
	});

	it('enforces the 6-note Unison cap when switching live from Poly mode', async () => {
		const polyPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			voiceMode: 'poly'
		});
		const { audio } = await enabledInstrument({ patch: polyPatch });
		const ids: string[] = [];
		for (let i = 0; i < 12; i++) {
			ids.push(audio.noteOn(48 + i, 0.8));
		}
		expect(ids.filter((id) => audio.hasVoice(id))).toHaveLength(12);

		audio.setPatch({ ...polyPatch, voiceMode: 'unison', unisonVoices: 3, unisonSpreadCt: 20 });
		ids.push(audio.noteOn(72, 0.8));
		expect(ids.filter((id) => audio.hasVoice(id)).length).toBeLessThanOrEqual(
			UNISON_PLAYABLE_NOTES
		);
		audio.dispose();
	});

	it('rescales legato fmTargets, silences above-Nyquist 5-partial overtones, and preserves mid-glide continuity', async () => {
		// 1. FM index rescaling + mid-glide continuity
		const fmLegato = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'fm', oct: 0, semi: 0, fine: 0, shape: 0.5, fmRatio: 2 },
			voiceMode: 'legato',
			glideMs: 100
		});
		const fmSetup = await enabledInstrument({ patch: fmLegato });
		const gainsBefore = fmSetup.context.gains.length;
		fmSetup.audio.noteOn(21, 0.8); // A0 = 27.5 Hz
		const fmGain = fmSetup.context.gains
			.slice(gainsBefore)
			.find((g) => Math.abs(g.gain.value - 2.5 * 27.5) < 1e-6)!;
		expect(fmGain).toBeDefined();

		fmSetup.audio.noteOn(81, 0.8); // A5 = 880 Hz
		const lastRamp = fmGain.gain.linearRampToValueAtTime.mock.calls.at(-1)!;
		expect(lastRamp[0]).toBeCloseTo(2.5 * 880, 4);

		// Mid-glide at t = 8.05 (halfway through 100ms exp glide from 27.5 to 880 -> sqrt(27.5*880) = 155.56 Hz)
		fmSetup.context.advance(0.05);
		fmSetup.audio.noteOn(69, 0.8); // A4 = 440 Hz
		const carrierStart = fmSetup.context.sources[0].frequency.setValueAtTime.mock.calls.at(-1)!;
		expect(carrierStart[0]).toBeCloseTo(Math.sqrt(27.5 * 880), 2);
		fmSetup.audio.dispose();

		// 2. 5-partial legato glide to C8 ramps above-Nyquist partial 5 gain to 0
		const fiveLegato = validateSynthPatch({
			...FACTORY_PRESETS[0],
			voiceMode: 'legato',
			glideMs: 50
		});
		const pSetup = await enabledInstrument({ patch: fiveLegato });
		const pGainsBefore = pSetup.context.gains.length;
		pSetup.audio.noteOn(60, 0.8); // 5 partials
		const partialEnvs = pSetup.context.gains
			.slice(pGainsBefore)
			.filter((g) => g.gain.linearRampToValueAtTime.mock.calls.length > 0);
		expect(partialEnvs).toHaveLength(5);
		pSetup.audio.noteOn(108, 0.8); // C8: partial 5 = 4186 * 6.04 = 25283 >= 22080
		const partial5LastRamp = partialEnvs[4].gain.linearRampToValueAtTime.mock.calls.at(-1)!;
		expect(partial5LastRamp[0]).toBe(0);
		pSetup.audio.dispose();
	});

	it('does not steal held voices when an above-Nyquist noteOn returns silent empty id', async () => {
		const { audio, context } = await enabledInstrument();
		const held: string[] = [];
		for (let i = 0; i < PIANO_PLAYABLE_VOICES; i++) {
			held.push(audio.noteOn(48 + i, 0.8));
		}
		expect(audio.activeCount).toBe(PIANO_PLAYABLE_VOICES);

		context.sampleRate = 8_000;
		expect(audio.noteOn(108, 0.8)).toBe('');
		expect(audio.activeCount).toBe(PIANO_PLAYABLE_VOICES);
		expect(held.every((id) => audio.hasVoice(id))).toBe(true);
		audio.dispose();
	});

	it('routes Mod Matrix -> Amp to post-VCA modAmpGain so closed sustain=0 VCA stays silent', async () => {
		const ampModPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			ampEnv: { attack: 0.002, decay: 0.01, sustain: 0, release: 0.2 },
			lfo1: { wave: 'sine', rateHz: 5, syncDiv: '1/4', depth: 1, bpmSync: false, keySync: false },
			modMatrix: [
				[0, 0, 0, 0, 0.8],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0]
			]
		});
		const { audio, context } = await enabledInstrument({ patch: ampModPatch });
		const gainsBefore = context.gains.length;
		audio.noteOn(60, 0.8);
		const createdGains = context.gains.slice(gainsBefore);
		const ampVca = createdGains.find(
			(g) => g.gain.exponentialRampToValueAtTime.mock.calls.length > 0
		)!;
		const modAmpGain = createdGains.find((g) => g !== ampVca && ampVca.connections.includes(g))!;
		expect(modAmpGain).toBeDefined();
		expect(modAmpGain.gain.value).toBe(1);
		const lfoToAmpGain = createdGains.find((g) => g.connections.includes(modAmpGain.gain));
		expect(lfoToAmpGain).toBeDefined();
		expect(createdGains.some((g) => g.connections.includes(ampVca.gain))).toBe(false);
		audio.dispose();
	});

	it('shortens scheduleNote release tails smoothly on stopAll() without jumping back to sustainGain', async () => {
		const padPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			ampEnv: { attack: 0.01, decay: 0.05, sustain: 0.9, release: 2.0 },
			filter: { type: 'lp12', cutoffHz: 1200, resonance: 1, drive: 0, envAmt: 0.5, keyTrack: 0 },
			filterEnv: { attack: 0.01, decay: 0.05, sustain: 0.8, release: 2.0 }
		});
		const { audio, context } = await enabledInstrument({ patch: padPatch });
		const gainsBefore = context.gains.length;
		const id = audio.scheduleNote(60, 0.9, 8.0, 0.1);
		expect(id).not.toBe('');

		const createdGains = context.gains.slice(gainsBefore);
		const ampVca = createdGains.find((g) => g.gain.events.some((e) => e.at === 8.1))!;
		const filterEnvGain = createdGains.find(
			(g) => g !== ampVca && g.gain.events.some((e) => e.at === 8.1)
		)!;
		expect(ampVca).toBeDefined();
		expect(filterEnvGain).toBeDefined();

		// Advance into the 2.0s release tail (t = 9.6: 1.5s into release from 8.1 -> 10.1)
		context.advance(1.6);
		expect(audio.activeCount).toBe(1);

		// Calling noteOff() past releaseAt must remain idempotent
		const ampEventsBeforeOff = ampVca.gain.events.length;
		const filterEventsBeforeOff = filterEnvGain.gain.events.length;
		audio.noteOff(id);
		expect(ampVca.gain.events.length).toBe(ampEventsBeforeOff);
		expect(filterEnvGain.gain.events.length).toBe(filterEventsBeforeOff);

		// Calling stopAll() must fade from the decayed tail (~0.000976), NOT jump back up to sustainGain (~0.907)
		audio.stopAll();
		const lastAmpStart = ampVca.gain.setValueAtTime.mock.calls.at(-1)!;
		const lastFilterStart = filterEnvGain.gain.setValueAtTime.mock.calls.at(-1)!;
		expect(lastAmpStart[1]).toBe(9.6);
		expect(lastAmpStart[0]).toBeLessThanOrEqual(0.002);
		expect(lastFilterStart[0]).toBeLessThanOrEqual(0.002);

		context.advance(0.05);
		expect(audio.activeCount).toBe(0);
		expect(context.sources.every((s) => s.ended)).toBe(true);
		audio.dispose();
	});

	it('keeps FM modulator fmGain ramped to 0 on legato glide when modulator crosses Nyquist', async () => {
		const fmLegato = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'fm', oct: 0, semi: 0, fine: 0, shape: 0.8, fmRatio: 6 },
			lfo1: { wave: 'sine', rateHz: 4, syncDiv: '1/4', depth: 0.5, bpmSync: false, keySync: false },
			modMatrix: [
				[0, 0.5, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0]
			],
			voiceMode: 'legato',
			glideMs: 100
		});
		const { audio, context } = await enabledInstrument({ patch: fmLegato });
		const gainsBefore = context.gains.length;
		audio.noteOn(60, 0.8); // C4: carrier 261.63 Hz, mod 1569.75 Hz
		const createdGains = context.gains.slice(gainsBefore);
		const fmGain = createdGains.find((g) => Math.abs(g.gain.value - 4 * 261.6255653005986) < 1e-3)!;
		expect(fmGain).toBeDefined();
		const modShapeGain = createdGains.find((g) => g.connections.includes(fmGain.gain))!;
		expect(modShapeGain).toBeDefined();

		// Glide to C8 (carrier 4186 Hz < 22080, mod 25116 Hz >= 22080): fmGain & modShapeGain must stay ramped to 0
		audio.noteOn(108, 0.8);
		expect(fmGain.gain.events.at(-1)?.kind).toBe('linearRampToValueAtTime');
		expect(fmGain.gain.events.at(-1)?.value).toBe(0);
		expect(modShapeGain.gain.events.at(-1)?.value).toBe(0);

		// Gliding back down to C4 cleanly restores FM depth from 0
		context.advance(0.1);
		audio.noteOn(60, 0.8);
		expect(fmGain.gain.events.at(-1)?.value).toBeCloseTo(4 * 261.6255653005986, 3);
		const modShapeReturnStart = modShapeGain.gain.setValueAtTime.mock.calls.at(-1)!;
		expect(modShapeReturnStart[0]).toBe(0);
		expect(modShapeGain.gain.events.at(-1)?.value).toBeCloseTo(1.25 * 261.6255653005986, 3);
		audio.dispose();
	});

	it('restores non-FM oscTargets mix gains when gliding back below Nyquist in legato mode', async () => {
		const assertMonotonic = (events: Array<{ kind: string; value: number; at: number }>) => {
			for (let i = 1; i < events.length; i++) {
				expect(events[i].at).toBeGreaterThanOrEqual(events[i - 1].at);
			}
		};

		// 1. osc1 + osc2 (osc2 crosses Nyquist on 108 and recovers on 60)
		const osc2Legato = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			osc2: { wave: 'saw', oct: 2, semi: 12, fine: 0, shape: 0, ringMod: false },
			mix: { osc1: 0.8, osc2: 1.0, sub: 0, noise: 0 },
			voiceMode: 'legato',
			glideMs: 50
		});
		const setup1 = await enabledInstrument({ patch: osc2Legato });
		const gainsBefore1 = setup1.context.gains.length;
		setup1.audio.noteOn(60, 0.8);
		const osc2MixGain = setup1.context.gains
			.slice(gainsBefore1)
			.find((g) => Math.abs(g.gain.value - 1.0) < 1e-6 && g.gain.events[0]?.at === 8)!;
		expect(osc2MixGain).toBeDefined();

		setup1.context.advance(0.1);
		setup1.audio.noteOn(108, 0.8);
		expect(osc2MixGain.gain.events.at(-1)?.value).toBe(0);

		setup1.context.advance(0.1);
		setup1.audio.noteOn(60, 0.8);
		expect(osc2MixGain.gain.events.at(-1)?.value).toBeGreaterThan(0.9);
		assertMonotonic(osc2MixGain.gain.events);
		setup1.audio.dispose();

		// 2. osc1 + sub (osc1 crosses Nyquist on 108 and recovers on 60)
		const subLegato = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 2, semi: 12, fine: 0, shape: 0, fmRatio: 1 },
			mix: { osc1: 0.8, osc2: 0, sub: 0.5, noise: 0 },
			voiceMode: 'legato',
			glideMs: 50
		});
		const setup2 = await enabledInstrument({ patch: subLegato });
		const gainsBefore2 = setup2.context.gains.length;
		setup2.audio.noteOn(60, 0.8);
		const osc1MixGain = setup2.context.gains
			.slice(gainsBefore2)
			.find((g) => Math.abs(g.gain.value - 0.8) < 1e-6)!;
		expect(osc1MixGain).toBeDefined();

		setup2.context.advance(0.1);
		setup2.audio.noteOn(108, 0.8);
		expect(osc1MixGain.gain.events.at(-1)?.value).toBe(0);

		setup2.context.advance(0.1);
		setup2.audio.noteOn(60, 0.8);
		expect(osc1MixGain.gain.events.at(-1)?.value).toBeGreaterThan(0.7);
		assertMonotonic(osc1MixGain.gain.events);
		setup2.audio.dispose();

		// 3. Single osc1 only (willProduceAudioSource(108) is false, legato still mutes & recovers)
		const soloLegato = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 2, semi: 12, fine: 0, shape: 0, fmRatio: 1 },
			mix: { osc1: 1.0, osc2: 0, sub: 0, noise: 0 },
			voiceMode: 'legato',
			glideMs: 50
		});
		const setup3 = await enabledInstrument({ patch: soloLegato });
		const gainsBefore3 = setup3.context.gains.length;
		setup3.audio.noteOn(60, 0.8);
		const soloOsc1Gain = setup3.context.gains
			.slice(gainsBefore3)
			.find((g) => Math.abs(g.gain.value - 1.0) < 1e-6 && g.gain.events[0]?.at === 8)!;
		expect(soloOsc1Gain).toBeDefined();

		setup3.context.advance(0.1);
		const id108 = setup3.audio.noteOn(108, 0.8);
		expect(id108).not.toBe('');
		expect(soloOsc1Gain.gain.events.at(-1)?.value).toBe(0);

		setup3.context.advance(0.1);
		setup3.audio.noteOn(60, 0.8);
		expect(soloOsc1Gain.gain.events.at(-1)?.value).toBeGreaterThan(0.9);
		assertMonotonic(soloOsc1Gain.gain.events);
		setup3.audio.dispose();
	});

	it('budgets negative/bipolar Mod Matrix -> Amp routes so modAmpGain never goes negative', async () => {
		const stackedNegAmpPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			lfo1: { wave: 'sine', rateHz: 4, syncDiv: '1/4', depth: 1, bpmSync: false, keySync: false },
			lfo2: { wave: 'tri', rateHz: 3, syncDiv: '1/4', depth: 1, bpmSync: false, keySync: false },
			filter: { type: 'lp12', cutoffHz: 1200, resonance: 1, drive: 0, envAmt: 0.5, keyTrack: 0 },
			modMatrix: [
				[0, 0, 0, 0, -1],
				[0, 0, 0, 0, -1],
				[0, 0, 0, 0, -1],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, -1]
			]
		});
		const { audio, context } = await enabledInstrument({ patch: stackedNegAmpPatch });
		audio.setModWheel(1);
		const gainsBefore = context.gains.length;
		audio.noteOn(60, 0.8);
		const createdGains = context.gains.slice(gainsBefore);
		const ampVca = createdGains.find(
			(g) => g.gain.exponentialRampToValueAtTime.mock.calls.length > 0
		)!;
		const modAmpGain = createdGains.find((g) => g !== ampVca && ampVca.connections.includes(g))!;
		const ampModInputs = createdGains.filter((g) => g.connections.includes(modAmpGain.gain));
		expect(ampModInputs).toHaveLength(4);
		const maxNegativeSum = ampModInputs.reduce((sum, g) => sum + Math.abs(g.gain.value), 0);
		expect(1 - maxNegativeSum).toBeGreaterThanOrEqual(0);
		audio.dispose();
	});

	it('maintains strictly monotonic AudioParam timestamps on IEEE-754 boundary duration === attack + decay', async () => {
		expect(8.1 + 0.3 + 0.05).toBeGreaterThan(8.1 + 0.35);
		const ieeePatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			ampEnv: { attack: 0.3, decay: 0.05, sustain: 0, release: 0.2 },
			filter: { type: 'lp12', cutoffHz: 1200, resonance: 1, drive: 0, envAmt: 0.5, keyTrack: 0 },
			filterEnv: { attack: 0.3, decay: 0.05, sustain: 0, release: 0.2 }
		});
		const { audio, context } = await enabledInstrument({ patch: ieeePatch });
		context.advance(0.1); // currentTime = 8.1
		const gainsBefore = context.gains.length;
		const id = audio.scheduleNote(67, 0.9, 8.1, 0.35);
		expect(id).not.toBe('');

		const envGains = context.gains
			.slice(gainsBefore)
			.filter((g) => g.gain.exponentialRampToValueAtTime.mock.calls.length > 0);
		expect(envGains).toHaveLength(2);
		for (const g of envGains) {
			const events = g.gain.events;
			expect(events.length).toBeGreaterThanOrEqual(4);
			for (let i = 1; i < events.length; i++) {
				expect(events[i].at).toBeGreaterThanOrEqual(events[i - 1].at);
			}
			expect(events[events.length - 1].value).toBe(0);
		}
		audio.dispose();
	});
});

describe('Tier 5: audio.ts adversarial DSP and lifecycle hardening', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('wires filterEnv.release independently from ampEnv.release in scheduleNote, noteOff, and staggered stopAll()', async () => {
		const staggeredPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			filter: { type: 'lp12', cutoffHz: 600, resonance: 1, drive: 0, envAmt: 0.8, keyTrack: 0 },
			ampEnv: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 2.5 },
			filterEnv: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.05 }
		});
		const { audio, context } = await enabledInstrument({ patch: staggeredPatch });

		// 1. scheduleNote
		const gains1 = context.gains.length;
		expect(audio.scheduleNote(60, 0.8, 8.0, 0.3)).not.toBe('');
		const envGains1 = context.gains
			.slice(gains1)
			.filter((g) => g.gain.exponentialRampToValueAtTime.mock.calls.length > 0);
		expect(envGains1).toHaveLength(2);
		const ampVca1 = envGains1.find((g) =>
			g.connections.some((c) => context.panners.includes(c as never))
		)!;
		const filterEnvGain1 = envGains1.find((g) => g !== ampVca1)!;
		expect(ampVca1.gain.exponentialRampToValueAtTime.mock.calls.at(-1)?.[1]).toBeCloseTo(10.8, 6);
		expect(filterEnvGain1.gain.exponentialRampToValueAtTime.mock.calls.at(-1)?.[1]).toBeCloseTo(
			8.35,
			6
		);
		const lastFilterLinear = filterEnvGain1.gain.linearRampToValueAtTime.mock.calls.at(-1)!;
		expect(lastFilterLinear[0]).toBe(0);
		expect(lastFilterLinear[1]).toBeCloseTo(8.352, 6);
		audio.stopAll();
		context.advance(0.1);

		// 2. noteOn + noteOff
		const gains2 = context.gains.length;
		const id2 = audio.noteOn(64, 0.8);
		const envGains2 = context.gains
			.slice(gains2)
			.filter((g) => g.gain.exponentialRampToValueAtTime.mock.calls.length > 0);
		const ampVca2 = envGains2.find((g) =>
			g.connections.some((c) => context.panners.includes(c as never))
		)!;
		const filterEnvGain2 = envGains2.find((g) => g !== ampVca2)!;
		audio.noteOff(id2);
		expect(ampVca2.gain.exponentialRampToValueAtTime.mock.calls.at(-1)?.[1]).toBeCloseTo(10.6, 6);
		expect(filterEnvGain2.gain.exponentialRampToValueAtTime.mock.calls.at(-1)?.[1]).toBeCloseTo(
			8.15,
			6
		);
		audio.stopAll();
		context.advance(0.1);

		// 3. stopAll() during staggered release (advance to sustain, then decay for 0.025s)
		const gains3 = context.gains.length;
		const id3 = audio.noteOn(67, 0.8);
		context.advance(0.25);
		const envGains3 = context.gains
			.slice(gains3)
			.filter((g) => g.gain.exponentialRampToValueAtTime.mock.calls.length > 0);
		const ampVca3 = envGains3.find((g) =>
			g.connections.some((c) => context.panners.includes(c as never))
		)!;
		const filterEnvGain3 = envGains3.find((g) => g !== ampVca3)!;
		audio.noteOff(id3);
		context.advance(0.025);
		const filterBeforeStopAll = filterEnvGain3.gain.exponentialRampToValueAtTime.mock.calls.at(-1)!;
		expect(filterBeforeStopAll[1]).toBeCloseTo(8.5, 6);
		audio.stopAll();
		const filterSetOnStop = filterEnvGain3.gain.setValueAtTime.mock.calls.at(-1)!;
		expect(filterSetOnStop[0]).toBeLessThan(0.1);
		expect(filterSetOnStop[0]).toBeGreaterThan(0.0001);
		audio.dispose();
	});

	it('stops A0 5-partial and long scheduleNote voices cleanly in <= 0.1s with spec-compliant single stop()', async () => {
		const { audio, context } = await enabledInstrument({ patch: FACTORY_PRESETS[0] });
		expect(audio.noteOn(21, 0.8)).not.toBe('');
		context.advance(0.05);
		audio.stopAll();
		context.advance(0.1);
		expect(audio.activeCount).toBe(0);
		expect(context.sources.every((s) => s.ended)).toBe(true);
		expect(context.sources.every((s) => s.stop.mock.calls.length <= 1)).toBe(true);

		const sawPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 }
		});
		audio.setPatch(sawPatch);
		const beforeSched = context.sources.length;
		expect(audio.scheduleNote(60, 0.8, context.currentTime + 0.05, 2.0)).not.toBe('');
		audio.stopAll();
		context.advance(0.1);
		expect(audio.activeCount).toBe(0);
		expect(context.sources.slice(beforeSched).every((s) => s.ended)).toBe(true);
		expect(context.sources.every((s) => s.stop.mock.calls.length <= 1)).toBe(true);
		audio.dispose();
	});

	it('isolates legato manual voices from timed scheduleNote voices and unmutes 5-partial Nyquist glides', async () => {
		const legatoSaw = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			voiceMode: 'legato',
			glideMs: 50
		});
		const { audio, context } = await enabledInstrument({ patch: legatoSaw });
		const arpId = audio.scheduleNote(60, 0.7, 8.0, 0.15);
		context.advance(0.05);
		const manualId = audio.noteOn(64, 0.8);
		expect(manualId).not.toBe('');
		expect(manualId).not.toBe(arpId);
		context.advance(0.4);
		expect(audio.hasVoice(arpId)).toBe(false);
		expect(audio.hasVoice(manualId)).toBe(true);
		expect(audio.activeCount).toBeGreaterThanOrEqual(1);
		audio.noteOff(manualId);
		context.advance(0.2);
		expect(audio.activeCount).toBe(0);
		audio.dispose();

		// 5-partial high-to-low legato glide restores partial 5 gain
		const fiveLegato = validateSynthPatch({
			...FACTORY_PRESETS[0],
			voiceMode: 'legato',
			glideMs: 50
		});
		const pSetup = await enabledInstrument({ patch: fiveLegato });
		const gainsBefore = pSetup.context.gains.length;
		pSetup.audio.noteOn(60, 0.8);
		const partialEnvs = pSetup.context.gains
			.slice(gainsBefore)
			.filter((g) => g.gain.linearRampToValueAtTime.mock.calls.length > 0);
		expect(partialEnvs).toHaveLength(5);
		pSetup.audio.noteOn(108, 0.8);
		expect(partialEnvs[4].gain.linearRampToValueAtTime.mock.calls.at(-1)?.[0]).toBe(0);
		pSetup.context.advance(0.05);
		pSetup.audio.noteOn(60, 0.8);
		const unmuteRamp = partialEnvs[4].gain.linearRampToValueAtTime.mock.calls.at(-1)!;
		expect(unmuteRamp[0]).toBeGreaterThan(0);
		pSetup.audio.dispose();
	});

	it('clamps bp12 resonance modulation so worst-case filter Q never sums below 0.05', async () => {
		const negResPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			filter: { type: 'bp12', cutoffHz: 1000, resonance: 0.7, drive: 0, envAmt: 0, keyTrack: 0 },
			lfo1: { wave: 'sine', rateHz: 2, syncDiv: '1/4', depth: 1, bpmSync: false, keySync: false },
			modMatrix: [
				[0, 0, 0, -1, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, -1, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0]
			]
		});
		const { audio, context } = await enabledInstrument({ patch: negResPatch });
		const filtersBefore = context.filters.length;
		const gainsBefore = context.gains.length;
		audio.noteOn(60, 0.8);
		const bp = context.filters.slice(filtersBefore).find((f) => f.type === 'bandpass')!;
		expect(bp).toBeDefined();
		const resModGains = context.gains
			.slice(gainsBefore)
			.filter((g) => g.connections.includes(bp.Q));
		const worstCaseNegSum = resModGains.reduce((sum, g) => sum + Math.abs(g.gain.value), 0);
		expect(bp.Q.value - worstCaseNegSum).toBeGreaterThanOrEqual(0.05 - 1e-9);
		audio.dispose();
	});

	it('verifies hp12, 3-bit Crush curve, HardClipper, LFO bpmSync/keySync, and Mono -> Poly live switching', async () => {
		const dspPatch = validateSynthPatch({
			...FACTORY_PRESETS[0],
			osc1: { wave: 'saw', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
			filter: { type: 'hp12', cutoffHz: 900, resonance: 1, drive: 0, envAmt: 0, keyTrack: 0 },
			lfo1: { wave: 'sine', rateHz: 1, syncDiv: '1/8', depth: 0.8, bpmSync: true, keySync: true },
			modMatrix: [
				[0, 0, 0.4, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0],
				[0, 0, 0, 0, 0]
			],
			arpSeq: { ...FACTORY_PRESETS[0].arpSeq, bpm: 120 },
			fx: {
				...FACTORY_PRESETS[0].fx,
				crush: { bypass: false, drive: 0.2, bitDepth: 3, toneHz: 8000, mix: 0.5 }
			},
			voiceMode: 'mono'
		});
		const { audio, context } = await enabledInstrument({ patch: dspPatch });

		// Crush 3-bit curve (waveShapers[0]) & HardClipper (waveShapers[1])
		const crushCurve = context.waveShapers[0].curve!;
		const distinctLevels = new Set(Array.from(crushCurve, (v) => Number(v.toFixed(4))));
		expect(distinctLevels.size).toBeLessThanOrEqual(9);
		const clipperCurve = context.waveShapers[1].curve!;
		expect(clipperCurve[0]).toBe(-1);
		expect(clipperCurve[clipperCurve.length - 1]).toBe(1);

		const id1 = audio.noteOn(60, 0.8);
		expect(context.filters.some((f) => f.type === 'highpass')).toBe(true);
		const firstLfo = context.sources[1];
		// 120 BPM, 1/8 -> 4 Hz
		expect(firstLfo.frequency.setValueAtTime).toHaveBeenCalledWith(4, 8);

		// keySync = true restarts LFO on second noteOn; switching Mono -> Poly keeps prior mono note alive
		audio.setPatch({ ...dspPatch, voiceMode: 'poly' });
		const id2 = audio.noteOn(64, 0.8);
		expect(firstLfo.disconnect).toHaveBeenCalledOnce();
		expect(firstLfo.stopCalled).toBe(true);
		expect(audio.hasVoice(id1)).toBe(true);
		expect(audio.hasVoice(id2)).toBe(true);
		audio.dispose();
	});
});
