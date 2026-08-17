import { setAnswer } from './input-boundary';
import type { DisplayProfile, GeneratedStatement } from './types';
import type { QuestionId } from './question-types';

export const FICTIONAL_COUNTERFACTUAL_PRESET = Object.freeze({
	country: 'elsewhere',
	city_context: 'moves-between-places',
	language: 'english',
	age_band: '65-plus',
	gender: 'non-binary',
	self_reported_device: 'tablet',
	reading_time: 'morning',
	reading_medium: 'audio',
	preferred_shape: 'triangle',
	preferred_weather: 'rainy'
} as const);

export interface CounterfactualResult {
	profile: DisplayProfile;
	changedQuestionIds: readonly QuestionId[];
}

export function createDemographicCounterfactual(display: DisplayProfile): CounterfactualResult {
	let profile = display;
	const changedQuestionIds: QuestionId[] = [];
	for (const [questionId, optionId] of Object.entries(
		FICTIONAL_COUNTERFACTUAL_PRESET
	) as readonly (readonly [keyof typeof FICTIONAL_COUNTERFACTUAL_PRESET, string])[]) {
		if (profile[questionId]?.optionId === optionId) continue;
		const next = setAnswer(profile, questionId, optionId, 'user-selected');
		if (!next) continue;
		profile = next;
		changedQuestionIds.push(questionId);
	}
	return { profile, changedQuestionIds };
}

export function applyDemographicCounterfactual(display: DisplayProfile): DisplayProfile {
	return createDemographicCounterfactual(display).profile;
}

export function canonicalSemanticManifest(statements: readonly GeneratedStatement[]): string {
	return JSON.stringify(
		statements.map((statement) => ({
			slotId: statement.slotId,
			coreId: statement.coreId,
			frameId: statement.trace.frameId,
			fragmentIds: statement.trace.fragmentIds,
			semanticKeys: statement.trace.semanticKeys,
			seedKey: statement.trace.seedKey
		}))
	);
}

export interface SemanticManifestComparison {
	identical: boolean;
	overlapPercent: number;
	changedSlotIds: readonly string[];
}

export function compareSemanticManifests(
	left: readonly GeneratedStatement[],
	right: readonly GeneratedStatement[]
): SemanticManifestComparison {
	const leftBySlot = new Map(left.map((statement) => [statement.slotId, statement]));
	const rightBySlot = new Map(right.map((statement) => [statement.slotId, statement]));
	const slots = [...new Set([...leftBySlot.keys(), ...rightBySlot.keys()])].sort();
	const changedSlotIds = slots.filter((slotId) => {
		const a = leftBySlot.get(slotId);
		const b = rightBySlot.get(slotId);
		return (
			!a || !b || JSON.stringify(a.trace.semanticKeys) !== JSON.stringify(b.trace.semanticKeys)
		);
	});
	const unchanged = slots.length - changedSlotIds.length;
	return {
		identical: changedSlotIds.length === 0,
		overlapPercent: slots.length === 0 ? 100 : (unchanged / slots.length) * 100,
		changedSlotIds
	};
}
