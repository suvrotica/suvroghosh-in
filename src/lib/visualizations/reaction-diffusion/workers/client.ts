import type { BrushTarget, FieldState, GrayScottSetup, Intervention } from '../types';
import {
	REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
	cloneFieldStateForTransfer,
	cloneInterventionsForTransfer,
	isReactionDiffusionWorkerResponse,
	reactionDiffusionRequestTransferables,
	type ReactionDiffusionWorkerRequest,
	type ReactionDiffusionWorkerRequestBody,
	type ReactionDiffusionWorkerResponse
} from './protocol';

export interface ReactionDiffusionWorkerLike {
	postMessage(message: ReactionDiffusionWorkerRequest, transfer?: Transferable[]): void;
	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	terminate(): void;
}

export type ReactionDiffusionWorkerListener = (response: ReactionDiffusionWorkerResponse) => void;

/** Owns one CPU Worker and rejects stale generations before they reach application state. */
export class ReactionDiffusionWorkerClient {
	private requestId = 0;
	private generation = 0;
	private responseRequestFloor = 0;
	private disposed = false;
	private readonly listeners = new Set<ReactionDiffusionWorkerListener>();

	constructor(private readonly worker: ReactionDiffusionWorkerLike) {
		worker.addEventListener('message', this.handleMessage);
		worker.addEventListener('error', this.handleWorkerError);
		worker.addEventListener('messageerror', this.handleMessageError);
	}

	subscribe(listener: ReactionDiffusionWorkerListener): () => void {
		this.ensureActive();
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	reset(
		setup: GrayScottSetup,
		options: {
			state?: FieldState;
			comparisonTarget?: BrushTarget;
			includeState?: boolean;
		} = {}
	): number {
		this.ensureActive();
		this.generation += 1;
		this.send({
			type: 'RESET',
			setup: { ...setup },
			...(options.state ? { state: cloneFieldStateForTransfer(options.state) } : {}),
			...(options.comparisonTarget ? { comparisonTarget: options.comparisonTarget } : {}),
			includeState: options.includeState ?? false
		});
		this.responseRequestFloor = this.requestId;
		return this.generation;
	}

	step(
		steps: number,
		options: {
			interventions?: readonly Intervention[];
			stepsPerChunk?: number;
			includeState?: boolean;
		} = {}
	): number {
		this.ensureActive();
		this.send({
			type: 'STEP',
			steps,
			interventions: cloneInterventionsForTransfer(options.interventions ?? []),
			...(options.stepsPerChunk ? { stepsPerChunk: options.stepsPerChunk } : {}),
			includeState: options.includeState ?? false
		});
		return this.requestId;
	}

	replay(
		setup: GrayScottSetup,
		targetStep: number,
		interventions: readonly Intervention[],
		options: {
			state?: FieldState;
			stepsPerChunk?: number;
			comparisonTarget?: BrushTarget;
			includeState?: boolean;
		} = {}
	): number {
		this.ensureActive();
		this.generation += 1;
		this.send({
			type: 'REPLAY',
			setup: { ...setup },
			targetStep,
			interventions: cloneInterventionsForTransfer(interventions),
			...(options.state ? { state: cloneFieldStateForTransfer(options.state) } : {}),
			...(options.stepsPerChunk ? { stepsPerChunk: options.stepsPerChunk } : {}),
			...(options.comparisonTarget ? { comparisonTarget: options.comparisonTarget } : {}),
			includeState: options.includeState ?? false
		});
		this.responseRequestFloor = this.requestId;
		return this.generation;
	}

	requestMetrics(includeState = false): number {
		this.ensureActive();
		this.send({ type: 'METRICS', includeState });
		return this.requestId;
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

	private send(body: ReactionDiffusionWorkerRequestBody): void {
		this.ensureActive();
		this.requestId += 1;
		const request = {
			protocolVersion: REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
			requestId: this.requestId,
			generation: this.generation,
			...body
		} as ReactionDiffusionWorkerRequest;
		this.worker.postMessage(request, reactionDiffusionRequestTransferables(request));
	}

	private handleMessage: EventListener = (event) => {
		const message = event as MessageEvent<unknown>;
		if (this.disposed || !isReactionDiffusionWorkerResponse(message.data)) return;
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
					: 'The reaction–diffusion CPU Worker stopped unexpectedly.';
		this.emitRuntimeError(message, error instanceof Error ? error.stack : undefined);
		event.preventDefault();
	};

	private handleMessageError: EventListener = (event) => {
		if (this.disposed) return;
		this.emitRuntimeError('The reaction–diffusion CPU Worker could not deserialize a message.');
		event.preventDefault();
	};

	private emitRuntimeError(message: string, stack?: string): void {
		const response: ReactionDiffusionWorkerResponse = {
			protocolVersion: REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
			requestId: this.requestId,
			generation: this.generation,
			type: 'ERROR',
			message,
			...(stack ? { stack } : {})
		};
		for (const listener of this.listeners) listener(response);
	}

	private ensureActive(): void {
		if (this.disposed)
			throw new Error('The reaction–diffusion CPU Worker client has been disposed.');
	}
}

export function createReactionDiffusionWorkerClient(): ReactionDiffusionWorkerClient {
	if (typeof Worker === 'undefined')
		throw new Error('Web Workers are unavailable in this browser.');
	return new ReactionDiffusionWorkerClient(
		new Worker(new URL('./reaction-diffusion.worker.ts', import.meta.url), {
			type: 'module',
			name: 'gray-scott-cpu-reference'
		})
	);
}
