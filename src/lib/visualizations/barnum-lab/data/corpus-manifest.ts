import { DIRECT_ECHO_SENTENCES_EN } from './direct-echoes.en';
import { HEDGE_PAIRS_EN } from './hedge-pairs.en';
import {
	FEEDBACK_RELATIONS_EN,
	FEEDBACK_SENTENCES_EN,
	SURFACE_SENTENCES_EN
} from './surface-sentences.en.generated';
/**
 * Version token verified against the canonical manifest by the release tests.
 * Keep this literal so a browser import does not sort, stringify, and hash the
 * complete corpus before the visitor begins the laboratory.
 */
export const CORPUS_MANIFEST_HASH = '49e1fd7e' as const;

export function canonicalCorpusManifest(): string {
	return JSON.stringify({
		surfaceSentences: [...SURFACE_SENTENCES_EN].sort((left, right) =>
			left.id.localeCompare(right.id)
		),
		feedbackSentences: [...FEEDBACK_SENTENCES_EN].sort((left, right) =>
			left.id.localeCompare(right.id)
		),
		directEchoes: [...DIRECT_ECHO_SENTENCES_EN].sort((left, right) =>
			left.id.localeCompare(right.id)
		),
		feedbackRelations: [...FEEDBACK_RELATIONS_EN].sort((left, right) =>
			`${left.sourceSentenceId}:${left.sourceRating}`.localeCompare(
				`${right.sourceSentenceId}:${right.sourceRating}`
			)
		),
		hedgePairs: [...HEDGE_PAIRS_EN].sort((left, right) => left.id.localeCompare(right.id))
	});
}
