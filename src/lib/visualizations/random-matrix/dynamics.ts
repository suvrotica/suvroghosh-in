export const NON_NORMAL_TRANSIENT_STEPS = 20;

export interface MatrixPowerTrajectoryPoint {
	step: number;
	x: number;
	y: number;
	/** Gain in this multiplication, before the direction is normalised again. */
	gain: number;
	/** log(||A^k x|| / ||x||), accumulated without overflowing. */
	logMagnitude: number;
	/** ||A^k x|| / ||x||, when representable as a finite double. */
	magnitude: number;
}

export interface NonNormalTrapValidation {
	/** Exact for the checked upper-triangular matrix: max_i |a_ii|. */
	spectralRadius: number;
	/** A rigorous lower bound for sigma_1(A), namely ||Ax|| for the unit witness x. */
	largestSingularValueLowerBound: number;
	peakStep: number;
	peakMagnitude: number;
	finalMagnitude: number;
	upperTriangular: boolean;
	stable: boolean;
	initiallyAmplifies: boolean;
	decaysWithinHorizon: boolean;
	valid: boolean;
	trajectory: readonly MatrixPowerTrajectoryPoint[];
}

/** The trap's explicit witness is x=e_2 (or e_1 for a one-dimensional fallback). */
export function nonNormalTrapWitness(dimension: number): Float64Array {
	if (!Number.isInteger(dimension) || dimension < 1) {
		throw new RangeError('A transient-growth witness requires a positive integer dimension.');
	}
	const witness = new Float64Array(dimension);
	witness[Math.min(1, dimension - 1)] = 1;
	return witness;
}

/**
 * Follow A^k x while normalising after each multiplication. The normalised
 * direction is retained for plotting; the accumulated magnitude remains the
 * actual ||A^k x|| / ||x||.
 */
export function matrixPowerTrajectory(
	values: Float64Array,
	dimension: number,
	initialVector: Float64Array,
	steps: number
): readonly MatrixPowerTrajectoryPoint[] {
	if (!Number.isInteger(dimension) || dimension < 1 || values.length !== dimension * dimension) {
		throw new RangeError('A square matrix with the declared dimension is required.');
	}
	if (initialVector.length !== dimension) {
		throw new RangeError('The initial vector length must match the matrix dimension.');
	}
	if (!Number.isInteger(steps) || steps < 0) {
		throw new RangeError('Trajectory steps must be a non-negative integer.');
	}

	let vector = initialVector.slice();
	let norm = stableEuclideanNorm(vector);
	if (!(norm > 0) || !Number.isFinite(norm)) {
		throw new RangeError('The initial vector must have a finite, non-zero norm.');
	}
	for (let index = 0; index < vector.length; index += 1) vector[index] /= norm;

	let logMagnitude = 0;
	const output: MatrixPowerTrajectoryPoint[] = [
		{
			step: 0,
			x: vector[0] ?? 0,
			y: vector[1] ?? 0,
			gain: 1,
			logMagnitude,
			magnitude: 1
		}
	];

	for (let step = 1; step <= steps; step += 1) {
		const next = new Float64Array(dimension);
		for (let row = 0; row < dimension; row += 1) {
			let sum = 0;
			const offset = row * dimension;
			for (let column = 0; column < dimension; column += 1) {
				sum += values[offset + column] * vector[column];
			}
			next[row] = sum;
		}

		norm = stableEuclideanNorm(next);
		if (!(norm > 0) || !Number.isFinite(norm)) {
			output.push({
				step,
				x: 0,
				y: 0,
				gain: 0,
				logMagnitude: Number.NEGATIVE_INFINITY,
				magnitude: 0
			});
			break;
		}

		logMagnitude += Math.log(norm);
		for (let index = 0; index < dimension; index += 1) next[index] /= norm;
		vector = next;
		output.push({
			step,
			x: vector[0] ?? 0,
			y: vector[1] ?? 0,
			gain: norm,
			logMagnitude,
			magnitude: finiteExponential(logMagnitude)
		});
	}

	return output;
}

/**
 * Check the actual, already perturbed matrix used by the preset. Upper
 * triangularity makes the measured diagonal maximum the exact spectral
 * radius, while the explicit trajectory proves sigma_1(A) >= ||Ax|| > 1.
 */
export function validateNonNormalTrap(
	values: Float64Array,
	dimension: number,
	steps = NON_NORMAL_TRANSIENT_STEPS
): NonNormalTrapValidation {
	const trajectory = matrixPowerTrajectory(
		values,
		dimension,
		nonNormalTrapWitness(dimension),
		steps
	);
	let upperTriangular = true;
	let spectralRadius = 0;
	for (let row = 0; row < dimension; row += 1) {
		spectralRadius = Math.max(spectralRadius, Math.abs(values[row * dimension + row]));
		for (let column = 0; column < row; column += 1) {
			if (values[row * dimension + column] !== 0) upperTriangular = false;
		}
	}

	let peak = trajectory[0];
	for (const point of trajectory) {
		if (point.logMagnitude > peak.logMagnitude) peak = point;
	}
	const first = trajectory[1] ?? trajectory[0];
	const final = trajectory[trajectory.length - 1];
	const stable = upperTriangular && spectralRadius < 1;
	const initiallyAmplifies = first.logMagnitude > 0;
	const decaysWithinHorizon =
		peak.step > 0 &&
		peak.step < final.step &&
		final.logMagnitude < 0 &&
		final.logMagnitude < peak.logMagnitude;
	const largestSingularValueLowerBound = first.gain;

	return {
		spectralRadius,
		largestSingularValueLowerBound,
		peakStep: peak.step,
		peakMagnitude: peak.magnitude,
		finalMagnitude: final.magnitude,
		upperTriangular,
		stable,
		initiallyAmplifies,
		decaysWithinHorizon,
		valid:
			stable && largestSingularValueLowerBound > 1 && initiallyAmplifies && decaysWithinHorizon,
		trajectory
	};
}

function stableEuclideanNorm(values: Float64Array): number {
	let scale = 0;
	let sumSquares = 1;
	for (const value of values) {
		const absolute = Math.abs(value);
		if (absolute === 0) continue;
		if (!Number.isFinite(absolute)) return absolute;
		if (scale < absolute) {
			sumSquares = 1 + sumSquares * (scale / absolute) ** 2;
			scale = absolute;
		} else {
			sumSquares += (absolute / scale) ** 2;
		}
	}
	return scale === 0 ? 0 : scale * Math.sqrt(sumSquares);
}

function finiteExponential(value: number): number {
	if (value === Number.NEGATIVE_INFINITY) return 0;
	if (value >= Math.log(Number.MAX_VALUE)) return Number.MAX_VALUE;
	if (value <= Math.log(Number.MIN_VALUE)) return 0;
	return Math.exp(value);
}
