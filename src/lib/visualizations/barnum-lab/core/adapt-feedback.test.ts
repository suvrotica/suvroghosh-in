import { describe, expect, it } from 'vitest';
import { FEEDBACK_SENTENCES_EN } from '../data/surface-sentences.en.generated';
import { deriveFromFeedback } from './adapt-feedback';
import { createDefaultDisplayProfile, toGenerationProfile } from './input-boundary';
import { sealGenericDeck } from './select-reading';

describe('feedback adaptation boundaries', () => {
	it('uses only explicit same-family relations and leaves its sources immutable', () => {
		const profile = toGenerationProfile(createDefaultDisplayProfile(), '1234567890abcdef');
		const deck = sealGenericDeck(profile);
		const sourceSnapshot = JSON.stringify(deck.genericStatements);
		const ratings = deck.genericStatements.slice(0, 4).map((statement, index) => ({
			statementId: statement.statementId,
			rating: index === 0 ? ('partly-fits' as const) : ('fits' as const),
			eventId: `feedback-rating-${index}`
		}));
		const derivatives = deriveFromFeedback(deck.genericStatements, ratings, profile, 2);
		expect(derivatives).toHaveLength(2);
		for (const derivative of derivatives) {
			const provenance = derivative.trace.feedbackProvenance;
			expect(provenance).toBeDefined();
			const source = deck.genericStatements.find(
				(statement) => statement.statementId === provenance?.sourceStatementId
			);
			expect(source).toBeDefined();
			expect(derivative.channel).toBe('feedback-reading');
			expect(derivative.trace.channel).toBe('feedback-reading');
			expect(derivative.trace.semanticFamilyIds).toEqual(source?.trace.semanticFamilyIds);
			expect(derivative.trace.axes).toEqual(source?.trace.axes);
			expect(derivative.trace.poles).toEqual(source?.trace.poles);
			expect(derivative.parentStatementId).toBe(source?.statementId);
			expect(derivative.version.transformation.kind).toBe('feedback-derivative');
			expect(
				FEEDBACK_SENTENCES_EN.some(
					(sentence) =>
						sentence.id === derivative.trace.fragmentIds[0] && sentence.text === derivative.text
				)
			).toBe(true);
		}
		expect(JSON.stringify(deck.genericStatements)).toBe(sourceSnapshot);
	});

	it('never adapts misses, vague ratings, unrated cards, or missing statements', () => {
		const profile = toGenerationProfile(createDefaultDisplayProfile(), 'eeeeeeeeeeeeeeee');
		const deck = sealGenericDeck(profile);
		const ignored = ['does-not-fit', 'too-vague', 'unrated'] as const;
		const ratings = ignored.map((rating, index) => ({
			statementId: deck.genericStatements[index].statementId,
			rating,
			eventId: `ignored-${index}`
		}));
		ratings.push({
			statementId: 'missing',
			rating: 'does-not-fit',
			eventId: 'ignored-missing'
		});
		expect(deriveFromFeedback(deck.genericStatements, ratings, profile, 2)).toEqual([]);
	});

	it('respects the two-slot cap, latest rating, and deterministic slot offsets', () => {
		const profile = toGenerationProfile(createDefaultDisplayProfile(), 'ffffffffffffffff');
		const deck = sealGenericDeck(profile);
		const ratings = deck.genericStatements.flatMap((statement, index) => [
			{
				statementId: statement.statementId,
				rating: 'does-not-fit' as const,
				eventId: `rating-${index}-a`
			},
			{
				statementId: statement.statementId,
				rating: 'fits' as const,
				eventId: `rating-${index}-b`
			}
		]);
		const first = deriveFromFeedback(deck.genericStatements, ratings, profile, 99, 1);
		const second = deriveFromFeedback(deck.genericStatements, ratings, profile, 99, 1);
		expect(first).toHaveLength(2);
		expect(first.map((statement) => statement.slotId)).toEqual(['feedback-2', 'feedback-3']);
		expect(second).toEqual(first);
		expect(deriveFromFeedback(deck.genericStatements, ratings, profile, Number.NaN)).toEqual([]);
	});
});
