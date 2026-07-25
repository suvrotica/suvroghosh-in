export const MODEL_IDS = [
	'mcculloch-pitts',
	'lif',
	'izhikevich',
	'fitzhugh-nagumo',
	'hodgkin-huxley'
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

export type StimulusPresetId =
	| 'quiet'
	| 'single-pulse'
	| 'sustained-step'
	| 'pulse-train'
	| 'ramp'
	| 'paired-pulse'
	| 'hyperpolarize-release'
	| 'seeded-noisy-step';

export type ExperimentPresetId = StimulusPresetId | 'custom';

export type IzhikevichPhenotypeId =
	| 'regular-spiking'
	| 'intrinsically-bursting'
	| 'chattering'
	| 'fast-spiking'
	| 'low-threshold-spiking';

export interface McCullochPittsParameters {
	bias: number;
	threshold: number;
}

export interface LifParameters {
	capacitancePf: number;
	leakConductanceNs: number;
	leakReversalMv: number;
	thresholdMv: number;
	resetMv: number;
	refractoryMs: number;
}

export interface IzhikevichParameters {
	a: number;
	b: number;
	c: number;
	d: number;
	cutoffMv: number;
}

export interface FitzHughNagumoParameters {
	a: number;
	b: number;
	epsilon: number;
	timeScaleMs: number;
	eventThreshold: number;
}

export interface HodgkinHuxleyParameters {
	capacitanceUfPerCm2: number;
	sodiumConductanceMsPerCm2: number;
	potassiumConductanceMsPerCm2: number;
	leakConductanceMsPerCm2: number;
	sodiumReversalMv: number;
	potassiumReversalMv: number;
	leakReversalMv: number;
	initialVoltageMv: number;
	spikeThresholdMv: number;
}

export interface ModelParametersById {
	'mcculloch-pitts': McCullochPittsParameters;
	lif: LifParameters;
	izhikevich: IzhikevichParameters;
	'fitzhugh-nagumo': FitzHughNagumoParameters;
	'hodgkin-huxley': HodgkinHuxleyParameters;
}

export type ModelInputGains = Record<ModelId, number>;

export interface SimulationConfig {
	dtMs: number;
	durationMs: number;
	seed: number;
	stimulus: Float64Array;
	gains: ModelInputGains;
	modelParameters?: Partial<ModelParametersById>;
	displaySampleIntervalMs?: number;
}

export interface StepContext {
	tMs: number;
	dtMs: number;
	command: number;
	nativeInput: number;
	stepIndex: number;
}

export type SpikeEventKind =
	| 'binary-rise'
	| 'threshold-reset'
	| 'phase-crossing'
	| 'voltage-crossing';

export interface SpikeEvent {
	modelId: ModelId;
	timeMs: number;
	stepIndex: number;
	kind: SpikeEventKind;
}

export interface ModelCapabilities {
	physicalVoltage: boolean;
	continuousState: boolean;
	explicitLeak: boolean;
	explicitReset: boolean;
	explicitRefractory: boolean;
	recoveryVariable: boolean;
	ionGates: boolean;
	ionicCurrents: boolean;
	biologicalEnergyEstimate: boolean;
}

export interface ModelDisplayMetadata {
	name: string;
	abbreviation: string;
	year: string;
	modelClass: string;
	stateVariables: readonly string[];
	inputUnits: string;
	primaryOutput: string;
	primaryUnits: string;
	keeps: string;
	throwsAway: string;
	equationPlainText: readonly string[];
}

export interface ModelDefinition<Parameters> {
	id: ModelId;
	defaultParameters: Readonly<Parameters>;
	capabilities: Readonly<ModelCapabilities>;
	display: Readonly<ModelDisplayMetadata>;
	stateVariableCount: number;
	derivativeEvaluationsPerStep: number;
	validateParameters(parameters: Parameters): string[];
}

export interface McCullochPittsState {
	modelId: 'mcculloch-pitts';
	output: 0 | 1;
}

export interface LifState {
	modelId: 'lif';
	voltageMv: number;
	refractoryRemainingMs: number;
}

export interface IzhikevichState {
	modelId: 'izhikevich';
	voltageMv: number;
	recovery: number;
}

export interface FitzHughNagumoState {
	modelId: 'fitzhugh-nagumo';
	fast: number;
	recovery: number;
}

export interface HodgkinHuxleyState {
	modelId: 'hodgkin-huxley';
	voltageMv: number;
	m: number;
	h: number;
	n: number;
}

export type ModelState =
	| McCullochPittsState
	| LifState
	| IzhikevichState
	| FitzHughNagumoState
	| HodgkinHuxleyState;

export interface ModelMetrics {
	modelId: ModelId;
	steps: number;
	commandHash: string;
	spikeCount: number;
	firstSpikeTimeMs: number | null;
	lastSpikeTimeMs: number | null;
	minimumPrimary: number;
	maximumPrimary: number;
	initialPrimary: number;
	finalPrimary: number;
	restingDrift: number;
	gateExtrema?: {
		m: readonly [number, number];
		h: readonly [number, number];
		n: readonly [number, number];
	};
}

export interface ModelTrace {
	modelId: ModelId;
	nativeInput: Float64Array;
	channels: Record<string, Float64Array>;
	events: SpikeEvent[];
	metrics: ModelMetrics;
	hash: string;
}

export interface HodgkinHuxleyEnergyEstimate {
	available: true;
	rawInwardSodiumChargeNcPerCm2: number;
	baselineInwardSodiumChargeNcPerCm2: number;
	excessInwardSodiumChargeNcPerCm2: number;
	atpEquivalentMolesPerCm2: number;
	atpEquivalentMoleculesPerCm2: number;
	assumedDeltaGAtpKjPerMol: number;
	chemicalWorkJoulesPerCm2: number;
	caveat: string;
}

export interface UnavailableBiologicalEnergy {
	available: false;
	reason: string;
}

export type BiologicalEnergyEstimate = HodgkinHuxleyEnergyEstimate | UnavailableBiologicalEnergy;

export interface SimulationResult {
	dtMs: number;
	durationMs: number;
	stepCount: number;
	displaySampleIntervalMs: number;
	timeMs: Float64Array;
	displayCommand: Float64Array;
	commandHash: string;
	traces: Record<ModelId, ModelTrace>;
	energy: Record<ModelId, BiologicalEnergyEstimate>;
}

export interface StimulusGenerationOptions {
	durationMs?: number;
	dtMs?: number;
	seed?: number;
	isiMs?: number;
}

export interface SerializedExperimentStateV1 {
	version: 1;
	preset: ExperimentPresetId;
	presetParameters: {
		isiMs?: number;
	};
	seed: number;
	durationMs: number;
	dtMs: number;
	gains: ModelInputGains;
	phenotypes: {
		izhikevich: IzhikevichPhenotypeId;
	};
	modelParameters?: Partial<ModelParametersById>;
	customWaveform?: number[];
	customWaveformHash?: string;
}
