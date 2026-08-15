import { calibratedProbabilityFromBaseLogOdds } from './calibration';
import { ICU_LAB_ENDPOINT_ID } from './endpoint';
import { aucToClassSeparation, boxMullerPair, logistic, logit } from './normal';
import { NamedSeedPrng } from './prng';
import type {
	BaseCaseDraw,
	BinaryOutcome,
	ForecasterConfig,
	IcuLabConfig,
	LatentForecasterValues,
	SimulatedSyntheticCase,
	SyntheticCohort
} from './types';

function validateRate(rate: number, name: string): void {
	if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) {
		throw new RangeError(`${name} must be finite and lie strictly inside (0, 1).`);
	}
}

function validateForecaster(config: ForecasterConfig, name: string): void {
	if (!Number.isFinite(config.targetAuc) || config.targetAuc < 0.5 || config.targetAuc >= 1) {
		throw new RangeError(`${name} target AUC must be finite and lie in [0.5, 1).`);
	}
	if (!Number.isFinite(config.calibrationIntercept)) {
		throw new RangeError(`${name} calibration intercept must be finite.`);
	}
	if (!Number.isFinite(config.calibrationSlope) || config.calibrationSlope <= 0) {
		throw new RangeError(`${name} calibration slope must be finite and greater than zero.`);
	}
}

export function clampResidualCorrelation(correlation: number): number {
	if (!Number.isFinite(correlation)) {
		throw new RangeError('Shared residual correlation must be finite.');
	}
	return Math.max(-1, Math.min(1, correlation));
}

export function normalizeIcuLabConfig(config: IcuLabConfig): IcuLabConfig {
	if (config.endpointId !== ICU_LAB_ENDPOINT_ID) {
		throw new RangeError(`Unsupported endpoint: ${config.endpointId}`);
	}
	if (config.seed.trim().length === 0) {
		throw new RangeError('Synthetic-cohort seed must not be empty.');
	}
	if (!Number.isSafeInteger(config.cohortSize) || config.cohortSize <= 0) {
		throw new RangeError('Synthetic cohort size must be a positive safe integer.');
	}
	validateRate(config.developmentEventRate, 'Development event rate');
	validateRate(config.deploymentEventRate, 'Deployment event rate');
	validateForecaster(config.clinician, 'Clinician');
	validateForecaster(config.model, 'Model');
	if (
		!Number.isFinite(config.clinicianWeight) ||
		config.clinicianWeight < 0 ||
		config.clinicianWeight > 1
	) {
		throw new RangeError('Clinician ensemble weight must be finite and lie in [0, 1].');
	}

	return {
		...config,
		clinician: { ...config.clinician },
		model: { ...config.model },
		sharedResidualCorrelation: clampResidualCorrelation(config.sharedResidualCorrelation)
	};
}

export function generateBaseDraws(seed: string, cohortSize: number): readonly BaseCaseDraw[] {
	if (!Number.isSafeInteger(cohortSize) || cohortSize <= 0) {
		throw new RangeError('Synthetic cohort size must be a positive safe integer.');
	}
	const random = new NamedSeedPrng(seed);
	const draws: BaseCaseDraw[] = [];
	for (let index = 0; index < cohortSize; index += 1) {
		const outcomeUniform = random.nextOpenUnit();
		const gaussianUniforms = [random.nextOpenUnit(), random.nextOpenUnit()] as const;
		const [clinicianGaussian, modelGaussian] = boxMullerPair(...gaussianUniforms);
		draws.push({
			index,
			outcomeUniform,
			gaussianUniforms,
			clinicianGaussian,
			modelGaussian
		});
	}
	return draws;
}

function validateRetainedDraws(draws: readonly BaseCaseDraw[], cohortSize: number): void {
	if (draws.length !== cohortSize) {
		throw new RangeError(
			`Retained base-draw count (${draws.length}) does not match cohort size (${cohortSize}).`
		);
	}
	for (let index = 0; index < draws.length; index += 1) {
		const draw = draws[index];
		if (
			draw.index !== index ||
			!Number.isFinite(draw.outcomeUniform) ||
			draw.outcomeUniform <= 0 ||
			draw.outcomeUniform >= 1 ||
			!Number.isFinite(draw.clinicianGaussian) ||
			!Number.isFinite(draw.modelGaussian)
		) {
			throw new RangeError(`Retained base draw ${index} is invalid.`);
		}
	}
}

export function formatSyntheticCaseId(index: number): string {
	if (!Number.isSafeInteger(index) || index < 0) {
		throw new RangeError('Synthetic case index must be a non-negative safe integer.');
	}
	return `S-${String(index + 1).padStart(4, '0')}`;
}

function latentForecasterValues(
	outcome: BinaryOutcome,
	independentGaussian: number,
	residual: number,
	classSeparation: number,
	developmentLogOdds: number
): LatentForecasterValues {
	const score = ((2 * outcome - 1) * classSeparation) / 2 + residual;
	const baseLogOdds = developmentLogOdds + classSeparation * score;
	return {
		classSeparation,
		independentGaussian,
		residual,
		score,
		baseLogOdds,
		baseProbability: logistic(baseLogOdds)
	};
}

export function simulateIcuCohort(
	inputConfig: IcuLabConfig,
	retainedBaseDraws?: readonly BaseCaseDraw[]
): SyntheticCohort {
	const config = normalizeIcuLabConfig(inputConfig);
	const baseDraws = retainedBaseDraws ?? generateBaseDraws(config.seed, config.cohortSize);
	validateRetainedDraws(baseDraws, config.cohortSize);

	const clinicianSeparation = aucToClassSeparation(config.clinician.targetAuc);
	const modelSeparation = aucToClassSeparation(config.model.targetAuc);
	const developmentLogOdds = logit(config.developmentEventRate);
	const correlation = config.sharedResidualCorrelation;
	const independentModelScale = Math.sqrt(Math.max(0, 1 - correlation * correlation));

	const cases = baseDraws.map((baseDraw): SimulatedSyntheticCase => {
		const outcome: BinaryOutcome = baseDraw.outcomeUniform < config.deploymentEventRate ? 1 : 0;
		const clinicianResidual = baseDraw.clinicianGaussian;
		const modelResidual =
			correlation * baseDraw.clinicianGaussian + independentModelScale * baseDraw.modelGaussian;
		const clinicianLatent = latentForecasterValues(
			outcome,
			baseDraw.clinicianGaussian,
			clinicianResidual,
			clinicianSeparation,
			developmentLogOdds
		);
		const modelLatent = latentForecasterValues(
			outcome,
			baseDraw.modelGaussian,
			modelResidual,
			modelSeparation,
			developmentLogOdds
		);
		const clinicianProbability = calibratedProbabilityFromBaseLogOdds(
			clinicianLatent.baseLogOdds,
			config.clinician.calibrationIntercept,
			config.clinician.calibrationSlope
		);
		const modelProbability = calibratedProbabilityFromBaseLogOdds(
			modelLatent.baseLogOdds,
			config.model.calibrationIntercept,
			config.model.calibrationSlope
		);
		const ensembleProbability =
			config.clinicianWeight * clinicianProbability +
			(1 - config.clinicianWeight) * modelProbability;

		return {
			index: baseDraw.index,
			id: formatSyntheticCaseId(baseDraw.index),
			outcome,
			baseDraw,
			latent: { clinician: clinicianLatent, model: modelLatent },
			probabilities: {
				clinician: clinicianProbability,
				model: modelProbability,
				ensemble: ensembleProbability
			}
		};
	});

	return { config, baseDraws, cases };
}
