const clone = <T>(value: T): T => structuredClone(value);

export class TransactionHistory<T> {
	current = $state.raw<T>(undefined as T);
	past = $state.raw<T[]>([]);
	future = $state.raw<T[]>([]);
	private transactionBase: T | undefined;

	constructor(
		initial: T,
		readonly limit = 64
	) {
		this.current = clone(initial);
	}

	replace(next: T, record = true): void {
		if (record) {
			this.past = [...this.past.slice(-(this.limit - 1)), clone(this.current)];
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
		if (this.transactionBase === undefined) this.transactionBase = clone(this.current);
	}

	preview(mutator: (draft: T) => void): void {
		if (this.transactionBase === undefined) this.begin();
		const next = clone(this.current);
		mutator(next);
		this.current = next;
	}

	commit(): void {
		if (this.transactionBase === undefined) return;
		this.past = [...this.past.slice(-(this.limit - 1)), this.transactionBase];
		this.future = [];
		this.transactionBase = undefined;
	}

	cancel(): void {
		if (this.transactionBase === undefined) return;
		this.current = this.transactionBase;
		this.transactionBase = undefined;
	}

	undo(): boolean {
		this.transactionBase = undefined;
		const previous = this.past.at(-1);
		if (!previous) return false;
		this.future = [clone(this.current), ...this.future].slice(0, this.limit);
		this.current = clone(previous);
		this.past = this.past.slice(0, -1);
		return true;
	}

	redo(): boolean {
		this.transactionBase = undefined;
		const next = this.future[0];
		if (!next) return false;
		this.past = [...this.past.slice(-(this.limit - 1)), clone(this.current)];
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
