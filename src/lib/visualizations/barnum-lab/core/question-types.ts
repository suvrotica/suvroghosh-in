export type DemographicQuestionId = 'country' | 'city_context' | 'age_band' | 'gender';

export type PresentationQuestionId = 'language';

export type SelfReportQuestionId =
	| 'planning_style'
	| 'decision_pace'
	| 'novelty_preference'
	| 'social_recovery'
	| 'focus_style'
	| 'feedback_preference'
	| 'time_horizon'
	| 'pace';

export type DecoyQuestionId =
	| 'reading_medium'
	| 'reading_time'
	| 'self_reported_device'
	| 'preferred_shape'
	| 'preferred_weather';

export type QuestionId =
	| DemographicQuestionId
	| PresentationQuestionId
	| SelfReportQuestionId
	| DecoyQuestionId;

export type PermittedUse =
	| 'unused-demographic'
	| 'unused-decoy'
	| 'presentation-only'
	| 'direct-echo';

export interface QuestionOption<O extends string = string> {
	id: O;
	label: string;
}

export interface QuestionDefinition<Q extends QuestionId = QuestionId, O extends string = string> {
	id: Q;
	label: string;
	shortLabel: string;
	options: readonly QuestionOption<O>[];
	permittedUse: PermittedUse;
	defaultOptionId?: O;
	optional: true;
}

export const DEMOGRAPHIC_QUESTION_IDS = [
	'country',
	'city_context',
	'age_band',
	'gender'
] as const satisfies readonly DemographicQuestionId[];

export const PRESENTATION_QUESTION_IDS = [
	'language'
] as const satisfies readonly PresentationQuestionId[];

export const SELF_REPORT_QUESTION_IDS = [
	'planning_style',
	'decision_pace',
	'novelty_preference',
	'social_recovery',
	'focus_style',
	'feedback_preference',
	'time_horizon',
	'pace'
] as const satisfies readonly SelfReportQuestionId[];

export const DECOY_QUESTION_IDS = [
	'reading_medium',
	'reading_time',
	'self_reported_device',
	'preferred_shape',
	'preferred_weather'
] as const satisfies readonly DecoyQuestionId[];

export const QUESTION_IDS = [
	...DEMOGRAPHIC_QUESTION_IDS,
	...PRESENTATION_QUESTION_IDS,
	...SELF_REPORT_QUESTION_IDS,
	...DECOY_QUESTION_IDS
] as const satisfies readonly QuestionId[];

export function isSelfReportQuestionId(value: QuestionId): value is SelfReportQuestionId {
	return (SELF_REPORT_QUESTION_IDS as readonly QuestionId[]).includes(value);
}

export function isDemographicQuestionId(value: QuestionId): value is DemographicQuestionId {
	return (DEMOGRAPHIC_QUESTION_IDS as readonly QuestionId[]).includes(value);
}

export function isPresentationQuestionId(value: QuestionId): value is PresentationQuestionId {
	return (PRESENTATION_QUESTION_IDS as readonly QuestionId[]).includes(value);
}

export function isDecoyQuestionId(value: QuestionId): value is DecoyQuestionId {
	return (DECOY_QUESTION_IDS as readonly QuestionId[]).includes(value);
}
