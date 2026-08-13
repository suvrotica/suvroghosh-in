/** Current serialised content-pack format. */
export const CROSSWORD_PACK_SCHEMA_VERSION = 1 as const;

/** Current local progress/export format. */
export const CROSSWORD_PROGRESS_SCHEMA_VERSION = 2 as const;

/** Current saved in-round state format. */
export const PUZZLE_STATE_SCHEMA_VERSION = 1 as const;

export type Direction = 'across' | 'down';
export type DifficultyLevel = 'refresh' | 'working' | 'architect' | 'adaptive';
export type SessionFormat = 'tutorial' | 'quick' | 'coffee' | 'deep' | 'review';
export type PlayMode = 'coach' | 'traditional';
export type CellKey = `${number},${number}`;
export type ISODateString = string;

export type HintKind =
	| 'nudge'
	| 'plain-language'
	| 'contrast'
	| 'letter'
	| 'nearly-obvious'
	| 'reveal';

export interface Coordinate {
	row: number;
	column: number;
}

export interface LearningSource {
	title: string;
	url: string;
	publisher?: string;
	accessedOrReviewed: ISODateString;
	note?: string;
}

export type KnowledgeFreshness =
	| 'stable'
	| 'version-sensitive'
	| 'jurisdiction-specific'
	| 'recommended-practice';

export interface EntryLearning {
	definition: string;
	whyItMatters: string;
	example?: string;
	commonConfusion?: string;
	related?: string[];
	goDeeper?: string;
	freshness?: KnowledgeFreshness;
	sources: LearningSource[];
}

export interface HintStep {
	kind: HintKind;
	text: string;
	/** Zero-based positions in the normalised answer. Only valid for letter/reveal hints. */
	revealPositions?: number[];
}

export interface CrosswordEntry {
	id: string;
	/** Stable learning identifier shared by the same concept in multiple puzzles. Defaults to id. */
	conceptId?: string;
	/** Canonical answer. Formatting ignored by the grid may be retained in displayAnswer. */
	answer: string;
	displayAnswer?: string;
	direction: Direction;
	row: number;
	column: number;
	clue: string;
	hints: HintStep[];
	learning: EntryLearning;
	tags: string[];
}

export interface PuzzleCell {
	row: number;
	column: number;
	kind: 'open' | 'block';
}

export interface PuzzleTutorialStep {
	id: string;
	title: string;
	text: string;
	cell?: Coordinate;
	entryId?: string;
}

export interface CrosswordPuzzle {
	id: string;
	packId: string;
	title: string;
	subtitle?: string;
	topicIds: string[];
	level: DifficultyLevel;
	sessionFormat: SessionFormat;
	estimatedMinutes: number;
	width: number;
	height: number;
	/** A complete row-major description of all width x height cells. */
	cells: PuzzleCell[];
	entries: CrosswordEntry[];
	completionNote?: string;
	reviewedAt: ISODateString;
	tutorial?: PuzzleTutorialStep[];
}

export interface TopicDefinition {
	id: string;
	title: string;
	description: string;
	shortTitle?: string;
}

export interface DifficultyDefinition {
	id: DifficultyLevel;
	title: string;
	description: string;
}

export interface CrosswordTheme {
	accent?: string;
	accentSoft?: string;
	gridPaper?: string;
	illustration?: string;
}

export interface CrosswordPack {
	schemaVersion: typeof CROSSWORD_PACK_SCHEMA_VERSION;
	id: string;
	title: string;
	description: string;
	topics: TopicDefinition[];
	levels: DifficultyDefinition[];
	puzzles: CrosswordPuzzle[];
	theme?: CrosswordTheme;
}

export interface ModelCell extends PuzzleCell {
	key: CellKey;
	number?: number;
	entryIds: string[];
	acrossEntryId?: string;
	downEntryId?: string;
}

export interface PuzzleModel {
	puzzle: CrosswordPuzzle;
	cells: Record<CellKey, ModelCell>;
	cellOrder: CellKey[];
	entriesById: Record<string, CrosswordEntry>;
	entryCells: Record<string, CellKey[]>;
	entryNumbers: Record<string, number>;
	acrossEntryIds: string[];
	downEntryIds: string[];
}

export type CellCheckStatus = 'unchecked' | 'correct' | 'incorrect';

export interface PlayerCellState {
	value: string;
	pencil: boolean;
	revealed: boolean;
	checkStatus: CellCheckStatus;
}

export interface EntrySolveState {
	maxHintLevel: number;
	revealed: boolean;
	solvedAt?: ISODateString;
	firstSolvedCorrectly?: boolean;
}

