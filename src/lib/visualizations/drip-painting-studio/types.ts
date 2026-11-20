export const DRIP_GENERATOR_VERSION = 1 as const;

export const MIN_PASSES = 4 as const;
export const MAX_PASSES = 40 as const;
export const DEFAULT_PASSES = 18 as const;

export const MIN_FLOW = 10 as const;
export const MAX_FLOW = 100 as const;
export const DEFAULT_FLOW = 45 as const;

export const MIN_SWEEP = 20 as const;
export const MAX_SWEEP = 100 as const;
export const DEFAULT_SWEEP = 68 as const;

export const MIN_LAYERS = 2 as const;
export const MAX_LAYERS = 6 as const;
export const DEFAULT_LAYERS = 4 as const;

export const MIN_TEXTURE = 0 as const;
export const MAX_TEXTURE = 100 as const;
export const DEFAULT_TEXTURE = 50 as const;

export const MIN_PAINTING_TIME = 4 as const;
export const MAX_PAINTING_TIME = 20 as const;
export const DEFAULT_PAINTING_TIME = 10 as const;

export const DEFAULT_ARTBOARD_WIDTH = 1200 as const;
export const DEFAULT_ARTBOARD_HEIGHT = 800 as const;

export type StudyId =
	| 'pending-file'
	| 'public-works-tenders'
	| 'counter-middleman'
	| 'whitewash-record';

export type PresetId = 'single-trail' | 'thin-flow' | 'tangled-ledger' | 'heavy-whitewash';

export type KnobKey = 'passes' | 'paintFlow' | 'sweepWidth' | 'paintLayers';
export type SecondaryKnobKey = 'paintTexture' | 'paintingTime';
export type ViewMode = 'fill' | 'fit' | 'inspect';
export type PrngStreamName = 'paths' | 'layers' | 'flow' | 'surface' | 'timeline';
export type ExportResolution = 2048 | 4096;

export type PigmentId =
	| 'carbon-black'
	| 'file-tape-red'
	| 'ledger-ochre'
	| 'carbon-indigo'
	| 'road-tar-umber'
	| 'lime-whitewash';

export interface PaletteColor {
	readonly id: PigmentId;
	readonly label: string;
	readonly hex: string;
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly opacity: number;
	readonly bodyThickness: number;
	readonly sheen: number;
}

export const PALETTE: Readonly<Record<PigmentId, PaletteColor>> = {
	'carbon-black': {
		id: 'carbon-black',
		label: 'Carbon-stamp black',
		hex: '#1C1B1A',
		r: 28,
		g: 27,
		b: 26,
		opacity: 0.97,
		bodyThickness: 1.06,
		sheen: 0.15
	},
	'file-tape-red': {
		id: 'file-tape-red',
		label: 'File-tape red',
		hex: '#A8342A',
		r: 168,
		g: 52,
		b: 42,
		opacity: 0.93,
		bodyThickness: 1.0,
		sheen: 0.13
	},
	'ledger-ochre': {
		id: 'ledger-ochre',
		label: 'Ledger ochre',
		hex: '#B8873D',
		r: 184,
		g: 135,
		b: 61,
		opacity: 0.91,
		bodyThickness: 1.02,
		sheen: 0.11
	},
	'carbon-indigo': {
		id: 'carbon-indigo',
		label: 'Carbon-copy indigo',
		hex: '#29435C',
		r: 41,
		g: 67,
		b: 92,
		opacity: 0.92,
		bodyThickness: 0.94,
		sheen: 0.12
	},
	'road-tar-umber': {
		id: 'road-tar-umber',
		label: 'Road-tar umber',
		hex: '#594638',
		r: 89,
		g: 70,
		b: 56,
		opacity: 0.96,
		bodyThickness: 1.14,
		sheen: 0.16
	},
	'lime-whitewash': {
		id: 'lime-whitewash',
		label: 'Lime-whitewash',
		hex: '#E6DFD1',
		r: 230,
		g: 223,
		b: 209,
		opacity: 0.96,
		bodyThickness: 1.22,
		sheen: 0.06
	}
} as const;

export const PALETTE_LIST: readonly PaletteColor[] = Object.values(PALETTE);

export const GROUND_BASE_RGB: readonly [number, number, number] = [228, 219, 202];

