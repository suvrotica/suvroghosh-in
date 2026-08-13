import { describe, expect, it } from 'vitest';
import { makePuzzle } from '../test-fixtures';
import { buildPuzzleModel } from './model';
import { createPuzzleState, enterEntryAnswer, enterLetter, selectCell } from './state';
import {
	applyCheck,
	checkEntry,
	checkLetter,
	checkPuzzle,
	findCrossingConflicts,
	getCompletionReport,
	isEntryComplete,
	isPuzzleComplete
} from './checking';

const NOW = '2026-08-13T10:00:00.000Z';

function fillPuzzle() {
	const model = buildPuzzleModel(makePuzzle());
	let state = createPuzzleState(model, { now: NOW });
	for (const entry of model.puzzle.entries) {
		state = enterEntryAnswer(state, model, entry.id, entry.answer, { now: NOW });
	}
	return { model, state };
}

describe('checking', () => {
	it('checks a letter, answer and whole puzzle without changing entered values', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = createPuzzleState(model, { now: NOW, settings: { playMode: 'traditional' } });
		state = enterLetter(state, model, 'x', { now: NOW });
		expect(checkLetter(state, model, '0,0')).toMatchObject({ correct: false, complete: false });
		expect(checkEntry(state, model, 'cat').cells.map((cell) => cell.status)).toEqual([
			'incorrect',
			'blank',
			'blank'
		]);
		expect(checkPuzzle(state, model).complete).toBe(false);
		const checked = applyCheck(state, checkEntry(state, model, 'cat'));
		expect(checked.cells['0,0'].checkStatus).toBe('incorrect');
		expect(checked.cells['0,0'].value).toBe('X');
	});

	it('detects answer and puzzle completion through shared crossings', () => {
		const { model, state } = fillPuzzle();
		expect(isEntryComplete(state, model, 'cat')).toBe(true);
		expect(isPuzzleComplete(state, model)).toBe(true);
		expect(checkPuzzle(state, model)).toMatchObject({ correct: true, complete: true });
	});

	it('summarises completion without fake score precision', () => {
		const { model, state } = fillPuzzle();
		const classified = {
			...state,
			hintLevels: { ...state.hintLevels, car: 1, art: 4, ten: 6 },
			entrySolves: {
				...state.entrySolves,
				car: { ...state.entrySolves.car, maxHintLevel: 1 },
				art: { ...state.entrySolves.art, maxHintLevel: 4 },
				ten: { ...state.entrySolves.ten, maxHintLevel: 6, revealed: true }
			}
		};
		expect(getCompletionReport(classified, model)).toMatchObject({
			complete: true,
			independent: 1,
			withHints: 2,
			revealed: 1,
			markedForReview: ['art-concept', 'ten-concept']
		});
	});

	it('places both clues beside a bad crossing without blaming one answer', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = createPuzzleState(model, { now: NOW });
		state = selectCell(state, model, '0,0', 'across', NOW);
		state = enterLetter(state, model, 'x', { now: NOW });
		const conflicts = findCrossingConflicts(state, model);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].entryIds).toEqual(['cat', 'car']);
		expect(conflicts[0].message).toMatch(/At least one/);
	});
});
