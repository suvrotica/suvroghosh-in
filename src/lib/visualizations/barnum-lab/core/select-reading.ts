import { CORPUS_MANIFEST_HASH } from '../data/corpus-manifest';
import { FRAGMENTS_EN } from '../data/fragments.en';
import { compileCandidates } from './compile-candidates';
import { createReplayCode, rngFor } from './seeded-rng';
import { candidateConflictsWithStatements } from './statement-compatibility';
import {
	contentWords,
	setJaccard,
	setOverlapBySmaller,
	SIMILARITY_THRESHOLDS,
	trigramSet
} from './text-similarity';
import { CORPUS_VERSION, ENGINE_VERSION } from './version';
import type {
	Candidate,
	CandidateEvaluation,
	GeneratedStatement,
	GenerationProfile,
	ScoreBreakdown,
	SealedDeck
} from './types';
import type { ContentAxis } from './types';
import type { SelfReportQuestionId } from './question-types';

export interface GenerateReadingOptions {
	count?: number;
	slotPrefix?: string;
	seedKey?: string;
	oppositePairs?: boolean;
	breadth?: 'very-broad' | 'broad' | 'moderate' | 'any';
}

/** Release-test bounds for deterministic samples of at least 10,000 seven-card readings. */
export const SELECTION_DISTRIBUTION_TOLERANCES = Object.freeze({
	minimumAxisShare: 0.004,
	maximumAxisShare: 0.16,
	minimumPrimaryTechniqueShare: 0.05,
	maximumPrimaryTechniqueShare: 0.35,
	minimumSpecialFamilyShare: 0.01,
	maximumSpecialFamilyShare: 0.12
});

let canonicalGenericPool: readonly Candidate[] | undefined;
interface CandidateFeatures {
	trigrams: ReadonlySet<string>;
	words: ReadonlySet<string>;
	leadIds: readonly string[];
	bridgeIds: readonly string[];
}

interface SelectionContext {
	usedSemanticKeys: ReadonlySet<string>;
	usedAxes: ReadonlySet<string>;
	usedTechniques: ReadonlySet<string>;
	recentPrimaryTechniques: ReadonlySet<string>;
	previousLeadIds: ReadonlySet<string>;
	leadUseCounts: ReadonlyMap<string, number>;
	recentBridgeIds: ReadonlySet<string>;
	selectedCandidates: readonly Candidate[];
	polesByAxis: ReadonlyMap<string, ReadonlySet<string>>;
	techniqueCounts: ReadonlyMap<string, number>;
}

const CANDIDATE_FEATURE_CACHE = new Map<string, CandidateFeatures>();
const PAIR_SIMILARITY_CACHE = new Map<string, readonly [number, number]>();

function featuresFor(candidate: Candidate): CandidateFeatures {
	const cached = CANDIDATE_FEATURE_CACHE.get(candidate.id);
	if (cached) return cached;
	const features = {
		trigrams: trigramSet(candidate.text),
		words: contentWords(candidate.text),
		leadIds: candidate.fragmentIds.filter((id) => id.startsWith('lead.')),
		bridgeIds: candidate.fragmentIds.filter((id) => id.startsWith('bridge.'))
	};
	CANDIDATE_FEATURE_CACHE.set(candidate.id, features);
	return features;
}

function selectionContext(selected: readonly Candidate[]): SelectionContext {
	const leadUseCounts = new Map<string, number>();
	const polesByAxis = new Map<string, Set<string>>();
	const techniqueCounts = new Map<string, number>();
	for (const id of selected.flatMap((item) => featuresFor(item).leadIds)) {
		leadUseCounts.set(id, (leadUseCounts.get(id) ?? 0) + 1);
	}
	for (const item of selected) {
		for (const { axis, pole } of item.poles) {
			const poles = polesByAxis.get(axis) ?? new Set<string>();
			poles.add(pole);
			polesByAxis.set(axis, poles);
		}
		for (const technique of item.techniques) {
			techniqueCounts.set(technique, (techniqueCounts.get(technique) ?? 0) + 1);
		}
	}
	return {
		usedSemanticKeys: new Set(selected.flatMap((item) => item.semanticKeys)),
		usedAxes: new Set(selected.flatMap((item) => item.axes)),
		usedTechniques: new Set(selected.flatMap((item) => item.techniques)),
		recentPrimaryTechniques: new Set(selected.slice(-3).map((item) => item.techniques[0])),
		previousLeadIds: new Set(selected.at(-1) ? featuresFor(selected.at(-1)!).leadIds : []),
		leadUseCounts,
		recentBridgeIds: new Set(selected.slice(-4).flatMap((item) => featuresFor(item).bridgeIds)),
		selectedCandidates: selected,
		polesByAxis,
		techniqueCounts
	};
}

