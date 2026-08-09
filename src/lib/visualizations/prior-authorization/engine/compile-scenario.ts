import {
	FAILURE_DEFINITIONS,
	FAILURE_TIMINGS,
	type FailureTiming
} from '../data/failure-fixtures.v1.ts';
import { MAYA_LUMBAR_MRI_CASE, FICTIONAL_EVIDENCE_POLICY } from '../data/maya-lumbar-mri.v1.ts';
import {
	DAY_MS,
	HOUR_MS,
	MINUTE_MS,
	PATHWAY_FIXTURES,
	type WallSegmentBlueprint
} from '../data/pathways.v1.ts';
import { getModeledAppointment } from '../data/modeled-appointments.ts';
import { QUESTIONNAIRE_RESPONSE_FIXTURES } from '../data/modeled-resource-references.ts';
import { ACTOR_IDS, FAILURE_IDS, MILESTONE_DEFINITIONS, SCENARIO_ID } from './scenario-schema.ts';
import { assertCompiledRun, assertComparisonRun, deepFreeze } from './invariants.ts';
import type {
	ActorId,
	BusinessStatus,
	ClockSnapshot,
	Clocks,
	ComparisonRun,
	CompiledRun,
	EventBlueprint,
	FailureId,
	FailureImpact,
	FinalOutcome,
	MilestoneId,
	MilestoneState,
	PathwayId,
	PublicFailureId,
	ScenarioInput,
	SimulationEvent,
	StatusSnapshot,
	WallTimeSegment
} from './types.ts';

type DraftEvent = EventBlueprint;

const EMPTY_HUMAN_WORK = Object.freeze(
	Object.fromEntries(ACTOR_IDS.map((actorId) => [actorId, 0])) as Record<ActorId, number>
);

const ZERO_CLOCKS: Clocks = Object.freeze({
	patientElapsedMs: 0,
	patientElapsedMinutes: 0,
	activeHumanWorkSeconds: 0,
	automatedProcessingMs: 0,
	humanWorkByActor: EMPTY_HUMAN_WORK
});

function normalizeInput(input: ScenarioInput): Required<ScenarioInput> {
	const normalized = {
		scenarioId: input.scenarioId ?? SCENARIO_ID,
		pathway: input.pathway,
		failureId: input.failureId ?? 'none'
	} as const;
	if (normalized.scenarioId !== SCENARIO_ID) {
		throw new RangeError(`Unknown prior-authorization scenario: ${String(normalized.scenarioId)}`);
	}
	if (!(normalized.pathway in PATHWAY_FIXTURES)) {
		throw new RangeError(`Unknown prior-authorization pathway: ${String(normalized.pathway)}`);
	}
	if (!(FAILURE_IDS as readonly string[]).includes(normalized.failureId)) {
		throw new RangeError(`Unknown prior-authorization failure: ${String(normalized.failureId)}`);
	}
	return normalized;
}

function status(
	technical: StatusSnapshot['technical'],
	business: BusinessStatus,
	authorization: StatusSnapshot['authorization'],
	finalOutcome: FinalOutcome | null = null
): StatusSnapshot {
	return { technical, business, authorization, finalOutcome };
}

function suffixAndShift(
	event: DraftEvent,
	pathway: PathwayId,
	failureId: 'identity-mismatch' | 'narrative-only',
	delayMs: number,
	orderOffset = 0
): DraftEvent {
	const shifted = {
		...event,
		id: `${event.id}--${failureId}`,
		order: event.order + orderOffset,
		wallStartMs: event.wallStartMs + delayMs,
		wallEndMs: event.wallEndMs + delayMs,
		causedByFailureId: failureId
	};
	if (event.milestone !== 'scheduled-and-scan-received') return shifted;

	const appointment = getModeledAppointment(pathway, failureId);
	return {
		...shifted,
		patientText: `Maya reaches the replacement Day ${appointment.day} appointment slot and receives the scan.`,
		resourceRefs: event.resourceRefs.map((reference) =>
			reference.startsWith('Appointment/') ? appointment.resourceReference : reference
		)
	};
}

