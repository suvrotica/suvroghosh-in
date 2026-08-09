/**
 * Authored ground-plane geometry for the Calcutta Footpath Simulator.
 *
 * Coordinates are metres. `x` increases east and `z` increases north. Street
 * edges are undirected walking corridors whose centre lines may bend between
 * graph nodes. Density and probability values are normalized to [0, 1].
 */

export interface WorldPoint {
	readonly x: number;
	readonly z: number;
}

export type StreetArchetype =
	| 'main-spine'
	| 'residential-lane'
	| 'bazaar-lane'
	| 'workshop-lane'
	| 'old-house-lane'
	| 'connector-lane'
	| 'courtyard-passage'
	| 'wider-road';

export type StreetLighting = 'open-sun' | 'broken-shade' | 'deep-shade' | 'shop-glow';

export type StreetSurface =
	| 'patched-asphalt'
	| 'worn-asphalt'
	| 'stone-and-asphalt'
	| 'broken-paving'
	| 'packed-earth-edge'
	| 'workshop-concrete';

export interface TemporaryBlockageProfile {
	readonly chance: number;
	readonly kinds: readonly (
		| 'delivery-cart'
		| 'parked-bicycle'
		| 'street-dog'
		| 'tea-crowd'
		| 'road-work'
		| 'carried-load'
	)[];
	readonly resolvesAfterSeconds: readonly [minimum: number, maximum: number];
}

export interface SpatialNode {
	readonly id: string;
	readonly label: string;
	readonly kind: 'start' | 'junction' | 'turn' | 'dead-end' | 'courtyard' | 'destination';
	readonly position: WorldPoint;
}

export interface SpatialEdge {
	readonly id: string;
	readonly from: string;
	readonly to: string;
	/** Intermediate centre-line points; endpoints come from `from` and `to`. */
	readonly via: readonly WorldPoint[];
	readonly widthM: number;
	readonly archetype: StreetArchetype;
	readonly traffic: number;
	readonly pedestrianDensity: number;
	readonly lighting: StreetLighting;
	readonly surface: StreetSurface;
	readonly shopDensity: number;
	readonly animalChance: number;
	readonly blockage: TemporaryBlockageProfile | null;
	readonly weatherExposure: number;
}

export interface LandmarkPlacement {
	readonly id: string;
	readonly label: string;
	readonly kind:
		| 'large-tree'
		| 'corner-shop'
		| 'old-balcony'
		| 'courtyard-gate'
		| 'workshop-shutter'
		| 'red-house'
		| 'water-pump';
	readonly position: WorldPoint;
	readonly facingRadians: number;
	readonly edgeId: string;
	readonly visibleOnMinimap: boolean;
}

export interface StreetSignPlacement {
	readonly id: string;
	readonly edgeId: string;
	readonly position: WorldPoint;
	readonly facingRadians: number;
	readonly english: string;
	readonly bengali: string;
}

export interface StallPlacement {
	readonly id: string;
	readonly edgeId: string;
	readonly position: WorldPoint;
	readonly facingRadians: number;
	readonly kind: 'tea' | 'fuchka' | 'mishti' | 'ghugni';
	readonly label: string;
	readonly footprintM: readonly [width: number, depth: number];
	readonly visibleOnMinimap: boolean;
}

export interface SpatialWorld {
	readonly id: string;
	readonly unit: 'metre';
	readonly startNodeId: string;
	readonly destinationNodeId: string;
	readonly nodes: readonly SpatialNode[];
	readonly edges: readonly SpatialEdge[];
	readonly landmarks: readonly LandmarkPlacement[];
	readonly signs: readonly StreetSignPlacement[];
	readonly stalls: readonly StallPlacement[];
}

export interface WorldBounds {
	readonly minX: number;
	readonly maxX: number;
	readonly minZ: number;
	readonly maxZ: number;
	readonly widthM: number;
	readonly depthM: number;
	readonly centre: WorldPoint;
}

export interface NearestWalkableEdge {
	readonly edge: SpatialEdge;
	readonly point: WorldPoint;
	readonly distanceToCentrelineM: number;
	readonly offsetM: number;
	readonly edgeLengthM: number;
	readonly segmentIndex: number;
	readonly segmentT: number;
}

export interface NearestWalkablePoint extends NearestWalkableEdge {
	readonly walkablePoint: WorldPoint;
	readonly distanceM: number;
}

export interface SpatialQueryOptions {
	readonly world?: SpatialWorld;
	readonly blockedEdgeIds?: ReadonlySet<string> | readonly string[];
}

export interface SpatialPathOptions extends SpatialQueryOptions {
	/** Radius of the moving body; edges narrower than its diameter are excluded. */
	readonly radiusM?: number;
}

export interface SpatialPath {
	readonly distanceM: number;
	readonly points: readonly WorldPoint[];
	readonly edgeIds: readonly string[];
	readonly nodeIds: readonly string[];
	readonly start: WorldPoint;
	readonly end: WorldPoint;
	readonly requestedStart: WorldPoint;
	readonly requestedEnd: WorldPoint;
	readonly startSnapDistanceM: number;
	readonly endSnapDistanceM: number;
}

type EdgeProfile = Pick<
	SpatialEdge,
	| 'widthM'
	| 'traffic'
	| 'pedestrianDensity'
	| 'lighting'
	| 'surface'
	| 'shopDensity'
	| 'animalChance'
	| 'blockage'
	| 'weatherExposure'
