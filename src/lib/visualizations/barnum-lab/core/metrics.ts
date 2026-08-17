import { QUESTION_REGISTRY } from '../data/questions.en';
import { compareSemanticManifests } from './counterfactual';
import type {
	BreadthEstimate,
	DisplayProfile,
	FitRating,
	GeneratedStatement,
	RatingRecord,
	ReadingMetrics,
	SixPointRating
} from './types';

export interface ReadingMetricsInput {
	statements: readonly GeneratedStatement[];
	ratings: readonly RatingRecord[];
	displayProfile?: DisplayProfile;
	polishedSummaryStatementIds?: readonly string[];
	counterfactualStatements?: readonly GeneratedStatement[];
	selfReportCounterfactualChangeCount?: number;
	wholeReadingFit?: SixPointRating;
	visitorEstimatedBreadth?: BreadthEstimate;
	visitorRatedDistinctiveness?: SixPointRating;
}

const EMPTY_RATING_COUNTS: Record<FitRating, number> = {
	'does-not-fit': 0,
	'partly-fits': 0,
	fits: 0,
	'too-vague': 0,
	unrated: 0
};

function latestRatings(records: readonly RatingRecord[]): ReadonlyMap<string, RatingRecord> {
	const latest = new Map<string, RatingRecord>();
	for (const record of records) latest.set(record.statementId, record);
	return latest;
}

export function calculateReadingMetrics(input: ReadingMetricsInput): ReadingMetrics {
	const fitRatings = { ...EMPTY_RATING_COUNTS };
	const latest = latestRatings(input.ratings);
	for (const statement of input.statements) {
		fitRatings[latest.get(statement.statementId)?.rating ?? 'unrated'] += 1;
	}

	let unsupportedGenericClauseCount = 0;
	let directEchoClauseCount = 0;
	let sealedClauseCount = 0;
	let feedbackSelectedClauseCount = 0;
	let hedgedClauseCount = 0;
	// V1 selects or hedges complete approved clauses; it does not concatenate elaborations.
	let elaboratedClauseCount = 0;
	for (const statement of input.statements) {
		const clauses = statement.trace.semanticKeys.length;
		if (statement.trace.claimBasis.kind === 'direct-echo') directEchoClauseCount += clauses;
		else unsupportedGenericClauseCount += clauses;
		const transformation = statement.version.transformation;
		if (transformation.kind === 'sealed') sealedClauseCount += clauses;
		if (transformation.kind === 'feedback-derivative') {
			if (transformation.mode === 'hedged') hedgedClauseCount += clauses;
			else feedbackSelectedClauseCount += clauses;
		}
		if (transformation.kind === 'direct-echo-added') elaboratedClauseCount += clauses;
	}

	let unusedInputCount = 0;
	let presentationOnlyInputCount = 0;
	for (const questionId of Object.keys(
		input.displayProfile ?? {}
	) as (keyof typeof QUESTION_REGISTRY)[]) {
		const use = QUESTION_REGISTRY[questionId].permittedUse;
		if (use === 'unused-demographic' || use === 'unused-decoy') unusedInputCount += 1;
		if (use === 'presentation-only') presentationOnlyInputCount += 1;
	}
	const polished = new Set(
		input.polishedSummaryStatementIds ?? input.statements.map((statement) => statement.statementId)
	);
	const nonFitsOmittedFromPolishedSummaryCount = [...latest.values()].filter(
		(record) => record.rating === 'does-not-fit' && !polished.has(record.statementId)
	).length;
	const comparison = input.counterfactualStatements
		? compareSemanticManifests(input.statements, input.counterfactualStatements)
		: { overlapPercent: 100 };

	return {
		statementCount: input.statements.length,
		semanticClauseCount: input.statements.reduce(
			(total, statement) => total + statement.trace.semanticKeys.length,
			0
		),
		unsupportedGenericClauseCount,
		directEchoClauseCount,
		sealedClauseCount,
		feedbackSelectedClauseCount,
		hedgedClauseCount,
		elaboratedClauseCount,
		unusedInputCount,
		presentationOnlyInputCount,
		nonFitsOmittedFromPolishedSummaryCount,
		distinctContentAxisCount: new Set(
			input.statements.flatMap((statement) =>
				statement.trace.semanticKeys
					.map((key) => key.split('.').slice(0, 1).join('.'))
					.filter(
						(key) => key !== 'common' && key !== 'special' && key !== 'echo' && key !== 'tail'
					)
			)
		).size,
		uniqueTechniqueCount: new Set(
			input.statements.flatMap((statement) => statement.trace.techniques)
		).size,
		demographicCounterfactualSemanticIdOverlap: comparison.overlapPercent,
		selfReportCounterfactualChangeCount: Math.max(
			0,
			Math.trunc(input.selfReportCounterfactualChangeCount ?? 0)
		),
		fitRatings,
		wholeReadingFit: input.wholeReadingFit,
		visitorEstimatedBreadth: input.visitorEstimatedBreadth,
		visitorRatedDistinctiveness: input.visitorRatedDistinctiveness
	};
}
