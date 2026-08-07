import type { ReactionDiffusionPreset } from './types';

export const REACTION_DIFFUSION_PRESETS: readonly ReactionDiffusionPreset[] = Object.freeze([
	{
		id: 'collapse-to-feed',
		label: 'Collapse to feed state',
		description: 'The finite central seed has decayed to the uniform feed state by t = 1000.',
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
		seed: 'mitosis-spots-1',
		integrator: 'heun',
		recommendedModelTime: 1_000,
		observationPrompt:
			'Verify that mean V and its variance approach zero rather than naming a pattern.',
		conditionalNote:
			'Earlier transients are not the declared outcome; this name describes the calibrated t = 1000 field.'
	},
	{
		id: 'concentric-vessel-fronts',
		label: 'Concentric vessel fronts',
		description:
			'An initial ring becomes two irregular concentric reaction fronts inside the vessel.',
		feed: 0.0545,
		kill: 0.062,
		diffusionU: 0.16,
		diffusionV: 0.08,
		timestep: 0.5,
		gridSize: 256,
		domainWidth: 256,
		boundary: 'no-flux',
		maskPreset: 'circular-vessel',
		initialCondition: 'ring',
		seed: 'coral-fronts-2',
		integrator: 'heun',
		recommendedModelTime: 1_000,
		observationPrompt: 'Compare the roughness and V intensity of the inner and outer rings.',
		conditionalNote:
			'The two-ring outcome is conditional on this circular mask and t = 1000 checkpoint.'
	},
	{
		id: 'sparse-seed-extinction',
		label: 'Sparse-seed extinction',
		description:
			'The sparse seeded disturbances have extinguished by the declared observation time.',
		feed: 0.078,
		kill: 0.061,
		diffusionU: 0.16,
		diffusionV: 0.08,
		timestep: 0.5,
		gridSize: 256,
		domainWidth: 256,
		boundary: 'periodic',
		maskPreset: 'open-square',
		initialCondition: 'sparse-points',
		seed: 'filament-field-3',
		integrator: 'heun',
		recommendedModelTime: 1_000,
		observationPrompt:
			'Inspect the numerical readout instead of mistaking the dark field for missing data.',
		conditionalNote:
			'This is extinction under one deterministic sparse seed, not a universal parameter phase.'
	},
	{
		id: 'seam-spanning-bands',
		label: 'Seam-spanning bands',
		description:
			'Two persistent horizontal reaction bands meet continuously across the periodic seam.',
		feed: 0.014,
		kill: 0.047,
		diffusionU: 0.16,
		diffusionV: 0.08,
		timestep: 0.5,
		gridSize: 256,
		domainWidth: 256,
		boundary: 'periodic',
		maskPreset: 'open-square',
		initialCondition: 'horizontal-front',
		seed: 'travelling-waves-4',
		integrator: 'heun',
		recommendedModelTime: 1_000,
		observationPrompt: 'Trace each band through the top–bottom seam and inspect its local bulges.',
		conditionalNote: 'The t = 1000 bands are a finite-time field; the seam is periodic, not a wall.'
	},
	{
		id: 'channel-extinction',
		label: 'Channel extinction',
		description: 'Both finite disturbances decay, leaving the two-chamber mask at the feed state.',
		feed: 0.03,
		kill: 0.062,
		diffusionU: 0.16,
		diffusionV: 0.08,
		timestep: 0.5,
		gridSize: 256,
		domainWidth: 256,
		boundary: 'no-flux',
		maskPreset: 'two-chambers',
		initialCondition: 'two-spots',
		seed: 'channel-selection-5',
		integrator: 'heun',
		recommendedModelTime: 1_000,
		observationPrompt:
			'Distinguish the visible chamber geometry from a surviving chemical pattern.',
		conditionalNote:
			'Mask faces remain zero-flux even though this t = 1000 chemistry has extinguished.'
	},
	{
		id: 'reservoir-loop-lattice',
		label: 'Boundary-fed loop lattice',
		description: 'The central square reorganises into a compact lattice of looped reaction fronts.',
		feed: 0.04,
		kill: 0.06,
		diffusionU: 0.16,
		diffusionV: 0.08,
		timestep: 0.5,
		gridSize: 256,
		domainWidth: 256,
		boundary: 'reservoir',
		maskPreset: 'open-square',
		initialCondition: 'central-square',
		seed: 'reservoir-invasion-6',
		integrator: 'heun',
		recommendedModelTime: 1_000,
		observationPrompt: 'Count the surviving loops and compare the outer and central cells.',
		conditionalNote:
			'This t = 1000 lattice depends on a reservoir that fixes only virtual exterior cells to U=1, V=0.'
	}
]);

export function getReactionDiffusionPreset(id: string): ReactionDiffusionPreset | undefined {
	return REACTION_DIFFUSION_PRESETS.find((preset) => preset.id === id);
}
