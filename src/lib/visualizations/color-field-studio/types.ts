export const COLOR_FIELD_GENERATOR_VERSION = 1 as const;

export const MIN_AREA_COUNT = 2;
export const MAX_AREA_COUNT = 6;
export const DEFAULT_AREA_COUNT = 3;

export const MIN_AREA_SIZE = 25;
export const MAX_AREA_SIZE = 90;
export const DEFAULT_AREA_SIZE = 62;

export const MIN_EDGE_SOFTNESS = 0;
export const MAX_EDGE_SOFTNESS = 100;
export const DEFAULT_EDGE_SOFTNESS = 58;

export const MIN_TRANSPARENCY = 10;
export const MAX_TRANSPARENCY = 95;
export const DEFAULT_TRANSPARENCY = 52;

export const MIN_CANVAS_TEXTURE = 0;
export const MAX_CANVAS_TEXTURE = 100;
export const DEFAULT_CANVAS_TEXTURE = 55;

export const MIN_PAINTING_TIME = 4;
export const MAX_PAINTING_TIME = 20;
export const DEFAULT_PAINTING_TIME = 10;

export const DEFAULT_ARTBOARD_KEY = 'landscape' as const;
export const DEFAULT_ARTBOARD_WIDTH = 1200;
export const DEFAULT_ARTBOARD_HEIGHT = 800;

export const CURATED_DEFAULT_SEED = 482917;

/** Warm unbleached primed cotton-duck ground RGB (used for default study & metric reference). */
export const GROUND_BASE_RGB: readonly [number, number, number] = [232, 224, 210];

export type StudyId =
	| 'rothko-nocturne'
	| 'frankenthaler-wash'
	| 'ochre-horizon'
	| 'cobalt-veil'
	| 'terra-stillness';

export type StudyArchetype = 'stacked-multiform' | 'soak-stain';

export type PresetId = 'two-area-sharp' | 'two-area-soft' | 'luminous-veil' | 'deep-stack';

export type ArtboardKey = 'landscape' | 'square' | 'portrait';

export type KnobKey = 'areaCount' | 'areaSize' | 'edgeSoftness' | 'transparency';

export type SecondaryKnobKey = 'canvasTexture' | 'paintingTime';

export type ViewMode = 'fill' | 'fit' | 'inspect';

export type ExportResolution = 2048 | 4096;

export type PrngStreamName = 'composition' | 'pigment' | 'edges' | 'surface' | 'timeline';

export interface ArtboardSpec {
	readonly key: ArtboardKey;
	readonly label: string;
	readonly artboardWidth: number;
	readonly artboardHeight: number;
}

export const ARTBOARDS: Readonly<Record<ArtboardKey, ArtboardSpec>> = {
	landscape: {
		key: 'landscape',
		label: 'Landscape 3:2',
		artboardWidth: 1200,
		artboardHeight: 800
	},
	square: {
		key: 'square',
		label: 'Square 6:5',
		artboardWidth: 1080,
		artboardHeight: 900
	},
	portrait: {
		key: 'portrait',
		label: 'Portrait 8:9',
		artboardWidth: 960,
		artboardHeight: 1080
	}
} as const;

export const ARTBOARD_LIST: readonly ArtboardSpec[] = [
	ARTBOARDS.landscape,
	ARTBOARDS.square,
	ARTBOARDS.portrait
] as const;

export const ARTBOARD_DIMENSIONS: Readonly<
	Record<ArtboardKey, { readonly width: number; readonly height: number }>
> = {
	landscape: { width: 1200, height: 800 },
	square: { width: 1080, height: 900 },
	portrait: { width: 960, height: 1080 }
} as const;

