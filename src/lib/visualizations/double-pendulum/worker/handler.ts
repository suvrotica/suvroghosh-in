import {
	atlasCacheKey,
	computeAtlasRows,
	validateAtlasSettings,
	type AtlasSettings
} from '../atlas';
import {
	ATLAS_WORKER_PROTOCOL_VERSION,
	type AtlasWorkerRequest,
	type AtlasWorkerResponse
} from './protocol';

interface ActiveAtlasTask {
	requestId: number;
	generation: number;
	settings: AtlasSettings;
	cacheKey: string;
	nextRow: number;
}

/**
 * Stateful but platform-independent atlas scheduler. It performs exactly one
 * bounded row chunk per `processNextChunk` call so a real Worker can yield to
 * CANCEL messages between calls and tests can drive it synchronously.
 */
export class AtlasWorkerHandler {
	private disposed = false;
	private latestGeneration = 0;
	private activeTask: ActiveAtlasTask | null = null;

	get isRunning(): boolean {
		return this.activeTask !== null;
	}

	get activeGeneration(): number {
		return this.latestGeneration;
	}

	abortActive(): void {
		this.activeTask = null;
	}

	handle(request: AtlasWorkerRequest): AtlasWorkerResponse[] {
		try {
			if (this.disposed && request.type !== 'DISPOSE') {
				throw new Error('The Prediction Horizon Atlas Worker has been disposed.');
			}

			switch (request.type) {
				case 'START':
					return this.start(request);
				case 'CANCEL':
					return this.cancel(request);
				case 'DISPOSE':
					this.activeTask = null;
					this.disposed = true;
					return [{ ...envelope(request), type: 'DISPOSED' }];
			}
		} catch (error) {
			this.activeTask = null;
			return [errorResponse(request, error)];
		}
	}

	processNextChunk(): AtlasWorkerResponse[] {
		const task = this.activeTask;
		if (!task || this.disposed) return [];

		try {
			const remainingRows = task.settings.height - task.nextRow;
			const rowCount = Math.min(task.settings.rowsPerChunk, remainingRows);
			const chunk = computeAtlasRows(task.settings, task.nextRow, rowCount);
			task.nextRow += rowCount;

			const responses: AtlasWorkerResponse[] = [
				{
					...taskEnvelope(task),
					type: 'CHUNK',
					chunk
				}
			];

			if (task.nextRow >= task.settings.height) {
				this.activeTask = null;
				responses.push({
					...taskEnvelope(task),
					type: 'COMPLETE',
					cacheKey: task.cacheKey,
					totalRows: task.settings.height,
					totalCells: task.settings.width * task.settings.height
				});
			}

			return responses;
		} catch (error) {
			this.activeTask = null;
			return [
				{
					...taskEnvelope(task),
					type: 'ERROR',
					message: error instanceof Error ? error.message : 'Unknown atlas computation error.',
					...(error instanceof Error && error.stack ? { stack: error.stack } : {})
				}
			];
		}
	}

	private start(request: Extract<AtlasWorkerRequest, { type: 'START' }>): AtlasWorkerResponse[] {
		if (request.generation <= this.latestGeneration) {
			return [staleResponse(request, this.latestGeneration)];
		}

		const settings = validateAtlasSettings(request.settings);
		this.latestGeneration = request.generation;
		this.activeTask = {
			requestId: request.requestId,
			generation: request.generation,
			settings,
			cacheKey: atlasCacheKey(settings),
			nextRow: 0
		};

		return [
			{
				...envelope(request),
				type: 'READY',
				cacheKey: this.activeTask.cacheKey,
				totalRows: settings.height,
				totalCells: settings.width * settings.height
			}
		];
	}

	private cancel(request: Extract<AtlasWorkerRequest, { type: 'CANCEL' }>): AtlasWorkerResponse[] {
		if (request.generation !== this.latestGeneration) {
			return [staleResponse(request, this.latestGeneration)];
		}

		const completedRows = this.activeTask?.nextRow ?? 0;
		const totalRows = this.activeTask?.settings.height ?? 0;
		this.activeTask = null;
		return [
			{
				...envelope(request),
				type: 'CANCELLED',
				completedRows,
				totalRows
			}
		];
	}
}

function envelope(request: AtlasWorkerRequest) {
	return {
		protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
		requestId: request.requestId,
		generation: request.generation
	} as const;
}

function taskEnvelope(task: ActiveAtlasTask) {
	return {
		protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
		requestId: task.requestId,
		generation: task.generation
	} as const;
}

function staleResponse(request: AtlasWorkerRequest, activeGeneration: number): AtlasWorkerResponse {
	return {
		...envelope(request),
		type: 'STALE',
		activeGeneration
	};
}

function errorResponse(request: AtlasWorkerRequest, error: unknown): AtlasWorkerResponse {
	return {
		...envelope(request),
		type: 'ERROR',
		message: error instanceof Error ? error.message : 'Unknown atlas Worker error.',
		...(error instanceof Error && error.stack ? { stack: error.stack } : {})
	};
}
