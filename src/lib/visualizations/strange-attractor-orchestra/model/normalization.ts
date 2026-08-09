import type { FrozenNormalization, RobustBounds, Vector3 } from '../types';

const NORMALIZATION_EPSILON = 1e-12;
const OBSERVATION_SCALE = 2.5;

function quantile(sorted: Float64Array, probability: number): number {
	if (sorted.length === 0) throw new RangeError('Cannot calculate a quantile of no values.');
	const position = Math.max(0, Math.min(1, probability)) * (sorted.length - 1);
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	const mix = position - lower;
	return sorted[lower] * (1 - mix) + sorted[upper] * mix;
}

function axisValues(positions: Float64Array, axis: number): Float64Array {
	if (positions.length % 3 !== 0 || positions.length === 0) {
		throw new RangeError('Calibration positions must contain at least one three-coordinate point.');
	}
	const values = new Float64Array(positions.length / 3);
	for (let index = 0; index < values.length; index += 1) {
		const value = positions[index * 3 + axis];
		if (!Number.isFinite(value)) throw new RangeError('Calibration positions must be finite.');
		values[index] = value;
	}
	values.sort();
	return values;
}

export function fitFrozenNormalization(
	calibrationPositions: Float64Array,
	frozenAtStep: number,
	fallbackBounds: RobustBounds
): FrozenNormalization {
	const medians: number[] = [];
	const mads: number[] = [];
	const scales: number[] = [];
	const lower: number[] = [];
	const upper: number[] = [];
	for (let axis = 0; axis < 3; axis += 1) {
		const values = axisValues(calibrationPositions, axis);
		const median = quantile(values, 0.5);
		const deviations = new Float64Array(values.length);
		for (let index = 0; index < values.length; index += 1) {
			deviations[index] = Math.abs(values[index] - median);
		}
		deviations.sort();
		const mad = quantile(deviations, 0.5);
		const low = quantile(values, 0.05);
		const high = quantile(values, 0.95);
		const quantileScale = Math.max((high - low) / 3.29, 0);
		const fallbackScale = Math.max(
			(fallbackBounds.upper[axis] - fallbackBounds.lower[axis]) / 6,
			NORMALIZATION_EPSILON
		);
		const scale =
			mad > NORMALIZATION_EPSILON
				? mad
				: quantileScale > NORMALIZATION_EPSILON
					? quantileScale
					: fallbackScale;
		medians.push(median);
		mads.push(mad);
		scales.push(scale);
		lower.push(low);
		upper.push(high);
	}
	return Object.freeze({
		median: Object.freeze(medians) as unknown as Vector3,
		mad: Object.freeze(mads) as unknown as Vector3,
		scale: Object.freeze(scales) as unknown as Vector3,
		lowerQuantile: Object.freeze(lower) as unknown as Vector3,
		upperQuantile: Object.freeze(upper) as unknown as Vector3,
		frozenAtStep
	});
}

export function normalizeCoordinate(
	value: number,
	axis: 0 | 1 | 2,
	normalization: FrozenNormalization
): number {
	return Math.tanh(
		(value - normalization.median[axis]) /
			(OBSERVATION_SCALE * (normalization.scale[axis] + NORMALIZATION_EPSILON))
	);
}

export function applyFrozenNormalization(
	positions: Float64Array,
	normalization: FrozenNormalization
): Float64Array {
	if (positions.length % 3 !== 0) {
		throw new RangeError('Observation positions must be packed as x/y/z triples.');
	}
	const normalized = new Float64Array(positions.length);
	for (let index = 0; index < positions.length; index += 3) {
		normalized[index] = normalizeCoordinate(positions[index], 0, normalization);
		normalized[index + 1] = normalizeCoordinate(positions[index + 1], 1, normalization);
		normalized[index + 2] = normalizeCoordinate(positions[index + 2], 2, normalization);
	}
	return normalized;
}

export function robustUnitNormalize(values: Float64Array): Float64Array {
	if (values.length === 0) return new Float64Array();
	const sorted = values.slice().sort();
	const low = quantile(sorted, 0.05);
	const high = quantile(sorted, 0.95);
	const span = high - low;
	const result = new Float64Array(values.length);
	if (!(span > NORMALIZATION_EPSILON)) return result;
	for (let index = 0; index < values.length; index += 1) {
		result[index] = Math.max(0, Math.min(1, (values[index] - low) / span));
	}
	return result;
}
