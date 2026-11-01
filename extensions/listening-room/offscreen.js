import { createSoundGraph } from './graph.js';

let session;
let generation = 0;
let cancelPending;

async function stop() {
	generation++;
	const cancel = cancelPending;
	cancelPending = undefined;
	cancel?.();
	const previous = session;
	session = undefined;
	if (!previous) return;
	previous.graph?.destroy();
	previous.source?.disconnect();
	previous.stream?.getTracks().forEach((track) => track.stop());
	if (previous.context && previous.context.state !== 'closed') await previous.context.close();
}

async function start(message) {
	await stop();
	const current = ++generation;
	let timer;
	let cancelCapture;
	const cancelled = new Promise((_, reject) => {
		cancelCapture = () => reject(new Error('Audio capture was cancelled.'));
	});
	cancelPending = cancelCapture;
	// The same budget covers stream acquisition and AudioContext startup.
	const deadline = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error('Tab audio processing timed out.')), 10000);
	});
	const capture = navigator.mediaDevices.getUserMedia({
		audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: message.streamId } },
		video: false
	});
	// A timed-out request can still resolve. Never leave its late stream capturing.
	void capture
		.then((stream) => {
			if (current !== generation) stream.getTracks().forEach((track) => track.stop());
		})
		.catch(() => {});
	try {
		const stream = await Promise.race([capture, cancelled, deadline]);
		if (current !== generation) return { active: false };
		session = { tabId: message.tabId, stream };
		if (!stream.getAudioTracks().length)
			throw new Error('This tab did not provide an audio track.');
		const context = new AudioContext();
		session.context = context;
		const source = context.createMediaStreamSource(stream);
		session.source = source;
		session.graph = createSoundGraph(context, source, message.settings);
		await Promise.race([context.resume(), cancelled, deadline]);
		if (current !== generation) return { active: false };
		if (context.state !== 'running')
			throw new Error('Audio processing could not start. Click the extension again.');
		for (const track of stream.getAudioTracks()) {
			track.addEventListener(
				'ended',
				() => {
					if (current !== generation) return;
					void stop()
						.then(() =>
							chrome.runtime.sendMessage({
								target: 'worker',
								type: 'capture-ended',
								tabId: message.tabId
							})
						)
						.catch(() => {});
				},
				{ once: true }
			);
		}
		return { active: true, tabId: message.tabId };
	} catch (error) {
		if (current === generation) await stop();
		throw error;
	} finally {
		clearTimeout(timer);
		if (cancelPending === cancelCapture) cancelPending = undefined;
	}
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
	if (sender.id !== chrome.runtime.id || message?.target !== 'offscreen') return;
	let work;
	if (message.type === 'start') work = start(message);
	else if (message.type === 'stop') work = stop().then(() => ({ active: false }));
	else if (message.type === 'settings') {
		if (session?.tabId === message.tabId) session.graph?.setSettings(message.settings);
		work = Promise.resolve({ active: Boolean(session), tabId: session?.tabId });
	} else if (message.type === 'status') {
		work = Promise.resolve({ active: Boolean(session?.graph), tabId: session?.tabId });
	} else return;
	void work.then(respond, (error) =>
		respond({
			active: false,
			error: error instanceof Error ? error.message : 'Audio processing could not start.'
		})
	);
	return true;
});