export interface ArtboardSpec {
	readonly artboardWidth: number;
	readonly artboardHeight: number;
}

export interface DripPaintingState {
	readonly version: typeof DRIP_GENERATOR_VERSION;
	readonly seed: number;
	readonly study: StudyId;
	readonly passes: number;
	readonly paintFlow: number;
	readonly sweepWidth: number;
	readonly paintLayers: number;
	readonly paintTexture: number;
	readonly paintingTime: number;
	readonly artboardWidth: number;
	readonly artboardHeight: number;
}

export interface ViewState {
	readonly mode: ViewMode;
	readonly inspectZoom: number;
	readonly inspectCenterX: number;
	readonly inspectCenterY: number;
}

export interface CropRect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface StagePlacement {
	readonly cssWidth: number;
	readonly cssHeight: number;
	readonly offsetX: number;
	readonly offsetY: number;
	readonly scale: number;
}

export type GestureArchetype = 'orbital-loop' | 'sweeping-arc' | 'whip-back' | 'veil-ribbon';

export interface GestureWeights {
	readonly orbital: number;
	readonly arc: number;
	readonly whip: number;
	readonly veil: number;
}

export interface StudyKinematics {
	readonly hubCountRange: readonly [number, number];
	readonly hubInset: number;
	readonly gestureWeights: GestureWeights;
	readonly baseSpeedScale: number;
	readonly stallStrength: number;
	readonly whipSharpness: number;
	readonly poolPropensity: number;
	readonly spatterPropensity: number;
	readonly ribbonWidthScale: number;
}

export type PigmentAffinityMap = Readonly<Partial<Record<PigmentId, number>>>;

export interface StudySpec {
	readonly id: StudyId;
	readonly label: string;
	readonly shortLabel: string;
	readonly description: string;
	readonly defaultSeed: number;
	readonly kinematics: StudyKinematics;
	readonly layerAffinities: Readonly<Record<1 | 2 | 3 | 4 | 5 | 6, PigmentAffinityMap>>;
}

export interface PresetParameters {
	readonly passes: number;
	readonly paintFlow: number;
	readonly sweepWidth: number;
	readonly paintLayers: number;
	readonly paintTexture: number;
}

export interface PresetSpec {
	readonly id: PresetId;
	readonly label: string;
	readonly description: string;
	readonly parameters: PresetParameters;
}

export interface KnobSpec {
	readonly key: KnobKey;
	readonly label: string;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly defaultValue: number;
	readonly unit: string;
	readonly minLabel: string;
	readonly maxLabel: string;
	readonly description: string;
}

export interface SecondaryKnobSpec {
	readonly key: SecondaryKnobKey;
	readonly label: string;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly defaultValue: number;
	readonly unit: string;
	readonly minLabel: string;
	readonly maxLabel: string;
	readonly description: string;
}

export interface PassPathPoint {
	readonly x: number;
	readonly y: number;
	readonly vx: number;
	readonly vy: number;
	readonly signedCurvature: number;
	readonly tx: number;
	readonly ty: number;
	readonly speed: number;
	readonly globalSpeedNorm: number;
	readonly dwell: number;
	readonly arcLength: number;
	readonly anchorX: number;
	readonly anchorY: number;
	readonly layerIndex: number;
	readonly pigmentKey: PigmentId;
	readonly passIndex: number;
}

export interface CanonicalPass {
	readonly passIndex: number;
	readonly layerIndex: 1 | 2 | 3 | 4 | 5 | 6;
	readonly pigmentKey: PigmentId;
	readonly archetype: GestureArchetype;
	readonly artboardWidth: number;
	readonly artboardHeight: number;
	readonly anchorX: number;
	readonly anchorY: number;
	readonly pointCount: number;
	readonly totalArcLength: number;
	readonly x: Float32Array;
	readonly y: Float32Array;
	readonly vx: Float32Array;
	readonly vy: Float32Array;
	readonly signedCurvature: Float32Array;
	readonly tx: Float32Array;
	readonly ty: Float32Array;
	readonly speed: Float32Array;
	readonly globalSpeedNorm: Float32Array;
	readonly dwell: Float32Array;
	readonly arcLength: Float32Array;
}

export interface HubPoint {
	readonly x: number;
	readonly y: number;
}

