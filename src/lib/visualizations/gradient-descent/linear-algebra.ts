import type { Matrix2, Vector2 } from './types';

export const ZERO_VECTOR: Vector2 = [0, 0];

export function vector(x: number, y: number): Vector2 {
	return [x, y];
}

export function add(left: Vector2, right: Vector2): Vector2 {
	return [left[0] + right[0], left[1] + right[1]];
}

export function subtract(left: Vector2, right: Vector2): Vector2 {
	return [left[0] - right[0], left[1] - right[1]];
}

export function scale(value: Vector2, scalar: number): Vector2 {
	return [value[0] * scalar, value[1] * scalar];
}

export function multiplyElements(left: Vector2, right: Vector2): Vector2 {
	return [left[0] * right[0], left[1] * right[1]];
}

export function divideElements(left: Vector2, right: Vector2): Vector2 {
	return [left[0] / right[0], left[1] / right[1]];
}

export function dot(left: Vector2, right: Vector2): number {
	return left[0] * right[0] + left[1] * right[1];
}

export function normSquared(value: Vector2): number {
	return dot(value, value);
}

export function norm(value: Vector2): number {
	return Math.hypot(value[0], value[1]);
}

export function distance(left: Vector2, right: Vector2): number {
	return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

export function normalize(value: Vector2, fallback: Vector2 = [1, 0]): Vector2 {
	const magnitude = norm(value);
	return magnitude > 0 && Number.isFinite(magnitude) ? scale(value, 1 / magnitude) : fallback;
}

export function matrixVector(matrix: Matrix2, value: Vector2): Vector2 {
	return [
		matrix[0][0] * value[0] + matrix[0][1] * value[1],
		matrix[1][0] * value[0] + matrix[1][1] * value[1]
	];
}

export function quadraticForm(value: Vector2, matrix: Matrix2): number {
	return dot(value, matrixVector(matrix, value));
}

export function isFiniteVector(value: Vector2): boolean {
	return Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

export function isFiniteMatrix(value: Matrix2): boolean {
	return value.every((row) => row.every(Number.isFinite));
}

export function assertFiniteVector(value: Vector2, label = 'vector'): void {
	if (!isFiniteVector(value)) throw new RangeError(`${label} must contain only finite numbers.`);
}

export function assertFiniteMatrix(value: Matrix2, label = 'matrix'): void {
	if (!isFiniteMatrix(value)) throw new RangeError(`${label} must contain only finite numbers.`);
}

export function finiteDifferenceGradient(
	value: (theta: Vector2) => number,
	theta: Vector2,
	relativeStep = Math.cbrt(Number.EPSILON)
): Vector2 {
	assertFiniteVector(theta, 'theta');
	if (!(relativeStep > 0) || !Number.isFinite(relativeStep)) {
		throw new RangeError('relativeStep must be a finite positive number.');
	}

	const derivative = (axis: 0 | 1) => {
		const step = relativeStep * Math.max(1, Math.abs(theta[axis]));
		const before: Vector2 = axis === 0 ? [theta[0] - step, theta[1]] : [theta[0], theta[1] - step];
		const after: Vector2 = axis === 0 ? [theta[0] + step, theta[1]] : [theta[0], theta[1] + step];
		return (value(after) - value(before)) / (2 * step);
	};

	return [derivative(0), derivative(1)];
}

/**
 * Differentiates an analytic gradient with a scale-aware central stencil. The
 * two independently estimated mixed partials are averaged before returning.
 */
export function finiteDifferenceHessian(
	gradient: (theta: Vector2) => Vector2,
	theta: Vector2,
	relativeStep = Math.cbrt(Number.EPSILON)
): Matrix2 {
	assertFiniteVector(theta, 'theta');
	if (!(relativeStep > 0) || !Number.isFinite(relativeStep)) {
		throw new RangeError('relativeStep must be a finite positive number.');
	}

	const columns: [Vector2, Vector2] = [0, 1].map((axisNumber) => {
		const axis = axisNumber as 0 | 1;
		const step = relativeStep * Math.max(1, Math.abs(theta[axis]));
		const before: Vector2 = axis === 0 ? [theta[0] - step, theta[1]] : [theta[0], theta[1] - step];
		const after: Vector2 = axis === 0 ? [theta[0] + step, theta[1]] : [theta[0], theta[1] + step];
		const beforeGradient = gradient(before);
		const afterGradient = gradient(after);
		return [
			(afterGradient[0] - beforeGradient[0]) / (2 * step),
			(afterGradient[1] - beforeGradient[1]) / (2 * step)
		] as Vector2;
	}) as [Vector2, Vector2];

	const mixed = (columns[1][0] + columns[0][1]) / 2;
	return [
		[columns[0][0], mixed],
		[mixed, columns[1][1]]
	];
}

export type SymmetricEigenDecomposition = {
	/** Eigenvalues in descending order. */
	readonly values: readonly [maximum: number, minimum: number];
	/** Matching orthonormal eigenvectors. */
	readonly vectors: readonly [maximum: Vector2, minimum: Vector2];
};

export function symmetricEigenDecomposition(matrix: Matrix2): SymmetricEigenDecomposition {
	assertFiniteMatrix(matrix);
	const a = matrix[0][0];
	const b = (matrix[0][1] + matrix[1][0]) / 2;
	const d = matrix[1][1];
	const midpoint = (a + d) / 2;
	const radius = Math.hypot((a - d) / 2, b);
	let maximum = midpoint + radius;
	let minimum = midpoint - radius;
	// Recover the smaller-magnitude root through the determinant. This avoids
	// losing it when midpoint and radius nearly cancel at extreme condition numbers.
	const determinant = a * d - b * b;
	if (Math.abs(maximum) >= Math.abs(minimum) && maximum !== 0) minimum = determinant / maximum;
	else if (minimum !== 0) maximum = determinant / minimum;

	let maximumVector: Vector2;
	if (radius === 0) {
		maximumVector = [1, 0];
	} else {
		// The half-angle form avoids subtracting nearly equal eigenvalues and
		// diagonal entries, and correctly selects y for diag(a,d) when d > a.
		const angle = 0.5 * Math.atan2(2 * b, a - d);
		maximumVector = [Math.cos(angle), Math.sin(angle)];
	}
	const minimumVector: Vector2 = [-maximumVector[1], maximumVector[0]];

	return { values: [maximum, minimum], vectors: [maximumVector, minimumVector] };
}

export function reconstructSymmetricMatrix(decomposition: SymmetricEigenDecomposition): Matrix2 {
	const [maximum, minimum] = decomposition.values;
	const [first, second] = decomposition.vectors;
	const m00 = maximum * first[0] ** 2 + minimum * second[0] ** 2;
	const m01 = maximum * first[0] * first[1] + minimum * second[0] * second[1];
	const m11 = maximum * first[1] ** 2 + minimum * second[1] ** 2;
	return [
		[m00, m01],
		[m01, m11]
	];
}

/**
 * Return the unsigned angle in radians, or null when either vector has no direction.
 * A zero vector is not parallel to anything: assigning it an angle of zero would be misleading.
 */
export function angleBetween(left: Vector2, right: Vector2): number | null {
	const leftNorm = norm(left);
	const rightNorm = norm(right);
	if (leftNorm === 0 || rightNorm === 0) return null;
	const cosine = Math.max(
		-1,
		Math.min(
			1,
			(left[0] / leftNorm) * (right[0] / rightNorm) + (left[1] / leftNorm) * (right[1] / rightNorm)
		)
	);
	return Math.acos(cosine);
}

export function pointInDomain(point: Vector2, domain: { min: Vector2; max: Vector2 }): boolean {
	return (
		point[0] >= domain.min[0] &&
		point[0] <= domain.max[0] &&
		point[1] >= domain.min[1] &&
		point[1] <= domain.max[1]
	);
}
