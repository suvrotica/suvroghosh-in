import {
	isDensityGridOptions,
	type DensityGridOptions,
	type DensityGridResult
} from '../advanced/density-grid';
import {
	isFirstPassageOptions,
	type FirstPassageOptions,
	type FirstPassageResult
} from '../advanced/first-passage';
import {
	isFractionalBrownianOptions,
	type FractionalBrownianOptions,
	type FractionalBrownianPaths
} from '../advanced/fractional-brownian';

export const ADVANCED_WORKER_PROTOCOL_VERSION = 1 as const;

export type AdvancedWorkerTask = 'fractional' | 'first-passage' | 'density';

interface WorkerEnvelope {
	protocolVersion: typeof ADVANCED_WORKER_PROTOCOL_VERSION;
	requestId: number;
	generation: number;
}

export type AdvancedWorkerRequest =
	| (WorkerEnvelope & { type: 'GENERATE_FRACTIONAL'; options: FractionalBrownianOptions })
	| (WorkerEnvelope & { type: 'RUN_FIRST_PASSAGE'; options: FirstPassageOptions })
	| (WorkerEnvelope & { type: 'MEASURE_DENSITY'; options: DensityGridOptions })
	| (WorkerEnvelope & { type: 'CANCEL' })
	| (WorkerEnvelope & { type: 'DISPOSE' });

type WithoutEnvelope<Message> = Message extends unknown
	? Omit<Message, keyof WorkerEnvelope>
	: never;

export type AdvancedWorkerRequestBody = WithoutEnvelope<AdvancedWorkerRequest>;

export type AdvancedWorkerResponse =
	| (WorkerEnvelope & {
			type: 'PROGRESS';
			task: AdvancedWorkerTask;
			completed: number;
			total: number;
			progress: number;
	  })
	| (WorkerEnvelope & { type: 'FRACTIONAL_RESULT'; result: FractionalBrownianPaths })
	| (WorkerEnvelope & { type: 'FIRST_PASSAGE_RESULT'; result: FirstPassageResult })
	| (WorkerEnvelope & { type: 'DENSITY_RESULT'; result: DensityGridResult })
	| (WorkerEnvelope & { type: 'CANCELLED'; task: AdvancedWorkerTask | null })
	| (WorkerEnvelope & { type: 'DISPOSED' })
	| (WorkerEnvelope & {
			type: 'ERROR';
			task: AdvancedWorkerTask | null;
			message: string;
			stack?: string;
	  });

export function isAdvancedWorkerRequest(value: unknown): value is AdvancedWorkerRequest {
	if (!hasEnvelope(value)) return false;
	try {
		switch (value.type) {
			case 'GENERATE_FRACTIONAL':
				return isFractionalBrownianOptions(value.options);
			case 'RUN_FIRST_PASSAGE':
				return isFirstPassageOptions(value.options);
			case 'MEASURE_DENSITY':
				return isDensityGridOptions(value.options);
			case 'CANCEL':
			case 'DISPOSE':
				return true;
			default:
				return false;
		}
	} catch {
		return false;
	}
}

export function isAdvancedWorkerResponse(value: unknown): value is AdvancedWorkerResponse {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'PROGRESS':
			return (
				isTask(value.task) &&
				isNonNegativeInteger(value.completed) &&
				isNonNegativeInteger(value.total) &&
				value.completed <= value.total &&
				isUnitInterval(value.progress) &&
				(value.total === 0
					? value.progress === 1
					: value.progress === value.completed / value.total)
			);
		case 'FRACTIONAL_RESULT':
			return isFractionalResult(value.result);
		case 'FIRST_PASSAGE_RESULT':
			return isFirstPassageResult(value.result);
		case 'DENSITY_RESULT':
			return isDensityResult(value.result);
		case 'CANCELLED':
			return value.task === null || isTask(value.task);
		case 'DISPOSED':
			return true;
		case 'ERROR':
			return (
				(value.task === null || isTask(value.task)) &&
				typeof value.message === 'string' &&
				value.message.length > 0 &&
				(value.stack === undefined || typeof value.stack === 'string')
			);
		default:
			return false;
	}
}

export function requestTransferables(request: AdvancedWorkerRequest): Transferable[] {
	if (request.type !== 'MEASURE_DENSITY') return [];
	return uniqueArrayBuffers([request.options.x, request.options.y]);
}

export function responseTransferables(response: AdvancedWorkerResponse): Transferable[] {
	switch (response.type) {
		case 'FRACTIONAL_RESULT':
			return uniqueArrayBuffers([response.result.times, response.result.x, response.result.y]);
		case 'FIRST_PASSAGE_RESULT':
			return uniqueArrayBuffers([
				response.result.times,
				response.result.empiricalSurvival,
				response.result.analyticalSurvival,
				response.result.absorbedCountByTime,
				response.result.firstPassageTimes,
				response.result.finalPositions
			]);
		case 'DENSITY_RESULT':
			return uniqueArrayBuffers([response.result.counts, response.result.probabilityDensity]);
		default:
			return [];
	}
}

export function taskForRequest(request: AdvancedWorkerRequest): AdvancedWorkerTask | null {
	switch (request.type) {
		case 'GENERATE_FRACTIONAL':
			return 'fractional';
		case 'RUN_FIRST_PASSAGE':
			return 'first-passage';
		case 'MEASURE_DENSITY':
			return 'density';
		case 'CANCEL':
		case 'DISPOSE':
			return null;
	}
}

function hasEnvelope(value: unknown): value is WorkerEnvelope & Record<string, unknown> {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.protocolVersion === ADVANCED_WORKER_PROTOCOL_VERSION &&
		isNonNegativeInteger(candidate.requestId) &&
		isNonNegativeInteger(candidate.generation) &&
		typeof candidate.type === 'string'
	);
}