function pairSimilarity(left: Candidate, right: Candidate): readonly [number, number] {
	const key = left.id < right.id ? left.id + '|' + right.id : right.id + '|' + left.id;
	const cached = PAIR_SIMILARITY_CACHE.get(key);
	if (cached) return cached;
	const leftFeatures = featuresFor(left);
	const rightFeatures = featuresFor(right);
	const result = [
		setJaccard(leftFeatures.trigrams, rightFeatures.trigrams),
		setOverlapBySmaller(leftFeatures.words, rightFeatures.words)
	] as const;
	PAIR_SIMILARITY_CACHE.set(key, result);
	return result;
}

function getCanonicalGenericPool(): readonly Candidate[] {
	canonicalGenericPool ??= compileCandidates(
		{ sessionSeed: 'c0ffee1234abcdef', selfReports: {} },
		{
			claimBasis: 'unsupported-generic',
			seedKey: 'canonical-generic-candidate-pool-v1',
			maxCandidates: 200,
			maxAttemptsPerFrame: 64
		}
	);
	return canonicalGenericPool;
}

function scoreCandidate(
	candidate: Candidate,
	context: SelectionContext,
	jitter: number,
	preferredSpecialTechnique?: 'flattering-ambiguity' | 'guarded-vulnerability'
): CandidateEvaluation {
	if (candidate.semanticKeys.some((key) => context.usedSemanticKeys.has(key))) {
		return { eligible: false, reason: 'duplicate' };
	}
	if (candidate.claimBasis.kind !== 'unsupported-generic') {
		return { eligible: false, reason: 'invalid-claim-basis' };
	}
	const similarities = context.selectedCandidates.map((selected) =>
		pairSimilarity(selected, candidate)
	);
	const maxTrigram = Math.max(0, ...similarities.map(([trigram]) => trigram));
	const maxContent = Math.max(0, ...similarities.map(([, content]) => content));
	const candidateFeatures = featuresFor(candidate);
	if (
		maxTrigram > SIMILARITY_THRESHOLDS.trigramJaccard ||
		maxContent > SIMILARITY_THRESHOLDS.contentWordOverlap
	) {
		return { eligible: false, reason: 'duplicate' };
	}
	const primaryTechnique = candidate.techniques[0];
	if (context.recentPrimaryTechniques.has(primaryTechnique)) {
		return { eligible: false, reason: 'incompatible' };
	}
	if (
		candidate.poles.some(({ axis, pole }) => {
			const existing = context.polesByAxis.get(axis);
			return Boolean(existing && [...existing].some((usedPole) => usedPole !== pole));
		})
	) {
		return { eligible: false, reason: 'incompatible' };
	}
	if (
		(candidate.techniques.includes('flattering-ambiguity') &&
			(context.techniqueCounts.get('flattering-ambiguity') ?? 0) >= 1) ||
		(candidate.techniques.includes('guarded-vulnerability') &&
			(context.techniqueCounts.get('guarded-vulnerability') ?? 0) >= 1)
	) {
		return { eligible: false, reason: 'incompatible' };
	}
	if (candidateFeatures.leadIds.some((id) => context.previousLeadIds.has(id))) {
		return { eligible: false, reason: 'incompatible' };
	}
	if (candidateFeatures.leadIds.some((id) => (context.leadUseCounts.get(id) ?? 0) >= 2)) {
		return { eligible: false, reason: 'incompatible' };
	}
	if (candidateFeatures.bridgeIds.some((id) => context.recentBridgeIds.has(id))) {
		return { eligible: false, reason: 'incompatible' };
	}
	const score: ScoreBreakdown = {
		editorialBreadthPreference:
			candidate.breadth === 'broad' ? 3 : candidate.breadth === 'very-broad' ? 2 : 1,
		stageCompatibility: candidate.techniques.includes('rainbow-pair') ? 2 : 3,
		axisNovelty: candidate.axes.some((axis) => !context.usedAxes.has(axis)) ? 4 : 0,
		techniqueNovelty:
			(candidate.techniques.some((technique) => !context.usedTechniques.has(technique)) ? 2 : 0) +
			(preferredSpecialTechnique &&
			candidate.techniques.includes(preferredSpecialTechnique) &&
			(context.techniqueCounts.get(preferredSpecialTechnique) ?? 0) === 0
				? 4
				: 0),
		directEchoEligibility: 0,
		lexicalPenalty: maxTrigram * 5,
		semanticPenalty: maxContent * 4,
		deterministicJitter: jitter,
		total: 0
	};
	score.total =
		score.editorialBreadthPreference +
		score.stageCompatibility +
		score.axisNovelty +
		score.techniqueNovelty +
		score.directEchoEligibility +
		score.deterministicJitter -
		score.lexicalPenalty -
		score.semanticPenalty;
	if (!Number.isFinite(score.total)) return { eligible: false, reason: 'incompatible' };
	return { eligible: true, score };
}

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
	const coreId = slotId + ':' + candidate.id;
	const influence = { kind: 'sealed-selection' as const, slotId };
	return {
		statementId: coreId,
		coreId,
		slotId,
		text: candidate.text,
		renderedSegments: candidate.renderedSegments.map((segment) => ({
			...segment,
			selectionInfluences: [influence]
		})),
		trace: {
			statementId: coreId,
			corpusVersion: CORPUS_VERSION,
			corpusManifestHash: CORPUS_MANIFEST_HASH,
			engineVersion: ENGINE_VERSION,
			frameId: candidate.frameId,
			fragmentIds: candidate.fragmentIds,
			semanticKeys: candidate.semanticKeys,
			techniques: candidate.techniques,
			claimBasis: candidate.claimBasis,
			selectionInfluences: [influence],
			seedKey,
			score
		},
		version: {
			versionId: coreId + ':v1',
			coreId,
			transformation: { kind: 'sealed' }
		},
		sealed
	};
}

