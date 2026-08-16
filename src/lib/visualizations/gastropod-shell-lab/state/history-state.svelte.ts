const clone = <T>(value: T): T => structuredClone(value);

export class TransactionHistory<T> {
	current = $state.raw<T>(undefined as T);
	past = $state.raw<T[]>([]);
	future = $state.raw<T[]>([]);
	private transactionBase: T;
	private transactionActive = false;

	constructor(
		initial: T,
		readonly limit = 64
	) {
		if (!Number.isInteger(limit) || limit < 1) {
			throw new RangeError('History limit must be a positive integer.');
		}
		this.current = clone(initial);
		this.transactionBase = clone(initial);
	}

	private appendPast(value: T): T[] {
		const retainedCount = Math.max(0, this.limit - 1);
		const retained = retainedCount === 0 ? [] : this.past.slice(-retainedCount);
		return [...retained, clone(value)];
	}

	replace(next: T, record = true): void {
		// A preset/import replacement ends a focus or pointer transaction even when
		// that gesture never produced a preview value.
		this.transactionActive = false;
		if (record) {
			this.past = this.appendPast(this.current);
			this.future = [];
		}
		this.current = clone(next);
	}

	update(mutator: (draft: T) => void, record = true): void {
		const next = clone(this.current);
		mutator(next);
		this.replace(next, record);
	}

	begin(): void {
		if (!this.transactionActive) {
			this.transactionBase = clone(this.current);
			this.transactionActive = true;
		}
	}

	preview(mutator: (draft: T) => void): void {
		if (!this.transactionActive) this.begin();
		const next = clone(this.current);
		mutator(next);
		this.current = next;
	}

	commit(): void {
		if (!this.transactionActive) return;
		this.past = this.appendPast(this.transactionBase);
		this.future = [];
		this.transactionActive = false;
	}

	cancel(): void {
		if (!this.transactionActive) return;
		this.current = this.transactionBase;
		this.transactionActive = false;
	}

	undo(): boolean {
		this.transactionActive = false;
		if (this.past.length === 0) return false;
		const previous = this.past[this.past.length - 1];
		this.future = [clone(this.current), ...this.future].slice(0, this.limit);
		this.current = clone(previous);
		this.past = this.past.slice(0, -1);
		return true;
	}

	redo(): boolean {
		this.transactionActive = false;
		if (this.future.length === 0) return false;
		const next = this.future[0];
		this.past = this.appendPast(this.current);
		this.current = clone(next);
		this.future = this.future.slice(1);
		return true;
	}

	get canUndo(): boolean {
		return this.past.length > 0;
	}

	get canRedo(): boolean {
		return this.future.length > 0;
	}
}
