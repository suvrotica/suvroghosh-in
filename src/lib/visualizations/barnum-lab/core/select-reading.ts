import { CORPUS_MANIFEST_HASH } from '../data/corpus-manifest';
import { directEchoFor } from '../data/direct-echoes.en';
import { compileCandidates, surfaceSentenceToCandidate } from './compile-candidates';
import { createReplayCode, deterministicShuffle, rngFor } from './seeded-rng';
import { candidateConflictsWithStatements } from './statement-compatibility';
import { makeSurfaceText } from './surface-text';
import { contentWordOverlap, SIMILARITY_THRESHOLDS, trigramJaccard } from './text-similarity';
import { CORPUS_VERSION, ENGINE_VERSION } from './version';
import type {
	Candidate,
	GeneratedStatement,
	GenerationProfile,
	Mechanism,
	ScoreBreakdown,
	SealedDeck,
	SurfaceOpener
} from './types';
import type { SelfReportQuestionId } from './question-types';

export interface GenerateReadingOptions {
	count?: number;
	slotPrefix?: string;
	seedKey?: string;
	oppositePairs?: boolean;
	breadth?: 'very-broad' | 'broad' | 'moderate' | 'any';
}

/** Canonical seed namespace for a replayable v2 generic deck. */
export const SEALED_GENERIC_DECK_SEED_KEY = 'sealed-generic-deck-v2';

const LEGACY_SEALED_GENERIC_DECK_SEED_KEY = 'sealed-generic-deck';

function canonicalGenerationSeedKey(seedKey: string | undefined): string | undefined {
	// The first production counterfactual adapter omitted the v2 suffix. Treat that spelling as
	// an alias so a presentation-only counterfactual cannot silently select a different deck.
	return seedKey === LEGACY_SEALED_GENERIC_DECK_SEED_KEY ? SEALED_GENERIC_DECK_SEED_KEY : seedKey;
}

/** Release-test bounds for deterministic samples of at least 10,000 seven-card readings. */
export const SELECTION_DISTRIBUTION_TOLERANCES = Object.freeze({
	minimumAxisShare: 0.02,
	maximumAxisShare: 0.09,
	minimumPrimaryTechniqueShare: 0.04,
	maximumPrimaryTechniqueShare: 0.31,
	minimumSpecialFamilyShare: 0.02,
	maximumSpecialFamilyShare: 0.2
});

const ZERO_SCORE: ScoreBreakdown = Object.freeze({
	editorialBreadthPreference: 1,
	stageCompatibility: 1,
	axisNovelty: 1,
	techniqueNovelty: 1,
	directEchoEligibility: 0,
	lexicalPenalty: 0,
	semanticPenalty: 0,
	deterministicJitter: 0,
	total: 4
});

export function compareCandidateRank(
	left: { candidate: Pick<Candidate, 'id'>; score: Pick<ScoreBreakdown, 'total'> },
	right: { candidate: Pick<Candidate, 'id'>; score: Pick<ScoreBreakdown, 'total'> }
): number {
	const leftTotal = Number.isFinite(left.score.total) ? left.score.total : Number.NEGATIVE_INFINITY;
	const rightTotal = Number.isFinite(right.score.total)
		? right.score.total
		: Number.NEGATIVE_INFINITY;
	return rightTotal - leftTotal || left.candidate.id.localeCompare(right.candidate.id);
}

export function candidateToGeneratedStatement(
	candidate: Candidate,
	slotId: string,
	seedKey: string,
	score: ScoreBreakdown,
	sealed = true
): GeneratedStatement {
	const coreId = `${slotId}:${candidate.id}`;
	const influence = { kind: 'sealed-selection' as const, slotId };
	const channel = candidate.channel ?? 'surface-reading';
	const text = makeSurfaceText(candidate.text, {
		allowReviewedRainbowLength: candidate.mechanisms?.includes('rainbow-pair')
	});
	const statement: GeneratedStatement = {
		statementId: coreId,
		coreId,
		slotId,
		channel,
		text,
		renderedSegments: candidate.renderedSegments.map((segment) => ({
			...segment,
			selectionInfluences: [influence]
		})),
		trace: {
			statementId: coreId,
			channel,
			corpusVersion: CORPUS_VERSION,
			corpusManifestHash: CORPUS_MANIFEST_HASH,
			engineVersion: ENGINE_VERSION,
			frameId: candidate.frameId,
			fragmentIds: candidate.fragmentIds,
			semanticKeys: candidate.semanticKeys,
			semanticFamilyIds: candidate.semanticFamilyIds ?? candidate.semanticKeys,
			axes: candidate.axes,
			poles: candidate.poles,
			techniques: candidate.techniques,
			mechanisms: candidate.mechanisms ?? ['broad-common-experience'],
			claimBasis: candidate.claimBasis,
			selectionInfluences: [influence],
			seedKey,
			score
		},
		version: {
			versionId: `${coreId}:v2`,
			coreId,
			transformation: { kind: 'sealed' as const }
		},
		sealed
	};
	return Object.freeze(statement);
}

