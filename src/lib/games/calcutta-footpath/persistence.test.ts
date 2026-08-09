import { describe, expect, it } from 'vitest';
import { EMPTY_STORED_RUNS, parseStoredRuns, recentFailureCount, recordRun } from './persistence';
import type { StoredRunRecord } from './runtime-types';

describe('saved run persistence', () => {
	it('repairs malformed local data without throwing', () => {
		expect(parseStoredRuns('{broken')).toEqual({ ...EMPTY_STORED_RUNS, recent: [] });
		expect(parseStoredRuns({ bestScore: -20, recent: 'nope' }).bestScore).toBe(0);
	});

	it('updates best score and fastest winning time while bounding history', () => {
		let record: StoredRunRecord = { ...EMPTY_STORED_RUNS, recent: [] };
		for (let index = 0; index < 12; index += 1) {
			record = recordRun(
				record,
				{
					seed: `seed-${index}`,
					won: index % 3 === 0,
					elapsedMs: 200_000 - index * 1_000,
					score: { total: 1_000 + index, breakdown: {} as never }
				},
				new Date(`2026-07-${String(index + 1).padStart(2, '0')}T00:00:00Z`)
			);
		}
		expect(record.bestScore).toBe(1_011);
		expect(record.fastestCompletionMs).toBe(191_000);
		expect(record.recent).toHaveLength(8);
	});

	it('counts only the current consecutive run of failures', () => {
		const record = parseStoredRuns({
			recent: [
				{ seed: 'c', won: false, score: 2, elapsedMs: 3, at: '2026-07-25' },
				{ seed: 'b', won: false, score: 2, elapsedMs: 3, at: '2026-07-24' },
				{ seed: 'a', won: true, score: 2, elapsedMs: 3, at: '2026-07-23' }
			]
		});
		expect(recentFailureCount(record)).toBe(2);
	});

	it('stores a bounded, repaired recent route without trusting malformed points', () => {
		const record = recordRun(
			{ ...EMPTY_STORED_RUNS, recent: [] },
			{
				seed: 'route-seed',
				won: true,
				elapsedMs: 42_000,
				score: { total: 120, breakdown: {} as never },
				route: [
					{ x: -8, z: 0, atMs: 0 },
					{ x: -11, z: 26, atMs: 21_000, kind: 'walk' },
					{ x: 30, z: 66, atMs: 31_000, kind: 'tea', label: 'Tea stop' }
				]
			}
		);
		expect(record.version).toBe(2);
		expect(record.recent[0].route).toHaveLength(3);
		expect(
			parseStoredRuns({ recent: [{ ...record.recent[0], route: [{ x: 'bad', z: 1 }] }] }).recent[0]
				.route
		).toBeUndefined();
	});
});