>;

const DELIVERY_BLOCKAGE: TemporaryBlockageProfile = {
	chance: 0.2,
	kinds: ['delivery-cart', 'carried-load'],
	resolvesAfterSeconds: [12, 28]
};

const QUIET_BLOCKAGE: TemporaryBlockageProfile = {
	chance: 0.16,
	kinds: ['parked-bicycle', 'street-dog'],
	resolvesAfterSeconds: [8, 24]
};

const BAZAAR_BLOCKAGE: TemporaryBlockageProfile = {
	chance: 0.28,
	kinds: ['tea-crowd', 'delivery-cart', 'carried-load'],
	resolvesAfterSeconds: [10, 32]
};

const EDGE_PROFILES: Readonly<Record<StreetArchetype, EdgeProfile>> = {
	'main-spine': {
		widthM: 4.6,
		traffic: 0.38,
		pedestrianDensity: 0.58,
		lighting: 'broken-shade',
		surface: 'patched-asphalt',
		shopDensity: 0.35,
		animalChance: 0.12,
		blockage: DELIVERY_BLOCKAGE,
		weatherExposure: 0.68
	},
	'residential-lane': {
		widthM: 3.1,
		traffic: 0.08,
		pedestrianDensity: 0.26,
		lighting: 'deep-shade',
		surface: 'stone-and-asphalt',
		shopDensity: 0.08,
		animalChance: 0.42,
		blockage: QUIET_BLOCKAGE,
		weatherExposure: 0.38
	},
	'bazaar-lane': {
		widthM: 3.7,
		traffic: 0.12,
		pedestrianDensity: 0.86,
		lighting: 'shop-glow',
		surface: 'broken-paving',
		shopDensity: 0.92,
		animalChance: 0.15,
		blockage: BAZAAR_BLOCKAGE,
		weatherExposure: 0.3
	},
	'workshop-lane': {
		widthM: 4.1,
		traffic: 0.24,
		pedestrianDensity: 0.44,
		lighting: 'broken-shade',
		surface: 'workshop-concrete',
		shopDensity: 0.61,
		animalChance: 0.08,
		blockage: DELIVERY_BLOCKAGE,
		weatherExposure: 0.55
	},
	'old-house-lane': {
		widthM: 3.35,
		traffic: 0.06,
		pedestrianDensity: 0.32,
		lighting: 'deep-shade',
		surface: 'stone-and-asphalt',
		shopDensity: 0.12,
		animalChance: 0.3,
		blockage: QUIET_BLOCKAGE,
		weatherExposure: 0.28
	},
	'connector-lane': {
		widthM: 2.55,
		traffic: 0.02,
		pedestrianDensity: 0.3,
		lighting: 'deep-shade',
		surface: 'broken-paving',
		shopDensity: 0.12,
		animalChance: 0.24,
		blockage: QUIET_BLOCKAGE,
		weatherExposure: 0.18
	},
	'courtyard-passage': {
		widthM: 2.35,
		traffic: 0,
		pedestrianDensity: 0.16,
		lighting: 'deep-shade',
		surface: 'packed-earth-edge',
		shopDensity: 0,
		animalChance: 0.54,
		blockage: QUIET_BLOCKAGE,
		weatherExposure: 0.2
	},
	'wider-road': {
		widthM: 9.4,
		traffic: 0.82,
		pedestrianDensity: 0.67,
		lighting: 'open-sun',
		surface: 'worn-asphalt',
		shopDensity: 0.54,
		animalChance: 0.04,
		blockage: null,
		weatherExposure: 0.94
	}
};

function edge(
	id: string,
	from: string,
	to: string,
	archetype: StreetArchetype,
	via: readonly WorldPoint[] = [],
	overrides: Partial<EdgeProfile> = {}
): SpatialEdge {
	return { id, from, to, archetype, via, ...EDGE_PROFILES[archetype], ...overrides };
}

