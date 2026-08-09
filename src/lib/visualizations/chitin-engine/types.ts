export const CHITIN_SCHEMA_VERSION = 1 as const;

export type Vec2 = Readonly<{ x: number; y: number }>;

export type MutableVec2 = { x: number; y: number };

export type BodyPlanFamily =
	| 'terrestrial-insect'
	| 'terrestrial-arachnid'
	| 'myriapod'
	| 'armoured-crawler'
	| 'xeno-bilateral'
	| 'xeno-radial'
	| 'unclassified';

export type Discipline = 'terrestrial-discipline' | 'xeno-license';

export type WorldId =
	| 'terminator-line'
	| 'basalt-gravity-well'
	| 'methane-twilight'
	| 'brine-under-ice'
	| 'orbital-ruin'
	| 'ashfall-terrarium'
	| 'monsoon-megacity-2097'
	| 'red-dune-cathedral';

export type PresetId =
	| 'glassback-knifemite'
	| 'reactor-mantis'
	| 'basalt-widow'
	| 'brine-cathedral-centipede'
	| 'orbital-hull-mite'
	| 'monsoon-drain-oracle'
	| 'terminator-needlewalker'
	| 'ashfall-scarab'
	| 'methane-lantern-crawler'
	| 'red-dune-whipbeast'
	| 'frostglass-plate-crawler'
	| 'unfiled-specimen';

export type MaterialId =
	| 'obsidian-iridescent'
	| 'iridescent-chitin'
	| 'oxidized-metal'
	| 'ceramic-bone'
	| 'translucent-brine'
	| 'velvet-black'
	| 'reactor-enamel';

export type PaletteId =
	| 'ultraviolet-petrol'
	| 'reactor-acid'
	| 'cobalt-velvet'
	| 'brine-frost'
	| 'orbital-cyan'
	| 'monsoon-tram'
	| 'dune-gold'
	| 'ash-ember'
	| 'methane-lantern'
	| 'high-contrast';

export type GaitFamily =
	| 'tripod'
	| 'arachnoid-scuttle'
	| 'wave'
	| 'stalk'
	| 'skitter'
	| 'clamp-crawl'
	| 'dormant';

export type ViewMode =
	| 'specimen'
	| 'anatomy'
	| 'gait'
	| 'surface'
	| 'silhouette'
	| 'fluorescence'
	| 'depth';

export type QualityLevel = 'auto' | 'low' | 'medium' | 'high';

export type EyeLayout =
	| 'frontal-pair'
	| 'lateral-compound'
	| 'clustered-lenses'
	| 'dorsal-ocelli'
	| 'asymmetric-cluster'
	| 'annular'
	| 'sensory-pits'
	| 'none';

export type WingMode = 'none' | 'folded' | 'half-open' | 'display' | 'dormant';

export type TerminalModule = 'none' | 'split-cerci' | 'tail' | 'fan' | 'stinger-form' | 'lure';

export type GenomeGroup =
	| 'body'
	| 'armour'
	| 'limbs'
	| 'senses'
	| 'ornaments'
	| 'surface'
	| 'motion'
	| 'color'
	| 'world';

export type MutationLocks = Readonly<Record<GenomeGroup, boolean>>;

