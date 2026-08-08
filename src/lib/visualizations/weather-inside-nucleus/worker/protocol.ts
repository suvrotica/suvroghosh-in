import {
	ENSEMBLE_SIZE,
	MODEL_VERSION,
	PARAMETER_DEFINITIONS,
	validateModelParameters,
	type EnsembleSummary,
	type ModelParameters,
	type RunSummary,
	type SimulationResult
} from '../model';

export const NUCLEUS_WORKER_PROTOCOL_VERSION = 1 as const;
export const NUCLEUS_ENSEMBLE_SIZE = ENSEMBLE_SIZE;

interface Envelope {
	protocolVersion: typeof NUCLEUS_WORKER_PROTOCOL_VERSION;
	runId: number;
}

export interface FocalPairRequest extends Envelope {
	type: 'RUN_FOCAL_PAIR';
	seed: number;
	baseline: Readonly<ModelParameters>;
	intervention: Readonly<ModelParameters>;
}

export interface MatchedEnsembleRequest extends Envelope {
	type: 'RUN_MATCHED_ENSEMBLE';
	rootSeed: number;
	baseline: Readonly<ModelParameters>;
	intervention: Readonly<ModelParameters>;
}

export interface CancelRequest extends Envelope {
	type: 'CANCEL';
}

export interface DisposeRequest extends Envelope {
	type: 'DISPOSE';
}

export type NucleusWorkerRequest =
	| FocalPairRequest
	| MatchedEnsembleRequest
	| CancelRequest
	| DisposeRequest;

export interface FocalPairResult {
	modelVersion: string;
	seed: number;
	baseline: SimulationResult;
	intervention: SimulationResult;
}

export interface CompactEnsembleArm {
	parameters: Readonly<ModelParameters>;
	burstCounts: Uint16Array;
	initiationCounts: Uint32Array;
	firstBurstTimes: Float64Array;
	firstBurstCensored: Uint8Array;
	nearFractions: Float64Array;
	summary: EnsembleSummary;
}

export interface CompactMatchedEnsembleResult {
	modelVersion: string;
	rootSeed: number;
	runCount: typeof ENSEMBLE_SIZE;
	seeds: Uint32Array;
	baseline: CompactEnsembleArm;
	intervention: CompactEnsembleArm;
}

export interface FocalPairResponse extends Envelope {
	type: 'FOCAL_PAIR_RESULT';
	result: FocalPairResult;
}

export interface MatchedEnsembleResponse extends Envelope {
	type: 'MATCHED_ENSEMBLE_RESULT';
	result: CompactMatchedEnsembleResult;
}

export interface CancelledResponse extends Envelope {
	type: 'CANCELLED';
}

export interface DisposedResponse extends Envelope {
	type: 'DISPOSED';
}

export interface ErrorResponse extends Envelope {
	type: 'ERROR';
	task: 'focal' | 'ensemble' | null;
	message: string;
	stack?: string;
}

export type NucleusWorkerResponse =
	| FocalPairResponse
	| MatchedEnsembleResponse
	| CancelledResponse
	| DisposedResponse
	| ErrorResponse;

export function isNucleusWorkerRequest(value: unknown): value is NucleusWorkerRequest {
	if (!hasEnvelope(value)) return false;
	const candidate = value as Record<string, unknown>;
	switch (candidate.type) {
		case 'RUN_FOCAL_PAIR':
			return (
				Number(candidate.runId) > 0 &&
				isUint32(candidate.seed) &&
				isModelParameters(candidate.baseline) &&
				isModelParameters(candidate.intervention)
			);
		case 'RUN_MATCHED_ENSEMBLE':
			return (
				Number(candidate.runId) > 0 &&
				isUint32(candidate.rootSeed) &&
				isModelParameters(candidate.baseline) &&
				isModelParameters(candidate.intervention)
			);
		case 'CANCEL':
		case 'DISPOSE':
			return true;
		default:
			return false;
	}
}

