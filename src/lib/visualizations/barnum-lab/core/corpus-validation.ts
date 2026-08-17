import { AXIS_REGISTRY } from '../data/axes';
import { FORBIDDEN_CORPUS_TOPIC_PATTERNS } from '../data/forbidden-corpus-topics';
import { FRAGMENTS_EN } from '../data/fragments.en';
import { FRAMES_EN } from '../data/frames.en';
import { QUESTION_REGISTRY } from '../data/questions.en';
import { isValidOption } from './input-boundary';
import { setJaccard, trigramSet } from './text-similarity';
import type { ContentAxis, CorpusFragment, FramePart, SentenceFrame } from './types';

export interface CorpusValidationIssue {
	code: string;
	id: string;
	message: string;
}

type SlotPart = Extract<FramePart, { kind: 'slot' }>;

export function eligibleFragmentsForSlot(
	frame: SentenceFrame,
	slot: SlotPart,
	fragments: readonly CorpusFragment[] = FRAGMENTS_EN
): readonly CorpusFragment[] {
	return fragments
		.filter((fragment) => {
			if (fragment.kind !== slot.fragmentKind) return false;
			if ('role' in fragment && slot.role && fragment.role !== slot.role) return false;
			if (fragment.kind === 'bridge' && slot.relation && fragment.relation !== slot.relation) {
				return false;
			}
			if (frame.claimBasis === 'direct-echo') {
				return fragment.kind === 'clause' && fragment.claimBasis.kind === 'direct-echo';
			}
			return !('claimBasis' in fragment) || fragment.claimBasis.kind === 'unsupported-generic';
		})
		.sort((left, right) => left.id.localeCompare(right.id));
}

function semanticKey(fragment: CorpusFragment | undefined): string | undefined {
	return fragment && 'semanticKey' in fragment ? fragment.semanticKey : undefined;
}

function axis(fragment: CorpusFragment | undefined): ContentAxis | undefined {
	return fragment?.kind === 'clause' ? fragment.axis : undefined;
}

function pole(fragment: CorpusFragment | undefined): string | undefined {
	return fragment?.kind === 'clause' ? fragment.pole : undefined;
}

export function assignmentSatisfies(
	frame: SentenceFrame,
	assignment: Readonly<Record<string, CorpusFragment>>
): boolean {
	for (const constraint of frame.constraints) {
		if (constraint.op === 'same-axis') {
			const leftAxis = axis(assignment[constraint.left]);
			const rightAxis = axis(assignment[constraint.right]);
			if (!leftAxis || !rightAxis || leftAxis !== rightAxis) return false;
		}
		if (constraint.op === 'opposite-poles') {
			const left = assignment[constraint.left];
			const right = assignment[constraint.right];
			const leftAxis = axis(left);
			const rightAxis = axis(right);
			const leftPole = pole(left);
			const rightPole = pole(right);
			if (
				!leftAxis ||
				leftAxis !== rightAxis ||
				!leftPole ||
				!rightPole ||
				leftPole === rightPole
			) {
				return false;
			}
			if (!(AXIS_REGISTRY[leftAxis].poles as readonly string[]).includes(leftPole)) return false;
			if (!(AXIS_REGISTRY[leftAxis].poles as readonly string[]).includes(rightPole)) return false;
		}
		if (constraint.op === 'different-semantic-key') {
			const leftKey = semanticKey(assignment[constraint.left]);
			const rightKey = semanticKey(assignment[constraint.right]);
			if (!leftKey || !rightKey || leftKey === rightKey) return false;
		}
	}

	const assigned = Object.values(assignment);
	for (let leftIndex = 0; leftIndex < assigned.length; leftIndex += 1) {
		const left = assigned[leftIndex];
		if (!('semanticKey' in left)) continue;
		for (let rightIndex = leftIndex + 1; rightIndex < assigned.length; rightIndex += 1) {
			const right = assigned[rightIndex];
			if (!('semanticKey' in right)) continue;
			if (left.incompatibleSemanticKeys?.includes(right.semanticKey)) return false;
			if ('incompatibleFragmentIds' in left && left.incompatibleFragmentIds?.includes(right.id)) {
				return false;
			}
			if (right.incompatibleSemanticKeys?.includes(left.semanticKey)) return false;
			if ('incompatibleFragmentIds' in right && right.incompatibleFragmentIds?.includes(left.id)) {
				return false;
			}
		}
	}
	return true;
}

