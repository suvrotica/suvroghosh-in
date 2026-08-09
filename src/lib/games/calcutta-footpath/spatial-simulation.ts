import { CIVIC_RATINGS, FOOD_MESSAGES, GAME_OVER_MESSAGES, GHUGNI_MESSAGES } from './game-data';
import {
	consumeFood,
	createFoodState,
	expireFoodEffects,
	getFoodModifiers,
	type FoodKind,
	type FoodState
} from './food';
import {
	advanceMetrics,
	applyMetricDelta,
	createPlayerMetrics,
	type PlayerMetrics
} from './metrics';
import { createRandomStreams, type RandomStreams } from './random';
import { calculateScore, type ScoreResult } from './scoring';
import type { GameSettings } from './settings';
import type { MovingAudioSource, SpatialSoundKind } from './spatial-audio';
import {
	CALCUTTA_SPATIAL_WORLD,
	distanceToDestination,
	edgeLengthM,
	edgePolyline,
	findShortestPath,
	getSpatialEdge,
	getSpatialNode,
	nearestWalkableEdge,
	nearestWalkablePoint,
	pathToDestination,
	type SpatialEdge,
	type SpatialPath,
	type SpatialWorld,
	type WorldPoint
} from './spatial-world';
import type { GameCounters, RunResult, RouteTracePoint, WeatherState } from './runtime-types';

const FIXED_STEP_SECONDS = 1 / 60;
const PLAYER_RADIUS_M = 0.34;
const WALK_SPEED_MPS = 1.38;
const HURRY_SPEED_MPS = 2.15;
const HURRY_BURST_SECONDS = 1.5;
const HURRY_COOLDOWN_SECONDS = 2.8;
const HURRY_STAMINA_THRESHOLD = 14;
const BACKWARD_SPEED_MPS = 0.78;
const ARRIVAL_RADIUS_M = 1.05;
// A person following a street centre line need not step on an invisible mathematical pin.
// Human-scale waypoint acceptance also prevents tight turns from becoming orbiting loops.
const PATH_POINT_RADIUS_M = 1.1;
const TARGET_REACHED_RADIUS_M = 0.58;
const MAX_FRAME_SECONDS = 0.25;
const MAX_ASSISTED_FAILED_RUNS = 6;
const BASE_SEVERE_DRAIN_CHANCE = 0.055;

const STREAM_NAMES = [
	'pedestrians',
	'vehicles',
	'animals',
	'events',
	'weather',
	'food',
	'cosmetics'
] as const;

type SimulationStreams = RandomStreams<(typeof STREAM_NAMES)[number]>;

export type SpatialControlMode = 'simple' | 'experienced';

/** Semantic movement, deliberately independent of keyboard, pointer, touch, or gamepad APIs. */
export interface SpatialMovementIntent {
	mode?: SpatialControlMode;
	moveForward?: number;
	turn?: number;
	strafe?: number;
	hurry?: boolean;
	target?: WorldPoint | null;
	stop?: boolean;
	turnAround?: boolean;
	interact?: boolean;
}

export type HumanMotionState =
	| 'idle'
	| 'walking'
	| 'hurrying'
	| 'turning'
	| 'slowed'
	| 'stumbling'
	| 'interacting'
	| 'arrived'
	| 'failed';

export interface SpatialPlayerState {
	x: number;
	z: number;
	heading: number;
	vx: number;
	vz: number;
	speed: number;
	radiusM: number;
	motion: HumanMotionState;
	stridePhase: number;
	lean: number;
	turnRate: number;
	slowdownRemainingS: number;
	stumbleRemainingS: number;
	interactionRemainingS: number;
	hurryRemainingS: number;
	hurryCooldownRemainingS: number;
}

export type PedestrianGoalState =
	| 'walking'
	| 'waiting'
	| 'talking'
	| 'buying'
	| 'crossing'
	| 'avoiding'
	| 'stopping'
	| 'turning'
	| 'looking'
	| 'resuming';

export type SpatialEntityKind =
	| 'human'
	| 'bicycle'
	| 'motorbike'
	| 'rickshaw'
	| 'handcart'
	| 'car'
	| 'dog'
	| 'cow'
	| 'pothole'
	| 'drain'
	| 'food-stall'
	| 'delivery-obstruction';

export interface SpatialEntity {
	id: string;
	kind: SpatialEntityKind;
	subtype?: FoodKind | string;
	x: number;
	z: number;
	heading: number;
	vx: number;
	vz: number;
	speed: number;
	radiusM: number;
	widthM: number;
	lengthM: number;
	heightM: number;
	edgeId: string;
	edgeWidthM: number;
	minimumRoadWidthM: number;
	state: PedestrianGoalState | 'sleeping' | 'awake' | 'grazing' | 'moving' | 'parked' | 'blocked';
	active: boolean;
	solid: boolean;
	dangerous: boolean;
	spawnAtMs: number;
	personalSpaceM?: number;
	goal?: WorldPoint;
	path?: readonly WorldPoint[];
	pathIndex?: number;
	stateUntilMs?: number;
	resolvesAtMs?: number;
	resolved?: boolean;
	blocksEdgeId?: string;
	interactionCount?: number;
	nextInteractionAtMs?: number;
	passedByPlayer?: boolean;
	warningIssued?: boolean;
	/** Explicit render affordance: drains are never invisible collision volumes. */
	visible?: boolean;
	/** Chosen at construction time so severe drains are deterministic and telegraphed. */
	severe?: boolean;
	lateralOffsetM?: number;
	/** A rendered duplicate created by a food effect; never participates in collision. */
	hallucinated?: boolean;
	/** Temporary pedestrians produced by fuchka's authored stall-crowd effect. */
	stallCrowd?: boolean;
}

export interface SpatialGoalState {
	source: 'click' | 'intent' | 'destination' | 'replan';
	requested: WorldPoint;
	target: WorldPoint;
	path: SpatialPath;
	pointIndex: number;
	createdAtMs: number;
}

export type SpatialAnnotationKind =
	| 'start'
	| 'turn'
	| 'turn-around'
	| 'stop'
	| 'food'
	| 'incident'
	| 'obstruction'
	| 'street-changed'
	| 'rain'
	| 'arrival';

export interface SpatialRoutePoint extends WorldPoint {
	atMs: number;
	edgeId: string;
	heading: number;
}

export interface SpatialRouteAnnotation extends WorldPoint {
	id: string;
	kind: SpatialAnnotationKind;
	atMs: number;
	label: string;
	edgeId: string;
}

export interface SpatialWeatherState {
	state: WeatherState;
	intensity: number;
	changedAtMs: number;
	nextChangeAtMs: number;
}

export interface VisualTrafficWarning {
	entityId: string;
	kind: 'bicycle' | 'motorbike' | 'rickshaw' | 'handcart' | 'car';
	direction: 'ahead' | 'behind' | 'left' | 'right';
	distanceM: number;
	closingSpeedMps: number;
	urgency: 'notice' | 'near' | 'immediate';
	text: string;
	visual: true;
}

export interface SpatialHudData {
	destinationMetres: number;
	streetName: string;
	weather: WeatherState;
	stamina: number;
	morale: number;
	speedMps: number;
	interactionPrompt: string;
	onboardingCue: string;
	warning: VisualTrafficWarning | null;
	warningText: string;
	walkingAutomatically: boolean;
	hurryActive: boolean;
	hurryReady: boolean;
	hurryRemainingS: number;
	hurryCooldownRemainingS: number;
	hurryStaminaThreshold: number;
	elapsedMs: number;
	routeDistanceM: number;
	visitedEdgeIds: readonly string[];
}

export interface SpatialCameraTarget {
	x: number;
	y: number;
	z: number;
	heading: number;
	distanceBehindM: number;
	heightM: number;
}

export interface SpatialAudioEvent {
	id: string;
	atMs: number;
	kind:
		| 'bell'
		| 'horn'
		| 'footstep'
		| 'splash'
		| 'stumble'
		| 'tea'
		| 'snack'
		| 'bark'
		| 'reaction'
		| 'arrival';
	category: 'traffic' | 'people' | 'animals' | 'interaction' | 'weather';
	priority: 'ambient' | 'normal' | 'important';
	emitterId: string;
	x: number;
	z: number;
	vx: number;
	vz: number;
}

export interface SpatialRenderPlayer extends SpatialPlayerState {
	headingRadians: number;
	velocity: Readonly<WorldPoint>;
}

export interface SpatialRenderEntity extends SpatialEntity {
	variant: string;
	headingRadians: number;
	velocity: Readonly<WorldPoint>;
}

export interface SpatialRenderSnapshot {
	elapsedMs: number;
	player: Readonly<SpatialRenderPlayer>;
	cameraTarget: Readonly<SpatialCameraTarget>;
	entities: readonly Readonly<SpatialRenderEntity>[];
	weather: Readonly<SpatialWeatherState>;
	hud: Readonly<SpatialHudData>;
	goal: Readonly<SpatialGoalState> | null;
	pathHistory: readonly Readonly<SpatialRoutePoint>[];
	annotations: readonly Readonly<SpatialRouteAnnotation>[];
	blockedEdgeIds: readonly string[];
}

export interface WalkTargetResult {
	accepted: boolean;
	reason: 'accepted' | 'already-arrived' | 'outside-walkable-world' | 'unreachable';
	requested: WorldPoint;
	target: WorldPoint | null;
	path: SpatialPath | null;
}

export interface InteractionResult {
	accepted: boolean;
	reason: 'accepted' | 'already-busy' | 'nothing-nearby' | 'stall-resetting';
	stallId: string | null;
	kind: FoodKind | null;
	completesAtMs: number | null;
}

export interface SpatialRouteSummary {
	points: readonly SpatialRoutePoint[];
	annotations: readonly SpatialRouteAnnotation[];
	visitedEdgeIds: readonly string[];
	distanceM: number;
	shortestDistanceM: number;
	detourDistanceM: number;
	turns: number;
	turnArounds: number;
	stops: number;
	teaStops: number;
}

export type SpatialRunResult = RunResult & {
	route: readonly RouteTracePoint[];
	routeSummary: SpatialRouteSummary;
	destination: { x: number; z: number; label: string };
};

