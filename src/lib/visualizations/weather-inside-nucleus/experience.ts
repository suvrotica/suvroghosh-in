export const EXPERIENCE_STAGES = [
	'attract',
	'observe',
	'intervene',
	'replay',
	'repeat',
	'inspect'
] as const;

export type ExperienceStage = (typeof EXPERIENCE_STAGES)[number];
export type InterventionId = 'blocked' | 'lengthened' | 'mutated' | 'contact';

export type ExperienceState = Readonly<{
	stage: ExperienceStage;
	intervention: InterventionId | null;
	singleRunsSeen: number;
	comparisonReady: boolean;
	modelOpen: boolean;
}>;

export type ExperienceCommand =
	| { type: 'INTRO_FINISHED' }
	| { type: 'SKIP_INTRO' }
	| { type: 'BEGIN_INTERVENTION' }
	| { type: 'SELECT_INTERVENTION'; intervention: InterventionId }
	| { type: 'COMMIT_INTERVENTION' }
	| { type: 'RUN_COUNTERFACTUAL' }
	| { type: 'RUN_ANOTHER_CELL' }
	| { type: 'COMPARE_ENSEMBLE' }
	| { type: 'OPEN_MODEL' }
	| { type: 'CLOSE_MODEL' }
	| { type: 'RESET' };

export const INITIAL_EXPERIENCE_STATE: ExperienceState = Object.freeze({
	stage: 'attract',
	intervention: null,
	singleRunsSeen: 0,
	comparisonReady: false,
	modelOpen: false
});

/**
 * The guided learning journey is deliberately represented as one reducer. Presentation code may
 * ask this reducer to advance; it cannot unlock unrelated controls by toggling stray booleans.
 */
export function transitionExperience(
	state: ExperienceState,
	command: ExperienceCommand
): ExperienceState {
	switch (command.type) {
		case 'RESET':
			return INITIAL_EXPERIENCE_STATE;
		case 'INTRO_FINISHED':
		case 'SKIP_INTRO':
			return state.stage === 'attract'
				? { ...state, stage: 'observe', singleRunsSeen: Math.max(1, state.singleRunsSeen) }
				: state;
		case 'BEGIN_INTERVENTION':
			return state.stage === 'observe' ? { ...state, stage: 'intervene' } : state;
		case 'SELECT_INTERVENTION':
			return state.stage === 'intervene' ? { ...state, intervention: command.intervention } : state;
		case 'COMMIT_INTERVENTION':
			return state.stage === 'intervene' && state.intervention
				? { ...state, stage: 'replay' }
				: state;
		case 'RUN_COUNTERFACTUAL': {
			if (state.stage !== 'replay' || !state.intervention) return state;
			const singleRunsSeen = Math.max(2, state.singleRunsSeen + 1);
			return {
				...state,
				stage: 'repeat',
				singleRunsSeen,
				comparisonReady: singleRunsSeen >= 2
			};
		}
		case 'RUN_ANOTHER_CELL': {
			if (state.stage !== 'repeat') return state;
			const singleRunsSeen = state.singleRunsSeen + 1;
			return { ...state, singleRunsSeen, comparisonReady: singleRunsSeen >= 2 };
		}
		case 'COMPARE_ENSEMBLE':
			return state.stage === 'repeat' && state.comparisonReady
				? { ...state, stage: 'inspect' }
				: state;
		case 'OPEN_MODEL':
			return state.stage === 'inspect' ? { ...state, modelOpen: true } : state;
		case 'CLOSE_MODEL':
			return state.modelOpen ? { ...state, modelOpen: false } : state;
	}
}

export function stageNumber(stage: ExperienceStage): number {
	return EXPERIENCE_STAGES.indexOf(stage) + 1;
}
