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
	positive,
	validateStepContext
} from './model-utils';

export interface AnisotropicDiffusionParameters {
	/** Diffusion along the first principal axis. Must be strictly positive. */
	readonly majorDiffusion: number;
	/** Diffusion along the orthogonal principal axis. Must be strictly positive. */
	readonly minorDiffusion: number;
	/** Counter-clockwise principal-axis rotation in radians. */
	readonly angle: number;
}

export interface DiffusionTensor2D {
	readonly xx: number;
	readonly xy: number;
	readonly yy: number;
}

export function diffusionTensor(parameters: AnisotropicDiffusionParameters): DiffusionTensor2D {
	const major = positive(parameters.majorDiffusion, 'Major-axis diffusion');
	const minor = positive(parameters.minorDiffusion, 'Minor-axis diffusion');
	if (major < minor) {
		throw new RangeError('Major-axis diffusion must be at least the minor-axis diffusion.');
	}
	const angle = finite(parameters.angle, 'Diffusion-axis angle');
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);
	return {
		xx: major * cosine * cosine + minor * sine * sine,
		xy: (major - minor) * sine * cosine,
		yy: major * sine * sine + minor * cosine * cosine
	};
}

/** Rotated positive-definite diffusion tensor driven by two independent normal streams. */
export class AnisotropicDiffusionModel implements ProcessModel<AnisotropicDiffusionParameters> {
	readonly id = 'anisotropic-diffusion';
	readonly dimensions = 2;
	readonly parameters: Readonly<AnisotropicDiffusionParameters>;

	constructor(parameters: AnisotropicDiffusionParameters) {
		if (parameters.majorDiffusion < parameters.minorDiffusion) {
			throw new RangeError('Major-axis diffusion must be at least the minor-axis diffusion.');
		}
		this.parameters = Object.freeze({
			majorDiffusion: positive(parameters.majorDiffusion, 'Major-axis diffusion'),
			minorDiffusion: positive(parameters.minorDiffusion, 'Minor-axis diffusion'),
			angle: finite(parameters.angle, 'Diffusion-axis angle')
		});
		// Constructing this tensor also documents/checks positive definiteness at runtime.
		diffusionTensor(this.parameters);
	}

	initialize(state: ParticleArrays, context: ProcessInitializationContext): void {
		initializeGaussianCloud(state, context, this.id);
	}

	step(state: ParticleArrays, context: ProcessStepContext): void {
		validateStepContext(context, 'Anisotropic diffusion');
		const { majorDiffusion, minorDiffusion, angle } = this.parameters;
		const majorScale = Math.sqrt(2 * majorDiffusion * context.timestep);
		const minorScale = Math.sqrt(2 * minorDiffusion * context.timestep);
		const cosine = Math.cos(angle);
		const sine = Math.sin(angle);
		const majorNoise = context.random.normal(`${this.id}:principal-major`);
		const minorNoise = context.random.normal(`${this.id}:principal-minor`);
		for (let index = 0; index < state.count; index += 1) {
			const majorStep = majorNoise.next(0, majorScale);
			const minorStep = minorNoise.next(0, minorScale);
			if (state.alive[index] === 0) continue;
			moveParticleBy(
				state,
				index,
				cosine * majorStep - sine * minorStep,
				sine * majorStep + cosine * minorStep,
				context.boundary
			);
			assertFiniteParticle(state, index, 'Anisotropic diffusion');
		}
	}
}

export function anisotropicDiffusionTheory(
	parameters: AnisotropicDiffusionParameters,
	time: number
): { covarianceXX: number; covarianceXY: number; covarianceYY: number; msd: number } {
	nonNegativeTheoryTime(time);
	const tensor = diffusionTensor(parameters);
	return {
		covarianceXX: 2 * tensor.xx * time,
		covarianceXY: 2 * tensor.xy * time,
		covarianceYY: 2 * tensor.yy * time,
		msd: 2 * (tensor.xx + tensor.yy) * time
	};
}

function nonNegativeTheoryTime(time: number): void {
	finite(time, 'Theory time');
	if (time < 0) throw new RangeError('Theory time must be non-negative.');
}
