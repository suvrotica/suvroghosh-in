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
	validateStepContext
} from './model-utils';

export interface LevyFlightParameters {
	readonly dimensions: 1 | 2;
	/** Symmetric-stable index alpha in (0, 2]. Variance diverges when alpha < 2. */
	readonly stability: number;
	/** Stable scale per simulated-second^(1/alpha). */
	readonly scale: number;
}

const UINT32_RANGE = 0x1_0000_0000;

/** Map the seeded generator's closed/open output to a fixed-cost open interval. */
function midpointOpenUniform(value: number): number {
	if (!Number.isFinite(value) || value < 0 || value >= 1) {
		throw new RangeError('Stable sampling requires uniform values in [0, 1).');
	}
	return Math.min(UINT32_RANGE - 0.5, value * UINT32_RANGE + 0.5) / UINT32_RANGE;
}

/**
 * Chambers--Mallows--Stuck sampler for a centred symmetric alpha-stable law
 * with characteristic function exp(-|k|^alpha). It always consumes exactly
 * two supplied uniforms. At alpha=1 it reduces to a standard Cauchy; at
 * alpha=2 it is Gaussian with variance two.
 */
export function sampleSymmetricStable(
	stability: number,
	angleUniform: number,
	exponentialUniform: number
): number {
	if (!Number.isFinite(stability) || stability <= 0 || stability > 2) {
		throw new RangeError('Stable index alpha must lie in (0, 2].');
	}
	const u = Math.PI * (midpointOpenUniform(angleUniform) - 0.5);
	const w = -Math.log(midpointOpenUniform(exponentialUniform));
	let sample: number;
	if (Math.abs(stability - 1) < 1e-12) {
		sample = Math.tan(u);
	} else {
		const first = Math.sin(stability * u) / Math.cos(u) ** (1 / stability);
		const second = (Math.cos((1 - stability) * u) / w) ** ((1 - stability) / stability);
		sample = first * second;
	}
	if (!Number.isFinite(sample)) {
		throw new Error('Symmetric-stable sampling exceeded the finite floating-point range.');
	}
	return sample;
}

/** Independent-axis symmetric Lévy flight, explicitly distinct from Brownian motion. */
export class LevyFlightModel implements ProcessModel<LevyFlightParameters> {
	readonly id = 'levy-flight';
	readonly dimensions: 1 | 2;
	readonly parameters: Readonly<LevyFlightParameters>;

	constructor(parameters: LevyFlightParameters) {
		if (parameters.dimensions !== 1 && parameters.dimensions !== 2) {
			throw new RangeError('Lévy-flight dimensions must be one or two.');
		}
		if (
			!Number.isFinite(parameters.stability) ||
			parameters.stability <= 0 ||
			parameters.stability > 2
		) {
			throw new RangeError('Stable index alpha must lie in (0, 2].');
		}
		this.dimensions = parameters.dimensions;
		this.parameters = Object.freeze({
			dimensions: parameters.dimensions,
			stability: parameters.stability,
			scale: positive(parameters.scale, 'Lévy-flight scale')
		});
	}

	initialize(state: ParticleArrays, context: ProcessInitializationContext): void {
		initializeGaussianCloud(state, context, this.id);
	}

	step(state: ParticleArrays, context: ProcessStepContext): void {
		validateStepContext(context, 'Lévy flight');
		const { dimensions, stability, scale } = this.parameters;
		const timestepScale = scale * context.timestep ** (1 / stability);
		const angleX = context.random.uniform(`${this.id}:angle-x`);
		const exponentialX = context.random.uniform(`${this.id}:exponential-x`);
		const angleY = context.random.uniform(`${this.id}:angle-y`);
		const exponentialY = context.random.uniform(`${this.id}:exponential-y`);
		for (let index = 0; index < state.count; index += 1) {
			const stableX = sampleSymmetricStable(stability, angleX.next(), exponentialX.next());
			// Consume the second coordinate even in 1D so changing view dimension cannot
			// reassign the x stream or another particle's future values.
			const stableY = sampleSymmetricStable(stability, angleY.next(), exponentialY.next());
			if (state.alive[index] === 0) continue;
			moveParticleBy(
				state,
				index,
				timestepScale * stableX,
				dimensions === 2 ? timestepScale * stableY : 0,
				context.boundary
			);
			assertFiniteParticle(state, index, 'Lévy flight');
		}
	}
}

export function levyFlightTheory(parameters: LevyFlightParameters): {
	readonly scalingExponent: number;
	readonly finiteMean: boolean;
	readonly finiteVariance: boolean;
	readonly gaussianMsdRate: number | null;
} {
	const model = new LevyFlightModel(parameters);
	const { stability, scale, dimensions } = model.parameters;
	return {
		scalingExponent: 1 / stability,
		finiteMean: stability > 1,
		finiteVariance: stability === 2,
		gaussianMsdRate: stability === 2 ? 2 * dimensions * scale * scale : null
	};
}
