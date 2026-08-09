import type { EvidenceRequirement, FictionalPolicy, SyntheticCase } from '../engine/types.ts';

export const EVIDENCE_REQUIREMENTS = Object.freeze([
	Object.freeze({
		id: 'evidence-current-problem',
		label: 'Current problem or indication',
		description: 'A structured clinical problem supports why the MRI was ordered.',
		sourceMode: 'structured',
		resourceRefs: Object.freeze(['Condition/condition-current-problem']),
		fictional: true
	}),
	Object.freeze({
		id: 'evidence-prior-management',
		label: 'Prior management history',
		description:
			'A relevant fact exists only in a narrative note and therefore requires human review.',
		sourceMode: 'narrative',
		resourceRefs: Object.freeze(['DocumentReference/narrative-management-note']),
		fictional: true
	}),
	Object.freeze({
		id: 'evidence-recent-assessment',
		label: 'Recent clinical assessment',
		description: 'A recent structured assessment is available for review.',
		sourceMode: 'structured',
		resourceRefs: Object.freeze(['Observation/recent-clinical-assessment']),
		fictional: true
	}),
	Object.freeze({
		id: 'evidence-clinician-attestation',
		label: 'Ordering clinician attestation',
		description: 'The ordering clinician must actively review and attest to the response.',
		sourceMode: 'human-attestation',
		resourceRefs: Object.freeze(['QuestionnaireResponse/mri-documentation-response']),
		fictional: true
	})
] as const satisfies readonly EvidenceRequirement[]);

export const MAYA_LUMBAR_MRI_CASE = Object.freeze({
	id: 'maya-lumbar-mri-v1',
	version: '1.0.0',
	synthetic: true,
	syntheticNotice:
		'Maya Sen and every identifier, organization, policy, fact, and timing in this model are fictional.',
	patient: Object.freeze({
		id: 'urn:example:synthetic:maya-sen',
		name: 'Maya Sen',
		synthetic: true
	}),
	coverage: Object.freeze({
		id: 'urn:example:synthetic:coverage:maya-sen',
		payerName: 'Example Health Plan (fictional)',
		status: 'active',
		patientReference: 'urn:example:synthetic:maya-sen'
	}),
	request: Object.freeze({
		id: 'urn:example:synthetic:service-request:lumbar-mri',
		resourceType: 'ServiceRequest',
		description: 'Non-urgent outpatient lumbar MRI',
		urgency: 'routine'
	}),
	evidence: EVIDENCE_REQUIREMENTS,
	imagingCapacity: Object.freeze({
		model: 'shared-discrete-appointment-slots',
		availableDayOffsets: Object.freeze([11, 13, 14, 18, 20, 22, 30]),
		description:
			'Both counterfactual pathways use the same authored appointment-slot calendar; a delayed authorization can miss an earlier slot.'
	})
} as const satisfies SyntheticCase);

export const FICTIONAL_EVIDENCE_POLICY = Object.freeze({
	id: 'fictional-lumbar-imaging-evidence-policy-v1',
	version: '1.0.0',
	fictional: true,
	name: 'Example lumbar imaging evidence rule',
	nonDrugMedicalService: true,
	authorizationValidityDays: 14,
	requirements: EVIDENCE_REQUIREMENTS,
	decisionRule:
		'Approve only when all four fictional evidence categories have usable provenance and a clinician has confirmed the response.',
	limitations: Object.freeze([
		'This pedagogical rule is not a medical guideline or a real payer coverage policy.',
		'FHIR-valid content can still be clinically insufficient under this fictional rule.',
		'Approval does not create imaging capacity and does not mean the scan occurred.'
	])
} as const satisfies FictionalPolicy);
