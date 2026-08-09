import { MODELED_APPOINTMENTS, type ModeledAppointment } from '../modeled-appointments.ts';
import { QUESTIONNAIRE_RESPONSE_FIXTURES } from '../modeled-resource-references.ts';

type FhirResource = Readonly<Record<string, unknown>>;

function deepFreeze<T>(value: T): Readonly<T> {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	}
	return value as Readonly<T>;
}

const patient = {
	resourceType: 'Patient',
	id: 'maya-sen',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	identifier: [{ system: 'urn:example:synthetic:patient', value: 'maya-sen' }],
	name: [{ text: 'Maya Sen' }]
} as const;

const orderingOrganization = {
	resourceType: 'Organization',
	id: 'example-ordering-clinic',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	name: 'Example Ordering Clinic (fictional)'
} as const;

const orderingPractitioner = {
	resourceType: 'Practitioner',
	id: 'example-ordering-clinician',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	active: true,
	name: [{ text: 'Example Ordering Clinician (fictional)' }]
} as const;

const payerOrganization = {
	resourceType: 'Organization',
	id: 'example-health-plan',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	name: 'Example Health Plan (fictional)'
} as const;

const coverage = {
	resourceType: 'Coverage',
	id: 'maya-coverage',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	status: 'active',
	beneficiary: { reference: 'Patient/maya-sen' },
	payor: [{ reference: 'Organization/example-health-plan' }]
} as const;

const condition = {
	resourceType: 'Condition',
	id: 'condition-current-problem',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	clinicalStatus: {
		coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }]
	},
	verificationStatus: {
		coding: [
			{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }
		]
	},
	code: { text: 'Synthetic current problem supporting the imaging order' },
	subject: { reference: 'Patient/maya-sen' }
} as const;

const assessment = {
	resourceType: 'Observation',
	id: 'recent-clinical-assessment',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	status: 'final',
	code: { text: 'Synthetic recent clinical assessment' },
	subject: { reference: 'Patient/maya-sen' },
	valueString: 'Present in the synthetic record; details intentionally minimized.'
} as const;

const narrativeNote = {
	resourceType: 'DocumentReference',
	id: 'narrative-management-note',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	status: 'current',
	docStatus: 'final',
	type: { text: 'Synthetic clinical note' },
	subject: { reference: 'Patient/maya-sen' },
	description:
		'Contains a fictional prior-management fact in narrative form; a human must confirm it.',
	content: [
		{
			attachment: {
				contentType: 'text/plain',
				title: 'Synthetic narrative note — no real patient data'
			}
		}
	]
} as const;

const serviceRequest = {
	resourceType: 'ServiceRequest',
	id: 'lumbar-mri-order',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	status: 'active',
	intent: 'order',
	category: [{ text: 'Diagnostic imaging' }],
	priority: 'routine',
	code: { text: 'Non-urgent outpatient lumbar MRI' },
	subject: { reference: 'Patient/maya-sen' },
	requester: { reference: 'Practitioner/example-ordering-clinician' },
	insurance: [{ reference: 'Coverage/maya-coverage' }],
	reasonReference: [{ reference: 'Condition/condition-current-problem' }],
	supportingInfo: [
		{ reference: 'Observation/recent-clinical-assessment' },
		{ reference: 'DocumentReference/narrative-management-note' }
	]
} as const;

const procedure = {
	resourceType: 'Procedure',
	id: 'lumbar-mri-procedure',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	status: 'preparation',
	category: { text: 'Diagnostic imaging' },
	code: { text: 'Proposed non-urgent outpatient lumbar MRI' },
	subject: { reference: 'Patient/maya-sen' },
	basedOn: [{ reference: 'ServiceRequest/lumbar-mri-order' }]
} as const;

