import {
	FEEDBACK_RELATIONS_EN,
	FEEDBACK_SENTENCES_EN,
	SURFACE_SENTENCES_EN
} from '../data/surface-sentences.en.generated';
import { surfaceSentenceToCandidate, techniqueForMechanism } from './compile-candidates';
import { candidateToGeneratedStatement } from './select-reading';
import type {
	FitRating,
	GeneratedStatement,
	GenerationProfile,
	Mechanism,
	RatingRecord,
	ScoreBreakdown
} from './types';

const ZERO_SCORE: ScoreBreakdown = Object.freeze({
	editorialBreadthPreference: 0,
	stageCompatibility: 1,
	axisNovelty: 0,
	techniqueNovelty: 0,
	directEchoEligibility: 0,
	lexicalPenalty: 0,
	semanticPenalty: 0,
	deterministicJitter: 0,
	total: 1
});

const SURFACE_BY_ID = new Map(
	[...SURFACE_SENTENCES_EN, ...FEEDBACK_SENTENCES_EN].map((sentence) => [sentence.id, sentence])
);

function latestRatings(records: readonly RatingRecord[]): readonly RatingRecord[] {
	const byStatement = new Map<string, RatingRecord>();
	for (const rating of records) byStatement.set(rating.statementId, rating);
	return [...byStatement.values()].sort((left, right) => left.eventId.localeCompare(right.eventId));
}

export function canDriveFeedback(rating: FitRating): rating is 'fits' | 'partly-fits' {
	return rating === 'fits' || rating === 'partly-fits';
}

/**
 * Selects only committed same-family relations. Misses, vague ratings, and unrated lines remain
 * visible evidence and never enter this function's candidate path.
 */
export function deriveFromFeedback(
	statements: readonly GeneratedStatement[],
	ratings: readonly RatingRecord[],
	_profile: GenerationProfile,
	maxDerivatives = 2,
	slotOffset = 0
): readonly GeneratedStatement[] {
	const maximum = Number.isFinite(maxDerivatives)
		? Math.max(0, Math.min(2, Math.trunc(maxDerivatives)))
		: 0;
	const result: GeneratedStatement[] = [];
	for (const rating of latestRatings(ratings)) {
		if (result.length >= maximum) break;
		if (!canDriveFeedback(rating.rating)) continue;
		const source = statements.find((statement) => statement.statementId === rating.statementId);
		if (!source) continue;
		const sourceSentenceId = source.trace.fragmentIds.find((id) => SURFACE_BY_ID.has(id));
		if (!sourceSentenceId) continue;
		const relation = FEEDBACK_RELATIONS_EN.find(
			(candidate) =>
				candidate.sourceSentenceId === sourceSentenceId &&
				candidate.sourceRating === rating.rating &&
				source.trace.semanticFamilyIds.includes(candidate.semanticFamilyId)
		);
		if (!relation) continue;
		const target = SURFACE_BY_ID.get(relation.targetSentenceId);
		if (!target || target.semanticFamilyId !== relation.semanticFamilyId) continue;
		const mechanism: Mechanism =
			relation.tactic === 'qualify' ? 'feedback-qualification' : 'feedback-reinforcement';
		const candidate = {
			...surfaceSentenceToCandidate(target),
			channel: 'feedback-reading' as const,
			mechanisms: [mechanism] as const,
			techniques: [techniqueForMechanism(mechanism)] as const
		};
		const slotId = `feedback-${slotOffset + result.length + 1}`;
		const seedKey = `feedback:${rating.eventId}:${rating.rating}:${relation.targetSentenceId}`;
		const base = candidateToGeneratedStatement(candidate, slotId, seedKey, ZERO_SCORE, false);
		const influence = {
			kind: 'feedback' as const,
			ratingEventId: rating.eventId,
			exactRating: rating.rating
		};
		result.push(
			Object.freeze({
				...base,
				channel: 'feedback-reading' as const,
				parentStatementId: source.statementId,
				renderedSegments: base.renderedSegments.map((segment) => ({
					...segment,
					technique: techniqueForMechanism(mechanism),
					selectionInfluences: [influence]
				})),
				trace: {
					...base.trace,
					channel: 'feedback-reading' as const,
					mechanisms: [mechanism],
					techniques: [techniqueForMechanism(mechanism)],
					selectionInfluences: [influence],
					feedbackProvenance: {
						sourceStatementId: source.statementId,
						sourceRating: rating.rating,
						tactic: relation.tactic,
						semanticFamilyId: relation.semanticFamilyId
					}
				},
				version: {
					versionId: `${base.coreId}:feedback:${rating.eventId}:v2`,
					parentVersionId: source.version.versionId,
					coreId: base.coreId,
					transformation: {
						kind: 'feedback-derivative' as const,
						ratingEventId: rating.eventId,
						mode: relation.tactic === 'qualify' ? ('hedged' as const) : ('selected' as const)
					}
				}
			})
		);
	}
	return Object.freeze(result);
}
