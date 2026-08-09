import { OrchestraWorkerHandler } from './handler';
import {
	isOrchestraWorkerRequest,
	orchestraResponseTransferables,
	type OrchestraWorkerResponse
} from './protocol';

interface WorkerScopeLike {
	addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	postMessage(message: OrchestraWorkerResponse, transfer: ArrayBuffer[]): void;
}

const scope = globalThis as unknown as WorkerScopeLike;
const handler = new OrchestraWorkerHandler();

if (
	typeof (globalThis as { document?: unknown }).document === 'undefined' &&
	typeof scope.addEventListener === 'function' &&
	typeof scope.postMessage === 'function'
) {
	scope.addEventListener('message', (event) => {
		if (!isOrchestraWorkerRequest(event.data)) return;
		void handler.handle(event.data, (response) => {
			scope.postMessage(response, orchestraResponseTransferables(response));
		});
	});
}
