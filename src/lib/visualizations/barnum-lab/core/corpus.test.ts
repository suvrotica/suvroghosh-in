import { describe, expect, it } from 'vitest';
import { SELF_REPORT_QUESTION_IDS } from './question-types';
import { auditBarnumCorpus, validateBarnumCorpus } from './corpus-validation';
import { FRAGMENTS_EN, CORPUS_FRAGMENT_COUNT } from '../data/fragments.en';
import { CORPUS_FRAME_COUNT, FRAMES_EN } from '../data/frames.en';
import { QUESTION_REGISTRY } from '../data/questions.en';
import auditArtifact from '../data/corpus-audit.v1.json';
import { CORPUS_MANIFEST_HASH } from '../data/corpus-manifest';
import { CORPUS_VERSION, ENGINE_VERSION } from './version';

describe('Barnum corpus release gates', () => {
	it('ships the reviewed atom and frame counts', () => {
		expect(CORPUS_FRAGMENT_COUNT).toBe(968);
		expect(CORPUS_FRAME_COUNT).toBe(48);
		expect(FRAGMENTS_EN.every((fragment) => fragment.reviewStatus === 'approved-v1')).toBe(true);
	});

	it('passes structural, safety, grammar, and satisfiability validation', () => {
		expect(validateBarnumCorpus(FRAGMENTS_EN, FRAMES_EN)).toEqual([]);
	});

	it('covers every safe self-report option with four reviewed direct paraphrases', () => {
		for (const questionId of SELF_REPORT_QUESTION_IDS) {
			for (const option of QUESTION_REGISTRY[questionId].options) {
				const echoes = FRAGMENTS_EN.filter(
					(fragment) =>
						fragment.kind === 'clause' &&
						fragment.claimBasis.kind === 'direct-echo' &&
						fragment.claimBasis.questionId === questionId &&
						fragment.claimBasis.optionId === option.id
				);
				expect(echoes, questionId + ':' + option.id).toHaveLength(4);
			}
		}
	});

	it('has no dead atoms or frames and reports exact constrained combinations', () => {
		const audit = auditBarnumCorpus();
		expect(audit.countsByKind).toEqual({ clause: 864, bridge: 24, lead: 30, tail: 50 });
		expect(Object.values(audit.countsByAxis)).toEqual(Array(18).fill(32));
		expect(audit.deadFragmentIds).toEqual([]);
		expect(audit.deadFrameIds).toEqual([]);
		expect(BigInt(audit.totalValidConstrainedCombinations)).toBeGreaterThan(100_000n);
		expect({
			corpusVersion: CORPUS_VERSION,
			engineVersion: ENGINE_VERSION,
			manifestHash: CORPUS_MANIFEST_HASH,
			...audit
		}).toEqual(auditArtifact);
	}, 60_000);
});