function uniqueSlots(frame: SentenceFrame): readonly SlotPart[] {
	const slots = frame.parts.filter((part): part is SlotPart => part.kind === 'slot');
	return [...new Map(slots.map((entry) => [entry.name, entry])).values()];
}

/** Exact for the shipped grammar, whose constraints apply only to semantic clause/tail slots. */
export function countValidFrameAssignments(
	frame: SentenceFrame,
	fragments: readonly CorpusFragment[] = FRAGMENTS_EN
): bigint {
	const canUseDefaultCache = fragments === FRAGMENTS_EN && FRAMES_EN.includes(frame);
	if (canUseDefaultCache) {
		const cached = DEFAULT_FRAME_ASSIGNMENT_COUNTS.get(frame.id);
		if (cached !== undefined) return cached;
	}
	const slots = uniqueSlots(frame);
	const semanticSlots = slots.filter(
		(candidate) => candidate.fragmentKind === 'clause' || candidate.fragmentKind === 'tail'
	);
	const supportSlots = slots.filter(
		(candidate) => candidate.fragmentKind === 'lead' || candidate.fragmentKind === 'bridge'
	);
	let semanticCount = 0n;
	const assignment: Record<string, CorpusFragment> = {};
	const semanticPools = new Map(
		semanticSlots.map((slot) => [slot.name, eligibleFragmentsForSlot(frame, slot, fragments)])
	);

	const visit = (slotIndex: number) => {
		if (slotIndex === semanticSlots.length) {
			if (assignmentSatisfies(frame, assignment)) semanticCount += 1n;
			return;
		}
		const current = semanticSlots[slotIndex];
		for (const fragment of semanticPools.get(current.name) ?? []) {
			assignment[current.name] = fragment;
			visit(slotIndex + 1);
		}
		delete assignment[current.name];
	};
	visit(0);

	let supportMultiplier = 1n;
	for (const support of supportSlots) {
		supportMultiplier *= BigInt(eligibleFragmentsForSlot(frame, support, fragments).length);
	}
	const result = semanticCount * supportMultiplier;
	if (canUseDefaultCache) DEFAULT_FRAME_ASSIGNMENT_COUNTS.set(frame.id, result);
	return result;
}

const DEFAULT_FRAME_ASSIGNMENT_COUNTS = new Map<string, bigint>();

