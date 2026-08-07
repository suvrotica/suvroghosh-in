/// <reference lib="webworker" />

import { ReactionDiffusionWorkerHandler } from './handler';
import {
	REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
	isReactionDiffusionWorkerRequest,
	reactionDiffusionResponseTransferables,
	type ReactionDiffusionWorkerResponse
} from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new ReactionDiffusionWorkerHandler();
let pumpScheduled = false;

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
	if (!isReactionDiffusionWorkerRequest(event.data)) {
		handler.abortActive();
		post({
			protocolVersion: REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
			requestId: envelopeNumber(event.data, 'requestId'),
			generation: envelopeNumber(event.data, 'generation'),
			type: 'ERROR',
			message: 'The reaction–diffusion CPU Worker received a malformed request.'
		});
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

function post(response: ReactionDiffusionWorkerResponse): void {
	scope.postMessage(response, reactionDiffusionResponseTransferables(response));
}

function envelopeNumber(value: unknown, key: 'requestId' | 'generation'): number {
	if (!value || typeof value !== 'object') return 0;
	const candidate = (value as Record<string, unknown>)[key];
	return Number.isSafeInteger(candidate) && Number(candidate) >= 0 ? Number(candidate) : 0;
}