export interface SpatialSimulationUpdate {
	snapshot: SpatialRenderSnapshot;
	audioEvents: readonly SpatialAudioEvent[];
	result: SpatialRunResult | null;
}

interface SpatialCounters extends GameCounters {
	drainsEntered: number;
	teaStops: number;
	turnArounds: number;
	waits: number;
}

interface ActiveInteraction {
	stallId: string;
	kind: FoodKind;
	completesAtMs: number;
	startedAtMs: number;
}

interface PreviousIntentFlags {
	hurry: boolean;
	turnAround: boolean;
	interact: boolean;
}

const EMPTY_COUNTERS: SpatialCounters = {
	collisions: 0,
	nearMisses: 0,
	snacksConsumed: 0,
	cowsOffended: 0,
	dogsAwakened: 0,
	potholesEntered: 0,
	drainsEntered: 0,
	narrowGaps: 0,
	recklessDashes: 0,
	longestStretch: 0,
	currentStretch: 0,
	collisionFreeSections: 0,
	usefulSnacks: 0,
	teaStops: 0,
	turnArounds: 0,
	waits: 0
};

const VEHICLE_PROFILES = {
	bicycle: {
		widthM: 0.62,
		lengthM: 1.8,
		heightM: 1.2,
		radiusM: 0.56,
		minimumRoadWidthM: 2.2,
		speed: 3.1
	},
	motorbike: {
		widthM: 0.72,
		lengthM: 2,
		heightM: 1.2,
		radiusM: 0.65,
		minimumRoadWidthM: 2.7,
		speed: 4.8
	},
	rickshaw: {
		widthM: 1.28,
		lengthM: 2.65,
		heightM: 1.85,
		radiusM: 1.05,
		minimumRoadWidthM: 3.25,
		speed: 2.45
	},
	handcart: {
		widthM: 1.05,
		lengthM: 2.3,
		heightM: 1.45,
		radiusM: 0.9,
		minimumRoadWidthM: 2.9,
		speed: 1.25
	},
	car: {
		widthM: 1.72,
		lengthM: 3.85,
		heightM: 1.5,
		radiusM: 1.42,
		minimumRoadWidthM: 5.4,
		speed: 5.2
	}
} as const;

type VehicleKind = keyof typeof VEHICLE_PROFILES;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function distance(left: WorldPoint, right: WorldPoint): number {
	return Math.hypot(right.x - left.x, right.z - left.z);
}

function headingTo(from: WorldPoint, to: WorldPoint): number {
	return Math.atan2(to.x - from.x, to.z - from.z);
}

function wrapAngle(value: number): number {
	let angle = value;
	while (angle > Math.PI) angle -= Math.PI * 2;
	while (angle < -Math.PI) angle += Math.PI * 2;
	return angle;
}

function moveAngle(current: number, target: number, maximumDelta: number): number {
	const delta = wrapAngle(target - current);
	return wrapAngle(current + clamp(delta, -maximumDelta, maximumDelta));
}

function copyPoint(point: WorldPoint): WorldPoint {
	return { x: point.x, z: point.z };
}

function pointAtFraction(edge: SpatialEdge, fraction: number, world: SpatialWorld): WorldPoint {
	const points = edgePolyline(edge, world);
	const total = edgeLengthM(edge, world);
	let remaining = clamp(fraction, 0, 1) * total;
	for (let index = 0; index < points.length - 1; index += 1) {
		const length = distance(points[index], points[index + 1]);
		if (remaining <= length || index === points.length - 2) {
			const ratio = length <= 1e-7 ? 0 : remaining / length;
			return {
				x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
				z: points[index].z + (points[index + 1].z - points[index].z) * ratio
			};
		}
		remaining -= length;
	}
	return copyPoint(points.at(-1)!);
}

function pointAtLateralOffset(
	edge: SpatialEdge,
	fraction: number,
	lateralOffsetM: number,
	world: SpatialWorld
): WorldPoint & { heading: number } {
	const centre = pointAtFraction(edge, fraction, world);
	const before = pointAtFraction(edge, Math.max(0, fraction - 0.01), world);
	const after = pointAtFraction(edge, Math.min(1, fraction + 0.01), world);
	const dx = after.x - before.x;
	const dz = after.z - before.z;
	const tangentLength = Math.max(1e-7, Math.hypot(dx, dz));
	const rightX = dz / tangentLength;
	const rightZ = -dx / tangentLength;
	return {
		x: centre.x + rightX * lateralOffsetM,
		z: centre.z + rightZ * lateralOffsetM,
		heading: Math.atan2(dx, dz)
	};
}

function vehicleKind(kind: SpatialEntityKind): kind is VehicleKind {
	return kind in VEHICLE_PROFILES;
}

function onboardingCue(elapsedMs: number): string {
	if (elapsedMs < 10_000) return 'Click or tap the street, or press Up Arrow, to walk forward.';
	if (elapsedMs < 20_000)
		return 'Left and Right turn. The camera will follow your walking direction.';
	if (elapsedMs < 30_000) return 'Down Arrow or Turn around lets you retrace the street.';
	if (elapsedMs < 40_000)
		return 'Near a stall, choose Stop for tea or food. The street keeps moving.';
	return '';
}

export class SpatialStreetSimulation {
	readonly seed: string;
	readonly world: SpatialWorld;
	readonly previousFailedRuns: number;
	readonly hurryStaminaThreshold: number;
	readonly player: SpatialPlayerState;
	readonly entities: SpatialEntity[] = [];
	readonly pathHistory: SpatialRoutePoint[] = [];
	readonly annotations: SpatialRouteAnnotation[] = [];
	readonly visitedEdgeIds = new Set<string>();
	readonly blockedEdgeIds = new Set<string>();
	metrics: PlayerMetrics;
	food: FoodState;
	counters: SpatialCounters;
	weather: SpatialWeatherState;
	goal: SpatialGoalState | null = null;
	elapsedMs = 0;

	private settings: GameSettings;
	private readonly streams: SimulationStreams;
	private accumulatorSeconds = 0;
	private interaction: ActiveInteraction | null = null;
	private turnTarget: number | null = null;
	private previousIntent: PreviousIntentFlags = {
		hurry: false,
		turnAround: false,
		interact: false
	};
	private pendingAudioEvents: SpatialAudioEvent[] = [];
	private resultValue: SpatialRunResult | null = null;
	private initialShortestDistanceM: number;
	private routeDistanceM = 0;
	private retreatDistanceM = 0;
	private turns = 0;
	private stops = 0;
	private annotationSequence = 0;
	private audioSequence = 0;
	private nextRouteSampleAtM = 0.75;
	private lastEdgeId = '';
	private lastHeadingForTurn = 0;
	private currentStretchM = 0;
	private lastFootstepAtMs = 0;
	private collisionCooldowns = new Map<string, number>();
	private changedAfterPassing = false;
	private rainStarted = false;
	private rainEnded = false;
	private pendingFailure: { reason: string; messages: readonly string[] } | null = null;
	private lastFoodFeedback = '';
	private foodFeedbackUntilMs = 0;
	private foodCrowdSequence = 0;

	constructor(seed: string, settings: GameSettings, world?: SpatialWorld);
	constructor(seed: string, settings: GameSettings, previousFailedRuns: number);
	constructor(
		seed: string,
		settings: GameSettings,
		world: SpatialWorld,
		previousFailedRuns?: number
	);
	constructor(
		seed: string,
		settings: GameSettings,
		worldOrPreviousFailedRuns: SpatialWorld | number = CALCUTTA_SPATIAL_WORLD,
		previousFailedRuns = 0
	) {
		const world =
			typeof worldOrPreviousFailedRuns === 'number'
				? CALCUTTA_SPATIAL_WORLD
				: worldOrPreviousFailedRuns;
		const failures =
			typeof worldOrPreviousFailedRuns === 'number'
				? worldOrPreviousFailedRuns
				: previousFailedRuns;
		this.seed = seed;
		this.settings = { ...settings };
		this.world = world;
		this.previousFailedRuns = clamp(Math.floor(failures), 0, Number.MAX_SAFE_INTEGER);
		const assistance = Math.min(this.previousFailedRuns, MAX_ASSISTED_FAILED_RUNS);
		this.hurryStaminaThreshold = Math.max(8, HURRY_STAMINA_THRESHOLD - assistance);
		this.streams = createRandomStreams(seed, STREAM_NAMES);
		const start = getSpatialNode(world.startNodeId, world).position;
		const initialPath = pathToDestination(start, { world, radiusM: PLAYER_RADIUS_M });
		if (!initialPath)
			throw new Error('The authored spatial world has no route to its destination.');
		this.initialShortestDistanceM = initialPath.distanceM;
		const initialHeading =
			initialPath.points.length > 1 ? headingTo(initialPath.points[0], initialPath.points[1]) : 0;
		this.player = {
			x: start.x,
			z: start.z,
			heading: initialHeading,
			vx: 0,
			vz: 0,
			speed: 0,
			radiusM: PLAYER_RADIUS_M,
			motion: 'idle',
			stridePhase: 0,
			lean: 0,
			turnRate: 0,
			slowdownRemainingS: 0,
			stumbleRemainingS: 0,
			interactionRemainingS: 0,
			hurryRemainingS: 0,
			hurryCooldownRemainingS: 0
		};
		this.lastHeadingForTurn = initialHeading;
		this.metrics = createPlayerMetrics({ morale: 82 + assistance * 3 });
		this.food = createFoodState(this.metrics);
		this.counters = { ...EMPTY_COUNTERS };
		const rainAtMs = this.streams.weather.range(58_000, 72_000);
		this.weather = { state: 'dry', intensity: 0, changedAtMs: 0, nextChangeAtMs: rainAtMs };
		this.generateEntities(initialPath);
		this.recordRoutePoint(true);
		this.annotate('start', 'Walk began at South lane entrance.');
	}

	setSettings(settings: GameSettings): void {
		this.settings = { ...settings };
	}

