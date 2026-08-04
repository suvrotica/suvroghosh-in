import { moveParticleBy } from '../boundaries';
import type {
	ParticleArrays,
	ProcessInitializationContext,
	ProcessModel,
	ProcessStepContext
} from '../types';
import {
	assertFiniteParticle,
	finite,
	initializeGaussianCloud,
	nonNegative,
	positive,
	validateStepContext
} from './model-utils';

export interface OrnsteinUhlenbeckParameters {
	readonly restoringRate: number;
	readonly diffusion: number;
	readonly equilibriumX: number;
	readonly equilibriumY: number;
}

/**
 * Exact finite-step transition of a position OU process. Unlike Euler--Maruyama,
 * this remains stable when the timestep is not tiny relative to 1/lambda.
 */
export class OrnsteinUhlenbeckModel implements ProcessModel<OrnsteinUhlenbeckParameters> {
	readonly id = 'ornstein-uhlenbeck';
	readonly dimensions = 2;
	readonly parameters: Readonly<OrnsteinUhlenbeckParameters>;

	constructor(parameters: OrnsteinUhlenbeckParameters) {
		this.parameters = Object.freeze({
			restoringRate: positive(parameters.restoringRate, 'Restoring rate'),
			diffusion: nonNegative(parameters.diffusion, 'Diffusion coefficient'),
			equilibriumX: finite(parameters.equilibriumX, 'Equilibrium x coordinate'),
			equilibriumY: finite(parameters.equilibriumY, 'Equilibrium y coordinate')
		});
	}

	initialize(state: ParticleArrays, context: ProcessInitializationContext): void {
		initializeGaussianCloud(state, context, this.id);
	}

	step(state: ParticleArrays, context: ProcessStepContext): void {
		validateStepContext(context, 'Ornstein-Uhlenbeck');
		const { restoringRate, diffusion, equilibriumX, equilibriumY } = this.parameters;
		const decay = Math.exp(-restoringRate * context.timestep);
		const variance = (diffusion / restoringRate) * (1 - decay * decay);
		const sigma = Math.sqrt(Math.max(0, variance));
		const noiseX = context.random.normal(`${this.id}:motion-x`);
		const noiseY = context.random.normal(`${this.id}:motion-y`);

		for (let index = 0; index < state.count; index += 1) {
			const randomX = noiseX.next(0, sigma);
			const randomY = noiseY.next(0, sigma);
			if (state.alive[index] === 0) continue;
			const nextX = equilibriumX + (state.x[index] - equilibriumX) * decay + randomX;
			const nextY = equilibriumY + (state.y[index] - equilibriumY) * decay + randomY;
			moveParticleBy(
				state,
				index,
				nextX - state.x[index],
				nextY - state.y[index],
				context.boundary
			);
			assertFiniteParticle(state, index, 'Ornstein-Uhlenbeck');
		}
	}
}

export function ornsteinUhlenbeckTheory(
	parameters: OrnsteinUhlenbeckParameters,
	time: number,
	initialX = 0,
	initialY = 0
): {
	meanX: number;
	meanY: number;
	varianceX: number;
	varianceY: number;
	stationaryVariance: number;
	relaxationTime: number;
} {
	nonNegative(time, 'Theory time');
	const model = new OrnsteinUhlenbeckModel(parameters);
	const { restoringRate, diffusion, equilibriumX, equilibriumY } = model.parameters;
	const decay = Math.exp(-restoringRate * time);
	const stationaryVariance = diffusion / restoringRate;
	const variance = stationaryVariance * (1 - decay * decay);
	return {
		meanX: equilibriumX + (initialX - equilibriumX) * decay,
		meanY: equilibriumY + (initialY - equilibriumY) * decay,
		varianceX: variance,
		varianceY: variance,
		stationaryVariance,
		relaxationTime: 1 / restoringRate
	};
}
