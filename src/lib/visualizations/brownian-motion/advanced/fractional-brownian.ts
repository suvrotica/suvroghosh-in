import type { Seed } from '$lib/utils/seeded-random';
import { GaussianSampler } from '../gaussian';
import { LabelledRandomStreams } from '../rng';
import { fftInPlace, nextPowerOfTwo } from './fft';

export const FRACTIONAL_BROWNIAN_LIMITS = {
	maxPointCount: 131_073,
	maxTrajectoryCount: 256,
	maxStoredPointCount: 8_388_608
} as const;

/**
 * Round-off tolerance used for Davies–Harte circulant eigenvalues. The bound is
 * `512 * EPSILON * (1 + log2(m)) * max(|lambda|)` for embedding length m.
 * Only negative values inside that scale-aware floating-point envelope are
 * clamped to zero; a more negative value rejects the embedding instead of
 * silently changing its covariance.
 */
export const DAVIES_HARTE_EIGENVALUE_EPSILON_FACTOR = 512;

export interface FractionalBrownianOptions {
	seed: Seed;
	hurst: number;
	scale: number;
	duration: number;
	pointCount: number;
	trajectoryCount: number;
	originX?: number;
	originY?: number;
}

export interface ValidatedFractionalBrownianOptions {
	seed: Seed;
	hurst: number;
	scale: number;
	duration: number;
	pointCount: number;
	trajectoryCount: number;
	originX: number;
	originY: number;
}

export interface DaviesHarteEmbedding {
	incrementCount: number;
	paddedIncrementCount: number;
	embeddingLength: number;
	hurst: number;
	eigenvalues: Float64Array;
	eigenvalueTolerance: number;
	clampedEigenvalueCount: number;
}

export interface FractionalBrownianPaths {
	seed: Seed;
	hurst: number;
	scale: number;
	duration: number;
	pointCount: number;
	trajectoryCount: number;
	times: Float64Array;
	/** Trajectory-major coordinates: offset = trajectory * pointCount + point. */
	x: Float64Array;
	/** Trajectory-major coordinates: offset = trajectory * pointCount + point. */
	y: Float64Array;
	clampedEigenvalueCount: number;
	eigenvalueTolerance: number;
}

export function fractionalGaussianNoiseAutocovariance(lag: number, hurst: number): number {
	validateHurst(hurst);
	if (!Number.isSafeInteger(lag)) {
		throw new RangeError('A fractional Gaussian noise lag must be an integer.');
	}
	const absoluteLag = Math.abs(lag);
	const exponent = 2 * hurst;
	return (
		0.5 *
		(Math.abs(absoluteLag - 1) ** exponent -
			2 * absoluteLag ** exponent +
			(absoluteLag + 1) ** exponent)
	);
}

/** Prepare the exact Davies–Harte embedding used for every path in an ensemble. */
export function prepareDaviesHarte(incrementCount: number, hurst: number): DaviesHarteEmbedding {
	if (!Number.isSafeInteger(incrementCount) || incrementCount < 1) {
		throw new RangeError('Davies–Harte requires at least one increment.');
	}
	validateHurst(hurst);

	// A prefix of a longer stationary fGn sample has exactly the requested
	// covariance. Padding the requested count to a power of two therefore keeps
	// the radix-2 implementation without restricting the UI to power-of-two sizes.
	const paddedIncrementCount = nextPowerOfTwo(incrementCount);
	const embeddingLength = 2 * paddedIncrementCount;
	const real = new Float64Array(embeddingLength);
	const imaginary = new Float64Array(embeddingLength);

	real[0] = 1;
	for (let lag = 1; lag < paddedIncrementCount; lag += 1) {
		const covariance = fractionalGaussianNoiseAutocovariance(lag, hurst);
		real[lag] = covariance;
		real[embeddingLength - lag] = covariance;
	}
	// The midpoint is deliberately zero in the standard 2n Davies–Harte
	// circulant embedding.
	real[paddedIncrementCount] = 0;
	fftInPlace(real, imaginary);

	let spectralScale = 1;
	for (const eigenvalue of real) spectralScale = Math.max(spectralScale, Math.abs(eigenvalue));
	const eigenvalueTolerance =
		DAVIES_HARTE_EIGENVALUE_EPSILON_FACTOR *
		Number.EPSILON *
		(1 + Math.log2(embeddingLength)) *
		spectralScale;
	let clampedEigenvalueCount = 0;

	for (let index = 0; index < embeddingLength; index += 1) {
		if (Math.abs(imaginary[index]) > eigenvalueTolerance) {
			throw new Error(`Davies–Harte embedding lost Hermitian symmetry at frequency ${index}.`);
		}
		if (real[index] < -eigenvalueTolerance) {
			throw new RangeError(
				`Davies–Harte embedding has a genuinely negative eigenvalue (${real[index]}) at frequency ${index}; tolerance ${eigenvalueTolerance}.`
			);
		}
		if (real[index] < 0) {
			real[index] = 0;
			clampedEigenvalueCount += 1;
		}
	}

	return {
		incrementCount,
		paddedIncrementCount,
		embeddingLength,
		hurst,
		eigenvalues: real,
		eigenvalueTolerance,
		clampedEigenvalueCount
	};
}

