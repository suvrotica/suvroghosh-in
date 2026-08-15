import { ICU_LAB_ENDPOINT_ID } from './endpoint';
import type { IcuLabConfig, IcuLabPreset, IcuPresetId } from './types';

export const DEFAULT_ICU_LAB_SEED = 'icu-lab-v1';
export const DEFAULT_ICU_LAB_COHORT_SIZE = 3_000;

const baseConfig = {
	endpointId: ICU_LAB_ENDPOINT_ID,
	seed: DEFAULT_ICU_LAB_SEED,
	cohortSize: DEFAULT_ICU_LAB_COHORT_SIZE,
	developmentEventRate: 0.2,
	deploymentEventRate: 0.2,
	clinician: {
		targetAuc: 0.82,
		calibrationIntercept: 0,
		calibrationSlope: 1
	},
	model: {
		targetAuc: 0.75,
		calibrationIntercept: 0,
		calibrationSlope: 1
	},
	sharedResidualCorrelation: 0.05,
	clinicianWeight: 0.7
} as const satisfies IcuLabConfig;

export const ICU_LAB_PRESETS = [
	{
		id: 'specialist-missing-structured-data',
		title: 'Specialist with missing structured data',
		explanation:
			'Missing structured data is represented only by reduced model discrimination. This does not simulate MAR, MNAR, extraction failure, measurement delay, or an actual missing-data process. None of the numerical values are estimates of real clinicians, models, hospitals, or AKI incidence.',
		config: baseConfig
	},
	{
		id: 'trainee-strong-model',
		title: 'Trainee plus strong model',
		explanation:
			'The numerical values are illustrative settings for synthetic probability-generating processes. None of the numerical values are estimates of real clinicians, models, hospitals, or AKI incidence.',
		config: {
			...baseConfig,
			clinician: { ...baseConfig.clinician, targetAuc: 0.7 },
			model: { ...baseConfig.model, targetAuc: 0.86 },
			sharedResidualCorrelation: 0.15,
			clinicianWeight: 0.15
		}
	},
	{
		id: 'shared-hospital-artifact',
		title: 'Both learn the same hospital artifact',
		explanation:
			'Highly correlated synthetic residuals are a proxy for shared artifact dependence. This does not causally model how an artifact was learned. None of the numerical values are estimates of real clinicians, models, hospitals, or AKI incidence.',
		config: {
			...baseConfig,
			clinician: { ...baseConfig.clinician, targetAuc: 0.83 },
			model: { ...baseConfig.model, targetAuc: 0.83 },
			sharedResidualCorrelation: 0.94,
			clinicianWeight: 0.5
		}
	},
	{
		id: 'deployment-population-shift',
		title: 'Deployment population shift',
		explanation:
			'This is specifically a prior/prevalence-shift example; population shift in real systems is much broader. The unchanged calibration settings avoid counting the prevalence shift twice. None of the numerical values are estimates of real clinicians, models, hospitals, or AKI incidence.',
		config: {
			...baseConfig,
			deploymentEventRate: 0.35,
			clinician: { ...baseConfig.clinician, targetAuc: 0.78 },
			model: { ...baseConfig.model, targetAuc: 0.84 },
			sharedResidualCorrelation: 0.65,
			clinicianWeight: 0.5
		}
	}
] as const satisfies readonly IcuLabPreset[];

export const DEFAULT_ICU_LAB_PRESET_ID: IcuPresetId = 'specialist-missing-structured-data';

export function getIcuLabPreset(id: IcuPresetId): IcuLabPreset {
	const preset = ICU_LAB_PRESETS.find((candidate) => candidate.id === id);
	if (!preset) {
		throw new RangeError(`Unknown ICU laboratory preset: ${id}`);
	}
	return preset;
}

export function cloneIcuLabConfig(config: IcuLabConfig): IcuLabConfig {
	return {
		...config,
		clinician: { ...config.clinician },
		model: { ...config.model }
	};
}

export function configForIcuLabPreset(id: IcuPresetId): IcuLabConfig {
	return cloneIcuLabConfig(getIcuLabPreset(id).config);
}
