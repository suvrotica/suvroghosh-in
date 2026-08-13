import { describe, expect, it } from 'vitest';
import { makePuzzle } from '../test-fixtures';
import { buildPuzzleModel } from './model';
import { createPuzzleState, enterEntryAnswer } from './state';
import { isEntryComplete } from './checking';
import {
	getStrategicRevealPositions,
	recommendNextEntry,
	requestNextHint,
	revealEntry,
	revealUsefulCrossingLetter
} from './hints';

const NOW = '2026-08-13T10:00:00.000Z';

describe('progressive hints', () => {
	it('advances through the authored ladder one level at a time', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = createPuzzleState(model, { now: NOW });
		for (let expectedLevel = 1; expectedLevel <= 3; expectedLevel += 1) {
			const result = requestNextHint(state, model, 'cat', NOW);
			expect(result.level).toBe(expectedLevel);
			expect(result.hint?.kind).toBe(model.entriesById.cat.hints[expectedLevel - 1].kind);
			expect(result.revealedCellKeys).toEqual([]);
			state = result.state;
		}
		expect(state.hintLevels.cat).toBe(3);
	});

	it('reveals a strategically useful crossing at the letter step', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = createPuzzleState(model, { now: NOW });
		expect(getStrategicRevealPositions(state, model, 'cat')).toEqual([1]);
		for (let level = 1; level <= 4; level += 1)
			state = requestNextHint(state, model, 'cat', NOW).state;
		expect(state.cells['0,1']).toMatchObject({ value: 'A', revealed: true, pencil: false });
	});

	it('turns the final step into show-and-teach rather than merely returning text', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = createPuzzleState(model, { now: NOW });
		let last;
		for (let level = 1; level <= 6; level += 1) {
			last = requestNextHint(state, model, 'cat', NOW);
			state = last.state;
		}
		expect(last?.hint?.kind).toBe('reveal');
		expect(isEntryComplete(state, model, 'cat')).toBe(true);
		expect(state.entrySolves.cat).toMatchObject({ revealed: true, maxHintLevel: 6 });
		expect(model.entriesById.cat.learning.definition).toBeTruthy();
	});

	it('supports direct answer and useful-crossing reveals', () => {
		const model = buildPuzzleModel(makePuzzle());
		const state = createPuzzleState(model, { now: NOW });
		const letter = revealUsefulCrossingLetter(state, model, 'cat', NOW);
		expect(letter.revealedCellKeys).toEqual(['0,1']);
		expect(letter.state.entrySolves.cat.maxHintLevel).toBe(4);
		expect(letter.state.hintLevels.cat).toBe(4);
		const answer = revealEntry(state, model, 'car', NOW);
		expect(answer.state.cells['2,0'].value).toBe('R');
		expect(answer.state.entrySolves.car.revealed).toBe(true);
	});

	it('recommends the unfinished entry with the most completed crossings', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = createPuzzleState(model, { now: NOW });
		state = enterEntryAnswer(state, model, 'cat', 'CAT', { now: NOW });
		expect(recommendNextEntry(state, model)).toBe('car');
		expect(recommendNextEntry(state, model, ['car'])).toBe('art');
	});
});
