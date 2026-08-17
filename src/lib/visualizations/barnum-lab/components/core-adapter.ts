import {
	QUESTION_IDS,
	QUESTION_REGISTRY,
	calculateReadingMetrics,
	compareSemanticManifests,
	createDemographicCounterfactual,
	generateReading,
	optionLabel,
	toGenerationProfile,
	type AuditEvent,
	type DisplayProfile,
	type GeneratedStatement,
	type LabState,
	type PresentationLedger,
	type RatingRecord,
	type ReadingMetrics,
	type SealedDeck
} from '..';
import type {
	AuditEventView,
	CounterfactualResult,
	LabQuestion,
	LedgerRow,
	OpenLabSettings,
	ProductionCounts,
	ReadingSegment,
	ReadingStatement
} from './ui-types';

const QUESTION_DESCRIPTIONS: Readonly<Partial<Record<(typeof QUESTION_IDS)[number], string>>> = {
	country: 'A visible demo setting with zero influence on personality claims.',
	city_context: 'No lookup, autocomplete, or geolocation is used.',
	language: 'English-only v1 records this for display and does not alter claim meaning.',
	planning_style: 'This can support one direct paraphrase of the same answer—nothing broader.'
};

export const LAB_QUESTIONS: readonly LabQuestion[] = QUESTION_IDS.map((id) => ({
	id,
	label: QUESTION_REGISTRY[id].label,
	description: QUESTION_DESCRIPTIONS[id],
	permittedUse: QUESTION_REGISTRY[id].permittedUse,
	options: QUESTION_REGISTRY[id].options
}));

export function activeDeck(state: LabState): SealedDeck | undefined {
	return state.stage === 'intro' ? undefined : state.deck;
}

export function stateRatings(state: LabState): readonly RatingRecord[] {
	return state.stage === 'intro' ? [] : state.ratings;
}

export function latestRatings(records: readonly RatingRecord[]): ReadonlyMap<string, RatingRecord> {
	const latest = new Map<string, RatingRecord>();
	for (const record of records) latest.set(record.statementId, record);
	return latest;
}

function adaptationFor(statement: GeneratedStatement): ReadingStatement['adaptation'] {
	const transformation = statement.version.transformation;
	if (transformation.kind === 'direct-echo-added') return 'elaborated';
	if (transformation.kind !== 'feedback-derivative') return 'sealed';
	return transformation.mode === 'hedged' ? 'hedged' : 'feedback-selected';
}

function segmentLabel(statement: GeneratedStatement, segmentIndex: number): string {
	const segment = statement.renderedSegments[segmentIndex];
	if (segment.claimBasis.kind === 'direct-echo') return 'direct answer echo';
	const feedback = segment.selectionInfluences.find((influence) => influence.kind === 'feedback');
	if (feedback?.kind === 'feedback') {
		return `feedback reuse · ${feedback.exactRating.replaceAll('-', ' ')}`;
	}
	return segment.technique?.replaceAll('-', ' ') ?? 'literal frame text';
}

function statementExplanation(
	statement: GeneratedStatement,
	ratings: readonly RatingRecord[]
): string {
	const transformation = statement.version.transformation;
	if (transformation.kind === 'direct-echo-added') {
		return `Source: your answer to “${QUESTION_REGISTRY[transformation.questionId].label}”. The answer was reworded; the engine did not discover it.`;
	}
	if (transformation.kind === 'feedback-derivative') {
		const sourceRating = ratings.find(
			(record) => record.eventId === transformation.ratingEventId
		)?.rating;
		return `Feedback reuse: your ${sourceRating?.replaceAll('-', ' ') ?? 'eligible'} rating influenced the selection of this new line. It did not independently verify the source claim.`;
	}
	if (transformation.kind === 'surface-only') {
		return 'Only presentation wording changed. The core semantic identity remained fixed.';
	}
	return 'Actual visitor-specific evidence: none. This generic line was sealed before any clue or rating.';
}

