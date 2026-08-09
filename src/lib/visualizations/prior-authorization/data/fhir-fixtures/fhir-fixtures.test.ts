import { describe, expect, it } from 'vitest';
import { compilePriorAuthorizationScenario } from '../../engine/compile-scenario';
import { PUBLIC_FAILURE_IDS } from '../../engine/scenario-schema';
import { MODELED_APPOINTMENTS } from '../modeled-appointments';
import { QUESTIONNAIRE_RESPONSE_FIXTURES } from '../modeled-resource-references';
import {
	SYNTHETIC_FHIR_R4_FIXTURE,
	stringifySyntheticFhirFixture,
	validateSyntheticFhirFixture
} from './index';

function collectResourceReferences(value: unknown, references = new Set<string>()): Set<string> {
	if (!value || typeof value !== 'object') return references;
	const record = value as Record<string, unknown>;
	if (typeof record.resourceType === 'string' && typeof record.id === 'string') {
		references.add(`${record.resourceType}/${record.id}`);
	}
	for (const child of Object.values(record)) {
		if (Array.isArray(child)) child.forEach((item) => collectResourceReferences(item, references));
		else collectResourceReferences(child, references);
	}
	return references;
}

describe('synthetic FHIR R4 fixtures', () => {
	it('resolves references and preserves PAS Bundle ordering', () => {
		const validation = validateSyntheticFhirFixture();
		expect(validation.valid, validation.issues.join('\n')).toBe(true);
		expect(validation.resourceCount).toBeGreaterThanOrEqual(23);
		expect(SYNTHETIC_FHIR_R4_FIXTURE.pasRequestBundle.entry[0]?.resource.resourceType).toBe(
			'Claim'
		);
		expect(SYNTHETIC_FHIR_R4_FIXTURE.pendedResponseBundle.entry[0]?.resource.resourceType).toBe(
			'ClaimResponse'
		);
		expect(SYNTHETIC_FHIR_R4_FIXTURE.deniedResponseBundle.entry[0]?.resource.id).toBe('pas-denied');
	});

	it('represents preauthorization and distinguishes pended from approved business results', () => {
		expect(SYNTHETIC_FHIR_R4_FIXTURE.resources.priorAuthorizationClaim.use).toBe(
			'preauthorization'
		);
		expect(SYNTHETIC_FHIR_R4_FIXTURE.resources.pendedClaimResponse.outcome).toBe('queued');
		expect(SYNTHETIC_FHIR_R4_FIXTURE.resources.approvedClaimResponse.outcome).toBe('complete');
		expect(SYNTHETIC_FHIR_R4_FIXTURE.resources.deniedClaimResponse).toMatchObject({
			resourceType: 'ClaimResponse',
			id: 'pas-denied',
			outcome: 'complete'
		});
		expect(SYNTHETIC_FHIR_R4_FIXTURE.resources.technicalOperationOutcome.resourceType).toBe(
			'OperationOutcome'
		);
	});

	it('uses type-faithful Procedure, Task and scenario-specific Appointment resources', () => {
		expect(
			SYNTHETIC_FHIR_R4_FIXTURE.resources.priorAuthorizationClaim.procedure[0]?.procedureReference
				.reference
		).toBe('Procedure/lumbar-mri-procedure');
		expect(SYNTHETIC_FHIR_R4_FIXTURE.resources.procedure).toMatchObject({
			resourceType: 'Procedure',
			id: 'lumbar-mri-procedure',
			status: 'preparation'
		});
		expect(SYNTHETIC_FHIR_R4_FIXTURE.resources.additionalInformationTask).toMatchObject({
			resourceType: 'Task',
			id: 'additional-information',
			status: 'requested'
		});
		const expectedAppointmentIds = Object.values(MODELED_APPOINTMENTS)
			.flatMap((byScenario) => Object.values(byScenario).map((modeled) => modeled.id))
			.sort();
		const actualAppointmentIds = Object.values(SYNTHETIC_FHIR_R4_FIXTURE.resources)
			.filter((resource) => resource.resourceType === 'Appointment')
			.map((resource) => resource.id)
			.sort();
		expect(actualAppointmentIds).toEqual(expectedAppointmentIds);
		expect(SYNTHETIC_FHIR_R4_FIXTURE.resources.questionnaireResponse).toMatchObject({
			author: { reference: 'Practitioner/example-ordering-clinician' },
			source: { reference: 'Practitioner/example-ordering-clinician' }
		});
	});

	it('keeps prepopulation in progress until a clinician completes and attests', () => {
		const prepopulation = SYNTHETIC_FHIR_R4_FIXTURE.resources.inProgressQuestionnaireResponse;
		const completed = SYNTHETIC_FHIR_R4_FIXTURE.resources.questionnaireResponse;

		expect(prepopulation).toMatchObject({
			id: QUESTIONNAIRE_RESPONSE_FIXTURES.prepopulation.id,
			status: 'in-progress'
		});
		expect(prepopulation.item.map((item) => item.linkId)).toEqual([
			'current-problem',
			'recent-assessment'
		]);
		expect(prepopulation.item.map((item) => String(item.linkId))).not.toContain('attestation');
		expect(completed).toMatchObject({
			id: QUESTIONNAIRE_RESPONSE_FIXTURES.completed.id,
			status: 'completed'
		});
		expect(completed.item).toContainEqual({
			linkId: 'attestation',
			answer: [{ valueBoolean: true }]
		});
		expect(
			SYNTHETIC_FHIR_R4_FIXTURE.resources.priorAuthorizationClaim.supportingInfo[0]?.valueReference
				.reference
		).toBe(QUESTIONNAIRE_RESPONSE_FIXTURES.completed.resourceReference);
	});

	it('resolves every FHIR-enabled ledger reference and every modeled Appointment reference', () => {
		const fixtureReferences = collectResourceReferences(SYNTHETIC_FHIR_R4_FIXTURE.downloadBundle);
		for (const failureId of ['none', ...PUBLIC_FAILURE_IDS] as const) {
			const fhir = compilePriorAuthorizationScenario({ pathway: 'fhir-enabled', failureId });
			for (const reference of fhir.resourceRefs) {
				expect(fixtureReferences.has(reference), `${failureId}: ${reference}`).toBe(true);
			}

			const portal = compilePriorAuthorizationScenario({ pathway: 'portal-fax', failureId });
			for (const reference of portal.resourceRefs.filter((candidate) =>
				candidate.startsWith('Appointment/')
			)) {
				expect(fixtureReferences.has(reference), `${failureId}: ${reference}`).toBe(true);
			}
		}
	});

	it('serializes deterministically as a visibly synthetic downloadable Bundle', () => {
		const first = stringifySyntheticFhirFixture();
		const second = stringifySyntheticFhirFixture();
		expect(second).toBe(first);
		expect(first).toContain('"resourceType": "Bundle"');
		expect(first).toContain('"code": "synthetic"');
		expect(first).toContain('"fullUrl": "https://example.invalid/fhir/Patient/maya-sen"');
		expect(first).not.toContain('urn:uuid:');
		expect(first.endsWith('\n')).toBe(true);
		expect(Object.isFrozen(SYNTHETIC_FHIR_R4_FIXTURE.downloadBundle)).toBe(true);
	});
});
