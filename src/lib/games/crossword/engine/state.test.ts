import { describe, expect, it } from 'vitest';
import { makePuzzle } from '../test-fixtures';
import { buildPuzzleModel } from './model';
import {
	backspace,
	confirmEntry,
	createPuzzleState,
	deleteCell,
	enterEntryAnswer,
	enterLetter,
	getKnownEntryPattern,
	getSelectedEntryId,
	moveSpatial,
	moveToNextEntry,
	moveToPreviousEntry,
	resetPuzzleState,
	selectCell,
	setCellPencil,
	toggleDirection,
	togglePencilMode
} from './state';

const NOW = '2026-08-13T10:00:00.000Z';

describe('selection and navigation', () => {
	it('starts at the first numbered answer and toggles direction at a crossing', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = createPuzzleState(model, { now: NOW });
		expect(state.selectedCellKey).toBe('0,0');
		expect(getSelectedEntryId(state, model)).toBe('cat');
		state = toggleDirection(state, model, NOW);
		expect(getSelectedEntryId(state, model)).toBe('car');
		state = selectCell(state, model, '0,0', undefined, NOW);
		expect(state.direction).toBe('across');
	});

	it('moves spatially over blocks and cycles through clue order', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = createPuzzleState(model, { now: NOW });
		state = moveSpatial(state, model, 1, 0, NOW);
		expect(state.selectedCellKey).toBe('1,0');
		expect(state.direction).toBe('down');
		state = moveToNextEntry(state, model, NOW);
		expect(getSelectedEntryId(state, model)).toBe('art');
		state = moveToPreviousEntry(state, model, NOW);
		expect(getSelectedEntryId(state, model)).toBe('car');
	});
});

describe('keyboard and list-mode input', () => {
	it('enters a letter immutably, advances, and gives quiet Coach feedback', () => {
		const model = buildPuzzleModel(makePuzzle());
		const initial = createPuzzleState(model, { now: NOW });
		const correct = enterLetter(initial, model, 'c', { now: NOW });
		expect(initial.cells['0,0'].value).toBe('');
		expect(correct.cells['0,0']).toMatchObject({ value: 'C', checkStatus: 'correct' });
		expect(correct.selectedCellKey).toBe('0,1');
		const wrong = enterLetter(correct, model, 'x', { now: NOW });
		expect(wrong.cells['0,1'].checkStatus).toBe('incorrect');
	});

	it('keeps unchecked letters in Traditional mode', () => {
		const model = buildPuzzleModel(makePuzzle());
		const state = createPuzzleState(model, { now: NOW, settings: { playMode: 'traditional' } });
		expect(enterLetter(state, model, 'x', { now: NOW }).cells['0,0'].checkStatus).toBe('unchecked');
	});

	it('implements crossword Backspace and Delete movement', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = createPuzzleState(model, { now: NOW });
		state = enterLetter(state, model, 'c', { now: NOW });
		state = enterLetter(state, model, 'a', { now: NOW });
		expect(state.selectedCellKey).toBe('0,2');
		state = backspace(state, model, NOW);
		expect(state.selectedCellKey).toBe('0,1');
		expect(state.cells['0,1'].value).toBe('');
		state = deleteCell(state, model, NOW);
		expect(state.selectedCellKey).toBe('0,1');
		state = backspace(state, model, NOW);
		expect(state.selectedCellKey).toBe('0,0');
		expect(state.cells['0,0'].value).toBe('');
	});

	it('does not jump backward and erase a neighbour when the selected letter is locked', () => {
		const model = buildPuzzleModel(makePuzzle());
		const initial = createPuzzleState(model, { now: NOW });
		const locked = {
			...initial,
			selectedCellKey: '0,1' as const,
			cells: {
				...initial.cells,
				'0,0': { ...initial.cells['0,0'], value: 'C' },
				'0,1': { ...initial.cells['0,1'], value: 'A', revealed: true }
			}
		};
		expect(backspace(locked, model, NOW)).toBe(locked);
		expect(locked.cells['0,0'].value).toBe('C');
	});

	it('shares list-based answer input with the visual grid state', () => {
		const model = buildPuzzleModel(makePuzzle());
		const state = enterEntryAnswer(createPuzzleState(model, { now: NOW }), model, 'car', 'CAR', {
			now: NOW
		});
		expect(state.cells['0,0'].value).toBe('C');
		expect(state.cells['2,0'].value).toBe('R');
		expect(getKnownEntryPattern(state, model, 'car')).toBe('C A R');
	});
});

describe('pencil marks and reset', () => {
	it('marks tentative letters, confirms an answer, and toggles global pencil mode', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = togglePencilMode(createPuzzleState(model, { now: NOW }), NOW);
		state = enterEntryAnswer(state, model, 'cat', 'CAT', { now: NOW });
		expect(state.cells['0,1'].pencil).toBe(true);
		state = confirmEntry(state, model, 'cat', NOW);
		expect(model.entryCells.cat.every((key) => !state.cells[key].pencil)).toBe(true);
		state = setCellPencil(state, '0,0', true, NOW);
		expect(state.cells['0,0'].pencil).toBe(true);
	});

	it('resets letters while retaining settings and round selection', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = createPuzzleState(model, { now: NOW, settings: { timingEnabled: true } });
		state = enterLetter(state, model, 'c', { now: NOW });
		const reset = resetPuzzleState(state, model, '2026-08-14T00:00:00Z');
		expect(reset.cells['0,0'].value).toBe('');
		expect(reset.settings.timingEnabled).toBe(true);
	});
});
