/// <reference lib="webworker" />

import { AtlasWorkerHandler } from './handler';
import {
	ATLAS_WORKER_PROTOCOL_VERSION,
	atlasResponseTransferables,
	isAtlasWorkerRequest,
	type AtlasWorkerResponse
} from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new AtlasWorkerHandler();
let pumpScheduled = false;

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
	if (!isAtlasWorkerRequest(event.data)) {
		handler.abortActive();
		const response: AtlasWorkerResponse = {
			protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
			requestId: envelopeNumber(event.data, 'requestId'),
			generation: envelopeNumber(event.data, 'generation'),
			type: 'ERROR',
			message: 'The Prediction Horizon Atlas Worker received a malformed request.'
		};
		post(response);
		return;
	}

	const responses = handler.handle(event.data);
	for (const response of responses) post(response);
	if (responses.some((response) => response.type === 'DISPOSED')) {
		scope.close();
		return;
	}
	if (handler.isRunning) schedulePump();
});

function schedulePump(): void {
	if (pumpScheduled || !handler.isRunning) return;
	pumpScheduled = true;
	scope.setTimeout(() => {
		pumpScheduled = false;
		for (const response of handler.processNextChunk()) post(response);
		if (handler.isRunning) schedulePump();
	}, 0);
}

function post(response: AtlasWorkerResponse): void {
	scope.postMessage(response, atlasResponseTransferables(response));
}

function envelopeNumber(value: unknown, key: 'requestId' | 'generation'): number {
	if (!value || typeof value !== 'object') return 0;
	const candidate = (value as Record<string, unknown>)[key];
	return Number.isSafeInteger(candidate) && Number(candidate) >= 0 ? Number(candidate) : 0;
}
