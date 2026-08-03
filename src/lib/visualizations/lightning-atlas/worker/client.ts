import type {
	AtlasWorkerRequest,
	AtlasWorkerResponse,
	BatchAnalysisInput,
	BatchAnalysisResult,
	GenerateFlashInput,
	LightningFlash,
	TerrainData
} from '../types';

type PendingRequest = {
	resolve: (value: AtlasWorkerResponse) => void;
	reject: (reason: Error) => void;
	request: AtlasWorkerRequest;
};

type WorkerRequestBody =
	| { type: 'generate-flash'; input: GenerateFlashInput }
	| { type: 'analyse-batch'; input: BatchAnalysisInput };

export type GeneratedFlashResult = { flash: LightningFlash; terrain: TerrainData };

export class LightningAtlasWorkerClient {
	private worker: Worker | null = null;
	private fallback: import('./handler').LightningAtlasWorkerHandler | null = null;
	private pending = new Map<number, PendingRequest>();
	private nextId = 1;
	private disposed = false;
	get usingFallback() {
		return this.worker === null;
	}

	constructor(worker?: Worker | null) {
		this.worker = worker ?? null;
		this.worker?.addEventListener('message', this.handleMessage);
		this.worker?.addEventListener('error', this.handleWorkerError);
	}

	generateFlash(input: GenerateFlashInput): Promise<GeneratedFlashResult> {
		return this.send({ type: 'generate-flash', input }).then((response) => {
			if (response.type !== 'flash') throw new Error('Unexpected worker response.');
			return { flash: response.flash, terrain: response.terrain };
		});
	}

	analyseBatch(input: BatchAnalysisInput): Promise<BatchAnalysisResult> {
		return this.send({ type: 'analyse-batch', input }).then((response) => {
			if (response.type !== 'batch') throw new Error('Unexpected worker response.');
			return response.result;
		});
	}

	cancelAll() {
		for (const [id, pending] of this.pending) {
			this.worker?.postMessage({
				id: this.nextId++,
				type: 'cancel',
				targetId: id
			} satisfies AtlasWorkerRequest);
			this.fallback?.cancel(id);
			pending.reject(new Error('Request cancelled.'));
		}
		this.pending.clear();
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.cancelAll();
		this.worker?.removeEventListener('message', this.handleMessage);
		this.worker?.removeEventListener('error', this.handleWorkerError);
		this.worker?.terminate();
		this.worker = null;
	}

	private send(body: WorkerRequestBody): Promise<AtlasWorkerResponse> {
		if (this.disposed) return Promise.reject(new Error('Lightning Atlas worker is disposed.'));
		const id = this.nextId++;
		const request = { id, ...body } as AtlasWorkerRequest;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject, request });
			if (!this.worker) {
				this.runFallback(id);
				return;
			}
			try {
				this.worker.postMessage(request);
			} catch {
				this.retireWorker();
				for (const pendingId of this.pending.keys()) this.runFallback(pendingId);
			}
		});
	}

	private runFallback(id: number) {
		setTimeout(() => {
			const pending = this.pending.get(id);
			if (!pending || this.disposed) return;
			void this.fallbackHandler()
				.then((handler) => {
					const current = this.pending.get(id);
					if (!current || this.disposed) return null;
					return handler.handleAsync(current.request, { maximumBatchRuns: 120 });
				})
				.then((response) => {
					if (!response) return;
					this.settle(response);
				})
				.catch((error) => {
					const current = this.pending.get(id);
					if (!current) return;
					this.pending.delete(id);
					current.reject(
						error instanceof Error ? error : new Error('Lightning Atlas fallback failed.')
					);
				});
		}, 0);
	}

	private async fallbackHandler() {
		if (this.fallback) return this.fallback;
		const { LightningAtlasWorkerHandler } = await import('./handler');
		this.fallback = new LightningAtlasWorkerHandler();
		return this.fallback;
	}

	private settle(response: AtlasWorkerResponse) {
		const pending = this.pending.get(response.id);
		if (!pending) return;
		this.pending.delete(response.id);
		if (response.type === 'error') pending.reject(new Error(response.message));
		else if (response.type === 'cancelled') pending.reject(new Error('Request cancelled.'));
		else pending.resolve(response);
	}

	private handleMessage = (event: MessageEvent<AtlasWorkerResponse>) => {
		this.settle(event.data);
	};

	private handleWorkerError = () => {
		this.retireWorker();
		for (const id of this.pending.keys()) this.runFallback(id);
	};

	private retireWorker() {
		this.worker?.removeEventListener('message', this.handleMessage);
		this.worker?.removeEventListener('error', this.handleWorkerError);
		this.worker?.terminate();
		this.worker = null;
	}
}

export function createLightningAtlasWorkerClient(): LightningAtlasWorkerClient {
	try {
		return new LightningAtlasWorkerClient(
			new Worker(new URL('./lightning.worker.ts', import.meta.url), { type: 'module' })
		);
	} catch {
		return new LightningAtlasWorkerClient(null);
	}
}
