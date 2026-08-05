import { gridValue, type SampledGrid } from './types';

export type ContourPoint = readonly [x: number, y: number];

export type ContourSegment = {
	readonly level: number;
	readonly from: ContourPoint;
	readonly to: ContourPoint;
};

type Edge = 0 | 1 | 2 | 3;

function interpolate(level: number, first: number, second: number): number {
	const difference = second - first;
	if (!Number.isFinite(difference) || Math.abs(difference) < Number.EPSILON) return 0.5;
	return Math.min(1, Math.max(0, (level - first) / difference));
}

function edgePoint(
	edge: Edge,
	column: number,
	row: number,
	level: number,
	topLeft: number,
	topRight: number,
	bottomRight: number,
	bottomLeft: number
): ContourPoint {
	if (edge === 0) {
		return [column + interpolate(level, topLeft, topRight), row];
	}
	if (edge === 1) {
		return [column + 1, row + interpolate(level, topRight, bottomRight)];
	}
	if (edge === 2) {
		return [column + 1 - interpolate(level, bottomRight, bottomLeft), row + 1];
	}
	return [column, row + 1 - interpolate(level, bottomLeft, topLeft)];
}

function edgePairs(mask: number, centreAbove: boolean): readonly (readonly [Edge, Edge])[] {
	switch (mask) {
		case 1:
			return [[3, 0]];
		case 2:
			return [[0, 1]];
		case 3:
			return [[3, 1]];
		case 4:
			return [[1, 2]];
		case 5:
			return centreAbove
				? [
						[0, 1],
						[2, 3]
					]
				: [
						[3, 0],
						[1, 2]
					];
		case 6:
			return [[0, 2]];
		case 7:
			return [[3, 2]];
		case 8:
			return [[2, 3]];
		case 9:
			return [[0, 2]];
		case 10:
			return centreAbove
				? [
						[3, 0],
						[1, 2]
					]
				: [
						[0, 1],
						[2, 3]
					];
		case 11:
			return [[1, 2]];
		case 12:
			return [[3, 1]];
		case 13:
			return [[0, 1]];
		case 14:
			return [[3, 0]];
		default:
			return [];
	}
}

/**
 * Extracts isoline segments with linear edge interpolation. Ambiguous saddle
 * cells use the bilinear centre value (the asymptotic-decider equivalent for
 * the cell centre) so contours do not arbitrarily flip topology.
 */
export function marchingSquares(
	grid: SampledGrid,
	levels: readonly number[]
): readonly ContourSegment[] {
	if (grid.width < 2 || grid.height < 2 || levels.length === 0) return [];
	const segments: ContourSegment[] = [];

	for (const level of levels) {
		if (!Number.isFinite(level)) continue;
		for (let row = 0; row < grid.height - 1; row += 1) {
			for (let column = 0; column < grid.width - 1; column += 1) {
				const topLeft = gridValue(grid, column, row);
				const topRight = gridValue(grid, column + 1, row);
				const bottomRight = gridValue(grid, column + 1, row + 1);
				const bottomLeft = gridValue(grid, column, row + 1);
				const mask =
					(topLeft >= level ? 1 : 0) |
					(topRight >= level ? 2 : 0) |
					(bottomRight >= level ? 4 : 0) |
					(bottomLeft >= level ? 8 : 0);
				const centre = (topLeft + topRight + bottomRight + bottomLeft) / 4;
				for (const [fromEdge, toEdge] of edgePairs(mask, centre >= level)) {
					segments.push({
						level,
						from: edgePoint(
							fromEdge,
							column,
							row,
							level,
							topLeft,
							topRight,
							bottomRight,
							bottomLeft
						),
						to: edgePoint(toEdge, column, row, level, topLeft, topRight, bottomRight, bottomLeft)
					});
				}
			}
		}
	}

	return segments;
}

export function contourLevels(grid: SampledGrid, count = 12): readonly number[] {
	const minimum = Number.isFinite(grid.min) ? grid.min : 0;
	const maximum = Number.isFinite(grid.max) ? grid.max : minimum + 1;
	const safeCount = Math.max(2, Math.min(30, Math.round(count)));
	const range = Math.max(Number.EPSILON, maximum - minimum);
	return Array.from(
		{ length: safeCount },
		(_, index) => minimum + ((index + 1) / (safeCount + 1)) * range
	);
}