function mechanismOf(candidate: Candidate): Mechanism {
	return candidate.mechanisms?.[0] ?? 'broad-common-experience';
}

function openerOf(candidate: Candidate): SurfaceOpener {
	return candidate.opener ?? 'you';
}

export function selectionStrataForSeed(seed: string, seedKey: string): readonly Mechanism[] {
	const special =
		rngFor(seed, seedKey, 'special-stratum')() < 0.5 ? 'flattering-ambiguity' : 'unused-potential';
	return [
		'broad-common-experience',
		'broad-common-experience',
		'rainbow-pair',
		special,
		'guarded-vulnerability',
		'redeemable-flaw',
		'conditional-escape'
	];
}

export interface SelectReadingFromCandidatesOptions {
	count: number;
	seedKey?: string;
	slotPrefix?: string;
}

export function selectReadingFromCandidates(
	profile: GenerationProfile,
	pool: readonly Candidate[],
	options: SelectReadingFromCandidatesOptions
): readonly GeneratedStatement[] {
	const count = Number.isFinite(options.count)
		? Math.max(0, Math.min(15, Math.trunc(options.count)))
		: 0;
	const seedKey = options.seedKey ?? 'candidate-selection-v2';
	const slotPrefix = options.slotPrefix ?? 'generic';
	const strata = selectionStrataForSeed(profile.sessionSeed, seedKey);
	const selected: Candidate[] = [];
	const scores: ScoreBreakdown[] = [];
	const usedFamilies = new Set<string>();
	const usedAxes = new Set<string>();
	const openerCounts = new Map<SurfaceOpener, number>();

	for (let slot = 0; slot < count; slot += 1) {
		const requested = strata[slot % strata.length];
		const ordered = deterministicShuffle(
			pool.filter((candidate) => mechanismOf(candidate) === requested),
			profile.sessionSeed,
			seedKey,
			String(slot),
			requested
		);
		const compatible = (candidate: Candidate, requireNewAxis: boolean): boolean => {
			const families = candidate.semanticFamilyIds ?? candidate.semanticKeys;
			if (families.some((family) => usedFamilies.has(family))) return false;
			if (selected.some((item) => item.id === candidate.id || item.text === candidate.text))
				return false;
			if (
				selected.some(
					(item) =>
						trigramJaccard(item.text, candidate.text) > SIMILARITY_THRESHOLDS.trigramJaccard ||
						contentWordOverlap(item.text, candidate.text) > SIMILARITY_THRESHOLDS.contentWordOverlap
				)
			) {
				return false;
			}
			if ((openerCounts.get(openerOf(candidate)) ?? 0) >= 2) return false;
			if (requireNewAxis && candidate.axes.some((axis) => usedAxes.has(axis))) return false;
			return true;
		};
		let chosen =
			ordered.find((candidate) => compatible(candidate, true)) ??
			ordered.find((candidate) => compatible(candidate, false));
		if (!chosen) {
			const fallback = deterministicShuffle(
				pool,
				profile.sessionSeed,
				seedKey,
				String(slot),
				'fallback'
			);
			chosen =
				fallback.find((candidate) => compatible(candidate, true)) ??
				fallback.find((candidate) => compatible(candidate, false));
		}
		if (!chosen) {
			throw new Error(`The approved v2 corpus could not fill ${requested} slot ${slot + 1}.`);
		}
		selected.push(chosen);
		const hasNewAxis = chosen.axes.some((axis) => !usedAxes.has(axis));
		for (const family of chosen.semanticFamilyIds ?? chosen.semanticKeys) usedFamilies.add(family);
		for (const axis of chosen.axes) usedAxes.add(axis);
		const opener = openerOf(chosen);
		openerCounts.set(opener, (openerCounts.get(opener) ?? 0) + 1);
		const jitter = rngFor(profile.sessionSeed, seedKey, chosen.id, 'score')() * 0.25;
		scores.push({
			...ZERO_SCORE,
			axisNovelty: hasNewAxis ? 1 : 0,
			deterministicJitter: jitter,
			total: ZERO_SCORE.total + jitter
		});
	}

	return selected.map((candidate, index) =>
		candidateToGeneratedStatement(candidate, `${slotPrefix}-${index + 1}`, seedKey, scores[index])
	);
}

