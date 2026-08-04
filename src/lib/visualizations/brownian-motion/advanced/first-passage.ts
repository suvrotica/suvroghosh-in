import type { Seed } from '$lib/utils/seeded-random';
import { LabelledRandomStreams } from '../rng';

export const FIRST_PASSAGE_LIMITS = {
	maxParticleCount: 2_000_000,
	maxStepCount: 1_000_000,
	maxParticleSteps: 250_000_000,
	maxHistorySamples: 100_002
} as const;

export interface FirstPassageOptions {
	seed: Seed;
	particleCount: number;
	startDistance: number;
	diffusion: number;
	timestep: number;
	maxTime: number;
	historySampleEverySteps?: number;
	/**
	 * Detect Brownian-bridge crossings whose two sampled endpoints are positive.
	 * This removes most discrete-monitoring bias from the survival curve.
	 */
	bridgeCorrection?: boolean;
}

export interface ValidatedFirstPassageOptions {
	seed: Seed;
	particleCount: number;
	startDistance: number;
	diffusion: number;
	timestep: number;
	maxTime: number;
	historySampleEverySteps: number;
	bridgeCorrection: boolean;
}

export interface FirstPassageResult {
	options: ValidatedFirstPassageOptions;
	times: Float64Array;
	empiricalSurvival: Float64Array;
	analyticalSurvival: Float64Array;
	absorbedCountByTime: Uint32Array;
	/** NaN marks right-censored particles that survived maxTime. */
	firstPassageTimes: Float64Array;
	/** Absorbed particles are held at zero; other entries are final positions. */
	finalPositions: Float64Array;
	absorbedCount: number;
	survivingCount: number;
	/** Unconditional median; null when fewer than half the ensemble arrived. */
	medianArrivalTime: number | null;
	finiteStepMethod: 'linear-endpoint-with-brownian-bridge-correction';
}

/** S(t) = erf(x0 / sqrt(4Dt)) for the absorbing Brownian half-line. */
export function analyticalHalfLineSurvival(
	time: number,
	startDistance: number,
	diffusion: number
): number {
	validateAnalyticalInputs(time, startDistance, diffusion);
	if (time === 0 || diffusion === 0) return 1;
	return errorFunction(startDistance / Math.sqrt(4 * diffusion * time));
}

/** f(t) = x0 exp[-x0^2/(4Dt)] / sqrt(4 pi D t^3). */
export function analyticalHalfLineFirstPassageDensity(
	time: number,
	startDistance: number,
	diffusion: number
): number {
	validateAnalyticalInputs(time, startDistance, diffusion);
	if (time === 0 || diffusion === 0) return 0;
	return (
		(startDistance / Math.sqrt(4 * Math.PI * diffusion * time ** 3)) *
		Math.exp(-(startDistance ** 2) / (4 * diffusion * time))
	);
}

