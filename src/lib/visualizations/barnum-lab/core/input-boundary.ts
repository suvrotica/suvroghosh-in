import { QUESTION_REGISTRY } from '../data/questions.en';
import {
	QUESTION_IDS,
	SELF_REPORT_QUESTION_IDS,
	type QuestionId,
	type SelfReportQuestionId
} from './question-types';
import type { AnswerState, DisplayProfile, GenerationProfile } from './types';

export type OptionIdFor<Q extends QuestionId> =
	(typeof QUESTION_REGISTRY)[Q]['options'][number]['id'];

const QUESTION_ID_SET: ReadonlySet<string> = new Set(QUESTION_IDS);

export function isQuestionId(value: unknown): value is QuestionId {
	return typeof value === 'string' && QUESTION_ID_SET.has(value);
}

export function isValidOption<Q extends QuestionId>(
	questionId: Q,
	optionId: unknown
): optionId is OptionIdFor<Q> {
	return (
		typeof optionId === 'string' &&
		QUESTION_REGISTRY[questionId].options.some((candidate) => candidate.id === optionId)
	);
}

export function optionLabel<Q extends QuestionId>(questionId: Q, optionId: OptionIdFor<Q>): string {
	return (
		QUESTION_REGISTRY[questionId].options.find((candidate) => candidate.id === optionId)?.label ??
		optionId
	);
}

export function createDefaultDisplayProfile(): DisplayProfile {
	return Object.freeze({
		country: Object.freeze({ optionId: 'india', origin: 'demo-default' }),
		city_context: Object.freeze({ optionId: 'kolkata', origin: 'demo-default' }),
		language: Object.freeze({ optionId: 'bengali-english', origin: 'demo-default' }),
		age_band: Object.freeze({ optionId: 'prefer-not-to-say', origin: 'demo-default' }),
		gender: Object.freeze({ optionId: 'prefer-not-to-say', origin: 'demo-default' })
	});
}

export function setAnswer<Q extends QuestionId>(
	display: DisplayProfile,
	questionId: Q,
	optionId: unknown,
	origin: 'demo-default' | 'user-selected' = 'user-selected'
): DisplayProfile | undefined {
	if (!isValidOption(questionId, optionId)) return undefined;

	const next: AnswerState = {
		...display,
		[questionId]: { optionId, origin }
	};

	if (
		questionId === 'country' &&
		optionId !== 'india' &&
		display.city_context?.optionId === 'kolkata'
	) {
		delete next.city_context;
	}

	return Object.freeze(next);
}

export function isValidAnswerState(value: unknown): value is AnswerState {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const entries = Object.entries(value as Record<string, unknown>);
	const seen = new Set<string>();

	for (const [rawQuestionId, rawAnswer] of entries) {
		if (!isQuestionId(rawQuestionId) || seen.has(rawQuestionId)) return false;
		seen.add(rawQuestionId);
		if (!rawAnswer || typeof rawAnswer !== 'object' || Array.isArray(rawAnswer)) return false;
		const answer = rawAnswer as Record<string, unknown>;
		if (answer.origin !== 'demo-default' && answer.origin !== 'user-selected') return false;
		if (!isValidOption(rawQuestionId, answer.optionId)) return false;
		if (Object.keys(answer).some((key) => key !== 'optionId' && key !== 'origin')) return false;
	}

	return true;
}

/**
 * The sole bridge from display state to semantic generation. The allowlist is intentionally
 * compiled into code: changing a content record cannot grant a demographic field semantic power.
 */
export function toGenerationProfile(
	display: DisplayProfile,
	sessionSeed: string
): GenerationProfile {
	const selfReports: Partial<Record<SelfReportQuestionId, string>> = {};

	for (const questionId of SELF_REPORT_QUESTION_IDS) {
		const answer = display[questionId];
		if (!answer || !isValidOption(questionId, answer.optionId)) continue;
		selfReports[questionId] = answer.optionId;
	}

	return Object.freeze({
		sessionSeed,
		selfReports: Object.freeze(selfReports)
	}) as GenerationProfile;
}

export function canonicalSelfReportEntries(
	profile: GenerationProfile
): readonly (readonly [SelfReportQuestionId, string])[] {
	return SELF_REPORT_QUESTION_IDS.flatMap((questionId) => {
		const optionId = profile.selfReports[questionId];
		return optionId ? ([[questionId, optionId]] as const) : [];
	});
}
