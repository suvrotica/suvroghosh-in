import {
	AnalysisCancelledError,
	computeBasinGridAsync,
	runMomentumStabilitySweepAsync,
	runParticleFlowAsync,
	runStabilitySweepAsync,
	type MomentumStabilityGrid,
	type ParticleTrajectory,
	type StabilitySweepEntry
} from './analysis';
import {
	isAnalysisWorkerResponse,
	type AnalysisWorkerRequest,
	type AnalysisWorkerResponse,
	type BasinAnalysisPayload,
	type MomentumStabilityAnalysisPayload,
	type ParticleFlowAnalysisPayload,
	type StabilityAnalysisPayload
} from './analysis-worker-protocol';
import { createLandscape } from './landscapes';
import type { BasinGrid } from './types';

export type AnalysisWorkerLike = Pick<
	Worker,
	'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'
>;

type RequestType = 'basin-grid' | 'stability-sweep' | 'momentum-stability-sweep' | 'particle-flow';

type RequestPayload =
	| BasinAnalysisPayload
	| StabilityAnalysisPayload
	| MomentumStabilityAnalysisPayload
	| ParticleFlowAnalysisPayload;

type AnalysisResult =
	| BasinGrid
	| readonly StabilitySweepEntry[]
	| MomentumStabilityGrid
	| readonly ParticleTrajectory[];

type Pending = {
	readonly type: RequestType;
	readonly payload: RequestPayload;
	readonly resolve: (value: AnalysisResult) => void;
	readonly reject: (reason: unknown) => void;
};

function defaultWorkerFactory(): AnalysisWorkerLike | null {
	if (typeof Worker === 'undefined') return null;
	try {
		return new Worker(new URL('./analysis.worker.ts', import.meta.url), {
			type: 'module',
			name: 'gradient-descent-analysis'
		});
	} catch {
		return null;
	}
}

export class AnalysisWorkerClient {
	private worker: AnalysisWorkerLike | null;
	private generation = 0;
	private activeGeneration: number | null = null;
	private readonly pending = new Map<number, Pending>();
	private readonly cancelledFallback = new Set<number>();
	private terminated = false;

	constructor(workerFactory: () => AnalysisWorkerLike | null = defaultWorkerFactory) {
		try {
			this.worker = workerFactory();
		} catch {
			this.worker = null;
		}
		this.worker?.addEventListener('message', this.handleMessage as EventListener);
		this.worker?.addEventListener('error', this.handleWorkerFailure);
		this.worker?.addEventListener('messageerror', this.handleWorkerFailure);
	}

	requestBasinGrid(payload: BasinAnalysisPayload): Promise<BasinGrid> {
		return this.request<BasinGrid>('basin-grid', payload);
	}

	requestStabilitySweep(
		payload: StabilityAnalysisPayload
	): Promise<readonly StabilitySweepEntry[]> {
		return this.request<readonly StabilitySweepEntry[]>('stability-sweep', payload);
	}

	requestMomentumStabilitySweep(
		payload: MomentumStabilityAnalysisPayload
	): Promise<MomentumStabilityGrid> {
		return this.request<MomentumStabilityGrid>('momentum-stability-sweep', payload);
	}

	requestParticleFlow(
		payload: ParticleFlowAnalysisPayload
	): Promise<readonly ParticleTrajectory[]> {
		return this.request<readonly ParticleTrajectory[]>('particle-flow', payload);
	}

	cancel(): void {
		const generation = this.activeGeneration;
		if (generation === null) return;
		if (!this.worker) this.cancelledFallback.add(generation);
		this.pending.get(generation)?.reject(new AnalysisCancelledError());
		this.pending.delete(generation);
		this.activeGeneration = null;
		try {
			this.worker?.postMessage({ type: 'cancel', generation });
		} catch {
			this.disableWorker();
		}
	}

	terminate(): void {
		if (this.terminated) return;
		this.cancel();
		this.terminated = true;
		this.disableWorker();
		for (const pending of this.pending.values()) pending.reject(new AnalysisCancelledError());
		this.pending.clear();
	}