export function generateReading(
	profile: GenerationProfile,
	options: GenerateReadingOptions = {}
): readonly GeneratedStatement[] {
	const requestedCount = options.count ?? 7;
	const count = Number.isFinite(requestedCount)
		? Math.max(0, Math.min(15, Math.trunc(requestedCount)))
		: 0;
	const seedKey = options.seedKey ?? 'generic-deck';
	const slotPrefix = options.slotPrefix ?? 'generic';
	let pool = getCanonicalGenericPool();
	if (options.oppositePairs === false) {
		pool = pool.filter((candidate) => !candidate.techniques.includes('rainbow-pair'));
	}
	if (options.breadth && options.breadth !== 'any') {
		pool = pool.filter((candidate) => candidate.breadth === options.breadth);
	}
	return selectReadingFromCandidates(profile, pool, { count, seedKey, slotPrefix });
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
	const seedKey = options.seedKey ?? 'candidate-selection';
	const slotPrefix = options.slotPrefix ?? 'generic';
	for (const candidate of pool) featuresFor(candidate);
	const jitter = new Map(
		pool.map((candidate) => [
			candidate.id,
			rngFor(profile.sessionSeed, seedKey, candidate.id, 'rank')() * 0.25
		])
	);
	const specialFamilyRoll = rngFor(profile.sessionSeed, seedKey, 'special-family-balance')();
	const preferredSpecialTechnique: 'flattering-ambiguity' | 'guarded-vulnerability' | undefined =
		specialFamilyRoll < 1 / 3
			? 'guarded-vulnerability'
			: specialFamilyRoll < 2 / 3
				? 'flattering-ambiguity'
				: undefined;
	const chosen: Candidate[] = [];
	const scores: ScoreBreakdown[] = [];
	while (chosen.length < count) {
		const context = selectionContext(chosen);
		let best: { candidate: Candidate; score: ScoreBreakdown } | undefined;
		for (const candidate of pool) {
			if (chosen.some((item) => item.id === candidate.id)) continue;
			const evaluation = scoreCandidate(
				candidate,
				context,
				jitter.get(candidate.id)!,
				preferredSpecialTechnique
			);
			if (!evaluation.eligible) continue;
			const ranked = { candidate, score: evaluation.score };
			if (!best || compareCandidateRank(ranked, best) < 0) {
				best = { candidate, score: evaluation.score };
			}
		}
		if (!best) break;
		chosen.push(best.candidate);
		scores.push(best.score);
	}
	return chosen.map((candidate, index) =>
		candidateToGeneratedStatement(candidate, slotPrefix + '-' + (index + 1), seedKey, scores[index])
	);
}

