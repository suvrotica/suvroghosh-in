import { CpuTiledFractalAccumulator } from '../render/cpu';
import { DensityAccumulator } from './density';
import { BarnsleyFernAccumulator } from './fern';
import {
	FRACTAL_WORKER_PROTOCOL_VERSION,
	type FractalWorkerRequest,
	type FractalWorkerResponse,
	type FractalWorkerResponseBody,
	type WorkerPhase,
	type WorkerProgress
} from './protocol';

interface ActiveJobBase {
	generation: number;
	taskId: number;
	running: boolean;
}

interface DensityJob extends ActiveJobBase {
	kind: 'density';
	accumulator: DensityAccumulator;
}

interface FernJob extends ActiveJobBase {
	kind: 'barnsley-fern';
	accumulator: BarnsleyFernAccumulator;
}

interface RasterJob extends ActiveJobBase {
	kind: 'raster';
	accumulator: CpuTiledFractalAccumulator;
}

type ActiveJob = DensityJob | FernJob | RasterJob;

export class FractalWorkerHandler {
	private activeJob: ActiveJob | null = null;
	private latestGeneration = -1;
	private disposed = false;

	get isRunning(): boolean {
		return this.activeJob?.running === true;
	}

	get currentGeneration(): number | null {
		return this.activeJob?.generation ?? null;
	}

	handle(request: FractalWorkerRequest): FractalWorkerResponse[] {
		if (request.protocolVersion !== FRACTAL_WORKER_PROTOCOL_VERSION) {
			return [this.error(request, 'Unsupported Fractal Atlas Worker protocol version.')];
		}

		if (request.type === 'DISPOSE') {
			this.activeJob = null;
			this.latestGeneration = Math.max(this.latestGeneration, request.generation);
			this.disposed = true;
			return [this.response(request, { type: 'DISPOSED' })];
		}

		if (this.disposed) {
			return [this.error(request, 'The Fractal Atlas Worker has been disposed.')];
		}

		try {
			switch (request.type) {
				case 'START_DENSITY':
					return this.startDensity(request);
				case 'START_FERN':
					return this.startFern(request);
				case 'START_RASTER':
					return this.startRaster(request);
				case 'RUN':
					return this.setRunning(request, true);
				case 'PAUSE':
					return this.setRunning(request, false);
				case 'STEP':
					return this.step(request);
				case 'CANCEL':
					return this.cancel(request);
			}
		} catch (error) {
			return [
				this.error(
					request,
					error instanceof Error ? error.message : 'Unknown Fractal Atlas Worker error.',
					error instanceof Error ? error.stack : undefined
				)
			];
		}
	}

	/**
	 * Advances at most one bounded batch. The real Worker calls this once per
	 * event-loop turn so pause, cancel and a newer generation can take effect.
	 */
	processNextBatch(): FractalWorkerResponse[] {
		const job = this.activeJob;
		if (!job?.running || this.disposed) return [];
		try {
			return this.advance(job, false);
		} catch (error) {
			job.running = false;
			return [
				this.error(
					this.jobEnvelope(job),
					error instanceof Error ? error.message : 'Unknown progressive rendering error.',
					error instanceof Error ? error.stack : undefined
				)
			];
		}
	}

	private startDensity(
		request: Extract<FractalWorkerRequest, { type: 'START_DENSITY' }>
	): FractalWorkerResponse[] {
		const generationResponse = this.checkNewGeneration(request);
		if (generationResponse) return [generationResponse];

		const accumulator = new DensityAccumulator(request.config);
		const job: DensityJob = {
			kind: 'density',
			generation: request.generation,
			taskId: request.taskId,
			running: request.autoStart !== false,
			accumulator
		};
		this.activeJob = job;
		this.latestGeneration = request.generation;
		return [
			this.response(request, {
				type: 'READY',
				task: job.kind,
				phase: this.phase(job),
				progress: this.progress(job)
			})
		];
	}

