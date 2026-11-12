export const POINTILLISM_GENERATOR_VERSION = 1;

export type SceneFamilyId =
	| 'river-path'
	| 'neighborhood-street'
	| 'plaza-market'
	| 'hill-country-creek';

export type KnobKey = 'dotSize' | 'dotSpacing' | 'paletteContrast' | 'colorVariation';

export type SecondaryKnobKey = 'paintTexture' | 'paintingTime';

export type ViewMode = 'fill' | 'fit' | 'inspect';

export type ExportLongSide = 2048 | 4096;

export type PrngStreamName =
	| 'scene'
	| 'placement'
	| 'candidates'
	| 'color'
	| 'texture'
	| 'reveal';

export type SurfaceCategory =
	| 'sky'
	| 'cloud'
	| 'distant-hill'
	| 'terrain'
	| 'limestone'
	| 'water'
	| 'path'
	| 'wall'
	| 'roof'
	| 'structure'
	| 'foliage'
	| 'trunk'
	| 'furniture'
	| 'stall'
	| 'sign'
	| 'person-cloth'
	| 'person-skin'
	| 'person-hair'
	| 'prop';

export const SURFACE_CATEGORY_INDEX: Record<SurfaceCategory, number> = {
	sky: 0,
	cloud: 1,
	'distant-hill': 2,
	terrain: 3,
	limestone: 4,
	water: 5,
	path: 6,
	wall: 7,
	roof: 8,
	structure: 9,
	foliage: 10,
	trunk: 11,
	furniture: 12,
	stall: 13,
	sign: 14,
	'person-cloth': 15,
	'person-skin': 16,
	'person-hair': 17,
	prop: 18
};

export const INDEX_TO_SURFACE_CATEGORY: readonly SurfaceCategory[] = [
	'sky',
	'cloud',
	'distant-hill',
	'terrain',
	'limestone',
	'water',
	'path',
	'wall',
	'roof',
	'structure',
	'foliage',
	'trunk',
	'furniture',
	'stall',
	'sign',
	'person-cloth',
	'person-skin',
	'person-hair',
	'prop'
];

export interface SceneFamilySpec {
	readonly id: SceneFamilyId;
	readonly label: string;
	readonly shortLabel: string;
	readonly description: string;
	readonly defaultSeed: number;
}

export interface KnobSpec {
	readonly key: KnobKey;
	readonly label: string;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly defaultValue: number;
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
	readonly minLabel: string;
	readonly maxLabel: string;
	readonly description: string;
}

export interface PointillismState {
	readonly version: number;
	readonly seed: number;
	readonly sceneFamily: SceneFamilyId;
	readonly dotSize: number; // 0..100, default 40
	readonly dotSpacing: number; // 0..100 (0 = Tight, 100 = Open), default 35
	readonly paletteContrast: number; // 0..100, default 45
	readonly colorVariation: number; // 0..100, default 40
	readonly paintTexture: number; // 0..100, default 45
	readonly paintingTime: number; // 4..20 seconds, default 10
	readonly artboardWidth: number; // Fixed logical width (e.g., 1200)
	readonly artboardHeight: number; // Fixed logical height (e.g., 800)
}

export interface ViewState {
	readonly mode: ViewMode;
	readonly inspectZoom: number; // 2.0..5.0, default 3.2
	readonly inspectCenterX: number; // Normalized [0, 1] on logical artboard
	readonly inspectCenterY: number; // Normalized [0, 1] on logical artboard
}

export type FigurePose = 'walking' | 'standing' | 'sitting' | 'cycling' | 'carrying' | 'leaning';

export interface SceneFigure {
	readonly id: number;
	readonly pose: FigurePose;
	readonly activityLabel: string;
	readonly footX: number; // Logical X ground/seat contact
	readonly footY: number; // Logical Y ground/seat contact
	readonly height: number; // Logical height scaled by perspective
	readonly depth: number; // [0, 1], smaller = closer to viewer
	readonly facing: 1 | -1;
	readonly inShade: boolean;
	readonly shirtRgb: readonly [number, number, number];
	readonly lowerRgb: readonly [number, number, number];
	readonly skinRgb: readonly [number, number, number];
	readonly hairRgb: readonly [number, number, number];
	readonly accentRgb: readonly [number, number, number];
	readonly isFocal: boolean;
	readonly propKind?: 'bag' | 'groceries' | 'book' | 'bicycle' | 'crate' | 'picnic-cup';
}

export interface FocalArea {
	readonly x: number; // Normalized [0, 1]
	readonly y: number; // Normalized [0, 1]
	readonly radius: number; // Normalized radius relative to min(width, height)
	readonly subjectLabel: string;
}

