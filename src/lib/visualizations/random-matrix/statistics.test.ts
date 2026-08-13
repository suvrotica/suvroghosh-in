import { describe, expect, it } from 'vitest';
import { DEFAULT_RANDOM_MATRIX_STATE } from './constants';
import { computeRandomMatrix } from './analysis';
import { nullModelInterpretation, runNullEnsemble } from './null-model';
import {
	calculateMetricValues,
	compareMetricToNull,
	eigenvalueMagnitudeRank,
	lowFrequencyPowerFraction,
	pearsonCorrelation,
	twoBlockContrast
} from './statistics';

describe('structure statistics and empirical comparisons', () => {
	it('maps a selected eigenvalue to a stable magnitude rank for null comparisons', () => {
		const eigen = {
			real: Float64Array.from([0.5, -3, 1]),
			imaginary: Float64Array.from([0, 0, 2]),
			residual: 0,
			maxPairResidual: 0
		};
		expect(eigenvalueMagnitudeRank(eigen, 1)).toBe(0);
		expect(eigenvalueMagnitudeRank(eigen, 2)).toBe(1);
		expect(eigenvalueMagnitudeRank(eigen, 0)).toBe(2);
	});

	it('computes midrank empirical percentiles and sample z-scores', () => {
		const comparison = compareMetricToNull(3, [1, 2, 3, 3, 5]);
		expect(comparison.percentile).toBe(60);
		expect(comparison.mean).toBe(2.8);
		expect(comparison.stddev).toBeCloseTo(1.4832396974191326, 14);
		expect(comparison.zScore).toBeCloseTo((3 - 2.8) / comparison.stddev!, 14);
		expect(comparison.twoSidedPValue).toBe(1);
	});

	it('uses finite-sample-corrected tails and does not overclaim at twenty draws', () => {
		const twenty = compareMetricToNull(
			21,
			Array.from({ length: 20 }, (_, index) => index + 1)
		);
		expect(twenty.percentile).toBe(100);
		expect(twenty.twoSidedPValue).toBeCloseTo(2 / 21, 15);
		expect(nullModelInterpretation(twenty, 20)).toBe('insufficient ensemble samples');

		const forty = compareMetricToNull(
			41,
			Array.from({ length: 40 }, (_, index) => index + 1)
		);
		expect(forty.twoSidedPValue).toBeCloseTo(2 / 41, 15);
		expect(nullModelInterpretation(forty, 40)).toBe('unusual under this null model');
	});

	it('returns null inferential fields when data are absent or degenerate', () => {
		expect(compareMetricToNull(null, [1, 2])).toMatchObject({
			mean: null,
			zScore: null,
			percentile: null
		});
		expect(compareMetricToNull(2, [2, 2, 2])).toMatchObject({
			stddev: 0,
			zScore: null,
			percentile: 50
		});
	});

	it('distinguishes planted two-block and smooth low-frequency structure', () => {
		const block = Float64Array.from({ length: 16 }, (_, index) => {
			const row = Math.floor(index / 4);
			const column = index % 4;
			return row < 2 === column < 2 ? 1 : -1;
		});
		expect(twoBlockContrast(block, 4, 4)).toBe(2);

		const smooth = Float64Array.from({ length: 32 * 32 }, (_, index) =>
			Math.cos((2 * Math.PI * (index % 32)) / 32)
		);
		expect(lowFrequencyPowerFraction(smooth, 32, 32)).toBeCloseTo(1, 12);
	});

	it('handles correlation without inventing a value for constants', () => {
		expect(pearsonCorrelation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 15);
		expect(pearsonCorrelation([1, 1, 1], [2, 3, 4])).toBeNull();
	});

	it('pairs localization with the algebraically leading real eigenvalue', () => {
		const values = Float64Array.from([-5, 0, 0, 4]);
		const metrics = calculateMetricValues(
			values,
			2,
			2,
			{
				real: Float64Array.from([-5, 4]),
				imaginary: new Float64Array(2),
				residual: 0,
				maxPairResidual: 0,
				ipr: Float64Array.from([0.9, 0.2])
			},
			{
				values: Float64Array.from([5, 4]),
				rank: 2,
				tolerance: 0,
				condition: 1.25,
				residual: 0,
				cumulativeEnergy: Float64Array.from([25 / 41, 1])
			}
		);
		expect(metrics.leadingEigenvalue).toBe(4);
		expect(metrics.inverseParticipationRatio).toBe(0.2);
	});
});