const NODES: readonly SpatialNode[] = [
	{ id: 'south-gate', label: 'South lane entrance', kind: 'start', position: { x: -8, z: 0 } },
	{ id: 'spine-1', label: 'Neem corner', kind: 'junction', position: { x: -11, z: 26 } },
	{ id: 'spine-2', label: 'Medicine shop bend', kind: 'junction', position: { x: -6, z: 55 } },
	{ id: 'spine-3', label: 'Water-pump crossing', kind: 'junction', position: { x: -12, z: 86 } },
	{ id: 'spine-4', label: 'Red house corner', kind: 'junction', position: { x: -5, z: 119 } },
	{ id: 'spine-5', label: 'Balcony bend', kind: 'junction', position: { x: -9, z: 151 } },
	{
		id: 'spine-north',
		label: 'Rabindra road opening',
		kind: 'junction',
		position: { x: 1, z: 184 }
	},

	{ id: 'res-1', label: 'Residential dog-leg', kind: 'turn', position: { x: -35, z: 31 } },
	{ id: 'res-2', label: 'Blue gate', kind: 'junction', position: { x: -51, z: 56 } },
	{ id: 'res-3', label: 'Residential north bend', kind: 'junction', position: { x: -40, z: 81 } },
	{ id: 'res-court', label: 'Tulsi courtyard', kind: 'courtyard', position: { x: -71, z: 73 } },

	{ id: 'bazaar-1', label: 'Bazaar awning', kind: 'turn', position: { x: 18, z: 58 } },
	{ id: 'bazaar-2', label: 'Tea-glass corner', kind: 'junction', position: { x: 39, z: 70 } },
	{ id: 'bazaar-3', label: 'Bazaar north turn', kind: 'junction', position: { x: 33, z: 102 } },
	{ id: 'bazaar-dead', label: 'Closed market gate', kind: 'dead-end', position: { x: 62, z: 66 } },

	{ id: 'work-1', label: 'Cycle repair bend', kind: 'turn', position: { x: 18, z: 91 } },
	{ id: 'work-2', label: 'Metal workshop junction', kind: 'junction', position: { x: 44, z: 112 } },
	{ id: 'work-3', label: 'Timber stack bend', kind: 'junction', position: { x: 46, z: 140 } },
	{ id: 'work-yard', label: 'Delivery yard', kind: 'dead-end', position: { x: 69, z: 123 } },
	{ id: 'east-link', label: 'Railings passage', kind: 'turn', position: { x: 61, z: 165 } },

	{ id: 'old-1', label: 'Old balcony turn', kind: 'junction', position: { x: -32, z: 126 } },
	{ id: 'old-2', label: 'Shaded verandah bend', kind: 'turn', position: { x: -48, z: 151 } },
	{ id: 'old-3', label: 'North house corner', kind: 'junction', position: { x: -30, z: 176 } },
	{ id: 'old-court', label: 'Thakur-dalan gate', kind: 'courtyard', position: { x: -59, z: 129 } },

	{ id: 'wide-west', label: 'Western road edge', kind: 'turn', position: { x: -64, z: 187 } },
	{
		id: 'destination',
		label: 'Destination pharmacy',
		kind: 'destination',
		position: { x: 51, z: 197 }
	},
	{ id: 'wide-east', label: 'Eastern road edge', kind: 'dead-end', position: { x: 83, z: 202 } }
];

const EDGES: readonly SpatialEdge[] = [
	edge('spine-south-1', 'south-gate', 'spine-1', 'main-spine', [
		{ x: -5, z: 10 },
		{ x: -13, z: 19 }
	]),
	edge('spine-1-2', 'spine-1', 'spine-2', 'main-spine', [
		{ x: -15, z: 37 },
		{ x: -4, z: 46 }
	]),
	edge('spine-2-3', 'spine-2', 'spine-3', 'main-spine', [
		{ x: -3, z: 66 },
		{ x: -15, z: 76 }
	]),
	edge('spine-3-4', 'spine-3', 'spine-4', 'main-spine', [
		{ x: -15, z: 97 },
		{ x: -2, z: 108 }
	]),
	edge('spine-4-5', 'spine-4', 'spine-5', 'main-spine', [
		{ x: -1, z: 131 },
		{ x: -12, z: 141 }
	]),
	edge('spine-5-north', 'spine-5', 'spine-north', 'main-spine', [
		{ x: -13, z: 162 },
		{ x: -2, z: 174 }
	]),

	edge('res-entry', 'spine-1', 'res-1', 'residential-lane', [{ x: -23, z: 24 }]),
	edge('res-middle', 'res-1', 'res-2', 'residential-lane', [
		{ x: -44, z: 38 },
		{ x: -47, z: 48 }
	]),
	edge('res-north', 'res-2', 'res-3', 'residential-lane', [{ x: -54, z: 68 }]),
	edge('res-return', 'res-3', 'spine-3', 'residential-lane', [{ x: -27, z: 88 }]),
	edge('res-courtyard', 'res-2', 'res-court', 'courtyard-passage', [
		{ x: -62, z: 58 },
		{ x: -67, z: 67 }
	]),

	edge('bazaar-entry', 'spine-2', 'bazaar-1', 'bazaar-lane', [{ x: 6, z: 52 }]),
	edge('bazaar-middle', 'bazaar-1', 'bazaar-2', 'bazaar-lane', [
		{ x: 27, z: 63 },
		{ x: 33, z: 68 }
	]),
	edge('bazaar-north', 'bazaar-2', 'bazaar-3', 'bazaar-lane', [
		{ x: 44, z: 82 },
		{ x: 36, z: 92 }
	]),
	edge('bazaar-return', 'bazaar-3', 'spine-4', 'bazaar-lane', [
		{ x: 22, z: 111 },
		{ x: 8, z: 115 }
	]),
	edge('bazaar-dead-end', 'bazaar-2', 'bazaar-dead', 'bazaar-lane', [{ x: 51, z: 73 }], {
		widthM: 3.05,
		pedestrianDensity: 0.64
	}),

	edge('work-entry', 'spine-3', 'work-1', 'workshop-lane', [{ x: 3, z: 83 }]),
	edge('work-middle', 'work-1', 'work-2', 'workshop-lane', [
		{ x: 29, z: 97 },
		{ x: 36, z: 106 }
	]),
	edge('work-north', 'work-2', 'work-3', 'workshop-lane', [{ x: 39, z: 127 }]),
	edge('work-return', 'work-3', 'spine-5', 'workshop-lane', [
		{ x: 29, z: 148 },
		{ x: 11, z: 146 }
	]),
	edge('work-yard', 'work-2', 'work-yard', 'workshop-lane', [{ x: 57, z: 116 }], {
		widthM: 3.45,
		pedestrianDensity: 0.27
	}),
	edge('bazaar-work-connector', 'bazaar-3', 'work-2', 'connector-lane', [
		{ x: 37, z: 105 },
		{ x: 40, z: 109 }
	]),
	edge('east-connector', 'work-3', 'east-link', 'connector-lane', [
		{ x: 55, z: 150 },
		{ x: 55, z: 159 }
	]),
	edge(
		'east-destination',
		'east-link',
		'destination',
		'connector-lane',
		[
			{ x: 67, z: 178 },
			{ x: 60, z: 190 }
		],
		{
			widthM: 2.8,
			weatherExposure: 0.42
		}
	),

	edge('old-entry', 'spine-4', 'old-1', 'old-house-lane', [{ x: -18, z: 116 }]),
	edge('old-middle', 'old-1', 'old-2', 'old-house-lane', [
		{ x: -43, z: 133 },
		{ x: -42, z: 142 }
	]),
	edge('old-north', 'old-2', 'old-3', 'old-house-lane', [
		{ x: -51, z: 162 },
		{ x: -40, z: 170 }
	]),
	edge('old-return', 'old-3', 'spine-north', 'old-house-lane', [{ x: -15, z: 181 }]),
	edge('old-courtyard', 'old-1', 'old-court', 'courtyard-passage', [
		{ x: -43, z: 122 },
		{ x: -52, z: 125 }
	]),
	edge('res-old-connector', 'res-3', 'old-1', 'connector-lane', [
		{ x: -35, z: 96 },
		{ x: -39, z: 108 },
		{ x: -29, z: 117 }
	]),

	edge('wide-west-north', 'wide-west', 'spine-north', 'wider-road', [
		{ x: -45, z: 191 },
		{ x: -22, z: 181 }
	]),
	edge('wide-north-destination', 'spine-north', 'destination', 'wider-road', [
		{ x: 17, z: 188 },
		{ x: 34, z: 193 }
	]),
	edge('wide-destination-east', 'destination', 'wide-east', 'wider-road', [{ x: 67, z: 205 }])
];

