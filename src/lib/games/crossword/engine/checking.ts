import type {
	CellKey,
	CheckResult,
	CheckedCell,
	CompletionReport,
	EntryCompletion,
	PuzzleModel,
	PuzzleState,
	SolveOutcome
} from '../types';
import { answerCharacters } from './normalize';
import { answerLetterAtCell } from './model';
import { getSelectedEntryId } from './state';

function checkKeys(
	state: PuzzleState,
	model: PuzzleModel,
	keys: CellKey[],
	scope: CheckResult['scope']
): CheckResult {
	const cells: CheckedCell[] = keys.map((key) => {
		const actual = state.cells[key]?.value ?? '';
		const expected = answerLetterAtCell(model, key);
		return {
			key,
			actual,
			expected,
			status: !actual ? 'blank' : actual === expected ? 'correct' : 'incorrect'
		};
	});
	return {
		scope,
		cells,
		correct: cells.length > 0 && cells.every((cell) => cell.status !== 'incorrect'),
		complete: cells.length > 0 && cells.every((cell) => cell.status === 'correct')
	};
}

export function checkLetter(
	state: PuzzleState,
	model: PuzzleModel,
	key: CellKey | null = state.selectedCellKey
): CheckResult {
	return checkKeys(state, model, key && state.cells[key] ? [key] : [], 'letter');
}

export function checkEntry(
	state: PuzzleState,
	model: PuzzleModel,
	entryId: string | null = getSelectedEntryId(state, model)
): CheckResult {
	return checkKeys(state, model, entryId ? (model.entryCells[entryId] ?? []) : [], 'entry');
}

export function checkPuzzle(state: PuzzleState, model: PuzzleModel): CheckResult {
	const keys = model.cellOrder.filter(
		(key) => model.cells[key].kind === 'open' && model.cells[key].entryIds.length > 0
	);
	return checkKeys(state, model, keys, 'puzzle');
}

export function applyCheck(
	state: PuzzleState,
	result: CheckResult,
	now: Date | string = new Date()
): PuzzleState {
	let changed = false;
	const cells = { ...state.cells };
	for (const checked of result.cells) {
		const current = cells[checked.key];
		if (!current) continue;
		const checkStatus = checked.status === 'blank' ? 'unchecked' : checked.status;
		if (current.checkStatus !== checkStatus) {
			cells[checked.key] = { ...current, checkStatus };
			changed = true;
		}
	}
	const parsed = now instanceof Date ? now : new Date(now);
	return changed
		? {
				...state,
				cells,
				updatedAt: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
			}
		: state;
}

export function isEntryFilled(state: PuzzleState, model: PuzzleModel, entryId: string): boolean {
	const keys = model.entryCells[entryId];
	return Boolean(keys?.length) && keys.every((key) => Boolean(state.cells[key]?.value));
}

export function isEntryComplete(state: PuzzleState, model: PuzzleModel, entryId: string): boolean {
	const entry = model.entriesById[entryId];
	if (!entry) return false;
	const expected = answerCharacters(entry.answer);
	return model.entryCells[entryId].every(
		(key, index) => state.cells[key]?.value === expected[index]
	);
}

export function isPuzzleComplete(state: PuzzleState, model: PuzzleModel): boolean {
	return model.puzzle.entries.every((entry) => isEntryComplete(state, model, entry.id));
}

export function solveOutcomeForEntry(state: PuzzleState, entryId: string): SolveOutcome {
	const solve = state.entrySolves[entryId];
	const hintLevel = Math.max(solve?.maxHintLevel ?? 0, state.hintLevels[entryId] ?? 0);
	if (solve?.revealed || hintLevel >= 6) return 'revealed';
	if (hintLevel === 0) return 'independent';
	if (hintLevel <= 2) return 'light-hint';
	return 'strong-hint';
}

export function getCompletedEntryIds(state: PuzzleState, model: PuzzleModel): string[] {
	return model.puzzle.entries
		.filter((entry) => isEntryComplete(state, model, entry.id))
		.map((entry) => entry.id);
}

export function getCompletionReport(state: PuzzleState, model: PuzzleModel): CompletionReport {
	const entries: EntryCompletion[] = getCompletedEntryIds(state, model).map((entryId) => {
		const entry = model.entriesById[entryId];
		return {
			entryId,
			conceptId: entry.conceptId ?? entry.id,
			outcome: solveOutcomeForEntry(state, entryId)
		};
	});
	const markedForReview = [
		...new Set(
			entries
				.filter((entry) => entry.outcome === 'strong-hint' || entry.outcome === 'revealed')
				.map((entry) => entry.conceptId)
		)
	];
	return {
		complete: entries.length === model.puzzle.entries.length && model.puzzle.entries.length > 0,
		completedEntries: entries.length,
		totalEntries: model.puzzle.entries.length,
		independent: entries.filter((entry) => entry.outcome === 'independent').length,
		withHints: entries.filter(
			(entry) => entry.outcome === 'light-hint' || entry.outcome === 'strong-hint'
		).length,
		revealed: entries.filter((entry) => entry.outcome === 'revealed').length,
		markedForReview,
		entries,
		...(state.settings.timingEnabled ? { elapsedMs: state.elapsedMs } : {})
	};
}

export interface CrossingConflict {
	cellKey: CellKey;
	entryIds: [string, string];
	clues: [string, string];
	message: string;
}

/**
 * Report wrong shared crossing letters with both clues. The result deliberately
 * avoids accusing either answer; Coach mode may separately show the cell check.
 */
export function findCrossingConflicts(state: PuzzleState, model: PuzzleModel): CrossingConflict[] {
	const conflicts: CrossingConflict[] = [];
	for (const key of model.cellOrder) {
		const cell = model.cells[key];
		if (!cell.acrossEntryId || !cell.downEntryId) continue;
		const actual = state.cells[key]?.value;
		if (!actual || actual === answerLetterAtCell(model, key)) continue;
		const entryIds: [string, string] = [cell.acrossEntryId, cell.downEntryId];
		conflicts.push({
			cellKey: key,
			entryIds,
			clues: [model.entriesById[entryIds[0]].clue, model.entriesById[entryIds[1]].clue],
			message:
				'These two answers share a letter that is inconsistent. At least one needs another look.'
		});
	}
	return conflicts;
}
