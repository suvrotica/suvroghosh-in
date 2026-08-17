import { DIRECT_ECHO_SENTENCES_EN } from '../data/direct-echoes.en';
import { SURFACE_SENTENCES_EN } from '../data/surface-sentences.en.generated';
import { deterministicShuffle } from './seeded-rng';
import { makeSurfaceText } from './surface-text';
import type {
	BarnumTechnique,
	Candidate,
	ClaimBasis,
	GenerationProfile,
	Mechanism,
	SurfaceSentence
} from './types';

export interface CandidateCompilationOptions {
	sentences?: readonly SurfaceSentence[];
	claimBasis?: ClaimBasis['kind'];
	questionId?: string;
	optionId?: string;
	seedKey?: string;
	maxCandidates?: number;
}

export function techniqueForMechanism(mechanism: Mechanism): BarnumTechnique {
	switch (mechanism) {
		case 'rainbow-pair':
			return 'rainbow-pair';
		case 'flattering-ambiguity':
			return 'flattering-ambiguity';
		case 'unused-potential':
			return 'unused-potential';
		case 'guarded-vulnerability':
		case 'redeemable-flaw':
			return 'guarded-vulnerability';
		case 'conditional-escape':
		case 'feedback-qualification':
		case 'miss-recovery':
			return 'exception-clause';
		case 'direct-echo':
			return 'direct-answer-echo';
		case 'feedback-reinforcement':
			return 'feedback-reuse';
		default:
			return 'broad-common-experience';
	}
}

export function surfaceSentenceToCandidate(sentence: SurfaceSentence): Candidate {
	const technique = techniqueForMechanism(sentence.mechanism);
	const text = makeSurfaceText(sentence.text, {
		allowReviewedRainbowLength: sentence.mechanism === 'rainbow-pair'
	});
	return Object.freeze({
		id: sentence.id,
		frameId: 'complete-sentence.v2',
		fragmentIds: [sentence.id],
		semanticKeys: [sentence.semanticFamilyId],
		axes: [sentence.axis],
		poles: [{ axis: sentence.axis, pole: sentence.pole }],
		techniques: [technique],
		breadth: sentence.breadth === 'broad' ? 'broad' : 'moderate',
		claimBasis: sentence.claimBasis,
		selectionInfluences: [],
		renderedSegments: [
			{
				text,
				fragmentId: sentence.id,
				technique,
				claimBasis: sentence.claimBasis,
				selectionInfluences: []
			}
		],
		text,
		surfaceSentenceId: sentence.id,
		semanticFamilyIds: [sentence.semanticFamilyId],
		mechanisms: [sentence.mechanism],
		opener: sentence.opener,
		channel: sentence.channel
	});
}

/**
 * Converts only approved surface records into candidates. `AuditExplanation` is not assignable to
 * this function at compile time and there is no generic string/fragment path into the compiler.
 */
export function compileCandidates(
	profile: GenerationProfile,
	options: CandidateCompilationOptions = {}
): readonly Candidate[] {
	const claimBasis = options.claimBasis ?? 'unsupported-generic';
	const source = options.sentences ?? [...SURFACE_SENTENCES_EN, ...DIRECT_ECHO_SENTENCES_EN];
	const eligible = source.filter((sentence) => {
		if (sentence.reviewStatus !== 'surface-approved-v2') return false;
		if (sentence.claimBasis.kind !== claimBasis) return false;
		if (sentence.claimBasis.kind !== 'direct-echo') return true;
		if (options.questionId && sentence.claimBasis.questionId !== options.questionId) return false;
		if (options.optionId && sentence.claimBasis.optionId !== options.optionId) return false;
		return profile.selfReports[sentence.claimBasis.questionId] === sentence.claimBasis.optionId;
	});
	const shuffled = deterministicShuffle(
		[...eligible].sort((left, right) => left.id.localeCompare(right.id)),
		profile.sessionSeed,
		options.seedKey ?? 'approved-surface-candidates-v2',
		claimBasis
	);
	const maximum = Number.isFinite(options.maxCandidates)
		? Math.max(0, Math.trunc(options.maxCandidates!))
		: shuffled.length;
	return shuffled.slice(0, maximum).map(surfaceSentenceToCandidate);
}