function identityMismatchEvents(pathway: PathwayId, baseline: readonly DraftEvent[]): DraftEvent[] {
	const failureId = 'identity-mismatch' as const;
	const timing = FAILURE_TIMINGS[failureId][pathway];
	const triggerIndex = baseline.findIndex((event) => event.milestone === 'evidence-gathered');
	const prefix = baseline.slice(0, triggerIndex);
	const downstream = baseline
		.slice(triggerIndex)
		.map((event) => suffixAndShift(event, pathway, failureId, timing.delayMs, 2));
	const anchor = Math.max(...prefix.map((event) => event.wallEndMs));
	const isFhir = pathway === 'fhir-enabled';
	return [
		...prefix,
		{
			id: `${pathway}-identity-mismatch-detected`,
			order: baseline[triggerIndex]!.order,
			milestone: 'evidence-gathered',
			actorId: isFhir ? 'ehr-workflow' : 'authorization-specialist',
			actorLane: isFhir ? 'ehr-workflow' : 'patient-clinician',
			channel: isFhir ? 'fhir' : 'portal',
			kind: 'state-change',
			wallStartMs: anchor,
			wallEndMs: anchor + MINUTE_MS,
			staffEffortSeconds: isFhir ? 300 : 600,
			machineProcessingMs: isFhir ? 120 : 80,
			status: 'needs-information',
			attempt: 1,
			statuses: status('not-submitted', 'not-started', 'not-requested'),
			causedByFailureId: failureId,
			patientText: 'A supporting record cannot be matched safely to Maya’s coverage.',
			clinicianText:
				'The workflow refuses to join records whose synthetic coverage identifiers disagree.',
			architectText:
				'Identifier continuity fails. The correct machine action is to stop, preserve both candidates, and create a reconciliation task.',
			standardRefs: ['fhir-r4'],
			resourceRefs: ['Coverage/maya-coverage', 'DocumentReference/narrative-management-note'],
			evidenceRefs: ['evidence-prior-management'],
			assumption: true
		},
		{
			id: `${pathway}-identity-human-reconciliation`,
			order: baseline[triggerIndex]!.order + 1,
			milestone: 'evidence-gathered',
			actorId: 'authorization-specialist',
			actorLane: 'patient-clinician',
			channel: 'human',
			kind: 'human-work',
			wallStartMs: anchor + MINUTE_MS,
			wallEndMs: anchor + timing.delayMs,
			staffEffortSeconds: isFhir ? 1_500 : 2_100,
			machineProcessingMs: 0,
			status: 'completed',
			attempt: 1,
			statuses: status('not-submitted', 'not-started', 'not-requested'),
			causedByFailureId: failureId,
			patientText:
				'A person reconciles the synthetic identity link; Maya has lost an earlier appointment slot.',
			clinicianText:
				'A specialist verifies the coverage-to-patient link before attaching the record.',
			architectText: 'No probabilistic or fuzzy match silently overrides the safety stop.',
			standardRefs: ['model-assumption-fictional-policy'],
			resourceRefs: ['Coverage/maya-coverage', 'Patient/maya-sen'],
			evidenceRefs: ['evidence-prior-management'],
			assumption: true
		},
		...downstream
	];
}

function narrativeOnlyEvents(pathway: PathwayId, baseline: readonly DraftEvent[]): DraftEvent[] {
	const failureId = 'narrative-only' as const;
	const timing = FAILURE_TIMINGS[failureId][pathway];
	const evidenceIndex = baseline.findIndex((event) => event.milestone === 'evidence-gathered');
	const prefix = baseline.slice(0, evidenceIndex + 1);
	const downstream = baseline
		.slice(evidenceIndex + 1)
		.map((event) => suffixAndShift(event, pathway, failureId, timing.delayMs, 2));
	const anchor = prefix[prefix.length - 1]!.wallEndMs;
	const isFhir = pathway === 'fhir-enabled';
	return [
		...prefix,
		{
			id: `${pathway}-narrative-provenance-gap`,
			order: baseline[evidenceIndex]!.order + 0.5,
			milestone: 'human-review-completed',
			actorId: 'authorization-specialist',
			actorLane: 'patient-clinician',
			channel: isFhir ? 'fhir' : 'portal',
			kind: 'state-change',
			wallStartMs: anchor,
			wallEndMs: anchor + MINUTE_MS,
			staffEffortSeconds: isFhir ? 300 : 600,
			machineProcessingMs: 150,
			status: 'needs-information',
			attempt: 1,
			statuses: status('not-submitted', 'not-started', 'not-requested'),
			causedByFailureId: failureId,
			patientText: 'The fact exists in prose, but its usable source attachment is missing.',
			clinicianText:
				'Prepopulation stops short because the answer cannot retain trustworthy provenance.',
			architectText:
				'The narrative clue is not promoted into a structured answer. This is a source/provenance failure, not a parser crash.',
			standardRefs: isFhir ? ['davinci-dtr-2.2.0'] : ['model-assumption-portal-workflow'],
			resourceRefs: isFhir
				? [
						'DocumentReference/narrative-management-note',
						QUESTIONNAIRE_RESPONSE_FIXTURES.prepopulation.resourceReference
					]
				: ['DocumentReference/narrative-management-note', 'DocumentReference/portal-requirements'],
			evidenceRefs: ['evidence-prior-management'],
			assumption: true
		},
		{
			id: `${pathway}-narrative-source-recovered`,
			order: baseline[evidenceIndex]!.order + 1,
			milestone: 'human-review-completed',
			actorId: 'authorization-specialist',
			actorLane: 'patient-clinician',
			channel: 'human',
			kind: 'human-work',
			wallStartMs: anchor + MINUTE_MS,
			wallEndMs: anchor + timing.delayMs,
			staffEffortSeconds: isFhir ? 2_100 : 3_000,
			machineProcessingMs: 0,
			status: 'completed',
			attempt: 1,
			statuses: status('not-submitted', 'not-started', 'not-requested'),
			causedByFailureId: failureId,
			patientText: 'A human recovers and attaches the source before the request can proceed.',
			clinicianText:
				'The specialist locates the note, checks its context, attaches it, and confirms the answer.',
			architectText:
				'FHIR can move the recovered source and its reference. It did not manufacture the missing provenance.',
			standardRefs: isFhir ? ['davinci-dtr-2.2.0'] : ['model-assumption-portal-workflow'],
			resourceRefs: ['DocumentReference/narrative-management-note'],
			evidenceRefs: ['evidence-prior-management'],
			assumption: true
		},
		...downstream
	];
}

