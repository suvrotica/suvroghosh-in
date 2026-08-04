import { applyBoundaryToParticle, moveParticleBy, validateBoundaryCondition } from '../boundaries';
import type {
	ParticleArrays,
	ProcessInitializationContext,
	ProcessModel,
	ProcessStepContext
} from '../types';

export interface FreeBrownianParameters {
	/** Diffusion coefficient in world-units² per simulated second. */
	readonly diffusion: number;
}

function validateDiffusion(diffusion: number): number {
	if (!Number.isFinite(diffusion) || diffusion < 0) {
		throw new RangeError('Diffusion coefficient must be finite and non-negative.');
	}
	return diffusion;
}

/** Two-dimensional overdamped Brownian motion: dX = sqrt(2D) dW. */
export class FreeBrownianModel implements ProcessModel<FreeBrownianParameters> {
	readonly id = 'free-brownian';
	readonly dimensions = 2;
	readonly parameters: Readonly<FreeBrownianParameters>;

	constructor(parameters: FreeBrownianParameters) {
		this.parameters = Object.freeze({ diffusion: validateDiffusion(parameters.diffusion) });
	}

	initialize(state: ParticleArrays, context: ProcessInitializationContext): void {
		const { initialCondition, boundary, random } = context;
		if (
			!Number.isFinite(initialCondition.x) ||
			!Number.isFinite(initialCondition.y) ||
			!Number.isFinite(initialCondition.spread) ||
			initialCondition.spread < 0
		) {
			throw new RangeError('Initial position and spread must be finite, with non-negative spread.');
		}
		validateBoundaryCondition(boundary);
		const initialX = random.normal('free-brownian:initial-x');
		const initialY = random.normal('free-brownian:initial-y');

		for (let index = 0; index < state.count; index += 1) {
			const x = initialX.next(initialCondition.x, initialCondition.spread);
			const y = initialY.next(initialCondition.y, initialCondition.spread);
			state.unwrappedX[index] = x;
			state.unwrappedY[index] = y;
			state.alive[index] = 1;
			applyBoundaryToParticle(state, index, boundary);
			state.originX[index] = state.x[index];
			state.originY[index] = state.y[index];
			state.originUnwrappedX[index] = x;
			state.originUnwrappedY[index] = y;
		}
	}

	step(state: ParticleArrays, context: ProcessStepContext): void {
		if (!Number.isFinite(context.timestep) || context.timestep <= 0) {
			throw new RangeError('Free Brownian steps require a finite positive timestep.');
		}
		const standardDeviation = Math.sqrt(2 * this.parameters.diffusion * context.timestep);
		const noiseX = context.random.normal('free-brownian:motion-x');
		const noiseY = context.random.normal('free-brownian:motion-y');

		for (let index = 0; index < state.count; index += 1) {
			// Consume a stable pair for every particle, including absorbed particles,
			// so boundary outcomes cannot reassign future noise to another trajectory.
			const deltaX = noiseX.next(0, standardDeviation);
			const deltaY = noiseY.next(0, standardDeviation);
			if (state.alive[index] === 0) continue;
			moveParticleBy(state, index, deltaX, deltaY, context.boundary);
		}
	}
}

export function freeBrownianTheory(
	parameters: FreeBrownianParameters,
	time: number
): { varianceX: number; varianceY: number; msd: number } {
	if (!Number.isFinite(time) || time < 0) throw new RangeError('Theory time must be non-negative.');
	const diffusion = validateDiffusion(parameters.diffusion);
	return {
		varianceX: 2 * diffusion * time,
		varianceY: 2 * diffusion * time,
		msd: 4 * diffusion * time
	};
}
