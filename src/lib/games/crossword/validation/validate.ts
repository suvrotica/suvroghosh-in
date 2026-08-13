import {
	CROSSWORD_PACK_SCHEMA_VERSION,
	type CellKey,
	type CrosswordEntry,
	type CrosswordPack,
	type CrosswordPuzzle,
	type Direction,
	type HintKind,
	type ValidationIssue,
	type ValidationIssueCode,
	type ValidationResult
} from '../types';
import {
	answerCharacters,
	findUnsupportedAnswerCharacters,
	normalizeAnswer
} from '../engine/normalize';
import { cellKey, entryCoordinates } from '../engine/model';

const EXPECTED_HINT_KINDS: HintKind[] = [
	'nudge',
	'plain-language',
	'contrast',
	'letter',
	'nearly-obvious',
	'reveal'
];

interface Occupant {
	entryId: string;
	direction: Direction;
	letter: string;
}

export interface ValidatePuzzleOptions {
	expectedPackId?: string;
	knownTopicIds?: readonly string[];
}

function issue(
	issues: ValidationIssue[],
	code: ValidationIssueCode,
	message: string,
	path: string,
	severity: ValidationIssue['severity'] = 'error'
): void {
	issues.push({ code, message, path, severity });
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function sourceUrlIsValid(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:';
	} catch {
		return false;
	}
}

function leaksAnswer(text: string, answer: string): boolean {
	const normalizedAnswer = normalizeAnswer(answer);
	if (normalizedAnswer.length < 3) return false;
	const tokens = text
		.normalize('NFKC')
		.toLocaleUpperCase('en-US')
		.match(/[\p{L}\p{N}]+/gu);
	if (!tokens) return false;
	if (tokens.includes(normalizedAnswer)) return true;
	const answerHadFormatting =
		normalizeAnswer(answer) !== answer.normalize('NFKC').toLocaleUpperCase('en-US');
	return answerHadFormatting && tokens.join('').includes(normalizedAnswer);
}

function validateEntryTeaching(
	entry: CrosswordEntry,
	entryPath: string,
	issues: ValidationIssue[]
): void {
	if (
		!entry.learning ||
		!entry.learning.definition?.trim() ||
		!entry.learning.whyItMatters?.trim()
	) {
		issue(
			issues,
			'missing-learning',
			'Every answer needs a definition and why-it-matters explanation.',
			`${entryPath}.learning`
		);
		return;
	}
	if (!Array.isArray(entry.learning.sources) || entry.learning.sources.length === 0) {
		issue(
			issues,
			'missing-source',
			'Every answer needs at least one source.',
			`${entryPath}.learning.sources`
		);
		return;
	}
	entry.learning.sources.forEach((source, sourceIndex) => {
		const sourcePath = `${entryPath}.learning.sources[${sourceIndex}]`;
		if (!source?.title?.trim()) {
			issue(issues, 'missing-source', 'Source title is required.', `${sourcePath}.title`);
		}
		if (!source?.url || !sourceUrlIsValid(source.url)) {
			issue(
				issues,
				'invalid-source-url',
				'Source URL must be a valid HTTP(S) URL.',
				`${sourcePath}.url`
			);
		}
		if (!source?.accessedOrReviewed || Number.isNaN(Date.parse(source.accessedOrReviewed))) {
			issue(
				issues,
				'invalid-value',
				'Source review date must be a valid date.',
				`${sourcePath}.accessedOrReviewed`
			);
		}
	});
}

function validateEntryHints(
	entry: CrosswordEntry,
	entryPath: string,
	answerLength: number,
	issues: ValidationIssue[]
): void {
	if (!Array.isArray(entry.hints) || entry.hints.length !== EXPECTED_HINT_KINDS.length) {
		issue(
			issues,
			'missing-hints',
			`Hint ladder must contain ${EXPECTED_HINT_KINDS.length} progressive steps.`,
			`${entryPath}.hints`
		);
	}
	(entry.hints ?? []).forEach((hint, hintIndex) => {
		const hintPath = `${entryPath}.hints[${hintIndex}]`;
		if (!hint?.text?.trim()) {
			issue(issues, 'missing-hints', 'Hint text must not be empty.', `${hintPath}.text`);
		}
		if (hintIndex < EXPECTED_HINT_KINDS.length && hint?.kind !== EXPECTED_HINT_KINDS[hintIndex]) {
			issue(
				issues,
				'invalid-hint-order',
				`Hint ${hintIndex + 1} should be ${EXPECTED_HINT_KINDS[hintIndex]}.`,
				`${hintPath}.kind`
			);
		}
		if (hintIndex < 3 && hint?.text && leaksAnswer(hint.text, entry.answer)) {
			issue(issues, 'answer-leakage', 'An early hint contains the answer.', `${hintPath}.text`);
		}
		if (hint?.revealPositions !== undefined) {
			const seen = new Set<number>();
			for (const position of hint.revealPositions) {
				if (
					!Number.isInteger(position) ||
					position < 0 ||
					position >= answerLength ||
					seen.has(position)
				) {
					issue(
						issues,
						'invalid-reveal-position',
						'Reveal positions must be unique, zero-based positions inside the answer.',
						`${hintPath}.revealPositions`
					);
					break;
				}
				seen.add(position);
			}
		}
	});
}