export interface SceneMetadataSummary {
	readonly sceneFamily: SceneFamilyId;
	readonly templateName: string;
	readonly activitySummary: string;
	readonly treeSummary: string;
	readonly structureSummary: string;
	readonly waterPresent: boolean;
	readonly season: 'spring-bloom' | 'warm-daylight' | 'late-afternoon' | 'clear-morning';
	readonly signText: string | null;
	readonly peopleCount: number;
	readonly lightDirectionX: number; // -1 (from left) to +1 (from right)
}

export interface SceneFields {
	readonly fieldWidth: number;
	readonly fieldHeight: number;
	readonly artboardWidth: number;
	readonly artboardHeight: number;
	readonly rgb: Uint8Array; // fieldWidth * fieldHeight * 3 (intended local RGB)
	readonly depth: Float32Array; // fieldWidth * fieldHeight ([0, 1], 0 = closest, 1 = farthest)
	readonly objectId: Uint16Array; // fieldWidth * fieldHeight (stable scene object identifier)
	readonly category: Uint8Array; // fieldWidth * fieldHeight (SurfaceCategory index)
	readonly lit: Uint8Array; // fieldWidth * fieldHeight (0 = deep shade .. 255 = full sun)
	readonly tangentAngle: Uint8Array; // fieldWidth * fieldHeight (0..255 -> 0..pi radians)
	readonly anisotropy: Uint8Array; // fieldWidth * fieldHeight (0..255 -> circular..directional)
	readonly boundary: Float32Array; // fieldWidth * fieldHeight (0..1 edge strength)
	readonly importance: Float32Array; // fieldWidth * fieldHeight (0.35..2.8 sampling density weight)
	readonly minNeighborDepth: Float32Array; // fieldWidth * fieldHeight (closest depth within small neighborhood)
}

export interface SceneModel {
	readonly seed: number;
	readonly sceneFamily: SceneFamilyId;
	readonly artboardWidth: number;
	readonly artboardHeight: number;
	readonly focalArea: FocalArea;
	readonly figures: readonly SceneFigure[];
	readonly summary: SceneMetadataSummary;
	readonly groundTintRgb: readonly [number, number, number];
	readonly groundSkyWarmthRgb: readonly [number, number, number];
	readonly fields: SceneFields;
}

export interface CandidateMark {
	readonly id: number; // Stable mark ID across spacing subsets and size/color/texture edits
	readonly x: number; // Logical X coordinate [0, artboardWidth]
	readonly y: number; // Logical Y coordinate [0, artboardHeight]
	readonly objectId: number;
	readonly categoryIndex: number;
	readonly depth: number;
	readonly minNeighborDepth: number;
	readonly lit: number; // 0..1
	readonly boundary: number; // 0..1
	readonly isFocalRegion: boolean;
	readonly baseRadiusFactor: number; // Fine near silhouettes/figures, broader in open sky/ground
	readonly aspect: number; // 1.0 = compact round dab, up to ~1.55 = short oval touch
	readonly angleRad: number; // Orientation in radians
	readonly baseR: number;
	readonly baseG: number;
	readonly baseB: number;
}

export interface CandidateHierarchy {
	readonly seed: number;
	readonly sceneFamily: SceneFamilyId;
	readonly artboardWidth: number;
	readonly artboardHeight: number;
	readonly candidates: readonly CandidateMark[]; // Ordered progressively: active subset is [0 .. activeCount)
}

export interface ColoredMark {
	readonly candidate: CandidateMark;
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly rimR: number;
	readonly rimG: number;
	readonly rimB: number;
}

export interface ScheduledMark {
	readonly id: number;
	readonly x: number;
	readonly y: number;
	readonly rx: number; // Logical semi-major axis (from Dot size)
	readonly ry: number; // Logical semi-minor axis (from Dot size)
	readonly cosA: number;
	readonly sinA: number;
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly rimR: number;
	readonly rimG: number;
	readonly rimB: number;
	readonly depth: number;
	readonly minNeighborDepth: number;
	readonly objectId: number;
	readonly pass: 0 | 1 | 2 | 3;
	readonly revealAt: number; // Monotonically non-decreasing in [0.01, 0.985]
	// Precomputed deterministic texture traits from 'texture' stream (independent of render resolution)
	readonly edgeH1: number;
	readonly edgeH2: number;
	readonly edgeH3: number;
	readonly edgePhase1: number;
	readonly edgePhase2: number;
	readonly bristlePhase: number;
	readonly opacityBase: number;
	readonly impasto: number;
}

