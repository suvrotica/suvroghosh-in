import { createModelParameters, validateUint32Seed, type ModelParameters } from '../model';
import { NucleusWorkerHandler } from './handler';
import {
	NUCLEUS_WORKER_PROTOCOL_VERSION,
	isNucleusWorkerResponse,
	type CompactMatchedEnsembleResult,
	type FocalPairRequest,
	type FocalPairResult,
	type MatchedEnsembleRequest,
	type NucleusWorkerRequest,
	type NucleusWorkerResponse
} from './protocol';

export interface NucleusWorkerLike {
	postMessage(message: NucleusWorkerRequest, transfer?: Transferable[]): void;
	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void;
	terminate(): void;
}

export interface FocalPairOptions {
	seed: number;
	baseline: Readonly<ModelParameters> | Partial<ModelParameters>;
	intervention: Readonly<ModelParameters> | Partial<ModelParameters>;
}

export interface MatchedEnsembleOptions {
	rootSeed: number;
	baseline: Readonly<ModelParameters> | Partial<ModelParameters>;
	intervention: Readonly<ModelParameters> | Partial<ModelParameters>;
}

export interface NucleusWorkerClientOptions {
	yieldControl?: () => Promise<void>;
	fallbackEnsembleChunkSize?: number;
}

type PendingResult = FocalPairResult | CompactMatchedEnsembleResult;
type Pending = {
	runId: number;
	task: 'focal' | 'ensemble';
	request: FocalPairRequest | MatchedEnsembleRequest;
	resolve: (value: PendingResult) => void;
	reject: (reason: Error) => void;
	fallbackStarted: boolean;
};

export class NucleusWorkerCancelledError extends Error {
	constructor(message = 'The scientific Worker run was cancelled.') {
		super(message);
		this.name = 'NucleusWorkerCancelledError';
	}
}

export class NucleusWorkerSupersededError extends NucleusWorkerCancelledError {
	constructor() {
		super('The scientific Worker run was superseded by a newer run.');
		this.name = 'NucleusWorkerSupersededError';
	}
}

export class NucleusWorkerDisposedError extends NucleusWorkerCancelledError {
	constructor() {
		super('The scientific Worker client has been disposed.');
		this.name = 'NucleusWorkerDisposedError';
	}
}

/** Owns one latest-only Worker pipeline and its cooperative main-thread recovery path. */
export class WeatherNucleusWorkerClient {
	private nextRunId = 0;
	private latestRunId = 0;
	private pending: Pending | null = null;
	private disposed = false;
	private readonly yieldControl: () => Promise<void>;
	private readonly fallbackHandler: NucleusWorkerHandler;

	constructor(
		private worker: NucleusWorkerLike | null = null,
		options: NucleusWorkerClientOptions = {}
	) {
		this.yieldControl = options.yieldControl ?? yieldToEventLoop;
		this.fallbackHandler = new NucleusWorkerHandler({
			cooperativeEnsemble: true,
			yieldControl: this.yieldControl,
			ensembleChunkSize: options.fallbackEnsembleChunkSize
		});
		this.attachWorker();
	}

	runFocalPair(options: FocalPairOptions): Promise<FocalPairResult> {
		const request: Omit<FocalPairRequest, 'protocolVersion' | 'runId'> = {
			type: 'RUN_FOCAL_PAIR',
			seed: validateUint32Seed(options.seed),
			baseline: createModelParameters(options.baseline),
			intervention: createModelParameters(options.intervention)
		};
		return this.start(request, 'focal') as Promise<FocalPairResult>;
	}

	runMatchedEnsemble(options: MatchedEnsembleOptions): Promise<CompactMatchedEnsembleResult> {
		const request: Omit<MatchedEnsembleRequest, 'protocolVersion' | 'runId'> = {
			type: 'RUN_MATCHED_ENSEMBLE',
			rootSeed: validateUint32Seed(options.rootSeed),
			baseline: createModelParameters(options.baseline),
			intervention: createModelParameters(options.intervention)
		};
		return this.start(request, 'ensemble') as Promise<CompactMatchedEnsembleResult>;
	}

	cancel(): void {
		this.ensureActive();
		const pending = this.pending;
		if (!pending) return;
		this.pending = null;
		this.fallbackHandler.cancel(pending.runId);
		pending.reject(new NucleusWorkerCancelledError());
		this.postControl({
			protocolVersion: NUCLEUS_WORKER_PROTOCOL_VERSION,
			runId: pending.runId,
			type: 'CANCEL'
		});
	}

	currentRunId(): number {
		return this.latestRunId;
	}

	usingFallback(): boolean {
		return this.worker === null;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		const pending = this.pending;
		this.pending = null;
		this.fallbackHandler.dispose();
		if (pending) pending.reject(new NucleusWorkerDisposedError());
		const worker = this.worker;
		this.worker = null;
		if (!worker) return;
		worker.removeEventListener('message', this.handleMessage);
		worker.removeEventListener('error', this.handleWorkerError);
		worker.removeEventListener('messageerror', this.handleMessageError);
		try {
			worker.postMessage({
				protocolVersion: NUCLEUS_WORKER_PROTOCOL_VERSION,
				runId: this.latestRunId,
				type: 'DISPOSE'
			});
		} catch {
			// Termination below is the authoritative navigation/disposal boundary.
		}
		worker.terminate();
	}

