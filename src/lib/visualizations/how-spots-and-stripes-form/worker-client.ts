import type { SpotStripeConfig } from './types.ts';
import {
	handleWorkerRequest,
	type WorkerRequestMessage,
	type WorkerResponseMessage
} from './worker.ts';

export type SnapshotListener = (response: WorkerResponseMessage) => void;

export interface WorkerLike {
	postMessage(message: WorkerRequestMessage): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<WorkerResponseMessage>) => void): void;
	removeEventListener(
		type: 'message',
		listener: (event: MessageEvent<WorkerResponseMessage>) => void
	): void;
	terminate(): void;
}

export type WorkerFactory = () => WorkerLike | null;

function defaultWorkerFactory(): WorkerLike | null {
	if (typeof Worker === 'undefined') return null;
	try {
		return new Worker(new URL('./worker.ts', import.meta.url), {
			type: 'module',
			name: 'spots-and-stripes-solver'
		});
	} catch {
		return null;
	}
}

/**
 * Browser client that owns one solver worker, guards against stale worker
 * messages across restarts/parameter edits, and terminates cleanly on unmount.
 */
export class SpotStripeWorkerClient {
	private worker: WorkerLike | null = null;
	private generationId = 0;
	private stepInFlight = false;
	private disposed = false;
	private readonly listeners = new Set<SnapshotListener>();

	constructor(workerFactory: WorkerFactory = defaultWorkerFactory) {
		this.worker = workerFactory();
		this.worker?.addEventListener('message', this.onWorkerMessage);
	}

	get currentGenerationId(): number {
		return this.generationId;
	}

	get isBusy(): boolean {
		return this.stepInFlight;
	}

	get isDisposed(): boolean {
		return this.disposed;
	}

	subscribe(listener: SnapshotListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	init(options: {
		config: Partial<SpotStripeConfig>;
		compareEqualSpreading: boolean;
		evolveToObservationTime: boolean;
	}): number {
		if (this.disposed) return this.generationId;
		this.generationId += 1;
		this.stepInFlight = false;
		const request: WorkerRequestMessage = {
			type: 'INIT',
			generationId: this.generationId,
			config: options.config,
			compareEqualSpreading: options.compareEqualSpreading,
			evolveToObservationTime: options.evolveToObservationTime
		};
		this.dispatch(request);
		return this.generationId;
	}

	step(steps: number): boolean {
		if (this.disposed || this.stepInFlight) return false;
		this.stepInFlight = true;
		const request: WorkerRequestMessage = {
			type: 'STEP',
			generationId: this.generationId,
			steps
		};
		this.dispatch(request);
		return true;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.generationId += 1;
		this.stepInFlight = false;
		this.listeners.clear();
		if (this.worker) {
			this.worker.removeEventListener('message', this.onWorkerMessage);
			this.worker.terminate();
			this.worker = null;
		}
	}

	private dispatch(request: WorkerRequestMessage): void {
		if (this.worker) {
			this.worker.postMessage(request);
			return;
		}
		const response = handleWorkerRequest(request);
		if (response) {
			this.deliverResponse(response);
		} else {
			this.stepInFlight = false;
		}
	}

	private readonly onWorkerMessage = (event: MessageEvent<WorkerResponseMessage>): void => {
		this.deliverResponse(event.data);
	};

	private deliverResponse(response: WorkerResponseMessage): void {
		if (this.disposed || response.generationId !== this.generationId) {
			return;
		}
		this.stepInFlight = false;
		for (const listener of this.listeners) {
			listener(response);
		}
	}
}
