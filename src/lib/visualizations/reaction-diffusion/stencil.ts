import type { BoundaryCondition, FieldState } from './types';

export interface NeighborValues {
	readonly north: readonly [number, number];
	readonly south: readonly [number, number];
	readonly east: readonly [number, number];
	readonly west: readonly [number, number];
}

function fieldNeighbourValue(
	field: Float64Array,
	mask: Uint8Array,
	size: number,
	center: number,
	nextRow: number,
	nextColumn: number,
	boundary: BoundaryCondition,
	reservoirValue: number
): number {
	if (nextRow < 0 || nextRow >= size || nextColumn < 0 || nextColumn >= size) {
		if (boundary === 'periodic') {
			nextRow = (nextRow + size) % size;
			nextColumn = (nextColumn + size) % size;
		} else if (boundary === 'no-flux') {
			return center;
		} else {
			return reservoirValue;
		}
	}
	const index = nextRow * size + nextColumn;
	return mask[index] ? field[index] : center;
}

function neighbourIndex(
	state: Readonly<FieldState>,
	row: number,
	column: number,
	centerIndex: number,
	boundary: BoundaryCondition
): number {
	const size = state.size;
	let nextRow = row;
	let nextColumn = column;
	if (row < 0 || row >= size || column < 0 || column >= size) {
		if (boundary === 'periodic') {
			nextRow = (row + size) % size;
			nextColumn = (column + size) % size;
		} else if (boundary === 'no-flux') {
			return centerIndex;
		} else {
			return -1;
		}
	}
	const index = nextRow * size + nextColumn;
	return state.mask[index] ? index : centerIndex;
}

function pairAt(
	state: Readonly<FieldState>,
	row: number,
	column: number,
	centerIndex: number,
	boundary: BoundaryCondition
): readonly [number, number] {
	const index = neighbourIndex(state, row, column, centerIndex, boundary);
	return index < 0 ? [1, 0] : [state.u[index], state.v[index]];
}

export function sampleNeighbors(
	state: Readonly<FieldState>,
	row: number,
	column: number,
	boundary: BoundaryCondition
): NeighborValues {
	if (row < 0 || row >= state.size || column < 0 || column >= state.size) {
		throw new RangeError('Sample cell lies outside the field.');
	}
	const centerIndex = row * state.size + column;
	return {
		north: pairAt(state, row - 1, column, centerIndex, boundary),
		south: pairAt(state, row + 1, column, centerIndex, boundary),
		east: pairAt(state, row, column + 1, centerIndex, boundary),
		west: pairAt(state, row, column - 1, centerIndex, boundary)
	};
}

export function fivePointLaplacianAtUnchecked(
	field: Float64Array,
	mask: Uint8Array,
	size: number,
	row: number,
	column: number,
	boundary: BoundaryCondition,
	spacing: number,
	reservoirValue: number
): number {
	const centerIndex = row * size + column;
	if (!mask[centerIndex]) return 0;
	const center = field[centerIndex];
	return (
		(fieldNeighbourValue(field, mask, size, center, row - 1, column, boundary, reservoirValue) +
			fieldNeighbourValue(field, mask, size, center, row + 1, column, boundary, reservoirValue) +
			fieldNeighbourValue(field, mask, size, center, row, column - 1, boundary, reservoirValue) +
			fieldNeighbourValue(field, mask, size, center, row, column + 1, boundary, reservoirValue) -
			4 * center) /
		(spacing * spacing)
	);
}

export function fivePointLaplacianAt(
	field: Float64Array,
	mask: Uint8Array,
	size: number,
	row: number,
	column: number,
	boundary: BoundaryCondition,
	spacing: number,
	reservoirValue: number
): number {
	if (!(spacing > 0) || !Number.isFinite(spacing))
		throw new RangeError('Spacing must be positive.');
	if (
		!Number.isInteger(row) ||
		!Number.isInteger(column) ||
		row < 0 ||
		row >= size ||
		column < 0 ||
		column >= size
	) {
		throw new RangeError('Laplacian cell lies outside the field.');
	}
	if (field.length !== size * size || mask.length !== size * size) {
		throw new RangeError('Laplacian arrays do not match the declared grid.');
	}
	return fivePointLaplacianAtUnchecked(
		field,
		mask,
		size,
		row,
		column,
		boundary,
		spacing,
		reservoirValue
	);
}
