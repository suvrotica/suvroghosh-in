import type { BZBoundary } from './types';

function neighbourValue(
	field: Float64Array,
	mask: Uint8Array,
	size: number,
	centerValue: number,
	row: number,
	column: number,
	boundary: BZBoundary
): number {
	let nextRow = row;
	let nextColumn = column;
	if (nextRow < 0 || nextRow >= size || nextColumn < 0 || nextColumn >= size) {
		if (boundary === 'no-flux') return centerValue;
		nextRow = (nextRow + size) % size;
		nextColumn = (nextColumn + size) % size;
	}
	const nextIndex = nextRow * size + nextColumn;
	// Obstacles and a circular exterior are impermeable even when the texture itself is periodic.
	return mask[nextIndex] ? field[nextIndex] : centerValue;
}

export function fivePointLaplacianAtUnchecked(
	field: Float64Array,
	mask: Uint8Array,
	size: number,
	row: number,
	column: number,
	boundary: BZBoundary,
	spacing: number
): number {
	const index = row * size + column;
	if (!mask[index]) return 0;
	const center = field[index];
	return (
		(neighbourValue(field, mask, size, center, row - 1, column, boundary) +
			neighbourValue(field, mask, size, center, row + 1, column, boundary) +
			neighbourValue(field, mask, size, center, row, column - 1, boundary) +
			neighbourValue(field, mask, size, center, row, column + 1, boundary) -
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
	boundary: BZBoundary,
	spacing: number
): number {
	if (!Number.isInteger(size) || size < 2)
		throw new RangeError('Stencil size must be at least two.');
	if (field.length !== size * size || mask.length !== size * size) {
		throw new RangeError('Stencil arrays do not match the declared square grid.');
	}
	if (
		!Number.isInteger(row) ||
		!Number.isInteger(column) ||
		row < 0 ||
		row >= size ||
		column < 0 ||
		column >= size
	) {
		throw new RangeError('Stencil cell lies outside the grid.');
	}
	if (!(spacing > 0) || !Number.isFinite(spacing)) {
		throw new RangeError('Stencil spacing must be finite and positive.');
	}
	if (boundary !== 'no-flux' && boundary !== 'periodic') {
		throw new RangeError('Stencil boundary is not recognised.');
	}
	return fivePointLaplacianAtUnchecked(field, mask, size, row, column, boundary, spacing);
}

export function fivePointLaplacianInto(
	field: Float64Array,
	mask: Uint8Array,
	size: number,
	boundary: BZBoundary,
	spacing: number,
	output: Float64Array
): void {
	if (output.length !== field.length) throw new RangeError('Laplacian output length is invalid.');
	for (let row = 0; row < size; row += 1) {
		for (let column = 0; column < size; column += 1) {
			const index = row * size + column;
			output[index] = fivePointLaplacianAt(field, mask, size, row, column, boundary, spacing);
		}
	}
}