export interface CanonicalPassTable {
	readonly seed: number;
	readonly study: StudyId;
	readonly artboardWidth: number;
	readonly artboardHeight: number;
	readonly hubs: readonly HubPoint[];
	readonly passes: readonly CanonicalPass[];
}

export interface SweptPass extends CanonicalPass {
	readonly sweepWidth: number;
}

export interface EarnedPool {
	readonly passIndex: number;
	readonly layerIndex: 1 | 2 | 3 | 4 | 5 | 6;
	readonly pigmentKey: PigmentId;
	readonly sampleIndex: number;
	readonly x: number;
	readonly y: number;
	readonly radius: number;
	readonly thickness: number;
	readonly lobeCount: 2 | 3;
	readonly h2: number;
	readonly h3: number;
	readonly p2: number;
	readonly p3: number;
}

export interface DetachedDroplet {
	readonly passIndex: number;
	readonly layerIndex: 1 | 2 | 3 | 4 | 5 | 6;
	readonly pigmentKey: PigmentId;
	readonly sampleIndex: number;
	readonly x: number;
	readonly y: number;
	readonly rx: number;
	readonly ry: number;
	readonly cosA: number;
	readonly sinA: number;
	readonly thickness: number;
}

export interface DepositionPass extends SweptPass {
	readonly paintFlow: number;
	readonly halfWidth: Float32Array;
	readonly thickness: Float32Array;
	readonly pools: readonly EarnedPool[];
	readonly droplets: readonly DetachedDroplet[];
}

export type ScheduledPrimitive =
	| {
			readonly kind: 'segment';
			readonly passOrderIndex: number;
			readonly passIndex: number;
			readonly layerIndex: 1 | 2 | 3 | 4 | 5 | 6;
			readonly pigmentKey: PigmentId;
			readonly revealAt: number;
			readonly x0: number;
			readonly y0: number;
			readonly r0: number;
			readonly h0: number;
			readonly x1: number;
			readonly y1: number;
			readonly r1: number;
			readonly h1: number;
			readonly minX: number;
			readonly minY: number;
			readonly maxX: number;
			readonly maxY: number;
	  }
	| {
			readonly kind: 'pool';
			readonly passOrderIndex: number;
			readonly passIndex: number;
			readonly layerIndex: 1 | 2 | 3 | 4 | 5 | 6;
			readonly pigmentKey: PigmentId;
			readonly revealAt: number;
			readonly x: number;
			readonly y: number;
			readonly radius: number;
			readonly thickness: number;
			readonly lobeCount: 2 | 3;
			readonly h2: number;
			readonly h3: number;
			readonly p2: number;
			readonly p3: number;
			readonly minX: number;
			readonly minY: number;
			readonly maxX: number;
			readonly maxY: number;
	  }
	| {
			readonly kind: 'droplet';
			readonly passOrderIndex: number;
			readonly passIndex: number;
			readonly layerIndex: 1 | 2 | 3 | 4 | 5 | 6;
			readonly pigmentKey: PigmentId;
			readonly revealAt: number;
			readonly x: number;
			readonly y: number;
			readonly rx: number;
			readonly ry: number;
			readonly cosA: number;
			readonly sinA: number;
			readonly thickness: number;
			readonly minX: number;
			readonly minY: number;
			readonly maxX: number;
			readonly maxY: number;
	  };

export interface PassScheduleWindow {
	readonly passOrderIndex: number;
	readonly passIndex: number;
	readonly layerIndex: 1 | 2 | 3 | 4 | 5 | 6;
	readonly pigmentKey: PigmentId;
	readonly startProgress: number;
	readonly endProgress: number;
	readonly primitiveStartIndex: number;
	readonly primitiveEndIndex: number;
}

export interface PaintTimeline {
	readonly seed: number;
	readonly durationSeconds: number;
	readonly passWindows: readonly PassScheduleWindow[];
	readonly primitives: readonly ScheduledPrimitive[];
}

export interface PaintingModel {
	readonly state: DripPaintingState;
	readonly canonicalTable: CanonicalPassTable;
	readonly sweptPasses: readonly SweptPass[];
	readonly depositionPasses: readonly DepositionPass[];
	readonly timeline: PaintTimeline;
	readonly focalPoint: { readonly x: number; readonly y: number };
	readonly description: string;
}