function clinicallyInsufficientEvents(
	pathway: PathwayId,
	baseline: readonly DraftEvent[]
): DraftEvent[] {
	const failureId = 'clinically-insufficient' as const;
	const intakeIndex = baseline.findIndex(
		(event) => event.milestone === 'request-technically-received'
	);
	const prefix = baseline.slice(0, intakeIndex + 1);
	const isFhir = pathway === 'fhir-enabled';
	const reviewStart = isFhir ? 2 * DAY_MS : 9 * DAY_MS;
	const moreInfoAt = isFhir ? 3 * DAY_MS : 12 * DAY_MS;
	const supplementEnd = isFhir ? 5 * DAY_MS : 14 * DAY_MS;
	const resubmitEnd = isFhir ? 6 * DAY_MS : 15 * DAY_MS;
	const decisionAt = FAILURE_TIMINGS[failureId][pathway].totalElapsedMs;
	const technicalAccepted = status('accepted', 'pended', 'pending');
	const denied = status('accepted', 'denied', 'denied', 'denied');
	return [
		...prefix,
		{
			id: `${pathway}-insufficient-first-review`,
			order: 20,
			milestone: 'payer-review',
			actorId: 'payer-reviewer',
			actorLane: 'payer-intermediary',
			channel: 'internal',
			kind: 'human-work',
			wallStartMs: reviewStart,
			wallEndMs: moreInfoAt - MINUTE_MS,
			staffEffortSeconds: isFhir ? 1_200 : 1_800,
			machineProcessingMs: isFhir ? 720 : 500,
			status: 'pended',
			attempt: 1,
			statuses: technicalAccepted,
			causedByFailureId: failureId,
			patientText:
				'The request is in review. Transport succeeded; clinical sufficiency remains unsettled.',
			clinicianText:
				'The payer can parse the request but cannot decide from the supplied evidence.',
			architectText: 'The first submission is technically accepted. HTTP 2xx is not approval.',
			standardRefs: isFhir ? ['davinci-pas-2.2.1'] : ['model-assumption-portal-workflow'],
			resourceRefs: isFhir
				? ['Claim/prior-authorization-claim', 'ClaimResponse/pas-pended']
				: ['DocumentReference/fax-packet'],
			evidenceRefs: ['evidence-prior-management'],
			assumption: true
		},
		{
			id: `${pathway}-more-information-requested`,
			order: 21,
			milestone: 'more-information-requested',
			actorId: 'payer-service',
			actorLane: 'payer-intermediary',
			channel: isFhir ? 'subscription' : 'portal',
			kind: 'state-change',
			wallStartMs: moreInfoAt - MINUTE_MS,
			wallEndMs: moreInfoAt,
			staffEffortSeconds: 120,
			machineProcessingMs: isFhir ? 250 : 100,
			status: 'needs-information',
			attempt: 1,
			statuses: technicalAccepted,
			causedByFailureId: failureId,
			patientText: 'The request is pended and more information is requested.',
			clinicianText: 'A specific fictional evidence gap returns to the clinical team.',
			architectText: isFhir
				? 'A PAS/CDex-aware branch conveys the additional-information Task after the synchronous pended response.'
				: 'The payer portal returns the additional-information request to a work queue.',
			standardRefs: isFhir
				? ['davinci-pas-2.2.1', 'davinci-dtr-2.2.0']
				: ['model-assumption-portal-workflow'],
			resourceRefs: isFhir
				? ['Task/additional-information', 'ClaimResponse/pas-pended']
				: ['DocumentReference/additional-information-request'],
			evidenceRefs: ['evidence-prior-management'],
			assumption: true
		},
		{
			id: `${pathway}-supplement-reviewed`,
			order: 22,
			milestone: 'request-supplemented',
			actorId: 'ordering-clinician',
			actorLane: 'patient-clinician',
			channel: 'human',
			kind: 'human-work',
			wallStartMs: moreInfoAt,
			wallEndMs: supplementEnd,
			staffEffortSeconds: isFhir ? 1_800 : 2_700,
			machineProcessingMs: isFhir ? 320 : 90,
			status: 'completed',
			attempt: 2,
			statuses: technicalAccepted,
			causedByFailureId: failureId,
			patientText: 'The clinical team supplies one bounded supplement.',
			clinicianText: 'The clinician reviews and submits the available additional evidence once.',
			architectText: isFhir
				? 'The additional-information response preserves Task and evidence references; version 1 permits one cycle only.'
				: 'The team assembles and returns one additional portal/fax packet.',
			standardRefs: isFhir
				? ['davinci-pas-2.2.1', 'davinci-dtr-2.2.0']
				: ['model-assumption-portal-workflow'],
			resourceRefs: isFhir
				? ['Task/additional-information', 'DocumentReference/narrative-management-note']
				: ['DocumentReference/supplemental-fax-packet'],
			evidenceRefs: ['evidence-prior-management'],
			assumption: true
		},
		{
			id: `${pathway}-supplement-resubmitted-and-received`,
			order: 23,
			milestone: 'request-supplemented',
			actorId: isFhir ? 'payer-service' : 'authorization-specialist',
			actorLane: isFhir ? 'payer-intermediary' : 'patient-clinician',
			channel: isFhir ? 'fhir' : 'fax',
			kind: 'transfer',
			wallStartMs: supplementEnd,
			wallEndMs: resubmitEnd,
			staffEffortSeconds: isFhir ? 180 : 900,
			machineProcessingMs: isFhir ? 500 : 240,
			status: 'pended',
			attempt: 2,
			statuses: technicalAccepted,
			causedByFailureId: failureId,
			patientText: 'The supplement is received and returns to review.',
			clinicianText:
				'The second submission is technically accepted; its business outcome is still pending.',
			architectText: isFhir
				? 'Attempt 2 receives another synchronous technical acceptance. It is not a duplicate because the original identifiers and Task are preserved.'
				: 'The supplemental packet is linked to the original request rather than opened as a blind duplicate.',
			standardRefs: isFhir ? ['davinci-pas-2.2.1'] : ['model-assumption-portal-workflow'],
			resourceRefs: isFhir
				? ['Claim/prior-authorization-claim', 'Task/additional-information']
				: ['DocumentReference/supplemental-fax-packet'],
			evidenceRefs: ['evidence-prior-management'],
			assumption: true
		},
		{
			id: `${pathway}-insufficient-final-review`,
			order: 24,
			milestone: 'request-supplemented',
			actorId: 'payer-reviewer',
			actorLane: 'payer-intermediary',
			channel: 'internal',
			kind: 'human-work',
			wallStartMs: resubmitEnd,
			wallEndMs: decisionAt - MINUTE_MS,
			staffEffortSeconds: isFhir ? 900 : 1_200,
			machineProcessingMs: isFhir ? 400 : 300,
			status: 'pended',
			attempt: 2,
			statuses: technicalAccepted,
			causedByFailureId: failureId,
			patientText: 'The supplement is reviewed, but the evidence gap remains.',
			clinicianText: 'The additional material still does not satisfy the fictional policy.',
			architectText: 'Syntactic validity and clinical sufficiency remain independent.',
			standardRefs: ['model-assumption-fictional-policy'],
			resourceRefs: isFhir
				? ['Claim/prior-authorization-claim']
				: ['DocumentReference/supplemental-fax-packet'],
			evidenceRefs: ['evidence-prior-management'],
			assumption: true
		},
		{
			id: `${pathway}-business-denial`,
			order: 25,
			milestone: 'decision-issued',
			actorId: 'payer-service',
			actorLane: 'payer-intermediary',
			channel: isFhir ? 'subscription' : 'portal',
			kind: 'decision',
			wallStartMs: decisionAt - MINUTE_MS,
			wallEndMs: decisionAt,
			staffEffortSeconds: 120,
			machineProcessingMs: isFhir ? 260 : 100,
			status: 'failed',
			attempt: 2,
			statuses: denied,
			causedByFailureId: failureId,
			patientText: 'The request is denied after the single supplement.',
			clinicianText: 'A specific fictional evidence reason accompanies the denial.',
			architectText:
				'The final business denial follows successful technical transport. A valid response is not an approval.',
			standardRefs: isFhir ? ['davinci-pas-2.2.1'] : ['model-assumption-portal-workflow'],
			resourceRefs: isFhir ? ['ClaimResponse/pas-denied'] : ['DocumentReference/portal-denial'],
			evidenceRefs: ['evidence-prior-management'],
			assumption: true
		}
	];
}

