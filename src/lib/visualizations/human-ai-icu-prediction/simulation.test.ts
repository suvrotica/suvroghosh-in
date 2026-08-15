import { describe, expect, it } from 'vitest';
import { areaUnderRocCurve, pearsonCorrelation } from './metrics';
import { configForIcuLabPreset } from './presets';
import {
	clampResidualCorrelation,
	generateBaseDraws,
	normalizeIcuLabConfig,
	simulateIcuCohort
} from './simulation';

describe('deterministic binormal cohort generation', () => {
	it('replays the same seed and complete configuration exactly', () => {
		const config = configForIcuLabPreset('specialist-missing-structured-data');
		const first = simulateIcuCohort(config);
		const replay = simulateIcuCohort(config);
		expect(replay).toEqual(first);
	});

	it('produces finite probabilities in [0, 1] and the declared convex ensemble', () => {
		const cohort = simulateIcuCohort(configForIcuLabPreset('specialist-missing-structured-data'));
		for (const syntheticCase of cohort.cases) {
			const { clinician, model, ensemble } = syntheticCase.probabilities;
			for (const probability of [clinician, model, ensemble]) {
				expect(Number.isFinite(probability)).toBe(true);
				expect(probability).toBeGreaterThanOrEqual(0);
				expect(probability).toBeLessThanOrEqual(1);
			}
			expect(ensemble).toBe(
				cohort.config.clinicianWeight * clinician + (1 - cohort.config.clinicianWeight) * model
			);
			expect([0, 1]).toContain(syntheticCase.outcome);
			expect(syntheticCase.id).toMatch(/^S-\d{4}$/);
		}
	});

	it('makes weight zero exactly model-only and weight one exactly clinician-only', () => {
		const baseConfig = configForIcuLabPreset('specialist-missing-structured-data');
		const draws = generateBaseDraws(baseConfig.seed, baseConfig.cohortSize);
		const modelOnly = simulateIcuCohort({ ...baseConfig, clinicianWeight: 0 }, draws);
		const clinicianOnly = simulateIcuCohort({ ...baseConfig, clinicianWeight: 1 }, draws);
		for (let index = 0; index < draws.length; index += 1) {
			expect(modelOnly.cases[index].probabilities.ensemble).toBe(
				modelOnly.cases[index].probabilities.model
			);
			expect(clinicianOnly.cases[index].probabilities.ensemble).toBe(
				clinicianOnly.cases[index].probabilities.clinician
			);
		}
	});

	it('changes only ensemble values when only the ensemble weight changes', () => {
		const baseConfig = configForIcuLabPreset('trainee-strong-model');
		const draws = generateBaseDraws(baseConfig.seed, baseConfig.cohortSize);
		const lightClinician = simulateIcuCohort({ ...baseConfig, clinicianWeight: 0.1 }, draws);
		const heavyClinician = simulateIcuCohort({ ...baseConfig, clinicianWeight: 0.9 }, draws);
		expect(lightClinician.baseDraws).toBe(draws);
		expect(heavyClinician.baseDraws).toBe(draws);
		for (let index = 0; index < draws.length; index += 1) {
			expect(lightClinician.cases[index].probabilities.clinician).toBe(
				heavyClinician.cases[index].probabilities.clinician
			);
			expect(lightClinician.cases[index].probabilities.model).toBe(
				heavyClinician.cases[index].probabilities.model
			);
			expect(lightClinician.cases[index].latent).toEqual(heavyClinician.cases[index].latent);
		}
	});

	it('realizes requested binormal discrimination on a sufficiently large fixed cohort', () => {
		const base = configForIcuLabPreset('specialist-missing-structured-data');
		const config = {
			...base,
			seed: 'auc-realization-proof',
			cohortSize: 30_000,
			clinician: { ...base.clinician, targetAuc: 0.73 },
			model: { ...base.model, targetAuc: 0.87 },
			sharedResidualCorrelation: -0.25
		};
		const cohort = simulateIcuCohort(config);
		const outcomes = cohort.cases.map((syntheticCase) => syntheticCase.outcome);
		const clinicianAuc = areaUnderRocCurve(
			cohort.cases.map((syntheticCase) => syntheticCase.probabilities.clinician),
			outcomes
		);
		const modelAuc = areaUnderRocCurve(
			cohort.cases.map((syntheticCase) => syntheticCase.probabilities.model),
			outcomes
		);
		expect(clinicianAuc).toBeCloseTo(0.73, 2);
		expect(modelAuc).toBeCloseTo(0.87, 2);
	});

	it('preserves ranking when a positive calibration slope changes', () => {
		const base = {
			...configForIcuLabPreset('specialist-missing-structured-data'),
			cohortSize: 5_000
		};
		const draws = generateBaseDraws(base.seed, base.cohortSize);
		const calibrated = simulateIcuCohort(base, draws);
		const rescaled = simulateIcuCohort(
			{
				...base,
				clinician: {
					...base.clinician,
					calibrationIntercept: 0.4,
					calibrationSlope: 1.8
				}
			},
			draws
		);
		const ranking = (probabilities: readonly number[]) =>
			probabilities
				.map((probability, index) => ({ probability, index }))
				.sort((left, right) => left.probability - right.probability)
				.map((entry) => entry.index);
		expect(
			ranking(rescaled.cases.map((syntheticCase) => syntheticCase.probabilities.clinician))
		).toEqual(
			ranking(calibrated.cases.map((syntheticCase) => syntheticCase.probabilities.clinician))
		);
	});

	it('realizes high latent dependence far above a complementary setting', () => {
		const base = configForIcuLabPreset('shared-hospital-artifact');
		const draws = generateBaseDraws(base.seed, base.cohortSize);
		const high = simulateIcuCohort(base, draws);
		const complementary = simulateIcuCohort({ ...base, sharedResidualCorrelation: -0.5 }, draws);
		const realized = (cohort: typeof high) =>
			pearsonCorrelation(
				cohort.cases.map((syntheticCase) => syntheticCase.latent.clinician.residual),
				cohort.cases.map((syntheticCase) => syntheticCase.latent.model.residual)
			);
		expect(realized(high)).toBeGreaterThan(0.9);
		expect(realized(complementary)).toBeLessThan(-0.45);
		expect(realized(high)! - realized(complementary)!).toBeGreaterThan(1.3);
	});

	it('safely clamps finite residual dependence and validates the scientific domain', () => {
		expect(clampResidualCorrelation(1.2)).toBe(1);
		expect(clampResidualCorrelation(-1.2)).toBe(-1);
		const base = configForIcuLabPreset('specialist-missing-structured-data');
		expect(
			normalizeIcuLabConfig({ ...base, sharedResidualCorrelation: 7 }).sharedResidualCorrelation
		).toBe(1);
		expect(() => normalizeIcuLabConfig({ ...base, clinicianWeight: 1.01 })).toThrow(RangeError);
		expect(() =>
			normalizeIcuLabConfig({
				...base,
				model: { ...base.model, calibrationSlope: 0 }
			})
		).toThrow(RangeError);
		expect(() => simulateIcuCohort(base, generateBaseDraws(base.seed, 10))).toThrow(
			/does not match cohort size/
		);
	});
});
