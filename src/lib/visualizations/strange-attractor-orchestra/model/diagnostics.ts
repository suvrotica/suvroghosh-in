import type {
	AttractorDefinition,
	AttractorId,
	FiniteTimeLyapunovDiagnostic,
	PoincareSectionComparisonDiagnostic,
	ReturnTimeDistributionDiagnostic,
	ScientificDiagnostics,
	StepComparisonDiagnostic,
	StepRobustRangeComparisonDiagnostic,
	StepScalarComparisonDiagnostic,
	TrajectoryData,
	Vector3
} from '../types';
import { calculateSectionEvents } from './features';
import { getAttractorDefinition } from './registry';
import { createRk4Workspace, rk4StepInPlace } from './rk4';
import {
	CONTINUOUS_DERIVATIVES,
	exactDivergence,
	henonMapStep,
	type DerivativeFunction
} from './systems';
import { generateTrajectory } from './trajectory';

const DIAGNOSTIC_OCCUPANCY_RESOLUTION = 10;
const DIAGNOSTIC_DISTRIBUTION_RESOLUTION = 16;
const DIAGNOSTIC_MIN_DISTRIBUTION_SAMPLES = 4;
const DIAGNOSTIC_LOWER_QUANTILE = 0.1;
const DIAGNOSTIC_UPPER_QUANTILE = 0.9;
// Long enough for distributional comparisons at the registered observation cadence while
// remaining bounded for an explicitly requested diagnostic pass.
const DEFAULT_COMPARISON_POINTS = 4_096;
const LYAPUNOV_EPSILON = 1e-7;

export interface ScientificDiagnosticOptions {
	readonly stepComparisonPointCount?: number;
	/** Simulated-time units for flows; iterations for the Hénon map. Preset defaults are preferred. */
	readonly lyapunovDuration?: number;
	readonly signal?: AbortSignal;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw new Error('Scientific diagnostics were cancelled.');
}

function vector3(values: readonly number[]): Vector3 {
	return Object.freeze([values[0], values[1], values[2]]) as Vector3;
}

function axisMoments(positions: Float64Array, axis: number): { mean: number; deviation: number } {
	const count = positions.length / 3;
	let mean = 0;
	for (let index = 0; index < count; index += 1) mean += positions[index * 3 + axis];
	mean /= count;
	let variance = 0;
	for (let index = 0; index < count; index += 1) {
		variance += (positions[index * 3 + axis] - mean) ** 2;
	}
	return { mean, deviation: Math.sqrt(variance / count) };
}

