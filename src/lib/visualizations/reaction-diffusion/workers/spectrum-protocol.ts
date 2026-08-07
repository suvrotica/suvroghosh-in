import type { BoundaryCondition } from '../types';
import { NUMERICAL_SAFETY_ABS_LIMIT } from '../constants';

export const SPECTRUM_WORKER_PROTOCOL_VERSION = 1 as const;
export const SPECTRUM_WORKER_MAXIMUM_SIZE = 512;

interface SpectrumEnvelope {
	protocolVersion: typeof SPECTRUM_WORKER_PROTOCOL_VERSION;
	requestId: number;
	generation: number;
}

export interface SpectrumAnalysisInput {
	readonly size: number;
	readonly domainWidth: number;
	readonly boundary: BoundaryCondition;
	readonly field: Float32Array | Float64Array;
	readonly mask?: Uint8Array;
	readonly window?: 'auto' | 'none' | 'hann';
	readonly minimumProminence?: number;
}

export interface SpectrumWorkerResult {
	readonly q: Float64Array;
	readonly power: Float64Array;
	readonly binWidth: number;
	readonly fieldMean: number;
	readonly fieldVariance: number;
	readonly dominantQ: number | null;
	readonly dominantWavelength: number | null;
	readonly domainFraction: number | null;
	readonly prominence: number;
	readonly trustworthy: boolean;
	readonly reason: string;
	readonly window: 'none' | 'hann';
}

export type SpectrumWorkerRequest =
	| (SpectrumEnvelope & { type: 'ANALYZE'; input: SpectrumAnalysisInput })
	| (SpectrumEnvelope & { type: 'CANCEL' })
	| (SpectrumEnvelope & { type: 'DISPOSE' });

type WithoutEnvelope<Message> = Message extends unknown
	? Omit<Message, keyof SpectrumEnvelope>
	: never;

export type SpectrumWorkerRequestBody = WithoutEnvelope<SpectrumWorkerRequest>;

export type SpectrumWorkerResponse =
	| (SpectrumEnvelope & { type: 'SPECTRUM_RESULT'; result: SpectrumWorkerResult })
	| (SpectrumEnvelope & { type: 'CANCELLED' })
	| (SpectrumEnvelope & { type: 'STALE'; activeGeneration: number })
	| (SpectrumEnvelope & { type: 'DISPOSED' })
	| (SpectrumEnvelope & { type: 'ERROR'; message: string; stack?: string });

export function isSpectrumWorkerRequest(value: unknown): value is SpectrumWorkerRequest {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'ANALYZE':
			return isSpectrumAnalysisInput(value.input);
		case 'CANCEL':
		case 'DISPOSE':
			return true;
		default:
			return false;
	}
}

export function isSpectrumWorkerResponse(value: unknown): value is SpectrumWorkerResponse {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'SPECTRUM_RESULT':
			return isSpectrumWorkerResult(value.result);
		case 'CANCELLED':
		case 'DISPOSED':
			return true;
		case 'STALE':
			return isNonNegativeInteger(value.activeGeneration);
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

export function spectrumRequestTransferables(request: SpectrumWorkerRequest): Transferable[] {
	if (request.type !== 'ANALYZE') return [];
	return [request.input.field.buffer, request.input.mask?.buffer].filter(
		(buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer
	);
}

export function spectrumResponseTransferables(response: SpectrumWorkerResponse): Transferable[] {
	if (response.type !== 'SPECTRUM_RESULT') return [];
	return [response.result.q.buffer, response.result.power.buffer].filter(
		(buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer
	);
}

export function cloneSpectrumInputForTransfer(input: SpectrumAnalysisInput): SpectrumAnalysisInput {
	return {
		...input,
		field: input.field.slice(),
		mask: input.mask?.slice()
	};
}

function hasEnvelope(value: unknown): value is SpectrumEnvelope & Record<string, unknown> {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.protocolVersion === SPECTRUM_WORKER_PROTOCOL_VERSION &&
		isNonNegativeInteger(candidate.requestId) &&
		isNonNegativeInteger(candidate.generation) &&
		typeof candidate.type === 'string'
	);
}

function isSpectrumAnalysisInput(value: unknown): value is SpectrumAnalysisInput {
	if (!value || typeof value !== 'object') return false;
	const input = value as Partial<SpectrumAnalysisInput>;
	return (
		isPowerOfTwo(input.size) &&
		isFinitePositive(input.domainWidth) &&
		(input.boundary === 'periodic' ||
			input.boundary === 'no-flux' ||
			input.boundary === 'reservoir') &&
		(input.field instanceof Float32Array || input.field instanceof Float64Array) &&
		input.field.length === input.size * input.size &&
		input.field.every(
			(value) => Number.isFinite(value) && Math.abs(value) <= NUMERICAL_SAFETY_ABS_LIMIT
		) &&
		(input.mask === undefined ||
			(input.mask instanceof Uint8Array &&
				input.mask.length === input.size * input.size &&
				input.mask.every((value) => value === 0 || value === 1))) &&
		(input.window === undefined ||
			input.window === 'auto' ||
			input.window === 'none' ||
			input.window === 'hann') &&
		(input.minimumProminence === undefined ||
			(isFinitePositive(input.minimumProminence) && input.minimumProminence <= 100))
	);
}

function isSpectrumWorkerResult(value: unknown): value is SpectrumWorkerResult {
	if (!value || typeof value !== 'object') return false;
	const result = value as Partial<SpectrumWorkerResult>;
	return (
		result.q instanceof Float64Array &&
		result.power instanceof Float64Array &&
		result.q.length === result.power.length &&
		result.q.length >= 3 &&
		result.q.every((entry) => Number.isFinite(entry) && entry >= 0) &&
		result.power.every((entry) => Number.isFinite(entry) && entry >= 0) &&
		isFinitePositive(result.binWidth) &&
		isFiniteNumber(result.fieldMean) &&
		isFiniteNonNegative(result.fieldVariance) &&
		(result.dominantQ === null || isFinitePositive(result.dominantQ)) &&
		(result.dominantWavelength === null || isFinitePositive(result.dominantWavelength)) &&
		(result.domainFraction === null || isFinitePositive(result.domainFraction)) &&
		isFiniteNonNegative(result.prominence) &&
		typeof result.trustworthy === 'boolean' &&
		typeof result.reason === 'string' &&
		(result.window === 'none' || result.window === 'hann')
	);
}

function isPowerOfTwo(value: unknown): value is number {
	return (
		Number.isSafeInteger(value) &&
		Number(value) >= 4 &&
		Number(value) <= SPECTRUM_WORKER_MAXIMUM_SIZE &&
		(Number(value) & (Number(value) - 1)) === 0
	);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isFinitePositive(value: unknown): value is number {
	return isFiniteNumber(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}
