import type {
	CrosswordEntry,
	Direction,
	EntryLearning,
	HintStep,
	KnowledgeFreshness
} from '$lib/games/crossword/types';

export const HEALTHCARE_IT_PACK_ID = 'healthcare-it' as const;
export const HEALTHCARE_IT_REVIEWED_AT = '2026-08-13' as const;

export type HealthcareConcept = Pick<
	CrosswordEntry,
	'answer' | 'displayAnswer' | 'clue' | 'hints' | 'learning' | 'tags'
> & {
	id: string;
};

export type AuthoredPlacement = {
	conceptId: string;
	direction: Direction;
	row: number;
	column: number;
	clue?: string;
};

export type ConceptFreshness = KnowledgeFreshness;
export type ConceptHint = HintStep;
export type ConceptLearning = EntryLearning;
