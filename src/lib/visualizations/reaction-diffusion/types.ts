export const REACTION_DIFFUSION_SCHEMA_VERSION = 1 as const;
export const REACTION_DIFFUSION_MODEL_ID = 'gray-scott-2d' as const;
export const REACTION_DIFFUSION_ENGINE_VERSION = 'gray-scott-heun-five-point-v1' as const;

export type BoundaryCondition = 'periodic' | 'no-flux' | 'reservoir';
export type MaskPreset =
	| 'open-square'
	| 'circular-vessel'
	| 'narrow-channel'
	| 'annulus'
	| 'two-chambers'
	| 'obstacle-field';
export type InitialConditionRecipe =
	| 'central-soft-disk'
	| 'central-square'
	| 'ring'
	| 'horizontal-front'
	| 'two-spots'
	| 'noise-patch'
	| 'sparse-points'
	| 'blank-feed'
	| 'hand-painted';
export type IntegratorKind = 'heun' | 'euler';
export type DisplayMode =
	| 'v'
	| 'u'
	| 'composite'
	| 'u-minus-v'
	| 'reaction-rate'
	| 'v-diffusion'
	| 'v-derivative';
export type PaletteId = 'mineral' | 'cividis' | 'high-contrast' | 'diverging';
export type ReactionDiffusionPanel =
	| 'laboratory'
	| 'compare'
	| 'diagnostics'
	| 'numerics'
	| 'export';
export type EngineKind = 'gpu-f16' | 'gpu-f32' | 'cpu-reference';
export type QualityLevel = 'low' | 'medium' | 'high';
export type BrushTool =
	| 'add-v'
	| 'add-u'
	| 'mixed-pulse'
	| 'restore-feed'
	| 'paint-obstacle'
	| 'erase-obstacle';
export type BrushShape = 'soft-disk' | 'hard-disk' | 'ring' | 'line';
export type BrushTarget = 'both' | 'a' | 'b';

export interface GrayScottSetup {
	readonly feed: number;
	readonly kill: number;
	readonly diffusionU: number;
	readonly diffusionV: number;
	readonly timestep: number;
	readonly gridSize: number;
	readonly domainWidth: number;
	readonly boundary: BoundaryCondition;
	readonly maskPreset: MaskPreset;
	readonly initialCondition: InitialConditionRecipe;
	readonly seed: string;
	readonly integrator: IntegratorKind;
}

export interface ReactionDiffusionPreset extends GrayScottSetup {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly recommendedModelTime: number;
	readonly observationPrompt: string;
	readonly conditionalNote: string;
}

export interface FieldState {
	readonly size: number;
	readonly u: Float64Array;
	readonly v: Float64Array;
	/** One means active chemistry; zero means an impermeable cell. */
	readonly mask: Uint8Array;
}

export interface FieldSample {
	readonly row: number;
	readonly column: number;
	readonly u: number;
	readonly v: number;
}

export interface BrushIntervention {
	readonly schemaVersion: typeof REACTION_DIFFUSION_SCHEMA_VERSION;
	readonly sequence: number;
	/** Applied immediately before this numbered integration step. */
	readonly step: number;
	readonly kind: 'brush';
	readonly tool: BrushTool;
	readonly shape: BrushShape;
	readonly target: BrushTarget;
	/** Normalized domain coordinates in [0, 1]²; x increases right and y increases down. */
	readonly from: readonly [number, number];
	readonly to: readonly [number, number];
	/** Radius as a fraction of domain width. */
	readonly radius: number;
	readonly strength: number;
	readonly falloff: number;
}

export interface MaskIntervention {
	readonly schemaVersion: typeof REACTION_DIFFUSION_SCHEMA_VERSION;
	readonly sequence: number;
	readonly step: number;
	readonly kind: 'mask';
	readonly active: boolean;
	/** Normalized domain coordinates in [0, 1]²; x increases right and y increases down. */
	readonly from: readonly [number, number];
	readonly to: readonly [number, number];
	/** Radius as a fraction of domain width. */
	readonly radius: number;
}

export type Intervention = BrushIntervention | MaskIntervention;

export interface StabilityReading {
	readonly mu: number;
	readonly ceiling: number;
	readonly state: 'safe' | 'caution' | 'unsafe';
	readonly reason: string;
}

