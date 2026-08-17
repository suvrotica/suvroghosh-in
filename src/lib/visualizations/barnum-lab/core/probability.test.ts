import { describe, expect, it } from 'vitest';
import {
	binomialTail,
	distinguishingPower,
	expectedAccepts,
	naturalFrequency,
	probabilityAtLeastOne,
	theatricalConfidence
} from './probability';

describe('many-guesses toy probability model', () => {
	it('handles all documented boundaries', () => {
		expect(probabilityAtLeastOne(0, 12)).toBe(0);
		expect(probabilityAtLeastOne(1, 12)).toBe(1);
		expect(probabilityAtLeastOne(0.5, 0)).toBe(0);
		expect(binomialTail(0.5, 12, 0)).toBe(1);
		expect(binomialTail(0.5, 12, 13)).toBe(0);
		expect(binomialTail(0, 12, 1)).toBe(0);
		expect(binomialTail(1, 12, 12)).toBe(1);
		expect(binomialTail(0.5, 12, 12)).toBeCloseTo(1 / 4096, 12);
	});

	it('keeps expectation, tail, and natural frequency numerically coherent', () => {
		expect(expectedAccepts(0.25, 12)).toBe(3);
		expect(probabilityAtLeastOne(0.25, 12)).toBeCloseTo(1 - 0.75 ** 12, 12);
		expect(binomialTail(0.25, 12, 1)).toBeCloseTo(probabilityAtLeastOne(0.25, 12), 12);
		expect(naturalFrequency(0.253, 1_000)).toBe(253);
	});

	it('clamps invalid controls and avoids unsupported posterior claims', () => {
		expect(expectedAccepts(2, -4)).toBe(0);
		expect(binomialTail(Number.NaN, 10, 1)).toBe(0);
		expect(distinguishingPower(0.7, 0.65)).toEqual({
			groupAAcceptance: 0.7,
			groupBAcceptance: 0.65,
			absoluteDifference: expect.closeTo(0.05),
			likelihoodRatio: expect.closeTo(0.7 / 0.65)
		});
		expect(distinguishingPower(0.7, 0).likelihoodRatio).toBeUndefined();
	});

	it('keeps the theatrical meter deterministic and separate', () => {
		expect(theatricalConfidence(4, '0123456789abcdef')).toBe(
			theatricalConfidence(4, '0123456789abcdef')
		);
		expect(theatricalConfidence(100, '0123456789abcdef')).toBe(96);
	});
});