	private startFern(
		request: Extract<FractalWorkerRequest, { type: 'START_FERN' }>
	): FractalWorkerResponse[] {
		const generationResponse = this.checkNewGeneration(request);
		if (generationResponse) return [generationResponse];

		const accumulator = new BarnsleyFernAccumulator(request.config);
		const job: FernJob = {
			kind: 'barnsley-fern',
			generation: request.generation,
			taskId: request.taskId,
			running: request.autoStart !== false,
			accumulator
		};
		this.activeJob = job;
		this.latestGeneration = request.generation;
		return [
			this.response(request, {
				type: 'READY',
				task: job.kind,
				phase: this.phase(job),
				progress: this.progress(job)
			})
		];
	}

	private startRaster(
		request: Extract<FractalWorkerRequest, { type: 'START_RASTER' }>
	): FractalWorkerResponse[] {
		const generationResponse = this.checkNewGeneration(request);
		if (generationResponse) return [generationResponse];

		const accumulator = new CpuTiledFractalAccumulator(
			request.config.state,
			request.config.width,
			request.config.height,
			{
				preview: request.config.preview,
				maxPixels: request.config.maxPixels,
				maxIterations: request.config.maxIterations,
				tileWidth: request.config.tileWidth,
				tileHeight: request.config.tileHeight
			}
		);
		const job: RasterJob = {
			kind: 'raster',
			generation: request.generation,
			taskId: request.taskId,
			running: request.autoStart !== false,
			accumulator
		};
		this.activeJob = job;
		this.latestGeneration = request.generation;
		return [
			this.response(request, {
				type: 'READY',
				task: job.kind,
				phase: this.phase(job),
				progress: this.progress(job)
			})
		];
	}

	private setRunning(
		request: Extract<FractalWorkerRequest, { type: 'RUN' | 'PAUSE' }>,
		running: boolean
	): FractalWorkerResponse[] {
		const currentResponse = this.checkCurrentJob(request);
		if (currentResponse) return [currentResponse];
		const job = this.activeJob as ActiveJob;
		job.taskId = request.taskId;
		job.running = running && !this.isComplete(job);
		return [
			this.response(request, {
				type: 'STATUS',
				task: job.kind,
				phase: this.phase(job),
				progress: this.progress(job)
			})
		];
	}

	private step(request: Extract<FractalWorkerRequest, { type: 'STEP' }>): FractalWorkerResponse[] {
		const currentResponse = this.checkCurrentJob(request);
		if (currentResponse) return [currentResponse];
		const job = this.activeJob as ActiveJob;
		job.taskId = request.taskId;
		job.running = false;
		return this.advance(job, true, request.batchSize);
	}

	private cancel(
		request: Extract<FractalWorkerRequest, { type: 'CANCEL' }>
	): FractalWorkerResponse[] {
		const job = this.activeJob;
		if (job && request.generation < job.generation) {
			return [this.stale(request, job.generation)];
		}
		if (job && request.generation === job.generation && request.taskId < job.taskId) {
			return [this.stale(request, job.generation, 'An older task command was ignored.')];
		}
		this.activeJob = null;
		this.latestGeneration = Math.max(this.latestGeneration, request.generation);
		return [this.response(request, { type: 'CANCELLED' })];
	}