function isFractionalResult(value: unknown): value is FractionalBrownianPaths {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<FractionalBrownianPaths>;
	if (
		!isSeed(candidate.seed) ||
		!isFiniteStrictUnit(candidate.hurst) ||
		!isFiniteAtLeast(candidate.scale, 0) ||
		!isFiniteGreaterThan(candidate.duration, 0) ||
		!isPositiveInteger(candidate.pointCount) ||
		!isPositiveInteger(candidate.trajectoryCount) ||
		!(candidate.times instanceof Float64Array) ||
		candidate.times.length !== candidate.pointCount ||
		!(candidate.x instanceof Float64Array) ||
		!(candidate.y instanceof Float64Array) ||
		candidate.x.length !== candidate.pointCount * candidate.trajectoryCount ||
		candidate.y.length !== candidate.x.length ||
		!isNonNegativeInteger(candidate.clampedEigenvalueCount) ||
		!isFiniteAtLeast(candidate.eigenvalueTolerance, 0)
	) {
		return false;
	}
	return allFinite(candidate.times) && allFinite(candidate.x) && allFinite(candidate.y);
}

function isFirstPassageResult(value: unknown): value is FirstPassageResult {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<FirstPassageResult>;
	if (
		!isFirstPassageOptions(candidate.options) ||
		!(candidate.times instanceof Float64Array) ||
		!(candidate.empiricalSurvival instanceof Float64Array) ||
		!(candidate.analyticalSurvival instanceof Float64Array) ||
		!(candidate.absorbedCountByTime instanceof Uint32Array) ||
		candidate.empiricalSurvival.length !== candidate.times.length ||
		candidate.analyticalSurvival.length !== candidate.times.length ||
		candidate.absorbedCountByTime.length !== candidate.times.length ||
		!(candidate.firstPassageTimes instanceof Float64Array) ||
		!(candidate.finalPositions instanceof Float64Array) ||
		candidate.firstPassageTimes.length !== candidate.options.particleCount ||
		candidate.finalPositions.length !== candidate.options.particleCount ||
		!isNonNegativeInteger(candidate.absorbedCount) ||
		!isNonNegativeInteger(candidate.survivingCount) ||
		candidate.absorbedCount + candidate.survivingCount !== candidate.options.particleCount ||
		!(candidate.medianArrivalTime === null || isFiniteAtLeast(candidate.medianArrivalTime, 0)) ||
		candidate.finiteStepMethod !== 'linear-endpoint-with-brownian-bridge-correction'
	) {
		return false;
	}
	return (
		allFinite(candidate.times) &&
		candidate.empiricalSurvival.every(isUnitInterval) &&
		candidate.analyticalSurvival.every(isUnitInterval) &&
		candidate.firstPassageTimes.every(
			(time) =>
				Number.isNaN(time) ||
				(Number.isFinite(time) && time >= 0 && time <= candidate.options!.maxTime)
		) &&
		allFinite(candidate.finalPositions)
	);
}

function isDensityResult(value: unknown): value is DensityGridResult {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<DensityGridResult>;
	if (
		!isPositiveInteger(candidate.gridWidth) ||
		!isPositiveInteger(candidate.gridHeight) ||
		!isFiniteNumber(candidate.minX) ||
		!isFiniteNumber(candidate.maxX) ||
		!isFiniteNumber(candidate.minY) ||
		!isFiniteNumber(candidate.maxY) ||
		!isFiniteGreaterThan(candidate.cellWidth, 0) ||
		!isFiniteGreaterThan(candidate.cellHeight, 0) ||
		!(candidate.counts instanceof Uint32Array) ||
		!(candidate.probabilityDensity instanceof Float32Array) ||
		candidate.counts.length !== candidate.gridWidth * candidate.gridHeight ||
		candidate.probabilityDensity.length !== candidate.counts.length ||
		!isNonNegativeInteger(candidate.includedCount) ||
		!isNonNegativeInteger(candidate.outsideCount) ||
		!isNonNegativeInteger(candidate.maxCount) ||
		!candidate.probabilityDensity.every((density) => Number.isFinite(density) && density >= 0)
	) {
		return false;
	}
	let measuredCount = 0;
	let measuredMaximum = 0;
	for (const count of candidate.counts) {
		measuredCount += count;
		measuredMaximum = Math.max(measuredMaximum, count);
	}
	return measuredCount === candidate.includedCount && measuredMaximum === candidate.maxCount;
}

function uniqueArrayBuffers(values: ArrayBufferView[]): ArrayBuffer[] {
	const buffers = new Set<ArrayBuffer>();
	for (const value of values) {
		if (value.buffer instanceof ArrayBuffer) buffers.add(value.buffer);
	}
	return [...buffers];
}

function isTask(value: unknown): value is AdvancedWorkerTask {
	return value === 'fractional' || value === 'first-passage' || value === 'density';
}

function isSeed(value: unknown): value is string | number {
	return (
		(typeof value === 'string' && value.length <= 512) ||
		(typeof value === 'number' && Number.isFinite(value))
	);
}

function isPositiveInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteAtLeast(value: unknown, minimum: number): value is number {
	return isFiniteNumber(value) && value >= minimum;
}

function isFiniteGreaterThan(value: unknown, minimum: number): value is number {
	return isFiniteNumber(value) && value > minimum;
}

function isFiniteStrictUnit(value: unknown): value is number {
	return isFiniteNumber(value) && value > 0 && value < 1;
}

function isUnitInterval(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function allFinite(values: ArrayLike<number>): boolean {
	for (let index = 0; index < values.length; index += 1) {
		if (!Number.isFinite(values[index])) return false;
	}
	return true;
}
