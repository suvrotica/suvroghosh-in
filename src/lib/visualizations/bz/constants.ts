import {
	OREGONATOR_EQUATIONS_ID,
	OREGONATOR_MODEL_VERSION,
	SCHNAKENBERG_EQUATIONS_ID,
	SCHNAKENBERG_MODEL_VERSION
} from './types';
import type { BZSetup, OregonatorSetup, SchnakenbergSetup } from './types';

export const DEFAULT_OREGONATOR_SETUP: Readonly<OregonatorSetup> = Object.freeze({
	model: 'oregonator',
	modelVersion: OREGONATOR_MODEL_VERSION,
	equationsId: OREGONATOR_EQUATIONS_ID,
	parameters: Object.freeze({ epsilon: 0.02, q: 0.002, f: 1.4 }),
	diffusionU: 1,
	diffusionV: 0,
	timestep: 0.0005,
	gridSize: 128,
	domainSize: 16,
	activeRadius: 7.52,
	boundary: 'no-flux',
	geometry: 'circular-dish',
	maskPreset: 'none',
	initialCondition: 'target-wave',
	seed: 'bz-target-1959'
});

export const DEFAULT_SCHNAKENBERG_SETUP: Readonly<SchnakenbergSetup> = Object.freeze({
	model: 'schnakenberg',
	modelVersion: SCHNAKENBERG_MODEL_VERSION,
	equationsId: SCHNAKENBERG_EQUATIONS_ID,
	parameters: Object.freeze({ a: 0.1, b: 0.9, gamma: 1 }),
	diffusionU: 0.01,
	diffusionV: 0.1,
	timestep: 0.01,
	gridSize: 128,
	domainSize: 20,
	activeRadius: 9.4,
	boundary: 'no-flux',
	geometry: 'circular-dish',
	maskPreset: 'none',
	initialCondition: 'turing-noise',
	seed: 'turing-morphogenesis-1952'
});

export const DEFAULT_BZ_SETUP: Readonly<BZSetup> = DEFAULT_OREGONATOR_SETUP;

export const BZ_SAFE_LIMITS = Object.freeze({
	epsilonMinimum: 1e-5,
	epsilonMaximum: 10,
	qMinimum: 1e-8,
	qMaximum: 1,
	fMinimum: 0,
	fMaximum: 20,
	aMinimum: 0,
	aMaximum: 10,
	bMinimum: 0,
	bMaximum: 10,
	gammaMinimum: 1e-6,
	gammaMaximum: 1_000,
	diffusionMaximum: 10,
	timestepMinimum: 1e-8,
	timestepMaximum: 10,
	gridMinimum: 2,
	gridMaximum: 1_024,
	domainMinimum: 1e-3,
	domainMaximum: 10_000,
	seedMaximumLength: 256,
	stateAbsoluteMaximum: 1_000_000,
	negativeTolerance: 1e-9
});

export const BZ_DIFFUSION_CAUTION_FRACTION = 0.8;
export const BZ_REACTION_CAUTION_FRACTION = 0.1;
export const BZ_REACTION_UNSAFE_FRACTION = 0.5;
export const BZ_MAX_INTERVENTIONS = 2_048;
export const BZ_MAX_URL_INTERVENTIONS = 64;
export const BZ_MAX_URL_LENGTH = 12_000;
export const BZ_MAX_JSON_LENGTH = 2_000_000;
export const BZ_QUERY_PREFIX = 'bz_';
export const BZ_REPRODUCIBILITY_CAVEAT =
	'Initialization and CPU Float64 replay are deterministic for this engine version. Floating-point GPU arithmetic can differ slightly across vendors and precision tiers.';

export function gridSpacing(setup: Pick<BZSetup, 'domainSize' | 'gridSize'>): number {
	return setup.domainSize / setup.gridSize;
}

export function gridDimensions(setup: Pick<BZSetup, 'gridSize'>): {
	readonly width: number;
	readonly height: number;
} {
	return { width: setup.gridSize, height: setup.gridSize };
}

/** Necessary explicit five-point diffusion bound; it says nothing about reaction stiffness. */
export function diffusionTimestepLimit(
	setup: Pick<BZSetup, 'diffusionU' | 'diffusionV' | 'domainSize' | 'gridSize'>
): number {
	const maximumDiffusion = Math.max(setup.diffusionU, setup.diffusionV);
	if (maximumDiffusion === 0) return Number.POSITIVE_INFINITY;
	const h = gridSpacing(setup);
	return (h * h) / (4 * maximumDiffusion);
}