const questionnaire = {
	resourceType: 'Questionnaire',
	id: 'mri-documentation',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	url: 'urn:example:synthetic:questionnaire:mri-documentation',
	version: '1.0.0',
	status: 'active',
	title: 'Fictional lumbar imaging evidence questionnaire',
	item: [
		{
			linkId: 'current-problem',
			text: 'Current problem or indication documented?',
			type: 'reference',
			required: true
		},
		{
			linkId: 'prior-management',
			text: 'Prior management history documented?',
			type: 'reference',
			required: true
		},
		{
			linkId: 'recent-assessment',
			text: 'Recent clinical assessment present?',
			type: 'reference',
			required: true
		},
		{
			linkId: 'attestation',
			text: 'Ordering clinician attestation completed?',
			type: 'boolean',
			required: true
		}
	]
} as const;

const inProgressQuestionnaireResponse = {
	resourceType: 'QuestionnaireResponse',
	id: QUESTIONNAIRE_RESPONSE_FIXTURES.prepopulation.id,
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	questionnaire: 'Questionnaire/mri-documentation',
	status: 'in-progress',
	subject: { reference: 'Patient/maya-sen' },
	authored: '2099-01-01T09:10:00Z',
	item: [
		{
			linkId: 'current-problem',
			answer: [{ valueReference: { reference: 'Condition/condition-current-problem' } }]
		},
		{
			linkId: 'recent-assessment',
			answer: [{ valueReference: { reference: 'Observation/recent-clinical-assessment' } }]
		}
	]
} as const;

const questionnaireResponse = {
	resourceType: 'QuestionnaireResponse',
	id: QUESTIONNAIRE_RESPONSE_FIXTURES.completed.id,
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	questionnaire: 'Questionnaire/mri-documentation',
	status: 'completed',
	subject: { reference: 'Patient/maya-sen' },
	authored: '2099-01-01T09:30:00Z',
	author: { reference: 'Practitioner/example-ordering-clinician' },
	source: { reference: 'Practitioner/example-ordering-clinician' },
	item: [
		{
			linkId: 'current-problem',
			answer: [{ valueReference: { reference: 'Condition/condition-current-problem' } }]
		},
		{
			linkId: 'prior-management',
			answer: [{ valueReference: { reference: 'DocumentReference/narrative-management-note' } }]
		},
		{
			linkId: 'recent-assessment',
			answer: [{ valueReference: { reference: 'Observation/recent-clinical-assessment' } }]
		},
		{ linkId: 'attestation', answer: [{ valueBoolean: true }] }
	]
} as const;

const priorAuthorizationClaim = {
	resourceType: 'Claim',
	id: 'prior-authorization-claim',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	identifier: [{ system: 'urn:example:synthetic:prior-authorization', value: 'maya-mri-pa-001' }],
	status: 'active',
	type: {
		coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }]
	},
	use: 'preauthorization',
	patient: { reference: 'Patient/maya-sen' },
	created: '2099-01-01',
	insurer: { reference: 'Organization/example-health-plan' },
	provider: { reference: 'Organization/example-ordering-clinic' },
	priority: {
		coding: [{ system: 'http://terminology.hl7.org/CodeSystem/processpriority', code: 'normal' }]
	},
	careTeam: [
		{
			sequence: 1,
			provider: { reference: 'Practitioner/example-ordering-clinician' },
			responsible: true
		}
	],
	supportingInfo: [
		{
			sequence: 1,
			category: { text: 'Questionnaire response' },
			valueReference: { reference: 'QuestionnaireResponse/mri-documentation-response' }
		}
	],
	diagnosis: [
		{
			sequence: 1,
			diagnosisReference: { reference: 'Condition/condition-current-problem' }
		}
	],
	procedure: [
		{
			sequence: 1,
			procedureReference: { reference: 'Procedure/lumbar-mri-procedure' }
		}
	],
	insurance: [
		{
			sequence: 1,
			focal: true,
			coverage: { reference: 'Coverage/maya-coverage' }
		}
	],
	item: [{ sequence: 1, productOrService: { text: 'Non-urgent outpatient lumbar MRI' } }]
} as const;

