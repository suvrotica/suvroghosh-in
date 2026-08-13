import {
	CROSSWORD_PROGRESS_SCHEMA_VERSION,
	PUZZLE_STATE_SCHEMA_VERSION,
	type CellKey,
	type ConceptMasteryRecord,
	type CrosswordProgress,
	type CrosswordProgressExport,
	type CrosswordSettings,
	type KeyValueStorage,
	type MasteryAttempt,
	type MasteryHistory,
	type PlayerCellState,
	type ProgressImportResult,
	type PuzzleModel,
	type PuzzleState,
	type SavedPuzzle,
	type SolveOutcome
} from '../types';
import { normalizeLetter } from '../engine/normalize';
import { DEFAULT_CROSSWORD_SETTINGS } from '../engine/state';

export const CROSSWORD_STORAGE_KEY = 'suvroghosh.crossword.progress';

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function decode(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

function validDate(value: unknown, fallback: string): string {
	return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(0, Math.floor(value))
		: fallback;
}

function boundedNumber(value: unknown, fallback = 0, maximum = 100): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.min(maximum, Math.max(0, value))
		: fallback;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? [
				...new Set(
					value.filter((item): item is string => typeof item === 'string' && item.length > 0)
				)
			]
		: [];
}

function parseSettings(value: unknown, legacyMode?: unknown): CrosswordSettings {
	const record = isRecord(value) ? value : {};
	const playModeCandidate = record.playMode ?? legacyMode;
	return {
		playMode: playModeCandidate === 'traditional' ? 'traditional' : 'coach',
		soundEnabled: typeof record.soundEnabled === 'boolean' ? record.soundEnabled : false,
		hapticsEnabled: typeof record.hapticsEnabled === 'boolean' ? record.hapticsEnabled : false,
		timingEnabled: typeof record.timingEnabled === 'boolean' ? record.timingEnabled : false,
		announcementsEnabled:
			typeof record.announcementsEnabled === 'boolean' ? record.announcementsEnabled : true
	};
}

function parsePlayerCell(value: unknown): PlayerCellState | null {
	if (!isRecord(value)) return null;
	const rawValue =
		typeof value.value === 'string'
			? value.value
			: typeof value.letter === 'string'
				? value.letter
				: '';
	const letter = rawValue ? normalizeLetter(rawValue) : '';
	const rawCheck = value.checkStatus ?? value.status;
	const checkStatus =
		letter && (rawCheck === 'correct' || rawCheck === 'incorrect')
			? rawCheck
			: ('unchecked' as const);
	const revealed = Boolean(letter) && value.revealed === true;
	return {
		value: letter,
		pencil:
			Boolean(letter) && !revealed
				? typeof value.pencil === 'boolean'
					? value.pencil
					: value.tentative === true
				: false,
		revealed,
		checkStatus
	};
}

function parseCellMap(value: unknown): Record<CellKey, PlayerCellState> {
	if (!isRecord(value)) return {};
	const cells: Partial<Record<CellKey, PlayerCellState>> = {};
	for (const [key, candidate] of Object.entries(value)) {
		if (!/^\d+,\d+$/.test(key)) continue;
		const cell = parsePlayerCell(candidate);
		if (cell) cells[key as CellKey] = cell;
	}
	return cells as Record<CellKey, PlayerCellState>;
}

function parseHintLevels(value: unknown): Record<string, number> {
	if (!isRecord(value)) return {};
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => key.length > 0)
			.map(([key, level]) => [key, Math.min(6, nonNegativeInteger(level))])
	);
}

