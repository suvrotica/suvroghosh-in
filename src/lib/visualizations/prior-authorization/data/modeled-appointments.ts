import type { FailureId, PathwayId } from '../engine/types.ts';

export type AppointmentScenarioId = Exclude<FailureId, 'clinically-insufficient'>;

export type ModeledAppointment = Readonly<{
	id: string;
	resourceReference: `Appointment/${string}`;
	day: number;
	status: 'fulfilled' | 'booked';
	start: string;
	end: string;
	description: string;
}>;

function modeledAppointment<const Id extends string>(
	id: Id,
	day: number,
	status: ModeledAppointment['status'],
	start: string,
	end: string,
	description: string
): ModeledAppointment & Readonly<{ id: Id; resourceReference: `Appointment/${Id}` }> {
	return Object.freeze({
		id,
		resourceReference: `Appointment/${id}` as `Appointment/${Id}`,
		day,
		status,
		start,
		end,
		description
	});
}

/**
 * Canonical appointment resources for every modeled route that reaches scheduling.
 * Day 20 occurs in two different scenarios, so those appointments deliberately have
 * distinct identifiers rather than overloading one ambiguous fixture.
 */
export const MODELED_APPOINTMENTS = Object.freeze({
	'fhir-enabled': Object.freeze({
		none: modeledAppointment(
			'lumbar-mri-day-11',
			11,
			'fulfilled',
			'2099-01-12T09:00:00Z',
			'2099-01-12T09:30:00Z',
			'FHIR-enabled baseline appointment; the scan is received in the fictional run.'
		),
		'identity-mismatch': modeledAppointment(
			'lumbar-mri-fhir-day-13-identity',
			13,
			'fulfilled',
			'2099-01-14T09:00:00Z',
			'2099-01-14T09:30:00Z',
			'FHIR-enabled replacement appointment after the fictional identity-reconciliation delay.'
		),
		'narrative-only': modeledAppointment(
			'lumbar-mri-fhir-day-14-narrative',
			14,
			'fulfilled',
			'2099-01-15T09:00:00Z',
			'2099-01-15T09:30:00Z',
			'FHIR-enabled replacement appointment after the fictional narrative-provenance delay.'
		),
		'authorization-expired': modeledAppointment(
			'lumbar-mri-fhir-day-20-expiry',
			20,
			'booked',
			'2099-01-21T09:00:00Z',
			'2099-01-21T09:30:00Z',
			'FHIR-enabled expiry fixture; the Day 20 appointment falls after the fictional authorization period.'
		)
	}),
	'portal-fax': Object.freeze({
		none: modeledAppointment(
			'lumbar-mri-day-18',
			18,
			'fulfilled',
			'2099-01-19T09:00:00Z',
			'2099-01-19T09:30:00Z',
			'Portal-and-fax baseline appointment; the scan is received in the fictional counterfactual.'
		),
		'identity-mismatch': modeledAppointment(
			'lumbar-mri-portal-day-20-identity',
			20,
			'fulfilled',
			'2099-01-21T09:00:00Z',
			'2099-01-21T09:30:00Z',
			'Portal-and-fax replacement appointment after the fictional identity-reconciliation delay.'
		),
		'narrative-only': modeledAppointment(
			'lumbar-mri-portal-day-22-narrative',
			22,
			'fulfilled',
			'2099-01-23T09:00:00Z',
			'2099-01-23T09:30:00Z',
			'Portal-and-fax replacement appointment after the fictional narrative-provenance delay.'
		),
		'authorization-expired': modeledAppointment(
			'lumbar-mri-portal-day-30-expiry',
			30,
			'booked',
			'2099-01-31T09:00:00Z',
			'2099-01-31T09:30:00Z',
			'Portal-and-fax expiry fixture; the Day 30 appointment falls after the fictional authorization period.'
		)
	})
} satisfies Readonly<
	Record<PathwayId, Readonly<Record<AppointmentScenarioId, ModeledAppointment>>>
>);

export function getModeledAppointment(
	pathway: PathwayId,
	scenarioId: AppointmentScenarioId
): ModeledAppointment {
	return MODELED_APPOINTMENTS[pathway][scenarioId];
}