function authorizationExpiredEvents(
	pathway: PathwayId,
	baseline: readonly DraftEvent[]
): DraftEvent[] {
	const failureId = 'authorization-expired' as const;
	const timing = FAILURE_TIMINGS[failureId][pathway];
	const schedulingIndex = baseline.findIndex(
		(event) => event.milestone === 'scheduled-and-scan-received'
	);
	const prefix = baseline.slice(0, schedulingIndex);
	const decisionEvent = [...prefix]
		.reverse()
		.find((event) => event.milestone === 'decision-issued')!;
	const expiryAt = decisionEvent.wallEndMs + 14 * DAY_MS;
	const isFhir = pathway === 'fhir-enabled';
	const expiredStatus = status('accepted', 'closed', 'expired', 'expired');
	const appointment = getModeledAppointment(pathway, failureId);
	return [
		...prefix,
		{
			id: `${pathway}-authorization-validity-ended`,
			order: 30,
			milestone: 'scheduled-and-scan-received',
			actorId: 'payer-service',
			actorLane: 'payer-intermediary',
			channel: isFhir ? 'subscription' : 'portal',
			kind: 'state-change',
			wallStartMs: expiryAt,
			wallEndMs: expiryAt,
			staffEffortSeconds: 0,
			machineProcessingMs: 0,
			status: 'expired',
			attempt: 1,
			statuses: expiredStatus,
			causedByFailureId: failureId,
			patientText: 'The fictional fourteen-day authorization period ends before the appointment.',
			clinicianText: 'The approval is now stale and cannot support the delayed appointment.',
			architectText:
				'Authorization state changes from approved to expired at the modeled validity boundary.',
			standardRefs: ['model-assumption-fictional-policy'],
			resourceRefs: isFhir ? ['ClaimResponse/pas-approved'] : ['DocumentReference/portal-approval'],
			evidenceRefs: [],
			assumption: true
		},
		{
			id: `${pathway}-appointment-blocked-by-expiry`,
			order: 31,
			milestone: 'scheduled-and-scan-received',
			actorId: 'imaging-scheduler',
			actorLane: 'imaging-scheduling',
			channel: 'phone',
			kind: 'state-change',
			wallStartMs: expiryAt,
			wallEndMs: timing.totalElapsedMs,
			staffEffortSeconds: isFhir ? 600 : 900,
			machineProcessingMs: isFhir ? 140 : 120,
			status: 'expired',
			attempt: 1,
			statuses: expiredStatus,
			causedByFailureId: failureId,
			patientText: `The Day ${appointment.day} appointment cannot proceed under the expired approval.`,
			clinicianText:
				'The imaging team stops the stale authorization instead of quietly treating it as valid.',
			architectText:
				'Approved is not performed. The next action is a new or updated authorization workflow under the fictional rule.',
			standardRefs: ['fhir-r4-appointment', 'model-assumption-fictional-policy'],
			resourceRefs: [appointment.resourceReference],
			evidenceRefs: [],
			assumption: true
		}
	];
}

