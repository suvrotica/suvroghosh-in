import type { GenerationProgress, OrchestraSnapshot } from '../types';
import { ORCHESTRA_WORKER_PROTOCOL_VERSION } from '../versions';
import { OrchestraWorkerHandler } from './handler';
import {
	isOrchestraWorkerResponse,
	type OrchestraWorkerRequest,
	type OrchestraWorkerRequestBody,
	type OrchestraWorkerResponse
} from './protocol';

export interface OrchestraWorkerLike {
	postMessage(message: OrchestraWorkerRequest): void;
	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	terminate(): void;
}

export interface WorkerGenerateOptions {
	readonly pointCount?: number;
	readonly mobile?: boolean;
	readonly durationSeconds?: number;
}

export interface WorkerDiagnosticOptions {
	readonly includeDiagnostics?: boolean;
	readonly diagnosticPointCount?: number;
	readonly lyapunovDuration?: number;
}

export type WorkerGenerateRequestOptions = WorkerGenerateOptions & WorkerDiagnosticOptions;

export interface OrchestraWorkerClientOptions {
	readonly forceFallback?: boolean;
	readonly workerFactory?: () => OrchestraWorkerLike;
}

interface PendingGeneration {
	readonly generation: number;
	resolve: (result: Extract<OrchestraWorkerResponse, { type: 'RESULT' }>['result']) => void;
	reject: (error: Error) => void;
}

export class OrchestraWorkerClient {
	private requestId = 0;
	private generation = 0;
	private disposed = false;
	private pending: PendingGeneration | null = null;
	private readonly progressListeners = new Set<(progress: GenerationProgress) => void>();
	private worker: OrchestraWorkerLike | null;

	constructor(
		worker: OrchestraWorkerLike,
		private readonly workerFactory?: () => OrchestraWorkerLike
	) {
		this.worker = worker;
		this.attachWorker(worker);
	}

	subscribeProgress(listener: (progress: GenerationProgress) => void): () => void {
		this.ensureActive();
		this.progressListeners.add(listener);
		return () => this.progressListeners.delete(listener);
	}

	generate(
		snapshot: OrchestraSnapshot,
		options: WorkerGenerateRequestOptions = {}
	): Promise<Extract<OrchestraWorkerResponse, { type: 'RESULT' }>['result']> {
		this.ensureActive();
		if (this.pending) {
			const superseded = this.pending;
			this.pending = null;
			if (this.workerFactory) this.terminateWorkerForCancellation();
			else if (this.worker) this.send({ type: 'CANCEL' });
			superseded.reject(new Error('A newer orchestra generation superseded this request.'));
		}
		this.generation += 1;
		const generation = this.generation;
		return new Promise((resolve, reject) => {
			this.pending = { generation, resolve, reject };
			try {
				this.send({ type: 'GENERATE', snapshot, ...options });
			} catch (error) {
				this.pending = null;
				reject(error instanceof Error ? error : new Error('The orchestra Worker could not start.'));
			}
		});
	}

	cancel(): void {
		this.ensureActive();
		const pending = this.pending;
		this.pending = null;
		if (this.workerFactory) this.terminateWorkerForCancellation();
		else if (this.worker) this.send({ type: 'CANCEL' });
		pending?.reject(new Error('Orchestra generation was cancelled.'));
	}

	dispose(): void {
		if (this.disposed) return;
		try {
			if (this.worker) this.send({ type: 'DISPOSE' });
		} finally {
			this.disposed = true;
			this.pending?.reject(new Error('The orchestra Worker client was disposed.'));
			this.pending = null;
			this.progressListeners.clear();
			this.releaseWorker();
		}
	}

	private send(body: OrchestraWorkerRequestBody): void {
		this.ensureActive();
		const worker = this.ensureWorker();
		this.requestId += 1;
		worker.postMessage({
			protocolVersion: ORCHESTRA_WORKER_PROTOCOL_VERSION,
			requestId: this.requestId,
			generation: this.generation,
			...body
		} as OrchestraWorkerRequest);
	}

	private ensureWorker(): OrchestraWorkerLike {
		if (this.worker) return this.worker;
		if (!this.workerFactory) throw new Error('The orchestra Worker is unavailable.');
		const worker = this.workerFactory();
		this.worker = worker;
		this.attachWorker(worker);
		return worker;
	}

