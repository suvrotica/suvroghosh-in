import {
	DEFAULT_RANDOM_MATRIX_STATE,
	MAX_MATRIX_DIMENSION,
	MAX_NONSYMMETRIC_EVD_DIMENSION,
	MIN_MATRIX_DIMENSION,
	maximumEnsembleSamples
} from './constants';
import { normalizeSeed } from './prng';
import type { RandomMatrixState } from './types';

export const RANDOM_MATRIX_URL_STATE_VERSION = 1 as const;
const MAX_RANDOM_MATRIX_QUERY_LENGTH = 4_096;

const PRESETS = [
	'circular-cloud',
	'wigner-moonrise',
	'wishart-ridge',
	'universality-test',
	'hidden-rank-one-signal',
	'sparse-galaxy',
	'same-spectrum-different-face',
	'non-normal-trap'
] as const satisfies readonly RandomMatrixState['preset'][];
const DISTRIBUTIONS = [
	'gaussian',
	'uniform',
	'rademacher'
] as const satisfies readonly RandomMatrixState['distribution'][];
const NORMALIZATIONS = [
	'variance-1/n',
	'unscaled',
	'frobenius',
	'spectral-radius'
] as const satisfies readonly RandomMatrixState['normalization'][];
const SYMMETRIES = [
	'none',
	'symmetric'
] as const satisfies readonly RandomMatrixState['symmetry'][];
const SIGNAL_TYPES = [
	'none',
	'rank-one',
	'two-block',
	'diagonal-band',
	'toeplitz',
	'sparse-hubs',
	'repeated-motif',
	'nonzero-mean',
	'unequal-row-variance'
] as const satisfies readonly RandomMatrixState['signalType'][];
const LENSES = [
	'microscope',
	'spectral-sky',
	'singular-mountain',
	'direction-machine',
	'structure-detector',
	'ensemble-laboratory'
] as const satisfies readonly RandomMatrixState['lens'][];
const MODES = ['single', 'ensemble'] as const satisfies readonly RandomMatrixState['mode'][];
const COLOR_SCALES = [
	'diverging',
	'sequential',
	'absolute'
] as const satisfies readonly RandomMatrixState['colorScale'][];

const ASPECT_RATIO_MINIMUM = 0.25;
const ASPECT_RATIO_MAXIMUM = 2;
const MEAN_MINIMUM = -2;
const MEAN_MAXIMUM = 2;
const SCALE_MINIMUM = 0.01;
const SCALE_MAXIMUM = 4;
const SPARSITY_MAXIMUM = 0.98;
const SIGNAL_STRENGTH_MAXIMUM = 6;

function property(source: Record<PropertyKey, unknown>, key: keyof RandomMatrixState): unknown {
	try {
		return source[key];
	} catch {
		return undefined;
	}
}

function recordFrom(input: unknown): Record<PropertyKey, unknown> {
	try {
		return typeof input === 'object' && input !== null && !Array.isArray(input)
			? (input as Record<PropertyKey, unknown>)
			: {};
	} catch {
		return {};
	}
}

function finiteNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
	if (typeof value !== 'string' || value.trim() === '' || value.length > 64) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
	const bounded = Math.min(maximum, Math.max(minimum, value));
	return Object.is(bounded, -0) ? 0 : bounded;
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
	return clamp(finiteNumber(value, fallback), minimum, maximum);
}

function boundedInteger(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	return clamp(Math.round(finiteNumber(value, fallback)), minimum, maximum);
}

function enumValue<const Value extends string>(
	value: unknown,
	allowed: readonly Value[],
	fallback: Value
): Value {
	return typeof value === 'string' && (allowed as readonly string[]).includes(value)
		? (value as Value)
		: fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
	if (value === true || value === 1 || value === '1' || value === 'true') return true;
	if (value === false || value === 0 || value === '0' || value === 'false') return false;
	return fallback;
}

