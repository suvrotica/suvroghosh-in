import {
	ENSEMBLE_SIZE,
	MODEL_VERSION,
	createModelParameters,
	deriveEnsembleSeeds,
	simulateMatchedEnsembles,
	simulateSingle,
	type EnsembleSummary,
	type MatchedEnsembleResult,
	type ModelParameters,
	type SimulationResult
} from '../model';
import {
	NUCLEUS_WORKER_PROTOCOL_VERSION,
	type CompactEnsembleArm,
	type CompactMatchedEnsembleResult,
	type NucleusWorkerRequest,
	type NucleusWorkerResponse
} from './protocol';

export const MAX_FALLBACK_ENSEMBLE_CHUNK = 4;

export interface NucleusWorkerHandlerOptions {
	cooperativeEnsemble?: boolean;
	yieldControl?: () => Promise<void>;
	ensembleChunkSize?: number;
}

interface ActiveRun {
	runId: number;
	cancelled: boolean;
}

export type NucleusWorkerEmitter = (response: NucleusWorkerResponse) => void;

/** Shared scientific request handler. Cooperative mode is used by the main-thread fallback. */
export class NucleusWorkerHandler {
	private readonly cooperativeEnsemble: boolean;
	private readonly yieldControl: () => Promise<void>;
	private readonly ensembleChunkSize: number;
	private active: ActiveRun | null = null;
	private disposed = false;

	constructor(options: NucleusWorkerHandlerOptions = {}) {
		this.cooperativeEnsemble = options.cooperativeEnsemble ?? false;
		this.yieldControl = options.yieldControl ?? yieldToEventLoop;
		const requestedChunk = options.ensembleChunkSize ?? MAX_FALLBACK_ENSEMBLE_CHUNK;
		if (!Number.isSafeInteger(requestedChunk) || requestedChunk < 1) {
			throw new RangeError('The ensemble chunk size must be a positive safe integer.');
		}
		this.ensembleChunkSize = Math.min(requestedChunk, MAX_FALLBACK_ENSEMBLE_CHUNK);
	}

	cancel(runId: number): void {
		if (this.active?.runId === runId) this.active.cancelled = true;
	}

	dispose(): void {
		this.disposed = true;
		if (this.active) this.active.cancelled = true;
		this.active = null;
	}

	async handle(request: NucleusWorkerRequest, emit: NucleusWorkerEmitter): Promise<void> {
		if (request.type === 'CANCEL') {
			this.cancel(request.runId);
			if (!this.disposed) emit(envelope(request.runId, { type: 'CANCELLED' }));
			return;
		}
		if (request.type === 'DISPOSE') {
			this.dispose();
			emit(envelope(request.runId, { type: 'DISPOSED' }));
			return;
		}
		const task = request.type === 'RUN_FOCAL_PAIR' ? 'focal' : 'ensemble';
		if (this.disposed) {
			emit(
				envelope(request.runId, {
					type: 'ERROR',
					task,
					message: 'The Weather Inside the Nucleus Worker handler has been disposed.'
				})
			);
			return;
		}

		if (this.active) this.active.cancelled = true;
		const token: ActiveRun = { runId: request.runId, cancelled: false };
		this.active = token;
		try {
			if (request.type === 'RUN_FOCAL_PAIR') {
				const baseline = simulateSingle({ seed: request.seed, parameters: request.baseline });
				if (this.cooperativeEnsemble) await this.yieldControl();
				if (!this.isActive(token)) return;
				const intervention = simulateSingle({
					seed: request.seed,
					parameters: request.intervention
				});
				if (!this.isActive(token)) return;
				emit(
					envelope(request.runId, {
						type: 'FOCAL_PAIR_RESULT',
						result: { modelVersion: MODEL_VERSION, seed: request.seed, baseline, intervention }
					})
				);
				return;
			}

			const result = this.cooperativeEnsemble
				? await this.runCooperativeEnsemble(request, token)
				: compactMatchedEnsemble(
						simulateMatchedEnsembles({
							rootSeed: request.rootSeed,
							baseline: request.baseline,
							intervention: request.intervention,
							count: ENSEMBLE_SIZE
						})
					);
			if (!result || !this.isActive(token)) return;
			emit(envelope(request.runId, { type: 'MATCHED_ENSEMBLE_RESULT', result }));
		} catch (error) {
			if (!this.isActive(token)) return;
			emit(
				envelope(request.runId, {
					type: 'ERROR',
					task,
					message: error instanceof Error ? error.message : 'The scientific Worker task failed.',
					...(error instanceof Error && error.stack ? { stack: error.stack } : {})
				})
			);
		} finally {
			if (this.active === token) this.active = null;
		}
	}

