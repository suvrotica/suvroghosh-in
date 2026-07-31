import { generateCity } from '../engine/generator';
import type { GenerationEvent } from '../engine/types';
import {
	CITY_WORKER_PROTOCOL_VERSION,
	type CityWorkerRequest,
	type CityWorkerResponse
} from './protocol';

export type CityWorkerEmit = (response: CityWorkerResponse) => void;

export class CityWorkerHandler {
	private disposed = false;

	handle(request: CityWorkerRequest, emit: CityWorkerEmit = () => undefined): CityWorkerResponse {
		try {
			if (this.disposed && request.type !== 'DISPOSE') {
				throw new Error('The city generation Worker has been disposed.');
			}
			switch (request.type) {
				case 'GENERATE': {
					const pending: GenerationEvent[] = [];
					const flush = () => {
						if (pending.length === 0) return;
						emit({
							...envelope(request),
							type: 'PROGRESS',
							events: pending.splice(0, pending.length)
						});
					};
					const result = generateCity(request.config, (event) => {
						pending.push(event);
						if (pending.length >= 48) flush();
					});
					flush();
					return { ...envelope(request), type: 'COMPLETE', result };
				}
				case 'CANCEL':
					return { ...envelope(request), type: 'CANCELLED' };
				case 'DISPOSE':
					this.disposed = true;
					return { ...envelope(request), type: 'DISPOSED' };
			}
		} catch (error) {
			return {
				...envelope(request),
				type: 'ERROR',
				message: error instanceof Error ? error.message : 'Unknown city generation error.',
				stack: error instanceof Error ? error.stack : undefined
			};
		}
	}
}

function envelope(request: CityWorkerRequest) {
	return {
		protocolVersion: CITY_WORKER_PROTOCOL_VERSION,
		requestId: request.requestId,
		jobId: request.jobId
	} as const;
}
