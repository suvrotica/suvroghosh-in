import { analyzePrompt } from './analysis';

self.onmessage = (event: MessageEvent<{ text: string }>) => {
	try {
		self.postMessage({ ontology: analyzePrompt(event.data.text) });
	} catch (error) {
		self.postMessage({
			error: error instanceof Error ? error.message : 'Analysis could not finish.'
		});
	}
};
