import type { RunResult, StoredRunRecord } from './runtime-types';

export const RUNS_STORAGE_KEY = 'calcutta-footpath.runs';
export const RUNS_VERSION = 1 as const;

export const EMPTY_STORED_RUNS: Readonly<StoredRunRecord> = {
	version: RUNS_VERSION,
	bestScore: 0,
	fastestCompletionMs: null,
	recent: []
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNonNegative(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function parseStoredRuns(value: unknown): StoredRunRecord {
	let decoded = value;
	if (typeof value === 'string') {
		try {
			decoded = JSON.parse(value) as unknown;
		} catch {
			return {
				...EMPTY_STORED_RUNS,
				recent: []
			};
		}
	}
	if (!isRecord(decoded)) return { ...EMPTY_STORED_RUNS, recent: [] };

	const fastest =
		decoded.fastestCompletionMs === null
			? null
			: finiteNonNegative(decoded.fastestCompletionMs, 0) || null;
	const recent = Array.isArray(decoded.recent)
		? decoded.recent.flatMap((candidate) => {
				if (!isRecord(candidate)) return [];
				const seed = typeof candidate.seed === 'string' ? candidate.seed.slice(0, 96) : '';
				const won = typeof candidate.won === 'boolean' ? candidate.won : false;
				const score = finiteNonNegative(candidate.score, 0);
				const elapsedMs = finiteNonNegative(candidate.elapsedMs, 0);
				const at =
					typeof candidate.at === 'string' && !Number.isNaN(Date.parse(candidate.at))
						? candidate.at
						: new Date(0).toISOString();
				return seed ? [{ seed, won, score, elapsedMs, at }] : [];
			})
		: [];

	return {
		version: RUNS_VERSION,
		bestScore: finiteNonNegative(decoded.bestScore, 0),
		fastestCompletionMs: fastest,
		recent: recent.slice(0, 8)
	};
}

export function recordRun(
	current: StoredRunRecord,
	result: Pick<RunResult, 'seed' | 'won' | 'elapsedMs' | 'score'>,
	at = new Date()
): StoredRunRecord {
	const score = finiteNonNegative(result.score.total, 0);
	const elapsedMs = finiteNonNegative(result.elapsedMs, 0);
	const fastestCompletionMs = result.won
		? current.fastestCompletionMs === null
			? elapsedMs
			: Math.min(current.fastestCompletionMs, elapsedMs)
		: current.fastestCompletionMs;
	return {
		version: RUNS_VERSION,
		bestScore: Math.max(current.bestScore, score),
		fastestCompletionMs,
		recent: [
			{
				seed: result.seed,
				won: result.won,
				score,
				elapsedMs,
				at: at.toISOString()
			},
			...current.recent
		].slice(0, 8)
	};
}

export function serializeStoredRuns(record: StoredRunRecord): string {
	return JSON.stringify(parseStoredRuns(record));
}

export function recentFailureCount(record: StoredRunRecord): number {
	let failures = 0;
	for (const run of record.recent) {
		if (run.won) break;
		failures += 1;
	}
	return failures;
}