export function validateBarnumCorpus(
	fragments: readonly CorpusFragment[] = FRAGMENTS_EN,
	frames: readonly SentenceFrame[] = FRAMES_EN
): readonly CorpusValidationIssue[] {
	const issues: CorpusValidationIssue[] = [];
	const fragmentIds = new Set<string>();
	const semanticKeys = new Set<string>();
	for (const fragment of fragments) {
		if (fragmentIds.has(fragment.id)) {
			issues.push({
				code: 'duplicate-fragment-id',
				id: fragment.id,
				message: 'Fragment ID is repeated.'
			});
		}
		fragmentIds.add(fragment.id);
		if ('semanticKey' in fragment) {
			if (semanticKeys.has(fragment.semanticKey)) {
				issues.push({
					code: 'duplicate-semantic-key',
					id: fragment.id,
					message: 'Semantic key is repeated.'
				});
			}
			semanticKeys.add(fragment.semanticKey);
		}
		if (fragment.reviewStatus !== 'approved-v1') {
			issues.push({
				code: 'unapproved',
				id: fragment.id,
				message: 'Production fragment is not approved-v1.'
			});
		}
		if (/\s{2,}/.test(fragment.text) || /\{\{|\}\}|TODO|PLACEHOLDER/i.test(fragment.text)) {
			issues.push({
				code: 'text-placeholder',
				id: fragment.id,
				message: 'Text contains spacing or placeholder residue.'
			});
		}
		if (/[.!?…][”']?$/.test(fragment.text)) {
			issues.push({
				code: 'fragment-punctuation',
				id: fragment.id,
				message: 'Frames, not fragments, own terminal punctuation.'
			});
		}
		if (
			(fragment.kind === 'clause' || fragment.kind === 'tail') &&
			!/^\p{Ll}/u.test(fragment.text)
		) {
			issues.push({
				code: 'fragment-case',
				id: fragment.id,
				message: 'Clause/tail must start with a lowercase letter.'
			});
		}
		for (const pattern of FORBIDDEN_CORPUS_TOPIC_PATTERNS) {
			if (pattern.test(fragment.text)) {
				issues.push({
					code: 'forbidden-topic',
					id: fragment.id,
					message: `Forbidden-topic lint matched ${pattern}.`
				});
			}
		}
		if (fragment.kind === 'clause' && fragment.axis) {
			if (
				!fragment.pole ||
				!(AXIS_REGISTRY[fragment.axis].poles as readonly string[]).includes(fragment.pole)
			) {
				issues.push({
					code: 'invalid-pole',
					id: fragment.id,
					message: 'Pole does not belong to the declared axis.'
				});
			}
		}
		if (fragment.kind === 'clause' && fragment.claimBasis.kind === 'direct-echo') {
			const basis = fragment.claimBasis;
			if (
				QUESTION_REGISTRY[basis.questionId].permittedUse !== 'direct-echo' ||
				!isValidOption(basis.questionId, basis.optionId)
			) {
				issues.push({
					code: 'invalid-echo',
					id: fragment.id,
					message: 'Direct echo cites an invalid question/option pair.'
				});
			}
		}
	}

	if (fragments.length < 700 || fragments.length > 1_000) {
		issues.push({
			code: 'fragment-quota',
			id: 'corpus',
			message: 'Production corpus must contain 700–1,000 atoms.'
		});
	}
	if (frames.length < 36 || frames.length > 60) {
		issues.push({
			code: 'frame-quota',
			id: 'frames',
			message: 'Production grammar must contain 36–60 frames.'
		});
	}

	const frameIds = new Set<string>();
	for (const frame of frames) {
		if (frameIds.has(frame.id)) {
			issues.push({ code: 'duplicate-frame-id', id: frame.id, message: 'Frame ID is repeated.' });
		}
		frameIds.add(frame.id);
		const slots = uniqueSlots(frame);
		const names = slots.map((candidate) => candidate.name);
		const rawSlotCount = frame.parts.filter((part) => part.kind === 'slot').length;
		if (names.length !== rawSlotCount) {
			issues.push({
				code: 'duplicate-slot',
				id: frame.id,
				message: 'A frame repeats a slot name.'
			});
		}
		for (const constraint of frame.constraints) {
			if (
				'left' in constraint &&
				(!names.includes(constraint.left) || !names.includes(constraint.right))
			) {
				issues.push({
					code: 'unknown-slot',
					id: frame.id,
					message: 'Constraint references an absent slot.'
				});
			}
		}
		for (const frameSlot of slots) {
			if (eligibleFragmentsForSlot(frame, frameSlot, fragments).length === 0) {
				issues.push({
					code: 'empty-slot',
					id: frame.id,
					message: `Slot ${frameSlot.name} has no candidates.`
				});
			}
		}
		if (countValidFrameAssignments(frame, fragments) === 0n) {
			issues.push({
				code: 'dead-frame',
				id: frame.id,
				message: 'Frame has no satisfiable assignment.'
			});
		}
	}
	return issues;
}

export function assertValidBarnumCorpus(): void {
	const issues = validateBarnumCorpus();
	if (issues.length > 0) {
		throw new Error(issues.map((issue) => `${issue.code}:${issue.id}:${issue.message}`).join('\n'));
	}
}

export interface SimilarFragmentPair {
	leftId: string;
	rightId: string;
	score: number;
}

export interface CorpusAudit {
	fragmentCount: number;
	frameCount: number;
	semanticKeyCount: number;
	countsByKind: Readonly<Record<string, number>>;
	countsByAxis: Readonly<Record<string, number>>;
	countsByTechnique: Readonly<Record<string, number>>;
	countsByReviewStatus: Readonly<Record<string, number>>;
	validAssignmentsByFrame: Readonly<Record<string, string>>;
	totalValidConstrainedCombinations: string;
	deadFragmentIds: readonly string[];
	deadFrameIds: readonly string[];
	mostSimilarPairs: readonly SimilarFragmentPair[];
}

function increment(record: Record<string, number>, key: string): void {
	record[key] = (record[key] ?? 0) + 1;
}

export function auditBarnumCorpus(
	fragments: readonly CorpusFragment[] = FRAGMENTS_EN,
	frames: readonly SentenceFrame[] = FRAMES_EN
): CorpusAudit {
	const countsByKind: Record<string, number> = {};
	const countsByAxis: Record<string, number> = {};
	const countsByTechnique: Record<string, number> = {};
	const countsByReviewStatus: Record<string, number> = {};
	for (const fragment of fragments) {
		increment(countsByKind, fragment.kind);
		increment(countsByReviewStatus, fragment.reviewStatus);
		if (fragment.kind === 'clause' && fragment.axis) increment(countsByAxis, fragment.axis);
		for (const technique of fragment.techniques) increment(countsByTechnique, technique);
	}

	const deadFragmentIds = fragments
		.filter(
			(fragment) =>
				!frames.some((frame) =>
					uniqueSlots(frame).some((candidate) =>
						eligibleFragmentsForSlot(frame, candidate, [fragment]).includes(fragment)
					)
				)
		)
		.map((fragment) => fragment.id);
	const validAssignmentsByFrame: Record<string, string> = {};
	let total = 0n;
	for (const frame of frames) {
		const count = countValidFrameAssignments(frame, fragments);
		validAssignmentsByFrame[frame.id] = count.toString();
		total += count;
	}

	const semanticFragments = fragments.filter(
		(fragment): fragment is Extract<CorpusFragment, { kind: 'clause' | 'tail' }> =>
			fragment.kind === 'clause' || fragment.kind === 'tail'
	);
	const trigramsById = new Map(
		semanticFragments.map((fragment) => [fragment.id, trigramSet(fragment.text)])
	);
	const mostSimilarPairs: SimilarFragmentPair[] = [];
	for (let leftIndex = 0; leftIndex < semanticFragments.length; leftIndex += 1) {
		for (let rightIndex = leftIndex + 1; rightIndex < semanticFragments.length; rightIndex += 1) {
			const left = semanticFragments[leftIndex];
			const right = semanticFragments[rightIndex];
			const score = setJaccard(trigramsById.get(left.id)!, trigramsById.get(right.id)!);
			if (
				mostSimilarPairs.length < 20 ||
				score > mostSimilarPairs[mostSimilarPairs.length - 1].score
			) {
				mostSimilarPairs.push({ leftId: left.id, rightId: right.id, score });
				mostSimilarPairs.sort((a, b) => b.score - a.score || a.leftId.localeCompare(b.leftId));
				if (mostSimilarPairs.length > 20) mostSimilarPairs.pop();
			}
		}
	}

	return {
		fragmentCount: fragments.length,
		frameCount: frames.length,
		semanticKeyCount: new Set(
			fragments.flatMap((fragment) => ('semanticKey' in fragment ? [fragment.semanticKey] : []))
		).size,
		countsByKind,
		countsByAxis,
		countsByTechnique,
		countsByReviewStatus,
		validAssignmentsByFrame,
		totalValidConstrainedCombinations: total.toString(),
		deadFragmentIds,
		deadFrameIds: frames
			.filter((frame) => validAssignmentsByFrame[frame.id] === '0')
			.map((frame) => frame.id),
		mostSimilarPairs
	};
}
