import type {
	ORCHESTRA_INTEGRATOR_VERSION,
	ORCHESTRA_MAPPING_VERSION,
	ORCHESTRA_MODEL_VERSION
} from './versions';

export type AttractorId =
	| 'lorenz-63'
	| 'rossler'
	| 'thomas'
	| 'sprott-b'
	| 'langford'
	| 'rucklidge'
	| 'chua'
	| 'henon'
	| 'mackey-glass'
	| 'rabinovich-fabrikant';

export type AttractorFamily = 'continuous' | 'discrete-map' | 'delay-system';
export type IntegratorKind = 'rk4' | 'direct-map' | 'delay-rk4';
export type NoiseFamily = 'smooth' | 'curl' | 'cellular' | 'ridged';
export type NoiseLens = 'dye' | 'warp' | 'wake';
export type SoundWorldId = 'glass' | 'magnetic' | 'swarm' | 'radio';
export type TimingMode = 'raw' | 'composed';
export type Vector3 = readonly [number, number, number];

export interface RobustBounds {
	readonly lower: Vector3;
	readonly upper: Vector3;
}

export interface ProjectionDefinition {
	readonly kind: 'coordinates' | 'delay-embedding';
	readonly labels: readonly [string, string, string];
	readonly axes?: readonly [number, number, number];
	readonly delays?: readonly [number, number, number];
}

export interface PoincareDefinition {
	readonly kind: 'plane' | 'extremum';
	readonly axis: 0 | 1 | 2;
	readonly value?: number;
	readonly direction: -1 | 0 | 1;
	readonly hysteresis: number;
}

export type RegionClassifier =
	| {
			readonly kind: 'axis-sign';
			readonly axis: 0 | 1 | 2;
			readonly boundary: number;
			readonly labels: readonly [string, string];
	  }
	| {
			readonly kind: 'angular';
			readonly axes: readonly [0 | 1 | 2, 0 | 1 | 2];
			readonly sectors: number;
			readonly labels: readonly string[];
	  }
	| {
			readonly kind: 'quantile';
			readonly axis: 0 | 1 | 2;
			readonly bins: number;
			readonly labels: readonly string[];
	  };

export interface DivergenceCheck {
	readonly kind: 'constant' | 'state-dependent';
	readonly expected?: number;
	readonly expression: string;
}

export interface AttractorSource {
	readonly title: string;
	readonly authors: string;
	readonly year: number;
	readonly doiOrUrl: string;
}

export interface AttractorDefinition {
	readonly id: AttractorId;
	readonly name: string;
	readonly family: AttractorFamily;
	readonly dimension: number;
	readonly equationLatex: string;
	readonly parameters: Readonly<Record<string, number>>;
	readonly initialState: readonly number[];
	readonly integrator: IntegratorKind;
	readonly stepSize?: number;
	/** Fixed integration/map steps between stored observations. */
	readonly sampleStride?: number;
	readonly burnInSteps: number;
	readonly calibrationSteps: number;
	readonly pointCount: number;
	readonly escapeRadius: number;
	readonly maxDerivative: number;
	readonly robustBounds: RobustBounds;
	readonly projection: ProjectionDefinition;
	readonly poincareSection?: PoincareDefinition;
	readonly regionClassifier: RegionClassifier;
	readonly divergenceCheck?: DivergenceCheck;
	readonly warnings?: readonly string[];
	readonly source: AttractorSource;
}

export interface FrozenNormalization {
	readonly median: Vector3;
	readonly mad: Vector3;
	readonly scale: Vector3;
	readonly lowerQuantile: Vector3;
	readonly upperQuantile: Vector3;
	readonly frozenAtStep: number;
}

export interface TrajectoryData {
	readonly modelVersion: typeof ORCHESTRA_MODEL_VERSION;
	readonly integratorVersion: typeof ORCHESTRA_INTEGRATOR_VERSION;
	readonly attractorId: AttractorId;
	readonly pointCount: number;
	readonly dimensions: 3;
	readonly stepSize: number;
	readonly sampleStride: number;
	readonly burnInSteps: number;
	readonly calibrationSteps: number;
	readonly firstOutputStep: number;
	readonly simulationSteps: Uint32Array;
	readonly simulationTimes: Float64Array;
	/** Canonical observations. For Mackey–Glass these are explicitly a delay embedding. */
	readonly rawPositions: Float64Array;
	/** Frozen robust observation coordinates in approximately [-1, 1]. */
	readonly normalizedPositions: Float64Array;
	readonly normalization: FrozenNormalization;
}