/** Draw one unit-step fractional Gaussian noise sequence from a prepared embedding. */
export function sampleDaviesHarteNoise(
	embedding: DaviesHarteEmbedding,
	normal: GaussianSampler
): Float64Array {
	const { embeddingLength, paddedIncrementCount, incrementCount, eigenvalues } = embedding;
	const real = new Float64Array(embeddingLength);
	const imaginary = new Float64Array(embeddingLength);

	real[0] = Math.sqrt(eigenvalues[0]) * normal.next();
	real[paddedIncrementCount] = Math.sqrt(eigenvalues[paddedIncrementCount]) * normal.next();
	for (let frequency = 1; frequency < paddedIncrementCount; frequency += 1) {
		const magnitude = Math.sqrt(eigenvalues[frequency] / 2);
		const componentReal = magnitude * normal.next();
		const componentImaginary = magnitude * normal.next();
		real[frequency] = componentReal;
		imaginary[frequency] = componentImaginary;
		real[embeddingLength - frequency] = componentReal;
		imaginary[embeddingLength - frequency] = -componentImaginary;
	}

	fftInPlace(real, imaginary, true);
	const inverseNormalisation = Math.sqrt(embeddingLength);
	const noise = new Float64Array(incrementCount);
	for (let index = 0; index < incrementCount; index += 1) {
		noise[index] = real[index] * inverseNormalisation;
	}
	return noise;
}

export class FractionalBrownianRunner {
	readonly options: ValidatedFractionalBrownianOptions;
	readonly embedding: DaviesHarteEmbedding;
	readonly times: Float64Array;
	readonly x: Float64Array;
	readonly y: Float64Array;

	private readonly streams: LabelledRandomStreams;
	private completedTrajectoryCount = 0;

	constructor(options: FractionalBrownianOptions) {
		this.options = validateFractionalBrownianOptions(options);
		this.embedding = prepareDaviesHarte(this.options.pointCount - 1, this.options.hurst);
		this.streams = new LabelledRandomStreams(this.options.seed);
		this.times = createTimes(this.options.pointCount, this.options.duration);
		const storedPointCount = this.options.pointCount * this.options.trajectoryCount;
		this.x = new Float64Array(storedPointCount);
		this.y = new Float64Array(storedPointCount);
	}

	step(maxTrajectoryCount = 1): number {
		if (!Number.isSafeInteger(maxTrajectoryCount) || maxTrajectoryCount < 1) {
			throw new RangeError('A fractional path batch must contain at least one trajectory.');
		}
		const stop = Math.min(
			this.options.trajectoryCount,
			this.completedTrajectoryCount + maxTrajectoryCount
		);
		while (this.completedTrajectoryCount < stop) {
			this.generateTrajectory(this.completedTrajectoryCount);
			this.completedTrajectoryCount += 1;
		}
		return this.completedTrajectoryCount;
	}

	completed(): number {
		return this.completedTrajectoryCount;
	}

	isComplete(): boolean {
		return this.completedTrajectoryCount === this.options.trajectoryCount;
	}

	result(): FractionalBrownianPaths {
		if (!this.isComplete()) {
			throw new Error('Fractional Brownian paths are unavailable until generation is complete.');
		}
		return {
			seed: this.options.seed,
			hurst: this.options.hurst,
			scale: this.options.scale,
			duration: this.options.duration,
			pointCount: this.options.pointCount,
			trajectoryCount: this.options.trajectoryCount,
			times: this.times,
			x: this.x,
			y: this.y,
			clampedEigenvalueCount: this.embedding.clampedEigenvalueCount,
			eigenvalueTolerance: this.embedding.eigenvalueTolerance
		};
	}

