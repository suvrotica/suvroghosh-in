import type {
	EventBlueprint,
	PathwayDefinition,
	PathwayId,
	WallTimeCategory
} from '../engine/types.ts';
import { MODELED_APPOINTMENTS } from './modeled-appointments.ts';
import { QUESTIONNAIRE_RESPONSE_FIXTURES } from './modeled-resource-references.ts';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export type WallSegmentBlueprint = Readonly<{
	id: string;
	category: WallTimeCategory;
	label: string;
	durationMs: number;
	actorLane: 'patient-clinician' | 'ehr-workflow' | 'payer-intermediary' | 'imaging-scheduling';
}>;

export type PathwayFixture = Readonly<{
	definition: PathwayDefinition;
	events: readonly EventBlueprint[];
	wallSegments: readonly WallSegmentBlueprint[];
	fhirFixtureIds: readonly string[];
}>;

const fhirStatuses = {
	before: {
		technical: 'not-submitted',
		business: 'not-started',
		authorization: 'not-requested',
		finalOutcome: null
	},
	requested: {
		technical: 'sent',
		business: 'not-started',
		authorization: 'requested',
		finalOutcome: null
	},
	pended: {
		technical: 'accepted',
		business: 'pended',
		authorization: 'pending',
		finalOutcome: null
	},
	approved: {
		technical: 'accepted',
		business: 'approved',
		authorization: 'approved',
		finalOutcome: null
	},
	complete: {
		technical: 'accepted',
		business: 'closed',
		authorization: 'approved',
		finalOutcome: 'scan-completed'
	}
} as const;

const portalStatuses = fhirStatuses;

const sharedEvidenceRefs = [
	'evidence-current-problem',
	'evidence-prior-management',
	'evidence-recent-assessment',
	'evidence-clinician-attestation'
] as const;

