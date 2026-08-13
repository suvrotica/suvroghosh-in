import type {
	MatrixAnalysis,
	MatrixComputeInput,
	NullEnsembleInput,
	NullEnsembleProgress,
	NullEnsembleResult
} from '../types';
import {
	RANDOM_MATRIX_WORKER_PROTOCOL_VERSION,
	isRandomMatrixWorkerResponse,
	type RandomMatrixWorkerRequest,
	type RandomMatrixWorkerRequestBody
} from './protocol';

export interface RandomMatrixWorkerLike {
	postMessage(message: RandomMatrixWorkerRequest, transfer?: Transferable[]): void;
	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	terminate(): void;
}

export type RandomMatrixWorkerFactory = () => RandomMatrixWorkerLike | null;
export type RandomMatrixProgressListener = (progress: NullEnsembleProgress) => void;

type AnalysisPending = {
	type: 'analysis';
	runId: number;
	resolve: (result: MatrixAnalysis) => void;
	reject: (reason: Error) => void;
};

type NullPending = {
	type: 'null';
	runId: number;
	resolve: (result: NullEnsembleResult) => void;
	reject: (reason: Error) => void;
};

type Pending = AnalysisPending | NullPending;

export class RandomMatrixWorkerCancelledError extends Error {
	constructor(message = 'The random-matrix calculation was cancelled.') {
		super(message);
		this.name = 'RandomMatrixWorkerCancelledError';
	}
}

export class RandomMatrixWorkerSupersededError extends RandomMatrixWorkerCancelledError {
	constructor() {
		super('The random-matrix calculation was superseded by newer parameters.');
		this.name = 'RandomMatrixWorkerSupersededError';
	}
}

export class RandomMatrixWorkerDisposedError extends RandomMatrixWorkerCancelledError {
	constructor() {
		super('The random-matrix Worker client has been disposed.');
		this.name = 'RandomMatrixWorkerDisposedError';
	}
}

/**
 * Latest-only browser client. EVD and SVD are synchronous calls, so cancelling
 * cannot wait for a message handler inside the busy Worker: superseding or
 * cancelling hard-terminates that Worker and creates a clean replacement.
 */
export class RandomMatrixWorkerClient {
	private worker: RandomMatrixWorkerLike | null = null;
	private nextRunId = 0;
	private activeRunId = 0;
	private pending: Pending | null = null;
	private disposed = false;
	private readonly progressListeners = new Set<RandomMatrixProgressListener>();

	constructor(private readonly workerFactory: RandomMatrixWorkerFactory = defaultWorkerFactory) {
		this.replaceWorker();
	}

	analyze(input: MatrixComputeInput): Promise<MatrixAnalysis> {
		return this.start('analysis', { type: 'ANALYZE', input });
	}

	runNullEnsemble(input: NullEnsembleInput): Promise<NullEnsembleResult> {
		return this.start('null', { type: 'RUN_NULL_ENSEMBLE', input });
	}

	subscribeProgress(listener: RandomMatrixProgressListener): () => void {
		this.ensureActive();
		this.progressListeners.add(listener);
		return () => this.progressListeners.delete(listener);
	}

	cancel(): void {
		this.ensureActive();
		const pending = this.pending;
		if (!pending) return;
		this.pending = null;
		pending.reject(new RandomMatrixWorkerCancelledError());
		this.hardRestartWorker();
	}

	currentRunId(): number {
		return this.activeRunId;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		const pending = this.pending;
		this.pending = null;
		if (pending) pending.reject(new RandomMatrixWorkerDisposedError());
		this.progressListeners.clear();
		this.retireWorker();
	}

	private start(
		type: 'analysis',
		body: Extract<RandomMatrixWorkerRequestBody, { type: 'ANALYZE' }>
	): Promise<MatrixAnalysis>;
	private start(
		type: 'null',
		body: Extract<RandomMatrixWorkerRequestBody, { type: 'RUN_NULL_ENSEMBLE' }>
	): Promise<NullEnsembleResult>;
	private start(
		type: Pending['type'],
		body:
			| Extract<RandomMatrixWorkerRequestBody, { type: 'ANALYZE' }>
			| Extract<RandomMatrixWorkerRequestBody, { type: 'RUN_NULL_ENSEMBLE' }>
	): Promise<MatrixAnalysis | NullEnsembleResult> {
		this.ensureActive();
		if (this.pending) {
			const previous = this.pending;
			this.pending = null;
			previous.reject(new RandomMatrixWorkerSupersededError());
			this.hardRestartWorker();
		}
		this.nextRunId += 1;
		this.activeRunId = this.nextRunId;
		const runId = this.activeRunId;
		const worker = this.worker;
		if (!worker) {
			return Promise.reject(new Error('Web Workers are unavailable for random-matrix analysis.'));
		}

		return new Promise<MatrixAnalysis | NullEnsembleResult>((resolve, reject) => {
			this.pending = {
				type,
				runId,
				resolve: resolve as never,
				reject
			} as Pending;
			try {
				worker.postMessage({
					protocolVersion: RANDOM_MATRIX_WORKER_PROTOCOL_VERSION,
					runId,
					...body
				} as RandomMatrixWorkerRequest);
			} catch (error) {
				this.pending = null;
				reject(
					error instanceof Error ? error : new Error('Could not start the random-matrix Worker.')
				);
				this.hardRestartWorker();
			}
		});
	}

