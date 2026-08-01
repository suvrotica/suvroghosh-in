/// <reference lib="webworker" />

import {
	PRECISION_WORKER_PROTOCOL_VERSION,
	isPrecisionWorkerRequest,
	precisionResponseTransferables,
	type PrecisionWorkerRequest,
	type PrecisionWorkerResponse
} from './protocol';
import { PrecisionCalculationCancelledError, calculatePrecisionReference } from './reference';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let activeToken: { generation: number; settingsHash: string; cancelled: boolean } | null = null;
let disposed = false;

workerScope.addEventListener('message', (event: MessageEvent<unknown>) => {
	if (!isPrecisionWorkerRequest(event.data)) {
		post({
			protocolVersion: PRECISION_WORKER_PROTOCOL_VERSION,
			taskId: 0,
			generation: 0,
			settingsHash: '',
			type: 'ERROR',
			message: 'The Fractal Atlas precision Worker received a malformed request.'
		});
		return;
	}
	void handle(event.data);
});

async function handle(request: PrecisionWorkerRequest) {
	if (request.type === 'DISPOSE') {
		if (activeToken) activeToken.cancelled = true;
		disposed = true;
		post({ ...envelope(request), type: 'DISPOSED' });
		workerScope.close();
		return;
	}
	if (disposed) {
		post({ ...envelope(request), type: 'ERROR', message: 'The precision Worker is disposed.' });
		return;
	}
	if (request.type === 'CANCEL_GENERATION') {
		if (
			activeToken &&
			activeToken.generation === request.generation &&
			activeToken.settingsHash === request.settingsHash
		) {
			activeToken.cancelled = true;
		}
		post({ ...envelope(request), type: 'CANCELLED' });
		return;
	}

	if (activeToken) activeToken.cancelled = true;
	const token = {
		generation: request.generation,
		settingsHash: request.settingsHash,
		cancelled: false
	};
	activeToken = token;
	post({
		...envelope(request),
		type: 'REFERENCE_STATUS',
		phase: 'calculating',
		progress: 0,
		precisionDigits: request.config.precisionDigits
	});

	try {
		const result = await calculatePrecisionReference(request.config, {
			shouldCancel: () => token.cancelled || disposed || activeToken !== token,
			yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
			onProgress: (phase, progress) => {
				if (token.cancelled || activeToken !== token || disposed) return;
				post({
					...envelope(request),
					type: 'REFERENCE_STATUS',
					phase,
					progress: Math.max(0, Math.min(1, progress)),
					precisionDigits: request.config.precisionDigits
				});
			}
		});
		if (token.cancelled || activeToken !== token || disposed) return;
		post({ ...envelope(request), type: 'REFERENCE_RESULT', result });
		activeToken = null;
	} catch (error) {
		if (error instanceof PrecisionCalculationCancelledError || token.cancelled) return;
		if (activeToken === token) activeToken = null;
		post({
			...envelope(request),
			type: 'ERROR',
			message:
				error instanceof Error
					? error.message
					: 'The high-precision reference orbit could not be calculated.',
			stack: error instanceof Error ? error.stack : undefined
		});
	}
}

function envelope(request: PrecisionWorkerRequest) {
	return {
		protocolVersion: PRECISION_WORKER_PROTOCOL_VERSION,
		taskId: request.taskId,
		generation: request.generation,
		settingsHash: request.settingsHash
	} as const;
}

function post(response: PrecisionWorkerResponse) {
	workerScope.postMessage(response, precisionResponseTransferables(response));
}

export {};
