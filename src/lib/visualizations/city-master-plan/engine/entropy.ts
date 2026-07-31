import type { TileVariant } from './types';
import { BitSet } from './bitset';

export function weightedShannonEntropy(
	candidates: BitSet,
	variants: readonly TileVariant[]
): number {
	if (candidates.isEmpty()) return Number.NEGATIVE_INFINITY;
	let sumWeight = 0;
	let sumWeightLogWeight = 0;
	for (const index of candidates.values()) {
		const weight = candidateWeight(candidates, variants, index);
		sumWeight += weight;
		sumWeightLogWeight += weight * Math.log(weight);
	}
	if (sumWeight <= 0 || !Number.isFinite(sumWeight)) return 0;
	const entropy = Math.log(sumWeight) - sumWeightLogWeight / sumWeight;
	return Number.isFinite(entropy) ? Math.max(0, entropy) : 0;
}

export function weightedCandidateChoice(
	candidates: BitSet,
	variants: readonly TileVariant[],
	unitRandom: number
): number {
	let total = 0;
	for (const index of candidates.values()) {
		total += candidateWeight(candidates, variants, index);
	}
	if (!(total > 0)) return candidates.values().next().value ?? -1;
	let target = Math.max(0, Math.min(1 - Number.EPSILON, unitRandom)) * total;
	let last = -1;
	for (const index of candidates.values()) {
		last = index;
		target -= candidateWeight(candidates, variants, index);
		if (target < 0) return index;
	}
	return last;
}

function candidateWeight(
	candidates: BitSet,
	variants: readonly TileVariant[],
	index: number
): number {
	return Math.max(
		Number.EPSILON,
		variants[index].weight * candidates.observationWeightScale(index)
	);
}
