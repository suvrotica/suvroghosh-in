import type { CityConfig } from '../engine/types';
import {
	CITY_WORKER_PROTOCOL_VERSION,
	isCityWorkerResponse,
	type CityWorkerRequest,
	type CityWorkerRequestBody,
	type CityWorkerResponse
} from './protocol';

export interface CityWorkerLike {
	postMessage(message: CityWorkerRequest): void;
	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	terminate(): void;
}

export type CityWorkerListener = (response: CityWorkerResponse) => void;

export class CityWorkerClient {
	private requestId = 0;
	private jobId = 0;
	private disposed = false;
	private readonly listeners = new Set<CityWorkerListener>();

	constructor(private readonly worker: CityWorkerLike) {
		worker.addEventListener('message', this.handleMessage);
		worker.addEventListener('error', this.handleWorkerError);
		worker.addEventListener('messageerror', this.handleMessageError);
	}

	subscribe(listener: CityWorkerListener): () => void {
		this.ensureActive();
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	generate(config: CityConfig): number {
		this.beginNewJob();
		this.send({ type: 'GENERATE', config: { ...config, anchor: { ...config.anchor } } });
		return this.jobId;
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

	private send(body: CityWorkerRequestBody): void {
		this.ensureActive();
		this.requestId += 1;
		this.worker.postMessage({
			protocolVersion: CITY_WORKER_PROTOCOL_VERSION,
			requestId: this.requestId,
			jobId: this.jobId,
			...body
		} as CityWorkerRequest);
	}

	private handleMessage: EventListener = (event) => {
		const message = event as MessageEvent<unknown>;
		if (this.disposed || !isCityWorkerResponse(message.data)) return;
		if (message.data.jobId !== this.jobId || message.data.requestId > this.requestId) return;
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
					: 'The city generation Worker stopped unexpectedly.';
		this.emitRuntimeError(message, underlying instanceof Error ? underlying.stack : undefined);
		event.preventDefault();
	};

	private handleMessageError: EventListener = (event) => {
		if (this.disposed) return;
		this.emitRuntimeError('The city generation Worker could not deserialize a message.');
		event.preventDefault();
	};

	private emitRuntimeError(message: string, stack?: string): void {
		const response: CityWorkerResponse = {
			protocolVersion: CITY_WORKER_PROTOCOL_VERSION,
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
		if (this.disposed) throw new Error('The city generation Worker client has been disposed.');
	}
}

export function createCityWorkerClient(): CityWorkerClient {
	if (typeof Worker === 'undefined') {
		throw new Error('Web Workers are unavailable in this browser.');
	}
	return new CityWorkerClient(
		new Worker(new URL('./city.worker.ts', import.meta.url), {
			type: 'module',
			name: 'city-master-plan'
		})
	);
}
