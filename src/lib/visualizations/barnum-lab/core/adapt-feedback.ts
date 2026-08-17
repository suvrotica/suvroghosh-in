import { FRAGMENTS_EN } from '../data/fragments.en';
import { compileCandidates } from './compile-candidates';
import { rngFor } from './seeded-rng';
import { candidateToGeneratedStatement } from './select-reading';
import { candidateConflictsWithStatements } from './statement-compatibility';
import type {
	FitRating,
	GeneratedStatement,
	GenerationProfile,
	RatingRecord,
	ScoreBreakdown
} from './types';

const ZERO_SCORE: ScoreBreakdown = {
	editorialBreadthPreference: 0,
	stageCompatibility: 1,
	axisNovelty: 0,
	techniqueNovelty: 0,
	directEchoEligibility: 0,
	lexicalPenalty: 0,
	semanticPenalty: 0,
	deterministicJitter: 0,
	total: 1
};

function sourceAxes(statement: GeneratedStatement): ReadonlySet<string> {
	const ids = new Set(statement.trace.fragmentIds);
	return new Set(
		FRAGMENTS_EN.flatMap((fragment) =>
			ids.has(fragment.id) && fragment.kind === 'clause' && fragment.axis ? [fragment.axis] : []
		)
	);
}

function latestRatings(records: readonly RatingRecord[]): readonly RatingRecord[] {
	const byStatement = new Map<string, RatingRecord>();
	for (const rating of records) byStatement.set(rating.statementId, rating);
	return [...byStatement.values()].sort((a, b) => a.eventId.localeCompare(b.eventId));
}

export function canDriveFeedback(rating: FitRating): rating is 'fits' | 'partly-fits' {
	return rating === 'fits' || rating === 'partly-fits';
}

/**
 * Creates new audited statements; it never mutates, overwrites, or relabels the source or rating.
 */
export function deriveFromFeedback(
	statements: readonly GeneratedStatement[],
	ratings: readonly RatingRecord[],
	profile: GenerationProfile,
	maxDerivatives = 2,
	slotOffset = 0
): readonly GeneratedStatement[] {
	const result: GeneratedStatement[] = [];
	const eligibleRatings = latestRatings(ratings).filter((rating) =>
		canDriveFeedback(rating.rating)
	);
	for (const rating of eligibleRatings) {
		if (result.length >= Math.max(0, Math.min(2, maxDerivatives))) break;
		const source = statements.find((statement) => statement.statementId === rating.statementId);
		if (!source) continue;
		const axes = sourceAxes(source);
		if (axes.size === 0) continue;
		const seedKey = 'feedback:' + rating.eventId + ':' + rating.rating;
		let candidates = compileCandidates(profile, {
			claimBasis: 'unsupported-generic',
			seedKey,
			maxCandidates: 500
		}).filter(
			(candidate) =>
				candidate.axes.some((axis) => axes.has(axis)) &&
				!candidateConflictsWithStatements(candidate, [...statements, ...result])
		);
		if (rating.rating === 'partly-fits') {
			candidates = candidates.filter(
				(candidate) =>
					candidate.techniques.includes('modal-hedge') ||
					candidate.techniques.includes('exception-clause') ||
					candidate.breadth === 'very-broad'
			);
		}
		const chosen =
			candidates[Math.floor(rngFor(profile.sessionSeed, seedKey, 'choose')() * candidates.length)];
		if (!chosen) continue;
		const slotId = 'feedback-' + (slotOffset + result.length + 1);
		const base = candidateToGeneratedStatement(chosen, slotId, seedKey, ZERO_SCORE, false);
		const influence = {
			kind: 'feedback' as const,
			ratingEventId: rating.eventId,
			exactRating: rating.rating
		};
		result.push({
			...base,
			parentStatementId: source.statementId,
			renderedSegments: base.renderedSegments.map((segment) => ({
				...segment,
				technique: segment.fragmentId ? 'feedback-reuse' : segment.technique,
				selectionInfluences: [influence]
			})),
			trace: {
				...base.trace,
				techniques: [...new Set([...base.trace.techniques, 'feedback-reuse' as const])],
				selectionInfluences: [influence]
			},
			version: {
				versionId: base.coreId + ':feedback:' + rating.eventId,
				parentVersionId: source.version.versionId,
				coreId: base.coreId,
				transformation: {
					kind: 'feedback-derivative',
					ratingEventId: rating.eventId,
					mode: rating.rating === 'partly-fits' ? 'hedged' : 'selected'
				}
			}
		});
	}
	return result;
}
