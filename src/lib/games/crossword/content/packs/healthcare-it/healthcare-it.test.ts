import { describe, expect, it } from 'vitest';
import { validatePack } from '$lib/games/crossword/validation/validate';
import { healthcareItPack } from './index';

describe('healthcare IT crossword pack', () => {
	it('passes the complete structural and editorial validator', () => {
		const result = validatePack(healthcareItPack);
		expect(result.issues).toEqual([]);
		expect(result.valid).toBe(true);
	});

	it('ships the promised compact round library', () => {
		expect(healthcareItPack.puzzles).toHaveLength(13);
		expect(
			healthcareItPack.puzzles.filter((puzzle) => puzzle.sessionFormat === 'tutorial')
		).toHaveLength(1);
		expect(healthcareItPack.puzzles.filter((puzzle) => puzzle.level === 'refresh')).toHaveLength(4);
		expect(healthcareItPack.puzzles.filter((puzzle) => puzzle.level === 'working')).toHaveLength(3);
		expect(healthcareItPack.puzzles.filter((puzzle) => puzzle.level === 'architect')).toHaveLength(
			4
		);
		expect(healthcareItPack.puzzles.filter((puzzle) => puzzle.level === 'adaptive')).toHaveLength(
			2
		);
		for (const puzzle of healthcareItPack.puzzles.filter(
			(candidate) => candidate.sessionFormat !== 'deep'
		)) {
			expect(puzzle.entries.length).toBeGreaterThanOrEqual(5);
			expect(puzzle.entries.length).toBeLessThanOrEqual(8);
			expect(puzzle.width).toBeLessThanOrEqual(12);
		}
	});

	it('includes one prevalidated connected Deep Round for systems architecture', () => {
		const deepRounds = healthcareItPack.puzzles.filter((puzzle) => puzzle.sessionFormat === 'deep');
		expect(deepRounds).toHaveLength(1);

		const [deepRound] = deepRounds;
		expect(deepRound).toMatchObject({
			id: 'record-crosses-enterprise',
			level: 'architect',
			width: 22,
			height: 26,
			estimatedMinutes: 25
		});
		expect(deepRound.entries).toHaveLength(18);
		expect(new Set(deepRound.entries.map((entry) => entry.conceptId)).size).toBe(18);
		expect(deepRound.topicIds).toContain('mixed-systems');
		expect(deepRound.completionNote).toContain('The model was permitted an opinion');
	});

	it('keeps the Deep Round free of accidental Across and Down answers', () => {
		const deepRound = healthcareItPack.puzzles.find((puzzle) => puzzle.sessionFormat === 'deep')!;
		const openCells = new Set(
			deepRound.cells
				.filter((cell) => cell.kind === 'open')
				.map((cell) => `${cell.row},${cell.column}`)
		);
		const authoredRuns = (direction: 'across' | 'down') =>
			new Set(
				deepRound.entries
					.filter((entry) => entry.direction === direction)
					.map((entry) =>
						Array.from({ length: entry.answer.length }, (_, offset) =>
							direction === 'across'
								? `${entry.row},${entry.column + offset}`
								: `${entry.row + offset},${entry.column}`
						).join('|')
					)
			);
		const gridRuns = (direction: 'across' | 'down') => {
			const runs = new Set<string>();
			const lineCount = direction === 'across' ? deepRound.height : deepRound.width;
			const lineLength = direction === 'across' ? deepRound.width : deepRound.height;

			for (let line = 0; line < lineCount; line += 1) {
				let run: string[] = [];
				for (let offset = 0; offset <= lineLength; offset += 1) {
					const key = direction === 'across' ? `${line},${offset}` : `${offset},${line}`;
					if (offset < lineLength && openCells.has(key)) {
						run.push(key);
						continue;
					}

					if (run.length > 1) runs.add(run.join('|'));
					run = [];
				}
			}

			return runs;
		};

		expect([...gridRuns('across')].sort()).toEqual([...authoredRuns('across')].sort());
		expect([...gridRuns('down')].sort()).toEqual([...authoredRuns('down')].sort());
	});

	it('uses every advertised topic in at least one round', () => {
		const usedTopics = new Set(healthcareItPack.puzzles.flatMap((puzzle) => puzzle.topicIds));
		expect([...usedTopics].sort()).toEqual(healthcareItPack.topics.map((topic) => topic.id).sort());
	});

	it('keeps every teaching record sourced and fully hinted', () => {
		for (const puzzle of healthcareItPack.puzzles) {
			for (const entry of puzzle.entries) {
				expect(entry.hints.map((hint) => hint.kind)).toEqual([
					'nudge',
					'plain-language',
					'contrast',
					'letter',
					'nearly-obvious',
					'reveal'
				]);
				expect(entry.learning.definition).not.toBe('');
				expect(entry.learning.whyItMatters).not.toBe('');
				expect(entry.learning.sources.length).toBeGreaterThan(0);
				for (const source of entry.learning.sources) {
					expect(source.url.startsWith('https://')).toBe(true);
					expect(source.accessedOrReviewed).toBe('2026-08-13');
				}
			}
		}
	});

	it('provides domain-data acronym assistance without engine logic', () => {
		const acronymEntries = healthcareItPack.puzzles
			.flatMap((puzzle) => puzzle.entries)
			.filter((entry) => entry.tags.includes('acronym'));
		expect(acronymEntries.length).toBeGreaterThan(12);
		for (const entry of acronymEntries) {
			expect(entry.tags.some((tag) => tag.startsWith('expansion:'))).toBe(true);
		}
	});
});
