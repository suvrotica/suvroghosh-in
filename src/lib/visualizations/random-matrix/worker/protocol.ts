import type {
	MatrixAnalysis,
	MatrixComputeInput,
	NullEnsembleInput,
	NullEnsembleProgress,
	NullEnsembleResult,
	RandomMatrixState
} from '../types';
import { RANDOM_MATRIX_MODEL_VERSION } from '../types';
import { ALL_NULL_METRICS, MAX_MATRIX_DIMENSION } from '../constants';
import { normalizeRandomMatrixState } from '../url-state';

export const RANDOM_MATRIX_WORKER_PROTOCOL_VERSION = 1 as const;

const MATRIX_REARRANGEMENTS = [
	'original',
	'entry-shuffle',
	'joint-permutation',
	'orthogonal-similarity',
	'row-norm',
	'spectral-order'
] as const;

interface Envelope {
	protocolVersion: typeof RANDOM_MATRIX_WORKER_PROTOCOL_VERSION;
	runId: number;
}

export type RandomMatrixWorkerRequest =
	| (Envelope & { type: 'ANALYZE'; input: MatrixComputeInput })
	| (Envelope & { type: 'RUN_NULL_ENSEMBLE'; input: NullEnsembleInput })
	| (Envelope & { type: 'CANCEL' })
	| (Envelope & { type: 'DISPOSE' });

export type RandomMatrixWorkerRequestBody = RandomMatrixWorkerRequest extends infer Message
	? Message extends unknown
		? Omit<Message, keyof Envelope>
		: never
	: never;

export type RandomMatrixWorkerResponse =
	| (Envelope & { type: 'ANALYSIS_RESULT'; result: MatrixAnalysis })
	| (Envelope & { type: 'NULL_PROGRESS'; progress: NullEnsembleProgress })
	| (Envelope & { type: 'NULL_ENSEMBLE_RESULT'; result: NullEnsembleResult })
	| (Envelope & { type: 'CANCELLED' })
	| (Envelope & { type: 'DISPOSED' })
	| (Envelope & { type: 'STALE'; activeRunId: number })
	| (Envelope & { type: 'ERROR'; message: string; stack?: string });

export function isRandomMatrixWorkerRequest(value: unknown): value is RandomMatrixWorkerRequest {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'ANALYZE':
			return isMatrixComputeInput(value.input);
		case 'RUN_NULL_ENSEMBLE':
			return isNullEnsembleInput(value.input);
		case 'CANCEL':
		case 'DISPOSE':
			return true;
		default:
			return false;
	}
}

