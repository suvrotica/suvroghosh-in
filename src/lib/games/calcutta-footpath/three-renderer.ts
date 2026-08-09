import * as THREE from 'three';
import { CALCUTTA_SPATIAL_WORLD, edgePolyline, getWorldBounds } from './spatial-world';
import type { SpatialEdge, SpatialWorld, StreetSurface, WorldPoint } from './spatial-world';

export type FootpathRenderQualityChoice = 'auto' | 'low' | 'high';
export type FootpathRenderQualityTier = 'low' | 'high';
export type FootpathWeatherState = 'dry' | 'rain' | 'post-rain';
export type FootpathCameraMovement = 'gentle' | 'normal';

export type FootpathRenderEntityKind =
	| 'player'
	| 'pedestrian'
	| 'hawker'
	| 'bicycle'
	| 'rickshaw'
	| 'handcart'
	| 'motorbike'
	| 'auto-rickshaw'
	| 'car'
	| 'van'
	| 'dog'
	| 'cow'
	| 'stall'
	| 'pothole'
	| 'drain'
	| 'debris'
	| 'food'
	| 'warning';

export interface FootpathRenderPoint extends WorldPoint {
	readonly y?: number;
}

/**
 * A simulation-independent render record. Heading zero faces world north (+z).
 * Stable ids let the renderer retain meshes and interpolate between fixed steps.
 */
export interface FootpathRenderEntity {
	readonly id: string;
	readonly kind: FootpathRenderEntityKind;
	readonly position: FootpathRenderPoint;
	readonly headingRadians: number;
	readonly velocity?: FootpathRenderPoint;
	readonly scale?: number;
	readonly variant?: string;
	readonly state?: string;
	readonly visible?: boolean;
	readonly priority?: number;
}

export interface FootpathPlayerRenderEntity extends FootpathRenderEntity {
	readonly kind: 'player';
	/** Optional fast path; otherwise the renderer finds the nearest authored lane. */
	readonly laneWidthM?: number;
}

export interface FootpathWeatherFrame {
	readonly state: FootpathWeatherState;
	readonly rainIntensity?: number;
	readonly wetness?: number;
	readonly wind?: WorldPoint;
}

export interface FootpathLookFrame {
	readonly yawRadians: number;
	readonly pitchRadians: number;
	readonly active: boolean;
}

export interface FootpathRenderFrame {
	readonly elapsedSeconds: number;
	readonly deltaSeconds: number;
	readonly player: FootpathPlayerRenderEntity;
	readonly entities: readonly FootpathRenderEntity[];
	readonly weather: FootpathWeatherFrame;
	readonly reducedMotion?: boolean;
	readonly cameraMovement?: FootpathCameraMovement;
	readonly look?: FootpathLookFrame;
}

export interface FootpathRendererMetrics {
	readonly fps: number;
	readonly frameMs: number;
	readonly drawCalls: number;
	readonly triangles: number;
	readonly entityCount: number;
	readonly approximateTextureMemoryBytes: number;
	readonly quality: FootpathRenderQualityTier;
}

export type FootpathRendererStatus =
	| 'ready'
	| 'context-lost'
	| 'context-restored'
	| 'error'
	| 'disposed';

export interface FootpathRendererStatusEvent {
	readonly status: FootpathRendererStatus;
	readonly message?: string;
	readonly quality: FootpathRenderQualityTier;
}

export interface FootpathRoadHit {
	readonly point: WorldPoint;
	readonly edgeId: string;
	readonly distanceFromCameraM: number;
}

export interface FootpathRendererOptions {
	readonly world?: SpatialWorld;
	readonly quality?: FootpathRenderQualityChoice;
	readonly reducedMotion?: boolean;
	readonly cameraMovement?: FootpathCameraMovement;
	readonly onMetrics?: (metrics: FootpathRendererMetrics) => void;
	readonly onStatus?: (event: FootpathRendererStatusEvent) => void;
}

export interface FootpathThreeRendererApi {
	renderFrame(frame: FootpathRenderFrame): void;
	resize(width?: number, height?: number, devicePixelRatio?: number): void;
	setQuality(choice: FootpathRenderQualityChoice): void;
	setReducedMotion(reducedMotion: boolean): void;
	setCameraMovement(cameraMovement: FootpathCameraMovement): void;
	setLookOffset(yawRadians: number, pitchRadians: number, active?: boolean): void;
	nudgeLookOffset(deltaYawRadians: number, deltaPitchRadians: number): void;
	releaseLookOffset(): void;
	screenToRoad(clientX: number, clientY: number): FootpathRoadHit | null;
	getMetrics(): FootpathRendererMetrics;
	dispose(): void;
}

export interface FootpathQualityHints {
	readonly width: number;
	readonly height: number;
	readonly devicePixelRatio: number;
	readonly hardwareConcurrency?: number;
	readonly deviceMemory?: number;
	readonly saveData?: boolean;
}

export interface FootpathCameraRig {
	readonly fovDegrees: number;
	readonly heightM: number;
	readonly behindM: number;
	readonly lookAheadM: number;
	readonly targetHeightM: number;
}

export interface FootpathCameraLaneLead {
	readonly edgeId: string;
	readonly laneWidthM: number;
	readonly projectedPoint: WorldPoint;
	readonly targetPoint: WorldPoint;
	readonly yawRadians: number;
	readonly turnRadians: number;
}

export interface FootpathCameraCorridorPlacement {
	readonly point: WorldPoint;
	readonly edgeId: string;
	readonly adjusted: boolean;
	readonly adjustmentM: number;
}

type QualityProfile = Readonly<{
	tier: FootpathRenderQualityTier;
	dprCap: number;
	antialias: boolean;
	shadows: boolean;
	shadowMapSize: number;
	maxEntities: number;
	rainDrops: number;
	facadeDetail: boolean;
}>;

type TransformSpec = Readonly<{
	position: THREE.Vector3;
	quaternion: THREE.Quaternion;
	scale: THREE.Vector3;
}>;

type FacadeSpec = Readonly<{
	position: WorldPoint;
	quaternion: THREE.Quaternion;
	widthM: number;
	depthM: number;
	heightM: number;
	floors: number;
	paletteIndex: number;
	hasBalcony: boolean;
	hasAwning: boolean;
	hasShutters: boolean;
	hasPipe: boolean;
	hasClothes: boolean;
	signIndex: number;
}>;

type EntityVisual = {
	id: string;
	kind: FootpathRenderEntityKind;
	object: THREE.Group;
	lastSnapshot: FootpathRenderEntity;
};

const QUALITY_PROFILES: Record<FootpathRenderQualityTier, QualityProfile> = {
	low: {
		tier: 'low',
		dprCap: 1,
		antialias: false,
		shadows: false,
		shadowMapSize: 512,
		maxEntities: 42,
		rainDrops: 220,
		facadeDetail: false
	},
	high: {
		tier: 'high',
		dprCap: 1.6,
		antialias: true,
		shadows: true,
		shadowMapSize: 1_024,
		maxEntities: 120,
		rainDrops: 900,
		facadeDetail: true
	}
};

const ROAD_COLORS: Record<StreetSurface, string> = {
	'patched-asphalt': '#4b4a45',
	'worn-asphalt': '#57544c',
	'stone-and-asphalt': '#514f49',
	'broken-paving': '#625d51',
	'packed-earth-edge': '#6c604b',
	'workshop-concrete': '#65645d'
};

const FACADE_COLORS = ['#875a50', '#9a745a', '#92876b', '#65736e', '#75685f', '#9d876b'] as const;
const CLOTH_COLORS = ['#b94e47', '#d8b351', '#507a8e', '#ded2bb', '#75894e'] as const;
const HUMAN_CLOTHES = ['#8b423c', '#496b73', '#9b7c42', '#6d5b7d', '#5c7757', '#b36e45'] as const;
const SHOP_SIGNS = [
	{ english: 'TEA', bengali: 'চা', color: '#7e332b' },
	{ english: 'PHARMACY', bengali: 'ওষুধ', color: '#32694f' },
	{ english: 'BOOK BINDING', bengali: 'বই বাঁধাই', color: '#304e73' },
	{ english: 'CYCLE REPAIR', bengali: 'সাইকেল মেরামত', color: '#72522f' }
] as const;

const UP = new THREE.Vector3(0, 1, 0);
const MAX_RAIN_DROPS = QUALITY_PROFILES.high.rainDrops;
const METRICS_INTERVAL_SECONDS = 0.5;
const AUTO_QUALITY_SAMPLE_COUNT = 150;

function clamp(value: number, minimum = 0, maximum = 1): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
	return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function exponentialAlpha(rate: number, deltaSeconds: number): number {
	return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, deltaSeconds));
}

function wrapRadians(value: number): number {
	let wrapped = value % (Math.PI * 2);
	if (wrapped > Math.PI) wrapped -= Math.PI * 2;
	if (wrapped < -Math.PI) wrapped += Math.PI * 2;
	return wrapped;
}

function dampRadians(current: number, target: number, rate: number, deltaSeconds: number): number {
	return wrapRadians(
		current + wrapRadians(target - current) * exponentialAlpha(rate, deltaSeconds)
	);
}

function hashString(value: string): number {
	let hash = 2_166_136_261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return hash >>> 0;
}

function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function distanceSquared(left: WorldPoint, right: WorldPoint): number {
	const dx = left.x - right.x;
	const dz = left.z - right.z;
	return dx * dx + dz * dz;
}

function browserQualityHints(canvas: HTMLCanvasElement): FootpathQualityHints {
	const navigatorWithHints =
		typeof navigator === 'undefined'
			? undefined
			: (navigator as Navigator & {
					deviceMemory?: number;
					connection?: { saveData?: boolean };
				});
	const rect = canvas.getBoundingClientRect();
	return {
		width: Math.max(1, Math.round(rect.width || canvas.clientWidth || 1)),
		height: Math.max(1, Math.round(rect.height || canvas.clientHeight || 1)),
		devicePixelRatio:
			typeof window === 'undefined' ? 1 : Math.max(1, finiteOr(window.devicePixelRatio, 1)),
		hardwareConcurrency: navigatorWithHints?.hardwareConcurrency,
		deviceMemory: navigatorWithHints?.deviceMemory,
		saveData: navigatorWithHints?.connection?.saveData
	};
}

export function chooseFootpathRenderQuality(
	choice: FootpathRenderQualityChoice,
	hints: FootpathQualityHints
): FootpathRenderQualityTier {
	if (choice !== 'auto') return choice;
	const shortEdge = Math.min(hints.width, hints.height);
	const constrained =
		hints.saveData === true ||
		shortEdge <= 560 ||
		(hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 2) ||
		(hints.deviceMemory !== undefined && hints.deviceMemory <= 3);
	if (constrained) return 'low';
	const comfortable =
		hints.width >= 900 &&
		hints.height >= 620 &&
		(hints.hardwareConcurrency === undefined || hints.hardwareConcurrency >= 4) &&
		(hints.deviceMemory === undefined || hints.deviceMemory >= 6);
	return comfortable ? 'high' : 'low';
}

/** Camera dimensions stay human-scale while opening out gently on the wider road. */
export function cameraRigForLane(laneWidthM: number, reducedMotion = false): FootpathCameraRig {
	const width = clamp(finiteOr(laneWidthM, 4), 2.2, 10);
	const openness = clamp((width - 2.5) / 6.5);
	return {
		fovDegrees: 49 - openness * 2.5,
		heightM: (reducedMotion ? 3.12 : 2.95) + openness * 0.7,
		behindM: (reducedMotion ? 2.45 : 2.42) + openness * (reducedMotion ? 0.05 : 0.08),
		lookAheadM: (reducedMotion ? 2.4 : 2.9) + openness * 1.4,
		targetHeightM: 1.18 + openness * 0.08
	};
}

function polylineLength(points: readonly WorldPoint[]): number {
	let length = 0;
	for (let index = 1; index < points.length; index += 1) {
		length += Math.hypot(
			points[index].x - points[index - 1].x,
			points[index].z - points[index - 1].z
		);
	}
	return length;
}

function pointAndTangentAt(
	points: readonly WorldPoint[],
	offsetM: number
): { point: WorldPoint; tangent: WorldPoint } {
	if (points.length < 2) {
		return { point: points[0] ?? { x: 0, z: 0 }, tangent: { x: 0, z: 1 } };
	}
	let remaining = clamp(offsetM, 0, polylineLength(points));
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		const dx = end.x - start.x;
		const dz = end.z - start.z;
		const length = Math.hypot(dx, dz);
		if (remaining <= length || index === points.length - 2) {
			const t = length > 0 ? clamp(remaining / length) : 0;
			return {
				point: { x: start.x + dx * t, z: start.z + dz * t },
				tangent: length > 0 ? { x: dx / length, z: dz / length } : { x: 0, z: 1 }
			};
		}
		remaining -= length;
	}
	return { point: points.at(-1) ?? { x: 0, z: 0 }, tangent: { x: 0, z: 1 } };
}

type LaneProjection = Readonly<{
	edge: SpatialEdge;
	point: WorldPoint;
	tangent: WorldPoint;
	distanceSquared: number;
	offsetM: number;
	edgeLengthM: number;
	segmentIndex: number;
}>;

