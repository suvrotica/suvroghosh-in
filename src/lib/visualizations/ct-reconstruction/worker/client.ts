import { clonePhantom } from '../phantom';
import type { ReconstructionSettings } from '../types';
import {
	CT_WORKER_PROTOCOL_VERSION,
	isCTWorkerResponse,
	type CTWorkerRequest,
	type CTWorkerRequestBody,
	type CTWorkerResponse,
	type InitializeScanPayload
} from './protocol';

export interface WorkerLike {
	postMessage(message: CTWorkerRequest, transfer?: Transferable[]): void;
	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	terminate(): void;
}

export type CTWorkerListener = (response: CTWorkerResponse) => void;

export class CTWorkerClient {
	private requestId = 0;
	private jobId = 0;
	private latestAcceptedRequestId = 0;
	private disposed = false;
	private listeners = new Set<CTWorkerListener>();

	constructor(private readonly worker: WorkerLike) {
		worker.addEventListener('message', this.handleMessage);
		worker.addEventListener('error', this.handleWorkerError);
		worker.addEventListener('messageerror', this.handleMessageError);
	}

	subscribe(listener: CTWorkerListener): () => void {
		this.ensureActive();
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	initialize(payload: InitializeScanPayload): number {
		this.beginNewJob();
		const phantom = clonePhantom(payload.phantom);
		this.send(
			{
				type: 'INITIALIZE',
				payload: {
					phantom,
					acquisition: { ...payload.acquisition },
					reconstruction: { ...payload.reconstruction }
				}
			},
			[phantom.materials.buffer, phantom.density.buffer]
		);
		return this.jobId;
	}

	processBatch(batchSize = 1, includePreview = false): void {
		const bounded = Math.max(1, Math.min(64, Math.round(batchSize)));
		this.send({ type: 'PROCESS_BATCH', batchSize: bounded, includePreview });
	}

	reconstruct(reconstruction: ReconstructionSettings): void {
		this.send({ type: 'RECONSTRUCT', reconstruction: { ...reconstruction } });
	}

	cancel(): number {
		this.beginNewJob();
		this.send({ type: 'CANCEL' });
		return this.jobId;
	}

	currentJobId(): number {
		return this.jobId;
	}

	dispose(): void {
		if (this.disposed) return;
		try {
			this.send({ type: 'DISPOSE' });
		} finally {
			this.disposed = true;
			this.worker.removeEventListener('message', this.handleMessage);
			this.worker.removeEventListener('error', this.handleWorkerError);
			this.worker.removeEventListener('messageerror', this.handleMessageError);
			this.listeners.clear();
			this.worker.terminate();
		}
	}

	private send(body: CTWorkerRequestBody, transfer: Transferable[] = []): void {
		this.ensureActive();
		this.requestId += 1;
		this.worker.postMessage(
			{
				protocolVersion: CT_WORKER_PROTOCOL_VERSION,
				requestId: this.requestId,
				jobId: this.jobId,
				...body
			} as CTWorkerRequest,
			transfer
		);
	}

	private handleMessage: EventListener = (event) => {
		const message = event as MessageEvent<unknown>;
		if (this.disposed || !isCTWorkerResponse(message.data)) return;
		if (message.data.jobId !== this.jobId) return;
		if (
			message.data.requestId > this.requestId ||
			message.data.requestId < this.latestAcceptedRequestId
		) {
			return;
		}
		this.latestAcceptedRequestId = message.data.requestId;
		for (const listener of this.listeners) listener(message.data);
	};

	private handleWorkerError: EventListener = (event) => {
		if (this.disposed) return;
		const candidate = event as Event & { error?: unknown; message?: unknown };
		const underlying = candidate.error;
		const message =
			typeof candidate.message === 'string' && candidate.message.trim()
				? candidate.message
				: underlying instanceof Error && underlying.message
					? underlying.message
					: 'The CT reconstruction Worker stopped unexpectedly.';
		this.emitRuntimeError(message, underlying instanceof Error ? underlying.stack : undefined);
		event.preventDefault();
	};

	private handleMessageError: EventListener = (event) => {
		if (this.disposed) return;
		this.emitRuntimeError('The CT reconstruction Worker could not deserialize a message.');
		event.preventDefault();
	};

	private emitRuntimeError(message: string, stack?: string): void {
		const response: CTWorkerResponse = {
			protocolVersion: CT_WORKER_PROTOCOL_VERSION,
			requestId: this.requestId,
			jobId: this.jobId,
			type: 'ERROR',
			message,
			...(stack ? { stack } : {})
		};
		for (const listener of this.listeners) listener(response);
	}

	private beginNewJob(): void {
		this.ensureActive();
		this.jobId += 1;
	}

	private ensureActive(): void {
		if (this.disposed) throw new Error('The CT reconstruction Worker client has been disposed.');
	}
}

export function createCTWorkerClient(): CTWorkerClient {
	if (typeof Worker === 'undefined') {
		throw new Error('Web Workers are unavailable in this browser.');
	}
	return new CTWorkerClient(
		new Worker(new URL('./ctReconstruction.worker.ts', import.meta.url), {
			type: 'module',
			name: 'ct-reconstruction'
		})
	);
}
