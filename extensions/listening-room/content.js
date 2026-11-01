(() => {
	const url = new URL(location.href);
	if (
		window !== window.top ||
		url.protocol !== 'https:' ||
		url.port ||
		!['www.suvroghosh.in', 'suvroghosh.in'].includes(url.hostname) ||
		!['/blog/visualizations/listening-room', '/blog/visualizations/listening-room/'].includes(
			url.pathname
		)
	)
		return;
	if (globalThis.__listeningRoomEqualiserBridgeV1) return;
	globalThis.__listeningRoomEqualiserBridgeV1 = true;
	let disposed = false;
	const send = (type, settings) => chrome.runtime.sendMessage({ target: 'worker', type, settings });
	function publish(status) {
		if (disposed) return;
		window.postMessage(
			{
				channel: 'listening-room:extension',
				v: 1,
				installed: true,
				active: status?.active === true,
				...(typeof status?.error === 'string' ? { error: status.error } : {})
			},
			location.origin
		);
	}
	async function status() {
		try {
			publish(await send('hello'));
		} catch {
			/* Extension updates invalidate the old content script. A reload reconnects it. */
		}
	}
	const receive = (event) => {
		if (
			event.source !== window ||
			event.origin !== location.origin ||
			event.data?.channel !== 'listening-room:page' ||
			event.data.v !== 1
		)
			return;
		if (!['hello', 'settings', 'stop'].includes(event.data.type)) return;
		if (event.data.type === 'settings') {
			void send('settings', event.data.settings).catch(() => {});
		} else {
			void send(event.data.type)
				.then(publish)
				.catch(() => {});
		}
	};
	window.addEventListener('message', receive);
	const poll = setInterval(() => {
		if (!document.hidden) void status();
	}, 1500);
	window.addEventListener(
		'pagehide',
		() => {
			disposed = true;
			globalThis.__listeningRoomEqualiserBridgeV1 = false;
			clearInterval(poll);
			window.removeEventListener('message', receive);
			void send('stop').catch(() => {});
		},
		{ once: true }
	);
	chrome.runtime.onMessage.addListener((message, sender, respond) => {
		if (disposed) return;
		if (
			sender.id === chrome.runtime.id &&
			message?.target === 'bridge' &&
			message.type === 'check'
		) {
			respond({ connected: true });
			return;
		}
		if (sender.id === chrome.runtime.id && message?.target === 'page') publish(message);
	});
	void status();
})();