function validateConnectedOpenCells(
	openCells: Set<CellKey>,
	puzzlePath: string,
	issues: ValidationIssue[]
): void {
	const start = openCells.values().next().value as CellKey | undefined;
	if (!start) return;
	const visited = new Set<CellKey>();
	const queue = [start];
	while (queue.length > 0) {
		const current = queue.shift()!;
		if (visited.has(current)) continue;
		visited.add(current);
		const [row, column] = current.split(',').map(Number);
		for (const [rowDelta, columnDelta] of [
			[-1, 0],
			[1, 0],
			[0, -1],
			[0, 1]
		]) {
			const neighbor = cellKey(row + rowDelta, column + columnDelta);
			if (openCells.has(neighbor) && !visited.has(neighbor)) queue.push(neighbor);
		}
	}
	if (visited.size !== openCells.size) {
		issue(
			issues,
			'disconnected-grid',
			`The grid has ${openCells.size - visited.size} open cell(s) disconnected from the main region.`,
			`${puzzlePath}.cells`
		);
	}
}

function validateConnectedEntries(
	entryIds: Set<string>,
	occupancy: Map<CellKey, Occupant[]>,
	puzzlePath: string,
	issues: ValidationIssue[]
): void {
	const firstEntryId = entryIds.values().next().value as string | undefined;
	if (!firstEntryId) return;
	const neighbors = new Map<string, Set<string>>();
	for (const entryId of entryIds) neighbors.set(entryId, new Set());
	for (const occupants of occupancy.values()) {
		if (occupants.length !== 2) continue;
		const [left, right] = occupants;
		if (left.direction === right.direction || left.entryId === right.entryId) continue;
		neighbors.get(left.entryId)?.add(right.entryId);
		neighbors.get(right.entryId)?.add(left.entryId);
	}
	const visited = new Set<string>();
	const queue = [firstEntryId];
	while (queue.length > 0) {
		const current = queue.shift()!;
		if (visited.has(current)) continue;
		visited.add(current);
		for (const neighbor of neighbors.get(current) ?? []) {
			if (!visited.has(neighbor)) queue.push(neighbor);
		}
	}
	if (visited.size !== entryIds.size) {
		issue(
			issues,
			'disconnected-grid',
			`The answer network has ${entryIds.size - visited.size} entry or entries disconnected from all crossings.`,
			`${puzzlePath}.entries`
		);
	}
}

