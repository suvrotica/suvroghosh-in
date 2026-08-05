import {
	AnalysisCancelledError,
	computeBasinGridAsync,
	runMomentumStabilitySweepAsync,
	runParticleFlowAsync,
	runStabilitySweepAsync
} from './analysis';
import type { AnalysisWorkerRequest, AnalysisWorkerResponse } from './analysis-worker-protocol';
import { createLandscape } from './landscapes';

export type AnalysisWorkerEmit = (response: AnalysisWorkerResponse) => void;

/**
 * Pure request handler shared by the real Worker and unit tests. Every new
 * generation supersedes older work; explicit cancellation targets one generation.
 */
export function createAnalysisWorkerHandler(emit: AnalysisWorkerEmit) {
	let newestGeneration = 0;
	const cancelled = new Set<number>();

	return (request: AnalysisWorkerRequest): void => {
		if (!Number.isSafeInteger(request.generation) || request.generation < 1) {
			emit({
				type: 'error',
				generation: request.generation,
				message: 'Invalid analysis generation.'
			});
			return;
		}
		if (request.type === 'cancel') {
			cancelled.add(request.generation);
			return;
		}

		newestGeneration = Math.max(newestGeneration, request.generation);
		const generation = request.generation;
		const shouldCancel = () => cancelled.has(generation) || generation < newestGeneration;

		void (async () => {
			try {
				if (request.type === 'basin-grid') {
					const result = await computeBasinGridAsync({
						...request.payload,
						landscape: createLandscape(request.payload.landscape),
						shouldCancel
					});
					if (shouldCancel()) throw new AnalysisCancelledError();
					emit({ type: 'basin-grid-result', generation, result });
				} else if (request.type === 'stability-sweep') {
					const result = await runStabilitySweepAsync({
						...request.payload,
						landscape: createLandscape(request.payload.landscape),
						shouldCancel
					});
					if (shouldCancel()) throw new AnalysisCancelledError();
					emit({ type: 'stability-sweep-result', generation, result });
				} else if (request.type === 'momentum-stability-sweep') {
					const result = await runMomentumStabilitySweepAsync({
						...request.payload,
						landscape: createLandscape(request.payload.landscape),
						shouldCancel
					});
					if (shouldCancel()) throw new AnalysisCancelledError();
					emit({ type: 'momentum-stability-sweep-result', generation, result });
				} else {
					const result = await runParticleFlowAsync({
						...request.payload,
						landscape: createLandscape(request.payload.landscape),
						shouldCancel
					});
					if (shouldCancel()) throw new AnalysisCancelledError();
					emit({ type: 'particle-flow-result', generation, result });
				}
			} catch (error) {
				if (error instanceof AnalysisCancelledError || shouldCancel()) {
					emit({ type: 'cancelled', generation });
				} else {
					emit({
						type: 'error',
						generation,
						message: error instanceof Error ? error.message : String(error)
					});
				}
			} finally {
				cancelled.delete(generation);
			}
		})();
	};
}
