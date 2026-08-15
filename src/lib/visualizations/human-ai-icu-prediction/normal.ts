const LOWER_TAIL = 0.02425;
const UPPER_TAIL = 1 - LOWER_TAIL;

const A = [
	-3.969_683_028_665_376e1, 2.209_460_984_245_205e2, -2.759_285_104_469_687e2,
	1.383_577_518_672_69e2, -3.066_479_806_614_716e1, 2.506_628_277_459_239
] as const;
const B = [
	-5.447_609_879_822_406e1, 1.615_858_368_580_409e2, -1.556_989_798_598_866e2,
	6.680_131_188_771_972e1, -1.328_068_155_288_572e1
] as const;
const C = [
	-7.784_894_002_430_293e-3, -3.223_964_580_411_365e-1, -2.400_758_277_161_838,
	-2.549_732_539_343_734, 4.374_664_141_464_968, 2.938_163_982_698_783
] as const;
const D = [
	7.784_695_709_041_462e-3, 3.224_671_290_700_398e-1, 2.445_134_137_142_996, 3.754_408_661_907_416
] as const;

/** Peter J. Acklam's stable rational approximation to the normal quantile. */
export function inverseNormalCdf(probability: number): number {
	if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
		throw new RangeError('Normal-CDF probability must be finite and lie in [0, 1].');
	}
	if (probability === 0) return Number.NEGATIVE_INFINITY;
	if (probability === 1) return Number.POSITIVE_INFINITY;

	if (probability < LOWER_TAIL) {
		const q = Math.sqrt(-2 * Math.log(probability));
		return (
			(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
			((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1)
		);
	}

	if (probability > UPPER_TAIL) {
		const q = Math.sqrt(-2 * Math.log(1 - probability));
		return -(
			(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
			((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1)
		);
	}

	const q = probability - 0.5;
	const r = q * q;
	return (
		((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) /
		(((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1)
	);
}

export function boxMullerPair(
	firstUniform: number,
	secondUniform: number
): readonly [number, number] {
	if (
		!Number.isFinite(firstUniform) ||
		!Number.isFinite(secondUniform) ||
		firstUniform <= 0 ||
		firstUniform >= 1 ||
		secondUniform <= 0 ||
		secondUniform >= 1
	) {
		throw new RangeError('Box–Muller uniforms must be finite and lie strictly inside (0, 1).');
	}
	const radius = Math.sqrt(-2 * Math.log(firstUniform));
	const angle = 2 * Math.PI * secondUniform;
	return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

export function aucToClassSeparation(targetAuc: number): number {
	if (!Number.isFinite(targetAuc) || targetAuc < 0.5 || targetAuc >= 1) {
		throw new RangeError('Target AUC must be finite and lie in [0.5, 1).');
	}
	return Math.SQRT2 * inverseNormalCdf(targetAuc);
}

export function logistic(logOdds: number): number {
	if (Number.isNaN(logOdds)) return Number.NaN;
	if (logOdds >= 0) {
		const exponential = Math.exp(-logOdds);
		return 1 / (1 + exponential);
	}
	const exponential = Math.exp(logOdds);
	return exponential / (1 + exponential);
}

const LOGIT_PROBABILITY_EPSILON = 1e-15;

export function probabilityForLogit(probability: number): number {
	if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
		throw new RangeError('Probability must be finite and lie in [0, 1].');
	}
	return Math.min(1 - LOGIT_PROBABILITY_EPSILON, Math.max(LOGIT_PROBABILITY_EPSILON, probability));
}

export function logit(probability: number): number {
	const safeProbability = probabilityForLogit(probability);
	return Math.log(safeProbability) - Math.log1p(-safeProbability);
}