export function validatePuzzle(
	puzzle: CrosswordPuzzle,
	options: ValidatePuzzleOptions = {}
): ValidationResult {
	const issues: ValidationIssue[] = [];
	const puzzlePath = `puzzles[${puzzle?.id || '?'}]`;
	if (!puzzle?.id?.trim())
		issue(issues, 'invalid-value', 'Puzzle id is required.', `${puzzlePath}.id`);
	if (!puzzle?.title?.trim())
		issue(issues, 'invalid-value', 'Puzzle title is required.', `${puzzlePath}.title`);
	if (options.expectedPackId && puzzle.packId !== options.expectedPackId) {
		issue(
			issues,
			'invalid-value',
			`Puzzle packId must be ${options.expectedPackId}.`,
			`${puzzlePath}.packId`
		);
	}
	if (!isPositiveInteger(puzzle?.width) || !isPositiveInteger(puzzle?.height)) {
		issue(
			issues,
			'invalid-dimensions',
			'Grid width and height must be positive integers.',
			puzzlePath
		);
	}
	if (!isPositiveInteger(puzzle?.estimatedMinutes)) {
		issue(
			issues,
			'invalid-value',
			'Estimated minutes must be a positive integer.',
			`${puzzlePath}.estimatedMinutes`
		);
	}
	if (!puzzle?.reviewedAt || Number.isNaN(Date.parse(puzzle.reviewedAt))) {
		issue(issues, 'invalid-value', 'Puzzle review date must be valid.', `${puzzlePath}.reviewedAt`);
	}
	const knownTopics = options.knownTopicIds ? new Set(options.knownTopicIds) : null;
	for (const topicId of puzzle?.topicIds ?? []) {
		if (knownTopics && !knownTopics.has(topicId)) {
			issue(issues, 'unknown-topic', `Unknown topic id: ${topicId}.`, `${puzzlePath}.topicIds`);
		}
	}

	const width = isPositiveInteger(puzzle?.width) ? puzzle.width : 0;
	const height = isPositiveInteger(puzzle?.height) ? puzzle.height : 0;
	const cells = Array.isArray(puzzle?.cells) ? puzzle.cells : [];
	if (cells.length !== width * height) {
		issue(
			issues,
			'cell-count',
			`Expected ${width * height} cells, received ${cells.length}.`,
			`${puzzlePath}.cells`
		);
	}
	const cellKinds = new Map<CellKey, 'open' | 'block'>();
	cells.forEach((cell, index) => {
		const path = `${puzzlePath}.cells[${index}]`;
		if (
			!Number.isInteger(cell?.row) ||
			!Number.isInteger(cell?.column) ||
			cell.row < 0 ||
			cell.row >= height ||
			cell.column < 0 ||
			cell.column >= width
		) {
			issue(issues, 'cell-coordinate', 'Cell coordinates are outside the grid.', path);
			return;
		}
		const key = cellKey(cell.row, cell.column);
		if (cellKinds.has(key)) {
			issue(issues, 'cell-coordinate', `Duplicate cell coordinate ${key}.`, path);
			return;
		}
		if (cell.kind !== 'open' && cell.kind !== 'block') {
			issue(issues, 'invalid-value', 'Cell kind must be open or block.', `${path}.kind`);
			return;
		}
		cellKinds.set(key, cell.kind);
	});
	for (let row = 0; row < height; row += 1) {
		for (let column = 0; column < width; column += 1) {
			if (!cellKinds.has(cellKey(row, column))) {
				issue(issues, 'cell-coordinate', `Missing cell ${row},${column}.`, `${puzzlePath}.cells`);
			}
		}
	}

	const entryIds = new Set<string>();
	const answerOwners = new Map<string, string>();
	const occupancy = new Map<CellKey, Occupant[]>();
	for (const [entryIndex, entry] of (puzzle?.entries ?? []).entries()) {
		const entryPath = `${puzzlePath}.entries[${entryIndex}]`;
		if (!entry?.id?.trim()) {
			issue(issues, 'invalid-value', 'Entry id is required.', `${entryPath}.id`);
		} else if (entryIds.has(entry.id)) {
			issue(issues, 'duplicate-id', `Duplicate entry id: ${entry.id}.`, `${entryPath}.id`);
		}
		entryIds.add(entry.id);
		if (!entry?.clue?.trim())
			issue(issues, 'missing-clue', 'Entry clue is required.', `${entryPath}.clue`);
		if (entry?.direction !== 'across' && entry?.direction !== 'down') {
			issue(
				issues,
				'invalid-value',
				'Entry direction must be across or down.',
				`${entryPath}.direction`
			);
		}
		if (
			!Number.isInteger(entry?.row) ||
			!Number.isInteger(entry?.column) ||
			entry.row < 0 ||
			entry.column < 0
		) {
			issue(
				issues,
				'entry-bounds',
				'Entry start row and column must be non-negative integers.',
				entryPath
			);
		}
		const unsupported = findUnsupportedAnswerCharacters(entry?.answer ?? '');
		if (unsupported.length > 0) {
			issue(
				issues,
				'unsupported-character',
				`Unsupported answer character(s): ${unsupported.join(' ')}.`,
				`${entryPath}.answer`
			);
		}
		const answer = answerCharacters(entry?.answer ?? '');
		const normalizedAnswer = normalizeAnswer(entry?.answer ?? '');
		if (answer.length === 0) {
			issue(
				issues,
				'invalid-value',
				'Entry answer must contain grid characters.',
				`${entryPath}.answer`
			);
		} else if (answerOwners.has(normalizedAnswer)) {
			issue(
				issues,
				'duplicate-answer',
				`Answer duplicates entry ${answerOwners.get(normalizedAnswer)} after normalization.`,
				`${entryPath}.answer`
			);
		} else {
			answerOwners.set(normalizedAnswer, entry.id);
		}
		validateEntryHints(entry, entryPath, answer.length, issues);
		validateEntryTeaching(entry, entryPath, issues);

		const coordinates = entryCoordinates(entry);
		coordinates.forEach((coordinate, position) => {
			const key = cellKey(coordinate.row, coordinate.column);
			if (
				coordinate.row < 0 ||
				coordinate.row >= height ||
				coordinate.column < 0 ||
				coordinate.column >= width
			) {
				issue(issues, 'entry-bounds', `Entry ${entry.id} runs outside the grid.`, entryPath);
				return;
			}
			if (cellKinds.get(key) !== 'open') {
				issue(
					issues,
					'entry-on-block',
					`Entry ${entry.id} occupies blocked or missing cell ${key}.`,
					entryPath
				);
			}
			const occupants = occupancy.get(key) ?? [];
			if (occupants.some((occupant) => occupant.direction === entry.direction)) {
				issue(
					issues,
					'duplicate-direction',
					`Two ${entry.direction} entries occupy cell ${key}.`,
					entryPath
				);
			}
			const crossing = occupants.find((occupant) => occupant.direction !== entry.direction);
			if (crossing && crossing.letter !== answer[position]) {
				issue(
					issues,
					'incorrect-crossing',
					`${entry.id} and ${crossing.entryId} disagree at ${key}.`,
					entryPath
				);
			}
			if (occupants.length >= 2) {
				issue(issues, 'collision', `More than two entries occupy cell ${key}.`, entryPath);
			}
			occupants.push({ entryId: entry.id, direction: entry.direction, letter: answer[position] });
			occupancy.set(key, occupants);
		});
	}

	const openCells = new Set<CellKey>();
	for (const [key, kind] of cellKinds) {
		if (kind !== 'open') continue;
		openCells.add(key);
		if (!occupancy.has(key)) {
			issue(issues, 'orphan-cell', `Open cell ${key} belongs to no answer.`, `${puzzlePath}.cells`);
		}
	}
	validateConnectedOpenCells(openCells, puzzlePath, issues);
	validateConnectedEntries(entryIds, occupancy, puzzlePath, issues);

	return { valid: issues.every((candidate) => candidate.severity !== 'error'), issues };
}