const LANDMARKS: readonly LandmarkPlacement[] = [
	{
		id: 'neem-tree',
		label: 'Large neem tree',
		kind: 'large-tree',
		position: { x: -16, z: 24 },
		facingRadians: 0,
		edgeId: 'spine-south-1',
		visibleOnMinimap: true
	},
	{
		id: 'red-corner-house',
		label: 'Faded red corner house',
		kind: 'red-house',
		position: { x: -10, z: 116 },
		facingRadians: Math.PI / 2,
		edgeId: 'spine-3-4',
		visibleOnMinimap: true
	},
	{
		id: 'blue-courtyard-gate',
		label: 'Blue courtyard gate',
		kind: 'courtyard-gate',
		position: { x: -68, z: 71 },
		facingRadians: -0.7,
		edgeId: 'res-courtyard',
		visibleOnMinimap: true
	},
	{
		id: 'old-balcony',
		label: 'Deep green old balcony',
		kind: 'old-balcony',
		position: { x: -38, z: 134 },
		facingRadians: 0.4,
		edgeId: 'old-middle',
		visibleOnMinimap: true
	},
	{
		id: 'metal-workshop',
		label: 'Corrugated metal workshop',
		kind: 'workshop-shutter',
		position: { x: 49, z: 112 },
		facingRadians: Math.PI,
		edgeId: 'work-middle',
		visibleOnMinimap: false
	},
	{
		id: 'water-pump',
		label: 'Green street water pump',
		kind: 'water-pump',
		position: { x: -16, z: 88 },
		facingRadians: 0,
		edgeId: 'spine-3-4',
		visibleOnMinimap: true
	},
	{
		id: 'destination-pharmacy',
		label: 'Corner pharmacy',
		kind: 'corner-shop',
		position: { x: 51, z: 201 },
		facingRadians: Math.PI,
		edgeId: 'wide-north-destination',
		visibleOnMinimap: true
	}
];

const SIGNS: readonly StreetSignPlacement[] = [
	{
		id: 'sign-residential',
		edgeId: 'res-entry',
		position: { x: -18, z: 27 },
		facingRadians: 0.2,
		english: 'Nabin Kundu Lane',
		bengali: 'নবীন কুণ্ডু লেন'
	},
	{
		id: 'sign-bazaar',
		edgeId: 'bazaar-entry',
		position: { x: 5, z: 55 },
		facingRadians: -0.1,
		english: 'Market Passage',
		bengali: 'বাজার গলি'
	},
	{
		id: 'sign-wide-road',
		edgeId: 'wide-north-destination',
		position: { x: 8, z: 188 },
		facingRadians: Math.PI / 2,
		english: 'Rabindra Sarani',
		bengali: 'রবীন্দ্র সরণি'
	}
];

