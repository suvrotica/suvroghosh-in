import type { FailureDefinition, FailureId, PathwayId, PublicFailureId } from '../engine/types.ts';
import { MODELED_APPOINTMENTS } from './modeled-appointments.ts';
import { QUESTIONNAIRE_RESPONSE_FIXTURES } from './modeled-resource-references.ts';
import { DAY_MS } from './pathways.v1.ts';

const BOTH_PATHWAYS = Object.freeze(['portal-fax', 'fhir-enabled'] as const);

export const FAILURE_DEFINITIONS = Object.freeze({
	none: Object.freeze({
		id: 'none',
		public: false,
		label: 'Baseline: nothing broke',
		shortLabel: 'Baseline',
		description: 'The declared evidence is usable and the request follows the baseline path.',
		triggerMilestone: null,
		affectedRefs: Object.freeze([]),
		technicalStatus: 'accepted',
		businessStatus: 'closed',
		authorizationStatus: 'approved',
		patientConsequence: 'Maya receives the scan at the modeled appointment.',
		nextAction: 'No exception action is required.',
		expectedOutcome: 'scan-completed',
		pathways: BOTH_PATHWAYS
	}),
	'identity-mismatch': Object.freeze({
		id: 'identity-mismatch',
		public: true,
		label: 'Identity mismatch',
		shortLabel: 'Identity',
		description:
			'The coverage reference and a supporting record cannot be joined safely, so the system refuses to guess.',
		triggerMilestone: 'evidence-gathered',
		affectedRefs: Object.freeze([
			'Coverage/maya-coverage',
			'DocumentReference/narrative-management-note'
		]),
		technicalStatus: 'not-submitted',
		businessStatus: 'not-started',
		authorizationStatus: 'not-requested',
		patientConsequence:
			'A two-day reconciliation task causes Maya to miss an earlier appointment slot.',
		nextAction:
			'A human verifies the synthetic coverage-to-patient link before evidence is joined.',
		expectedOutcome: 'scan-completed',
		pathways: BOTH_PATHWAYS
	}),
	'narrative-only': Object.freeze({
		id: 'narrative-only',
		public: true,
		label: 'Narrative evidence loses usable provenance',
		shortLabel: 'Narrative only',
		description:
			'The fact is present in prose, but the expected source attachment or usable provenance is missing after initial assembly.',
		triggerMilestone: 'human-review-completed',
		affectedRefs: Object.freeze([
			'evidence-prior-management',
			'DocumentReference/narrative-management-note'
		]),
		technicalStatus: 'not-submitted',
		businessStatus: 'not-started',
		authorizationStatus: 'not-requested',
		patientConsequence:
			'Manual source recovery adds three days in the FHIR path and four in the portal/fax path, missing earlier slots.',
		nextAction:
			'A human locates the source note, preserves provenance, attaches it, and confirms the answer.',
		expectedOutcome: 'scan-completed',
		pathways: BOTH_PATHWAYS
	}),
	'clinically-insufficient': Object.freeze({
		id: 'clinically-insufficient',
		public: true,
		label: 'FHIR-valid, clinically insufficient',
		shortLabel: 'Insufficient evidence',
		description:
			'The PAS request passes structural intake, but the evidence does not satisfy the fictional decision rule.',
		triggerMilestone: 'payer-review',
		affectedRefs: Object.freeze([
			QUESTIONNAIRE_RESPONSE_FIXTURES.completed.resourceReference,
			'Claim/prior-authorization-claim'
		]),
		technicalStatus: 'accepted',
		businessStatus: 'denied',
		authorizationStatus: 'denied',
		patientConsequence:
			'Maya waits through one bounded information cycle and the request is then denied for a specific fictional evidence gap.',
		nextAction:
			'The clinician reviews the specific reason and decides whether a materially new request is appropriate.',
		expectedOutcome: 'denied',
		pathways: BOTH_PATHWAYS
	}),
	'authorization-expired': Object.freeze({
		id: 'authorization-expired',
		public: true,
		label: 'Authorization expires before the appointment',
		shortLabel: 'Expired',
		description:
			'The request is approved, but the next modeled appointment is beyond the fictional fourteen-day validity period.',
		triggerMilestone: 'scheduled-and-scan-received',
		affectedRefs: Object.freeze([
			'ClaimResponse/pas-approved',
			MODELED_APPOINTMENTS['fhir-enabled']['authorization-expired'].resourceReference,
			MODELED_APPOINTMENTS['portal-fax']['authorization-expired'].resourceReference
		]),
		technicalStatus: 'accepted',
		businessStatus: 'closed',
		authorizationStatus: 'expired',
		patientConsequence:
			'The stale approval cannot be used and Maya does not receive the scan in this run.',
		nextAction: 'Start the fictional updated authorization workflow before rescheduling.',
		expectedOutcome: 'expired',
		pathways: BOTH_PATHWAYS
	})
} satisfies Readonly<Record<FailureId, FailureDefinition>>);

export type FailureTiming = Readonly<{
	totalElapsedMs: number;
	delayMs: number;
	appointmentDay: number | null;
	denialDay: number | null;
}>;

export const FAILURE_TIMINGS = Object.freeze({
	'identity-mismatch': Object.freeze({
		'fhir-enabled': Object.freeze({
			totalElapsedMs: 13 * DAY_MS,
			delayMs: 2 * DAY_MS,
			appointmentDay: 13,
			denialDay: null
		}),
		'portal-fax': Object.freeze({
			totalElapsedMs: 20 * DAY_MS,
			delayMs: 2 * DAY_MS,
			appointmentDay: 20,
			denialDay: null
		})
	}),
	'narrative-only': Object.freeze({
		'fhir-enabled': Object.freeze({
			totalElapsedMs: 14 * DAY_MS,
			delayMs: 3 * DAY_MS,
			appointmentDay: 14,
			denialDay: null
		}),
		'portal-fax': Object.freeze({
			totalElapsedMs: 22 * DAY_MS,
			delayMs: 4 * DAY_MS,
			appointmentDay: 22,
			denialDay: null
		})
	}),
	'clinically-insufficient': Object.freeze({
		'fhir-enabled': Object.freeze({
			totalElapsedMs: 8 * DAY_MS,
			delayMs: 0,
			appointmentDay: null,
			denialDay: 8
		}),
		'portal-fax': Object.freeze({
			totalElapsedMs: 16 * DAY_MS,
			delayMs: 0,
			appointmentDay: null,
			denialDay: 16
		})
	}),
	'authorization-expired': Object.freeze({
		'fhir-enabled': Object.freeze({
			totalElapsedMs: 20 * DAY_MS,
			delayMs: 9 * DAY_MS,
			appointmentDay: 20,
			denialDay: null
		}),
		'portal-fax': Object.freeze({
			totalElapsedMs: 30 * DAY_MS,
			delayMs: 12 * DAY_MS,
			appointmentDay: 30,
			denialDay: null
		})
	})
} satisfies Readonly<Record<PublicFailureId, Readonly<Record<PathwayId, FailureTiming>>>>);

export const getFailureDefinition = (failureId: FailureId): FailureDefinition =>
	FAILURE_DEFINITIONS[failureId];

export const getFailureTiming = (failureId: PublicFailureId, pathway: PathwayId): FailureTiming =>
	FAILURE_TIMINGS[failureId][pathway];