function parseEntrySolves(
	value: unknown,
	hintLevels: Record<string, number>,
	completedEntryIds: unknown,
	updatedAt: string
): PuzzleState['entrySolves'] {
	const solves: PuzzleState['entrySolves'] = {};
	if (isRecord(value)) {
		for (const [entryId, candidate] of Object.entries(value)) {
			if (!isRecord(candidate)) continue;
			solves[entryId] = {
				maxHintLevel: Math.min(
					6,
					nonNegativeInteger(candidate.maxHintLevel, hintLevels[entryId] ?? 0)
				),
				revealed: candidate.revealed === true,
				...(typeof candidate.solvedAt === 'string' && !Number.isNaN(Date.parse(candidate.solvedAt))
					? { solvedAt: candidate.solvedAt }
					: {}),
				...(typeof candidate.firstSolvedCorrectly === 'boolean'
					? { firstSolvedCorrectly: candidate.firstSolvedCorrectly }
					: {})
			};
		}
	}
	for (const entryId of stringArray(completedEntryIds)) {
		if (!solves[entryId]) {
			solves[entryId] = {
				maxHintLevel: hintLevels[entryId] ?? 0,
				revealed: (hintLevels[entryId] ?? 0) >= 6,
				solvedAt: updatedAt,
				firstSolvedCorrectly: true
			};
		}
	}
	return solves;
}

function coordinateKey(value: unknown): CellKey | null {
	if (typeof value === 'string' && /^\d+,\d+$/.test(value)) return value as CellKey;
	if (isRecord(value)) {
		if (
			typeof value.row === 'number' &&
			Number.isInteger(value.row) &&
			value.row >= 0 &&
			typeof value.column === 'number' &&
			Number.isInteger(value.column) &&
			value.column >= 0
		) {
			return `${value.row},${value.column}`;
		}
	}
	return null;
}

function parsePuzzleState(
	value: unknown,
	fallbackPackId = '',
	fallbackPuzzleId = ''
): PuzzleState | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.schemaVersion === 'number' &&
		value.schemaVersion > PUZZLE_STATE_SCHEMA_VERSION
	) {
		return null;
	}
	const packId = typeof value.packId === 'string' ? value.packId : fallbackPackId;
	const puzzleId = typeof value.puzzleId === 'string' ? value.puzzleId : fallbackPuzzleId;
	if (!packId || !puzzleId) return null;
	const epoch = new Date(0).toISOString();
	const startedAt = validDate(value.startedAt, epoch);
	const updatedAt = validDate(value.updatedAt, startedAt);
	const hintLevels = parseHintLevels(value.hintLevels ?? value.hints);
	const rawSelection = isRecord(value.selection) ? value.selection : {};
	const levelCandidate = rawSelection.level ?? value.level;
	const sessionCandidate = rawSelection.sessionFormat ?? value.sessionFormat;
	return {
		schemaVersion: PUZZLE_STATE_SCHEMA_VERSION,
		packId,
		puzzleId,
		startedAt,
		updatedAt,
		selectedCellKey: coordinateKey(value.selectedCellKey ?? value.activeCell),
		direction: value.direction === 'down' || value.activeDirection === 'down' ? 'down' : 'across',
		pencilMode: value.pencilMode === true,
		cells: parseCellMap(value.cells),
		hintLevels,
		entrySolves: parseEntrySolves(
			value.entrySolves,
			hintLevels,
			value.completedEntryIds,
			updatedAt
		),
		settings: parseSettings(value.settings, value.mode),
		selection: {
			topicIds: stringArray(rawSelection.topicIds ?? value.topicIds),
			level:
				levelCandidate === 'refresh' ||
				levelCandidate === 'architect' ||
				levelCandidate === 'adaptive'
					? levelCandidate
					: 'working',
			sessionFormat:
				sessionCandidate === 'tutorial' ||
				sessionCandidate === 'quick' ||
				sessionCandidate === 'deep' ||
				sessionCandidate === 'review'
					? sessionCandidate
					: 'coffee'
		},
		elapsedMs: nonNegativeInteger(value.elapsedMs)
	};
}

const OUTCOMES: SolveOutcome[] = ['independent', 'light-hint', 'strong-hint', 'revealed'];
const SCORES: Record<SolveOutcome, 0 | 1 | 2 | 3> = {
	independent: 3,
	'light-hint': 2,
	'strong-hint': 1,
	revealed: 0
};

function parseAttempt(value: unknown): MasteryAttempt | null {
	if (!isRecord(value) || !OUTCOMES.includes(value.outcome as SolveOutcome)) return null;
	const outcome = value.outcome as SolveOutcome;
	const at = validDate(value.at, new Date(0).toISOString());
	const puzzleId = typeof value.puzzleId === 'string' ? value.puzzleId : '';
	const entryId = typeof value.entryId === 'string' ? value.entryId : '';
	if (!puzzleId || !entryId) return null;
	return { at, puzzleId, entryId, outcome, score: SCORES[outcome] };
}

