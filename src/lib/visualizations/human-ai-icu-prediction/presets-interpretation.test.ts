import { describe, expect, it } from 'vitest';
import { interpretEvaluation } from './interpretation';
import { runIcuLab } from './laboratory';
import {
	configForIcuLabPreset,
	DEFAULT_ICU_LAB_COHORT_SIZE,
	DEFAULT_ICU_LAB_SEED,
	ICU_LAB_PRESETS
} from './presets';

describe('fixed ICU laboratory presets', () => {
	it('publishes exactly the requested titles and complete starting configurations', () => {
		expect(ICU_LAB_PRESETS.map((preset) => preset.title)).toEqual([
			'Specialist with missing structured data',
			'Trainee plus strong model',
			'Both learn the same hospital artifact',
			'Deployment population shift'
		]);
		expect(
			ICU_LAB_PRESETS.map((preset) => ({
				development: preset.config.developmentEventRate,
				deployment: preset.config.deploymentEventRate,
				clinicianAuc: preset.config.clinician.targetAuc,
				modelAuc: preset.config.model.targetAuc,
				correlation: preset.config.sharedResidualCorrelation,
				weight: preset.config.clinicianWeight
			}))
		).toEqual([
			{
				development: 0.2,
				deployment: 0.2,
				clinicianAuc: 0.82,
				modelAuc: 0.75,
				correlation: 0.05,
				weight: 0.7
			},
			{
				development: 0.2,
				deployment: 0.2,
				clinicianAuc: 0.7,
				modelAuc: 0.86,
				correlation: 0.15,
				weight: 0.15
			},
			{
				development: 0.2,
				deployment: 0.2,
				clinicianAuc: 0.83,
				modelAuc: 0.83,
				correlation: 0.95,
				weight: 0.5
			},
			{
				development: 0.2,
				deployment: 0.35,
				clinicianAuc: 0.78,
				modelAuc: 0.84,
				correlation: 0.65,
				weight: 0.5
			}
		]);
		for (const preset of ICU_LAB_PRESETS) {
			expect(preset.config.seed).toBe(DEFAULT_ICU_LAB_SEED);
			expect(preset.config.cohortSize).toBe(DEFAULT_ICU_LAB_COHORT_SIZE);
			expect(preset.config.clinician.calibrationIntercept).toBe(0);
			expect(preset.config.clinician.calibrationSlope).toBe(1);
			expect(preset.config.model.calibrationIntercept).toBe(0);
			expect(preset.config.model.calibrationSlope).toBe(1);
			expect(preset.explanation).toMatch(
				/None of the numerical values are estimates of real clinicians, models, hospitals, or AKI incidence\./
			);
		}
		expect(ICU_LAB_PRESETS[0].explanation).toMatch(/MAR, MNAR, extraction failure/);
		expect(ICU_LAB_PRESETS[2].explanation).toMatch(/does not causally model/);
		expect(ICU_LAB_PRESETS[3].explanation).toMatch(/prior\/prevalence-shift/);
	});

	it('returns deep-enough config copies for atomic custom editing and reset', () => {
		const first = configForIcuLabPreset('specialist-missing-structured-data');
		const reset = configForIcuLabPreset('specialist-missing-structured-data');
		expect(reset).toEqual(first);
		expect(reset).not.toBe(first);
		expect(reset.clinician).not.toBe(first.clinician);
		expect(reset.model).not.toBe(first.model);
	});
});

