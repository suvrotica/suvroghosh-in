/// <reference lib="webworker" />

import { RandomMatrixWorkerHandler } from './handler';
import {
	RANDOM_MATRIX_WORKER_PROTOCOL_VERSION,
	isRandomMatrixWorkerRequest,
	randomMatrixResponseTransferables,
	type RandomMatrixWorkerResponse
} from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new RandomMatrixWorkerHandler();

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
	if (!isRandomMatrixWorkerRequest(event.data)) {
		post({
			protocolVersion: RANDOM_MATRIX_WORKER_PROTOCOL_VERSION,
			runId: envelopeRunId(event.data),
			type: 'ERROR',
			message: 'The random-matrix Worker received a malformed request.'
		});
		return;
	}
	void handler.handle(event.data, (response) => {
		post(response);
		if (response.type === 'DISPOSED') scope.close();
	});
});

function post(response: RandomMatrixWorkerResponse): void {
	scope.postMessage(response, randomMatrixResponseTransferables(response));
}

function envelopeRunId(value: unknown): number {
	if (!value || typeof value !== 'object') return 1;
	const runId = (value as Record<string, unknown>).runId;
	return Number.isSafeInteger(runId) && Number(runId) > 0 ? Number(runId) : 1;
}

export {};
