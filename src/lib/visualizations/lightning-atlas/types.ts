export type Vec3 = {
	x: number;
	y: number;
	z: number;
};

export type TerrainPresetId =
	| 'monsoon-delta'
	| 'himalayan-ridge'
	| 'coastal-shelf'
	| 'forest-basin'
	| 'desert-escarpment'
	| 'urban-plain'
	| 'open-ocean'
	| 'volcanic-island';

export type AtlasMode = 'live' | 'study' | 'replay' | 'cross-section';
export type DisplayMode = 'night' | 'field-map';
export type FlashType = 'negative-cg' | 'positive-cg' | 'intra-cloud';
export type FlashTypeChoice = FlashType | 'storm-decides';
export type CameraPreset = 'overview' | 'observer' | 'attachment' | 'follow';
export type QualityChoice = 'auto' | 'low' | 'medium' | 'high';
export type QualityTier = Exclude<QualityChoice, 'auto'>;

export type LayerId = 'field' | 'charge' | 'branches' | 'streamers' | 'ground-current' | 'contours';

export type AttachmentKind =
	| 'terrain'
	| 'ridge'
	| 'tree'
	| 'tree-cluster'
	| 'radio-mast'
	| 'lightning-rod'
	| 'low-building'
	| 'high-rise'
	| 'water-tower'
	| 'wind-turbine'
	| 'transmission-tower'
	| 'lighthouse'
	| 'ocean-surface'
	| 'ship'
	| 'offshore-platform'
	| 'volcanic-cone';

export type PlaceableFeatureKind = Exclude<
	AttachmentKind,
	'terrain' | 'ridge' | 'ocean-surface' | 'ship' | 'offshore-platform' | 'volcanic-cone'
>;

export type StormPhase =
	| 'charging'
	| 'cloud-breakdown'
	| 'leader'
	| 'streamers'
	| 'attachment'
	| 'return-stroke'
	| 'in-cloud-pulse'
	| 'subsequent-stroke'
	| 'afterglow'
	| 'thunder-pending'
	| 'recharging';

export type ChargePocket = {
	id: string;
	polarity: -1 | 1;
	center: Vec3;
	radii: Vec3;
	strength: number;
	softness: number;
	drift: Vec3;
};

export type AttachmentCandidate = {
	id: string;
	kind: AttachmentKind;
	label: string;
	position: Vec3;
	baseElevation: number;
	absoluteHeight: number;
	localProminence: number;
	isolation: number;
	tipFactor: number;
	conductivityFactor: number;
	streamerThreshold: number;
	userPlaced?: boolean;
	rotation?: number;
};

export type PlacedFeature = {
	id: string;
	kind: PlaceableFeatureKind;
	x: number;
	z: number;
	rotation: number;
};

export type TerrainData = {
	preset: TerrainPresetId;
	seed: string;
	widthMetres: number;
	depthMetres: number;
	resolution: number;
	heights: Float32Array;
	waterMask: Uint8Array;
	materialMask: Uint8Array;
	wetness: Float32Array;
	candidates: AttachmentCandidate[];
	minHeight: number;
	maxHeight: number;
};

export type LightningSegment = {
	start: Vec3;
	end: Vec3;
	parentIndex: number;
	branchDepth: number;
	birthStep: number;
	energy: number;
	isMainChannel: boolean;
	isAttachmentConnection?: boolean;
};

export type UpwardStreamer = {
	id: string;
	candidateId: string;
	candidateLabel: string;
	start: Vec3;
	end: Vec3;
	startedAtStep: number;
	won: boolean;
};

export type Attachment = {
	candidateId: string;
	kind: AttachmentKind;
	label: string;
	position: Vec3;
	elevationMetres: number;
	modelScore: number;
};

export type PhaseEvent = {
	phase: StormPhase;
	startTime: number;
	endTime: number;
	label: string;
	segmentRange?: [number, number];
};

export type LightningFlash = {
	id: string;
	seed: string;
	strikeIndex: number;
	type: FlashType;
	startedAt: number;
	segments: LightningSegment[];
	streamers: UpwardStreamer[];
	attachment?: Attachment;
	mainPath: number[];
	phaseEvents: PhaseEvent[];
	relativeIntensity: number;
	channelLengthMetres: number;
	mainChannelLengthMetres: number;
	branchCount: number;
	maximumBranchDepth: number;
	thunderDelaySeconds: number;
	thunderArrivalTime: number;
	observerDistanceMetres: number;
	hasSubsequentStroke: boolean;
	narrative: string;
	channelHash: string;
	modelState: SerializableAtlasState;
};

export type StormParameters = {
	chargeStrength: number;
	chargeSeparation: number;
	branching: number;
	leaderPersistence: number;
	cloudBaseMetres: number;
	lowerPositiveCharge: boolean;
};

export type EnvironmentParameters = {
	windSpeed: number;
	windDirection: number;
	rainIntensity: number;
	visibility: number;
	surfaceWetness: number;
	conductivityProxy: number;
	timeOfDay: number;
};

export type NormalizedPosition = {
	x: number;
	z: number;
};

export type SerializableAtlasState = {
	version: 1;
	seed: string;
	terrain: TerrainPresetId;
	mode: AtlasMode;
	displayMode: DisplayMode;
	flashType: FlashTypeChoice;
	stormPosition: NormalizedPosition;
	storm: StormParameters;
	environment: EnvironmentParameters;
	observer: NormalizedPosition;
	cameraPreset: CameraPreset;
	visibleLayers: LayerId[];
	selectedStrikeIndex: number;
	placedFeatures: PlacedFeature[];
	flashSafe: boolean;
	quality: QualityChoice;
};

export type FeatureFrequency = {
	candidateId: string;
	label: string;
	kind: AttachmentKind;
	count: number;
	frequency: number;
};

export type BatchAnalysisResult = {
	seed: string;
	terrain: TerrainPresetId;
	runs: number;
	groundFlashCount: number;
	frequencies: FeatureFrequency[];
	heatmap: Array<{ x: number; z: number; count: number }>;
	durationMs: number;
};

export type GenerateFlashInput = {
	state: SerializableAtlasState;
	strikeIndex: number;
	terrain?: TerrainData;
};

export type BatchAnalysisInput = {
	state: SerializableAtlasState;
	runs: number;
};

export type AtlasWorkerRequest =
	| { id: number; type: 'generate-flash'; input: GenerateFlashInput }
	| { id: number; type: 'analyse-batch'; input: BatchAnalysisInput }
	| { id: number; type: 'cancel'; targetId: number };

export type AtlasWorkerResponse =
	| { id: number; type: 'flash'; flash: LightningFlash; terrain: TerrainData }
	| { id: number; type: 'batch'; result: BatchAnalysisResult }
	| { id: number; type: 'cancelled' }
	| { id: number; type: 'error'; message: string };

export type TerrainPresetDefinition = {
	id: TerrainPresetId;
	name: string;
	shortName: string;
	region: string;
	description: string;
	studyNote: string;
	cloudBaseMetres: number;
	defaultWetness: number;
	accent: string;
	experimental?: boolean;
};

export type EngineLimits = {
	maximumIterations: number;
	maximumSegments: number;
	maximumActiveTips: number;
	maximumBranchDepth: number;
	maximumPlacedFeatures: number;
	maximumStrikeIndex: number;
	minimumSegmentMetres: number;
	maximumSegmentMetres: number;
};
