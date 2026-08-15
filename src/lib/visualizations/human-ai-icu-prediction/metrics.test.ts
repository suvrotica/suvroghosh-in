import { describe, expect, it } from 'vitest';
import {
	areaUnderRocCurve,
	brierScore,
	buildWeightCurve,
	ensembleBrierAtWeight,
	evaluateCohort,
	formatMetric,
	hindsightOptimalWeight,
	pearsonCorrelation,
	sampleCasesForDisplay,
	selectModerateDisagreementCase
} from './metrics';
import { configForIcuLabPreset } from './presets';
import { simulateIcuCohort } from './simulation';
import type { BinaryOutcome, SimulatedSyntheticCase } from './types';

function metricCase(
	index: number,
	outcome: BinaryOutcome,
	clinician: number,
	model: number,
	weight = 0.5
): SimulatedSyntheticCase {
	const baseDraw = {
		index,
		outcomeUniform: 0.5,
		gaussianUniforms: [0.5, 0.5] as const,
		clinicianGaussian: 0,
		modelGaussian: 0
	};
	const latent = {
		classSeparation: 0,
		independentGaussian: 0,
		residual: 0,
		score: 0,
		baseLogOdds: 0,
		baseProbability: 0.5
	};
	return {
		index,
		id: `S-${String(index + 1).padStart(4, '0')}`,
		outcome,
		baseDraw,
		latent: { clinician: latent, model: latent },
		probabilities: {
			clinician,
			model,
			ensemble: weight * clinician + (1 - weight) * model
		}
	};
}

describe('probabilistic metrics', () => {
	it('matches a hand-calculated Brier-score fixture', () => {
		expect(brierScore([0, 0.5, 1], [0, 1, 1])).toBeCloseTo(1 / 12, 15);
		expect(brierScore([0, 1], [1, 0])).toBe(1);
		expect(brierScore([0, 1], [0, 1])).toBe(0);
	});

	it('handles AUC ties with average ranks and single-class cohorts explicitly', () => {
		expect(areaUnderRocCurve([0.1, 0.4, 0.4, 0.8], [0, 0, 1, 1])).toBe(0.875);
		expect(areaUnderRocCurve([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBe(0.5);
		expect(areaUnderRocCurve([0.1, 0.2], [0, 0])).toBeNull();
		expect(areaUnderRocCurve([0.1, 0.2], [1, 1])).toBeNull();
		expect(() => areaUnderRocCurve([0.1], [0, 1])).toThrow(RangeError);
	});

	it('returns undefined correlations rather than NaN or a fake zero', () => {
		expect(pearsonCorrelation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 15);
		expect(pearsonCorrelation([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 15);
		expect(pearsonCorrelation([1, 1, 1], [2, 3, 4])).toBeNull();
		expect(pearsonCorrelation([1], [1])).toBeNull();
		expect(pearsonCorrelation([1, Number.NaN], [1, 2])).toBeNull();
		expect(formatMetric(null)).toBe('—');
		expect(formatMetric(Number.NaN)).toBe('—');
	});

	it('verifies both exact Brier decomposition identities on the full cohort', () => {
		const cohort = simulateIcuCohort(configForIcuLabPreset('specialist-missing-structured-data'));
		const { cases, metrics } = evaluateCohort(cohort);
		expect(Math.abs(metrics.crossTermIdentityResidual)).toBeLessThan(2e-15);
		expect(Math.abs(metrics.weightedAverageIdentityResidual)).toBeLessThan(2e-15);
		expect(metrics.weightedAverageLoss - metrics.brierScores.ensemble).toBeCloseTo(
			metrics.diversityTerm,
			14
		);
		expect(metrics.diversityTerm).toBeGreaterThanOrEqual(0);
		for (const score of Object.values(metrics.brierScores)) {
			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(1);
		}
		for (const syntheticCase of cases) {
			expect(syntheticCase.squaredLosses.clinician).toBe(
				(syntheticCase.probabilities.clinician - syntheticCase.outcome) ** 2
			);
			expect(syntheticCase.squaredLosses.model).toBe(
				(syntheticCase.probabilities.model - syntheticCase.outcome) ** 2
			);
		}
	});

	it('makes the weight-curve endpoints exactly reproduce the individual scores', () => {
		const cases = simulateIcuCohort(
			configForIcuLabPreset('specialist-missing-structured-data')
		).cases;
		const curve = buildWeightCurve(cases, 20);
		expect(curve.points).toHaveLength(21);
		expect(curve.points[0]).toEqual({
			clinicianWeight: 0,
			brierScore: ensembleBrierAtWeight(cases, 0)
		});
		expect(curve.points.at(-1)).toEqual({
			clinicianWeight: 1,
			brierScore: ensembleBrierAtWeight(cases, 1)
		});
		expect(curve.identifiable).toBe(true);
		expect(curve.hindsightOptimalWeight).toBeGreaterThan(0);
		expect(curve.hindsightOptimalWeight).toBeLessThan(1);
	});

	it('does not invent a hindsight optimum when predictions are effectively identical', () => {
		const identical = [
			metricCase(0, 0, 0.2, 0.2),
			metricCase(1, 1, 0.7, 0.7),
			metricCase(2, 0, 0.4, 0.4)
		];
		expect(hindsightOptimalWeight(identical)).toBeNull();
		expect(buildWeightCurve(identical).identifiable).toBe(false);
		expect(buildWeightCurve(identical).hindsightMinimumBrier).toBeNull();
	});

	it('selects a moderately high disagreement rather than the most extreme case', () => {
		const cases = Array.from({ length: 10 }, (_, index) =>
			metricCase(index, (index % 2) as BinaryOutcome, index / 10, 0)
		);
		expect(selectModerateDisagreementCase(cases)).toBe(8);
		expect(selectModerateDisagreementCase(cases)).not.toBe(9);
	});

	it('takes a deterministic unique 600-case display sample and retains the selected case', () => {
		const cases = Array.from({ length: 3_000 }, (_, index) => ({ index }));
		const options = { maximum: 600, seed: 'sample-proof', includeCaseIndex: 2_999 };
		const first = sampleCasesForDisplay(cases, options);
		const replay = sampleCasesForDisplay(cases, options);
		expect(replay).toEqual(first);
		expect(first).toHaveLength(600);
		expect(new Set(first.map((entry) => entry.index)).size).toBe(600);
		expect(first.some((entry) => entry.index === 2_999)).toBe(true);
		expect(sampleCasesForDisplay(cases, { ...options, seed: 'another-sample' })).not.toEqual(first);
	});
});