export type CreatureGenome = {
	readonly schemaVersion: typeof CHITIN_SCHEMA_VERSION;
	readonly seed: string;
	readonly preset: PresetId;
	readonly discipline: Discipline;
	readonly bodyPlan: BodyPlanFamily;
	readonly world: WorldId;
	readonly worldInfluence: number;

	readonly bodySegments: number;
	readonly bodyRegions: number;
	readonly bodyLength: number;
	readonly bodyWidth: number;
	readonly headScale: number;
	readonly centralScale: number;
	readonly terminalScale: number;
	readonly axisCurvature: number;
	readonly lateralBend: number;
	readonly dorsalArch: number;
	readonly taper: number;
	readonly compression: number;
	readonly segmentOverlap: number;
	readonly membraneExposure: number;
	readonly symmetry: number;
	readonly asymmetry: number;

	readonly shellExponent: number;
	readonly lateralFlare: number;
	readonly dorsalRidge: number;
	readonly ridgeSharpness: number;
	readonly serration: number;
	readonly spineDensity: number;

	readonly walkingLegPairs: number;
	readonly graspingPairs: number;
	readonly legBones: number;
	readonly legLength: number;
	readonly legThickness: number;
	readonly stanceWidth: number;
	readonly clawCount: number;

	readonly eyeCount: number;
	readonly eyeScale: number;
	readonly eyeAsymmetry: number;
	readonly eyeLayout: EyeLayout;
	readonly antennaCount: number;
	readonly antennaLength: number;
	readonly palpLength: number;
	readonly wingMode: WingMode;
	readonly terminalModule: TerminalModule;

	readonly material: MaterialId;
	readonly cellularScale: number;
	readonly cellularContrast: number;
	readonly poreDensity: number;
	readonly bristleDensity: number;
	readonly corrosion: number;
	readonly iridescence: number;
	readonly roughness: number;
	readonly fluorescence: number;
	readonly membraneTranslucency: number;
	readonly palette: PaletteId;
	readonly eyeEmission: number;
	readonly seamEmission: number;

	readonly gait: GaitFamily;
	readonly cadence: number;
	readonly stanceRatio: number;
	readonly swingHeight: number;
	readonly bodyBob: number;
	readonly idleMotion: number;
	readonly appendageLag: number;
	readonly startle: number;
	readonly threatIntensity: number;
};

export type ExhibitState = {
	readonly genome: CreatureGenome;
	readonly view: ViewMode;
	readonly quality: QualityLevel;
	readonly paused: boolean;
	readonly cameraYaw: number;
	readonly cameraPitch: number;
	readonly cameraRoll: number;
	readonly scannerIntensity: number;
	readonly bloom: number;
	readonly grain: number;
	readonly chromaticFault: number;
};

export type GenomeIssue = Readonly<{
	field: string;
	message: string;
}>;

export type GenomeValidationResult = Readonly<{
	genome: CreatureGenome;
	issues: readonly GenomeIssue[];
}>;

export type GraphNodeKind =
	| 'body-region'
	| 'body-segment'
	| 'walking-limb'
	| 'grasping-limb'
	| 'eye'
	| 'antenna'
	| 'wing'
	| 'terminal';

export type BodyGraphNode = Readonly<{
	id: string;
	kind: GraphNodeKind;
	region: number;
	segmentIndex: number;
}>;

export type BodyGraphEdge = Readonly<{
	from: string;
	to: string;
	kind: 'axial' | 'attachment' | 'paired';
}>;

export type AppendageSocket = Readonly<{
	id: string;
	segmentIndex: number;
	side: -1 | 1 | 0;
	kind: 'walking' | 'grasping' | 'antenna' | 'wing' | 'terminal';
}>;

export type BodyGraph = Readonly<{
	nodes: readonly BodyGraphNode[];
	edges: readonly BodyGraphEdge[];
	sockets: readonly AppendageSocket[];
	regionBoundaries: readonly number[];
}>;

export type AxisPoint = Readonly<{
	s: number;
	position: Vec2;
	tangent: Vec2;
	normal: Vec2;
	depth: number;
}>;

export type BodyPlate = Readonly<{
	id: string;
	segmentIndex: number;
	region: number;
	center: Vec2;
	tangent: Vec2;
	normal: Vec2;
	width: number;
	height: number;
	rotation: number;
	depth: number;
	exponent: number;
	lobeAmplitude: number;
	lobeCount: number;
	ridge: number;
	seed: number;
	damage: number;
	selected?: boolean;
}>;