function parseConcept(conceptId: string, value: unknown): ConceptMasteryRecord | null {
	if (!isRecord(value)) return null;
	const attemptsSource = value.recentAttempts ?? value.attempts;
	const recentAttempts = Array.isArray(attemptsSource)
		? attemptsSource
				.flatMap((candidate) => {
					const attempt = parseAttempt(candidate);
					return attempt ? [attempt] : [];
				})
				.slice(0, 8)
		: [];
	return {
		conceptId: typeof value.conceptId === 'string' ? value.conceptId : conceptId,
		topicIds: stringArray(value.topicIds),
		independentSolves: nonNegativeInteger(value.independentSolves),
		lightHintSolves: nonNegativeInteger(value.lightHintSolves),
		strongHintSolves: nonNegativeInteger(value.strongHintSolves),
		reveals: nonNegativeInteger(value.reveals),
		recentAttempts,
		lastReviewed:
			typeof value.lastReviewed === 'string' && !Number.isNaN(Date.parse(value.lastReviewed))
				? value.lastReviewed
				: null,
		reviewPriority: boundedNumber(value.reviewPriority)
	};
}

function parseMasteryHistory(value: unknown): MasteryHistory {
	const source = isRecord(value) && isRecord(value.concepts) ? value.concepts : value;
	const concepts: MasteryHistory['concepts'] = {};
	if (!isRecord(source)) return { concepts };
	for (const [conceptId, candidate] of Object.entries(source)) {
		const concept = parseConcept(conceptId, candidate);
		if (concept) concepts[concept.conceptId] = concept;
	}
	return { concepts };
}

export function createEmptyProgress(
	now: Date | string = new Date(),
	settings: Partial<CrosswordSettings> = {}
): CrosswordProgress {
	const parsed = now instanceof Date ? now : new Date(now);
	const updatedAt = Number.isNaN(parsed.getTime())
		? new Date().toISOString()
		: parsed.toISOString();
	return {
		schemaVersion: CROSSWORD_PROGRESS_SCHEMA_VERSION,
		updatedAt,
		settings: { ...DEFAULT_CROSSWORD_SETTINGS, ...settings },
		savedPuzzles: {},
		masteryByPack: {}
	};
}

/** Parse and migrate v1 progress. Malformed individual records are dropped safely. */
export function parseCrosswordProgress(value: unknown): CrosswordProgress {
	let decoded = decode(value);
	if (isRecord(decoded) && decoded.format === 'suvroghosh-crossword-progress') {
		decoded = decoded.progress;
	}
	if (!isRecord(decoded)) return createEmptyProgress(new Date(0));
	if (
		typeof decoded.schemaVersion === 'number' &&
		decoded.schemaVersion > CROSSWORD_PROGRESS_SCHEMA_VERSION
	) {
		return createEmptyProgress(new Date(0));
	}
	const epoch = new Date(0).toISOString();
	const updatedAt = validDate(decoded.updatedAt, epoch);
	const savedPuzzles: CrosswordProgress['savedPuzzles'] = {};
	const savedSource = decoded.savedPuzzles ?? decoded.savedRounds ?? decoded.rounds;
	if (isRecord(savedSource)) {
		for (const [legacyKey, candidate] of Object.entries(savedSource)) {
			const wrapper = isRecord(candidate) && isRecord(candidate.state) ? candidate : null;
			const stateCandidate = wrapper ? wrapper.state : candidate;
			const pieces = legacyKey.split(/[/:]/u);
			const fallbackPackId =
				wrapper && typeof wrapper.packId === 'string'
					? wrapper.packId
					: pieces.length > 1
						? pieces[0]
						: '';
			const fallbackPuzzleId =
				wrapper && typeof wrapper.puzzleId === 'string'
					? wrapper.puzzleId
					: pieces.length > 1
						? pieces.slice(1).join(':')
						: legacyKey;
			const state = parsePuzzleState(stateCandidate, fallbackPackId, fallbackPuzzleId);
			if (!state) continue;
			const key = savedPuzzleKey(state.packId, state.puzzleId);
			savedPuzzles[key] = {
				packId: state.packId,
				puzzleId: state.puzzleId,
				state,
				updatedAt: wrapper ? validDate(wrapper.updatedAt, state.updatedAt) : state.updatedAt
			};
		}
	}

	const masteryByPack: CrosswordProgress['masteryByPack'] = {};
	const masterySource = decoded.masteryByPack ?? decoded.learningHistory;
	if (isRecord(masterySource)) {
		for (const [packId, history] of Object.entries(masterySource)) {
			masteryByPack[packId] = parseMasteryHistory(history);
		}
	} else if (isRecord(decoded.mastery) && typeof decoded.packId === 'string') {
		masteryByPack[decoded.packId] = parseMasteryHistory(decoded.mastery);
	}

	return {
		schemaVersion: CROSSWORD_PROGRESS_SCHEMA_VERSION,
		updatedAt,
		settings: parseSettings(decoded.settings),
		savedPuzzles,
		masteryByPack
	};
}

