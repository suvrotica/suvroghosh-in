import type {
	AttractorDefinition,
	AttractorId,
	GenerationProgress,
	TrajectoryData
} from '../types';
import { ORCHESTRA_INTEGRATOR_VERSION, ORCHESTRA_MODEL_VERSION } from '../versions';
import { applyFrozenNormalization, fitFrozenNormalization } from './normalization';
import { getAttractorDefinition } from './registry';
import { createRk4Workspace, rk4StepInPlace } from './rk4';
import {
	CONTINUOUS_DERIVATIVES,
	henonMapStep,
	mackeyGlassDerivative,
	type DerivativeFunction
} from './systems';

const MAX_POINT_COUNT = 100_000;
const MAX_SAMPLE_STRIDE = 10_000;
const PROGRESS_INTERVAL = 2_048;

export type TrajectoryFailureCode = 'TRAJECTORY_ESCAPED' | 'NUMERICAL_FAILURE' | 'ABORTED';

export class TrajectoryComputationError extends Error {
	readonly name = 'TrajectoryComputationError';
	constructor(
		readonly code: TrajectoryFailureCode,
		readonly attractorId: AttractorId,
		readonly simulationStep: number,
		message: string,
		readonly component?: number,
		readonly value?: number
	) {
		super(message);
	}
}

export interface GenerateTrajectoryOptions {
	readonly pointCount?: number;
	readonly signal?: AbortSignal;
	readonly onProgress?: (progress: GenerationProgress) => void;
}

function validatePointCount(value: number): number {
	if (!Number.isSafeInteger(value) || value < 16 || value > MAX_POINT_COUNT) {
		throw new RangeError(`Point count must be an integer from 16 to ${MAX_POINT_COUNT}.`);
	}
	return value;
}

function validatedSampleStride(definition: AttractorDefinition): number {
	const value = definition.sampleStride ?? 1;
	if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SAMPLE_STRIDE) {
		throw new RangeError(
			`Sample stride for ${definition.name} must be an integer from 1 to ${MAX_SAMPLE_STRIDE}.`
		);
	}
	return value;
}

function throwIfAborted(
	definition: AttractorDefinition,
	step: number,
	signal: AbortSignal | undefined
): void {
	if (signal?.aborted) {
		throw new TrajectoryComputationError(
			'ABORTED',
			definition.id,
			step,
			`Trajectory generation for ${definition.name} was cancelled.`
		);
	}
}

function validateState(
	definition: AttractorDefinition,
	state: Float64Array,
	step: number,
	maximumDerivative = 0
): void {
	if (!Number.isFinite(maximumDerivative) || maximumDerivative > definition.maxDerivative) {
		throw new TrajectoryComputationError(
			'NUMERICAL_FAILURE',
			definition.id,
			step,
			`${definition.name} developed an invalid or absurd derivative at simulation step ${step}.`,
			undefined,
			maximumDerivative
		);
	}
	let normSquared = 0;
	for (let component = 0; component < state.length; component += 1) {
		const value = state[component];
		if (!Number.isFinite(value)) {
			throw new TrajectoryComputationError(
				'NUMERICAL_FAILURE',
				definition.id,
				step,
				`${definition.name} produced a non-finite component at simulation step ${step}.`,
				component,
				value
			);
		}
		normSquared += value * value;
	}
	if (Math.sqrt(normSquared) > definition.escapeRadius) {
		throw new TrajectoryComputationError(
			'TRAJECTORY_ESCAPED',
			definition.id,
			step,
			`${definition.name} exceeded its safe escape radius at simulation step ${step}.`,
			undefined,
			Math.sqrt(normSquared)
		);
	}
}

function validateScalarState(
	definition: AttractorDefinition,
	value: number,
	step: number,
	maximumDerivative: number
): void {
	if (!Number.isFinite(maximumDerivative) || maximumDerivative > definition.maxDerivative) {
		throw new TrajectoryComputationError(
			'NUMERICAL_FAILURE',
			definition.id,
			step,
			`${definition.name} developed an invalid or absurd derivative at simulation step ${step}.`,
			undefined,
			maximumDerivative
		);
	}
	if (!Number.isFinite(value)) {
		throw new TrajectoryComputationError(
			'NUMERICAL_FAILURE',
			definition.id,
			step,
			`${definition.name} produced a non-finite component at simulation step ${step}.`,
			0,
			value
		);
	}
	if (Math.abs(value) > definition.escapeRadius) {
		throw new TrajectoryComputationError(
			'TRAJECTORY_ESCAPED',
			definition.id,
			step,
			`${definition.name} exceeded its safe escape radius at simulation step ${step}.`,
			0,
			Math.abs(value)
		);
	}
}

function emitProgress(
	definition: AttractorDefinition,
	phase: GenerationProgress['phase'],
	completed: number,
	total: number,
	step: number,
	options: GenerateTrajectoryOptions
): void {
	if (completed === total || completed % PROGRESS_INTERVAL === 0) {
		throwIfAborted(definition, step, options.signal);
		options.onProgress?.({
			phase,
			completed,
			total,
			progress01: total === 0 ? 1 : completed / total
		});
	}
}

