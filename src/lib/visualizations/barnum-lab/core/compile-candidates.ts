import { CORPUS_MANIFEST_HASH } from '../data/corpus-manifest';
import { FRAGMENTS_EN } from '../data/fragments.en';
import { FRAMES_EN } from '../data/frames.en';
import { assignmentSatisfies, eligibleFragmentsForSlot } from './corpus-validation';
import { hashHex, rngFor } from './seeded-rng';
import type {
	BreadthBand,
	Candidate,
	ClaimBasis,
	CorpusFragment,
	FramePart,
	GenerationProfile,
	RenderedSegment,
	SentenceFrame
} from './types';

type SlotPart = Extract<FramePart, { kind: 'slot' }>;

const DEFAULT_SLOT_POOL_CACHE = new Map<string, readonly CorpusFragment[]>();

export interface CandidateCompilationOptions {
	claimBasis?: ClaimBasis['kind'];
	questionId?: string;
	optionId?: string;
	seedKey?: string;
	maxAttemptsPerFrame?: number;
	maxCandidates?: number;
	fragments?: readonly CorpusFragment[];
	frames?: readonly SentenceFrame[];
}

function uniqueSlots(frame: SentenceFrame): readonly SlotPart[] {
	return [
		...new Map(
			frame.parts
				.filter((part): part is SlotPart => part.kind === 'slot')
				.map((part) => [part.name, part])
		).values()
	];
}

function partialAssignmentCanSatisfy(
	frame: SentenceFrame,
	assignment: Readonly<Record<string, CorpusFragment>>
): boolean {
	for (const constraint of frame.constraints) {
		if (!('left' in constraint)) continue;
		if (assignment[constraint.left] && assignment[constraint.right]) {
			if (!assignmentSatisfies({ ...frame, constraints: [constraint] }, assignment)) return false;
		}
	}
	return true;
}

function needsPartialCheck(
	frame: SentenceFrame,
	slotName: string,
	assignment: Readonly<Record<string, CorpusFragment>>
): boolean {
	const connectedConstraint = frame.constraints.some(
		(constraint) =>
			'left' in constraint &&
			((constraint.left === slotName && Boolean(assignment[constraint.right])) ||
				(constraint.right === slotName && Boolean(assignment[constraint.left])))
	);
	if (connectedConstraint) return true;
	return Object.values(assignment).some(
		(fragment) =>
			'incompatibleSemanticKeys' in fragment &&
			(Boolean(fragment.incompatibleSemanticKeys?.length) ||
				('incompatibleFragmentIds' in fragment &&
					Boolean(fragment.incompatibleFragmentIds?.length)))
	);
}

function baseSlotPool(
	frame: SentenceFrame,
	frameSlot: SlotPart,
	fragments: readonly CorpusFragment[],
	usesDefaultCorpus: boolean
): readonly CorpusFragment[] {
	if (!usesDefaultCorpus) return eligibleFragmentsForSlot(frame, frameSlot, fragments);
	const key =
		frame.id +
		'|' +
		frame.claimBasis +
		'|' +
		frameSlot.name +
		'|' +
		frameSlot.fragmentKind +
		'|' +
		(frameSlot.role ?? '') +
		'|' +
		(frameSlot.relation ?? '');
	const cached = DEFAULT_SLOT_POOL_CACHE.get(key);
	if (cached) return cached;
	const pool = eligibleFragmentsForSlot(frame, frameSlot, fragments);
	DEFAULT_SLOT_POOL_CACHE.set(key, pool);
	return pool;
}

function claimBasisOf(assignment: Readonly<Record<string, CorpusFragment>>): ClaimBasis {
	const echo = Object.values(assignment).find(
		(fragment) => 'claimBasis' in fragment && fragment.claimBasis.kind === 'direct-echo'
	);
	if (echo && 'claimBasis' in echo) return echo.claimBasis;
	return { kind: 'unsupported-generic' };
}

function breadthOf(assignment: Readonly<Record<string, CorpusFragment>>): BreadthBand {
	const bands = Object.values(assignment).flatMap((fragment) =>
		'breadth' in fragment ? [fragment.breadth] : []
	);
	if (bands.includes('very-broad')) return 'very-broad';
	if (bands.includes('broad')) return 'broad';
	return 'moderate';
}

