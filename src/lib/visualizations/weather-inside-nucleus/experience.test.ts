import { describe, expect, it } from 'vitest';
import { INITIAL_EXPERIENCE_STATE, stageNumber, transitionExperience } from './experience';

describe('Weather Inside the Nucleus experience state machine', () => {
	it('admits only the declared guided sequence', () => {
		let state = INITIAL_EXPERIENCE_STATE;
		state = transitionExperience(state, { type: 'INTRO_FINISHED' });
		expect(state.stage).toBe('observe');
		state = transitionExperience(state, { type: 'BEGIN_INTERVENTION' });
		expect(state.stage).toBe('intervene');
		state = transitionExperience(state, { type: 'SELECT_INTERVENTION', intervention: 'contact' });
		state = transitionExperience(state, { type: 'COMMIT_INTERVENTION' });
		expect(state.stage).toBe('replay');
		state = transitionExperience(state, { type: 'RUN_COUNTERFACTUAL' });
		expect(state).toMatchObject({ stage: 'repeat', comparisonReady: true, singleRunsSeen: 2 });
		state = transitionExperience(state, { type: 'COMPARE_ENSEMBLE' });
		expect(state.stage).toBe('inspect');
		state = transitionExperience(state, { type: 'OPEN_MODEL' });
		expect(state.modelOpen).toBe(true);
		expect(stageNumber(state.stage)).toBe(6);
	});

	it('cannot jump to results or model inspection before the evidence is visible', () => {
		const repeated = transitionExperience(INITIAL_EXPERIENCE_STATE, {
			type: 'COMPARE_ENSEMBLE'
		});
		const inspected = transitionExperience(INITIAL_EXPERIENCE_STATE, { type: 'OPEN_MODEL' });
		expect(repeated).toBe(INITIAL_EXPERIENCE_STATE);
		expect(inspected).toBe(INITIAL_EXPERIENCE_STATE);
	});

	it('reset restores the documented baseline journey state', () => {
		const changed = transitionExperience(
			{ ...INITIAL_EXPERIENCE_STATE, stage: 'inspect', modelOpen: true, comparisonReady: true },
			{ type: 'RESET' }
		);
		expect(changed).toBe(INITIAL_EXPERIENCE_STATE);
	});
});
