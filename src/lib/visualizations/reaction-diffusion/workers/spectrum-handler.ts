import { analyzeSpatialSpectrum } from './spectrum-analysis';
import {
	SPECTRUM_WORKER_PROTOCOL_VERSION,
	isSpectrumWorkerRequest,
	type SpectrumWorkerRequest,
	type SpectrumWorkerResponse
} from './spectrum-protocol';

export class SpectrumWorkerHandler {
	private latestGeneration = 0;
	private disposed = false;

	handle(request: SpectrumWorkerRequest): SpectrumWorkerResponse {
		if (!isSpectrumWorkerRequest(request)) {
			return errorResponse(request, new Error('Malformed spectrum Worker request.'));
		}
		try {
			if (this.disposed && request.type !== 'DISPOSE') {
				throw new Error('The spatial-spectrum Worker has been disposed.');
			}
			if (request.type === 'DISPOSE') {
				this.disposed = true;
				return { ...envelope(request), type: 'DISPOSED' };
			}
			if (request.type === 'CANCEL') {
				if (request.generation !== this.latestGeneration)
					return stale(request, this.latestGeneration);
				return { ...envelope(request), type: 'CANCELLED' };
			}
			if (request.generation <= this.latestGeneration) return stale(request, this.latestGeneration);
			this.latestGeneration = request.generation;
			return {
				...envelope(request),
				type: 'SPECTRUM_RESULT',
				result: analyzeSpatialSpectrum(request.input)
			};
		} catch (error) {
			return errorResponse(request, error);
		}
	}
}

function envelope(request: SpectrumWorkerRequest) {
	return {
		protocolVersion: SPECTRUM_WORKER_PROTOCOL_VERSION,
		requestId: request.requestId,
		generation: request.generation
	} as const;
}

function stale(request: SpectrumWorkerRequest, activeGeneration: number): SpectrumWorkerResponse {
	return { ...envelope(request), type: 'STALE', activeGeneration };
}

function errorResponse(
	request: Pick<SpectrumWorkerRequest, 'requestId' | 'generation'>,
	error: unknown
): SpectrumWorkerResponse {
	return {
		protocolVersion: SPECTRUM_WORKER_PROTOCOL_VERSION,
		requestId: Number.isSafeInteger(request.requestId) ? request.requestId : 0,
		generation: Number.isSafeInteger(request.generation) ? request.generation : 0,
		type: 'ERROR',
		message: error instanceof Error ? error.message : 'Unknown spatial-spectrum Worker error.',
		...(error instanceof Error && error.stack ? { stack: error.stack } : {})
	};
}
