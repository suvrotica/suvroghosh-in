export const BZ_SCHEMA_VERSION = 1 as const;
export const BZ_ENGINE_VERSION = 'bz-heun-five-point-f64-v1' as const;
export const OREGONATOR_MODEL_VERSION = 'tyson-fife-two-variable-v1' as const;
export const SCHNAKENBERG_MODEL_VERSION = 'schnakenberg-two-variable-v1' as const;
export const OREGONATOR_EQUATIONS_ID = 'tyson-fife-oregonator-2v-dimensionless' as const;
export const SCHNAKENBERG_EQUATIONS_ID = 'schnakenberg-2v-dimensionless' as const;

export type BZModelId = 'oregonator' | 'schnakenberg';
export type BZModelVersion = typeof OREGONATOR_MODEL_VERSION | typeof SCHNAKENBERG_MODEL_VERSION;
export type BZEquationsId = typeof OREGONATOR_EQUATIONS_ID | typeof SCHNAKENBERG_EQUATIONS_ID;
export type BZBoundary = 'no-flux' | 'periodic';
export type BZGeometry = 'circular-dish' | 'square';
export type BZMaskPreset = 'none' | 'central-obstacle' | 'seeded-obstacles';
export type BZInitialCondition =
	| 'uniform-equilibrium'
	| 'uniform-clock'
	| 'target-wave'
	| 'broken-front'
	| 'paired-fronts'
	| 'heterogeneity'
	| 'pacemaker'
	| 'turing-noise';

export interface OregonatorParameters {
	readonly epsilon: number;
	readonly q: number;
	readonly f: number;
}

export interface SchnakenbergParameters {
	readonly a: number;
	readonly b: number;
	readonly gamma: number;
}

export interface BZSetupBase {
	readonly diffusionU: number;
	readonly diffusionV: number;
	/** Fixed dimensionless model timestep. */
	readonly timestep: number;
	/** Both grid dimensions; the reference solver uses a square texture. */
	readonly gridSize: number;
	/** Dimensionless side length L of the square computational domain. */
	readonly domainSize: number;
	/** Dimensionless radius of the active dish when geometry is circular-dish. */
	readonly activeRadius: number;
	readonly boundary: BZBoundary;
	readonly geometry: BZGeometry;
	readonly maskPreset: BZMaskPreset;
	readonly initialCondition: BZInitialCondition;
	readonly seed: string;
}

export interface OregonatorSetup extends BZSetupBase {
	readonly model: 'oregonator';
	readonly modelVersion: typeof OREGONATOR_MODEL_VERSION;
	readonly equationsId: typeof OREGONATOR_EQUATIONS_ID;
	readonly parameters: OregonatorParameters;
}

export interface SchnakenbergSetup extends BZSetupBase {
	readonly model: 'schnakenberg';
	readonly modelVersion: typeof SCHNAKENBERG_MODEL_VERSION;
	readonly equationsId: typeof SCHNAKENBERG_EQUATIONS_ID;
	readonly parameters: SchnakenbergParameters;
}

export type BZSetup = OregonatorSetup | SchnakenbergSetup;

export interface BZFieldState {
	readonly size: number;
	readonly u: Float64Array;
	readonly v: Float64Array;
	/** One for cells belonging to the physical domain, zero for the exterior. */
	readonly domainMask: Uint8Array;
	/** One for active chemistry, zero for exterior cells and painted obstacles. */
	readonly mask: Uint8Array;
}

export interface ReactionPair {
	readonly u: number;
	readonly v: number;
}

export interface BZDerivativeTerms {
	readonly reactionU: Float64Array;
	readonly reactionV: Float64Array;
	readonly diffusionU: Float64Array;
	readonly diffusionV: Float64Array;
	readonly totalU: Float64Array;
	readonly totalV: Float64Array;
}

export interface ActiveTerms {
	readonly reaction: boolean;
	readonly diffusion: boolean;
}

export interface BZFieldMetrics {
	readonly activeCells: number;
	readonly meanU: number;
	readonly meanV: number;
	readonly varianceU: number;
	readonly varianceV: number;
	readonly minimumU: number;
	readonly maximumU: number;
	readonly minimumV: number;
	readonly maximumV: number;
	readonly excitedFraction: number;
}