/** Abramowitz–Stegun 7.1.26; maximum absolute error is about 1.5e-7. */
export function errorFunction(value: number): number {
	if (Number.isNaN(value)) return Number.NaN;
	if (value === Number.POSITIVE_INFINITY) return 1;
	if (value === Number.NEGATIVE_INFINITY) return -1;
	const sign = value < 0 ? -1 : 1;
	const magnitude = Math.abs(value);
	const t = 1 / (1 + 0.3275911 * magnitude);
	const polynomial =
		((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
	return sign * (1 - polynomial * Math.exp(-(magnitude ** 2)));
}

export class FirstPassageRunner {
	readonly options: ValidatedFirstPassageOptions;
	readonly firstPassageTimes: Float64Array;
	readonly finalPositions: Float64Array;

	private readonly incrementNormal;
	private readonly bridgeUniform;
	private completedParticleCount = 0;

	constructor(options: FirstPassageOptions) {
		this.options = validateFirstPassageOptions(options);
		this.firstPassageTimes = new Float64Array(this.options.particleCount);
		this.firstPassageTimes.fill(Number.NaN);
		this.finalPositions = new Float64Array(this.options.particleCount);
		const streams = new LabelledRandomStreams(this.options.seed);
		this.incrementNormal = streams.normal('first-passage:increments');
		this.bridgeUniform = streams.uniform('first-passage:bridge-crossings');
	}

	step(maxParticleCount = 512): number {
		if (!Number.isSafeInteger(maxParticleCount) || maxParticleCount < 1) {
			throw new RangeError('A first-passage batch must contain at least one particle.');
		}
		const stop = Math.min(
			this.options.particleCount,
			this.completedParticleCount + maxParticleCount
		);
		while (this.completedParticleCount < stop) {
			this.simulateParticle(this.completedParticleCount);
			this.completedParticleCount += 1;
		}
		return this.completedParticleCount;
	}

	completed(): number {
		return this.completedParticleCount;
	}

	isComplete(): boolean {
		return this.completedParticleCount === this.options.particleCount;
	}

	result(): FirstPassageResult {
		if (!this.isComplete()) {
			throw new Error('First-passage statistics are unavailable until the ensemble is complete.');
		}
		return buildFirstPassageResult(this.options, this.firstPassageTimes, this.finalPositions);
	}

	private simulateParticle(particle: number): void {
		const { startDistance, diffusion, timestep, maxTime, bridgeCorrection } = this.options;
		if (diffusion === 0) {
			this.finalPositions[particle] = startDistance;
			return;
		}

		let position = startDistance;
		const maximumStepCount = Math.ceil(maxTime / timestep);
		for (let step = 0; step < maximumStepCount; step += 1) {
			const stepStartTime = step * timestep;
			const stepDuration = Math.min(timestep, maxTime - stepStartTime);
			if (stepDuration <= 0) break;
			const nextPosition =
				position + Math.sqrt(2 * diffusion * stepDuration) * this.incrementNormal.next();

			if (nextPosition <= 0) {
				const fraction = position / (position - nextPosition);
				this.firstPassageTimes[particle] = stepStartTime + fraction * stepDuration;
				this.finalPositions[particle] = 0;
				return;
			}

			if (bridgeCorrection) {
				// Conditional on two positive endpoints, a Brownian bridge crosses zero
				// with probability exp[-x_n x_(n+1)/(D dt)].
				const crossingProbability = Math.exp(
					-(position * nextPosition) / (diffusion * stepDuration)
				);
				if (this.bridgeUniform.next() < crossingProbability) {
					// The bridge test makes the event probability exact at sample times.
					// Its precise sub-step hitting-time law is expensive to invert, so use a
					// bounded endpoint-ratio estimate instead of assigning it to step end.
					const fraction = position / (position + nextPosition);
					this.firstPassageTimes[particle] = stepStartTime + fraction * stepDuration;
					this.finalPositions[particle] = 0;
					return;
				}
			}

			position = nextPosition;
		}
		this.finalPositions[particle] = position;
	}
}

export function solveFirstPassageEnsemble(options: FirstPassageOptions): FirstPassageResult {
	const runner = new FirstPassageRunner(options);
	runner.step(runner.options.particleCount);
	return runner.result();
}

export function validateFirstPassageOptions(
	value: FirstPassageOptions
): ValidatedFirstPassageOptions {
	if (!value || typeof value !== 'object') {
		throw new TypeError('First-passage options must be an object.');
	}
	validateSeed(value.seed);
	assertIntegerBetween(
		value.particleCount,
		1,
		FIRST_PASSAGE_LIMITS.maxParticleCount,
		'First-passage particle count'
	);
	assertFiniteGreaterThan(value.startDistance, 0, 'First-passage start distance');
	assertFiniteAtLeast(value.diffusion, 0, 'First-passage diffusion coefficient');
	assertFiniteGreaterThan(value.timestep, 0, 'First-passage timestep');
	assertFiniteGreaterThan(value.maxTime, 0, 'First-passage maximum time');
	const stepCount = Math.ceil(value.maxTime / value.timestep);
	if (stepCount > FIRST_PASSAGE_LIMITS.maxStepCount) {
		throw new RangeError('The first-passage timestep produces too many steps.');
	}
	if (stepCount * value.particleCount > FIRST_PASSAGE_LIMITS.maxParticleSteps) {
		throw new RangeError('The requested first-passage ensemble exceeds the work budget.');
	}
	const automaticSampling = Math.max(
		1,
		Math.ceil(stepCount / (FIRST_PASSAGE_LIMITS.maxHistorySamples - 2))
	);
	const historySampleEverySteps = value.historySampleEverySteps ?? automaticSampling;
	assertIntegerBetween(
		historySampleEverySteps,
		1,
		FIRST_PASSAGE_LIMITS.maxStepCount,
		'First-passage history interval'
	);
	const sampleCount = Math.ceil(stepCount / historySampleEverySteps) + 1;
	if (sampleCount > FIRST_PASSAGE_LIMITS.maxHistorySamples) {
		throw new RangeError('The requested first-passage history contains too many samples.');
	}
	const bridgeCorrection = value.bridgeCorrection ?? true;
	if (typeof bridgeCorrection !== 'boolean') {
		throw new TypeError('First-passage bridge correction must be boolean.');
	}
	return { ...value, historySampleEverySteps, bridgeCorrection };
}

export function isFirstPassageOptions(value: unknown): value is FirstPassageOptions {
	try {
		validateFirstPassageOptions(value as FirstPassageOptions);
		return true;
	} catch {
		return false;
	}
}

function buildFirstPassageResult(
	options: ValidatedFirstPassageOptions,
	firstPassageTimes: Float64Array,
	finalPositions: Float64Array
): FirstPassageResult {
	const arrivals: number[] = [];
	for (const time of firstPassageTimes) {
		if (Number.isFinite(time)) arrivals.push(time);
	}
	arrivals.sort((left, right) => left - right);

	const sampleTimes = createSampleTimes(options);
	const empiricalSurvival = new Float64Array(sampleTimes.length);
	const analyticalSurvival = new Float64Array(sampleTimes.length);
	const absorbedCountByTime = new Uint32Array(sampleTimes.length);
	let arrivalIndex = 0;
	for (let sample = 0; sample < sampleTimes.length; sample += 1) {
		const time = sampleTimes[sample];
		while (arrivalIndex < arrivals.length && arrivals[arrivalIndex] <= time) arrivalIndex += 1;
		absorbedCountByTime[sample] = arrivalIndex;
		empiricalSurvival[sample] = 1 - arrivalIndex / options.particleCount;
		analyticalSurvival[sample] = analyticalHalfLineSurvival(
			time,
			options.startDistance,
			options.diffusion
		);
	}

	const medianIndex = Math.ceil(options.particleCount / 2) - 1;
	const medianArrivalTime = arrivals.length > medianIndex ? arrivals[medianIndex] : null;
	return {
		options,
		times: sampleTimes,
		empiricalSurvival,
		analyticalSurvival,
		absorbedCountByTime,
		firstPassageTimes,
		finalPositions,
		absorbedCount: arrivals.length,
		survivingCount: options.particleCount - arrivals.length,
		medianArrivalTime,
		finiteStepMethod: 'linear-endpoint-with-brownian-bridge-correction'
	};
}

function createSampleTimes(options: ValidatedFirstPassageOptions): Float64Array {
	const values = [0];
	const stepCount = Math.ceil(options.maxTime / options.timestep);
	for (
		let step = options.historySampleEverySteps;
		step < stepCount;
		step += options.historySampleEverySteps
	) {
		values.push(Math.min(options.maxTime, step * options.timestep));
	}
	if (values.at(-1) !== options.maxTime) values.push(options.maxTime);
	return Float64Array.from(values);
}

function validateAnalyticalInputs(time: number, startDistance: number, diffusion: number): void {
	assertFiniteAtLeast(time, 0, 'First-passage time');
	assertFiniteGreaterThan(startDistance, 0, 'First-passage start distance');
	assertFiniteAtLeast(diffusion, 0, 'First-passage diffusion coefficient');
}

function validateSeed(value: Seed): void {
	if (typeof value === 'number') {
		if (!Number.isFinite(value))
			throw new RangeError('A first-passage numeric seed must be finite.');
		return;
	}
	if (typeof value !== 'string' || value.length > 512) {
		throw new RangeError('A first-passage seed must be a finite number or short string.');
	}
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
