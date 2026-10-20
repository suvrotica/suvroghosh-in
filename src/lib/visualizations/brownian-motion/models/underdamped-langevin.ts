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

export type InitialVelocityDistribution = 'equilibrium' | 'zero';

export interface UnderdampedLangevinParameters {
	readonly mass: number;
	readonly drag: number;
	/** Dimensionless k_B T in energy units. */
	readonly thermalEnergy: number;
	readonly forceX: number;
	readonly forceY: number;
	readonly initialVelocity: InitialVelocityDistribution;
}

/**
 * Free underdamped Langevin dynamics. Each velocity uses its exact OU
 * transition; position uses the old/new-velocity trapezoid. This stable
 * substep avoids the explosive explicit-Euler velocity update at large dt.
 */
export class UnderdampedLangevinModel implements ProcessModel<UnderdampedLangevinParameters> {
	readonly id = 'underdamped-langevin';
	readonly dimensions = 2;
	readonly parameters: Readonly<UnderdampedLangevinParameters>;

	constructor(parameters: UnderdampedLangevinParameters) {
		if (parameters.initialVelocity !== 'equilibrium' && parameters.initialVelocity !== 'zero') {
			throw new RangeError('Initial velocity must be "equilibrium" or "zero".');
		}
		this.parameters = Object.freeze({
			mass: positive(parameters.mass, 'Particle mass'),
			drag: positive(parameters.drag, 'Drag coefficient'),
			thermalEnergy: nonNegative(parameters.thermalEnergy, 'Thermal energy'),
			forceX: finite(parameters.forceX, 'Horizontal force'),
			forceY: finite(parameters.forceY, 'Vertical force'),
			initialVelocity: parameters.initialVelocity
		});
	}

	initialize(state: ParticleArrays, context: ProcessInitializationContext): void {
		initializeGaussianCloud(state, context, this.id);
		const sigma = Math.sqrt(this.parameters.thermalEnergy / this.parameters.mass);
		const velocityX = context.random.normal(`${this.id}:initial-velocity-x`);
		const velocityY = context.random.normal(`${this.id}:initial-velocity-y`);
		for (let index = 0; index < state.count; index += 1) {
			const sampledX = velocityX.next();
			const sampledY = velocityY.next();
			if (this.parameters.initialVelocity === 'equilibrium') {
				state.velocityX[index] = sigma * sampledX;
				state.velocityY[index] = sigma * sampledY;
			}
		}
	}

	step(state: ParticleArrays, context: ProcessStepContext): void {
		validateStepContext(context, 'Underdamped Langevin');
		const { mass, drag, thermalEnergy, forceX, forceY } = this.parameters;
		const decay = Math.exp((-drag * context.timestep) / mass);
		const velocityNoiseScale = Math.sqrt((thermalEnergy / mass) * (1 - decay * decay));
		const terminalX = forceX / drag;
		const terminalY = forceY / drag;
		const noiseX = context.random.normal(`${this.id}:velocity-x`);
		const noiseY = context.random.normal(`${this.id}:velocity-y`);

		for (let index = 0; index < state.count; index += 1) {
			const randomX = noiseX.next();
			const randomY = noiseY.next();
			if (state.alive[index] === 0) continue;
			const oldVelocityX = state.velocityX[index];
			const oldVelocityY = state.velocityY[index];
			const nextVelocityX =
				terminalX + (oldVelocityX - terminalX) * decay + velocityNoiseScale * randomX;
			const nextVelocityY =
				terminalY + (oldVelocityY - terminalY) * decay + velocityNoiseScale * randomY;
			const movement = moveParticleBy(
				state,
				index,
				0.5 * (oldVelocityX + nextVelocityX) * context.timestep,
				0.5 * (oldVelocityY + nextVelocityY) * context.timestep,
				context.boundary
			);
			state.velocityX[index] = nextVelocityX * movement.reflectedX;
			state.velocityY[index] = nextVelocityY * movement.reflectedY;
			assertFiniteParticle(state, index, 'Underdamped Langevin');
		}
	}
}

export interface UnderdampedTheory {
	readonly relaxationTime: number;
	readonly longTimeDiffusion: number;
	readonly msd: number;
	readonly velocityVariancePerAxis: number;
	readonly velocityAutocorrelationPerAxis: number;
}

/** Unbounded constant-force theory, with the selected initial velocity ensemble. */
export function underdampedLangevinTheory(
	parameters: UnderdampedLangevinParameters,
	time: number
): UnderdampedTheory {
	nonNegative(time, 'Theory time');
	const model = new UnderdampedLangevinModel(parameters);
	const { mass, drag, thermalEnergy, forceX, forceY, initialVelocity } = model.parameters;
	const relaxationTime = mass / drag;
	const longTimeDiffusion = thermalEnergy / drag;
	const u = time / relaxationTime;
	const oneMinusDecay = -Math.expm1(-u);
	// Series avoid cancellation of the t² equilibrium and t³ cold-start limits.
	const equilibriumIntegral =
		u < 1e-3 ? u * u * (0.5 + u * (-1 / 6 + u * (1 / 24 - u / 120))) : u - oneMinusDecay;
	const coldIntegral =
		u < 1e-3
			? u ** 3 * (1 / 3 + u * (-1 / 4 + u * (7 / 60 - u / 24)))
			: u - 2 * oneMinusDecay - 0.5 * Math.expm1(-2 * u);
	const displacementIntegral = relaxationTime * equilibriumIntegral;
	const driftMsd = ((forceX / drag) ** 2 + (forceY / drag) ** 2) * displacementIntegral ** 2;
	const equilibriumVariance = thermalEnergy / mass;
	const velocityVariancePerAxis =
		initialVelocity === 'equilibrium'
			? equilibriumVariance
			: equilibriumVariance * -Math.expm1(-2 * u);
	return {
		relaxationTime,
		longTimeDiffusion,
		msd:
			4 *
				longTimeDiffusion *
				relaxationTime *
				(initialVelocity === 'equilibrium' ? equilibriumIntegral : coldIntegral) +
			driftMsd,
		velocityVariancePerAxis,
		velocityAutocorrelationPerAxis:
			initialVelocity === 'equilibrium' ? equilibriumVariance * Math.exp(-u) : 0
	};
}
