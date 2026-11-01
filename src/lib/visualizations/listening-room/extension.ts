import { normalizeAudioSettings, type AudioSettings } from './dsp';

export interface ExtensionStatus {
	installed: boolean;
	active: boolean;
	error: string;
}

/** The page cannot begin capture. Only an explicit extension toolbar click can. */
export function connectListeningExtension(onStatus: (status: ExtensionStatus) => void) {
	let lastSeen = 0;
	let previous = '';
	let active = false;
	const stopWaiters = new Set<(stopped: boolean) => void>();
	const send = (type: 'hello' | 'settings' | 'stop', settings?: AudioSettings) => {
		window.postMessage(
			{ channel: 'listening-room:page', v: 1, type, settings },
			window.location.origin
		);
	};
	const receive = (event: MessageEvent) => {
		if (event.source !== window || event.origin !== window.location.origin) return;
		const data = event.data;
		if (
			!data ||
			data.channel !== 'listening-room:extension' ||
			data.v !== 1 ||
			data.installed !== true ||
			typeof data.active !== 'boolean'
		)
			return;
		lastSeen = Date.now();
		active = data.active;
		if (!active) for (const done of stopWaiters) done(true);
		onStatus({
			installed: true,
			active: data.active,
			error: typeof data.error === 'string' ? data.error.slice(0, 300) : ''
		});
	};
	window.addEventListener('message', receive);
	send('hello');
	const heartbeat = window.setInterval(() => {
		if (lastSeen && Date.now() - lastSeen > 7000) {
			lastSeen = 0;
			previous = '';
			onStatus({ installed: false, active: false, error: '' });
		}
		send('hello');
	}, 2500);
	return {
		settings(value: AudioSettings, force = false) {
			// YouTube already applies volume/mute before capture. Do not apply them twice.
			const settings = { ...normalizeAudioSettings(value), volume: 100 };
			const serialized = JSON.stringify(settings);
			if (!force && serialized === previous) return;
			previous = serialized;
			send('settings', settings);
		},
		stop() {
			send('stop');
		},
		stopAndWait(): Promise<boolean> {
			if (!active) return Promise.resolve(true);
			return new Promise((resolve) => {
				const done = (stopped: boolean) => {
					window.clearTimeout(timeout);
					stopWaiters.delete(done);
					resolve(stopped);
				};
				const timeout = window.setTimeout(() => done(false), 3000);
				stopWaiters.add(done);
				send('stop');
			});
		},
		destroy() {
			send('stop');
			for (const done of stopWaiters) done(false);
			window.removeEventListener('message', receive);
			window.clearInterval(heartbeat);
		}
	};
}