export function isNucleusWorkerResponse(value: unknown): value is NucleusWorkerResponse {
	if (!hasEnvelope(value)) return false;
	const candidate = value as Record<string, unknown>;
	switch (candidate.type) {
		case 'FOCAL_PAIR_RESULT':
			return isFocalPairResult(candidate.result);
		case 'MATCHED_ENSEMBLE_RESULT':
			return isCompactMatchedEnsembleResult(candidate.result);
		case 'CANCELLED':
		case 'DISPOSED':
			return true;
		case 'ERROR':
			return (
				(candidate.task === null || candidate.task === 'focal' || candidate.task === 'ensemble') &&
				typeof candidate.message === 'string' &&
				candidate.message.length > 0 &&
				(candidate.stack === undefined || typeof candidate.stack === 'string')
			);
		default:
			return false;
	}
}

export function isFocalPairResult(value: unknown): value is FocalPairResult {
	if (!isRecord(value)) return false;
	return (
		value.modelVersion === MODEL_VERSION &&
		isUint32(value.seed) &&
		isSimulationResult(value.baseline) &&
		isSimulationResult(value.intervention) &&
		value.baseline.seed === value.seed &&
		value.intervention.seed === value.seed
	);
}

export function isCompactMatchedEnsembleResult(
	value: unknown
): value is CompactMatchedEnsembleResult {
	if (!isRecord(value)) return false;
	return (
		value.modelVersion === MODEL_VERSION &&
		isUint32(value.rootSeed) &&
		value.runCount === ENSEMBLE_SIZE &&
		value.seeds instanceof Uint32Array &&
		value.seeds.length === ENSEMBLE_SIZE &&
		isCompactArm(value.baseline) &&
		isCompactArm(value.intervention)
	);
}

export function responseTransferables(response: NucleusWorkerResponse): ArrayBuffer[] {
	const views: ArrayBufferView[] = [];
	if (response.type === 'FOCAL_PAIR_RESULT') {
		collectSimulationViews(response.result.baseline, views);
		collectSimulationViews(response.result.intervention, views);
	} else if (response.type === 'MATCHED_ENSEMBLE_RESULT') {
		views.push(response.result.seeds);
		collectArmViews(response.result.baseline, views);
		collectArmViews(response.result.intervention, views);
	}
	const buffers = new Set<ArrayBuffer>();
	for (const view of views) {
		if (view.buffer instanceof ArrayBuffer) buffers.add(view.buffer);
	}
	return [...buffers];
}

function hasEnvelope(value: unknown): value is Record<string, unknown> & Envelope {
	return (
		isRecord(value) &&
		value.protocolVersion === NUCLEUS_WORKER_PROTOCOL_VERSION &&
		isRunId(value.runId) &&
		typeof value.type === 'string'
	);
}

function isSimulationResult(value: unknown): value is SimulationResult {
	if (!isRecord(value) || value.modelVersion !== MODEL_VERSION || !isUint32(value.seed))
		return false;
	if (!isModelParameters(value.parameters) || !isRecord(value.timeline)) return false;
	const timeline = value.timeline;
	const floats = [
		timeline.time,
		timeline.signalInput,
		timeline.receptorActivity,
		timeline.downstreamActivity,
		timeline.nuclearActivity,
		timeline.occupancy,
		timeline.licensing,
		timeline.contactPropensity
	];
	if (!floats.every((entry) => entry instanceof Float64Array)) return false;
	const length = (timeline.time as Float64Array).length;
	if (length < 1 || !floats.every((entry) => (entry as Float64Array).length === length))
		return false;
	if (
		!(timeline.contactState instanceof Uint8Array) ||
		!(timeline.promoterState instanceof Uint8Array) ||
		!(timeline.rnaCount instanceof Uint32Array) ||
		timeline.contactState.length !== length ||
		timeline.promoterState.length !== length ||
		timeline.rnaCount.length !== length
	) {
		return false;
	}
	for (const key of [
		'contactTransitionTimes',
		'burstStartTimes',
		'burstEndTimes',
		'completedBurstDurations',
		'initiationTimes'
	] as const) {
		if (!(value[key] instanceof Float64Array)) return false;
	}
	return isRunSummary(value.summary);
}