function statementSegments(statement: GeneratedStatement): readonly ReadingSegment[] {
	const adaptation = adaptationFor(statement);
	return statement.renderedSegments.map((segment, index) => ({
		text: segment.text,
		label: segmentLabel(statement, index),
		basis: segment.claimBasis.kind,
		adaptation
	}));
}

function editorialBreadth(statement: GeneratedStatement): string {
	const preference = statement.trace.score.editorialBreadthPreference;
	if (preference === 3) return 'Broad (editorial preference score 3)';
	if (preference === 2) return 'Very broad (editorial preference score 2)';
	if (preference === 1) return 'Moderate (editorial preference score 1)';
	return 'Not scored for breadth (direct or derived statement)';
}

function selectionReason(statement: GeneratedStatement): string {
	const transformation = statement.version.transformation;
	if (transformation.kind === 'direct-echo-added') {
		return `Reserved echo slot filled only from ${transformation.questionId}.`;
	}
	if (transformation.kind === 'feedback-derivative') {
		return `New candidate selected after immutable rating event ${transformation.ratingEventId}; mode ${transformation.mode}.`;
	}
	if (transformation.kind === 'surface-only') {
		return `Presentation-only variant ${transformation.presentationId}; semantic core held fixed.`;
	}
	return 'Ranked deterministic generic candidate selected before clues and ratings.';
}

function selectionInfluences(statement: GeneratedStatement): string {
	if (!statement.trace.selectionInfluences.length) return 'None';
	return statement.trace.selectionInfluences
		.map((influence) => {
			if (influence.kind === 'sealed-selection') return `sealed slot ${influence.slotId}`;
			if (influence.kind === 'presentation') {
				return `presentation-only answer ${influence.questionId}`;
			}
			return `feedback event ${influence.ratingEventId}, exact rating ${influence.exactRating}`;
		})
		.join('; ');
}

function falsifiabilityNote(statement: GeneratedStatement): string {
	if (statement.trace.claimBasis.kind === 'direct-echo') {
		return 'This restates a supplied answer and is not independent evidence about the visitor.';
	}
	return 'Judge the literal claim, including “sometimes”, “may”, contrasts, and exceptions; broad coverage lowers distinctiveness.';
}

function presentationDetail(
	statement: GeneratedStatement,
	presentation?: PresentationLedger
): { status: string; eventId?: string } | undefined {
	if (!presentation) return undefined;
	const history = presentation.history.find(
		(entry) => entry.statement.statementId === statement.statementId
	);
	if (history) {
		return {
			status: `Shown to the visitor as ${history.group.replaceAll('-', ' ')}; first presentation is recorded in the append-only event trail.`,
			eventId: history.presentationEventId
		};
	}
	if (presentation.abandonedStatementIds.includes(statement.statementId)) {
		return { status: 'Sealed but not shown — abandoned on early reveal.' };
	}
	const reservedSlot = presentation.reservedSlots.find(
		(slot) => slot.status.kind === 'presented' && slot.status.statementId === statement.statementId
	);
	if (reservedSlot) {
		return {
			status: `Shown to the visitor from the reserved ${reservedSlot.kind.replaceAll('-', ' ')} slot.`
		};
	}
	if (
		presentation.baselineStatementIds.includes(statement.statementId) ||
		presentation.laterStatementIds.includes(statement.statementId)
	) {
		return { status: 'Sealed; no show or abandonment event is recorded in the current branch.' };
	}
	return {
		status: 'Controlled open-lab output — outside the guided-session presentation ledger.'
	};
}