export interface PaintingMetrics {
	readonly totalPixels: number;
	readonly coveredPixels: number;
	readonly coveragePct: number;
	readonly meanHeight: number;
	readonly maxHeight: number;
	readonly poolCount: number;
	readonly dropletCount: number;
	readonly pigmentShares: Readonly<Record<PigmentId, number>>;
}

export interface ExportResult {
	readonly blob: Blob;
	readonly filename: string;
	readonly width: number;
	readonly height: number;
	readonly requestedWidth: number;
	readonly requestedHeight: number;
	readonly fallbackApplied: boolean;
	readonly statusMessage: string;
}

export const CURATED_STUDY_SEEDS: Readonly<Record<StudyId, number>> = {
	'pending-file': 729104,
	'public-works-tenders': 528419,
	'counter-middleman': 642913,
	'whitewash-record': 781305
} as const;

export const CURATED_DEFAULT_SEED = CURATED_STUDY_SEEDS['pending-file'];

export const DEFAULT_DRIP_STATE: DripPaintingState = {
	version: DRIP_GENERATOR_VERSION,
	seed: CURATED_DEFAULT_SEED,
	study: 'pending-file',
	passes: DEFAULT_PASSES,
	paintFlow: DEFAULT_FLOW,
	sweepWidth: DEFAULT_SWEEP,
	paintLayers: DEFAULT_LAYERS,
	paintTexture: DEFAULT_TEXTURE,
	paintingTime: DEFAULT_PAINTING_TIME,
	artboardWidth: DEFAULT_ARTBOARD_WIDTH,
	artboardHeight: DEFAULT_ARTBOARD_HEIGHT
};

export const DEFAULT_VIEW_STATE: ViewState = {
	mode: 'fill',
	inspectZoom: 3.5,
	inspectCenterX: 0.5,
	inspectCenterY: 0.5
};

export const PRESET_SPECS: readonly PresetSpec[] = [
	{
		id: 'single-trail',
		label: 'Single Trail',
		description: 'Four clear early passes over two layers leaving most raw cloth exposed.',
		parameters: {
			passes: 4,
			paintFlow: 45,
			sweepWidth: 64,
			paintLayers: 2,
			paintTexture: 48
		}
	},
	{
		id: 'thin-flow',
		label: 'Thin Flow',
		description: 'Low pigment volume producing fine necked filaments and sparse droplets.',
		parameters: {
			passes: 16,
			paintFlow: 20,
			sweepWidth: 68,
			paintLayers: 4,
			paintTexture: 50
		}
	},
	{
		id: 'tangled-ledger',
		label: 'Tangled Ledger',
		description: 'Dense overlapping passes and pools knotting across five pigment strata.',
		parameters: {
			passes: 26,
			paintFlow: 62,
			sweepWidth: 74,
			paintLayers: 5,
			paintTexture: 56
		}
	},
	{
		id: 'heavy-whitewash',
		label: 'Heavy Whitewash',
		description: 'Full six-layer accumulation where thick chalky coats veil dark threads beneath.',
		parameters: {
			passes: 36,
			paintFlow: 82,
			sweepWidth: 82,
			paintLayers: 6,
			paintTexture: 64
		}
	}
] as const;

export const KNOB_SPECS: readonly KnobSpec[] = [
	{
		key: 'passes',
		label: 'Passes',
		min: MIN_PASSES,
		max: MAX_PASSES,
		step: 1,
		defaultValue: DEFAULT_PASSES,
		unit: 'passes',
		minLabel: 'Sparse',
		maxLabel: 'Dense',
		description: 'Adds or removes seeded pours in prefix order without altering earlier trails.'
	},
	{
		key: 'paintFlow',
		label: 'Paint flow',
		min: MIN_FLOW,
		max: MAX_FLOW,
		step: 1,
		defaultValue: DEFAULT_FLOW,
		unit: '%',
		minLabel: 'Thin',
		maxLabel: 'Heavy',
		description: 'Controls pigment volume, pooling, and droplet detachment along fixed paths.'
	},
	{
		key: 'sweepWidth',
		label: 'Sweep width',
		min: MIN_SWEEP,
		max: MAX_SWEEP,
		step: 1,
		defaultValue: DEFAULT_SWEEP,
		unit: '%',
		minLabel: 'Tight',
		maxLabel: 'Wide',
		description: 'Scales lateral gesture reach around each pass anchor without rerolling trails.'
	},
	{
		key: 'paintLayers',
		label: 'Paint layers',
		min: MIN_LAYERS,
		max: MAX_LAYERS,
		step: 1,
		defaultValue: DEFAULT_LAYERS,
		unit: 'layers',
		minLabel: 'Shallow',
		maxLabel: 'Deep',
		description: 'Reveals sequential upper pigment strata while leaving lower layers untouched.'
	}
] as const;