const pendedClaimResponse = {
	resourceType: 'ClaimResponse',
	id: 'pas-pended',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	identifier: [
		{
			system: 'urn:example:synthetic:prior-authorization-response',
			value: 'maya-mri-pa-001-pended'
		}
	],
	status: 'active',
	type: priorAuthorizationClaim.type,
	use: 'preauthorization',
	patient: { reference: 'Patient/maya-sen' },
	created: '2099-01-01',
	insurer: { reference: 'Organization/example-health-plan' },
	requestor: { reference: 'Organization/example-ordering-clinic' },
	request: { reference: 'Claim/prior-authorization-claim' },
	outcome: 'queued',
	disposition: 'Pended for review in this fictional scenario.'
} as const;

const approvedClaimResponse = {
	resourceType: 'ClaimResponse',
	id: 'pas-approved',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	identifier: [
		{
			system: 'urn:example:synthetic:prior-authorization-response',
			value: 'maya-mri-pa-001-approved'
		}
	],
	status: 'active',
	type: priorAuthorizationClaim.type,
	use: 'preauthorization',
	patient: { reference: 'Patient/maya-sen' },
	created: '2099-01-04',
	insurer: { reference: 'Organization/example-health-plan' },
	requestor: { reference: 'Organization/example-ordering-clinic' },
	request: { reference: 'Claim/prior-authorization-claim' },
	outcome: 'complete',
	disposition: 'Approved under the explicitly fictional evidence policy.',
	preAuthRef: 'SYNTHETIC-PA-MAYA-MRI-001',
	preAuthPeriod: { start: '2099-01-04', end: '2099-01-18' }
} as const;

const deniedClaimResponse = {
	resourceType: 'ClaimResponse',
	id: 'pas-denied',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	identifier: [
		{
			system: 'urn:example:synthetic:prior-authorization-response',
			value: 'maya-mri-pa-001-denied'
		}
	],
	status: 'active',
	type: priorAuthorizationClaim.type,
	use: 'preauthorization',
	patient: { reference: 'Patient/maya-sen' },
	created: '2099-01-09',
	insurer: { reference: 'Organization/example-health-plan' },
	requestor: { reference: 'Organization/example-ordering-clinic' },
	request: { reference: 'Claim/prior-authorization-claim' },
	outcome: 'complete',
	disposition:
		'Denied after one bounded additional-information cycle under the fictional evidence policy.'
} as const;

const additionalInformationTask = {
	resourceType: 'Task',
	id: 'additional-information',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	identifier: [
		{
			system: 'urn:example:synthetic:prior-authorization-task',
			value: 'maya-mri-pa-001-additional-information'
		}
	],
	status: 'requested',
	intent: 'order',
	code: { text: 'Additional clinical information requested' },
	focus: { reference: 'Claim/prior-authorization-claim' },
	for: { reference: 'Patient/maya-sen' },
	requester: { reference: 'Organization/example-health-plan' },
	owner: { reference: 'Organization/example-ordering-clinic' },
	reasonCode: { text: 'The fictional evidence rule remains clinically insufficient.' },
	input: [
		{
			type: { text: 'Existing documentation response' },
			valueReference: { reference: 'QuestionnaireResponse/mri-documentation-response' }
		}
	]
} as const;

function appointment(model: ModeledAppointment) {
	return {
		resourceType: 'Appointment',
		id: model.id,
		meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
		status: model.status,
		serviceCategory: [{ text: 'Diagnostic imaging' }],
		serviceType: [{ text: 'Lumbar MRI' }],
		description: model.description,
		start: model.start,
		end: model.end,
		basedOn: [{ reference: 'ServiceRequest/lumbar-mri-order' }],
		participant: [
			{
				actor: { reference: 'Patient/maya-sen' },
				status: 'accepted'
			}
		]
	} as const;
}

