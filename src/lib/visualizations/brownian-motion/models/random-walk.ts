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
	positive,
	positiveInteger,
	validateStepContext
} from './model-utils';

export type RandomWalkGeometry = 'lattice' | 'isotropic';

export interface RandomWalkParameters {
	readonly dimensions: 1 | 2;
	readonly geometry: RandomWalkGeometry;
	readonly stepLength: number;
	readonly timePerStep: number;
	/** Number of microscopic moves accumulated before display-space position changes. */
	readonly coarseGraining: number;
}

const PENDING_X = 'random-walk:pending-x';
const PENDING_Y = 'random-walk:pending-y';

/** A clocked lattice/isotropic walk whose coarse-graining never changes its microscopic draws. */
export class RandomWalkModel implements ProcessModel<RandomWalkParameters> {
	readonly id = 'random-walk';
	readonly dimensions: 1 | 2;
	readonly parameters: Readonly<RandomWalkParameters>;

	constructor(parameters: RandomWalkParameters) {
		if (parameters.dimensions !== 1 && parameters.dimensions !== 2) {
			throw new RangeError('Random-walk dimensions must be one or two.');
		}
		if (parameters.geometry !== 'lattice' && parameters.geometry !== 'isotropic') {
			throw new RangeError('Random-walk geometry must be lattice or isotropic.');
		}
		if (parameters.dimensions === 1 && parameters.geometry === 'isotropic') {
			throw new RangeError('Isotropic-angle steps are defined only for the two-dimensional walk.');
		}
		this.dimensions = parameters.dimensions;
		this.parameters = Object.freeze({
			dimensions: parameters.dimensions,
			geometry: parameters.geometry,
			stepLength: positive(parameters.stepLength, 'Random-walk step length'),
			timePerStep: positive(parameters.timePerStep, 'Random-walk time per step'),
			coarseGraining: positiveInteger(parameters.coarseGraining, 'Coarse-graining factor')
		});
	}

	initialize(state: ParticleArrays, context: ProcessInitializationContext): void {
		initializeGaussianCloud(state, context, this.id);
		state.modelData[PENDING_X] = new Float64Array(state.count);
		state.modelData[PENDING_Y] = new Float64Array(state.count);
	}

	step(state: ParticleArrays, context: ProcessStepContext): void {
		validateStepContext(context, 'Discrete random walk');
		const { dimensions, geometry, stepLength, timePerStep, coarseGraining } = this.parameters;
		const previousTime = context.simulationTime - context.timestep;
		const tolerance = Number.EPSILON * Math.max(1, context.simulationTime / timePerStep) * 8;
		const previousMicroscopicCount = Math.floor(previousTime / timePerStep + tolerance);
		const currentMicroscopicCount = Math.floor(context.simulationTime / timePerStep + tolerance);
		const due = currentMicroscopicCount - previousMicroscopicCount;
		if (due < 0 || due > 1_000_000) {
			throw new RangeError(
				'Discrete random-walk resolution requires too many microscopic moves in one engine step.'
			);
		}
		const pendingX = state.modelData[PENDING_X];
		const pendingY = state.modelData[PENDING_Y];
		if (!(pendingX instanceof Float64Array) || !(pendingY instanceof Float64Array)) {
			throw new Error('Random-walk scratch arrays were not initialized.');
		}
		const directions = context.random.uniform(`${this.id}:direction`);

		for (let microscopic = 0; microscopic < due; microscopic += 1) {
			const absoluteStep = previousMicroscopicCount + microscopic + 1;
			for (let index = 0; index < state.count; index += 1) {
				const uniform = directions.next();
				if (dimensions === 1) {
					pendingX[index] += uniform < 0.5 ? -stepLength : stepLength;
				} else if (geometry === 'isotropic') {
					const angle = 2 * Math.PI * uniform;
					pendingX[index] += stepLength * Math.cos(angle);
					pendingY[index] += stepLength * Math.sin(angle);
				} else {
					const direction = Math.min(3, Math.floor(uniform * 4));
					if (direction === 0) pendingX[index] += stepLength;
					else if (direction === 1) pendingX[index] -= stepLength;
					else if (direction === 2) pendingY[index] += stepLength;
					else pendingY[index] -= stepLength;
				}
			}

			if (absoluteStep % coarseGraining !== 0) continue;
			for (let index = 0; index < state.count; index += 1) {
				const deltaX = pendingX[index];
				const deltaY = pendingY[index];
				pendingX[index] = 0;
				pendingY[index] = 0;
				if (state.alive[index] === 0) continue;
				moveParticleBy(state, index, deltaX, deltaY, context.boundary);
				assertFiniteParticle(state, index, 'Discrete random walk');
			}
		}
	}
}

export function randomWalkDiffusion(parameters: RandomWalkParameters): number {
	const model = new RandomWalkModel(parameters);
	return (
		model.parameters.stepLength ** 2 /
		(2 * model.parameters.dimensions * model.parameters.timePerStep)
	);
}

export function randomWalkTheory(
	parameters: RandomWalkParameters,
	time: number
): { diffusion: number; msd: number; variancePerAxis: number } {
	if (!Number.isFinite(time) || time < 0) throw new RangeError('Theory time must be non-negative.');
	const diffusion = randomWalkDiffusion(parameters);
	return {
		diffusion,
		msd: 2 * parameters.dimensions * diffusion * time,
		variancePerAxis: 2 * diffusion * time
	};
}
