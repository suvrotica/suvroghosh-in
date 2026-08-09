import { generateCoreExperience } from '../core';
import { TrajectoryComputationError } from '../model/trajectory';
import { ORCHESTRA_WORKER_PROTOCOL_VERSION } from '../versions';
import type {
	OrchestraWorkerRequest,
	OrchestraWorkerResponse,
	OrchestraWorkerResponseBody
} from './protocol';

interface ActiveGeneration {
	readonly generation: number;
	readonly requestId: number;
	readonly abortController: AbortController;
}

export type OrchestraWorkerEmitter = (response: OrchestraWorkerResponse) => void;

function envelope(
	request: OrchestraWorkerRequest,
	body: OrchestraWorkerResponseBody
): OrchestraWorkerResponse {
	return {
		protocolVersion: ORCHESTRA_WORKER_PROTOCOL_VERSION,
		requestId: request.requestId,
		generation: request.generation,
		...body
	} as OrchestraWorkerResponse;
}

export interface OrchestraWorkerHandlerOptions {
	readonly yieldControl?: () => Promise<void>;
}

export class OrchestraWorkerHandler {
	private active: ActiveGeneration | null = null;
	private disposed = false;
	private readonly yieldControl: () => Promise<void>;

	constructor(options: OrchestraWorkerHandlerOptions = {}) {
		this.yieldControl = options.yieldControl ?? (() => Promise.resolve());
	}

	cancel(generation?: number): void {
		if (this.active && (generation === undefined || this.active.generation === generation)) {
			this.active.abortController.abort();
		}
	}

	dispose(): void {
		this.disposed = true;
		this.cancel();
		this.active = null;
	}

	async handle(request: OrchestraWorkerRequest, emit: OrchestraWorkerEmitter): Promise<void> {
		if (request.type === 'CANCEL') {
			this.cancel(request.generation);
			emit(envelope(request, { type: 'CANCELLED' }));
			return;
		}
		if (request.type === 'DISPOSE') {
			this.dispose();
			emit(envelope(request, { type: 'DISPOSED' }));
			return;
		}
		if (this.disposed) {
			emit(envelope(request, { type: 'ERROR', message: 'The orchestra Worker is disposed.' }));
			return;
		}
		this.cancel();
		const active: ActiveGeneration = {
			generation: request.generation,
			requestId: request.requestId,
			abortController: new AbortController()
		};
		this.active = active;
		try {
			await this.yieldControl();
			if (active.abortController.signal.aborted || this.active !== active) return;
			const result = generateCoreExperience(request.snapshot, {
				pointCount: request.pointCount,
				mobile: request.mobile,
				durationSeconds: request.durationSeconds,
				includeDiagnostics: request.includeDiagnostics,
				diagnosticPointCount: request.diagnosticPointCount,
				lyapunovDuration: request.lyapunovDuration,
				signal: active.abortController.signal,
				onProgress: (progress) => {
					if (this.active === active && !active.abortController.signal.aborted) {
						emit(envelope(request, { type: 'PROGRESS', progress }));
					}
				}
			});
			if (this.active === active && !active.abortController.signal.aborted) {
				emit(envelope(request, { type: 'RESULT', result }));
			}
		} catch (error) {
			if (
				active.abortController.signal.aborted ||
				(error instanceof TrajectoryComputationError && error.code === 'ABORTED')
			) {
				emit(envelope(request, { type: 'CANCELLED' }));
			} else {
				emit(
					envelope(request, {
						type: 'ERROR',
						message: error instanceof Error ? error.message : 'Scientific generation failed.',
						...(error instanceof Error && error.stack ? { stack: error.stack } : {})
					})
				);
			}
		} finally {
			if (this.active === active) this.active = null;
		}
	}
}