describe('null ensemble', () => {
	it('is deterministic, strips the planted signal, and reports bounded percentiles', async () => {
		const state = {
			...DEFAULT_RANDOM_MATRIX_STATE,
			dimension: 8,
			signalType: 'two-block' as const,
			signalStrength: 1.5
		};
		const input = {
			state,
			sampleCount: 20,
			metrics: ['largestSingularValue', 'blockContrast'] as const
		};
		const first = await runNullEnsemble(input, { yieldControl: () => Promise.resolve() });
		const second = await runNullEnsemble(input, { yieldControl: () => Promise.resolve() });
		expect(second).toEqual(first);
		expect(first.nullState.signalType).toBe('none');
		expect(first.nullState.signalStrength).toBe(0);
		expect(first.sampleCount).toBe(20);
		for (const metric of input.metrics) {
			expect(first.metrics[metric].percentile).toBeGreaterThanOrEqual(0);
			expect(first.metrics[metric].percentile).toBeLessThanOrEqual(100);
			expect(first.metrics[metric].validSampleCount).toBe(20);
		}
	});

	it('produces finite core analysis summaries', () => {
		const analysis = computeRandomMatrix({
			state: { ...DEFAULT_RANDOM_MATRIX_STATE, dimension: 12 },
			reconstructionRank: 4,
			includeVectors: true
		});
		expect(analysis.matrix).toHaveLength(144);
		expect(analysis.eigen?.real).toHaveLength(12);
		expect(analysis.singular.values).toHaveLength(12);
		expect(analysis.singular.reconstruction).toHaveLength(144);
		expect(analysis.summary.frobeniusNorm).toBeGreaterThan(0);
		expect(analysis.warnings).toEqual([]);
	});

	it('compares the displayed sample and rearrangement against the same null view', async () => {
		const state = { ...DEFAULT_RANDOM_MATRIX_STATE, dimension: 6 };
		const result = await runNullEnsemble(
			{
				state,
				sampleCount: 3,
				observedSampleIndex: 7,
				rearrangement: 'joint-permutation',
				metrics: ['largestSingularValue']
			},
			{ yieldControl: () => Promise.resolve() }
		);
		const displayed = computeRandomMatrix({
			state,
			sampleIndex: 7,
			rearrangement: 'joint-permutation'
		});
		expect(result.observedSampleIndex).toBe(7);
		expect(result.rearrangement).toBe('joint-permutation');
		expect(result.observed.largestSingularValue).toBeCloseTo(displayed.singular.values[0], 13);
	});

	it('disables a spectral theory overlay after a non-preserving rearrangement', () => {
		const analysis = computeRandomMatrix({
			state: { ...DEFAULT_RANDOM_MATRIX_STATE, dimension: 8 },
			rearrangement: 'row-norm'
		});
		expect(analysis.theory).toBeNull();
		expect(analysis.warnings.join(' ')).toContain('does not preserve eigenvalues');
	});

	it('only pairs QᵀAQ with the visible original matrix A', () => {
		const state = {
			...DEFAULT_RANDOM_MATRIX_STATE,
			preset: 'same-spectrum-different-face' as const,
			dimension: 8,
			symmetry: 'symmetric' as const,
			signalType: 'diagonal-band' as const,
			signalStrength: 0.8
		};
		const original = computeRandomMatrix({ state, rearrangement: 'original' });
		expect(original.comparison?.kind).toBe('same-spectrum');
		expect(original.comparison?.maxEigenvalueDelta).toBeLessThan(1e-12);

		for (const rearrangement of [
			'entry-shuffle',
			'row-norm',
			'joint-permutation',
			'orthogonal-similarity',
			'spectral-order'
		] as const) {
			const rearranged = computeRandomMatrix({ state, rearrangement });
			expect(rearranged.comparison, rearrangement).toBeUndefined();
		}
	});

	it('rejects null ranges that overlap the observation or overflow sample indices', async () => {
		const state = { ...DEFAULT_RANDOM_MATRIX_STATE, dimension: 4 };
		await expect(
			runNullEnsemble({
				state,
				sampleCount: 4,
				observedSampleIndex: 5,
				sampleIndexStart: 3
			})
		).rejects.toThrow(/cannot include the observed/);
		await expect(
			runNullEnsemble({
				state,
				sampleCount: 4,
				sampleIndexStart: Number.MAX_SAFE_INTEGER - 1
			})
		).rejects.toThrow(/exceeds safe integer/);
	});
});