describe('failure-oriented deterministic evidence', () => {
	const specialist = runIcuLab(configForIcuLabPreset('specialist-missing-structured-data'));
	const sharedArtifact = runIcuLab(configForIcuLabPreset('shared-hospital-artifact'));
	const shifted = runIcuLab(configForIcuLabPreset('deployment-population-shift'));

	it('makes the specialist preset visibly benefit from complementary forecasts', () => {
		expect(specialist.metrics.ensembleGain).toBeGreaterThan(0.003);
		expect(specialist.metrics.brierScores.ensemble).toBeLessThan(
			specialist.metrics.brierScores.clinician
		);
		expect(specialist.metrics.brierScores.ensemble).toBeLessThan(
			specialist.metrics.brierScores.model
		);
		expect(specialist.interpretation.headline).toMatch(/beats both individual forecasts/i);
	});

	it('makes the shared-artifact preset substantially more redundant', () => {
		expect(sharedArtifact.metrics.correlations.latentResiduals).toBeGreaterThan(0.9);
		expect(sharedArtifact.metrics.correlations.casewiseSquaredLosses).toBeGreaterThan(0.9);
		expect(sharedArtifact.metrics.ensembleGain).toBeLessThan(specialist.metrics.ensembleGain * 0.4);
		expect(sharedArtifact.interpretation.details.join(' ')).toMatch(
			/casewise squared losses move together strongly/i
		);
	});

	it('shows prevalence shift damaging calibration while broadly preserving discrimination', () => {
		expect(
			shifted.metrics.observedEventRate - shifted.metrics.meanPredictions.ensemble
		).toBeGreaterThan(0.09);
		expect(shifted.metrics.realizedAuc.clinician).toBeCloseTo(0.78, 1);
		expect(shifted.metrics.realizedAuc.model).toBeCloseTo(0.84, 1);
		expect(shifted.metrics.brierScores.ensemble).toBeGreaterThan(shifted.metrics.brierScores.model);
		expect(shifted.metrics.ensembleGain).toBeLessThan(0);
		const prose = [
			shifted.interpretation.headline,
			shifted.interpretation.summary,
			...shifted.interpretation.details
		].join(' ');
		expect(prose).toMatch(/model leads/i);
		expect(prose).toMatch(/weighted average/i);
		expect(prose).toMatch(/not better than the best member/i);
		expect(prose).toMatch(/miss the generated event rate|observed synthetic event rate/i);
		expect(prose).toMatch(/shared miscalibration survives/i);
	});

	it('describes a tiny positive gain as positive but negligible, never as failing to beat the best', () => {
		const tinyPositiveGain = 0.000_001;
		const betterMemberBrier = Math.min(
			specialist.metrics.brierScores.clinician,
			specialist.metrics.brierScores.model
		);
		const ensembleBrier = betterMemberBrier - tinyPositiveGain;
		const interpretation = interpretEvaluation({
			...specialist.metrics,
			brierScores: { ...specialist.metrics.brierScores, ensemble: ensembleBrier },
			ensembleGain: tinyPositiveGain,
			diversityTerm: specialist.metrics.weightedAverageLoss - ensembleBrier,
			weightedAverageIdentityResidual: 0
		});
		const prose = [interpretation.headline, interpretation.summary, ...interpretation.details].join(
			' '
		);
		expect(prose).toMatch(/numerically positive .* but negligible on this synthetic cohort/i);
		expect(prose).not.toMatch(/not better than the best member/i);
	});

	it('reserves the not-better-than-best wording for a non-positive gain', () => {
		const betterMemberBrier = Math.min(
			specialist.metrics.brierScores.clinician,
			specialist.metrics.brierScores.model
		);
		const interpretation = interpretEvaluation({
			...specialist.metrics,
			brierScores: { ...specialist.metrics.brierScores, ensemble: betterMemberBrier },
			ensembleGain: 0,
			diversityTerm: specialist.metrics.weightedAverageLoss - betterMemberBrier,
			weightedAverageIdentityResidual: 0
		});
		expect(interpretation.details.join(' ')).toMatch(/not better than the best member/i);
	});

	it('derives interpretation solely from metrics rather than preset names', () => {
		expect(interpretEvaluation(specialist.metrics)).toEqual(specialist.interpretation);
		expect(interpretEvaluation(shifted.metrics)).toEqual(shifted.interpretation);
	});

	it('does not turn latent dependence alone into a claim about overlapping realized losses', () => {
		const interpretation = interpretEvaluation({
			...sharedArtifact.metrics,
			correlations: { latentResiduals: 0.92, casewiseSquaredLosses: 0.1 }
		});
		const prose = interpretation.details.join(' ');
		expect(prose).not.toMatch(/perform badly on many of the same synthetic cases/i);
		expect(prose).toMatch(/hidden-score dependence is not interchangeable/i);
	});

	it('does not turn squared-loss correlation alone into a joint high-loss count', () => {
		const interpretation = interpretEvaluation({
			...sharedArtifact.metrics,
			correlations: { latentResiduals: 0.92, casewiseSquaredLosses: 0.92 }
		});
		const prose = interpretation.details.join(' ');
		expect(prose).toMatch(/casewise squared losses move together strongly/i);
		expect(prose).toMatch(/does not show how many cases both forecasts handled badly/i);
		expect(prose).not.toMatch(/perform badly on many of the same synthetic cases/i);
	});

	it('builds a complete UI projection while limiting only display marks to 600', () => {
		expect(specialist.cases).toHaveLength(DEFAULT_ICU_LAB_COHORT_SIZE);
		expect(specialist.scatterSample).toHaveLength(600);
		expect(
			specialist.scatterSample.some((entry) => entry.index === specialist.selectedCaseIndex)
		).toBe(true);
		expect(specialist.calibration.clinician).toHaveLength(10);
		expect(specialist.weightCurve.points).toHaveLength(101);
		expect(specialist.metrics.cohortSize).toBe(DEFAULT_ICU_LAB_COHORT_SIZE);
	});
});
