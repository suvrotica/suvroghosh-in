import type { OptionIdFor } from './input-boundary';
import type { PresentationQuestionId, QuestionId, SelfReportQuestionId } from './question-types';

export type LabStage =
	| 'intro'
	| 'baseline'
	| 'four-clues'
	| 'apparent-sharpening'
	| 'feedback-and-counterfactual'
	| 'reveal'
	| 'open-lab';

export type FitRating = 'does-not-fit' | 'partly-fits' | 'fits' | 'too-vague' | 'unrated';

export type BreadthEstimate = 'almost-nobody' | 'few' | 'many' | 'almost-everybody';
export type SixPointRating = 0 | 1 | 2 | 3 | 4 | 5;

export type TextChannel =
	| 'surface-reading'
	| 'direct-echo'
	| 'feedback-reading'
	| 'audit-only'
	| 'interface-copy';

export type SurfaceChannel = Exclude<TextChannel, 'audit-only' | 'interface-copy'>;

export type Mechanism =
	| 'broad-common-experience'
	| 'rainbow-pair'
	| 'flattering-ambiguity'
	| 'unused-potential'
	| 'guarded-vulnerability'
	| 'redeemable-flaw'
	| 'conditional-escape'
	| 'direct-echo'
	| 'feedback-reinforcement'
	| 'feedback-qualification'
	| 'miss-recovery';

declare const surfaceTextBrand: unique symbol;
export type SurfaceText = string & { readonly [surfaceTextBrand]: true };

export type SurfaceOpener =
	| 'you'
	| 'often-you'
	| 'you-often'
	| 'sometimes-you'
	| 'you-sometimes'
	| 'at-times'
	| 'rainbow';

export interface SurfaceSentence {
	id: string;
	channel: SurfaceChannel;
	text: SurfaceText;
	mechanism: Mechanism;
	semanticFamilyId: string;
	axis: ContentAxis;
	pole: string;
	breadth: 'broad' | 'medium';
	valence: 'positive' | 'mixed' | 'neutral';
	reviewStatus: 'surface-approved-v2';
	wordCount: number;
	opener: SurfaceOpener;
	rainbowCompatibilityFamilyId?: string;
	claimBasis: ClaimBasis;
}

export interface AuditExplanation {
	id: string;
	channel: 'audit-only';
	explanation: string;
	concepts: readonly ('breadth' | 'hedge' | 'rainbow' | 'echo' | 'feedback' | 'falsifiability')[];
	statementId?: string;
	mechanism?: Mechanism;
}

export interface FeedbackProvenance {
	sourceStatementId: string;
	sourceRating: 'fits' | 'partly-fits' | 'does-not-fit';
	tactic: 'reinforce' | 'qualify' | 'miss-recovery';
	semanticFamilyId: string;
}

export interface FeedbackRelation {
	sourceSentenceId: string;
	sourceRating: 'fits' | 'partly-fits';
	targetSentenceId: string;
	tactic: 'reinforce' | 'qualify';
	semanticFamilyId: string;
}

export interface HedgePair {
	id: string;
	coreId: string;
	semanticFamilyId: string;
	axis: ContentAxis;
	pole: string;
	plain: SurfaceText;
	hedged: SurfaceText;
	hedge: string;
}

export type ContentAxis =
	| 'autonomy-approval'
	| 'company-solitude'
	| 'deliberation-spontaneity'
	| 'stability-change'
	| 'reserve-openness'
	| 'structure-flexibility'
	| 'confidence-doubt'
	| 'patience-urgency'
	| 'caution-experimentation'
	| 'directness-diplomacy'
	| 'expression-restraint'
	| 'curiosity-focus'
	| 'idealism-practicality'
	| 'independence-collaboration'
	| 'ambition-contentment'
	| 'optimism-realism'
	| 'persistence-rest'
	| 'belonging-individuality';

export type BarnumTechnique =
	| 'broad-common-experience'
	| 'rainbow-pair'
	| 'flattering-ambiguity'
	| 'guarded-vulnerability'
	| 'unused-potential'
	| 'temporal-elasticity'
	| 'modal-hedge'
	| 'exception-clause'
	| 'direct-answer-echo'
	| 'feedback-reuse';

export type ClauseRole =
	| 'independent'
	| 'contrast-independent'
	| 'although-subordinate'
	| 'while-subordinate'
	| 'echo-independent'
	| 'neutral-tail';

export type BreadthBand = 'very-broad' | 'broad' | 'moderate';
export type LocaleId = 'en';
export type Register = 'plain' | 'slightly-literary';
export type ReviewStatus = 'approved-v1' | 'surface-approved-v2' | 'needs-review';

export interface AxisDefinition {
	id: ContentAxis;
	poles: readonly [string, string];
}

