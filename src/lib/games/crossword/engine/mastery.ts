import type {
	ConceptMasteryRecord,
	CrosswordPack,
	MasteryAttempt,
	MasteryHistory,
	MasteryLabel,
	PuzzleModel,
	PuzzleState,
	SolveOutcome
} from '../types';
import { getCompletedEntryIds, solveOutcomeForEntry } from './checking';

const MAX_RECENT_ATTEMPTS = 8;

export const OUTCOME_SCORES: Readonly<Record<SolveOutcome, 0 | 1 | 2 | 3>> = {
	independent: 3,
	'light-hint': 2,
	'strong-hint': 1,
	revealed: 0
};

export function createEmptyMasteryHistory(): MasteryHistory {
	return { concepts: {} };
}

function calculateReviewPriority(attempts: readonly MasteryAttempt[]): number {
	if (attempts.length === 0) return 0;
	let weightedLoss = 0;
	let totalWeight = 0;
	const chronological = [...attempts].reverse();
	for (let index = 0; index < chronological.length; index += 1) {
		const weight = index + 1;
		weightedLoss += (3 - chronological[index].score) * weight;
		totalWeight += 3 * weight;
	}
	return Math.round((weightedLoss / totalWeight) * 100);
}

function emptyConcept(conceptId: string): ConceptMasteryRecord {
	return {
		conceptId,
		topicIds: [],
		independentSolves: 0,
		lightHintSolves: 0,
		strongHintSolves: 0,
		reveals: 0,
		recentAttempts: [],
		lastReviewed: null,
		reviewPriority: 0
	};
}

export function recordMasteryAttempt(
	history: MasteryHistory,
	conceptId: string,
	attempt: MasteryAttempt,
	topicIds: readonly string[] = []
): MasteryHistory {
	const current = history.concepts[conceptId] ?? emptyConcept(conceptId);
	const recentAttempts = [attempt, ...current.recentAttempts].slice(0, MAX_RECENT_ATTEMPTS);
	const next: ConceptMasteryRecord = {
		...current,
		topicIds: [...new Set([...current.topicIds, ...topicIds])],
		independentSolves: current.independentSolves + (attempt.outcome === 'independent' ? 1 : 0),
		lightHintSolves: current.lightHintSolves + (attempt.outcome === 'light-hint' ? 1 : 0),
		strongHintSolves: current.strongHintSolves + (attempt.outcome === 'strong-hint' ? 1 : 0),
		reveals: current.reveals + (attempt.outcome === 'revealed' ? 1 : 0),
		recentAttempts,
		lastReviewed: attempt.at,
		reviewPriority: calculateReviewPriority(recentAttempts)
	};
	return { concepts: { ...history.concepts, [conceptId]: next } };
}

export function recordCompletedPuzzle(
	history: MasteryHistory,
	model: PuzzleModel,
	state: PuzzleState,
	completedAt: Date | string = new Date()
): MasteryHistory {
	const date = completedAt instanceof Date ? completedAt : new Date(completedAt);
	const at = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
	let next = history;
	for (const entryId of getCompletedEntryIds(state, model)) {
		const entry = model.entriesById[entryId];
		const outcome = solveOutcomeForEntry(state, entryId);
		next = recordMasteryAttempt(
			next,
			entry.conceptId ?? entry.id,
			{
				at,
				puzzleId: model.puzzle.id,
				entryId,
				outcome,
				score: OUTCOME_SCORES[outcome]
			},
			model.puzzle.topicIds
		);
	}
	return next;
}

export function classifyMastery(record?: ConceptMasteryRecord): MasteryLabel {
	if (!record || record.recentAttempts.length === 0) return 'Newly encountered';
	let weightedScore = 0;
	let totalWeight = 0;
	const chronological = [...record.recentAttempts].reverse();
	for (let index = 0; index < chronological.length; index += 1) {
		const weight = index + 1;
		weightedScore += chronological[index].score * weight;
		totalWeight += weight;
	}
	const average = weightedScore / totalWeight;
	if (average >= 2.5) return 'Ready';
	if (average >= 1.5) return 'Worth another crossing';
	return 'Needs a refresher';
}

export interface ReviewSelectionOptions {
	limit?: number;
	topicIds?: readonly string[];
	includeReady?: boolean;
	now?: Date | string;
}

function effectiveReviewPriority(record: ConceptMasteryRecord, now: Date): number {
	if (!record.lastReviewed) return 100;
	const lastReviewed = new Date(record.lastReviewed);
	if (Number.isNaN(lastReviewed.getTime())) return record.reviewPriority;
	const ageInDays = Math.max(0, (now.getTime() - lastReviewed.getTime()) / 86_400_000);
	return Math.min(100, record.reviewPriority + Math.min(20, Math.floor(ageInDays / 14)));
}

/** Return concept records in the order a Review Round should prefer them. */
export function selectReviewConcepts(
	history: MasteryHistory,
	options: ReviewSelectionOptions = {}
): ConceptMasteryRecord[] {
	const limit = Math.max(0, Math.floor(options.limit ?? 12));
	const topics = new Set(options.topicIds ?? []);
	const parsedNow = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
	const now = Number.isNaN(parsedNow.getTime()) ? new Date() : parsedNow;
	return Object.values(history.concepts)
		.filter((record) => topics.size === 0 || record.topicIds.some((topic) => topics.has(topic)))
		.filter((record) => options.includeReady || classifyMastery(record) !== 'Ready')
		.map((record) => ({ record, priority: effectiveReviewPriority(record, now) }))
		.filter(({ priority }) => options.includeReady || priority >= 20)
		.sort(
			(left, right) =>
				right.priority - left.priority ||
				(left.record.lastReviewed ?? '').localeCompare(right.record.lastReviewed ?? '') ||
				left.record.conceptId.localeCompare(right.record.conceptId)
		)
		.slice(0, limit)
		.map(({ record }) => record);
}

/**
 * Select one authored entry for each queued concept. This never synthesises clues
 * or answers in the browser; a caller can use the result with an authored review grid.
 */
export function selectReviewEntries(
	pack: CrosswordPack,
	history: MasteryHistory,
	options: ReviewSelectionOptions = {}
): CrosswordPack['puzzles'][number]['entries'] {
	const concepts = selectReviewConcepts(history, options);
	const entriesByConcept = new Map<string, CrosswordPack['puzzles'][number]['entries'][number]>();
	for (const puzzle of pack.puzzles) {
		for (const entry of puzzle.entries) {
			const conceptId = entry.conceptId ?? entry.id;
			if (!entriesByConcept.has(conceptId)) entriesByConcept.set(conceptId, entry);
		}
	}
	return concepts.flatMap((concept) => {
		const entry = entriesByConcept.get(concept.conceptId);
		return entry ? [entry] : [];
	});
}