function writeCoordinateObservation(
	definition: AttractorDefinition,
	state: Float64Array,
	target: Float64Array,
	pointIndex: number
): void {
	const offset = pointIndex * 3;
	if (definition.id === 'henon') {
		target[offset] = state[0];
		target[offset + 1] = state[1];
		target[offset + 2] = 0;
		return;
	}
	const axes = definition.projection.axes ?? [0, 1, 2];
	target[offset] = state[axes[0]] ?? 0;
	target[offset + 1] = state[axes[1]] ?? 0;
	target[offset + 2] = state[axes[2]] ?? 0;
}

function finalizeTrajectory(
	definition: AttractorDefinition,
	pointCount: number,
	stepSize: number,
	sampleStride: number,
	calibration: Float64Array,
	rawPositions: Float64Array,
	simulationSteps: Uint32Array,
	simulationTimes: Float64Array
): TrajectoryData {
	const frozenAtStep = definition.burnInSteps + definition.calibrationSteps * sampleStride;
	const normalization = fitFrozenNormalization(calibration, frozenAtStep, definition.robustBounds);
	return {
		modelVersion: ORCHESTRA_MODEL_VERSION,
		integratorVersion: ORCHESTRA_INTEGRATOR_VERSION,
		attractorId: definition.id,
		pointCount,
		dimensions: 3,
		stepSize,
		sampleStride,
		burnInSteps: definition.burnInSteps,
		calibrationSteps: definition.calibrationSteps,
		firstOutputStep: frozenAtStep + sampleStride,
		simulationSteps,
		simulationTimes,
		rawPositions,
		normalizedPositions: applyFrozenNormalization(rawPositions, normalization),
		normalization
	};
}

function generateContinuous(
	definition: AttractorDefinition,
	pointCount: number,
	options: GenerateTrajectoryOptions
): TrajectoryData {
	const derivative = CONTINUOUS_DERIVATIVES[definition.id] as DerivativeFunction | undefined;
	const stepSize = definition.stepSize;
	const sampleStride = validatedSampleStride(definition);
	if (!derivative || stepSize === undefined) {
		throw new Error(`Continuous derivative or step size is missing for ${definition.id}.`);
	}
	const state = Float64Array.from(definition.initialState);
	const workspace = createRk4Workspace(state.length);
	let step = 0;
	const advance = (): void => {
		step += 1;
		const maximumDerivative = rk4StepInPlace(
			state,
			stepSize,
			definition.parameters,
			derivative,
			workspace
		);
		validateState(definition, state, step, maximumDerivative);
	};

	for (let index = 0; index < definition.burnInSteps; index += 1) {
		advance();
		emitProgress(definition, 'burn-in', index + 1, definition.burnInSteps, step, options);
	}
	const calibration = new Float64Array(definition.calibrationSteps * 3);
	for (let index = 0; index < definition.calibrationSteps; index += 1) {
		for (let stride = 0; stride < sampleStride; stride += 1) advance();
		writeCoordinateObservation(definition, state, calibration, index);
		emitProgress(definition, 'calibration', index + 1, definition.calibrationSteps, step, options);
	}
	const rawPositions = new Float64Array(pointCount * 3);
	const simulationSteps = new Uint32Array(pointCount);
	const simulationTimes = new Float64Array(pointCount);
	for (let index = 0; index < pointCount; index += 1) {
		for (let stride = 0; stride < sampleStride; stride += 1) advance();
		writeCoordinateObservation(definition, state, rawPositions, index);
		simulationSteps[index] = step;
		simulationTimes[index] = step * stepSize;
		emitProgress(definition, 'trajectory', index + 1, pointCount, step, options);
	}
	return finalizeTrajectory(
		definition,
		pointCount,
		stepSize,
		sampleStride,
		calibration,
		rawPositions,
		simulationSteps,
		simulationTimes
	);
}

function generateHenon(
	definition: AttractorDefinition,
	pointCount: number,
	options: GenerateTrajectoryOptions
): TrajectoryData {
	const sampleStride = validatedSampleStride(definition);
	let state = Float64Array.from(definition.initialState);
	let next = new Float64Array(2);
	let step = 0;
	const advance = (): void => {
		henonMapStep(state, definition.parameters, next);
		const previous = state;
		state = next;
		next = previous;
		step += 1;
		validateState(definition, state, step);
	};
	for (let index = 0; index < definition.burnInSteps; index += 1) {
		advance();
		emitProgress(definition, 'burn-in', index + 1, definition.burnInSteps, step, options);
	}
	const calibration = new Float64Array(definition.calibrationSteps * 3);
	for (let index = 0; index < definition.calibrationSteps; index += 1) {
		for (let stride = 0; stride < sampleStride; stride += 1) advance();
		writeCoordinateObservation(definition, state, calibration, index);
		emitProgress(definition, 'calibration', index + 1, definition.calibrationSteps, step, options);
	}
	const rawPositions = new Float64Array(pointCount * 3);
	const simulationSteps = new Uint32Array(pointCount);
	const simulationTimes = new Float64Array(pointCount);
	for (let index = 0; index < pointCount; index += 1) {
		for (let stride = 0; stride < sampleStride; stride += 1) advance();
		writeCoordinateObservation(definition, state, rawPositions, index);
		simulationSteps[index] = step;
		simulationTimes[index] = step;
		emitProgress(definition, 'trajectory', index + 1, pointCount, step, options);
	}
	return finalizeTrajectory(
		definition,
		pointCount,
		1,
		sampleStride,
		calibration,
		rawPositions,
		simulationSteps,
		simulationTimes
	);
}

