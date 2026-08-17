import { canDriveFeedback, deriveFromFeedback } from './adapt-feedback';
import { createDemographicCounterfactual } from './counterfactual';
import {
	createDefaultDisplayProfile,
	isQuestionId,
	isValidOption,
	setAnswer,
	toGenerationProfile
} from './input-boundary';
import { normalizeSeed64 } from './seeded-rng';
import { directEchoIsCompatible, generateDirectEcho, sealGenericDeck } from './select-reading';
import type {
	ApparentSharpeningLabState,
	AuditEvent,
	EventMeta,
	FeedbackLabState,
	GeneratedStatement,
	LabEvent,
	LabStage,
	LabState,
	PresentationHistoryEntry,
	PresentationLedger,
	RatingRecord,
	ReservedSlotEmptyReason,
	ReservedSlotKind,
	ReservedSlotStatus,
	RevealLabState,
	SealedDeck,
	TransitionResult
} from './types';

export function createInitialLabState(): LabState {
	return {
		stage: 'intro',
		displayProfile: createDefaultDisplayProfile(),
		auditLog: [],
		branchId: 'branch-0',
		consumedActivationIds: []
	};
}

function auditBase(
	state: LabState,
	meta: EventMeta | undefined,
	branchId = state.branchId,
	causalEventIds: readonly string[] = []
) {
	return auditBaseAt(state, meta, 0, branchId, causalEventIds);
}

function auditBaseAt(
	state: LabState,
	meta: EventMeta | undefined,
	offset: number,
	branchId = state.branchId,
	causalEventIds: readonly string[] = []
) {
	const sequence = state.auditLog.length + offset + 1;
	return {
		id: 'event-' + String(sequence).padStart(4, '0'),
		sequence,
		timestamp: meta?.timestamp ?? '',
		branchId,
		causalEventIds
	};
}

function createPresentationLedger(
	deck: SealedDeck,
	history: readonly PresentationHistoryEntry[] = []
): PresentationLedger {
	return {
		baselineStatementIds: deck.genericStatements
			.slice(0, 3)
			.map((statement) => statement.statementId),
		laterStatementIds: deck.genericStatements.slice(3, 7).map((statement) => statement.statementId),
		presentedBaselineStatementIds: [],
		presentedLaterStatementIds: [],
		abandonedStatementIds: [],
		reservedSlots: [
			{ slotId: deck.reservedEchoSlotId, kind: 'direct-echo', status: { kind: 'pending' } },
			...deck.reservedFeedbackSlotIds.map((slotId) => ({
				slotId,
				kind: 'feedback-derivative' as const,
				status: { kind: 'pending' as const }
			}))
		],
		history
	};
}

function historyEntry(
	audit: Extract<AuditEvent, { kind: 'statement-presented' }>,
	statement: GeneratedStatement
): PresentationHistoryEntry {
	return {
		presentationEventId: audit.id,
		branchId: audit.branchId,
		causalEventIds: audit.causalEventIds,
		group: audit.group,
		statement
	};
}

function withReservedSlotStatus(
	presentation: PresentationLedger,
	slotId: string,
	status: ReservedSlotStatus
): PresentationLedger {
	return {
		...presentation,
		reservedSlots: presentation.reservedSlots.map((slot) =>
			slot.slotId === slotId ? { ...slot, status } : slot
		)
	};
}

function resetReservedSlotKinds(
	presentation: PresentationLedger,
	kinds: readonly ReservedSlotKind[]
): PresentationLedger {
	const resetKinds = new Set(kinds);
	return {
		...presentation,
		reservedSlots: presentation.reservedSlots.map((slot) =>
			resetKinds.has(slot.kind) ? { ...slot, status: { kind: 'pending' as const } } : slot
		)
	};
}

function allExpectedPresented(expected: readonly string[], presented: readonly string[]): boolean {
	if (expected.length !== presented.length) return false;
	const presentedIds = new Set(presented);
	return expected.every((statementId) => presentedIds.has(statementId));
}

function branchStartEventId(state: Exclude<LabState, { stage: 'intro' }>): string | undefined {
	return [...state.auditLog]
		.reverse()
		.find(
			(event) =>
				event.branchId === state.branchId && (event.kind === 'began' || event.kind === 'replayed')
		)?.id;
}

function apparentStageEntryEventId(state: ApparentSharpeningLabState): string | undefined {
	return [...state.auditLog]
		.reverse()
		.find(
			(event) =>
				event.branchId === state.branchId &&
				event.kind === 'continued' &&
				event.to === 'apparent-sharpening'
		)?.id;
}

