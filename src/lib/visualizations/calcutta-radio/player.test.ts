import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimPlayback, releasePlayback } from '$lib/components/blog/tts/playback';
import { createRadioPlayer, type RadioState } from './player';
import type { RadioStation } from './stations';

type MockHlsInstance = {
	media: FakeAudio | null;
	destroy: ReturnType<typeof vi.fn>;
	recoverMediaError: ReturnType<typeof vi.fn>;
	emit: (event: string, data?: { fatal: boolean; type: string }) => void;
};

const hlsControl = vi.hoisted(() => ({ instances: [] as MockHlsInstance[] }));
vi.mock('hls.js', () => {
	type Callback = (event: string, data?: { fatal: boolean; type: string }) => void;
	class MockHls {
		static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifest', MEDIA_ATTACHED: 'attached' };
		static ErrorTypes = { MEDIA_ERROR: 'media', NETWORK_ERROR: 'network' };
		static isSupported = () => true;
		media: FakeAudio | null = null;
		private handlers = new Map<string, Callback[]>();
		constructor() {
			hlsControl.instances.push(this);
		}
		on(event: string, callback: Callback) {
			this.handlers.set(event, [...(this.handlers.get(event) ?? []), callback]);
		}
		once(event: string, callback: Callback) {
			const once: Callback = (...args) => {
				this.handlers.set(
					event,
					(this.handlers.get(event) ?? []).filter((fn) => fn !== once)
				);
				callback(...args);
			};
			this.on(event, once);
		}
		emit(event: string, data?: { fatal: boolean; type: string }) {
			for (const callback of this.handlers.get(event) ?? []) callback(event, data);
		}
		attachMedia(media: FakeAudio) {
			this.media = media;
		}
		loadSource() {}
		destroy = vi.fn();
		recoverMediaError = vi.fn(() => {
			// Reloading the MediaSource pauses the old media resource. Reattachment
			// is emitted separately so the test can inspect the connecting state.
			this.media?.onpause?.();
		});
	}
	return { default: MockHls };
});

class FakeAudio {
	preload = '';
	volume = 1;
	muted = false;
	paused = false;
	readyState = 0;
	hidden = false;
	dataset = {};
	src = '';
	onplaying: (() => void) | null = null;
	onwaiting: (() => void) | null = null;
	onstalled: (() => void) | null = null;
	onpause: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onended: (() => void) | null = null;
	play = vi.fn(() => Promise.resolve());
	pause = vi.fn();
	load = vi.fn();
	remove = vi.fn();
	removeAttribute = vi.fn(() => {
		this.src = '';
	});
	canPlayType = () => 'probably';
}
const station = (id: string) =>
	({
		id,
		name: id,
		streamUrl: `https://radio.example/${id}.mp3`,
		streamType: 'audio'
	}) as RadioStation;

