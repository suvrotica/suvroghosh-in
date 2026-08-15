import { buildCalibrationCurves } from './calibration';
import { SYNTHETIC_AKI_ENDPOINT } from './endpoint';
import { interpretEvaluation } from './interpretation';
import {
	buildWeightCurve,
	evaluateCohort,
	sampleCasesForDisplay,
	selectModerateDisagreementCase
} from './metrics';
import { simulateIcuCohort } from './simulation';
import type { BaseCaseDraw, IcuLabConfig, IcuLabRun } from './types';

/** Produces every pure-data projection needed by the Svelte laboratory from one retained cohort. */
export function runIcuLab(
	config: IcuLabConfig,
	retainedBaseDraws?: readonly BaseCaseDraw[]
): IcuLabRun {
	const cohort = simulateIcuCohort(config, retainedBaseDraws);
	const evaluation = evaluateCohort(cohort);
	const selectedCaseIndex = selectModerateDisagreementCase(evaluation.cases) ?? 0;
	return {
		endpoint: SYNTHETIC_AKI_ENDPOINT,
		config: cohort.config,
		baseDraws: cohort.baseDraws,
		cases: evaluation.cases,
		metrics: evaluation.metrics,
		calibration: buildCalibrationCurves(evaluation.cases),
		weightCurve: buildWeightCurve(evaluation.cases),
		selectedCaseIndex,
		scatterSample: sampleCasesForDisplay(evaluation.cases, {
			maximum: 600,
			seed: `${cohort.config.seed}:loss-scatter-v1`,
			includeCaseIndex: selectedCaseIndex
		}),
		interpretation: interpretEvaluation(evaluation.metrics)
	};
}
