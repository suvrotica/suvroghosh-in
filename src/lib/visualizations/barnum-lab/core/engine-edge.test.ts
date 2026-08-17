import { describe, expect, it } from 'vitest';
import { SURFACE_SENTENCES_EN } from '../data/surface-sentences.en.generated';
import { compileCandidates } from './compile-candidates';
import { createDefaultDisplayProfile, toGenerationProfile } from './input-boundary';
import { compareCandidateRank, selectReadingFromCandidates } from './select-reading';

describe('bounded v2 candidate-engine edge cases', () => {
	const profile = toGenerationProfile(createDefaultDisplayProfile(), '0f0e0d0c0b0a0908');

	it('terminates cleanly for empty and capped complete-sentence pools', () => {
		expect(compileCandidates(profile, { sentences: [], maxCandidates: 500 })).toEqual([]);
		expect(
			compileCandidates(profile, {
				sentences: SURFACE_SENTENCES_EN,
				maxCandidates: Number.NaN
			})
		).toHaveLength(SURFACE_SENTENCES_EN.length);
		expect(
			compileCandidates(profile, { sentences: SURFACE_SENTENCES_EN, maxCandidates: 3 })
		).toHaveLength(3);
	});

	it('uses one complete record once and reports an unsatisfied larger request', () => {
		const candidates = compileCandidates(profile, {
			sentences: [SURFACE_SENTENCES_EN[0]],
			maxCandidates: 500
		});
		expect(candidates).toHaveLength(1);
		expect(selectReadingFromCandidates(profile, candidates, { count: 1 })).toHaveLength(1);
		expect(() => selectReadingFromCandidates(profile, candidates, { count: 2 })).toThrow(
			/could not fill/u
		);
	});

	it('uses stable IDs to break exact score ties and protects against invalid counts', () => {
		const score = { total: 4 };
		expect(
			compareCandidateRank(
				{ candidate: { id: 'candidate.a' }, score },
				{ candidate: { id: 'candidate.b' }, score }
			)
		).toBeLessThan(0);
		expect(selectReadingFromCandidates(profile, [], { count: Number.NaN })).toEqual([]);
	});
});
