import type { SurfaceText } from '..';

export type FitRating = 'does-not-fit' | 'partly-fits' | 'fits' | 'too-vague' | 'unrated';

export type AnswerOrigin = 'demo-default' | 'user-selected' | 'no-answer' | 'machine-unknown';

export type LedgerGroup = 'demo-defaults' | 'selected' | 'unknowns';

export interface LedgerRow {
	id: string;
	label: string;
	value: string;
	origin: string;
	permittedUse: string;
	group: LedgerGroup;
	useAfterReveal?: string;
}

export interface LabOption {
	id: string;
	label: string;
}

export interface LabQuestion {
	id: string;
	label: string;
	description?: string;
	options: readonly LabOption[];
	permittedUse: 'unused-demographic' | 'unused-decoy' | 'presentation-only' | 'direct-echo';
}

export interface LabAnswer {
	optionId: string;
	origin: 'demo-default' | 'user-selected';
}

export type ClaimBasis = 'unsupported-generic' | 'direct-echo';

export type AdaptationStatus = 'sealed' | 'feedback-selected' | 'hedged' | 'elaborated';

export interface ReadingSegment {
	text: string;
	label?: string;
	basis: ClaimBasis;
	adaptation: AdaptationStatus;
}

export interface StatementTraceRow {
	label: string;
	value: string;
}

export interface ReadingStatement {
	id: string;
	coreId: string;
	text: SurfaceText;
	basis: ClaimBasis;
	adaptation: AdaptationStatus;
	rating: FitRating;
	sealed: boolean;
	segments?: readonly ReadingSegment[];
	plainExplanation?: string;
	trace?: readonly StatementTraceRow[];
	sourceStatementId?: string;
	sourceRating?: FitRating;
}

export interface RatingCounts {
	'does-not-fit': number;
	'partly-fits': number;
	fits: number;
	'too-vague': number;
	unrated: number;
}

export interface ProductionCounts {
	statementCount: number;
	semanticClauseCount: number;
	unsupportedGenericClauseCount: number;
	directEchoClauseCount: number;
	sealedClauseCount: number;
	feedbackSelectedClauseCount: number;
	hedgedClauseCount: number;
	elaboratedClauseCount: number;
	nonFitsOmittedFromPolishedSummaryCount: number;
	fitRatings: RatingCounts;
}

export type BreadthEstimate = 'almost-nobody' | 'few' | 'many' | 'almost-everybody';

export interface CounterfactualResult {
	beforeLabel: string;
	afterLabel: string;
	semanticIdOverlap: number;
	identicalSemanticIds: boolean;
	changedSurfaceDetails: readonly string[];
	changes: readonly { label: string; before: string; after: string }[];
	unchangedCoreIds: readonly string[];
}

export interface OpenLabSettings {
	statementCount: number;
	surfaceAdaptation: boolean;
	directEchoes: boolean;
	feedbackAdaptation: boolean;
	oppositePairs: boolean;
	hedges: 'none' | 'low' | 'high';
	breadth: 'very-broad' | 'broad' | 'moderate';
	showProvenance: boolean;
	showNonFits: boolean;
}

export interface AuditEventView {
	id: string;
	label: string;
	detail: string;
	sequence: number;
	timestamp: string;
	branchId: string;
	parentBranchId?: string;
	causalEventIds: readonly string[];
}
