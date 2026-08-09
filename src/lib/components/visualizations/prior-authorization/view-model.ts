import {
	FAILURE_DEFINITIONS,
	MILESTONE_DEFINITIONS,
	selectClockSeries,
	selectLedgerRows,
	type ActorId,
	type Clocks,
	type CompiledRun,
	type FailureDefinition,
	type SimulationEvent,
	type WallTimeCategory
} from '$lib/visualizations/prior-authorization';
import type {
	UiAssumption,
	UiClockSnapshot,
	UiFailure,
	UiJourneyStep,
	UiLedgerRow,
	UiRun,
	UiWallSegment
} from './ui-types';

const MINUTE_MS = 60_000;

const actorLabels: Readonly<Record<ActorId, string>> = {
	maya: 'Maya',
	'ordering-clinician': 'Ordering clinician',
	'authorization-specialist': 'Authorization specialist',
	'ehr-workflow': 'EHR and workflow application',
	'payer-service': 'Payer service',
	'payer-reviewer': 'Payer reviewer',
	'imaging-scheduler': 'Imaging scheduler'
};

const categoryMap: Readonly<Record<WallTimeCategory, UiWallSegment['category']>> = {
	'queue-inbox': 'queue',
	'human-dependent-review': 'human-review',
	'missing-information-loop': 'missing-information',
	'message-transport': 'transport',
	'external-scheduling': 'scheduling',
	'automated-processing': 'automated'
};

const laneLabels = {
	'patient-clinician': 'Patient / clinician',
	'ehr-workflow': 'EHR / workflow application',
	'payer-intermediary': 'Payer / intermediary',
	'imaging-scheduling': 'Imaging / scheduling'
} as const;

function clockSnapshot(clocks: Clocks): UiClockSnapshot {
	return {
		patientElapsedMinutes: clocks.patientElapsedMinutes,
		humanWorkSeconds: clocks.activeHumanWorkSeconds,
		automatedProcessingMs: clocks.automatedProcessingMs,
		providerWorkSeconds:
			clocks.humanWorkByActor['ordering-clinician'] +
			clocks.humanWorkByActor['authorization-specialist'] +
			clocks.humanWorkByActor['ehr-workflow'],
		payerWorkSeconds:
			clocks.humanWorkByActor['payer-service'] + clocks.humanWorkByActor['payer-reviewer'],
		schedulingWorkSeconds: clocks.humanWorkByActor['imaging-scheduler']
	};
}

function lastEventForMilestone(run: CompiledRun, milestoneId: string): SimulationEvent | undefined {
	return [...run.events].reverse().find((event) => event.milestone === milestoneId);
}

function eventlessNarratives(
	run: CompiledRun,
	milestone: CompiledRun['milestones'][number]
): Readonly<{ patient: string; clinician: string; architect: string }> {
	if (milestone.id === 'scheduled-and-scan-received' && run.finalOutcome === 'denied') {
		return {
			patient:
				'This downstream branch was not visited in the compiled run. The denial means Maya did not reach authorized scheduling or receive the scan.',
			clinician:
				'This downstream branch was not visited. No scheduling event follows the business denial in the canonical ledger.',
			architect:
				'This downstream branch was not visited: the denied run has no Appointment or scan-completed event.'
		};
	}
	return {
		patient:
			'This optional branch was not visited in the compiled run. No modeled event occurred here.',
		clinician:
			'This optional branch was not visited. The canonical ledger records no extra work or evidence handoff at this milestone.',
		architect:
			'This optional branch was not visited; there is no event, resource transition, or clock increment to inspect here.'
	};
}

function makeSteps(run: CompiledRun): UiJourneyStep[] {
	return run.milestones.map((milestone) => {
		const event = lastEventForMilestone(run, milestone.id);
		const eventless = event ? null : eventlessNarratives(run, milestone);
		const terminalProjection = milestone.index === MILESTONE_DEFINITIONS.length - 1;
		return {
			id: milestone.id,
			index: milestone.index,
			label: milestone.label,
			shortLabel: milestone.shortLabel,
			actor: event ? actorLabels[event.actorId] : laneLabels[milestone.actorLane],
			lane: laneLabels[milestone.actorLane],
			status: milestone.visitStatus,
			patientText: event?.patientText ?? eventless!.patient,
			clinicianText: event?.clinicianText ?? eventless!.clinician,
			architectText: event?.architectText ?? eventless!.architect,
			clock: clockSnapshot(milestone.clocks),
			channel: event?.channel,
			technicalStatus:
				event?.statuses.technical ?? (terminalProjection ? run.statuses.technical : undefined),
			businessStatus:
				event?.statuses.business ?? (terminalProjection ? run.statuses.business : undefined),
			authorizationStatus:
				event?.statuses.authorization ??
				(terminalProjection ? run.statuses.authorization : undefined),
			finalOutcome:
				event?.statuses.finalOutcome ?? (terminalProjection ? run.finalOutcome : undefined),
			staffEffortSeconds: event?.staffEffortSeconds ?? 0,
			machineProcessingMs: event?.machineProcessingMs ?? 0,
			standardRefs: [...(event?.standardRefs ?? [])],
			resourceRefs: [...(event?.resourceRefs ?? [])],
			evidenceRefs: [...(event?.evidenceRefs ?? [])],
			causedByFailureId: event?.causedByFailureId
		};
	});
}