export const SECONDARY_KNOB_SPECS: readonly SecondaryKnobSpec[] = [
	{
		key: 'paintTexture',
		label: 'Paint texture',
		min: MIN_TEXTURE,
		max: MAX_TEXTURE,
		step: 1,
		defaultValue: DEFAULT_TEXTURE,
		unit: '%',
		minLabel: 'Flat',
		maxLabel: 'Toothy',
		description: 'Adjusts cotton-duck weave visibility and dried paint-ridge relief lighting.'
	},
	{
		key: 'paintingTime',
		label: 'Painting time',
		min: MIN_PAINTING_TIME,
		max: MAX_PAINTING_TIME,
		step: 1,
		defaultValue: DEFAULT_PAINTING_TIME,
		unit: 's',
		minLabel: 'Brisk',
		maxLabel: 'Slow',
		description: 'Scales reveal duration while preserving identical stroke order and final pixels.'
	}
] as const;

export interface ExperimentConfig {
	readonly seed: number;
	readonly study: StudyId;
	readonly moderatePasses: number;
	readonly sweepWidth: number;
	readonly moderateLayers: number;
	readonly thinFlow: number;
	readonly heavyFlow: number;
	readonly buriedPasses: number;
	readonly buriedLayers: number;
	readonly paintTexture: number;
	readonly thin: DripPaintingState;
	readonly heavy: DripPaintingState;
	readonly buried: DripPaintingState;
}

const EXP_MODERATE_PASSES = 16;
const EXP_MODERATE_LAYERS = 4;
const EXP_SWEEP = 68;
const EXP_THIN_FLOW = 20;
const EXP_HEAVY_FLOW = 80;
const EXP_BURIED_PASSES = 36;
const EXP_BURIED_LAYERS = 6;

export const EXPERIMENT_CONFIG: ExperimentConfig = {
	seed: CURATED_DEFAULT_SEED,
	study: 'pending-file',
	moderatePasses: EXP_MODERATE_PASSES,
	sweepWidth: EXP_SWEEP,
	moderateLayers: EXP_MODERATE_LAYERS,
	thinFlow: EXP_THIN_FLOW,
	heavyFlow: EXP_HEAVY_FLOW,
	buriedPasses: EXP_BURIED_PASSES,
	buriedLayers: EXP_BURIED_LAYERS,
	paintTexture: DEFAULT_TEXTURE,
	thin: {
		...DEFAULT_DRIP_STATE,
		seed: CURATED_DEFAULT_SEED,
		study: 'pending-file',
		passes: EXP_MODERATE_PASSES,
		paintFlow: EXP_THIN_FLOW,
		sweepWidth: EXP_SWEEP,
		paintLayers: EXP_MODERATE_LAYERS,
		paintTexture: DEFAULT_TEXTURE
	},
	heavy: {
		...DEFAULT_DRIP_STATE,
		seed: CURATED_DEFAULT_SEED,
		study: 'pending-file',
		passes: EXP_MODERATE_PASSES,
		paintFlow: EXP_HEAVY_FLOW,
		sweepWidth: EXP_SWEEP,
		paintLayers: EXP_MODERATE_LAYERS,
		paintTexture: DEFAULT_TEXTURE
	},
	buried: {
		...DEFAULT_DRIP_STATE,
		seed: CURATED_DEFAULT_SEED,
		study: 'pending-file',
		passes: EXP_BURIED_PASSES,
		paintFlow: EXP_HEAVY_FLOW,
		sweepWidth: EXP_SWEEP,
		paintLayers: EXP_BURIED_LAYERS,
		paintTexture: DEFAULT_TEXTURE
	}
};