	private request<Result extends AnalysisResult>(
		type: RequestType,
		payload: RequestPayload
	): Promise<Result> {
		if (this.terminated)
			return Promise.reject(new Error('Analysis worker client has been terminated.'));
		this.cancel();
		const generation = ++this.generation;
		this.activeGeneration = generation;

		return new Promise<Result>((resolve, reject) => {
			this.pending.set(generation, {
				type,
				payload,
				resolve: resolve as Pending['resolve'],
				reject
			});
			if (this.worker) {
				try {
					this.worker.postMessage({ type, generation, payload } as AnalysisWorkerRequest);
					return;
				} catch {
					this.disableWorker();
				}
			}
			this.startFallback(generation);
		});
	}

	private startFallback(generation: number): void {
		const pending = this.pending.get(generation);
		if (!pending) return;
		const { type, payload } = pending;
		const shouldCancel = () => this.cancelledFallback.has(generation) || this.terminated;
		void (async () => {
			try {
				let result: AnalysisResult;
				if (type === 'basin-grid') {
					const basinPayload = payload as BasinAnalysisPayload;
					result = await computeBasinGridAsync({
						...basinPayload,
						landscape: createLandscape(basinPayload.landscape),
						shouldCancel
					});
				} else if (type === 'stability-sweep') {
					const stabilityPayload = payload as StabilityAnalysisPayload;
					result = await runStabilitySweepAsync({
						...stabilityPayload,
						landscape: createLandscape(stabilityPayload.landscape),
						shouldCancel
					});
				} else if (type === 'momentum-stability-sweep') {
					const momentumPayload = payload as MomentumStabilityAnalysisPayload;
					result = await runMomentumStabilitySweepAsync({
						...momentumPayload,
						landscape: createLandscape(momentumPayload.landscape),
						shouldCancel
					});
				} else {
					const particlePayload = payload as ParticleFlowAnalysisPayload;
					result = await runParticleFlowAsync({
						...particlePayload,
						landscape: createLandscape(particlePayload.landscape),
						shouldCancel
					});
				}
				if (shouldCancel()) throw new AnalysisCancelledError();
				this.resolveGeneration(generation, result);
			} catch (error) {
				this.rejectGeneration(generation, error);
			} finally {
				this.cancelledFallback.delete(generation);
			}
		})();
	}

	private readonly handleMessage = (event: MessageEvent<unknown>): void => {
		if (!isAnalysisWorkerResponse(event.data)) return;
		const response: AnalysisWorkerResponse = event.data;
		if (
			response.type === 'basin-grid-result' ||
			response.type === 'stability-sweep-result' ||
			response.type === 'momentum-stability-sweep-result' ||
			response.type === 'particle-flow-result'
		) {
			this.resolveGeneration(response.generation, response.result);
		} else if (response.type === 'cancelled') {
			this.rejectGeneration(response.generation, new AnalysisCancelledError());
		} else {
			this.rejectGeneration(response.generation, new Error(response.message));
		}
	};

	private readonly handleWorkerFailure = (): void => {
		if (!this.worker || this.terminated) return;
		this.disableWorker();
		for (const generation of this.pending.keys()) this.startFallback(generation);
	};

	private disableWorker(): void {
		const worker = this.worker;
		if (!worker) return;
		this.worker = null;
		worker.removeEventListener('message', this.handleMessage as EventListener);
		worker.removeEventListener('error', this.handleWorkerFailure);
		worker.removeEventListener('messageerror', this.handleWorkerFailure);
		worker.terminate();
	}

	private resolveGeneration(generation: number, result: AnalysisResult): void {
		const pending = this.pending.get(generation);
		if (!pending) return;
		pending.resolve(result);
		this.pending.delete(generation);
		if (this.activeGeneration === generation) this.activeGeneration = null;
	}

	private rejectGeneration(generation: number, error: unknown): void {
		const pending = this.pending.get(generation);
		if (!pending) return;
		pending.reject(error);
		this.pending.delete(generation);
		if (this.activeGeneration === generation) this.activeGeneration = null;
	}
}
