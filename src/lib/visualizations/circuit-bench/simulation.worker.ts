import { evaluateCircuitAtInstant, runSimulationBatch, snapshotToScopeSample } from './solver';
import type { WorkerRequestMessage, WorkerResponseMessage } from './worker-protocol';

let cancelledUpTo = 0;

self.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
	const msg = event.data;
	if (!msg || typeof msg !== 'object') return;

	if (msg.type === 'cancel') {
		cancelledUpTo = Math.max(cancelledUpTo, msg.requestId);
		return;
	}

	if (msg.requestId <= cancelledUpTo) {
		return;
	}

	if (msg.type === 'evaluate_instant') {
		const res = evaluateCircuitAtInstant(msg.doc, msg.timeSec, msg.reactiveState);
		if (msg.requestId <= cancelledUpTo) return;
		const response: WorkerResponseMessage = {
			type: 'batch_result',
			requestId: msg.requestId,
			result: res.ok
				? {
						ok: true,
						diagnostics: [],
						snapshot: res.snapshot,
						samples: [snapshotToScopeSample(msg.doc, res.snapshot)],
						stepsExecuted: 0
					}
				: {
						ok: false,
						diagnostics: res.diagnostics,
						snapshot: null,
						samples: [],
						stepsExecuted: 0
					}
		};
		self.postMessage(response);
		return;
	}

	if (msg.type === 'run_batch') {
		const result = runSimulationBatch(msg.doc, msg.startSnapshot, msg.steps, msg.lastSampleTimeSec);
		if (msg.requestId <= cancelledUpTo) return;
		const response: WorkerResponseMessage = {
			type: 'batch_result',
			requestId: msg.requestId,
			result
		};
		self.postMessage(response);
	}
};
