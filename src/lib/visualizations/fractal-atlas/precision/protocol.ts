export const PRECISION_WORKER_PROTOCOL_VERSION = 1 as const;

export const PRECISION_LIMITS = {
	maxIterations: 2_048,
	maxDimension: 16_384,
	maxReferenceGrid: 4,
	maxDecimalDigits: 160,
	minDecimalDigits: 34
} as const;

export type PerturbationFamily = 'mandelbrot' | 'julia';

export interface PrecisionReferenceConfig {
	family: PerturbationFamily;
	centerRe: string;
	centerIm: string;
	spanY: string;
	rotation: string;
	juliaRe: string;
	juliaIm: string;
	width: number;
	height: number;
	maxIterations: number;
	bailout: number;
	flipY: boolean;
	precisionDigits: number;
	settingsHash: string;
}

interface PrecisionEnvelope {
	protocolVersion: typeof PRECISION_WORKER_PROTOCOL_VERSION;
	taskId: number;
	generation: number;
	settingsHash: string;
}

export type PrecisionWorkerRequest =
	| (PrecisionEnvelope & { type: 'CALCULATE_REFERENCE'; config: PrecisionReferenceConfig })
	| (PrecisionEnvelope & { type: 'CANCEL_GENERATION' })
	| (PrecisionEnvelope & { type: 'DISPOSE' });

export interface PrecisionReferenceResult {
	family: PerturbationFamily;
	precisionDigits: number;
	maxIterations: number;
	orbitLength: number;
	gridSize: number;
	/** RGBA float texels: real hi, imaginary hi, real lo, imaginary lo. */
	orbit: Float32Array;
	/** One RGBA hi/lo reference point for each tile. */
	referencePoints: Float32Array;
	/** Number of valid reference iterates in each tile row. */
	referenceLengths: Uint16Array;
	diagnosticSamples: number;
	glitchesBeforeRebase: number;
	glitchesAfterRebase: number;
	rebased: boolean;
	calculationMilliseconds: number;
}

export type PrecisionWorkerResponse =
	| (PrecisionEnvelope & {
			type: 'REFERENCE_STATUS';
			phase: 'calculating' | 'diagnosing' | 'rebasing';
			progress: number;
			precisionDigits: number;
	  })
	| (PrecisionEnvelope & { type: 'REFERENCE_RESULT'; result: PrecisionReferenceResult })
	| (PrecisionEnvelope & { type: 'CANCELLED' })
	| (PrecisionEnvelope & { type: 'DISPOSED' })
	| (PrecisionEnvelope & { type: 'ERROR'; message: string; stack?: string });

export function isPrecisionReferenceConfig(value: unknown): value is PrecisionReferenceConfig {
	if (!value || typeof value !== 'object') return false;
	const config = value as Partial<PrecisionReferenceConfig>;
	return (
		(config.family === 'mandelbrot' || config.family === 'julia') &&
		isDecimalString(config.centerRe) &&
		isDecimalString(config.centerIm) &&
		isPositiveDecimalString(config.spanY) &&
		isDecimalString(config.rotation) &&
		isDecimalString(config.juliaRe) &&
		isDecimalString(config.juliaIm) &&
		isInteger(config.width, 1, PRECISION_LIMITS.maxDimension) &&
		isInteger(config.height, 1, PRECISION_LIMITS.maxDimension) &&
		isInteger(config.maxIterations, 1, PRECISION_LIMITS.maxIterations) &&
		isFiniteNumber(config.bailout) &&
		config.bailout >= 2 &&
		isInteger(
			config.precisionDigits,
			PRECISION_LIMITS.minDecimalDigits,
			PRECISION_LIMITS.maxDecimalDigits
		) &&
		typeof config.flipY === 'boolean' &&
		typeof config.settingsHash === 'string' &&
		config.settingsHash.length >= 8 &&
		config.settingsHash.length <= 256
	);
}

