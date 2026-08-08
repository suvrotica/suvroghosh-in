export type BinaryState = 0 | 1;

export interface ModelParameters {
	duration: number;
	timestep: number;
	sampleInterval: number;
	egfAmplitude: number;
	egfStart: number;
	egfDuration: number;
	receptorBlockade: number;
	receptorActivationRate: number;
	receptorDeactivationRate: number;
	downstreamActivationRate: number;
	downstreamDeactivationRate: number;
	nuclearActivationRate: number;
	nuclearDeactivationRate: number;
	bindingAffinity: number;
	bindingHillCoefficient: number;
	bindingHalfSaturation: number;
	occupancyRelaxationTime: number;
	geometryBias: number;
	geometryLogitBaseline: number;
	geometryLogitGain: number;
	contactSwitchingRate: number;
	licensingActivationRate: number;
	licensingDeactivationRate: number;
	licensingHillCoefficient: number;
	licensingHalfSaturation: number;
	basalPromoterActivationRate: number;
	occupancyPromoterActivationRate: number;
	contactPromoterActivationRate: number;
	promoterDeactivationRate: number;
	transcriptionInitiationRate: number;
	rnaDegradationRate: number;
}

export type ModelParameterKey = keyof ModelParameters;

export interface ParameterDefinition {
	default: number;
	minimum: number;
	maximum: number;
	unit: 'normalized' | 'model min' | 'model min^-1' | 'dimensionless';
	description: string;
}

export interface InitialModelState {
	receptorActivity: number;
	downstreamActivity: number;
	nuclearActivity: number;
	occupancy: number;
	licensing: number;
	contactState?: BinaryState;
	promoterState: BinaryState;
	rnaCount: number;
}

export interface ModelTimeline {
	time: Float64Array;
	signalInput: Float64Array;
	receptorActivity: Float64Array;
	downstreamActivity: Float64Array;
	nuclearActivity: Float64Array;
	occupancy: Float64Array;
	licensing: Float64Array;
	contactPropensity: Float64Array;
	contactState: Uint8Array;
	promoterState: Uint8Array;
	rnaCount: Uint32Array;
}

export interface RunSummary {
	seed: number;
	hadBurst: boolean;
	burstCount: number;
	completedBurstCount: number;
	censoredBurstCount: number;
	initiationCount: number;
	firstBurstTime: number | null;
	firstInitiationTime: number | null;
	promoterOnTime: number;
	nearTime: number;
	nearFraction: number;
	closeEncounterCount: number;
	meanCompletedBurstDuration: number | null;
	meanInitiationsPerBurst: number | null;
	receptorActivityIntegral: number;
	downstreamActivityIntegral: number;
	nuclearActivityIntegral: number;
	occupancyIntegral: number;
}

export interface SimulationResult {
	modelVersion: string;
	seed: number;
	parameters: Readonly<ModelParameters>;
	timeline: ModelTimeline;
	contactTransitionTimes: Float64Array;
	burstStartTimes: Float64Array;
	burstEndTimes: Float64Array;
	completedBurstDurations: Float64Array;
	initiationTimes: Float64Array;
	summary: RunSummary;
}

export interface SimulationOptions {
	seed: number;
	parameters?: Readonly<ModelParameters> | Partial<ModelParameters>;
	initialState?: Partial<InitialModelState>;
}

export interface EnsembleSummary {
	runCount: number;
	burstingRunCount: number;
	silentRunCount: number;
	burstFraction: number;
	meanBurstCount: number;
	meanInitiationCount: number;
	meanNearFraction: number;
	medianFirstBurstTimeAmongBursting: number | null;
	restrictedMeanTimeToFirstBurst: number;
	meanCompletedBurstDuration: number | null;
	meanInitiationsPerPromoterOnMinute: number | null;
}

export interface EnsembleResult {
	modelVersion: string;
	parameters: Readonly<ModelParameters>;
	rootSeed: number;
	seeds: Uint32Array;
	runs: readonly SimulationResult[];
	burstCounts: Uint16Array;
	initiationCounts: Uint32Array;
	firstBurstTimes: Float64Array;
	firstBurstCensored: Uint8Array;
	nearFractions: Float64Array;
	summary: EnsembleSummary;
}

export interface EnsembleOptions {
	rootSeed: number;
	parameters?: Readonly<ModelParameters> | Partial<ModelParameters>;
	count?: number;
	seeds?: ArrayLike<number>;
}

export interface MatchedEnsembleResult {
	seeds: Uint32Array;
	baseline: EnsembleResult;
	intervention: EnsembleResult;
}

export type ScenarioId = 'baseline' | 'blocked' | 'mutated' | 'contact';
export type InterventionId =
	| 'release-signal'
	| 'lengthen-signal'
	| 'block-receptor'
	| 'weaken-binding-site'
	| 'raise-contact-propensity'
	| 'lower-contact-propensity';