export function toReadingStatement(
	statement: GeneratedStatement,
	ratingRecords: readonly RatingRecord[],
	presentation?: PresentationLedger
): ReadingStatement {
	const latest = latestRatings(ratingRecords);
	const feedbackInfluence = statement.trace.selectionInfluences.find(
		(influence) => influence.kind === 'feedback'
	);
	const sourceRating =
		feedbackInfluence?.kind === 'feedback'
			? ratingRecords.find((record) => record.eventId === feedbackInfluence.ratingEventId)?.rating
			: undefined;
	const sourceRatingRecord =
		feedbackInfluence?.kind === 'feedback'
			? ratingRecords.find((record) => record.eventId === feedbackInfluence.ratingEventId)
			: undefined;
	const score = statement.trace.score;
	const shown = presentationDetail(statement, presentation);
	return {
		id: statement.statementId,
		coreId: statement.coreId,
		text: statement.text,
		basis: statement.trace.claimBasis.kind,
		adaptation: adaptationFor(statement),
		rating: latest.get(statement.statementId)?.rating ?? 'unrated',
		sealed: statement.sealed,
		segments: statementSegments(statement),
		plainExplanation: [
			statementExplanation(statement, ratingRecords),
			...(shown ? [`Presentation status: ${shown.status}`] : [])
		].join(' '),
		trace: [
			{ label: 'Frame', value: statement.trace.frameId },
			{ label: 'Core semantic ID', value: statement.coreId },
			{ label: 'Slot', value: statement.slotId },
			{ label: 'Sealed before clues', value: statement.sealed ? 'Yes' : 'No' },
			...(shown
				? [
						{ label: 'Presentation status', value: shown.status },
						{ label: 'First presentation event', value: shown.eventId ?? 'None' }
					]
				: []),
			{ label: 'Editorial breadth', value: editorialBreadth(statement) },
			{ label: 'Falsifiability note', value: falsifiabilityNote(statement) },
			{ label: 'Semantic keys', value: statement.trace.semanticKeys.join(', ') || 'None' },
			{ label: 'Fragments', value: statement.trace.fragmentIds.join(', ') || 'Literal only' },
			{ label: 'Techniques', value: statement.trace.techniques.join(', ') || 'None' },
			{ label: 'Claim basis', value: statement.trace.claimBasis.kind },
			{
				label: 'Exact source question',
				value:
					statement.trace.claimBasis.kind === 'direct-echo'
						? statement.trace.claimBasis.questionId
						: 'None'
			},
			{
				label: 'Exact source option',
				value:
					statement.trace.claimBasis.kind === 'direct-echo'
						? statement.trace.claimBasis.optionId
						: 'None'
			},
			{ label: 'Selection reason', value: selectionReason(statement) },
			{ label: 'Selection influences', value: selectionInfluences(statement) },
			{ label: 'Selection seed key', value: statement.trace.seedKey },
			{ label: 'Score · breadth preference', value: String(score.editorialBreadthPreference) },
			{ label: 'Score · stage compatibility', value: String(score.stageCompatibility) },
			{ label: 'Score · axis novelty', value: String(score.axisNovelty) },
			{ label: 'Score · technique novelty', value: String(score.techniqueNovelty) },
			{ label: 'Score · direct-echo eligibility', value: String(score.directEchoEligibility) },
			{ label: 'Score · lexical penalty', value: String(score.lexicalPenalty) },
			{ label: 'Score · semantic penalty', value: String(score.semanticPenalty) },
			{ label: 'Score · deterministic jitter', value: String(score.deterministicJitter) },
			{ label: 'Score · total', value: String(score.total) },
			{
				label: 'Corpus',
				value: `${statement.trace.corpusVersion} · ${statement.trace.corpusManifestHash}`
			},
			{ label: 'Engine', value: statement.trace.engineVersion },
			{ label: 'Version', value: statement.version.versionId },
			{ label: 'Parent version', value: statement.version.parentVersionId ?? 'None' },
			{ label: 'Parent/source statement', value: statement.parentStatementId ?? 'None' },
			{ label: 'Immutable source rating', value: sourceRatingRecord?.rating ?? 'None' },
			{ label: 'Immutable source event', value: sourceRatingRecord?.eventId ?? 'None' }
		],
		sourceStatementId: statement.parentStatementId,
		sourceRating
	};
}