export function validatePack(pack: CrosswordPack): ValidationResult {
	const issues: ValidationIssue[] = [];
	if (pack?.schemaVersion !== CROSSWORD_PACK_SCHEMA_VERSION) {
		issue(
			issues,
			'schema-version',
			`Pack schemaVersion must be ${CROSSWORD_PACK_SCHEMA_VERSION}.`,
			'schemaVersion'
		);
	}
	if (!pack?.id?.trim()) issue(issues, 'invalid-value', 'Pack id is required.', 'id');
	if (!pack?.title?.trim()) issue(issues, 'invalid-value', 'Pack title is required.', 'title');
	if (!pack?.description?.trim())
		issue(issues, 'invalid-value', 'Pack description is required.', 'description');
	const topicIds = new Set<string>();
	(pack?.topics ?? []).forEach((topic, index) => {
		if (!topic?.id?.trim() || !topic.title?.trim() || !topic.description?.trim()) {
			issue(
				issues,
				'invalid-value',
				'Topic id, title and description are required.',
				`topics[${index}]`
			);
		}
		if (topicIds.has(topic.id)) {
			issue(issues, 'duplicate-id', `Duplicate topic id: ${topic.id}.`, `topics[${index}].id`);
		}
		topicIds.add(topic.id);
	});
	const levelIds = new Set<string>();
	(pack?.levels ?? []).forEach((level, index) => {
		if (levelIds.has(level.id)) {
			issue(issues, 'duplicate-id', `Duplicate level id: ${level.id}.`, `levels[${index}].id`);
		}
		levelIds.add(level.id);
	});
	const puzzleIds = new Set<string>();
	(pack?.puzzles ?? []).forEach((puzzle, index) => {
		if (puzzleIds.has(puzzle.id)) {
			issue(issues, 'duplicate-id', `Duplicate puzzle id: ${puzzle.id}.`, `puzzles[${index}].id`);
		}
		puzzleIds.add(puzzle.id);
		issues.push(
			...validatePuzzle(puzzle, {
				expectedPackId: pack.id,
				knownTopicIds: [...topicIds]
			}).issues
		);
	});
	return { valid: issues.every((candidate) => candidate.severity !== 'error'), issues };
}

export class CrosswordValidationError extends Error {
	readonly issues: ValidationIssue[];

	constructor(issues: ValidationIssue[]) {
		super(
			`Crossword validation failed:\n${issues
				.filter((candidate) => candidate.severity === 'error')
				.map((candidate) => `- ${candidate.path}: ${candidate.message}`)
				.join('\n')}`
		);
		this.name = 'CrosswordValidationError';
		this.issues = issues;
	}
}

export function assertValidPack(pack: CrosswordPack): void {
	const result = validatePack(pack);
	if (!result.valid) throw new CrosswordValidationError(result.issues);
}