function capitalizeFirstLetter(text: string): string {
	return text.replace(
		/^([^\p{L}]*)(\p{Ll})/u,
		(_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase('en')
	);
}

function candidateFromAssignment(
	frame: SentenceFrame,
	assignment: Readonly<Record<string, CorpusFragment>>
): Candidate {
	const basis = claimBasisOf(assignment);
	const renderedSegments: RenderedSegment[] = frame.parts.map((part) => {
		if (part.kind === 'literal') {
			return {
				text: part.text,
				claimBasis: basis,
				selectionInfluences: []
			};
		}
		const fragment = assignment[part.name];
		return {
			text: fragment.text,
			fragmentId: fragment.id,
			technique: fragment.techniques[0],
			claimBasis: 'claimBasis' in fragment ? fragment.claimBasis : basis,
			selectionInfluences: []
		};
	});
	if (renderedSegments[0]) {
		renderedSegments[0] = {
			...renderedSegments[0],
			text: capitalizeFirstLetter(renderedSegments[0].text)
		};
	}
	const assigned = Object.values(assignment).sort((left, right) => left.id.localeCompare(right.id));
	const fragmentIds = assigned.map((fragment) => fragment.id);
	const semanticKeys = assigned.flatMap((fragment) =>
		'semanticKey' in fragment ? [fragment.semanticKey] : []
	);
	const axes = [
		...new Set(
			assigned.flatMap((fragment) =>
				fragment.kind === 'clause' && fragment.axis ? [fragment.axis] : []
			)
		)
	];
	const poles = assigned.flatMap((fragment) =>
		fragment.kind === 'clause' && fragment.axis && fragment.pole
			? [{ axis: fragment.axis, pole: fragment.pole }]
			: []
	);
	const techniques = [
		...new Set([frame.technique, ...assigned.flatMap((fragment) => fragment.techniques)])
	];
	const assignmentKey = uniqueSlots(frame)
		.map((frameSlot) => frameSlot.name + '=' + assignment[frameSlot.name].id)
		.join('|');
	return {
		id: frame.id + ':' + hashHex(assignmentKey),
		frameId: frame.id,
		fragmentIds,
		semanticKeys,
		axes,
		poles,
		techniques,
		breadth: breadthOf(assignment),
		claimBasis: basis,
		selectionInfluences: [],
		renderedSegments,
		text: renderedSegments.map((segment) => segment.text).join('')
	};
}

export function compileCandidates(
	profile: GenerationProfile,
	options: CandidateCompilationOptions = {}
): readonly Candidate[] {
	const usesDefaultCorpus = options.fragments === undefined;
	const fragments = [...(options.fragments ?? FRAGMENTS_EN)].sort((a, b) =>
		a.id.localeCompare(b.id)
	);
	const claimBasis = options.claimBasis ?? 'unsupported-generic';
	const frames = [...(options.frames ?? FRAMES_EN)]
		.filter((frame) => frame.claimBasis === claimBasis)
		.sort((a, b) => a.id.localeCompare(b.id));
	const maxAttempts = Math.max(1, Math.min(256, options.maxAttemptsPerFrame ?? 48));
	const maxCandidates = Math.max(1, Math.min(2_000, options.maxCandidates ?? 500));
	const seedKey = options.seedKey ?? 'candidate-pool';
	const candidates = new Map<string, Candidate>();

	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		for (const frame of frames) {
			const slots = uniqueSlots(frame);
			const assignment: Record<string, CorpusFragment> = {};
			let complete = true;
			for (const frameSlot of slots) {
				let pool = baseSlotPool(frame, frameSlot, fragments, usesDefaultCorpus);
				if (claimBasis === 'direct-echo') {
					pool = pool.filter(
						(fragment) =>
							fragment.kind === 'clause' &&
							fragment.claimBasis.kind === 'direct-echo' &&
							(!options.questionId || fragment.claimBasis.questionId === options.questionId) &&
							(!options.optionId || fragment.claimBasis.optionId === options.optionId)
					);
				}
				if (needsPartialCheck(frame, frameSlot.name, assignment)) {
					pool = pool.filter((fragment) =>
						partialAssignmentCanSatisfy(frame, { ...assignment, [frameSlot.name]: fragment })
					);
				}
				if (pool.length === 0) {
					complete = false;
					break;
				}
				const random = rngFor(
					profile.sessionSeed,
					CORPUS_MANIFEST_HASH,
					seedKey,
					frame.id,
					String(attempt),
					frameSlot.name
				);
				assignment[frameSlot.name] = pool[Math.floor(random() * pool.length)];
			}
			if (!complete || !assignmentSatisfies(frame, assignment)) continue;
			const candidate = candidateFromAssignment(frame, assignment);
			candidates.set(candidate.id, candidate);
			if (candidates.size >= maxCandidates) break;
		}
		if (candidates.size >= maxCandidates) break;
	}
	return [...candidates.values()].sort((a, b) => a.id.localeCompare(b.id));
}
