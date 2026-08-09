import type {
	ActorId,
	FailureId,
	MilestoneDefinition,
	MilestoneId,
	PathwayId,
	PerspectiveId,
	PublicFailureId,
	ScenarioId
} from './types.ts';

export const SCENARIO_ID = 'maya-lumbar-mri-v1' as const satisfies ScenarioId;
export const SCENARIO_VERSION = '1.0.0' as const;

export const PATHWAY_IDS = ['portal-fax', 'fhir-enabled'] as const satisfies readonly PathwayId[];
export const PATHWAY_LABELS = Object.freeze({
	'portal-fax': 'Portal and fax',
	'fhir-enabled': 'FHIR-enabled'
} satisfies Readonly<Record<PathwayId, string>>);

export const PUBLIC_FAILURE_IDS = [
	'identity-mismatch',
	'narrative-only',
	'clinically-insufficient',
	'authorization-expired'
] as const satisfies readonly PublicFailureId[];

export const FAILURE_IDS = ['none', ...PUBLIC_FAILURE_IDS] as const satisfies readonly FailureId[];

export const PERSPECTIVE_IDS = [
	'patient',
	'clinician',
	'architect'
] as const satisfies readonly PerspectiveId[];

export const ACTOR_IDS = [
	'maya',
	'ordering-clinician',
	'authorization-specialist',
	'ehr-workflow',
	'payer-service',
	'payer-reviewer',
	'imaging-scheduler'
] as const satisfies readonly ActorId[];

export const MILESTONE_DEFINITIONS = Object.freeze([
	{
		id: 'mri-ordered',
		index: 0,
		label: 'MRI ordered',
		shortLabel: 'Order',
		description: 'The non-urgent outpatient lumbar MRI order is ready.',
		actorLane: 'patient-clinician',
		optionalBranch: false
	},
	{
		id: 'coverage-checked',
		index: 1,
		label: 'Coverage requirements checked',
		shortLabel: 'Coverage',
		description: 'Coverage and prior-authorization requirements are discovered.',
		actorLane: 'ehr-workflow',
		optionalBranch: false
	},
	{
		id: 'documentation-received',
		index: 2,
		label: 'Documentation requirements received',
		shortLabel: 'Requirements',
		description: 'The fictional evidence requirements reach the clinical workflow.',
		actorLane: 'ehr-workflow',
		optionalBranch: false
	},
	{
		id: 'evidence-gathered',
		index: 3,
		label: 'Supporting evidence gathered',
		shortLabel: 'Evidence',
		description: 'Structured facts and the narrative-only fact are assembled.',
		actorLane: 'patient-clinician',
		optionalBranch: false
	},
	{
		id: 'human-review-completed',
		index: 4,
		label: 'Human review completed',
		shortLabel: 'Human review',
		description: 'A person confirms provenance, completeness, and attestation.',
		actorLane: 'patient-clinician',
		optionalBranch: false
	},
	{
		id: 'request-submitted',
		index: 5,
		label: 'Authorization request submitted',
		shortLabel: 'Submit',
		description: 'The formal request leaves the clinical organization.',
		actorLane: 'ehr-workflow',
		optionalBranch: false
	},
	{
		id: 'request-technically-received',
		index: 6,
		label: 'Request technically received',
		shortLabel: 'Technical receipt',
		description: 'Transport succeeds; this is not an authorization decision.',
		actorLane: 'payer-intermediary',
		optionalBranch: false
	},
	{
		id: 'payer-review',
		index: 7,
		label: 'Payer review',
		shortLabel: 'Payer review',
		description: 'The payer applies the same fictional evidence rule in either pathway.',
		actorLane: 'payer-intermediary',
		optionalBranch: false
	},
	{
		id: 'more-information-requested',
		index: 8,
		label: 'More information requested',
		shortLabel: 'More information',
		description: 'The request is pended while a declared evidence gap is addressed.',
		actorLane: 'payer-intermediary',
		optionalBranch: true
	},
	{
		id: 'request-supplemented',
		index: 9,
		label: 'Request supplemented/resubmitted',
		shortLabel: 'Supplement',
		description: 'One bounded additional-information cycle returns evidence.',
		actorLane: 'patient-clinician',
		optionalBranch: true
	},
	{
		id: 'decision-issued',
		index: 10,
		label: 'Decision issued',
		shortLabel: 'Decision',
		description: 'The business decision is distinct from technical transport.',
		actorLane: 'payer-intermediary',
		optionalBranch: false
	},
	{
		id: 'scheduled-and-scan-received',
		index: 11,
		label: 'Scheduled and scan received',
		shortLabel: 'Schedule and scan',
		description: 'An approval must still be valid when the appointment occurs.',
		actorLane: 'imaging-scheduling',
		optionalBranch: false
	}
] as const satisfies readonly MilestoneDefinition[]);

export const MILESTONE_IDS = MILESTONE_DEFINITIONS.map(
	(definition) => definition.id
) as readonly MilestoneId[];

export const MILESTONE_BY_ID = Object.freeze(
	Object.fromEntries(
		MILESTONE_DEFINITIONS.map((definition) => [definition.id, definition])
	) as Record<MilestoneId, MilestoneDefinition>
);

export const FHIR_BASELINE_EXPECTED = Object.freeze({
	patientElapsedDays: 11,
	patientElapsedMinutes: 15_840,
	patientElapsedMs: 950_400_000,
	activeHumanWorkSeconds: 3_840,
	automatedProcessingMs: 2_880,
	declaredTransactionEventId: 'fhir-crd-order-sign-400ms',
	declaredTransactionMs: 400
});

export const PORTAL_FAX_BASELINE_EXPECTED = Object.freeze({
	patientElapsedDays: 18,
	patientElapsedMinutes: 25_920,
	patientElapsedMs: 1_555_200_000,
	activeHumanWorkSeconds: 9_360,
	automatedProcessingMs: 1_630
});
