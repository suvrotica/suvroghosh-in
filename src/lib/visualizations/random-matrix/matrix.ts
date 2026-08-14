import {
	EigenvalueDecomposition,
	QrDecomposition,
	SingularValueDecomposition,
	wrap,
	type AbstractMatrix
} from 'ml-matrix';
import {
	MAX_NONSYMMETRIC_EVD_DIMENSION,
	MAX_SYMMETRIC_EVD_DIMENSION,
	MAX_MATRIX_DIMENSION,
	MIN_MATRIX_DIMENSION
} from './constants';
import { NON_NORMAL_TRANSIENT_STEPS, validateNonNormalTrap } from './dynamics';
import { createMatrixRandom, type MatrixRandom } from './prng';
import type {
	GeneratedMatrix,
	MatrixRearrangement,
	RandomMatrixState,
	RearrangedMatrix,
	SignalType
} from './types';

export function generateMatrix(state: RandomMatrixState, sampleIndex = 0): GeneratedMatrix {
	validateGenerationState(state, sampleIndex);
	const warnings: string[] = [];
	let generated: GeneratedMatrix;

	switch (state.preset) {
		case 'wigner-moonrise':
		case 'hidden-rank-one-signal':
		case 'same-spectrum-different-face':
			generated = generateWigner(state, sampleIndex);
			break;
		case 'wishart-ridge':
			generated = generateWishart(state, sampleIndex);
			break;
		case 'sparse-galaxy':
			generated = generateSparseGalaxy(state, sampleIndex);
			break;
		case 'non-normal-trap':
			generated = generateNonNormalTrap(state, sampleIndex);
			break;
		case 'circular-cloud':
		case 'universality-test':
			generated = generateIid(state, sampleIndex);
			break;
	}

	let values = generated.values;
	if (state.signalType !== 'none' && state.signalStrength > 0) {
		values = applySignal(
			values,
			generated.rows,
			generated.columns,
			state.signalType,
			state.signalStrength,
			generated.symmetric,
			createMatrixRandom(state, sampleIndex, 'planted-signal')
		);
	}

	if (state.normalization === 'frobenius') {
		const norm = frobeniusNorm(values);
		if (norm > 0) scaleInPlace(values, 1 / norm);
		else
			warnings.push('Frobenius normalization is undefined for the zero matrix; it was left zero.');
	} else if (state.normalization === 'spectral-radius') {
		const radius = exactSpectralRadius(
			values,
			generated.rows,
			generated.columns,
			generated.symmetric
		);
		if (radius > 0 && Number.isFinite(radius)) scaleInPlace(values, 1 / radius);
		else warnings.push('Spectral-radius normalization is undefined for this zero spectrum.');
	}

	let comparison: Float64Array | undefined;
	if (state.preset === 'same-spectrum-different-face') {
		comparison = orthogonalSimilarity(
			values,
			generated.rows,
			createMatrixRandom(state, sampleIndex, 'same-spectrum-basis')
		);
	}

	return {
		rows: generated.rows,
		columns: generated.columns,
		values,
		symmetric: generated.symmetric,
		...(comparison ? { comparison } : {}),
		warnings: [...generated.warnings, ...warnings]
	};
}

function generateIid(state: RandomMatrixState, sampleIndex: number): GeneratedMatrix {
	const n = state.dimension;
	const random = createMatrixRandom(state, sampleIndex, 'iid-entries');
	const values = new Float64Array(n * n);
	const noiseScale = entryNoiseScale(state, n);
	if (state.symmetry === 'symmetric') {
		for (let row = 0; row < n; row += 1) {
			for (let column = row; column < n; column += 1) {
				const value =
					state.mean + noiseScale * sparseStandardized(random, state.distribution, state.sparsity);
				values[row * n + column] = value;
				values[column * n + row] = value;
			}
		}
	} else {
		for (let index = 0; index < values.length; index += 1) {
			values[index] =
				state.mean + noiseScale * sparseStandardized(random, state.distribution, state.sparsity);
		}
	}
	return {
		rows: n,
		columns: n,
		values,
		symmetric: state.symmetry === 'symmetric',
		warnings: sparseRegimeWarnings(state, n)
	};
}

