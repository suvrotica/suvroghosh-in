import { ATLAS_LIMITS, isAtlasSettings, type AtlasRowChunk, type AtlasSettings } from '../atlas';

export const ATLAS_WORKER_PROTOCOL_VERSION = 1 as const;

interface AtlasWorkerEnvelope {
	protocolVersion: typeof ATLAS_WORKER_PROTOCOL_VERSION;
	requestId: number;
	generation: number;
}

export type AtlasWorkerRequest =
	| (AtlasWorkerEnvelope & { type: 'START'; settings: AtlasSettings })
	| (AtlasWorkerEnvelope & { type: 'CANCEL' })
	| (AtlasWorkerEnvelope & { type: 'DISPOSE' });

type WithoutEnvelope<Message> = Message extends unknown
	? Omit<Message, keyof AtlasWorkerEnvelope>
	: never;

export type AtlasWorkerRequestBody = WithoutEnvelope<AtlasWorkerRequest>;

export type AtlasWorkerResponse =
	| (AtlasWorkerEnvelope & {
			type: 'READY';
			cacheKey: string;
			totalRows: number;
			totalCells: number;
	  })
	| (AtlasWorkerEnvelope & { type: 'CHUNK'; chunk: AtlasRowChunk })
	| (AtlasWorkerEnvelope & {
			type: 'COMPLETE';
			cacheKey: string;
			totalRows: number;
			totalCells: number;
	  })
	| (AtlasWorkerEnvelope & { type: 'CANCELLED'; completedRows: number; totalRows: number })
	| (AtlasWorkerEnvelope & { type: 'STALE'; activeGeneration: number })
	| (AtlasWorkerEnvelope & { type: 'DISPOSED' })
	| (AtlasWorkerEnvelope & { type: 'ERROR'; message: string; stack?: string });

export function isAtlasWorkerRequest(value: unknown): value is AtlasWorkerRequest {
	if (!hasEnvelope(value)) return false;

	switch (value.type) {
		case 'START':
			return value.generation > 0 && isAtlasSettings(value.settings);
		case 'CANCEL':
		case 'DISPOSE':
			return true;
		default:
			return false;
	}
}

export function isAtlasWorkerResponse(value: unknown): value is AtlasWorkerResponse {
	if (!hasEnvelope(value)) return false;

	switch (value.type) {
		case 'READY':
		case 'COMPLETE':
			return (
				typeof value.cacheKey === 'string' &&
				value.cacheKey.length > 0 &&
				isBoundedInteger(value.totalRows, 1, ATLAS_LIMITS.maxResolution) &&
				isBoundedInteger(value.totalCells, 1, ATLAS_LIMITS.maxCells)
			);
		case 'CHUNK':
			return isAtlasRowChunk(value.chunk);
		case 'CANCELLED':
			return (
				isBoundedInteger(value.completedRows, 0, ATLAS_LIMITS.maxResolution) &&
				isBoundedInteger(value.totalRows, 0, ATLAS_LIMITS.maxResolution) &&
				value.completedRows <= value.totalRows
			);
		case 'STALE':
			return isNonNegativeSafeInteger(value.activeGeneration);
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

export function atlasResponseTransferables(response: AtlasWorkerResponse): Transferable[] {
	if (response.type !== 'CHUNK') return [];
	return [response.chunk.horizons.buffer, response.chunk.capped.buffer];
}

function hasEnvelope(value: unknown): value is AtlasWorkerEnvelope & Record<string, unknown> {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.protocolVersion === ATLAS_WORKER_PROTOCOL_VERSION &&
		isNonNegativeSafeInteger(candidate.requestId) &&
		isNonNegativeSafeInteger(candidate.generation) &&
		typeof candidate.type === 'string'
	);
}

function isAtlasRowChunk(value: unknown): value is AtlasRowChunk {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<AtlasRowChunk>;
	if (!(candidate.horizons instanceof Float32Array) || !(candidate.capped instanceof Uint8Array)) {
		return false;
	}
	if (
		!isBoundedInteger(candidate.rowStart, 0, ATLAS_LIMITS.maxResolution - 1) ||
		!isBoundedInteger(candidate.rowCount, 1, ATLAS_LIMITS.maxRowsPerChunk) ||
		!isBoundedInteger(candidate.width, ATLAS_LIMITS.minResolution, ATLAS_LIMITS.maxResolution) ||
		!isBoundedInteger(
			candidate.totalRows,
			ATLAS_LIMITS.minResolution,
			ATLAS_LIMITS.maxResolution
		) ||
		!isBoundedInteger(candidate.completedRows, 1, ATLAS_LIMITS.maxResolution)
	) {
		return false;
	}
	const valueCount = candidate.rowCount * candidate.width;
	return (
		candidate.rowStart + candidate.rowCount <= candidate.totalRows &&
		candidate.completedRows === candidate.rowStart + candidate.rowCount &&
		candidate.horizons.length === valueCount &&
		candidate.capped.length === valueCount &&
		isUnitInterval(candidate.progress) &&
		candidate.horizons.every((horizon) => Number.isFinite(horizon) && horizon >= 0) &&
		candidate.capped.every((entry) => entry === 0 || entry === 1)
	);
}

function isUnitInterval(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
	return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}
