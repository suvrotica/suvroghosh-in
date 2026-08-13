import { describe, expect, it } from 'vitest';
import { makePuzzle } from '../test-fixtures';
import type { KeyValueStorage } from '../types';
import { buildPuzzleModel } from '../engine/model';
import { createPuzzleState, enterLetter } from '../engine/state';
import { createEmptyMasteryHistory } from '../engine/mastery';
import {
	CROSSWORD_STORAGE_KEY,
	clearAllCrosswordData,
	clearPackProgress,
	clearStoredCrosswordProgress,
	createEmptyProgress,
	exportProgress,
	importProgress,
	loadCrosswordProgress,
	parseCrosswordProgress,
	removeSavedPuzzle,
	restorePuzzleState,
	savePuzzleState,
	serializeCrosswordProgress,
	storeCrosswordProgress,
	updatePackMastery
} from './progress';

class MemoryStorage implements KeyValueStorage {
	readonly values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}
}

const NOW = '2026-08-13T10:00:00.000Z';

describe('crossword progress persistence', () => {
	it('round-trips a saved puzzle and restores it against the current model', () => {
		const model = buildPuzzleModel(makePuzzle());
		let state = createPuzzleState(model, { now: NOW });
		state = enterLetter(state, model, 'c', { now: NOW, pencil: true });
		const progress = savePuzzleState(createEmptyProgress(NOW), state, NOW);
		const parsed = parseCrosswordProgress(serializeCrosswordProgress(progress));
		const restored = restorePuzzleState(parsed, 'test-pack', 'test-puzzle', model);
		expect(restored?.cells['0,0']).toMatchObject({ value: 'C', pencil: true });
		expect(restored?.selectedCellKey).toBe('0,1');
	});

	it('repairs malformed records rather than trusting local storage', () => {
		const parsed = parseCrosswordProgress({
			schemaVersion: 2,
			updatedAt: 'not-a-date',
			settings: { playMode: 'menacing', soundEnabled: 'yes' },
			savedPuzzles: {
				broken: { state: { packId: '', puzzleId: '', cells: 'nope' } },
				'test-pack/test-puzzle': {
					packId: 'test-pack',
					puzzleId: 'test-puzzle',
					state: {
						packId: 'test-pack',
						puzzleId: 'test-puzzle',
						cells: { '0,0': { value: 'too long' }, nonsense: { value: 'X' } },
						hintLevels: { cat: 99 }
					}
				}
			}
		});
		expect(Object.keys(parsed.savedPuzzles)).toEqual(['test-pack/test-puzzle']);
		expect(parsed.savedPuzzles['test-pack/test-puzzle'].state.cells['0,0'].value).toBe('');
		expect(parsed.savedPuzzles['test-pack/test-puzzle'].state.hintLevels.cat).toBe(6);
		expect(parsed.settings.playMode).toBe('coach');
	});

	it('drops invalid selected coordinates and impossible blank-cell flags', () => {
		const parsed = parseCrosswordProgress({
			schemaVersion: 2,
			savedPuzzles: {
				'test-pack/test-puzzle': {
					packId: 'test-pack',
					puzzleId: 'test-puzzle',
					state: {
						packId: 'test-pack',
						puzzleId: 'test-puzzle',
						activeCell: { row: -4, column: -2 },
						cells: {
							'0,0': { value: '', pencil: true, revealed: true, checkStatus: 'correct' }
						}
					}
				}
			}
		});
		const state = parsed.savedPuzzles['test-pack/test-puzzle'].state;
		expect(state.selectedCellKey).toBeNull();
		expect(state.cells['0,0']).toEqual({
			value: '',
			pencil: false,
			revealed: false,
			checkStatus: 'unchecked'
		});
	});

	it('does not attempt to interpret a future on-device schema', () => {
		expect(
			parseCrosswordProgress({
				schemaVersion: 99,
				savedPuzzles: { surprise: { privateFutureField: true } }
			}).savedPuzzles
		).toEqual({});
	});

	it('migrates the v1 round, pencil, hint and completion field names', () => {
		const migrated = parseCrosswordProgress({
			schemaVersion: 1,
			updatedAt: NOW,
			savedRounds: {
				'test-pack/test-puzzle': {
					packId: 'test-pack',
					puzzleId: 'test-puzzle',
					activeCell: { row: 0, column: 1 },
					activeDirection: 'down',
					cells: { '0,0': { letter: 'c', tentative: true } },
					hints: { cat: 2 },
					completedEntryIds: ['cat'],
					mode: 'traditional',
					updatedAt: NOW
				}
			},
			learningHistory: { 'test-pack': { concepts: {} } }
		});
		const state = migrated.savedPuzzles['test-pack/test-puzzle'].state;
		expect(migrated.schemaVersion).toBe(2);
		expect(state.selectedCellKey).toBe('0,1');
		expect(state.direction).toBe('down');
		expect(state.cells['0,0']).toMatchObject({ value: 'C', pencil: true });
		expect(state.entrySolves.cat.solvedAt).toBe(NOW);
		expect(state.settings.playMode).toBe('traditional');
	});

	it('exports privacy-local JSON, imports compatible versions and rejects newer ones', () => {
		const progress = createEmptyProgress(NOW);
		const json = exportProgress(progress, NOW);
		expect(JSON.parse(json).format).toBe('suvroghosh-crossword-progress');
		const imported = importProgress(json);
		expect(imported.ok && imported.progress).toEqual(progress);
		expect(importProgress('{broken')).toMatchObject({ ok: false });
		expect(importProgress({ schemaVersion: 99 })).toMatchObject({
			ok: false,
			error: expect.stringContaining('newer')
		});
	});

	it('loads, stores and clears through the small Web Storage interface', () => {
		const storage = new MemoryStorage();
		const progress = createEmptyProgress(NOW, { timingEnabled: true });
		expect(storeCrosswordProgress(storage, progress)).toBe(true);
		expect(storage.values.has(CROSSWORD_STORAGE_KEY)).toBe(true);
		expect(loadCrosswordProgress(storage).settings.timingEnabled).toBe(true);
		expect(clearStoredCrosswordProgress(storage)).toBe(true);
		expect(storage.values.has(CROSSWORD_STORAGE_KEY)).toBe(false);
	});

	it('supports puzzle, pack and all-data reset scopes', () => {
		const model = buildPuzzleModel(makePuzzle());
		const state = createPuzzleState(model, { now: NOW });
		let progress = savePuzzleState(createEmptyProgress(NOW), state, NOW);
		progress = updatePackMastery(progress, 'test-pack', createEmptyMasteryHistory(), NOW);
		expect(removeSavedPuzzle(progress, 'test-pack', 'test-puzzle', NOW).savedPuzzles).toEqual({});
		expect(clearPackProgress(progress, 'test-pack', NOW)).toMatchObject({
			savedPuzzles: {},
			masteryByPack: {}
		});
		expect(clearAllCrosswordData(NOW)).toMatchObject({ savedPuzzles: {}, masteryByPack: {} });
	});

	it('contains storage failures instead of breaking the game', () => {
		const failing: KeyValueStorage = {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('full');
			},
			removeItem: () => {
				throw new Error('denied');
			}
		};
		expect(loadCrosswordProgress(failing).savedPuzzles).toEqual({});
		expect(storeCrosswordProgress(failing, createEmptyProgress(NOW))).toBe(false);
		expect(clearStoredCrosswordProgress(failing)).toBe(false);
	});
});
