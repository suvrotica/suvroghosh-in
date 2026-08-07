import type { NumericalComparisonResult, NumericalExperimentKind } from '../numerical-experiments';
import type { GrayScottSetup } from '../types';

export type NumericalExperimentWorkerResponse =
	| { type: 'RESULT'; generation: number; result: NumericalComparisonResult }
	| { type: 'ERROR'; generation: number; message: string };

type Listener = (response: NumericalExperimentWorkerResponse) => void;

export class NumericalExperimentWorkerClient {
	private generation = 0;
	private disposed = false;
	private readonly listeners = new Set<Listener>();

	constructor(private readonly worker: Worker) {
		worker.addEventListener('message', this.handleMessage);
		worker.addEventListener('error', this.handleError);
		worker.addEventListener('messageerror', this.handleMessageError);
	}

	subscribe(listener: Listener) {
		this.ensureActive();
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	run(setup: GrayScottSetup, kind: NumericalExperimentKind) {
		this.ensureActive();
		this.generation += 1;
		this.worker.postMessage({
			type: 'RUN',
			generation: this.generation,
			setup: { ...setup },
			kind
		});
		return this.generation;
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.worker.removeEventListener('message', this.handleMessage);
		this.worker.removeEventListener('error', this.handleError);
		this.worker.removeEventListener('messageerror', this.handleMessageError);
		this.listeners.clear();
		this.worker.terminate();
	}

	private handleMessage = (event: MessageEvent<unknown>) => {
		if (this.disposed || !isResponse(event.data) || event.data.generation !== this.generation)
			return;
		for (const listener of this.listeners) listener(event.data);
	};

	private handleError = (event: ErrorEvent) => {
		if (this.disposed) return;
		this.emitError(event.message || 'The numerical-comparison Worker stopped unexpectedly.');
		event.preventDefault();
	};

	private handleMessageError = (event: MessageEvent) => {
		if (this.disposed) return;
		this.emitError('The numerical-comparison Worker could not deserialize a message.');
		event.preventDefault();
	};

	private emitError(message: string) {
		const response: NumericalExperimentWorkerResponse = {
			type: 'ERROR',
			generation: this.generation,
			message
		};
		for (const listener of this.listeners) listener(response);
	}

	private ensureActive() {
		if (this.disposed) throw new Error('The numerical-comparison Worker has been disposed.');
	}
}

export function createNumericalExperimentWorkerClient() {
	if (typeof Worker === 'undefined')
		throw new Error('Web Workers are unavailable in this browser.');
	return new NumericalExperimentWorkerClient(
		new Worker(new URL('./numerical-experiments.worker.ts', import.meta.url), {
			type: 'module',
			name: 'gray-scott-numerical-comparisons'
		})
	);
}

function isResponse(value: unknown): value is NumericalExperimentWorkerResponse {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<NumericalExperimentWorkerResponse>;
	return (
		Number.isSafeInteger(candidate.generation) &&
		((candidate.type === 'RESULT' && Boolean(candidate.result)) ||
			(candidate.type === 'ERROR' && typeof candidate.message === 'string'))
	);
}
