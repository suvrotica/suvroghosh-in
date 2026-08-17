import { describe, expect, it } from 'vitest';
import surfaceAudit from '../data/surface-audit.v2.json';
import { DIRECT_ECHO_SENTENCES_EN } from '../data/direct-echoes.en';
import { SURFACE_SENTENCES_EN } from '../data/surface-sentences.en.generated';
import { deriveFromFeedback } from './adapt-feedback';
import { applyDemographicCounterfactual, canonicalSemanticManifest } from './counterfactual';
import { createDefaultDisplayProfile, setAnswer, toGenerationProfile } from './input-boundary';
import { generateDirectEcho, generateReading } from './select-reading';
import { surfaceTextIssues } from './surface-text';
import { contentWordOverlap, SIMILARITY_THRESHOLDS, trigramJaccard } from './text-similarity';

const stressIt = process.env.BARNUM_STRESS === '1' ? it : it.skip;
const SESSION_COUNT = 15_000;
const STATEMENTS_PER_SESSION = 7;

describe('Barnum v2 100,000-statement release stress', () => {
	stressIt(
		'holds surface, diversity, replay, counterfactual, echo, and feedback invariants',
		() => {
			const defaultDisplay = createDefaultDisplayProfile();
			const counterfactualDisplay = applyDemographicCounterfactual(defaultDisplay);
			const sentenceById = new Map(SURFACE_SENTENCES_EN.map((sentence) => [sentence.id, sentence]));
			const usage = new Map<string, number>();
			const representativeUsage = new Set<string>();
			let generatedStatementCount = 0;
			let lintFailureCount = 0;
			let emptyDeckCount = 0;
			let familyCollisionCount = 0;
			let openerViolationCount = 0;
			let nearDuplicateCount = 0;
			let rainbowFamilyFailureCount = 0;
			let replayMismatchCount = 0;
			let demographicMismatchCount = 0;
			let feedbackFailureCount = 0;

			for (let index = 0; index < SESSION_COUNT; index += 1) {
				const seed = index.toString(16).padStart(16, '0');
				const profile = toGenerationProfile(defaultDisplay, seed);
				const counterfactualProfile = toGenerationProfile(counterfactualDisplay, seed);
				if (JSON.stringify(counterfactualProfile) !== JSON.stringify(profile)) {
					demographicMismatchCount += 1;
				}
				const deck = generateReading(profile, {
					count: STATEMENTS_PER_SESSION,
					seedKey: 'one-hundred-thousand-v2'
				});
				generatedStatementCount += deck.length;
				if (deck.length !== STATEMENTS_PER_SESSION) emptyDeckCount += 1;
				const families = deck.flatMap((statement) => statement.trace.semanticFamilyIds);
				if (new Set(families).size !== STATEMENTS_PER_SESSION) familyCollisionCount += 1;
				const openerCounts = new Map<string, number>();

				for (const statement of deck) {
					const sentence = sentenceById.get(statement.trace.fragmentIds[0]);
					if (!sentence) {
						lintFailureCount += 1;
						continue;
					}
					usage.set(sentence.id, (usage.get(sentence.id) ?? 0) + 1);
					if (index < 1_000) representativeUsage.add(sentence.id);
					openerCounts.set(sentence.opener, (openerCounts.get(sentence.opener) ?? 0) + 1);
					lintFailureCount += surfaceTextIssues(statement.text, {
						allowReviewedRainbowLength: sentence.mechanism === 'rainbow-pair'
					}).length;
					if (
						statement.channel !== 'surface-reading' ||
						statement.trace.channel !== 'surface-reading' ||
						statement.trace.axes.length !== 1
					) {
						lintFailureCount += 1;
					}
					if (
						sentence.mechanism === 'rainbow-pair' &&
						sentence.rainbowCompatibilityFamilyId !== sentence.semanticFamilyId
					) {
						rainbowFamilyFailureCount += 1;
					}
				}
				if ([...openerCounts.values()].some((count) => count > 2)) {
					openerViolationCount += 1;
				}
				for (let left = 0; left < deck.length; left += 1) {
					for (let right = left + 1; right < deck.length; right += 1) {
						if (
							trigramJaccard(deck[left].text, deck[right].text) >
								SIMILARITY_THRESHOLDS.trigramJaccard ||
							contentWordOverlap(deck[left].text, deck[right].text) >
								SIMILARITY_THRESHOLDS.contentWordOverlap
						) {
							nearDuplicateCount += 1;
						}
					}
				}

				if (index % 100 === 0) {
					const replay = generateReading(profile, {
						count: STATEMENTS_PER_SESSION,
						seedKey: 'one-hundred-thousand-v2'
					});
					const changed = generateReading(counterfactualProfile, {
						count: STATEMENTS_PER_SESSION,
						seedKey: 'one-hundred-thousand-v2'
					});
					generatedStatementCount += replay.length + changed.length;
					if (canonicalSemanticManifest(replay) !== canonicalSemanticManifest(deck)) {
						replayMismatchCount += 1;
					}
					if (canonicalSemanticManifest(changed) !== canonicalSemanticManifest(deck)) {
						demographicMismatchCount += 1;
					}
				}

				if (index < 1_000) {
					const sourceSnapshot = JSON.stringify(deck);
					const ratings = deck.slice(0, 2).map((statement, ratingIndex) => ({
						statementId: statement.statementId,
						rating: ratingIndex === 0 ? ('fits' as const) : ('partly-fits' as const),
						eventId: `${seed}:rating:${ratingIndex}`
					}));
					const ratingSnapshot = JSON.stringify(ratings);
					const derivatives = deriveFromFeedback(deck, ratings, profile, 2);
					for (const derivative of derivatives) {
						const source = deck.find(
							(statement) =>
								statement.statementId === derivative.trace.feedbackProvenance?.sourceStatementId
						);
						if (
							!source ||
							derivative.trace.semanticFamilyIds[0] !== source.trace.semanticFamilyIds[0]
						) {
							feedbackFailureCount += 1;
						}
					}
					if (
						JSON.stringify(deck) !== sourceSnapshot ||
						JSON.stringify(ratings) !== ratingSnapshot
					) {
						feedbackFailureCount += 1;
					}
				}
			}

			for (const echoSentence of DIRECT_ECHO_SENTENCES_EN) {
				if (echoSentence.claimBasis.kind !== 'direct-echo') {
					lintFailureCount += 1;
					continue;
				}
				const display = setAnswer(
					defaultDisplay,
					echoSentence.claimBasis.questionId,
					echoSentence.claimBasis.optionId
				);
				if (!display) {
					lintFailureCount += 1;
					continue;
				}
				const echo = generateDirectEcho(
					toGenerationProfile(display, 'eeeeeeeeeeeeeeee'),
					echoSentence.claimBasis.questionId
				);
				if (
					!echo ||
					echo.text !== echoSentence.text ||
					echo.trace.fragmentIds[0] !== echoSentence.id
				) {
					lintFailureCount += 1;
				}
			}

			const totalPrimaryStatements = SESSION_COUNT * STATEMENTS_PER_SESSION;
			const maximumLineShare = Math.max(...usage.values()) / totalPrimaryStatements;
			expect({
				generatedStatementCount: generatedStatementCount >= 100_000,
				lintFailureCount,
				emptyDeckCount,
				familyCollisionCount,
				openerViolationCount,
				nearDuplicateCount,
				rainbowFamilyFailureCount,
				replayMismatchCount,
				demographicMismatchCount,
				feedbackFailureCount,
				representativeUniqueGate: representativeUsage.size >= 600,
				frequencyGate: maximumLineShare <= 0.02
			}).toEqual({
				generatedStatementCount: true,
				lintFailureCount: 0,
				emptyDeckCount: 0,
				familyCollisionCount: 0,
				openerViolationCount: 0,
				nearDuplicateCount: 0,
				rainbowFamilyFailureCount: 0,
				replayMismatchCount: 0,
				demographicMismatchCount: 0,
				feedbackFailureCount: 0,
				representativeUniqueGate: true,
				frequencyGate: true
			});

			expect(surfaceAudit.representativeSampling).toMatchObject({
				sessionCount: 1_000,
				minimumUniqueRenderedLineGate: 600,
				maximumSingleLineShareGate: 0.02
			});
			expect(surfaceAudit.representativeSampling).toHaveProperty('countsByAxis');
			expect(surfaceAudit.representativeSampling).toHaveProperty('countsByPole');
			expect(surfaceAudit.representativeSampling).toHaveProperty('countsByMechanism');
			expect(surfaceAudit.representativeSampling).toHaveProperty('unreachableContentIds');
			expect(surfaceAudit.representativeSampling).toHaveProperty('top50Lines');
			expect(surfaceAudit.representativeSampling).toHaveProperty('collisions');
		},
		1_800_000
	);
});
