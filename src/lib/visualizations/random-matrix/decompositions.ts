import { EigenvalueDecomposition, SingularValueDecomposition, wrap } from 'ml-matrix';
import {
	MAX_NONSYMMETRIC_EVD_DIMENSION,
	MAX_SVD_DIMENSION,
	MAX_SYMMETRIC_EVD_DIMENSION
} from './constants';
import { frobeniusNorm, matrixToFlat } from './matrix';
import type { EigenAnalysis, SingularAnalysis } from './types';

export interface EigenAnalysisOptions {
	symmetric: boolean;
	includeVectors?: boolean;
}

export interface SingularAnalysisOptions {
	includeVectors?: boolean;
	reconstructionRank?: number;
}

export function computeEigenAnalysis(
	values: Float64Array,
	rows: number,
	columns: number,
	options: EigenAnalysisOptions
): EigenAnalysis {
	if (rows !== columns) throw new RangeError('Eigenvalue decomposition requires a square matrix.');
	const cap = options.symmetric ? MAX_SYMMETRIC_EVD_DIMENSION : MAX_NONSYMMETRIC_EVD_DIMENSION;
	if (rows > cap) {
		throw new RangeError(
			`${options.symmetric ? 'Symmetric' : 'Nonsymmetric'} eigendecomposition is capped at n=${cap}.`
		);
	}
	validateFiniteMatrix(values, rows, columns);
	const matrix = wrap(values, { rows });
	const decomposition = new EigenvalueDecomposition(matrix, {
		assumeSymmetric: options.symmetric
	});
	const real = Float64Array.from(decomposition.realEigenvalues);
	const imaginary = Float64Array.from(decomposition.imaginaryEigenvalues);
	const vectors = decomposition.eigenvectorMatrix;
	const residual = relativeDecompositionResidual(
		values,
		rows,
		columns,
		matrixToFlat(vectors),
		vectors.columns,
		matrixToFlat(decomposition.diagonalMatrix),
		decomposition.diagonalMatrix.columns
	);
	const pairResiduals = eigenpairResiduals(values, rows, real, imaginary, vectors);
	const ipr = eigenvectorInverseParticipationRatios(real, imaginary, vectors);

	return {
		real,
		imaginary,
		...(options.includeVectors ? { vectors: matrixToFlat(vectors) } : {}),
		residual,
		maxPairResidual: pairResiduals.reduce((maximum, value) => Math.max(maximum, value), 0),
		ipr
	};
}

export function computeSingularAnalysis(
	values: Float64Array,
	rows: number,
	columns: number,
	options: SingularAnalysisOptions = {}
): SingularAnalysis {
	if (Math.max(rows, columns) > MAX_SVD_DIMENSION) {
		throw new RangeError(
			`Full singular-value decomposition is capped at dimension ${MAX_SVD_DIMENSION}.`
		);
	}
	if (options.reconstructionRank !== undefined && !Number.isFinite(options.reconstructionRank)) {
		throw new RangeError('Reconstruction rank must be finite.');
	}
	validateFiniteMatrix(values, rows, columns);
	const decomposition = new SingularValueDecomposition(wrap(values, { rows }), {
		autoTranspose: true,
		computeLeftSingularVectors: true,
		computeRightSingularVectors: true
	});
	const singularValues = Float64Array.from(decomposition.diagonal);
	const componentCount = Math.min(rows, columns, singularValues.length);
	const u = thinMatrix(decomposition.leftSingularVectors, componentCount);
	const v = thinMatrix(decomposition.rightSingularVectors, componentCount);
	const tolerance = Math.max(rows, columns) * (singularValues[0] ?? 0) * Number.EPSILON;
	let rank = 0;
	for (const singularValue of singularValues) if (singularValue > tolerance) rank += 1;
	const smallest = singularValues[componentCount - 1] ?? 0;
	const condition =
		rank === componentCount && smallest > tolerance && singularValues[0] > 0
			? singularValues[0] / smallest
			: null;
	const fullReconstruction = reconstructFromThinSvd(
		u,
		v,
		singularValues,
		rows,
		columns,
		componentCount
	);
	const matrixNorm = frobeniusNorm(values);
	const residual =
		frobeniusDifference(values, fullReconstruction) / Math.max(matrixNorm, Number.MIN_VALUE);
	const cumulativeEnergy = cumulativeSingularEnergy(singularValues);

	let reconstruction: Float64Array | undefined;
	let reconstructionRank: number | undefined;
	let reconstructionError: number | undefined;
	if (options.reconstructionRank !== undefined) {
		reconstructionRank = Math.max(
			0,
			Math.min(componentCount, Math.round(options.reconstructionRank))
		);
		reconstruction = reconstructFromThinSvd(
			u,
			v,
			singularValues,
			rows,
			columns,
			reconstructionRank
		);
		reconstructionError =
			frobeniusDifference(values, reconstruction) / Math.max(matrixNorm, Number.MIN_VALUE);
	}

	return {
		values: singularValues,
		...(options.includeVectors || options.reconstructionRank !== undefined ? { u, v } : {}),
		rank,
		tolerance,
		condition,
		residual,
		cumulativeEnergy,
		...(reconstruction ? { reconstruction } : {}),
		...(reconstructionRank !== undefined ? { reconstructionRank } : {}),
		...(reconstructionError !== undefined ? { reconstructionError } : {})
	};
}