export interface HomogenizationReading {
	readonly label: 'Approximate homogenization';
	readonly fraction: number;
	readonly before: BZFieldMetrics;
	readonly after: BZFieldMetrics;
	readonly meanDriftU: number;
	readonly meanDriftV: number;
}

export interface ComplexValue {
	readonly real: number;
	readonly imaginary: number;
}

export type Matrix2 = readonly [number, number, number, number];

export interface JacobianReading {
	readonly matrix: Matrix2;
	readonly trace: number;
	readonly determinant: number;
	readonly eigenvalues: readonly [ComplexValue, ComplexValue];
}

export type TuringClassification =
	| 'classical-diffusion-driven'
	| 'reaction-unstable'
	| 'linearly-stable'
	| 'near-boundary';

export interface DispersionSample {
	readonly wavenumber: number;
	readonly growthRate: number;
}

export interface SchnakenbergDispersionReading {
	readonly equilibrium: ReactionPair;
	readonly jacobian: JacobianReading;
	readonly classification: TuringClassification;
	readonly zeroModeGrowth: number;
	readonly maximumGrowth: number;
	readonly fastestWavenumber: number | null;
	readonly predictedWavelength: number | null;
	readonly nyquistWavenumber: number;
	readonly resolved: boolean;
	readonly samples: readonly DispersionSample[];
}

/** Model-native contract for a later radial FFT implementation. */
export interface SpectrumBin {
	readonly wavenumber: number;
	readonly power: number;
}

/** A null wavelength is the honest result when no defensible peak is present. */
export interface SpectrumReading {
	readonly bins: readonly SpectrumBin[];
	readonly dominantWavenumber: number | null;
	readonly dominantWavelength: number | null;
	readonly prominence: number;
	readonly trustworthy: boolean;
	readonly reason: string;
	readonly field: 'u' | 'v';
	readonly window: 'none' | 'hann';
}

export interface TimestepAssessment {
	readonly state: 'safe' | 'caution' | 'unsafe';
	readonly gridSpacing: number;
	readonly diffusionLimit: number;
	readonly diffusionRatio: number;
	readonly reactionScale: number;
	readonly reasons: readonly string[];
}

interface InterventionBase {
	readonly schemaVersion: typeof BZ_SCHEMA_VERSION;
	readonly sequence: number;
	/** Applied immediately before this numbered model step. */
	readonly step: number;
}

export interface ExciteIntervention extends InterventionBase {
	readonly kind: 'excite';
	readonly center: readonly [number, number];
	readonly radius: number;
	readonly amount: number;
}

export interface InhibitIntervention extends InterventionBase {
	readonly kind: 'inhibit';
	readonly center: readonly [number, number];
	readonly radius: number;
	readonly amount: number;
}

export interface CutIntervention extends InterventionBase {
	readonly kind: 'cut';
	readonly from: readonly [number, number];
	readonly to: readonly [number, number];
	readonly width: number;
	readonly targetU: number;
	readonly targetV: number;
	readonly strength: number;
}

export interface PacemakerIntervention extends InterventionBase {
	readonly kind: 'pacemaker';
	readonly center: readonly [number, number];
	readonly radius: number;
	readonly amount: number;
	readonly periodSteps: number;
	readonly endStep: number;
}

export interface ObstacleIntervention extends InterventionBase {
	readonly kind: 'obstacle';
	readonly from: readonly [number, number];
	readonly to: readonly [number, number];
	readonly radius: number;
}

export interface RestoreIntervention extends InterventionBase {
	readonly kind: 'restore';
	readonly from: readonly [number, number];
	readonly to: readonly [number, number];
	readonly radius: number;
	readonly initialization: 'recovered' | 'neighbor-mean';
}

export interface MixIntervention extends InterventionBase {
	readonly kind: 'mix';
	readonly fraction: number;
}

export interface ProbeIntervention extends InterventionBase {
	readonly kind: 'probe';
	readonly point: readonly [number, number];
}

