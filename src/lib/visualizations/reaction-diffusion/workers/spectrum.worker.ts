/// <reference lib="webworker" />

import { SpectrumWorkerHandler } from './spectrum-handler';
import {
	SPECTRUM_WORKER_PROTOCOL_VERSION,
	isSpectrumWorkerRequest,
	spectrumResponseTransferables,
	type SpectrumWorkerResponse
} from './spectrum-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new SpectrumWorkerHandler();

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
	if (!isSpectrumWorkerRequest(event.data)) {
		post({
			protocolVersion: SPECTRUM_WORKER_PROTOCOL_VERSION,
			requestId: envelopeNumber(event.data, 'requestId'),
			generation: envelopeNumber(event.data, 'generation'),
			type: 'ERROR',
			message: 'The spatial-spectrum Worker received a malformed request.'
		});
		return;
	}
	const response = handler.handle(event.data);
	post(response);
	if (response.type === 'DISPOSED') scope.close();
});

function post(response: SpectrumWorkerResponse): void {
	scope.postMessage(response, spectrumResponseTransferables(response));
}

function envelopeNumber(value: unknown, key: 'requestId' | 'generation'): number {
	if (!value || typeof value !== 'object') return 0;
	const candidate = (value as Record<string, unknown>)[key];
	return Number.isSafeInteger(candidate) && Number(candidate) >= 0 ? Number(candidate) : 0;
}
