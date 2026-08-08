export const PERLIN_BLOOM_SCHEMA_VERSION = 1 as const;

export type PerlinBloomSchemaVersion = typeof PERLIN_BLOOM_SCHEMA_VERSION;
export type PresetId =
	| 'neon-orchid'
	| 'reactor-lotus'
	| 'solar-chrysalis'
	| 'kolkata-after-midnight'
	| 'ice-signal'
	| 'blacklight-dahlia'
	| 'monochrome-laser';
export type BloomView = 'artwork' | 'anatomy';
export type TipStyle = 'rounded' | 'pointed' | 'split' | 'recurved' | 'filamented';
export type QualityLevel = 'auto' | 'low' | 'high';
export type ConfigGroup = 'bloom' | 'noise' | 'motion' | 'boundary' | 'light';

export type Point2D = Readonly<{ x: number; y: number }>;

/**
 * Serializable state for one bloom. Animation time, pause state and transient pointer state are
 * deliberately kept out so a seed describes morphology rather than a particular frame.
 */
export type FlowerConfig = {
	seed: string;
	preset: PresetId;
	/** Palette may be changed independently without replacing the morphology preset. */
	palette: PresetId;
	view: BloomView;
	petals: number;
	whorls: number;
	bloomScale: number;
	petalLength: number;
	petalWidth: number;
	widthProfile: number;
	curl: number;
	symmetry: number;
	asymmetry: number;
	tipStyle: TipStyle;
	noiseStrength: number;
	noiseScale: number;
	domainWarp: number;
	octaves: number;
	falloff: number;
	noiseDrift: number;
	breath: number;
	rotation: number;
	pointerInfluence: number;
	trails: number;
	boxSize: number;
	constraint: number;
	ruptureThreshold: number;
	breakout: number;
	boxOpacity: number;
	boundaryPhysics: boolean;
	boxVisible: boolean;
	membraneOpacity: number;
	veinBrightness: number;
	glow: number;
	grain: number;
	pollen: number;
	quality: QualityLevel;
	motionEnabled: boolean;
};

export type NumericConfigKey = {
	[Key in keyof FlowerConfig]: FlowerConfig[Key] extends number ? Key : never;
}[keyof FlowerConfig];

export type ConfigRange = Readonly<{
	min: number;
	max: number;
	step: number;
	label: string;
	group: ConfigGroup;
	decimals: number;
	integer?: boolean;
}>;

export type BloomPalette = Readonly<{
	id: string;
	name: string;
	background: readonly [string, string, string];
	membranes: readonly [string, string, string];
	edge: string;
	vein: string;
	core: readonly [string, string];
	accent: string;
	rupture: string;
	pollen: string;
	box: string;
}>;

export type PerlinBloomPreset = Readonly<{
	id: PresetId;
	name: string;
	description: string;
	palette: BloomPalette;
	config: Readonly<Partial<Omit<FlowerConfig, 'seed' | 'preset' | 'palette' | 'view' | 'quality'>>>;
}>;

export type BloomSeeds = Readonly<{
	base: number;
	noise: number;
	morphology: number;
	particles: number;
	palette: number;
}>;

export type PetalRibbon = Readonly<{
	centerline: readonly Point2D[];
	tangents: readonly Point2D[];
	normals: readonly Point2D[];
	halfWidths: readonly number[];
	leftEdge: readonly Point2D[];
	rightEdge: readonly Point2D[];
	/** Closed outline: its final point is exactly its first point. */
	ribbon: readonly Point2D[];
}>;

export type PetalGeometry = PetalRibbon &
	Readonly<{
		id: string;
		index: number;
		whorlIndex: number;
		indexInWhorl: number;
		angle: number;
		length: number;
		maximumHalfWidth: number;
		boundaryDistances: readonly number[];
		crossesBoundary: boolean;
	}>;

export type WhorlGeometry = Readonly<{
	index: number;
	scale: number;
	angularOffset: number;
	petalIndices: readonly number[];
}>;

export type BloomBounds = Readonly<{
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}>;

export type BloomGeometry = Readonly<{
	seedHash: number;
	morphologyHash: string;
	center: Point2D;
	petals: readonly PetalGeometry[];
	whorls: readonly WhorlGeometry[];
	bounds: BloomBounds;
}>;

export type UrlStateIssue = Readonly<{
	parameter: string;
	message: string;
	value?: string;
}>;

export type ParsedPerlinBloomState = Readonly<{
	config: FlowerConfig;
	issues: readonly UrlStateIssue[];
	unsupportedVersion: boolean;
}>;

export type ExportFormat = 'png';

export type BloomExportPlan = Readonly<{
	format: ExportFormat;
	filename: string;
	width: number;
	height: number;
	requestedScale: number;
	scale: number;
	pixelCount: number;
	estimatedBytes: number;
	includeSignature: boolean;
	wasCapped: boolean;
	reasons: readonly string[];
}>;

export type ExportResult = Readonly<{
	blob: Blob;
	width: number;
	height: number;
	scale: number;
	wasCapped: boolean;
	filename: string;
}>;