	walkTo(requested: WorldPoint, source: SpatialGoalState['source'] = 'click'): WalkTargetResult {
		const cleanRequested = copyPoint(requested);
		if (this.resultValue) {
			return {
				accepted: false,
				reason: 'already-arrived',
				requested: cleanRequested,
				target: null,
				path: null
			};
		}
		let snapped;
		try {
			snapped = nearestWalkablePoint(cleanRequested, PLAYER_RADIUS_M, {
				world: this.world,
				blockedEdgeIds: this.blockedEdgeIds
			});
		} catch {
			return {
				accepted: false,
				reason: 'unreachable',
				requested: cleanRequested,
				target: null,
				path: null
			};
		}
		if (snapped.distanceM > 5) {
			return {
				accepted: false,
				reason: 'outside-walkable-world',
				requested: cleanRequested,
				target: copyPoint(snapped.walkablePoint),
				path: null
			};
		}
		const path = findShortestPath(this.player, snapped.walkablePoint, {
			world: this.world,
			blockedEdgeIds: this.blockedEdgeIds,
			radiusM: PLAYER_RADIUS_M
		});
		if (!path) {
			return {
				accepted: false,
				reason: 'unreachable',
				requested: cleanRequested,
				target: null,
				path: null
			};
		}
		this.goal = {
			source,
			requested: cleanRequested,
			target: copyPoint(path.end),
			path,
			pointIndex: Math.min(1, path.points.length - 1),
			createdAtMs: this.elapsedMs
		};
		this.turnTarget = null;
		return {
			accepted: true,
			reason: 'accepted',
			requested: cleanRequested,
			target: copyPoint(path.end),
			path
		};
	}

	stop(annotate = true): void {
		const wasMoving = this.player.speed > 0.08 || this.goal !== null;
		this.goal = null;
		this.turnTarget = null;
		if (wasMoving && annotate) {
			this.stops += 1;
			this.counters.waits += 1;
			this.annotate('stop', 'Paused while the neighbourhood continued.');
		}
	}

	turnAround(): void {
		if (this.resultValue) return;
		this.goal = null;
		this.turnTarget = wrapAngle(this.player.heading + Math.PI);
		this.counters.turnArounds += 1;
		this.annotate('turn-around', 'Turned around here.');
	}

	interact(): InteractionResult {
		if (this.interaction) {
			return {
				accepted: false,
				reason: 'already-busy',
				stallId: this.interaction.stallId,
				kind: this.interaction.kind,
				completesAtMs: this.interaction.completesAtMs
			};
		}
		const nearby = this.nearbyStall();
		if (!nearby) {
			return {
				accepted: false,
				reason: 'nothing-nearby',
				stallId: null,
				kind: null,
				completesAtMs: null
			};
		}
		if ((nearby.nextInteractionAtMs ?? 0) > this.elapsedMs) {
			return {
				accepted: false,
				reason: 'stall-resetting',
				stallId: nearby.id,
				kind: nearby.subtype as FoodKind,
				completesAtMs: nearby.nextInteractionAtMs ?? null
			};
		}
		const kind = nearby.subtype as FoodKind;
		const durationMs =
			kind === 'tea' ? 3_200 : kind === 'fuchka' ? 2_600 : kind === 'mishti' ? 2_100 : 2_800;
		this.stop(false);
		this.player.vx = 0;
		this.player.vz = 0;
		this.player.speed = 0;
		this.player.motion = 'interacting';
		this.player.interactionRemainingS = durationMs / 1_000;
		this.interaction = {
			stallId: nearby.id,
			kind,
			startedAtMs: this.elapsedMs,
			completesAtMs: this.elapsedMs + durationMs
		};
		return {
			accepted: true,
			reason: 'accepted',
			stallId: nearby.id,
			kind,
			completesAtMs: this.elapsedMs + durationMs
		};
	}

