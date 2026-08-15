import type { CohortMetrics, EvaluationInterpretation } from './types';

const MATERIAL_BRIER_DIFFERENCE = 5e-5;
const MATERIAL_CALIBRATION_GAP = 0.04;

function signedCalibrationGap(meanPrediction: number, observedEventRate: number): number {
	return meanPrediction - observedEventRate;
}

function sameMaterialDirection(first: number, second: number, threshold: number): boolean {
	return (
		Math.abs(first) >= threshold &&
		Math.abs(second) >= threshold &&
		Math.sign(first) === Math.sign(second)
	);
}

function forecastDirection(gap: number): string {
	return gap > 0 ? 'above' : 'below';
}

export function interpretEvaluation(metrics: CohortMetrics): EvaluationInterpretation {
	const clinicianBrier = metrics.brierScores.clinician;
	const modelBrier = metrics.brierScores.model;
	const gain = metrics.ensembleGain;
	const clinicianIsBetter = clinicianBrier < modelBrier;
	const bestMember = clinicianIsBetter ? 'clinician' : 'model';
	const details: string[] = [];
	let headline: string;
	let summary: string;

	if (gain > MATERIAL_BRIER_DIFFERENCE) {
		headline = 'The pool beats both individual forecasts on this synthetic cohort.';
		summary =
			'The two probability streams contribute useful differences at the current weight, so their convex average has the lowest Brier score of the three.';
		details.push(
			`The ensemble improves on the better member by ${gain.toFixed(4)} Brier-score units in this generated cohort.`
		);
	} else if (gain >= -MATERIAL_BRIER_DIFFERENCE) {
		headline = 'Averaging adds little at this setting.';
		summary =
			'The ensemble and the better individual forecast have nearly the same Brier score, leaving little additional error for this weight to repair.';
	} else if (bestMember === 'model') {
		headline = 'The model leads; the current clinician weight gives some of that advantage back.';
		summary =
			'The average remains a valid convex pool, but its Brier score is worse than the model alone because the clinician forecast receives too much weight for these generated cases.';
	} else {
		headline =
			'The clinician forecast leads; the current model weight gives some of that advantage back.';
		summary =
			'The average remains a valid convex pool, but its Brier score is worse than the clinician forecast alone because the model receives too much weight for these generated cases.';
	}

	if (metrics.diversityTerm > 1e-12) {
		if (gain <= 0) {
			details.push(
				'The pool is better than the weighted average of the two member losses, as the diversity identity guarantees, but it is not better than the best member.'
			);
		} else if (gain <= MATERIAL_BRIER_DIFFERENCE) {
			details.push(
				`The gain over the better member is numerically positive (${gain.toFixed(6)} Brier-score units) but negligible on this synthetic cohort.`
			);
		} else {
			details.push(
				`Forecast differences reduce the pool below the weighted-average member loss by ${metrics.diversityTerm.toFixed(4)} Brier-score units.`
			);
		}
	}

	const lossCorrelation = metrics.correlations.casewiseSquaredLosses;
	if (lossCorrelation !== null && lossCorrelation >= 0.7) {
		details.push(
			'The realized casewise squared losses move together strongly across this cohort, leaving less differently structured loss for averaging to exploit. This correlation alone does not show how many cases both forecasts handled badly.'
		);
	} else if (
		metrics.correlations.latentResiduals !== null &&
		Math.abs(metrics.correlations.latentResiduals) >= 0.8
	) {
		details.push(
			'The generated latent residuals move closely together, although that hidden-score dependence is not interchangeable with realized casewise loss overlap.'
		);
	}

	const clinicianGap = signedCalibrationGap(
		metrics.meanPredictions.clinician,
		metrics.observedEventRate
	);
	const modelGap = signedCalibrationGap(metrics.meanPredictions.model, metrics.observedEventRate);
	const ensembleGap = signedCalibrationGap(
		metrics.meanPredictions.ensemble,
		metrics.observedEventRate
	);
	const strongestAuc = Math.max(
		metrics.realizedAuc.clinician ?? Number.NEGATIVE_INFINITY,
		metrics.realizedAuc.model ?? Number.NEGATIVE_INFINITY
	);

	if (strongestAuc >= 0.7 && Math.abs(ensembleGap) >= MATERIAL_CALIBRATION_GAP) {
		details.push(
			`At least one forecast still ranks generated cases reasonably, but the ensemble mean remains ${forecastDirection(ensembleGap)} the observed synthetic event rate.`
		);
	}
	if (sameMaterialDirection(clinicianGap, modelGap, 0.03) && Math.abs(ensembleGap) >= 0.03) {
		details.push(
			'Shared miscalibration survives the average: both member means miss the generated event rate in the same direction, so pooling does not cancel that bias.'
		);
	}

	if (details.length === 0) {
		details.push(
			'Brier score summarizes probabilistic error in this synthetic cohort; it does not establish treatment utility or clinical usefulness.'
		);
	}

	return { headline, summary, details };
}