function clampUnit(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function occupancyHistogram(positions: Float64Array): Float64Array {
	const resolution = DIAGNOSTIC_OCCUPANCY_RESOLUTION;
	const histogram = new Float64Array(resolution ** 3);
	const count = positions.length / 3;
	for (let index = 0; index < count; index += 1) {
		const offset = index * 3;
		const coordinate = (axis: number): number =>
			Math.max(
				0,
				Math.min(resolution - 1, Math.floor(((positions[offset + axis] + 1) / 2) * resolution))
			);
		const key = (coordinate(2) * resolution + coordinate(1)) * resolution + coordinate(0);
		histogram[key] += 1 / count;
	}
	return histogram;
}

function occupancyTotalVariation(left: Float64Array, right: Float64Array): number {
	let difference = 0;
	for (let index = 0; index < left.length; index += 1) {
		difference += Math.abs(left[index] - right[index]);
	}
	return Math.min(1, difference / 2);
}

function quantile(sorted: readonly number[], probability: number): number {
	const position = clampUnit(probability) * (sorted.length - 1);
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	const mix = position - lower;
	return sorted[lower] * (1 - mix) + sorted[upper] * mix;
}

function summarizeDistribution(values: readonly number[]): ReturnTimeDistributionDiagnostic | null {
	if (values.length === 0 || !values.every((value) => Number.isFinite(value) && value > 0)) {
		return null;
	}
	const sorted = [...values].sort((left, right) => left - right);
	const lowerQuantile = quantile(sorted, DIAGNOSTIC_LOWER_QUANTILE);
	const upperQuantile = quantile(sorted, DIAGNOSTIC_UPPER_QUANTILE);
	return Object.freeze({
		count: sorted.length,
		median: quantile(sorted, 0.5),
		lowerQuantile,
		upperQuantile,
		interquantileRange: Math.max(0, upperQuantile - lowerQuantile)
	});
}

type SectionSamples = Readonly<{
	eventIndices: readonly number[];
	intervals: readonly number[];
}>;

function collectSectionSamples(
	definition: AttractorDefinition,
	trajectory: TrajectoryData,
	signal?: AbortSignal
): SectionSamples {
	throwIfAborted(signal);
	const { sectionDirection } = calculateSectionEvents(
		definition,
		trajectory.rawPositions,
		trajectory.simulationTimes
	);
	throwIfAborted(signal);
	const eventIndices: number[] = [];
	const intervals: number[] = [];
	let previousTime: number | null = null;
	for (let index = 0; index < sectionDirection.length; index += 1) {
		if (sectionDirection[index] === 0) continue;
		eventIndices.push(index);
		const time = trajectory.simulationTimes[index];
		if (previousTime !== null && time > previousTime) intervals.push(time - previousTime);
		previousTime = time;
	}
	return { eventIndices, intervals };
}

function normalizeToRegisteredBounds(
	definition: AttractorDefinition,
	trajectory: TrajectoryData,
	pointIndex: number,
	axis: 0 | 1 | 2
): number {
	const lower = definition.robustBounds.lower[axis];
	const span = Math.max(definition.robustBounds.upper[axis] - lower, 1e-12);
	return clampUnit((trajectory.rawPositions[pointIndex * 3 + axis] - lower) / span);
}

function sectionValueHistogram(
	definition: AttractorDefinition,
	trajectory: TrajectoryData,
	eventIndices: readonly number[]
): Float64Array {
	const section = definition.poincareSection;
	if (!section) return new Float64Array();
	const resolution = DIAGNOSTIC_DISTRIBUTION_RESOLUTION;
	const histogram = new Float64Array(section.kind === 'plane' ? resolution ** 2 : resolution);
	if (eventIndices.length === 0) return histogram;
	const contribution = 1 / eventIndices.length;
	if (section.kind === 'extremum') {
		for (const pointIndex of eventIndices) {
			const coordinate = Math.min(
				resolution - 1,
				Math.floor(
					normalizeToRegisteredBounds(definition, trajectory, pointIndex, section.axis) * resolution
				)
			);
			histogram[coordinate] += contribution;
		}
		return histogram;
	}
	const transverseAxes = ([0, 1, 2] as const).filter((axis) => axis !== section.axis);
	for (const pointIndex of eventIndices) {
		const first = Math.min(
			resolution - 1,
			Math.floor(
				normalizeToRegisteredBounds(definition, trajectory, pointIndex, transverseAxes[0]) *
					resolution
			)
		);
		const second = Math.min(
			resolution - 1,
			Math.floor(
				normalizeToRegisteredBounds(definition, trajectory, pointIndex, transverseAxes[1]) *
					resolution
			)
		);
		histogram[second * resolution + first] += contribution;
	}
	return histogram;
}

function scalarDistributionTotalVariation(
	left: readonly number[],
	right: readonly number[],
	logarithmic = false
): number | null {
	if (
		left.length < DIAGNOSTIC_MIN_DISTRIBUTION_SAMPLES ||
		right.length < DIAGNOSTIC_MIN_DISTRIBUTION_SAMPLES
	) {
		return null;
	}
	const transform = (value: number): number => (logarithmic ? Math.log(value) : value);
	const leftValues = left.map(transform);
	const rightValues = right.map(transform);
	if (![...leftValues, ...rightValues].every(Number.isFinite)) return null;
	const minimum = Math.min(...leftValues, ...rightValues);
	const maximum = Math.max(...leftValues, ...rightValues);
	const span = maximum - minimum;
	if (span <= 1e-12) return 0;
	const resolution = DIAGNOSTIC_DISTRIBUTION_RESOLUTION;
	const histogram = (values: readonly number[]): Float64Array => {
		const result = new Float64Array(resolution);
		for (const value of values) {
			const bin = Math.min(
				resolution - 1,
				Math.max(0, Math.floor(((value - minimum) / span) * resolution))
			);
			result[bin] += 1 / values.length;
		}
		return result;
	};
	return occupancyTotalVariation(histogram(leftValues), histogram(rightValues));
}

function robustRangeComparison(
	definition: AttractorDefinition,
	registered: TrajectoryData,
	halfStep: TrajectoryData
): StepRobustRangeComparisonDiagnostic {
	const registeredLower = registered.normalization.lowerQuantile;
	const registeredUpper = registered.normalization.upperQuantile;
	const halfStepLower = halfStep.normalization.lowerQuantile;
	const halfStepUpper = halfStep.normalization.upperQuantile;
	const endpointDelta01: number[] = [];
	const spanRatio: number[] = [];
	for (let axis = 0; axis < 3; axis += 1) {
		const safeSpan = Math.max(
			definition.robustBounds.upper[axis] - definition.robustBounds.lower[axis],
			1e-12
		);
		const registeredSpan = registeredUpper[axis] - registeredLower[axis];
		const halfSpan = halfStepUpper[axis] - halfStepLower[axis];
		endpointDelta01.push(
			clampUnit(
				Math.max(
					Math.abs(registeredLower[axis] - halfStepLower[axis]),
					Math.abs(registeredUpper[axis] - halfStepUpper[axis])
				) / safeSpan
			)
		);
		spanRatio.push(
			registeredSpan > 1e-12
				? halfSpan / registeredSpan
				: halfSpan <= 1e-12
					? 1
					: Number.POSITIVE_INFINITY
		);
	}
	if (!spanRatio.every((value) => Number.isFinite(value) && value > 0)) {
		throw new Error('A robust coordinate range collapsed or became non-finite.');
	}
	return Object.freeze({
		registeredLower,
		registeredUpper,
		halfStepLower,
		halfStepUpper,
		endpointDelta01: vector3(endpointDelta01),
		spanRatio: vector3(spanRatio)
	});
}

function poincareSectionComparison(
	definition: AttractorDefinition,
	registered: TrajectoryData,
	halfStep: TrajectoryData,
	registeredSamples: SectionSamples,
	halfStepSamples: SectionSamples
): PoincareSectionComparisonDiagnostic | null {
	if (!definition.poincareSection) return null;
	const enoughValues =
		registeredSamples.eventIndices.length >= DIAGNOSTIC_MIN_DISTRIBUTION_SAMPLES &&
		halfStepSamples.eventIndices.length >= DIAGNOSTIC_MIN_DISTRIBUTION_SAMPLES;
	return Object.freeze({
		registeredEventCount: registeredSamples.eventIndices.length,
		halfStepEventCount: halfStepSamples.eventIndices.length,
		valueTotalVariation: enoughValues
			? occupancyTotalVariation(
					sectionValueHistogram(definition, registered, registeredSamples.eventIndices),
					sectionValueHistogram(definition, halfStep, halfStepSamples.eventIndices)
				)
			: null,
		intervalTotalVariation: scalarDistributionTotalVariation(
			registeredSamples.intervals,
			halfStepSamples.intervals,
			true
		)
	});
}

function scalarComparison(
	status: StepScalarComparisonDiagnostic['status'],
	registeredValue: number | null,
	halfStepValue: number | null
): StepScalarComparisonDiagnostic {
	const valuesAvailable =
		registeredValue !== null &&
		halfStepValue !== null &&
		Number.isFinite(registeredValue) &&
		Number.isFinite(halfStepValue);
	return Object.freeze({
		status: valuesAvailable ? status : status === 'not-applicable' ? status : 'failed',
		registeredValue: valuesAvailable ? registeredValue : null,
		halfStepValue: valuesAvailable ? halfStepValue : null,
		absoluteDelta: valuesAvailable ? Math.abs(halfStepValue - registeredValue) : null
	});
}

function lyapunovComparison(
	registered: FiniteTimeLyapunovDiagnostic,
	halfStep: FiniteTimeLyapunovDiagnostic
): StepScalarComparisonDiagnostic {
	const status: StepScalarComparisonDiagnostic['status'] =
		registered.status === 'not-applicable' && halfStep.status === 'not-applicable'
			? 'not-applicable'
			: registered.status === 'failed' || halfStep.status === 'failed'
				? 'failed'
				: registered.status === 'warming-up' || halfStep.status === 'warming-up'
					? 'warming-up'
					: 'available';
	return scalarComparison(status, registered.value, halfStep.value);
}

function compareDefinitionWithHalfStep(
	definition: AttractorDefinition,
	options: ScientificDiagnosticOptions,
	registeredLyapunov?: FiniteTimeLyapunovDiagnostic
): StepComparisonDiagnostic {
	if (definition.integrator === 'direct-map' || definition.stepSize === undefined) {
		return {
			label: 'Fixed-step h versus h/2 statistical comparison',
			status: 'not-applicable',
			registeredStep: null,
			comparisonStep: null,
			pointCount: 0,
			coordinateMeanDelta01: null,
			coordinateDeviationRatio: null,
			coordinateRobustRange: null,
			occupancyTotalVariation: null,
			poincareSection: null,
			registeredReturnTimes: null,
			halfStepReturnTimes: null,
			returnIntervalMedianRatio: null,
			returnIntervalInterquantileRangeRatio: null,
			timeAveragedDivergenceComparison: null,
			finiteTimeLyapunovComparison: null,
			note: 'A direct discrete map has no integration step h to halve.'
		};
	}
	const pointCount = options.stepComparisonPointCount ?? DEFAULT_COMPARISON_POINTS;
	if (!Number.isSafeInteger(pointCount) || pointCount < 128 || pointCount > 4_096) {
		throw new RangeError('Diagnostic comparison point count must be an integer from 128 to 4096.');
	}
	try {
		throwIfAborted(options.signal);
		const registered = generateTrajectory(definition, { pointCount, signal: options.signal });
		const halfDefinition: AttractorDefinition = {
			...definition,
			stepSize: definition.stepSize / 2,
			burnInSteps: definition.burnInSteps * 2,
			calibrationSteps: definition.calibrationSteps * 2,
			sampleStride: (definition.sampleStride ?? 1) * 2
		};
		const half = generateTrajectory(halfDefinition, { pointCount, signal: options.signal });
		const meanDelta: number[] = [];
		const deviationRatio: number[] = [];
		for (let axis = 0; axis < 3; axis += 1) {
			const registeredMoment = axisMoments(registered.normalizedPositions, axis);
			const halfMoment = axisMoments(half.normalizedPositions, axis);
			meanDelta.push(Math.min(1, Math.abs(registeredMoment.mean - halfMoment.mean) / 2));
			deviationRatio.push(
				registeredMoment.deviation > 1e-12
					? halfMoment.deviation / registeredMoment.deviation
					: halfMoment.deviation <= 1e-12
						? 1
						: Number.POSITIVE_INFINITY
			);
		}
		if (
			!meanDelta.every(Number.isFinite) ||
			!deviationRatio.every((value) => Number.isFinite(value) && value > 0)
		) {
			throw new Error('A diagnostic coordinate distribution collapsed or became non-finite.');
		}
		const coordinateRobustRange = robustRangeComparison(definition, registered, half);
		const registeredSamples = collectSectionSamples(definition, registered, options.signal);
		const halfStepSamples = collectSectionSamples(halfDefinition, half, options.signal);
		const registeredReturnTimes = summarizeDistribution(registeredSamples.intervals);
		const halfStepReturnTimes = summarizeDistribution(halfStepSamples.intervals);
		const registeredDivergence = timeAveragedDivergence(definition, registered);
		const halfStepDivergence = timeAveragedDivergence(halfDefinition, half);
		const divergenceStatus =
			registeredDivergence === null && halfStepDivergence === null ? 'not-applicable' : 'available';
		const registeredFiniteTimeLyapunov =
			registeredLyapunov ?? estimateFiniteTimeLargestLyapunov(definition, options);
		const halfStepFiniteTimeLyapunov = estimateFiniteTimeLargestLyapunov(halfDefinition, options);
		throwIfAborted(options.signal);
		return {
			label: 'Fixed-step h versus h/2 statistical comparison',
			status: deviationRatio.every(Number.isFinite) ? 'available' : 'failed',
			registeredStep: definition.stepSize,
			comparisonStep: definition.stepSize / 2,
			pointCount,
			coordinateMeanDelta01: vector3(meanDelta),
			coordinateDeviationRatio: vector3(deviationRatio),
			coordinateRobustRange,
			occupancyTotalVariation: occupancyTotalVariation(
				occupancyHistogram(registered.normalizedPositions),
				occupancyHistogram(half.normalizedPositions)
			),
			poincareSection: poincareSectionComparison(
				definition,
				registered,
				half,
				registeredSamples,
				halfStepSamples
			),
			registeredReturnTimes,
			halfStepReturnTimes,
			returnIntervalMedianRatio:
				registeredReturnTimes !== null && halfStepReturnTimes !== null
					? halfStepReturnTimes.median / registeredReturnTimes.median
					: null,
			returnIntervalInterquantileRangeRatio:
				registeredReturnTimes !== null &&
				halfStepReturnTimes !== null &&
				registeredReturnTimes.interquantileRange > 1e-12
					? halfStepReturnTimes.interquantileRange / registeredReturnTimes.interquantileRange
					: registeredReturnTimes !== null &&
						  halfStepReturnTimes !== null &&
						  halfStepReturnTimes.interquantileRange <= 1e-12
						? 1
						: null,
			timeAveragedDivergenceComparison: scalarComparison(
				divergenceStatus,
				registeredDivergence,
				halfStepDivergence
			),
			finiteTimeLyapunovComparison: lyapunovComparison(
				registeredFiniteTimeLyapunov,
				halfStepFiniteTimeLyapunov
			),
			note: 'Finite-window distributions use equal simulated burn-in and calibration durations at equal observation cadence; robust ranges use frozen 5th–95th-percentile calibration bounds, section and return-time distances use fixed common bins, and late points are intentionally not compared. These diagnostics describe numerical agreement, not mathematical convergence or proof of chaos.'
		};
	} catch (error) {
		if (options.signal?.aborted) throw error;
		return {
			label: 'Fixed-step h versus h/2 statistical comparison',
			status: 'failed',
			registeredStep: definition.stepSize,
			comparisonStep: definition.stepSize / 2,
			pointCount,
			coordinateMeanDelta01: null,
			coordinateDeviationRatio: null,
			coordinateRobustRange: null,
			occupancyTotalVariation: null,
			poincareSection: null,
			registeredReturnTimes: null,
			halfStepReturnTimes: null,
			returnIntervalMedianRatio: null,
			returnIntervalInterquantileRangeRatio: null,
			timeAveragedDivergenceComparison: null,
			finiteTimeLyapunovComparison: null,
			note: error instanceof Error ? error.message : 'The step comparison failed.'
		};
	}
}

export function compareRegisteredStepWithHalfStep(
	attractor: AttractorId | AttractorDefinition,
	options: ScientificDiagnosticOptions = {}
): StepComparisonDiagnostic {
	const definition = typeof attractor === 'string' ? getAttractorDefinition(attractor) : attractor;
	return compareDefinitionWithHalfStep(definition, options);
}

function normalizedSeparation(base: Float64Array, shadow: Float64Array, scales: Vector3): number {
	let squared = 0;
	for (let axis = 0; axis < base.length; axis += 1) {
		const scale = Math.max(scales[axis] ?? 1, 1e-12);
		squared += ((shadow[axis] - base[axis]) / scale) ** 2;
	}
	return Math.sqrt(squared);
}

function validateDiagnosticState(definition: AttractorDefinition, state: Float64Array): void {
	let normSquared = 0;
	for (const value of state) {
		if (!Number.isFinite(value)) throw new Error('The diagnostic trajectory became non-finite.');
		normSquared += value * value;
	}
	if (Math.sqrt(normSquared) > definition.escapeRadius) {
		throw new Error('The diagnostic trajectory escaped its registered safe radius.');
	}
}

function defaultLyapunovDuration(id: AttractorId): number {
	switch (id) {
		case 'rossler':
		case 'thomas':
			return 50;
		case 'sprott-b':
		case 'langford':
		case 'rucklidge':
			return 30;
		case 'rabinovich-fabrikant':
			return 10;
		default:
			return 20;
	}
}

function diagnosticResult(
	value: number,
	duration: number,
	renormalizations: number,
	firstRate: number,
	secondRate: number,
	note: string
): FiniteTimeLyapunovDiagnostic {
	const valid = Number.isFinite(value) && Math.abs(value) <= 100;
	const convergenceDelta = Math.abs(firstRate - secondRate);
	const converged =
		valid && renormalizations >= 20 && convergenceDelta <= Math.max(0.08, Math.abs(value) * 0.25);
	return {
		label: 'Finite-time largest Lyapunov estimate',
		status: valid ? (converged ? 'available' : 'warming-up') : 'failed',
		value: valid ? value : null,
		simulatedDuration: duration,
		renormalizations,
		convergenceDelta: Number.isFinite(convergenceDelta) ? convergenceDelta : null,
		converged,
		note
	};
}

function continuousLyapunov(
	definition: AttractorDefinition,
	options: ScientificDiagnosticOptions
): FiniteTimeLyapunovDiagnostic {
	const derivative = CONTINUOUS_DERIVATIVES[definition.id] as DerivativeFunction | undefined;
	const stepSize = definition.stepSize;
	if (!derivative || stepSize === undefined)
		throw new Error('The continuous derivative is missing.');
	const duration = Math.max(
		0.5,
		Math.min(100, options.lyapunovDuration ?? defaultLyapunovDuration(definition.id))
	);
	const base = Float64Array.from(definition.initialState);
	const baseWorkspace = createRk4Workspace(base.length);
	for (let step = 0; step < definition.burnInSteps; step += 1) {
		rk4StepInPlace(base, stepSize, definition.parameters, derivative, baseWorkspace);
		if (step % 4_096 === 0) {
			throwIfAborted(options.signal);
			validateDiagnosticState(definition, base);
		}
	}
	const scales = vector3(
		definition.robustBounds.upper.map((value, axis) =>
			Math.max(value - definition.robustBounds.lower[axis], 1e-6)
		)
	);
	const shadow = base.slice();
	shadow[0] += LYAPUNOV_EPSILON * scales[0];
	const shadowWorkspace = createRk4Workspace(shadow.length);
	const renormalizationSteps = Math.max(1, Math.round(0.05 / stepSize));
	const totalSteps = Math.max(renormalizationSteps * 20, Math.round(duration / stepSize));
	let accumulated = 0;
	let firstAccumulated = 0;
	let secondAccumulated = 0;
	let firstTime = 0;
	let secondTime = 0;
	let completedSteps = 0;
	let renormalizations = 0;
	while (completedSteps < totalSteps) {
		const batch = Math.min(renormalizationSteps, totalSteps - completedSteps);
		for (let step = 0; step < batch; step += 1) {
			rk4StepInPlace(base, stepSize, definition.parameters, derivative, baseWorkspace);
			rk4StepInPlace(shadow, stepSize, definition.parameters, derivative, shadowWorkspace);
		}
		completedSteps += batch;
		throwIfAborted(options.signal);
		validateDiagnosticState(definition, base);
		validateDiagnosticState(definition, shadow);
		const distance = normalizedSeparation(base, shadow, scales);
		if (!(distance > 0) || !Number.isFinite(distance)) {
			throw new Error('The shadow separation collapsed or became non-finite.');
		}
		const logarithm = Math.log(distance / LYAPUNOV_EPSILON);
		const elapsed = batch * stepSize;
		accumulated += logarithm;
		if (completedSteps <= totalSteps / 2) {
			firstAccumulated += logarithm;
			firstTime += elapsed;
		} else {
			secondAccumulated += logarithm;
			secondTime += elapsed;
		}
		const correction = LYAPUNOV_EPSILON / distance;
		for (let axis = 0; axis < shadow.length; axis += 1) {
			shadow[axis] = base[axis] + (shadow[axis] - base[axis]) * correction;
		}
		renormalizations += 1;
	}
	const actualDuration = totalSteps * stepSize;
	return diagnosticResult(
		accumulated / actualDuration,
		actualDuration,
		renormalizations,
		firstAccumulated / Math.max(firstTime, 1e-12),
		secondAccumulated / Math.max(secondTime, 1e-12),
		'A renormalized shadow trajectory gives a finite-time estimate, not a proof of chaos.'
	);
}

function henonLyapunov(
	definition: AttractorDefinition,
	options: ScientificDiagnosticOptions
): FiniteTimeLyapunovDiagnostic {
	let state = Float64Array.from(definition.initialState);
	let next = new Float64Array(2);
	for (let step = 0; step < definition.burnInSteps; step += 1) {
		henonMapStep(state, definition.parameters, next);
		const swap = state;
		state = next;
		next = swap;
	}
	const iterations = Math.max(
		2_000,
		Math.min(100_000, Math.round(options.lyapunovDuration ?? 20_000))
	);
	let tangentX = 1;
	let tangentY = 0;
	let total = 0;
	let first = 0;
	let second = 0;
	const splitIteration = Math.ceil(iterations / 2);
	for (let step = 0; step < iterations; step += 1) {
		const nextTangentX = -2 * definition.parameters.a * state[0] * tangentX + tangentY;
		const nextTangentY = definition.parameters.b * tangentX;
		const length = Math.hypot(nextTangentX, nextTangentY);
		if (!(length > 0) || !Number.isFinite(length)) {
			throw new Error('The Hénon tangent vector became invalid.');
		}
		const logarithm = Math.log(length);
		total += logarithm;
		if (step < splitIteration) first += logarithm;
		else second += logarithm;
		tangentX = nextTangentX / length;
		tangentY = nextTangentY / length;
		henonMapStep(state, definition.parameters, next);
		const swap = state;
		state = next;
		next = swap;
		if (step % 4_096 === 0) throwIfAborted(options.signal);
	}
	return diagnosticResult(
		total / iterations,
		iterations,
		iterations,
		first / splitIteration,
		second / Math.max(1, iterations - splitIteration),
		'The direct-map tangent Jacobian yields a finite-time estimate per iteration.'
	);
}

export function estimateFiniteTimeLargestLyapunov(
	attractor: AttractorId | AttractorDefinition,
	options: ScientificDiagnosticOptions = {}
): FiniteTimeLyapunovDiagnostic {
	const definition = typeof attractor === 'string' ? getAttractorDefinition(attractor) : attractor;
	if (definition.integrator === 'delay-rk4') {
		return {
			label: 'Finite-time largest Lyapunov estimate',
			status: 'not-applicable',
			value: null,
			simulatedDuration: 0,
			renormalizations: 0,
			convergenceDelta: null,
			converged: false,
			note: 'This build does not collapse the infinite-dimensional delay history to a misleading three-coordinate tangent estimate.'
		};
	}
	if (
		options.lyapunovDuration !== undefined &&
		(!Number.isFinite(options.lyapunovDuration) || options.lyapunovDuration <= 0)
	) {
		throw new RangeError('Lyapunov diagnostic duration must be finite and positive.');
	}
	try {
		return definition.integrator === 'direct-map'
			? henonLyapunov(definition, options)
			: continuousLyapunov(definition, options);
	} catch (error) {
		if (options.signal?.aborted) throw error;
		return {
			label: 'Finite-time largest Lyapunov estimate',
			status: 'failed',
			value: null,
			simulatedDuration: 0,
			renormalizations: 0,
			convergenceDelta: null,
			converged: false,
			note: error instanceof Error ? error.message : 'The finite-time estimate failed.'
		};
	}
}

export function timeAveragedDivergence(
	definition: AttractorDefinition,
	trajectory: TrajectoryData
): number | null {
	if (trajectory.attractorId !== definition.id) {
		throw new RangeError('Divergence must be evaluated against its trajectory definition.');
	}
	if (trajectory.rawPositions.length !== trajectory.pointCount * 3) {
		throw new RangeError('Divergence requires one packed three-coordinate observation per point.');
	}
	let total = 0;
	let count = 0;
	for (let index = 0; index < trajectory.pointCount; index += 1) {
		const offset = index * 3;
		const divergence = exactDivergence(
			definition.id,
			[
				trajectory.rawPositions[offset],
				trajectory.rawPositions[offset + 1],
				trajectory.rawPositions[offset + 2]
			],
			definition.parameters
		);
		if (divergence === null || !Number.isFinite(divergence)) continue;
		total += divergence;
		count += 1;
	}
	return count > 0 ? total / count : null;
}

export function computeScientificDiagnostics(
	attractor: AttractorId | AttractorDefinition,
	trajectory?: TrajectoryData,
	options: ScientificDiagnosticOptions = {}
): ScientificDiagnostics {
	const definition = typeof attractor === 'string' ? getAttractorDefinition(attractor) : attractor;
	const finiteTimeLyapunov = estimateFiniteTimeLargestLyapunov(definition, options);
	return {
		finiteTimeLyapunov,
		stepComparison: compareDefinitionWithHalfStep(definition, options, finiteTimeLyapunov),
		timeAveragedDivergence: trajectory ? timeAveragedDivergence(definition, trajectory) : null
	};
}
