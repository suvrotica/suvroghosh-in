export type BinaryOutcome = 0 | 1;

export type IcuEndpointId = 'synthetic-aki-within-48-hours';

export interface IcuEndpointDefinition {
	readonly id: IcuEndpointId;
	readonly title: string;
	readonly shortLabel: string;
	readonly horizonHours: 48;
	readonly positiveOutcomeLabel: string;
	readonly negativeOutcomeLabel: string;
	readonly synthetic: true;
	readonly disclaimer: string;
}

export interface ForecasterConfig {
	readonly targetAuc: number;
	readonly calibrationIntercept: number;
	readonly calibrationSlope: number;
}

export interface IcuLabConfig {
	readonly endpointId: IcuEndpointId;
	readonly seed: string;
	readonly cohortSize: number;
	readonly developmentEventRate: number;
	readonly deploymentEventRate: number;
	readonly clinician: ForecasterConfig;
	readonly model: ForecasterConfig;
	readonly sharedResidualCorrelation: number;
	readonly clinicianWeight: number;
}

export type IcuPresetId =
	| 'specialist-missing-structured-data'
	| 'trainee-strong-model'
	| 'shared-hospital-artifact'
	| 'deployment-population-shift';

export interface IcuLabPreset {
	readonly id: IcuPresetId;
	readonly title: string;
	readonly explanation: string;
	readonly config: IcuLabConfig;
}

export interface BaseCaseDraw {
	readonly index: number;
	readonly outcomeUniform: number;
	readonly gaussianUniforms: readonly [number, number];
	readonly clinicianGaussian: number;
	readonly modelGaussian: number;
}

export interface LatentForecasterValues {
	readonly classSeparation: number;
	readonly independentGaussian: number;
	readonly residual: number;
	readonly score: number;
	readonly baseLogOdds: number;
	readonly baseProbability: number;
}

export interface LatentCaseValues {
	readonly clinician: LatentForecasterValues;
	readonly model: LatentForecasterValues;
}

export interface ForecastValues {
	readonly clinician: number;
	readonly model: number;
	readonly ensemble: number;
}

export interface NullableForecastValues {
	readonly clinician: number | null;
	readonly model: number | null;
	readonly ensemble: number | null;
}

export interface SimulatedSyntheticCase {
	readonly index: number;
	readonly id: string;
	readonly outcome: BinaryOutcome;
	readonly baseDraw: BaseCaseDraw;
	readonly latent: LatentCaseValues;
	readonly probabilities: ForecastValues;
}

export interface EvaluatedSyntheticCase extends SimulatedSyntheticCase {
	readonly squaredLosses: ForecastValues;
}

export interface SyntheticCohort {
	readonly config: IcuLabConfig;
	readonly baseDraws: readonly BaseCaseDraw[];
	readonly cases: readonly SimulatedSyntheticCase[];
}

export interface BrierScores extends ForecastValues {
	readonly constantPrevalence: number;
}

export interface MetricCorrelations {
	readonly latentResiduals: number | null;
	readonly casewiseSquaredLosses: number | null;
}

export interface CohortMetrics {
	readonly cohortSize: number;
	readonly eventCount: number;
	readonly observedEventRate: number;
	readonly clinicianWeight: number;
	readonly configuredResidualCorrelation: number;
	readonly brierScores: BrierScores;
	readonly meanPredictions: ForecastValues;
	readonly realizedAuc: NullableForecastValues;
	readonly ensembleGain: number;
	readonly crossErrorTerm: number;
	readonly weightedAverageLoss: number;
	readonly diversityTerm: number;
	readonly crossTermIdentityResidual: number;
	readonly weightedAverageIdentityResidual: number;
	readonly correlations: MetricCorrelations;
}

export interface CohortEvaluation {
	readonly cases: readonly EvaluatedSyntheticCase[];
	readonly metrics: CohortMetrics;
}

export interface WilsonInterval {
	readonly lower: number;
	readonly upper: number;
}

export interface ReliabilityBin {
	readonly index: number;
	readonly count: number;
	readonly eventCount: number;
	readonly meanPrediction: number;
	readonly eventRate: number;
	readonly wilson95: WilsonInterval;
	readonly minPrediction: number;
	readonly maxPrediction: number;
}

export interface CalibrationCurves {
	readonly clinician: readonly ReliabilityBin[];
	readonly model: readonly ReliabilityBin[];
	readonly ensemble: readonly ReliabilityBin[];
}

export interface WeightCurvePoint {
	readonly clinicianWeight: number;
	readonly brierScore: number;
}

export interface WeightCurve {
	readonly points: readonly WeightCurvePoint[];
	readonly hindsightOptimalWeight: number | null;
	readonly hindsightMinimumBrier: number | null;
	readonly identifiable: boolean;
}

export interface CalibrationStatus {
	readonly calibrated: boolean;
	readonly level: 'systematically-high' | 'systematically-low' | 'level-ok';
	readonly spread: 'too-extreme' | 'too-timid' | 'spread-ok';
	readonly labels: readonly string[];
}

export interface EvaluationInterpretation {
	readonly headline: string;
	readonly summary: string;
	readonly details: readonly string[];
}

export interface DisplaySampleOptions {
	readonly maximum?: number;
	readonly seed?: string;
	readonly includeCaseIndex?: number | null;
}

export interface IcuLabRun {
	readonly endpoint: IcuEndpointDefinition;
	readonly config: IcuLabConfig;
	readonly baseDraws: readonly BaseCaseDraw[];
	readonly cases: readonly EvaluatedSyntheticCase[];
	readonly metrics: CohortMetrics;
	readonly calibration: CalibrationCurves;
	readonly weightCurve: WeightCurve;
	readonly selectedCaseIndex: number;
	readonly scatterSample: readonly EvaluatedSyntheticCase[];
	readonly interpretation: EvaluationInterpretation;
}