const FHIR_EVENTS = Object.freeze([
	{
		id: 'fhir-mri-order',
		order: 1,
		milestone: 'mri-ordered',
		actorId: 'ordering-clinician',
		actorLane: 'patient-clinician',
		channel: 'human',
		kind: 'human-work',
		wallStartMs: 0,
		wallEndMs: 0,
		staffEffortSeconds: 240,
		machineProcessingMs: 0,
		status: 'completed',
		attempt: 1,
		statuses: fhirStatuses.before,
		patientText: 'The lumbar MRI is ordered. Maya’s waiting clock starts.',
		clinicianText: 'The clinician signs a routine outpatient imaging order.',
		architectText: 'A draft FHIR R4 ServiceRequest is ready for the order-sign workflow.',
		standardRefs: ['fhir-r4-service-request'],
		resourceRefs: ['ServiceRequest/lumbar-mri-order'],
		evidenceRefs: [],
		assumption: true
	},
	{
		id: 'fhir-crd-order-sign-400ms',
		order: 2,
		milestone: 'coverage-checked',
		actorId: 'ehr-workflow',
		actorLane: 'ehr-workflow',
		channel: 'cds-hooks',
		kind: 'machine-processing',
		wallStartMs: 0,
		wallEndMs: 400,
		staffEffortSeconds: 0,
		machineProcessingMs: 400,
		status: 'completed',
		attempt: 1,
		statuses: fhirStatuses.before,
		patientText: 'Coverage requirements are checked inside the ordering workflow.',
		clinicianText: 'A coverage response returns without opening a separate payer portal.',
		architectText:
			'A modeled CRD order-sign CDS Hooks transaction returns computable coverage information in exactly 400 ms.',
		standardRefs: ['davinci-crd-2.2.1', 'cds-hooks-order-sign'],
		resourceRefs: ['Coverage/maya-coverage', 'ServiceRequest/lumbar-mri-order'],
		evidenceRefs: [],
		assumption: true
	},
	{
		id: 'fhir-dtr-questionnaire-package',
		order: 3,
		milestone: 'documentation-received',
		actorId: 'ehr-workflow',
		actorLane: 'ehr-workflow',
		channel: 'fhir',
		kind: 'machine-processing',
		wallStartMs: MINUTE_MS,
		wallEndMs: MINUTE_MS + 220,
		staffEffortSeconds: 0,
		machineProcessingMs: 220,
		status: 'completed',
		attempt: 1,
		statuses: fhirStatuses.before,
		patientText: 'The evidence checklist reaches the clinical team.',
		clinicianText: 'DTR retrieves the fictional Questionnaire package and its provenance.',
		architectText: 'DTR retrieves a versioned Questionnaire package; it does not submit the PA.',
		standardRefs: ['davinci-dtr-2.2.0'],
		resourceRefs: ['Questionnaire/mri-documentation'],
		evidenceRefs: sharedEvidenceRefs,
		assumption: true
	},
	{
		id: 'fhir-dtr-prepopulation-and-review',
		order: 4,
		milestone: 'evidence-gathered',
		actorId: 'authorization-specialist',
		actorLane: 'patient-clinician',
		channel: 'fhir',
		kind: 'human-work',
		wallStartMs: 10 * MINUTE_MS,
		wallEndMs: 30 * MINUTE_MS,
		staffEffortSeconds: 900,
		machineProcessingMs: 310,
		status: 'completed',
		attempt: 1,
		statuses: fhirStatuses.before,
		patientText: 'Available facts are assembled; one narrative fact still needs a person.',
		clinicianText:
			'Structured answers are prepopulated, while the prior-management note remains visibly unconfirmed.',
		architectText:
			'DTR preserves answer provenance and stops short of manufacturing a structured answer from prose.',
		standardRefs: ['davinci-dtr-2.2.0'],
		resourceRefs: [
			'Questionnaire/mri-documentation',
			QUESTIONNAIRE_RESPONSE_FIXTURES.prepopulation.resourceReference,
			'DocumentReference/narrative-management-note'
		],
		evidenceRefs: sharedEvidenceRefs,
		assumption: true
	},
	{
		id: 'fhir-human-confirmation',
		order: 5,
		milestone: 'human-review-completed',
		actorId: 'ordering-clinician',
		actorLane: 'patient-clinician',
		channel: 'human',
		kind: 'human-work',
		wallStartMs: 30 * MINUTE_MS,
		wallEndMs: 60 * MINUTE_MS,
		staffEffortSeconds: 600,
		machineProcessingMs: 0,
		status: 'completed',
		attempt: 1,
		statuses: fhirStatuses.before,
		patientText: 'A clinician reviews the remaining fact and confirms the response.',
		clinicianText: 'The clinician confirms the narrative-only fact and completes the attestation.',
		architectText:
			'Human confirmation completes the QuestionnaireResponse; DTR did not auto-attest.',
		standardRefs: ['davinci-dtr-2.2.0'],
		resourceRefs: [QUESTIONNAIRE_RESPONSE_FIXTURES.completed.resourceReference],
		evidenceRefs: ['evidence-prior-management', 'evidence-clinician-attestation'],
		assumption: true
	},
	{
		id: 'fhir-pas-submit',
		order: 6,
		milestone: 'request-submitted',
		actorId: 'authorization-specialist',
		actorLane: 'ehr-workflow',
		channel: 'fhir',
		kind: 'transfer',
		wallStartMs: 60 * MINUTE_MS,
		wallEndMs: 65 * MINUTE_MS,
		staffEffortSeconds: 180,
		machineProcessingMs: 650,
		status: 'completed',
		attempt: 1,
		statuses: fhirStatuses.requested,
		patientText: 'The authorization request is submitted.',
		clinicianText: 'PAS packages the reviewed evidence without another round of re-keying.',
		architectText:
			'A PAS Bundle beginning with a prior-authorization Claim is POSTed synchronously to Claim/$submit.',
		standardRefs: ['davinci-pas-2.2.1'],
		resourceRefs: ['Bundle/pas-request', 'Claim/prior-authorization-claim'],
		evidenceRefs: sharedEvidenceRefs,
		assumption: true
	},
	{
		id: 'fhir-pas-synchronous-pended-response',
		order: 7,
		milestone: 'request-technically-received',
		actorId: 'payer-service',
		actorLane: 'payer-intermediary',
		channel: 'fhir',
		kind: 'state-change',
		wallStartMs: 65 * MINUTE_MS,
		wallEndMs: 65 * MINUTE_MS + 180,
		staffEffortSeconds: 0,
		machineProcessingMs: 180,
		status: 'pended',
		attempt: 1,
		statuses: fhirStatuses.pended,
		patientText: 'The request arrived, but no decision has been made.',
		clinicianText:
			'The API returned a technically successful response with a pended business status.',
		architectText:
			'HTTP 2xx carries a synchronous PAS response Bundle beginning with ClaimResponse. Pended is the business result, not an open eleven-day HTTP request.',
		standardRefs: ['davinci-pas-2.2.1'],
		resourceRefs: ['Bundle/pas-pended-response', 'ClaimResponse/pas-pended'],
		evidenceRefs: sharedEvidenceRefs,
		assumption: true
	},
	{
		id: 'fhir-payer-clinical-review',
		order: 8,
		milestone: 'payer-review',
		actorId: 'payer-reviewer',
		actorLane: 'payer-intermediary',
		channel: 'internal',
		kind: 'human-work',
		wallStartMs: 2 * DAY_MS,
		wallEndMs: 3 * DAY_MS - MINUTE_MS,
		staffEffortSeconds: 1_200,
		machineProcessingMs: 720,
		status: 'pended',
		attempt: 1,
		statuses: fhirStatuses.pended,
		patientText: 'The request waits for and receives payer review.',
		clinicianText: 'The payer reviews the same fictional four-part evidence rule.',
		architectText:
			'Internal review follows technical intake. The standardized envelope does not determine the clinical result.',
		standardRefs: ['model-assumption-fictional-policy'],
		resourceRefs: ['Claim/prior-authorization-claim'],
		evidenceRefs: sharedEvidenceRefs,
		assumption: true
	},
	{
		id: 'fhir-pas-final-subscription-decision',
		order: 9,
		milestone: 'decision-issued',
		actorId: 'payer-service',
		actorLane: 'payer-intermediary',
		channel: 'subscription',
		kind: 'decision',
		wallStartMs: 3 * DAY_MS - MINUTE_MS,
		wallEndMs: 3 * DAY_MS,
		staffEffortSeconds: 120,
		machineProcessingMs: 260,
		status: 'completed',
		attempt: 1,
		statuses: fhirStatuses.approved,
		patientText: 'The fictional payer approves the request.',
		clinicianText: 'A later final business result arrives after the initial pended response.',
		architectText:
			'The submitting client receives the final result through the PAS subscription pattern; the original HTTP request did not remain open.',
		standardRefs: ['davinci-pas-2.2.1'],
		resourceRefs: ['ClaimResponse/pas-approved'],
		evidenceRefs: sharedEvidenceRefs,
		assumption: true
	},
	{
		id: 'fhir-schedule-and-scan',
		order: 10,
		milestone: 'scheduled-and-scan-received',
		actorId: 'imaging-scheduler',
		actorLane: 'imaging-scheduling',
		channel: 'phone',
		kind: 'state-change',
		wallStartMs: 3 * DAY_MS,
		wallEndMs: 11 * DAY_MS,
		staffEffortSeconds: 600,
		machineProcessingMs: 140,
		status: 'completed',
		attempt: 1,
		statuses: fhirStatuses.complete,
		patientText: 'Maya reaches the shared Day 11 appointment and receives the scan.',
		clinicianText: 'Scheduling remains a separate operational step after approval.',
		architectText: 'Appointment capacity is external to CRD, DTR, PAS, and the approval decision.',
		standardRefs: ['fhir-r4-appointment'],
		resourceRefs: [MODELED_APPOINTMENTS['fhir-enabled'].none.resourceReference],
		evidenceRefs: [],
		assumption: true
	}
] as const satisfies readonly EventBlueprint[]);