export function toReadingStatements(
	statements: readonly GeneratedStatement[],
	ratings: readonly RatingRecord[],
	presentation?: PresentationLedger
): readonly ReadingStatement[] {
	return statements.map((statement) => toReadingStatement(statement, ratings, presentation));
}

export function profileContextLabel(profile: DisplayProfile): string {
	const city = profile.city_context
		? optionLabel('city_context', profile.city_context.optionId)
		: 'No place selected';
	const language = profile.language
		? optionLabel('language', profile.language.optionId)
		: 'No language selected';
	return `${city} · ${language}`;
}

function permittedUseLabel(permittedUse: LabQuestion['permittedUse']): string {
	if (permittedUse === 'direct-echo') return 'Direct paraphrase only';
	if (permittedUse === 'presentation-only') {
		return 'Interface/surface wording only; unused in English v1';
	}
	if (permittedUse === 'unused-decoy') return 'Theatrical decoy; changes nothing';
	return 'Display only; never personality inference';
}

export function buildLedgerRows(
	profile: DisplayProfile,
	revealed: boolean,
	directEcho?: GeneratedStatement
): LedgerRow[] {
	const rows: LedgerRow[] = [];
	for (const question of LAB_QUESTIONS) {
		const answer = profile[question.id as keyof DisplayProfile];
		if (!answer) {
			if (question.id !== 'city_context') continue;
			rows.push({
				id: question.id,
				label: question.label,
				value: 'No answer',
				origin: 'Cleared after country changed',
				permittedUse: permittedUseLabel(question.permittedUse),
				group: 'unknowns',
				useAfterReveal: 'Not used in the generic reading'
			});
			continue;
		}
		const selected = answer.origin === 'user-selected';
		const echoed =
			directEcho?.trace.claimBasis.kind === 'direct-echo' &&
			directEcho.trace.claimBasis.questionId === question.id;
		rows.push({
			id: question.id,
			label: question.label,
			value: optionLabel(question.id as never, answer.optionId as never),
			origin: selected ? 'Selected by you' : 'Demo default, not confirmed',
			permittedUse: permittedUseLabel(question.permittedUse),
			group: selected ? 'selected' : 'demo-defaults',
			useAfterReveal:
				revealed && echoed
					? 'Paraphrased directly in the identified echo card'
					: question.permittedUse === 'presentation-only'
						? 'Not used in the English reading'
						: question.permittedUse === 'unused-decoy'
							? 'Changed nothing'
							: 'Not used in the generic reading'
		});
	}

	if (!rows.some((row) => row.group === 'selected')) {
		rows.push({
			id: 'no-confirmed-choices',
			label: 'Confirmed choices',
			value: 'None yet',
			origin: '—',
			permittedUse: 'Nothing from this group can influence the reading',
			group: 'selected'
		});
	}

	for (const unknown of [
		['age-band', 'Age band', 'Prefer not to say', 'No answer', 'Never personality inference'],
		[
			'gender-value',
			'Gender',
			'Prefer not to say',
			'No answer',
			'No personality inference; prose is gender-neutral'
		]
	] as const) {
		const answered = unknown[0] === 'age-band' ? profile.age_band : profile.gender;
		if (answered) continue;
		rows.push({
			id: unknown[0],
			label: unknown[1],
			value: unknown[2],
			origin: unknown[3],
			permittedUse: unknown[4],
			group: 'unknowns',
			useAfterReveal: unknown[4]
		});
	}

	for (const row of [
		[
			'personality-evidence',
			'Personality evidence',
			'None',
			'No validated personality model exists'
		],
		['external-data', 'External data', 'None', 'No lookup, profile, account, or API'],
		[
			'transmitted-data',
			'Selection data transmitted',
			'None by this lab',
			'Held in component memory only'
		]
	] as const) {
		rows.push({
			id: row[0],
			label: row[1],
			value: row[2],
			origin: '—',
			permittedUse: row[3],
			group: 'unknowns',
			useAfterReveal: row[3]
		});
	}
	return rows;
}