function makeLedger(run: CompiledRun): UiLedgerRow[] {
	const patient = selectLedgerRows(run, 'patient');
	const clinician = new Map(selectLedgerRows(run, 'clinician').map((row) => [row.id, row]));
	const architect = new Map(selectLedgerRows(run, 'architect').map((row) => [row.id, row]));
	const eventById = new Map(run.events.map((event) => [event.id, event]));
	const milestoneIndex = new Map(
		MILESTONE_DEFINITIONS.map((definition) => [definition.id, definition.index])
	);

	return patient.map((row) => {
		const event = eventById.get(row.id);
		return {
			id: row.id,
			sequence: row.sequence,
			stepIndex: milestoneIndex.get(row.milestone) ?? 0,
			milestone: row.milestoneLabel,
			actor: actorLabels[row.actor],
			channel: row.channel,
			kind: event?.kind ?? 'state-change',
			status: row.statusLabel,
			wallStartMinute: row.wallStartMs / MINUTE_MS,
			wallEndMinute: row.wallEndMs / MINUTE_MS,
			staffEffortSeconds: event?.staffEffortSeconds ?? 0,
			machineProcessingMs: event?.machineProcessingMs ?? 0,
			patientText: row.text,
			clinicianText: clinician.get(row.id)?.text ?? row.text,
			architectText: architect.get(row.id)?.text ?? row.text,
			technicalStatus: row.technicalStatus,
			businessStatus: row.businessStatus,
			authorizationStatus: row.authorizationStatus,
			finalOutcome: event?.statuses.finalOutcome ?? undefined,
			resourceRefs: [...row.resourceRefs],
			standardRefs: [...row.standardRefs],
			causedByFailureId: row.causedByFailureId
		};
	});
}

function makeWallSegments(run: CompiledRun): UiWallSegment[] {
	return run.wallTimeSegments.map((segment) => ({
		id: segment.id,
		label: segment.label,
		category: categoryMap[segment.category],
		startMinute: segment.wallStartMs / MINUTE_MS,
		endMinute: segment.wallEndMs / MINUTE_MS,
		durationMinutes: segment.durationMs / MINUTE_MS
	}));
}

function makeAssumptions(run: CompiledRun): UiAssumption[] {
	return run.assumptions.map((detail, index) => ({
		id: `${run.pathway.id}-assumption-${index + 1}`,
		label: `Assumption ${index + 1}`,
		detail
	}));
}

export function toUiRun(run: CompiledRun): UiRun {
	const highlightedTransaction = run.events.find(
		(event) => event.machineProcessingMs === 400 && event.id === 'fhir-crd-order-sign-400ms'
	);
	const cumulative = selectClockSeries(run).map((point) => ({
		stepIndex: point.milestoneIndex,
		label: point.label,
		patientElapsedMinutes: point.patientElapsedMs / MINUTE_MS,
		humanWorkSeconds: point.activeHumanWorkSeconds,
		automatedProcessingMs: point.automatedProcessingMs
	}));

	return {
		pathway: run.pathway.id,
		pathwayLabel: run.pathway.label,
		failureId: run.failure.id,
		outcome: run.finalOutcome,
		authorizationStatus: run.statuses.authorization,
		identifiers: {
			patient: run.case.patient.id,
			coverage: run.case.coverage.id,
			coveragePatientReference: run.case.coverage.patientReference,
			serviceRequest: run.case.request.id
		},
		steps: makeSteps(run),
		ledger: makeLedger(run),
		clock: clockSnapshot(run.clocks),
		wallSegments: makeWallSegments(run),
		cumulative,
		assumptions: makeAssumptions(run),
		transaction400msEventId: highlightedTransaction?.id,
		highlightTransactionMs: highlightedTransaction?.machineProcessingMs
	};
}

function failureSystemResponse(failure: FailureDefinition): string {
	switch (failure.id) {
		case 'identity-mismatch':
			return 'The compiler inserts a human reconciliation task and refuses an unsafe record join.';
		case 'narrative-only':
			return 'Prepopulation stops short. A human locates the source, preserves provenance, attaches it and confirms the answer.';
		case 'clinically-insufficient':
			return 'Technical intake succeeds; the business response is pended, one bounded information cycle runs, and a specific fictional denial follows.';
		case 'authorization-expired':
			return 'The approval changes to expired before the delayed appointment. The scheduler cannot treat the stale approval as valid.';
		default:
			return failure.description;
	}
}

export function toUiFailures(): UiFailure[] {
	return (Object.values(FAILURE_DEFINITIONS) as readonly FailureDefinition[])
		.filter((failure) => failure.public && failure.id !== 'none')
		.map((failure) => ({
			id: failure.id,
			label: failure.label,
			shortLabel: failure.shortLabel,
			triggerLabel:
				MILESTONE_DEFINITIONS.find((milestone) => milestone.id === failure.triggerMilestone)
					?.shortLabel ?? 'Exception',
			whatBroke: failure.description,
			systemResponse: failureSystemResponse(failure),
			patientConsequence: failure.patientConsequence,
			nextAction: failure.nextAction,
			expectedOutcome: failure.expectedOutcome,
			technicalStatus: failure.technicalStatus,
			businessStatus: failure.businessStatus,
			authorizationStatus: failure.authorizationStatus,
			affectsBothPathways: failure.pathways.length === 2
		}));
}
