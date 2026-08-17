import { describe, expect, it } from 'vitest';
import { SURFACE_SENTENCES_EN } from '../data/surface-sentences.en.generated';
import { compileCandidates } from './compile-candidates';
import { createDefaultDisplayProfile, toGenerationProfile } from './input-boundary';
import { generateReading } from './select-reading';
import { surfaceTextIssues } from './surface-text';
import { contentWordOverlap, SIMILARITY_THRESHOLDS, trigramJaccard } from './text-similarity';

describe('complete-sentence rendering and repetition controls', () => {
	it('compiles every approved record without joining or changing its text', () => {
		const profile = toGenerationProfile(createDefaultDisplayProfile(), '13579bdf2468ace0');
		const candidates = compileCandidates(profile, {
			sentences: SURFACE_SENTENCES_EN,
			maxCandidates: SURFACE_SENTENCES_EN.length
		});
		expect(candidates).toHaveLength(SURFACE_SENTENCES_EN.length);
		const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
		for (const sentence of SURFACE_SENTENCES_EN) {
			const candidate = byId.get(sentence.id);
			expect(candidate?.text, sentence.id).toBe(sentence.text);
			expect(candidate?.renderedSegments, sentence.id).toHaveLength(1);
			expect(candidate?.surfaceSentenceId, sentence.id).toBe(sentence.id);
			expect(candidate?.semanticFamilyIds, sentence.id).toEqual([sentence.semanticFamilyId]);
		}
	});

	it('keeps families, exact lines, near duplicates, and openers distinct in seeded decks', () => {
		for (let index = 0; index < 256; index += 1) {
			const seed = (index + 50_000).toString(16).padStart(16, '0');
			const reading = generateReading(toGenerationProfile(createDefaultDisplayProfile(), seed), {
				count: 7,
				seedKey: 'v2-repetition-property'
			});
			expect(reading, seed).toHaveLength(7);
			const families = reading.flatMap((statement) => statement.trace.semanticFamilyIds);
			expect(new Set(families).size, seed).toBe(7);
			expect(new Set(reading.map((statement) => statement.text)).size, seed).toBe(7);
			const openers = reading.map((statement) => {
				const sentence = SURFACE_SENTENCES_EN.find(
					(candidate) => candidate.id === statement.trace.fragmentIds[0]
				);
				expect(sentence, statement.statementId).toBeDefined();
				expect(
					surfaceTextIssues(statement.text, {
						allowReviewedRainbowLength: sentence?.mechanism === 'rainbow-pair'
					}),
					statement.statementId
				).toEqual([]);
				if (sentence?.mechanism === 'rainbow-pair') {
					expect(sentence.rainbowCompatibilityFamilyId).toBe(sentence.semanticFamilyId);
					expect(statement.trace.axes).toEqual([sentence.axis]);
				}
				return sentence?.opener;
			});
			for (const opener of new Set(openers)) {
				expect(
					openers.filter((candidate) => candidate === opener).length,
					`${seed}:${opener}`
				).toBeLessThanOrEqual(2);
			}
			for (let left = 0; left < reading.length; left += 1) {
				for (let right = left + 1; right < reading.length; right += 1) {
					expect(
						trigramJaccard(reading[left].text, reading[right].text) >
							SIMILARITY_THRESHOLDS.trigramJaccard ||
							contentWordOverlap(reading[left].text, reading[right].text) >
								SIMILARITY_THRESHOLDS.contentWordOverlap,
						`${seed}:${reading[left].statementId}:${reading[right].statementId}`
					).toBe(false);
				}
			}
		}
	}, 30_000);
});