function eventCopy(event: AuditEvent): { label: string; detail: string } {
	switch (event.kind) {
		case 'began':
			return {
				label: 'Deck sealed',
				detail: `Fingerprint ${event.seedFingerprint}; generic slots fixed before clues.`
			};
		case 'statement-presented':
			return {
				label: 'Statement first shown',
				detail: `${event.statementId}; slot ${event.slotId}; ${event.group.replaceAll('-', ' ')}.`
			};
		case 'statement-abandoned':
			return {
				label: 'Sealed statement not shown',
				detail: `${event.statementId}; slot ${event.slotId}; ${event.group.replaceAll('-', ' ')} abandoned on early reveal.`
			};
		case 'reserved-slot-empty':
			return {
				label: 'Reserved slot stayed empty',
				detail: `${event.slotKind.replaceAll('-', ' ')} slot ${event.slotId}; ${event.reason.replaceAll('-', ' ')}.`
			};
		case 'reserved-slot-abandoned':
			return {
				label: 'Reserved slot abandoned',
				detail: `${event.slotKind.replaceAll('-', ' ')} slot ${event.slotId}; abandoned on early reveal.`
			};
		case 'answered':
			return {
				label: 'Answer selected',
				detail: `${event.questionId} = ${event.optionId}; recorded as user selected.`
			};
		case 'confirmed-default':
			return {
				label: 'Demo default confirmed',
				detail: `${event.questionId} = ${event.optionId}.`
			};
		case 'skipped':
			return { label: 'Question group skipped', detail: event.groupId };
		case 'rated':
			return {
				label: 'Statement rated',
				detail: `${event.statementId}: ${event.rating.replaceAll('-', ' ')}.`
			};
		case 'rating-revised':
			return {
				label: 'Rating revised',
				detail: `${event.statementId}: ${event.previousRating.replaceAll('-', ' ')} → ${event.rating.replaceAll('-', ' ')}.`
			};
		case 'continued':
			return { label: 'Guided step continued', detail: `${event.from} → ${event.to}.` };
		case 'went-back':
			return {
				label: 'Guided step revisited',
				detail: `${event.from} → ${event.to}; prior events remain.`
			};
		case 'revealed':
			return { label: 'Mechanism revealed', detail: `Reveal requested from ${event.from}.` };
		case 'derivative-created':
			return {
				label: 'Feedback derivative created',
				detail: `${event.statementId} from ${event.sourceStatementId}.`
			};
		case 'counterfactual-applied':
			return {
				label: 'Demographic counterfactual applied',
				detail: `${event.changedQuestionIds.join(', ') || 'No'} display values changed.`
			};
		case 'replayed':
			return {
				label: 'Same deck replayed',
				detail: `Replay code ${event.replayCode}; ratings cleared.`
			};
	}
}

export function toAuditEventViews(events: readonly AuditEvent[]): readonly AuditEventView[] {
	return events.map((event) => {
		const copy = eventCopy(event);
		return {
			id: event.id,
			sequence: event.sequence,
			label: copy.label,
			detail: copy.detail,
			timestamp: event.timestamp,
			branchId: event.branchId,
			parentBranchId: event.parentBranchId,
			causalEventIds: event.causalEventIds
		};
	});
}

export function toProductionCounts(metrics: ReadingMetrics): ProductionCounts {
	return {
		statementCount: metrics.statementCount,
		semanticClauseCount: metrics.semanticClauseCount,
		unsupportedGenericClauseCount: metrics.unsupportedGenericClauseCount,
		directEchoClauseCount: metrics.directEchoClauseCount,
		sealedClauseCount: metrics.sealedClauseCount,
		feedbackSelectedClauseCount: metrics.feedbackSelectedClauseCount,
		hedgedClauseCount: metrics.hedgedClauseCount,
		elaboratedClauseCount: metrics.elaboratedClauseCount,
		nonFitsOmittedFromPolishedSummaryCount: metrics.nonFitsOmittedFromPolishedSummaryCount,
		fitRatings: metrics.fitRatings
	};
}