export type ClaimBasis =
	| { kind: 'unsupported-generic' }
	| {
			kind: 'direct-echo';
			questionId: SelfReportQuestionId;
			optionId: string;
	  };

export interface FragmentBase {
	id: string;
	locale: LocaleId;
	text: string;
	techniques: readonly BarnumTechnique[];
	register: Register;
	reviewStatus: ReviewStatus;
}

export type CorpusFragment =
	| (FragmentBase & {
			kind: 'clause';
			role: ClauseRole;
			axis?: ContentAxis;
			pole?: string;
			semanticKey: string;
			breadth: BreadthBand;
			claimBasis: ClaimBasis;
			incompatibleSemanticKeys?: readonly string[];
			incompatibleFragmentIds?: readonly string[];
	  })
	| (FragmentBase & { kind: 'lead' })
	| (FragmentBase & {
			kind: 'bridge';
			relation: 'contrast' | 'qualification' | 'addition';
	  })
	| (FragmentBase & {
			kind: 'tail';
			role: 'neutral-tail';
			semanticKey: string;
			breadth: BreadthBand;
			claimBasis: { kind: 'unsupported-generic' };
			incompatibleSemanticKeys?: readonly string[];
	  });

export type FrameConstraint =
	| { op: 'same-axis'; left: string; right: string }
	| { op: 'opposite-poles'; left: string; right: string }
	| { op: 'different-semantic-key'; left: string; right: string }
	| { op: 'claim-basis-allowed' }
	| { op: 'not-incompatible' };

export type FramePart =
	| { kind: 'literal'; text: string }
	| {
			kind: 'slot';
			name: string;
			fragmentKind: CorpusFragment['kind'];
			role?: ClauseRole;
			relation?: 'contrast' | 'qualification' | 'addition';
	  };

export interface SentenceFrame {
	id: string;
	locale: LocaleId;
	technique: BarnumTechnique;
	claimBasis: ClaimBasis['kind'];
	parts: readonly FramePart[];
	constraints: readonly FrameConstraint[];
}

export type SelectionInfluence =
	| { kind: 'sealed-selection'; slotId: string }
	| { kind: 'feedback'; ratingEventId: string; exactRating: FitRating }
	| { kind: 'presentation'; questionId: PresentationQuestionId };

export interface RenderedSegment {
	text: SurfaceText;
	fragmentId?: string;
	technique?: BarnumTechnique;
	claimBasis: ClaimBasis;
	selectionInfluences: readonly SelectionInfluence[];
}

export interface ScoreBreakdown {
	editorialBreadthPreference: number;
	stageCompatibility: number;
	axisNovelty: number;
	techniqueNovelty: number;
	directEchoEligibility: number;
	lexicalPenalty: number;
	semanticPenalty: number;
	deterministicJitter: number;
	total: number;
}

export interface Candidate {
	id: string;
	frameId: string;
	fragmentIds: readonly string[];
	semanticKeys: readonly string[];
	axes: readonly ContentAxis[];
	poles: readonly { axis: ContentAxis; pole: string }[];
	techniques: readonly BarnumTechnique[];
	breadth: BreadthBand;
	claimBasis: ClaimBasis;
	selectionInfluences: readonly SelectionInfluence[];
	renderedSegments: readonly RenderedSegment[];
	text: SurfaceText;
	surfaceSentenceId?: string;
	semanticFamilyIds?: readonly string[];
	mechanisms?: readonly Mechanism[];
	opener?: SurfaceOpener;
	channel?: SurfaceChannel;
}

export type CandidateEvaluation =
	| { eligible: false; reason: 'incompatible' | 'duplicate' | 'invalid-claim-basis' }
	| { eligible: true; score: ScoreBreakdown };

export interface StatementTrace {
	statementId: string;
	channel: SurfaceChannel;
	corpusVersion: string;
	corpusManifestHash: string;
	engineVersion: string;
	frameId: string;
	fragmentIds: readonly string[];
	semanticKeys: readonly string[];
	semanticFamilyIds: readonly string[];
	axes: readonly ContentAxis[];
	poles: readonly { axis: ContentAxis; pole: string }[];
	techniques: readonly BarnumTechnique[];
	mechanisms: readonly Mechanism[];
	claimBasis: ClaimBasis;
	selectionInfluences: readonly SelectionInfluence[];
	seedKey: string;
	score: ScoreBreakdown;
	feedbackProvenance?: FeedbackProvenance;
}

export interface StatementVersion {
	versionId: string;
	parentVersionId?: string;
	coreId: string;
	transformation:
		| { kind: 'sealed' }
		| { kind: 'surface-only'; presentationId: string }
		| { kind: 'direct-echo-added'; questionId: SelfReportQuestionId }
		| { kind: 'feedback-derivative'; ratingEventId: string; mode: 'selected' | 'hedged' };
}