function compileDraftEvents(
	pathway: PathwayId,
	failureId: FailureId,
	baseline: readonly DraftEvent[]
): DraftEvent[] {
	switch (failureId) {
		case 'none':
			return [...baseline];
		case 'identity-mismatch':
			return identityMismatchEvents(pathway, baseline);
		case 'narrative-only':
			return narrativeOnlyEvents(pathway, baseline);
		case 'clinically-insufficient':
			return clinicallyInsufficientEvents(pathway, baseline);
		case 'authorization-expired':
			return authorizationExpiredEvents(pathway, baseline);
	}
}

function sortAndNumberEvents(
	pathway: PathwayId,
	drafts: readonly DraftEvent[]
): readonly SimulationEvent[] {
	return drafts
		.map((event) => ({ ...event }))
		.sort(
			(left, right) =>
				left.wallStartMs - right.wallStartMs ||
				left.order - right.order ||
				left.id.localeCompare(right.id)
		)
		.map(({ order: _order, ...event }, index) => ({
			...event,
			sequence: index + 1,
			pathway
		}));
}

function wallSegmentsFromBlueprints(
	pathway: PathwayId,
	blueprints: readonly WallSegmentBlueprint[]
): WallTimeSegment[] {
	let cursor = 0;
	return blueprints.map((blueprint) => {
		const segment: WallTimeSegment = {
			...blueprint,
			pathway,
			wallStartMs: cursor,
			wallEndMs: cursor + blueprint.durationMs,
			durationMs: blueprint.durationMs,
			assumption: true
		};
		cursor = segment.wallEndMs;
		return segment;
	});
}

