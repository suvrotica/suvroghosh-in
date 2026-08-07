/** Create the atlas Worker lazily so opening the article does not initialize an expensive solver. */
export function createReactionDiffusionAtlasWorker(): Worker {
	if (typeof Worker === 'undefined')
		throw new Error('Web Workers are unavailable in this browser.');
	return new Worker(new URL('./atlas.worker.ts', import.meta.url), {
		type: 'module',
		name: 'gray-scott-feed-kill-atlas'
	});
}
