import type {
	CoreGenerationResult,
	GenerationProgress,
	OrchestraSnapshot,
	SonicEvent
} from '../types';
import {
	ORCHESTRA_INTEGRATOR_VERSION,
	ORCHESTRA_MAPPING_VERSION,
	ORCHESTRA_MODEL_VERSION,
	ORCHESTRA_WORKER_PROTOCOL_VERSION
} from '../versions';
import { getAttractorDefinition, isAttractorId } from '../model/registry';
import { isNoiseFamily } from '../noise/noise-fields';
import { isNoiseLens } from '../noise/noise-transform';
import { isSoundWorldId } from '../score/musical-worlds';

interface WorkerEnvelope {
	readonly protocolVersion: typeof ORCHESTRA_WORKER_PROTOCOL_VERSION;
	readonly requestId: number;
	readonly generation: number;
}

export type OrchestraWorkerRequest =
	| (WorkerEnvelope & {
			readonly type: 'GENERATE';
			readonly snapshot: OrchestraSnapshot;
			readonly pointCount?: number;
			readonly mobile?: boolean;
			readonly durationSeconds?: number;
			readonly includeDiagnostics?: boolean;
			readonly diagnosticPointCount?: number;
			readonly lyapunovDuration?: number;
	  })
	| (WorkerEnvelope & { readonly type: 'CANCEL' })
	| (WorkerEnvelope & { readonly type: 'DISPOSE' });

type WithoutEnvelope<Message> = Message extends unknown
	? Omit<Message, keyof WorkerEnvelope>
	: never;

export type OrchestraWorkerRequestBody = WithoutEnvelope<OrchestraWorkerRequest>;

export type OrchestraWorkerResponse =
	| (WorkerEnvelope & { readonly type: 'PROGRESS'; readonly progress: GenerationProgress })
	| (WorkerEnvelope & { readonly type: 'RESULT'; readonly result: CoreGenerationResult })
	| (WorkerEnvelope & { readonly type: 'CANCELLED' })
	| (WorkerEnvelope & { readonly type: 'DISPOSED' })
	| (WorkerEnvelope & {
			readonly type: 'ERROR';
			readonly message: string;
			readonly stack?: string;
	  });

export type OrchestraWorkerResponseBody = WithoutEnvelope<OrchestraWorkerResponse>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isSafeId(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}

function hasEnvelope(value: unknown): value is WorkerEnvelope & Record<string, unknown> {
	return (
		isRecord(value) &&
		value.protocolVersion === ORCHESTRA_WORKER_PROTOCOL_VERSION &&
		isSafeId(value.requestId) &&
		isSafeId(value.generation) &&
		typeof value.type === 'string'
	);
}

export function isOrchestraSnapshot(value: unknown): value is OrchestraSnapshot {
	if (!isRecord(value) || !isAttractorId(value.attractorId)) return false;
	const expectedStep = getAttractorDefinition(value.attractorId).stepSize ?? 1;
	return (
		typeof value.masterSeed === 'string' &&
		/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(value.masterSeed) &&
		value.parameterPreset === 'canonical' &&
		value.initialConditionPreset === 'canonical' &&
		value.integratorVersion === ORCHESTRA_INTEGRATOR_VERSION &&
		value.mappingVersion === ORCHESTRA_MAPPING_VERSION &&
		isNoiseFamily(value.noiseFamily) &&
		isNoiseLens(value.noiseLens) &&
		typeof value.noiseInfluence === 'number' &&
		Number.isFinite(value.noiseInfluence) &&
		value.noiseInfluence >= 0 &&
		value.noiseInfluence <= 1 &&
		isSoundWorldId(value.soundWorld) &&
		(value.timingMode === 'raw' || value.timingMode === 'composed') &&
		typeof value.simulationRate === 'number' &&
		Number.isFinite(value.simulationRate) &&
		value.simulationRate >= 0.25 &&
		value.simulationRate <= 4 &&
		typeof value.stableStepSize === 'number' &&
		Math.abs(value.stableStepSize - expectedStep) <= Math.max(1e-12, expectedStep * 1e-9)
	);
}

