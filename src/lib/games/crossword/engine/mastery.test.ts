import { describe, expect, it } from 'vitest';
import { makePack, makePuzzle } from '../test-fixtures';
import { buildPuzzleModel } from './model';
import { createPuzzleState, enterEntryAnswer } from './state';
import {
	OUTCOME_SCORES,
	classifyMastery,
	createEmptyMasteryHistory,
	recordCompletedPuzzle,
	recordMasteryAttempt,
	selectReviewConcepts,
	selectReviewEntries
} from './mastery';

describe('mastery history', () => {
	it('records understandable outcome counts and weights recent attempts', () => {
		let history = createEmptyMasteryHistory();
		history = recordMasteryAttempt(
			history,
			'concept-a',
			{
				at: '2026-07-01T00:00:00Z',
				puzzleId: 'p1',
				entryId: 'a',
				outcome: 'independent',
				score: OUTCOME_SCORES.independent
			},
			['topic-a']
		);
		const priorityAfterIndependent = history.concepts['concept-a'].reviewPriority;
		history = recordMasteryAttempt(history, 'concept-a', {
			at: '2026-08-01T00:00:00Z',
			puzzleId: 'p2',
			entryId: 'a2',
			outcome: 'revealed',
			score: OUTCOME_SCORES.revealed
		});
		const record = history.concepts['concept-a'];
		expect(record.independentSolves).toBe(1);
		expect(record.reveals).toBe(1);
		expect(record.reviewPriority).toBeGreaterThan(priorityAfterIndependent);
		expect(classifyMastery(record)).toBe('Needs a refresher');
	});

	it('derives one attempt per completed grid entry', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = createPuzzleState(model, { now: '2026-08-01T00:00:00Z' });
		for (const entry of model.puzzle.entries) {
			state = enterEntryAnswer(state, model, entry.id, entry.answer, {
				now: '2026-08-01T00:00:00Z'
			});
		}
		state = {
			...state,
			hintLevels: { ...state.hintLevels, art: 4 },
			entrySolves: {
				...state.entrySolves,
				art: { ...state.entrySolves.art, maxHintLevel: 4 }
			}
		};
		const history = recordCompletedPuzzle(
			createEmptyMasteryHistory(),
			model,
			state,
			'2026-08-01T00:00:00Z'
		);
		expect(Object.keys(history.concepts)).toHaveLength(4);
		expect(history.concepts['art-concept'].strongHintSolves).toBe(1);
		expect(history.concepts['cat-concept'].independentSolves).toBe(1);
	});

	it('selects heavily assisted concepts and maps them back to authored entries', () => {
		let history = createEmptyMasteryHistory();
		for (const [conceptId, outcome] of [
			['cat-concept', 'revealed'],
			['art-concept', 'strong-hint'],
			['ten-concept', 'independent']
		] as const) {
			history = recordMasteryAttempt(
				history,
				conceptId,
				{
					at: '2026-08-01T00:00:00Z',
					puzzleId: 'test-puzzle',
					entryId: conceptId,
					outcome,
					score: OUTCOME_SCORES[outcome]
				},
				['test-topic']
			);
		}
		const selected = selectReviewConcepts(history, {
			limit: 2,
			topicIds: ['test-topic'],
			now: '2026-08-13T00:00:00Z'
		});
		expect(selected.map((record) => record.conceptId)).toEqual(['cat-concept', 'art-concept']);
		expect(selectReviewEntries(makePack(), history, { limit: 2 }).map((entry) => entry.id)).toEqual(
			['cat', 'art']
		);
	});

	it('uses human labels for new and independently recalled concepts', () => {
		expect(classifyMastery()).toBe('Newly encountered');
		const history = recordMasteryAttempt(createEmptyMasteryHistory(), 'ready', {
			at: '2026-08-01T00:00:00Z',
			puzzleId: 'p',
			entryId: 'e',
			outcome: 'independent',
			score: 3
		});
		expect(classifyMastery(history.concepts.ready)).toBe('Ready');
	});
});
