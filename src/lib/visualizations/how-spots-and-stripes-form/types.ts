export type PresetId = 'spots' | 'stripes' | 'inverse-spots';

export type DomainShapeId = 'broad-sheet' | 'narrow-strip' | 'tapered-patch';

export type ViewMode = 'activator' | 'inhibitor' | 'pigment';

export type PlaybackSpeed = 1 | 2 | 4;

export type RunStatus = 'preview' | 'running' | 'paused' | 'finished' | 'error';

export interface DomainShapeSpec {
	id: DomainShapeId;
	label: string;
	nx: number;
	ny: number;
	gridSpacing: number;
	physicalWidth: number;
	physicalHeight: number;
	aspectRatio: number;
	shortNote: string;
	boundaryNote: string;
}

export interface SpotStripePreset {
	id: PresetId;
	label: string;
	patternBalance: number;
	inhibitorRatio: number;
	diffusionU: number;
	diffusionV: number;
	shape: DomainShapeId;
	seed: number;
	disturbanceAmplitude: number;
	timestep: number;
	observationTime: number;
	defaultPigmentThreshold: number;
	description: string;
	balanceNote: string;
}

export interface SpotStripeConfig {
	presetId: PresetId | 'custom';
	patternBalance: number;
	inhibitorRatio: number;
	shape: DomainShapeId;
	seed: number;
	disturbanceAmplitude: number;
	timestep: number;
	observationTime: number;
}

export interface FieldSummary {
	meanU: number;
	stdU: number;
	minU: number;
	maxU: number;
	skewU: number;
	fractionAboveZero: number;
	fractionAboveEquilibrium: number;
	meanV: number;
	stdV: number;
	minV: number;
	maxV: number;
	activeCellCount: number;
	laplacianSumU: number;
	laplacianSumV: number;
	positiveComponents: number;
	negativeComponents: number;
	finite: boolean;
	errorReason: string | null;
}

export interface VariationSample {
	modelTime: number;
	differentStdU: number;
	equalStdU: number;
}

export interface DomainModeAnalysis {
	equilibrium: number;
	uniformTrace: number;
	uniformDet: number;
	uniformStable: boolean;
	growingModeCount: number;
	maxGrowthRate: number;
	dominantMode: {
		mx: number;
		my: number;
		wavenumber: number;
		wavelength: number | null;
	};
	equalSpreadingMaxGrowthRate: number;
}

export interface StabilityAssessment {
	gridSpacing: number;
	diffusionU: number;
	diffusionV: number;
	maxDiffusion: number;
	eulerDiffusionLimit: number;
	reactionJacobianNorm: number;
	combinedConservativeLimit: number;
	timestep: number;
	safetyFactor: number;
	safe: boolean;
}

export interface SimulationSnapshot {
	config: SpotStripeConfig;
	nx: number;
	ny: number;
	gridSpacing: number;
	physicalWidth: number;
	physicalHeight: number;
	stepIndex: number;
	modelTime: number;
	equilibrium: number;
	u: Float64Array;
	v: Float64Array;
	mask: Uint8Array;
	summary: FieldSummary;
	modeAnalysis: DomainModeAnalysis;
	stability: StabilityAssessment;
}

export interface ComparisonSnapshot {
	different: SimulationSnapshot;
	equal: SimulationSnapshot;
	history: VariationSample[];
	verdict: string;
}