function isProgress(value: unknown): value is GenerationProgress {
	if (!isRecord(value)) return false;
	return (
		(value.phase === 'burn-in' ||
			value.phase === 'calibration' ||
			value.phase === 'trajectory' ||
			value.phase === 'weather' ||
			value.phase === 'features' ||
			value.phase === 'score' ||
			value.phase === 'diagnostics') &&
		isSafeId(value.completed) &&
		isSafeId(value.total) &&
		Number(value.completed) <= Number(value.total) &&
		typeof value.progress01 === 'number' &&
		Number.isFinite(value.progress01) &&
		value.progress01 >= 0 &&
		value.progress01 <= 1
	);
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
	return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isFiniteVector3(value: unknown, minimum?: number, maximum?: number): boolean {
	return (
		Array.isArray(value) &&
		value.length === 3 &&
		value.every(
			(component) =>
				typeof component === 'number' &&
				Number.isFinite(component) &&
				(minimum === undefined || component >= minimum) &&
				(maximum === undefined || component <= maximum)
		)
	);
}

function isScientificDiagnostics(value: unknown): boolean {
	if (!isRecord(value) || !isRecord(value.finiteTimeLyapunov) || !isRecord(value.stepComparison)) {
		return false;
	}
	const lyapunov = value.finiteTimeLyapunov;
	const comparison = value.stepComparison;
	return (
		lyapunov.label === 'Finite-time largest Lyapunov estimate' &&
		(lyapunov.status === 'available' ||
			lyapunov.status === 'warming-up' ||
			lyapunov.status === 'not-applicable' ||
			lyapunov.status === 'failed') &&
		isFiniteNumberOrNull(lyapunov.value) &&
		(lyapunov.value === null || Math.abs(lyapunov.value) <= 100) &&
		typeof lyapunov.simulatedDuration === 'number' &&
		Number.isFinite(lyapunov.simulatedDuration) &&
		lyapunov.simulatedDuration >= 0 &&
		isSafeId(lyapunov.renormalizations) &&
		isFiniteNumberOrNull(lyapunov.convergenceDelta) &&
		(lyapunov.convergenceDelta === null || lyapunov.convergenceDelta >= 0) &&
		typeof lyapunov.converged === 'boolean' &&
		typeof lyapunov.note === 'string' &&
		comparison.label === 'Fixed-step h versus h/2 statistical comparison' &&
		(comparison.status === 'available' ||
			comparison.status === 'not-applicable' ||
			comparison.status === 'failed') &&
		isFiniteNumberOrNull(comparison.registeredStep) &&
		isFiniteNumberOrNull(comparison.comparisonStep) &&
		isSafeId(comparison.pointCount) &&
		comparison.pointCount <= 4_096 &&
		(comparison.coordinateMeanDelta01 === null ||
			isFiniteVector3(comparison.coordinateMeanDelta01, 0, 1)) &&
		(comparison.coordinateDeviationRatio === null ||
			isFiniteVector3(comparison.coordinateDeviationRatio, Number.MIN_VALUE)) &&
		isFiniteNumberOrNull(comparison.occupancyTotalVariation) &&
		(comparison.occupancyTotalVariation === null ||
			(comparison.occupancyTotalVariation >= 0 && comparison.occupancyTotalVariation <= 1)) &&
		isFiniteNumberOrNull(comparison.returnIntervalMedianRatio) &&
		(comparison.returnIntervalMedianRatio === null || comparison.returnIntervalMedianRatio > 0) &&
		typeof comparison.note === 'string' &&
		isFiniteNumberOrNull(value.timeAveragedDivergence)
	);
}

function isUnitInterval(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isCoreSonicEvent(value: unknown): value is SonicEvent {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === 'string' &&
		value.id.length > 0 &&
		isSafeId(value.simulationStep) &&
		typeof value.simulationTime === 'number' &&
		Number.isFinite(value.simulationTime) &&
		typeof value.time === 'number' &&
		Number.isFinite(value.time) &&
		value.time >= 0 &&
		(value.type === 'section-crossing' ||
			value.type === 'region-transition' ||
			value.type === 'recurrence' ||
			value.type === 'fold' ||
			value.type === 'cell-boundary') &&
		(value.pitchHz === undefined ||
			(typeof value.pitchHz === 'number' &&
				Number.isFinite(value.pitchHz) &&
				value.pitchHz >= 20 &&
				value.pitchHz <= 20_000)) &&
		isUnitInterval(value.velocity01) &&
		typeof value.duration === 'number' &&
		Number.isFinite(value.duration) &&
		value.duration > 0 &&
		value.duration <= 6 &&
		typeof value.pan === 'number' &&
		Number.isFinite(value.pan) &&
		value.pan >= -0.65 &&
		value.pan <= 0.65 &&
		isUnitInterval(value.height) &&
		isUnitInterval(value.curvature) &&
		isUnitInterval(value.stretching) &&
		isUnitInterval(value.recurrence) &&
		isUnitInterval(value.density) &&
		isUnitInterval(value.noise) &&
		isSafeId(value.region) &&
		typeof value.sourceFeature === 'string' &&
		value.sourceFeature.length > 0 &&
		typeof value.explanation === 'string' &&
		value.explanation.length > 0
	);
}

export function isOrchestraWorkerRequest(value: unknown): value is OrchestraWorkerRequest {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'GENERATE':
			return (
				value.generation > 0 &&
				isOrchestraSnapshot(value.snapshot) &&
				(value.pointCount === undefined ||
					(Number.isSafeInteger(value.pointCount) &&
						Number(value.pointCount) >= 16 &&
						Number(value.pointCount) <= 100_000)) &&
				(value.mobile === undefined || typeof value.mobile === 'boolean') &&
				(value.durationSeconds === undefined ||
					(typeof value.durationSeconds === 'number' &&
						Number.isFinite(value.durationSeconds) &&
						value.durationSeconds > 0 &&
						value.durationSeconds <= 600)) &&
				(value.includeDiagnostics === undefined || typeof value.includeDiagnostics === 'boolean') &&
				(value.diagnosticPointCount === undefined ||
					(Number.isSafeInteger(value.diagnosticPointCount) &&
						Number(value.diagnosticPointCount) >= 128 &&
						Number(value.diagnosticPointCount) <= 4_096)) &&
				(value.lyapunovDuration === undefined ||
					(typeof value.lyapunovDuration === 'number' &&
						Number.isFinite(value.lyapunovDuration) &&
						value.lyapunovDuration > 0 &&
						value.lyapunovDuration <= 100_000))
			);
		case 'CANCEL':
		case 'DISPOSE':
			return true;
		default:
			return false;
	}
}