export interface CropRect {
	readonly x: number; // Logical X top-left
	readonly y: number; // Logical Y top-left
	readonly width: number; // Logical width
	readonly height: number; // Logical height
}

export interface PaintingModel {
	readonly state: PointillismState;
	readonly scene: SceneModel;
	readonly hierarchy: CandidateHierarchy;
	readonly activeCount: number;
	readonly scheduledMarks: readonly ScheduledMark[];
	readonly description: string;
}

export const INITIAL_CURATED_SEED = 418206;

export const CURATED_SCENE_SEEDS: Record<SceneFamilyId, number> = {
	'river-path': INITIAL_CURATED_SEED,
	'neighborhood-street': 529314,
	'plaza-market': 684129,
	'hill-country-creek': 793409
};

export const SCENE_FAMILIES: readonly SceneFamilySpec[] = [
	{
		id: 'river-path',
		label: 'San Antonio river path',
		shortLabel: 'River path',
		description:
			'Shaded limestone walkways, river bends, mature bald cypress, live oak, and pecan canopy, bridges, and reflections.',
		defaultSeed: CURATED_SCENE_SEEDS['river-path']
	},
	{
		id: 'neighborhood-street',
		label: 'Neighborhood street & porch',
		shortLabel: 'Street & porch',
		description:
			'Lived-in residential porches, small corner storefronts, sidewalks, crape myrtles and oaks, and everyday errands.',
		defaultSeed: CURATED_SCENE_SEEDS['neighborhood-street']
	},
	{
		id: 'plaza-market',
		label: 'Public plaza, park, or market',
		shortLabel: 'Plaza & market',
		description:
			'Open stone plazas, shaded park lawns, benches, weekend produce or flower stalls, and unhurried gathering spaces.',
		defaultSeed: CURATED_SCENE_SEEDS['plaza-market']
	},
	{
		id: 'hill-country-creek',
		label: 'Hill Country creek & trail',
		shortLabel: 'Hill Country',
		description:
			'Rolling Cretaceous limestone ledges, live oak and Ashe juniper cover, rocky spring-fed creeks, and quiet trails.',
		defaultSeed: CURATED_SCENE_SEEDS['hill-country-creek']
	}
];

export const KNOB_SPECS: readonly KnobSpec[] = [
	{
		key: 'dotSize',
		label: 'Dot size',
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 40,
		minLabel: 'Fine',
		maxLabel: 'Broad',
		description: 'Make the individual paint marks smaller or larger.'
	},
	{
		key: 'dotSpacing',
		label: 'Dot spacing',
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 35,
		minLabel: 'Tight',
		maxLabel: 'Open',
		description: 'Leave more or less room between the marks.'
	},
	{
		key: 'paletteContrast',
		label: 'Palette contrast',
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 45,
		minLabel: 'Soft',
		maxLabel: 'Crisp',
		description: 'Increase or soften the difference between light and dark.'
	},
	{
		key: 'colorVariation',
		label: 'Color variation',
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 40,
		minLabel: 'Close',
		maxLabel: 'Varied',
		description: 'Use a narrower or wider range of neighboring colors.'
	}
];

export const SECONDARY_KNOB_SPECS: Record<SecondaryKnobKey, SecondaryKnobSpec> = {
	paintTexture: {
		key: 'paintTexture',
		label: 'Paint texture',
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 45,
		minLabel: 'Smooth',
		maxLabel: 'Impasto',
		description: 'Adjust canvas weave, dab edge irregularity, and subtle bristle marks.'
	},
	paintingTime: {
		key: 'paintingTime',
		label: 'Painting time',
		min: 4,
		max: 20,
		step: 1,
		defaultValue: 10,
		minLabel: '4 s',
		maxLabel: '20 s',
		description: 'Set how long the progressive dot reveal takes from ground to final accents.'
	}
};

export const DEFAULT_ARTBOARD_WIDTH = 1200;
export const DEFAULT_ARTBOARD_HEIGHT = 800;

export const DEFAULT_POINTILLISM_STATE: PointillismState = {
	version: POINTILLISM_GENERATOR_VERSION,
	seed: INITIAL_CURATED_SEED,
	sceneFamily: 'river-path',
	dotSize: 40,
	dotSpacing: 35,
	paletteContrast: 45,
	colorVariation: 40,
	paintTexture: 45,
	paintingTime: 10,
	artboardWidth: DEFAULT_ARTBOARD_WIDTH,
	artboardHeight: DEFAULT_ARTBOARD_HEIGHT
};

export const DEFAULT_VIEW_STATE: ViewState = {
	mode: 'fill',
	inspectZoom: 3.2,
	inspectCenterX: 0.5,
	inspectCenterY: 0.54
};
