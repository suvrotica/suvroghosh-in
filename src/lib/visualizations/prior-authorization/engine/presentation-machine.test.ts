import { describe, expect, it } from 'vitest';
import { compilePriorAuthorizationScenario } from './compile-scenario';
import {
	createInitialPresentationState,
	INITIAL_PRESENTATION_STATE,
	transitionPresentation
} from './presentation-machine';

describe('prior-authorization presentation reducer', () => {
	it('reveals precompiled truth without changing clock totals at any speed', () => {
		const run = compilePriorAuthorizationScenario({ pathway: 'fhir-enabled' });
		const progressionIndices = run.milestones
			.filter((milestone) => milestone.visited)
			.map((milestone) => milestone.index);
		for (const speed of [0.5, 1, 1.5] as const) {
			let state = createInitialPresentationState({ speed });
			state = transitionPresentation(state, { type: 'BEGIN' });
			state = transitionPresentation(state, { type: 'PLAY', progressionIndices });
			for (let index = 0; index < 20; index += 1) {
				state = transitionPresentation(state, { type: 'ADVANCE', progressionIndices });
			}
			expect(state.mode).toBe('complete');
			expect(run.clocks.patientElapsedMinutes).toBe(15_840);
			expect(run.clocks.automatedProcessingMs).toBe(2_880);
		}
	});

	it('skips bypassed branches during timed and manual progression', () => {
		const progressionIndices = [0, 1, 2, 3, 4, 5, 6, 7, 10, 11] as const;
		let state = createInitialPresentationState({ milestoneIndex: 7, mode: 'paused' });
		state = transitionPresentation(state, { type: 'NEXT', progressionIndices });
		expect(state).toMatchObject({ milestoneIndex: 10, mode: 'paused' });
		state = transitionPresentation(state, { type: 'PLAY', progressionIndices });
		state = transitionPresentation(state, { type: 'ADVANCE', progressionIndices });
		expect(state).toMatchObject({ milestoneIndex: 11, mode: 'complete' });

		state = transitionPresentation(state, { type: 'SET_STEP', milestoneIndex: 8 });
		expect(state).toMatchObject({ milestoneIndex: 8, mode: 'paused' });
		state = transitionPresentation(state, { type: 'PLAY', progressionIndices });
		expect(state).toMatchObject({ milestoneIndex: 10, mode: 'playing' });
	});

	it('ends a denied progression at the decision while permitting bypass inspection', () => {
		const deniedProgression = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
		let state = createInitialPresentationState({ milestoneIndex: 10, mode: 'paused' });
		state = transitionPresentation(state, { type: 'NEXT', progressionIndices: deniedProgression });
		expect(state).toMatchObject({ milestoneIndex: 10, mode: 'complete' });

		state = transitionPresentation(state, { type: 'SET_STEP', milestoneIndex: 11 });
		expect(state).toMatchObject({ milestoneIndex: 11, mode: 'paused' });
		state = transitionPresentation(state, { type: 'PLAY', progressionIndices: deniedProgression });
		expect(state).toMatchObject({ milestoneIndex: 10, mode: 'complete' });
	});

	it('preserves the conceptual step when pathway, perspective, or comparison view changes', () => {
		let state = createInitialPresentationState({ milestoneIndex: 7, mode: 'paused' });
		state = transitionPresentation(state, { type: 'SET_PATHWAY', pathway: 'fhir-enabled' });
		state = transitionPresentation(state, { type: 'SET_PERSPECTIVE', perspective: 'architect' });
		state = transitionPresentation(state, { type: 'SET_VIEW', view: 'compare' });
		expect(state).toMatchObject({
			milestoneIndex: 7,
			pathway: 'fhir-enabled',
			perspective: 'architect',
			view: 'compare'
		});
	});

	it('pauses and rewinds to the compiler-declared unaffected prefix on failure selection', () => {
		const run = compilePriorAuthorizationScenario({
			pathway: 'fhir-enabled',
			failureId: 'narrative-only'
		});
		const rewindIndex = run.milestones.findIndex(
			(milestone) => milestone.id === run.failureImpact?.rewindMilestone
		);
		const state = transitionPresentation(
			createInitialPresentationState({ mode: 'playing', milestoneIndex: 10 }),
			{ type: 'SELECT_FAILURE', failureId: 'narrative-only', rewindIndex }
		);
		expect(state.mode).toBe('paused');
		expect(state.milestoneIndex).toBe(3);
	});

	it('pauses when leaving full-stage mode and resets canonically', () => {
		let state = createInitialPresentationState({ mode: 'playing', fullStage: true });
		state = transitionPresentation(state, { type: 'SET_FULL_STAGE', fullStage: false });
		expect(state.mode).toBe('paused');
		expect(state.fullStage).toBe(false);
		expect(transitionPresentation(state, { type: 'RESET' })).toBe(INITIAL_PRESENTATION_STATE);
	});
});