	private async runCooperativeEnsemble(
		request: Extract<NucleusWorkerRequest, { type: 'RUN_MATCHED_ENSEMBLE' }>,
		token: ActiveRun
	): Promise<CompactMatchedEnsembleResult | null> {
		const seeds = deriveEnsembleSeeds(request.rootSeed, ENSEMBLE_SIZE);
		const baseline = createArmBuilder(request.baseline);
		const intervention = createArmBuilder(request.intervention);
		for (let start = 0; start < ENSEMBLE_SIZE; start += this.ensembleChunkSize) {
			const end = Math.min(ENSEMBLE_SIZE, start + this.ensembleChunkSize);
			for (let index = start; index < end; index += 1) {
				if (!this.isActive(token)) return null;
				const seed = seeds[index];
				appendRun(baseline, index, simulateSingle({ seed, parameters: baseline.parameters }));
				appendRun(
					intervention,
					index,
					simulateSingle({ seed, parameters: intervention.parameters })
				);
			}
			if (end < ENSEMBLE_SIZE) {
				await this.yieldControl();
				if (!this.isActive(token)) return null;
			}
		}
		return {
			modelVersion: MODEL_VERSION,
			rootSeed: request.rootSeed,
			runCount: ENSEMBLE_SIZE,
			seeds,
			baseline: finishArm(baseline),
			intervention: finishArm(intervention)
		};
	}

	private isActive(token: ActiveRun): boolean {
		return !this.disposed && !token.cancelled && this.active === token;
	}
}

export function compactMatchedEnsemble(
	result: MatchedEnsembleResult
): CompactMatchedEnsembleResult {
	return {
		modelVersion: result.baseline.modelVersion,
		rootSeed: result.baseline.rootSeed,
		runCount: ENSEMBLE_SIZE,
		seeds: result.seeds,
		baseline: compactArm(result.baseline),
		intervention: compactArm(result.intervention)
	};
}

function compactArm(result: MatchedEnsembleResult['baseline']): CompactEnsembleArm {
	return {
		parameters: result.parameters,
		burstCounts: result.burstCounts,
		initiationCounts: result.initiationCounts,
		firstBurstTimes: result.firstBurstTimes,
		firstBurstCensored: result.firstBurstCensored,
		nearFractions: result.nearFractions,
		summary: result.summary
	};
}

interface ArmBuilder {
	parameters: Readonly<ModelParameters>;
	burstCounts: Uint16Array;
	initiationCounts: Uint32Array;
	firstBurstTimes: Float64Array;
	firstBurstCensored: Uint8Array;
	nearFractions: Float64Array;
	burstingRunCount: number;
	totalBurstCount: number;
	totalInitiationCount: number;
	totalNearFraction: number;
	restrictedFirstBurstTotal: number;
	completedBurstDurationTotal: number;
	completedBurstCount: number;
	promoterOnTimeTotal: number;
	observedFirstBurstTimes: number[];
}

