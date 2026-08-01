/// <reference lib="webworker" />

import { FractalWorkerHandler } from './handler';
import {
	FRACTAL_WORKER_PROTOCOL_VERSION,
	isFractalWorkerRequest,
	responseTransferables,
	type FractalWorkerResponse
} from './protocol';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new FractalWorkerHandler();
let batchScheduled = false;

workerScope.addEventListener('message', (event: MessageEvent<unknown>) => {
	if (!isFractalWorkerRequest(event.data)) {
		post({
			protocolVersion: FRACTAL_WORKER_PROTOCOL_VERSION,
			taskId: 0,
			generation: 0,
			type: 'ERROR',
			message: 'The Fractal Atlas Worker received a malformed or unsafe request.'
		});
		return;
	}

	const responses = handler.handle(event.data);
	for (const response of responses) post(response);
	if (responses.some((response) => response.type === 'DISPOSED')) {
		workerScope.close();
		return;
	}
	scheduleNextBatch();
});

function scheduleNextBatch(): void {
	if (batchScheduled || !handler.isRunning) return;
	batchScheduled = true;
	setTimeout(() => {
		batchScheduled = false;
		for (const response of handler.processNextBatch()) post(response);
		scheduleNextBatch();
	}, 0);
}

function post(response: FractalWorkerResponse): void {
	workerScope.postMessage(response, responseTransferables(response));
}

export {};