export interface GeneratedStatement {
	statementId: string;
	coreId: string;
	slotId: string;
	channel: SurfaceChannel;
	text: SurfaceText;
	renderedSegments: readonly RenderedSegment[];
	trace: StatementTrace;
	version: StatementVersion;
	sealed: boolean;
	parentStatementId?: string;
}

export interface SealedStatement {
	coreId: string;
	slotId: string;
	frameId: string;
	fragmentIds: readonly string[];
	semanticIds: readonly string[];
}

export interface SealedDeck {
	sessionSeed: string;
	replayCode: string;
	corpusVersion: string;
	corpusManifestHash: string;
	engineVersion: string;
	genericStatements: readonly GeneratedStatement[];
	sealedStatements: readonly SealedStatement[];
	reservedEchoSlotId: 'echo-1';
	reservedFeedbackSlotIds: readonly ['feedback-1', 'feedback-2'];
}

export interface AnswerValue<Q extends QuestionId = QuestionId> {
	optionId: OptionIdFor<Q>;
	origin: 'demo-default' | 'user-selected';
}

export type AnswerState = Partial<{
	[Q in QuestionId]: AnswerValue<Q>;
}>;

export type DisplayProfile = Readonly<AnswerState>;

export interface GenerationProfile {
	sessionSeed: string;
	selfReports: Readonly<
		Partial<{
			[Q in SelfReportQuestionId]: OptionIdFor<Q>;
		}>
	>;
}

export interface RatingRecord {
	statementId: string;
	rating: FitRating;
	eventId: string;
	revisionOfEventId?: string;
}

export interface AuditEventBase {
	id: string;
	sequence: number;
	timestamp: string;
	branchId: string;
	parentBranchId?: string;
	causalEventIds: readonly string[];
}

export type PresentationGroup =
	| 'baseline'
	| 'later-generic'
	| 'direct-echo'
	| 'feedback-derivative';

export type ReservedSlotKind = 'direct-echo' | 'feedback-derivative';

export type ReservedSlotEmptyReason =
	| 'no-answer'
	| 'incompatible-answer'
	| 'no-eligible-feedback'
	| 'no-compatible-candidate';

export type ReservedSlotStatus =
	| { kind: 'pending' }
	| { kind: 'presented'; statementId: string }
	| { kind: 'empty'; reason: ReservedSlotEmptyReason }
	| { kind: 'abandoned'; reason: 'early-reveal' };

export interface ReservedPresentationSlot {
	slotId: string;
	kind: ReservedSlotKind;
	status: ReservedSlotStatus;
}

export interface PresentationHistoryEntry {
	presentationEventId: string;
	branchId: string;
	causalEventIds: readonly string[];
	group: PresentationGroup;
	statement: GeneratedStatement;
}

/**
 * Reducer-owned record of what the visitor was actually shown. The sealed deck remains immutable;
 * this ledger prevents a generated or reserved slot from being mistaken for a presented claim.
 */
export interface PresentationLedger {
	baselineStatementIds: readonly string[];
	laterStatementIds: readonly string[];
	presentedBaselineStatementIds: readonly string[];
	presentedLaterStatementIds: readonly string[];
	abandonedStatementIds: readonly string[];
	reservedSlots: readonly ReservedPresentationSlot[];
	history: readonly PresentationHistoryEntry[];
}

export type AuditEvent = AuditEventBase &
	(
		| { kind: 'began'; seedFingerprint: string }
		| {
				kind: 'statement-presented';
				statementId: string;
				slotId: string;
				group: PresentationGroup;
		  }
		| {
				kind: 'statement-abandoned';
				statementId: string;
				slotId: string;
				group: 'baseline' | 'later-generic';
				reason: 'early-reveal';
		  }
		| {
				kind: 'reserved-slot-empty';
				slotId: string;
				slotKind: ReservedSlotKind;
				reason: ReservedSlotEmptyReason;
		  }
		| {
				kind: 'reserved-slot-abandoned';
				slotId: string;
				slotKind: ReservedSlotKind;
				reason: 'early-reveal';
		  }
		| { kind: 'answered'; questionId: QuestionId; optionId: string; origin: 'user-selected' }
		| { kind: 'confirmed-default'; questionId: QuestionId; optionId: string }
		| { kind: 'skipped'; groupId: string }
		| { kind: 'rated'; statementId: string; rating: FitRating }
		| {
				kind: 'rating-revised';
				statementId: string;
				previousRating: FitRating;
				rating: FitRating;
		  }
		| { kind: 'continued'; from: LabStage; to: LabStage }
		| { kind: 'went-back'; from: LabStage; to: LabStage }
		| { kind: 'revealed'; from: LabStage }
		| { kind: 'derivative-created'; statementId: string; sourceStatementId: string }
		| { kind: 'counterfactual-applied'; changedQuestionIds: readonly QuestionId[] }
		| { kind: 'replayed'; replayCode: string }
	);

