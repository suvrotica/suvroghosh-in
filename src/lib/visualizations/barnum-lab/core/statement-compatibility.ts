import { FRAGMENTS_EN } from '../data/fragments.en';
import { contentWordOverlap, SIMILARITY_THRESHOLDS, trigramJaccard } from './text-similarity';
import type { Candidate, CorpusFragment, GeneratedStatement } from './types';

function fragmentsForIds(ids: ReadonlySet<string>): readonly CorpusFragment[] {
	return FRAGMENTS_EN.filter((fragment) => ids.has(fragment.id));
}

/**
 * Applies the same semantic and lexical exclusion rules at every post-seal insertion point.
 * A caller can therefore omit an echo or derivative without ever reshuffling the sealed deck.
 */
export function candidateConflictsWithStatements(
	candidate: Pick<Candidate, 'fragmentIds' | 'semanticKeys' | 'text'>,
	presented: readonly GeneratedStatement[]
): boolean {
	const semanticKeys = new Set(presented.flatMap((statement) => statement.trace.semanticKeys));
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

	const presentedFragments = fragmentsForIds(
		new Set(presented.flatMap((statement) => statement.trace.fragmentIds))
	);
	const candidateFragments = fragmentsForIds(new Set(candidate.fragmentIds));
	for (const next of candidateFragments) {
		for (const existing of presentedFragments) {
			if (
				'semanticKey' in next &&
				'semanticKey' in existing &&
				(next.incompatibleSemanticKeys?.includes(existing.semanticKey) ||
					existing.incompatibleSemanticKeys?.includes(next.semanticKey))
			) {
				return true;
			}
			if (
				'incompatibleFragmentIds' in next &&
				next.incompatibleFragmentIds?.includes(existing.id)
			) {
				return true;
			}
			if (
				'incompatibleFragmentIds' in existing &&
				existing.incompatibleFragmentIds?.includes(next.id)
			) {
				return true;
			}
			if (
				next.kind === 'clause' &&
				existing.kind === 'clause' &&
				next.axis &&
				next.axis === existing.axis &&
				next.pole &&
				existing.pole &&
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
	return candidateConflictsWithStatements(
		{
			fragmentIds: statement.trace.fragmentIds,
			semanticKeys: statement.trace.semanticKeys,
			text: statement.text
		},
		presented
	);
}
