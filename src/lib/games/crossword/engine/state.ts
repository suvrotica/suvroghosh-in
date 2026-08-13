import {
	PUZZLE_STATE_SCHEMA_VERSION,
	type CellKey,
	type Coordinate,
	type CrosswordSettings,
	type Direction,
	type PlayerCellState,
	type PuzzleModel,
	type PuzzleState,
	type RoundSelection
} from '../types';
import { answerCharacters, normalizeLetter } from './normalize';
import {
	answerLetterAtCell,
	cellKey,
	getEntryIdAtCell,
	getOrderedEntryIds,
	parseCellKey
} from './model';

export const DEFAULT_CROSSWORD_SETTINGS: Readonly<CrosswordSettings> = {
	playMode: 'coach',
	soundEnabled: false,
	hapticsEnabled: false,
	timingEnabled: false,
	announcementsEnabled: true
};

export interface CreatePuzzleStateOptions {
	now?: Date | string;
	settings?: Partial<CrosswordSettings>;
	selection?: Partial<RoundSelection>;
	direction?: Direction;
}

export interface EnterLetterOptions {
	pencil?: boolean;
	now?: Date | string;
}

function toIsoString(now: Date | string | undefined): string {
	const date = now instanceof Date ? now : new Date(now ?? Date.now());
	return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function emptyPlayerCell(): PlayerCellState {
	return { value: '', pencil: false, revealed: false, checkStatus: 'unchecked' };
}

function withUpdate(
	state: PuzzleState,
	patch: Partial<PuzzleState>,
	now?: Date | string
): PuzzleState {
	return { ...state, ...patch, updatedAt: toIsoString(now) };
}

function directionAvailable(model: PuzzleModel, key: CellKey, direction: Direction): boolean {
	return Boolean(getEntryIdAtCell(model, key, direction));
}

function preferredDirection(model: PuzzleModel, key: CellKey, preferred: Direction): Direction {
	if (directionAvailable(model, key, preferred)) return preferred;
	return directionAvailable(model, key, 'across') ? 'across' : 'down';
}

export function createPuzzleState(
	model: PuzzleModel,
	options: CreatePuzzleStateOptions = {}
): PuzzleState {
	const now = toIsoString(options.now);
	const firstEntryId = getOrderedEntryIds(model)[0];
	const firstCellKey = firstEntryId
		? model.entryCells[firstEntryId][0]
		: (model.cellOrder.find((key) => model.cells[key].kind === 'open') ?? null);
	const requestedDirection = options.direction ?? 'across';
	const direction = firstCellKey
		? preferredDirection(model, firstCellKey, requestedDirection)
		: requestedDirection;
	const cells: Record<CellKey, PlayerCellState> = {};
	for (const key of model.cellOrder) {
		if (model.cells[key].kind === 'open') cells[key] = emptyPlayerCell();
	}

	return {
		schemaVersion: PUZZLE_STATE_SCHEMA_VERSION,
		packId: model.puzzle.packId,
		puzzleId: model.puzzle.id,
		startedAt: now,
		updatedAt: now,
		selectedCellKey: firstCellKey,
		direction,
		pencilMode: false,
		cells,
		hintLevels: Object.fromEntries(model.puzzle.entries.map((entry) => [entry.id, 0])),
		entrySolves: Object.fromEntries(
			model.puzzle.entries.map((entry) => [entry.id, { maxHintLevel: 0, revealed: false }])
		),
		settings: { ...DEFAULT_CROSSWORD_SETTINGS, ...options.settings },
		selection: {
			topicIds: options.selection?.topicIds ?? [...model.puzzle.topicIds],
			level: options.selection?.level ?? model.puzzle.level,
			sessionFormat: options.selection?.sessionFormat ?? model.puzzle.sessionFormat
		},
		elapsedMs: 0
	};
}

export function resetPuzzleState(
	state: PuzzleState,
	model: PuzzleModel,
	now: Date | string = new Date()
): PuzzleState {
	return createPuzzleState(model, {
		now,
		settings: state.settings,
		selection: state.selection,
		direction: state.direction
	});
}

export function getSelectedEntryId(state: PuzzleState, model: PuzzleModel): string | null {
	if (!state.selectedCellKey) return null;
	return getEntryIdAtCell(model, state.selectedCellKey, state.direction) ?? null;
}

export function selectCell(
	state: PuzzleState,
	model: PuzzleModel,
	coordinate: Coordinate | CellKey | string,
	direction?: Direction,
	now?: Date | string
): PuzzleState {
	const key =
		typeof coordinate === 'string'
			? (coordinate as CellKey)
			: cellKey(coordinate.row, coordinate.column);
	const cell = model.cells[key];
	if (!cell || cell.kind !== 'open' || cell.entryIds.length === 0) return state;

	let nextDirection: Direction;
	if (direction && directionAvailable(model, key, direction)) {
		nextDirection = direction;
	} else if (
		!direction &&
		state.selectedCellKey === key &&
		cell.acrossEntryId &&
		cell.downEntryId
	) {
		nextDirection = state.direction === 'across' ? 'down' : 'across';
	} else {
		nextDirection = preferredDirection(model, key, state.direction);
	}

	if (state.selectedCellKey === key && state.direction === nextDirection) return state;
	return withUpdate(state, { selectedCellKey: key, direction: nextDirection }, now);
}

export function selectEntry(
	state: PuzzleState,
	model: PuzzleModel,
	entryId: string,
	now?: Date | string
): PuzzleState {
	const entry = model.entriesById[entryId];
	const keys = model.entryCells[entryId];
	if (!entry || !keys?.length) return state;
	const target = keys.find((key) => !state.cells[key]?.value) ?? keys[0];
	return withUpdate(state, { selectedCellKey: target, direction: entry.direction }, now);
}

export function toggleDirection(
	state: PuzzleState,
	model: PuzzleModel,
	now?: Date | string
): PuzzleState {
	if (!state.selectedCellKey) return state;
	const cell = model.cells[state.selectedCellKey];
	if (!cell?.acrossEntryId || !cell.downEntryId) return state;
	return withUpdate(state, { direction: state.direction === 'across' ? 'down' : 'across' }, now);
}

export function moveSpatial(
	state: PuzzleState,
	model: PuzzleModel,
	deltaRow: number,
	deltaColumn: number,
	now?: Date | string
): PuzzleState {
	if (!state.selectedCellKey || (deltaRow === 0 && deltaColumn === 0)) return state;
	const current = parseCellKey(state.selectedCellKey);
	if (!current) return state;
	let row = current.row + Math.sign(deltaRow);
	let column = current.column + Math.sign(deltaColumn);
	while (row >= 0 && row < model.puzzle.height && column >= 0 && column < model.puzzle.width) {
		const key = cellKey(row, column);
		const candidate = model.cells[key];
		if (candidate?.kind === 'open' && candidate.entryIds.length > 0) {
			return selectCell(state, model, key, undefined, now);
		}
		row += Math.sign(deltaRow);
		column += Math.sign(deltaColumn);
	}
	return state;
}

export function moveToNextEntry(
	state: PuzzleState,
	model: PuzzleModel,
	now?: Date | string
): PuzzleState {
	return moveEntry(state, model, 1, now);
}

export function moveToPreviousEntry(
	state: PuzzleState,
	model: PuzzleModel,
	now?: Date | string
): PuzzleState {
	return moveEntry(state, model, -1, now);
}

function moveEntry(
	state: PuzzleState,
	model: PuzzleModel,
	delta: -1 | 1,
	now?: Date | string
): PuzzleState {
	const ids = getOrderedEntryIds(model);
	if (ids.length === 0) return state;
	const selected = getSelectedEntryId(state, model);
	const currentIndex = selected ? ids.indexOf(selected) : -1;
	const nextIndex = currentIndex < 0 ? 0 : (currentIndex + delta + ids.length) % ids.length;
	return selectEntry(state, model, ids[nextIndex], now);
}

function isEntryCorrect(state: PuzzleState, model: PuzzleModel, entryId: string): boolean {
	const answer = answerCharacters(model.entriesById[entryId].answer);
	return model.entryCells[entryId].every((key, index) => state.cells[key]?.value === answer[index]);
}

function updateEntrySolves(
	state: PuzzleState,
	model: PuzzleModel,
	entryIds: string[],
	now: Date | string | undefined
): PuzzleState['entrySolves'] {
	let result = state.entrySolves;
	for (const entryId of entryIds) {
		if (!isEntryCorrect(state, model, entryId)) continue;
		const current = result[entryId] ?? {
			maxHintLevel: state.hintLevels[entryId] ?? 0,
			revealed: false
		};
		if (current.solvedAt) continue;
		if (result === state.entrySolves) result = { ...result };
		result[entryId] = {
			...current,
			maxHintLevel: Math.max(current.maxHintLevel, state.hintLevels[entryId] ?? 0),
			solvedAt: toIsoString(now),
			firstSolvedCorrectly: true
		};
	}
	return result;
}

function nextKeyInEntry(model: PuzzleModel, entryId: string, currentKey: CellKey): CellKey {
	const keys = model.entryCells[entryId];
	const index = keys.indexOf(currentKey);
	return keys[Math.min(index + 1, keys.length - 1)] ?? currentKey;
}

export function enterLetter(
	state: PuzzleState,
	model: PuzzleModel,
	input: string,
	options: EnterLetterOptions = {}
): PuzzleState {
	const value = normalizeLetter(input);
	const key = state.selectedCellKey;
	if (!value || !key || !state.cells[key] || state.cells[key].revealed) return state;
	const expected = answerLetterAtCell(model, key);
	const cells = {
		...state.cells,
		[key]: {
			...state.cells[key],
			value,
			pencil: options.pencil ?? state.pencilMode,
			checkStatus:
				state.settings.playMode === 'coach'
					? value === expected
						? 'correct'
						: 'incorrect'
					: 'unchecked'
		}
	};
	let next: PuzzleState = { ...state, cells };
	const entrySolves = updateEntrySolves(next, model, model.cells[key].entryIds, options.now);
	const selectedEntryId = getSelectedEntryId(next, model);
	const selectedCellKey = selectedEntryId ? nextKeyInEntry(model, selectedEntryId, key) : key;
	next = withUpdate(next, { entrySolves, selectedCellKey }, options.now);
	return next;
}

export function enterEntryAnswer(
	state: PuzzleState,
	model: PuzzleModel,
	entryId: string,
	input: string,
	options: EnterLetterOptions = {}
): PuzzleState {
	const entry = model.entriesById[entryId];
	if (!entry) return state;
	const inputCharacters = answerCharacters(input);
	const expectedCharacters = answerCharacters(entry.answer);
	const keys = model.entryCells[entryId];
	const cells = { ...state.cells };
	for (let index = 0; index < keys.length; index += 1) {
		const key = keys[index];
		if (cells[key].revealed) continue;
		const value = inputCharacters[index] ?? '';
		cells[key] = {
			...cells[key],
			value,
			pencil: value ? (options.pencil ?? state.pencilMode) : false,
			checkStatus:
				value && state.settings.playMode === 'coach'
					? value === expectedCharacters[index]
						? 'correct'
						: 'incorrect'
					: 'unchecked'
		};
	}
	let next: PuzzleState = {
		...state,
		cells,
		selectedCellKey: keys[Math.min(inputCharacters.length, keys.length) - 1] ?? keys[0],
		direction: entry.direction
	};
	const affected = [...new Set(keys.flatMap((key) => model.cells[key].entryIds))];
	next = withUpdate(
		next,
		{ entrySolves: updateEntrySolves(next, model, affected, options.now) },
		options.now
	);
	return next;
}

function clearCell(state: PuzzleState, key: CellKey, now?: Date | string): PuzzleState {
	const current = state.cells[key];
	if (!current || current.revealed) return state;
	return withUpdate(
		state,
		{
			cells: {
				...state.cells,
				[key]: { ...current, value: '', pencil: false, checkStatus: 'unchecked' }
			}
		},
		now
	);
}

export function deleteCell(
	state: PuzzleState,
	_model: PuzzleModel,
	now?: Date | string
): PuzzleState {
	return state.selectedCellKey ? clearCell(state, state.selectedCellKey, now) : state;
}

export function backspace(
	state: PuzzleState,
	model: PuzzleModel,
	now?: Date | string
): PuzzleState {
	const key = state.selectedCellKey;
	if (!key) return state;
	if (state.cells[key]?.value) {
		return state.cells[key].revealed ? state : clearCell(state, key, now);
	}
	const entryId = getSelectedEntryId(state, model);
	if (!entryId) return state;
	const keys = model.entryCells[entryId];
	const index = keys.indexOf(key);
	if (index <= 0) return state;
	const previousKey = keys[index - 1];
	const selected = withUpdate(state, { selectedCellKey: previousKey }, now);
	return clearCell(selected, previousKey, now);
}

export function togglePencilMode(state: PuzzleState, now?: Date | string): PuzzleState {
	return withUpdate(state, { pencilMode: !state.pencilMode }, now);
}

export function setCellPencil(
	state: PuzzleState,
	key: CellKey,
	pencil: boolean,
	now?: Date | string
): PuzzleState {
	const cell = state.cells[key];
	if (!cell || cell.revealed || !cell.value || cell.pencil === pencil) return state;
	return withUpdate(state, { cells: { ...state.cells, [key]: { ...cell, pencil } } }, now);
}

export function confirmEntry(
	state: PuzzleState,
	model: PuzzleModel,
	entryId = getSelectedEntryId(state, model),
	now?: Date | string
): PuzzleState {
	if (!entryId || !model.entryCells[entryId]) return state;
	let changed = false;
	const cells = { ...state.cells };
	for (const key of model.entryCells[entryId]) {
		if (cells[key]?.pencil) {
			cells[key] = { ...cells[key], pencil: false };
			changed = true;
		}
	}
	return changed ? withUpdate(state, { cells }, now) : state;
}

export function updateCrosswordSettings(
	state: PuzzleState,
	settings: Partial<CrosswordSettings>,
	now?: Date | string
): PuzzleState {
	return withUpdate(state, { settings: { ...state.settings, ...settings } }, now);
}

export function updateElapsedTime(
	state: PuzzleState,
	elapsedMs: number,
	now?: Date | string
): PuzzleState {
	return withUpdate(state, { elapsedMs: Math.max(0, Math.floor(elapsedMs)) }, now);
}

export function getKnownEntryPattern(
	state: PuzzleState,
	model: PuzzleModel,
	entryId: string,
	blank = '–'
): string {
	return (model.entryCells[entryId] ?? []).map((key) => state.cells[key]?.value || blank).join(' ');
}
