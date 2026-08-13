import { computeRandomMatrix } from '../analysis';
import { NullEnsembleCancelledError, runNullEnsemble } from '../null-model';
import type { RandomMatrixWorkerRequest, RandomMatrixWorkerResponse } from './protocol';

export type RandomMatrixWorkerEmit = (response: RandomMatrixWorkerResponse) => void;

export interface RandomMatrixWorkerHandlerOptions {
	yieldControl?: () => Promise<void>;
}

export class RandomMatrixWorkerHandler {
	private latestRunId = 0;
	private disposed = false;
	private readonly cancelled = new Set<number>();
	private readonly yieldControl: () => Promise<void>;

	constructor(options: RandomMatrixWorkerHandlerOptions = {}) {
		this.yieldControl = options.yieldControl ?? yieldToEventLoop;
	}

	async handle(request: RandomMatrixWorkerRequest, emit: RandomMatrixWorkerEmit): Promise<void> {
		if (request.type === 'DISPOSE') {
			this.disposed = true;
			this.cancelled.add(this.latestRunId);
			emit({ ...envelope(request), type: 'DISPOSED' });
			return;
		}
		if (this.disposed) {
			emit({
				...envelope(request),
				type: 'ERROR',
				message: 'The random-matrix Worker is disposed.'
			});
			return;
		}
		if (request.type === 'CANCEL') {
			this.cancelled.add(request.runId);
			emit({ ...envelope(request), type: 'CANCELLED' });
			return;
		}
		if (request.runId <= this.latestRunId) {
			emit({ ...envelope(request), type: 'STALE', activeRunId: this.latestRunId });
			return;
		}
		this.latestRunId = request.runId;
		const runId = request.runId;
		const shouldCancel = () =>
			this.disposed || this.cancelled.has(runId) || runId < this.latestRunId;

		try {
			if (request.type === 'ANALYZE') {
				if (shouldCancel()) throw new NullEnsembleCancelledError();
				const result = computeRandomMatrix(request.input);
				if (shouldCancel()) throw new NullEnsembleCancelledError();
				emit({ ...envelope(request), type: 'ANALYSIS_RESULT', result });
			} else {
				const result = await runNullEnsemble(request.input, {
					shouldCancel,
					yieldControl: this.yieldControl,
					onProgress: (progress) => {
						if (!shouldCancel()) emit({ ...envelope(request), type: 'NULL_PROGRESS', progress });
					}
				});
				if (shouldCancel()) throw new NullEnsembleCancelledError();
				emit({ ...envelope(request), type: 'NULL_ENSEMBLE_RESULT', result });
			}
		} catch (error) {
			if (error instanceof NullEnsembleCancelledError || shouldCancel()) {
				emit({ ...envelope(request), type: 'CANCELLED' });
			} else {
				emit({
					...envelope(request),
					type: 'ERROR',
					message: error instanceof Error ? error.message : String(error),
					...(error instanceof Error && error.stack ? { stack: error.stack } : {})
				});
			}
		} finally {
			this.cancelled.delete(runId);
		}
	}
}

function envelope(request: RandomMatrixWorkerRequest) {
	return {
		protocolVersion: request.protocolVersion,
		runId: request.runId
	} as const;
}

function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
