import type { CityConfig, CityResult, GenerationEvent } from '../engine/types';

export const CITY_WORKER_PROTOCOL_VERSION = 1 as const;

interface Envelope {
	protocolVersion: typeof CITY_WORKER_PROTOCOL_VERSION;
	requestId: number;
	jobId: number;
}

export type CityWorkerRequest =
	| (Envelope & { type: 'GENERATE'; config: CityConfig })
	| (Envelope & { type: 'CANCEL' })
	| (Envelope & { type: 'DISPOSE' });

type WithoutEnvelope<Message> = Message extends unknown ? Omit<Message, keyof Envelope> : never;
export type CityWorkerRequestBody = WithoutEnvelope<CityWorkerRequest>;

export type CityWorkerResponse =
	| (Envelope & { type: 'PROGRESS'; events: readonly GenerationEvent[] })
	| (Envelope & { type: 'COMPLETE'; result: CityResult })
	| (Envelope & { type: 'CANCELLED' })
	| (Envelope & { type: 'DISPOSED' })
	| (Envelope & { type: 'ERROR'; message: string; stack?: string });

export function isCityWorkerRequest(value: unknown): value is CityWorkerRequest {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'GENERATE':
			return isCityConfig(value.config);
		case 'CANCEL':
		case 'DISPOSE':
			return true;
		default:
			return false;
	}
}

export function isCityWorkerResponse(value: unknown): value is CityWorkerResponse {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'PROGRESS':
			return (
				Array.isArray(value.events) &&
				value.events.length >= 1 &&
				value.events.length <= 64 &&
				value.events.every(isGenerationEvent)
			);
		case 'COMPLETE':
			return isCityResult(value.result);
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

function hasEnvelope(value: unknown): value is Envelope & Record<string, unknown> {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.protocolVersion === CITY_WORKER_PROTOCOL_VERSION &&
		isNonNegativeInteger(candidate.requestId) &&
		isNonNegativeInteger(candidate.jobId) &&
		typeof candidate.type === 'string'
	);
}

function isCityConfig(value: unknown): value is CityConfig {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<CityConfig>;
	const anchor = candidate.anchor as Partial<CityConfig['anchor']> | undefined;
	return (
		candidate.generatorVersion === 1 &&
		typeof candidate.seed === 'string' &&
		(candidate.size === 'small' || candidate.size === 'standard' || candidate.size === 'large') &&
		!!anchor &&
		typeof anchor.id === 'string' &&
		isInteger(anchor.x) &&
		isInteger(anchor.y) &&
		isInteger(anchor.rotation) &&
		(candidate.civicPatience === 'patient' ||
			candidate.civicPatience === 'familiar' ||
			candidate.civicPatience === 'impulsive' ||
			candidate.civicPatience === 'none') &&
		typeof candidate.minimumGuarantees === 'boolean' &&
		(candidate.density === 'open' ||
			candidate.density === 'balanced' ||
			candidate.density === 'dense') &&
		(candidate.landmarkFrequency === 'scarce' ||
			candidate.landmarkFrequency === 'balanced' ||
			candidate.landmarkFrequency === 'frequent') &&
		(candidate.anomalyAppetite === 'restrained' ||
			candidate.anomalyAppetite === 'balanced' ||
			candidate.anomalyAppetite === 'enthusiastic') &&
		(candidate.tramPreference === 'ordinary' || candidate.tramPreference === 'high')
	);
}

function isGenerationEvent(value: unknown): value is GenerationEvent {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.type === 'string' &&
		['phase', 'observe', 'propagate', 'contradiction', 'backtrack', 'patch', 'complete'].includes(
			candidate.type
		) &&
		typeof candidate.progress === 'number' &&
		Number.isFinite(candidate.progress)
	);
}

function isCityResult(value: unknown): value is CityResult {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<CityResult>;
	return (
		candidate.schema === 'suvro-city-result-v1' &&
		candidate.generatorVersion === 1 &&
		typeof candidate.seed === 'string' &&
		typeof candidate.fingerprint === 'string' &&
		Array.isArray(candidate.fabricTiles) &&
		Array.isArray(candidate.occupationTiles) &&
		Array.isArray(candidate.municipalPatches)
	);
}

function isInteger(value: unknown): value is number {
	return Number.isSafeInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}