export function lowRankReconstruction(
	values: Float64Array,
	rows: number,
	columns: number,
	rank: number
): { matrix: Float64Array; rank: number; relativeError: number } {
	const analysis = computeSingularAnalysis(values, rows, columns, { reconstructionRank: rank });
	if (!analysis.reconstruction || analysis.reconstructionRank === undefined) {
		throw new Error('The requested low-rank reconstruction was not produced.');
	}
	return {
		matrix: analysis.reconstruction,
		rank: analysis.reconstructionRank,
		relativeError: analysis.reconstructionError ?? 0
	};
}

export function eigenvalueMatchDistance(left: EigenAnalysis, right: EigenAnalysis): number {
	if (left.real.length !== right.real.length) return Number.POSITIVE_INFINITY;
	const unmatched = Array.from({ length: right.real.length }, (_, index) => index);
	let maximum = 0;
	for (let leftIndex = 0; leftIndex < left.real.length; leftIndex += 1) {
		let selectedPosition = 0;
		let selectedDistance = Number.POSITIVE_INFINITY;
		for (let position = 0; position < unmatched.length; position += 1) {
			const rightIndex = unmatched[position];
			const distance = Math.hypot(
				left.real[leftIndex] - right.real[rightIndex],
				left.imaginary[leftIndex] - right.imaginary[rightIndex]
			);
			if (distance < selectedDistance) {
				selectedDistance = distance;
				selectedPosition = position;
			}
		}
		unmatched.splice(selectedPosition, 1);
		maximum = Math.max(maximum, selectedDistance);
	}
	return maximum;
}

function thinMatrix(
	matrix: { rows: number; columns: number; get(row: number, column: number): number },
	columns: number
): Float64Array {
	const width = Math.min(columns, matrix.columns);
	const output = new Float64Array(matrix.rows * width);
	for (let row = 0; row < matrix.rows; row += 1) {
		for (let column = 0; column < width; column += 1) {
			output[row * width + column] = matrix.get(row, column);
		}
	}
	return output;
}

function reconstructFromThinSvd(
	u: Float64Array,
	v: Float64Array,
	singularValues: Float64Array,
	rows: number,
	columns: number,
	rank: number
): Float64Array {
	const componentCount = Math.min(rows, columns, singularValues.length);
	const boundedRank = Math.min(componentCount, Math.max(0, rank));
	const output = new Float64Array(rows * columns);
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			let sum = 0;
			for (let component = 0; component < boundedRank; component += 1) {
				sum +=
					u[row * componentCount + component] *
					singularValues[component] *
					v[column * componentCount + component];
			}
			output[row * columns + column] = sum;
		}
	}
	return output;
}

function cumulativeSingularEnergy(values: Float64Array): Float64Array {
	const output = new Float64Array(values.length);
	let total = 0;
	for (const value of values) total += value * value;
	let cumulative = 0;
	for (let index = 0; index < values.length; index += 1) {
		cumulative += values[index] * values[index];
		output[index] = total > 0 ? cumulative / total : 0;
	}
	return output;
}

function relativeDecompositionResidual(
	a: Float64Array,
	aRows: number,
	aColumns: number,
	v: Float64Array,
	vColumns: number,
	d: Float64Array,
	dColumns: number
): number {
	const left = multiply(a, aRows, aColumns, v, vColumns);
	const right = multiply(v, aRows, vColumns, d, dColumns);
	const denominator = frobeniusNorm(a) * frobeniusNorm(v);
	return frobeniusDifference(left, right) / Math.max(denominator, Number.MIN_VALUE);
}

