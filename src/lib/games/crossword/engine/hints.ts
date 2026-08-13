import type { CellKey, HintResult, PuzzleModel, PuzzleState } from '../types';
import { answerCharacters } from './normalize';
import { answerLetterAtCell } from './model';
import { getSelectedEntryId } from './state';
import { isEntryComplete } from './checking';

function iso(now?: Date | string): string {
	const date = now instanceof Date ? now : new Date(now ?? Date.now());
	return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function completionRatio(state: PuzzleState, model: PuzzleModel, entryId: string): number {
	const keys = model.entryCells[entryId] ?? [];
	if (!keys.length) return 0;
	return (
		keys.filter((key) => state.cells[key]?.value === answerLetterAtCell(model, key)).length /
		keys.length
	);
}

export function getStrategicRevealPositions(
	state: PuzzleState,
	model: PuzzleModel,
	entryId: string,
	count = 1
): number[] {
	const keys = model.entryCells[entryId] ?? [];
	return keys
		.map((key, position) => {
			const cell = model.cells[key];
			const current = state.cells[key];
			const alreadyKnown = current?.value === answerLetterAtCell(model, key);
			const crossingIds = cell.entryIds.filter((id) => id !== entryId);
			const unlockScore = crossingIds.reduce(
				(score, id) =>
					score +
					(isEntryComplete(state, model, id) ? 0 : 40 + completionRatio(state, model, id) * 30),
				0
			);
			return {
				position,
				eligible: !current?.revealed && !alreadyKnown,
				score:
					unlockScore + (crossingIds.length ? 100 : 0) - Math.abs(position - (keys.length - 1) / 2)
			};
		})
		.filter((candidate) => candidate.eligible)
		.sort((left, right) => right.score - left.score || left.position - right.position)
		.slice(0, Math.max(0, count))
		.map((candidate) => candidate.position);
}

function revealPositions(
	state: PuzzleState,
	model: PuzzleModel,
	entryId: string,
	positions: number[],
	now?: Date | string
): { state: PuzzleState; revealedCellKeys: CellKey[] } {
	const entry = model.entriesById[entryId];
	if (!entry) return { state, revealedCellKeys: [] };
	const answer = answerCharacters(entry.answer);
	const keys = model.entryCells[entryId];
	const cells = { ...state.cells };
	const revealedCellKeys: CellKey[] = [];
	for (const position of [...new Set(positions)]) {
		const key = keys[position];
		if (!key || !cells[key] || cells[key].value === answer[position]) continue;
		cells[key] = {
			...cells[key],
			value: answer[position],
			pencil: false,
			revealed: true,
			checkStatus: 'correct'
		};
		revealedCellKeys.push(key);
	}
	if (!revealedCellKeys.length) return { state, revealedCellKeys };
	return { state: { ...state, cells, updatedAt: iso(now) }, revealedCellKeys };
}

export function revealEntry(
	state: PuzzleState,
	model: PuzzleModel,
	entryId: string = getSelectedEntryId(state, model) ?? '',
	now?: Date | string
): HintResult {
	const entry = model.entriesById[entryId];
	if (!entry) return { state, entryId, level: 0, hint: null, revealedCellKeys: [] };
	const level = Math.max(state.hintLevels[entryId] ?? 0, entry.hints.length);
	let next: PuzzleState = {
		...state,
		hintLevels: { ...state.hintLevels, [entryId]: level },
		entrySolves: {
			...state.entrySolves,
			[entryId]: {
				...(state.entrySolves[entryId] ?? { maxHintLevel: 0, revealed: false }),
				maxHintLevel: level,
				revealed: true,
				solvedAt: iso(now),
				firstSolvedCorrectly: false
			}
		},
		updatedAt: iso(now)
	};
	const reveal = revealPositions(
		next,
		model,
		entryId,
		model.entryCells[entryId].map((_, position) => position),
		now
	);
	next = reveal.state;
	return {
		state: next,
		entryId,
		level,
		hint: entry.hints[level - 1] ?? entry.hints.at(-1) ?? null,
		revealedCellKeys: reveal.revealedCellKeys
	};
}

export function requestNextHint(
	state: PuzzleState,
	model: PuzzleModel,
	entryId: string = getSelectedEntryId(state, model) ?? '',
	now?: Date | string
): HintResult {
	const entry = model.entriesById[entryId];
	if (!entry || entry.hints.length === 0) {
		return { state, entryId, level: 0, hint: null, revealedCellKeys: [] };
	}
	const currentLevel = Math.max(0, state.hintLevels[entryId] ?? 0);
	if (currentLevel >= entry.hints.length) {
		return {
			state,
			entryId,
			level: currentLevel,
			hint: entry.hints.at(-1) ?? null,
			revealedCellKeys: []
		};
	}
	const level = currentLevel + 1;
	const hint = entry.hints[level - 1];
	let next: PuzzleState = {
		...state,
		hintLevels: { ...state.hintLevels, [entryId]: level },
		entrySolves: {
			...state.entrySolves,
			[entryId]: {
				...(state.entrySolves[entryId] ?? { maxHintLevel: 0, revealed: false }),
				maxHintLevel: level
			}
		},
		updatedAt: iso(now)
	};

	if (hint.kind === 'reveal') return revealEntry(next, model, entryId, now);
	let positions = hint.revealPositions ?? [];
	if (hint.kind === 'letter' && positions.length === 0) {
		positions = getStrategicRevealPositions(next, model, entryId, 1);
	}
	const reveal = revealPositions(next, model, entryId, positions, now);
	next = reveal.state;
	return { state: next, entryId, level, hint, revealedCellKeys: reveal.revealedCellKeys };
}

export function revealUsefulCrossingLetter(
	state: PuzzleState,
	model: PuzzleModel,
	entryId: string = getSelectedEntryId(state, model) ?? '',
	now?: Date | string
): HintResult {
	const entry = model.entriesById[entryId];
	if (!entry) return { state, entryId, level: 0, hint: null, revealedCellKeys: [] };
	const positions = getStrategicRevealPositions(state, model, entryId, 1);
	const level = Math.max(4, state.hintLevels[entryId] ?? 0);
	const assisted: PuzzleState = {
		...state,
		hintLevels: { ...state.hintLevels, [entryId]: level },
		entrySolves: {
			...state.entrySolves,
			[entryId]: {
				...(state.entrySolves[entryId] ?? { maxHintLevel: 0, revealed: false }),
				maxHintLevel: level
			}
		},
		updatedAt: iso(now)
	};
	const reveal = revealPositions(assisted, model, entryId, positions, now);
	return {
		state: reveal.state,
		entryId,
		level,
		hint: null,
		revealedCellKeys: reveal.revealedCellKeys
	};
}

/** Choose an unfinished answer with the most helpful known crossings. */
export function recommendNextEntry(
	state: PuzzleState,
	model: PuzzleModel,
	excludeEntryIds: readonly string[] = []
): string | null {
	const excluded = new Set(excludeEntryIds);
	const candidate = model.puzzle.entries
		.filter((entry) => !excluded.has(entry.id) && !isEntryComplete(state, model, entry.id))
		.map((entry) => ({
			id: entry.id,
			ratio: completionRatio(state, model, entry.id),
			length: model.entryCells[entry.id].length,
			number: model.entryNumbers[entry.id]
		}))
		.sort(
			(left, right) =>
				right.ratio - left.ratio || left.length - right.length || left.number - right.number
		)[0];
	return candidate?.id ?? null;
}
