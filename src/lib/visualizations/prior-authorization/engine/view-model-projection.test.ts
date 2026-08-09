import { describe, expect, it } from 'vitest';
import { toUiRun } from '../../../components/visualizations/prior-authorization/view-model';
import { compilePriorAuthorizationScenario } from './compile-scenario';

describe('prior-authorization presentation projection', () => {
	it('keeps eventless baseline branches visibly bypassed and factually quiet', () => {
		const run = toUiRun(compilePriorAuthorizationScenario({ pathway: 'fhir-enabled' }));

		for (const index of [8, 9]) {
			expect(run.steps[index]).toMatchObject({ status: 'bypassed' });
			expect(run.steps[index]?.patientText).toContain('optional branch was not visited');
			expect(run.steps[index]?.architectText).toContain('no event, resource transition');
		}
	});

	it('projects denial as the terminal visited decision, not a performed scan', () => {
		const run = toUiRun(
			compilePriorAuthorizationScenario({
				pathway: 'fhir-enabled',
				failureId: 'clinically-insufficient'
			})
		);
		const progression = run.steps
			.filter((step) => step.status !== 'bypassed')
			.map((step) => step.index);

		expect(progression.at(-1)).toBe(10);
		expect(run.steps[11]).toMatchObject({
			status: 'bypassed',
			finalOutcome: 'denied',
			authorizationStatus: 'denied'
		});
		expect(run.steps[11]?.patientText).toContain('did not reach authorized scheduling');
	});
});
