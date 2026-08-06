import type { HeightMapping } from './types';

export type LossDisplayGrid = {
	readonly rawFloor: number;
	readonly displayCeiling: number;
};

export type LossDisplayBounds = {
	readonly floor: number;
	readonly ceiling: number;
	readonly range: number;
};

export function lossDisplayBounds(grid: LossDisplayGrid): LossDisplayBounds {
	const floor = Number.isFinite(grid.rawFloor) ? grid.rawFloor : 0;
	const minimumRange = Math.max(Number.EPSILON, Math.abs(floor) * Number.EPSILON);
	const candidateCeiling = Number.isFinite(grid.displayCeiling)
		? grid.displayCeiling
		: floor + minimumRange;
	const ceiling = candidateCeiling > floor ? candidateCeiling : floor + minimumRange;
	return { floor, ceiling, range: Math.max(minimumRange, ceiling - floor) };
}

/** Map raw loss to the shared terrain/map display interval without changing the experiment. */
export function normalizeLossForDisplay(
	value: number,
	grid: LossDisplayGrid,
	mapping: HeightMapping
): number {
	const { floor, range } = lossDisplayBounds(grid);
	const shifted = Math.max(0, value - floor);
	const normalized =
		mapping === 'linear' ? shifted / range : Math.log1p(shifted) / Math.log1p(range);
	return Math.min(1, Math.max(0, normalized));
}

/** Inverse of normalizeLossForDisplay over the non-saturated display interval. */
export function rawLossAtDisplayPosition(
	position: number,
	grid: LossDisplayGrid,
	mapping: HeightMapping
): number {
	const { floor, range } = lossDisplayBounds(grid);
	const normalized = Math.min(1, Math.max(0, position));
	return (
		floor +
		(mapping === 'linear'
			? normalized * range
			: Math.expm1(normalized * Math.log1p(range)))
	);
}

/** Raw isoline thresholds whose spacing matches the bands in transformed display height. */
export function displayContourLevels(
	grid: LossDisplayGrid,
	count = 13,
	mapping: HeightMapping = 'log-compressed'
): readonly number[] {
	const safeCount = Math.max(2, Math.min(30, Math.round(count)));
	return Array.from({ length: safeCount }, (_, index) =>
		rawLossAtDisplayPosition((index + 1) / (safeCount + 1), grid, mapping)
	);
}