/** Restore every field to its documented type and bounded computational range. */
export function normalizeRandomMatrixState(input: unknown): RandomMatrixState {
	const source = recordFrom(input);
	const preset = enumValue(property(source, 'preset'), PRESETS, DEFAULT_RANDOM_MATRIX_STATE.preset);
	const symmetry = fixedSymmetryForPreset(preset, property(source, 'symmetry'));
	const requestedNormalization = enumValue(
		property(source, 'normalization'),
		NORMALIZATIONS,
		DEFAULT_RANDOM_MATRIX_STATE.normalization
	);
	const normalization =
		preset === 'non-normal-trap' && requestedNormalization === 'variance-1/n'
			? 'unscaled'
			: requestedNormalization;
	const requestedDimension = boundedInteger(
		property(source, 'dimension'),
		DEFAULT_RANDOM_MATRIX_STATE.dimension,
		MIN_MATRIX_DIMENSION,
		MAX_MATRIX_DIMENSION
	);
	const dimension =
		normalization === 'spectral-radius' && symmetry === 'none'
			? Math.min(requestedDimension, MAX_NONSYMMETRIC_EVD_DIMENSION)
			: requestedDimension;
	const signalType = enumValue(
		property(source, 'signalType'),
		SIGNAL_TYPES,
		DEFAULT_RANDOM_MATRIX_STATE.signalType
	);
	return {
		seed: normalizeSeed(property(source, 'seed'), DEFAULT_RANDOM_MATRIX_STATE.seed),
		preset,
		dimension,
		aspectRatio: boundedNumber(
			property(source, 'aspectRatio'),
			DEFAULT_RANDOM_MATRIX_STATE.aspectRatio,
			ASPECT_RATIO_MINIMUM,
			ASPECT_RATIO_MAXIMUM
		),
		distribution:
			preset === 'sparse-galaxy'
				? 'rademacher'
				: enumValue(
						property(source, 'distribution'),
						DISTRIBUTIONS,
						DEFAULT_RANDOM_MATRIX_STATE.distribution
					),
		mean:
			preset === 'non-normal-trap'
				? 0
				: boundedNumber(
						property(source, 'mean'),
						DEFAULT_RANDOM_MATRIX_STATE.mean,
						MEAN_MINIMUM,
						MEAN_MAXIMUM
					),
		scale: boundedNumber(
			property(source, 'scale'),
			DEFAULT_RANDOM_MATRIX_STATE.scale,
			SCALE_MINIMUM,
			SCALE_MAXIMUM
		),
		normalization,
		symmetry,
		sparsity:
			preset === 'non-normal-trap'
				? 0
				: boundedNumber(
						property(source, 'sparsity'),
						DEFAULT_RANDOM_MATRIX_STATE.sparsity,
						0,
						SPARSITY_MAXIMUM
					),
		signalType,
		signalStrength:
			preset === 'non-normal-trap' && signalType === 'none'
				? 0
				: boundedNumber(
						property(source, 'signalStrength'),
						DEFAULT_RANDOM_MATRIX_STATE.signalStrength,
						0,
						SIGNAL_STRENGTH_MAXIMUM
					),
		lens: enumValue(property(source, 'lens'), LENSES, DEFAULT_RANDOM_MATRIX_STATE.lens),
		mode: enumValue(property(source, 'mode'), MODES, DEFAULT_RANDOM_MATRIX_STATE.mode),
		sampleCount: boundedInteger(
			property(source, 'sampleCount'),
			DEFAULT_RANDOM_MATRIX_STATE.sampleCount,
			1,
			maximumEnsembleSamples(dimension)
		),
		theory: booleanValue(property(source, 'theory'), DEFAULT_RANDOM_MATRIX_STATE.theory),
		colorScale: enumValue(
			property(source, 'colorScale'),
			COLOR_SCALES,
			DEFAULT_RANDOM_MATRIX_STATE.colorScale
		),
		highContrast: booleanValue(
			property(source, 'highContrast'),
			DEFAULT_RANDOM_MATRIX_STATE.highContrast
		)
	};
}

function fixedSymmetryForPreset(
	preset: RandomMatrixState['preset'],
	requested: unknown
): RandomMatrixState['symmetry'] {
	switch (preset) {
		case 'wigner-moonrise':
		case 'wishart-ridge':
		case 'hidden-rank-one-signal':
		case 'sparse-galaxy':
		case 'same-spectrum-different-face':
			return 'symmetric';
		case 'non-normal-trap':
			return 'none';
		case 'circular-cloud':
		case 'universality-test':
			return enumValue(requested, SYMMETRIES, DEFAULT_RANDOM_MATRIX_STATE.symmetry);
	}
}

function queryText(source: string): string {
	const questionMark = source.indexOf('?');
	let query = questionMark >= 0 ? source.slice(questionMark + 1) : source.replace(/^\?/u, '');
	const hash = query.indexOf('#');
	if (hash >= 0) query = query.slice(0, hash);
	return query;
}

function parametersFrom(search: string | URLSearchParams): URLSearchParams {
	return search instanceof URLSearchParams
		? new URLSearchParams(search)
		: new URLSearchParams(queryText(search));
}

function rawQuery(search: string | URLSearchParams): string {
	return search instanceof URLSearchParams ? search.toString() : queryText(search);
}

