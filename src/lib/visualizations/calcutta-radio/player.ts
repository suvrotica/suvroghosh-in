import { claimPlayback, releasePlayback } from '$lib/components/blog/tts/playback';
import type Hls from 'hls.js';
import type { RadioStation } from './stations';

export type RadioState = {
	status: 'ready' | 'connecting' | 'playing' | 'stopped' | 'unavailable';
	stationId: string | null;
	error: string;
	volume: number;
	muted: boolean;
	sleepEndsAt: number | null;
};

/** One owner for live audio. Every new source invalidates pending work from the old one. */
export function createRadioPlayer(
	onChange: (state: RadioState) => void,
	createAudio: () => HTMLAudioElement = () => new Audio()
) {
	let state: RadioState = {
		status: 'ready',
		stationId: null,
		error: '',
		volume: 0.65,
		muted: false,
		sleepEndsAt: null
	};
	const owner = {};
	let audio: HTMLAudioElement | null = null;
	let hls: Hls | null = null;
	let revision = 0;
	let destroyed = false;
	let currentStation: RadioStation | null = null;
	let watchdog: ReturnType<typeof setTimeout> | undefined;
	let sleepTimer: ReturnType<typeof setTimeout> | undefined;
	let ownsSession = false;
	const mediaSession = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;

	function update(patch: Partial<RadioState>) {
		state = { ...state, ...patch };
		if (!destroyed) onChange({ ...state });
	}

	function clearWatchdog() {
		clearTimeout(watchdog);
		watchdog = undefined;
	}

	function disposeSource() {
		revision++;
		clearWatchdog();
		const previous = audio;
		audio = null;
		if (previous) {
			previous.onplaying = previous.onwaiting = previous.onstalled = null;
			previous.onerror = previous.onended = previous.onpause = null;
			previous.pause();
		}
		hls?.destroy();
		hls = null;
		if (previous) {
			previous.removeAttribute('src');
			previous.load();
			previous.remove();
		}
	}

	function clearSession() {
		if (ownsSession && mediaSession) {
			for (const action of ['play', 'pause', 'stop'] as const) {
				try {
					mediaSession.setActionHandler(action, null);
				} catch {
					/* optional API */
				}
			}
			mediaSession.playbackState = 'none';
			mediaSession.metadata = null;
		}
		ownsSession = false;
		releasePlayback(owner);
	}

	function clearSleep() {
		clearTimeout(sleepTimer);
		sleepTimer = undefined;
	}

	function stop() {
		disposeSource();
		clearSleep();
		clearSession();
		update({ status: 'stopped', error: '', sleepEndsAt: null });
	}

	function fail(message: string) {
		disposeSource();
		clearSleep();
		clearSession();
		update({ status: 'unavailable', error: message, sleepEndsAt: null });
	}

	function armWatchdog(token: number) {
		if (watchdog) return;
		watchdog = setTimeout(() => {
			if (revision === token && !destroyed)
				fail('This station is taking too long to respond. Try again or choose another station.');
		}, 18_000);
	}

	async function play(station: RadioStation) {
		if (destroyed) return;
		disposeSource();
		claimPlayback(owner, stop);
		currentStation = station;
		const token = revision;
		const element = createAudio();
		audio = element;
		element.preload = 'none';
		element.volume = state.volume;
		element.muted = state.muted;
		element.hidden = true;
		element.dataset.calcuttaRadioAudio = '';
		if (typeof document !== 'undefined') document.body.append(element);
		const valid = () => !destroyed && token === revision && audio === element;
		update({ status: 'connecting', stationId: station.id, error: '' });
		armWatchdog(token);

		function playRejected(error: unknown) {
			if (!valid()) return;
			fail(
				error instanceof Error && error.name === 'NotAllowedError'
					? 'Your browser needs another tap. Press Retry to start listening.'
					: 'This station could not play. Try again or open its official website.'
			);
		}
		const start = () => {
			if (valid()) void element.play().catch(playRejected);
		};
		element.onplaying = () => {
			if (!valid()) return;
			clearWatchdog();
			update({ status: 'playing', error: '' });
			if (mediaSession) mediaSession.playbackState = 'playing';
		};
		const waiting = () => {
			if (!valid()) return;
			update({ status: 'connecting' });
			armWatchdog(token);
		};
		element.onwaiting = waiting;
		element.onstalled = () => {
			if (!valid()) return;
			// "stalled" concerns network fetching, not necessarily playback. Native
			// HLS can emit it while buffered audio continues normally. If that buffer
			// actually runs out, "waiting" starts the bounded recovery deadline.
			if (state.status === 'playing' && !element.paused && element.readyState >= 3) return;
			waiting();
		};
		element.onpause = () => {
			if (valid() && state.status === 'playing') stop();
		};
		element.onerror = () => {
			if (!valid()) return;
			if (hls) {
				// Let hls.js classify and recover a decoder failure. The deadline also
				// covers failures for which the library never emits a fatal error.
				update({ status: 'connecting' });
				armWatchdog(token);
			} else {
				fail('The stream is unavailable in this browser. Retry or use the official website.');
			}
		};
		element.onended = () => {
			if (valid()) fail('The station ended its stream. Retry to reconnect.');
		};
		if (mediaSession) {
			ownsSession = true;
			if (typeof MediaMetadata !== 'undefined')
				mediaSession.metadata = new MediaMetadata({
					title: station.name,
					artist: 'Calcutta Radio',
					album: 'Live internet radio'
				});
			try {
				mediaSession.setActionHandler('play', () => {
					if (currentStation) void play(currentStation);
				});
				mediaSession.setActionHandler('pause', stop);
				mediaSession.setActionHandler('stop', stop);
			} catch {
				/* unsupported action; on-page controls remain available */
			}
		}

		try {
			if (station.streamType === 'audio' || element.canPlayType('application/vnd.apple.mpegurl')) {
				element.src = station.streamUrl;
				start();
				return;
			}
			const { default: HlsPlayer } = await import('hls.js');
			if (!valid()) return;
			if (!HlsPlayer.isSupported()) {
				fail('This browser cannot play this stream. Use the station’s official website.');
				return;
			}
			const instance = new HlsPlayer({
				enableWorker: true,
				// Radio metadata is not displayed. Avoid the library's unused data: WEBVTT tracks.
				enableID3MetadataCues: false,
				enableEmsgMetadataCues: false,
				enableDateRangeMetadataCues: false,
				backBufferLength: 0,
				maxBufferLength: 15,
				manifestLoadingTimeOut: 10_000,
				manifestLoadingMaxRetry: 1,
				levelLoadingTimeOut: 10_000,
				levelLoadingMaxRetry: 1,
				fragLoadingTimeOut: 10_000,
				fragLoadingMaxRetry: 1
			});
			hls = instance;
			let recovered = false;
			instance.on(HlsPlayer.Events.ERROR, (_event, data) => {
				if (!valid() || !data.fatal) return;
				if (data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR && !recovered) {
					recovered = true;
					// Recovery reloads the media element and may dispatch pause. Keep
					// that internal pause from being treated as a user-requested stop,
					// and resume only after the new MediaSource has been attached.
					update({ status: 'connecting' });
					armWatchdog(token);
					instance.once(HlsPlayer.Events.MEDIA_ATTACHED, start);
					instance.recoverMediaError();
				} else fail('The station could not be reached. Retry or choose another station.');
			});
			instance.on(HlsPlayer.Events.MANIFEST_PARSED, start);
			instance.attachMedia(element);
			instance.loadSource(station.streamUrl);
		} catch (error) {
			playRejected(error);
		}
	}

	function setSleep(minutes: number) {
		clearSleep();
		const duration = [15, 30, 60].includes(minutes) ? minutes * 60_000 : 0;
		const end = duration ? Date.now() + duration : null;
		update({ sleepEndsAt: end });
		if (duration) sleepTimer = setTimeout(stop, duration);
	}

	function checkSleep() {
		if (state.sleepEndsAt !== null && Date.now() >= state.sleepEndsAt) stop();
	}
	function offline() {
		if (state.status === 'playing' || state.status === 'connecting')
			fail('You are offline. Reconnect to the internet, then press Retry.');
	}
	if (typeof window !== 'undefined') {
		window.addEventListener('offline', offline);
		window.addEventListener('pageshow', checkSleep);
		window.addEventListener('pagehide', stop);
		document.addEventListener('visibilitychange', checkSleep);
	}
	onChange({ ...state });
	return {
		play,
		stop,
		setSleep,
		setVolume(volume: number) {
			if (!Number.isFinite(volume)) return;
			const value = Math.max(0, Math.min(1, volume));
			if (audio) audio.volume = value;
			update({ volume: value });
		},
		setMuted(muted: boolean) {
			if (audio) audio.muted = muted;
			update({ muted });
		},
		destroy() {
			stop();
			destroyed = true;
			if (typeof window !== 'undefined') {
				window.removeEventListener('offline', offline);
				window.removeEventListener('pageshow', checkSleep);
				window.removeEventListener('pagehide', stop);
				document.removeEventListener('visibilitychange', checkSleep);
			}
		}
	};
}
