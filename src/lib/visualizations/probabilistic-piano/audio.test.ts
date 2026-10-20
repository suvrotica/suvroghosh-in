import { describe, expect, it, vi } from 'vitest';
import {
	PianoAudio,
	PIANO_MASTER_GAIN,
	PIANO_MAX_NODE_VOICES,
	PIANO_PLAYABLE_VOICES
} from './audio';

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
	setValueAtTime = vi.fn<(value: number, at: number) => FakeParam>(() => this);
	linearRampToValueAtTime = vi.fn<(value: number, at: number) => FakeParam>(() => this);
	exponentialRampToValueAtTime = vi.fn<(value: number, at: number) => FakeParam>(() => this);
	setTargetAtTime = vi.fn<(value: number, at: number, constant: number) => FakeParam>(() => this);
	cancelScheduledValues = vi.fn<(at: number) => FakeParam>(() => this);
}

class FakeGain {
	gain = new FakeParam();
	connect = vi.fn();
	disconnect = vi.fn();
}

class FakeOscillator {
	frequency = new FakeParam();
	type = 'sine';
	onended: (() => void) | null = null;
	stopAt = Infinity;
	ended = false;
	connect = vi.fn();
	disconnect = vi.fn();
	start = vi.fn();
	stop = vi.fn((at = 0) => {
		if (!this.ended) this.stopAt = at;
	});
}

/** Clock-controlled sources let ownership tests exercise natural decay and rescheduled release. */
class FakeContext {
	state: AudioContextState = 'suspended';
	currentTime = 8;
	sampleRate = 48_000;
	destination = {};
	gains: FakeGain[] = [];
	sources: FakeOscillator[] = [];
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
	advance(seconds: number): void {
		this.currentTime += seconds;
		for (const source of this.sources) {
			if (!source.ended && source.stopAt <= this.currentTime) {
				source.ended = true;
				source.onended?.();
			}
		}
	}
	resolveResume(index = 0): void {
		this.state = 'running';
		this.resumes[index].resolve();
	}
}

function instrument() {
	const context = new FakeContext();
	const factory = vi.fn(() => context as unknown as AudioContext);
	return { context, factory, audio: new PianoAudio({ contextFactory: factory }) };
}

async function enabledInstrument() {
	const setup = instrument();
	const enabling = setup.audio.enable();
	setup.context.resolveResume();
	await enabling;
	return setup;
}

describe('piano audio activation and resource ownership', () => {
	it('is inert for server import/construction and makes its owned context synchronously on enable', async () => {
		const { audio, context, factory } = instrument();
		audio.setVolume(0.2);
		audio.setMuted(false);
		audio.setSustain(true);
		expect(audio.noteOn(60)).toBe('');
		expect(factory).not.toHaveBeenCalled();
		const enabling = audio.enable();
		expect(factory).toHaveBeenCalledOnce();
		expect(context.resume).toHaveBeenCalledOnce();
		expect(audio.ready).toBe(false);
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

	it('schedules pitch and envelopes against the audio clock and bounds gain settings', async () => {
		const { audio, context } = await enabledInstrument();
		const id = audio.noteOn(69, 0.8);
		expect(id).not.toBe('');
		expect(context.sources).toHaveLength(5);
		expect(context.sources[0].frequency.setValueAtTime).toHaveBeenCalledWith(440, 8);
		for (const source of context.sources) {
			expect(source.start).toHaveBeenCalledWith(8);
			expect(source.stopAt).toBeGreaterThan(8);
		}
		for (const gain of context.gains.slice(2)) {
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

	it('caps all graph voices including steal tails under a same-clock pathological burst', async () => {
		const { audio, context } = await enabledInstrument();
		const ids = Array.from({ length: PIANO_MAX_NODE_VOICES + 500 }, () => audio.noteOn(60));
		expect(ids.filter(Boolean)).toHaveLength(PIANO_MAX_NODE_VOICES);
		expect(audio.activeCount).toBe(PIANO_MAX_NODE_VOICES);
		expect(ids.filter((id) => audio.hasVoice(id))).toHaveLength(PIANO_PLAYABLE_VOICES);
		expect(audio.hasVoice(ids[0])).toBe(false);
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

	it('schedules accompaniment onset and key-up with the audio clock and cancels future notes on Stop', async () => {
		const { audio, context } = await enabledInstrument();
		expect(audio.currentTime).toBe(8);
		const scheduled = audio.scheduleNote(60, 0.4, 8.12, 0.5);
		expect(scheduled).not.toBe('');
		for (const source of context.sources) {
			expect(source.start).toHaveBeenCalledWith(8.12);
			expect(source.stopAt).toBeCloseTo(8.772);
		}
		expect(context.gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(
			0,
			8.12 + 0.5 + 0.15
		);
		audio.stopAll();
		expect(audio.activeCount).toBe(0);
		expect(context.sources.every((source) => source.stopAt === 0)).toBe(true);
		expect(audio.hasVoice(scheduled)).toBe(false);
		const bounded = audio.scheduleNote(62, 0.4, 99_999, 99_999);
		expect(bounded).not.toBe('');
		expect(context.sources[5].start).toHaveBeenCalledWith(8.25);
		expect(audio.scheduleNote(60, 0.4, NaN, 0.5)).toBe('');
		expect(audio.scheduleNote(60, 0.4, 8, Infinity)).toBe('');
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