export const BOUNDS = {
	areaCount: {
		min: MIN_AREA_COUNT,
		max: MAX_AREA_COUNT,
		step: 1,
		defaultValue: DEFAULT_AREA_COUNT
	},
	areaSize: {
		min: MIN_AREA_SIZE,
		max: MAX_AREA_SIZE,
		step: 1,
		defaultValue: DEFAULT_AREA_SIZE
	},
	edgeSoftness: {
		min: MIN_EDGE_SOFTNESS,
		max: MAX_EDGE_SOFTNESS,
		step: 1,
		defaultValue: DEFAULT_EDGE_SOFTNESS
	},
	transparency: {
		min: MIN_TRANSPARENCY,
		max: MAX_TRANSPARENCY,
		step: 1,
		defaultValue: DEFAULT_TRANSPARENCY
	},
	canvasTexture: {
		min: MIN_CANVAS_TEXTURE,
		max: MAX_CANVAS_TEXTURE,
		step: 1,
		defaultValue: DEFAULT_CANVAS_TEXTURE
	},
	paintingTime: {
		min: MIN_PAINTING_TIME,
		max: MAX_PAINTING_TIME,
		step: 1,
		defaultValue: DEFAULT_PAINTING_TIME
	}
} as const;

export const CURATED_STUDY_SEEDS: Readonly<Record<StudyId, number>> = {
	'rothko-nocturne': 482917,
	'frankenthaler-wash': 619304,
	'ochre-horizon': 274815,
	'cobalt-veil': 835192,
	'terra-stillness': 391648
} as const;