export interface NoiseConfiguration {
	readonly family: NoiseFamily;
	readonly lens: NoiseLens;
	readonly influence: number;
	readonly masterSeed: string;
	readonly phaseRate?: number;
}

export interface WeatherData {
	readonly family: NoiseFamily;
	readonly lens: NoiseLens;
	readonly influence: number;
	readonly warpedPositions: Float64Array;
	readonly displacement: Float64Array;
	readonly value01: Float64Array;
	readonly gradient01: Float64Array;
	readonly curlAngle01: Float64Array;
	readonly cellBoundary01: Float64Array;
}

export interface SonificationFrame {
	readonly step: number;
	readonly simulationTime: number;
	readonly position01: [number, number, number];
	readonly warpedPosition01: [number, number, number];
	readonly speed01: number;
	readonly curvature01: number;
	readonly stretching01: number;
	readonly recurrence01: number;
	readonly density01: number;
	readonly region: number;
	readonly sectionCrossing?: {
		readonly direction: -1 | 1;
		readonly returnInterval01: number;
	};
	readonly noise: {
		readonly value01: number;
		readonly gradient01: number;
		readonly curlAngle01: number;
		readonly cellBoundary01: number;
	};
}

export interface FeatureStreamData {
	readonly pointCount: number;
	readonly simulationSteps: Uint32Array;
	readonly simulationTimes: Float64Array;
	readonly position01: Float64Array;
	readonly warpedPosition01: Float64Array;
	readonly speed01: Float64Array;
	readonly curvature01: Float64Array;
	readonly stretching01: Float64Array;
	readonly recurrence01: Float64Array;
	readonly density01: Float64Array;
	readonly region: Uint8Array;
	readonly sectionDirection: Int8Array;
	readonly returnInterval01: Float64Array;
	readonly noiseValue01: Float64Array;
	readonly noiseGradient01: Float64Array;
	readonly noiseCurlAngle01: Float64Array;
	readonly noiseCellBoundary01: Float64Array;
}

export type SonicEventType =
	| 'section-crossing'
	| 'region-transition'
	| 'recurrence'
	| 'fold'
	| 'cell-boundary';

export interface SonicEvent {
	readonly id: string;
	readonly simulationStep: number;
	readonly simulationTime: number;
	readonly time: number;
	readonly type: SonicEventType;
	readonly pitchHz?: number;
	readonly velocity01: number;
	readonly duration: number;
	readonly pan: number;
	readonly height: number;
	readonly curvature: number;
	readonly stretching: number;
	readonly recurrence: number;
	readonly density: number;
	readonly noise: number;
	readonly region: number;
	readonly sourceFeature: string;
	readonly explanation: string;
}

export interface SoundWorldPatch {
	readonly id: SoundWorldId;
	readonly name: string;
	readonly scaleSemitones: readonly number[];
	readonly baseMidi: number;
	readonly voicing: readonly number[];
	readonly excitation: 'white' | 'blue' | 'pink' | 'brown' | 'narrow-band';
	readonly resonatorPartialRatios: readonly number[];
	readonly envelope: { readonly attack: number; readonly decay: number; readonly maximum: number };
	readonly eventDensityCeiling: number;
	readonly busGains: {
		readonly tonal: number;
		readonly texture: number;
		readonly voice: number;
	};
	readonly filterHz: readonly [number, number];
	readonly effectSends: { readonly delay: number; readonly reverb: number };
	readonly mobile: { readonly maximumVoices: number; readonly eventDensityCeiling: number };
}

export interface OrchestraSnapshot {
	readonly masterSeed: string;
	readonly attractorId: AttractorId;
	readonly parameterPreset: 'canonical';
	readonly initialConditionPreset: 'canonical';
	readonly integratorVersion: typeof ORCHESTRA_INTEGRATOR_VERSION;
	readonly mappingVersion: typeof ORCHESTRA_MAPPING_VERSION;
	readonly noiseFamily: NoiseFamily;
	readonly noiseLens: NoiseLens;
	readonly noiseInfluence: number;
	readonly soundWorld: SoundWorldId;
	readonly timingMode: TimingMode;
	readonly simulationRate: number;
	readonly stableStepSize: number;
}

export interface CoreGenerationResult {
	readonly modelVersion: typeof ORCHESTRA_MODEL_VERSION;
	readonly snapshot: OrchestraSnapshot;
	readonly trajectory: TrajectoryData;
	readonly weather: WeatherData;
	readonly features: FeatureStreamData;
	readonly score: readonly SonicEvent[];
	readonly scoreHash: string;
	readonly diagnostics?: ScientificDiagnostics;
}

