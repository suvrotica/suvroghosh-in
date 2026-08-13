import type {
	CellKey,
	Coordinate,
	CrosswordEntry,
	CrosswordPuzzle,
	Direction,
	ModelCell,
	PuzzleCell,
	PuzzleModel
} from '../types';
import { answerCharacters } from './normalize';

export function cellKey(row: number, column: number): CellKey {
	return `${row},${column}`;
}

export function parseCellKey(key: CellKey | string): Coordinate | null {
	const match = /^(\d+),(\d+)$/.exec(key);
	if (!match) return null;
	return { row: Number(match[1]), column: Number(match[2]) };
}

export function entryCoordinates(entry: CrosswordEntry): Coordinate[] {
	return answerCharacters(entry.answer).map((_, index) => ({
		row: entry.row + (entry.direction === 'down' ? index : 0),
		column: entry.column + (entry.direction === 'across' ? index : 0)
	}));
}

/** Create a complete cell array from authored entry placements. */
export function createCellLayout(
	puzzle: Pick<CrosswordPuzzle, 'width' | 'height' | 'entries'>
): PuzzleCell[] {
	const open = new Set<CellKey>();
	for (const entry of puzzle.entries) {
		for (const coordinate of entryCoordinates(entry)) {
			if (
				coordinate.row >= 0 &&
				coordinate.row < puzzle.height &&
				coordinate.column >= 0 &&
				coordinate.column < puzzle.width
			) {
				open.add(cellKey(coordinate.row, coordinate.column));
			}
		}
	}

	const cells: PuzzleCell[] = [];
	for (let row = 0; row < puzzle.height; row += 1) {
		for (let column = 0; column < puzzle.width; column += 1) {
			cells.push({ row, column, kind: open.has(cellKey(row, column)) ? 'open' : 'block' });
		}
	}
	return cells;
}

function compareEntryIds(
	leftId: string,
	rightId: string,
	entryNumbers: Record<string, number>,
	entriesById: Record<string, CrosswordEntry>
): number {
	const numberDifference = entryNumbers[leftId] - entryNumbers[rightId];
	if (numberDifference !== 0) return numberDifference;
	if (entriesById[leftId].direction !== entriesById[rightId].direction) {
		return entriesById[leftId].direction === 'across' ? -1 : 1;
	}
	return leftId.localeCompare(rightId);
}

/**
 * Build the immutable topology used by the runtime. Authoring errors throw with a
 * concise message; call validatePuzzle for a complete list of editorial issues.
 */
export function buildPuzzleModel(puzzle: CrosswordPuzzle): PuzzleModel {
	const cells: Record<CellKey, ModelCell> = {};
	const cellOrder: CellKey[] = [];

	for (const authoredCell of puzzle.cells) {
		const key = cellKey(authoredCell.row, authoredCell.column);
		if (cells[key]) throw new Error(`Duplicate puzzle cell at ${key}`);
		cells[key] = { ...authoredCell, key, entryIds: [] };
		cellOrder.push(key);
	}
	cellOrder.sort((left, right) => {
		const a = parseCellKey(left)!;
		const b = parseCellKey(right)!;
		return a.row - b.row || a.column - b.column;
	});

	const entriesById: Record<string, CrosswordEntry> = {};
	const entryCells: Record<string, CellKey[]> = {};

	for (const entry of puzzle.entries) {
		if (entriesById[entry.id]) throw new Error(`Duplicate entry id: ${entry.id}`);
		entriesById[entry.id] = entry;
		const answer = answerCharacters(entry.answer);
		entryCells[entry.id] = entryCoordinates(entry).map(({ row, column }, position) => {
			const key = cellKey(row, column);
			const cell = cells[key];
			if (!cell || cell.kind !== 'open') {
				throw new Error(`Entry ${entry.id} occupies missing or blocked cell ${key}`);
			}
			const directionKey = entry.direction === 'across' ? 'acrossEntryId' : 'downEntryId';
			if (cell[directionKey]) {
				throw new Error(
					`Entries ${cell[directionKey]} and ${entry.id} overlap ${entry.direction} at ${key}`
				);
			}
			const crossingEntryId = cell.entryIds[0];
			if (crossingEntryId) {
				const crossingPosition = entryCells[crossingEntryId].indexOf(key);
				const crossingLetter = answerCharacters(entriesById[crossingEntryId].answer)[
					crossingPosition
				];
				if (crossingLetter !== answer[position]) {
					throw new Error(`Entries ${crossingEntryId} and ${entry.id} disagree at crossing ${key}`);
				}
			}
			cell[directionKey] = entry.id;
			cell.entryIds.push(entry.id);
			return key;
		});
	}

	const startKeys = [
		...new Set(puzzle.entries.map((entry) => cellKey(entry.row, entry.column)))
	].sort((left, right) => {
		const a = parseCellKey(left)!;
		const b = parseCellKey(right)!;
		return a.row - b.row || a.column - b.column;
	});
	const numberByStart = Object.fromEntries(startKeys.map((key, index) => [key, index + 1]));
	const entryNumbers: Record<string, number> = {};
	for (const entry of puzzle.entries) {
		const number = numberByStart[cellKey(entry.row, entry.column)];
		entryNumbers[entry.id] = number;
		cells[cellKey(entry.row, entry.column)].number = number;
	}

	const sortedIds = puzzle.entries
		.map((entry) => entry.id)
		.sort((left, right) => compareEntryIds(left, right, entryNumbers, entriesById));

	return {
		puzzle,
		cells,
		cellOrder,
		entriesById,
		entryCells,
		entryNumbers,
		acrossEntryIds: sortedIds.filter((id) => entriesById[id].direction === 'across'),
		downEntryIds: sortedIds.filter((id) => entriesById[id].direction === 'down')
	};
}

export function getCell(
	model: PuzzleModel,
	coordinate: Coordinate | CellKey | string
): ModelCell | undefined {
	const key =
		typeof coordinate === 'string'
			? (coordinate as CellKey)
			: cellKey(coordinate.row, coordinate.column);
	return model.cells[key];
}

export function getEntry(model: PuzzleModel, entryId: string): CrosswordEntry | undefined {
	return model.entriesById[entryId];
}

export function getEntriesAtCell(
	model: PuzzleModel,
	coordinate: Coordinate | CellKey | string
): CrosswordEntry[] {
	const cell = getCell(model, coordinate);
	return cell ? cell.entryIds.map((id) => model.entriesById[id]) : [];
}

export function getEntryIdAtCell(
	model: PuzzleModel,
	coordinate: Coordinate | CellKey | string,
	direction: Direction
): string | undefined {
	const cell = getCell(model, coordinate);
	return direction === 'across' ? cell?.acrossEntryId : cell?.downEntryId;
}

export function getOrderedEntryIds(model: PuzzleModel): string[] {
	return [...model.acrossEntryIds, ...model.downEntryIds].sort((left, right) =>
		compareEntryIds(left, right, model.entryNumbers, model.entriesById)
	);
}

export function answerLetterAtCell(model: PuzzleModel, key: CellKey): string {
	const cell = model.cells[key];
	if (!cell || cell.kind === 'block' || cell.entryIds.length === 0) return '';
	const entryId = cell.entryIds[0];
	const position = model.entryCells[entryId].indexOf(key);
	return answerCharacters(model.entriesById[entryId].answer)[position] ?? '';
}

export function entryNumberLabel(model: PuzzleModel, entryId: string): string {
	const entry = model.entriesById[entryId];
	return entry
		? `${model.entryNumbers[entryId]} ${entry.direction === 'across' ? 'Across' : 'Down'}`
		: '';
}