	update(deltaSeconds: number, intent: SpatialMovementIntent = {}): SpatialSimulationUpdate {
		if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
			throw new RangeError('Spatial simulation deltaSeconds must be finite and non-negative.');
		}
		this.applyIntentCommands(intent);
		this.pendingAudioEvents = [];
		this.accumulatorSeconds += Math.min(deltaSeconds, MAX_FRAME_SECONDS);
		while (this.accumulatorSeconds + 1e-9 >= FIXED_STEP_SECONDS) {
			this.step(FIXED_STEP_SECONDS, intent);
			this.accumulatorSeconds -= FIXED_STEP_SECONDS;
		}
		this.previousIntent = {
			hurry: Boolean(intent.hurry),
			turnAround: Boolean(intent.turnAround),
			interact: Boolean(intent.interact)
		};
		return {
			snapshot: this.snapshot(),
			audioEvents: this.pendingAudioEvents.map((event) => ({ ...event })),
			result: this.resultValue
		};
	}

	result(): SpatialRunResult | null {
		return this.resultValue;
	}

	hud(): SpatialHudData {
		const nearest = nearestWalkableEdge(this.player, { world: this.world });
		const nearbyStall = this.nearbyStall();
		const prompt = this.interaction
			? `${this.interaction.kind === 'tea' ? 'Tea' : this.interaction.kind} — stopping briefly`
			: this.elapsedMs < this.foodFeedbackUntilMs
				? this.lastFoodFeedback
				: nearbyStall
					? `${this.stallLabel(nearbyStall)} — stop here?`
					: '';
		const warning = this.trafficWarning();
		return {
			destinationMetres: Math.max(
				0,
				distanceToDestination(this.player, {
					world: this.world,
					blockedEdgeIds: this.blockedEdgeIds,
					radiusM: PLAYER_RADIUS_M
				})
			),
			streetName: this.edgeLabel(nearest.edge),
			weather: this.weather.state,
			stamina: this.metrics.stamina,
			morale: this.metrics.morale,
			speedMps: this.player.speed,
			interactionPrompt: prompt,
			onboardingCue: onboardingCue(this.elapsedMs),
			warning,
			warningText: warning?.text ?? '',
			walkingAutomatically: this.goal !== null,
			hurryActive: this.player.hurryRemainingS > 0,
			hurryReady: this.canStartHurry(),
			hurryRemainingS: this.player.hurryRemainingS,
			hurryCooldownRemainingS: this.player.hurryCooldownRemainingS,
			hurryStaminaThreshold: this.hurryStaminaThreshold,
			elapsedMs: this.elapsedMs,
			routeDistanceM: this.routeDistanceM,
			visitedEdgeIds: [...this.visitedEdgeIds]
		};
	}

	audioSources(): readonly MovingAudioSource[] {
		const supported = (entity: SpatialEntity): SpatialSoundKind | null => {
			if (vehicleKind(entity.kind)) return entity.kind;
			if (entity.kind === 'human') return 'crowd';
			if (entity.kind === 'food-stall') return 'tea-stall';
			if (entity.kind === 'dog') return 'dog';
			return null;
		};
		return this.entities.flatMap((entity) => {
			const kind = supported(entity);
			if (!kind || !entity.active) return [];
			return [
				{
					id: entity.id,
					kind,
					x: entity.x,
					z: entity.z,
					vx: entity.vx,
					vz: entity.vz,
					active: true,
					occluded: false
				}
			];
		});
	}

	snapshot(): SpatialRenderSnapshot {
		const cameraDistance = this.settings.cameraMovement === 'gentle' ? 2.15 : 2.55;
		const cameraHeight = this.settings.cameraMovement === 'gentle' ? 3.05 : 3.25;
		const cameraTarget: SpatialCameraTarget = {
			x: this.player.x - Math.sin(this.player.heading) * cameraDistance,
			y: cameraHeight,
			z: this.player.z - Math.cos(this.player.heading) * cameraDistance,
			heading: this.player.heading,
			distanceBehindM: cameraDistance,
			heightM: cameraHeight
		};
		return {
			elapsedMs: this.elapsedMs,
			player: {
				...this.player,
				headingRadians: this.player.heading,
				velocity: { x: this.player.vx, z: this.player.vz }
			},
			cameraTarget,
			entities: this.entities.map((entity) => ({
				...entity,
				variant: entity.subtype ?? entity.kind,
				headingRadians: entity.heading,
				velocity: { x: entity.vx, z: entity.vz },
				goal: entity.goal ? copyPoint(entity.goal) : undefined,
				path: entity.path?.map(copyPoint)
			})),
			weather: { ...this.weather },
			hud: this.hud(),
			goal: this.goal
				? {
						...this.goal,
						requested: copyPoint(this.goal.requested),
						target: copyPoint(this.goal.target)
					}
				: null,
			pathHistory: this.pathHistory.map((point) => ({ ...point })),
			annotations: this.annotations.map((annotation) => ({ ...annotation })),
			blockedEdgeIds: [...this.blockedEdgeIds]
		};
	}

	private applyIntentCommands(intent: SpatialMovementIntent): void {
		if (intent.stop) this.stop();
		if (intent.turnAround && !this.previousIntent.turnAround) this.turnAround();
		if (intent.interact && !this.previousIntent.interact) this.interact();
		if (intent.hurry && !this.previousIntent.hurry) this.startHurry();
		if (intent.target) {
			const current = this.goal?.requested;
			if (!current || distance(current, intent.target) > 0.05) this.walkTo(intent.target, 'intent');
		}
	}

	private canStartHurry(): boolean {
		return (
			this.resultValue === null &&
			this.interaction === null &&
			this.player.hurryRemainingS <= 1e-7 &&
			this.player.hurryCooldownRemainingS <= 1e-7 &&
			this.metrics.stamina >= this.hurryStaminaThreshold
		);
	}

	private startHurry(): boolean {
		if (!this.canStartHurry()) return false;
		this.player.hurryRemainingS = HURRY_BURST_SECONDS;
		this.player.hurryCooldownRemainingS = 0;
		this.counters.recklessDashes += 1;
		return true;
	}

	private updateHurryTimers(deltaSeconds: number): void {
		if (this.player.hurryRemainingS > 0) {
			this.player.hurryRemainingS = Math.max(0, this.player.hurryRemainingS - deltaSeconds);
			if (this.player.hurryRemainingS <= 1e-7) {
				this.player.hurryRemainingS = 0;
				this.player.hurryCooldownRemainingS = HURRY_COOLDOWN_SECONDS;
			}
			return;
		}
		this.player.hurryCooldownRemainingS = Math.max(
			0,
			this.player.hurryCooldownRemainingS - deltaSeconds
		);
	}

	private step(deltaSeconds: number, intent: SpatialMovementIntent): void {
		if (this.resultValue) return;
		this.elapsedMs += deltaSeconds * 1_000;
		const hurrying = this.player.hurryRemainingS > 0;
		this.updateWeather();
		this.updateTimedEvents();
		this.updateEntities(deltaSeconds);
		this.completeInteractionIfReady();
		this.updateActiveFoodBehaviors();
		this.updatePlayer(deltaSeconds, intent);
		this.updateMetrics(deltaSeconds, hurrying);
		this.updateRouteTracking();
		this.updateHurryTimers(deltaSeconds);
		this.checkFailure();
		if (this.resultValue) return;
		this.checkArrival();
	}

	private generateEntities(initialPath: SpatialPath): void {
		for (const stall of this.world.stalls) {
			const edge = getSpatialEdge(stall.edgeId, this.world);
			this.entities.push({
				id: stall.id,
				kind: 'food-stall',
				subtype: stall.kind,
				x: stall.position.x,
				z: stall.position.z,
				heading: stall.facingRadians,
				vx: 0,
				vz: 0,
				speed: 0,
				radiusM: Math.max(...stall.footprintM) * 0.36,
				widthM: stall.footprintM[0],
				lengthM: stall.footprintM[1],
				heightM: 2.05,
				edgeId: stall.edgeId,
				edgeWidthM: edge.widthM,
				minimumRoadWidthM: 0,
				state: 'parked',
				active: true,
				solid: true,
				dangerous: false,
				spawnAtMs: 0,
				interactionCount: 0,
				nextInteractionAtMs: 0
			});
		}

		const entryEdge = getSpatialEdge('spine-south-1', this.world);
		const pedestrianEdges = [
			entryEdge,
			...this.streams.pedestrians
				.shuffle(
					this.world.edges.filter(
						(edge) => edge.pedestrianDensity > 0.2 && edge.id !== entryEdge.id
					)
				)
				.slice(0, 13)
		];
		pedestrianEdges.forEach((edge, index) => {
			const fraction = index === 0 ? 0.2 : this.streams.pedestrians.range(0.16, 0.84);
			const start = pointAtFraction(edge, fraction, this.world);
			const polyline = edgePolyline(edge, this.world);
			const forwards = index === 0 || this.streams.pedestrians.chance(0.5);
			const path = forwards ? polyline : [...polyline].reverse();
			const target = path.at(-1)!;
			this.entities.push({
				id: `human-${index + 1}`,
				kind: 'human',
				subtype: this.streams.pedestrians.pick([
					'commuter',
					'resident',
					'shopper',
					'school-parent'
				]),
				x: start.x,
				z: start.z,
				heading: headingTo(start, target),
				vx: 0,
				vz: 0,
				speed: this.streams.pedestrians.range(0.72, 1.25),
				radiusM: 0.3,
				widthM: 0.52,
				lengthM: 0.36,
				heightM: this.streams.pedestrians.range(1.55, 1.84),
				edgeId: edge.id,
				edgeWidthM: edge.widthM,
				minimumRoadWidthM: 0.8,
				state: 'walking',
				active: false,
				solid: true,
				dangerous: false,
				spawnAtMs: index === 0 ? 7_500 : 12_000 + index * 2_100,
				personalSpaceM: this.streams.pedestrians.range(0.75, 1.05),
				goal: copyPoint(target),
				path: path.map(copyPoint),
				pathIndex: Math.min(1, path.length - 1)
			});
		});

		const vehicleSpawnTimes: Record<VehicleKind, number> = {
			bicycle: 16_000,
			motorbike: 34_000,
			rickshaw: 42_000,
			handcart: 46_000,
			car: 52_000
		};
		(Object.keys(VEHICLE_PROFILES) as VehicleKind[]).forEach((kind, index) => {
			const profile = VEHICLE_PROFILES[kind];
			const eligible = this.world.edges.filter(
				(edge) =>
					edge.widthM >= profile.minimumRoadWidthM &&
					(kind !== 'car' || edge.archetype === 'wider-road')
			);
			// The first gentle bicycle is deliberately staged on the entry spine so a novice
			// learns that traffic occupies depth before the denser systems arrive elsewhere.
			const edge = kind === 'bicycle' ? entryEdge : this.streams.vehicles.pick(eligible);
			const startFraction =
				kind === 'bicycle' ? 0.72 : this.streams.vehicles.chance(0.5) ? 0.12 : 0.88;
			const start = pointAtFraction(edge, startFraction, this.world);
			const polyline = edgePolyline(edge, this.world);
			const path = startFraction < 0.5 ? polyline : [...polyline].reverse();
			this.entities.push({
				id: `${kind}-${index + 1}`,
				kind,
				x: start.x,
				z: start.z,
				heading: headingTo(start, path.at(-1)!),
				vx: 0,
				vz: 0,
				speed: profile.speed,
				radiusM: profile.radiusM,
				widthM: profile.widthM,
				lengthM: profile.lengthM,
				heightM: profile.heightM,
				edgeId: edge.id,
				edgeWidthM: edge.widthM,
				minimumRoadWidthM: profile.minimumRoadWidthM,
				state: 'moving',
				active: false,
				solid: true,
				dangerous: kind === 'motorbike' || kind === 'car',
				spawnAtMs: vehicleSpawnTimes[kind],
				goal: copyPoint(path.at(-1)!),
				path: path.map(copyPoint),
				pathIndex: Math.min(1, path.length - 1)
			});
		});

		const animalEdges = this.streams.animals.shuffle(
			this.world.edges.filter((edge) => edge.animalChance > 0.1)
		);
		const dogEdge = animalEdges[0];
		const dogPoint = pointAtFraction(dogEdge, 0.62, this.world);
		this.entities.push({
			id: 'dog-1',
			kind: 'dog',
			subtype: 'sleeping-street-dog',
			x: dogPoint.x,
			z: dogPoint.z,
			heading: this.streams.animals.range(-Math.PI, Math.PI),
			vx: 0,
			vz: 0,
			speed: 0,
			radiusM: 0.42,
			widthM: 0.55,
			lengthM: 0.9,
			heightM: 0.58,
			edgeId: dogEdge.id,
			edgeWidthM: dogEdge.widthM,
			minimumRoadWidthM: 1.1,
			state: 'sleeping',
			active: false,
			solid: true,
			dangerous: false,
			spawnAtMs: 24_000
		});
		const cowEdge = this.streams.animals.pick(
			this.world.edges.filter((edge) => edge.widthM >= 4.5)
		);
		const cowPoint = pointAtFraction(cowEdge, 0.72, this.world);
		this.entities.push({
			id: 'cow-1',
			kind: 'cow',
			subtype: 'street-cow',
			x: cowPoint.x,
			z: cowPoint.z,
			heading: this.streams.animals.range(-Math.PI, Math.PI),
			vx: 0,
			vz: 0,
			speed: 0.15,
			radiusM: 0.82,
			widthM: 0.78,
			lengthM: 1.9,
			heightM: 1.45,
			edgeId: cowEdge.id,
			edgeWidthM: cowEdge.widthM,
			minimumRoadWidthM: 3.2,
			state: 'grazing',
			active: false,
			solid: true,
			dangerous: false,
			spawnAtMs: 48_000
		});

		const potholeEdges = this.streams.events
			.shuffle(
				this.world.edges.filter(
					(edge) => edge.surface === 'broken-paving' || edge.surface === 'patched-asphalt'
				)
			)
			.slice(0, 7);
		potholeEdges.forEach((edge, index) => {
			const point = pointAtFraction(edge, this.streams.events.range(0.2, 0.8), this.world);
			this.entities.push({
				id: `pothole-${index + 1}`,
				kind: 'pothole',
				x: point.x,
				z: point.z,
				heading: 0,
				vx: 0,
				vz: 0,
				speed: 0,
				radiusM: this.streams.events.range(0.28, 0.58),
				widthM: 0.8,
				lengthM: 0.65,
				heightM: 0.06,
				edgeId: edge.id,
				edgeWidthM: edge.widthM,
				minimumRoadWidthM: 0,
				state: 'blocked',
				active: false,
				solid: false,
				dangerous: false,
				spawnAtMs: index === 0 ? 11_000 : 38_000 + index * 3_000
			});
		});

		this.createHallucinatedPotholes();
		this.createDrains();
		this.createFairObstruction(initialPath);
		const changedEdge = getSpatialEdge(initialPath.edgeIds[0], this.world);
		const changedPoint = pointAtFraction(changedEdge, 0.34, this.world);
		this.entities.push({
			id: 'after-passing-bicycle',
			kind: 'delivery-obstruction',
			subtype: 'parked-bicycle',
			x: changedPoint.x,
			z: changedPoint.z,
			heading: 0.35,
			vx: 0,
			vz: 0,
			speed: 0,
			radiusM: 0.56,
			widthM: 0.62,
			lengthM: 1.8,
			heightM: 1.2,
			edgeId: changedEdge.id,
			edgeWidthM: changedEdge.widthM,
			minimumRoadWidthM: 2.2,
			state: 'parked',
			active: false,
			solid: true,
			dangerous: false,
			spawnAtMs: Number.POSITIVE_INFINITY,
			passedByPlayer: true
		});
	}

	private createHallucinatedPotholes(): void {
		const originals = this.entities
			.filter((entity) => entity.kind === 'pothole' && !entity.hallucinated)
			.slice(0, 3);
		originals.forEach((original, index) => {
			const projection = nearestWalkableEdge(original, { world: this.world });
			const edge = projection.edge;
			const fraction = projection.offsetM / Math.max(1e-7, projection.edgeLengthM);
			const side = index % 2 === 0 ? 1 : -1;
			const lateralOffsetM = side * Math.min(edge.widthM / 2 - 0.45, 0.72 + index * 0.1);
			const point = pointAtLateralOffset(edge, fraction, lateralOffsetM, this.world);
			this.entities.push({
				id: `hallucinated-pothole-${index + 1}`,
				kind: 'pothole',
				subtype: 'hallucinated-duplicate',
				x: point.x,
				z: point.z,
				heading: point.heading,
				vx: 0,
				vz: 0,
				speed: 0,
				radiusM: original.radiusM * 0.92,
				widthM: original.widthM,
				lengthM: original.lengthM,
				heightM: original.heightM,
				edgeId: edge.id,
				edgeWidthM: edge.widthM,
				minimumRoadWidthM: 0,
				state: 'blocked',
				active: false,
				solid: false,
				dangerous: false,
				spawnAtMs: Number.POSITIVE_INFINITY,
				visible: true,
				hallucinated: true,
				lateralOffsetM
			});
		});
	}

	private createDrains(): void {
		const eligible = this.world.edges.filter(
			(edge) => edge.widthM >= 3.05 && edge.widthM <= 4.7 && edge.archetype !== 'courtyard-passage'
		);
		const edges = this.streams.events.shuffle(eligible).slice(0, 5);
		const assistance = Math.min(this.previousFailedRuns, MAX_ASSISTED_FAILED_RUNS);
		const severeChance = BASE_SEVERE_DRAIN_CHANCE / (1 + assistance * 0.5);

		edges.forEach((edge, index) => {
			const radiusM = this.streams.events.range(0.36, 0.48);
			const side = this.streams.events.chance(0.5) ? 1 : -1;
			const lateralOffsetM = side * (edge.widthM / 2 - radiusM * 0.65);
			const fraction = this.streams.events.range(0.18, 0.82);
			const point = pointAtLateralOffset(edge, fraction, lateralOffsetM, this.world);
			// Severity is selected now, not on contact. A deep opening therefore has a stable,
			// renderer-visible identity and never becomes a surprise random failure underfoot.
			const severe = this.streams.events.chance(severeChance);
			this.entities.push({
				id: `drain-${index + 1}`,
				kind: 'drain',
				subtype: severe ? 'deep-open-drain' : 'roadside-drain-grille',
				x: point.x,
				z: point.z,
				heading: point.heading,
				vx: 0,
				vz: 0,
				speed: 0,
				radiusM,
				widthM: radiusM * 1.6,
				lengthM: this.streams.events.range(0.9, 1.35),
				heightM: 0.08,
				edgeId: edge.id,
				edgeWidthM: edge.widthM,
				minimumRoadWidthM: 0,
				state: 'blocked',
				active: true,
				solid: false,
				dangerous: true,
				spawnAtMs: 0,
				visible: true,
				severe,
				lateralOffsetM
			});
		});
	}

	private createFairObstruction(initialPath: SpatialPath): void {
		const candidates = initialPath.edgeIds
			.slice(2)
			.map((id) => getSpatialEdge(id, this.world))
			.filter((edge) => edge.blockage)
			.filter(
				(edge) =>
					pathToDestination(initialPath.start, {
						world: this.world,
						blockedEdgeIds: [edge.id],
						radiusM: PLAYER_RADIUS_M
					}) !== null
			);
		const edge = candidates.length
			? this.streams.events.pick(candidates)
			: getSpatialEdge(initialPath.edgeIds.at(-2)!, this.world);
		const profile = edge.blockage;
		const kind = profile ? this.streams.events.pick(profile.kinds) : 'delivery-cart';
		const minimum = profile?.resolvesAfterSeconds[0] ?? 12;
		const maximum = Math.min(20, profile?.resolvesAfterSeconds[1] ?? 20);
		const assistance = Math.min(this.previousFailedRuns, MAX_ASSISTED_FAILED_RUNS);
		const durationS = Math.max(
			8,
			this.streams.events.range(minimum, Math.max(minimum, maximum)) - assistance * 1.25
		);
		const spawnAtMs = this.streams.events.range(44_000, 51_000);
		const point = pointAtFraction(edge, 0.52, this.world);
		this.entities.push({
			id: 'timed-obstruction-1',
			kind: 'delivery-obstruction',
			subtype: kind,
			x: point.x,
			z: point.z,
			heading: 0.1,
			vx: 0,
			vz: 0,
			speed: 0,
			radiusM: kind === 'carried-load' ? 0.9 : 1.05,
			widthM: Math.min(edge.widthM - 0.4, 1.8),
			lengthM: 2.35,
			heightM: 1.65,
			edgeId: edge.id,
			edgeWidthM: edge.widthM,
			minimumRoadWidthM: 2.5,
			state: 'blocked',
			active: false,
			solid: true,
			dangerous: false,
			spawnAtMs,
			resolvesAtMs: spawnAtMs + durationS * 1_000,
			blocksEdgeId: edge.id
		});
	}

	private updateWeather(): void {
		if (!this.rainStarted && this.elapsedMs >= this.weather.nextChangeAtMs) {
			this.rainStarted = true;
			this.weather = {
				state: 'rain',
				intensity: 0.82,
				changedAtMs: this.elapsedMs,
				nextChangeAtMs: this.elapsedMs + 24_000
			};
			this.annotate('rain', 'Rain began; familiar edges became darker and slower.');
			this.emitAudio('splash', 'weather', 'normal', 'rain', this.player);
		} else if (
			this.rainStarted &&
			!this.rainEnded &&
			this.elapsedMs >= this.weather.nextChangeAtMs
		) {
			this.rainEnded = true;
			this.weather = {
				state: 'post-rain',
				intensity: 0.28,
				changedAtMs: this.elapsedMs,
				nextChangeAtMs: Number.POSITIVE_INFINITY
			};
		}
	}

	private updateTimedEvents(): void {
		for (const entity of this.entities) {
			if (!entity.active && !entity.resolved && this.elapsedMs >= entity.spawnAtMs) {
				entity.active = true;
				if (entity.blocksEdgeId) {
					this.blockedEdgeIds.add(entity.blocksEdgeId);
					this.annotate(
						'obstruction',
						`${entity.subtype ?? 'Delivery'} temporarily blocked this route.`,
						entity
					);
					this.replanGoal();
				}
			}
			if (entity.active && entity.resolvesAtMs && this.elapsedMs >= entity.resolvesAtMs) {
				entity.active = false;
				entity.resolved = true;
				if (entity.stallCrowd) {
					this.annotate('food', 'The temporary stall crowd dispersed.', entity);
					continue;
				}
				if (entity.blocksEdgeId) this.blockedEdgeIds.delete(entity.blocksEdgeId);
				this.annotate('obstruction', `${entity.subtype ?? 'The obstruction'} moved on.`, entity);
				this.replanGoal();
			}
		}

		if (!this.changedAfterPassing && this.elapsedMs >= 42_000 && this.visitedEdgeIds.size >= 2) {
			const changed = this.entities.find((entity) => entity.id === 'after-passing-bicycle');
			if (changed) {
				changed.active = true;
				changed.spawnAtMs = this.elapsedMs;
				changed.resolvesAtMs = this.elapsedMs + 22_000;
				this.changedAfterPassing = true;
				this.annotate('street-changed', 'A bicycle was parked after you passed this way.', changed);
			}
		}
	}

	private updateActiveFoodBehaviors(): void {
		const modifiers = getFoodModifiers(this.food, this.elapsedMs);
		for (const entity of this.entities) {
			if (entity.hallucinated) entity.active = modifiers.hallucinatedPotholes;
		}
		if (!modifiers.wakeNearbyDogs) return;
		for (const dog of this.entities) {
			if (dog.kind !== 'dog' || dog.state !== 'sleeping' || distance(dog, this.player) > 33) {
				continue;
			}
			dog.state = 'awake';
			dog.subtype = 'awake-street-dog';
			dog.heading = headingTo(dog, this.player);
			this.counters.dogsAwakened += 1;
			this.annotate('incident', 'Nearby dogs woke after the ghugni announcement.', dog);
			this.emitAudio('bark', 'animals', 'important', dog.id, dog);
		}
	}

	private updateEntities(deltaSeconds: number): void {
		for (const entity of this.entities) {
			if (!entity.active) continue;
			if (entity.kind === 'human') this.updateHuman(entity, deltaSeconds);
			else if (vehicleKind(entity.kind)) this.updateVehicle(entity, deltaSeconds);
		}
	}

	private updateHuman(entity: SpatialEntity, deltaSeconds: number): void {
		const path = entity.path;
		if (!path?.length) return;
		if (entity.state === 'waiting' || entity.state === 'talking' || entity.state === 'looking') {
			entity.vx = 0;
			entity.vz = 0;
			if ((entity.stateUntilMs ?? 0) > this.elapsedMs) return;
			entity.state = 'resuming';
		}
		let index = entity.pathIndex ?? 0;
		let target = path[index] ?? path.at(-1)!;
		if (distance(entity, target) < 0.35) {
			index += 1;
			if (index >= path.length) {
				entity.path = [...path].reverse();
				entity.pathIndex = Math.min(1, path.length - 1);
				entity.state = this.streams.pedestrians.pick(['waiting', 'looking', 'talking']);
				entity.stateUntilMs = this.elapsedMs + this.streams.pedestrians.range(1_000, 4_500);
				entity.vx = 0;
				entity.vz = 0;
				return;
			}
			entity.pathIndex = index;
			target = path[index];
		}
		const dx = target.x - entity.x;
		const dz = target.z - entity.z;
		const length = Math.max(1e-6, Math.hypot(dx, dz));
		let directionX = dx / length;
		let directionZ = dz / length;
		let speedMultiplier = 1;
		const playerDistance = distance(entity, this.player);
		if (playerDistance < (entity.personalSpaceM ?? 0.85) + PLAYER_RADIUS_M) {
			const awayX = (entity.x - this.player.x) / Math.max(0.1, playerDistance);
			const awayZ = (entity.z - this.player.z) / Math.max(0.1, playerDistance);
			directionX = directionX * 0.55 + awayX * 0.45;
			directionZ = directionZ * 0.55 + awayZ * 0.45;
			speedMultiplier = playerDistance < 0.65 ? 0.28 : 0.62;
			entity.state = 'avoiding';
		} else {
			entity.state = entity.state === 'resuming' ? 'resuming' : 'walking';
		}
		const normalized = Math.max(1e-6, Math.hypot(directionX, directionZ));
		entity.vx = (directionX / normalized) * entity.speed * speedMultiplier;
		entity.vz = (directionZ / normalized) * entity.speed * speedMultiplier;
		entity.heading = moveAngle(
			entity.heading,
			Math.atan2(entity.vx, entity.vz),
			deltaSeconds * 2.8
		);
		entity.x += entity.vx * deltaSeconds;
		entity.z += entity.vz * deltaSeconds;
	}

	private updateVehicle(entity: SpatialEntity, deltaSeconds: number): void {
		const path = entity.path;
		if (!path?.length) return;
		let index = entity.pathIndex ?? 0;
		let target = path[index] ?? path.at(-1)!;
		if (distance(entity, target) < Math.max(0.4, entity.speed * deltaSeconds * 1.5)) {
			index += 1;
			if (index >= path.length) {
				entity.path = [...path].reverse();
				entity.pathIndex = Math.min(1, path.length - 1);
				target = entity.path[entity.pathIndex];
			} else {
				entity.pathIndex = index;
				target = path[index];
			}
		}
		const angle = headingTo(entity, target);
		entity.heading = moveAngle(entity.heading, angle, deltaSeconds * 2.4);
		entity.vx = Math.sin(entity.heading) * entity.speed;
		entity.vz = Math.cos(entity.heading) * entity.speed;
		entity.x += entity.vx * deltaSeconds;
		entity.z += entity.vz * deltaSeconds;
	}

	private updatePlayer(deltaSeconds: number, intent: SpatialMovementIntent): void {
		this.player.slowdownRemainingS = Math.max(0, this.player.slowdownRemainingS - deltaSeconds);
		this.player.stumbleRemainingS = Math.max(0, this.player.stumbleRemainingS - deltaSeconds);
		this.player.interactionRemainingS = this.interaction
			? Math.max(0, (this.interaction.completesAtMs - this.elapsedMs) / 1_000)
			: 0;
		if (this.interaction) {
			this.player.vx = 0;
			this.player.vz = 0;
			this.player.speed = 0;
			this.player.motion = 'interacting';
			return;
		}

		let desiredHeading = this.player.heading;
		let desiredSpeed = 0;
		let strafe = 0;
		const hurrying = this.player.hurryRemainingS > 0;
		const mode = intent.mode ?? this.settings.controlScheme;
		const foodModifiers = getFoodModifiers(this.food, this.elapsedMs);
		const controlDirection = foodModifiers.reversedControls ? -1 : 1;
		const manualMagnitude =
			Math.abs(intent.moveForward ?? 0) + Math.abs(intent.turn ?? 0) + Math.abs(intent.strafe ?? 0);
		if (manualMagnitude > 0.05 && this.goal) this.goal = null;

		if (this.turnTarget !== null) {
			desiredHeading = this.turnTarget;
			if (Math.abs(wrapAngle(this.turnTarget - this.player.heading)) < 0.035)
				this.turnTarget = null;
		} else if (this.goal) {
			const points = this.goal.path.points;
			while (
				this.goal.pointIndex < points.length - 1 &&
				distance(this.player, points[this.goal.pointIndex]) <= PATH_POINT_RADIUS_M
			) {
				this.goal.pointIndex += 1;
			}
			const target = points[this.goal.pointIndex] ?? this.goal.target;
			const remaining = distance(this.player, target);
			if (remaining <= TARGET_REACHED_RADIUS_M && this.goal.pointIndex >= points.length - 1) {
				this.goal = null;
			} else {
				desiredHeading = headingTo(this.player, target);
				const turnMagnitude = Math.abs(wrapAngle(desiredHeading - this.player.heading));
				const approach = clamp(remaining / 1.6, 0.12, 1);
				desiredSpeed =
					(hurrying ? HURRY_SPEED_MPS : WALK_SPEED_MPS) *
					clamp(1.12 - turnMagnitude * 0.68, 0.08, 1) *
					approach;
			}
		} else {
			const forward = clamp((intent.moveForward ?? 0) * controlDirection, -1, 1);
			const turn = clamp((intent.turn ?? 0) * controlDirection, -1, 1);
			const turnSpeed = mode === 'simple' ? 1.65 : 2.25;
			desiredHeading = wrapAngle(this.player.heading + turn * turnSpeed * deltaSeconds);
			if (forward >= 0) desiredSpeed = forward * (hurrying ? HURRY_SPEED_MPS : WALK_SPEED_MPS);
			else desiredSpeed = forward * BACKWARD_SPEED_MPS;
			strafe = mode === 'experienced' ? clamp((intent.strafe ?? 0) * controlDirection, -1, 1) : 0;
		}

		if (foodModifiers.fineControlMultiplier < 0.9) {
			const jitter =
				Math.sin(this.elapsedMs * 0.019) * (1 - foodModifiers.fineControlMultiplier) * 0.5;
			strafe = clamp(strafe + jitter, -1, 1);
		}
		desiredSpeed *= foodModifiers.speedMultiplier;
		if (this.weather.state === 'rain') desiredSpeed *= 0.9;
		if (this.player.slowdownRemainingS > 0) desiredSpeed *= 0.52;
		if (this.player.stumbleRemainingS > 0) desiredSpeed *= 0.22;
		const maximumTurn =
			(this.settings.cameraMovement === 'gentle' ? 2.05 : 2.65) *
			foodModifiers.responsivenessMultiplier *
			deltaSeconds;
		const previousHeading = this.player.heading;
		this.player.heading = moveAngle(this.player.heading, desiredHeading, maximumTurn);
		this.player.turnRate = wrapAngle(this.player.heading - previousHeading) / deltaSeconds;

		// Click-to-walk steers translational motion toward the next ground point while the body
		// catches up visually. This is the pedestrian equivalent of taking a small side-step and
		// avoids the endless circles produced by vehicle-style forward-only steering at corners.
		const movementHeading = this.goal ? desiredHeading : this.player.heading;
		const forwardX = Math.sin(movementHeading);
		const forwardZ = Math.cos(movementHeading);
		const rightX = Math.cos(this.player.heading);
		const rightZ = -Math.sin(this.player.heading);
		let desiredVx = forwardX * desiredSpeed + rightX * strafe * WALK_SPEED_MPS * 0.72;
		let desiredVz = forwardZ * desiredSpeed + rightZ * strafe * WALK_SPEED_MPS * 0.72;
		const avoidance = this.playerAvoidanceVector();
		desiredVx += avoidance.x;
		desiredVz += avoidance.z;
		const response =
			this.player.stumbleRemainingS > 0 ? 2.2 : desiredSpeed === 0 && strafe === 0 ? 8 : 5.4;
		const blend = Math.min(1, response * foodModifiers.responsivenessMultiplier * deltaSeconds);
		this.player.vx += (desiredVx - this.player.vx) * blend;
		this.player.vz += (desiredVz - this.player.vz) * blend;
		const previous = { x: this.player.x, z: this.player.z };
		const candidate = {
			x: this.player.x + this.player.vx * deltaSeconds,
			z: this.player.z + this.player.vz * deltaSeconds
		};
		const walkable = nearestWalkablePoint(candidate, PLAYER_RADIUS_M, { world: this.world });
		this.player.x = walkable.walkablePoint.x;
		this.player.z = walkable.walkablePoint.z;
		this.resolvePhysicalContacts(previous);
		this.player.speed = Math.hypot(this.player.vx, this.player.vz);
		const travelled = distance(previous, this.player);
		this.routeDistanceM += travelled;
		this.currentStretchM += travelled;
		this.counters.currentStretch = this.currentStretchM;
		this.counters.longestStretch = Math.max(this.counters.longestStretch, this.currentStretchM);
		this.player.stridePhase = (this.player.stridePhase + travelled * 2.5) % (Math.PI * 2);
		this.player.lean +=
			(clamp(this.player.turnRate * 0.06, -0.14, 0.14) - this.player.lean) *
			Math.min(1, deltaSeconds * 6);
		this.player.motion =
			this.player.stumbleRemainingS > 0
				? 'stumbling'
				: this.player.slowdownRemainingS > 0
					? 'slowed'
					: this.turnTarget !== null && this.player.speed < 0.15
						? 'turning'
						: hurrying && this.player.speed > 0.08
							? 'hurrying'
							: this.player.speed > 0.08
								? 'walking'
								: 'idle';
		if (
			this.player.speed > 0.45 &&
			this.elapsedMs - this.lastFootstepAtMs > (this.player.speed > 1.75 ? 330 : 510)
		) {
			this.lastFootstepAtMs = this.elapsedMs;
			this.emitAudio('footstep', 'interaction', 'ambient', 'player', this.player);
		}
	}

	private playerAvoidanceVector(): WorldPoint {
		let x = 0;
		let z = 0;
		for (const entity of this.entities) {
			if (!entity.active || entity.kind !== 'human') continue;
			const separation = distance(this.player, entity);
			const threshold = (entity.personalSpaceM ?? 0.85) + PLAYER_RADIUS_M;
			if (separation >= threshold || separation < 1e-5) continue;
			const weight = (threshold - separation) / threshold;
			x += ((this.player.x - entity.x) / separation) * weight * 0.65;
			z += ((this.player.z - entity.z) / separation) * weight * 0.65;
		}
		return { x, z };
	}

	private resolvePhysicalContacts(previous: WorldPoint): void {
		for (const entity of this.entities) {
			if (!entity.active) continue;
			const separation = distance(this.player, entity);
			const contact = PLAYER_RADIUS_M + entity.radiusM;
			if (entity.kind === 'drain' && separation < contact) {
				if (!this.onCollisionCooldown(entity.id)) {
					this.counters.drainsEntered += 1;
					this.currentStretchM = 0;
					this.player.slowdownRemainingS = Math.max(this.player.slowdownRemainingS, 2.8);
					this.player.stumbleRemainingS = Math.max(this.player.stumbleRemainingS, 0.65);
					this.applyFoodAdjustedMetricDelta({
						stamina: entity.severe ? -9 : -4.5,
						morale: entity.severe ? -7 : -2.5
					});
					this.annotate(
						'incident',
						entity.severe
							? 'Entered a clearly open roadside drain.'
							: 'Stepped into a roadside drain.',
						entity
					);
					this.emitAudio(
						this.weather.state === 'dry' ? 'stumble' : 'splash',
						'interaction',
						'important',
						entity.id,
						entity
					);
					if (entity.severe) {
						this.pendingFailure = {
							reason: 'Entered a deep roadside drain.',
							messages: GAME_OVER_MESSAGES.drain
						};
					}
				}
				continue;
			}
			if (entity.kind === 'pothole' && !entity.hallucinated && separation < contact) {
				if (!this.onCollisionCooldown(entity.id)) {
					this.counters.potholesEntered += 1;
					this.player.slowdownRemainingS = Math.max(this.player.slowdownRemainingS, 2.1);
					this.player.stumbleRemainingS = Math.max(this.player.stumbleRemainingS, 0.42);
					this.applyFoodAdjustedMetricDelta({ stamina: -2.4, morale: -1.2 });
					this.annotate('incident', 'Entered a pothole.', entity);
					this.emitAudio(
						this.weather.state === 'dry' ? 'stumble' : 'splash',
						'interaction',
						'important',
						entity.id,
						entity
					);
				}
				continue;
			}
			if (!entity.solid || separation >= contact) continue;
			if (entity.kind === 'food-stall' && this.interaction?.stallId === entity.id) continue;
			this.player.x = previous.x;
			this.player.z = previous.z;
			this.player.vx *= 0.16;
			this.player.vz *= 0.16;
			this.player.slowdownRemainingS = Math.max(
				this.player.slowdownRemainingS,
				entity.dangerous ? 1.4 : 0.65
			);
			if (!this.onCollisionCooldown(entity.id)) {
				this.counters.collisions += 1;
				this.currentStretchM = 0;
				const staminaLoss =
					entity.kind === 'car' || entity.kind === 'motorbike'
						? 8
						: entity.kind === 'cow'
							? 4
							: 1.2;
				const moraleLoss = entity.kind === 'human' ? 1.5 : entity.dangerous ? 4 : 0.8;
				this.applyFoodAdjustedMetricDelta({
					stamina: -staminaLoss,
					morale: -moraleLoss
				});
				if (entity.kind === 'cow') this.counters.cowsOffended += 1;
				if (entity.kind === 'dog') this.counters.dogsAwakened += 1;
				this.annotate('incident', this.contactLabel(entity), entity);
				this.emitAudio(
					entity.kind === 'dog' ? 'bark' : entity.dangerous ? 'horn' : 'reaction',
					entity.kind === 'dog' ? 'animals' : entity.dangerous ? 'traffic' : 'people',
					'important',
					entity.id,
					entity
				);
			}
		}
	}

	private applyFoodAdjustedMetricDelta(delta: Partial<PlayerMetrics>): void {
		const moraleMultiplier = getFoodModifiers(this.food, this.elapsedMs).moraleLossMultiplier;
		const morale = delta.morale;
		this.metrics = applyMetricDelta(this.metrics, {
			...delta,
			morale: typeof morale === 'number' && morale < 0 ? morale * moraleMultiplier : morale
		});
		this.food = { ...this.food, metrics: this.metrics };
	}

	private onCollisionCooldown(entityId: string): boolean {
		const until = this.collisionCooldowns.get(entityId) ?? 0;
		if (until > this.elapsedMs) return true;
		this.collisionCooldowns.set(entityId, this.elapsedMs + 1_800);
		return false;
	}

	private updateMetrics(deltaSeconds: number, hurrying: boolean): void {
		const previousDistance = this.metrics.distance;
		const modifiers = getFoodModifiers(this.food, this.elapsedMs);
		this.metrics = advanceMetrics(this.metrics, {
			deltaMs: deltaSeconds * 1_000,
			moving: this.player.speed > 0.08,
			dashing: hurrying && this.player.speed > WALK_SPEED_MPS,
			weather: this.weather.state,
			heatIntensity: 0.52,
			staminaDrainMultiplier: modifiers.staminaDrainMultiplier
		});
		this.metrics = {
			...this.metrics,
			distance: previousDistance + this.player.speed * deltaSeconds,
			reflex: clamp(modifiers.responsivenessMultiplier, 0.5, 1.5)
		};
		this.food = { ...expireFoodEffects(this.food, this.elapsedMs), metrics: this.metrics };
	}

	private completeInteractionIfReady(): void {
		if (!this.interaction || this.elapsedMs < this.interaction.completesAtMs) return;
		const active = this.interaction;
		const stall = this.entities.find((entity) => entity.id === active.stallId);
		const before = this.metrics;
		const consumed = consumeFood(
			this.food,
			active.kind,
			this.elapsedMs,
			active.kind === 'ghugni' ? this.streams.food : undefined
		);
		this.food = consumed.state;
		this.metrics = consumed.state.metrics;
		this.counters.snacksConsumed += 1;
		if (active.kind === 'tea') this.counters.teaStops += 1;
		if (
			this.metrics.stamina > before.stamina ||
			this.metrics.morale > before.morale ||
			active.kind === 'tea'
		) {
			this.counters.usefulSnacks += 1;
		}
		if (stall) {
			stall.interactionCount = (stall.interactionCount ?? 0) + 1;
			stall.nextInteractionAtMs = this.elapsedMs + 4_000;
		}
		if (stall && consumed.events.includes('stall-crowd')) this.createStallCrowd(stall);
		const feedback = this.foodFeedback(active.kind, consumed.outcome);
		this.lastFoodFeedback = feedback;
		this.foodFeedbackUntilMs = this.elapsedMs + 3_200;
		this.annotate('food', feedback, stall ?? this.player);
		this.emitAudio(
			active.kind === 'tea' ? 'tea' : 'snack',
			'interaction',
			'important',
			active.stallId,
			stall ?? this.player
		);
		this.interaction = null;
		this.player.interactionRemainingS = 0;
		this.player.motion = 'idle';
	}

	private foodFeedback(kind: FoodKind, ghugniOutcome: FoodState['lastGhugniOutcome']): string {
		if (kind === 'tea') {
			const jittering = this.food.activeEffects.some(
				(effect) => effect.id === 'tea-jitters' && effect.expiresAtMs > this.elapsedMs
			);
			return jittering
				? 'Chaa: warnings arrive earlier; a third cup has made fine control jittery.'
				: 'Chaa: warnings arrive earlier for eight seconds.';
		}
		if (kind === 'ghugni' && ghugniOutcome) {
			return `Roadside ghugni: ${GHUGNI_MESSAGES[ghugniOutcome]}`;
		}
		return FOOD_MESSAGES[kind];
	}

	private createStallCrowd(stall: SpatialEntity): void {
		const modifiers = getFoodModifiers(this.food, this.elapsedMs);
		const count = Math.max(2, Math.round(2 * modifiers.stallCrowdMultiplier));
		const crowdEffect = this.food.activeEffects.find(
			(effect) => effect.id === 'fuchka-crowd' && effect.expiresAtMs > this.elapsedMs
		);
		const resolvesAtMs = crowdEffect?.expiresAtMs ?? this.elapsedMs + 2_500;
		for (let index = 0; index < count; index += 1) {
			const angle = this.player.heading + Math.PI / 2 + (index - (count - 1) / 2) * 0.72;
			const radius = 1.05 + (index % 2) * 0.16;
			const requested = {
				x: this.player.x + Math.sin(angle) * radius,
				z: this.player.z + Math.cos(angle) * radius
			};
			const snapped = nearestWalkablePoint(requested, 0.3, { world: this.world });
			const edge = snapped.edge;
			this.foodCrowdSequence += 1;
			this.entities.push({
				id: `food-crowd-${this.foodCrowdSequence}`,
				kind: 'human',
				subtype: 'fuchka-customer',
				x: snapped.walkablePoint.x,
				z: snapped.walkablePoint.z,
				heading: headingTo(snapped.walkablePoint, stall),
				vx: 0,
				vz: 0,
				speed: 0,
				radiusM: 0.3,
				widthM: 0.52,
				lengthM: 0.36,
				heightM: 1.62 + index * 0.07,
				edgeId: edge.id,
				edgeWidthM: edge.widthM,
				minimumRoadWidthM: 0.8,
				state: 'buying',
				active: true,
				solid: true,
				dangerous: false,
				spawnAtMs: this.elapsedMs,
				resolvesAtMs,
				stallCrowd: true,
				personalSpaceM: 0.72
			});
		}
	}

	private nearbyStall(): SpatialEntity | null {
		let nearest: SpatialEntity | null = null;
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (const entity of this.entities) {
			if (!entity.active || entity.kind !== 'food-stall') continue;
			const candidate = distance(this.player, entity) - entity.radiusM;
			if (candidate <= 1.55 && candidate < nearestDistance) {
				nearest = entity;
				nearestDistance = candidate;
			}
		}
		return nearest;
	}

	private stallLabel(stall: SpatialEntity): string {
		const authored = this.world.stalls.find((candidate) => candidate.id === stall.id);
		const kind =
			stall.subtype === 'tea'
				? 'Tea'
				: stall.subtype === 'fuchka'
					? 'Fuchka'
					: stall.subtype === 'mishti'
						? 'Mishti'
						: 'Ghugni';
		return authored ? `${kind} at ${authored.label}` : kind;
	}

	private replanGoal(): void {
		if (!this.goal) return;
		const target = this.goal.target;
		const result = this.walkTo(target, 'replan');
		if (!result.accepted) this.stop(false);
	}

	private updateRouteTracking(): void {
		const nearest = nearestWalkableEdge(this.player, { world: this.world });
		this.visitedEdgeIds.add(nearest.edge.id);
		if (this.lastEdgeId && this.lastEdgeId !== nearest.edge.id) {
			const previous = this.entities.find(
				(entity) => entity.edgeId === this.lastEdgeId && entity.id === 'after-passing-bicycle'
			);
			if (previous) previous.passedByPlayer = true;
		}
		this.lastEdgeId = nearest.edge.id;
		const headingDelta = Math.abs(wrapAngle(this.player.heading - this.lastHeadingForTurn));
		if (headingDelta > 0.72 && this.player.speed > 0.18) {
			this.turns += 1;
			this.lastHeadingForTurn = this.player.heading;
			this.annotate('turn', 'Turned into another part of the neighbourhood.');
		}
		if (this.routeDistanceM >= this.nextRouteSampleAtM) {
			this.recordRoutePoint(false);
			this.nextRouteSampleAtM = this.routeDistanceM + 0.75;
		}
		const destination = getSpatialNode(this.world.destinationNodeId, this.world).position;
		const currentDistance = distance(this.player, destination);
		const previous = this.pathHistory.at(-2);
		if (previous && currentDistance > distance(previous, destination) + 0.02) {
			this.retreatDistanceM += this.player.speed * FIXED_STEP_SECONDS;
		}
	}

	private recordRoutePoint(force: boolean): void {
		const edge = nearestWalkableEdge(this.player, { world: this.world }).edge;
		const last = this.pathHistory.at(-1);
		if (!force && last && distance(last, this.player) < 0.55) return;
		this.pathHistory.push({
			x: this.player.x,
			z: this.player.z,
			atMs: this.elapsedMs,
			edgeId: edge.id,
			heading: this.player.heading
		});
	}

	private annotate(
		kind: SpatialAnnotationKind,
		label: string,
		point: WorldPoint = this.player
	): void {
		this.annotationSequence += 1;
		let edgeId = this.lastEdgeId;
		try {
			edgeId = nearestWalkableEdge(point, { world: this.world }).edge.id;
		} catch {
			// The point can be a resolving prop just outside the corridor; retain the current edge.
		}
		this.annotations.push({
			id: `route-note-${this.annotationSequence}`,
			kind,
			atMs: this.elapsedMs,
			label,
			x: point.x,
			z: point.z,
			edgeId
		});
	}

	private trafficWarning(): VisualTrafficWarning | null {
		const warningTimeMultiplier = clamp(
			getFoodModifiers(this.food, this.elapsedMs).warningTimeMultiplier,
			0.25,
			2
		);
		let best: { entity: SpatialEntity; distanceM: number; closing: number } | null = null;
		for (const entity of this.entities) {
			if (!entity.active || !vehicleKind(entity.kind)) continue;
			const dx = entity.x - this.player.x;
			const dz = entity.z - this.player.z;
			const separation = Math.hypot(dx, dz);
			if (separation > 35 * warningTimeMultiplier || separation < 1e-5) continue;
			const radial =
				((entity.vx - this.player.vx) * dx + (entity.vz - this.player.vz) * dz) / separation;
			const closing = -radial;
			if (closing < 0.25 && separation > 8) continue;
			if (
				!best ||
				separation / Math.max(0.25, closing) < best.distanceM / Math.max(0.25, best.closing)
			) {
				best = { entity, distanceM: separation, closing };
			}
		}
		if (!best) return null;
		const entity = best.entity;
		const kind = entity.kind;
		if (!vehicleKind(kind)) return null;
		const localForward =
			Math.sin(this.player.heading) * (entity.x - this.player.x) +
			Math.cos(this.player.heading) * (entity.z - this.player.z);
		const localRight =
			Math.cos(this.player.heading) * (entity.x - this.player.x) -
			Math.sin(this.player.heading) * (entity.z - this.player.z);
		const direction =
			Math.abs(localForward) >= Math.abs(localRight)
				? localForward >= 0
					? 'ahead'
					: 'behind'
				: localRight >= 0
					? 'right'
					: 'left';
		const effectiveDistanceM = best.distanceM / warningTimeMultiplier;
		const urgency =
			effectiveDistanceM < 5 || effectiveDistanceM / Math.max(0.25, best.closing) < 1.3
				? 'immediate'
				: effectiveDistanceM < 13
					? 'near'
					: 'notice';
		return {
			entityId: entity.id,
			kind,
			direction,
			distanceM: best.distanceM,
			closingSpeedMps: Math.max(0, best.closing),
			urgency,
			text: `${kind} ${direction}${urgency === 'immediate' ? ' — give it room' : ''}`,
			visual: true
		};
	}

	private checkFailure(): void {
		if (this.pendingFailure) {
			const failure = this.pendingFailure;
			this.pendingFailure = null;
			this.finishFailure(failure.reason, failure.messages);
			return;
		}
		if (this.metrics.morale <= 0) {
			this.annotate('incident', 'Morale reached zero; the walk ended here.');
			this.finishFailure('Morale reached zero.', GAME_OVER_MESSAGES.morale);
		}
	}

	private finishFailure(reason: string, messages: readonly string[]): void {
		this.goal = null;
		this.turnTarget = null;
		this.interaction = null;
		this.player.vx = 0;
		this.player.vz = 0;
		this.player.speed = 0;
		this.player.motion = 'failed';
		this.player.interactionRemainingS = 0;
		this.player.hurryRemainingS = 0;
		this.recordRoutePoint(true);
		this.resultValue = this.buildResult(false, reason, messages);
	}

	private checkArrival(): void {
		const destinationNode = getSpatialNode(this.world.destinationNodeId, this.world);
		if (distance(this.player, destinationNode.position) > ARRIVAL_RADIUS_M) return;
		this.player.x = destinationNode.position.x;
		this.player.z = destinationNode.position.z;
		this.player.vx = 0;
		this.player.vz = 0;
		this.player.speed = 0;
		this.player.motion = 'arrived';
		this.goal = null;
		this.recordRoutePoint(true);
		this.annotate('arrival', 'You arrived at the destination pharmacy.');
		this.emitAudio('arrival', 'interaction', 'important', 'destination', this.player);
		this.resultValue = this.buildResult(true, 'Destination reached.', [
			'You arrived. The neighbourhood has retained the right to change behind you.',
			'Arrival confirmed after several locally reasonable revisions.',
			'You found a route. It was correct for almost the entire time.'
		]);
	}

	private buildResult(won: boolean, reason: string, messages: readonly string[]): SpatialRunResult {
		const score: ScoreResult = calculateScore({
			forwardDistance: this.metrics.distance,
			retreatDistance: this.retreatDistanceM,
			destinationDistance: this.initialShortestDistanceM,
			elapsedMs: this.elapsedMs,
			won,
			finalMorale: this.metrics.morale,
			nearMisses: this.counters.nearMisses,
			narrowGaps: this.counters.narrowGaps,
			usefulSnacks: this.counters.usefulSnacks,
			collisions: this.counters.collisions,
			recklessDashes: this.counters.recklessDashes,
			potholesEntered: this.counters.potholesEntered,
			dogsAwakened: this.counters.dogsAwakened,
			cowsOffended: this.counters.cowsOffended,
			collisionFreeSections: this.counters.collisionFreeSections
		});
		const rating =
			[...CIVIC_RATINGS].reverse().find((candidate) => score.total >= candidate.minimum)?.title ??
			CIVIC_RATINGS[0].title;
		const destinationNode = getSpatialNode(this.world.destinationNodeId, this.world);
		const route = this.pathHistory.map<RouteTracePoint>((point) => ({
			x: point.x,
			z: point.z,
			atMs: point.atMs,
			kind: 'walk'
		}));
		for (const annotation of this.annotations) {
			const kind: RouteTracePoint['kind'] =
				annotation.kind === 'turn-around'
					? 'turn-around'
					: annotation.kind === 'food'
						? annotation.label.toLowerCase().includes('tea')
							? 'tea'
							: 'food'
						: annotation.kind === 'incident'
							? 'incident'
							: 'walk';
			route.push({
				x: annotation.x,
				z: annotation.z,
				atMs: annotation.atMs,
				kind,
				label: annotation.label
			});
		}
		route.sort((left, right) => left.atMs - right.atMs);
		return {
			won,
			reason,
			message: this.streams.cosmetics.pick(messages),
			seed: this.seed,
			elapsedMs: this.elapsedMs,
			distanceMetres: Math.round(this.routeDistanceM),
			counters: { ...this.counters },
			metrics: { ...this.metrics },
			food: {
				...this.food,
				metrics: { ...this.food.metrics },
				activeEffects: [...this.food.activeEffects],
				consumed: { ...this.food.consumed }
			},
			score,
			rating,
			route,
			routeSummary: {
				points: this.pathHistory.map((point) => ({ ...point })),
				annotations: this.annotations.map((annotation) => ({ ...annotation })),
				visitedEdgeIds: [...this.visitedEdgeIds],
				distanceM: this.routeDistanceM,
				shortestDistanceM: this.initialShortestDistanceM,
				detourDistanceM: Math.max(0, this.routeDistanceM - this.initialShortestDistanceM),
				turns: this.turns,
				turnArounds: this.counters.turnArounds,
				stops: this.stops,
				teaStops: this.counters.teaStops
			},
			destination: {
				x: destinationNode.position.x,
				z: destinationNode.position.z,
				label: destinationNode.label
			}
		};
	}

	private emitAudio(
		kind: SpatialAudioEvent['kind'],
		category: SpatialAudioEvent['category'],
		priority: SpatialAudioEvent['priority'],
		emitterId: string,
		emitter: WorldPoint & Partial<Pick<SpatialEntity, 'vx' | 'vz'>>
	): void {
		this.audioSequence += 1;
		this.pendingAudioEvents.push({
			id: `spatial-event-${this.audioSequence}`,
			atMs: this.elapsedMs,
			kind,
			category,
			priority,
			emitterId,
			x: emitter.x,
			z: emitter.z,
			vx: emitter.vx ?? 0,
			vz: emitter.vz ?? 0
		});
	}

	private edgeLabel(edge: SpatialEdge): string {
		return edge.archetype
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	private contactLabel(entity: SpatialEntity): string {
		switch (entity.kind) {
			case 'human':
				return 'An awkward mutual side-step slowed both walkers.';
			case 'motorbike':
				return 'A motorbike claimed supplementary road space.';
			case 'car':
				return 'A car required the wider road and most of your attention.';
			case 'cow':
				return 'The cow remains blameless.';
			case 'dog':
				return 'A sleeping dog revised its position.';
			case 'delivery-obstruction':
				return 'The temporary obstruction remained physical, not permanent.';
			default:
				return `Brushed past a ${entity.kind}.`;
		}
	}
}