export interface LocalTermLedger {
	readonly row: number;
	readonly column: number;
	readonly u: number;
	readonly v: number;
	readonly north: readonly [number, number];
	readonly south: readonly [number, number];
	readonly east: readonly [number, number];
	readonly west: readonly [number, number];
	readonly laplacianU: number;
	readonly laplacianV: number;
	readonly diffusionU: number;
	readonly reactionU: number;
	readonly feedU: number;
	readonly derivativeU: number;
	readonly diffusionV: number;
	readonly reactionV: number;
	readonly feedRemovalV: number;
	readonly killV: number;
	readonly derivativeV: number;
}

export interface FieldMetrics {
	readonly meanU: number;
	readonly meanV: number;
	readonly varianceV: number;
	readonly meanReactionRate: number;
	readonly minimumU: number;
	readonly maximumU: number;
	readonly minimumV: number;
	readonly maximumV: number;
	readonly activeCells: number;
}

export interface ChemicalBudget {
	readonly meanU: number;
	readonly meanV: number;
	readonly autocatalysisU: number;
	readonly feedU: number;
	readonly diffusionU: number;
	readonly predictedChangeU: number;
	readonly measuredChangeU: number | null;
	readonly residualU: number | null;
	readonly autocatalysisV: number;
	readonly feedRemovalV: number;
	readonly killV: number;
	readonly diffusionV: number;
	readonly predictedChangeV: number;
	readonly measuredChangeV: number | null;
	readonly residualV: number | null;
}

export interface HomogeneousEquilibrium {
	readonly id: 'feed' | 'lower' | 'upper';
	readonly u: number;
	readonly v: number;
}

export interface ComplexValue {
	readonly real: number;
	readonly imaginary: number;
}

export interface JacobianReading {
	readonly matrix: readonly [number, number, number, number];
	readonly trace: number;
	readonly determinant: number;
	readonly eigenvalues: readonly [ComplexValue, ComplexValue];
}

export type StabilityClassification =
	| 'classical-diffusion-driven'
	| 'reaction-unstable'
	| 'linearly-stable'
	| 'near-boundary';

export interface DispersionSample {
	readonly q: number;
	readonly growthRate: number;
}

export interface DispersionReading {
	readonly equilibrium: HomogeneousEquilibrium;
	readonly jacobian: JacobianReading;
	readonly classification: StabilityClassification;
	readonly qZeroGrowthRate: number;
	readonly maximumGrowthRate: number;
	readonly fastestQ: number | null;
	readonly linearWavelength: number | null;
	readonly samples: readonly DispersionSample[];
}

export interface SpectrumBin {
	readonly q: number;
	readonly power: number;
}

export interface SpectrumReading {
	readonly bins: readonly SpectrumBin[];
	readonly dominantQ: number | null;
	readonly dominantWavelength: number | null;
	readonly domainFraction: number | null;
	readonly prominence: number;
	readonly trustworthy: boolean;
	readonly reason: string;
	readonly window: 'none' | 'hann';
}

export interface MeasurementSample extends FieldMetrics {
	readonly step: number;
	readonly modelTime: number;
	readonly dominantWavelength: number | null;
	readonly residualU: number | null;
	readonly residualV: number | null;
	readonly comparisonDifference: number | null;
}

export interface ExperimentRecord {
	readonly schemaVersion: typeof REACTION_DIFFUSION_SCHEMA_VERSION;
	readonly engineVersion: typeof REACTION_DIFFUSION_ENGINE_VERSION;
	readonly model: typeof REACTION_DIFFUSION_MODEL_ID;
	readonly setup: GrayScottSetup;
	readonly engine: EngineKind;
	readonly step: number;
	readonly modelTime: number;
	readonly interventions: readonly Intervention[];
	readonly measurements: FieldMetrics;
	readonly history: readonly MeasurementSample[];
	readonly display: {
		readonly mode: DisplayMode;
		readonly palette: PaletteId;
	};
}

export interface UrlDecodeResult {
	readonly setup: GrayScottSetup;
	readonly displayMode: DisplayMode;
	readonly palette: PaletteId;
	readonly selectedPanel: ReactionDiffusionPanel;
	readonly issues: readonly string[];
	readonly unsupportedVersion: boolean;
}
