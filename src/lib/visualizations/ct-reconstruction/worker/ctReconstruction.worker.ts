/// <reference lib="webworker" />

import { CTWorkerHandler } from './handler';
import {
	CT_WORKER_PROTOCOL_VERSION,
	isCTWorkerRequest,
	responseTransferables,
	type CTWorkerResponse
} from './protocol';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new CTWorkerHandler();

workerScope.addEventListener('message', (event: MessageEvent<unknown>) => {
	let response: CTWorkerResponse;
	if (!isCTWorkerRequest(event.data)) {
		response = {
			protocolVersion: CT_WORKER_PROTOCOL_VERSION,
			requestId: 0,
			jobId: 0,
			type: 'ERROR',
			message: 'The CT Worker received a malformed request.'
		};
	} else {
		response = handler.handle(event.data);
	}
	workerScope.postMessage(response, responseTransferables(response));
	if (response.type === 'DISPOSED') workerScope.close();
});

export {};
