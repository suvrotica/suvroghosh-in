import { describe, expect, it } from 'vitest';
import {
	compilePriorAuthorizationComparison,
	compilePriorAuthorizationScenario
} from './compile-scenario';
import { MODELED_APPOINTMENTS } from '../data/modeled-appointments';
import { QUESTIONNAIRE_RESPONSE_FIXTURES } from '../data/modeled-resource-references';
import {
	FHIR_BASELINE_EXPECTED,
	MILESTONE_DEFINITIONS,
	PORTAL_FAX_BASELINE_EXPECTED,
	PUBLIC_FAILURE_IDS
} from './scenario-schema';

describe('prior-authorization deterministic compiler', () => {
	it('returns a deeply equal and immutable run for the same canonical input', () => {
		const input = { pathway: 'fhir-enabled' as const, failureId: 'none' as const };
		const first = compilePriorAuthorizationScenario(input);
		const second = compilePriorAuthorizationScenario(input);
		expect(second).toEqual(first);
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first.events)).toBe(true);
		expect(Object.isFrozen(first.case)).toBe(true);
		expect(Object.isFrozen(first.policy)).toBe(true);
	});

	it('exposes exactly twelve canonical conceptual states', () => {
		const run = compilePriorAuthorizationScenario({ pathway: 'portal-fax' });
		expect(run.milestones).toHaveLength(12);
		expect(run.milestones.map((milestone) => milestone.id)).toEqual(
			MILESTONE_DEFINITIONS.map((milestone) => milestone.id)
		);
		expect(run.milestones.filter((milestone) => milestone.optionalBranch).map((m) => m.id)).toEqual(
			['more-information-requested', 'request-supplemented']
		);
	});

	it('keeps exact authored baseline clocks without domain tolerances', () => {
		const fhir = compilePriorAuthorizationScenario({ pathway: 'fhir-enabled' });
		const portal = compilePriorAuthorizationScenario({ pathway: 'portal-fax' });

		expect(fhir.clocks.patientElapsedMs).toBe(FHIR_BASELINE_EXPECTED.patientElapsedMs);
		expect(fhir.clocks.patientElapsedMinutes).toBe(15_840);
		expect(fhir.clocks.activeHumanWorkSeconds).toBe(3_840);
		expect(fhir.clocks.automatedProcessingMs).toBe(2_880);
		const transaction = fhir.events.find(
			(event) => event.id === FHIR_BASELINE_EXPECTED.declaredTransactionEventId
		);
		expect(transaction?.machineProcessingMs).toBe(400);
		expect(transaction?.wallEndMs).toBe(400);

		expect(portal.clocks.patientElapsedMs).toBe(PORTAL_FAX_BASELINE_EXPECTED.patientElapsedMs);
		expect(portal.clocks.patientElapsedMinutes).toBe(25_920);
		expect(portal.clocks.activeHumanWorkSeconds).toBe(9_360);
		expect(portal.clocks.automatedProcessingMs).toBe(1_630);
		expect(portal.clocks.patientElapsedMs).toBeGreaterThan(fhir.clocks.patientElapsedMs);
		expect(portal.clocks.activeHumanWorkSeconds).toBeGreaterThan(
			fhir.clocks.activeHumanWorkSeconds
		);
	});

	it('keeps disjoint wall segments separate from event work measures', () => {
		for (const pathway of ['portal-fax', 'fhir-enabled'] as const) {
			const run = compilePriorAuthorizationScenario({ pathway });
			let cursor = 0;
			for (const segment of run.wallTimeSegments) {
				expect(segment.wallStartMs).toBe(cursor);
				expect(segment.wallEndMs - segment.wallStartMs).toBe(segment.durationMs);
				cursor = segment.wallEndMs;
			}
			expect(cursor).toBe(run.clocks.patientElapsedMs);
			expect(run.events.reduce((sum, event) => sum + event.staffEffortSeconds, 0)).toBe(
				run.clocks.activeHumanWorkSeconds
			);
			expect(run.events.reduce((sum, event) => sum + event.machineProcessingMs, 0)).toBe(
				run.clocks.automatedProcessingMs
			);
		}
	});

	it('shares the exact immutable case, policy, evidence, and capacity objects', () => {
		const comparison = compilePriorAuthorizationComparison();
		expect(comparison.portalFax.case).toBe(comparison.fhirEnabled.case);
		expect(comparison.portalFax.policy).toBe(comparison.fhirEnabled.policy);
		expect(comparison.portalFax.case.evidence).toBe(comparison.fhirEnabled.case.evidence);
		expect(comparison.portalFax.case.imagingCapacity).toBe(
			comparison.fhirEnabled.case.imagingCapacity
		);
		expect(comparison.portalFax.policy.requirements).toBe(
			comparison.fhirEnabled.policy.requirements
		);
	});

	it('models every public failure in both pathways with its declared consequence', () => {
		const expected = {
			'identity-mismatch': { outcome: 'scan-completed', fhirDays: 13, portalDays: 20 },
			'narrative-only': { outcome: 'scan-completed', fhirDays: 14, portalDays: 22 },
			'clinically-insufficient': { outcome: 'denied', fhirDays: 8, portalDays: 16 },
			'authorization-expired': { outcome: 'expired', fhirDays: 20, portalDays: 30 }
		} as const;

		for (const failureId of PUBLIC_FAILURE_IDS) {
			const fhir = compilePriorAuthorizationScenario({ pathway: 'fhir-enabled', failureId });
			const portal = compilePriorAuthorizationScenario({ pathway: 'portal-fax', failureId });
			expect(fhir.finalOutcome).toBe(expected[failureId].outcome);
			expect(portal.finalOutcome).toBe(expected[failureId].outcome);
			expect(fhir.clocks.patientElapsedMs).toBe(expected[failureId].fhirDays * 86_400_000);
			expect(portal.clocks.patientElapsedMs).toBe(expected[failureId].portalDays * 86_400_000);
			expect(fhir.failureImpact?.affectedEventIds.length).toBeGreaterThan(0);
			expect(portal.failureImpact?.affectedEventIds.length).toBeGreaterThan(0);
			expect(fhir.failureImpact?.commonEventPrefixLength).toBeGreaterThan(0);
		}
	});

	it('projects each milestone from its latest event rather than a recovered historical state', () => {
		for (const pathway of ['portal-fax', 'fhir-enabled'] as const) {
			const identity = compilePriorAuthorizationScenario({
				pathway,
				failureId: 'identity-mismatch'
			});
			const narrative = compilePriorAuthorizationScenario({
				pathway,
				failureId: 'narrative-only'
			});
			const insufficient = compilePriorAuthorizationScenario({
				pathway,
				failureId: 'clinically-insufficient'
			});

			expect(identity.milestones.find((step) => step.id === 'evidence-gathered')).toMatchObject({
				visitStatus: 'completed'
			});
			expect(
				narrative.milestones.find((step) => step.id === 'human-review-completed')
			).toMatchObject({ visitStatus: 'completed' });
			expect(
				insufficient.milestones.find((step) => step.id === 'more-information-requested')
			).toMatchObject({ visitStatus: 'pended' });
			expect(
				insufficient.milestones.find((step) => step.id === 'request-supplemented')
			).toMatchObject({ visitStatus: 'pended' });
			expect(insufficient.milestones.find((step) => step.id === 'decision-issued')).toMatchObject({
				visitStatus: 'failed'
			});
		}
	});

	it('uses a scenario-specific appointment reference and day wherever scheduling is reached', () => {
		for (const pathway of ['portal-fax', 'fhir-enabled'] as const) {
			for (const failureId of [
				'none',
				'identity-mismatch',
				'narrative-only',
				'authorization-expired'
			] as const) {
				const modeledAppointment = MODELED_APPOINTMENTS[pathway][failureId];
				const run = compilePriorAuthorizationScenario({ pathway, failureId });
				const schedulingEvent = run.events
					.filter((event) => event.milestone === 'scheduled-and-scan-received')
					.at(-1);

				expect(schedulingEvent?.wallEndMs).toBe(modeledAppointment.day * 86_400_000);
				expect(schedulingEvent?.patientText).toContain(`Day ${modeledAppointment.day}`);
				expect(schedulingEvent?.resourceRefs).toContain(modeledAppointment.resourceReference);
				expect(run.resourceRefs).toContain(modeledAppointment.resourceReference);
				expect(run.fhirFixtureIds).toContain(modeledAppointment.id);
			}
		}
	});

	it('keeps DTR prepopulation separate from clinician completion', () => {
		const run = compilePriorAuthorizationScenario({ pathway: 'fhir-enabled' });
		const prepopulation = run.events.find(
			(event) => event.id === 'fhir-dtr-prepopulation-and-review'
		);
		const completion = run.events.find((event) => event.id === 'fhir-human-confirmation');

		expect(prepopulation?.resourceRefs).toContain(
			QUESTIONNAIRE_RESPONSE_FIXTURES.prepopulation.resourceReference
		);
		expect(prepopulation?.resourceRefs).not.toContain(
			QUESTIONNAIRE_RESPONSE_FIXTURES.completed.resourceReference
		);
		expect(completion?.resourceRefs).toContain(
			QUESTIONNAIRE_RESPONSE_FIXTURES.completed.resourceReference
		);
	});

	it('preserves technical acceptance through pended, supplement, and business denial', () => {
		const run = compilePriorAuthorizationScenario({
			pathway: 'fhir-enabled',
			failureId: 'clinically-insufficient'
		});
		const technicalReceipt = run.events.find(
			(event) => event.id === 'fhir-pas-synchronous-pended-response'
		);
		const moreInfo = run.events.find((event) => event.milestone === 'more-information-requested');
		const supplement = run.events.find(
			(event) => event.milestone === 'request-supplemented' && event.attempt === 2
		);
		const decision = run.events.at(-1);

		expect(technicalReceipt?.statuses).toMatchObject({
			technical: 'accepted',
			business: 'pended',
			authorization: 'pending'
		});
		expect(moreInfo?.status).toBe('needs-information');
		expect(supplement).toBeDefined();
		expect(decision?.statuses).toEqual({
			technical: 'accepted',
			business: 'denied',
			authorization: 'denied',
			finalOutcome: 'denied'
		});
		expect(run.events.some((event) => event.attempt > 2)).toBe(false);
	});

	it('makes narrative-source loss materially worse than baseline human confirmation', () => {
		const baseline = compilePriorAuthorizationScenario({ pathway: 'fhir-enabled' });
		const failure = compilePriorAuthorizationScenario({
			pathway: 'fhir-enabled',
			failureId: 'narrative-only'
		});
		expect(failure.clocks.patientElapsedMs).toBeGreaterThan(baseline.clocks.patientElapsedMs);
		expect(failure.clocks.activeHumanWorkSeconds).toBeGreaterThan(
			baseline.clocks.activeHumanWorkSeconds
		);
		expect(failure.events.some((event) => event.id.includes('narrative-provenance-gap'))).toBe(
			true
		);
		expect(failure.failureImpact?.rewindMilestone).toBe('evidence-gathered');
	});

	it('invalidates approval before a delayed appointment and never reports a scan', () => {
		const run = compilePriorAuthorizationScenario({
			pathway: 'fhir-enabled',
			failureId: 'authorization-expired'
		});
		const approval = run.events.find((event) => event.milestone === 'decision-issued')!;
		const expiry = run.events.find((event) => event.id.includes('validity-ended'))!;
		expect(expiry.wallEndMs - approval.wallEndMs).toBe(14 * 86_400_000);
		expect(run.statuses.authorization).toBe('expired');
		expect(run.events.some((event) => event.statuses.finalOutcome === 'scan-completed')).toBe(
			false
		);
	});

	it('rejects inputs outside the finite allowlists', () => {
		expect(() =>
			compilePriorAuthorizationScenario({ pathway: 'unknown' as 'fhir-enabled' })
		).toThrow(/Unknown prior-authorization pathway/);
		expect(() =>
			compilePriorAuthorizationScenario({
				pathway: 'fhir-enabled',
				failureId: 'random' as 'none'
			})
		).toThrow(/Unknown prior-authorization failure/);
	});
});