	private start(
		body:
			| Omit<FocalPairRequest, 'protocolVersion' | 'runId'>
			| Omit<MatchedEnsembleRequest, 'protocolVersion' | 'runId'>,
		task: Pending['task']
	): Promise<PendingResult> {
		this.ensureActive();
		this.supersedePending();
		this.nextRunId += 1;
		this.latestRunId = this.nextRunId;
		const request = {
			protocolVersion: NUCLEUS_WORKER_PROTOCOL_VERSION,
			runId: this.latestRunId,
			...body
		} as FocalPairRequest | MatchedEnsembleRequest;
		const promise = new Promise<PendingResult>((resolve, reject) => {
			this.pending = {
				runId: request.runId,
				task,
				request,
				resolve,
				reject,
				fallbackStarted: false
			};
		});
		this.dispatch(request);
		return promise;
	}

	private supersedePending(): void {
		const previous = this.pending;
		if (!previous) return;
		this.pending = null;
		this.fallbackHandler.cancel(previous.runId);
		previous.reject(new NucleusWorkerSupersededError());
		this.postControl({
			protocolVersion: NUCLEUS_WORKER_PROTOCOL_VERSION,
			runId: previous.runId,
			type: 'CANCEL'
		});
	}

	private dispatch(request: FocalPairRequest | MatchedEnsembleRequest): void {
		if (this.worker) {
			try {
				this.worker.postMessage(request);
				return;
			} catch {
				this.retireWorker();
			}
		}
		this.startFallback();
	}

	private postControl(request: NucleusWorkerRequest): void {
		if (!this.worker) return;
		try {
			this.worker.postMessage(request);
		} catch {
			this.retireWorker();
		}
	}

	private startFallback(): void {
		const pending = this.pending;
		if (!pending || pending.fallbackStarted || this.disposed) return;
		pending.fallbackStarted = true;
		void this.runFallback(pending);
	}

	private async runFallback(pending: Pending): Promise<void> {
		try {
			// Release the initiating input/render turn before any scientific work starts.
			await this.yieldControl();
			if (!this.isCurrent(pending)) return;
			await this.fallbackHandler.handle(pending.request, this.acceptResponse);
		} catch (error) {
			if (!this.isCurrent(pending)) return;
			this.pending = null;
			pending.reject(error instanceof Error ? error : new Error('The fallback simulation failed.'));
		}
	}

	private handleMessage: EventListener = (event) => {
		if (this.disposed) return;
		const message = (event as MessageEvent<unknown>).data;
		if (!isNucleusWorkerResponse(message)) {
			this.retireWorker();
			this.startFallback();
			return;
		}
		this.acceptResponse(message);
	};

	private acceptResponse = (response: NucleusWorkerResponse): void => {
		if (this.disposed) return;
		const pending = this.pending;
		if (!pending || response.runId !== pending.runId || response.runId !== this.latestRunId) return;
		if (response.type === 'CANCELLED' || response.type === 'DISPOSED') return;
		if (response.type === 'ERROR') {
			this.pending = null;
			pending.reject(new Error(response.message));
			return;
		}
		if (
			(pending.task === 'focal' && response.type !== 'FOCAL_PAIR_RESULT') ||
			(pending.task === 'ensemble' && response.type !== 'MATCHED_ENSEMBLE_RESULT')
		) {
			this.pending = null;
			pending.reject(new Error('The scientific Worker returned the wrong result type.'));
			return;
		}
		this.pending = null;
		pending.resolve(response.result);
	};

	private handleWorkerError: EventListener = (event) => {
		if (this.disposed) return;
		event.preventDefault();
		this.retireWorker();
		this.startFallback();
	};

	private handleMessageError: EventListener = (event) => {
		if (this.disposed) return;
		event.preventDefault();
		this.retireWorker();
		this.startFallback();
	};

	private retireWorker(): void {
		const worker = this.worker;
		if (!worker) return;
		worker.removeEventListener('message', this.handleMessage);
		worker.removeEventListener('error', this.handleWorkerError);
		worker.removeEventListener('messageerror', this.handleMessageError);
		worker.terminate();
		this.worker = null;
	}

	private attachWorker(): void {
		this.worker?.addEventListener('message', this.handleMessage);
		this.worker?.addEventListener('error', this.handleWorkerError);
		this.worker?.addEventListener('messageerror', this.handleMessageError);
	}

	private isCurrent(pending: Pending): boolean {
		return !this.disposed && this.pending === pending && this.latestRunId === pending.runId;
	}

	private ensureActive(): void {
		if (this.disposed) throw new NucleusWorkerDisposedError();
	}
}

export function createWeatherNucleusWorkerClient(): WeatherNucleusWorkerClient {
	if (typeof Worker === 'undefined') return new WeatherNucleusWorkerClient(null);
	try {
		return new WeatherNucleusWorkerClient(
			new Worker(new URL('./simulation.worker.ts', import.meta.url), {
				type: 'module',
				name: 'weather-inside-nucleus'
			})
		);
	} catch {
		return new WeatherNucleusWorkerClient(null);
	}
}

function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
