import type {
	CircuitDocument,
	ReactiveState,
	SimulationSnapshot,
	SolverBatchResult
} from './types';

export type WorkerRequestMessage =
	| {
			type: 'evaluate_instant';
			requestId: number;
			doc: CircuitDocument;
			timeSec: number;
			reactiveState?: Partial<ReactiveState>;
	  }
	| {
			type: 'run_batch';
			requestId: number;
			doc: CircuitDocument;
			startSnapshot: SimulationSnapshot | null;
			steps: number;
			lastSampleTimeSec: number;
	  }
	| {
			type: 'cancel';
			requestId: number;
	  };

export type WorkerResponseMessage = {
	type: 'batch_result';
	requestId: number;
	result: SolverBatchResult;
};