const appointmentDay11 = appointment(MODELED_APPOINTMENTS['fhir-enabled'].none);
const appointmentFhirIdentityDay13 = appointment(
	MODELED_APPOINTMENTS['fhir-enabled']['identity-mismatch']
);
const appointmentFhirNarrativeDay14 = appointment(
	MODELED_APPOINTMENTS['fhir-enabled']['narrative-only']
);
const appointmentDay18 = appointment(MODELED_APPOINTMENTS['portal-fax'].none);
const appointmentPortalIdentityDay20 = appointment(
	MODELED_APPOINTMENTS['portal-fax']['identity-mismatch']
);
const appointmentPortalNarrativeDay22 = appointment(
	MODELED_APPOINTMENTS['portal-fax']['narrative-only']
);
const appointmentFhirExpiryDay20 = appointment(
	MODELED_APPOINTMENTS['fhir-enabled']['authorization-expired']
);
const appointmentPortalExpiryDay30 = appointment(
	MODELED_APPOINTMENTS['portal-fax']['authorization-expired']
);

const technicalOperationOutcome = {
	resourceType: 'OperationOutcome',
	id: 'example-technical-rejection',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	issue: [
		{
			severity: 'error',
			code: 'invalid',
			diagnostics: 'Synthetic example only: a malformed request would fail technical intake.'
		}
	]
} as const;

const pasRequestBundle = {
	resourceType: 'Bundle',
	id: 'pas-request',
	type: 'collection',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	entry: [
		{
			fullUrl: 'https://example.invalid/fhir/Claim/prior-authorization-claim',
			resource: priorAuthorizationClaim
		},
		{ fullUrl: 'https://example.invalid/fhir/Patient/maya-sen', resource: patient },
		{ fullUrl: 'https://example.invalid/fhir/Coverage/maya-coverage', resource: coverage },
		{
			fullUrl: 'https://example.invalid/fhir/ServiceRequest/lumbar-mri-order',
			resource: serviceRequest
		},
		{
			fullUrl: 'https://example.invalid/fhir/Procedure/lumbar-mri-procedure',
			resource: procedure
		},
		{
			fullUrl: 'https://example.invalid/fhir/Practitioner/example-ordering-clinician',
			resource: orderingPractitioner
		},
		{
			fullUrl: 'https://example.invalid/fhir/Organization/example-ordering-clinic',
			resource: orderingOrganization
		},
		{
			fullUrl: 'https://example.invalid/fhir/Organization/example-health-plan',
			resource: payerOrganization
		},
		{
			fullUrl: 'https://example.invalid/fhir/Condition/condition-current-problem',
			resource: condition
		},
		{
			fullUrl: 'https://example.invalid/fhir/Observation/recent-clinical-assessment',
			resource: assessment
		},
		{
			fullUrl: 'https://example.invalid/fhir/DocumentReference/narrative-management-note',
			resource: narrativeNote
		},
		{
			fullUrl: 'https://example.invalid/fhir/Questionnaire/mri-documentation',
			resource: questionnaire
		},
		{
			fullUrl: 'https://example.invalid/fhir/QuestionnaireResponse/mri-documentation-response',
			resource: questionnaireResponse
		}
	]
} as const;

const pendedResponseBundle = {
	resourceType: 'Bundle',
	id: 'pas-pended-response',
	type: 'collection',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	entry: [
		{
			fullUrl: 'https://example.invalid/fhir/ClaimResponse/pas-pended',
			resource: pendedClaimResponse
		}
	]
} as const;

const approvedResponseBundle = {
	resourceType: 'Bundle',
	id: 'pas-approved-response',
	type: 'collection',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	entry: [
		{
			fullUrl: 'https://example.invalid/fhir/ClaimResponse/pas-approved',
			resource: approvedClaimResponse
		}
	]
} as const;

const deniedResponseBundle = {
	resourceType: 'Bundle',
	id: 'pas-denied-response',
	type: 'collection',
	meta: { tag: [{ system: 'urn:example:synthetic', code: 'synthetic' }] },
	entry: [
		{
			fullUrl: 'https://example.invalid/fhir/ClaimResponse/pas-denied',
			resource: deniedClaimResponse
		}
	]
} as const;