const PORTAL_EVENTS = Object.freeze([
	{
		id: 'portal-mri-order',
		order: 1,
		milestone: 'mri-ordered',
		actorId: 'ordering-clinician',
		actorLane: 'patient-clinician',
		channel: 'human',
		kind: 'human-work',
		wallStartMs: 0,
		wallEndMs: 0,
		staffEffortSeconds: 240,
		machineProcessingMs: 0,
		status: 'completed',
		attempt: 1,
		statuses: portalStatuses.before,
		patientText: 'The lumbar MRI is ordered. Maya’s waiting clock starts.',
		clinicianText: 'The clinician signs a routine outpatient imaging order.',
		architectText: 'The same synthetic ServiceRequest begins both counterfactual pathways.',
		standardRefs: ['fhir-r4-service-request'],
		resourceRefs: ['ServiceRequest/lumbar-mri-order'],
		evidenceRefs: [],
		assumption: true
	},
	{
		id: 'portal-coverage-lookup',
		order: 2,
		milestone: 'coverage-checked',
		actorId: 'authorization-specialist',
		actorLane: 'patient-clinician',
		channel: 'portal',
		kind: 'human-work',
		wallStartMs: 2 * HOUR_MS,
		wallEndMs: 3 * HOUR_MS,
		staffEffortSeconds: 1_200,
		machineProcessingMs: 180,
		status: 'completed',
		attempt: 1,
		statuses: portalStatuses.before,
		patientText: 'Coverage requirements are found after a separate portal lookup.',
		clinicianText:
			'A specialist signs into the payer portal and searches for the plan requirement.',
		architectText: 'Coverage discovery is a manual portal workflow in this counterfactual.',
		standardRefs: ['model-assumption-portal-workflow'],
		resourceRefs: ['Coverage/maya-coverage'],
		evidenceRefs: [],
		assumption: true
	},
	{
		id: 'portal-documentation-download',
		order: 3,
		milestone: 'documentation-received',
		actorId: 'authorization-specialist',
		actorLane: 'patient-clinician',
		channel: 'portal',
		kind: 'human-work',
		wallStartMs: DAY_MS,
		wallEndMs: 2 * DAY_MS,
		staffEffortSeconds: 900,
		machineProcessingMs: 140,
		status: 'completed',
		attempt: 1,
		statuses: portalStatuses.before,
		patientText: 'The evidence checklist arrives through a separate portal task.',
		clinicianText: 'The specialist downloads and interprets the fictional requirements.',
		architectText:
			'The requirement is transported as a portal artifact rather than a computable Questionnaire package.',
		standardRefs: ['model-assumption-portal-workflow'],
		resourceRefs: ['DocumentReference/portal-requirements'],
		evidenceRefs: sharedEvidenceRefs,
		assumption: true
	},
	{
		id: 'portal-evidence-rekey',
		order: 4,
		milestone: 'evidence-gathered',
		actorId: 'authorization-specialist',
		actorLane: 'patient-clinician',
		channel: 'portal',
		kind: 'human-work',
		wallStartMs: 2 * DAY_MS,
		wallEndMs: 4 * DAY_MS,
		staffEffortSeconds: 1_800,
		machineProcessingMs: 90,
		status: 'completed',
		attempt: 1,
		statuses: portalStatuses.before,
		patientText: 'Clinical facts are gathered and entered again.',
		clinicianText:
			'The specialist searches the chart, copies structured facts, and locates the narrative note.',
		architectText:
			'The same source evidence is manually re-keyed; the policy and patient facts do not change.',
		standardRefs: ['model-assumption-portal-workflow'],
		resourceRefs: ['DocumentReference/narrative-management-note'],
		evidenceRefs: sharedEvidenceRefs,
		assumption: true
	},
	{
		id: 'portal-human-review',
		order: 5,
		milestone: 'human-review-completed',
		actorId: 'ordering-clinician',
		actorLane: 'patient-clinician',
		channel: 'human',
		kind: 'human-work',
		wallStartMs: 4 * DAY_MS,
		wallEndMs: 5 * DAY_MS,
		staffEffortSeconds: 900,
		machineProcessingMs: 0,
		status: 'completed',
		attempt: 1,
		statuses: portalStatuses.before,
		patientText: 'A clinician confirms the assembled evidence.',
		clinicianText: 'The clinician reviews the re-keyed facts and signs the attestation.',
		architectText: 'Human review remains necessary in both pathways.',
		standardRefs: ['model-assumption-fictional-policy'],
		resourceRefs: ['DocumentReference/narrative-management-note'],
		evidenceRefs: ['evidence-prior-management', 'evidence-clinician-attestation'],
		assumption: true
	},
	{
		id: 'portal-fax-submit',
		order: 6,
		milestone: 'request-submitted',
		actorId: 'authorization-specialist',
		actorLane: 'patient-clinician',
		channel: 'fax',
		kind: 'transfer',
		wallStartMs: 5 * DAY_MS,
		wallEndMs: 6 * DAY_MS,
		staffEffortSeconds: 1_200,
		machineProcessingMs: 300,
		status: 'completed',
		attempt: 1,
		statuses: portalStatuses.requested,
		patientText: 'The request leaves by portal upload and fax.',
		clinicianText: 'The specialist packages, uploads, and transmits the request.',
		architectText:
			'This is an authored portal/fax transport assumption, not a universal pre-FHIR workflow.',
		standardRefs: ['model-assumption-portal-workflow'],
		resourceRefs: ['DocumentReference/fax-packet'],
		evidenceRefs: sharedEvidenceRefs,
		assumption: true
	},
	{
		id: 'portal-payer-intake',
		order: 7,
		milestone: 'request-technically-received',
		actorId: 'payer-service',
		actorLane: 'payer-intermediary',
		channel: 'fax',
		kind: 'human-work',
		wallStartMs: 8 * DAY_MS,
		wallEndMs: 9 * DAY_MS,
		staffEffortSeconds: 300,
		machineProcessingMs: 200,
		status: 'pended',
		attempt: 1,
		statuses: portalStatuses.pended,
		patientText: 'The request is marked received, but that is not a decision.',
		clinicianText: 'A payer intake queue indexes the packet for review.',
		architectText: 'Receipt and business adjudication remain separate even without the FHIR API.',
		standardRefs: ['model-assumption-portal-workflow'],
		resourceRefs: ['DocumentReference/fax-packet'],
		evidenceRefs: sharedEvidenceRefs,
		assumption: true
	},
	{
		id: 'portal-payer-review',
		order: 8,
		milestone: 'payer-review',
		actorId: 'payer-reviewer',
		actorLane: 'payer-intermediary',
		channel: 'internal',
		kind: 'human-work',
		wallStartMs: 9 * DAY_MS,
		wallEndMs: 12 * DAY_MS - MINUTE_MS,
		staffEffortSeconds: 1_800,
		machineProcessingMs: 500,
		status: 'pended',
		attempt: 1,
		statuses: portalStatuses.pended,
		patientText: 'The request waits for and receives payer review.',
		clinicianText: 'The payer reviews the same fictional four-part evidence rule.',
		architectText:
			'The adjudication facts and policy are identical to the FHIR-enabled counterfactual.',
		standardRefs: ['model-assumption-fictional-policy'],
		resourceRefs: ['DocumentReference/fax-packet'],
		evidenceRefs: sharedEvidenceRefs,
		assumption: true
	},
	{
		id: 'portal-decision',
		order: 9,
		milestone: 'decision-issued',
		actorId: 'payer-service',
		actorLane: 'payer-intermediary',
		channel: 'portal',
		kind: 'decision',
		wallStartMs: 12 * DAY_MS - MINUTE_MS,
		wallEndMs: 12 * DAY_MS,
		staffEffortSeconds: 120,
		machineProcessingMs: 100,
		status: 'completed',
		attempt: 1,
		statuses: portalStatuses.approved,
		patientText: 'The fictional payer approves the request.',
		clinicianText: 'The approval appears in the payer portal.',
		architectText:
			'Approval is a business result, separate from the preceding transport and intake.',
		standardRefs: ['model-assumption-portal-workflow'],
		resourceRefs: ['DocumentReference/portal-approval'],
		evidenceRefs: sharedEvidenceRefs,
		assumption: true
	},
	{
		id: 'portal-schedule-and-scan',
		order: 10,
		milestone: 'scheduled-and-scan-received',
		actorId: 'imaging-scheduler',
		actorLane: 'imaging-scheduling',
		channel: 'phone',
		kind: 'state-change',
		wallStartMs: 12 * DAY_MS,
		wallEndMs: 18 * DAY_MS,
		staffEffortSeconds: 900,
		machineProcessingMs: 120,
		status: 'completed',
		attempt: 1,
		statuses: portalStatuses.complete,
		patientText: 'Maya reaches the shared Day 18 appointment slot and receives the scan.',
		clinicianText: 'Scheduling remains a separate operational step after approval.',
		architectText:
			'The later authorization misses earlier shared appointment slots in the authored capacity calendar.',
		standardRefs: ['fhir-r4-appointment'],
		resourceRefs: [MODELED_APPOINTMENTS['portal-fax'].none.resourceReference],
		evidenceRefs: [],
		assumption: true
	}
] as const satisfies readonly EventBlueprint[]);

