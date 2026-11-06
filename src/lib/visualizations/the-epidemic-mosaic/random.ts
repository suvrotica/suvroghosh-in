import {
	DEFAULT_BATCH_REPETITIONS,
	DEFAULT_OUTBREAK_SEED,
	PARAMETER_BOUNDS
} from './types.ts';

/**
 * Stored canonical seed offsets so a batch of 20 repetitions from any base outbreak seed
 * reuses an identical, deterministic sequence of 20 outbreak seeds across compared scenarios.
 */
export const STORED_OUTBREAK_SEED_OFFSETS: readonly number[] = Object.freeze([
	0, 102, 201, 307, 401, 503, 607, 701, 809, 907, 1009, 1103, 1201, 1301, 1409, 1511, 1601, 1709,
	1801, 1907, 2003, 2111, 2203, 2309, 2411, 2503, 2609, 2707, 2801, 2903
]);

export function normalizeSeed(seed: number, fallback: number = DEFAULT_OUTBREAK_SEED): number {
	if (!Number.isFinite(seed)) return fallback;
	const clamped = Math.round(seed);
	if (clamped < PARAMETER_BOUNDS.outbreakSeed.min) return PARAMETER_BOUNDS.outbreakSeed.min;
	if (clamped > PARAMETER_BOUNDS.outbreakSeed.max) return PARAMETER_BOUNDS.outbreakSeed.max;
	return clamped;
}

/**
 * Deterministic Mulberry32 PRNG returning uniform values in (0, 1).
 * Never returns 0 or 1 so -Math.log(u) in Gillespie's direct method is always finite and positive.
 */
export function createSeededRng(seed: number): () => number {
	let state = (Math.round(seed) ^ 0x6d2b79f5) >>> 0;
	if (state === 0) state = 0x9e3779b9;

	return (): number => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		const u32 = (t ^ (t >>> 14)) >>> 0;
		// Map [0, 2^32 - 1] into open interval (0, 1)
		return (u32 + 0.5) / 4294967296.0;
	};
}

/**
 * Builds the reproducible outbreak-seed list reused across compared scenarios.
 */
export function buildOutbreakSeedList(
	baseOutbreakSeed: number = DEFAULT_OUTBREAK_SEED,
	repetitions: number = DEFAULT_BATCH_REPETITIONS
): number[] {
	const cleanBase = normalizeSeed(baseOutbreakSeed, DEFAULT_OUTBREAK_SEED);
	const count = Math.max(1, Math.min(100, Math.round(repetitions)));
	const seeds: number[] = [];
	for (let i = 0; i < count; i++) {
		const offset =
			i < STORED_OUTBREAK_SEED_OFFSETS.length
				? STORED_OUTBREAK_SEED_OFFSETS[i]
				: (i + 1) * 1009;
		const raw = ((cleanBase + offset - 1) % PARAMETER_BOUNDS.outbreakSeed.max) + 1;
		seeds.push(raw);
	}
	return seeds;
}