function createArmBuilder(parameters: Readonly<ModelParameters>): ArmBuilder {
	return {
		parameters: createModelParameters(parameters),
		burstCounts: new Uint16Array(ENSEMBLE_SIZE),
		initiationCounts: new Uint32Array(ENSEMBLE_SIZE),
		firstBurstTimes: new Float64Array(ENSEMBLE_SIZE),
		firstBurstCensored: new Uint8Array(ENSEMBLE_SIZE),
		nearFractions: new Float64Array(ENSEMBLE_SIZE),
		burstingRunCount: 0,
		totalBurstCount: 0,
		totalInitiationCount: 0,
		totalNearFraction: 0,
		restrictedFirstBurstTotal: 0,
		completedBurstDurationTotal: 0,
		completedBurstCount: 0,
		promoterOnTimeTotal: 0,
		observedFirstBurstTimes: []
	};
}

function appendRun(builder: ArmBuilder, index: number, result: SimulationResult): void {
	const summary = result.summary;
	if (summary.burstCount > 0xffff) throw new Error('Burst count exceeds Uint16 capacity.');
	builder.burstCounts[index] = summary.burstCount;
	builder.initiationCounts[index] = summary.initiationCount;
	builder.nearFractions[index] = summary.nearFraction;
	builder.totalBurstCount += summary.burstCount;
	builder.totalInitiationCount += summary.initiationCount;
	builder.totalNearFraction += summary.nearFraction;
	builder.promoterOnTimeTotal += summary.promoterOnTime;
	for (const duration of result.completedBurstDurations) {
		builder.completedBurstDurationTotal += duration;
		builder.completedBurstCount += 1;
	}
	if (summary.firstBurstTime === null) {
		builder.firstBurstTimes[index] = Number.NaN;
		builder.firstBurstCensored[index] = 1;
		builder.restrictedFirstBurstTotal += builder.parameters.duration;
	} else {
		builder.firstBurstTimes[index] = summary.firstBurstTime;
		builder.observedFirstBurstTimes.push(summary.firstBurstTime);
		builder.restrictedFirstBurstTotal += summary.firstBurstTime;
		builder.burstingRunCount += 1;
	}
}

function finishArm(builder: ArmBuilder): CompactEnsembleArm {
	builder.observedFirstBurstTimes.sort((left, right) => left - right);
	const summary: EnsembleSummary = {
		runCount: ENSEMBLE_SIZE,
		burstingRunCount: builder.burstingRunCount,
		silentRunCount: ENSEMBLE_SIZE - builder.burstingRunCount,
		burstFraction: builder.burstingRunCount / ENSEMBLE_SIZE,
		meanBurstCount: builder.totalBurstCount / ENSEMBLE_SIZE,
		meanInitiationCount: builder.totalInitiationCount / ENSEMBLE_SIZE,
		meanNearFraction: builder.totalNearFraction / ENSEMBLE_SIZE,
		medianFirstBurstTimeAmongBursting: medianOrNull(builder.observedFirstBurstTimes),
		restrictedMeanTimeToFirstBurst: builder.restrictedFirstBurstTotal / ENSEMBLE_SIZE,
		meanCompletedBurstDuration:
			builder.completedBurstCount > 0
				? builder.completedBurstDurationTotal / builder.completedBurstCount
				: null,
		meanInitiationsPerPromoterOnMinute:
			builder.promoterOnTimeTotal > 0
				? builder.totalInitiationCount / builder.promoterOnTimeTotal
				: null
	};
	return {
		parameters: builder.parameters,
		burstCounts: builder.burstCounts,
		initiationCounts: builder.initiationCounts,
		firstBurstTimes: builder.firstBurstTimes,
		firstBurstCensored: builder.firstBurstCensored,
		nearFractions: builder.nearFractions,
		summary
	};
}

function medianOrNull(sorted: readonly number[]): number | null {
	if (sorted.length === 0) return null;
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

type ResponseBody = NucleusWorkerResponse extends infer Response
	? Response extends NucleusWorkerResponse
		? Omit<Response, 'protocolVersion' | 'runId'>
		: never
	: never;

function envelope(runId: number, body: ResponseBody): NucleusWorkerResponse {
	return {
		protocolVersion: NUCLEUS_WORKER_PROTOCOL_VERSION,
		runId,
		...body
	} as NucleusWorkerResponse;
}

function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