export const migrateCrosswordProgress = parseCrosswordProgress;

export function serializeCrosswordProgress(progress: CrosswordProgress): string {
	return JSON.stringify(parseCrosswordProgress(progress));
}

export function savedPuzzleKey(packId: string, puzzleId: string): string {
	return `${packId}/${puzzleId}`;
}

export function savePuzzleState(
	progress: CrosswordProgress,
	state: PuzzleState,
	now: Date | string = new Date()
): CrosswordProgress {
	const parsed = now instanceof Date ? now : new Date(now);
	const updatedAt = Number.isNaN(parsed.getTime())
		? new Date().toISOString()
		: parsed.toISOString();
	const normalisedState = parsePuzzleState({ ...state, updatedAt });
	if (!normalisedState) return progress;
	const key = savedPuzzleKey(state.packId, state.puzzleId);
	const saved: SavedPuzzle = {
		packId: state.packId,
		puzzleId: state.puzzleId,
		state: normalisedState,
		updatedAt
	};
	return {
		...progress,
		updatedAt,
		settings: normalisedState.settings,
		savedPuzzles: { ...progress.savedPuzzles, [key]: saved }
	};
}

function repairStateForModel(state: PuzzleState, model: PuzzleModel): PuzzleState | null {
	if (state.packId !== model.puzzle.packId || state.puzzleId !== model.puzzle.id) return null;
	const cells: PuzzleState['cells'] = {};
	for (const key of model.cellOrder) {
		if (model.cells[key].kind !== 'open' || model.cells[key].entryIds.length === 0) continue;
		cells[key] = state.cells[key] ?? {
			value: '',
			pencil: false,
			revealed: false,
			checkStatus: 'unchecked'
		};
	}
	const entryIds = new Set(model.puzzle.entries.map((entry) => entry.id));
	const hintLevels = Object.fromEntries(
		model.puzzle.entries.map((entry) => [entry.id, state.hintLevels[entry.id] ?? 0])
	);
	const entrySolves = Object.fromEntries(
		model.puzzle.entries.map((entry) => [
			entry.id,
			state.entrySolves[entry.id] ?? { maxHintLevel: hintLevels[entry.id], revealed: false }
		])
	);
	const selectedCellKey =
		state.selectedCellKey && cells[state.selectedCellKey]
			? state.selectedCellKey
			: (model.entryCells[
					model.puzzle.entries.find((entry) => entryIds.has(entry.id))?.id ?? ''
				]?.[0] ?? null);
	const selectedCell = selectedCellKey ? model.cells[selectedCellKey] : undefined;
	const direction =
		state.direction === 'across' && selectedCell?.acrossEntryId
			? 'across'
			: state.direction === 'down' && selectedCell?.downEntryId
				? 'down'
				: selectedCell?.acrossEntryId
					? 'across'
					: 'down';
	return { ...state, cells, hintLevels, entrySolves, selectedCellKey, direction };
}

