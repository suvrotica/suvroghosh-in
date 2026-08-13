import {
	CROSSWORD_PACK_SCHEMA_VERSION,
	type CrosswordEntry,
	type CrosswordPack,
	type CrosswordPuzzle,
	type HintStep,
	type PuzzleCell
} from './types';

export function makeHints(overrides: Partial<HintStep>[] = []): HintStep[] {
	const hints: HintStep[] = [
		{ kind: 'nudge', text: 'Think about the broad conceptual neighbourhood.' },
		{ kind: 'plain-language', text: 'It names a small, useful working idea.' },
		{ kind: 'contrast', text: 'It is not the nearby alternative.' },
		{ kind: 'letter', text: 'A useful crossing letter can help.' },
		{ kind: 'nearly-obvious', text: 'The letter pattern should now be familiar.' },
		{ kind: 'reveal', text: 'Show the answer and review why it matters.' }
	];
	return hints.map((hint, index) => ({ ...hint, ...overrides[index] }));
}

export function makeEntry(
	entry: Pick<CrosswordEntry, 'id' | 'answer' | 'direction' | 'row' | 'column'> &
		Partial<CrosswordEntry>
): CrosswordEntry {
	return {
		clue: `A fair clue for ${entry.id}, without giving the answer away.`,
		hints: makeHints(),
		learning: {
			definition: 'A concise definition for this test concept.',
			whyItMatters: 'It matters because systems and people need shared meaning.',
			example: 'A concrete example.',
			commonConfusion: 'Do not confuse it with its neighbour.',
			related: ['neighbour'],
			sources: [
				{
					title: 'Primary reference',
					url: 'https://example.org/reference',
					publisher: 'Example Standards Body',
					accessedOrReviewed: '2026-08-01'
				}
			]
		},
		tags: ['test-topic'],
		...entry
	};
}

export function makeEntries(): CrosswordEntry[] {
	return [
		makeEntry({
			id: 'cat',
			conceptId: 'cat-concept',
			answer: 'CAT',
			direction: 'across',
			row: 0,
			column: 0
		}),
		makeEntry({
			id: 'car',
			conceptId: 'car-concept',
			answer: 'CAR',
			direction: 'down',
			row: 0,
			column: 0
		}),
		makeEntry({
			id: 'art',
			conceptId: 'art-concept',
			answer: 'ART',
			direction: 'down',
			row: 0,
			column: 1
		}),
		makeEntry({
			id: 'ten',
			conceptId: 'ten-concept',
			answer: 'TEN',
			direction: 'down',
			row: 0,
			column: 2
		})
	];
}

function layout(width: number, height: number, entries: CrosswordEntry[]): PuzzleCell[] {
	const open = new Set<string>();
	for (const entry of entries) {
		const length = Array.from(entry.answer).length;
		for (let index = 0; index < length; index += 1) {
			open.add(
				`${entry.row + (entry.direction === 'down' ? index : 0)},${
					entry.column + (entry.direction === 'across' ? index : 0)
				}`
			);
		}
	}
	const cells: PuzzleCell[] = [];
	for (let row = 0; row < height; row += 1) {
		for (let column = 0; column < width; column += 1) {
			cells.push({ row, column, kind: open.has(`${row},${column}`) ? 'open' : 'block' });
		}
	}
	return cells;
}

export function makePuzzle(overrides: Partial<CrosswordPuzzle> = {}): CrosswordPuzzle {
	const entries = overrides.entries ?? makeEntries();
	const width = overrides.width ?? 5;
	const height = overrides.height ?? 3;
	return {
		id: 'test-puzzle',
		packId: 'test-pack',
		title: 'A Test Crossing',
		topicIds: ['test-topic'],
		level: 'working',
		sessionFormat: 'quick',
		estimatedMinutes: 4,
		width,
		height,
		cells: overrides.cells ?? layout(width, height, entries),
		entries,
		reviewedAt: '2026-08-01',
		...overrides
	};
}

export function makePack(overrides: Partial<CrosswordPack> = {}): CrosswordPack {
	return {
		schemaVersion: CROSSWORD_PACK_SCHEMA_VERSION,
		id: 'test-pack',
		title: 'Test Pack',
		description: 'A domain-neutral pack for exercising the crossword engine.',
		topics: [
			{ id: 'test-topic', title: 'Test topic', description: 'Neutral concepts used by tests.' }
		],
		levels: [
			{ id: 'refresh', title: 'Refresh', description: 'Direct recall.' },
			{ id: 'working', title: 'Working', description: 'Ordinary recall.' },
			{ id: 'architect', title: 'Architect', description: 'Systems reasoning.' },
			{ id: 'adaptive', title: 'Adaptive', description: 'Responsive selection.' }
		],
		puzzles: [makePuzzle()],
		...overrides
	};
}
