export const MAX_PROBABILITY_CLAIMS = 1_000;

export function clampProbability(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

export function clampClaimCount(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(MAX_PROBABILITY_CLAIMS, Math.max(0, Math.trunc(value)));
}

export function expectedAccepts(probability: number, claimCount: number): number {
	return clampProbability(probability) * clampClaimCount(claimCount);
}

export function probabilityAtLeastOne(probability: number, claimCount: number): number {
	const p = clampProbability(probability);
	const n = clampClaimCount(claimCount);
	if (n === 0 || p === 0) return 0;
	if (p === 1) return 1;
	return -Math.expm1(n * Math.log1p(-p));
}

function logAdd(left: number, right: number): number {
	if (left === Number.NEGATIVE_INFINITY) return right;
	if (right === Number.NEGATIVE_INFINITY) return left;
	const maximum = Math.max(left, right);
	return maximum + Math.log(Math.exp(left - maximum) + Math.exp(right - maximum));
}

/** Numerically stable bounded binomial upper tail. */
export function binomialTail(probability: number, claimCount: number, threshold: number): number {
	const p = clampProbability(probability);
	const n = clampClaimCount(claimCount);
	const k = Math.trunc(Number.isFinite(threshold) ? threshold : 0);
	if (k <= 0) return 1;
	if (k > n || n === 0 || p === 0) return 0;
	if (p === 1) return 1;
	let logCombination = 0;
	let logSum = Number.NEGATIVE_INFINITY;
	for (let successes = 0; successes <= n; successes += 1) {
		if (successes > 0) {
			logCombination += Math.log(n - successes + 1) - Math.log(successes);
		}
		if (successes >= k) {
			const term = logCombination + successes * Math.log(p) + (n - successes) * Math.log1p(-p);
			logSum = logAdd(logSum, term);
		}
	}
	return Math.min(1, Math.max(0, Math.exp(logSum)));
}

export function naturalFrequency(probability: number, sessions = 1_000): number {
	const denominator = Math.max(1, Math.min(100_000, Math.trunc(sessions)));
	return Math.round(clampProbability(probability) * denominator);
}

export interface DistinguishingPower {
	groupAAcceptance: number;
	groupBAcceptance: number;
	absoluteDifference: number;
	likelihoodRatio?: number;
}

export function distinguishingPower(groupA: number, groupB: number): DistinguishingPower {
	const a = clampProbability(groupA);
	const b = clampProbability(groupB);
	return {
		groupAAcceptance: a,
		groupBAcceptance: b,
		absoluteDifference: Math.abs(a - b),
		likelihoodRatio: b === 0 ? undefined : a / b
	};
}

export function theatricalConfidence(answeredCount: number, sessionSeed: string): number {
	const safeCount = Math.max(0, Math.trunc(Number.isFinite(answeredCount) ? answeredCount : 0));
	const decoration = Math.floor(rngFor(sessionSeed, 'fake-confidence')() * 4);
	return Math.min(96, 39 + safeCount * 6 + decoration);
}

import { rngFor } from './seeded-rng';
