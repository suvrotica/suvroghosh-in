export type Vec3 = [number, number, number];

export type NeighborhoodId =
	| 'old-town'
	| 'lighthouse-district'
	| 'teapot-quarter'
	| 'lantern-district'
	| 'colorful-urban'
	| 'floating-village';

export type ExplorationMode = 'diorama' | 'third-person' | 'first-person';

export type MoodPresetId = 'morning' | 'golden-hour' | 'blue-hour' | 'lantern-night';

export type LandmarkId =
	| 'casa-del-gatto-nero'
	| 'crooked-clock-arch'
	| 'fountain-paper-boats'
	| 'keepers-cottage-lighthouse'
	| 'windward-rookery-spire'
	| 'mussel-pier-boathouse'
	| 'grand-blue-kettle'
	| 'copper-espresso-patisserie'
	| 'chamomile-conservatory'
	| 'apothecary-red-eaves'
	| 'crag-of-nine-lanterns'
	| 'crimson-moon-bridge'
	| 'ramen-lemonade-corner'
	| 'turquoise-maru-mado-loft'
	| 'tangled-wire-vinyl-alley'
	| 'sky-ship-observatory'
	| 'upside-down-tea-pavilion'
	| 'gossamer-stair-tower';

export type SecretId =
	| 'black-cat'
	| 'mouse-door'
	| 'spout-teacup'
	| 'mystery-vending'
	| 'owl-telescope'
	| 'glowing-jar'
	| 'cloud-bell'
	| 'edge-lantern';

export interface CameraViewSpec {
	position: Vec3;
	target: Vec3;
	fov?: number;
}

export interface NeighborhoodSpec {
	id: NeighborhoodId;
	number: number;
	name: string;
	subtitle: string;
	shortLabel: string;
	accentHex: string;
	badgeBg: string;
	description: string;
	architecturalNotes: string;
	paletteSwatches: string[];
	camera: CameraViewSpec;
	walkSpawn: Vec3;
	walkHeadingRad: number;
	labelAnchor: Vec3;
}

export interface LandmarkSpec {
	id: LandmarkId;
	neighborhoodId: NeighborhoodId;
	name: string;
	subtitle: string;
	materials: string[];
	story: string;
	residentNote: string;
	architecturalDetail: string;
	focusTarget: Vec3;
	cameraOffset: Vec3;
	walkEntrance: Vec3;
	labelAnchor: Vec3;
}

export interface SecretCuriositySpec {
	id: SecretId;
	neighborhoodId: NeighborhoodId;
	title: string;
	hint: string;
	story: string;
	position: Vec3;
	triggerRadius: number;
}

export interface MoodPresetSpec {
	id: MoodPresetId;
	label: string;
	shortLabel: string;
	timeHours: number;
	summary: string;
}

export interface NavNode {
	id: string;
	position: Vec3;
	neighborhoodId: NeighborhoodId;
	kind: 'plaza' | 'street' | 'bridge' | 'stair' | 'skywalk' | 'entrance';
}

export interface NavEdge {
	from: string;
	to: string;
	width: number;
	kind: 'cobble' | 'bridge' | 'stair' | 'cliff' | 'skywalk';
	waypoints?: Vec3[];
}

export interface BuildingObstacle {
	id: string;
	x: number;
	z: number;
	radiusX: number;
	radiusZ: number;
	minY: number;
	maxY: number;
}

export interface WalkerState {
	position: Vec3;
	headingRad: number;
	speed: number;
	stridePhase: number;
	activePath: Vec3[];
	targetLandmarkId: LandmarkId | null;
}

export interface CityViewerState {
	mode: ExplorationMode;
	activeNeighborhood: NeighborhoodId | 'overview';
	selectedLandmarkId: LandmarkId | null;
	selectedSecretId: SecretId | null;
	mood: MoodPresetId;
	timeHours: number;
	showLabels: boolean;
	stopMotionCadence: boolean;
	soundEnabled: boolean;
	discoveredSecrets: SecretId[];
}

export interface ProjectedPin {
	id: string;
	kind: 'neighborhood' | 'landmark' | 'secret';
	label: string;
	sublabel?: string;
	accentHex: string;
	x: number;
	y: number;
	visible: boolean;
	distance: number;
	discovered?: boolean;
}

export interface HoverPickInfo {
	kind: 'landmark' | 'secret' | 'street' | null;
	id: string | null;
	label: string | null;
	subtitle: string | null;
	clientX: number;
	clientY: number;
}
