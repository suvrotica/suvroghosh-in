import {
	FRACTAL_WORKER_PROTOCOL_VERSION,
	isFractalWorkerResponse,
	type BarnsleyFernTaskConfig,
	type DensityTaskConfig,
	type FractalWorkerRequest,
	type FractalWorkerRequestBody,
	type FractalWorkerResponse,
	type RasterTaskConfig
} from './protocol';

export interface FractalWorkerLike {
	postMessage(message: FractalWorkerRequest, transfer?: Transferable[]): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
	removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	removeEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
	terminate(): void;
}

export type FractalWorkerListener = (response: FractalWorkerResponse) => void;

export class FractalProgressiveWorkerClient {
	private taskId = 0;
	private generation = 0;
	private latestIssuedTaskId = 0;
	private disposed = false;
	private readonly listeners = new Set<FractalWorkerListener>();

	constructor(private readonly worker: FractalWorkerLike) {
		this.worker.addEventListener('message', this.handleMessage);
		this.worker.addEventListener('error', this.handleError);
	}

	subscribe(listener: FractalWorkerListener): () => void {
		this.ensureActive();
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	startDensity(config: DensityTaskConfig, autoStart = true): number {
		this.beginGeneration();
		this.send({ type: 'START_DENSITY', config: cloneDensityConfig(config), autoStart });
		return this.generation;
	}

	startFern(config: BarnsleyFernTaskConfig, autoStart = true): number {
		this.beginGeneration();
		this.send({ type: 'START_FERN', config: cloneFernConfig(config), autoStart });
		return this.generation;
	}

	startRaster(config: RasterTaskConfig, autoStart = true): number {
		this.beginGeneration();
		this.send({ type: 'START_RASTER', config: cloneRasterConfig(config), autoStart });
		return this.generation;
	}

	run(): void {
		this.send({ type: 'RUN' });
	}

	pause(): void {
		this.send({ type: 'PAUSE' });
	}

	/** Advances one configured batch, or an explicitly bounded number of fern decisions. */
	step(batchSize?: number): void {
		this.send({ type: 'STEP', batchSize });
	}

	cancel(): void {
		this.send({ type: 'CANCEL' });
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
			this.worker.removeEventListener('error', this.handleError);
			this.listeners.clear();
			this.worker.terminate();
		}
	}

	private beginGeneration(): void {
		this.ensureActive();
		this.generation += 1;
	}

	private send(body: FractalWorkerRequestBody): void {
		this.ensureActive();
		this.taskId += 1;
		this.latestIssuedTaskId = this.taskId;
		this.worker.postMessage({
			protocolVersion: FRACTAL_WORKER_PROTOCOL_VERSION,
			taskId: this.taskId,
			generation: this.generation,
			...body
		} as FractalWorkerRequest);
	}

	private handleMessage = (event: MessageEvent<unknown>) => {
		if (this.disposed || !isFractalWorkerResponse(event.data)) return;
		if (event.data.generation !== this.generation) return;
		/**
		 * Worker messages are ordered, but a computation batch may already have
		 * completed before a pause/cancel command is handled. Once a newer command
		 * has been issued, its task ID is the acceptance barrier for late frames.
		 */
		if (event.data.taskId !== this.latestIssuedTaskId) return;
		for (const listener of this.listeners) listener(event.data);
	};

	private handleError = (event: ErrorEvent) => {
		if (this.disposed) return;
		const response: FractalWorkerResponse = {
			protocolVersion: FRACTAL_WORKER_PROTOCOL_VERSION,
			taskId: this.latestIssuedTaskId,
			generation: this.generation,
			type: 'ERROR',
			message: event.message || 'The Fractal Atlas module Worker stopped unexpectedly.'
		};
		for (const listener of this.listeners) listener(response);
	};

	private ensureActive(): void {
		if (this.disposed) throw new Error('The Fractal Atlas Worker client has been disposed.');
	}
}

export function createFractalProgressiveWorkerClient(): FractalProgressiveWorkerClient {
	if (typeof Worker === 'undefined') {
		throw new Error('The Fractal Atlas Worker can only be created in a browser.');
	}
	const worker = new Worker(new URL('./fractal.worker.ts', import.meta.url), {
		type: 'module',
		name: 'fractal-atlas-progressive'
	});
	return new FractalProgressiveWorkerClient(worker);
}

function cloneDensityConfig(config: DensityTaskConfig): DensityTaskConfig {
	return {
		...config,
		sampleBounds: { ...config.sampleBounds },
		orbitBounds: { ...config.orbitBounds },
		iterationWindows: config.iterationWindows
			? [
					[...config.iterationWindows[0]],
					[...config.iterationWindows[1]],
					[...config.iterationWindows[2]]
				]
			: undefined
	};
}

function cloneFernConfig(config: BarnsleyFernTaskConfig): BarnsleyFernTaskConfig {
	return {
		...config,
		transforms: config.transforms?.map((transform) => ({ ...transform }))
	};
}

function cloneRasterConfig(config: RasterTaskConfig): RasterTaskConfig {
	return {
		...config,
		state: structuredClone(config.state)
	};
}
