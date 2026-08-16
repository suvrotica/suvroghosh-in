import type {
	MeshResolution,
	ShellGenerationResult
} from '$lib/visualizations/gastropod-shell-lab/shell/engine';
import type { ShellRecipe } from '$lib/visualizations/gastropod-shell-lab/shell/model';
import type { GeometryWorkerRequest, GeometryWorkerResponse } from './geometry.worker';

export interface GeometryResult {
	requestId: number;
	result: ShellGenerationResult;
	durationMs: number;
}

export interface GeometryRequestOptions {
	resolution: MeshResolution;
	age?: number;
}

interface Pending {
	resolve: (value: GeometryResult) => void;
	reject: (reason: Error) => void;
}

export class StaleGeometryError extends Error {
	constructor(readonly requestId: number) {
		super(`Geometry response ${requestId} was superseded by a newer request.`);
		this.name = 'StaleGeometryError';
	}
}

export class GeometryBroker {
	private worker: Worker | undefined;
	private latestRequestId = 0;
	private pending = new Map<number, Pending>();
	private disposed = false;

	constructor(private readonly onStatus?: (status: 'working' | 'idle' | 'error') => void) {}

	private ensureWorker(): Worker {
		if (this.disposed) throw new Error('Geometry broker has been disposed.');
		if (this.worker) return this.worker;
		const worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (event: MessageEvent<GeometryWorkerResponse>) => {
			const message = event.data;
			const pending = this.pending.get(message.requestId);
			if (!pending) return;
			this.pending.delete(message.requestId);
			if (message.requestId !== this.latestRequestId) {
				pending.reject(new StaleGeometryError(message.requestId));
				return;
			}
			if (message.type === 'error') {
				this.onStatus?.('error');
				pending.reject(new Error(message.message));
				return;
			}
			this.onStatus?.('idle');
			pending.resolve({
				requestId: message.requestId,
				result: message.result,
				durationMs: message.durationMs
			});
		};
		worker.onerror = (event) => {
			if (this.worker !== worker) return;
			worker.terminate();
			this.worker = undefined;
			this.onStatus?.('error');
			const error = new Error(event.message || 'Geometry worker failed.');
			for (const pending of this.pending.values()) pending.reject(error);
			this.pending.clear();
		};
		this.worker = worker;
		return worker;
	}

	request(recipe: ShellRecipe, options: GeometryRequestOptions): Promise<GeometryResult> {
		const requestId = ++this.latestRequestId;
		const hadInFlightWork = this.pending.size > 0;
		for (const [id, pending] of this.pending) {
			if (id < requestId) {
				pending.reject(new StaleGeometryError(id));
				this.pending.delete(id);
			}
		}
		if (hadInFlightWork) {
			// A Worker processes posted messages serially. Restarting here prevents a
			// refined request from waiting behind a queue of obsolete drag previews.
			this.worker?.terminate();
			this.worker = undefined;
		}
		this.onStatus?.('working');
		const message: GeometryWorkerRequest = {
			type: 'generate',
			requestId,
			recipe: structuredClone(recipe),
			resolution: options.resolution,
			age: options.age ?? 1
		};
		return new Promise<GeometryResult>((resolve, reject) => {
			this.pending.set(requestId, { resolve, reject });
			this.ensureWorker().postMessage(message);
		});
	}

	cancel(restart = false): void {
		const error = new StaleGeometryError(this.latestRequestId);
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
		if (restart) {
			this.worker?.terminate();
			this.worker = undefined;
		}
		this.onStatus?.('idle');
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.cancel(true);
	}

	get latestId(): number {
		return this.latestRequestId;
	}

	get hasWorker(): boolean {
		return this.worker !== undefined;
	}
}
