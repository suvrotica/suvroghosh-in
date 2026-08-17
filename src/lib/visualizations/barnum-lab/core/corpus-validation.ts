import { AUDIT_EXPLANATIONS_EN } from '../data/audit-explanations.en';
import { DIRECT_ECHO_SENTENCES_EN } from '../data/direct-echoes.en';
import { HEDGE_PAIRS_EN } from '../data/hedge-pairs.en';
import {
	FEEDBACK_RELATIONS_EN,
	FEEDBACK_SENTENCES_EN,
	SURFACE_SENTENCES_EN,
	SURFACE_SENTENCE_BANK_SHA256
} from '../data/surface-sentences.en.generated';
import { surfaceTextIssues, surfaceWordCount } from './surface-text';
import type { Mechanism, SurfaceSentence } from './types';

export interface CorpusValidationIssue {
	code: string;
	id: string;
	message: string;
}

function issue(code: string, id: string, message: string): CorpusValidationIssue {
	return { code, id, message };
}

export function validateBarnumCorpus(
	sentences: readonly SurfaceSentence[] = [
		...SURFACE_SENTENCES_EN,
		...FEEDBACK_SENTENCES_EN,
		...DIRECT_ECHO_SENTENCES_EN
	]
): readonly CorpusValidationIssue[] {
	const issues: CorpusValidationIssue[] = [];
	const ids = new Set<string>();
	const texts = new Set<string>();
	for (const sentence of sentences) {
		if (ids.has(sentence.id))
			issues.push(issue('duplicate-id', sentence.id, 'Duplicate sentence ID.'));
		ids.add(sentence.id);
		if (texts.has(sentence.text) && sentence.channel !== 'direct-echo') {
			issues.push(issue('duplicate-text', sentence.id, 'Duplicate rendered generic sentence.'));
		}
		texts.add(sentence.text);
		if (sentence.reviewStatus !== 'surface-approved-v2') {
			issues.push(issue('unapproved', sentence.id, 'Surface sentence is not approved for v2.'));
		}
		if ((sentence as { channel: string }).channel === 'audit-only') {
			issues.push(
				issue('audit-channel', sentence.id, 'Audit-only prose entered the surface bank.')
			);
		}
		for (const problem of surfaceTextIssues(sentence.text, {
			allowReviewedRainbowLength: sentence.mechanism === 'rainbow-pair'
		})) {
			issues.push(issue('surface-contract', sentence.id, problem));
		}
		if (sentence.wordCount !== surfaceWordCount(sentence.text)) {
			issues.push(
				issue('word-count', sentence.id, 'Stored word count differs from rendered text.')
			);
		}
		if (
			sentence.mechanism === 'rainbow-pair' &&
			sentence.rainbowCompatibilityFamilyId !== sentence.semanticFamilyId
		) {
			issues.push(
				issue('rainbow-family', sentence.id, 'Rainbow line lacks its exact same-axis family ID.')
			);
		}
	}

	const surfaceById = new Map(
		[...SURFACE_SENTENCES_EN, ...FEEDBACK_SENTENCES_EN].map((sentence) => [sentence.id, sentence])
	);
	for (const relation of FEEDBACK_RELATIONS_EN) {
		const source = surfaceById.get(relation.sourceSentenceId);
		const target = surfaceById.get(relation.targetSentenceId);
		if (!source || !target) {
			issues.push(
				issue(
					'feedback-target',
					relation.sourceSentenceId,
					'Feedback relation has a missing endpoint.'
				)
			);
			continue;
		}
		if (
			source.semanticFamilyId !== relation.semanticFamilyId ||
			target.semanticFamilyId !== relation.semanticFamilyId ||
			source.axis !== target.axis ||
			source.pole !== target.pole
		) {
			issues.push(
				issue(
					'feedback-family',
					relation.sourceSentenceId,
					'Feedback relation crosses family, axis, or pole.'
				)
			);
		}
		if (relation.sourceRating === 'partly-fits' && target.mechanism !== 'feedback-qualification') {
			issues.push(
				issue(
					'feedback-qualification',
					relation.sourceSentenceId,
					'Partial fit must target one explicitly softened line.'
				)
			);
		}
	}
	return issues;
}

export function assertValidBarnumCorpus(): void {
	const issues = validateBarnumCorpus();
	if (issues.length > 0) {
		throw new Error(
			`Barnum v2 corpus failed validation:\n${issues
				.map((entry) => `${entry.code}:${entry.id}: ${entry.message}`)
				.join('\n')}`
		);
	}
}

export interface CorpusAudit {
	completeSurfaceSentenceCount: number;
	genericSentenceCount: number;
	feedbackSentenceCount: number;
	directEchoSentenceCount: number;
	distinctSemanticFamilyCount: number;
	feedbackRelationCount: number;
	auditExplanationCount: number;
	hedgePairCount: number;
	countsByChannel: Record<string, number>;
	countsByMechanism: Record<string, number>;
	countsByAxis: Record<string, number>;
	hardFailureCount: number;
	failures: readonly CorpusValidationIssue[];
	surfaceBankSha256: string;
}

function countBy<T>(values: readonly T[], key: (value: T) => string): Record<string, number> {
	const result: Record<string, number> = {};
	for (const value of values) {
		const item = key(value);
		result[item] = (result[item] ?? 0) + 1;
	}
	return Object.fromEntries(
		Object.entries(result).sort(([left], [right]) => left.localeCompare(right))
	);
}

export function auditBarnumCorpus(): CorpusAudit {
	const allSurface = [
		...SURFACE_SENTENCES_EN,
		...FEEDBACK_SENTENCES_EN,
		...DIRECT_ECHO_SENTENCES_EN
	];
	const failures = validateBarnumCorpus(allSurface);
	return {
		completeSurfaceSentenceCount: allSurface.length,
		genericSentenceCount: SURFACE_SENTENCES_EN.length,
		feedbackSentenceCount: FEEDBACK_SENTENCES_EN.length,
		directEchoSentenceCount: DIRECT_ECHO_SENTENCES_EN.length,
		distinctSemanticFamilyCount: new Set(
			SURFACE_SENTENCES_EN.map((sentence) => sentence.semanticFamilyId)
		).size,
		feedbackRelationCount: FEEDBACK_RELATIONS_EN.length,
		auditExplanationCount: AUDIT_EXPLANATIONS_EN.length,
		hedgePairCount: HEDGE_PAIRS_EN.length,
		countsByChannel: countBy(allSurface, (sentence) => sentence.channel),
		countsByMechanism: countBy(allSurface, (sentence) => sentence.mechanism),
		countsByAxis: countBy(allSurface, (sentence) => sentence.axis),
		hardFailureCount: failures.length,
		failures,
		surfaceBankSha256: SURFACE_SENTENCE_BANK_SHA256
	};
}

export function isSurfaceMechanism(value: string): value is Mechanism {
	return [
		'broad-common-experience',
		'rainbow-pair',
		'flattering-ambiguity',
		'unused-potential',
		'guarded-vulnerability',
		'redeemable-flaw',
		'conditional-escape',
		'direct-echo',
		'feedback-reinforcement',
		'feedback-qualification',
		'miss-recovery'
	].includes(value);
}