const downloadBundle = {
	resourceType: 'Bundle',
	id: 'maya-lumbar-mri-r4',
	type: 'collection',
	meta: {
		tag: [{ system: 'urn:example:synthetic', code: 'synthetic', display: 'No real patient data' }]
	},
	entry: [
		{ fullUrl: 'https://example.invalid/fhir/Bundle/pas-request', resource: pasRequestBundle },
		{
			fullUrl: 'https://example.invalid/fhir/Bundle/pas-pended-response',
			resource: pendedResponseBundle
		},
		{
			fullUrl: 'https://example.invalid/fhir/Bundle/pas-approved-response',
			resource: approvedResponseBundle
		},
		{
			fullUrl: 'https://example.invalid/fhir/Bundle/pas-denied-response',
			resource: deniedResponseBundle
		},
		{
			fullUrl: 'https://example.invalid/fhir/Task/additional-information',
			resource: additionalInformationTask
		},
		{
			fullUrl: `https://example.invalid/fhir/${QUESTIONNAIRE_RESPONSE_FIXTURES.prepopulation.resourceReference}`,
			resource: inProgressQuestionnaireResponse
		},
		{
			fullUrl: `https://example.invalid/fhir/${MODELED_APPOINTMENTS['fhir-enabled'].none.resourceReference}`,
			resource: appointmentDay11
		},
		{
			fullUrl: `https://example.invalid/fhir/${MODELED_APPOINTMENTS['fhir-enabled']['identity-mismatch'].resourceReference}`,
			resource: appointmentFhirIdentityDay13
		},
		{
			fullUrl: `https://example.invalid/fhir/${MODELED_APPOINTMENTS['fhir-enabled']['narrative-only'].resourceReference}`,
			resource: appointmentFhirNarrativeDay14
		},
		{
			fullUrl: `https://example.invalid/fhir/${MODELED_APPOINTMENTS['portal-fax'].none.resourceReference}`,
			resource: appointmentDay18
		},
		{
			fullUrl: `https://example.invalid/fhir/${MODELED_APPOINTMENTS['portal-fax']['identity-mismatch'].resourceReference}`,
			resource: appointmentPortalIdentityDay20
		},
		{
			fullUrl: `https://example.invalid/fhir/${MODELED_APPOINTMENTS['portal-fax']['narrative-only'].resourceReference}`,
			resource: appointmentPortalNarrativeDay22
		},
		{
			fullUrl: `https://example.invalid/fhir/${MODELED_APPOINTMENTS['fhir-enabled']['authorization-expired'].resourceReference}`,
			resource: appointmentFhirExpiryDay20
		},
		{
			fullUrl: `https://example.invalid/fhir/${MODELED_APPOINTMENTS['portal-fax']['authorization-expired'].resourceReference}`,
			resource: appointmentPortalExpiryDay30
		},
		{
			fullUrl: 'https://example.invalid/fhir/OperationOutcome/example-technical-rejection',
			resource: technicalOperationOutcome
		}
	]
} as const;

export const SYNTHETIC_FHIR_R4_FIXTURE = deepFreeze({
	id: 'maya-lumbar-mri-r4',
	fhirVersion: '4.0.1',
	synthetic: true,
	notice:
		'Entirely synthetic teaching fixture. Fixed 2099 dates exist only because several FHIR resources require date-shaped values; the visual model uses Day 0, Day 1, and integer offsets.',
	resources: {
		patient,
		orderingPractitioner,
		coverage,
		serviceRequest,
		procedure,
		condition,
		assessment,
		narrativeNote,
		questionnaire,
		inProgressQuestionnaireResponse,
		questionnaireResponse,
		priorAuthorizationClaim,
		pendedClaimResponse,
		approvedClaimResponse,
		deniedClaimResponse,
		additionalInformationTask,
		appointmentDay11,
		appointmentFhirIdentityDay13,
		appointmentFhirNarrativeDay14,
		appointmentDay18,
		appointmentPortalIdentityDay20,
		appointmentPortalNarrativeDay22,
		appointmentFhirExpiryDay20,
		appointmentPortalExpiryDay30,
		technicalOperationOutcome
	},
	pasRequestBundle,
	pendedResponseBundle,
	approvedResponseBundle,
	deniedResponseBundle,
	downloadBundle
});