function insertWallDelay(
	segments: readonly WallTimeSegment[],
	anchorMs: number,
	durationMs: number,
	failureId: PublicFailureId,
	category: WallTimeSegment['category'],
	label: string,
	actorLane: WallTimeSegment['actorLane']
): WallTimeSegment[] {
	const result: WallTimeSegment[] = [];
	let inserted = false;
	const insert = () => {
		result.push({
			id: `${segments[0]!.pathway}-wall-${failureId}`,
			pathway: segments[0]!.pathway,
			category,
			label,
			wallStartMs: anchorMs,
			wallEndMs: anchorMs + durationMs,
			durationMs,
			actorLane,
			causedByFailureId: failureId,
			assumption: true
		});
		inserted = true;
	};

	for (const segment of segments) {
		if (segment.wallEndMs <= anchorMs) {
			result.push(segment);
			continue;
		}
		if (!inserted && segment.wallStartMs < anchorMs) {
			const beforeDuration = anchorMs - segment.wallStartMs;
			if (beforeDuration > 0) {
				result.push({
					...segment,
					id: `${segment.id}-before-${failureId}`,
					wallEndMs: anchorMs,
					durationMs: beforeDuration
				});
			}
			insert();
			const afterDuration = segment.wallEndMs - anchorMs;
			if (afterDuration > 0) {
				result.push({
					...segment,
					id: `${segment.id}-after-${failureId}`,
					wallStartMs: anchorMs + durationMs,
					wallEndMs: segment.wallEndMs + durationMs,
					durationMs: afterDuration
				});
			}
			continue;
		}
		if (!inserted) insert();
		result.push({
			...segment,
			id: `${segment.id}--${failureId}`,
			wallStartMs: segment.wallStartMs + durationMs,
			wallEndMs: segment.wallEndMs + durationMs
		});
	}
	if (!inserted) insert();
	return result;
}

function clinicalWallSegments(pathway: PathwayId): WallTimeSegment[] {
	const isFhir = pathway === 'fhir-enabled';
	const specs: readonly WallSegmentBlueprint[] = isFhir
		? [
				{
					id: 'fhir-failure-wall-automated',
					category: 'automated-processing',
					label: 'Automated coverage response',
					durationMs: 400,
					actorLane: 'ehr-workflow'
				},
				{
					id: 'fhir-failure-wall-evidence',
					category: 'human-dependent-review',
					label: 'Evidence assembly and confirmation window',
					durationMs: 60 * MINUTE_MS - 400,
					actorLane: 'patient-clinician'
				},
				{
					id: 'fhir-failure-wall-submit',
					category: 'message-transport',
					label: 'Packaging and synchronous submission window',
					durationMs: 5 * MINUTE_MS,
					actorLane: 'ehr-workflow'
				},
				{
					id: 'fhir-failure-wall-queue',
					category: 'queue-inbox',
					label: 'First payer review queue',
					durationMs: 2 * DAY_MS - 65 * MINUTE_MS,
					actorLane: 'payer-intermediary'
				},
				{
					id: 'fhir-failure-wall-review-one',
					category: 'human-dependent-review',
					label: 'First payer review window',
					durationMs: DAY_MS,
					actorLane: 'payer-intermediary'
				},
				{
					id: 'fhir-failure-wall-more-info',
					category: 'missing-information-loop',
					label: 'Additional-information work',
					durationMs: 2 * DAY_MS,
					actorLane: 'patient-clinician'
				},
				{
					id: 'fhir-failure-wall-resubmit',
					category: 'message-transport',
					label: 'Supplement submission and queue',
					durationMs: DAY_MS,
					actorLane: 'ehr-workflow'
				},
				{
					id: 'fhir-failure-wall-review-two',
					category: 'human-dependent-review',
					label: 'Final review and denial',
					durationMs: 2 * DAY_MS,
					actorLane: 'payer-intermediary'
				}
			]
		: [
				{
					id: 'portal-failure-wall-coverage',
					category: 'human-dependent-review',
					label: 'Portal coverage search',
					durationMs: DAY_MS,
					actorLane: 'patient-clinician'
				},
				{
					id: 'portal-failure-wall-requirements',
					category: 'queue-inbox',
					label: 'Requirements inbox wait',
					durationMs: DAY_MS,
					actorLane: 'patient-clinician'
				},
				{
					id: 'portal-failure-wall-evidence',
					category: 'human-dependent-review',
					label: 'Chart search, re-keying, and confirmation window',
					durationMs: 3 * DAY_MS,
					actorLane: 'patient-clinician'
				},
				{
					id: 'portal-failure-wall-fax',
					category: 'message-transport',
					label: 'Portal upload and fax handoff',
					durationMs: 3 * DAY_MS,
					actorLane: 'patient-clinician'
				},
				{
					id: 'portal-failure-wall-intake',
					category: 'queue-inbox',
					label: 'Payer intake queue',
					durationMs: DAY_MS,
					actorLane: 'payer-intermediary'
				},
				{
					id: 'portal-failure-wall-review-one',
					category: 'human-dependent-review',
					label: 'First payer review window',
					durationMs: 3 * DAY_MS,
					actorLane: 'payer-intermediary'
				},
				{
					id: 'portal-failure-wall-more-info',
					category: 'missing-information-loop',
					label: 'Additional-information work',
					durationMs: 2 * DAY_MS,
					actorLane: 'patient-clinician'
				},
				{
					id: 'portal-failure-wall-resubmit',
					category: 'message-transport',
					label: 'Supplement transmission and queue',
					durationMs: DAY_MS,
					actorLane: 'patient-clinician'
				},
				{
					id: 'portal-failure-wall-review-two',
					category: 'human-dependent-review',
					label: 'Final review and denial',
					durationMs: DAY_MS,
					actorLane: 'payer-intermediary'
				}
			];
	return wallSegmentsFromBlueprints(pathway, specs).map((segment) => ({
		...segment,
		causedByFailureId:
			segment.category === 'missing-information-loop' ? 'clinically-insufficient' : undefined
	}));
}

