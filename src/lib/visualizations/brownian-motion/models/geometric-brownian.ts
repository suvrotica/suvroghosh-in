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

export interface GeometricBrownianParameters {
	readonly initialValue: number;
	readonly growthRate: number;
	readonly volatility: number;
}

/** Exact lognormal update for dS = mu S dt + sigma S dW. */
export class GeometricBrownianModel implements ProcessModel<GeometricBrownianParameters> {
	readonly id = 'geometric-brownian';
	readonly dimensions = 1;
	readonly parameters: Readonly<GeometricBrownianParameters>;

	constructor(parameters: GeometricBrownianParameters) {
		this.parameters = Object.freeze({
			initialValue: positive(parameters.initialValue, 'Geometric Brownian initial value'),
			growthRate: finite(parameters.growthRate, 'Geometric Brownian growth rate'),
			volatility: nonNegative(parameters.volatility, 'Geometric Brownian volatility')
		});
	}

	initialize(state: ParticleArrays, context: ProcessInitializationContext): void {
		if (context.boundary.mode !== 'unbounded') {
			throw new RangeError('Geometric Brownian motion does not use spatial stage boundaries.');
		}
		for (let index = 0; index < state.count; index += 1) {
			state.x[index] = this.parameters.initialValue;
			state.y[index] = 0;
			state.unwrappedX[index] = this.parameters.initialValue;
			state.unwrappedY[index] = 0;
			state.originX[index] = this.parameters.initialValue;
			state.originY[index] = 0;
			state.originUnwrappedX[index] = this.parameters.initialValue;
			state.originUnwrappedY[index] = 0;
			state.velocityX[index] = 0;
			state.velocityY[index] = 0;
			state.orientation[index] = 0;
			state.firstPassageTime[index] = Number.NaN;
			state.alive[index] = 1;
		}
	}

	step(state: ParticleArrays, context: ProcessStepContext): void {
		validateStepContext(context, 'Geometric Brownian');
		if (context.boundary.mode !== 'unbounded') {
			throw new RangeError('Geometric Brownian motion does not use spatial stage boundaries.');
		}
		const { growthRate, volatility } = this.parameters;
		const deterministicExponent = (growthRate - 0.5 * volatility * volatility) * context.timestep;
		const randomScale = volatility * Math.sqrt(context.timestep);
		const noise = context.random.normal(`${this.id}:log-return`);
		for (let index = 0; index < state.count; index += 1) {
			const exponent = deterministicExponent + randomScale * noise.next();
			if (state.alive[index] === 0) continue;
			const next = state.x[index] * Math.exp(exponent);
			if (!Number.isFinite(next) || next <= 0) {
				throw new Error(
					'Geometric Brownian motion exceeded the positive finite floating-point range; reduce the timestep, volatility, or duration.'
				);
			}
			state.x[index] = next;
			state.unwrappedX[index] = next;
			assertFiniteParticle(state, index, 'Geometric Brownian');
		}
	}
}

export function geometricBrownianTheory(
	parameters: GeometricBrownianParameters,
	time: number
): { mean: number; median: number; variance: number; logMean: number; logVariance: number } {
	if (!Number.isFinite(time) || time < 0) throw new RangeError('Theory time must be non-negative.');
	const model = new GeometricBrownianModel(parameters);
	const { initialValue, growthRate, volatility } = model.parameters;
	const logMean = Math.log(initialValue) + (growthRate - 0.5 * volatility ** 2) * time;
	const logVariance = volatility ** 2 * time;
	const mean = initialValue * Math.exp(growthRate * time);
	return {
		mean,
		median: Math.exp(logMean),
		variance: mean ** 2 * (Math.exp(logVariance) - 1),
		logMean,
		logVariance
	};
}
