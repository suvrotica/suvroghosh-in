/// <reference lib="webworker" />

import { createAnalysisWorkerHandler } from './analysis-worker-handler';
import type { AnalysisWorkerRequest } from './analysis-worker-protocol';

const workerScope = self as DedicatedWorkerGlobalScope;
const handle = createAnalysisWorkerHandler((response) => workerScope.postMessage(response));

workerScope.addEventListener('message', (event: MessageEvent<AnalysisWorkerRequest>) => {
	handle(event.data);
});

export {};
