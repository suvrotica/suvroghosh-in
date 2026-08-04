import { validateDensityGridOptions, type DensityGridOptions } from '../advanced/density-grid';
import { validateFirstPassageOptions, type FirstPassageOptions } from '../advanced/first-passage';
import {
	validateFractionalBrownianOptions,
	type FractionalBrownianOptions
} from '../advanced/fractional-brownian';
import { AdvancedWorkerHandler } from './handler';
import {
	ADVANCED_WORKER_PROTOCOL_VERSION,
	isAdvancedWorkerResponse,
	requestTransferables,
	type AdvancedWorkerRequest,
	type AdvancedWorkerRequestBody,
	type AdvancedWorkerResponse,
	type AdvancedWorkerTask
} from './protocol';

export type AdvancedWorkerMode = 'fractional' | 'ensemble';

export interface AdvancedWorkerLike {
	postMessage(message: AdvancedWorkerRequest, transfer?: Transferable[]): void;
	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	terminate(): void;
}

export type AdvancedWorkerListener = (response: AdvancedWorkerResponse) => void;

/**
 * Lifecycle owner and generation barrier for the two Vite module Workers.
 * Passing null uses the same pure handler in cooperative main-thread batches.
 */
export class AdvancedWorkerClient {
	private requestId = 0;
	private generation = 0;
	private responseRequestFloor = 0;
	private disposed = false;
	private activeTask: AdvancedWorkerTask | null = null;
	private readonly listeners = new Set<AdvancedWorkerListener>();
	private readonly fallbackHandler: AdvancedWorkerHandler | null;

	constructor(
		readonly mode: AdvancedWorkerMode,
		private worker: AdvancedWorkerLike | null = null,
		private readonly fallbackYieldControl: () => Promise<void> = yieldToEventLoop
	) {
		if (worker) {
			worker.addEventListener('message', this.handleMessage);
			worker.addEventListener('error', this.handleWorkerError);
			worker.addEventListener('messageerror', this.handleMessageError);
			this.fallbackHandler = null;
		} else {
			this.fallbackHandler = new AdvancedWorkerHandler({
				supportedTasks:
					mode === 'fractional'
						? (['fractional'] as const)
						: (['first-passage', 'density'] as const),
				yieldControl: fallbackYieldControl
			});
		}
	}

