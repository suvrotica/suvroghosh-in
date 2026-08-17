import { CORPUS_MANIFEST_HASH } from '../data/corpus-manifest';
import { DIRECT_ECHO_SENTENCES_EN } from '../data/direct-echoes.en';
import {
	FEEDBACK_SENTENCES_EN,
	SURFACE_SENTENCES_EN,
	SURFACE_SENTENCE_BANK_SHA256
} from '../data/surface-sentences.en.generated';
import { createDefaultDisplayProfile, toGenerationProfile } from './input-boundary';
import { generateReading } from './select-reading';
import { contentWordOverlap, SIMILARITY_THRESHOLDS, trigramJaccard } from './text-similarity';
import { auditBarnumCorpus, type CorpusValidationIssue } from './corpus-validation';
import { surfaceWordCount } from './surface-text';
import { CORPUS_VERSION, ENGINE_VERSION } from './version';
import type { GeneratedStatement, Mechanism, SurfaceSentence } from './types';

export const READABILITY_TARGETS = Object.freeze({
	minimumFleschReadingEase: 70,
	maximumFleschKincaidGrade: 8
});

const SYLLABLE_EXCEPTIONS: Readonly<Record<string, number>> = Object.freeze({
	another: 3,
	comfortable: 4,
	every: 2,
	everyone: 3,
	familiar: 3,
	people: 2,
	quiet: 2,
	real: 1,
	really: 2,
	several: 3,
	sometimes: 2,
	together: 3,
	usually: 4
});

export interface SurfaceReadability {
	wordCount: number;
	syllableCount: number;
	fleschReadingEase: number;
	fleschKincaidGrade: number;
	passesTargets: boolean;
}

export interface ReadabilityFailure extends SurfaceReadability {
	id: string;
	text: string;
	channel: string;
	mechanism: Mechanism;
	violations: readonly string[];
}

export interface SurfaceUsageEntry {
	id: string;
	text: string;
	semanticFamilyId: string;
	mechanism: Mechanism;
	axis: string;
	pole: string;
	count: number;
	share: number;
}

export interface SurfaceAuditReport {
	schemaVersion: 'barnum-surface-audit-v2';
	corpusVersion: string;
	engineVersion: string;
	corpusManifestHash: string;
	surfaceSentenceBankSha256: string;
	staticCorpus: ReturnType<typeof auditBarnumCorpus>;
	representativeSampling: {
		sessionCount: number;
		statementsPerSession: 7;
		statementCount: number;
		uniqueRenderedLineCount: number;
		uniqueSemanticFamilyCount: number;
		minimumUniqueRenderedLineGate: 600;
		maximumSingleLineShareGate: 0.02;
		maximumSingleLineShare: number;
		utilization: number;
		unreachableContentIds: readonly string[];
		top50Lines: readonly SurfaceUsageEntry[];
		countsByAxis: Record<string, number>;
		countsByPole: Record<string, number>;
		countsByMechanism: Record<string, number>;
		countsByOpener: Record<string, number>;
		collisions: {
			emptyDeckCount: number;
			duplicateIdPairCount: number;
			duplicateFamilyPairCount: number;
			nearDuplicatePairCount: number;
			openerLimitViolationCount: number;
			crossAxisRainbowCount: number;
			examples: readonly string[];
		};
		sampleDecks: readonly {
			seed: string;
			lines: readonly {
				id: string;
				text: string;
				semanticFamilyId: string;
				mechanism: Mechanism;
				axis: string;
				pole: string;
			}[];
		}[];
	};
	readability: {
		targets: typeof READABILITY_TARGETS;
		lineCount: number;
		passingLineCount: number;
		exceptionCount: number;
		meanFleschReadingEase: number;
		meanFleschKincaidGrade: number;
		exceptions: readonly ReadabilityFailure[];
	};
	hardFailures: readonly CorpusValidationIssue[];
}

function round(value: number, digits = 4): number {
	const factor = 10 ** digits;
	return Math.round((value + Number.EPSILON) * factor) / factor;
}

