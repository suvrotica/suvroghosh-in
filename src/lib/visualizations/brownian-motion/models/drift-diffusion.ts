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
	validateStepContext
} from './model-utils';

export interface DriftDiffusionParameters {
	/** Diffusion coefficient in world-units² per simulated second. */
	readonly diffusion: number;
	readonly driftX: number;
	readonly driftY: number;
}

/** Constant advection with Brownian broadening: dX = v dt + sqrt(2D) dW. */
export class DriftDiffusionModel implements ProcessModel<DriftDiffusionParameters> {
	readonly id = 'drift-diffusion';
	readonly dimensions = 2;
	readonly parameters: Readonly<DriftDiffusionParameters>;

	constructor(parameters: DriftDiffusionParameters) {
		this.parameters = Object.freeze({
			diffusion: nonNegative(parameters.diffusion, 'Diffusion coefficient'),
			driftX: finite(parameters.driftX, 'Horizontal drift'),
			driftY: finite(parameters.driftY, 'Vertical drift')
		});
	}

	initialize(state: ParticleArrays, context: ProcessInitializationContext): void {
		initializeGaussianCloud(state, context, this.id);
	}

	step(state: ParticleArrays, context: ProcessStepContext): void {
		validateStepContext(context, 'Drift-diffusion');
		const { diffusion, driftX, driftY } = this.parameters;
		const sigma = Math.sqrt(2 * diffusion * context.timestep);
		const noiseX = context.random.normal(`${this.id}:motion-x`);
		const noiseY = context.random.normal(`${this.id}:motion-y`);
		for (let index = 0; index < state.count; index += 1) {
			const deltaX = driftX * context.timestep + noiseX.next(0, sigma);
			const deltaY = driftY * context.timestep + noiseY.next(0, sigma);
			if (state.alive[index] === 0) continue;
			moveParticleBy(state, index, deltaX, deltaY, context.boundary);
			assertFiniteParticle(state, index, 'Drift-diffusion');
		}
	}
}

export function driftDiffusionTheory(
	parameters: DriftDiffusionParameters,
	time: number,
	initialX = 0,
	initialY = 0
): { meanX: number; meanY: number; varianceX: number; varianceY: number; msdAboutOrigin: number } {
	nonNegative(time, 'Theory time');
	const model = new DriftDiffusionModel(parameters);
	const { diffusion, driftX, driftY } = model.parameters;
	return {
		meanX: initialX + driftX * time,
		meanY: initialY + driftY * time,
		varianceX: 2 * diffusion * time,
		varianceY: 2 * diffusion * time,
		msdAboutOrigin: 2 * diffusion * time * 2 + (driftX * time) ** 2 + (driftY * time) ** 2
	};
}