function parameter(
	parameters: URLSearchParams,
	canonicalKey: string,
	...aliases: readonly string[]
): string | undefined {
	const value = parameters.get(canonicalKey);
	if (value !== null) return value;
	for (const alias of aliases) {
		const aliased = parameters.get(alias);
		if (aliased !== null) return aliased;
	}
	return undefined;
}

/** Parse only allowlisted state fields; malformed values are defaulted or clamped. */
export function parseRandomMatrixState(search: string | URLSearchParams): RandomMatrixState {
	let parameters: URLSearchParams;
	try {
		if (rawQuery(search).length > MAX_RANDOM_MATRIX_QUERY_LENGTH) {
			return normalizeRandomMatrixState(DEFAULT_RANDOM_MATRIX_STATE);
		}
		parameters = parametersFrom(search);
	} catch {
		return normalizeRandomMatrixState(DEFAULT_RANDOM_MATRIX_STATE);
	}
	const version = parameters.get('rmv');
	if (version !== null && version !== String(RANDOM_MATRIX_URL_STATE_VERSION)) {
		return normalizeRandomMatrixState(DEFAULT_RANDOM_MATRIX_STATE);
	}
	return normalizeRandomMatrixState({
		seed: parameter(parameters, 'seed'),
		preset: parameter(parameters, 'preset'),
		dimension: parameter(parameters, 'n', 'dimension'),
		aspectRatio: parameter(parameters, 'gamma', 'aspectRatio'),
		distribution: parameter(parameters, 'dist', 'distribution'),
		mean: parameter(parameters, 'mean'),
		scale: parameter(parameters, 'scale'),
		normalization: parameter(parameters, 'norm', 'normalization'),
		symmetry: parameter(parameters, 'sym', 'symmetry'),
		sparsity: parameter(parameters, 'sparse', 'sparsity'),
		signalType: parameter(parameters, 'signal', 'signalType'),
		signalStrength: parameter(parameters, 'strength', 'signalStrength'),
		lens: parameter(parameters, 'lens'),
		mode: parameter(parameters, 'mode'),
		sampleCount: parameter(parameters, 'samples', 'sampleCount'),
		theory: parameter(parameters, 'theory'),
		colorScale: parameter(parameters, 'colour', 'color', 'colorScale'),
		highContrast: parameter(parameters, 'contrast', 'highContrast')
	});
}

function setWhenDifferent(
	parameters: URLSearchParams,
	key: string,
	value: string | number,
	fallback: string | number
): void {
	if (value !== fallback) parameters.set(key, String(value));
}

/**
 * Produce the unique, minimal query representation in a stable field order.
 * Parsing the result returns the normalized input exactly.
 */
export function serializeRandomMatrixState(state: RandomMatrixState): URLSearchParams {
	const normalized = normalizeRandomMatrixState(state);
	const defaults = DEFAULT_RANDOM_MATRIX_STATE;
	const parameters = new URLSearchParams();
	parameters.set('rmv', String(RANDOM_MATRIX_URL_STATE_VERSION));
	setWhenDifferent(parameters, 'seed', normalized.seed, defaults.seed);
	setWhenDifferent(parameters, 'preset', normalized.preset, defaults.preset);
	setWhenDifferent(parameters, 'n', normalized.dimension, defaults.dimension);
	setWhenDifferent(parameters, 'gamma', normalized.aspectRatio, defaults.aspectRatio);
	setWhenDifferent(parameters, 'dist', normalized.distribution, defaults.distribution);
	setWhenDifferent(parameters, 'mean', normalized.mean, defaults.mean);
	setWhenDifferent(parameters, 'scale', normalized.scale, defaults.scale);
	setWhenDifferent(parameters, 'norm', normalized.normalization, defaults.normalization);
	setWhenDifferent(parameters, 'sym', normalized.symmetry, defaults.symmetry);
	setWhenDifferent(parameters, 'sparse', normalized.sparsity, defaults.sparsity);
	setWhenDifferent(parameters, 'signal', normalized.signalType, defaults.signalType);
	setWhenDifferent(parameters, 'strength', normalized.signalStrength, defaults.signalStrength);
	setWhenDifferent(parameters, 'lens', normalized.lens, defaults.lens);
	setWhenDifferent(parameters, 'mode', normalized.mode, defaults.mode);
	setWhenDifferent(parameters, 'samples', normalized.sampleCount, defaults.sampleCount);
	if (normalized.theory !== defaults.theory)
		parameters.set('theory', normalized.theory ? '1' : '0');
	setWhenDifferent(parameters, 'colour', normalized.colorScale, defaults.colorScale);
	if (normalized.highContrast !== defaults.highContrast) {
		parameters.set('contrast', normalized.highContrast ? '1' : '0');
	}
	return parameters;
}
