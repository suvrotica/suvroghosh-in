import { SYNTHETIC_FHIR_R4_FIXTURE } from '$lib/visualizations/prior-authorization';
import type { UiJourneyStep, UiPathwayId } from './ui-types';

type FixtureResource = Readonly<{ resourceType: string; id: string }>;

/**
 * Selects only canonical domain-owned artifacts referenced by the active event.
 * Portal/fax deliberately has no FHIR inspector: that counterfactual does not
 * claim to exchange these resources.
 */
export function fixtureFragmentForStep(
	pathway: UiPathwayId,
	step: UiJourneyStep | undefined
): string | undefined {
	if (pathway !== 'fhir-enabled' || !step) return undefined;

	if (step.id === 'request-submitted') {
		return JSON.stringify(SYNTHETIC_FHIR_R4_FIXTURE.pasRequestBundle, null, 2);
	}
	if (step.id === 'request-technically-received') {
		return JSON.stringify(SYNTHETIC_FHIR_R4_FIXTURE.pendedResponseBundle, null, 2);
	}
	if (step.id === 'decision-issued') {
		const response = step.resourceRefs.includes('ClaimResponse/pas-denied')
			? SYNTHETIC_FHIR_R4_FIXTURE.deniedResponseBundle
			: SYNTHETIC_FHIR_R4_FIXTURE.approvedResponseBundle;
		return JSON.stringify(response, null, 2);
	}

	const resources = Object.values(SYNTHETIC_FHIR_R4_FIXTURE.resources) as FixtureResource[];
	const selected = resources.filter((resource) =>
		step.resourceRefs.includes(`${resource.resourceType}/${resource.id}`)
	);
	if (!selected.length) return undefined;
	return JSON.stringify(selected.length === 1 ? selected[0] : selected, null, 2);
}
