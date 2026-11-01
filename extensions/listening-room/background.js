import { SETTINGS_KEY, isListeningRoomUrl, isPageSender, soundSettings } from './protocol.js';

const offscreenUrl = chrome.runtime.getURL('offscreen.html');
let queue = Promise.resolve();
let lastError = new Map();
const navigationEpoch = new Map();
let startingTab;
const serial = (work) => {
	const result = queue.then(work, work);
	queue = result.catch(() => {});
	return result;
};
const contexts = () =>
	chrome.runtime.getContexts({
		contextTypes: ['OFFSCREEN_DOCUMENT'],
		documentUrls: [offscreenUrl]
	});
const audio = (type, rest = {}) =>
	chrome.runtime.sendMessage({ target: 'offscreen', type, ...rest });
async function status(tabId) {
	const current = (await contexts()).length ? await audio('status') : { active: false };
	return {
		active: current.active === true && current.tabId === tabId,
		...(lastError.has(tabId) ? { error: lastError.get(tabId) } : {})
	};
}
async function publish(tabId) {
	if (!Number.isInteger(tabId)) return;
	const current = await status(tabId);
	await chrome.action.setBadgeText({ tabId, text: current.active ? 'ON' : '' });
	await chrome.action.setTitle({
		tabId,
		title: current.active
			? 'Stop Listening Room equaliser'
			: 'Start Listening Room equaliser for this tab'
	});
	await chrome.tabs.sendMessage(tabId, { target: 'page', ...current }).catch(() => {});
}
async function stop(tabId) {
	if (!(await contexts()).length) return;
	const current = await audio('status');
	if (tabId !== undefined && current.tabId !== tabId) return;
	await audio('stop');
	await chrome.offscreen.closeDocument();
	if (current.tabId !== undefined) await publish(current.tabId).catch(() => {});
}

chrome.action.onClicked.addListener((tab) => {
	void serial(async () => {
		if (!Number.isInteger(tab.id) || !isListeningRoomUrl(tab.url)) {
			if (Number.isInteger(tab.id)) {
				await chrome.action.setTitle({
					tabId: tab.id,
					title: 'Open Listening Room on suvroghosh.in first.'
				});
			}
			return;
		}
		lastError.delete(tab.id);
		if ((await status(tab.id)).active) {
			await stop(tab.id);
			return;
		}
		await stop();
		const epoch = navigationEpoch.get(tab.id) || 0;
		const cancelled = () => epoch !== (navigationEpoch.get(tab.id) || 0);
		startingTab = tab.id;
		try {
			// Svelte navigation from Apps does not run declarative content scripts.
			// The toolbar click grants activeTab for this exact, checked destination.
			let bridge = await chrome.tabs
				.sendMessage(tab.id, { target: 'bridge', type: 'check' })
				.catch(() => null);
			if (!bridge?.connected) {
				const currentTab = await chrome.tabs.get(tab.id);
				if (!isListeningRoomUrl(currentTab.url))
					throw new Error('Open Listening Room before starting the equaliser.');
				await chrome.scripting.executeScript({
					target: { tabId: tab.id, frameIds: [0] },
					files: ['content.js']
				});
				bridge = await chrome.tabs
					.sendMessage(tab.id, { target: 'bridge', type: 'check' })
					.catch(() => null);
				if (!bridge?.connected)
					throw new Error('Reload Listening Room, then click the extension again.');
			}
			const stored = await chrome.storage.local.get(SETTINGS_KEY);
			const settings = soundSettings(stored[SETTINGS_KEY]);
			if (cancelled()) return;
			await chrome.offscreen.createDocument({
				url: 'offscreen.html',
				reasons: ['USER_MEDIA'],
				justification: 'Process only the Listening Room tab audio locally through its equaliser.'
			});
			const currentTab = await chrome.tabs.get(tab.id);
			if (cancelled() || !isListeningRoomUrl(currentTab.url)) {
				await stop();
				return;
			}
			const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
			if (cancelled()) {
				await stop();
				return;
			}
			const result = await audio('start', { streamId, tabId: tab.id, settings });
			if (cancelled()) {
				await stop();
				return;
			}
			if (!result?.active) throw new Error(result?.error || 'The tab equaliser could not start.');
		} catch (error) {
			await stop().catch(() => {});
			if (!cancelled())
				lastError.set(
					tab.id,
					error instanceof Error ? error.message : 'The tab equaliser could not start.'
				);
		} finally {
			startingTab = undefined;
		}
		await publish(tab.id);
	}).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
	if (message?.target !== 'worker') return;
	if (
		sender.id === chrome.runtime.id &&
		sender.url === offscreenUrl &&
		message.type === 'capture-ended'
	) {
		void serial(() => stop())
			.then(() => publish(message.tabId))
			.then(
				() => respond({ active: false }),
				() => respond({ active: false })
			);
		return true;
	}
	if (
		!isPageSender(sender, chrome.runtime.id) ||
		!['hello', 'settings', 'stop'].includes(message.type)
	)
		return;
	// A source switch must cancel an outstanding capture now, rather than wait
	// behind it in the worker's serial queue.
	if (message.type === 'stop') navigationStop(sender.tab.id);
	void serial(async () => {
		const tabId = sender.tab.id;
		if (message.type === 'settings') {
			const settings = soundSettings(message.settings);
			await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
			if ((await contexts()).length) await audio('settings', { tabId, settings });
			return { ok: true };
		}
		if (message.type === 'stop') {
			lastError.delete(tabId);
			await stop(tabId);
		}
		return status(tabId);
	}).then(respond, () =>
		respond({
			active: false,
			error: 'The equaliser connection was interrupted. Reload the page and try again.'
		})
	);
	return true;
});

function navigationStop(tabId) {
	navigationEpoch.set(tabId, (navigationEpoch.get(tabId) || 0) + 1);
	// Do not wait for a stalled capture request before cancelling it. The
	// offscreen owner fences late streams with its own generation counter.
	if (startingTab === tabId) void audio('stop').catch(() => {});
	void serial(() => stop(tabId)).catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => {
	lastError.delete(tabId);
	navigationStop(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
	if (change.status === 'loading' || (change.url && !isListeningRoomUrl(change.url)))
		navigationStop(tabId);
});
