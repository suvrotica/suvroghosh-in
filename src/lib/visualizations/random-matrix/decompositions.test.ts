import { describe, expect, it } from 'vitest';
import {
	computeEigenAnalysis,
	computeSingularAnalysis,
	eigenvalueMatchDistance,
	lowRankReconstruction
} from './decompositions';

describe('trusted Float64 EVD fixtures', () => {
	it('solves diagonal, repeated and zero matrices', () => {
		const diagonal = computeEigenAnalysis(Float64Array.from([3, 0, 0, -2]), 2, 2, {
			symmetric: true,
			includeVectors: true
		});
		expect([...diagonal.real].sort((left, right) => left - right)).toEqual([-2, 3]);
		expect([...diagonal.imaginary]).toEqual([0, 0]);
		expect(diagonal.residual).toBeLessThan(1e-14);

		const repeated = computeEigenAnalysis(Float64Array.from([4, 0, 0, 4]), 2, 2, {
			symmetric: true
		});
		expect([...repeated.real]).toEqual([4, 4]);
		expect(repeated.maxPairResidual).toBeLessThan(1e-14);

		const zero = computeEigenAnalysis(new Float64Array(9), 3, 3, { symmetric: true });
		expect([...zero.real]).toEqual([0, 0, 0]);
		expect(zero.residual).toBe(0);
	});

	it('keeps rotation eigenvalues as a complex conjugate pair', () => {
		const result = computeEigenAnalysis(Float64Array.from([0, -1, 1, 0]), 2, 2, {
			symmetric: false,
			includeVectors: true
		});
		expect([...result.real]).toEqual([0, 0]);
		expect([...result.imaginary].sort((left, right) => left - right)).toEqual([-1, 1]);
		expect(result.maxPairResidual).toBeLessThan(1e-14);
	});

	it('handles a defective Jordan block and a nearly defective split block', () => {
		const defective = computeEigenAnalysis(Float64Array.from([1, 1, 0, 1]), 2, 2, {
			symmetric: false,
			includeVectors: true
		});
		expect([...defective.real]).toEqual([1, 1]);
		expect(defective.residual).toBeLessThan(1e-12);

		const nearly = computeEigenAnalysis(Float64Array.from([1, 1, 0, 1 + 1e-12]), 2, 2, {
			symmetric: false,
			includeVectors: true
		});
		expect(nearly.real[0]).toBeCloseTo(1, 12);
		expect(nearly.real[1]).toBeCloseTo(1 + 1e-12, 12);
		expect(nearly.residual).toBeLessThan(1e-10);
	});

	it('reports every nonreal eigenvalue with its conjugate', () => {
		const result = computeEigenAnalysis(Float64Array.from([0, -1, 0, 1, 0, 0, 0, 0, 2]), 3, 3, {
			symmetric: false
		});
		for (let index = 0; index < result.real.length; index += 1) {
			if (result.imaginary[index] === 0) continue;
			expect(
				[...result.real].some(
					(real, partner) =>
						Math.abs(real - result.real[index]) < 1e-14 &&
						Math.abs(result.imaginary[partner] + result.imaginary[index]) < 1e-14
				)
			).toBe(true);
		}
	});

	it('enforces separate documented symmetric and nonsymmetric caps', () => {
		expect(() =>
			computeEigenAnalysis(new Float64Array(129 * 129), 129, 129, { symmetric: false })
		).toThrow(/capped at n=128/);
		expect(() =>
			computeEigenAnalysis(new Float64Array(257 * 257), 257, 257, { symmetric: true })
		).toThrow(/capped at n=256/);
	});
});

describe('singular-value decomposition', () => {
	it('reconstructs a rectangular matrix and documents rank tolerance', () => {
		const matrix = Float64Array.from([1, 2, 3, 4, 5, 6]);
		const result = computeSingularAnalysis(matrix, 2, 3, {
			includeVectors: true,
			reconstructionRank: 2
		});
		expect(result.values).toHaveLength(2);
		expect(result.rank).toBe(2);
		expect(result.tolerance).toBe(3 * result.values[0] * Number.EPSILON);
		expect(result.residual).toBeLessThan(1e-13);
		expect(result.reconstructionError).toBeLessThan(1e-13);
	});

	it('recognizes rank deficiency and represents infinite condition as null', () => {
		const result = computeSingularAnalysis(Float64Array.from([1, 2, 2, 4]), 2, 2);
		expect(result.rank).toBe(1);
		expect(result.condition).toBeNull();
		expect(result.residual).toBeLessThan(1e-13);
	});

	it('reconstructs tall matrices and handles the exact zero matrix', () => {
		const tall = Float64Array.from([1, 2, 3, 4, 5, 6]);
		const tallResult = computeSingularAnalysis(tall, 3, 2, { reconstructionRank: 2 });
		expect(tallResult.residual).toBeLessThan(1e-13);
		expect(tallResult.reconstructionError).toBeLessThan(1e-13);

		const zero = computeSingularAnalysis(new Float64Array(12), 3, 4, {
			reconstructionRank: 0
		});
		expect(zero.rank).toBe(0);
		expect(zero.condition).toBeNull();
		expect(zero.residual).toBe(0);
		expect(zero.reconstructionError).toBe(0);
	});

	it('rejects non-finite reconstruction ranks and oversized full SVDs', () => {
		expect(() =>
			computeSingularAnalysis(Float64Array.from([1]), 1, 1, {
				reconstructionRank: Number.NaN
			})
		).toThrow(/finite/);
		expect(() => computeSingularAnalysis(new Float64Array(257), 257, 1)).toThrow(
			/capped at dimension 256/
		);
	});

	it('makes reconstruction error decrease monotonically with k', () => {
		const matrix = Float64Array.from([4, 1, 2, 0, 3, -1, 2, 1, 1]);
		const errors = [0, 1, 2, 3].map(
			(rank) => lowRankReconstruction(matrix, 3, 3, rank).relativeError
		);
		expect(errors[0]).toBeCloseTo(1, 15);
		expect(errors[1]).toBeGreaterThanOrEqual(errors[2]);
		expect(errors[2]).toBeGreaterThanOrEqual(errors[3]);
		expect(errors[3]).toBeLessThan(1e-13);
	});

	it('matches equal spectra without depending on solver ordering', () => {
		const left = computeEigenAnalysis(Float64Array.from([1, 0, 0, 2]), 2, 2, {
			symmetric: true
		});
		const right = {
			...left,
			real: Float64Array.from([2, 1]),
			imaginary: Float64Array.from([0, 0])
		};
		expect(eigenvalueMatchDistance(left, right)).toBe(0);
	});
});
