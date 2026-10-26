import { analyzeEssay } from './model';

self.onmessage = (event: MessageEvent<{ text: string; title: string }>) => {
	try {
		const document = analyzeEssay(event.data.text, {
			id: 'local-specimen',
			title: event.data.title || 'An unnamed specimen',
			author: 'Your local text',
			format: 'text'
		});
		self.postMessage({ document });
	} catch (error) {
		self.postMessage({
			error: error instanceof Error ? error.message : 'This text could not be analysed.'
		});
	}
};