	subscribe(listener: AdvancedWorkerListener): () => void {
		this.ensureActive();
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	generateFractional(options: FractionalBrownianOptions): number {
		this.assertMode('fractional');
		const validated = validateFractionalBrownianOptions(options);
		return this.start({ type: 'GENERATE_FRACTIONAL', options: validated }, 'fractional');
	}

	runFirstPassage(options: FirstPassageOptions): number {
		this.assertMode('ensemble');
		const validated = validateFirstPassageOptions(options);
		return this.start({ type: 'RUN_FIRST_PASSAGE', options: validated }, 'first-passage');
	}

	measureDensity(options: DensityGridOptions): number {
		this.assertMode('ensemble');
		validateDensityGridOptions(options);
		// Transfer dedicated copies. Simulation-owned position buffers remain usable
		// while the Worker measures the snapshot.
		const transferableOptions: DensityGridOptions = {
			...options,
			x: new Float64Array(options.x),
			y: new Float64Array(options.y)
		};
		return this.start({ type: 'MEASURE_DENSITY', options: transferableOptions }, 'density');
	}

	cancel(): number {
		this.ensureActive();
		const request = this.send({ type: 'CANCEL' });
		this.responseRequestFloor = request.requestId;
		this.activeTask = null;
		return request.requestId;
	}

	currentGeneration(): number {
		return this.generation;
	}

	usesWorker(): boolean {
		return this.worker !== null;
	}

	dispose(): void {
		if (this.disposed) return;
		try {
			this.send({ type: 'DISPOSE' });
		} finally {
			this.disposed = true;
			if (this.worker) {
				this.worker.removeEventListener('message', this.handleMessage);
				this.worker.removeEventListener('error', this.handleWorkerError);
				this.worker.removeEventListener('messageerror', this.handleMessageError);
				this.worker.terminate();
				this.worker = null;
			}
			this.listeners.clear();
			this.activeTask = null;
		}
	}

	private start(body: AdvancedWorkerRequestBody, task: AdvancedWorkerTask): number {
		this.ensureActive();
		this.generation += 1;
		this.activeTask = task;
		const request = this.send(body);
		this.responseRequestFloor = request.requestId;
		return this.generation;
	}

	private send(body: AdvancedWorkerRequestBody): AdvancedWorkerRequest {
		this.ensureActive();
		this.requestId += 1;
		const request = {
			protocolVersion: ADVANCED_WORKER_PROTOCOL_VERSION,
			requestId: this.requestId,
			generation: this.generation,
			...body
		} as AdvancedWorkerRequest;
		if (this.worker) {
			this.worker.postMessage(request, requestTransferables(request));
		} else if (this.fallbackHandler) {
			if (request.type === 'CANCEL' || request.type === 'DISPOSE') {
				void this.fallbackHandler.handle(request, this.acceptResponse);
			} else {
				void this.runFallback(request);
			}
		}
		return request;
	}

	private async runFallback(request: AdvancedWorkerRequest): Promise<void> {
		// Let the initiating input/render turn finish before doing numerical work.
		await this.fallbackYieldControl();
		if (
			this.disposed ||
			!this.fallbackHandler ||
			request.generation !== this.generation ||
			request.requestId < this.responseRequestFloor
		) {
			return;
		}
		await this.fallbackHandler.handle(request, this.acceptResponse);
	}

	private handleMessage: EventListener = (event) => {
		const message = event as MessageEvent<unknown>;
		if (!isAdvancedWorkerResponse(message.data)) {
			this.emitRuntimeError('The advanced Brownian Worker returned a malformed response.');
			return;
		}
		this.acceptResponse(message.data);
	};

	private acceptResponse = (response: AdvancedWorkerResponse): void => {
		if (
			this.disposed ||
			response.generation !== this.generation ||
			response.requestId < this.responseRequestFloor ||
			response.requestId > this.requestId
		) {
			return;
		}
		if (
			response.type === 'FRACTIONAL_RESULT' ||
			response.type === 'FIRST_PASSAGE_RESULT' ||
			response.type === 'DENSITY_RESULT' ||
			response.type === 'CANCELLED' ||
			response.type === 'ERROR'
		) {
			this.activeTask = null;
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
					: 'The advanced Brownian Worker stopped unexpectedly.';
		this.emitRuntimeError(message, underlying instanceof Error ? underlying.stack : undefined);
		event.preventDefault();
	};

	private handleMessageError: EventListener = (event) => {
		if (this.disposed) return;
		this.emitRuntimeError('The advanced Brownian Worker could not deserialize a message.');
		event.preventDefault();
	};

	private emitRuntimeError(message: string, stack?: string): void {
		if (this.disposed) return;
		const response: AdvancedWorkerResponse = {
			protocolVersion: ADVANCED_WORKER_PROTOCOL_VERSION,
			requestId: this.requestId,
			generation: this.generation,
			type: 'ERROR',
			task: this.activeTask,
			message,
			...(stack ? { stack } : {})
		};
		this.activeTask = null;
		for (const listener of this.listeners) listener(response);
	}

	private assertMode(expected: AdvancedWorkerMode): void {
		this.ensureActive();
		if (this.mode !== expected) {
			throw new Error(`The ${this.mode} Worker client cannot run a ${expected} task.`);
		}
	}

	private ensureActive(): void {
		if (this.disposed) throw new Error('The advanced Brownian Worker client has been disposed.');
	}
}

export function createFractionalWorkerClient(): AdvancedWorkerClient {
	if (typeof Worker === 'undefined') return new AdvancedWorkerClient('fractional');
	try {
		// Keep the Worker constructor and URL expression together. Vite recognises
		// this exact form as a module-Worker entry and emits a same-origin asset;
		// splitting the URL into a variable can turn a small entry into an inlined
		// data: asset, which is intentionally rejected by the site's CSP.
		return new AdvancedWorkerClient(
			'fractional',
			new Worker(new URL('./fractional.worker.ts', import.meta.url), {
				type: 'module',
				name: 'brownian-fractional'
			})
		);
	} catch {
		return new AdvancedWorkerClient('fractional');
	}
}

export function createEnsembleWorkerClient(): AdvancedWorkerClient {
	if (typeof Worker === 'undefined') return new AdvancedWorkerClient('ensemble');
	try {
		return new AdvancedWorkerClient(
			'ensemble',
			new Worker(new URL('./ensemble.worker.ts', import.meta.url), {
				type: 'module',
				name: 'brownian-ensemble'
			})
		);
	} catch {
		return new AdvancedWorkerClient('ensemble');
	}
}

function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