function isRunSummary(value: unknown): value is RunSummary {
	if (!isRecord(value) || !isUint32(value.seed) || typeof value.hadBurst !== 'boolean')
		return false;
	for (const key of [
		'burstCount',
		'completedBurstCount',
		'censoredBurstCount',
		'initiationCount',
		'closeEncounterCount'
	] as const) {
		if (!isNonNegativeInteger(value[key])) return false;
	}
	for (const key of [
		'promoterOnTime',
		'nearTime',
		'nearFraction',
		'receptorActivityIntegral',
		'downstreamActivityIntegral',
		'nuclearActivityIntegral',
		'occupancyIntegral'
	] as const) {
		if (!isFiniteNonNegative(value[key])) return false;
	}
	for (const key of [
		'firstBurstTime',
		'firstInitiationTime',
		'meanCompletedBurstDuration',
		'meanInitiationsPerBurst'
	] as const) {
		if (value[key] !== null && !isFiniteNonNegative(value[key])) return false;
	}
	return true;
}

function isCompactArm(value: unknown): value is CompactEnsembleArm {
	if (!isRecord(value) || !isModelParameters(value.parameters)) return false;
	if (
		!(value.burstCounts instanceof Uint16Array) ||
		!(value.initiationCounts instanceof Uint32Array) ||
		!(value.firstBurstTimes instanceof Float64Array) ||
		!(value.firstBurstCensored instanceof Uint8Array) ||
		!(value.nearFractions instanceof Float64Array)
	) {
		return false;
	}
	const arrays = [
		value.burstCounts,
		value.initiationCounts,
		value.firstBurstTimes,
		value.firstBurstCensored,
		value.nearFractions
	];
	if (!arrays.every((array) => array.length === ENSEMBLE_SIZE)) return false;
	if (!isRecord(value.summary) || value.summary.runCount !== ENSEMBLE_SIZE) return false;
	return (
		isNonNegativeInteger(value.summary.burstingRunCount) &&
		isNonNegativeInteger(value.summary.silentRunCount) &&
		value.summary.burstingRunCount + value.summary.silentRunCount === ENSEMBLE_SIZE &&
		isFiniteNonNegative(value.summary.burstFraction) &&
		isFiniteNonNegative(value.summary.meanBurstCount) &&
		isFiniteNonNegative(value.summary.meanInitiationCount) &&
		isFiniteNonNegative(value.summary.meanNearFraction) &&
		isFiniteNonNegative(value.summary.restrictedMeanTimeToFirstBurst)
	);
}

function isModelParameters(value: unknown): value is Readonly<ModelParameters> {
	if (!isRecord(value)) return false;
	const keys = Object.keys(PARAMETER_DEFINITIONS);
	if (Object.keys(value).length !== keys.length) return false;
	if (!keys.every((key) => typeof value[key] === 'number')) return false;
	try {
		validateModelParameters(value as unknown as ModelParameters);
		return true;
	} catch {
		return false;
	}
}

function collectSimulationViews(result: SimulationResult, target: ArrayBufferView[]): void {
	target.push(
		result.timeline.time,
		result.timeline.signalInput,
		result.timeline.receptorActivity,
		result.timeline.downstreamActivity,
		result.timeline.nuclearActivity,
		result.timeline.occupancy,
		result.timeline.licensing,
		result.timeline.contactPropensity,
		result.timeline.contactState,
		result.timeline.promoterState,
		result.timeline.rnaCount,
		result.contactTransitionTimes,
		result.burstStartTimes,
		result.burstEndTimes,
		result.completedBurstDurations,
		result.initiationTimes
	);
}

function collectArmViews(arm: CompactEnsembleArm, target: ArrayBufferView[]): void {
	target.push(
		arm.burstCounts,
		arm.initiationCounts,
		arm.firstBurstTimes,
		arm.firstBurstCensored,
		arm.nearFractions
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isRunId(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isUint32(value: unknown): value is number {
	return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 0xffff_ffff;
}

function isNonNegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isFiniteNonNegative(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