const STALLS: readonly StallPlacement[] = [
	{
		id: 'bazaar-tea',
		edgeId: 'bazaar-middle',
		position: { x: 30, z: 66 },
		facingRadians: -1.1,
		kind: 'tea',
		label: 'Bimal’s tea stall',
		footprintM: [2.2, 1.4],
		visibleOnMinimap: true
	},
	{
		id: 'spine-fuchka',
		edgeId: 'spine-3-4',
		position: { x: -7, z: 108 },
		facingRadians: Math.PI / 2,
		kind: 'fuchka',
		label: 'Evening fuchka cart',
		footprintM: [1.8, 1.1],
		visibleOnMinimap: false
	},
	{
		id: 'wide-mishti',
		edgeId: 'wide-north-destination',
		position: { x: 28, z: 196 },
		facingRadians: Math.PI,
		kind: 'mishti',
		label: 'Neighbourhood sweet shop',
		footprintM: [3.4, 2],
		visibleOnMinimap: true
	},
	{
		id: 'work-ghugni',
		edgeId: 'work-return',
		position: { x: 19, z: 149 },
		facingRadians: -0.2,
		kind: 'ghugni',
		label: 'Workshop ghugni stand',
		footprintM: [1.9, 1.2],
		visibleOnMinimap: false
	}
];

export const CALCUTTA_SPATIAL_WORLD: SpatialWorld = {
	id: 'north-calcutta-authored-v1',
	unit: 'metre',
	startNodeId: 'south-gate',
	destinationNodeId: 'destination',
	nodes: NODES,
	edges: EDGES,
	landmarks: LANDMARKS,
	signs: SIGNS,
	stalls: STALLS
};

const EPSILON = 1e-7;

function assertPoint(point: WorldPoint, name: string): void {
	if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
		throw new TypeError(`${name} must contain finite x and z metre coordinates.`);
	}
}

function assertRadius(radiusM: number): void {
	if (!Number.isFinite(radiusM) || radiusM < 0) {
		throw new RangeError('radiusM must be a finite non-negative number.');
	}
}

function blockedSet(value: SpatialQueryOptions['blockedEdgeIds']): ReadonlySet<string> {
	return value instanceof Set ? value : new Set(value ?? []);
}

function distanceBetween(left: WorldPoint, right: WorldPoint): number {
	return Math.hypot(right.x - left.x, right.z - left.z);
}

function nodeMap(world: SpatialWorld): Map<string, SpatialNode> {
	return new Map(world.nodes.map((node) => [node.id, node]));
}

export function getSpatialNode(
	id: string,
	world: SpatialWorld = CALCUTTA_SPATIAL_WORLD
): SpatialNode {
	const node = world.nodes.find((candidate) => candidate.id === id);
	if (!node) throw new Error(`Unknown spatial node: ${id}`);
	return node;
}

export function getSpatialEdge(
	id: string,
	world: SpatialWorld = CALCUTTA_SPATIAL_WORLD
): SpatialEdge {
	const found = world.edges.find((candidate) => candidate.id === id);
	if (!found) throw new Error(`Unknown spatial edge: ${id}`);
	return found;
}

export function edgePolyline(
	edgeValue: SpatialEdge,
	world: SpatialWorld = CALCUTTA_SPATIAL_WORLD
): readonly WorldPoint[] {
	const nodes = nodeMap(world);
	const from = nodes.get(edgeValue.from);
	const to = nodes.get(edgeValue.to);
	if (!from || !to) throw new Error(`Edge ${edgeValue.id} refers to an unknown node.`);
	return [from.position, ...edgeValue.via, to.position];
}

function cumulativeDistances(points: readonly WorldPoint[]): number[] {
	const distances = [0];
	for (let index = 1; index < points.length; index += 1) {
		distances.push(distances[index - 1] + distanceBetween(points[index - 1], points[index]));
	}
	return distances;
}

export function edgeLengthM(
	edgeValue: SpatialEdge,
	world: SpatialWorld = CALCUTTA_SPATIAL_WORLD
): number {
	return cumulativeDistances(edgePolyline(edgeValue, world)).at(-1) ?? 0;
}

interface EdgeProjectionInternal extends NearestWalkableEdge {
	readonly sourcePoint: WorldPoint;
}

function projectOntoEdge(
	point: WorldPoint,
	edgeValue: SpatialEdge,
	world: SpatialWorld
): EdgeProjectionInternal {
	const points = edgePolyline(edgeValue, world);
	let bestDistanceSquared = Number.POSITIVE_INFINITY;
	let bestPoint = points[0];
	let bestSegmentIndex = 0;
	let bestSegmentT = 0;
	let bestOffset = 0;
	let traversed = 0;

	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		const dx = end.x - start.x;
		const dz = end.z - start.z;
		const lengthSquared = dx * dx + dz * dz;
		const segmentLength = Math.sqrt(lengthSquared);
		const t =
			lengthSquared <= EPSILON
				? 0
				: Math.max(
						0,
						Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)
					);
		const projected = { x: start.x + dx * t, z: start.z + dz * t };
		const distanceSquared =
			(point.x - projected.x) * (point.x - projected.x) +
			(point.z - projected.z) * (point.z - projected.z);
		if (distanceSquared < bestDistanceSquared) {
			bestDistanceSquared = distanceSquared;
			bestPoint = projected;
			bestSegmentIndex = index;
			bestSegmentT = t;
			bestOffset = traversed + segmentLength * t;
		}
		traversed += segmentLength;
	}

	return {
		edge: edgeValue,
		point: bestPoint,
		sourcePoint: point,
		distanceToCentrelineM: Math.sqrt(bestDistanceSquared),
		offsetM: bestOffset,
		edgeLengthM: traversed,
		segmentIndex: bestSegmentIndex,
		segmentT: bestSegmentT
	};
}