function sampleUniformHistory(values: Float64Array, index: number, history: number): number {
	if (index <= 0) return history;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	if (upper >= values.length) throw new RangeError('Delay interpolation requested future state.');
	if (lower === upper) return values[lower];
	const mix = index - lower;
	return values[lower] * (1 - mix) + values[upper] * mix;
}

function generateMackeyGlass(
	definition: AttractorDefinition,
	pointCount: number,
	options: GenerateTrajectoryOptions
): TrajectoryData {
	const stepSize = definition.stepSize;
	if (stepSize === undefined) throw new Error('Mackey–Glass requires a stable step size.');
	const sampleStride = validatedSampleStride(definition);
	const delaySteps = definition.parameters.tau / stepSize;
	const history = definition.parameters.history;
	const totalSteps =
		definition.burnInSteps + (definition.calibrationSteps + pointCount) * sampleStride;
	const values = new Float64Array(totalSteps + 1);
	values[0] = history;
	const calibration = new Float64Array(definition.calibrationSteps * 3);
	const rawPositions = new Float64Array(pointCount * 3);
	const simulationSteps = new Uint32Array(pointCount);
	const simulationTimes = new Float64Array(pointCount);

	for (let index = 0; index < totalSteps; index += 1) {
		const current = values[index];
		const delayed1 = sampleUniformHistory(values, index - delaySteps, history);
		const delayedHalf = sampleUniformHistory(values, index + 0.5 - delaySteps, history);
		const delayedNext = sampleUniformHistory(values, index + 1 - delaySteps, history);
		const k1 = mackeyGlassDerivative(current, delayed1, definition.parameters);
		const k2 = mackeyGlassDerivative(
			current + (stepSize * k1) / 2,
			delayedHalf,
			definition.parameters
		);
		const k3 = mackeyGlassDerivative(
			current + (stepSize * k2) / 2,
			delayedHalf,
			definition.parameters
		);
		const k4 = mackeyGlassDerivative(current + stepSize * k3, delayedNext, definition.parameters);
		values[index + 1] = current + (stepSize / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
		const step = index + 1;
		validateScalarState(
			definition,
			values[step],
			step,
			Math.max(Math.abs(k1), Math.abs(k2), Math.abs(k3), Math.abs(k4))
		);

		if (step <= definition.burnInSteps) {
			emitProgress(definition, 'burn-in', step, definition.burnInSteps, step, options);
			continue;
		}
		const afterBurn = step - definition.burnInSteps;
		if (afterBurn % sampleStride !== 0) continue;
		const sampledIndex = afterBurn / sampleStride - 1;
		const writeEmbedding = (target: Float64Array, pointIndex: number): void => {
			const offset = pointIndex * 3;
			target[offset] = values[step];
			target[offset + 1] = sampleUniformHistory(values, step - delaySteps, history);
			target[offset + 2] = sampleUniformHistory(values, step - 2 * delaySteps, history);
		};
		if (sampledIndex < definition.calibrationSteps) {
			const calibrationIndex = sampledIndex;
			writeEmbedding(calibration, calibrationIndex);
			emitProgress(
				definition,
				'calibration',
				calibrationIndex + 1,
				definition.calibrationSteps,
				step,
				options
			);
			continue;
		}
		const outputIndex = sampledIndex - definition.calibrationSteps;
		writeEmbedding(rawPositions, outputIndex);
		simulationSteps[outputIndex] = step;
		simulationTimes[outputIndex] = step * stepSize;
		emitProgress(definition, 'trajectory', outputIndex + 1, pointCount, step, options);
	}
	return finalizeTrajectory(
		definition,
		pointCount,
		stepSize,
		sampleStride,
		calibration,
		rawPositions,
		simulationSteps,
		simulationTimes
	);
}

export function generateTrajectory(
	attractor: AttractorId | AttractorDefinition,
	options: GenerateTrajectoryOptions = {}
): TrajectoryData {
	const definition = typeof attractor === 'string' ? getAttractorDefinition(attractor) : attractor;
	const pointCount = validatePointCount(options.pointCount ?? definition.pointCount);
	throwIfAborted(definition, 0, options.signal);
	switch (definition.integrator) {
		case 'rk4':
			return generateContinuous(definition, pointCount, options);
		case 'direct-map':
			return generateHenon(definition, pointCount, options);
		case 'delay-rk4':
			return generateMackeyGlass(definition, pointCount, options);
	}
}