export interface ColorFieldState {
	readonly version: typeof COLOR_FIELD_GENERATOR_VERSION;
	readonly generatorVersion: typeof COLOR_FIELD_GENERATOR_VERSION;
	readonly studyId: StudyId;
	readonly seed: number;
	readonly areaCount: number;
	readonly areaSize: number;
	readonly edgeSoftness: number;
	readonly transparency: number;
	readonly canvasTexture: number;
	readonly paintingTime: number;
	readonly artboard: ArtboardKey;
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

export interface KnobSpec {
	readonly key: KnobKey;
	readonly label: string;
	readonly shortLabel: string;
	readonly description: string;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly defaultValue: number;
	readonly unit: string;
}

export interface SecondaryKnobSpec {
	readonly key: SecondaryKnobKey;
	readonly label: string;
	readonly description: string;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly defaultValue: number;
	readonly unit: string;
}

export interface PresetSpec {
	readonly id: PresetId;
	readonly label: string;
	readonly summary: string;
	readonly parameters: {
		readonly areaCount: number;
		readonly areaSize: number;
		readonly edgeSoftness: number;
		readonly transparency: number;
		readonly canvasTexture: number;
	};
}

export interface PigmentSwatch {
	readonly id: string;
	readonly label: string;
	readonly hex: string;
	readonly rgb: readonly [number, number, number];
	readonly linearRgb: readonly [number, number, number];
	readonly absorption: readonly [number, number, number];
	readonly shiftLinearRgb: readonly [number, number, number];
}

export interface StudySpec {
	readonly id: StudyId;
	readonly label: string;
	readonly shortLabel: string;
	readonly archetype: StudyArchetype;
	readonly description: string;
	readonly defaultSeed: number;
	readonly groundHex: string;
	readonly groundBaseRgb: readonly [number, number, number];
	readonly palette: readonly PigmentSwatch[];
}

export interface CanonicalRegion {
	readonly index: number;
	readonly cx: number;
	readonly cy: number;
	readonly baseRx: number;
	readonly baseRy: number;
	readonly exponent: number;
	readonly angle: number;
	readonly cosA: number;
	readonly sinA: number;
	readonly h2: number;
	readonly h3: number;
	readonly cosP2: number;
	readonly sinP2: number;
	readonly cosP3: number;
	readonly sinP3: number;
	readonly pigment: PigmentSwatch;
}

export interface ColorRegion extends CanonicalRegion {
	readonly rx: number;
	readonly ry: number;
	readonly minX: number;
	readonly minY: number;
	readonly maxX: number;
	readonly maxY: number;
}

export interface GlazeCoatPass {
	readonly passOrderIndex: number;
	readonly coatIndex: number;
	readonly regionIndex: number;
	readonly region: ColorRegion;
	readonly coatWeight: number;
	readonly coatReachScale: number;
	readonly minX: number;
	readonly minY: number;
	readonly maxX: number;
	readonly maxY: number;
}

export interface ScheduledSwath {
	readonly passOrderIndex: number;
	readonly coatIndex: number;
	readonly regionIndex: number;
	readonly swathIndex: number;
	readonly revealAt: number;
	readonly cosSweep: number;
	readonly sinSweep: number;
	readonly uMinBound: number;
	readonly uMaxBound: number;
	readonly minX: number;
	readonly minY: number;
	readonly maxX: number;
	readonly maxY: number;
	readonly pass: GlazeCoatPass;
}

export interface PassScheduleWindow {
	readonly passOrderIndex: number;
	readonly coatIndex: number;
	readonly regionIndex: number;
	readonly startProgress: number;
	readonly endProgress: number;
	readonly primitiveStartIndex: number;
	readonly primitiveEndIndex: number;
}

export interface PaintingTimeline {
	readonly seed: number;
	readonly durationSeconds: number;
	readonly passWindows: readonly PassScheduleWindow[];
	readonly primitives: readonly ScheduledSwath[];
}

export interface PaintingModel {
	readonly state: ColorFieldState;
	readonly study: StudySpec;
	readonly groundBaseRgb: readonly [number, number, number];
	readonly canonicalRegions: readonly CanonicalRegion[];
	readonly regions: readonly ColorRegion[];
	readonly glazePasses: readonly GlazeCoatPass[];
	readonly timeline: PaintingTimeline;
	readonly focalPoint: { readonly x: number; readonly y: number };
	readonly description: string;
}

export interface RegionMetricSummary {
	readonly regionIndex: number;
	readonly pixelCount: number;
	readonly pixelFraction: number;
	readonly meanR: number;
	readonly meanG: number;
	readonly meanB: number;
	readonly meanLuminance: number;
	readonly interiorWeaveEnergy: number;
}

export interface PaintingMetrics {
	readonly width: number;
	readonly height: number;
	readonly totalPixels: number;
	readonly activeRegionCount: number;
	readonly meanR: number;
	readonly meanG: number;
	readonly meanB: number;
	readonly meanLuminance: number;
	readonly luminanceVariance: number;
	readonly luminanceStdDev: number;
	readonly colorVariance: number;
	readonly meanChroma: number;
	readonly nonBackgroundPixels: number;
	readonly nonBackgroundFraction: number;
	readonly paintedCoveragePct: number;
	readonly meanBoundaryGradient: number;
	readonly p95BoundaryGradient: number;
	readonly sharpBoundaryFraction: number;
	readonly edgeGradientSmoothness: number;
	readonly canvasWeaveVisibility: number;
	readonly groundWeaveVisibility: number;
	readonly pigmentVariationScore: number;
	readonly regionSeparation: number;
	readonly regionStats: readonly RegionMetricSummary[];
}

export interface StillRenderResult {
	readonly width: number;
	readonly height: number;
	readonly rgba: Uint8ClampedArray;
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

export const DEFAULT_STATE: ColorFieldState = {
	version: COLOR_FIELD_GENERATOR_VERSION,
	generatorVersion: COLOR_FIELD_GENERATOR_VERSION,
	studyId: 'rothko-nocturne',
	seed: CURATED_DEFAULT_SEED,
	areaCount: DEFAULT_AREA_COUNT,
	areaSize: DEFAULT_AREA_SIZE,
	edgeSoftness: DEFAULT_EDGE_SOFTNESS,
	transparency: DEFAULT_TRANSPARENCY,
	canvasTexture: DEFAULT_CANVAS_TEXTURE,
	paintingTime: DEFAULT_PAINTING_TIME,
	artboard: DEFAULT_ARTBOARD_KEY,
	artboardWidth: DEFAULT_ARTBOARD_WIDTH,
	artboardHeight: DEFAULT_ARTBOARD_HEIGHT
};

export const DEFAULT_VIEW_STATE: ViewState = {
	mode: 'fill',
	inspectZoom: 3.5,
	inspectCenterX: 0.5,
	inspectCenterY: 0.5
};

export const KNOB_SPECS: readonly KnobSpec[] = [
	{
		key: 'areaCount',
		label: 'Color areas',
		shortLabel: 'Areas',
		description: 'Number of layered color fields arranged across the canvas.',
		min: MIN_AREA_COUNT,
		max: MAX_AREA_COUNT,
		step: 1,
		defaultValue: DEFAULT_AREA_COUNT,
		unit: ''
	},
	{
		key: 'areaSize',
		label: 'Area size',
		shortLabel: 'Size',
		description: 'Relative footprint of each color region around its anchor.',
		min: MIN_AREA_SIZE,
		max: MAX_AREA_SIZE,
		step: 1,
		defaultValue: DEFAULT_AREA_SIZE,
		unit: '%'
	},
	{
		key: 'edgeSoftness',
		label: 'Edge softness',
		shortLabel: 'Edges',
		description: 'Transition from crisp architectural edges to feathered atmospheric halos.',
		min: MIN_EDGE_SOFTNESS,
		max: MAX_EDGE_SOFTNESS,
		step: 1,
		defaultValue: DEFAULT_EDGE_SOFTNESS,
		unit: '%'
	},
	{
		key: 'transparency',
		label: 'Paint transparency',
		shortLabel: 'Transp.',
		description: 'Optical glaze translucency revealing lower layers and woven canvas tooth.',
		min: MIN_TRANSPARENCY,
		max: MAX_TRANSPARENCY,
		step: 1,
		defaultValue: DEFAULT_TRANSPARENCY,
		unit: '%'
	}
] as const;

export const SECONDARY_KNOB_SPECS: readonly SecondaryKnobSpec[] = [
	{
		key: 'canvasTexture',
		label: 'Canvas texture',
		description: 'Visible cotton-duck warp/weft tooth and sizing mottle beneath translucent paint.',
		min: MIN_CANVAS_TEXTURE,
		max: MAX_CANVAS_TEXTURE,
		step: 1,
		defaultValue: DEFAULT_CANVAS_TEXTURE,
		unit: '%'
	},
	{
		key: 'paintingTime',
		label: 'Painting time',
		description: 'Duration over which broad passes and successive glazes build across the canvas.',
		min: MIN_PAINTING_TIME,
		max: MAX_PAINTING_TIME,
		step: 1,
		defaultValue: DEFAULT_PAINTING_TIME,
		unit: 's'
	}
] as const;

export const PRESET_SPECS: readonly PresetSpec[] = [
	{
		id: 'two-area-sharp',
		label: 'Two Areas — Sharp',
		summary: 'Two crisp, high-opacity color fields separated by clean canvas space.',
		parameters: {
			areaCount: 2,
			areaSize: 60,
			edgeSoftness: 0,
			transparency: 14,
			canvasTexture: 55
		}
	},
	{
		id: 'two-area-soft',
		label: 'Two Areas — Soft & Translucent',
		summary: 'Two feathered, luminous glazes whose softened edges breathe into the weave.',
		parameters: {
			areaCount: 2,
			areaSize: 60,
			edgeSoftness: 82,
			transparency: 68,
			canvasTexture: 60
		}
	},
	{
		id: 'luminous-veil',
		label: 'Luminous Veil',
		summary: 'Three broad translucent passages showing generous canvas tooth.',
		parameters: {
			areaCount: 3,
			areaSize: 66,
			edgeSoftness: 74,
			transparency: 72,
			canvasTexture: 65
		}
	},
	{
		id: 'deep-stack',
		label: 'Deep Stack',
		summary: 'Five rich overlapping glaze strata with soft hovering boundaries.',
		parameters: {
			areaCount: 5,
			areaSize: 68,
			edgeSoftness: 58,
			transparency: 42,
			canvasTexture: 50
		}
	}
] as const;