export function sealGenericDeck(profile: GenerationProfile, count = 7): SealedDeck {
	const genericStatements = generateReading(profile, {
		count,
		slotPrefix: 'generic',
		seedKey: 'sealed-generic-deck'
	});
	if (genericStatements.length !== Math.max(0, Math.min(15, Math.trunc(count)))) {
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
			semanticIds: statement.trace.semanticKeys
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
	const selectedQuestion = questionId ?? Object.keys(profile.selfReports).sort()[0];
	if (!selectedQuestion) return undefined;
	const optionId = profile.selfReports[selectedQuestion as keyof GenerationProfile['selfReports']];
	if (!optionId) return undefined;
	if (
		!directEchoIsCompatible(
			String(selectedQuestion) as SelfReportQuestionId,
			optionId,
			sealedStatements
		)
	) {
		return undefined;
	}
	const pool = compileCandidates(profile, {
		claimBasis: 'direct-echo',
		questionId: String(selectedQuestion),
		optionId,
		seedKey: 'direct-echo:' + String(selectedQuestion)
	}).filter((candidate) => !candidateConflictsWithStatements(candidate, sealedStatements));
	const candidate =
		pool[
			Math.floor(
				rngFor(profile.sessionSeed, 'direct-echo', String(selectedQuestion))() * pool.length
			)
		];
	if (!candidate) return undefined;
	const zeroScore: ScoreBreakdown = {
		editorialBreadthPreference: 0,
		stageCompatibility: 0,
		axisNovelty: 0,
		techniqueNovelty: 0,
		directEchoEligibility: 1,
		lexicalPenalty: 0,
		semanticPenalty: 0,
		deterministicJitter: 0,
		total: 1
	};
	const statement = candidateToGeneratedStatement(
		candidate,
		'echo-1',
		'direct-echo:' + String(selectedQuestion),
		zeroScore,
		false
	);
	return {
		...statement,
		version: {
			versionId: statement.coreId + ':v1',
			coreId: statement.coreId,
			transformation: {
				kind: 'direct-echo-added',
				questionId: selectedQuestion as keyof GenerationProfile['selfReports']
			}
		}
	};
}

const ECHO_AXIS_POLES: Readonly<
	Partial<
		Record<SelfReportQuestionId, Readonly<Record<string, { axis: ContentAxis; pole: string }>>>
	>
> = {
	planning_style: {
		'detailed-plan': { axis: 'structure-flexibility', pole: 'structure' },
		'loose-plan': { axis: 'structure-flexibility', pole: 'flexibility' },
		improvise: { axis: 'structure-flexibility', pole: 'flexibility' }
	},
	decision_pace: {
		'usually-deliberate': { axis: 'deliberation-spontaneity', pole: 'deliberation' },
		'usually-quick': { axis: 'deliberation-spontaneity', pole: 'spontaneity' }
	},
	novelty_preference: {
		'familiar-things': { axis: 'stability-change', pole: 'stability' },
		'new-things': { axis: 'stability-change', pole: 'change' }
	},
	social_recovery: {
		'time-alone': { axis: 'company-solitude', pole: 'solitude' },
		'one-to-one': { axis: 'company-solitude', pole: 'company' },
		'small-group': { axis: 'company-solitude', pole: 'company' }
	},
	focus_style: {
		'one-at-a-time': { axis: 'curiosity-focus', pole: 'focus' },
		'several-threads': { axis: 'curiosity-focus', pole: 'curiosity' }
	},
	feedback_preference: {
		direct: { axis: 'directness-diplomacy', pole: 'directness' },
		gentle: { axis: 'directness-diplomacy', pole: 'diplomacy' },
		'with-context': { axis: 'directness-diplomacy', pole: 'diplomacy' }
	},
	pace: {
		steady: { axis: 'patience-urgency', pole: 'patience' },
		bursts: { axis: 'patience-urgency', pole: 'urgency' }
	}
};

export function directEchoIsCompatible(
	questionId: SelfReportQuestionId,
	optionId: string,
	sealedStatements: readonly GeneratedStatement[]
): boolean {
	const required = ECHO_AXIS_POLES[questionId]?.[optionId];
	if (!required) return true;
	const fragmentIds = new Set(sealedStatements.flatMap((statement) => statement.trace.fragmentIds));
	return !FRAGMENTS_EN.some(
		(fragment) =>
			fragmentIds.has(fragment.id) &&
			fragment.kind === 'clause' &&
			fragment.axis === required.axis &&
			fragment.pole !== required.pole
	);
}