	private generateTrajectory(trajectory: number): void {
		const pointCount = this.options.pointCount;
		const offset = trajectory * pointCount;
		const xNoise = sampleDaviesHarteNoise(
			this.embedding,
			this.streams.normal(`fractional:path:${trajectory}:x`)
		);
		const yNoise = sampleDaviesHarteNoise(
			this.embedding,
			this.streams.normal(`fractional:path:${trajectory}:y`)
		);
		const incrementScale =
			this.options.scale * (this.options.duration / (pointCount - 1)) ** this.options.hurst;

		this.x[offset] = this.options.originX;
		this.y[offset] = this.options.originY;
		for (let point = 1; point < pointCount; point += 1) {
			this.x[offset + point] = this.x[offset + point - 1] + incrementScale * xNoise[point - 1];
			this.y[offset + point] = this.y[offset + point - 1] + incrementScale * yNoise[point - 1];
		}
	}
}

export function generateFractionalBrownianPaths(
	options: FractionalBrownianOptions
): FractionalBrownianPaths {
	const runner = new FractionalBrownianRunner(options);
	runner.step(runner.options.trajectoryCount);
	return runner.result();
}

export function validateFractionalBrownianOptions(
	value: FractionalBrownianOptions
): ValidatedFractionalBrownianOptions {
	if (!value || typeof value !== 'object') {
		throw new TypeError('Fractional Brownian options must be an object.');
	}
	validateSeed(value.seed);
	validateHurst(value.hurst);
	assertFiniteAtLeast(value.scale, 0, 'Fractional Brownian scale');
	assertFiniteGreaterThan(value.duration, 0, 'Fractional Brownian duration');
	assertIntegerBetween(
		value.pointCount,
		2,
		FRACTIONAL_BROWNIAN_LIMITS.maxPointCount,
		'Fractional Brownian point count'
	);
	assertIntegerBetween(
		value.trajectoryCount,
		1,
		FRACTIONAL_BROWNIAN_LIMITS.maxTrajectoryCount,
		'Fractional Brownian trajectory count'
	);
	if (value.pointCount * value.trajectoryCount > FRACTIONAL_BROWNIAN_LIMITS.maxStoredPointCount) {
		throw new RangeError('The requested fractional Brownian ensemble exceeds the memory budget.');
	}
	const originX = value.originX ?? 0;
	const originY = value.originY ?? 0;
	assertFinite(originX, 'Fractional Brownian x origin');
	assertFinite(originY, 'Fractional Brownian y origin');
	return { ...value, originX, originY };
}

export function isFractionalBrownianOptions(value: unknown): value is FractionalBrownianOptions {
	try {
		validateFractionalBrownianOptions(value as FractionalBrownianOptions);
		return true;
	} catch {
		return false;
	}
}

function createTimes(pointCount: number, duration: number): Float64Array {
	const times = new Float64Array(pointCount);
	for (let index = 0; index < pointCount; index += 1) {
		times[index] = duration * (index / (pointCount - 1));
	}
	return times;
}

function validateHurst(value: number): void {
	if (!Number.isFinite(value) || value <= 0 || value >= 1) {
		throw new RangeError('The Hurst exponent must be finite and strictly between 0 and 1.');
	}
}

function validateSeed(value: Seed): void {
	if (typeof value === 'number') {
		assertFinite(value, 'Fractional Brownian numeric seed');
		return;
	}
	if (typeof value !== 'string' || value.length > 512) {
		throw new RangeError('A fractional Brownian seed must be a finite number or short string.');
	}
}

function assertFinite(value: number, label: string): void {
	if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

function assertFiniteAtLeast(value: number, minimum: number, label: string): void {
	if (!Number.isFinite(value) || value < minimum) {
		throw new RangeError(`${label} must be finite and at least ${minimum}.`);
	}
}

function assertFiniteGreaterThan(value: number, minimum: number, label: string): void {
	if (!Number.isFinite(value) || value <= minimum) {
		throw new RangeError(`${label} must be finite and greater than ${minimum}.`);
	}
}

function assertIntegerBetween(
	value: number,
	minimum: number,
	maximum: number,
	label: string
): void {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
	}
}
