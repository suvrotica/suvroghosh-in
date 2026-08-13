import { describe, expect, it } from 'vitest';
import { makeEntry, makePack, makePuzzle } from '../test-fixtures';
import type { CrosswordPack, CrosswordPuzzle, ValidationIssueCode } from '../types';
import {
	CrosswordValidationError,
	assertValidPack,
	validatePack,
	validatePuzzle
} from './validate';

function clone<T>(value: T): T {
	return structuredClone(value);
}

function codes(puzzle: CrosswordPuzzle): ValidationIssueCode[] {
	return validatePuzzle(puzzle).issues.map((issue) => issue.code);
}

describe('puzzle validation', () => {
	it('accepts a complete, connected and sourced puzzle', () => {
		expect(validatePuzzle(makePuzzle())).toEqual({ valid: true, issues: [] });
		expect(validatePack(makePack()).valid).toBe(true);
		expect(() => assertValidPack(makePack())).not.toThrow();
	});

	it('detects mismatched dimensions, duplicate coordinates and missing cells', () => {
		const puzzle = makePuzzle();
		puzzle.cells.pop();
		puzzle.cells.push({ ...puzzle.cells[0] });
		expect(codes(puzzle)).toEqual(expect.arrayContaining(['cell-coordinate']));
		const short = makePuzzle();
		short.cells.pop();
		expect(codes(short)).toEqual(expect.arrayContaining(['cell-count', 'cell-coordinate']));
	});

	it('detects out-of-bounds entries, blocks and same-direction collisions', () => {
		const outOfBounds = makePuzzle();
		outOfBounds.entries[1].row = 2;
		expect(codes(outOfBounds)).toContain('entry-bounds');
		const invalidStart = makePuzzle();
		invalidStart.entries[0].row = Number.NaN;
		expect(codes(invalidStart)).toContain('entry-bounds');

		const onBlock = makePuzzle();
		onBlock.cells.find((cell) => cell.row === 1 && cell.column === 0)!.kind = 'block';
		expect(codes(onBlock)).toContain('entry-on-block');

		const overlap = makePuzzle();
		overlap.entries.push(
			makeEntry({ id: 'duplicate-lane', answer: 'CAT', direction: 'across', row: 0, column: 0 })
		);
		expect(codes(overlap)).toContain('duplicate-direction');
	});

	it('detects incorrect crossings and duplicate entry ids', () => {
		const crossing = makePuzzle();
		crossing.entries[1].answer = 'BAR';
		expect(codes(crossing)).toContain('incorrect-crossing');
		const duplicate = makePuzzle();
		duplicate.entries[1].id = duplicate.entries[0].id;
		expect(codes(duplicate)).toContain('duplicate-id');
	});

	it('detects duplicate answers after display formatting is normalised', () => {
		const puzzle = makePuzzle();
		puzzle.entries.push(
			makeEntry({
				id: 'formatted-duplicate',
				answer: 'C-A-T',
				direction: 'across',
				row: 0,
				column: 0
			})
		);
		expect(codes(puzzle)).toContain('duplicate-answer');
	});

	it('detects orphaned cells and disconnected regions', () => {
		const orphan = makePuzzle();
		orphan.cells.find((cell) => cell.row === 1 && cell.column === 3)!.kind = 'open';
		expect(codes(orphan)).toContain('orphan-cell');
		const disconnected = makePuzzle();
		disconnected.cells.find((cell) => cell.row === 0 && cell.column === 4)!.kind = 'open';
		expect(codes(disconnected)).toEqual(
			expect.arrayContaining(['orphan-cell', 'disconnected-grid'])
		);
	});

	it('rejects adjacent answers that form no crossing network', () => {
		const entries = [
			makeEntry({ id: 'top', answer: 'CAT', direction: 'across', row: 0, column: 0 }),
			makeEntry({ id: 'bottom', answer: 'DOG', direction: 'across', row: 1, column: 0 })
		];
		const puzzle = makePuzzle({ width: 3, height: 2, entries });
		expect(codes(puzzle)).toContain('disconnected-grid');
	});

	it('checks clues, ordered hint ladders, answer leakage and reveal positions', () => {
		const puzzle = makePuzzle();
		puzzle.entries[0].clue = '';
		puzzle.entries[0].hints.pop();
		puzzle.entries[1].hints[0].kind = 'contrast';
		puzzle.entries[2].hints[1].text = 'The answer is ART.';
		puzzle.entries[3].hints[3].revealPositions = [3, 3];
		expect(codes(puzzle)).toEqual(
			expect.arrayContaining([
				'missing-clue',
				'missing-hints',
				'invalid-hint-order',
				'answer-leakage',
				'invalid-reveal-position'
			])
		);
	});

	it('checks teaching text, source URLs and unsupported answer characters', () => {
		const puzzle = makePuzzle();
		puzzle.entries[0].learning.definition = '';
		puzzle.entries[1].learning.sources = [];
		puzzle.entries[2].learning.sources[0].url = 'javascript:alert(1)';
		puzzle.entries[3].answer = 'T/N';
		expect(codes(puzzle)).toEqual(
			expect.arrayContaining([
				'missing-learning',
				'missing-source',
				'invalid-source-url',
				'unsupported-character'
			])
		);
	});
});

describe('pack validation', () => {
	it('detects stale schemas, duplicate puzzle ids and unknown topics', () => {
		const pack = clone(makePack()) as unknown as Omit<CrosswordPack, 'schemaVersion'> & {
			schemaVersion: number;
		};
		pack.schemaVersion = 0;
		const second = clone(pack.puzzles[0]);
		second.topicIds = ['unknown'];
		pack.puzzles.push(second);
		const result = validatePack(pack as CrosswordPack);
		expect(result.issues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining(['schema-version', 'duplicate-id', 'unknown-topic'])
		);
		expect(() => assertValidPack(pack as CrosswordPack)).toThrow(CrosswordValidationError);
	});
});
