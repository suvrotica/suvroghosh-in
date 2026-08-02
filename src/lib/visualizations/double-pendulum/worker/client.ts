import { validateAtlasSettings, type AtlasSettings } from '../atlas';
import {
	ATLAS_WORKER_PROTOCOL_VERSION,
	isAtlasWorkerResponse,
	type AtlasWorkerRequest,
	type AtlasWorkerRequestBody,
	type AtlasWorkerResponse
} from './protocol';

export interface AtlasWorkerLike {
	postMessage(message: AtlasWorkerRequest): void;
	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	terminate(): void;
}

export type AtlasWorkerListener = (response: AtlasWorkerResponse) => void;

/** Browser-facing generation barrier and lifecycle owner for the module Worker. */
export class AtlasWorkerClient {
	private requestId = 0;
	private generation = 0;
	private responseRequestFloor = 0;
	private disposed = false;
	private readonly listeners = new Set<AtlasWorkerListener>();

	constructor(private readonly worker: AtlasWorkerLike) {
		worker.addEventListener('message', this.handleMessage);
		worker.addEventListener('error', this.handleWorkerError);
		worker.addEventListener('messageerror', this.handleMessageError);
	}

	subscribe(listener: AtlasWorkerListener): () => void {
		this.ensureActive();
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	start(settingsInput: AtlasSettings): number {
		this.ensureActive();
		const settings = validateAtlasSettings(settingsInput);
		this.generation += 1;
		this.send({ type: 'START', settings });
		this.responseRequestFloor = this.requestId;
		return this.generation;
	}

	cancel(): number {
		this.ensureActive();
		this.send({ type: 'CANCEL' });
		this.responseRequestFloor = this.requestId;
		return this.requestId;
	}

	currentGeneration(): number {
		return this.generation;
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

	private send(body: AtlasWorkerRequestBody): void {
		this.ensureActive();
		this.requestId += 1;
		this.worker.postMessage({
			protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
			requestId: this.requestId,
			generation: this.generation,
			...body
		} as AtlasWorkerRequest);
	}

	private handleMessage: EventListener = (event) => {
		const message = event as MessageEvent<unknown>;
		if (this.disposed || !isAtlasWorkerResponse(message.data)) return;
		const response = message.data;
		if (
			response.generation !== this.generation ||
			response.requestId < this.responseRequestFloor ||
			response.requestId > this.requestId
		) {
			return;
		}
		for (const listener of this.listeners) listener(response);
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
					: 'The Prediction Horizon Atlas Worker stopped unexpectedly.';
		this.emitRuntimeError(message, underlying instanceof Error ? underlying.stack : undefined);
		event.preventDefault();
	};

	private handleMessageError: EventListener = (event) => {
		if (this.disposed) return;
		this.emitRuntimeError('The Prediction Horizon Atlas Worker could not deserialize a message.');
		event.preventDefault();
	};

	private emitRuntimeError(message: string, stack?: string): void {
		const response: AtlasWorkerResponse = {
			protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
			requestId: this.requestId,
			generation: this.generation,
			type: 'ERROR',
			message,
			...(stack ? { stack } : {})
		};
		for (const listener of this.listeners) listener(response);
	}

	private ensureActive(): void {
		if (this.disposed) {
			throw new Error('The Prediction Horizon Atlas Worker client has been disposed.');
		}
	}
}

export function createAtlasWorkerClient(): AtlasWorkerClient {
	if (typeof Worker === 'undefined') {
		throw new Error('Web Workers are unavailable in this browser.');
	}
	return new AtlasWorkerClient(
		new Worker(new URL('./atlas.worker.ts', import.meta.url), {
			type: 'module',
			name: 'double-pendulum-prediction-horizon-atlas'
		})
	);
}
