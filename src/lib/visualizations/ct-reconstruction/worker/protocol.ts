import type {
	AcquisitionSettings,
	Phantom,
	ReconstructionMetrics,
	ReconstructionSettings
} from '../types';

export const CT_WORKER_PROTOCOL_VERSION = 1 as const;

interface Envelope {
	protocolVersion: typeof CT_WORKER_PROTOCOL_VERSION;
	requestId: number;
	jobId: number;
}

export interface InitializeScanPayload {
	phantom: Phantom;
	acquisition: AcquisitionSettings;
	reconstruction: ReconstructionSettings;
}

export type CTWorkerRequest =
	| (Envelope & { type: 'INITIALIZE'; payload: InitializeScanPayload })
	| (Envelope & { type: 'PROCESS_BATCH'; batchSize: number; includePreview?: boolean })
	| (Envelope & { type: 'RECONSTRUCT'; reconstruction: ReconstructionSettings })
	| (Envelope & { type: 'CANCEL' })
	| (Envelope & { type: 'DISPOSE' });

type WithoutEnvelope<Message> = Message extends unknown ? Omit<Message, keyof Envelope> : never;

export type CTWorkerRequestBody = WithoutEnvelope<CTWorkerRequest>;

export interface ReconstructionMetricPair {
	backprojection: ReconstructionMetrics;
	filteredBackprojection: ReconstructionMetrics;
}

export type CTWorkerResponse =
	| (Envelope & {
			type: 'READY';
			projectionCount: number;
			detectorCount: number;
			imageSize: number;
			actualProjectionCount: number;
			angles: Float64Array;
			acquiredMask: Uint8Array;
	  })
	| (Envelope & {
			type: 'BATCH';
			rowIndices: Uint16Array;
			rowValues: Float32Array;
			currentProjection: Float32Array;
			currentAngleIndex: number;
			currentAngle: number;
			revealedThroughAngleIndex: number;
			acquiredProjectionCount: number;
			actualProjectionCount: number;
			progress: number;
			/** Present when requested and always present for the completing batch. */
			backprojection?: Float32Array;
			/** Present when requested and always present for the completing batch. */
			filteredBackprojection?: Float32Array;
			complete: boolean;
			metrics?: ReconstructionMetricPair;
	  })
	| (Envelope & {
			type: 'RECONSTRUCTED';
			reconstruction: ReconstructionSettings;
			acquiredProjectionCount: number;
			actualProjectionCount: number;
			progress: number;
			backprojection: Float32Array;
			filteredBackprojection: Float32Array;
			metrics?: ReconstructionMetricPair;
	  })
	| (Envelope & { type: 'CANCELLED' })
	| (Envelope & { type: 'DISPOSED' })
	| (Envelope & { type: 'ERROR'; message: string; stack?: string });

export function isCTWorkerRequest(value: unknown): value is CTWorkerRequest {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'INITIALIZE':
			return isInitializePayload(value.payload);
		case 'PROCESS_BATCH':
			return (
				typeof value.batchSize === 'number' &&
				Number.isSafeInteger(value.batchSize) &&
				value.batchSize >= 1 &&
				value.batchSize <= 64 &&
				(value.includePreview === undefined || typeof value.includePreview === 'boolean')
			);
		case 'RECONSTRUCT':
			return isReconstructionSettings(value.reconstruction);
		case 'CANCEL':
		case 'DISPOSE':
			return true;
		default:
			return false;
	}
}

export function isCTWorkerResponse(value: unknown): value is CTWorkerResponse {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'READY':
			return (
				isPositiveInteger(value.projectionCount) &&
				isPositiveInteger(value.detectorCount) &&
				isPositiveInteger(value.imageSize) &&
				isNonNegativeInteger(value.actualProjectionCount) &&
				value.angles instanceof Float64Array &&
				value.angles.length === value.projectionCount &&
				value.acquiredMask instanceof Uint8Array &&
				value.acquiredMask.length === value.projectionCount
			);
		case 'BATCH':
			return (() => {
				const hasBackprojection = value.backprojection instanceof Float32Array;
				const hasFilteredBackprojection = value.filteredBackprojection instanceof Float32Array;
				return (
					value.rowIndices instanceof Uint16Array &&
					value.rowValues instanceof Float32Array &&
					value.currentProjection instanceof Float32Array &&
					isIntegerAtLeast(value.currentAngleIndex, -1) &&
					typeof value.currentAngle === 'number' &&
					Number.isFinite(value.currentAngle) &&
					isIntegerAtLeast(value.revealedThroughAngleIndex, -1) &&
					isNonNegativeInteger(value.acquiredProjectionCount) &&
					isNonNegativeInteger(value.actualProjectionCount) &&
					isProgress(value.progress) &&
					(value.backprojection === undefined || hasBackprojection) &&
					(value.filteredBackprojection === undefined || hasFilteredBackprojection) &&
					hasBackprojection === hasFilteredBackprojection &&
					typeof value.complete === 'boolean' &&
					(!value.complete || hasBackprojection) &&
					(value.metrics === undefined || isMetricPair(value.metrics))
				);
			})();
		case 'RECONSTRUCTED':
			return (
				isReconstructionSettings(value.reconstruction) &&
				isNonNegativeInteger(value.acquiredProjectionCount) &&
				isNonNegativeInteger(value.actualProjectionCount) &&
				isProgress(value.progress) &&
				value.backprojection instanceof Float32Array &&
				value.filteredBackprojection instanceof Float32Array &&
				(value.metrics === undefined || isMetricPair(value.metrics))
			);
		case 'CANCELLED':
		case 'DISPOSED':
			return true;
		case 'ERROR':
			return (
				typeof value.message === 'string' &&
				(value.stack === undefined || typeof value.stack === 'string')
			);
		default:
			return false;
	}
}

