import type {
	GuidedPromptDefinition,
	LoomInitialState,
	LoomParameters,
	WorkedSettingId,
	WorkedSettingPreset
} from './types.ts';

export const DEFAULT_LOOM_PARAMETERS: LoomParameters = {
	r: 1.0,
	K: 3.0,
	a: 1.0,
	h: 1.0,
	e: 0.5,
	m: 0.2
};

export const DEFAULT_INITIAL_STATE: LoomInitialState = {
	N0: 1.0,
	P0: 0.6
};

export const DEFAULT_SIMULATION_DURATION = 80;
export const DEFAULT_COMPARISON_DURATION = 120;
export const DEFAULT_SOLVER_DT = 0.02;

/** Fixed chart bounds so scales stay constant across comparisons and interventions */
export const FIXED_PREY_MAX = 3.6;
export const FIXED_PREDATOR_MAX = 2.4;

export const WORKED_SETTINGS: Record<WorkedSettingId, WorkedSettingPreset> = {
	'k-1.5': {
		id: 'k-1.5',
		label: 'K = 1.5 · Oscillations settle',
		shortLabel: 'K = 1.5 (Settles)',
		K: 1.5,
		a: 1.0,
		summary: 'Oscillations settle towards steady coexistence (N* = 0.67, P* = 0.93).',
		outcomeExplanation: 'These swings are shrinking towards steady populations.'
	},
	'k-3.0': {
		id: 'k-3.0',
		label: 'K = 3.0 · Persistent oscillations',
		shortLabel: 'K = 3.0 (Cycles)',
		K: 3.0,
		a: 1.0,
		summary:
			'Above K = 7/3 ≈ 2.33, the equilibrium loses stability and approaches a repeating loop.',
		outcomeExplanation: 'The populations are approaching a repeating cycle.'
	},
	'k-4.0': {
		id: 'k-4.0',
		label: 'K = 4.0 · Larger persistent oscillations',
		shortLabel: 'K = 4.0 (Larger swings)',
		K: 4.0,
		a: 1.0,
		summary: 'Enriched food supply drives wider oscillations with much lower prey troughs.',
		outcomeExplanation: 'The prey population now falls much lower between peaks.'
	}
};

export const WORKED_SETTING_ORDER: WorkedSettingId[] = ['k-1.5', 'k-3.0', 'k-4.0'];

export const GUIDED_PROMPTS: GuidedPromptDefinition[] = [
	{
		id: 'watch-delay',
		stepNumber: 1,
		title: 'Watch the delay.',
		instruction:
			'Run the example and highlight the prey peak followed by the predator peak. Link both to their positions on the phase trajectory.',
		actionLabel: '1. Watch the delay'
	},
	{
		id: 'disturb-populations',
		stepNumber: 2,
		title: 'Disturb the populations.',
		instruction:
			'Remove 25% of predators. Follow the resulting changes and compare them with the undisturbed run.',
		actionLabel: '2. Remove 25% of predators'
	},
	{
		id: 'increase-food',
		stepNumber: 3,
		title: 'Increase the food supply.',
		instruction:
			'Switch from the lower-food setting to the enriched setting. Show how the later trajectory changes, then restore the earlier conditions.',
		actionLabel: '3. Increase the food supply'
	}
];

export const COMPARISON_K_VALUES = [1.5, 3.0, 4.0] as const;
export const COMPARISON_A_VALUES = [0.75, 1.0, 1.25] as const;
