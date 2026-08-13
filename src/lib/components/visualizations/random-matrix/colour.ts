import type { ColourScale, MatrixDisplayMode } from './types';

export interface DisplayTransform {
	values: Float64Array;
	minimum: number;
	maximum: number;
	centre: number;
}

function quantile(sorted: readonly number[], probability: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.max(0, Math.min(sorted.length - 1, probability * (sorted.length - 1)));
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	const fraction = index - lower;
	return (sorted[lower] ?? 0) * (1 - fraction) + (sorted[upper] ?? 0) * fraction;
}

export function transformMatrixValues(
	input: Float64Array,
	mode: MatrixDisplayMode,
	threshold = 0
): DisplayTransform {
	const values = new Float64Array(input.length);
	let mean = 0;
	let count = 0;
	for (const value of input) {
		if (!Number.isFinite(value)) continue;
		mean += value;
		count += 1;
	}
	mean = count > 0 ? mean / count : 0;
	let variance = 0;
	for (const value of input) {
		if (Number.isFinite(value)) variance += (value - mean) ** 2;
	}
	const deviation = Math.sqrt(variance / Math.max(1, count - 1)) || 1;

	let minimum = Number.POSITIVE_INFINITY;
	let maximum = Number.NEGATIVE_INFINITY;
	for (let index = 0; index < input.length; index += 1) {
		const raw = input[index] ?? 0;
		let value = raw;
		if (mode === 'standardised') value = (raw - mean) / deviation;
		if (mode === 'absolute') value = Math.abs(raw);
		if (mode === 'threshold') value = Math.abs(raw) >= threshold ? raw : 0;
		values[index] = Number.isFinite(value) ? value : 0;
		minimum = Math.min(minimum, values[index]);
		maximum = Math.max(maximum, values[index]);
	}
	if (!Number.isFinite(minimum) || !Number.isFinite(maximum))
		return { values, minimum: 0, maximum: 1, centre: 0 };
	if (minimum === maximum) maximum = minimum + 1;
	return { values, minimum, maximum, centre: mode === 'absolute' ? minimum : 0 };
}

export function robustColourDomain(
	values: Float64Array,
	sequential: boolean
): readonly [number, number] {
	const finite = Array.from(values)
		.filter(Number.isFinite)
		.sort((left, right) => left - right);
	if (finite.length === 0) return [0, 1];
	if (sequential) {
		const minimum = Math.min(0, quantile(finite, 0.01));
		const maximum = Math.max(minimum + Number.EPSILON, quantile(finite, 0.99));
		return [minimum, maximum];
	}
	const extent = Math.max(
		Math.abs(quantile(finite, 0.01)),
		Math.abs(quantile(finite, 0.99)),
		Number.EPSILON
	);
	return [-extent, extent];
}

function interpolate(
	left: readonly [number, number, number],
	right: readonly [number, number, number],
	amount: number
): string {
	const t = Math.max(0, Math.min(1, amount));
	const red = Math.round(left[0] + (right[0] - left[0]) * t);
	const green = Math.round(left[1] + (right[1] - left[1]) * t);
	const blue = Math.round(left[2] + (right[2] - left[2]) * t);
	return `rgb(${red} ${green} ${blue})`;
}

export function matrixColour(
	value: number,
	domain: readonly [number, number],
	scale: ColourScale,
	highContrast: boolean
): string {
	const [minimum, maximum] = domain;
	if (scale === 'sequential') {
		const t = (value - minimum) / Math.max(Number.EPSILON, maximum - minimum);
		if (highContrast) return interpolate([255, 255, 255], [0, 43, 54], t);
		if (t < 0.5) return interpolate([246, 247, 239], [78, 142, 137], t * 2);
		return interpolate([78, 142, 137], [0, 50, 71], (t - 0.5) * 2);
	}
	const extent = Math.max(Math.abs(minimum), Math.abs(maximum), Number.EPSILON);
	const t = Math.max(-1, Math.min(1, value / extent));
	if (highContrast) {
		return t < 0
			? interpolate([0, 38, 95], [255, 255, 255], t + 1)
			: interpolate([255, 255, 255], [117, 0, 0], t);
	}
	return t < 0
		? interpolate([45, 80, 135], [241, 239, 226], t + 1)
		: interpolate([241, 239, 226], [167, 63, 53], t);
}

export function matrixTextColour(colour: string): string {
	const match = colour.match(/rgb\((\d+)\s+(\d+)\s+(\d+)\)/u);
	if (!match) return '#111';
	const luminance =
		Number(match[1]) * 0.2126 + Number(match[2]) * 0.7152 + Number(match[3]) * 0.0722;
	return luminance < 135 ? '#fff' : '#111';
}
