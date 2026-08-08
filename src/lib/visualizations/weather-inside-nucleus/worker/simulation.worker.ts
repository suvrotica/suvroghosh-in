/// <reference lib="webworker" />

import { NucleusWorkerHandler } from './handler';
import {
	NUCLEUS_WORKER_PROTOCOL_VERSION,
	isNucleusWorkerRequest,
	responseTransferables,
	type ErrorResponse,
	type NucleusWorkerResponse
} from './protocol';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
// Yield between four matched pairs so CANCEL/DISPOSE can be observed inside the Worker.
const handler = new NucleusWorkerHandler({ cooperativeEnsemble: true });

workerScope.addEventListener('message', (event: MessageEvent<unknown>) => {
	if (!isNucleusWorkerRequest(event.data)) {
		const response: ErrorResponse = {
			protocolVersion: NUCLEUS_WORKER_PROTOCOL_VERSION,
			runId: readRunId(event.data),
			type: 'ERROR',
			task: null,
			message: 'The Worker received a malformed protocol-v1 request.'
		};
		workerScope.postMessage(response);
		return;
	}
	void handler.handle(event.data, postResponse);
});

function postResponse(response: NucleusWorkerResponse): void {
	workerScope.postMessage(response, responseTransferables(response));
	if (response.type === 'DISPOSED') workerScope.close();
}

function readRunId(value: unknown): number {
	if (typeof value !== 'object' || value === null || !('runId' in value)) return 0;
	const runId = (value as { runId?: unknown }).runId;
	return Number.isSafeInteger(runId) && Number(runId) >= 0 ? Number(runId) : 0;
}