export type SyntheticFhirR4Fixture = typeof SYNTHETIC_FHIR_R4_FIXTURE;

export function stringifySyntheticFhirFixture(space = 2): string {
	const normalizedSpace = Number.isInteger(space) ? Math.max(0, Math.min(10, space)) : 2;
	return `${JSON.stringify(SYNTHETIC_FHIR_R4_FIXTURE.downloadBundle, null, normalizedSpace)}\n`;
}

function collectResources(value: unknown, resources: Map<string, FhirResource>): void {
	if (!value || typeof value !== 'object') return;
	const record = value as Record<string, unknown>;
	if (typeof record.resourceType === 'string' && typeof record.id === 'string') {
		resources.set(`${record.resourceType}/${record.id}`, record);
	}
	for (const child of Object.values(record)) {
		if (Array.isArray(child)) child.forEach((item) => collectResources(item, resources));
		else collectResources(child, resources);
	}
}

function collectReferences(value: unknown, references: string[]): void {
	if (!value || typeof value !== 'object') return;
	const record = value as Record<string, unknown>;
	if (typeof record.reference === 'string') references.push(record.reference);
	for (const child of Object.values(record)) {
		if (Array.isArray(child)) child.forEach((item) => collectReferences(item, references));
		else collectReferences(child, references);
	}
}

function validateBundleFullUrls(value: unknown, issues: string[]): void {
	if (!value || typeof value !== 'object') return;
	const record = value as Record<string, unknown>;
	if (record.resourceType === 'Bundle' && Array.isArray(record.entry)) {
		for (const candidate of record.entry) {
			if (!candidate || typeof candidate !== 'object') continue;
			const entry = candidate as Record<string, unknown>;
			const resource = entry.resource as Record<string, unknown> | undefined;
			if (
				!resource ||
				typeof resource.resourceType !== 'string' ||
				typeof resource.id !== 'string'
			) {
				continue;
			}
			const expected = `https://example.invalid/fhir/${resource.resourceType}/${resource.id}`;
			if (entry.fullUrl !== expected) {
				issues.push(
					`Bundle fullUrl must match the synthetic absolute resource URL: expected ${expected}.`
				);
			}
			validateBundleFullUrls(resource, issues);
		}
	}
}

export type FhirFixtureValidation = Readonly<{
	valid: boolean;
	issues: readonly string[];
	resourceCount: number;
	referenceCount: number;
}>;

const REQUIRED_MODELED_FHIR_REFERENCES = Object.freeze([
	'Patient/maya-sen',
	'Coverage/maya-coverage',
	'ServiceRequest/lumbar-mri-order',
	'Procedure/lumbar-mri-procedure',
	'Questionnaire/mri-documentation',
	QUESTIONNAIRE_RESPONSE_FIXTURES.prepopulation.resourceReference,
	QUESTIONNAIRE_RESPONSE_FIXTURES.completed.resourceReference,
	'DocumentReference/narrative-management-note',
	'Bundle/pas-request',
	'Bundle/pas-pended-response',
	'Claim/prior-authorization-claim',
	'ClaimResponse/pas-pended',
	'ClaimResponse/pas-approved',
	'ClaimResponse/pas-denied',
	'Task/additional-information',
	...Object.values(MODELED_APPOINTMENTS).flatMap((byScenario) =>
		Object.values(byScenario).map((modeled) => modeled.resourceReference)
	)
]);