export function restorePuzzleState(
	progress: CrosswordProgress,
	packId: string,
	puzzleId: string,
	model?: PuzzleModel
): PuzzleState | null {
	const state = progress.savedPuzzles[savedPuzzleKey(packId, puzzleId)]?.state ?? null;
	return state && model ? repairStateForModel(state, model) : state;
}

export function removeSavedPuzzle(
	progress: CrosswordProgress,
	packId: string,
	puzzleId: string,
	now: Date | string = new Date()
): CrosswordProgress {
	const key = savedPuzzleKey(packId, puzzleId);
	if (!progress.savedPuzzles[key]) return progress;
	const savedPuzzles = { ...progress.savedPuzzles };
	delete savedPuzzles[key];
	const parsed = now instanceof Date ? now : new Date(now);
	return {
		...progress,
		updatedAt: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
		savedPuzzles
	};
}

export function clearPackProgress(
	progress: CrosswordProgress,
	packId: string,
	now: Date | string = new Date()
): CrosswordProgress {
	const savedPuzzles = Object.fromEntries(
		Object.entries(progress.savedPuzzles).filter(([, saved]) => saved.packId !== packId)
	);
	const masteryByPack = { ...progress.masteryByPack };
	delete masteryByPack[packId];
	const parsed = now instanceof Date ? now : new Date(now);
	return {
		...progress,
		updatedAt: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
		savedPuzzles,
		masteryByPack
	};
}

export function updatePackMastery(
	progress: CrosswordProgress,
	packId: string,
	history: MasteryHistory,
	now: Date | string = new Date()
): CrosswordProgress {
	const parsed = now instanceof Date ? now : new Date(now);
	return {
		...progress,
		updatedAt: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
		masteryByPack: { ...progress.masteryByPack, [packId]: parseMasteryHistory(history) }
	};
}

export function clearAllCrosswordData(now: Date | string = new Date()): CrosswordProgress {
	return createEmptyProgress(now);
}

export function exportProgress(
	progress: CrosswordProgress,
	now: Date | string = new Date()
): string {
	const parsed = now instanceof Date ? now : new Date(now);
	const envelope: CrosswordProgressExport = {
		format: 'suvroghosh-crossword-progress',
		exportedAt: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
		progress: parseCrosswordProgress(progress)
	};
	return JSON.stringify(envelope, null, 2);
}

export function importProgress(value: unknown): ProgressImportResult {
	const decoded = decode(value);
	if (!isRecord(decoded)) return { ok: false, error: 'This is not valid crossword progress JSON.' };
	const candidate = decoded.format === 'suvroghosh-crossword-progress' ? decoded.progress : decoded;
	if (!isRecord(candidate)) return { ok: false, error: 'The progress payload is missing.' };
	if (
		typeof candidate.schemaVersion === 'number' &&
		candidate.schemaVersion > CROSSWORD_PROGRESS_SCHEMA_VERSION
	) {
		return { ok: false, error: 'This progress file was created by a newer crossword version.' };
	}
	if (
		candidate.schemaVersion !== 1 &&
		candidate.schemaVersion !== CROSSWORD_PROGRESS_SCHEMA_VERSION &&
		!('savedPuzzles' in candidate) &&
		!('savedRounds' in candidate) &&
		!('masteryByPack' in candidate)
	) {
		return { ok: false, error: 'This JSON is not a recognised crossword progress file.' };
	}
	return { ok: true, progress: parseCrosswordProgress(candidate) };
}

export function loadCrosswordProgress(
	storage: KeyValueStorage,
	key = CROSSWORD_STORAGE_KEY
): CrosswordProgress {
	try {
		return parseCrosswordProgress(storage.getItem(key));
	} catch {
		return createEmptyProgress(new Date(0));
	}
}

export function storeCrosswordProgress(
	storage: KeyValueStorage,
	progress: CrosswordProgress,
	key = CROSSWORD_STORAGE_KEY
): boolean {
	try {
		storage.setItem(key, serializeCrosswordProgress(progress));
		return true;
	} catch {
		return false;
	}
}

export function clearStoredCrosswordProgress(
	storage: KeyValueStorage,
	key = CROSSWORD_STORAGE_KEY
): boolean {
	try {
		storage.removeItem(key);
		return true;
	} catch {
		return false;
	}
}