export function isPrecisionWorkerRequest(value: unknown): value is PrecisionWorkerRequest {
	if (!hasEnvelope(value)) return false;
	if (value.type === 'CALCULATE_REFERENCE') {
		return (
			isPrecisionReferenceConfig(value.config) && value.config.settingsHash === value.settingsHash
		);
	}
	return value.type === 'CANCEL_GENERATION' || value.type === 'DISPOSE';
}

export function isPrecisionWorkerResponse(value: unknown): value is PrecisionWorkerResponse {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'REFERENCE_STATUS':
			return (
				(value.phase === 'calculating' ||
					value.phase === 'diagnosing' ||
					value.phase === 'rebasing') &&
				isFiniteNumber(value.progress) &&
				value.progress >= 0 &&
				value.progress <= 1 &&
				isInteger(
					value.precisionDigits,
					PRECISION_LIMITS.minDecimalDigits,
					PRECISION_LIMITS.maxDecimalDigits
				)
			);
		case 'REFERENCE_RESULT':
			return isPrecisionReferenceResult(value.result);
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

export function precisionResponseTransferables(response: PrecisionWorkerResponse): ArrayBuffer[] {
	if (response.type !== 'REFERENCE_RESULT') return [];
	return [response.result.orbit, response.result.referencePoints, response.result.referenceLengths]
		.map((view) => view.buffer)
		.filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
}

function isPrecisionReferenceResult(value: unknown): value is PrecisionReferenceResult {
	if (!value || typeof value !== 'object') return false;
	const result = value as Partial<PrecisionReferenceResult>;
	const tiles =
		typeof result.gridSize === 'number' ? result.gridSize * result.gridSize : Number.NaN;
	const expectedOrbitValues =
		typeof result.orbitLength === 'number' ? result.orbitLength * tiles * 4 : Number.NaN;
	return (
		(result.family === 'mandelbrot' || result.family === 'julia') &&
		isInteger(
			result.precisionDigits,
			PRECISION_LIMITS.minDecimalDigits,
			PRECISION_LIMITS.maxDecimalDigits
		) &&
		isInteger(result.maxIterations, 1, PRECISION_LIMITS.maxIterations) &&
		isInteger(result.orbitLength, 2, PRECISION_LIMITS.maxIterations + 1) &&
		isInteger(result.gridSize, 1, PRECISION_LIMITS.maxReferenceGrid) &&
		result.orbit instanceof Float32Array &&
		result.orbit.length === expectedOrbitValues &&
		result.referencePoints instanceof Float32Array &&
		result.referencePoints.length === tiles * 4 &&
		result.referenceLengths instanceof Uint16Array &&
		result.referenceLengths.length === tiles &&
		isInteger(result.diagnosticSamples, 0, 10_000) &&
		isInteger(result.glitchesBeforeRebase, 0, result.diagnosticSamples) &&
		isInteger(result.glitchesAfterRebase, 0, result.diagnosticSamples) &&
		typeof result.rebased === 'boolean' &&
		isFiniteNumber(result.calculationMilliseconds) &&
		result.calculationMilliseconds >= 0
	);
}

function hasEnvelope(
	value: unknown
): value is PrecisionEnvelope & Record<string, unknown> & { type: string } {
	if (!value || typeof value !== 'object') return false;
	const envelope = value as Record<string, unknown>;
	return (
		envelope.protocolVersion === PRECISION_WORKER_PROTOCOL_VERSION &&
		isInteger(envelope.taskId, 0, Number.MAX_SAFE_INTEGER) &&
		isInteger(envelope.generation, 0, Number.MAX_SAFE_INTEGER) &&
		typeof envelope.settingsHash === 'string' &&
		envelope.settingsHash.length <= 256 &&
		typeof envelope.type === 'string'
	);
}

function isDecimalString(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length >= 1 &&
		value.length <= 160 &&
		/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) &&
		Number.isFinite(Number(value))
	);
}

function isPositiveDecimalString(value: unknown): value is string {
	return isDecimalString(value) && Number(value) > 0;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown, minimum: number, maximum: number): value is number {
	return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