function compileWallSegments(
	pathway: PathwayId,
	failureId: FailureId,
	baselineEvents: readonly DraftEvent[]
): readonly WallTimeSegment[] {
	const base = wallSegmentsFromBlueprints(pathway, PATHWAY_FIXTURES[pathway].wallSegments);
	if (failureId === 'none') return base;
	if (failureId === 'clinically-insufficient') return clinicalWallSegments(pathway);
	if (failureId === 'authorization-expired') {
		const timing = FAILURE_TIMINGS[failureId][pathway];
		return base.map((segment, index) =>
			index === base.length - 1
				? {
						...segment,
						id: `${segment.id}--${failureId}`,
						wallEndMs: timing.totalElapsedMs,
						durationMs: timing.totalElapsedMs - segment.wallStartMs,
						causedByFailureId: failureId
					}
				: segment
		);
	}
	const timing: FailureTiming = FAILURE_TIMINGS[failureId][pathway];
	if (failureId === 'identity-mismatch') {
		const triggerIndex = baselineEvents.findIndex(
			(event) => event.milestone === 'evidence-gathered'
		);
		const anchor = Math.max(
			...baselineEvents.slice(0, triggerIndex).map((event) => event.wallEndMs)
		);
		return insertWallDelay(
			base,
			anchor,
			timing.delayMs,
			failureId,
			'missing-information-loop',
			'Human identity reconciliation',
			'patient-clinician'
		);
	}
	const evidenceIndex = baselineEvents.findIndex(
		(event) => event.milestone === 'evidence-gathered'
	);
	const anchor = baselineEvents[evidenceIndex]!.wallEndMs;
	return insertWallDelay(
		base,
		anchor,
		timing.delayMs,
		failureId,
		'missing-information-loop',
		'Manual narrative source and provenance recovery',
		'patient-clinician'
	);
}

function calculateClocks(events: readonly SimulationEvent[]): Clocks {
	const humanWorkByActor = { ...EMPTY_HUMAN_WORK };
	let activeHumanWorkSeconds = 0;
	let automatedProcessingMs = 0;
	let patientElapsedMs = 0;
	for (const event of events) {
		activeHumanWorkSeconds += event.staffEffortSeconds;
		automatedProcessingMs += event.machineProcessingMs;
		humanWorkByActor[event.actorId] += event.staffEffortSeconds;
		patientElapsedMs = Math.max(patientElapsedMs, event.wallEndMs);
	}
	return {
		patientElapsedMs,
		patientElapsedMinutes: patientElapsedMs / MINUTE_MS,
		activeHumanWorkSeconds,
		automatedProcessingMs,
		humanWorkByActor
	};
}

function calculateClockSnapshots(events: readonly SimulationEvent[]): readonly ClockSnapshot[] {
	const snapshots: ClockSnapshot[] = [];
	const humanWorkByActor = { ...EMPTY_HUMAN_WORK };
	let patientElapsedMs = 0;
	let activeHumanWorkSeconds = 0;
	let automatedProcessingMs = 0;
	for (const event of events) {
		patientElapsedMs = Math.max(patientElapsedMs, event.wallEndMs);
		activeHumanWorkSeconds += event.staffEffortSeconds;
		automatedProcessingMs += event.machineProcessingMs;
		humanWorkByActor[event.actorId] += event.staffEffortSeconds;
		snapshots.push({
			eventId: event.id,
			milestone: event.milestone,
			clocks: {
				patientElapsedMs,
				patientElapsedMinutes: patientElapsedMs / MINUTE_MS,
				activeHumanWorkSeconds,
				automatedProcessingMs,
				humanWorkByActor: { ...humanWorkByActor }
			}
		});
	}
	return snapshots;
}

function milestoneVisitStatus(
	milestoneId: MilestoneId,
	events: readonly SimulationEvent[],
	finalOutcome: FinalOutcome
): MilestoneState['visitStatus'] {
	if (events.length === 0) return 'bypassed';
	const latestStatus = events[events.length - 1]!.status;
	if (latestStatus === 'expired') return 'expired';
	if (latestStatus === 'failed') return 'failed';
	if (latestStatus === 'pended' || latestStatus === 'needs-information') return 'pended';
	if (milestoneId === 'decision-issued' && finalOutcome === 'denied') return 'failed';
	return 'completed';
}

