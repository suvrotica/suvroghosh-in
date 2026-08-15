import type { IcuEndpointDefinition } from './types';

export const SYNTHETIC_AKI_ENDPOINT = {
	id: 'synthetic-aki-within-48-hours',
	title: 'Synthetic AKI within 48 hours of a fictional ICU snapshot',
	shortLabel: 'Synthetic AKI within 48 hours',
	horizonHours: 48,
	positiveOutcomeLabel: 'AKI occurred',
	negativeOutcomeLabel: 'AKI did not occur',
	synthetic: true,
	disclaimer:
		"Educational simulation only. Every case, forecast, and outcome in this laboratory is synthetic. It does not estimate any real patient's risk and must not be used for diagnosis, triage, treatment, monitoring, or any other clinical decision."
} as const satisfies IcuEndpointDefinition;

export const ICU_LAB_ENDPOINT_ID = SYNTHETIC_AKI_ENDPOINT.id;
export const ICU_LAB_DISCLAIMER = SYNTHETIC_AKI_ENDPOINT.disclaimer;