function eligibleEdges(
	world: SpatialWorld,
	radiusM: number,
	blockedEdgeIds: ReadonlySet<string>
): readonly SpatialEdge[] {
	const edges = world.edges.filter(
		(edgeValue) => !blockedEdgeIds.has(edgeValue.id) && edgeValue.widthM / 2 + EPSILON >= radiusM
	);
	if (edges.length === 0) {
		throw new Error(`No unblocked street edge can accommodate a ${radiusM} m radius.`);
	}
	return edges;
}

function closestProjection(
	point: WorldPoint,
	world: SpatialWorld,
	radiusM: number,
	blockedEdgeIds: ReadonlySet<string>,
	compareWalkableDistance: boolean
): EdgeProjectionInternal {
	let best: EdgeProjectionInternal | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const edgeValue of eligibleEdges(world, radiusM, blockedEdgeIds)) {
		const projected = projectOntoEdge(point, edgeValue, world);
		const distance = compareWalkableDistance
			? Math.max(0, projected.distanceToCentrelineM - (edgeValue.widthM / 2 - radiusM))
			: projected.distanceToCentrelineM;
		if (distance < bestDistance) {
			best = projected;
			bestDistance = distance;
		}
	}
	if (!best) throw new Error('Spatial world has no walkable edges.');
	return best;
}

export function nearestWalkableEdge(
	point: WorldPoint,
	options: SpatialQueryOptions = {}
): NearestWalkableEdge {
	assertPoint(point, 'point');
	const world = options.world ?? CALCUTTA_SPATIAL_WORLD;
	return closestProjection(point, world, 0, blockedSet(options.blockedEdgeIds), false);
}

export function nearestWalkablePoint(
	point: WorldPoint,
	radiusM = 0,
	options: SpatialQueryOptions = {}
): NearestWalkablePoint {
	assertPoint(point, 'point');
	assertRadius(radiusM);
	const world = options.world ?? CALCUTTA_SPATIAL_WORLD;
	const projection = closestProjection(
		point,
		world,
		radiusM,
		blockedSet(options.blockedEdgeIds),
		true
	);
	const permittedDistance = Math.max(0, projection.edge.widthM / 2 - radiusM);
	if (projection.distanceToCentrelineM <= permittedDistance + EPSILON) {
		return { ...projection, walkablePoint: { ...point }, distanceM: 0 };
	}

	const scale = permittedDistance / projection.distanceToCentrelineM;
	const walkablePoint = {
		x: projection.point.x + (point.x - projection.point.x) * scale,
		z: projection.point.z + (point.z - projection.point.z) * scale
	};
	return {
		...projection,
		walkablePoint,
		distanceM: distanceBetween(point, walkablePoint)
	};
}

export function isWalkable(
	point: WorldPoint,
	radiusM = 0,
	options: SpatialQueryOptions = {}
): boolean {
	assertPoint(point, 'point');
	assertRadius(radiusM);
	const world = options.world ?? CALCUTTA_SPATIAL_WORLD;
	const excluded = blockedSet(options.blockedEdgeIds);
	return world.edges.some((edgeValue) => {
		if (excluded.has(edgeValue.id) || edgeValue.widthM / 2 + EPSILON < radiusM) return false;
		const projection = projectOntoEdge(point, edgeValue, world);
		return projection.distanceToCentrelineM + radiusM <= edgeValue.widthM / 2 + EPSILON;
	});
}

function pointAtOffset(
	points: readonly WorldPoint[],
	cumulative: readonly number[],
	offsetM: number
): WorldPoint {
	const total = cumulative.at(-1) ?? 0;
	const offset = Math.max(0, Math.min(total, offsetM));
	for (let index = 0; index < cumulative.length - 1; index += 1) {
		if (offset <= cumulative[index + 1] + EPSILON) {
			const segmentLength = cumulative[index + 1] - cumulative[index];
			const t = segmentLength <= EPSILON ? 0 : (offset - cumulative[index]) / segmentLength;
			return {
				x: points[index].x + (points[index + 1].x - points[index].x) * t,
				z: points[index].z + (points[index + 1].z - points[index].z) * t
			};
		}
	}
	return { ...points.at(-1)! };
}

function slicePolyline(
	points: readonly WorldPoint[],
	fromOffsetM: number,
	toOffsetM: number
): WorldPoint[] {
	if (toOffsetM < fromOffsetM) return slicePolyline(points, toOffsetM, fromOffsetM).reverse();
	const cumulative = cumulativeDistances(points);
	const result = [pointAtOffset(points, cumulative, fromOffsetM)];
	for (let index = 1; index < points.length - 1; index += 1) {
		if (cumulative[index] > fromOffsetM + EPSILON && cumulative[index] < toOffsetM - EPSILON) {
			result.push(points[index]);
		}
	}
	result.push(pointAtOffset(points, cumulative, toOffsetM));
	return deduplicateAdjacentPoints(result);
}

function deduplicateAdjacentPoints(points: readonly WorldPoint[]): WorldPoint[] {
	const result: WorldPoint[] = [];
	for (const point of points) {
		if (!result.length || distanceBetween(result[result.length - 1], point) > EPSILON) {
			result.push({ ...point });
		}
	}
	return result;
}

function appendPoints(target: WorldPoint[], points: readonly WorldPoint[]): void {
	for (const point of points) {
		if (!target.length || distanceBetween(target[target.length - 1], point) > EPSILON) {
			target.push({ ...point });
		}
	}
}