interface ActiveStateBase {
	displayProfile: DisplayProfile;
	deck: SealedDeck;
	ratings: readonly RatingRecord[];
	auditLog: readonly AuditEvent[];
	branchId: string;
	consumedActivationIds: readonly string[];
	presentation: PresentationLedger;
}

export interface IntroLabState {
	stage: 'intro';
	displayProfile: DisplayProfile;
	auditLog: readonly [];
	branchId: 'branch-0';
	consumedActivationIds: readonly string[];
}

export interface BaselineLabState extends ActiveStateBase {
	stage: 'baseline';
}

export interface FourCluesLabState extends ActiveStateBase {
	stage: 'four-clues';
}

export interface ApparentSharpeningLabState extends ActiveStateBase {
	stage: 'apparent-sharpening';
	directEcho?: GeneratedStatement;
	wholeReadingFit?: SixPointRating;
}

export interface FeedbackLabState extends ActiveStateBase {
	stage: 'feedback-and-counterfactual';
	directEcho?: GeneratedStatement;
	wholeReadingFit?: SixPointRating;
	derivatives: readonly GeneratedStatement[];
	counterfactualProfile?: DisplayProfile;
}

export interface RevealLabState extends ActiveStateBase {
	stage: 'reveal';
	directEcho?: GeneratedStatement;
	wholeReadingFit?: SixPointRating;
	derivatives: readonly GeneratedStatement[];
	counterfactualProfile?: DisplayProfile;
	visitorEstimatedBreadth?: BreadthEstimate;
	visitorRatedDistinctiveness?: SixPointRating;
}

export interface OpenLabState extends Omit<RevealLabState, 'stage'> {
	stage: 'open-lab';
}

export type LabState =
	| IntroLabState
	| BaselineLabState
	| FourCluesLabState
	| ApparentSharpeningLabState
	| FeedbackLabState
	| RevealLabState
	| OpenLabState;

export interface EventMeta {
	timestamp?: string;
	activationId?: string;
}

export type LabEvent =
	| { type: 'begin'; seed: string; meta?: EventMeta }
	| { type: 'present-baseline'; meta?: EventMeta }
	| { type: 'present-next-baseline'; meta?: EventMeta }
	| { type: 'present-next-claim'; meta?: EventMeta }
	| { type: 'present-direct-echo'; meta?: EventMeta }
	| { type: 'answer'; questionId: QuestionId; optionId: string; meta?: EventMeta }
	| { type: 'confirm-default'; questionId: QuestionId; meta?: EventMeta }
	| { type: 'skip'; groupId: string; meta?: EventMeta }
	| { type: 'rate'; statementId: string; rating: FitRating; meta?: EventMeta }
	| { type: 'revise-rating'; statementId: string; rating: FitRating; meta?: EventMeta }
	| { type: 'set-whole-reading-fit'; value: SixPointRating; meta?: EventMeta }
	| { type: 'set-breadth'; value: BreadthEstimate; meta?: EventMeta }
	| { type: 'set-distinctiveness'; value: SixPointRating; meta?: EventMeta }
	| { type: 'continue'; meta?: EventMeta }
	| { type: 'back'; meta?: EventMeta }
	| { type: 'reveal-now'; meta?: EventMeta }
	| { type: 'create-derivative'; sourceStatementId: string; meta?: EventMeta }
	| { type: 'apply-counterfactual'; meta?: EventMeta }
	| { type: 'replay'; meta?: EventMeta }
	| { type: 'reset'; meta?: EventMeta };

export type TransitionResult =
	| { ok: true; state: LabState }
	| {
			ok: false;
			state: LabState;
			reason: 'invalid-transition' | 'invalid-input' | 'duplicate-activation' | 'not-found';
	  };

export interface ReadingMetrics {
	statementCount: number;
	semanticClauseCount: number;
	unsupportedGenericClauseCount: number;
	directEchoClauseCount: number;
	sealedClauseCount: number;
	feedbackSelectedClauseCount: number;
	hedgedClauseCount: number;
	elaboratedClauseCount: number;
	unusedInputCount: number;
	presentationOnlyInputCount: number;
	nonFitsOmittedFromPolishedSummaryCount: number;
	distinctContentAxisCount: number;
	uniqueTechniqueCount: number;
	demographicCounterfactualSemanticIdOverlap: number;
	selfReportCounterfactualChangeCount: number;
	fitRatings: Record<FitRating, number>;
	wholeReadingFit?: SixPointRating;
	visitorEstimatedBreadth?: BreadthEstimate;
	visitorRatedDistinctiveness?: SixPointRating;
}