export type BZIntervention =
	| ExciteIntervention
	| InhibitIntervention
	| CutIntervention
	| PacemakerIntervention
	| ObstacleIntervention
	| RestoreIntervention
	| MixIntervention
	| ProbeIntervention;

export interface ProbeReading {
	readonly row: number;
	readonly column: number;
	readonly index: number;
	readonly active: boolean;
	readonly u: number | null;
	readonly v: number | null;
}

export interface InterventionApplyResult {
	readonly mutated: boolean;
	readonly affectedCells: number;
	readonly probe: ProbeReading | null;
}

export type BZPalette = 'ferroin' | 'cerium' | 'phase-spectrum' | 'scientific' | 'high-contrast';
export type BZViewMode =
	| 'dish'
	| 'u'
	| 'v'
	| 'reaction-u'
	| 'diffusion-u'
	| 'net-u'
	| 'mask'
	| 'difference-from-mean';

export interface BZDisplayState {
	readonly palette: BZPalette;
	readonly view: BZViewMode;
}

export interface BZUrlState {
	readonly setup: BZSetup;
	readonly presetId: string;
	readonly step: number;
	readonly interventions: readonly BZIntervention[];
	readonly activeTerms: ActiveTerms;
	readonly display: BZDisplayState;
}

export interface BZUrlDecodeResult {
	readonly state: BZUrlState;
	readonly issues: readonly string[];
	readonly unsupportedVersion: boolean;
	readonly interventionsOmitted: boolean;
}

export interface BZExperimentRecord {
	readonly schemaVersion: typeof BZ_SCHEMA_VERSION;
	readonly engineVersion: typeof BZ_ENGINE_VERSION;
	readonly title: string;
	readonly exportedAt: string;
	readonly model: BZModelId;
	readonly modelVersion: BZModelVersion;
	readonly equationsId: BZEquationsId;
	readonly setup: BZSetup;
	readonly grid: { readonly width: number; readonly height: number };
	readonly domain: {
		readonly size: number;
		readonly activeRadius: number;
		readonly geometry: BZGeometry;
	};
	readonly timestep: number;
	readonly boundary: BZBoundary;
	readonly seed: string;
	readonly initialCondition: BZInitialCondition;
	readonly step: number;
	readonly modelTime: number;
	readonly interventions: readonly BZIntervention[];
	readonly activeTerms: ActiveTerms;
	readonly display: BZDisplayState;
	readonly numericalWarnings: readonly string[];
	readonly reproducibilityCaveat: string;
}

export type CalibrationStatus = 'candidate' | 'validated' | 'rejected';

export interface BZPresetDiagnostics {
	readonly validationStatus: CalibrationStatus;
	readonly finite: boolean | null;
	readonly meanU: number | null;
	readonly meanV: number | null;
	readonly varianceU: number | null;
	readonly varianceV: number | null;
	readonly turingClassification: TuringClassification | null;
	readonly measuredWavelength: number | null;
	readonly checksum: string | null;
}

export interface BZPreset {
	readonly id: string;
	readonly title: string;
	readonly modelVersion: BZModelVersion;
	readonly equationsId: BZEquationsId;
	readonly setup: BZSetup;
	readonly palette: BZPalette;
	readonly calibrationModelTime: number;
	readonly expectedQualitativeBehaviour: string;
	readonly diagnostics: BZPresetDiagnostics;
	readonly caveat: string;
}

export interface BZGuidedExperiment {
	readonly id: string;
	readonly title: string;
	readonly question: string;
	readonly presetId: string;
	readonly initialCondition: BZInitialCondition;
	readonly model: BZModelId;
	readonly rawParameters: Readonly<Record<string, number>>;
	readonly grid: number;
	readonly domainSize: number;
	readonly timestep: number;
	readonly boundary: BZBoundary;
	readonly seed: string;
	readonly observationTime: number;
	readonly activeTerms: readonly ('reaction' | 'diffusion' | 'intervention')[];
	readonly lookFor: string;
	readonly whatHappened: string;
	readonly interventions: readonly BZIntervention[];
	readonly caveat: string;
}