export function responseTransferables(response: CTWorkerResponse): ArrayBuffer[] {
	const buffers = new Set<ArrayBuffer>();
	const collect = (value: ArrayBufferView) => {
		if (value.buffer instanceof ArrayBuffer) buffers.add(value.buffer);
	};
	if (response.type === 'READY') {
		collect(response.angles);
		collect(response.acquiredMask);
	} else if (response.type === 'BATCH') {
		collect(response.rowIndices);
		collect(response.rowValues);
		collect(response.currentProjection);
		if (response.backprojection) collect(response.backprojection);
		if (response.filteredBackprojection) collect(response.filteredBackprojection);
	} else if (response.type === 'RECONSTRUCTED') {
		collect(response.backprojection);
		collect(response.filteredBackprojection);
	}
	return [...buffers];
}

function hasEnvelope(value: unknown): value is Envelope & Record<string, unknown> {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.protocolVersion === CT_WORKER_PROTOCOL_VERSION &&
		isNonNegativeInteger(candidate.requestId) &&
		isNonNegativeInteger(candidate.jobId) &&
		typeof candidate.type === 'string'
	);
}

function isInitializePayload(value: unknown): value is InitializeScanPayload {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<InitializeScanPayload>;
	return (
		isPhantom(candidate.phantom) &&
		isAcquisitionSettings(candidate.acquisition) &&
		isReconstructionSettings(candidate.reconstruction)
	);
}

function isPhantom(value: unknown): value is Phantom {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<Phantom>;
	return (
		isPositiveInteger(candidate.size) &&
		candidate.materials instanceof Uint8Array &&
		candidate.materials.length === candidate.size * candidate.size &&
		candidate.density instanceof Float32Array &&
		candidate.density.length === candidate.size * candidate.size &&
		isNonNegativeInteger(candidate.revision)
	);
}

function isAcquisitionSettings(value: unknown): value is AcquisitionSettings {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<AcquisitionSettings>;
	return (
		isPositiveInteger(candidate.projectionCount) &&
		isPositiveInteger(candidate.detectorCount) &&
		isUnitInterval(candidate.dose) &&
		isUnitInterval(candidate.additionalNoise) &&
		typeof candidate.seed === 'number' &&
		Number.isFinite(candidate.seed) &&
		typeof candidate.missingAngleWidth === 'number' &&
		Number.isFinite(candidate.missingAngleWidth) &&
		typeof candidate.missingAngleCenter === 'number' &&
		Number.isFinite(candidate.missingAngleCenter) &&
		typeof candidate.metalArtifacts === 'boolean'
	);
}

function isReconstructionSettings(value: unknown): value is ReconstructionSettings {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<ReconstructionSettings>;
	return (
		(candidate.filter === 'ramp' ||
			candidate.filter === 'shepp-logan' ||
			candidate.filter === 'cosine' ||
			candidate.filter === 'hann' ||
			candidate.filter === 'hamming') &&
		isUnitInterval(candidate.cutoff) &&
		(candidate.imageSize === undefined || isPositiveInteger(candidate.imageSize))
	);
}

function isMetricPair(value: unknown): value is ReconstructionMetricPair {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<ReconstructionMetricPair>;
	return isMetrics(candidate.backprojection) && isMetrics(candidate.filteredBackprojection);
}

function isMetrics(value: unknown): value is ReconstructionMetrics {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<ReconstructionMetrics>;
	return (
		isFiniteNumber(candidate.rmse) &&
		isFiniteNumber(candidate.normalizedRmse) &&
		isFiniteNumber(candidate.scaleInvariantRmse) &&
		isFiniteNumber(candidate.mae) &&
		isFiniteNumber(candidate.correlation) &&
		typeof candidate.peakSignalToNoiseRatio === 'number' &&
		!Number.isNaN(candidate.peakSignalToNoiseRatio)
	);
}

function isPositiveInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
	return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function isUnitInterval(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isProgress(value: unknown): value is number {
	return isUnitInterval(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}