function generateWigner(state: RandomMatrixState, sampleIndex: number): GeneratedMatrix {
	const n = state.dimension;
	const random = createMatrixRandom(state, sampleIndex, 'wigner-entries');
	const values = new Float64Array(n * n);
	const offDiagonalScale = entryNoiseScale(state, n);
	for (let row = 0; row < n; row += 1) {
		for (let column = row; column < n; column += 1) {
			// GOE normalization has twice the variance on the diagonal. Matching
			// this second moment for every supported entry law keeps comparisons fair.
			const diagonalFactor = row === column ? Math.SQRT2 : 1;
			const value =
				state.mean +
				offDiagonalScale *
					diagonalFactor *
					sparseStandardized(random, state.distribution, state.sparsity);
			values[row * n + column] = value;
			values[column * n + row] = value;
		}
	}
	return {
		rows: n,
		columns: n,
		values,
		symmetric: true,
		warnings: sparseRegimeWarnings(state, n)
	};
}

function generateWishart(state: RandomMatrixState, sampleIndex: number): GeneratedMatrix {
	const n = state.dimension;
	const m = Math.max(2, Math.round(n / state.aspectRatio));
	const random = createMatrixRandom(state, sampleIndex, 'wishart-data');
	const data = new Float64Array(n * m);
	const noiseScale = entryNoiseScale(state, n);
	for (let index = 0; index < data.length; index += 1) {
		data[index] =
			state.mean + noiseScale * sparseStandardized(random, state.distribution, state.sparsity);
	}
	const covariance = new Float64Array(n * n);
	for (let row = 0; row < n; row += 1) {
		for (let column = row; column < n; column += 1) {
			let sum = 0;
			const rowOffset = row * m;
			const columnOffset = column * m;
			for (let sample = 0; sample < m; sample += 1) {
				sum += data[rowOffset + sample] * data[columnOffset + sample];
			}
			const value = sum / m;
			covariance[row * n + column] = value;
			covariance[column * n + row] = value;
		}
	}
	return {
		rows: n,
		columns: n,
		values: covariance,
		symmetric: true,
		warnings: sparseRegimeWarnings(state, m, 'data row')
	};
}

function generateSparseGalaxy(state: RandomMatrixState, sampleIndex: number): GeneratedMatrix {
	const n = state.dimension;
	const random = createMatrixRandom(state, sampleIndex, 'sparse-edges');
	const values = new Float64Array(n * n);
	const probability = Math.max(0.005, Math.min(0.995, 1 - state.sparsity));
	const varianceDenominator = Math.sqrt(probability * (1 - probability));
	const dimensionFactor = state.normalization === 'variance-1/n' ? Math.sqrt(n) : 1;
	const denominator = varianceDenominator * dimensionFactor;
	for (let row = 0; row < n; row += 1) {
		for (let column = row + 1; column < n; column += 1) {
			const edge = random.next() < probability ? 1 : 0;
			const value = state.mean + (state.scale * (edge - probability)) / denominator;
			values[row * n + column] = value;
			values[column * n + row] = value;
		}
	}
	return {
		rows: n,
		columns: n,
		values,
		symmetric: true,
		warnings:
			probability * (n - 1) < 3
				? ['The expected degree is below three; dense random-matrix laws need not apply.']
				: []
	};
}

