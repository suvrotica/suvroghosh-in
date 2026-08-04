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

export interface BrownianBridgeParameters {
	readonly diffusion: number;
	readonly startX: number;
	readonly startY: number;
	readonly endX: number;
	readonly endY: number;
	readonly duration: number;
}

/**
 * Exact conditional finite-step transitions of a Brownian bridge. This is
 * distributionally equivalent to W(t) - t W(T)/T and reaches the endpoint
 * exactly, without a numerically singular Euler bridge drift.
 */
export class BrownianBridgeModel implements ProcessModel<BrownianBridgeParameters> {
	readonly id = 'brownian-bridge';
	readonly dimensions = 2;
	readonly parameters: Readonly<BrownianBridgeParameters>;

	constructor(parameters: BrownianBridgeParameters) {
		this.parameters = Object.freeze({
			diffusion: nonNegative(parameters.diffusion, 'Bridge diffusion coefficient'),
			startX: finite(parameters.startX, 'Bridge start x'),
			startY: finite(parameters.startY, 'Bridge start y'),
			endX: finite(parameters.endX, 'Bridge end x'),
			endY: finite(parameters.endY, 'Bridge end y'),
			duration: positive(parameters.duration, 'Bridge duration')
		});
	}

	initialize(state: ParticleArrays, context: ProcessInitializationContext): void {
		if (context.boundary.mode !== 'unbounded') {
			throw new RangeError('Brownian bridges require an unbounded stage so endpoints stay exact.');
		}
		for (let index = 0; index < state.count; index += 1) {
			state.x[index] = this.parameters.startX;
			state.y[index] = this.parameters.startY;
			state.unwrappedX[index] = this.parameters.startX;
			state.unwrappedY[index] = this.parameters.startY;
			state.originX[index] = this.parameters.startX;
			state.originY[index] = this.parameters.startY;
			state.originUnwrappedX[index] = this.parameters.startX;
			state.originUnwrappedY[index] = this.parameters.startY;
			state.velocityX[index] = 0;
			state.velocityY[index] = 0;
			state.orientation[index] = 0;
			state.firstPassageTime[index] = Number.NaN;
			state.alive[index] = 1;
		}
	}

	step(state: ParticleArrays, context: ProcessStepContext): void {
		validateStepContext(context, 'Brownian bridge');
		if (context.boundary.mode !== 'unbounded') {
			throw new RangeError('Brownian bridges require an unbounded stage.');
		}
		const { duration, diffusion, endX, endY } = this.parameters;
		const previousTime = Math.max(0, context.simulationTime - context.timestep);
		const remaining = Math.max(0, duration - previousTime);
		const endpointTolerance = Number.EPSILON * Math.max(1, duration, context.simulationTime) * 256;
		const reachesEndpoint = context.simulationTime >= duration - endpointTolerance;
		const interval = reachesEndpoint ? remaining : Math.min(context.timestep, remaining);
		const fraction = remaining > 0 ? interval / remaining : 1;
		const variance =
			remaining > 0 ? (2 * diffusion * interval * (remaining - interval)) / remaining : 0;
		const sigma = Math.sqrt(Math.max(0, variance));
		const noiseX = context.random.normal(`${this.id}:conditional-x`);
		const noiseY = context.random.normal(`${this.id}:conditional-y`);

		for (let index = 0; index < state.count; index += 1) {
			const randomX = noiseX.next();
			const randomY = noiseY.next();
			if (state.alive[index] === 0) continue;
			if (remaining === 0 || reachesEndpoint) {
				state.x[index] = endX;
				state.y[index] = endY;
			} else {
				state.x[index] += (endX - state.x[index]) * fraction + sigma * randomX;
				state.y[index] += (endY - state.y[index]) * fraction + sigma * randomY;
			}
			state.unwrappedX[index] = state.x[index];
			state.unwrappedY[index] = state.y[index];
			assertFiniteParticle(state, index, 'Brownian bridge');
		}
	}
}

export function brownianBridgeTheory(
	parameters: BrownianBridgeParameters,
	time: number
): { meanX: number; meanY: number; varianceX: number; varianceY: number } {
	const model = new BrownianBridgeModel(parameters);
	if (!Number.isFinite(time) || time < 0 || time > model.parameters.duration) {
		throw new RangeError('Bridge theory time must lie inside [0, duration].');
	}
	const fraction = time / model.parameters.duration;
	const variance = 2 * model.parameters.diffusion * time * (1 - fraction);
	return {
		meanX: model.parameters.startX + (model.parameters.endX - model.parameters.startX) * fraction,
		meanY: model.parameters.startY + (model.parameters.endY - model.parameters.startY) * fraction,
		varianceX: variance,
		varianceY: variance
	};
}