function isCoreResult(value: unknown): value is CoreGenerationResult {
	if (!isRecord(value) || value.modelVersion !== ORCHESTRA_MODEL_VERSION) return false;
	if (!isOrchestraSnapshot(value.snapshot) || !isRecord(value.trajectory)) return false;
	const count = value.trajectory.pointCount;
	if (!Number.isSafeInteger(count) || Number(count) < 16) return false;
	if (!isRecord(value.weather) || !isRecord(value.features)) return false;
	return (
		value.trajectory.rawPositions instanceof Float64Array &&
		value.trajectory.rawPositions.length === Number(count) * 3 &&
		value.trajectory.normalizedPositions instanceof Float64Array &&
		value.trajectory.normalizedPositions.length === Number(count) * 3 &&
		value.weather.warpedPositions instanceof Float64Array &&
		value.weather.warpedPositions.length === Number(count) * 3 &&
		value.features.position01 instanceof Float64Array &&
		value.features.position01.length === Number(count) * 3 &&
		Array.isArray(value.score) &&
		value.score.every(isCoreSonicEvent) &&
		typeof value.scoreHash === 'string' &&
		/^[0-9a-f]{8}$/u.test(value.scoreHash) &&
		(value.diagnostics === undefined || isScientificDiagnostics(value.diagnostics))
	);
}

export function isOrchestraWorkerResponse(value: unknown): value is OrchestraWorkerResponse {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'PROGRESS':
			return isProgress(value.progress);
		case 'RESULT':
			return isCoreResult(value.result);
		case 'CANCELLED':
		case 'DISPOSED':
			return true;
		case 'ERROR':
			return (
				typeof value.message === 'string' &&
				value.message.length > 0 &&
				(value.stack === undefined || typeof value.stack === 'string')
			);
		default:
			return false;
	}
}

function collectResultViews(result: CoreGenerationResult): ArrayBufferView[] {
	return [
		result.trajectory.simulationSteps,
		result.trajectory.simulationTimes,
		result.trajectory.rawPositions,
		result.trajectory.normalizedPositions,
		result.weather.warpedPositions,
		result.weather.displacement,
		result.weather.value01,
		result.weather.gradient01,
		result.weather.curlAngle01,
		result.weather.cellBoundary01,
		result.features.simulationSteps,
		result.features.simulationTimes,
		result.features.position01,
		result.features.warpedPosition01,
		result.features.speed01,
		result.features.curvature01,
		result.features.stretching01,
		result.features.recurrence01,
		result.features.density01,
		result.features.region,
		result.features.sectionDirection,
		result.features.returnInterval01,
		result.features.noiseValue01,
		result.features.noiseGradient01,
		result.features.noiseCurlAngle01,
		result.features.noiseCellBoundary01
	];
}

export function orchestraResponseTransferables(response: OrchestraWorkerResponse): ArrayBuffer[] {
	if (response.type !== 'RESULT') return [];
	const buffers = new Set<ArrayBuffer>();
	for (const view of collectResultViews(response.result)) {
		if (view.buffer instanceof ArrayBuffer) buffers.add(view.buffer);
	}
	return [...buffers];
}