export interface FiniteTimeLyapunovDiagnostic {
	readonly label: 'Finite-time largest Lyapunov estimate';
	readonly status: 'available' | 'warming-up' | 'not-applicable' | 'failed';
	/** Per simulated-time unit for flows; per iteration for a direct map. */
	readonly value: number | null;
	readonly simulatedDuration: number;
	readonly renormalizations: number;
	readonly convergenceDelta: number | null;
	readonly converged: boolean;
	readonly note: string;
}

export interface StepRobustRangeComparisonDiagnostic {
	/** Fifth-percentile calibration bounds at the registered step. */
	readonly registeredLower: Vector3;
	/** Ninety-fifth-percentile calibration bounds at the registered step. */
	readonly registeredUpper: Vector3;
	/** Fifth-percentile calibration bounds at h/2. */
	readonly halfStepLower: Vector3;
	/** Ninety-fifth-percentile calibration bounds at h/2. */
	readonly halfStepUpper: Vector3;
	/** Largest lower/upper endpoint delta, divided by the registered safe span, in [0, 1]. */
	readonly endpointDelta01: Vector3;
	/** h/2 robust span divided by h robust span; values near one indicate similar ranges. */
	readonly spanRatio: Vector3;
}

export interface PoincareSectionComparisonDiagnostic {
	readonly registeredEventCount: number;
	readonly halfStepEventCount: number;
	/** Fixed common-bin total-variation distance in [0, 1]; null when samples are insufficient. */
	readonly valueTotalVariation: number | null;
	/** Common log-interval histogram distance in [0, 1]; null when returns are insufficient. */
	readonly intervalTotalVariation: number | null;
}

export interface ReturnTimeDistributionDiagnostic {
	readonly count: number;
	readonly median: number;
	readonly lowerQuantile: number;
	readonly upperQuantile: number;
	readonly interquantileRange: number;
}

export interface StepScalarComparisonDiagnostic {
	/** “available” is descriptive; FTLE remains “warming-up” until both estimates converge. */
	readonly status: 'available' | 'warming-up' | 'not-applicable' | 'failed';
	readonly registeredValue: number | null;
	readonly halfStepValue: number | null;
	/** Absolute h versus h/2 delta in the quantity's stated units. */
	readonly absoluteDelta: number | null;
}

export interface StepComparisonDiagnostic {
	readonly label: 'Fixed-step h versus h/2 statistical comparison';
	/** “available” means the core distribution statistics are finite; it is not convergence proof. */
	readonly status: 'available' | 'not-applicable' | 'failed';
	readonly registeredStep: number | null;
	readonly comparisonStep: number | null;
	readonly pointCount: number;
	readonly coordinateMeanDelta01: Vector3 | null;
	/** h/2 divided by h; values near one indicate similar coordinate spread. */
	readonly coordinateDeviationRatio: Vector3 | null;
	readonly coordinateRobustRange: StepRobustRangeComparisonDiagnostic | null;
	/** Histogram total-variation distance in [0, 1]; lower values indicate closer occupancy. */
	readonly occupancyTotalVariation: number | null;
	readonly poincareSection: PoincareSectionComparisonDiagnostic | null;
	readonly registeredReturnTimes: ReturnTimeDistributionDiagnostic | null;
	readonly halfStepReturnTimes: ReturnTimeDistributionDiagnostic | null;
	/** h/2 divided by h; null when the observation window contains too few returns. */
	readonly returnIntervalMedianRatio: number | null;
	/** h/2 divided by h for the central 80% span; null when returns are insufficient. */
	readonly returnIntervalInterquantileRangeRatio: number | null;
	readonly timeAveragedDivergenceComparison: StepScalarComparisonDiagnostic | null;
	readonly finiteTimeLyapunovComparison: StepScalarComparisonDiagnostic | null;
	readonly note: string;
}

export interface ScientificDiagnostics {
	readonly finiteTimeLyapunov: FiniteTimeLyapunovDiagnostic;
	readonly stepComparison: StepComparisonDiagnostic;
	readonly timeAveragedDivergence: number | null;
}

export type GenerationPhase =
	| 'burn-in'
	| 'calibration'
	| 'trajectory'
	| 'weather'
	| 'features'
	| 'score'
	| 'diagnostics';

export interface GenerationProgress {
	readonly phase: GenerationPhase;
	readonly completed: number;
	readonly total: number;
	readonly progress01: number;
}
