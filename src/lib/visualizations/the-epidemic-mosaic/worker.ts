import { generateCityNetwork } from './city.ts';
import { runBatchComparison } from './model.ts';
import {
	DEFAULT_BATCH_REPETITIONS,
	DEFAULT_CITY_SEED,
	type BatchComparisonResult,
	type BridgeSelection,
	type CityNetwork,
	type EpidemicParameters,
	type ExperimentMode
} from './types.ts';

export type BatchWorkerRequest =
	| {
			type: 'START_BATCH';
			generationId: number;
			citySeed?: number;
			experimentMode: ExperimentMode;
			bridge?: Partial<BridgeSelection> | null;
			vaccineBudget?: number;
			parameters?: Partial<EpidemicParameters>;
			repetitions?: number;
	  }
	| {
			type: 'CANCEL_BATCH';
			generationId: number;
	  };

export type BatchWorkerResponse =
	| {
			type: 'BATCH_PROGRESS';
			generationId: number;
			completedRuns: number;
			totalRuns: number;
	  }
	| {
			type: 'BATCH_COMPLETE';
			generationId: number;
			result: BatchComparisonResult;
	  }
	| {
			type: 'BATCH_CANCELLED';
			generationId: number;
	  };

let cachedCity: CityNetwork | null = null;
let activeGenerationId = 0;
let activeTimer: ReturnType<typeof setTimeout> | null = null;

function getCity(citySeed: number = DEFAULT_CITY_SEED): CityNetwork {
	if (!cachedCity || cachedCity.citySeed !== citySeed) {
		cachedCity = generateCityNetwork(citySeed);
	}
	return cachedCity;
}

/**
 * Synchronous handler used by unit tests and fallback environments.
 */
export function executeBatchRequestSync(
	request: Extract<BatchWorkerRequest, { type: 'START_BATCH' }>,
	onProgress?: (completed: number, total: number) => void
): BatchComparisonResult {
	const city = getCity(request.citySeed ?? DEFAULT_CITY_SEED);
	return runBatchComparison({
		city,
		experimentMode: request.experimentMode,
		bridge: request.bridge,
		vaccineBudget: request.vaccineBudget,
		parameters: request.parameters,
		repetitions: request.repetitions ?? DEFAULT_BATCH_REPETITIONS,
		onProgress
	});
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
	self.addEventListener('message', (event: MessageEvent<BatchWorkerRequest>) => {
		const msg = event.data;
		if (!msg) return;

		if (msg.type === 'CANCEL_BATCH') {
			if (activeTimer !== null) {
				clearTimeout(activeTimer);
				activeTimer = null;
			}
			activeGenerationId = msg.generationId;
			self.postMessage({
				type: 'BATCH_CANCELLED',
				generationId: msg.generationId
			} satisfies BatchWorkerResponse);
			return;
		}

		if (msg.type === 'START_BATCH') {
			if (activeTimer !== null) {
				clearTimeout(activeTimer);
				activeTimer = null;
			}
			const genId = msg.generationId;
			activeGenerationId = genId;

			const totalRuns = Math.max(
				1,
				Math.min(100, Math.round(msg.repetitions ?? DEFAULT_BATCH_REPETITIONS))
			);

			// Execute via macrotask slices so a CANCEL_BATCH message can preempt before completion
			let currentStep = 0;
			const city = getCity(msg.citySeed ?? DEFAULT_CITY_SEED);

			const runNextSlice = () => {
				if (activeGenerationId !== genId) return;
				currentStep = Math.min(totalRuns, currentStep + 4);
				self.postMessage({
					type: 'BATCH_PROGRESS',
					generationId: genId,
					completedRuns: currentStep,
					totalRuns
				} satisfies BatchWorkerResponse);

				if (currentStep < totalRuns) {
					activeTimer = setTimeout(runNextSlice, 8);
				} else {
					activeTimer = null;
					const result = runBatchComparison({
						city,
						experimentMode: msg.experimentMode,
						bridge: msg.bridge,
						vaccineBudget: msg.vaccineBudget,
						parameters: msg.parameters,
						repetitions: totalRuns
					});
					if (activeGenerationId === genId) {
						self.postMessage({
							type: 'BATCH_COMPLETE',
							generationId: genId,
							result
						} satisfies BatchWorkerResponse);
					}
				}
			};

			activeTimer = setTimeout(runNextSlice, 4);
		}
	});
}
