import { evaluateCircuitAtInstant, runSimulationBatch, snapshotToScopeSample } from './solver';
import type {
	CircuitDocument,
	ReactiveState,
	SimulationSnapshot,
	SolverBatchResult
} from './types';
import type { WorkerRequestMessage, WorkerResponseMessage } from './worker-protocol';

interface PendingTask {
	requestId: number;
	resolve: (res: SolverBatchResult) => void;
	reject: (err: Error) => void;
	fallback: () => SolverBatchResult;
	timer: ReturnType<typeof setTimeout>;
}

export class CircuitWorkerClient {
	private worker: Worker | null = null;
	private nextRequestId = 1;
	private pending = new Map<number, PendingTask>();
	private disposed = false;
	private useWorker: boolean;

	constructor(options: { forceSync?: boolean } = {}) {
		this.useWorker = !options.forceSync && typeof Worker !== 'undefined';
	}

	private ensureWorker(): Worker | null {
		if (!this.useWorker || this.disposed) return null;
		if (this.worker) return this.worker;
		try {
			this.worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
				type: 'module'
			});
			this.worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
				const data = event.data;
				if (!data || data.type !== 'batch_result') return;
				const task = this.pending.get(data.requestId);
				if (!task) return;
				clearTimeout(task.timer);
				this.pending.delete(data.requestId);
				task.resolve(data.result);
			};
			this.worker.onerror = () => {
				this.useWorker = false;
				this.terminateWorker();
				for (const [, task] of this.pending) {
					clearTimeout(task.timer);
					task.resolve(task.fallback());
				}
				this.pending.clear();
			};
			return this.worker;
		} catch {
			this.useWorker = false;
			return null;
		}
	}

	private rejectAll(error: Error): void {
		for (const [, task] of this.pending) {
			clearTimeout(task.timer);
			task.reject(error);
		}
		this.pending.clear();
	}

	cancelActive(): void {
		const latestId = this.nextRequestId++;
		if (this.worker) {
			const msg: WorkerRequestMessage = { type: 'cancel', requestId: latestId };
			this.worker.postMessage(msg);
		}
		this.rejectAll(new Error('Cancelled'));
	}

	async evaluateInstant(
		doc: CircuitDocument,
		timeSec = 0,
		reactiveState?: Partial<ReactiveState>
	): Promise<SolverBatchResult> {
		if (this.disposed) throw new Error('Disposed');
		const worker = this.ensureWorker();
		if (!worker) {
			const res = evaluateCircuitAtInstant(doc, timeSec, reactiveState);
			return res.ok
				? {
						ok: true,
						diagnostics: [],
						snapshot: res.snapshot,
						samples: [snapshotToScopeSample(doc, res.snapshot)],
						stepsExecuted: 0
					}
				: {
						ok: false,
						diagnostics: res.diagnostics,
						snapshot: null,
						samples: [],
						stepsExecuted: 0
					};
		}

		const requestId = this.nextRequestId++;
		const plainDoc = JSON.parse(JSON.stringify(doc)) as CircuitDocument;
		const plainReactive = reactiveState
			? (JSON.parse(JSON.stringify(reactiveState)) as Partial<ReactiveState>)
			: undefined;
		const fallback = (): SolverBatchResult => {
			const res = evaluateCircuitAtInstant(plainDoc, timeSec, plainReactive);
			return res.ok
				? {
						ok: true,
						diagnostics: [],
						snapshot: res.snapshot,
						samples: [snapshotToScopeSample(plainDoc, res.snapshot)],
						stepsExecuted: 0
					}
				: {
						ok: false,
						diagnostics: res.diagnostics,
						snapshot: null,
						samples: [],
						stepsExecuted: 0
					};
		};
		return new Promise<SolverBatchResult>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				this.terminateWorker();
				reject(new Error('Simulation worker timed out.'));
			}, 5000);

			this.pending.set(requestId, { requestId, resolve, reject, fallback, timer });
			const msg: WorkerRequestMessage = {
				type: 'evaluate_instant',
				requestId,
				doc: plainDoc,
				timeSec,
				reactiveState: plainReactive
			};
			try {
				worker.postMessage(msg);
			} catch {
				clearTimeout(timer);
				this.pending.delete(requestId);
				this.useWorker = false;
				resolve(fallback());
			}
		});
	}

	async runBatch(
		doc: CircuitDocument,
		startSnapshot: SimulationSnapshot | null,
		steps: number,
		lastSampleTimeSec: number
	): Promise<SolverBatchResult> {
		if (this.disposed) throw new Error('Disposed');
		const worker = this.ensureWorker();
		if (!worker) {
			return runSimulationBatch(doc, startSnapshot, steps, lastSampleTimeSec);
		}

		const requestId = this.nextRequestId++;
		const plainDoc = JSON.parse(JSON.stringify(doc)) as CircuitDocument;
		const plainSnapshot = startSnapshot
			? (JSON.parse(JSON.stringify(startSnapshot)) as SimulationSnapshot)
			: null;
		const fallback = (): SolverBatchResult =>
			runSimulationBatch(plainDoc, plainSnapshot, steps, lastSampleTimeSec);
		return new Promise<SolverBatchResult>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				this.terminateWorker();
				reject(new Error('Simulation batch timed out.'));
			}, 5000);

			this.pending.set(requestId, { requestId, resolve, reject, fallback, timer });
			const msg: WorkerRequestMessage = {
				type: 'run_batch',
				requestId,
				doc: plainDoc,
				startSnapshot: plainSnapshot,
				steps,
				lastSampleTimeSec
			};
			try {
				worker.postMessage(msg);
			} catch {
				clearTimeout(timer);
				this.pending.delete(requestId);
				this.useWorker = false;
				resolve(fallback());
			}
		});
	}

	private terminateWorker(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
	}

	dispose(): void {
		this.disposed = true;
		this.rejectAll(new Error('Disposed'));
		this.terminateWorker();
	}
}