export type LimbPhenotype = Readonly<{
	id: string;
	kind: 'walking' | 'grasping' | 'paddle' | 'clamp' | 'ventral';
	rootSegment: number;
	side: -1 | 1;
	pairIndex: number;
	rootOffset: number;
	boneLengths: readonly number[];
	thicknesses: readonly number[];
	preferredBend: -1 | 1;
	phaseOffset: number;
	clawCount: number;
	depth: number;
}>;

export type EyePhenotype = Readonly<{
	id: string;
	segmentIndex: number;
	local: Vec2;
	radius: number;
	depth: number;
	seed: number;
}>;

export type FlexibleAppendagePhenotype = Readonly<{
	id: string;
	kind: 'antenna' | 'palp' | 'tail' | 'cercus' | 'lure';
	rootSegment: number;
	side: -1 | 1 | 0;
	lengths: readonly number[];
	depth: number;
}>;

export type WingPhenotype = Readonly<{
	id: string;
	rootSegment: number;
	side: -1 | 1;
	outline: readonly Vec2[];
	veins: readonly (readonly [Vec2, Vec2])[];
	depth: number;
}>;

export type SurfaceSample = Readonly<{
	plateIndex: number;
	local: Vec2;
	kind: 'pore' | 'bristle' | 'spine' | 'pit';
	scale: number;
	angle: number;
}>;

export type CreaturePhenotype = Readonly<{
	genome: CreatureGenome;
	baseGenome: CreatureGenome;
	graph: BodyGraph;
	axis: readonly AxisPoint[];
	plates: readonly BodyPlate[];
	limbs: readonly LimbPhenotype[];
	eyes: readonly EyePhenotype[];
	flexibleAppendages: readonly FlexibleAppendagePhenotype[];
	wings: readonly WingPhenotype[];
	surfaceSamples: readonly SurfaceSample[];
	archiveDesignation: string;
	informalName: string;
	habitatNote: string;
	proceduralSummary: string;
	fingerprint: string;
}>;

export type LimbPose = {
	id: string;
	joints: MutableVec2[];
	target: MutableVec2;
	phase: number;
	planted: boolean;
};

export type ConstraintChainState = {
	positions: Float32Array;
	previous: Float32Array;
	lengths: Float32Array;
	count: number;
};

export type CreaturePose = {
	time: number;
	limbs: LimbPose[];
	flexible: Map<string, ConstraintChainState>;
	bodyOffset: MutableVec2;
	threat: number;
	startle: number;
};

export type RenderPacket = {
	plates: Float32Array;
	plateCount: number;
	capsules: Float32Array;
	capsuleCount: number;
	view: ViewMode;
	selectedSegment: number;
};

export type PaletteDefinition = Readonly<{
	id: PaletteId;
	name: string;
	background: readonly [number, number, number];
	chamber: readonly [number, number, number];
	shellA: readonly [number, number, number];
	shellB: readonly [number, number, number];
	membrane: readonly [number, number, number];
	emission: readonly [number, number, number];
	eye: readonly [number, number, number];
	corrosion: readonly [number, number, number];
}>;

export type WorldPreset = Readonly<{
	id: WorldId;
	name: string;
	medium: 'atmosphere' | 'dense-fluid' | 'vacuum-fiction';
	gravity: number;
	abrasion: number;
	opacity: number;
	temperature: 'cryogenic' | 'cold' | 'temperate' | 'hot';
	palette: PaletteId;
	fiction: string;
	mechanism: string;
}>;

export type CreaturePreset = Readonly<{
	id: PresetId;
	name: string;
	designation: string;
	description: string;
	reason: string;
	genome: CreatureGenome;
}>;

export type MutationResult = Readonly<{
	genome: CreatureGenome;
	index: number;
	changedGroups: readonly GenomeGroup[];
}>;

export type ArchiveRecord = Readonly<{
	version: 1;
	id: string;
	label: string;
	createdAt: string;
	genome: CreatureGenome;
}>;

export type ArchiveLoadResult = Readonly<{
	records: readonly ArchiveRecord[];
	issues: readonly string[];
}>;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
