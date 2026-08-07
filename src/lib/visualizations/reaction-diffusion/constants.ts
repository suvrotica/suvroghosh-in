import type { GrayScottSetup, QualityLevel } from './types';

export const DEFAULT_REACTION_DIFFUSION_SETUP: Readonly<GrayScottSetup> = Object.freeze({
	feed: 0.0367,
	kill: 0.0649,
	diffusionU: 0.16,
	diffusionV: 0.08,
	timestep: 0.5,
	gridSize: 256,
	domainWidth: 256,
	boundary: 'periodic',
	maskPreset: 'open-square',
	initialCondition: 'central-soft-disk',
	seed: 'observatory-2407',
	integrator: 'heun'
});

export const QUALITY_GRID_SIZE: Readonly<Record<QualityLevel, number>> = Object.freeze({
	low: 128,
	medium: 256,
	high: 384
});

export const DIFFUSION_STABILITY_CEILING = 0.25;
export const DIFFUSION_CAUTION_FRACTION = 0.8;
export const NUMERICAL_SAFETY_ABS_LIMIT = 1_000_000;
export const MAX_INTERVENTIONS = 2_000;
export const MAX_MEASUREMENT_HISTORY = 720;
export const MAX_SHARE_URL_LENGTH = 12_000;
export const REACTION_DIFFUSION_QUERY_PREFIX = 'rd_';

export function gridSpacing(setup: Pick<GrayScottSetup, 'domainWidth' | 'gridSize'>): number {
	return setup.domainWidth / setup.gridSize;
}

export function stabilityNumber(
	setup: Pick<GrayScottSetup, 'diffusionU' | 'diffusionV' | 'timestep' | 'domainWidth' | 'gridSize'>
): number {
	const spacing = gridSpacing(setup);
	return (Math.max(setup.diffusionU, setup.diffusionV) * setup.timestep) / (spacing * spacing);
}
