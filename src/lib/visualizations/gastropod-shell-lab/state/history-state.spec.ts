import { describe, expect, it } from 'vitest';
import { TransactionHistory } from './history-state.svelte';

describe('TransactionHistory', () => {
	it('ends an unfinished gesture when a replacement is selected', () => {
		const history = new TransactionHistory({ value: 'default' });

		// Numeric controls begin a transaction on focus even if their value is not changed.
		history.begin();
		history.replace({ value: 'preset' });

		history.begin();
		history.preview((draft) => (draft.value = 'edited'));
		history.commit();

		expect(history.undo()).toBe(true);
		expect(history.current).toEqual({ value: 'preset' });
	});

	it.each([0, false, ''])('undoes and redoes the falsy value %j', (initial) => {
		const history = new TransactionHistory<number | boolean | string>(initial);
		history.replace('next');

		expect(history.undo()).toBe(true);
		expect(history.current).toBe(initial);
		expect(history.redo()).toBe(true);
		expect(history.current).toBe('next');
	});

	it('can transact when undefined is itself the current value', () => {
		const history = new TransactionHistory<string | undefined>(undefined);
		history.begin();
		history.current = 'previewed';
		history.commit();

		expect(history.undo()).toBe(true);
		expect(history.current).toBeUndefined();
	});

	it('retains exactly one state when the history limit is one', () => {
		const history = new TransactionHistory(0, 1);
		for (let value = 1; value <= 4; value += 1) history.replace(value);

		expect(history.past).toEqual([3]);
		expect(history.undo()).toBe(true);
		expect(history.current).toBe(3);
		expect(history.past).toEqual([]);
		expect(history.redo()).toBe(true);
		expect(history.current).toBe(4);
		expect(history.past).toEqual([3]);
	});
});