function compileMilestones(
	events: readonly SimulationEvent[],
	snapshots: readonly ClockSnapshot[],
	finalOutcome: FinalOutcome
): readonly MilestoneState[] {
	const snapshotByEvent = new Map(snapshots.map((snapshot) => [snapshot.eventId, snapshot]));
	let carry = ZERO_CLOCKS;
	return MILESTONE_DEFINITIONS.map((definition) => {
		const milestoneEvents = events.filter((event) => event.milestone === definition.id);
		const lastEvent = milestoneEvents[milestoneEvents.length - 1];
		if (lastEvent) carry = snapshotByEvent.get(lastEvent.id)!.clocks;
		return {
			...definition,
			visitStatus: milestoneVisitStatus(definition.id, milestoneEvents, finalOutcome),
			visited: milestoneEvents.length > 0,
			firstEventId: milestoneEvents[0]?.id ?? null,
			lastEventId: lastEvent?.id ?? null,
			clocks: carry,
			consequence: lastEvent?.patientText ?? 'This optional branch was not visited in this run.'
		};
	});
}

function eventIdentity(event: SimulationEvent): string {
	return JSON.stringify(event);
}

function compileFailureImpact(
	failureId: FailureId,
	events: readonly SimulationEvent[],
	baselineEvents: readonly SimulationEvent[]
): FailureImpact | null {
	if (failureId === 'none') return null;
	let commonEventPrefixLength = 0;
	while (
		commonEventPrefixLength < events.length &&
		commonEventPrefixLength < baselineEvents.length &&
		eventIdentity(events[commonEventPrefixLength]!) ===
			eventIdentity(baselineEvents[commonEventPrefixLength]!)
	) {
		commonEventPrefixLength += 1;
	}
	const rewindMilestone =
		commonEventPrefixLength > 0
			? events[commonEventPrefixLength - 1]!.milestone
			: MILESTONE_DEFINITIONS[0].id;
	const definition = FAILURE_DEFINITIONS[failureId];
	return {
		failureId,
		triggerMilestone: definition.triggerMilestone!,
		rewindMilestone,
		commonEventPrefixLength,
		affectedEventIds: events
			.filter((event) => event.causedByFailureId === failureId)
			.map((event) => event.id),
		patientConsequence: definition.patientConsequence,
		nextAction: definition.nextAction
	};
}

function compileInternal(
	input: Required<ScenarioInput>,
	includeFailureImpact: boolean
): CompiledRun {
	const fixture = PATHWAY_FIXTURES[input.pathway];
	const drafts = compileDraftEvents(input.pathway, input.failureId, fixture.events);
	const events = sortAndNumberEvents(input.pathway, drafts);
	const wallTimeSegments = compileWallSegments(input.pathway, input.failureId, fixture.events);
	const clocks = calculateClocks(events);
	const clockSnapshots = calculateClockSnapshots(events);
	const statuses = events[events.length - 1]!.statuses;
	const finalOutcome =
		statuses.finalOutcome ?? FAILURE_DEFINITIONS[input.failureId].expectedOutcome;
	const milestones = compileMilestones(events, clockSnapshots, finalOutcome);
	const baselineEvents =
		includeFailureImpact && input.failureId !== 'none'
			? sortAndNumberEvents(input.pathway, fixture.events)
			: events;
	const failureImpact = compileFailureImpact(input.failureId, events, baselineEvents);
	const run: CompiledRun = {
		scenarioVersion: '1.0.0',
		input,
		case: MAYA_LUMBAR_MRI_CASE,
		policy: FICTIONAL_EVIDENCE_POLICY,
		pathway: fixture.definition,
		failure: FAILURE_DEFINITIONS[input.failureId],
		events,
		wallTimeSegments,
		clocks,
		clockSnapshots,
		milestones,
		visitedMilestones: milestones
			.filter((milestone) => milestone.visited)
			.map((milestone) => milestone.id),
		statuses,
		finalOutcome,
		failureImpact,
		evidenceRefs: [...new Set(events.flatMap((event) => event.evidenceRefs))].sort(),
		resourceRefs: [...new Set(events.flatMap((event) => event.resourceRefs))].sort(),
		fhirFixtureIds: fixture.fhirFixtureIds,
		assumptions: [
			...fixture.definition.assumptions,
			'Modeled patient elapsed time, active human work, and automated processing are independent quantities and are not additive.',
			'Milestone labels use relative modeled time; no visitor timezone or live clock affects the result.'
		]
	};
	assertCompiledRun(run);
	return deepFreeze(run);
}

export function compilePriorAuthorizationScenario(input: ScenarioInput): CompiledRun {
	return compileInternal(normalizeInput(input), true);
}

export function compilePriorAuthorizationComparison(failureId: FailureId = 'none'): ComparisonRun {
	if (!(FAILURE_IDS as readonly string[]).includes(failureId)) {
		throw new RangeError(`Unknown prior-authorization failure: ${String(failureId)}`);
	}
	const comparison: ComparisonRun = {
		failureId,
		portalFax: compilePriorAuthorizationScenario({ pathway: 'portal-fax', failureId }),
		fhirEnabled: compilePriorAuthorizationScenario({ pathway: 'fhir-enabled', failureId })
	};
	assertComparisonRun(comparison);
	return deepFreeze(comparison);
}
