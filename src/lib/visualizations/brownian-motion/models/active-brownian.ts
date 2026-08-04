import { moveParticleBy } from '../boundaries';
import type {
	ParticleArrays,
	ProcessInitializationContext,
	ProcessModel,
	ProcessStepContext
} from '../types';
import {
	assertFiniteParticle,
	initializeGaussianCloud,
	nonNegative,
	validateStepContext
} from './model-utils';
import {
	resolveCircularObstacleMove,
	type CircleObstacle,
	validateCircleObstacle
} from './obstacles';

export interface ActiveBrownianParameters {
	readonly propulsionSpeed: number;
	readonly translationalDiffusion: number;
	readonly rotationalDiffusion: number;
	readonly obstacles: readonly CircleObstacle[];
}

/** Minimal idealized active particle with rotational and translational Brownian noise. */
export class ActiveBrownianModel implements ProcessModel<ActiveBrownianParameters> {
	readonly id = 'active-brownian';
	readonly dimensions = 2;
	readonly parameters: Readonly<ActiveBrownianParameters>;

	constructor(parameters: ActiveBrownianParameters) {
		if (!Array.isArray(parameters.obstacles)) throw new RangeError('Obstacles must be an array.');
		this.parameters = Object.freeze({
			propulsionSpeed: nonNegative(parameters.propulsionSpeed, 'Propulsion speed'),
			translationalDiffusion: nonNegative(
				parameters.translationalDiffusion,
				'Translational diffusion'
			),
			rotationalDiffusion: nonNegative(parameters.rotationalDiffusion, 'Rotational diffusion'),
			obstacles: Object.freeze(parameters.obstacles.map(validateCircleObstacle))
		});
	}

	initialize(state: ParticleArrays, context: ProcessInitializationContext): void {
		initializeGaussianCloud(state, context, this.id);
		const orientations = context.random.uniform(`${this.id}:initial-orientation`);
		for (let index = 0; index < state.count; index += 1) {
			state.orientation[index] = 2 * Math.PI * orientations.next();
			const resolved = resolveCircularObstacleMove(
				state.x[index],
				state.y[index],
				0,
				0,
				this.parameters.obstacles
			);
			if (resolved.collided) {
				moveParticleBy(state, index, resolved.deltaX, resolved.deltaY, context.boundary);
				state.originX[index] = state.x[index];
				state.originY[index] = state.y[index];
				state.originUnwrappedX[index] = state.unwrappedX[index];
				state.originUnwrappedY[index] = state.unwrappedY[index];
			}
		}
	}

	step(state: ParticleArrays, context: ProcessStepContext): void {
		validateStepContext(context, 'Active Brownian');
		const { propulsionSpeed, translationalDiffusion, rotationalDiffusion, obstacles } =
			this.parameters;
		const translationalScale = Math.sqrt(2 * translationalDiffusion * context.timestep);
		const rotationalScale = Math.sqrt(2 * rotationalDiffusion * context.timestep);
		const noiseX = context.random.normal(`${this.id}:translation-x`);
		const noiseY = context.random.normal(`${this.id}:translation-y`);
		const noiseAngle = context.random.normal(`${this.id}:rotation`);

		for (let index = 0; index < state.count; index += 1) {
			const randomX = noiseX.next();
			const randomY = noiseY.next();
			const randomAngle = noiseAngle.next();
			if (state.alive[index] === 0) continue;
			const angle = state.orientation[index];
			const propulsionX = propulsionSpeed * Math.cos(angle);
			const propulsionY = propulsionSpeed * Math.sin(angle);
			const proposedX = propulsionX * context.timestep + translationalScale * randomX;
			const proposedY = propulsionY * context.timestep + translationalScale * randomY;
			const resolved = resolveCircularObstacleMove(
				state.x[index],
				state.y[index],
				proposedX,
				proposedY,
				obstacles
			);
			moveParticleBy(state, index, resolved.deltaX, resolved.deltaY, context.boundary);
			state.orientation[index] = angle + rotationalScale * randomAngle;
			state.velocityX[index] = propulsionX;
			state.velocityY[index] = propulsionY;
			assertFiniteParticle(state, index, 'Active Brownian');
		}
	}
}

export interface ActiveBrownianTheory {
	readonly msd: number;
	readonly effectiveDiffusion: number | null;
	readonly persistenceTime: number | null;
	readonly persistenceLength: number | null;
}

export function activeBrownianTheory(
	parameters: ActiveBrownianParameters,
	time: number
): ActiveBrownianTheory {
	if (!Number.isFinite(time) || time < 0) throw new RangeError('Theory time must be non-negative.');
	const model = new ActiveBrownianModel(parameters);
	const { propulsionSpeed, translationalDiffusion, rotationalDiffusion } = model.parameters;
	if (rotationalDiffusion === 0) {
		return {
			msd: 4 * translationalDiffusion * time + propulsionSpeed ** 2 * time ** 2,
			effectiveDiffusion: null,
			persistenceTime: null,
			persistenceLength: null
		};
	}
	return {
		msd:
			4 * translationalDiffusion * time +
			(2 *
				propulsionSpeed ** 2 *
				(rotationalDiffusion * time + Math.exp(-rotationalDiffusion * time) - 1)) /
				rotationalDiffusion ** 2,
		effectiveDiffusion: translationalDiffusion + propulsionSpeed ** 2 / (2 * rotationalDiffusion),
		persistenceTime: 1 / rotationalDiffusion,
		persistenceLength: propulsionSpeed / rotationalDiffusion
	};
}