function latestEligibleFeedbackCount(
	ratings: readonly RatingRecord[],
	sourceStatementIds: ReadonlySet<string>
): number {
	const latestByStatement = new Map<string, RatingRecord>();
	for (const rating of ratings) latestByStatement.set(rating.statementId, rating);
	return [...latestByStatement.values()].filter(
		(rating) => sourceStatementIds.has(rating.statementId) && canDriveFeedback(rating.rating)
	).length;
}

function stageStatements(state: LabState): readonly GeneratedStatement[] {
	if (state.stage === 'intro') return [];
	const presentedGenericIds = new Set([
		...state.presentation.presentedBaselineStatementIds,
		...state.presentation.presentedLaterStatementIds
	]);
	const presentedGenericStatements = state.deck.genericStatements.filter((statement) =>
		presentedGenericIds.has(statement.statementId)
	);
	if (state.stage === 'baseline' || state.stage === 'four-clues') {
		const baselineIds = new Set(state.presentation.baselineStatementIds);
		return presentedGenericStatements.filter((statement) => baselineIds.has(statement.statementId));
	}
	const extra =
		state.stage === 'apparent-sharpening'
			? state.directEcho
				? [state.directEcho]
				: []
			: state.stage === 'feedback-and-counterfactual' ||
				  state.stage === 'reveal' ||
				  state.stage === 'open-lab'
				? [...(state.directEcho ? [state.directEcho] : []), ...state.derivatives]
				: [];
	return [...presentedGenericStatements, ...extra];
}

const FIT_RATINGS = new Set(['does-not-fit', 'partly-fits', 'fits', 'too-vague', 'unrated']);
const BREADTH_ESTIMATES = new Set(['almost-nobody', 'few', 'many', 'almost-everybody']);

function isSixPointRating(value: unknown): value is 0 | 1 | 2 | 3 | 4 | 5 {
	return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 5;
}

function validMeta(meta: EventMeta | undefined): boolean {
	if (!meta) return true;
	if (
		meta.activationId !== undefined &&
		(typeof meta.activationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(meta.activationId))
	) {
		return false;
	}
	return (
		meta.timestamp === undefined ||
		(typeof meta.timestamp === 'string' &&
			meta.timestamp.length <= 40 &&
			!/[<>]/.test(meta.timestamp))
	);
}

function activationAlreadyConsumed(state: LabState, event: LabEvent): boolean {
	return Boolean(
		event.meta?.activationId && state.consumedActivationIds.includes(event.meta.activationId)
	);
}

function consumeActivation<T extends LabState>(state: T, event: LabEvent): T {
	if (!event.meta?.activationId) return state;
	return {
		...state,
		consumedActivationIds: [...state.consumedActivationIds, event.meta.activationId]
	} as T;
}

function invalid(
	state: LabState,
	reason: Extract<TransitionResult, { ok: false }>['reason']
): TransitionResult {
	return { ok: false, state, reason };
}

function nextStage(stage: LabStage): LabStage | undefined {
	const stages: Record<LabStage, LabStage | undefined> = {
		intro: 'baseline',
		baseline: 'four-clues',
		'four-clues': 'apparent-sharpening',
		'apparent-sharpening': 'feedback-and-counterfactual',
		'feedback-and-counterfactual': 'reveal',
		reveal: 'open-lab',
		'open-lab': undefined
	};
	return stages[stage];
}

function previousStage(stage: LabStage): LabStage | undefined {
	const stages: Record<LabStage, LabStage | undefined> = {
		intro: undefined,
		baseline: undefined,
		'four-clues': 'baseline',
		'apparent-sharpening': 'four-clues',
		'feedback-and-counterfactual': 'apparent-sharpening',
		reveal: 'feedback-and-counterfactual',
		'open-lab': 'reveal'
	};
	return stages[stage];
}

