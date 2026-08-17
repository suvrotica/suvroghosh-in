import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import approvalManifest from '../data/editorial-review-manifest.v2.json';
import reviewSet from '../data/editorial-review-set.v2.json';
import surfaceAudit from '../data/surface-audit.v2.json';
import { DIRECT_ECHO_SENTENCES_EN } from '../data/direct-echoes.en';
import { canonicalCorpusManifest, CORPUS_MANIFEST_HASH } from '../data/corpus-manifest';
import {
	FEEDBACK_RELATIONS_EN,
	FEEDBACK_SENTENCES_EN,
	SURFACE_SENTENCES_EN,
	SURFACE_SENTENCE_BANK_SHA256
} from '../data/surface-sentences.en.generated';
import { QUESTION_REGISTRY } from '../data/questions.en';
import { SELF_REPORT_QUESTION_IDS } from './question-types';
import { auditBarnumCorpus, validateBarnumCorpus } from './corpus-validation';
import { CORPUS_VERSION, ENGINE_VERSION } from './version';
import { hashHex } from './seeded-rng';

describe('Barnum v2 corpus release gates', () => {
	it('ships only complete, approved runtime surface records', () => {
		expect(SURFACE_SENTENCES_EN).toHaveLength(720);
		expect(FEEDBACK_SENTENCES_EN).toHaveLength(342);
		expect(DIRECT_ECHO_SENTENCES_EN).toHaveLength(29);
		expect(
			[...SURFACE_SENTENCES_EN, ...FEEDBACK_SENTENCES_EN, ...DIRECT_ECHO_SENTENCES_EN].every(
				(sentence) => sentence.reviewStatus === 'surface-approved-v2'
			)
		).toBe(true);
		expect(validateBarnumCorpus()).toEqual([]);
	});

	it('has one exact, entailed direct echo for every eligible answer', () => {
		for (const questionId of SELF_REPORT_QUESTION_IDS) {
			for (const option of QUESTION_REGISTRY[questionId].options) {
				const echoes = DIRECT_ECHO_SENTENCES_EN.filter(
					(sentence) =>
						sentence.claimBasis.kind === 'direct-echo' &&
						sentence.claimBasis.questionId === questionId &&
						sentence.claimBasis.optionId === option.id
				);
				expect(echoes, `${questionId}:${option.id}`).toHaveLength(1);
			}
		}
	});

	it('covers every rateable line with explicit same-family fits and partial-fit relations', () => {
		const feedbackById = new Map(FEEDBACK_SENTENCES_EN.map((sentence) => [sentence.id, sentence]));
		for (const source of SURFACE_SENTENCES_EN) {
			const relations = FEEDBACK_RELATIONS_EN.filter(
				(relation) => relation.sourceSentenceId === source.id
			);
			expect(relations.map((relation) => relation.sourceRating).sort(), source.id).toEqual([
				'fits',
				'partly-fits'
			]);
			for (const relation of relations) {
				const target = feedbackById.get(relation.targetSentenceId);
				expect(target?.semanticFamilyId, source.id).toBe(source.semanticFamilyId);
				expect(target?.axis, source.id).toBe(source.axis);
				expect(target?.pole, source.id).toBe(source.pole);
			}
		}
	});

	it('checks in a deterministic report with honest utilization and readability exceptions', () => {
		const audit = auditBarnumCorpus();
		expect(audit).toMatchObject({
			completeSurfaceSentenceCount: 1_091,
			genericSentenceCount: 720,
			feedbackSentenceCount: 342,
			directEchoSentenceCount: 29,
			distinctSemanticFamilyCount: 342,
			feedbackRelationCount: 1_440,
			hardFailureCount: 0,
			surfaceBankSha256: SURFACE_SENTENCE_BANK_SHA256
		});
		expect(surfaceAudit).toMatchObject({
			schemaVersion: 'barnum-surface-audit-v2',
			corpusVersion: CORPUS_VERSION,
			engineVersion: ENGINE_VERSION,
			corpusManifestHash: CORPUS_MANIFEST_HASH,
			representativeSampling: {
				sessionCount: 1_000,
				statementCount: 7_000,
				minimumUniqueRenderedLineGate: 600,
				maximumSingleLineShareGate: 0.02
			}
		});
		expect(surfaceAudit.representativeSampling.uniqueRenderedLineCount).toBeGreaterThanOrEqual(600);
		expect(surfaceAudit.representativeSampling.maximumSingleLineShare).toBeLessThanOrEqual(0.02);
		expect(surfaceAudit.representativeSampling.collisions).toMatchObject({
			emptyDeckCount: 0,
			duplicateIdPairCount: 0,
			duplicateFamilyPairCount: 0,
			nearDuplicatePairCount: 0,
			openerLimitViolationCount: 0,
			crossAxisRainbowCount: 0
		});
		expect(surfaceAudit.readability.exceptionCount).toBeGreaterThan(0);
		expect(surfaceAudit.readability.exceptions).toHaveLength(
			surfaceAudit.readability.exceptionCount
		);
		expect(surfaceAudit.representativeSampling.top50Lines).toHaveLength(50);
		expect(surfaceAudit).toHaveProperty('corpusManifestSha256');
	});

	it('keeps the baked browser manifest token equal to the canonical audit manifest', () => {
		expect(hashHex(canonicalCorpusManifest())).toBe(CORPUS_MANIFEST_HASH);
	});

	it('pins at least 200 unique complete lines for two independent read-aloud reviews', () => {
		const reviewBytes = `${JSON.stringify(reviewSet, null, '\t')}\n`;
		expect(reviewSet.entries.length).toBeGreaterThanOrEqual(200);
		expect(new Set(reviewSet.entries.map((entry) => entry.id)).size).toBe(reviewSet.entries.length);
		expect(new Set(reviewSet.entries.map((entry) => entry.text)).size).toBe(
			reviewSet.entries.length
		);
		expect(createHash('sha256').update(reviewBytes, 'utf8').digest('hex')).toBe(
			approvalManifest.reviewSetSha256
		);
		expect(approvalManifest.reviewerAttestations).toHaveLength(2);
		expect(
			approvalManifest.reviewerAttestations.every(
				(reviewer) =>
					reviewer.status === 'pending' ||
					reviewer.reviewedSha256 === approvalManifest.reviewSetSha256
			)
		).toBe(true);
		expect(createHash('sha256').update(canonicalCorpusManifest(), 'utf8').digest('hex')).toBe(
			surfaceAudit.corpusManifestSha256
		);
	});
});
