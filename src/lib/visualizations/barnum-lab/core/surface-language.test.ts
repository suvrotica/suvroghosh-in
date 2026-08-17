import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUDIT_EXPLANATIONS_EN } from '../data/audit-explanations.en';
import { DIRECT_ECHO_SENTENCES_EN } from '../data/direct-echoes.en';
import {
	FEEDBACK_RELATIONS_EN,
	FEEDBACK_SENTENCES_EN,
	SURFACE_SENTENCES_EN
} from '../data/surface-sentences.en.generated';
import { deriveFromFeedback } from './adapt-feedback';
import { compileCandidates } from './compile-candidates';
import { sealGenericDeck } from './select-reading';
import { makeSurfaceText, surfaceTextIssues } from './surface-text';
import type { SurfaceSentence } from './types';

const FORBIDDEN_REGRESSIONS = [
	'You can remain outwardly calm while deciding what matters, alongside moments when you often notice a distinction that matters even when it is difficult to explain briefly.',
	'From time to time, you prefer to understand the downside before testing an unfamiliar option.',
	'It may be that you can delay a blunt response until you find a fairer form.',
	'The description can stretch from',
	'The sentence can cover both sides',
	'A qualified version is that',
	'With an exception built in',
	'One side of the description is that',
	'The answer permits this paraphrase',
	'Using only that selection',
	'In that wording',
	'One broad reading is that',
	'alongside moments when',
	'together with the fact that',
	'with the additional sense that'
] as const;

describe('surface-language boundary', () => {
	it('keeps every generator-approved and direct-echo sentence inside the spoken contract', () => {
		const generatedBank = [...SURFACE_SENTENCES_EN, ...FEEDBACK_SENTENCES_EN];
		expect(generatedBank).toHaveLength(1_062);
		for (const sentence of [...generatedBank, ...DIRECT_ECHO_SENTENCES_EN]) {
			expect(
				surfaceTextIssues(sentence.text, {
					allowReviewedRainbowLength: sentence.mechanism === 'rainbow-pair'
				}),
				sentence.id
			).toEqual([]);
			expect(sentence.wordCount, sentence.id).toBeGreaterThan(0);
			expect(sentence.text).toBe(
				makeSurfaceText(sentence.text, {
					allowReviewedRainbowLength: sentence.mechanism === 'rainbow-pair'
				})
			);
		}

		const generatedSource = readFileSync(
			new URL('../data/surface-sentences.en.generated.ts', import.meta.url),
			'utf8'
		);
		expect(generatedSource).not.toContain('makeSurfaceText');
		expect(generatedSource.match(/\bas SurfaceText\b/gu)).toHaveLength(generatedBank.length);
	});

	it('validates the final feedback-reading channel without changing the source', () => {
		const profile = { sessionSeed: '0000000000000042', selfReports: {} } as const;
		const source = sealGenericDeck(profile).genericStatements[0];
		const sourceSnapshot = JSON.stringify(source);
		const [derivative] = deriveFromFeedback(
			[source],
			[{ statementId: source.statementId, rating: 'fits', eventId: 'event-0002' }],
			profile,
			1
		);
		expect(derivative?.channel).toBe('feedback-reading');
		expect(surfaceTextIssues(derivative!.text)).toEqual([]);
		expect(derivative?.trace.feedbackProvenance?.semanticFamilyId).toBe(
			source.trace.semanticFamilyIds[0]
		);
		expect(JSON.stringify(source)).toBe(sourceSnapshot);
	});

	it('covers every rateable generic line with exact same-family fit and partial-fit relations', () => {
		const feedbackById = new Map(FEEDBACK_SENTENCES_EN.map((sentence) => [sentence.id, sentence]));
		for (const source of SURFACE_SENTENCES_EN) {
			for (const rating of ['fits', 'partly-fits'] as const) {
				const relation = FEEDBACK_RELATIONS_EN.find(
					(item) => item.sourceSentenceId === source.id && item.sourceRating === rating
				);
				expect(relation, `${source.id}:${rating}`).toBeDefined();
				const target = feedbackById.get(relation!.targetSentenceId);
				expect(target?.channel).toBe('feedback-reading');
				expect(target?.semanticFamilyId).toBe(source.semanticFamilyId);
				expect(target?.axis).toBe(source.axis);
				expect(target?.pole).toBe(source.pole);
			}
		}
	});

	it('makes the known production and meta-frame regressions impossible', () => {
		const bank = [...SURFACE_SENTENCES_EN, ...FEEDBACK_SENTENCES_EN, ...DIRECT_ECHO_SENTENCES_EN]
			.map((sentence) => sentence.text)
			.join('\n')
			.toLowerCase();
		for (const forbidden of FORBIDDEN_REGRESSIONS) {
			expect(bank).not.toContain(forbidden.toLowerCase());
		}
	});

	it('stores audit explanations only in the audit channel', () => {
		expect(AUDIT_EXPLANATIONS_EN.length).toBeGreaterThan(0);
		expect(AUDIT_EXPLANATIONS_EN.every((item) => item.channel === 'audit-only')).toBe(true);
		const surfaceIds = new Set(SURFACE_SENTENCES_EN.map((sentence) => sentence.id));
		expect(AUDIT_EXPLANATIONS_EN.some((item) => surfaceIds.has(item.id))).toBe(false);
	});

	it('rejects audit-only and unapproved records even across an unsafe runtime cast', () => {
		const profile = { sessionSeed: '0000000000000042', selfReports: {} } as const;
		expect(
			compileCandidates(profile, {
				sentences: AUDIT_EXPLANATIONS_EN as unknown as readonly SurfaceSentence[]
			})
		).toEqual([]);
		const unapproved = {
			...SURFACE_SENTENCES_EN[0],
			reviewStatus: 'needs-review'
		} as unknown as SurfaceSentence;
		expect(compileCandidates(profile, { sentences: [unapproved] })).toEqual([]);
	});

	it.each([
		['second sentence', 'You wonder? You know.'],
		['semicolon', 'You listen; you decide carefully.'],
		['colon', 'You know this: details matter.'],
		['em dash', 'You listen — then decide carefully.'],
		['parentheses', 'You listen (carefully) before deciding.'],
		['quotation marks', 'You prefer “clear” answers from people.'],
		['slash', 'You prefer clear and/or gentle answers.'],
		['softener stack', 'You may sometimes think choices through.'],
		['content repetition', 'You notice details because details matter.'],
		['subordinate stack', 'You pause because you worry when plans change.'],
		['British spelling', 'You recognise colour changes before others.'],
		['medical', 'You notice a medical symptom before others.'],
		['crime', 'You worry about crime near your home.'],
		['death', 'You think about death more than people know.'],
		['grief', 'You hide grief from people around you.'],
		['finance', 'You worry about money before making choices.'],
		['future prediction', 'You will receive good news next week.']
	])('rejects %s surface text', (_label, text) => {
		expect(surfaceTextIssues(text).length).toBeGreaterThan(0);
		expect(() => makeSurfaceText(text)).toThrow(/Unsafe surface text/);
	});

	it('enforces the ordinary and reviewed-rainbow length ceilings', () => {
		const twentyThreeWords = `You ${Array.from({ length: 22 }, (_, index) => `word${index}`).join(' ')}.`;
		const twentyFiveWords = `You ${Array.from({ length: 24 }, (_, index) => `term${index}`).join(' ')}.`;
		expect(surfaceTextIssues(twentyThreeWords)).toContain('surface text exceeds 22 words');
		expect(surfaceTextIssues(twentyFiveWords, { allowReviewedRainbowLength: true })).toContain(
			'surface text exceeds 24 words'
		);
	});
});
