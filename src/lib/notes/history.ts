import { cloneDocument, type NoteDocument } from './model';

export class DocumentHistory {
	#undo: NoteDocument[] = [];
	#redo: NoteDocument[] = [];
	readonly limit: number;

	constructor(limit = 80) {
		this.limit = limit;
	}

	get canUndo() {
		return this.#undo.length > 0;
	}

	get canRedo() {
		return this.#redo.length > 0;
	}

	checkpoint(document: NoteDocument) {
		this.#undo.push(cloneDocument(document));
		if (this.#undo.length > this.limit) this.#undo.shift();
		this.#redo = [];
	}

	undo(current: NoteDocument) {
		const previous = this.#undo.pop();
		if (!previous) return current;
		this.#redo.push(cloneDocument(current));
		return previous;
	}

	redo(current: NoteDocument) {
		const next = this.#redo.pop();
		if (!next) return current;
		this.#undo.push(cloneDocument(current));
		return next;
	}

	clear() {
		this.#undo = [];
		this.#redo = [];
	}
}