	private readonly handleMessage = (event: Event): void => {
		if (this.disposed) return;
		const response = (event as MessageEvent<unknown>).data;
		if (!isRandomMatrixWorkerResponse(response)) {
			this.failPending(new Error('The random-matrix Worker returned a malformed response.'));
			this.hardRestartWorker();
			return;
		}
		const pending = this.pending;
		if (!pending || response.runId !== pending.runId || response.runId !== this.activeRunId) return;
		if (response.type === 'NULL_PROGRESS') {
			if (pending.type !== 'null') {
				this.failProtocolMismatch('The Worker sent null-ensemble progress for a matrix analysis.');
				return;
			}
			for (const listener of this.progressListeners) listener(response.progress);
			return;
		}
		if (response.type === 'ANALYSIS_RESULT') {
			if (pending.type !== 'analysis') {
				this.failProtocolMismatch('The Worker returned a matrix analysis for a null ensemble.');
				return;
			}
			this.pending = null;
			pending.resolve(response.result);
			return;
		}
		if (response.type === 'NULL_ENSEMBLE_RESULT') {
			if (pending.type !== 'null') {
				this.failProtocolMismatch('The Worker returned a null ensemble for a matrix analysis.');
				return;
			}
			this.pending = null;
			pending.resolve(response.result);
			return;
		}
		if (response.type === 'ERROR') {
			this.pending = null;
			pending.reject(new Error(response.message));
			return;
		}
		if (response.type === 'CANCELLED') {
			this.pending = null;
			pending.reject(new RandomMatrixWorkerCancelledError());
			return;
		}
		if (response.type === 'STALE' || response.type === 'DISPOSED') {
			this.failProtocolMismatch(
				response.type === 'STALE'
					? 'The Worker incorrectly marked the active calculation as stale.'
					: 'The Worker disposed itself during an active calculation.'
			);
		}
	};

	private readonly handleWorkerError = (event: Event): void => {
		if (this.disposed) return;
		const candidate = event as Event & { error?: unknown; message?: unknown };
		const error =
			candidate.error instanceof Error
				? candidate.error
				: new Error(
						typeof candidate.message === 'string' && candidate.message
							? candidate.message
							: 'The random-matrix Worker stopped unexpectedly.'
					);
		this.failPending(error);
		this.hardRestartWorker();
		event.preventDefault();
	};

	private readonly handleMessageError = (event: Event): void => {
		if (this.disposed) return;
		this.failPending(new Error('The random-matrix Worker could not deserialize a message.'));
		this.hardRestartWorker();
		event.preventDefault();
	};

	private failPending(error: Error): void {
		const pending = this.pending;
		this.pending = null;
		pending?.reject(error);
	}

	private failProtocolMismatch(message: string): void {
		this.failPending(new Error(message));
		this.hardRestartWorker();
	}

	private hardRestartWorker(): void {
		this.retireWorker();
		if (!this.disposed) this.replaceWorker();
	}

	private replaceWorker(): void {
		try {
			this.worker = this.workerFactory();
		} catch {
			this.worker = null;
		}
		this.worker?.addEventListener('message', this.handleMessage);
		this.worker?.addEventListener('error', this.handleWorkerError);
		this.worker?.addEventListener('messageerror', this.handleMessageError);
	}

	private retireWorker(): void {
		const worker = this.worker;
		if (!worker) return;
		this.worker = null;
		worker.removeEventListener('message', this.handleMessage);
		worker.removeEventListener('error', this.handleWorkerError);
		worker.removeEventListener('messageerror', this.handleMessageError);
		worker.terminate();
	}

	private ensureActive(): void {
		if (this.disposed) throw new RandomMatrixWorkerDisposedError();
	}
}

function defaultWorkerFactory(): RandomMatrixWorkerLike | null {
	if (typeof Worker === 'undefined') return null;
	try {
		return new Worker(new URL('./random-matrix.worker.ts', import.meta.url), {
			type: 'module',
			name: 'random-matrix-analysis'
		});
	} catch {
		return null;
	}
}

export function createRandomMatrixWorkerClient(): RandomMatrixWorkerClient {
	return new RandomMatrixWorkerClient();
}
