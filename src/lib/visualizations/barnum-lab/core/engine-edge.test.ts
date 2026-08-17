import { describe, expect, it } from 'vitest';
import { compileCandidates } from './compile-candidates';
import { createDefaultDisplayProfile, toGenerationProfile } from './input-boundary';
import { compareCandidateRank, selectReadingFromCandidates } from './select-reading';
import { FRAGMENTS_EN } from '../data/fragments.en';
import { FRAMES_EN } from '../data/frames.en';

describe('bounded candidate-engine edge cases', () => {
	const profile = toGenerationProfile(createDefaultDisplayProfile(), '0f0e0d0c0b0a0908');

	it('terminates cleanly for empty and unsatisfiable pools', () => {
		expect(
			compileCandidates(profile, {
				fragments: [],
				frames: [],
				maxAttemptsPerFrame: 256,
				maxCandidates: 500
			})
		).toEqual([]);
		const rainbow = FRAMES_EN.find((frame) => frame.id === 'rainbow.pair.01')!;
		const lone = FRAGMENTS_EN.find(
			(fragment) => fragment.kind === 'clause' && fragment.role === 'independent'
		)!;
		expect(
			compileCandidates(profile, {
				fragments: [lone],
				frames: [rainbow],
				maxAttemptsPerFrame: 256
			})
		).toEqual([]);
	});

	it('returns the only candidate from a nearly exhausted pool and respects an attempt bound', () => {
		const frame = FRAMES_EN.find((candidate) => candidate.id === 'plain.single.01')!;
		const fragment = FRAGMENTS_EN.find(
			(candidate) =>
				candidate.kind === 'clause' &&
				candidate.role === 'independent' &&
				candidate.claimBasis.kind === 'unsupported-generic'
		)!;
		const candidates = compileCandidates(profile, {
			fragments: [fragment],
			frames: [frame],
			maxAttemptsPerFrame: 0,
			maxCandidates: 500
		});
		expect(candidates).toHaveLength(1);
		expect(selectReadingFromCandidates(profile, candidates, { count: 2 })).toHaveLength(1);
	});

	it('uses stable IDs to break exact score ties and protects against NaN counts', () => {
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
