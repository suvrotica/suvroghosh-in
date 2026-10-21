import { simulate } from './engine';
import type { Settings } from './types';

self.onmessage = (
	event: MessageEvent<{ id: number; settings: Settings; baseline: Settings | null }>
) => {
	const { id, settings, baseline } = event.data;
	try {
		self.postMessage({
			id,
			run: simulate(settings),
			baseline: baseline ? simulate(baseline) : null
		});
	} catch (error) {
		self.postMessage({ id, error: error instanceof Error ? error.message : 'Simulation failed.' });
	}
};