interface GraphStep {
	readonly nodeId: string;
	readonly edge: SpatialEdge;
}

interface NodeRoute {
	readonly distanceM: number;
	readonly nodeIds: readonly string[];
	readonly steps: readonly GraphStep[];
}

function dijkstra(
	startNodeId: string,
	targetNodeId: string,
	world: SpatialWorld,
	blockedEdgeIds: ReadonlySet<string>,
	radiusM: number
): NodeRoute | null {
	if (startNodeId === targetNodeId) {
		return { distanceM: 0, nodeIds: [startNodeId], steps: [] };
	}

	const adjacency = new Map<string, { nodeId: string; edge: SpatialEdge; distanceM: number }[]>();
	for (const node of world.nodes) adjacency.set(node.id, []);
	for (const edgeValue of world.edges) {
		if (blockedEdgeIds.has(edgeValue.id) || edgeValue.widthM / 2 + EPSILON < radiusM) continue;
		const lengthM = edgeLengthM(edgeValue, world);
		adjacency
			.get(edgeValue.from)
			?.push({ nodeId: edgeValue.to, edge: edgeValue, distanceM: lengthM });
		adjacency
			.get(edgeValue.to)
			?.push({ nodeId: edgeValue.from, edge: edgeValue, distanceM: lengthM });
	}

	const distances = new Map<string, number>(
		world.nodes.map((node) => [node.id, Number.POSITIVE_INFINITY])
	);
	const previous = new Map<string, { nodeId: string; edge: SpatialEdge }>();
	const unvisited = new Set(world.nodes.map((node) => node.id));
	distances.set(startNodeId, 0);

	while (unvisited.size > 0) {
		let current: string | null = null;
		let currentDistance = Number.POSITIVE_INFINITY;
		for (const nodeId of unvisited) {
			const candidate = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
			if (candidate < currentDistance) {
				current = nodeId;
				currentDistance = candidate;
			}
		}
		if (current === null || !Number.isFinite(currentDistance)) break;
		unvisited.delete(current);
		if (current === targetNodeId) break;

		for (const neighbour of adjacency.get(current) ?? []) {
			if (!unvisited.has(neighbour.nodeId)) continue;
			const candidate = currentDistance + neighbour.distanceM;
			if (candidate + EPSILON < (distances.get(neighbour.nodeId) ?? Number.POSITIVE_INFINITY)) {
				distances.set(neighbour.nodeId, candidate);
				previous.set(neighbour.nodeId, { nodeId: current, edge: neighbour.edge });
			}
		}
	}

	const finalDistance = distances.get(targetNodeId) ?? Number.POSITIVE_INFINITY;
	if (!Number.isFinite(finalDistance)) return null;
	const reversedNodes = [targetNodeId];
	const reversedSteps: GraphStep[] = [];
	let cursor = targetNodeId;
	while (cursor !== startNodeId) {
		const predecessor = previous.get(cursor);
		if (!predecessor) return null;
		reversedSteps.push({ nodeId: cursor, edge: predecessor.edge });
		cursor = predecessor.nodeId;
		reversedNodes.push(cursor);
	}
	return {
		distanceM: finalDistance,
		nodeIds: reversedNodes.reverse(),
		steps: reversedSteps.reverse()
	};
}

interface EndpointChoice {
	readonly nodeId: string;
	readonly distanceM: number;
	readonly points: readonly WorldPoint[];
}

interface PathCandidate {
	readonly distanceM: number;
	readonly points: readonly WorldPoint[];
	readonly edgeIds: readonly string[];
	readonly nodeIds: readonly string[];
}

function pathPointsForNodeRoute(route: NodeRoute, world: SpatialWorld): WorldPoint[] {
	const points: WorldPoint[] = [];
	for (let index = 0; index < route.steps.length; index += 1) {
		const step = route.steps[index];
		const fromNodeId = route.nodeIds[index];
		const polyline = edgePolyline(step.edge, world);
		appendPoints(points, step.edge.from === fromNodeId ? polyline : [...polyline].reverse());
	}
	return points;
}

