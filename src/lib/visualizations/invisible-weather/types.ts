export const INVISIBLE_WEATHER_SCHEMA_VERSION = 1 as const;

export type InvisibleWeatherSchemaVersion = typeof INVISIBLE_WEATHER_SCHEMA_VERSION;
export type NoiseMode = 'value' | 'gradient';
export type AngleMode = 'free' | 'orthogonal' | 'diagonal' | 'hexagonal' | 'alternating' | 'soft';
export type ThresholdMode = 'off' | 'river' | 'islands' | 'delta';
export type LayoutId = 'quiet-grid' | 'salon-wall' | 'cabinet' | 'triptych' | 'procession';
export type MotionMode = 'still' | 'breathe' | 'migrate';
export type Orientation = 'landscape' | 'portrait';
export type OrientationPreference = Orientation | 'auto';
export type MaskKind =
	| 'rectangle'
	| 'oval'
	| 'ellipse'
	| 'circle'
	| 'arch'
	| 'capsule'
	| 'diamond'
	| 'stepped-niche'
	| 'offset-diptych'
	| 'quadrilateral'
	| 'split-horizontal'
	| 'three-window'
	| 'river-band';

export type Point = Readonly<{ x: number; y: number }>;
export type MutablePoint = { x: number; y: number };

export type FieldSettings = Readonly<{
	noiseMode: NoiseMode;
	depth: 1 | 2 | 3 | 4;
	frequency: number;
	warpStrength: number;
	timeScale: number;
	seed: string;
}>;

export type ThresholdSettings = Readonly<{
	mode: ThresholdMode;
	centre: number;
	width: number;
	tail: number;
}>;

export type InvisibleWeatherState = {
	version: InvisibleWeatherSchemaVersion;
	seed: string;
	presetId: string;
	layout: LayoutId;
	artworkCount: number;
	paletteId: string;
	noiseMode: NoiseMode;
	depth: 1 | 2 | 3 | 4;
	frequency: number;
	warpStrength: number;
	angleMode: AngleMode;
	softness: number;
	thresholdMode: ThresholdMode;
	thresholdWidth: number;
	motion: MotionMode;
	phase: number;
	frozenPhase: number | null;
	selectedArtwork: number;
	pathDensity: number;
	pathLength: number;
	multiplier: number;
	turns: number;
	strokeWidth: number;
	dualInk: boolean;
	grain: number;
	shadow: number;
	frameFamily: string;
	orientation: OrientationPreference;
	speed: number;
};

export type GalleryState = InvisibleWeatherState;

export type InvisibleWeatherPreset = Readonly<{
	id: string;
	name: string;
	description: string;
	state: Readonly<
		Partial<
			Omit<InvisibleWeatherState, 'version' | 'seed' | 'presetId' | 'selectedArtwork' | 'phase'>
		>
	>;
}>;

export type InkPair = Readonly<{
	primary: string;
	secondary?: string;
	weight?: number;
}>;

export type PaletteGround = Readonly<{
	id: string;
	colour: string;
	pairs: readonly InkPair[];
}>;

export type PaletteFrame = Readonly<{
	outer: string;
	inner: string;
}>;

export type PaletteTrait =
	| 'colour-vision-friendly'
	| 'near-monochrome'
	| 'dark-wall'
	| 'pale-paper';

export type PaletteFamily = Readonly<{
	id: string;
	name: string;
	description: string;
	walls: readonly [string, string];
	frames: readonly PaletteFrame[];
	mats: readonly string[];
	grounds: readonly PaletteGround[];
	labelInk: string;
	accent?: string;
	traits?: readonly PaletteTrait[];
}>;

export type PaletteValidationIssue = Readonly<{
	paletteId: string;
	groundId: string;
	pairIndex: number;
	kind: 'contrast' | 'perceptual-separation' | 'format' | 'missing-pair';
	message: string;
	actual?: number;
	minimum?: number;
}>;

export type NormalizedFrame = Readonly<{
	id: string;
	artworkIndex: number;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	zIndex: number;
	primary: boolean;
}>;

export type ArtworkRecipe = Readonly<{
	id: string;
	index: number;
	seed: string;
	field: FieldSettings;
	/** A decorrelated shared field used only for threshold/secondary-ink classification. */
	secondaryField?: FieldSettings;
	angleMode: AngleMode;
	softness: number;
	threshold: ThresholdSettings;
	mask: MaskKind;
	paletteId: string;
	groundId: string;
	ground: string;
	primaryInk: string;
	secondaryInk?: string;
	pathDensity: number;
	pathLength: number;
	pathCount: number;
	lineWidth: number;
	multiplier: number;
	turns: number;
	dualInk: boolean;
	grain: number;
	shadow: number;
	frameFamily: string;
	speed: number;
	localTransform: Readonly<{
		rotation: number;
		scaleX: number;
		scaleY: number;
		offsetX: number;
		offsetY: number;
		mirrorX: boolean;
	}>;
	secondaryTransform?: Readonly<{
		rotation: number;
		scaleX: number;
		scaleY: number;
		offsetX: number;
		offsetY: number;
		mirrorX: boolean;
	}>;
	phaseOffset: number;
	geometrySamples: readonly number[];
}>;

export type ExhibitionRecipe = Readonly<{
	schemaVersion: InvisibleWeatherSchemaVersion;
	recipeHash: string;
	seed: string;
	presetId: string;
	layout: LayoutId;
	artworkCount: number;
	paletteId: string;
	motion: MotionMode;
	frozenPhase: number | null;
	grain: number;
	shadow: number;
	frameFamily: string;
	orientation: OrientationPreference;
	speed: number;
	artworks: readonly ArtworkRecipe[];
	landscapeFrames: readonly NormalizedFrame[];
	portraitFrames: readonly NormalizedFrame[];
}>;

export type GeneratedPath = Readonly<{
	points: readonly Point[];
	ink: 'primary' | 'secondary';
	alpha: number;
	width: number;
}>;

export type UrlStateIssue = Readonly<{
	parameter: string;
	message: string;
	value?: string;
}>;

export type ParsedInvisibleWeatherState = Readonly<{
	state: InvisibleWeatherState;
	issues: readonly UrlStateIssue[];
	unsupportedVersion: boolean;
}>;

export type ExportFormat = 'png' | 'json';

export type ExportPlan = Readonly<{
	format: ExportFormat;
	width: number;
	height: number;
	scale: number;
	orientation: Orientation;
	filename: string;
	pixelCount: number;
}>;

export type InvisibleWeatherJsonExport = Readonly<{
	schemaVersion: InvisibleWeatherSchemaVersion;
	artifact: 'Invisible Weather exhibition';
	createdBy: 'suvroghosh.in';
	recipeHash: string;
	state: InvisibleWeatherState;
	recipe: ExhibitionRecipe;
}>;

export type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type RenderOptions = Readonly<{
	width: number;
	height: number;
	phase?: number;
	orientation?: Orientation;
	selectedArtwork?: number;
	background?: string;
	pathBudget?: number;
	pathCache?: Map<string, readonly GeneratedPath[]>;
}>;