	private advance(
		job: ActiveJob,
		forceFrame: boolean,
		batchSize?: number
	): FractalWorkerResponse[] {
		const envelope = this.jobEnvelope(job);
		const responses: FractalWorkerResponse[] = [];

		if (job.kind === 'density') {
			job.accumulator.advanceBatch();
			if (job.accumulator.complete) job.running = false;
			if (forceFrame || job.accumulator.shouldPublishFrame) {
				responses.push(
					this.response(envelope, {
						type: 'DENSITY_FRAME',
						frame: job.accumulator.createFrame(job.running)
					})
				);
			}
		} else if (job.kind === 'barnsley-fern') {
			const frame = job.accumulator.advanceBatch(job.running, batchSize);
			if (job.accumulator.complete) {
				job.running = false;
				frame.running = false;
			}
			responses.push(this.response(envelope, { type: 'FERN_FRAME', frame }));
		} else {
			const tile = job.accumulator.advanceTile();
			if (job.accumulator.complete) job.running = false;
			if (tile) {
				responses.push(
					this.response(envelope, {
						type: 'RASTER_TILE',
						frame: {
							...tile,
							renderWidth: job.accumulator.width,
							renderHeight: job.accumulator.height,
							iterations: job.accumulator.iterations,
							requestedIterations: job.accumulator.requestedIterations,
							phase: tile.complete ? 'complete' : 'colour'
						}
					})
				);
			} else {
				responses.push(
					this.response(envelope, {
						type: 'STATUS',
						task: job.kind,
						phase: this.phase(job),
						progress: this.progress(job)
					})
				);
			}
		}

		if (this.isComplete(job)) {
			responses.push(
				this.response(envelope, {
					type: 'COMPLETE',
					task: job.kind,
					progress: this.progress(job)
				})
			);
		}
		return responses;
	}

	private checkNewGeneration(request: FractalWorkerRequest): FractalWorkerResponse | null {
		if (request.generation <= this.latestGeneration) {
			return this.stale(
				request,
				Math.max(0, this.latestGeneration),
				'A start request must use a generation newer than every previous task.'
			);
		}
		return null;
	}

	private checkCurrentJob(request: FractalWorkerRequest): FractalWorkerResponse | null {
		const job = this.activeJob;
		if (!job) return this.error(request, 'No progressive fractal task is active.');
		if (request.generation < job.generation) return this.stale(request, job.generation);
		if (request.generation > job.generation) {
			return this.error(request, 'Start the requested generation before sending control commands.');
		}
		if (request.taskId < job.taskId) {
			return this.stale(request, job.generation, 'An older task command was ignored.');
		}
		return null;
	}

	private phase(job: ActiveJob): WorkerPhase {
		if (this.isComplete(job)) return 'complete';
		return job.running ? 'running' : 'paused';
	}

	private isComplete(job: ActiveJob): boolean {
		return job.accumulator.complete;
	}

	private progress(job: ActiveJob): WorkerProgress {
		const completed =
			job.kind === 'density'
				? job.accumulator.samplesProcessed
				: job.kind === 'barnsley-fern'
					? job.accumulator.totalPoints
					: job.accumulator.completedWorkUnits;
		const total =
			job.kind === 'density'
				? job.accumulator.totalSamples
				: job.kind === 'barnsley-fern'
					? job.accumulator.targetPoints
					: job.accumulator.totalWorkUnits;
		return { completed, total, progress: completed / total };
	}

	private jobEnvelope(job: ActiveJob): FractalWorkerRequest {
		return {
			protocolVersion: FRACTAL_WORKER_PROTOCOL_VERSION,
			taskId: job.taskId,
			generation: job.generation,
			type: 'RUN'
		};
	}

	private stale(
		request: FractalWorkerRequest,
		activeGeneration: number,
		message = 'A stale Worker generation was ignored.'
	): FractalWorkerResponse {
		return this.response(request, { type: 'STALE', activeGeneration, message });
	}

	private error(
		request: Pick<FractalWorkerRequest, 'taskId' | 'generation'>,
		message: string,
		stack?: string
	): FractalWorkerResponse {
		return this.response(request, { type: 'ERROR', message, stack });
	}

	private response(
		request: Pick<FractalWorkerRequest, 'taskId' | 'generation'>,
		body: FractalWorkerResponseBody
	): FractalWorkerResponse {
		return {
			protocolVersion: FRACTAL_WORKER_PROTOCOL_VERSION,
			taskId: request.taskId,
			generation: request.generation,
			...body
		} as FractalWorkerResponse;
	}
}
