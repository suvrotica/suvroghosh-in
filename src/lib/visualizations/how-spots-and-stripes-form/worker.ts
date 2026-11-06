import { SpotStripeSolver, SynchronisedComparisonEngine } from './engine.ts';
import { normalizeSpotStripeConfig } from './presets.ts';
import type { ComparisonSnapshot, SimulationSnapshot, SpotStripeConfig } from './types.ts';

export type WorkerRequestMessage =
	| {
			type: 'INIT';
			generationId: number;
			config: Partial<SpotStripeConfig>;
			compareEqualSpreading: boolean;
			evolveToObservationTime: boolean;
	  }
	| {
			type: 'STEP';
			generationId: number;
			steps: number;
	  };

export type WorkerResponseMessage = {
	type: 'SNAPSHOT';
	generationId: number;
	compareEqualSpreading: boolean;
	primary: SimulationSnapshot;
	comparison: ComparisonSnapshot | null;
};

let activeGenerationId = 0;
let activeCompareMode = false;
let singleSolver: SpotStripeSolver | null = null;
let comparisonEngine: SynchronisedComparisonEngine | null = null;

function buildResponse(): WorkerResponseMessage | null {
	if (activeCompareMode && comparisonEngine) {
		const comparison = comparisonEngine.snapshot();
		return {
			type: 'SNAPSHOT',
			generationId: activeGenerationId,
			compareEqualSpreading: true,
			primary: comparison.different,
			comparison
		};
	}
	if (singleSolver) {
		return {
			type: 'SNAPSHOT',
			generationId: activeGenerationId,
			compareEqualSpreading: false,
			primary: singleSolver.snapshot(),
			comparison: null
		};
	}
	return null;
}

export function handleWorkerRequest(message: WorkerRequestMessage): WorkerResponseMessage | null {
	if (message.type === 'INIT') {
		activeGenerationId = message.generationId;
		activeCompareMode = message.compareEqualSpreading;
		const config = normalizeSpotStripeConfig(message.config);
		const targetSteps = message.evolveToObservationTime
			? Math.round(config.observationTime / config.timestep)
			: 0;

		if (activeCompareMode) {
			singleSolver = null;
			comparisonEngine = new SynchronisedComparisonEngine(config);
			if (targetSteps > 0) {
				comparisonEngine.step(targetSteps);
			}
		} else {
			comparisonEngine = null;
			singleSolver = new SpotStripeSolver(config);
			if (targetSteps > 0) {
				singleSolver.step(targetSteps);
			}
		}
		return buildResponse();
	}

	if (message.type === 'STEP') {
		if (message.generationId !== activeGenerationId) {
			return null;
		}
		const steps = Math.max(1, Math.min(2000, Math.round(message.steps)));
		if (activeCompareMode && comparisonEngine) {
			comparisonEngine.step(steps);
		} else if (singleSolver) {
			singleSolver.step(steps);
		}
		return buildResponse();
	}

	return null;
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
	self.addEventListener('message', (event: MessageEvent<WorkerRequestMessage>) => {
		const response = handleWorkerRequest(event.data);
		if (response) {
			self.postMessage(response);
		}
	});
}
