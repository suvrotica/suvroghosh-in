import { contentWordOverlap, SIMILARITY_THRESHOLDS, trigramJaccard } from './text-similarity';
import type { Candidate, ContentAxis, GeneratedStatement, SurfaceText } from './types';

interface ComparableStatement {
	semanticKeys: readonly string[];
	text: SurfaceText;
	axes?: readonly ContentAxis[];
	poles?: readonly { axis: ContentAxis; pole: string }[];
}

/** Applies the same exact-family, pole, and near-duplicate guard at every insertion point. */
export function candidateConflictsWithStatements(
	candidate: Pick<Candidate, 'semanticKeys' | 'text' | 'axes' | 'poles'>,
	presented: readonly GeneratedStatement[]
): boolean {
	const semanticKeys = new Set(presented.flatMap((statement) => statement.trace.semanticFamilyIds));
	if (candidate.semanticKeys.some((key) => semanticKeys.has(key))) return true;
	if (
		presented.some(
			(statement) =>
				trigramJaccard(candidate.text, statement.text) > SIMILARITY_THRESHOLDS.trigramJaccard ||
				contentWordOverlap(candidate.text, statement.text) >
					SIMILARITY_THRESHOLDS.contentWordOverlap
		)
	) {
		return true;
	}
	for (const next of candidate.poles) {
		for (const existing of presented.flatMap((statement) => statement.trace.poles)) {
			if (
				next.axis === existing.axis &&
				next.pole !== 'balanced' &&
				existing.pole !== 'balanced' &&
				next.pole !== existing.pole
			) {
				return true;
			}
		}
	}
	return false;
}

export function statementConflictsWithStatements(
	statement: GeneratedStatement,
	presented: readonly GeneratedStatement[]
): boolean {
	const comparable: ComparableStatement = {
		semanticKeys: statement.trace.semanticFamilyIds,
		text: statement.text,
		axes: statement.trace.axes,
		poles: statement.trace.poles
	};
	return candidateConflictsWithStatements(
		{
			semanticKeys: comparable.semanticKeys,
			text: comparable.text,
			axes: comparable.axes ?? [],
			poles: comparable.poles ?? []
		},
		presented
	);
}
