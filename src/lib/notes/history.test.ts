import { describe, expect, it } from 'vitest';
import { DocumentHistory } from './history';
import { createEmptyDocument } from './model';

describe('DocumentHistory', () => {
	it('stores immutable snapshots and supports undo/redo', () => {
		const history = new DocumentHistory();
		const initial = createEmptyDocument('First', 'note-history');
		history.checkpoint(initial);
		initial.title = 'Second';
		const previous = history.undo(initial);
		expect(previous.title).toBe('First');
		previous.title = 'Changed after undo';
		expect(history.redo(previous).title).toBe('Second');
	});

	it('enforces its limit and clears redo on a new checkpoint', () => {
		const history = new DocumentHistory(2);
		const document = createEmptyDocument('0', 'note-history-limit');
		for (const title of ['1', '2', '3']) {
			document.title = title;
			history.checkpoint(document);
		}
		let current = { ...document, title: '4' };
		current = history.undo(current);
		expect(current.title).toBe('3');
		current = history.undo(current);
		expect(current.title).toBe('2');
		expect(history.canUndo).toBe(false);
		history.checkpoint(current);
		expect(history.canRedo).toBe(false);
	});
});