function revealState(
	state: Exclude<LabState, { stage: 'intro' }>,
	event: LabEvent
): RevealLabState {
	const directEcho =
		state.stage === 'apparent-sharpening' ||
		state.stage === 'feedback-and-counterfactual' ||
		state.stage === 'reveal' ||
		state.stage === 'open-lab'
			? state.directEcho
			: undefined;
	const wholeReadingFit =
		state.stage === 'apparent-sharpening' ||
		state.stage === 'feedback-and-counterfactual' ||
		state.stage === 'reveal' ||
		state.stage === 'open-lab'
			? state.wholeReadingFit
			: undefined;
	const derivatives =
		state.stage === 'feedback-and-counterfactual' ||
		state.stage === 'reveal' ||
		state.stage === 'open-lab'
			? state.derivatives
			: [];
	const counterfactualProfile =
		state.stage === 'feedback-and-counterfactual' ||
		state.stage === 'reveal' ||
		state.stage === 'open-lab'
			? state.counterfactualProfile
			: undefined;
	const audit: AuditEvent = {
		...auditBase(state, event.meta),
		kind: 'revealed',
		from: state.stage
	};
	const presentedStatementIds = new Set([
		...state.presentation.presentedBaselineStatementIds,
		...state.presentation.presentedLaterStatementIds,
		...state.presentation.abandonedStatementIds
	]);
	const unpresentedStatementIds = [
		...state.presentation.baselineStatementIds,
		...state.presentation.laterStatementIds
	].filter((statementId) => !presentedStatementIds.has(statementId));
	const pendingReservedSlots = state.presentation.reservedSlots.filter(
		(slot) => slot.status.kind === 'pending'
	);
	const abandonedStatementAudits: AuditEvent[] = unpresentedStatementIds.map(
		(statementId, index) => {
			const statement = state.deck.genericStatements.find(
				(candidate) => candidate.statementId === statementId
			);
			return {
				...auditBaseAt(state, event.meta, index + 1, state.branchId, [audit.id]),
				kind: 'statement-abandoned',
				statementId,
				slotId: statement?.slotId ?? '',
				group: state.presentation.baselineStatementIds.includes(statementId)
					? 'baseline'
					: 'later-generic',
				reason: 'early-reveal'
			};
		}
	);
	const abandonedReservedAudits: AuditEvent[] = pendingReservedSlots.map((slot, index) => ({
		...auditBaseAt(state, event.meta, abandonedStatementAudits.length + index + 1, state.branchId, [
			audit.id
		]),
		kind: 'reserved-slot-abandoned',
		slotId: slot.slotId,
		slotKind: slot.kind,
		reason: 'early-reveal'
	}));
	const presentation: PresentationLedger = {
		...state.presentation,
		abandonedStatementIds: [
			...state.presentation.abandonedStatementIds,
			...unpresentedStatementIds
		],
		reservedSlots: state.presentation.reservedSlots.map((slot) =>
			slot.status.kind === 'pending'
				? { ...slot, status: { kind: 'abandoned' as const, reason: 'early-reveal' as const } }
				: slot
		)
	};
	return consumeActivation(
		{
			stage: 'reveal',
			displayProfile: state.displayProfile,
			deck: state.deck,
			ratings: state.ratings,
			auditLog: [...state.auditLog, audit, ...abandonedStatementAudits, ...abandonedReservedAudits],
			branchId: state.branchId,
			consumedActivationIds: state.consumedActivationIds,
			presentation,
			directEcho,
			wholeReadingFit,
			derivatives,
			counterfactualProfile
		},
		event
	);
}

function activeFields(
	state: Exclude<LabState, { stage: 'intro' }>,
	auditLog: readonly AuditEvent[]
) {
	return {
		displayProfile: state.displayProfile,
		deck: state.deck,
		ratings: state.ratings,
		auditLog,
		branchId: state.branchId,
		consumedActivationIds: state.consumedActivationIds,
		presentation: state.presentation
	};
}

