import {
	SPECTRUM_WORKER_PROTOCOL_VERSION,
	cloneSpectrumInputForTransfer,
	isSpectrumWorkerResponse,
	spectrumRequestTransferables,
	type SpectrumAnalysisInput,
	type SpectrumWorkerRequest,
	type SpectrumWorkerRequestBody,
	type SpectrumWorkerResponse
} from './spectrum-protocol';

export interface SpectrumWorkerLike {
	postMessage(message: SpectrumWorkerRequest, transfer?: Transferable[]): void;
	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	terminate(): void;
}

export type SpectrumWorkerListener = (response: SpectrumWorkerResponse) => void;

export class SpectrumWorkerClient {
	private requestId = 0;
	private generation = 0;
	private responseRequestFloor = 0;
	private disposed = false;
	private readonly listeners = new Set<SpectrumWorkerListener>();

	constructor(private readonly worker: SpectrumWorkerLike) {
		worker.addEventListener('message', this.handleMessage);
		worker.addEventListener('error', this.handleWorkerError);
		worker.addEventListener('messageerror', this.handleMessageError);
	}

	subscribe(listener: SpectrumWorkerListener): () => void {
		this.ensureActive();
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	analyze(input: SpectrumAnalysisInput): number {
		this.ensureActive();
		this.generation += 1;
		this.send({ type: 'ANALYZE', input: cloneSpectrumInputForTransfer(input) });
		this.responseRequestFloor = this.requestId;
		return this.generation;
	}

	cancel(): number {
		this.ensureActive();
		this.send({ type: 'CANCEL' });
		this.responseRequestFloor = this.requestId;
		return this.requestId;
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

	private send(body: SpectrumWorkerRequestBody): void {
		this.ensureActive();
		this.requestId += 1;
		const request = {
			protocolVersion: SPECTRUM_WORKER_PROTOCOL_VERSION,
			requestId: this.requestId,
			generation: this.generation,
			...body
		} as SpectrumWorkerRequest;
		this.worker.postMessage(request, spectrumRequestTransferables(request));
	}

	private handleMessage: EventListener = (event) => {
		const message = event as MessageEvent<unknown>;
		if (this.disposed || !isSpectrumWorkerResponse(message.data)) return;
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
		const error = candidate.error;
		const message =
			typeof candidate.message === 'string' && candidate.message.trim()
				? candidate.message
				: error instanceof Error && error.message
					? error.message
					: 'The spatial-spectrum Worker stopped unexpectedly.';
		this.emitRuntimeError(message, error instanceof Error ? error.stack : undefined);
		event.preventDefault();
	};

	private handleMessageError: EventListener = (event) => {
		if (this.disposed) return;
		this.emitRuntimeError('The spatial-spectrum Worker could not deserialize a message.');
		event.preventDefault();
	};

	private emitRuntimeError(message: string, stack?: string): void {
		const response: SpectrumWorkerResponse = {
			protocolVersion: SPECTRUM_WORKER_PROTOCOL_VERSION,
			requestId: this.requestId,
			generation: this.generation,
			type: 'ERROR',
			message,
			...(stack ? { stack } : {})
		};
		for (const listener of this.listeners) listener(response);
	}

	private ensureActive(): void {
		if (this.disposed) throw new Error('The spatial-spectrum Worker client has been disposed.');
	}
}

export function createSpectrumWorkerClient(): SpectrumWorkerClient {
	if (typeof Worker === 'undefined')
		throw new Error('Web Workers are unavailable in this browser.');
	return new SpectrumWorkerClient(
		new Worker(new URL('./spectrum.worker.ts', import.meta.url), {
			type: 'module',
			name: 'gray-scott-spatial-spectrum'
		})
	);
}