export function validateSyntheticFhirFixture(): FhirFixtureValidation {
	const issues: string[] = [];
	const resources = new Map<string, FhirResource>();
	collectResources(SYNTHETIC_FHIR_R4_FIXTURE.downloadBundle, resources);
	const references: string[] = [];
	collectReferences(SYNTHETIC_FHIR_R4_FIXTURE.downloadBundle, references);
	validateBundleFullUrls(SYNTHETIC_FHIR_R4_FIXTURE.downloadBundle, issues);

	for (const reference of references) {
		if (reference.startsWith('#') || reference.startsWith('urn:')) continue;
		if (!resources.has(reference)) issues.push(`Unresolved fixture reference: ${reference}`);
	}
	for (const reference of REQUIRED_MODELED_FHIR_REFERENCES) {
		if (!resources.has(reference)) {
			issues.push(`Missing resource referenced by the modeled event ledger: ${reference}`);
		}
	}

	const requestFirst = SYNTHETIC_FHIR_R4_FIXTURE.pasRequestBundle.entry[0]?.resource;
	if (requestFirst?.resourceType !== 'Claim') {
		issues.push('The PAS request Bundle must begin with Claim.');
	}
	const pendedFirst = SYNTHETIC_FHIR_R4_FIXTURE.pendedResponseBundle.entry[0]?.resource;
	if (pendedFirst?.resourceType !== 'ClaimResponse') {
		issues.push('The PAS pended response Bundle must begin with ClaimResponse.');
	}
	const approvedFirst = SYNTHETIC_FHIR_R4_FIXTURE.approvedResponseBundle.entry[0]?.resource;
	if (approvedFirst?.resourceType !== 'ClaimResponse') {
		issues.push('The PAS approved response Bundle must begin with ClaimResponse.');
	}
	const deniedFirst = SYNTHETIC_FHIR_R4_FIXTURE.deniedResponseBundle.entry[0]?.resource;
	if (deniedFirst?.resourceType !== 'ClaimResponse' || deniedFirst.id !== 'pas-denied') {
		issues.push('The PAS denied response Bundle must begin with the denied ClaimResponse.');
	}
	if (SYNTHETIC_FHIR_R4_FIXTURE.resources.priorAuthorizationClaim.use !== 'preauthorization') {
		issues.push('The Claim must use preauthorization semantics.');
	}
	const procedureReference =
		SYNTHETIC_FHIR_R4_FIXTURE.resources.priorAuthorizationClaim.procedure[0]?.procedureReference
			.reference;
	if (
		procedureReference !== 'Procedure/lumbar-mri-procedure' ||
		resources.get(procedureReference)?.resourceType !== 'Procedure'
	) {
		issues.push('The Claim procedure must reference the synthetic Procedure resource.');
	}
	if (SYNTHETIC_FHIR_R4_FIXTURE.resources.pendedClaimResponse.outcome !== 'queued') {
		issues.push('The modeled pended ClaimResponse must be a business queue result.');
	}
	const prepopulationResponse = SYNTHETIC_FHIR_R4_FIXTURE.resources.inProgressQuestionnaireResponse;
	const prepopulationLinkIds = prepopulationResponse.item.map((item) => String(item.linkId));
	if (
		prepopulationResponse.status !== 'in-progress' ||
		prepopulationLinkIds.includes('prior-management') ||
		prepopulationLinkIds.includes('attestation')
	) {
		issues.push(
			'The DTR prepopulation QuestionnaireResponse must remain in progress without narrative confirmation or attestation.'
		);
	}
	const completedResponse = SYNTHETIC_FHIR_R4_FIXTURE.resources.questionnaireResponse;
	const completedAttestation = completedResponse.item.find(
		(item) => String(item.linkId) === 'attestation'
	) as { answer?: readonly { valueBoolean?: boolean }[] } | undefined;
	if (
		completedResponse.status !== 'completed' ||
		completedAttestation?.answer?.[0]?.valueBoolean !== true
	) {
		issues.push('The completed QuestionnaireResponse must retain explicit clinician attestation.');
	}
	if (
		SYNTHETIC_FHIR_R4_FIXTURE.resources.deniedClaimResponse.outcome !== 'complete' ||
		!SYNTHETIC_FHIR_R4_FIXTURE.resources.deniedClaimResponse.disposition.startsWith('Denied')
	) {
		issues.push('The modeled denial must be a completed business response, not a transport error.');
	}

	return Object.freeze({
		valid: issues.length === 0,
		issues: Object.freeze(issues),
		resourceCount: resources.size,
		referenceCount: references.length
	});
}
