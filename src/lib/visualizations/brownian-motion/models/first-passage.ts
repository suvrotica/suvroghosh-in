import type {
	ParticleArrays,
	ProcessInitializationContext,
	ProcessModel,
	ProcessStepContext
} from '../types';
import {
	assertFiniteParticle,
	finite,
	nonNegative,
	positive,
	validateStepContext
} from './model-utils';

export interface FirstPassageParameters {
	readonly diffusion: number;
	readonly wallX: number;
	readonly startDistance: number;
	/** Correct crossings hidden between positive sampled endpoints. */
	readonly bridgeCorrection: boolean;
}

/** Accurate to roughly 1e-7, sufficient for overlays and ensemble tests. */
function errorFunction(value: number): number {
	finite(value, 'Error-function argument');
	const sign = value < 0 ? -1 : 1;
	const x = Math.abs(value);
	const t = 1 / (1 + 0.3275911 * x);
	const polynomial =
		((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
	return sign * (1 - polynomial * Math.exp(-x * x));
}

/** One-dimensional Brownian arrival at an absorbing wall. */
export class FirstPassageModel implements ProcessModel<FirstPassageParameters> {
	readonly id = 'first-passage';
	readonly dimensions = 1;
	readonly parameters: Readonly<FirstPassageParameters>;

	constructor(parameters: FirstPassageParameters) {
		if (typeof parameters.bridgeCorrection !== 'boolean') {
			throw new RangeError('First-passage bridge correction must be boolean.');
		}
		this.parameters = Object.freeze({
			diffusion: nonNegative(parameters.diffusion, 'First-passage diffusion'),
			wallX: finite(parameters.wallX, 'Absorbing-wall position'),
			startDistance: positive(parameters.startDistance, 'Starting distance'),
			bridgeCorrection: parameters.bridgeCorrection
		});
	}

	initialize(state: ParticleArrays, context: ProcessInitializationContext): void {
		if (context.boundary.mode !== 'unbounded') {
			throw new RangeError('The half-line first-passage model owns its absorbing wall.');
		}
		const startX = this.parameters.wallX + this.parameters.startDistance;
		const y = finite(context.initialCondition.y, 'First-passage display y');
		for (let index = 0; index < state.count; index += 1) {
			state.x[index] = startX;
			state.y[index] = y;
			state.unwrappedX[index] = startX;
			state.unwrappedY[index] = y;
			state.originX[index] = startX;
			state.originY[index] = y;
			state.originUnwrappedX[index] = startX;
			state.originUnwrappedY[index] = y;
			state.velocityX[index] = 0;
			state.velocityY[index] = 0;
			state.orientation[index] = 0;
			state.firstPassageTime[index] = Number.NaN;
			state.alive[index] = 1;
		}
	}

	step(state: ParticleArrays, context: ProcessStepContext): void {
		validateStepContext(context, 'First passage');
		if (context.boundary.mode !== 'unbounded') {
			throw new RangeError('The half-line first-passage model owns its absorbing wall.');
		}
		const { diffusion, wallX, bridgeCorrection } = this.parameters;
		const sigma = Math.sqrt(2 * diffusion * context.timestep);
		const noise = context.random.normal(`${this.id}:motion-x`);
		const crossings = context.random.uniform(`${this.id}:bridge-crossing`);
		const previousTime = context.simulationTime - context.timestep;

		for (let index = 0; index < state.count; index += 1) {
			const randomStep = sigma * noise.next();
			const crossingUniform = crossings.next();
			if (state.alive[index] === 0) continue;
			const oldX = state.x[index];
			const proposedX = oldX + randomStep;
			const oldDistance = oldX - wallX;
			const nextDistance = proposedX - wallX;
			const endpointCrossing = nextDistance <= 0;
			const hiddenCrossingProbability =
				diffusion > 0 && nextDistance > 0
					? Math.exp((-oldDistance * nextDistance) / (diffusion * context.timestep))
					: 0;
			const hiddenCrossing =
				bridgeCorrection && !endpointCrossing && crossingUniform < hiddenCrossingProbability;
			state.unwrappedX[index] = proposedX;
			if (endpointCrossing || hiddenCrossing) {
				const fraction = endpointCrossing
					? oldDistance / (oldDistance - nextDistance)
					: oldDistance / (oldDistance + nextDistance);
				state.firstPassageTime[index] =
					previousTime + Math.max(0, Math.min(1, fraction)) * context.timestep;
				state.x[index] = wallX;
				state.alive[index] = 0;
			} else {
				state.x[index] = proposedX;
			}
			assertFiniteParticle(state, index, 'First passage');
		}
	}
}

export function firstPassageSurvival(parameters: FirstPassageParameters, time: number): number {
	if (!Number.isFinite(time) || time < 0) throw new RangeError('Theory time must be non-negative.');
	const model = new FirstPassageModel(parameters);
	if (time === 0 || model.parameters.diffusion === 0) return 1;
	return errorFunction(
		model.parameters.startDistance / Math.sqrt(4 * model.parameters.diffusion * time)
	);
}

export function firstPassageDensity(parameters: FirstPassageParameters, time: number): number {
	if (!Number.isFinite(time) || time < 0) throw new RangeError('Theory time must be non-negative.');
	const model = new FirstPassageModel(parameters);
	const { diffusion, startDistance } = model.parameters;
	if (time === 0 || diffusion === 0) return 0;
	return (
		(startDistance / Math.sqrt(4 * Math.PI * diffusion * time ** 3)) *
		Math.exp(-(startDistance * startDistance) / (4 * diffusion * time))
	);
}
