import type {
	BatchComparisonResult,
	BridgeSelection,
	EpidemicParameters,
	ExperimentMode
} from './types.ts';
import {
	executeBatchRequestSync,
	type BatchWorkerRequest,
	type BatchWorkerResponse
} from './worker.ts';

export interface BatchWorkerLike {
	postMessage(message: BatchWorkerRequest): void;
	addEventListener(
		type: 'message',
		listener: (event: MessageEvent<BatchWorkerResponse>) => void
	): void;
	removeEventListener(
		type: 'message',
		listener: (event: MessageEvent<BatchWorkerResponse>) => void
	): void;
	terminate(): void;
}

export type BatchWorkerFactory = () => BatchWorkerLike | null;

function defaultBatchWorkerFactory(): BatchWorkerLike | null {
	if (typeof Worker === 'undefined') return null;
	try {
		return new Worker(new URL('./worker.ts', import.meta.url), {
			type: 'module',
			name: 'epidemic-mosaic-batch-worker'
		});
	} catch {
		return null;
	}
}

export interface BatchClientCallbacks {
	onProgress?: (completedRuns: number, totalRuns: number) => void;
	onComplete?: (result: BatchComparisonResult) => void;
	onCancelled?: () => void;
}

/**
 * Browser client that owns one cancellable batch worker, guards against stale worker
 * responses using monotonic generation IDs, and terminates cleanly on unmount.
 */
export class EpidemicMosaicWorkerClient {
	private worker: BatchWorkerLike | null = null;
	private generationId = 0;
	private running = false;
	private disposed = false;
	private callbacks: BatchClientCallbacks = {};
	private fallbackTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(workerFactory: BatchWorkerFactory = defaultBatchWorkerFactory) {
		this.worker = workerFactory();
		this.worker?.addEventListener('message', this.onWorkerMessage);
	}

	get currentGenerationId(): number {
		return this.generationId;
	}

	get isRunning(): boolean {
		return this.running;
	}

	get isDisposed(): boolean {
		return this.disposed;
	}

	startBatch(
		options: {
			citySeed?: number;
			experimentMode: ExperimentMode;
			bridge?: Partial<BridgeSelection> | null;
			vaccineBudget?: number;
			parameters?: Partial<EpidemicParameters>;
			repetitions?: number;
		},
		callbacks: BatchClientCallbacks = {}
	): number {
		if (this.disposed) return this.generationId;
		this.clearFallbackTimer();
		this.generationId += 1;
		const genId = this.generationId;
		this.running = true;
		this.callbacks = callbacks;

		const request: Extract<BatchWorkerRequest, { type: 'START_BATCH' }> = {
			type: 'START_BATCH',
			generationId: genId,
			citySeed: options.citySeed,
			experimentMode: options.experimentMode,
			bridge: options.bridge
				? {
						regionAId: options.bridge.regionAId,
						regionBId: options.bridge.regionBId
					}
				: null,
			vaccineBudget: options.vaccineBudget,
			parameters: options.parameters
				? {
						betaLocal: options.parameters.betaLocal,
						betaLink: options.parameters.betaLink,
						infectiousPeriodDays: options.parameters.infectiousPeriodDays,
						observationDays: options.parameters.observationDays,
						outbreakSeed: options.parameters.outbreakSeed
					}
				: undefined,
			repetitions: options.repetitions
		};

		if (this.worker) {
			try {
				this.worker.postMessage(request);
				return genId;
			} catch {
				// Fall through to synchronous slice fallback if structuredClone or worker fails
			}
		}

		// Non-worker fallback with cancellable slice progression
		const totalRuns = Math.max(1, Math.min(100, Math.round(options.repetitions ?? 20)));
		let completed = 0;
		const tick = () => {
			if (this.disposed || this.generationId !== genId || !this.running) return;
			completed = Math.min(totalRuns, completed + 5);
			this.callbacks.onProgress?.(completed, totalRuns);
			if (completed < totalRuns) {
				this.fallbackTimer = setTimeout(tick, 8);
			} else {
				this.fallbackTimer = null;
				const result = executeBatchRequestSync(request);
				if (!this.disposed && this.generationId === genId && this.running) {
					this.running = false;
					this.callbacks.onComplete?.(result);
				}
			}
		};
		this.fallbackTimer = setTimeout(tick, 4);
		return genId;
	}

	cancel(): void {
		if (this.disposed || !this.running) return;
		this.clearFallbackTimer();
		this.generationId += 1;
		this.running = false;
		const cb = this.callbacks.onCancelled;
		this.callbacks = {};
		if (this.worker) {
			this.worker.postMessage({
				type: 'CANCEL_BATCH',
				generationId: this.generationId
			});
		}
		cb?.();
	}

	dispose(): void {
		if (this.disposed) return;
		this.clearFallbackTimer();
		this.disposed = true;
		this.generationId += 1;
		this.running = false;
		this.callbacks = {};
		if (this.worker) {
			this.worker.removeEventListener('message', this.onWorkerMessage);
			this.worker.terminate();
			this.worker = null;
		}
	}

	private clearFallbackTimer(): void {
		if (this.fallbackTimer !== null) {
			clearTimeout(this.fallbackTimer);
			this.fallbackTimer = null;
		}
	}

	private readonly onWorkerMessage = (event: MessageEvent<BatchWorkerResponse>): void => {
		const msg = event.data;
		if (!msg || this.disposed || msg.generationId !== this.generationId) {
			return;
		}

		if (msg.type === 'BATCH_PROGRESS') {
			this.callbacks.onProgress?.(msg.completedRuns, msg.totalRuns);
		} else if (msg.type === 'BATCH_COMPLETE') {
			this.running = false;
			const cb = this.callbacks.onComplete;
			this.callbacks = {};
			cb?.(msg.result);
		} else if (msg.type === 'BATCH_CANCELLED') {
			this.running = false;
			const cb = this.callbacks.onCancelled;
			this.callbacks = {};
			cb?.();
		}
	};
}
