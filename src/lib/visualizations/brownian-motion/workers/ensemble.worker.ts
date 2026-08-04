/// <reference lib="webworker" />

import { AdvancedWorkerHandler } from './handler';
import {
	ADVANCED_WORKER_PROTOCOL_VERSION,
	isAdvancedWorkerRequest,
	responseTransferables,
	type AdvancedWorkerResponse
} from './protocol';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new AdvancedWorkerHandler({ supportedTasks: ['first-passage', 'density'] });

workerScope.addEventListener('message', (event: MessageEvent<unknown>) => {
	if (!isAdvancedWorkerRequest(event.data)) {
		post({
			protocolVersion: ADVANCED_WORKER_PROTOCOL_VERSION,
			requestId: 0,
			generation: 0,
			type: 'ERROR',
			task: null,
			message: 'The Brownian ensemble Worker received a malformed request.'
		});
		return;
	}
	void handler.handle(event.data, post);
});

function post(response: AdvancedWorkerResponse): void {
	workerScope.postMessage(response, responseTransferables(response));
	if (response.type === 'DISPOSED') workerScope.close();
}

export {};