export interface CrosswordSettings {
	playMode: PlayMode;
	soundEnabled: boolean;
	hapticsEnabled: boolean;
	timingEnabled: boolean;
	announcementsEnabled: boolean;
}

export interface RoundSelection {
	topicIds: string[];
	level: DifficultyLevel;
	sessionFormat: SessionFormat;
}

export interface PuzzleState {
	schemaVersion: typeof PUZZLE_STATE_SCHEMA_VERSION;
	packId: string;
	puzzleId: string;
	startedAt: ISODateString;
	updatedAt: ISODateString;
	selectedCellKey: CellKey | null;
	direction: Direction;
	pencilMode: boolean;
	cells: Record<CellKey, PlayerCellState>;
	hintLevels: Record<string, number>;
	entrySolves: Record<string, EntrySolveState>;
	settings: CrosswordSettings;
	selection: RoundSelection;
	elapsedMs: number;
}

export type CheckScope = 'letter' | 'entry' | 'puzzle';

export interface CheckedCell {
	key: CellKey;
	actual: string;
	expected: string;
	status: 'blank' | 'correct' | 'incorrect';
}

export interface CheckResult {
	scope: CheckScope;
	cells: CheckedCell[];
	correct: boolean;
	complete: boolean;
}

export interface HintResult {
	state: PuzzleState;
	entryId: string;
	level: number;
	hint: HintStep | null;
	revealedCellKeys: CellKey[];
}

export type SolveOutcome = 'independent' | 'light-hint' | 'strong-hint' | 'revealed';

export interface MasteryAttempt {
	at: ISODateString;
	puzzleId: string;
	entryId: string;
	outcome: SolveOutcome;
	score: 0 | 1 | 2 | 3;
}

export interface ConceptMasteryRecord {
	conceptId: string;
	topicIds: string[];
	independentSolves: number;
	lightHintSolves: number;
	strongHintSolves: number;
	reveals: number;
	recentAttempts: MasteryAttempt[];
	lastReviewed: ISODateString | null;
	/** Larger values are reviewed sooner. This is a relative queue weight, not a percentage. */
	reviewPriority: number;
}

export type MasteryLabel =
	| 'Ready'
	| 'Worth another crossing'
	| 'Needs a refresher'
	| 'Newly encountered';

export interface MasteryHistory {
	concepts: Record<string, ConceptMasteryRecord>;
}

export interface SavedPuzzle {
	packId: string;
	puzzleId: string;
	state: PuzzleState;
	updatedAt: ISODateString;
}

export interface CrosswordProgress {
	schemaVersion: typeof CROSSWORD_PROGRESS_SCHEMA_VERSION;
	updatedAt: ISODateString;
	settings: CrosswordSettings;
	savedPuzzles: Record<string, SavedPuzzle>;
	masteryByPack: Record<string, MasteryHistory>;
}

export interface CrosswordProgressExport {
	format: 'suvroghosh-crossword-progress';
	exportedAt: ISODateString;
	progress: CrosswordProgress;
}

export type ProgressImportResult =
	| { ok: true; progress: CrosswordProgress }
	| { ok: false; error: string };

export interface EntryCompletion {
	entryId: string;
	conceptId: string;
	outcome: SolveOutcome;
}

export interface CompletionReport {
	complete: boolean;
	completedEntries: number;
	totalEntries: number;
	independent: number;
	withHints: number;
	revealed: number;
	markedForReview: string[];
	entries: EntryCompletion[];
	elapsedMs?: number;
}

export type ValidationIssueCode =
	| 'schema-version'
	| 'duplicate-id'
	| 'duplicate-answer'
	| 'invalid-dimensions'
	| 'cell-count'
	| 'cell-coordinate'
	| 'entry-bounds'
	| 'entry-on-block'
	| 'collision'
	| 'incorrect-crossing'
	| 'duplicate-direction'
	| 'orphan-cell'
	| 'disconnected-grid'
	| 'missing-clue'
	| 'missing-hints'
	| 'invalid-hint-order'
	| 'answer-leakage'
	| 'invalid-reveal-position'
	| 'missing-learning'
	| 'missing-source'
	| 'invalid-source-url'
	| 'unsupported-character'
	| 'unknown-topic'
	| 'invalid-value';

export interface ValidationIssue {
	code: ValidationIssueCode;
	message: string;
	path: string;
	severity: 'error' | 'warning';
}

export interface ValidationResult {
	valid: boolean;
	issues: ValidationIssue[];
}

/** The subset of the Web Storage API used by persistence helpers. */
export interface KeyValueStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}
