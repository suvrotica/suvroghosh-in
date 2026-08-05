import type { Bias, BiasSimilarityWeights } from './bias-types';

/**
 * Geographic similarity is deliberately limited to functional features.
 * Research lineage is metadata for a lens and never enters this calculation.
 */
export const BIAS_SIMILARITY_WEIGHTS: Readonly<BiasSimilarityWeights> = Object.freeze({
	mechanisms: 0.35,
	tasks: 0.2,
	triggers: 0.15,
	manifestations: 0.15,
	targets: 0.1,
	temporalStage: 0.05
});

export interface BiasSimilarityBreakdown {
	mechanisms: number;
	tasks: number;
	triggers: number;
	manifestations: number;
	targets: number;
	temporalStage: number;
	total: number;
}

export interface BiasSimilarityPair {
	source: string;
	target: string;
	similarity: number;
}

function round(value: number, places = 12): number {
	const scale = 10 ** places;
	return Math.round(value * scale) / scale;
}

function uniqueValues(values: readonly string[]): Set<string> {
	return new Set(values.map((value) => value.trim()).filter(Boolean));
}

/** Symmetric Jaccard similarity. Two empty sets provide no evidence of resemblance. */
export function jaccardSimilarity(left: readonly string[], right: readonly string[]): number {
	const a = uniqueValues(left);
	const b = uniqueValues(right);
	if (a.size === 0 && b.size === 0) return 0;

	let intersection = 0;
	for (const value of a) {
		if (b.has(value)) intersection += 1;
	}
	return intersection / (a.size + b.size - intersection);
}

export function biasSimilarityBreakdown(left: Bias, right: Bias): BiasSimilarityBreakdown {
	const mechanisms = jaccardSimilarity(left.mechanisms, right.mechanisms);
	const tasks = jaccardSimilarity(left.tasks, right.tasks);
	const triggers = jaccardSimilarity(left.triggers, right.triggers);
	const manifestations = jaccardSimilarity(left.manifestations, right.manifestations);
	const targets = jaccardSimilarity(left.targets, right.targets);
	const temporalStage = jaccardSimilarity(left.temporalStage, right.temporalStage);

	return {
		mechanisms,
		tasks,
		triggers,
		manifestations,
		targets,
		temporalStage,
		total: round(
			mechanisms * BIAS_SIMILARITY_WEIGHTS.mechanisms +
				tasks * BIAS_SIMILARITY_WEIGHTS.tasks +
				triggers * BIAS_SIMILARITY_WEIGHTS.triggers +
				manifestations * BIAS_SIMILARITY_WEIGHTS.manifestations +
				targets * BIAS_SIMILARITY_WEIGHTS.targets +
				temporalStage * BIAS_SIMILARITY_WEIGHTS.temporalStage
		)
	};
}

export function biasSimilarity(left: Bias, right: Bias): number {
	return biasSimilarityBreakdown(left, right).total;
}

/** Returns each unordered pair in stable ID order. */
export function pairwiseBiasSimilarities(biases: readonly Bias[]): BiasSimilarityPair[] {
	const ordered = [...biases].sort((left, right) => left.id.localeCompare(right.id));
	const pairs: BiasSimilarityPair[] = [];
	for (let left = 0; left < ordered.length; left += 1) {
		for (let right = left + 1; right < ordered.length; right += 1) {
			pairs.push({
				source: ordered[left].id,
				target: ordered[right].id,
				similarity: biasSimilarity(ordered[left], ordered[right])
			});
		}
	}
	return pairs;
}