export function generateReading(
	profile: GenerationProfile,
	options: GenerateReadingOptions = {}
): readonly GeneratedStatement[] {
	const seedKey = canonicalGenerationSeedKey(options.seedKey);
	const requestedCount = options.count ?? 7;
	const count = Number.isFinite(requestedCount)
		? Math.max(0, Math.min(15, Math.trunc(requestedCount)))
		: 0;
	let pool = compileCandidates(profile, {
		claimBasis: 'unsupported-generic',
		seedKey: seedKey ?? 'generic-candidates-v2'
	});
	if (options.oppositePairs === false) {
		pool = pool.filter((candidate) => mechanismOf(candidate) !== 'rainbow-pair');
	}
	if (options.breadth && options.breadth !== 'any') {
		const requestedBreadth = options.breadth === 'very-broad' ? 'broad' : options.breadth;
		pool = pool.filter((candidate) => candidate.breadth === requestedBreadth);
	}
	return selectReadingFromCandidates(profile, pool, {
		count,
		seedKey: seedKey ?? 'generic-deck-v2',
		slotPrefix: options.slotPrefix ?? 'generic'
	});
}

export function sealGenericDeck(profile: GenerationProfile, count = 7): SealedDeck {
	const expected = Math.max(0, Math.min(15, Math.trunc(count)));
	const genericStatements = generateReading(profile, {
		count: expected,
		slotPrefix: 'generic',
		seedKey: SEALED_GENERIC_DECK_SEED_KEY
	});
	if (genericStatements.length !== expected) {
		throw new Error('The approved corpus could not satisfy the requested sealed deck.');
	}
	return Object.freeze({
		sessionSeed: profile.sessionSeed,
		replayCode: createReplayCode(profile.sessionSeed, CORPUS_MANIFEST_HASH),
		corpusVersion: CORPUS_VERSION,
		corpusManifestHash: CORPUS_MANIFEST_HASH,
		engineVersion: ENGINE_VERSION,
		genericStatements,
		sealedStatements: genericStatements.map((statement) => ({
			coreId: statement.coreId,
			slotId: statement.slotId,
			frameId: statement.trace.frameId,
			fragmentIds: statement.trace.fragmentIds,
			semanticIds: statement.trace.semanticFamilyIds
		})),
		reservedEchoSlotId: 'echo-1',
		reservedFeedbackSlotIds: ['feedback-1', 'feedback-2'] as const
	});
}

export function generateDirectEcho(
	profile: GenerationProfile,
	questionId?: SelfReportQuestionId,
	sealedStatements: readonly GeneratedStatement[] = []
): GeneratedStatement | undefined {
	const selectedQuestion =
		questionId ?? (Object.keys(profile.selfReports).sort()[0] as SelfReportQuestionId);
	if (!selectedQuestion) return undefined;
	const optionId = profile.selfReports[selectedQuestion];
	if (!optionId || !directEchoIsCompatible(selectedQuestion, optionId, sealedStatements)) {
		return undefined;
	}
	const sentence = directEchoFor(selectedQuestion, optionId);
	if (!sentence) return undefined;
	const candidate = surfaceSentenceToCandidate(sentence);
	const statement = candidateToGeneratedStatement(
		candidate,
		'echo-1',
		`direct-echo:${selectedQuestion}`,
		{ ...ZERO_SCORE, directEchoEligibility: 1, total: 5 },
		false
	);
	return Object.freeze({
		...statement,
		channel: 'direct-echo' as const,
		trace: { ...statement.trace, channel: 'direct-echo' as const },
		version: {
			versionId: `${statement.coreId}:echo:v2`,
			coreId: statement.coreId,
			transformation: { kind: 'direct-echo-added' as const, questionId: selectedQuestion }
		}
	});
}

export function directEchoIsCompatible(
	questionId: SelfReportQuestionId,
	optionId: string,
	sealedStatements: readonly GeneratedStatement[]
): boolean {
	const echo = directEchoFor(questionId, optionId);
	if (!echo) return false;
	return !candidateConflictsWithStatements(surfaceSentenceToCandidate(echo), sealedStatements);
}