export function findShortestPath(
	requestedStart: WorldPoint,
	requestedEnd: WorldPoint,
	options: SpatialPathOptions = {}
): SpatialPath | null {
	assertPoint(requestedStart, 'requestedStart');
	assertPoint(requestedEnd, 'requestedEnd');
	const radiusM = options.radiusM ?? 0;
	assertRadius(radiusM);
	const world = options.world ?? CALCUTTA_SPATIAL_WORLD;
	const excluded = blockedSet(options.blockedEdgeIds);
	const startWalkable = nearestWalkablePoint(requestedStart, radiusM, {
		world,
		blockedEdgeIds: excluded
	});
	const endWalkable = nearestWalkablePoint(requestedEnd, radiusM, {
		world,
		blockedEdgeIds: excluded
	});
	const startProjection = projectOntoEdge(startWalkable.walkablePoint, startWalkable.edge, world);
	const endProjection = projectOntoEdge(endWalkable.walkablePoint, endWalkable.edge, world);
	const startPolyline = edgePolyline(startProjection.edge, world);
	const endPolyline = edgePolyline(endProjection.edge, world);
	const startLateral = distanceBetween(startWalkable.walkablePoint, startProjection.point);
	const endLateral = distanceBetween(endWalkable.walkablePoint, endProjection.point);
	const startChoices: readonly EndpointChoice[] = [
		{
			nodeId: startProjection.edge.from,
			distanceM: startLateral + startProjection.offsetM,
			points: [
				startWalkable.walkablePoint,
				...slicePolyline(startPolyline, startProjection.offsetM, 0)
			]
		},
		{
			nodeId: startProjection.edge.to,
			distanceM: startLateral + startProjection.edgeLengthM - startProjection.offsetM,
			points: [
				startWalkable.walkablePoint,
				...slicePolyline(startPolyline, startProjection.offsetM, startProjection.edgeLengthM)
			]
		}
	];
	const endChoices: readonly EndpointChoice[] = [
		{
			nodeId: endProjection.edge.from,
			distanceM: endLateral + endProjection.offsetM,
			points: [...slicePolyline(endPolyline, 0, endProjection.offsetM), endWalkable.walkablePoint]
		},
		{
			nodeId: endProjection.edge.to,
			distanceM: endLateral + endProjection.edgeLengthM - endProjection.offsetM,
			points: [
				...slicePolyline(endPolyline, endProjection.edgeLengthM, endProjection.offsetM),
				endWalkable.walkablePoint
			]
		}
	];

	const candidates: PathCandidate[] = [];
	if (startProjection.edge.id === endProjection.edge.id) {
		const directPoints: WorldPoint[] = [startWalkable.walkablePoint];
		appendPoints(
			directPoints,
			slicePolyline(startPolyline, startProjection.offsetM, endProjection.offsetM)
		);
		appendPoints(directPoints, [endWalkable.walkablePoint]);
		candidates.push({
			distanceM:
				startLateral + Math.abs(startProjection.offsetM - endProjection.offsetM) + endLateral,
			points: directPoints,
			edgeIds: [startProjection.edge.id],
			nodeIds: []
		});
	}

	for (const startChoice of startChoices) {
		for (const endChoice of endChoices) {
			const route = dijkstra(startChoice.nodeId, endChoice.nodeId, world, excluded, radiusM);
			if (!route) continue;
			const points: WorldPoint[] = [];
			appendPoints(points, startChoice.points);
			appendPoints(points, pathPointsForNodeRoute(route, world));
			appendPoints(points, endChoice.points);
			const edgeIds = [
				...(startChoice.distanceM > EPSILON ? [startProjection.edge.id] : []),
				...route.steps.map((step) => step.edge.id),
				...(endChoice.distanceM > EPSILON ? [endProjection.edge.id] : [])
			];
			candidates.push({
				distanceM: startChoice.distanceM + route.distanceM + endChoice.distanceM,
				points,
				edgeIds,
				nodeIds: route.nodeIds
			});
		}
	}

	const best = candidates.reduce<PathCandidate | null>(
		(current, candidate) =>
			!current || candidate.distanceM < current.distanceM ? candidate : current,
		null
	);
	if (!best) return null;
	return {
		...best,
		start: startWalkable.walkablePoint,
		end: endWalkable.walkablePoint,
		requestedStart: { ...requestedStart },
		requestedEnd: { ...requestedEnd },
		startSnapDistanceM: startWalkable.distanceM,
		endSnapDistanceM: endWalkable.distanceM
	};
}

export function pathToDestination(
	from: WorldPoint,
	options: SpatialPathOptions = {}
): SpatialPath | null {
	const world = options.world ?? CALCUTTA_SPATIAL_WORLD;
	return findShortestPath(from, getSpatialNode(world.destinationNodeId, world).position, {
		...options,
		world
	});
}

export function distanceToDestination(from: WorldPoint, options: SpatialPathOptions = {}): number {
	return pathToDestination(from, options)?.distanceM ?? Number.POSITIVE_INFINITY;
}

export function getWorldBounds(
	world: SpatialWorld = CALCUTTA_SPATIAL_WORLD,
	marginM = 0
): WorldBounds {
	if (!Number.isFinite(marginM) || marginM < 0) {
		throw new RangeError('marginM must be a finite non-negative number.');
	}
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let minZ = Number.POSITIVE_INFINITY;
	let maxZ = Number.NEGATIVE_INFINITY;
	for (const edgeValue of world.edges) {
		const halfWidth = edgeValue.widthM / 2;
		for (const point of edgePolyline(edgeValue, world)) {
			minX = Math.min(minX, point.x - halfWidth);
			maxX = Math.max(maxX, point.x + halfWidth);
			minZ = Math.min(minZ, point.z - halfWidth);
			maxZ = Math.max(maxZ, point.z + halfWidth);
		}
	}
	for (const placement of [...world.landmarks, ...world.signs, ...world.stalls]) {
		minX = Math.min(minX, placement.position.x);
		maxX = Math.max(maxX, placement.position.x);
		minZ = Math.min(minZ, placement.position.z);
		maxZ = Math.max(maxZ, placement.position.z);
	}
	if (!Number.isFinite(minX)) throw new Error('Cannot calculate bounds for a world without edges.');
	minX -= marginM;
	maxX += marginM;
	minZ -= marginM;
	maxZ += marginM;
	return {
		minX,
		maxX,
		minZ,
		maxZ,
		widthM: maxX - minX,
		depthM: maxZ - minZ,
		centre: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }
	};
}

export const CALCUTTA_WORLD_BOUNDS = getWorldBounds(CALCUTTA_SPATIAL_WORLD);
