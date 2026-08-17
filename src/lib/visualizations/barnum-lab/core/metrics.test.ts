import { describe, expect, it } from 'vitest';
import { deriveFromFeedback } from './adapt-feedback';
import { calculateReadingMetrics } from './metrics';
import { createDefaultDisplayProfile, setAnswer, toGenerationProfile } from './input-boundary';
import { generateDirectEcho, sealGenericDeck } from './select-reading';

describe('honest reading metrics', () => {
	it('keeps claim basis separate from mutually exclusive adaptation statuses', () => {
		const display = setAnswer(createDefaultDisplayProfile(), 'planning_style', 'loose-plan')!;
		const profile = toGenerationProfile(display, '1234567890abcdef');
		const deck = sealGenericDeck(profile);
		const echo = generateDirectEcho(profile, 'planning_style')!;
		const rating = {
			statementId: deck.genericStatements[0].statementId,
			rating: 'fits' as const,
			eventId: 'event-rating-1'
		};
		const derivative = deriveFromFeedback(deck.genericStatements, [rating], profile, 1)[0];
		const statements = [...deck.genericStatements, echo, derivative];
		const metrics = calculateReadingMetrics({
			statements,
			ratings: [rating],
			displayProfile: display
		});
		expect(metrics.directEchoClauseCount).toBe(echo.trace.semanticKeys.length);
		expect(metrics.elaboratedClauseCount).toBe(echo.trace.semanticKeys.length);
		expect(metrics.feedbackSelectedClauseCount).toBe(derivative.trace.semanticKeys.length);
		expect(metrics.hedgedClauseCount).toBe(0);
		expect(
			metrics.sealedClauseCount +
				metrics.feedbackSelectedClauseCount +
				metrics.hedgedClauseCount +
				metrics.elaboratedClauseCount
		).toBe(metrics.semanticClauseCount);
		expect(metrics.unsupportedGenericClauseCount + metrics.directEchoClauseCount).toBe(
			metrics.semanticClauseCount
		);
	});

	it('does not turn too-vague or unrated cards into a zero-denominator score', () => {
		const profile = toGenerationProfile(createDefaultDisplayProfile(), 'abcdef1234567890');
		const deck = sealGenericDeck(profile, 3);
		const metrics = calculateReadingMetrics({
			statements: deck.genericStatements,
			ratings: [
				{
					statementId: deck.genericStatements[0].statementId,
					rating: 'too-vague',
					eventId: 'rating-vague'
				}
			]
		});
		expect(metrics.fitRatings).toEqual({
			'does-not-fit': 0,
			'partly-fits': 0,
			fits: 0,
			'too-vague': 1,
			unrated: 2
		});
	});
});