describe('Calcutta Radio playback ownership and lifecycle', () => {
	let elements: FakeAudio[];
	let nativeHls: boolean;
	let state: RadioState;
	let player: ReturnType<typeof createRadioPlayer>;
	beforeEach(() => {
		vi.useFakeTimers();
		elements = [];
		nativeHls = true;
		hlsControl.instances.length = 0;
		player = createRadioPlayer(
			(value) => {
				state = value;
			},
			() => {
				const audio = new FakeAudio();
				audio.canPlayType = () => (nativeHls ? 'probably' : '');
				elements.push(audio);
				return audio as unknown as HTMLAudioElement;
			}
		);
	});
	afterEach(() => {
		player.destroy();
		vi.useRealTimers();
	});

	it('does not load audio before Play, and reports Playing only after a media event', async () => {
		expect(elements).toHaveLength(0);
		expect(state.status).toBe('ready');
		await player.play(station('one'));
		expect(state.status).toBe('connecting');
		elements[0].onplaying?.();
		expect(state.status).toBe('playing');
		player.stop();
		expect(elements[0].pause).toHaveBeenCalled();
		expect(elements[0].src).toBe('');
		expect(elements[0].remove).toHaveBeenCalled();
		expect(state.status).toBe('stopped');
	});

	it('ignores an old source event after switching', async () => {
		await player.play(station('one'));
		const latePlaying = elements[0].onplaying;
		await player.play(station('two'));
		latePlaying?.();
		expect(state.status).toBe('connecting');
		expect(state.stationId).toBe('two');
		expect(elements[0].src).toBe('');
		elements[1].onplaying?.();
		expect(state.status).toBe('playing');
	});

	it('ignores a delayed play-promise rejection from the replaced source', async () => {
		let rejectOld!: (reason: Error) => void;
		const oldPlay = new Promise<void>((_resolve, reject) => {
			rejectOld = reject;
		});
		const first = station('one');
		nativeHls = false;
		await player.play({ ...first, streamType: 'hls' });
		elements[0].play.mockReturnValueOnce(oldPlay);
		hlsControl.instances[0].emit('manifest');
		await player.play(station('two'));
		elements[1].onplaying?.();
		rejectOld(new Error('The replaced play request was aborted'));
		await Promise.resolve();
		expect(state.stationId).toBe('two');
		expect(state.status).toBe('playing');
		expect(elements[1].src).toBe('https://radio.example/two.mp3');
	});

	it('destroys HLS when switching to native audio and ignores stale HLS callbacks', async () => {
		nativeHls = false;
		await player.play({ ...station('one'), streamType: 'hls' });
		const oldHls = hlsControl.instances[0];
		oldHls.emit('manifest');
		elements[0].onplaying?.();
		await player.play(station('two'));
		expect(oldHls.destroy).toHaveBeenCalledOnce();
		expect(elements[0].remove).toHaveBeenCalledOnce();
		oldHls.emit('manifest');
		oldHls.emit('error', { fatal: true, type: 'network' });
		expect(elements[0].play).toHaveBeenCalledOnce();
		expect(state.stationId).toBe('two');
		expect(state.status).toBe('connecting');
		elements[1].onplaying?.();
		expect(state.status).toBe('playing');
	});

	it('does not attach HLS if a native source replaces its pending import', async () => {
		nativeHls = false;
		const pendingHls = player.play({ ...station('one'), streamType: 'hls' });
		await player.play(station('two'));
		await pendingHls;
		expect(hlsControl.instances).toHaveLength(0);
		expect(elements[0].src).toBe('');
		expect(state.stationId).toBe('two');
	});

	it('recovers one HLS decoder failure without interpreting its reload pause as Stop', async () => {
		nativeHls = false;
		await player.play({ ...station('one'), streamType: 'hls' });
		const instance = hlsControl.instances[0];
		instance.emit('manifest');
		elements[0].onplaying?.();
		// Native error notification precedes HLS's classification of the decoder error.
		elements[0].onerror?.();
		expect(state.status).toBe('connecting');
		expect(instance.destroy).not.toHaveBeenCalled();
		instance.emit('error', { fatal: true, type: 'media' });
		expect(instance.recoverMediaError).toHaveBeenCalledOnce();
		expect(state.status).toBe('connecting');
		instance.emit('attached');
		expect(elements[0].play).toHaveBeenCalledTimes(2);
		elements[0].onplaying?.();
		expect(state.status).toBe('playing');
		await vi.advanceTimersByTimeAsync(18_001);
		expect(state.status).toBe('playing');
		instance.emit('error', { fatal: true, type: 'media' });
		expect(state.status).toBe('unavailable');
		expect(instance.recoverMediaError).toHaveBeenCalledOnce();
		expect(instance.destroy).toHaveBeenCalledOnce();
	});

	it('bounds an HLS decoder error even if the library never completes recovery', async () => {
		nativeHls = false;
		await player.play({ ...station('one'), streamType: 'hls' });
		elements[0].onplaying?.();
		elements[0].onerror?.();
		await vi.advanceTimersByTimeAsync(18_001);
		expect(state.status).toBe('unavailable');
		expect(hlsControl.instances[0].destroy).toHaveBeenCalledOnce();
		expect(elements[0].src).toBe('');
	});

	it('stops a stalled station after a bounded wait and releases resources', async () => {
		await player.play(station('one'));
		elements[0].onplaying?.();
		elements[0].onwaiting?.();
		await vi.advanceTimersByTimeAsync(18_001);
		expect(state.status).toBe('unavailable');
		expect(state.error).toContain('too long');
		expect(elements[0].src).toBe('');
	});

	it('keeps buffered native HLS playing after a network stalled event', async () => {
		await player.play({ ...station('one'), streamType: 'hls' });
		expect(hlsControl.instances).toHaveLength(0);
		elements[0].readyState = 4;
		elements[0].onplaying?.();
		elements[0].onstalled?.();
		expect(state.status).toBe('playing');
		await vi.advanceTimersByTimeAsync(18_001);
		expect(state.status).toBe('playing');
		expect(elements[0].src).toBe('https://radio.example/one.mp3');
		// The same source must still time out once its buffered audio runs out.
		elements[0].readyState = 2;
		elements[0].onwaiting?.();
		expect(state.status).toBe('connecting');
		await vi.advanceTimersByTimeAsync(18_001);
		expect(state.status).toBe('unavailable');
		expect(elements[0].src).toBe('');
	});

	it('bounds a native HLS stalled event when there is no future buffered audio', async () => {
		await player.play({ ...station('one'), streamType: 'hls' });
		elements[0].readyState = 2;
		elements[0].onplaying?.();
		elements[0].onstalled?.();
		expect(state.status).toBe('connecting');
		await vi.advanceTimersByTimeAsync(18_001);
		expect(state.status).toBe('unavailable');
		expect(elements[0].src).toBe('');
	});

	it('preserves a sleep deadline when switching stations and stops at expiry', async () => {
		await player.play(station('one'));
		elements[0].onplaying?.();
		player.setSleep(15);
		const end = state.sleepEndsAt;
		await vi.advanceTimersByTimeAsync(60_000);
		await player.play(station('two'));
		elements[1].onplaying?.();
		expect(state.sleepEndsAt).toBe(end);
		await vi.advanceTimersByTimeAsync(14 * 60_000);
		expect(state.status).toBe('stopped');
		expect(state.sleepEndsAt).toBeNull();
		expect(elements[1].src).toBe('');
	});

	it('cancels sleep and connection timers on stop or destruction', async () => {
		await player.play(station('one'));
		player.setSleep(30);
		player.stop();
		await vi.advanceTimersByTimeAsync(31 * 60_000);
		expect(state.status).toBe('stopped');
		expect(vi.getTimerCount()).toBe(0);
		player.destroy();
		await player.play(station('two'));
		expect(elements).toHaveLength(1);
	});

	it('coordinates with the existing article narration owner in both directions', async () => {
		const narrationOwner = {};
		const narrationStop = vi.fn(() => releasePlayback(narrationOwner));
		claimPlayback(narrationOwner, narrationStop);
		await player.play(station('one'));
		expect(narrationStop).toHaveBeenCalledOnce();
		elements[0].onplaying?.();
		claimPlayback(narrationOwner, narrationStop);
		expect(state.status).toBe('stopped');
		expect(elements[0].src).toBe('');
		releasePlayback(narrationOwner);
	});

	it('keeps valid volume and mute settings across station switches', async () => {
		player.setVolume(0.3);
		player.setMuted(true);
		await player.play(station('one'));
		expect(elements[0].volume).toBe(0.3);
		expect(elements[0].muted).toBe(true);
		player.setVolume(Number.NaN);
		expect(state.volume).toBe(0.3);
		player.setVolume(4);
		expect(state.volume).toBe(1);
		await player.play(station('two'));
		expect(elements[1].volume).toBe(1);
		expect(elements[1].muted).toBe(true);
	});
});
