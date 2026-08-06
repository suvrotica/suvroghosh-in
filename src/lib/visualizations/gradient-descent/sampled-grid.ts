import type { LandscapeDefinition } from './types';

export type SampledLandscapeGrid = {
	readonly width: number;
	readonly height: number;
	readonly values: Float64Array;
	readonly rawFloor: number;
	readonly sampledMinimum: number;
	readonly displayCeiling: number;
	readonly min: number;
	readonly max: number;
};

export function sampleLandscapeGrid(
	definition: LandscapeDefinition,
	resolution = 84
): SampledLandscapeGrid {
	if (!Number.isSafeInteger(resolution) || resolution < 2 || resolution > 512) {
		throw new RangeError('Landscape resolution must be an integer between 2 and 512.');
	}
	const width = resolution;
	const height = resolution;
	const values = new Float64Array(width * height);
	const finite: number[] = [];
	for (let row = 0; row < height; row += 1) {
		const y =
			definition.domain.min[1] +
			((definition.domain.max[1] - definition.domain.min[1]) * row) / (height - 1);
		for (let column = 0; column < width; column += 1) {
			const x =
				definition.domain.min[0] +
				((definition.domain.max[0] - definition.domain.min[0]) * column) / (width - 1);
			const value = definition.value([x, y]);
			values[row * width + column] = value;
			if (Number.isFinite(value)) finite.push(value);
		}
	}
	finite.sort((left, right) => left - right);
	const quantile = (fraction: number) =>
		finite[
			Math.max(0, Math.min(finite.length - 1, Math.round((finite.length - 1) * fraction)))
		] ?? 0;
	const sampledMinimum = finite[0] ?? 0;
	const declaredMinimum = definition.knownMinimumLoss;
	const rawFloor = Number.isFinite(declaredMinimum)
		? Math.min(declaredMinimum!, sampledMinimum)
		: sampledMinimum;
	const minimumRange = Math.max(Number.EPSILON, Math.abs(rawFloor) * Number.EPSILON);
	const robustCeiling = quantile(0.97);
	const displayCeiling = robustCeiling > rawFloor ? robustCeiling : rawFloor + minimumRange;
	return {
		width,
		height,
		values,
		rawFloor,
		sampledMinimum,
		displayCeiling,
		min: rawFloor,
		max: displayCeiling
	};
}