export function calculateProductionCounts(
	state: Exclude<LabState, { stage: 'intro' }>,
	statements: readonly GeneratedStatement[],
	polishedSummaryStatementIds: readonly string[]
): ProductionCounts {
	const counterfactualProfile =
		'counterfactualProfile' in state ? state.counterfactualProfile : undefined;
	const metrics = calculateReadingMetrics({
		statements,
		ratings: state.ratings,
		displayProfile: state.displayProfile,
		polishedSummaryStatementIds,
		counterfactualStatements: generateReading(
			toGenerationProfile(counterfactualProfile ?? state.displayProfile, state.deck.sessionSeed),
			{
				count: state.deck.genericStatements.length,
				slotPrefix: 'generic',
				seedKey: 'sealed-generic-deck'
			}
		),
		wholeReadingFit: 'wholeReadingFit' in state ? state.wholeReadingFit : undefined,
		visitorEstimatedBreadth:
			'visitorEstimatedBreadth' in state ? state.visitorEstimatedBreadth : undefined,
		visitorRatedDistinctiveness:
			'visitorRatedDistinctiveness' in state ? state.visitorRatedDistinctiveness : undefined
	});
	return toProductionCounts(metrics);
}

export function buildCounterfactualResult(
	profile: DisplayProfile,
	statements: readonly GeneratedStatement[],
	seed: string
): CounterfactualResult {
	const counterfactual = createDemographicCounterfactual(profile);
	const regenerated = generateReading(toGenerationProfile(counterfactual.profile, seed), {
		count: statements.length,
		slotPrefix: 'generic',
		seedKey: 'sealed-generic-deck'
	});
	const comparison = compareSemanticManifests(statements, regenerated);
	const changes = counterfactual.changedQuestionIds.map((questionId) => {
		const before = profile[questionId];
		const after = counterfactual.profile[questionId];
		return {
			label: QUESTION_REGISTRY[questionId].label,
			before: before ? optionLabel(questionId as never, before.optionId as never) : 'Not specified',
			after: after ? optionLabel(questionId as never, after.optionId as never) : 'Not specified'
		};
	});
	return {
		beforeLabel: profileContextLabel(profile),
		afterLabel: profileContextLabel(counterfactual.profile),
		semanticIdOverlap: comparison.overlapPercent,
		identicalSemanticIds: comparison.identical,
		changedSurfaceDetails: counterfactual.changedQuestionIds.map(
			(questionId) => QUESTION_REGISTRY[questionId].label
		),
		changes,
		unchangedCoreIds: statements
			.filter((statement) => !comparison.changedSlotIds.includes(statement.slotId))
			.map((statement) => statement.coreId)
	};
}

export function generateOpenReading(
	profile: DisplayProfile,
	seed: string,
	settings: OpenLabSettings
): readonly GeneratedStatement[] {
	const requested = Math.max(settings.statementCount, settings.hedges === 'low' ? 1 : 15);
	let statements = generateReading(toGenerationProfile(profile, seed), {
		count: requested,
		slotPrefix: 'open',
		seedKey: `open-lab:${settings.oppositePairs ? 'pairs' : 'no-pairs'}:${settings.breadth}`,
		oppositePairs: settings.oppositePairs,
		breadth: settings.breadth
	});
	if (settings.hedges === 'none') {
		statements = statements.filter(
			(statement) =>
				!statement.trace.techniques.includes('modal-hedge') &&
				!statement.trace.techniques.includes('exception-clause')
		);
	} else if (settings.hedges === 'high') {
		statements = [...statements].sort((left, right) => {
			const leftHedge = left.trace.techniques.some(
				(technique) => technique === 'modal-hedge' || technique === 'exception-clause'
			);
			const rightHedge = right.trace.techniques.some(
				(technique) => technique === 'modal-hedge' || technique === 'exception-clause'
			);
			return Number(rightHedge) - Number(leftHedge);
		});
	}
	return statements.slice(0, settings.statementCount);
}