export function isRandomMatrixWorkerResponse(value: unknown): value is RandomMatrixWorkerResponse {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'ANALYSIS_RESULT':
			return isMatrixAnalysis(value.result);
		case 'NULL_PROGRESS':
			return isProgress(value.progress);
		case 'NULL_ENSEMBLE_RESULT':
			return isNullResult(value.result);
		case 'CANCELLED':
		case 'DISPOSED':
			return true;
		case 'STALE':
			return isNonNegativeInteger(value.activeRunId);
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

export function randomMatrixResponseTransferables(
	response: RandomMatrixWorkerResponse
): ArrayBuffer[] {
	const buffers = new Set<ArrayBuffer>();
	const collect = (view: ArrayBufferView | undefined) => {
		if (view?.buffer instanceof ArrayBuffer) buffers.add(view.buffer);
	};
	if (response.type !== 'ANALYSIS_RESULT') return [];
	const result = response.result;
	collect(result.matrix);
	collect(result.comparison?.matrix);
	collect(result.eigen?.real);
	collect(result.eigen?.imaginary);
	collect(result.eigen?.vectors);
	collect(result.eigen?.ipr);
	collect(result.singular.values);
	collect(result.singular.u);
	collect(result.singular.v);
	collect(result.singular.cumulativeEnergy);
	collect(result.singular.reconstruction);
	collect(result.summary.rowMeans);
	collect(result.summary.columnMeans);
	collect(result.summary.rowNorms);
	collect(result.summary.columnNorms);
	if (result.theory && result.theory.kind !== 'circle') {
		collect(result.theory.x);
		collect(result.theory.density);
	}
	return [...buffers];
}

function hasEnvelope(value: unknown): value is Envelope & Record<string, unknown> {
	if (!isRecord(value)) return false;
	return (
		value.protocolVersion === RANDOM_MATRIX_WORKER_PROTOCOL_VERSION &&
		isPositiveInteger(value.runId) &&
		typeof value.type === 'string'
	);
}

function isMatrixComputeInput(value: unknown): value is MatrixComputeInput {
	if (!isRecord(value) || !isState(value.state)) return false;
	return (
		(value.sampleIndex === undefined || isNonNegativeInteger(value.sampleIndex)) &&
		(value.reconstructionRank === undefined || isNonNegativeInteger(value.reconstructionRank)) &&
		(value.includeVectors === undefined || typeof value.includeVectors === 'boolean') &&
		(value.rearrangement === undefined ||
			(MATRIX_REARRANGEMENTS as readonly unknown[]).includes(value.rearrangement))
	);
}

function isNullEnsembleInput(value: unknown): value is NullEnsembleInput {
	if (!isRecord(value) || !isState(value.state)) return false;
	return (
		isPositiveInteger(value.sampleCount) &&
		(value.observedSampleIndex === undefined || isNonNegativeInteger(value.observedSampleIndex)) &&
		(value.selectedEigenIndex === undefined || isNonNegativeInteger(value.selectedEigenIndex)) &&
		(value.sampleIndexStart === undefined || isNonNegativeInteger(value.sampleIndexStart)) &&
		(value.rearrangement === undefined ||
			(MATRIX_REARRANGEMENTS as readonly unknown[]).includes(value.rearrangement)) &&
		(value.metrics === undefined ||
			(Array.isArray(value.metrics) &&
				value.metrics.every(
					(metric) =>
						typeof metric === 'string' && (ALL_NULL_METRICS as readonly string[]).includes(metric)
				)))
	);
}

function isState(value: unknown): value is RandomMatrixState {
	if (!isRecord(value)) return false;
	const hasTypes =
		typeof value.seed === 'string' &&
		typeof value.preset === 'string' &&
		Number.isFinite(value.dimension) &&
		Number.isFinite(value.aspectRatio) &&
		typeof value.distribution === 'string' &&
		Number.isFinite(value.mean) &&
		Number.isFinite(value.scale) &&
		typeof value.normalization === 'string' &&
		typeof value.symmetry === 'string' &&
		Number.isFinite(value.sparsity) &&
		typeof value.signalType === 'string' &&
		Number.isFinite(value.signalStrength) &&
		typeof value.lens === 'string' &&
		typeof value.mode === 'string' &&
		Number.isFinite(value.sampleCount) &&
		typeof value.theory === 'boolean' &&
		typeof value.colorScale === 'string' &&
		typeof value.highContrast === 'boolean';
	if (!hasTypes) return false;
	const normalized = normalizeRandomMatrixState(value);
	try {
		return (Object.keys(normalized) as (keyof RandomMatrixState)[]).every(
			(key) => value[key] === normalized[key]
		);
	} catch {
		return false;
	}
}

function isMatrixAnalysis(value: unknown): value is MatrixAnalysis {
	if (!isRecord(value) || value.modelVersion !== RANDOM_MATRIX_MODEL_VERSION) return false;
	const rows = value.rows;
	const columns = value.columns;
	if (
		!isPositiveInteger(rows) ||
		!isPositiveInteger(columns) ||
		rows > MAX_MATRIX_DIMENSION ||
		columns > MAX_MATRIX_DIMENSION ||
		!isFiniteFloat64Array(value.matrix, rows * columns) ||
		!isState(value.state) ||
		value.state.dimension !== rows ||
		columns !== rows ||
		!isNonNegativeInteger(value.sampleIndex) ||
		!(MATRIX_REARRANGEMENTS as readonly unknown[]).includes(value.rearrangement) ||
		!isSingularAnalysis(value.singular, rows, columns) ||
		!isMatrixSummary(value.summary, rows, columns) ||
		!isTheoryOverlay(value.theory) ||
		!isStringArray(value.warnings)
	) {
		return false;
	}
	if (value.eigen !== undefined) {
		if (!isEigenAnalysis(value.eigen, rows)) return false;
	}
	if (value.comparison !== undefined && !isComparison(value.comparison, rows)) return false;
	return true;
}

function isNullResult(value: unknown): value is NullEnsembleResult {
	return (
		isRecord(value) &&
		value.modelVersion === RANDOM_MATRIX_MODEL_VERSION &&
		isState(value.state) &&
		isState(value.nullState) &&
		isPositiveInteger(value.sampleCount) &&
		isNonNegativeInteger(value.observedSampleIndex) &&
		(MATRIX_REARRANGEMENTS as readonly unknown[]).includes(value.rearrangement) &&
		isMetricValues(value.observed) &&
		isMetricComparisons(value.metrics) &&
		isStringArray(value.warnings)
	);
}

function isEigenAnalysis(value: unknown, dimension: number): boolean {
	if (!isRecord(value)) return false;
	return (
		isFiniteFloat64Array(value.real, dimension) &&
		isFiniteFloat64Array(value.imaginary, dimension) &&
		(value.vectors === undefined || isFiniteFloat64Array(value.vectors, dimension * dimension)) &&
		(value.ipr === undefined || isBoundedFloat64Array(value.ipr, dimension, 0, 1)) &&
		isNonNegativeFinite(value.residual) &&
		isNonNegativeFinite(value.maxPairResidual)
	);
}

function isSingularAnalysis(value: unknown, rows: number, columns: number): boolean {
	if (!isRecord(value)) return false;
	const componentCount = Math.min(rows, columns);
	if (
		!isNonNegativeFloat64Array(value.values, componentCount) ||
		!isBoundedFloat64Array(value.cumulativeEnergy, componentCount, 0, 1 + 1e-12) ||
		!isNonNegativeInteger(value.rank) ||
		value.rank > componentCount ||
		!isNonNegativeFinite(value.tolerance) ||
		!(value.condition === null || isNonNegativeFinite(value.condition)) ||
		!isNonNegativeFinite(value.residual)
	) {
		return false;
	}
	const hasU = value.u !== undefined;
	const hasV = value.v !== undefined;
	if (hasU !== hasV) return false;
	if (
		hasU &&
		(!isFiniteFloat64Array(value.u, rows * componentCount) ||
			!isFiniteFloat64Array(value.v, columns * componentCount))
	) {
		return false;
	}
	const hasReconstruction = value.reconstruction !== undefined;
	const hasRank = value.reconstructionRank !== undefined;
	const hasError = value.reconstructionError !== undefined;
	if (!(hasReconstruction === hasRank && hasRank === hasError)) return false;
	return (
		!hasReconstruction ||
		(isFiniteFloat64Array(value.reconstruction, rows * columns) &&
			isNonNegativeInteger(value.reconstructionRank) &&
			value.reconstructionRank <= componentCount &&
			isNonNegativeFinite(value.reconstructionError))
	);
}

function isMatrixSummary(value: unknown, rows: number, columns: number): boolean {
	if (!isRecord(value)) return false;
	return (
		isFiniteNumber(value.mean) &&
		isNonNegativeFinite(value.stddev) &&
		isFiniteNumber(value.min) &&
		isFiniteNumber(value.max) &&
		value.min <= value.max &&
		isNonNegativeFinite(value.frobeniusNorm) &&
		(value.spectralRadius === null || isNonNegativeFinite(value.spectralRadius)) &&
		(value.conditionNumber === null || isNonNegativeFinite(value.conditionNumber)) &&
		isNonNegativeInteger(value.rank) &&
		value.rank <= Math.min(rows, columns) &&
		isFiniteFloat64Array(value.rowMeans, rows) &&
		isFiniteFloat64Array(value.columnMeans, columns) &&
		isNonNegativeFloat64Array(value.rowNorms, rows) &&
		isNonNegativeFloat64Array(value.columnNorms, columns)
	);
}

function isComparison(value: unknown, dimension: number): boolean {
	return (
		isRecord(value) &&
		value.kind === 'same-spectrum' &&
		isFiniteFloat64Array(value.matrix, dimension * dimension) &&
		isNonNegativeFinite(value.maxEigenvalueDelta)
	);
}

function isTheoryOverlay(value: unknown): boolean {
	if (value === null) return true;
	if (!isRecord(value) || typeof value.label !== 'string') return false;
	if (value.kind === 'circle') {
		return (
			isNonNegativeFinite(value.radius) &&
			isFiniteNumber(value.centerReal) &&
			isFiniteNumber(value.centerImaginary)
		);
	}
	if (value.kind !== 'semicircle' && value.kind !== 'marchenko-pastur') return false;
	if (
		!isFinitePair(value.support) ||
		value.support[0] > value.support[1] ||
		!isFiniteFloat64Array(value.x) ||
		!isNonNegativeFloat64Array(value.density, value.x.length) ||
		value.x.length < 2
	) {
		return false;
	}
	return (
		(value.atomAtZero === undefined || isBoundedFinite(value.atomAtZero, 0, 1)) &&
		(value.gamma === undefined || (isFiniteNumber(value.gamma) && value.gamma > 0))
	);
}

function isMetricValues(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return ALL_NULL_METRICS.every((metric) => isNullableFinite(value[metric]));
}

function isMetricComparisons(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return ALL_NULL_METRICS.every((metric) => {
		const comparison = value[metric];
		return (
			isRecord(comparison) &&
			isNullableFinite(comparison.observed) &&
			isNullableFinite(comparison.mean) &&
			isNullableNonNegativeFinite(comparison.stddev) &&
			isNullableFinite(comparison.zScore) &&
			isNullableBoundedFinite(comparison.percentile, 0, 100) &&
			isNullableBoundedFinite(comparison.twoSidedPValue, 0, 1) &&
			isNonNegativeInteger(comparison.validSampleCount)
		);
	});
}

function isProgress(value: unknown): value is NullEnsembleProgress {
	return (
		isRecord(value) &&
		isNonNegativeInteger(value.completed) &&
		isPositiveInteger(value.total) &&
		value.completed <= value.total
	);
}

function isFiniteFloat64Array(value: unknown, length?: number): value is Float64Array {
	if (!(value instanceof Float64Array) || (length !== undefined && value.length !== length)) {
		return false;
	}
	for (const entry of value) if (!Number.isFinite(entry)) return false;
	return true;
}

function isNonNegativeFloat64Array(value: unknown, length?: number): value is Float64Array {
	if (!isFiniteFloat64Array(value, length)) return false;
	for (const entry of value) if (entry < 0) return false;
	return true;
}

function isBoundedFloat64Array(
	value: unknown,
	length: number,
	minimum: number,
	maximum: number
): value is Float64Array {
	if (!isFiniteFloat64Array(value, length)) return false;
	for (const entry of value) if (entry < minimum || entry > maximum) return false;
	return true;
}

function isFinitePair(value: unknown): value is [number, number] {
	return (
		Array.isArray(value) &&
		value.length === 2 &&
		isFiniteNumber(value[0]) &&
		isFiniteNumber(value[1])
	);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFinite(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 0;
}

function isBoundedFinite(value: unknown, minimum: number, maximum: number): value is number {
	return isFiniteNumber(value) && value >= minimum && value <= maximum;
}

function isNullableFinite(value: unknown): boolean {
	return value === null || isFiniteNumber(value);
}

function isNullableNonNegativeFinite(value: unknown): boolean {
	return value === null || isNonNegativeFinite(value);
}

function isNullableBoundedFinite(value: unknown, minimum: number, maximum: number): boolean {
	return value === null || isBoundedFinite(value, minimum, maximum);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 1;
}
