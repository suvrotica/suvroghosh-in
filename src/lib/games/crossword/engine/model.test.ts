import { describe, expect, it } from 'vitest';
import { makeEntry, makePuzzle } from '../test-fixtures';
import {
	answerCharacters,
	answerEquals,
	findUnsupportedAnswerCharacters,
	normalizeAnswer,
	normalizeLetter
} from './normalize';
import {
	answerLetterAtCell,
	buildPuzzleModel,
	cellKey,
	createCellLayout,
	entryNumberLabel,
	getEntriesAtCell,
	parseCellKey
} from './model';

describe('answer normalisation', () => {
	it('separates grid spelling from display punctuation without losing letters', () => {
		expect(normalizeAnswer('SNOMED CT')).toBe('SNOMEDCT');
		expect(normalizeAnswer('e-CRF')).toBe('ECRF');
		expect(normalizeAnswer('L.O.I.N.C.')).toBe('LOINC');
		expect(answerCharacters('café')).toEqual(['C', 'A', 'F', 'É']);
		expect(answerEquals('data set', 'DATA-SET')).toBe(true);
	});

	it('accepts one letter at a time and exposes rather than erases unsupported symbols', () => {
		expect(normalizeLetter('q')).toBe('Q');
		expect(normalizeLetter('two')).toBe('');
		expect(findUnsupportedAnswerCharacters('A/B')).toEqual(['/']);
	});
});

describe('puzzle model', () => {
	it('constructs entry paths, intersections and conventional start-cell numbering', () => {
		const model = buildPuzzleModel(makePuzzle());
		expect(model.entryCells.cat).toEqual(['0,0', '0,1', '0,2']);
		expect(model.entryCells.car).toEqual(['0,0', '1,0', '2,0']);
		expect(model.cells['0,0'].entryIds).toEqual(['cat', 'car']);
		expect(getEntriesAtCell(model, '0,1').map((entry) => entry.id)).toEqual(['cat', 'art']);
		expect(model.entryNumbers).toEqual({ cat: 1, car: 1, art: 2, ten: 3 });
		expect(entryNumberLabel(model, 'car')).toBe('1 Down');
		expect(answerLetterAtCell(model, '0,1')).toBe('A');
	});

	it('creates a complete rectangular layout from entry placements', () => {
		const puzzle = makePuzzle();
		const cells = createCellLayout(puzzle);
		expect(cells).toHaveLength(15);
		expect(cells.find((cell) => cell.row === 1 && cell.column === 1)?.kind).toBe('open');
		expect(cells.find((cell) => cell.row === 1 && cell.column === 4)?.kind).toBe('block');
	});

	it('round-trips cell keys and rejects malformed keys', () => {
		expect(cellKey(4, 7)).toBe('4,7');
		expect(parseCellKey('4,7')).toEqual({ row: 4, column: 7 });
		expect(parseCellKey('four,7')).toBeNull();
	});

	it('fails early when two entries occupy the same direction', () => {
		const puzzle = makePuzzle({
			entries: [
				...makePuzzle().entries,
				makeEntry({ id: 'copy', answer: 'CAT', direction: 'across', row: 0, column: 0 })
			]
		});
		expect(() => buildPuzzleModel(puzzle)).toThrow(/overlap across/);
	});

	it('fails early when authored crossing letters disagree', () => {
		const puzzle = makePuzzle();
		puzzle.entries[1].answer = 'BAR';
		expect(() => buildPuzzleModel(puzzle)).toThrow(/disagree at crossing 0,0/);
	});
});