function projectPointToEdge(
	point: WorldPoint,
	edge: SpatialEdge,
	world: SpatialWorld
): LaneProjection {
	const points = edgePolyline(edge, world);
	let bestPoint = points[0] ?? { x: 0, z: 0 };
	let bestTangent: WorldPoint = { x: 0, z: 1 };
	let bestDistanceSquared = Number.POSITIVE_INFINITY;
	let bestOffsetM = 0;
	let bestSegmentIndex = 0;
	let edgeLengthM = 0;
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		const dx = end.x - start.x;
		const dz = end.z - start.z;
		const lengthSquared = dx * dx + dz * dz;
		const length = Math.sqrt(lengthSquared);
		const t =
			lengthSquared > 1e-8
				? clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)
				: 0;
		const projected = { x: start.x + dx * t, z: start.z + dz * t };
		const candidateDistanceSquared = distanceSquared(point, projected);
		if (candidateDistanceSquared < bestDistanceSquared) {
			bestPoint = projected;
			bestTangent = length > 1e-5 ? { x: dx / length, z: dz / length } : bestTangent;
			bestDistanceSquared = candidateDistanceSquared;
			bestOffsetM = edgeLengthM + length * t;
			bestSegmentIndex = index;
		}
		edgeLengthM += length;
	}
	return {
		edge,
		point: bestPoint,
		tangent: bestTangent,
		distanceSquared: bestDistanceSquared,
		offsetM: bestOffsetM,
		edgeLengthM,
		segmentIndex: bestSegmentIndex
	};
}

function nearestLaneProjection(point: WorldPoint, world: SpatialWorld): LaneProjection {
	let best: LaneProjection | null = null;
	for (const edge of world.edges) {
		const candidate = projectPointToEdge(point, edge, world);
		if (!best || candidate.distanceSquared < best.distanceSquared) best = candidate;
	}
	if (!best) throw new Error('The authored street world has no lane edges.');
	return best;
}

function appendDistinctPoint(points: WorldPoint[], point: WorldPoint): void {
	const last = points.at(-1);
	if (!last || distanceSquared(last, point) > 1e-8) points.push({ ...point });
}

function unitDirection(from: WorldPoint, to: WorldPoint): WorldPoint {
	const dx = to.x - from.x;
	const dz = to.z - from.z;
	const length = Math.hypot(dx, dz);
	return length > 1e-5 ? { x: dx / length, z: dz / length } : { x: 0, z: 1 };
}

function authoredRouteAhead(
	world: SpatialWorld,
	projection: LaneProjection,
	headingRadians: number,
	distanceM: number
): WorldPoint[] {
	const heading = { x: Math.sin(headingRadians), z: Math.cos(headingRadians) };
	const forward = projection.tangent.x * heading.x + projection.tangent.z * heading.z >= 0;
	const route: WorldPoint[] = [{ ...projection.point }];
	const currentPolyline = edgePolyline(projection.edge, world);
	if (forward) {
		for (let index = projection.segmentIndex + 1; index < currentPolyline.length; index += 1) {
			appendDistinctPoint(route, currentPolyline[index]);
		}
	} else {
		for (let index = projection.segmentIndex; index >= 0; index -= 1) {
			appendDistinctPoint(route, currentPolyline[index]);
		}
	}

	let nodeId = forward ? projection.edge.to : projection.edge.from;
	const visited = new Set([projection.edge.id]);
	while (polylineLength(route) + 1e-5 < distanceM && visited.size < 4) {
		const previous = route.at(-2) ?? projection.point;
		const endpoint = route.at(-1) ?? projection.point;
		const incoming = unitDirection(previous, endpoint);
		let continuation:
			| { edge: SpatialEdge; points: readonly WorldPoint[]; score: number; nextNodeId: string }
			| undefined;
		for (const edge of world.edges) {
			if (visited.has(edge.id) || (edge.from !== nodeId && edge.to !== nodeId)) continue;
			const original = edgePolyline(edge, world);
			const points = edge.from === nodeId ? original : [...original].reverse();
			const outward = unitDirection(points[0], points[1] ?? points[0]);
			const score = incoming.x * outward.x + incoming.z * outward.z;
			if (!continuation || score > continuation.score) {
				continuation = {
					edge,
					points,
					score,
					nextNodeId: edge.from === nodeId ? edge.to : edge.from
				};
			}
		}
		if (!continuation) break;
		visited.add(continuation.edge.id);
		for (const point of continuation.points) appendDistinctPoint(route, point);
		nodeId = continuation.nextNodeId;
	}
	return route;
}

/**
 * Leads the view into authored centre-line bends without requiring route state or scene raycasts.
 * Reduced motion retains the same authored direction with a deliberately smaller angular lead.
 */
export function authoredLaneCameraLead(
	world: SpatialWorld,
	playerPosition: WorldPoint,
	headingRadians: number,
	anticipationDistanceM: number,
	reducedMotion = false
): FootpathCameraLaneLead {
	const safeHeading = finiteOr(headingRadians, 0);
	const projection = nearestLaneProjection(playerPosition, world);
	const distanceM = clamp(finiteOr(anticipationDistanceM, 4), 0.5, 14);
	const route = authoredRouteAhead(world, projection, safeHeading, distanceM);
	const targetPoint = pointAndTangentAt(route, distanceM).point;
	const dx = targetPoint.x - playerPosition.x;
	const dz = targetPoint.z - playerPosition.z;
	const targetYaw = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : safeHeading;
	const strength = reducedMotion ? 0.28 : 0.74;
	const maximumTurn = reducedMotion ? 0.26 : 0.68;
	const turnRadians = clamp(
		wrapRadians(targetYaw - safeHeading) * strength,
		-maximumTurn,
		maximumTurn
	);
	return {
		edgeId: projection.edge.id,
		laneWidthM: projection.edge.widthM,
		projectedPoint: { ...projection.point },
		targetPoint,
		yawRadians: wrapRadians(safeHeading + turnRadians),
		turnRadians
	};
}

function clampPointToEdgeCorridor(
	desired: WorldPoint,
	edge: SpatialEdge,
	world: SpatialWorld,
	clearanceM: number
): FootpathCameraCorridorPlacement {
	const projection = projectPointToEdge(desired, edge, world);
	const allowedOffsetM = Math.max(0, edge.widthM / 2 - clearanceM);
	const dx = desired.x - projection.point.x;
	const dz = desired.z - projection.point.z;
	const distanceM = Math.hypot(dx, dz);
	if (distanceM <= allowedOffsetM + 1e-5) {
		return { point: { ...desired }, edgeId: edge.id, adjusted: false, adjustmentM: 0 };
	}
	const scale = distanceM > 1e-5 ? allowedOffsetM / distanceM : 0;
	const point = {
		x: projection.point.x + dx * scale,
		z: projection.point.z + dz * scale
	};
	return {
		point,
		edgeId: edge.id,
		adjusted: true,
		adjustmentM: Math.sqrt(distanceSquared(desired, point))
	};
}

/**
 * Keeps a third-person camera inside the current authored lane or a directly connected junction
 * corridor. Facades begin outside these road edges, so this avoids wall clipping without mesh
 * raycasts and preserves the requested behind distance whenever that point is already walkable.
 */
export function constrainCameraToAuthoredLane(
	world: SpatialWorld,
	playerPosition: WorldPoint,
	desiredCameraPosition: WorldPoint,
	clearanceM = 0.34
): FootpathCameraCorridorPlacement {
	const playerLane = nearestLaneProjection(playerPosition, world);
	const safeClearanceM = Math.max(0, finiteOr(clearanceM, 0.34));
	const candidateEdges: SpatialEdge[] = [playerLane.edge];
	const reachM = Math.sqrt(distanceSquared(playerPosition, desiredCameraPosition)) + 0.75;
	const candidateNodeIds = new Set<string>();
	if (playerLane.offsetM <= reachM) candidateNodeIds.add(playerLane.edge.from);
	if (playerLane.edgeLengthM - playerLane.offsetM <= reachM) {
		candidateNodeIds.add(playerLane.edge.to);
	}
	for (const edge of world.edges) {
		if (
			edge.id !== playerLane.edge.id &&
			(candidateNodeIds.has(edge.from) || candidateNodeIds.has(edge.to))
		) {
			candidateEdges.push(edge);
		}
	}

	let best = clampPointToEdgeCorridor(
		desiredCameraPosition,
		candidateEdges[0],
		world,
		safeClearanceM
	);
	for (const edge of candidateEdges.slice(1)) {
		const candidate = clampPointToEdgeCorridor(desiredCameraPosition, edge, world, safeClearanceM);
		if (candidate.adjustmentM + 1e-5 < best.adjustmentM) best = candidate;
	}
	return best;
}

function resamplePolyline(points: readonly WorldPoint[], stepM = 2.4): WorldPoint[] {
	const length = polylineLength(points);
	const samples = Math.max(2, Math.ceil(length / stepM) + 1);
	const result: WorldPoint[] = [];
	for (let index = 0; index < samples; index += 1) {
		result.push(pointAndTangentAt(points, (length * index) / (samples - 1)).point);
	}
	return result;
}

function localTransform(
	base: WorldPoint,
	quaternion: THREE.Quaternion,
	localX: number,
	localY: number,
	localZ: number,
	scaleX: number,
	scaleY: number,
	scaleZ: number,
	extraRotation?: THREE.Quaternion
): TransformSpec {
	const position = new THREE.Vector3(localX, localY, localZ)
		.applyQuaternion(quaternion)
		.add(new THREE.Vector3(base.x, 0, base.z));
	const finalQuaternion = quaternion.clone();
	if (extraRotation) finalQuaternion.multiply(extraRotation);
	return {
		position,
		quaternion: finalQuaternion,
		scale: new THREE.Vector3(scaleX, scaleY, scaleZ)
	};
}

function setMeshShadows(object: THREE.Object3D, castShadow: boolean, receiveShadow: boolean): void {
	object.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			child.castShadow = castShadow;
			child.receiveShadow = receiveShadow;
		}
	});
}

