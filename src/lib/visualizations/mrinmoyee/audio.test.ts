import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtelierSound } from './audio';

function deferredResume() {
	let resolve!: () => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<void>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function audioParam() {
	return {
		value: 0,
		setTargetAtTime: vi.fn(),
		setValueAtTime: vi.fn(),
		exponentialRampToValueAtTime: vi.fn()
	};
}

function gainNode() {
	return { gain: audioParam(), connect: vi.fn(), disconnect: vi.fn() };
}

function oscillatorNode() {
	return {
		type: 'sine',
		frequency: audioParam(),
		onended: null as (() => void) | null,
		connect: vi.fn(),
		disconnect: vi.fn(),
		start: vi.fn(),
		stop: vi.fn()
	};
}

let contexts: DeferredAudioContext[];

/** A resume never settles until the test permits it, reproducing browser audio unlock races. */
class DeferredAudioContext {
	state = 'suspended';
	currentTime = 17;
	destination = {};
	resumes: ReturnType<typeof deferredResume>[] = [];
	oscillators: ReturnType<typeof oscillatorNode>[] = [];
	gains: ReturnType<typeof gainNode>[] = [];

	constructor() {
		contexts.push(this);
	}
	resume = vi.fn(() => {
		const request = deferredResume();
		this.resumes.push(request);
		return request.promise;
	});
	suspend = vi.fn(async () => {
		this.state = 'suspended';
	});
	close = vi.fn(async () => {
		this.state = 'closed';
	});
	createGain = vi.fn(() => {
		const gain = gainNode();
		this.gains.push(gain);
		return gain;
	});
	createOscillator = vi.fn(() => {
		const oscillator = oscillatorNode();
		this.oscillators.push(oscillator);
		return oscillator;
	});
}

beforeEach(() => {
	contexts = [];
	vi.useFakeTimers();
	vi.stubGlobal('AudioContext', DeferredAudioContext);
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('Durga Atelier audio lifecycle', () => {
	it('stays silent without an explicit start and cannot restart after disposal', async () => {
		const sound = new AtelierSound();
		sound.setMode('dhak');
		sound.setVolume(0.2);
		sound.bell();
		expect(contexts).toHaveLength(0);
		expect(vi.getTimerCount()).toBe(0);
		sound.dispose();
		await sound.start();
		expect(contexts).toHaveLength(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('does not schedule sound when a pending resume finishes after stop', async () => {
		const sound = new AtelierSound();
		const starting = sound.start();
		const context = contexts[0];
		await sound.stop();
		expect(context.suspend).toHaveBeenCalledOnce();
		context.resumes[0].resolve();
		await starting;
		vi.advanceTimersByTime(15_000);
		expect(context.createOscillator).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
		sound.dispose();
	});

	it('does not revive a closed context when a pending resume finishes after disposal', async () => {
		const sound = new AtelierSound();
		const starting = sound.start();
		const context = contexts[0];
		sound.dispose();
		expect(context.close).toHaveBeenCalledOnce();
		context.resumes[0].resolve();
		await starting;
		await sound.start();
		vi.advanceTimersByTime(15_000);
		expect(contexts).toHaveLength(1);
		expect(context.createOscillator).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('keeps one scheduler when concurrent starts finish out of order and when started again', async () => {
		const sound = new AtelierSound();
		const olderStart = sound.start();
		const newerStart = sound.start();
		const context = contexts[0];
		expect(contexts).toHaveLength(1);
		expect(context.createGain).toHaveBeenCalledOnce();
		context.resumes[1].resolve();
		await newerStart;
		expect(context.oscillators).toHaveLength(4);
		expect(vi.getTimerCount()).toBe(1);
		context.resumes[0].resolve();
		await olderStart;
		expect(context.oscillators).toHaveLength(4);
		expect(vi.getTimerCount()).toBe(1);
		const restarted = sound.start();
		context.resumes[2].resolve();
		await restarted;
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(1_100);
		expect(vi.getTimerCount()).toBe(1);
		sound.dispose();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('replaces the old cadence when changing between bells and dhak', async () => {
		const sound = new AtelierSound();
		const starting = sound.start();
		const context = contexts[0];
		context.resumes[0].resolve();
		await starting;
		expect(context.oscillators).toHaveLength(4);
		sound.setMode('dhak');
		expect(context.oscillators).toHaveLength(5);
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(479);
		expect(context.oscillators).toHaveLength(5);
		vi.advanceTimersByTime(1);
		expect(context.oscillators).toHaveLength(6);
		sound.setMode('bells');
		expect(context.oscillators).toHaveLength(10);
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(480);
		expect(context.oscillators).toHaveLength(10);
		vi.advanceTimersByTime(8_320);
		expect(context.oscillators).toHaveLength(14);
		expect(vi.getTimerCount()).toBe(1);
		sound.dispose();
	});

	it('disconnects completed tones and leaves no scheduled work after stop and disposal', async () => {
		const sound = new AtelierSound();
		const starting = sound.start();
		const context = contexts[0];
		context.resumes[0].resolve();
		await starting;
		for (const oscillator of context.oscillators) oscillator.onended?.();
		for (const oscillator of context.oscillators) {
			expect(oscillator.stop).toHaveBeenCalledWith(context.currentTime + 2.8);
			expect(oscillator.disconnect).toHaveBeenCalledOnce();
		}
		for (const envelope of context.gains.slice(1))
			expect(envelope.disconnect).toHaveBeenCalledOnce();
		await sound.stop();
		expect(vi.getTimerCount()).toBe(0);
		const oscillatorCount = context.oscillators.length;
		sound.setMode('dhak');
		sound.bell();
		vi.advanceTimersByTime(15_000);
		expect(context.oscillators).toHaveLength(oscillatorCount);
		sound.dispose();
		sound.dispose();
		expect(context.close).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});
});
