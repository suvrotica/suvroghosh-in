/// <reference lib="webworker" />

import { NeuronZooWorkerHandler } from './handler';
import {
	simulationResultTransferables,
	type NeuronZooWorkerRequest,
	type NeuronZooWorkerResponse
} from './protocol';

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new NeuronZooWorkerHandler();

workerScope.addEventListener('message', (event: MessageEvent<NeuronZooWorkerRequest>) => {
	const responses = handler.handle(event.data);
	for (const response of responses) {
		const transfer =
			response.type === 'SNAPSHOT' ? simulationResultTransferables(response.result) : [];
		workerScope.postMessage(response satisfies NeuronZooWorkerResponse, transfer);
	}
	if (event.data.type === 'DISPOSE') workerScope.close();
});