export const PATHWAY_FIXTURES = Object.freeze({
	'fhir-enabled': Object.freeze({
		definition: Object.freeze({
			id: 'fhir-enabled',
			label: 'FHIR-enabled',
			description:
				'CRD discovers, DTR assembles and reviews, and PAS submits and manages the request.',
			baselineElapsedMinutes: 15_840,
			assumptions: Object.freeze([
				'The named Da Vinci guides are a modeled implementation choice and are not described as mandated by name in CMS-0057-F.',
				'The 400 ms transaction and every queue duration are fictional explanatory assumptions.',
				'The PAS $submit exchange is synchronous; the later final result uses the subscription pattern.',
				'An optional X12 intermediary branch may exist under the enforcement-discretion context but is not compulsory here.'
			]),
			optionalX12Branch: true
		}),
		events: FHIR_EVENTS,
		wallSegments: Object.freeze([
			{
				id: 'fhir-wall-automated',
				category: 'automated-processing',
				label: 'Automated coverage response',
				durationMs: 400,
				actorLane: 'ehr-workflow'
			},
			{
				id: 'fhir-wall-evidence',
				category: 'human-dependent-review',
				label: 'Evidence assembly and confirmation window',
				durationMs: 60 * MINUTE_MS - 400,
				actorLane: 'patient-clinician'
			},
			{
				id: 'fhir-wall-submit',
				category: 'message-transport',
				label: 'Packaging and synchronous submission window',
				durationMs: 5 * MINUTE_MS,
				actorLane: 'ehr-workflow'
			},
			{
				id: 'fhir-wall-intake-queue',
				category: 'queue-inbox',
				label: 'Payer review queue',
				durationMs: 2 * DAY_MS - 65 * MINUTE_MS,
				actorLane: 'payer-intermediary'
			},
			{
				id: 'fhir-wall-review',
				category: 'human-dependent-review',
				label: 'Payer review window',
				durationMs: DAY_MS,
				actorLane: 'payer-intermediary'
			},
			{
				id: 'fhir-wall-scheduling',
				category: 'external-scheduling',
				label: 'Waiting for the shared imaging appointment',
				durationMs: 8 * DAY_MS,
				actorLane: 'imaging-scheduling'
			}
		] as const),
		fhirFixtureIds: Object.freeze([
			'maya-lumbar-mri-r4',
			'pas-request',
			'pas-pended-response',
			'pas-approved-response',
			'pas-denied-response',
			'additional-information',
			QUESTIONNAIRE_RESPONSE_FIXTURES.prepopulation.id,
			MODELED_APPOINTMENTS['fhir-enabled'].none.id,
			MODELED_APPOINTMENTS['fhir-enabled']['identity-mismatch'].id,
			MODELED_APPOINTMENTS['fhir-enabled']['narrative-only'].id,
			MODELED_APPOINTMENTS['fhir-enabled']['authorization-expired'].id
		])
	}),
	'portal-fax': Object.freeze({
		definition: Object.freeze({
			id: 'portal-fax',
			label: 'Portal and fax',
			description:
				'Separate portal lookup, manual chart search, re-keying, uploads, fax, and queue follow-up.',
			baselineElapsedMinutes: 25_920,
			assumptions: Object.freeze([
				'This is one fictional portal/fax workflow, not a claim that every organization works this way.',
				'The patient facts, policy, evidence, urgency, and appointment calendar match the FHIR-enabled pathway.',
				'The longer duration comes only from authored discovery, re-keying, handoff, transport, and queue assumptions.'
			]),
			optionalX12Branch: false
		}),
		events: PORTAL_EVENTS,
		wallSegments: Object.freeze([
			{
				id: 'portal-wall-coverage',
				category: 'human-dependent-review',
				label: 'Portal coverage search',
				durationMs: DAY_MS,
				actorLane: 'patient-clinician'
			},
			{
				id: 'portal-wall-requirements-queue',
				category: 'queue-inbox',
				label: 'Requirements inbox wait',
				durationMs: DAY_MS,
				actorLane: 'patient-clinician'
			},
			{
				id: 'portal-wall-evidence',
				category: 'human-dependent-review',
				label: 'Chart search, re-keying, and confirmation window',
				durationMs: 3 * DAY_MS,
				actorLane: 'patient-clinician'
			},
			{
				id: 'portal-wall-fax',
				category: 'message-transport',
				label: 'Portal upload and fax handoff',
				durationMs: 3 * DAY_MS,
				actorLane: 'patient-clinician'
			},
			{
				id: 'portal-wall-intake',
				category: 'queue-inbox',
				label: 'Payer intake queue',
				durationMs: DAY_MS,
				actorLane: 'payer-intermediary'
			},
			{
				id: 'portal-wall-review',
				category: 'human-dependent-review',
				label: 'Payer review window',
				durationMs: 3 * DAY_MS,
				actorLane: 'payer-intermediary'
			},
			{
				id: 'portal-wall-scheduling',
				category: 'external-scheduling',
				label: 'Waiting for the shared imaging appointment',
				durationMs: 6 * DAY_MS,
				actorLane: 'imaging-scheduling'
			}
		] as const),
		fhirFixtureIds: Object.freeze([
			'maya-lumbar-mri-r4',
			MODELED_APPOINTMENTS['portal-fax'].none.id,
			MODELED_APPOINTMENTS['portal-fax']['identity-mismatch'].id,
			MODELED_APPOINTMENTS['portal-fax']['narrative-only'].id,
			MODELED_APPOINTMENTS['portal-fax']['authorization-expired'].id
		])
	})
} satisfies Readonly<Record<PathwayId, PathwayFixture>>);