function generateNonNormalTrap(state: RandomMatrixState, sampleIndex: number): GeneratedMatrix {
	const n = state.dimension;
	const random = createMatrixRandom(state, sampleIndex, 'non-normal-perturbation');
	const values = new Float64Array(n * n);
	const perturbationScale = Math.min(0.08, Math.max(1e-4, state.scale * 0.04) / Math.sqrt(n));
	// Keep the non-normal base ensemble independent of the planted-signal
	// amplitude. signalStrength must have one meaning so null comparisons can
	// remove a signal without changing the declared background ensemble.
	for (let row = 0; row < n; row += 1) {
		// Perturb only the upper triangle. The eigenvalues of the *perturbed*
		// matrix are then its perturbed diagonal entries, rather than those of an
		// idealised template that the final dense perturbation no longer respects.
		for (let column = row; column < n; column += 1) {
			values[row * n + column] = perturbationScale * random.standardized(state.distribution);
		}
		const diagonal = 0.66 + (0.08 * row) / Math.max(1, n - 1);
		values[row * n + row] = clamp(values[row * n + row] + diagonal, 0.58, 0.78);
		if (row + 1 < n) {
			values[row * n + row + 1] += row === 0 ? 1.24 : 0.82;
		}
	}
	// The plotted witness is x=e_2, so its orbit stays in the leading 2x2
	// triangular block. Bound the already perturbed coupling to keep its rise
	// visible without delaying the eventual fall beyond the twenty-step plot.
	values[1] = clamp(values[1], 1.18, 1.3);

	let validation = validateNonNormalTrap(values, n, NON_NORMAL_TRANSIENT_STEPS);
	if (!validation.valid) {
		// This deterministic guard is reached only for an extreme perturbation.
		// Repair the three witness-block entries, then test the actual matrix again.
		values[0] = 0.66;
		values[n + 1] = 0.67;
		values[1] = 1.24;
		validation = validateNonNormalTrap(values, n, NON_NORMAL_TRANSIENT_STEPS);
	}
	if (!validation.valid) {
		throw new Error('The non-normal preset could not satisfy its transient-growth contract.');
	}
	return {
		rows: n,
		columns: n,
		values,
		symmetric: false,
		warnings: [
			'This matrix is deliberately non-normal; compare the actual spectral radius with the explicit e₂ trajectory after any global rescaling.'
		]
	};
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function entryNoiseScale(state: RandomMatrixState, dimension: number): number {
	return state.scale * (state.normalization === 'variance-1/n' ? 1 / Math.sqrt(dimension) : 1);
}

function sparseStandardized(
	random: MatrixRandom,
	distribution: RandomMatrixState['distribution'],
	sparsity: number
): number {
	const keepProbability = Math.max(1e-6, Math.min(1, 1 - sparsity));
	// Consume the mask and value draws for every entry. That makes a sparsity
	// slider a comparison of masks over one fixed latent noise realization,
	// rather than silently shifting the rest of the pseudorandom stream.
	const kept = random.next() < keepProbability;
	const value = random.standardized(distribution);
	return kept ? value / Math.sqrt(keepProbability) : 0;
}

function sparseRegimeWarnings(
	state: RandomMatrixState,
	width: number,
	unit = 'matrix row'
): string[] {
	const expectedNonzeros = (1 - state.sparsity) * width;
	return state.sparsity > 0 && expectedNonzeros < 3
		? [
				`The expected nonzero count per ${unit} is below three; dense random-matrix laws need not apply.`
			]
		: [];
}

export function applySignal(
	input: Float64Array,
	rows: number,
	columns: number,
	type: SignalType,
	strength: number,
	symmetric: boolean,
	random: MatrixRandom
): Float64Array {
	const output = input.slice();
	if (type === 'none' || strength === 0) return output;
	if (type === 'unequal-row-variance') {
		const selected = Math.max(1, Math.floor(rows / 5));
		const factor = Math.sqrt(1 + Math.max(0, strength));
		for (let row = 0; row < rows; row += 1) {
			for (let column = 0; column < columns; column += 1) {
				const rowFactor = row < selected ? factor : 1;
				const columnFactor = symmetric && column < selected ? factor : 1;
				output[row * columns + column] *= rowFactor * columnFactor;
			}
		}
		return output;
	}

	const template = new Float64Array(rows * columns);
	switch (type) {
		case 'rank-one': {
			const left = randomUnitVector(rows, random);
			const right = symmetric && rows === columns ? left : randomUnitVector(columns, random);
			for (let row = 0; row < rows; row += 1) {
				for (let column = 0; column < columns; column += 1) {
					template[row * columns + column] = left[row] * right[column];
				}
			}
			break;
		}
		case 'two-block': {
			const norm = Math.sqrt(rows * columns);
			for (let row = 0; row < rows; row += 1) {
				const rowSign = row < rows / 2 ? 1 : -1;
				for (let column = 0; column < columns; column += 1) {
					const columnSign = column < columns / 2 ? 1 : -1;
					template[row * columns + column] = (rowSign * columnSign) / norm;
				}
			}
			break;
		}
		case 'diagonal-band': {
			const width = Math.max(1, Math.min(rows, columns) / 12);
			for (let row = 0; row < rows; row += 1) {
				for (let column = 0; column < columns; column += 1) {
					template[row * columns + column] = Math.exp(-Math.abs(row - column) / width);
				}
			}
			normalizeTemplate(template);
			break;
		}
		case 'toeplitz': {
			for (let row = 0; row < rows; row += 1) {
				for (let column = 0; column < columns; column += 1) {
					template[row * columns + column] = 0.78 ** Math.abs(row - column);
				}
			}
			normalizeTemplate(template);
			break;
		}
		case 'sparse-hubs': {
			const hubs = Math.max(1, Math.floor(rows / 16));
			for (let row = 0; row < rows; row += 1) {
				for (let column = 0; column < columns; column += 1) {
					if (row < hubs || column < hubs) template[row * columns + column] = 1;
				}
			}
			normalizeTemplate(template);
			break;
		}
		case 'repeated-motif': {
			const motif = [1, -0.5, 0.25, -0.75] as const;
			for (let row = 0; row < rows; row += 1) {
				for (let column = 0; column < columns; column += 1) {
					template[row * columns + column] = motif[(row % 2) * 2 + (column % 2)];
				}
			}
			normalizeTemplate(template);
			break;
		}
		case 'nonzero-mean':
			template.fill(1 / Math.sqrt(rows * columns));
			break;
	}
	if (symmetric && rows === columns) {
		symmetrizeInPlace(template, rows);
		normalizeTemplate(template);
	}

	for (let index = 0; index < output.length; index += 1) {
		output[index] += strength * template[index];
	}
	return output;
}

export function applyRearrangement(
	values: Float64Array,
	rows: number,
	columns: number,
	rearrangement: MatrixRearrangement,
	random: MatrixRandom
): RearrangedMatrix {
	if (rearrangement === 'original') {
		return { values: values.slice(), spectrumPreserving: true, label: 'Original order' };
	}
	if (rearrangement === 'entry-shuffle') {
		const shuffled = values.slice();
		random.shuffleInPlace(shuffled);
		return {
			values: shuffled,
			spectrumPreserving: false,
			label: 'Independently shuffled entries; the spectrum is not preserved'
		};
	}
	if (rearrangement === 'row-norm') {
		const indices = Array.from({ length: rows }, (_, index) => index).sort(
			(left, right) =>
				rowSquaredNorm(values, right, columns) - rowSquaredNorm(values, left, columns)
		);
		return {
			values: permuteRows(values, rows, columns, indices),
			spectrumPreserving: false,
			label: 'Rows ordered by norm; the spectrum is not preserved'
		};
	}
	if (rows !== columns) {
		throw new RangeError(`${rearrangement} requires a square matrix.`);
	}
	if (rearrangement === 'orthogonal-similarity') {
		return {
			values: orthogonalSimilarity(values, rows, random),
			spectrumPreserving: true,
			label: 'Orthogonal change of basis QᵀAQ; the spectrum is preserved'
		};
	}

	let indices: number[];
	if (rearrangement === 'spectral-order') {
		indices = spectralOrdering(values, rows);
		return {
			values: jointPermutation(values, rows, indices),
			spectrumPreserving: true,
			label: 'Joint spectral ordering PAPᵀ; the spectrum is preserved'
		};
	}
	indices = Array.from({ length: rows }, (_, index) => index);
	random.shuffleInPlace(indices);
	return {
		values: jointPermutation(values, rows, indices),
		spectrumPreserving: true,
		label: 'Joint row-and-column permutation PAPᵀ; the spectrum is preserved'
	};
}

export function orthogonalSimilarity(
	values: Float64Array,
	dimension: number,
	random: MatrixRandom
): Float64Array {
	const gaussian = new Float64Array(dimension * dimension);
	for (let index = 0; index < gaussian.length; index += 1) gaussian[index] = random.gaussian();
	const qr = new QrDecomposition(wrap(gaussian, { rows: dimension }));
	const q = qr.orthogonalMatrix;
	const matrix = wrap(values, { rows: dimension });
	const transformed = matrixToFlat(q.transpose().mmul(matrix).mmul(q));
	// The two matrix products round corresponding triangular entries in a
	// different order. Restore the exact symmetry promised by QᵀAQ so the
	// symmetric solver and its larger size cap remain applicable.
	if (isExactlySymmetric(values, dimension)) symmetrizeInPlace(transformed, dimension);
	return transformed;
}

export function jointPermutation(
	values: Float64Array,
	dimension: number,
	indices: readonly number[]
): Float64Array {
	if (indices.length !== dimension)
		throw new RangeError('Permutation length must match dimension.');
	const output = new Float64Array(values.length);
	for (let row = 0; row < dimension; row += 1) {
		for (let column = 0; column < dimension; column += 1) {
			output[row * dimension + column] = values[indices[row] * dimension + indices[column]];
		}
	}
	return output;
}

function spectralOrdering(values: Float64Array, dimension: number): number[] {
	if (!isExactlySymmetric(values, dimension)) {
		const decomposition = new SingularValueDecomposition(wrap(values, { rows: dimension }), {
			autoTranspose: true,
			computeLeftSingularVectors: true,
			computeRightSingularVectors: false
		});
		const vector = decomposition.leftSingularVectors;
		let anchor = 0;
		for (let row = 1; row < dimension; row += 1) {
			if (Math.abs(vector.get(row, 0)) > Math.abs(vector.get(anchor, 0))) anchor = row;
		}
		const sign = vector.get(anchor, 0) < 0 ? -1 : 1;
		return Array.from({ length: dimension }, (_, index) => index).sort((left, right) => {
			const difference = sign * (vector.get(left, 0) - vector.get(right, 0));
			return difference || left - right;
		});
	}
	const decomposition = new EigenvalueDecomposition(wrap(values, { rows: dimension }), {
		assumeSymmetric: true
	});
	const eigenvalues = decomposition.realEigenvalues;
	let selected = 0;
	for (let index = 1; index < eigenvalues.length; index += 1) {
		if (Math.abs(eigenvalues[index]) > Math.abs(eigenvalues[selected])) selected = index;
	}
	const vectors = decomposition.eigenvectorMatrix;
	let anchor = 0;
	for (let row = 1; row < dimension; row += 1) {
		if (Math.abs(vectors.get(row, selected)) > Math.abs(vectors.get(anchor, selected))) {
			anchor = row;
		}
	}
	const sign = vectors.get(anchor, selected) < 0 ? -1 : 1;
	return Array.from({ length: dimension }, (_, index) => index).sort((left, right) => {
		const difference = sign * (vectors.get(left, selected) - vectors.get(right, selected));
		return difference || left - right;
	});
}

function exactSpectralRadius(
	values: Float64Array,
	rows: number,
	columns: number,
	symmetric: boolean
): number {
	if (rows !== columns)
		throw new RangeError('Spectral-radius normalization requires a square matrix.');
	const cap = symmetric ? MAX_SYMMETRIC_EVD_DIMENSION : MAX_NONSYMMETRIC_EVD_DIMENSION;
	if (rows > cap) {
		throw new RangeError(
			`Spectral-radius normalization is capped at n=${cap} for this matrix class.`
		);
	}
	const decomposition = new EigenvalueDecomposition(wrap(values, { rows }), {
		assumeSymmetric: symmetric
	});
	const real = decomposition.realEigenvalues;
	const imaginary = decomposition.imaginaryEigenvalues;
	let radius = 0;
	for (let index = 0; index < real.length; index += 1) {
		radius = Math.max(radius, Math.hypot(real[index], imaginary[index]));
	}
	return radius;
}

function randomUnitVector(length: number, random: MatrixRandom): Float64Array {
	const vector = new Float64Array(length);
	let normSquared = 0;
	for (let index = 0; index < length; index += 1) {
		vector[index] = random.gaussian();
		normSquared += vector[index] ** 2;
	}
	const inverseNorm = 1 / Math.sqrt(normSquared || 1);
	for (let index = 0; index < length; index += 1) vector[index] *= inverseNorm;
	return vector;
}

function normalizeTemplate(template: Float64Array): void {
	const norm = frobeniusNorm(template);
	if (norm > 0) scaleInPlace(template, 1 / norm);
}

function symmetrizeInPlace(values: Float64Array, dimension: number): void {
	for (let row = 0; row < dimension; row += 1) {
		for (let column = row + 1; column < dimension; column += 1) {
			const mean = (values[row * dimension + column] + values[column * dimension + row]) / 2;
			values[row * dimension + column] = mean;
			values[column * dimension + row] = mean;
		}
	}
}

export function isExactlySymmetric(values: Float64Array, dimension: number): boolean {
	if (values.length !== dimension * dimension) return false;
	for (let row = 0; row < dimension; row += 1) {
		for (let column = 0; column < row; column += 1) {
			if (values[row * dimension + column] !== values[column * dimension + row]) return false;
		}
	}
	return true;
}

export function frobeniusNorm(values: ArrayLike<number>): number {
	let scale = 0;
	let sumSquares = 1;
	for (let index = 0; index < values.length; index += 1) {
		const absolute = Math.abs(values[index]);
		if (absolute === 0) continue;
		if (scale < absolute) {
			sumSquares = 1 + sumSquares * (scale / absolute) ** 2;
			scale = absolute;
		} else {
			sumSquares += (absolute / scale) ** 2;
		}
	}
	return scale === 0 ? 0 : scale * Math.sqrt(sumSquares);
}

export function matrixToFlat(matrix: AbstractMatrix): Float64Array {
	const output = new Float64Array(matrix.rows * matrix.columns);
	for (let row = 0; row < matrix.rows; row += 1) {
		for (let column = 0; column < matrix.columns; column += 1) {
			output[row * matrix.columns + column] = matrix.get(row, column);
		}
	}
	return output;
}

function scaleInPlace(values: Float64Array, factor: number): void {
	for (let index = 0; index < values.length; index += 1) values[index] *= factor;
}

function rowSquaredNorm(values: Float64Array, row: number, columns: number): number {
	let sum = 0;
	for (let column = 0; column < columns; column += 1) {
		sum += values[row * columns + column] ** 2;
	}
	return sum;
}

function permuteRows(
	values: Float64Array,
	rows: number,
	columns: number,
	indices: readonly number[]
): Float64Array {
	const output = new Float64Array(rows * columns);
	for (let row = 0; row < rows; row += 1) {
		output.set(
			values.subarray(indices[row] * columns, (indices[row] + 1) * columns),
			row * columns
		);
	}
	return output;
}

function validateGenerationState(state: RandomMatrixState, sampleIndex: number): void {
	if (
		!Number.isInteger(state.dimension) ||
		state.dimension < MIN_MATRIX_DIMENSION ||
		state.dimension > MAX_MATRIX_DIMENSION
	) {
		throw new RangeError(
			`Matrix dimension must be an integer from ${MIN_MATRIX_DIMENSION} to ${MAX_MATRIX_DIMENSION}.`
		);
	}
	if (!Number.isSafeInteger(sampleIndex) || sampleIndex < 0) {
		throw new RangeError('Sample index must be a non-negative safe integer.');
	}
	for (const [label, value] of [
		['aspect ratio', state.aspectRatio],
		['mean', state.mean],
		['scale', state.scale],
		['sparsity', state.sparsity],
		['signal strength', state.signalStrength]
	] as const) {
		if (!Number.isFinite(value)) throw new RangeError(`Matrix ${label} must be finite.`);
	}
	if (state.aspectRatio <= 0) throw new RangeError('Aspect ratio must be positive.');
	if (state.scale < 0) throw new RangeError('Scale must be non-negative.');
}
