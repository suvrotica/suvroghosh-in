import { analyseLocally } from './analysis';
import type { StudioSource } from './types';

self.onmessage = (
	event: MessageEvent<{
		sources: StudioSource[];
		focus: string;
		depth: 'overview' | 'detailed' | 'research';
	}>
) => {
	try {
		const { sources, focus, depth } = event.data;
		self.postMessage({ project: analyseLocally(sources, focus, depth) });
	} catch (error) {
		self.postMessage({
			error: error instanceof Error ? error.message : 'Could not prepare this outline.'
		});
	}
};