	private attachWorker(worker: OrchestraWorkerLike): void {
		worker.addEventListener('message', this.handleMessage);
		worker.addEventListener('error', this.handleError);
		worker.addEventListener('messageerror', this.handleMessageError);
	}

	private releaseWorker(): void {
		const worker = this.worker;
		if (!worker) return;
		worker.removeEventListener('message', this.handleMessage);
		worker.removeEventListener('error', this.handleError);
		worker.removeEventListener('messageerror', this.handleMessageError);
		worker.terminate();
		this.worker = null;
	}

	private terminateWorkerForCancellation(): void {
		if (this.workerFactory) this.releaseWorker();
	}

	private handleMessage: EventListener = (event) => {
		const response = (event as MessageEvent<unknown>).data;
		if (this.disposed || !isOrchestraWorkerResponse(response)) return;
		if (response.generation !== this.generation || response.requestId > this.requestId) return;
		if (response.type === 'PROGRESS') {
			for (const listener of this.progressListeners) listener(response.progress);
			return;
		}
		if (!this.pending || this.pending.generation !== response.generation) return;
		if (response.type === 'RESULT') {
			const pending = this.pending;
			this.pending = null;
			pending.resolve(response.result);
		} else if (response.type === 'ERROR') {
			const pending = this.pending;
			this.pending = null;
			pending.reject(new Error(response.message));
		} else if (response.type === 'CANCELLED') {
			const pending = this.pending;
			this.pending = null;
			pending.reject(new Error('Orchestra generation was cancelled.'));
		}
	};

	private handleError: EventListener = (event) => {
		if (this.disposed || !this.pending) return;
		const candidate = event as ErrorEvent;
		const pending = this.pending;
		this.pending = null;
		pending.reject(new Error(candidate.message || 'The orchestra Worker stopped unexpectedly.'));
		this.terminateWorkerForCancellation();
		event.preventDefault();
	};

	private handleMessageError: EventListener = (event) => {
		if (this.disposed || !this.pending) return;
		const pending = this.pending;
		this.pending = null;
		pending.reject(new Error('The orchestra Worker could not deserialize a message.'));
		this.terminateWorkerForCancellation();
		event.preventDefault();
	};

	private ensureActive(): void {
		if (this.disposed) throw new Error('The orchestra Worker client has been disposed.');
	}
}

class InProcessOrchestraWorker implements OrchestraWorkerLike {
	private readonly handler = new OrchestraWorkerHandler({
		yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0))
	});
	private readonly listeners = new Map<string, Set<EventListener>>();
	private terminated = false;

	postMessage(message: OrchestraWorkerRequest): void {
		if (this.terminated) return;
		setTimeout(() => {
			if (this.terminated) return;
			void this.handler.handle(message, (response) => this.dispatch('message', { data: response }));
		}, 0);
	}

	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void {
		const listeners = this.listeners.get(type) ?? new Set<EventListener>();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}

	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void {
		this.listeners.get(type)?.delete(listener);
	}

	terminate(): void {
		this.terminated = true;
		this.handler.dispose();
		this.listeners.clear();
	}

	private dispatch(type: string, event: { data?: unknown }): void {
		for (const listener of this.listeners.get(type) ?? []) {
			listener(event as unknown as Event);
		}
	}
}

export function createInProcessOrchestraWorker(): OrchestraWorkerLike {
	return new InProcessOrchestraWorker();
}

export function createOrchestraWorkerClient(
	options: OrchestraWorkerClientOptions = {}
): OrchestraWorkerClient {
	if (options.workerFactory)
		return new OrchestraWorkerClient(options.workerFactory(), options.workerFactory);
	if (!options.forceFallback && typeof Worker !== 'undefined') {
		const workerFactory = (): OrchestraWorkerLike =>
			new Worker(new URL('./trajectory.worker.ts', import.meta.url), {
				type: 'module',
				name: 'strange-attractor-orchestra-trajectory'
			});
		try {
			return new OrchestraWorkerClient(workerFactory(), workerFactory);
		} catch {
			// A cooperative, deterministic main-thread fallback preserves the scientific result.
		}
	}
	return new OrchestraWorkerClient(
		createInProcessOrchestraWorker(),
		createInProcessOrchestraWorker
	);
}
