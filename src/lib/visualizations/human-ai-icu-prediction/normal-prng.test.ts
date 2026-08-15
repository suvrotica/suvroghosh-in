import { afterEach, describe, expect, it, vi } from 'vitest';
import { aucToClassSeparation, boxMullerPair, inverseNormalCdf, logistic, logit } from './normal';
import { deriveCohortSeed, NamedSeedPrng } from './prng';
import { generateBaseDraws } from './simulation';

afterEach(() => vi.restoreAllMocks());

describe('stable normal mathematics', () => {
	it.each([
		[0.001, -3.090_232_306_167_813],
		[0.025, -1.959_963_984_540_054],
		[0.5, 0],
		[0.975, 1.959_963_984_540_054],
		[0.999, 3.090_232_306_167_813]
	])('matches the known Φ⁻¹(%s) quantile', (probability, expected) => {
		expect(inverseNormalCdf(probability)).toBeCloseTo(expected, 7);
	});

	it('handles the support boundaries explicitly and rejects values outside them', () => {
		expect(inverseNormalCdf(0)).toBe(Number.NEGATIVE_INFINITY);
		expect(inverseNormalCdf(1)).toBe(Number.POSITIVE_INFINITY);
		expect(() => inverseNormalCdf(-0.01)).toThrow(RangeError);
		expect(() => inverseNormalCdf(Number.NaN)).toThrow(RangeError);
	});

	it('is symmetric and converts AUC 0.5 into zero class separation', () => {
		for (const probability of [0.0001, 0.1, 0.3, 0.49]) {
			expect(inverseNormalCdf(probability)).toBeCloseTo(-inverseNormalCdf(1 - probability), 10);
		}
		expect(aucToClassSeparation(0.5)).toBe(0);
		expect(() => aucToClassSeparation(1)).toThrow(RangeError);
	});

	it('round-trips finite probabilities through stable logit and logistic helpers', () => {
		for (const probability of [1e-12, 0.01, 0.2, 0.5, 0.9, 1 - 1e-12]) {
			expect(logistic(logit(probability))).toBeCloseTo(probability, 13);
		}
		expect(logistic(1_000)).toBe(1);
		expect(logistic(-1_000)).toBe(0);
	});

	it('produces a finite Box–Muller pair and guards logarithm boundaries', () => {
		const pair = boxMullerPair(0.25, 0.75);
		expect(pair.every(Number.isFinite)).toBe(true);
		expect(() => boxMullerPair(0, 0.5)).toThrow(RangeError);
		expect(() => boxMullerPair(0.5, 1)).toThrow(RangeError);
	});
});

describe('named deterministic randomness', () => {
	it('replays a named stream exactly while separating different names', () => {
		const first = new NamedSeedPrng('icu-lab-v1');
		const replay = new NamedSeedPrng('icu-lab-v1');
		const other = new NamedSeedPrng('icu-lab-v2');
		const firstSequence = Array.from({ length: 24 }, () => first.nextOpenUnit());
		expect(Array.from({ length: 24 }, () => replay.nextOpenUnit())).toEqual(firstSequence);
		expect(Array.from({ length: 24 }, () => other.nextOpenUnit())).not.toEqual(firstSequence);
		expect(firstSequence.every((value) => value > 0 && value < 1)).toBe(true);
	});

	it('generates and retains uniform and Gaussian base draws without ambient randomness', () => {
		vi.spyOn(Math, 'random').mockImplementation(() => {
			throw new Error('ambient randomness used');
		});
		const first = generateBaseDraws('retained-proof', 32);
		const replay = generateBaseDraws('retained-proof', 32);
		expect(replay).toEqual(first);
		expect(first).toHaveLength(32);
		for (const draw of first) {
			expect(draw.outcomeUniform).toBeGreaterThan(0);
			expect(draw.outcomeUniform).toBeLessThan(1);
			expect(draw.gaussianUniforms).toHaveLength(2);
			expect(draw.clinicianGaussian).toBeTypeOf('number');
			expect(draw.modelGaussian).toBeTypeOf('number');
			expect(Number.isFinite(draw.clinicianGaussian)).toBe(true);
			expect(Number.isFinite(draw.modelGaussian)).toBe(true);
		}
	});

	it('derives human-readable robustness-check seeds', () => {
		expect(deriveCohortSeed('icu-lab-v1', 0)).toBe('icu-lab-v1');
		expect(deriveCohortSeed('icu-lab-v1', 1)).toBe('icu-lab-v1:2');
		expect(deriveCohortSeed('icu-lab-v1', 7)).toBe('icu-lab-v1:8');
		expect(() => deriveCohortSeed('icu-lab-v1', -1)).toThrow(RangeError);
	});
});
