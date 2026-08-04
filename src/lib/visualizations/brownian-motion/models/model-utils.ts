import { applyBoundaryToParticle, validateBoundaryCondition } from '../boundaries';
import type { ParticleArrays, ProcessInitializationContext, ProcessStepContext } from '../types';

export function finite(value: number, label: string): number {
	if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
	return value;
}

export function nonNegative(value: number, label: string): number {
	finite(value, label);
	if (value < 0) throw new RangeError(`${label} must be non-negative.`);
	return value;
}

export function positive(value: number, label: string): number {
	finite(value, label);
	if (value <= 0) throw new RangeError(`${label} must be strictly positive.`);
	return value;
}

export function positiveInteger(value: number, label: string): number {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new RangeError(`${label} must be a positive integer.`);
	}
	return value;
}

export function validateStepContext(context: ProcessStepContext, label: string): void {
	positive(context.timestep, `${label} timestep`);
	if (!Number.isSafeInteger(context.stepIndex) || context.stepIndex < 1) {
		throw new RangeError(`${label} step index must be a positive integer.`);
	}
	if (!Number.isFinite(context.simulationTime) || context.simulationTime < context.timestep) {
		throw new RangeError(`${label} simulation time is inconsistent with its timestep.`);
	}
}

/** Shared deterministic Gaussian-cloud initialization for two-dimensional models. */
export function initializeGaussianCloud(
	state: ParticleArrays,
	context: ProcessInitializationContext,
	streamPrefix: string
): void {
	const { initialCondition, boundary, random } = context;
	finite(initialCondition.x, 'Initial x coordinate');
	finite(initialCondition.y, 'Initial y coordinate');
	nonNegative(initialCondition.spread, 'Initial spread');
	validateBoundaryCondition(boundary);
	const initialX = random.normal(`${streamPrefix}:initial-x`);
	const initialY = random.normal(`${streamPrefix}:initial-y`);

	for (let index = 0; index < state.count; index += 1) {
		const x = initialX.next(initialCondition.x, initialCondition.spread);
		const y = initialY.next(initialCondition.y, initialCondition.spread);
		state.unwrappedX[index] = x;
		state.unwrappedY[index] = y;
		state.velocityX[index] = 0;
		state.velocityY[index] = 0;
		state.orientation[index] = 0;
		state.firstPassageTime[index] = Number.NaN;
		state.alive[index] = 1;
		applyBoundaryToParticle(state, index, boundary);
		state.originX[index] = state.x[index];
		state.originY[index] = state.y[index];
		state.originUnwrappedX[index] = x;
		state.originUnwrappedY[index] = y;
	}
}

export function assertFiniteParticle(
	state: ParticleArrays,
	index: number,
	modelLabel: string
): void {
	if (
		!Number.isFinite(state.x[index]) ||
		!Number.isFinite(state.y[index]) ||
		!Number.isFinite(state.unwrappedX[index]) ||
		!Number.isFinite(state.unwrappedY[index]) ||
		!Number.isFinite(state.velocityX[index]) ||
		!Number.isFinite(state.velocityY[index]) ||
		!Number.isFinite(state.orientation[index])
	) {
		throw new Error(
			`${modelLabel} produced a non-finite state for particle ${index}; reduce the timestep or revise the parameters.`
		);
	}
}