export function transitionLabState(state: LabState, event: LabEvent): TransitionResult {
	if (
		!event ||
		typeof event !== 'object' ||
		typeof event.type !== 'string' ||
		!validMeta(event.meta)
	) {
		return invalid(state, 'invalid-input');
	}
	if (activationAlreadyConsumed(state, event)) return invalid(state, 'duplicate-activation');
	if (event.type === 'reset') return { ok: true, state: createInitialLabState() };

	if (event.type === 'begin') {
		if (state.stage !== 'intro') return invalid(state, 'invalid-transition');
		let seed: string;
		try {
			seed = normalizeSeed64(event.seed);
		} catch {
			return invalid(state, 'invalid-input');
		}
		const deck = sealGenericDeck(toGenerationProfile(state.displayProfile, seed));
		const audit: AuditEvent = {
			...auditBase(state, event.meta),
			kind: 'began',
			seedFingerprint: deck.replayCode.slice(-6)
		};
		return {
			ok: true,
			state: consumeActivation(
				{
					stage: 'baseline',
					displayProfile: state.displayProfile,
					deck,
					ratings: [],
					auditLog: [audit],
					branchId: state.branchId,
					consumedActivationIds: state.consumedActivationIds,
					presentation: createPresentationLedger(deck)
				},
				event
			)
		};
	}

	if (state.stage === 'intro') return invalid(state, 'invalid-transition');

	if (event.type === 'present-baseline') {
		if (state.stage !== 'baseline') return invalid(state, 'invalid-transition');
		if (
			state.presentation.presentedBaselineStatementIds.length > 0 ||
			state.presentation.baselineStatementIds.some((statementId) =>
				state.presentation.abandonedStatementIds.includes(statementId)
			)
		) {
			return invalid(state, 'invalid-transition');
		}
		const statements: GeneratedStatement[] = [];
		for (const statementId of state.presentation.baselineStatementIds) {
			const statement = state.deck.genericStatements.find(
				(candidate) => candidate.statementId === statementId
			);
			if (!statement) return invalid(state, 'not-found');
			statements.push(statement);
		}
		const branchStartId = branchStartEventId(state);
		const audits: Extract<AuditEvent, { kind: 'statement-presented' }>[] = statements.map(
			(statement, index) => ({
				...auditBaseAt(
					state,
					event.meta,
					index,
					state.branchId,
					branchStartId ? [branchStartId] : []
				),
				kind: 'statement-presented',
				statementId: statement.statementId,
				slotId: statement.slotId,
				group: 'baseline'
			})
		);
		return {
			ok: true,
			state: consumeActivation(
				{
					...state,
					presentation: {
						...state.presentation,
						presentedBaselineStatementIds: [...state.presentation.baselineStatementIds],
						history: [
							...state.presentation.history,
							...audits.map((audit, index) => historyEntry(audit, statements[index]))
						]
					},
					auditLog: [...state.auditLog, ...audits]
				},
				event
			)
		};
	}

	if (event.type === 'present-next-claim') {
		if (state.stage !== 'apparent-sharpening') {
			return invalid(state, 'invalid-transition');
		}
		const nextStatementId =
			state.presentation.laterStatementIds[state.presentation.presentedLaterStatementIds.length];
		if (!nextStatementId || state.presentation.abandonedStatementIds.includes(nextStatementId)) {
			return invalid(state, 'invalid-transition');
		}
		const statement = state.deck.genericStatements.find(
			(candidate) => candidate.statementId === nextStatementId
		);
		if (!statement) return invalid(state, 'not-found');
		const stageEntryId = apparentStageEntryEventId(state);
		const audit: Extract<AuditEvent, { kind: 'statement-presented' }> = {
			...auditBase(state, event.meta, state.branchId, stageEntryId ? [stageEntryId] : []),
			kind: 'statement-presented',
			statementId: statement.statementId,
			slotId: statement.slotId,
			group: 'later-generic'
		};
		return {
			ok: true,
			state: consumeActivation(
				{
					...state,
					presentation: {
						...state.presentation,
						presentedLaterStatementIds: [
							...state.presentation.presentedLaterStatementIds,
							nextStatementId
						],
						history: [...state.presentation.history, historyEntry(audit, statement)]
					},
					auditLog: [...state.auditLog, audit]
				},
				event
			)
		};
	}

	if (event.type === 'present-direct-echo') {
		if (state.stage !== 'open-lab') return invalid(state, 'invalid-transition');
		const answerAudit = [...state.auditLog]
			.reverse()
			.find(
				(candidate) =>
					candidate.branchId === state.branchId &&
					candidate.kind === 'answered' &&
					candidate.questionId === 'planning_style'
			);
		if (!answerAudit) return invalid(state, 'invalid-transition');
		const answerAlreadyResolved = state.auditLog.some(
			(candidate) =>
				candidate.causalEventIds.includes(answerAudit.id) &&
				((candidate.kind === 'statement-presented' && candidate.group === 'direct-echo') ||
					(candidate.kind === 'reserved-slot-empty' &&
						candidate.slotId === state.deck.reservedEchoSlotId))
		);
		if (answerAlreadyResolved) return invalid(state, 'invalid-transition');

		const directEcho = generateDirectEcho(
			toGenerationProfile(state.displayProfile, state.deck.sessionSeed),
			'planning_style',
			state.deck.genericStatements
		);
		if (directEcho) {
			const audit: Extract<AuditEvent, { kind: 'statement-presented' }> = {
				...auditBase(state, event.meta, state.branchId, [answerAudit.id]),
				kind: 'statement-presented',
				statementId: directEcho.statementId,
				slotId: directEcho.slotId,
				group: 'direct-echo'
			};
			return {
				ok: true,
				state: consumeActivation(
					{
						...state,
						directEcho,
						presentation: {
							...withReservedSlotStatus(state.presentation, state.deck.reservedEchoSlotId, {
								kind: 'presented',
								statementId: directEcho.statementId
							}),
							history: [...state.presentation.history, historyEntry(audit, directEcho)]
						},
						auditLog: [...state.auditLog, audit]
					},
					event
				)
			};
		}

		const planningAnswer = state.displayProfile.planning_style;
		const reason: ReservedSlotEmptyReason = !planningAnswer
			? 'no-answer'
			: !directEchoIsCompatible(
						'planning_style',
						planningAnswer.optionId,
						state.deck.genericStatements
				  )
				? 'incompatible-answer'
				: 'no-compatible-candidate';
		const audit: AuditEvent = {
			...auditBase(state, event.meta, state.branchId, [answerAudit.id]),
			kind: 'reserved-slot-empty',
			slotId: state.deck.reservedEchoSlotId,
			slotKind: 'direct-echo',
			reason
		};
		return {
			ok: true,
			state: consumeActivation(
				{
					...state,
					directEcho: undefined,
					presentation: withReservedSlotStatus(state.presentation, state.deck.reservedEchoSlotId, {
						kind: 'empty',
						reason
					}),
					auditLog: [...state.auditLog, audit]
				},
				event
			)
		};
	}

	if (event.type === 'answer') {
		if (!isQuestionId(event.questionId) || !isValidOption(event.questionId, event.optionId)) {
			return invalid(state, 'invalid-input');
		}
		const existing = state.displayProfile[event.questionId];
		if (existing?.origin === 'user-selected' && existing.optionId === event.optionId) {
			return invalid(state, 'invalid-transition');
		}
		const displayProfile = setAnswer(
			state.displayProfile,
			event.questionId,
			event.optionId,
			'user-selected'
		);
		if (!displayProfile) return invalid(state, 'invalid-input');
		const createsChildBranch = state.stage === 'reveal' || state.stage === 'open-lab';
		const branchId = createsChildBranch
			? 'branch-' + String(state.auditLog.length + 1)
			: state.branchId;
		const audit: AuditEvent = {
			...auditBase(state, event.meta, branchId),
			...(createsChildBranch ? { parentBranchId: state.branchId } : {}),
			kind: 'answered',
			questionId: event.questionId,
			optionId: event.optionId,
			origin: 'user-selected'
		};
		return {
			ok: true,
			state: consumeActivation(
				{ ...state, branchId, displayProfile, auditLog: [...state.auditLog, audit] },
				event
			)
		};
	}

	if (event.type === 'confirm-default') {
		if (!isQuestionId(event.questionId)) return invalid(state, 'invalid-input');
		const current = state.displayProfile[event.questionId];
		if (!current || current.origin !== 'demo-default') return invalid(state, 'invalid-input');
		const displayProfile = setAnswer(
			state.displayProfile,
			event.questionId,
			current.optionId,
			'user-selected'
		);
		if (!displayProfile) return invalid(state, 'invalid-input');
		const audit: AuditEvent = {
			...auditBase(state, event.meta),
			kind: 'confirmed-default',
			questionId: event.questionId,
			optionId: current.optionId
		};
		return {
			ok: true,
			state: consumeActivation(
				{ ...state, displayProfile, auditLog: [...state.auditLog, audit] },
				event
			)
		};
	}

	if (event.type === 'skip') {
		if (typeof event.groupId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(event.groupId)) {
			return invalid(state, 'invalid-input');
		}
		if (event.groupId !== 'four-clues') return invalid(state, 'invalid-input');
		if (state.stage !== 'four-clues') return invalid(state, 'invalid-transition');
		const audit: AuditEvent = {
			...auditBase(state, event.meta),
			kind: 'skipped',
			groupId: event.groupId
		};
		return {
			ok: true,
			state: consumeActivation({ ...state, auditLog: [...state.auditLog, audit] }, event)
		};
	}

	if (event.type === 'rate' || event.type === 'revise-rating') {
		if (typeof event.statementId !== 'string' || !FIT_RATINGS.has(event.rating)) {
			return invalid(state, 'invalid-input');
		}
		if (!stageStatements(state).some((statement) => statement.statementId === event.statementId)) {
			return invalid(state, 'not-found');
		}
		const previous = [...state.ratings]
			.reverse()
			.find((rating) => rating.statementId === event.statementId);
		if (event.type === 'rate' && previous) return invalid(state, 'invalid-transition');
		if (event.type === 'revise-rating' && !previous) return invalid(state, 'invalid-transition');
		const branchId =
			event.type === 'revise-rating' && (state.stage === 'reveal' || state.stage === 'open-lab')
				? 'branch-' + String(state.auditLog.length + 1)
				: state.branchId;
		const base = auditBase(state, event.meta, branchId, previous ? [previous.eventId] : []);
		const audit: AuditEvent = previous
			? {
					...base,
					kind: 'rating-revised',
					statementId: event.statementId,
					previousRating: previous.rating,
					rating: event.rating,
					...(branchId !== state.branchId ? { parentBranchId: state.branchId } : {})
				}
			: { ...base, kind: 'rated', statementId: event.statementId, rating: event.rating };
		const record: RatingRecord = {
			statementId: event.statementId,
			rating: event.rating,
			eventId: audit.id,
			revisionOfEventId: previous?.eventId
		};
		return {
			ok: true,
			state: consumeActivation(
				{
					...state,
					branchId,
					ratings: [...state.ratings, record],
					auditLog: [...state.auditLog, audit]
				},
				event
			)
		};
	}

	if (event.type === 'set-whole-reading-fit') {
		if (!isSixPointRating(event.value)) return invalid(state, 'invalid-input');
		if (
			state.stage !== 'apparent-sharpening' &&
			state.stage !== 'feedback-and-counterfactual' &&
			state.stage !== 'reveal' &&
			state.stage !== 'open-lab'
		) {
			return invalid(state, 'invalid-transition');
		}
		return {
			ok: true,
			state: consumeActivation({ ...state, wholeReadingFit: event.value }, event)
		};
	}

	if (event.type === 'set-breadth' || event.type === 'set-distinctiveness') {
		if (
			(event.type === 'set-breadth' && !BREADTH_ESTIMATES.has(event.value)) ||
			(event.type === 'set-distinctiveness' && !isSixPointRating(event.value))
		) {
			return invalid(state, 'invalid-input');
		}
		if (state.stage !== 'reveal' && state.stage !== 'open-lab') {
			return invalid(state, 'invalid-transition');
		}
		const next =
			event.type === 'set-breadth'
				? { ...state, visitorEstimatedBreadth: event.value }
				: { ...state, visitorRatedDistinctiveness: event.value };
		return { ok: true, state: consumeActivation(next, event) };
	}

	if (event.type === 'reveal-now') {
		if (state.stage === 'reveal' || state.stage === 'open-lab') {
			return invalid(state, 'invalid-transition');
		}
		return { ok: true, state: revealState(state, event) };
	}

	if (event.type === 'apply-counterfactual') {
		if (
			state.stage !== 'feedback-and-counterfactual' &&
			state.stage !== 'reveal' &&
			state.stage !== 'open-lab'
		) {
			return invalid(state, 'invalid-transition');
		}
		if (state.counterfactualProfile !== undefined) {
			return invalid(state, 'invalid-transition');
		}
		const counterfactual = createDemographicCounterfactual(state.displayProfile);
		const audit: AuditEvent = {
			...auditBase(state, event.meta),
			kind: 'counterfactual-applied',
			changedQuestionIds: counterfactual.changedQuestionIds
		};
		return {
			ok: true,
			state: consumeActivation(
				{
					...state,
					counterfactualProfile: counterfactual.profile,
					auditLog: [...state.auditLog, audit]
				},
				event
			)
		};
	}

	if (event.type === 'create-derivative') {
		if (
			state.stage !== 'feedback-and-counterfactual' &&
			state.stage !== 'reveal' &&
			state.stage !== 'open-lab'
		) {
			return invalid(state, 'invalid-transition');
		}
		if (
			state.derivatives.length >= state.deck.reservedFeedbackSlotIds.length ||
			state.derivatives.some(
				(derivative) => derivative.parentStatementId === event.sourceStatementId
			)
		) {
			return invalid(state, 'invalid-transition');
		}
		const allSources = [
			...state.deck.genericStatements,
			...(state.directEcho ? [state.directEcho] : [])
		];
		const generated = deriveFromFeedback(
			allSources,
			state.ratings.filter((rating) => rating.statementId === event.sourceStatementId),
			toGenerationProfile(state.displayProfile, state.deck.sessionSeed),
			1,
			state.derivatives.length
		)[0];
		if (!generated) return invalid(state, 'not-found');
		const audit: AuditEvent = {
			...auditBase(state, event.meta, state.branchId, [
				generated.version.transformation.kind === 'feedback-derivative'
					? generated.version.transformation.ratingEventId
					: ''
			]),
			kind: 'derivative-created',
			statementId: generated.statementId,
			sourceStatementId: event.sourceStatementId
		};
		if (!state.presentation.reservedSlots.some((slot) => slot.slotId === generated.slotId)) {
			return invalid(state, 'not-found');
		}
		const presentationAudit: Extract<AuditEvent, { kind: 'statement-presented' }> = {
			...auditBaseAt(state, event.meta, 1, state.branchId, [audit.id]),
			kind: 'statement-presented',
			statementId: generated.statementId,
			slotId: generated.slotId,
			group: 'feedback-derivative'
		};
		return {
			ok: true,
			state: consumeActivation(
				{
					...state,
					derivatives: [...state.derivatives, generated],
					presentation: {
						...withReservedSlotStatus(state.presentation, generated.slotId, {
							kind: 'presented',
							statementId: generated.statementId
						}),
						history: [...state.presentation.history, historyEntry(presentationAudit, generated)]
					},
					auditLog: [...state.auditLog, audit, presentationAudit]
				},
				event
			)
		};
	}

	if (event.type === 'replay') {
		if (state.stage !== 'reveal' && state.stage !== 'open-lab') {
			return invalid(state, 'invalid-transition');
		}
		const newBranchId = 'branch-' + String(state.auditLog.length + 1);
		const audit: AuditEvent = {
			...auditBase(state, event.meta, newBranchId),
			parentBranchId: state.branchId,
			kind: 'replayed',
			replayCode: state.deck.replayCode
		};
		const deck = sealGenericDeck(
			toGenerationProfile(state.displayProfile, state.deck.sessionSeed),
			state.deck.genericStatements.length
		);
		return {
			ok: true,
			state: consumeActivation(
				{
					stage: 'baseline',
					displayProfile: state.displayProfile,
					deck,
					ratings: [],
					auditLog: [...state.auditLog, audit],
					branchId: newBranchId,
					consumedActivationIds: state.consumedActivationIds,
					presentation: createPresentationLedger(deck, state.presentation.history)
				},
				event
			)
		};
	}

	if (event.type === 'continue') {
		if (
			state.stage === 'baseline' &&
			!allExpectedPresented(
				state.presentation.baselineStatementIds,
				state.presentation.presentedBaselineStatementIds
			)
		) {
			return invalid(state, 'invalid-transition');
		}
		if (
			state.stage === 'apparent-sharpening' &&
			!allExpectedPresented(
				state.presentation.laterStatementIds,
				state.presentation.presentedLaterStatementIds
			)
		) {
			return invalid(state, 'invalid-transition');
		}
		const target = nextStage(state.stage);
		if (!target) return invalid(state, 'invalid-transition');
		const audit: AuditEvent = {
			...auditBase(state, event.meta),
			kind: 'continued',
			from: state.stage,
			to: target
		};
		const base = { ...state, auditLog: [...state.auditLog, audit] };
		let next: LabState;
		if (target === 'four-clues') next = { ...base, stage: 'four-clues' };
		else if (target === 'apparent-sharpening') {
			const generationProfile = toGenerationProfile(state.displayProfile, state.deck.sessionSeed);
			const directEcho = generateDirectEcho(
				generationProfile,
				'planning_style',
				state.deck.genericStatements
			);
			let presentation = state.presentation;
			let echoAudit: AuditEvent;
			if (directEcho) {
				const presentedAudit: Extract<AuditEvent, { kind: 'statement-presented' }> = {
					...auditBaseAt(state, event.meta, 1, state.branchId, [audit.id]),
					kind: 'statement-presented',
					statementId: directEcho.statementId,
					slotId: directEcho.slotId,
					group: 'direct-echo'
				};
				echoAudit = presentedAudit;
				presentation = {
					...withReservedSlotStatus(presentation, state.deck.reservedEchoSlotId, {
						kind: 'presented',
						statementId: directEcho.statementId
					}),
					history: [...presentation.history, historyEntry(presentedAudit, directEcho)]
				};
			} else {
				const planningAnswer = state.displayProfile.planning_style;
				const reason: ReservedSlotEmptyReason = !planningAnswer
					? 'no-answer'
					: !directEchoIsCompatible(
								'planning_style',
								planningAnswer.optionId,
								state.deck.genericStatements
						  )
						? 'incompatible-answer'
						: 'no-compatible-candidate';
				echoAudit = {
					...auditBaseAt(state, event.meta, 1, state.branchId, [audit.id]),
					kind: 'reserved-slot-empty',
					slotId: state.deck.reservedEchoSlotId,
					slotKind: 'direct-echo',
					reason
				};
				presentation = withReservedSlotStatus(presentation, state.deck.reservedEchoSlotId, {
					kind: 'empty',
					reason
				});
			}
			next = {
				...base,
				stage: 'apparent-sharpening',
				directEcho,
				presentation,
				auditLog: [...base.auditLog, echoAudit]
			};
		} else if (target === 'feedback-and-counterfactual') {
			const apparent = state as ApparentSharpeningLabState;
			const sources = [
				...state.deck.genericStatements,
				...(apparent.directEcho ? [apparent.directEcho] : [])
			];
			const derivatives = deriveFromFeedback(
				sources,
				state.ratings,
				toGenerationProfile(state.displayProfile, state.deck.sessionSeed),
				2
			);
			const additionalAudits: AuditEvent[] = [];
			const historyEntries: PresentationHistoryEntry[] = [];
			let presentation = state.presentation;
			let auditOffset = 1;
			for (const derivative of derivatives) {
				const transformation = derivative.version.transformation;
				const ratingEventId =
					transformation.kind === 'feedback-derivative' ? transformation.ratingEventId : '';
				const derivativeAudit: AuditEvent = {
					...auditBaseAt(
						state,
						event.meta,
						auditOffset,
						state.branchId,
						ratingEventId ? [ratingEventId] : []
					),
					kind: 'derivative-created',
					statementId: derivative.statementId,
					sourceStatementId: derivative.parentStatementId ?? ''
				};
				auditOffset += 1;
				const presentationAudit: Extract<AuditEvent, { kind: 'statement-presented' }> = {
					...auditBaseAt(state, event.meta, auditOffset, state.branchId, [derivativeAudit.id]),
					kind: 'statement-presented',
					statementId: derivative.statementId,
					slotId: derivative.slotId,
					group: 'feedback-derivative'
				};
				auditOffset += 1;
				additionalAudits.push(derivativeAudit, presentationAudit);
				historyEntries.push(historyEntry(presentationAudit, derivative));
				presentation = withReservedSlotStatus(presentation, derivative.slotId, {
					kind: 'presented',
					statementId: derivative.statementId
				});
			}
			const sourceStatementIds = new Set(sources.map((source) => source.statementId));
			const eligibleFeedbackCount = latestEligibleFeedbackCount(state.ratings, sourceStatementIds);
			let compatibleCandidateMisses = Math.max(0, eligibleFeedbackCount - derivatives.length);
			for (const slotId of state.deck.reservedFeedbackSlotIds) {
				if (derivatives.some((derivative) => derivative.slotId === slotId)) continue;
				const reason: ReservedSlotEmptyReason =
					compatibleCandidateMisses > 0 ? 'no-compatible-candidate' : 'no-eligible-feedback';
				compatibleCandidateMisses = Math.max(0, compatibleCandidateMisses - 1);
				const emptyAudit: AuditEvent = {
					...auditBaseAt(state, event.meta, auditOffset, state.branchId, [audit.id]),
					kind: 'reserved-slot-empty',
					slotId,
					slotKind: 'feedback-derivative',
					reason
				};
				auditOffset += 1;
				additionalAudits.push(emptyAudit);
				presentation = withReservedSlotStatus(presentation, slotId, {
					kind: 'empty',
					reason
				});
			}
			next = {
				...base,
				stage: 'feedback-and-counterfactual',
				directEcho: apparent.directEcho,
				wholeReadingFit: apparent.wholeReadingFit,
				derivatives,
				presentation: {
					...presentation,
					history: [...state.presentation.history, ...historyEntries]
				},
				auditLog: [...base.auditLog, ...additionalAudits]
			};
		} else if (target === 'reveal') {
			const feedback = state as FeedbackLabState;
			next = {
				...base,
				stage: 'reveal',
				directEcho: feedback.directEcho,
				wholeReadingFit: feedback.wholeReadingFit,
				derivatives: feedback.derivatives,
				counterfactualProfile: feedback.counterfactualProfile
			};
		} else if (target === 'open-lab') {
			next = { ...(state as RevealLabState), ...base, stage: 'open-lab' };
		} else return invalid(state, 'invalid-transition');
		return { ok: true, state: consumeActivation(next, event) };
	}

	if (event.type === 'back') {
		const target = previousStage(state.stage);
		if (!target) return invalid(state, 'invalid-transition');
		const audit: AuditEvent = {
			...auditBase(state, event.meta),
			kind: 'went-back',
			from: state.stage,
			to: target
		};
		const base = activeFields(state, [...state.auditLog, audit]);
		let next: LabState;
		if (target === 'baseline') {
			next = {
				...base,
				stage: 'baseline',
				presentation: resetReservedSlotKinds(base.presentation, [
					'direct-echo',
					'feedback-derivative'
				])
			};
		} else if (target === 'four-clues') {
			next = {
				...base,
				stage: 'four-clues',
				presentation: resetReservedSlotKinds(base.presentation, [
					'direct-echo',
					'feedback-derivative'
				])
			};
		} else if (target === 'apparent-sharpening') {
			next = {
				...base,
				stage: 'apparent-sharpening',
				presentation: resetReservedSlotKinds(base.presentation, ['feedback-derivative']),
				directEcho: state.stage === 'feedback-and-counterfactual' ? state.directEcho : undefined,
				wholeReadingFit:
					state.stage === 'feedback-and-counterfactual' ? state.wholeReadingFit : undefined
			};
		} else if (target === 'feedback-and-counterfactual') {
			const reveal = state as RevealLabState;
			next = {
				...base,
				stage: 'feedback-and-counterfactual',
				directEcho: reveal.directEcho,
				wholeReadingFit: reveal.wholeReadingFit,
				derivatives: reveal.derivatives,
				counterfactualProfile: reveal.counterfactualProfile
			};
		} else if (target === 'reveal') {
			const open = state as RevealLabState;
			next = {
				...base,
				stage: 'reveal',
				directEcho: open.directEcho,
				wholeReadingFit: open.wholeReadingFit,
				derivatives: open.derivatives,
				counterfactualProfile: open.counterfactualProfile,
				visitorEstimatedBreadth: open.visitorEstimatedBreadth,
				visitorRatedDistinctiveness: open.visitorRatedDistinctiveness
			};
		} else return invalid(state, 'invalid-transition');
		return { ok: true, state: consumeActivation(next, event) };
	}

	return invalid(state, 'invalid-transition');
}

export function reduceLabState(state: LabState, event: LabEvent): LabState {
	return transitionLabState(state, event).state;
}