function wordSyllables(rawWord: string): number {
	const word = rawWord
		.toLowerCase()
		.replace(/['’]s$/u, '')
		.replace(/[^a-z]/gu, '');
	if (!word) return 0;
	const exception = SYLLABLE_EXCEPTIONS[word];
	if (exception) return exception;
	if (word.length <= 3) return 1;
	let normalized = word;
	if (/[^le]e$/u.test(normalized)) normalized = normalized.slice(0, -1);
	if (/[^aeiou]ed$/u.test(normalized)) normalized = normalized.slice(0, -2);
	const groups = normalized.match(/[aeiouy]+/gu)?.length ?? 1;
	return Math.max(1, groups);
}

export function surfaceReadability(text: string): SurfaceReadability {
	const words = text.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/gu) ?? [];
	const wordCount = surfaceWordCount(text);
	const syllableCount = words.reduce((total, word) => total + wordSyllables(word), 0);
	const syllablesPerWord = wordCount === 0 ? 0 : syllableCount / wordCount;
	const fleschReadingEase = round(206.835 - 1.015 * wordCount - 84.6 * syllablesPerWord, 2);
	const fleschKincaidGrade = round(0.39 * wordCount + 11.8 * syllablesPerWord - 15.59, 2);
	return {
		wordCount,
		syllableCount,
		fleschReadingEase,
		fleschKincaidGrade,
		passesTargets:
			fleschReadingEase >= READABILITY_TARGETS.minimumFleschReadingEase &&
			fleschKincaidGrade <= READABILITY_TARGETS.maximumFleschKincaidGrade
	};
}

function increment(record: Record<string, number>, key: string): void {
	record[key] = (record[key] ?? 0) + 1;
}

function sortedRecord(record: Record<string, number>): Record<string, number> {
	return Object.fromEntries(
		Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
	);
}

function sentenceFor(statement: GeneratedStatement, byId: ReadonlyMap<string, SurfaceSentence>) {
	return byId.get(statement.trace.fragmentIds[0]);
}

export function buildSurfaceAudit(representativeSessionCount = 1_000): SurfaceAuditReport {
	const sessionCount = Math.max(1, Math.trunc(representativeSessionCount));
	const surfaceById = new Map(SURFACE_SENTENCES_EN.map((sentence) => [sentence.id, sentence]));
	const usage = new Map<string, number>();
	const countsByAxis: Record<string, number> = {};
	const countsByPole: Record<string, number> = {};
	const countsByMechanism: Record<string, number> = {};
	const countsByOpener: Record<string, number> = {};
	const samples: SurfaceAuditReport['representativeSampling']['sampleDecks'][number][] = [];
	const collisionExamples: string[] = [];
	let emptyDeckCount = 0;
	let duplicateIdPairCount = 0;
	let duplicateFamilyPairCount = 0;
	let nearDuplicatePairCount = 0;
	let openerLimitViolationCount = 0;
	let crossAxisRainbowCount = 0;

	for (let index = 0; index < sessionCount; index += 1) {
		const seed = index.toString(16).padStart(16, '0');
		const profile = toGenerationProfile(createDefaultDisplayProfile(), seed);
		const deck = generateReading(profile, { count: 7, seedKey: 'surface-audit-v2' });
		if (deck.length !== 7) emptyDeckCount += 1;
		const openerCounts = new Map<string, number>();

		for (const statement of deck) {
			const sentence = sentenceFor(statement, surfaceById);
			if (!sentence) {
				if (collisionExamples.length < 50) {
					collisionExamples.push(
						`${seed}: missing surface record ${statement.trace.fragmentIds[0]}`
					);
				}
				continue;
			}
			usage.set(sentence.id, (usage.get(sentence.id) ?? 0) + 1);
			increment(countsByAxis, sentence.axis);
			increment(countsByPole, `${sentence.axis}:${sentence.pole}`);
			increment(countsByMechanism, sentence.mechanism);
			increment(countsByOpener, sentence.opener);
			openerCounts.set(sentence.opener, (openerCounts.get(sentence.opener) ?? 0) + 1);
			if (
				sentence.mechanism === 'rainbow-pair' &&
				sentence.rainbowCompatibilityFamilyId !== sentence.semanticFamilyId
			) {
				crossAxisRainbowCount += 1;
			}
		}

		if ([...openerCounts.values()].some((count) => count > 2)) {
			openerLimitViolationCount += 1;
			if (collisionExamples.length < 50) collisionExamples.push(`${seed}: opener limit exceeded`);
		}
		for (let left = 0; left < deck.length; left += 1) {
			for (let right = left + 1; right < deck.length; right += 1) {
				const first = deck[left];
				const second = deck[right];
				if (first.trace.fragmentIds[0] === second.trace.fragmentIds[0]) duplicateIdPairCount += 1;
				if (
					first.trace.semanticFamilyIds.some((family) =>
						second.trace.semanticFamilyIds.includes(family)
					)
				) {
					duplicateFamilyPairCount += 1;
				}
				if (
					trigramJaccard(first.text, second.text) > SIMILARITY_THRESHOLDS.trigramJaccard ||
					contentWordOverlap(first.text, second.text) > SIMILARITY_THRESHOLDS.contentWordOverlap
				) {
					nearDuplicatePairCount += 1;
					if (collisionExamples.length < 50) {
						collisionExamples.push(
							`${seed}: near duplicate ${first.trace.fragmentIds[0]} / ${second.trace.fragmentIds[0]}`
						);
					}
				}
			}
		}

		if ([0, 1, 2, 99, sessionCount - 1].includes(index)) {
			samples.push({
				seed,
				lines: deck.flatMap((statement) => {
					const sentence = sentenceFor(statement, surfaceById);
					return sentence
						? [
								{
									id: sentence.id,
									text: sentence.text,
									semanticFamilyId: sentence.semanticFamilyId,
									mechanism: sentence.mechanism,
									axis: sentence.axis,
									pole: sentence.pole
								}
							]
						: [];
				})
			});
		}
	}

	const statementCount = sessionCount * 7;
	const top50Lines = [...usage.entries()]
		.map(([id, count]): SurfaceUsageEntry => {
			const sentence = surfaceById.get(id)!;
			return {
				id,
				text: sentence.text,
				semanticFamilyId: sentence.semanticFamilyId,
				mechanism: sentence.mechanism,
				axis: sentence.axis,
				pole: sentence.pole,
				count,
				share: round(count / statementCount, 6)
			};
		})
		.sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))
		.slice(0, 50);
	const allSurface = [
		...SURFACE_SENTENCES_EN,
		...FEEDBACK_SENTENCES_EN,
		...DIRECT_ECHO_SENTENCES_EN
	];
	const readabilityEntries = allSurface.map((sentence) => ({
		sentence,
		result: surfaceReadability(sentence.text)
	}));
	const readabilityExceptions: ReadabilityFailure[] = readabilityEntries.flatMap(
		({ sentence, result }) => {
			if (result.passesTargets) return [];
			const violations: string[] = [];
			if (result.fleschReadingEase < READABILITY_TARGETS.minimumFleschReadingEase) {
				violations.push('Flesch Reading Ease below 70');
			}
			if (result.fleschKincaidGrade > READABILITY_TARGETS.maximumFleschKincaidGrade) {
				violations.push('Flesch-Kincaid grade above 8');
			}
			return [
				{
					id: sentence.id,
					text: sentence.text,
					channel: sentence.channel,
					mechanism: sentence.mechanism,
					...result,
					violations
				}
			];
		}
	);
	const staticCorpus = auditBarnumCorpus();

	return {
		schemaVersion: 'barnum-surface-audit-v2',
		corpusVersion: CORPUS_VERSION,
		engineVersion: ENGINE_VERSION,
		corpusManifestHash: CORPUS_MANIFEST_HASH,
		surfaceSentenceBankSha256: SURFACE_SENTENCE_BANK_SHA256,
		staticCorpus,
		representativeSampling: {
			sessionCount,
			statementsPerSession: 7,
			statementCount,
			uniqueRenderedLineCount: usage.size,
			uniqueSemanticFamilyCount: new Set(
				[...usage.keys()].map((id) => surfaceById.get(id)!.semanticFamilyId)
			).size,
			minimumUniqueRenderedLineGate: 600,
			maximumSingleLineShareGate: 0.02,
			maximumSingleLineShare: top50Lines[0]?.share ?? 0,
			utilization: round(usage.size / SURFACE_SENTENCES_EN.length, 6),
			unreachableContentIds: SURFACE_SENTENCES_EN.filter((sentence) => !usage.has(sentence.id))
				.map((sentence) => sentence.id)
				.sort(),
			top50Lines,
			countsByAxis: sortedRecord(countsByAxis),
			countsByPole: sortedRecord(countsByPole),
			countsByMechanism: sortedRecord(countsByMechanism),
			countsByOpener: sortedRecord(countsByOpener),
			collisions: {
				emptyDeckCount,
				duplicateIdPairCount,
				duplicateFamilyPairCount,
				nearDuplicatePairCount,
				openerLimitViolationCount,
				crossAxisRainbowCount,
				examples: collisionExamples
			},
			sampleDecks: samples
		},
		readability: {
			targets: READABILITY_TARGETS,
			lineCount: readabilityEntries.length,
			passingLineCount: readabilityEntries.length - readabilityExceptions.length,
			exceptionCount: readabilityExceptions.length,
			meanFleschReadingEase: round(
				readabilityEntries.reduce((total, entry) => total + entry.result.fleschReadingEase, 0) /
					readabilityEntries.length,
				2
			),
			meanFleschKincaidGrade: round(
				readabilityEntries.reduce((total, entry) => total + entry.result.fleschKincaidGrade, 0) /
					readabilityEntries.length,
				2
			),
			exceptions: readabilityExceptions
		},
		hardFailures: staticCorpus.failures
	};
}