export class CalcuttaFootpathThreeRenderer implements FootpathThreeRendererApi {
	private readonly canvas: HTMLCanvasElement;
	private readonly world: SpatialWorld;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.08, 260);
	private readonly renderer: THREE.WebGLRenderer;
	private readonly raycaster = new THREE.Raycaster();
	private readonly pointer = new THREE.Vector2();
	private readonly worldRoot = new THREE.Group();
	private readonly entityRoot = new THREE.Group();
	private readonly highDetailRoot = new THREE.Group();
	private readonly roadMeshes: THREE.Mesh[] = [];
	private readonly roadMaterials = new Map<StreetSurface, THREE.MeshStandardMaterial>();
	private readonly ownedGeometries = new Set<THREE.BufferGeometry>();
	private readonly ownedMaterials = new Set<THREE.Material>();
	private readonly ownedTextures = new Set<THREE.Texture>();
	private readonly primitiveGeometries = new Map<string, THREE.BufferGeometry>();
	private readonly namedMaterials = new Map<string, THREE.MeshStandardMaterial>();
	private facadeAlbedoTexture: THREE.Texture | null = null;
	private readonly entities = new Map<string, EntityVisual>();
	private readonly entityPools = new Map<FootpathRenderEntityKind, EntityVisual[]>();
	private readonly frameDurationsMs: number[] = [];
	private readonly onMetrics?: (metrics: FootpathRendererMetrics) => void;
	private readonly onStatus?: (event: FootpathRendererStatusEvent) => void;
	private readonly fog: THREE.FogExp2;
	private readonly sun: THREE.DirectionalLight;
	private readonly sunTarget = new THREE.Object3D();
	private readonly skyColor = new THREE.Color('#b7bab2');
	private readonly drySkyColor = new THREE.Color('#b7bab2');
	private readonly rainSkyColor = new THREE.Color('#7d8788');
	private readonly puddleMaterial: THREE.MeshPhysicalMaterial;
	private readonly rainGeometry: THREE.BufferGeometry;
	private readonly rainLines: THREE.LineSegments;
	private readonly rainPositions: Float32Array;
	private readonly rainState: Float32Array;
	private readonly resizeObserver: ResizeObserver | null;
	private readonly currentCameraPosition = new THREE.Vector3();
	private readonly currentCameraTarget = new THREE.Vector3();
	private readonly desiredCameraPosition = new THREE.Vector3();
	private readonly desiredCameraTarget = new THREE.Vector3();
	private readonly temporaryQuaternion = new THREE.Quaternion();
	private readonly temporaryVector = new THREE.Vector3();
	private qualityChoice: FootpathRenderQualityChoice;
	private quality: FootpathRenderQualityTier;
	private reducedMotion: boolean;
	private cameraMovement: FootpathCameraMovement;
	private contextLost = false;
	private disposed = false;
	private hasCameraState = false;
	private cameraYaw = 0;
	private lookYaw = 0;
	private lookPitch = 0;
	private targetLookYaw = 0;
	private targetLookPitch = 0;
	private lookActive = false;
	private frameSerial = 0;
	private metricsElapsed = 0;
	private autoQualityCooldown = 0;
	private approximateTextureMemoryBytes = 0;
	private lastMetrics: FootpathRendererMetrics;
	private pendingAssetLoads = 0;
	private constructionComplete = false;
	private assetLoadFailed = false;
	private readyEmitted = false;

	constructor(canvas: HTMLCanvasElement, options: FootpathRendererOptions = {}) {
		this.canvas = canvas;
		this.world = options.world ?? CALCUTTA_SPATIAL_WORLD;
		this.qualityChoice = options.quality ?? 'auto';
		this.reducedMotion = options.reducedMotion ?? false;
		this.cameraMovement = options.cameraMovement ?? 'gentle';
		this.onMetrics = options.onMetrics;
		this.onStatus = options.onStatus;
		this.quality = chooseFootpathRenderQuality(this.qualityChoice, browserQualityHints(canvas));
		const profile = QUALITY_PROFILES[this.quality];

		try {
			this.renderer = new THREE.WebGLRenderer({
				canvas,
				alpha: false,
				antialias: profile.antialias,
				depth: true,
				powerPreference: 'high-performance',
				preserveDrawingBuffer: false
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'WebGL renderer creation failed.';
			this.emitStatus('error', message);
			throw error;
		}

		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 0.9;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.setClearColor(this.skyColor, 1);
		this.scene.background = this.skyColor;
		this.fog = new THREE.FogExp2(this.skyColor.clone(), 0.0062);
		this.scene.fog = this.fog;

		this.scene.add(this.worldRoot, this.entityRoot, this.highDetailRoot);
		const hemisphere = new THREE.HemisphereLight('#dfe4df', '#514d45', 1.48);
		this.scene.add(hemisphere);
		this.sun = new THREE.DirectionalLight('#fff0d6', 2.72);
		this.sun.position.set(-22, 36, -18);
		this.sun.castShadow = true;
		this.sun.shadow.bias = -0.00015;
		this.sun.shadow.normalBias = 0.025;
		this.sun.shadow.camera.near = 1;
		this.sun.shadow.camera.far = 90;
		this.sun.shadow.camera.left = -28;
		this.sun.shadow.camera.right = 28;
		this.sun.shadow.camera.top = 28;
		this.sun.shadow.camera.bottom = -28;
		this.scene.add(this.sun, this.sunTarget);
		this.sun.target = this.sunTarget;

		this.createPrimitives();
		this.createAuthoredWorld();
		this.puddleMaterial = this.createMaterial(
			new THREE.MeshPhysicalMaterial({
				color: '#71858c',
				roughness: 0.18,
				metalness: 0.04,
				clearcoat: 0.72,
				clearcoatRoughness: 0.12,
				transparent: true,
				opacity: 0,
				depthWrite: false,
				polygonOffset: true,
				polygonOffsetFactor: -2
			})
		);
		this.createPuddles();

		const rain = this.createRain();
		this.rainGeometry = rain.geometry;
		this.rainPositions = rain.positions;
		this.rainState = rain.state;
		this.rainLines = rain.lines;
		this.scene.add(this.rainLines);

		this.lastMetrics = {
			fps: 0,
			frameMs: 0,
			drawCalls: 0,
			triangles: 0,
			entityCount: 0,
			approximateTextureMemoryBytes: this.approximateTextureMemoryBytes,
			quality: this.quality
		};

		this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
		this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
		this.resizeObserver =
			typeof ResizeObserver === 'undefined'
				? null
				: new ResizeObserver(() => {
						if (!this.disposed) this.resize();
					});
		this.resizeObserver?.observe(canvas);
		this.applyQuality(this.quality);
		this.resize();
		this.placeCameraAtWorldStart();
		this.constructionComplete = true;
		this.emitReadyWhenAssetsSettle();
	}

	private emitStatus(status: FootpathRendererStatus, message?: string): void {
		try {
			this.onStatus?.({ status, message, quality: this.quality });
		} catch {
			// Diagnostic callbacks must not destabilize the render loop.
		}
	}

	private finishAssetLoad(errorMessage?: string): void {
		this.pendingAssetLoads = Math.max(0, this.pendingAssetLoads - 1);
		if (errorMessage) {
			this.assetLoadFailed = true;
			if (!this.disposed) this.emitStatus('error', errorMessage);
			return;
		}
		this.emitReadyWhenAssetsSettle();
	}

	private emitReadyWhenAssetsSettle(): void {
		if (
			this.disposed ||
			this.readyEmitted ||
			this.assetLoadFailed ||
			!this.constructionComplete ||
			this.pendingAssetLoads > 0
		) {
			return;
		}
		this.readyEmitted = true;
		this.emitStatus('ready');
	}

	private createGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
		this.ownedGeometries.add(geometry);
		return geometry;
	}

	private createMaterial<T extends THREE.Material>(material: T): T {
		this.ownedMaterials.add(material);
		return material;
	}

	private trackTexture<T extends THREE.Texture>(texture: T, width: number, height: number): T {
		this.ownedTextures.add(texture);
		const mipFactor = texture.generateMipmaps === false ? 1 : 4 / 3;
		this.approximateTextureMemoryBytes += Math.round(width * height * 4 * mipFactor);
		return texture;
	}

	private createPrimitives(): void {
		this.primitiveGeometries.set('box', this.createGeometry(new THREE.BoxGeometry(1, 1, 1)));
		this.primitiveGeometries.set(
			'sphere',
			this.createGeometry(new THREE.SphereGeometry(0.5, 16, 12))
		);
		this.primitiveGeometries.set(
			'cylinder',
			this.createGeometry(new THREE.CylinderGeometry(0.5, 0.5, 1, 10))
		);
		this.primitiveGeometries.set(
			'capsule',
			this.createGeometry(new THREE.CapsuleGeometry(0.5, 0.85, 5, 10))
		);
		this.primitiveGeometries.set(
			'torus',
			this.createGeometry(new THREE.TorusGeometry(0.5, 0.065, 8, 18))
		);
		this.primitiveGeometries.set(
			'arch',
			this.createGeometry(new THREE.TorusGeometry(0.5, 0.055, 8, 18, Math.PI))
		);
		this.primitiveGeometries.set('cone', this.createGeometry(new THREE.ConeGeometry(0.5, 1, 12)));
		this.primitiveGeometries.set('plane', this.createGeometry(new THREE.PlaneGeometry(1, 1)));
		this.primitiveGeometries.set('circle', this.createGeometry(new THREE.CircleGeometry(1, 24)));
	}

	private geometry(name: string): THREE.BufferGeometry {
		const geometry = this.primitiveGeometries.get(name);
		if (!geometry) throw new Error('Unknown renderer primitive: ' + name);
		return geometry;
	}

	private material(
		name: string,
		color: string,
		parameters: Omit<THREE.MeshStandardMaterialParameters, 'color'> = {}
	): THREE.MeshStandardMaterial {
		const existing = this.namedMaterials.get(name);
		if (existing) return existing;
		const material = this.createMaterial(
			new THREE.MeshStandardMaterial({
				color,
				roughness: 0.78,
				metalness: 0.02,
				...parameters
			})
		);
		this.namedMaterials.set(name, material);
		return material;
	}

	private makeCanvasTexture(
		width: number,
		height: number,
		draw: (context: CanvasRenderingContext2D, random: () => number) => void,
		seed: string,
		repeat = true
	): THREE.Texture {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) {
			const fallback = new THREE.DataTexture(
				new Uint8Array([112, 105, 92, 255]),
				1,
				1,
				THREE.RGBAFormat
			);
			fallback.colorSpace = THREE.SRGBColorSpace;
			fallback.needsUpdate = true;
			return this.trackTexture(fallback, 1, 1);
		}
		draw(context, seededRandom(hashString(seed)));
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
		texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
		texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
		texture.needsUpdate = true;
		return this.trackTexture(texture, width, height);
	}

	private createAsphaltTexture(surface: StreetSurface): THREE.Texture {
		const size = this.quality === 'high' ? 512 : 256;
		const base = new THREE.Color(ROAD_COLORS[surface]);
		return this.makeCanvasTexture(
			size,
			size,
			(context, random) => {
				context.fillStyle = '#' + base.getHexString();
				context.fillRect(0, 0, size, size);
				for (let index = 0; index < size * 4; index += 1) {
					const lightness = Math.round(35 + random() * 70);
					context.fillStyle =
						'rgba(' +
						lightness +
						',' +
						lightness +
						',' +
						(lightness - 4) +
						',' +
						(0.025 + random() * 0.09) +
						')';
					const radius = 0.3 + random() * 2.4;
					context.beginPath();
					context.arc(random() * size, random() * size, radius, 0, Math.PI * 2);
					context.fill();
				}
				context.lineCap = 'round';
				for (let crack = 0; crack < 18; crack += 1) {
					let x = random() * size;
					let y = random() * size;
					context.beginPath();
					context.moveTo(x, y);
					for (let section = 0; section < 3 + Math.floor(random() * 5); section += 1) {
						x += (random() - 0.5) * 34;
						y += (random() - 0.5) * 34;
						context.lineTo(x, y);
					}
					context.strokeStyle = 'rgba(25,24,22,' + (0.08 + random() * 0.16) + ')';
					context.lineWidth = 0.6 + random() * 1.4;
					context.stroke();
				}
				for (let patch = 0; patch < 7; patch += 1) {
					context.fillStyle = 'rgba(30,29,27,' + (0.04 + random() * 0.1) + ')';
					context.beginPath();
					context.ellipse(
						random() * size,
						random() * size,
						8 + random() * 26,
						4 + random() * 16,
						random() * Math.PI,
						0,
						Math.PI * 2
					);
					context.fill();
				}
			},
			'asphalt-' + surface
		);
	}

	private createFacadeTexture(color: string, index: number): THREE.Texture {
		const size = this.quality === 'high' ? 256 : 128;
		const base = new THREE.Color(color);
		return this.makeCanvasTexture(
			size,
			size,
			(context, random) => {
				context.fillStyle = '#' + base.getHexString();
				context.fillRect(0, 0, size, size);
				for (let mark = 0; mark < size * 2.4; mark += 1) {
					const tone = random() < 0.62 ? 28 : 226;
					context.fillStyle = `rgba(${tone},${tone - 3},${Math.max(0, tone - 10)},${0.012 + random() * 0.045})`;
					context.fillRect(
						random() * size,
						random() * size,
						0.7 + random() * 3.2,
						0.5 + random() * 2.2
					);
				}
				const damp = context.createLinearGradient(0, size * 0.58, 0, size);
				damp.addColorStop(0, 'rgba(43,55,46,0)');
				damp.addColorStop(1, 'rgba(36,48,40,0.25)');
				context.fillStyle = damp;
				context.fillRect(0, size * 0.56, size, size * 0.44);
				for (let streak = 0; streak < 14; streak += 1) {
					const x = random() * size;
					const startY = random() * size * 0.42;
					context.strokeStyle = `rgba(45,47,40,${0.025 + random() * 0.055})`;
					context.lineWidth = 0.5 + random() * 2;
					context.beginPath();
					context.moveTo(x, startY);
					context.lineTo(x + (random() - 0.5) * 3, startY + 18 + random() * 60);
					context.stroke();
				}
				for (let patch = 0; patch < 4; patch += 1) {
					const x = random() * size * 0.82;
					const y = random() * size * 0.82;
					const width = size * (0.06 + random() * 0.16);
					const height = size * (0.035 + random() * 0.12);
					context.fillStyle = `rgba(57,52,44,${0.055 + random() * 0.08})`;
					context.beginPath();
					context.moveTo(x, y + height * 0.25);
					context.lineTo(x + width * 0.22, y);
					context.lineTo(x + width, y + height * 0.18);
					context.lineTo(x + width * 0.82, y + height);
					context.lineTo(x + width * 0.08, y + height * 0.83);
					context.closePath();
					context.fill();
				}
				if (index === 0 || index === 4) {
					const patchX = size * (0.12 + random() * 0.48);
					const patchY = size * (0.22 + random() * 0.38);
					const brickWidth = size * (0.22 + random() * 0.16);
					const brickHeight = size * (0.14 + random() * 0.12);
					context.fillStyle = 'rgba(92,52,41,0.38)';
					context.fillRect(patchX, patchY, brickWidth, brickHeight);
					context.strokeStyle = 'rgba(205,178,142,0.25)';
					context.lineWidth = Math.max(0.55, size / 256);
					const rowHeight = brickHeight / 5;
					for (let row = 0; row <= 5; row += 1) {
						const rowY = patchY + row * rowHeight;
						context.beginPath();
						context.moveTo(patchX, rowY);
						context.lineTo(patchX + brickWidth, rowY);
						context.stroke();
						if (row < 5) {
							const offset = row % 2 === 0 ? 0 : brickWidth / 8;
							for (let column = 1; column < 4; column += 1) {
								const columnX = patchX + offset + (column * brickWidth) / 4;
								context.beginPath();
								context.moveTo(columnX, rowY);
								context.lineTo(columnX, rowY + rowHeight);
								context.stroke();
							}
						}
					}
				}
				for (let crack = 0; crack < 5; crack += 1) {
					let x = random() * size;
					let y = random() * size;
					context.beginPath();
					context.moveTo(x, y);
					for (let section = 0; section < 3; section += 1) {
						x += (random() - 0.5) * 10;
						y += 5 + random() * 10;
						context.lineTo(x, y);
					}
					context.strokeStyle = 'rgba(37,34,30,0.12)';
					context.lineWidth = 0.55;
					context.stroke();
				}
			},
			`facade-plaster-${index}`
		);
	}

	private authoredFacadeAlbedo(): THREE.Texture {
		if (this.facadeAlbedoTexture) return this.facadeAlbedoTexture;
		const url = '/images/games/calcutta-footpath-facade-albedo-v2.jpg';
		this.pendingAssetLoads += 1;
		let texture: THREE.Texture;
		try {
			texture = new THREE.TextureLoader().load(
				url,
				() => this.finishAssetLoad(),
				undefined,
				(error) => {
					const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
					this.finishAssetLoad(`The authored facade texture could not be loaded.${detail}`);
				}
			);
		} catch (error) {
			const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
			this.finishAssetLoad(`The authored facade texture could not be loaded.${detail}`);
			throw error;
		}
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		texture.repeat.set(1.08, 1.08);
		texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
		this.facadeAlbedoTexture = this.trackTexture(texture, 1_024, 1_024);
		return this.facadeAlbedoTexture;
	}

	private roadMaterial(surface: StreetSurface): THREE.MeshStandardMaterial {
		const existing = this.roadMaterials.get(surface);
		if (existing) return existing;
		const texture = this.createAsphaltTexture(surface);
		texture.repeat.set(1, 1);
		const material = this.createMaterial(
			new THREE.MeshStandardMaterial({
				color: '#ffffff',
				map: texture,
				roughness: surface === 'workshop-concrete' ? 0.82 : 0.9,
				metalness: 0.015
			})
		);
		material.userData.dryColor = material.color.clone();
		material.userData.dryRoughness = material.roughness;
		this.roadMaterials.set(surface, material);
		return material;
	}

	private createAuthoredWorld(): void {
		const bounds = getWorldBounds(this.world, 30);
		const groundTexture = this.makeCanvasTexture(
			384,
			384,
			(context, random) => {
				context.fillStyle = '#736a58';
				context.fillRect(0, 0, 384, 384);
				for (let index = 0; index < 1_800; index += 1) {
					const shade = 65 + Math.floor(random() * 65);
					context.fillStyle =
						'rgba(' +
						shade +
						',' +
						(shade - 6) +
						',' +
						(shade - 14) +
						',' +
						(0.025 + random() * 0.08) +
						')';
					context.fillRect(random() * 384, random() * 384, 1 + random() * 3, 1 + random() * 3);
				}
			},
			'neighbourhood-ground'
		);
		groundTexture.repeat.set(Math.max(4, bounds.widthM / 14), Math.max(4, bounds.depthM / 14));
		const ground = new THREE.Mesh(
			this.createGeometry(new THREE.PlaneGeometry(bounds.widthM, bounds.depthM)),
			this.createMaterial(
				new THREE.MeshStandardMaterial({
					color: '#ffffff',
					map: groundTexture,
					roughness: 1
				})
			)
		);
		ground.rotation.x = -Math.PI / 2;
		ground.position.set(bounds.centre.x, -0.045, bounds.centre.z);
		ground.receiveShadow = true;
		this.worldRoot.add(ground);

		const shoulderMaterial = this.material('road-shoulder', '#5f574a', { roughness: 1 });
		const openDrainMaterial = this.material('road-edge-drain', '#303633', {
			roughness: 0.76,
			metalness: 0.08
		});
		for (const edge of this.world.edges) {
			const openDrain = this.createRoadRibbon(
				edge,
				edge.widthM + 0.72,
				-0.014,
				openDrainMaterial,
				false
			);
			const shoulder = this.createRoadRibbon(
				edge,
				edge.widthM + 0.45,
				-0.006,
				shoulderMaterial,
				false
			);
			const road = this.createRoadRibbon(
				edge,
				edge.widthM,
				0.006,
				this.roadMaterial(edge.surface),
				true
			);
			road.userData.edgeId = edge.id;
			road.userData.widthM = edge.widthM;
			road.userData.isWalkableRoad = true;
			road.receiveShadow = true;
			this.roadMeshes.push(road);
			this.worldRoot.add(openDrain, shoulder, road);
		}

		const facades = this.collectFacadeSpecs();
		this.addFacadeBatch(facades.base, this.worldRoot, false);
		this.addFacadeBatch(facades.detail, this.highDetailRoot, true);
		this.createWorldSigns();
		this.createStreetFurniture();
		this.createFrontageProps();
		this.createOverheadWires();
	}

	private createRoadRibbon(
		edge: SpatialEdge,
		widthM: number,
		y: number,
		material: THREE.Material,
		irregular: boolean
	): THREE.Mesh {
		const points = resamplePolyline(edgePolyline(edge, this.world));
		const random = seededRandom(hashString('road-' + edge.id));
		const positions: number[] = [];
		const uvs: number[] = [];
		const indices: number[] = [];
		let traversed = 0;
		for (let index = 0; index < points.length; index += 1) {
			const previous = points[Math.max(0, index - 1)];
			const next = points[Math.min(points.length - 1, index + 1)];
			const dx = next.x - previous.x;
			const dz = next.z - previous.z;
			const length = Math.hypot(dx, dz) || 1;
			const normalX = -dz / length;
			const normalZ = dx / length;
			if (index > 0) {
				traversed += Math.hypot(
					points[index].x - points[index - 1].x,
					points[index].z - points[index - 1].z
				);
			}
			const edgeNoise = irregular ? (random() - 0.5) * Math.min(0.26, widthM * 0.06) : 0;
			const leftWidth = widthM / 2 + edgeNoise;
			const rightWidth = widthM / 2 + (irregular ? (random() - 0.5) * 0.22 : 0);
			positions.push(
				points[index].x + normalX * leftWidth,
				y,
				points[index].z + normalZ * leftWidth,
				points[index].x - normalX * rightWidth,
				y,
				points[index].z - normalZ * rightWidth
			);
			uvs.push(0, traversed / 4.5, widthM / 4.5, traversed / 4.5);
			if (index < points.length - 1) {
				const left = index * 2;
				indices.push(left, left + 2, left + 1, left + 2, left + 3, left + 1);
			}
		}
		const geometry = this.createGeometry(new THREE.BufferGeometry());
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
		geometry.setIndex(indices);
		geometry.computeVertexNormals();
		geometry.computeBoundingSphere();
		return new THREE.Mesh(geometry, material);
	}

	private collectFacadeSpecs(): { base: FacadeSpec[]; detail: FacadeSpec[] } {
		const base: FacadeSpec[] = [];
		const detail: FacadeSpec[] = [];
		for (const edge of this.world.edges) {
			const points = edgePolyline(edge, this.world);
			const length = polylineLength(points);
			const random = seededRandom(hashString('facade-' + edge.id));
			const spacing = 11.5 + random() * 3.2;
			let sequence = 0;
			for (let offset = 4 + random() * 3; offset < length - 3; offset += spacing) {
				const sample = pointAndTangentAt(points, offset);
				for (const side of [-1, 1] as const) {
					const entryFrontage = edge.id === 'spine-south-1' && sequence === 0;
					const depthM = 5.2 + random() * 3.2;
					const widthM = Math.min(spacing - 0.65, 5.4 + random() * 3.8);
					const floors = entryFrontage ? 3 : 2 + Math.floor(random() * 3);
					const heightM = floors * (2.75 + random() * 0.2) + 0.45;
					const leftNormal = { x: -sample.tangent.z, z: sample.tangent.x };
					const distance = edge.widthM / 2 + depthM / 2 + 0.38 + random() * 0.35;
					const position = {
						x: sample.point.x + leftNormal.x * side * distance,
						z: sample.point.z + leftNormal.z * side * distance
					};
					const yaw = Math.atan2(-sample.tangent.z, sample.tangent.x) + (side === -1 ? Math.PI : 0);
					const shopChance = edge.shopDensity * 0.72;
					const hasAwning = (entryFrontage && side === 1) || random() < shopChance;
					const spec: FacadeSpec = {
						position,
						quaternion: new THREE.Quaternion().setFromAxisAngle(UP, yaw),
						widthM,
						depthM,
						heightM,
						floors,
						paletteIndex: entryFrontage
							? side === -1
								? 3
								: 1
							: Math.floor(random() * FACADE_COLORS.length),
						hasBalcony: (entryFrontage && side === -1) || (floors >= 3 && random() < 0.42),
						hasAwning,
						hasShutters: entryFrontage || random() < 0.7,
						hasPipe: random() < 0.64,
						hasClothes: (entryFrontage && side === -1) || (floors >= 3 && random() < 0.28),
						signIndex:
							entryFrontage && side === 1
								? 1
								: hasAwning && random() < 0.58
									? Math.floor(random() * SHOP_SIGNS.length)
									: -1
					};
					const isBase = side === (sequence % 2 === 0 ? -1 : 1) && sequence % 2 === 0;
					(isBase ? base : detail).push(spec);
				}
				sequence += 1;
			}
		}
		return { base, detail };
	}

	private addInstanced(
		parent: THREE.Group,
		geometry: THREE.BufferGeometry,
		material: THREE.Material,
		transforms: readonly TransformSpec[],
		castShadow: boolean,
		receiveShadow: boolean
	): THREE.InstancedMesh | null {
		if (transforms.length === 0) return null;
		const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
		const matrix = new THREE.Matrix4();
		for (let index = 0; index < transforms.length; index += 1) {
			const transform = transforms[index];
			matrix.compose(transform.position, transform.quaternion, transform.scale);
			mesh.setMatrixAt(index, matrix);
		}
		mesh.instanceMatrix.needsUpdate = true;
		mesh.castShadow = castShadow;
		mesh.receiveShadow = receiveShadow;
		mesh.frustumCulled = true;
		parent.add(mesh);
		return mesh;
	}

	private addFacadeBatch(
		specs: readonly FacadeSpec[],
		parent: THREE.Group,
		optionalDetail: boolean
	): void {
		const walls = FACADE_COLORS.map(() => [] as TransformSpec[]);
		const roofs: TransformSpec[] = [];
		const windows: TransformSpec[] = [];
		const windowTrim: TransformSpec[] = [];
		const windowArches: TransformSpec[] = [];
		const shutters: TransformSpec[] = [];
		const doors: TransformSpec[] = [];
		const plinths: TransformSpec[] = [];
		const cornices: TransformSpec[] = [];
		const shopShutters: TransformSpec[] = [];
		const balconies: TransformSpec[] = [];
		const railings: TransformSpec[] = [];
		const balconyBalusters: TransformSpec[] = [];
		const pilasters: TransformSpec[] = [];
		const awnings: TransformSpec[] = [];
		const pipes: TransformSpec[] = [];
		const clothes = CLOTH_COLORS.map(() => [] as TransformSpec[]);
		const signPlacements: { spec: FacadeSpec; signIndex: number }[] = [];

		for (const spec of specs) {
			walls[spec.paletteIndex].push(
				localTransform(
					spec.position,
					spec.quaternion,
					0,
					spec.heightM / 2,
					0,
					spec.widthM,
					spec.heightM,
					spec.depthM
				)
			);
			roofs.push(
				localTransform(
					spec.position,
					spec.quaternion,
					0,
					spec.heightM + 0.18,
					0,
					spec.widthM + 0.15,
					0.36,
					spec.depthM + 0.15
				)
			);
			const columns = Math.max(2, Math.floor(spec.widthM / 2));
			plinths.push(
				localTransform(
					spec.position,
					spec.quaternion,
					0,
					0.24,
					-spec.depthM / 2 - 0.035,
					spec.widthM * 0.98,
					0.48,
					0.12
				)
			);
			for (const x of [-spec.widthM * 0.445, spec.widthM * 0.445]) {
				pilasters.push(
					localTransform(
						spec.position,
						spec.quaternion,
						x,
						spec.heightM / 2,
						-spec.depthM / 2 - 0.075,
						0.16,
						spec.heightM * 0.96,
						0.17
					)
				);
			}
			for (let floor = 1; floor < spec.floors; floor += 1) {
				const floorY = floor * (spec.heightM / spec.floors);
				cornices.push(
					localTransform(
						spec.position,
						spec.quaternion,
						0,
						floorY - 1.22,
						-spec.depthM / 2 - 0.08,
						spec.widthM * 1.01,
						0.09,
						0.18
					)
				);
				for (let column = 0; column < columns; column += 1) {
					const x = ((column + 0.5) / columns - 0.5) * spec.widthM * 0.78;
					const y = floorY + 0.15;
					const z = -spec.depthM / 2 - 0.035;
					windows.push(localTransform(spec.position, spec.quaternion, x, y, z, 0.78, 1.05, 0.08));
					windowTrim.push(
						localTransform(spec.position, spec.quaternion, x, y + 0.59, z - 0.055, 0.94, 0.1, 0.13),
						localTransform(spec.position, spec.quaternion, x, y - 0.59, z - 0.055, 0.94, 0.1, 0.13),
						localTransform(
							spec.position,
							spec.quaternion,
							x - 0.47,
							y,
							z - 0.06,
							0.055,
							1.08,
							0.13
						),
						localTransform(spec.position, spec.quaternion, x + 0.47, y, z - 0.06, 0.055, 1.08, 0.13)
					);
					if ((column + floor + spec.paletteIndex) % 3 === 0) {
						windowArches.push(
							localTransform(
								spec.position,
								spec.quaternion,
								x,
								y + 0.18,
								z - 0.095,
								1.02,
								0.8,
								0.42
							)
						);
					}
					if (spec.hasShutters && (column + floor) % 2 === 0) {
						shutters.push(
							localTransform(
								spec.position,
								spec.quaternion,
								x - 0.53,
								y,
								z - 0.03,
								0.24,
								1.12,
								0.065
							),
							localTransform(
								spec.position,
								spec.quaternion,
								x + 0.53,
								y,
								z - 0.03,
								0.24,
								1.12,
								0.065
							)
						);
					}
				}
			}
			doors.push(
				localTransform(
					spec.position,
					spec.quaternion,
					spec.hasAwning ? -spec.widthM * 0.24 : 0,
					1.05,
					-spec.depthM / 2 - 0.045,
					spec.hasAwning ? 1.45 : 1.1,
					2.1,
					0.1
				)
			);
			if (spec.hasBalcony) {
				const y = Math.min(spec.heightM - 2.4, 5.6);
				balconies.push(
					localTransform(
						spec.position,
						spec.quaternion,
						0,
						y,
						-spec.depthM / 2 - 0.55,
						spec.widthM * 0.66,
						0.14,
						1.15
					)
				);
				railings.push(
					localTransform(
						spec.position,
						spec.quaternion,
						0,
						y + 0.28,
						-spec.depthM / 2 - 1.08,
						spec.widthM * 0.64,
						0.07,
						0.055
					),
					localTransform(
						spec.position,
						spec.quaternion,
						0,
						y + 0.86,
						-spec.depthM / 2 - 1.08,
						spec.widthM * 0.64,
						0.08,
						0.055
					)
				);
				const balconyWidth = spec.widthM * 0.64;
				const balusterCount = Math.max(6, Math.floor(balconyWidth / 0.42));
				for (let baluster = 0; baluster <= balusterCount; baluster += 1) {
					balconyBalusters.push(
						localTransform(
							spec.position,
							spec.quaternion,
							(baluster / balusterCount - 0.5) * balconyWidth,
							y + 0.57,
							-spec.depthM / 2 - 1.08,
							0.045,
							0.58,
							0.045
						)
					);
				}
			}
			if (spec.hasAwning) {
				const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.16);
				awnings.push(
					localTransform(
						spec.position,
						spec.quaternion,
						spec.widthM * 0.18,
						2.45,
						-spec.depthM / 2 - 0.58,
						Math.min(3.5, spec.widthM * 0.56),
						0.1,
						1.25,
						tilt
					)
				);
				shopShutters.push(
					localTransform(
						spec.position,
						spec.quaternion,
						spec.widthM * 0.18,
						1.08,
						-spec.depthM / 2 - 0.052,
						Math.min(3.5, spec.widthM * 0.55),
						2.15,
						0.105
					)
				);
			}
			if (spec.hasPipe) {
				pipes.push(
					localTransform(
						spec.position,
						spec.quaternion,
						spec.widthM * 0.42,
						spec.heightM / 2,
						-spec.depthM / 2 - 0.09,
						0.09,
						spec.heightM * 0.94,
						0.09
					)
				);
			}
			if (spec.hasClothes) {
				for (let item = 0; item < 4; item += 1) {
					const x = (item / 3 - 0.5) * spec.widthM * 0.55;
					clothes[(spec.paletteIndex + item) % clothes.length].push(
						localTransform(
							spec.position,
							spec.quaternion,
							x,
							spec.heightM - 1.45 - (item % 2) * 0.08,
							-spec.depthM / 2 - 0.72,
							0.58 + (item % 2) * 0.16,
							0.68,
							0.035
						)
					);
				}
			}
			if (spec.signIndex >= 0 && signPlacements.length < (optionalDetail ? 22 : 8)) {
				signPlacements.push({ spec, signIndex: spec.signIndex });
			}
		}

		for (let index = 0; index < walls.length; index += 1) {
			const materialName = 'facade-' + index;
			const roughnessVariation = this.createFacadeTexture(FACADE_COLORS[index], index);
			roughnessVariation.colorSpace = THREE.NoColorSpace;
			const tint = new THREE.Color(FACADE_COLORS[index]).lerp(new THREE.Color('#ffffff'), 0.38);
			const facadeMaterial =
				this.namedMaterials.get(materialName) ??
				this.material(materialName, '#' + tint.getHexString(), {
					roughness: 0.94,
					map: this.authoredFacadeAlbedo(),
					roughnessMap: roughnessVariation
				});
			this.addInstanced(parent, this.geometry('box'), facadeMaterial, walls[index], true, true);
		}
		this.addInstanced(
			parent,
			this.geometry('box'),
			this.material('roof', '#665e52'),
			roofs,
			false,
			true
		);
		this.addInstanced(
			parent,
			this.geometry('box'),
			this.material('window', '#29444c', { roughness: 0.34, metalness: 0.05 }),
			windows,
			false,
			false
		);
		this.addInstanced(
			parent,
			this.geometry('arch'),
			this.material('window-arch', '#b29d78', { roughness: 0.88 }),
			windowArches,
			false,
			false
		);
		this.addInstanced(
			parent,
			this.geometry('box'),
			this.material('window-trim', '#b29d78', { roughness: 0.88 }),
			windowTrim,
			false,
			false
		);
		this.addInstanced(
			parent,
			this.geometry('box'),
			this.material('shutters', '#315b50'),
			shutters,
			false,
			false
		);
		this.addInstanced(
			parent,
			this.geometry('box'),
			this.material('doors', '#523b2d'),
			doors,
			false,
			true
		);
		this.addInstanced(
			parent,
			this.geometry('box'),
			this.material('facade-pilaster', '#97866e', { roughness: 0.92 }),
			pilasters,
			true,
			true
		);
		this.addInstanced(
			parent,
			this.geometry('box'),
			this.material('facade-plinth', '#5a5145', { roughness: 0.98 }),
			plinths,
			false,
			true
		);
		this.addInstanced(
			parent,
			this.geometry('box'),
			this.material('facade-cornice', '#8c7d67', { roughness: 0.92 }),
			cornices,
			true,
			true
		);
		this.addInstanced(
			parent,
			this.geometry('box'),
			this.material('shop-shutter', '#586060', { roughness: 0.72, metalness: 0.17 }),
			shopShutters,
			false,
			true
		);
		this.addInstanced(
			parent,
			this.geometry('box'),
			this.material('balcony-slab', '#756b5e'),
			balconies,
			true,
			true
		);
		this.addInstanced(
			parent,
			this.geometry('box'),
			this.material('balcony-rail', '#363b39', { metalness: 0.22 }),
			railings,
			false,
			false
		);
		this.addInstanced(
			parent,
			this.geometry('cylinder'),
			this.material('balcony-baluster', '#303533', { metalness: 0.28 }),
			balconyBalusters,
			false,
			false
		);
		this.addInstanced(
			parent,
			this.geometry('box'),
			this.material('awning', '#8a4438'),
			awnings,
			true,
			true
		);
		this.addInstanced(
			parent,
			this.geometry('cylinder'),
			this.material('pipes', '#565955', { metalness: 0.24 }),
			pipes,
			false,
			false
		);
		for (let index = 0; index < clothes.length; index += 1) {
			this.addInstanced(
				parent,
				this.geometry('box'),
				this.material('cloth-' + index, CLOTH_COLORS[index]),
				clothes[index],
				false,
				false
			);
		}
		for (const placement of signPlacements) {
			const sign = SHOP_SIGNS[placement.signIndex];
			const position = new THREE.Vector3(0, 2.75, -placement.spec.depthM / 2 - 0.11)
				.applyQuaternion(placement.spec.quaternion)
				.add(new THREE.Vector3(placement.spec.position.x, 0, placement.spec.position.z));
			this.addSignBoard(
				parent,
				sign.english,
				sign.bengali,
				sign.color,
				position,
				placement.spec.quaternion
					.clone()
					.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI)),
				Math.min(2.4, placement.spec.widthM * 0.45)
			);
		}
	}

	private addSignBoard(
		parent: THREE.Group,
		english: string,
		bengali: string,
		color: string,
		position: THREE.Vector3,
		quaternion: THREE.Quaternion,
		widthM: number
	): void {
		const texture = this.makeCanvasTexture(
			512,
			256,
			(context) => {
				context.fillStyle = color;
				context.fillRect(0, 0, 512, 256);
				context.strokeStyle = '#dcc89f';
				context.lineWidth = 14;
				context.strokeRect(8, 8, 496, 240);
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				context.fillStyle = '#f4e6c8';
				context.font = '700 54px "Noto Sans Bengali", "Nirmala UI", sans-serif';
				context.fillText(bengali, 256, 92, 450);
				context.font = '700 31px system-ui, sans-serif';
				context.fillText(english, 256, 176, 450);
			},
			'sign-' + english + '-' + bengali,
			false
		);
		const material = this.createMaterial(
			new THREE.MeshStandardMaterial({
				map: texture,
				roughness: 0.72,
				metalness: 0.02,
				side: THREE.DoubleSide
			})
		);
		const board = new THREE.Mesh(this.geometry('plane'), material);
		board.position.copy(position);
		board.quaternion.copy(quaternion);
		board.scale.set(widthM, widthM * 0.5, 1);
		board.castShadow = true;
		parent.add(board);
	}

	private createWorldSigns(): void {
		for (const sign of this.world.signs) {
			this.addSignBoard(
				this.worldRoot,
				sign.english,
				sign.bengali,
				'#365a64',
				new THREE.Vector3(sign.position.x, 2.7, sign.position.z),
				new THREE.Quaternion().setFromAxisAngle(UP, sign.facingRadians),
				2.7
			);
		}
	}

	private createStreetFurniture(): void {
		for (const stall of this.world.stalls) {
			const model = this.createEntityModel('stall', stall.id + '-' + stall.kind);
			model.position.set(stall.position.x, 0, stall.position.z);
			model.rotation.y = stall.facingRadians;
			model.scale.set(stall.footprintM[0] / 2.2, 1, stall.footprintM[1] / 1.4);
			this.worldRoot.add(model);
		}
		for (const landmark of this.world.landmarks) {
			const group = new THREE.Group();
			group.position.set(landmark.position.x, 0, landmark.position.z);
			group.rotation.y = landmark.facingRadians;
			if (landmark.kind === 'large-tree') {
				this.addPart(group, 'cylinder', 'tree-trunk', '#604934', [0, 2.5, 0], [0.5, 5, 0.5]);
				this.addPart(group, 'sphere', 'tree-leaves', '#4f6946', [0, 5.1, 0], [3.1, 2.4, 3.1]);
				this.addPart(group, 'sphere', 'tree-leaves', '#4f6946', [1.4, 5.8, 0.4], [2, 1.8, 2]);
			} else if (landmark.kind === 'water-pump') {
				this.addPart(group, 'cylinder', 'pump-green', '#315d50', [0, 0.62, 0], [0.32, 1.24, 0.32]);
				this.addPart(group, 'box', 'pump-green', '#315d50', [0, 1.24, 0], [0.52, 0.28, 0.52]);
				this.addPart(
					group,
					'cylinder',
					'pump-metal',
					'#4f5856',
					[0.45, 1.32, 0],
					[0.09, 0.9, 0.09],
					[0, 0, Math.PI / 2]
				);
			} else if (landmark.kind === 'courtyard-gate') {
				this.addPart(group, 'box', 'gate-blue', '#315a70', [-1.25, 1.7, 0], [0.45, 3.4, 0.45]);
				this.addPart(group, 'box', 'gate-blue', '#315a70', [1.25, 1.7, 0], [0.45, 3.4, 0.45]);
				this.addPart(group, 'box', 'gate-blue', '#315a70', [0, 3.25, 0], [2.9, 0.35, 0.45]);
			} else if (landmark.kind === 'red-house') {
				this.addPart(group, 'box', 'red-house-plaster', '#82493f', [0, 3.1, 0], [5.8, 6.2, 0.72]);
				this.addPart(
					group,
					'box',
					'heritage-cornice',
					'#b39472',
					[0, 3.15, -0.42],
					[5.95, 0.15, 0.18]
				);
				this.addPart(
					group,
					'box',
					'heritage-cornice',
					'#b39472',
					[0, 5.72, -0.42],
					[6.05, 0.24, 0.2]
				);
				this.addPart(
					group,
					'box',
					'red-house-door',
					'#3b574c',
					[0, 1.12, -0.41],
					[1.35, 2.24, 0.12]
				);
				for (const x of [-1.75, 1.75]) {
					this.addPart(
						group,
						'box',
						'heritage-window',
						'#263f45',
						[x, 4.38, -0.42],
						[0.92, 1.28, 0.1]
					);
					this.addPart(
						group,
						'torus',
						'heritage-trim',
						'#c0a57c',
						[x, 4.43, -0.51],
						[1.14, 1.47, 0.42]
					);
				}
				this.addPart(group, 'box', 'balcony-slab', '#756b5e', [0, 3.48, -0.82], [4.2, 0.15, 1.06]);
				for (let x = -1.9; x <= 1.9; x += 0.38) {
					this.addPart(
						group,
						'cylinder',
						'balcony-baluster',
						'#303533',
						[x, 3.86, -1.29],
						[0.045, 0.7, 0.045]
					);
				}
				this.addPart(group, 'box', 'balcony-rail', '#303533', [0, 4.22, -1.29], [4.15, 0.08, 0.08]);
			} else if (landmark.kind === 'old-balcony') {
				this.addPart(group, 'box', 'old-house-plaster', '#80745f', [0, 2.9, 0], [5.1, 5.8, 0.68]);
				this.addPart(
					group,
					'box',
					'old-green-shutter',
					'#2d5547',
					[-1.3, 4.1, -0.4],
					[0.82, 1.38, 0.12]
				);
				this.addPart(
					group,
					'box',
					'old-green-shutter',
					'#2d5547',
					[1.3, 4.1, -0.4],
					[0.82, 1.38, 0.12]
				);
				this.addPart(group, 'box', 'balcony-slab', '#6e665a', [0, 3.08, -0.86], [4.6, 0.16, 1.18]);
				for (let x = -2.05; x <= 2.05; x += 0.36) {
					this.addPart(
						group,
						'cylinder',
						'old-balcony-iron',
						'#243b36',
						[x, 3.52, -1.39],
						[0.04, 0.78, 0.04]
					);
				}
				this.addPart(
					group,
					'box',
					'old-balcony-iron',
					'#243b36',
					[0, 3.92, -1.39],
					[4.55, 0.08, 0.08]
				);
			} else if (landmark.kind === 'workshop-shutter') {
				this.addPart(group, 'box', 'workshop-wall', '#696960', [0, 2.1, 0], [5.6, 4.2, 0.72]);
				this.addPart(
					group,
					'box',
					'workshop-shutter-landmark',
					'#4f5a5b',
					[0, 1.45, -0.42],
					[4.8, 2.9, 0.12],
					[0, 0, 0],
					{
						metalness: 0.2,
						roughness: 0.72
					}
				);
				for (let x = -2.25; x <= 2.25; x += 0.3) {
					this.addPart(
						group,
						'box',
						'workshop-rib',
						'#697476',
						[x, 1.45, -0.5],
						[0.035, 2.82, 0.04],
						[0, 0, 0],
						{
							metalness: 0.24
						}
					);
				}
				this.addPart(
					group,
					'box',
					'workshop-lintel',
					'#363d3d',
					[0, 3.28, -0.43],
					[5.15, 0.38, 0.16]
				);
			} else if (landmark.kind === 'corner-shop') {
				this.addPart(group, 'box', 'corner-shop-wall', '#b6a06f', [0, 2.05, 0], [4.9, 4.1, 0.7]);
				this.addPart(
					group,
					'box',
					'pharmacy-shutter',
					'#315b50',
					[0, 1.25, -0.42],
					[3.9, 2.5, 0.12]
				);
				this.addPart(
					group,
					'box',
					'pharmacy-sign',
					'#295a4f',
					[0, 3.08, -0.48],
					[4.25, 0.66, 0.16]
				);
				this.addPart(
					group,
					'box',
					'pharmacy-cross',
					'#e6dfc8',
					[0, 3.08, -0.59],
					[0.16, 0.48, 0.08]
				);
				this.addPart(
					group,
					'box',
					'pharmacy-cross',
					'#e6dfc8',
					[0, 3.08, -0.59],
					[0.48, 0.16, 0.08]
				);
			} else {
				this.addPart(group, 'box', 'landmark-brick', '#8e5a4f', [0, 1.15, 0], [2.2, 2.3, 0.45]);
			}
			setMeshShadows(group, true, true);
			this.worldRoot.add(group);
		}
	}

	private createFrontageProps(): void {
		const edges = this.world.edges.filter((edge) => edge.archetype !== 'wider-road');
		for (let index = 0; index < edges.length; index += 2) {
			const edge = edges[index];
			const points = edgePolyline(edge, this.world);
			const length = polylineLength(points);
			if (length < 10) continue;
			const random = seededRandom(hashString('frontage-prop-' + edge.id));
			const sample = pointAndTangentAt(points, length * (0.26 + random() * 0.42));
			const normal = { x: -sample.tangent.z, z: sample.tangent.x };
			const side = index % 4 === 0 ? -1 : 1;
			const offset = edge.widthM / 2 + 0.24;
			const group = new THREE.Group();
			group.position.set(
				sample.point.x + normal.x * side * offset,
				0,
				sample.point.z + normal.z * side * offset
			);
			this.addPart(
				group,
				'cylinder',
				'terracotta-pot',
				'#80563f',
				[0, 0.18, 0],
				[0.34, 0.36, 0.34]
			);
			this.addPart(group, 'sphere', 'frontage-plant', '#526449', [0, 0.57, 0], [0.55, 0.62, 0.5]);
			if (random() < 0.58) {
				const poleX = sample.tangent.x * 0.52;
				const poleZ = sample.tangent.z * 0.52;
				this.addPart(
					group,
					'cylinder',
					'utility-pole',
					'#4a4a43',
					[poleX, 1.7, poleZ],
					[0.1, 3.4, 0.1]
				);
				this.addPart(
					group,
					'box',
					'meter-box',
					'#4d5956',
					[poleX, 1.45, poleZ],
					[0.34, 0.5, 0.16],
					[0, Math.atan2(normal.x * side, normal.z * side), 0],
					{ metalness: 0.18, roughness: 0.74 }
				);
			}
			setMeshShadows(group, true, true);
			this.highDetailRoot.add(group);
		}
	}

	private createOverheadWires(): void {
		const positions: number[] = [];
		for (const edge of this.world.edges) {
			const points = edgePolyline(edge, this.world);
			const length = polylineLength(points);
			if (length < 18) continue;
			const random = seededRandom(hashString('wire-' + edge.id));
			const sample = pointAndTangentAt(points, length * (0.35 + random() * 0.3));
			const normal = { x: -sample.tangent.z, z: sample.tangent.x };
			const span = edge.widthM / 2 + 4.4;
			const left = { x: sample.point.x + normal.x * span, z: sample.point.z + normal.z * span };
			const right = { x: sample.point.x - normal.x * span, z: sample.point.z - normal.z * span };
			const heightLeft = 6.8 + random() * 2.2;
			const heightRight = 6.6 + random() * 2.4;
			const middle = {
				x: (left.x + right.x) / 2,
				z: (left.z + right.z) / 2,
				y: Math.min(heightLeft, heightRight) - 0.55
			};
			positions.push(
				left.x,
				heightLeft,
				left.z,
				middle.x,
				middle.y,
				middle.z,
				middle.x,
				middle.y,
				middle.z,
				right.x,
				heightRight,
				right.z
			);
		}
		const geometry = this.createGeometry(new THREE.BufferGeometry());
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		const material = this.createMaterial(
			new THREE.LineBasicMaterial({ color: '#302d2b', transparent: true, opacity: 0.76 })
		);
		this.highDetailRoot.add(new THREE.LineSegments(geometry, material));
	}

	private createPuddles(): void {
		const transforms: TransformSpec[] = [];
		for (const edge of this.world.edges) {
			if (edge.weatherExposure < 0.3) continue;
			const points = edgePolyline(edge, this.world);
			const length = polylineLength(points);
			const random = seededRandom(hashString('puddles-' + edge.id));
			const count = Math.max(1, Math.floor((length / 24) * edge.weatherExposure));
			for (let index = 0; index < count; index += 1) {
				const sample = pointAndTangentAt(points, (0.12 + random() * 0.76) * length);
				const lateral = (random() - 0.5) * edge.widthM * 0.65;
				const normal = { x: -sample.tangent.z, z: sample.tangent.x };
				const position = new THREE.Vector3(
					sample.point.x + normal.x * lateral,
					0.022,
					sample.point.z + normal.z * lateral
				);
				const quaternion = new THREE.Quaternion()
					.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
					.premultiply(
						new THREE.Quaternion().setFromAxisAngle(
							UP,
							Math.atan2(sample.tangent.x, sample.tangent.z)
						)
					);
				transforms.push({
					position,
					quaternion,
					scale: new THREE.Vector3(0.28 + random() * 0.85, 0.16 + random() * 0.45, 1)
				});
			}
		}
		this.addInstanced(
			this.worldRoot,
			this.geometry('circle'),
			this.puddleMaterial,
			transforms,
			false,
			false
		);
	}

	private createRain(): {
		geometry: THREE.BufferGeometry;
		positions: Float32Array;
		state: Float32Array;
		lines: THREE.LineSegments;
	} {
		const positions = new Float32Array(MAX_RAIN_DROPS * 2 * 3);
		const state = new Float32Array(MAX_RAIN_DROPS * 4);
		const random = seededRandom(hashString('monsoon-rain'));
		for (let index = 0; index < MAX_RAIN_DROPS; index += 1) {
			state[index * 4] = (random() - 0.5) * 30;
			state[index * 4 + 1] = random() * 13;
			state[index * 4 + 2] = (random() - 0.5) * 30;
			state[index * 4 + 3] = 10 + random() * 8;
		}
		const geometry = this.createGeometry(new THREE.BufferGeometry());
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		const material = this.createMaterial(
			new THREE.LineBasicMaterial({
				color: '#c8d8dc',
				transparent: true,
				opacity: 0.48,
				depthWrite: false,
				blending: THREE.NormalBlending
			})
		);
		const lines = new THREE.LineSegments(geometry, material);
		lines.frustumCulled = false;
		lines.visible = false;
		return { geometry, positions, state, lines };
	}

	private addPart(
		parent: THREE.Group,
		geometryName: string,
		materialName: string,
		color: string,
		position: readonly [number, number, number],
		scale: readonly [number, number, number],
		rotation: readonly [number, number, number] = [0, 0, 0],
		materialParameters: Omit<THREE.MeshStandardMaterialParameters, 'color'> = {}
	): THREE.Mesh {
		const mesh = new THREE.Mesh(
			this.geometry(geometryName),
			this.material(materialName, color, materialParameters)
		);
		mesh.position.set(...position);
		mesh.scale.set(...scale);
		mesh.rotation.set(...rotation);
		mesh.castShadow = true;
		mesh.receiveShadow = false;
		parent.add(mesh);
		return mesh;
	}

	private createHuman(kind: 'player' | 'pedestrian' | 'hawker', id: string): THREE.Group {
		const group = new THREE.Group();
		const variant = hashString(id) % HUMAN_CLOTHES.length;
		const clothes = HUMAN_CLOTHES[variant];
		const skin = variant % 3 === 0 ? '#80573e' : variant % 3 === 1 ? '#a66f4a' : '#704932';
		const torso = this.addPart(
			group,
			'capsule',
			'human-clothes-' + variant,
			clothes,
			[0, 1.08, 0],
			[0.43, 0.66, 0.34]
		);
		const head = this.addPart(
			group,
			'sphere',
			'skin-' + (variant % 3),
			skin,
			[0, 1.68, 0.03],
			[0.29, 0.32, 0.3]
		);
		this.addPart(
			group,
			'sphere',
			'human-hair-' + (variant % 2),
			variant % 2 === 0 ? '#28231f' : '#3a2d25',
			[0, 1.79, 0.02],
			[0.3, 0.17, 0.31]
		);
		const leftLeg = this.addPart(
			group,
			'cylinder',
			'human-trousers',
			'#353b42',
			[-0.14, 0.43, 0],
			[0.13, 0.72, 0.13]
		);
		const rightLeg = this.addPart(
			group,
			'cylinder',
			'human-trousers',
			'#353b42',
			[0.14, 0.43, 0],
			[0.13, 0.72, 0.13]
		);
		const leftArm = this.addPart(
			group,
			'cylinder',
			'human-clothes-' + variant,
			clothes,
			[-0.34, 1.3, 0],
			[0.12, 0.34, 0.12],
			[0, 0, 0.12]
		);
		const rightArm = this.addPart(
			group,
			'cylinder',
			'human-clothes-' + variant,
			clothes,
			[0.34, 1.3, 0],
			[0.12, 0.34, 0.12],
			[0, 0, -0.12]
		);
		this.addPart(
			group,
			'cylinder',
			'skin-' + (variant % 3),
			skin,
			[-0.36, 0.96, 0],
			[0.085, 0.38, 0.085],
			[0, 0, 0.08]
		);
		this.addPart(
			group,
			'cylinder',
			'skin-' + (variant % 3),
			skin,
			[0.36, 0.96, 0],
			[0.085, 0.38, 0.085],
			[0, 0, -0.08]
		);
		if (kind === 'player') {
			this.addPart(
				group,
				'box',
				'player-bag',
				'#4b3428',
				[-0.31, 1.08, -0.18],
				[0.28, 0.58, 0.18],
				[0, 0, -0.1]
			);
		}
		if (kind === 'hawker') {
			this.addPart(group, 'box', 'hawker-tray', '#75573a', [0, 1.03, 0.46], [0.78, 0.1, 0.48]);
		}
		group.userData.torso = torso;
		group.userData.head = head;
		group.userData.leftLeg = leftLeg;
		group.userData.rightLeg = rightLeg;
		group.userData.leftArm = leftArm;
		group.userData.rightArm = rightArm;
		group.userData.animationPhase = (hashString(id) % 1_000) / 1_000;
		return group;
	}

	private addWheel(
		group: THREE.Group,
		position: readonly [number, number, number],
		scale = 1
	): THREE.Mesh {
		const wheel = this.addPart(
			group,
			'torus',
			'rubber',
			'#252625',
			position,
			[scale, scale, scale],
			[0, Math.PI / 2, 0],
			{ roughness: 0.92 }
		);
		const wheels = (group.userData.wheels as THREE.Mesh[] | undefined) ?? [];
		wheels.push(wheel);
		group.userData.wheels = wheels;
		return wheel;
	}

	private createVehicle(kind: FootpathRenderEntityKind): THREE.Group {
		const group = new THREE.Group();
		if (kind === 'handcart') {
			this.addWheel(group, [-0.72, 0.48, 0], 0.9);
			this.addWheel(group, [0.72, 0.48, 0], 0.9);
			this.addPart(group, 'box', 'handcart-deck', '#76583a', [0, 0.72, 0], [1.45, 0.18, 1.75]);
			this.addPart(group, 'box', 'handcart-rail', '#58412f', [-0.66, 1.05, 0], [0.1, 0.68, 1.7]);
			this.addPart(group, 'box', 'handcart-rail', '#58412f', [0.66, 1.05, 0], [0.1, 0.68, 1.7]);
			this.addPart(
				group,
				'box',
				'handcart-handle',
				'#4c4136',
				[-0.48, 0.68, 1.55],
				[0.08, 0.08, 1.35],
				[0.08, 0, 0]
			);
			this.addPart(
				group,
				'box',
				'handcart-handle',
				'#4c4136',
				[0.48, 0.68, 1.55],
				[0.08, 0.08, 1.35],
				[0.08, 0, 0]
			);
		} else if (kind === 'bicycle' || kind === 'motorbike') {
			this.addWheel(group, [-0.01, 0.38, -0.68], 0.72);
			this.addWheel(group, [-0.01, 0.38, 0.68], 0.72);
			this.addPart(
				group,
				'box',
				'bike-frame',
				kind === 'motorbike' ? '#7d3c35' : '#405f67',
				[0, 0.66, 0],
				[0.18, 0.16, 1.05]
			);
			this.addPart(
				group,
				'cylinder',
				'bike-metal',
				'#454b4c',
				[0, 0.9, 0.38],
				[0.09, 0.75, 0.09],
				[Math.PI / 4, 0, 0],
				{ metalness: 0.35 }
			);
			if (kind === 'motorbike') {
				this.addPart(
					group,
					'box',
					'motor-engine',
					'#383b3a',
					[0, 0.63, -0.08],
					[0.48, 0.42, 0.56],
					[0, 0, 0],
					{ metalness: 0.28 }
				);
				this.addPart(group, 'box', 'motor-seat', '#2d2928', [0, 0.92, -0.18], [0.42, 0.15, 0.66]);
			}
		} else if (kind === 'rickshaw') {
			this.addWheel(group, [-0.72, 0.47, -0.45], 0.9);
			this.addWheel(group, [0.72, 0.47, -0.45], 0.9);
			this.addPart(group, 'box', 'rickshaw-body', '#385c6d', [0, 0.7, -0.32], [1.35, 0.38, 1.25]);
			this.addPart(group, 'box', 'rickshaw-canopy', '#7e4938', [0, 1.54, -0.46], [1.35, 0.12, 1.1]);
			this.addPart(
				group,
				'box',
				'rickshaw-shaft',
				'#3e4140',
				[0, 0.5, 1.1],
				[0.12, 0.12, 1.7],
				[0, 0, 0],
				{ metalness: 0.3 }
			);
		} else {
			const auto = kind === 'auto-rickshaw';
			const width = auto ? 1.35 : 1.65;
			const length = auto ? 2.15 : 3.1;
			const height = auto ? 1.55 : 1.25;
			this.addPart(
				group,
				'box',
				auto ? 'auto-body' : 'car-body',
				auto ? '#325e4b' : '#745045',
				[0, 0.72, 0],
				[width, height, length]
			);
			this.addPart(
				group,
				'box',
				'vehicle-window',
				'#293f46',
				[0, 1.28, 0.1],
				[width * 0.86, 0.55, length * 0.54],
				[0, 0, 0],
				{ roughness: 0.28 }
			);
			this.addWheel(group, [-width * 0.5, 0.35, -length * 0.3], 0.62);
			this.addWheel(group, [width * 0.5, 0.35, -length * 0.3], 0.62);
			this.addWheel(group, [-width * 0.5, 0.35, length * 0.3], 0.62);
			this.addWheel(group, [width * 0.5, 0.35, length * 0.3], 0.62);
		}
		return group;
	}

	private createAnimal(kind: 'dog' | 'cow'): THREE.Group {
		const group = new THREE.Group();
		if (kind === 'dog') {
			this.addPart(
				group,
				'capsule',
				'dog-fur',
				'#8a6441',
				[0, 0.52, 0],
				[0.46, 0.56, 0.6],
				[Math.PI / 2, 0, 0]
			);
			const head = this.addPart(
				group,
				'sphere',
				'dog-fur',
				'#8a6441',
				[0, 0.7, 0.62],
				[0.45, 0.45, 0.5]
			);
			for (const x of [-0.25, 0.25]) {
				for (const z of [-0.34, 0.34]) {
					this.addPart(group, 'cylinder', 'dog-legs', '#6d4c33', [x, 0.25, z], [0.1, 0.42, 0.1]);
				}
			}
			group.userData.head = head;
		} else {
			this.addPart(
				group,
				'capsule',
				'cow-hide',
				'#ded2b9',
				[0, 1.05, 0],
				[0.9, 1.2, 1.45],
				[Math.PI / 2, 0, 0]
			);
			const head = this.addPart(
				group,
				'box',
				'cow-hide',
				'#ded2b9',
				[0, 1.2, 1.25],
				[0.72, 0.78, 0.72]
			);
			this.addPart(
				group,
				'cone',
				'cow-horn',
				'#d3c59e',
				[-0.36, 1.66, 1.27],
				[0.16, 0.5, 0.16],
				[0, 0, 0.45]
			);
			this.addPart(
				group,
				'cone',
				'cow-horn',
				'#d3c59e',
				[0.36, 1.66, 1.27],
				[0.16, 0.5, 0.16],
				[0, 0, -0.45]
			);
			for (const x of [-0.52, 0.52]) {
				for (const z of [-0.65, 0.65]) {
					this.addPart(group, 'cylinder', 'cow-legs', '#a6967b', [x, 0.46, z], [0.13, 0.78, 0.13]);
				}
			}
			group.userData.head = head;
		}
		return group;
	}

	private createStall(): THREE.Group {
		const group = new THREE.Group();
		this.addPart(group, 'box', 'stall-counter', '#6d4d32', [0, 0.88, 0], [1.9, 0.18, 0.85]);
		this.addPart(group, 'box', 'stall-front', '#74563b', [0, 0.43, 0], [1.8, 0.86, 0.72]);
		this.addPart(group, 'box', 'stall-awning', '#9c4d3d', [0, 2.05, 0], [2.2, 0.12, 1.38]);
		for (const x of [-0.92, 0.92]) {
			this.addPart(
				group,
				'cylinder',
				'stall-poles',
				'#4b4640',
				[x, 1.05, -0.5],
				[0.055, 2.05, 0.055],
				[0, 0, 0],
				{ metalness: 0.2 }
			);
		}
		return group;
	}

	private createEntityModel(kind: FootpathRenderEntityKind, id: string): THREE.Group {
		let group: THREE.Group;
		if (kind === 'player' || kind === 'pedestrian' || kind === 'hawker') {
			group = this.createHuman(kind, id);
		} else if (
			kind === 'bicycle' ||
			kind === 'motorbike' ||
			kind === 'rickshaw' ||
			kind === 'handcart' ||
			kind === 'auto-rickshaw' ||
			kind === 'car' ||
			kind === 'van'
		) {
			group = this.createVehicle(kind);
		} else if (kind === 'dog' || kind === 'cow') {
			group = this.createAnimal(kind);
		} else if (kind === 'stall' || kind === 'food') {
			group = this.createStall();
		} else if (kind === 'pothole') {
			group = new THREE.Group();
			const pothole = this.addPart(
				group,
				'circle',
				'pothole',
				'#2c2c29',
				[0, 0.018, 0],
				[0.55, 0.32, 1],
				[-Math.PI / 2, 0, 0],
				{ roughness: 0.5 }
			);
			pothole.receiveShadow = true;
		} else if (kind === 'drain') {
			group = new THREE.Group();
			this.addPart(group, 'box', 'drain', '#333837', [0, 0.05, 0], [0.78, 0.1, 0.48], [0, 0, 0], {
				metalness: 0.38
			});
		} else {
			group = new THREE.Group();
			this.addPart(
				group,
				'box',
				'debris',
				'#77644c',
				[0, 0.16, 0],
				[0.44, 0.32, 0.38],
				[0.1, 0.4, 0.2]
			);
		}
		group.userData.kind = kind;
		setMeshShadows(group, true, false);
		return group;
	}

	private acquireEntity(snapshot: FootpathRenderEntity): EntityVisual {
		const pool = this.entityPools.get(snapshot.kind);
		const record = pool?.pop();
		if (record) {
			record.id = snapshot.id;
			record.lastSnapshot = snapshot;
			record.object.visible = true;
			this.entityRoot.add(record.object);
			return record;
		}
		const object = this.createEntityModel(snapshot.kind, snapshot.id);
		this.entityRoot.add(object);
		return { id: snapshot.id, kind: snapshot.kind, object, lastSnapshot: snapshot };
	}

	private releaseEntity(record: EntityVisual): void {
		record.object.removeFromParent();
		record.object.visible = false;
		const pool = this.entityPools.get(record.kind) ?? [];
		if (pool.length < 18) {
			pool.push(record);
			this.entityPools.set(record.kind, pool);
		}
	}

	private syncEntities(frame: FootpathRenderFrame, deltaSeconds: number): void {
		const profile = QUALITY_PROFILES[this.quality];
		const candidates = [
			frame.player,
			...frame.entities
				.filter((entity) => entity.visible !== false && entity.id !== frame.player.id)
				.sort((left, right) => {
					const priorityDifference = finiteOr(right.priority, 0) - finiteOr(left.priority, 0);
					if (priorityDifference !== 0) return priorityDifference;
					return (
						distanceSquared(left.position, frame.player.position) -
						distanceSquared(right.position, frame.player.position)
					);
				})
				.slice(0, profile.maxEntities)
		];
		const visibleIds = new Set(candidates.map((entity) => entity.id));
		for (const [id, record] of this.entities) {
			if (!visibleIds.has(id)) {
				this.releaseEntity(record);
				this.entities.delete(id);
			}
		}

		for (const snapshot of candidates) {
			let record = this.entities.get(snapshot.id);
			if (record && record.kind !== snapshot.kind) {
				this.releaseEntity(record);
				this.entities.delete(snapshot.id);
				record = undefined;
			}
			if (!record) {
				record = this.acquireEntity(snapshot);
				record.object.position.set(
					snapshot.position.x,
					finiteOr(snapshot.position.y, 0),
					snapshot.position.z
				);
				record.object.rotation.y = snapshot.headingRadians;
				this.entities.set(snapshot.id, record);
			}
			record.lastSnapshot = snapshot;
			const movementRate = this.reducedMotion ? 24 : 13;
			const positionAlpha = exponentialAlpha(movementRate, deltaSeconds);
			this.temporaryVector.set(
				snapshot.position.x,
				finiteOr(snapshot.position.y, 0),
				snapshot.position.z
			);
			record.object.position.lerp(this.temporaryVector, positionAlpha);
			this.temporaryQuaternion.setFromAxisAngle(UP, finiteOr(snapshot.headingRadians, 0));
			record.object.quaternion.slerp(
				this.temporaryQuaternion,
				exponentialAlpha(this.reducedMotion ? 24 : 10, deltaSeconds)
			);
			const scale = clamp(finiteOr(snapshot.scale, 1), 0.35, 2.5);
			record.object.scale.setScalar(scale);
			this.animateEntity(record, frame.elapsedSeconds, deltaSeconds);
		}
	}

	private animateEntity(record: EntityVisual, elapsedSeconds: number, deltaSeconds: number): void {
		const velocity = record.lastSnapshot.velocity;
		const speed = velocity ? Math.hypot(velocity.x, velocity.z) : 0;
		const phase =
			elapsedSeconds * clamp(3.4 + speed * 2.4, 3.4, 11) +
			finiteOr(record.object.userData.animationPhase, 0);
		const swing = this.reducedMotion ? 0 : Math.sin(phase) * clamp(speed / 2.2, 0, 1) * 0.55;
		const leftLeg = record.object.userData.leftLeg as THREE.Object3D | undefined;
		const rightLeg = record.object.userData.rightLeg as THREE.Object3D | undefined;
		const leftArm = record.object.userData.leftArm as THREE.Object3D | undefined;
		const rightArm = record.object.userData.rightArm as THREE.Object3D | undefined;
		if (leftLeg) leftLeg.rotation.x = swing;
		if (rightLeg) rightLeg.rotation.x = -swing;
		if (leftArm) leftArm.rotation.x = -swing * 0.65;
		if (rightArm) rightArm.rotation.x = swing * 0.65;
		const wheels = record.object.userData.wheels as THREE.Mesh[] | undefined;
		if (wheels && speed > 0) {
			for (const wheel of wheels) wheel.rotation.x -= (speed * deltaSeconds) / 0.34;
		}
		if (record.lastSnapshot.state === 'sleeping' && record.kind === 'dog') {
			record.object.rotation.z = 0.18;
		} else {
			record.object.rotation.z = 0;
		}
	}

	private nearestLaneWidth(point: WorldPoint): number {
		let bestWidth = 4;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const edge of this.world.edges) {
			const points = edgePolyline(edge, this.world);
			for (let index = 0; index < points.length - 1; index += 1) {
				const start = points[index];
				const end = points[index + 1];
				const dx = end.x - start.x;
				const dz = end.z - start.z;
				const lengthSquared = dx * dx + dz * dz;
				const t =
					lengthSquared > 0
						? clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)
						: 0;
				const projected = { x: start.x + dx * t, z: start.z + dz * t };
				const candidate = distanceSquared(point, projected);
				if (candidate < bestDistance) {
					bestDistance = candidate;
					bestWidth = edge.widthM;
				}
			}
		}
		return bestWidth;
	}

	private updateCamera(frame: FootpathRenderFrame, deltaSeconds: number): void {
		if (frame.look) {
			this.setLookOffset(frame.look.yawRadians, frame.look.pitchRadians, frame.look.active);
		}
		const player = frame.player;
		const heading = finiteOr(player.headingRadians, 0);
		const laneWidth = player.laneWidthM ?? this.nearestLaneWidth(player.position);
		const rig = cameraRigForLane(laneWidth, this.reducedMotion);
		const laneLead = authoredLaneCameraLead(
			this.world,
			player.position,
			heading,
			rig.lookAheadM + (this.reducedMotion ? 1.4 : 3.2),
			this.reducedMotion
		);
		const lookRate = this.lookActive ? 11 : this.reducedMotion ? 18 : 4.2;
		this.lookYaw += (this.targetLookYaw - this.lookYaw) * exponentialAlpha(lookRate, deltaSeconds);
		this.lookPitch +=
			(this.targetLookPitch - this.lookPitch) * exponentialAlpha(lookRate, deltaSeconds);
		if (this.reducedMotion) {
			this.lookYaw = clamp(this.lookYaw, -0.42, 0.42);
			this.lookPitch = clamp(this.lookPitch, -0.12, 0.12);
		}
		const authoredTurn = laneLead.turnRadians * (this.lookActive ? 0.25 : 1);
		const travelYaw = heading + authoredTurn;
		const desiredYaw = travelYaw + this.lookYaw;
		if (!this.hasCameraState) this.cameraYaw = desiredYaw;
		this.cameraYaw = dampRadians(
			this.cameraYaw,
			desiredYaw,
			this.reducedMotion
				? 18
				: this.lookActive
					? 7.5
					: this.cameraMovement === 'gentle'
						? 2.8
						: 4.4,
			deltaSeconds
		);
		const cameraForward = new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
		const playerForward = new THREE.Vector3(Math.sin(travelYaw), 0, Math.cos(travelYaw));
		this.desiredCameraPosition.set(
			player.position.x - cameraForward.x * rig.behindM,
			finiteOr(player.position.y, 0) + rig.heightM + this.lookPitch * 1.2,
			player.position.z - cameraForward.z * rig.behindM
		);
		this.desiredCameraTarget.set(
			player.position.x + playerForward.x * rig.lookAheadM,
			finiteOr(player.position.y, 0) + rig.targetHeightM + this.lookPitch * 0.7,
			player.position.z + playerForward.z * rig.lookAheadM
		);
		const safeDesiredCamera = constrainCameraToAuthoredLane(this.world, player.position, {
			x: this.desiredCameraPosition.x,
			z: this.desiredCameraPosition.z
		});
		this.desiredCameraPosition.x = safeDesiredCamera.point.x;
		this.desiredCameraPosition.z = safeDesiredCamera.point.z;
		if (!this.hasCameraState) {
			this.currentCameraPosition.copy(this.desiredCameraPosition);
			this.currentCameraTarget.copy(this.desiredCameraTarget);
			this.hasCameraState = true;
		} else {
			const followRate = this.reducedMotion ? 18 : this.cameraMovement === 'gentle' ? 4.3 : 6.2;
			this.currentCameraPosition.lerp(
				this.desiredCameraPosition,
				exponentialAlpha(followRate, deltaSeconds)
			);
			this.currentCameraTarget.lerp(
				this.desiredCameraTarget,
				exponentialAlpha(
					this.reducedMotion ? 18 : this.cameraMovement === 'gentle' ? 5.1 : 7.4,
					deltaSeconds
				)
			);
		}
		const safeCurrentCamera = constrainCameraToAuthoredLane(this.world, player.position, {
			x: this.currentCameraPosition.x,
			z: this.currentCameraPosition.z
		});
		this.currentCameraPosition.x = safeCurrentCamera.point.x;
		this.currentCameraPosition.z = safeCurrentCamera.point.z;
		this.camera.position.copy(this.currentCameraPosition);
		this.camera.fov +=
			(rig.fovDegrees - this.camera.fov) *
			exponentialAlpha(this.reducedMotion ? 20 : 4.5, deltaSeconds);
		this.camera.updateProjectionMatrix();
		this.camera.lookAt(this.currentCameraTarget);

		this.sun.position.set(player.position.x - 22, 36, player.position.z - 18);
		this.sunTarget.position.set(player.position.x, 0, player.position.z);
		this.sunTarget.updateMatrixWorld();
	}

	private updateWeather(frame: FootpathRenderFrame, deltaSeconds: number): void {
		const state = frame.weather.state;
		const rainIntensity = clamp(finiteOr(frame.weather.rainIntensity, state === 'rain' ? 0.82 : 0));
		const wetness = clamp(
			finiteOr(frame.weather.wetness, state === 'rain' ? 0.9 : state === 'post-rain' ? 0.62 : 0)
		);
		for (const material of this.roadMaterials.values()) {
			const dryColor = material.userData.dryColor as THREE.Color;
			const dryRoughness = material.userData.dryRoughness as number;
			material.color.copy(dryColor).lerp(new THREE.Color('#292e2d'), wetness * 0.34);
			material.roughness = THREE.MathUtils.lerp(dryRoughness, 0.43, wetness);
		}
		this.puddleMaterial.opacity = wetness <= 0.08 ? 0 : 0.08 + wetness * 0.32;
		this.puddleMaterial.visible = wetness > 0.08;
		this.skyColor
			.copy(this.drySkyColor)
			.lerp(this.rainSkyColor, rainIntensity * 0.78 + wetness * 0.12);
		this.renderer.setClearColor(this.skyColor, 1);
		this.fog.color.copy(this.skyColor);
		this.fog.density = THREE.MathUtils.lerp(0.0062, 0.0093, rainIntensity * 0.7 + wetness * 0.22);
		this.sun.intensity = THREE.MathUtils.lerp(3.35, 1.45, rainIntensity * 0.82);
		this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.9, 0.8, rainIntensity);
		this.updateRain(frame.player.position, frame.weather.wind, rainIntensity, deltaSeconds);
	}

	private updateRain(
		anchor: WorldPoint,
		wind: WorldPoint | undefined,
		intensity: number,
		deltaSeconds: number
	): void {
		const profile = QUALITY_PROFILES[this.quality];
		const count = Math.floor(profile.rainDrops * intensity);
		this.rainLines.visible = count > 0;
		this.rainGeometry.setDrawRange(0, count * 2);
		if (count === 0) return;
		const windX = clamp(finiteOr(wind?.x, -0.7), -4, 4);
		const windZ = clamp(finiteOr(wind?.z, 0.25), -4, 4);
		const dropLength = this.reducedMotion ? 0.42 : 0.72;
		for (let index = 0; index < count; index += 1) {
			const stateIndex = index * 4;
			this.rainState[stateIndex] += windX * deltaSeconds;
			this.rainState[stateIndex + 1] -= this.rainState[stateIndex + 3] * deltaSeconds;
			this.rainState[stateIndex + 2] += windZ * deltaSeconds;
			if (this.rainState[stateIndex + 1] < 0) {
				const random = seededRandom(hashString('rain-reset-' + index + '-' + this.frameSerial));
				this.rainState[stateIndex] = (random() - 0.5) * 28;
				this.rainState[stateIndex + 1] = 9 + random() * 5;
				this.rainState[stateIndex + 2] = (random() - 0.5) * 28;
				this.rainState[stateIndex + 3] = 10 + random() * 8;
			}
			const positionIndex = index * 6;
			const x = anchor.x + this.rainState[stateIndex];
			const y = this.rainState[stateIndex + 1];
			const z = anchor.z + this.rainState[stateIndex + 2];
			this.rainPositions[positionIndex] = x;
			this.rainPositions[positionIndex + 1] = y;
			this.rainPositions[positionIndex + 2] = z;
			this.rainPositions[positionIndex + 3] = x - windX * 0.035;
			this.rainPositions[positionIndex + 4] = y + dropLength;
			this.rainPositions[positionIndex + 5] = z - windZ * 0.035;
		}
		const attribute = this.rainGeometry.getAttribute('position') as THREE.BufferAttribute;
		attribute.needsUpdate = true;
	}

	private placeCameraAtWorldStart(): void {
		const start = this.world.nodes.find((node) => node.id === this.world.startNodeId)?.position ?? {
			x: 0,
			z: 0
		};
		const rig = cameraRigForLane(4, this.reducedMotion);
		this.camera.position.set(start.x, rig.heightM, start.z - rig.behindM);
		this.camera.lookAt(start.x, rig.targetHeightM, start.z + rig.lookAheadM);
		this.currentCameraPosition.copy(this.camera.position);
		this.currentCameraTarget.set(start.x, rig.targetHeightM, start.z + rig.lookAheadM);
	}

	private applyQuality(tier: FootpathRenderQualityTier): void {
		this.quality = tier;
		const profile = QUALITY_PROFILES[tier];
		this.renderer.shadowMap.enabled = profile.shadows;
		this.renderer.shadowMap.autoUpdate = profile.shadows;
		this.sun.castShadow = profile.shadows;
		this.sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
		this.highDetailRoot.visible = profile.facadeDetail;
		this.resize();
	}

	private considerAutoQuality(): void {
		if (this.qualityChoice !== 'auto' || this.autoQualityCooldown > 0) return;
		if (this.frameDurationsMs.length < AUTO_QUALITY_SAMPLE_COUNT) return;
		const average =
			this.frameDurationsMs.reduce((sum, duration) => sum + duration, 0) /
			this.frameDurationsMs.length;
		const hints = browserQualityHints(this.canvas);
		const initial = chooseFootpathRenderQuality('auto', hints);
		if (this.quality === 'high' && average > 23.5) {
			this.applyQuality('low');
			this.autoQualityCooldown = 7;
			this.frameDurationsMs.length = 0;
		} else if (this.quality === 'low' && initial === 'high' && average < 15.2) {
			this.applyQuality('high');
			this.autoQualityCooldown = 10;
			this.frameDurationsMs.length = 0;
		}
	}

	private updateMetrics(deltaSeconds: number): void {
		const frameMs = deltaSeconds * 1_000;
		if (frameMs > 0 && frameMs < 250) {
			this.frameDurationsMs.push(frameMs);
			if (this.frameDurationsMs.length > AUTO_QUALITY_SAMPLE_COUNT) this.frameDurationsMs.shift();
		}
		this.metricsElapsed += deltaSeconds;
		this.autoQualityCooldown = Math.max(0, this.autoQualityCooldown - deltaSeconds);
		this.considerAutoQuality();
		const averageFrameMs =
			this.frameDurationsMs.length > 0
				? this.frameDurationsMs.reduce((sum, duration) => sum + duration, 0) /
					this.frameDurationsMs.length
				: 0;
		this.lastMetrics = {
			fps: averageFrameMs > 0 ? 1_000 / averageFrameMs : 0,
			frameMs: averageFrameMs,
			drawCalls: this.renderer.info.render.calls,
			triangles: this.renderer.info.render.triangles,
			entityCount: this.entities.size,
			approximateTextureMemoryBytes: this.approximateTextureMemoryBytes,
			quality: this.quality
		};
		if (this.metricsElapsed >= METRICS_INTERVAL_SECONDS) {
			this.metricsElapsed = 0;
			try {
				this.onMetrics?.(this.lastMetrics);
			} catch {
				// Metrics are advisory.
			}
		}
	}

	private handleContextLost = (event: Event): void => {
		event.preventDefault();
		if (this.disposed) return;
		this.contextLost = true;
		this.emitStatus(
			'context-lost',
			'WebGL context lost; rendering is paused while the browser restores it.'
		);
	};

	private handleContextRestored = (): void => {
		if (this.disposed) return;
		this.contextLost = false;
		for (const texture of this.ownedTextures) texture.needsUpdate = true;
		for (const geometry of this.ownedGeometries) {
			for (const attribute of Object.values(geometry.attributes)) attribute.needsUpdate = true;
			if (geometry.index) geometry.index.needsUpdate = true;
		}
		for (const material of this.ownedMaterials) material.needsUpdate = true;
		this.applyQuality(this.quality);
		this.emitStatus('context-restored', 'WebGL context restored.');
	};

	renderFrame(frame: FootpathRenderFrame): void {
		if (this.disposed || this.contextLost) return;
		const deltaSeconds = clamp(finiteOr(frame.deltaSeconds, 1 / 60), 1 / 240, 0.1);
		if (frame.reducedMotion !== undefined) this.reducedMotion = frame.reducedMotion;
		if (frame.cameraMovement !== undefined) this.cameraMovement = frame.cameraMovement;
		this.frameSerial += 1;
		this.syncEntities(frame, deltaSeconds);
		this.updateCamera(frame, deltaSeconds);
		this.updateWeather(frame, deltaSeconds);
		this.renderer.render(this.scene, this.camera);
		this.updateMetrics(deltaSeconds);
	}

	resize(width?: number, height?: number, devicePixelRatio?: number): void {
		if (this.disposed) return;
		const rect = this.canvas.getBoundingClientRect();
		const resolvedWidth = Math.max(
			1,
			Math.round(finiteOr(width, rect.width || this.canvas.clientWidth || 1))
		);
		const resolvedHeight = Math.max(
			1,
			Math.round(finiteOr(height, rect.height || this.canvas.clientHeight || 1))
		);
		const density =
			devicePixelRatio ??
			(typeof window === 'undefined' ? 1 : finiteOr(window.devicePixelRatio, 1));
		const pixelRatio = Math.min(Math.max(1, density), QUALITY_PROFILES[this.quality].dprCap);
		this.renderer.setPixelRatio(pixelRatio);
		this.renderer.setSize(resolvedWidth, resolvedHeight, false);
		this.camera.aspect = resolvedWidth / resolvedHeight;
		this.camera.updateProjectionMatrix();
	}

	setQuality(choice: FootpathRenderQualityChoice): void {
		if (this.disposed) return;
		this.qualityChoice = choice;
		this.applyQuality(chooseFootpathRenderQuality(choice, browserQualityHints(this.canvas)));
		this.frameDurationsMs.length = 0;
		this.autoQualityCooldown = 4;
	}

	setReducedMotion(reducedMotion: boolean): void {
		this.reducedMotion = reducedMotion;
		if (reducedMotion) {
			this.targetLookYaw = 0;
			this.targetLookPitch = 0;
			this.lookActive = false;
		}
	}

	setCameraMovement(cameraMovement: FootpathCameraMovement): void {
		this.cameraMovement = cameraMovement;
	}

	setLookOffset(yawRadians: number, pitchRadians: number, active = true): void {
		if (this.disposed) return;
		this.lookActive = active;
		this.targetLookYaw = active ? clamp(finiteOr(yawRadians, 0), -1.12, 1.12) : 0;
		this.targetLookPitch = active ? clamp(finiteOr(pitchRadians, 0), -0.28, 0.24) : 0;
	}

	nudgeLookOffset(deltaYawRadians: number, deltaPitchRadians: number): void {
		this.setLookOffset(
			this.targetLookYaw + finiteOr(deltaYawRadians, 0),
			this.targetLookPitch + finiteOr(deltaPitchRadians, 0),
			true
		);
	}

	releaseLookOffset(): void {
		this.lookActive = false;
		this.targetLookYaw = 0;
		this.targetLookPitch = 0;
	}

	screenToRoad(clientX: number, clientY: number): FootpathRoadHit | null {
		if (this.disposed || this.contextLost) return null;
		const rect = this.canvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return null;
		this.pointer.set(
			((clientX - rect.left) / rect.width) * 2 - 1,
			-((clientY - rect.top) / rect.height) * 2 + 1
		);
		this.raycaster.setFromCamera(this.pointer, this.camera);
		const intersections = this.raycaster.intersectObjects(this.roadMeshes, false);
		const hit = intersections[0];
		if (!hit) return null;
		return {
			point: { x: hit.point.x, z: hit.point.z },
			edgeId: String(hit.object.userData.edgeId ?? ''),
			distanceFromCameraM: hit.distance
		};
	}

	getMetrics(): FootpathRendererMetrics {
		return { ...this.lastMetrics };
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.resizeObserver?.disconnect();
		this.canvas.removeEventListener('webglcontextlost', this.handleContextLost, false);
		this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored, false);
		this.entities.clear();
		this.entityPools.clear();
		this.roadMeshes.length = 0;
		this.worldRoot.clear();
		this.entityRoot.clear();
		this.highDetailRoot.clear();
		this.scene.clear();
		for (const texture of this.ownedTextures) texture.dispose();
		for (const geometry of this.ownedGeometries) geometry.dispose();
		for (const material of this.ownedMaterials) material.dispose();
		this.ownedTextures.clear();
		this.ownedGeometries.clear();
		this.ownedMaterials.clear();
		this.primitiveGeometries.clear();
		this.namedMaterials.clear();
		this.roadMaterials.clear();
		this.renderer.renderLists.dispose();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
		this.emitStatus('disposed');
	}
}

export function createCalcuttaFootpathThreeRenderer(
	canvas: HTMLCanvasElement,
	options: FootpathRendererOptions = {}
): FootpathThreeRendererApi {
	return new CalcuttaFootpathThreeRenderer(canvas, options);
}
