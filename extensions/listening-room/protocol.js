import { normalizeAudioSettings } from './dsp.js';

export const SETTINGS_KEY = 'listening-room:sound:v1';

export function isListeningRoomUrl(value) {
	try {
		const url = new URL(value);
		return (
			url.protocol === 'https:' &&
			!url.username &&
			!url.password &&
			!url.port &&
			['www.suvroghosh.in', 'suvroghosh.in'].includes(url.hostname) &&
			['/blog/visualizations/listening-room', '/blog/visualizations/listening-room/'].includes(
				url.pathname
			)
		);
	} catch {
		return false;
	}
}

export function soundSettings(value) {
	// YouTube owns volume and mute. Applying them here would attenuate twice.
	return { ...normalizeAudioSettings(value), volume: 100 };
}

export function isPageSender(sender, extensionId) {
	return (
		sender.id === extensionId &&
		sender.frameId === 0 &&
		Number.isInteger(sender.tab?.id) &&
		isListeningRoomUrl(sender.url) &&
		isListeningRoomUrl(sender.tab.url)
	);
}