function eigenpairResiduals(
	a: Float64Array,
	dimension: number,
	real: Float64Array,
	imaginary: Float64Array,
	vectors: { get(row: number, column: number): number }
): Float64Array {
	const output = new Float64Array(dimension);
	const matrixNorm = frobeniusNorm(a);
	for (let index = 0; index < dimension; index += 1) {
		if (imaginary[index] < 0) {
			output[index] = output[index - 1];
			continue;
		}
		if (imaginary[index] === 0) {
			let residualSquared = 0;
			let vectorSquared = 0;
			for (let row = 0; row < dimension; row += 1) {
				let transformed = 0;
				for (let column = 0; column < dimension; column += 1) {
					transformed += a[row * dimension + column] * vectors.get(column, index);
				}
				const value = vectors.get(row, index);
				residualSquared += (transformed - real[index] * value) ** 2;
				vectorSquared += value * value;
			}
			output[index] =
				Math.sqrt(residualSquared) /
				Math.max((matrixNorm + Math.abs(real[index])) * Math.sqrt(vectorSquared), Number.MIN_VALUE);
			continue;
		}

		const next = index + 1;
		let residualSquared = 0;
		let vectorSquared = 0;
		for (let row = 0; row < dimension; row += 1) {
			let transformedReal = 0;
			let transformedImaginary = 0;
			for (let column = 0; column < dimension; column += 1) {
				transformedReal += a[row * dimension + column] * vectors.get(column, index);
				transformedImaginary += a[row * dimension + column] * vectors.get(column, next);
			}
			const vectorReal = vectors.get(row, index);
			const vectorImaginary = vectors.get(row, next);
			const expectedReal = real[index] * vectorReal - imaginary[index] * vectorImaginary;
			const expectedImaginary = imaginary[index] * vectorReal + real[index] * vectorImaginary;
			residualSquared +=
				(transformedReal - expectedReal) ** 2 + (transformedImaginary - expectedImaginary) ** 2;
			vectorSquared += vectorReal ** 2 + vectorImaginary ** 2;
		}
		const residual =
			Math.sqrt(residualSquared) /
			Math.max(
				(matrixNorm + Math.hypot(real[index], imaginary[index])) * Math.sqrt(vectorSquared),
				Number.MIN_VALUE
			);
		output[index] = residual;
		if (next < dimension) output[next] = residual;
		index += 1;
	}
	return output;
}

function eigenvectorInverseParticipationRatios(
	real: Float64Array,
	imaginary: Float64Array,
	vectors: { get(row: number, column: number): number }
): Float64Array {
	const dimension = real.length;
	const output = new Float64Array(dimension);
	for (let column = 0; column < dimension; column += 1) {
		if (imaginary[column] < 0) {
			output[column] = output[column - 1];
			continue;
		}
		const complex = imaginary[column] > 0 && column + 1 < dimension;
		let normSquared = 0;
		let fourthMoment = 0;
		for (let row = 0; row < dimension; row += 1) {
			const realPart = vectors.get(row, column);
			const imaginaryPart = complex ? vectors.get(row, column + 1) : 0;
			const magnitudeSquared = realPart ** 2 + imaginaryPart ** 2;
			normSquared += magnitudeSquared;
			fourthMoment += magnitudeSquared ** 2;
		}
		const value = normSquared > 0 ? fourthMoment / normSquared ** 2 : 0;
		output[column] = value;
		if (complex) {
			output[column + 1] = value;
			column += 1;
		}
	}
	return output;
}

function multiply(
	left: Float64Array,
	leftRows: number,
	leftColumns: number,
	right: Float64Array,
	rightColumns: number
): Float64Array {
	if (right.length !== leftColumns * rightColumns) {
		throw new RangeError('Matrix multiplication dimensions do not agree.');
	}
	const output = new Float64Array(leftRows * rightColumns);
	for (let row = 0; row < leftRows; row += 1) {
		for (let inner = 0; inner < leftColumns; inner += 1) {
			const value = left[row * leftColumns + inner];
			for (let column = 0; column < rightColumns; column += 1) {
				output[row * rightColumns + column] += value * right[inner * rightColumns + column];
			}
		}
	}
	return output;
}

function frobeniusDifference(left: Float64Array, right: Float64Array): number {
	if (left.length !== right.length) throw new RangeError('Matrix lengths do not agree.');
	const difference = new Float64Array(left.length);
	for (let index = 0; index < left.length; index += 1)
		difference[index] = left[index] - right[index];
	return frobeniusNorm(difference);
}

function validateFiniteMatrix(values: Float64Array, rows: number, columns: number): void {
	if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(columns) || rows < 1 || columns < 1) {
		throw new RangeError('Matrix dimensions must be positive integers.');
	}
	if (values.length !== rows * columns) throw new RangeError('Matrix storage length is invalid.');
	for (const value of values) {
		if (!Number.isFinite(value)) throw new RangeError('Matrix entries must be finite.');
	}
}
