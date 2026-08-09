import type { FoodKind, FoodState } from './food';
import type { GameSettings } from './settings';
import type { PlayerMetrics } from './metrics';
import type { RunStats, ScoreResult } from './scoring';
import type { InputCommand } from './input';

export type RuntimePhase =
	| 'loading'
	| 'title'
	| 'tutorial'
	| 'playing'
	| 'paused'
	| 'won'
	| 'lost'
	| 'restarting'
	| 'error';

export type WeatherState = 'dry' | 'rain' | 'post-rain';
export type EntityKind =
	| 'pothole'
	| 'drain'
	| 'dog'
	| 'cow'
	| 'rickshaw'
	| 'motorbike'
	| 'pedestrian'
	| 'hawker'
	| 'debris'
	| 'food'
	| 'warning';

export type PedestrianArchetype =
	| 'phone-stop'
	| 'phone-walker'
	| 'diagonal'
	| 'family'
	| 'elderly'
	| 'commuter'
	| 'school-group'
	| 'large-bags'
	| 'conversation'
	| 'same-side'
	| 'reverser'
	| 'umbrella';

export type EntityState =
	| 'idle'
	| 'moving'
	| 'sleeping'
	| 'awake'
	| 'chasing'
	| 'warning'
	| 'leaving'
	| 'yielding';

export interface StreetEntity {
	id: string;
	kind: EntityKind;
	subtype?: PedestrianArchetype | FoodKind | string;
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	width?: number;
	height?: number;
	rotation: number;
	state: EntityState;
	stateTimer: number;
	age: number;
	active: boolean;
	solid: boolean;
	dangerous: boolean;
	wet?: boolean;
	hidden?: boolean;
	triggered?: boolean;
	consumed?: boolean;
	yieldTimer?: number;
	phase?: number;
	color?: string;
	lane?: number;
}

export interface PlayerRuntime {
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	facing: number;
	dashing: boolean;
	dashCooldown: number;
	stumbleTimer: number;
	controlImpairmentTimer: number;
	slowdownTimer: number;
	muddyShoe: boolean;
}

export interface GameCounters {
	collisions: number;
	nearMisses: number;
	snacksConsumed: number;
	cowsOffended: number;
	dogsAwakened: number;
	potholesEntered: number;
	narrowGaps: number;
	recklessDashes: number;
	drainsEntered?: number;
	longestStretch: number;
	currentStretch: number;
	collisionFreeSections: number;
	usefulSnacks: number;
	teaStops?: number;
	turnArounds?: number;
	waits?: number;
}

export interface RouteTracePoint {
	x: number;
	z: number;
	atMs: number;
	kind?: 'walk' | 'tea' | 'food' | 'turn-around' | 'incident';
	label?: string;
}

export interface RouteSummarySnapshot {
	points: readonly (RouteTracePoint & { edgeId?: string; heading?: number })[];
	annotations: readonly {
		id: string;
		kind: string;
		atMs: number;
		label: string;
		x: number;
		z: number;
		edgeId?: string;
	}[];
	visitedEdgeIds: readonly string[];
	distanceM: number;
	shortestDistanceM: number;
	detourDistanceM: number;
	turns: number;
	turnArounds: number;
	stops: number;
	teaStops: number;
}

export interface HudSnapshot {
	phase: RuntimePhase;
	stamina: number;
	morale: number;
	reflex: number;
	distance: number;
	distanceMetres: number;
	zone: string;
	weather: WeatherState;
	elapsedMs: number;
	score: number;
	warning: string;
	tutorialCue: string;
	reaction: string;
	foodEffect: string;
	seed: string;
	dashReady: boolean;
	pausedByVisibility: boolean;
	destinationMetres?: number;
	streetName?: string;
	interactionPrompt?: string;
	visualCue?: string;
	highContrastWarnings?: boolean;
	walkingAutomatically?: boolean;
	visitedEdges?: readonly string[];
	playerMapPosition?: { x: number; z: number; heading: number };
}

export interface RunResult {
	won: boolean;
	reason: string;
	message: string;
	seed: string;
	elapsedMs: number;
	distanceMetres: number;
	counters: GameCounters;
	metrics: PlayerMetrics;
	food: FoodState;
	score: ScoreResult;
	rating: string;
	route?: readonly RouteTracePoint[];
	routeSummary?: RouteSummarySnapshot;
	destination?: { x: number; z: number; label: string };
}

export interface StoredRunRecord {
	version: 2;
	bestScore: number;
	fastestCompletionMs: number | null;
	recent: Array<{
		seed: string;
		won: boolean;
		score: number;
		elapsedMs: number;
		at: string;
		route?: RouteTracePoint[];
	}>;
}

export interface EngineCallbacks {
	onReady(): void;
	onHud(snapshot: HudSnapshot): void;
	onPhase(phase: RuntimePhase): void;
	onResult(result: RunResult): void;
	onError(message: string): void;
	onCommand(command: InputCommand): void;
}

export interface EngineOptions {
	seed: string;
	settings: GameSettings;
	tutorial: boolean;
	previousFailedRuns?: number;
	callbacks: EngineCallbacks;
}

export interface EnginePublicApi {
	start(seed: string, tutorial: boolean): void;
	restart(seed: string, tutorial: boolean, previousFailedRuns?: number): void;
	pause(byVisibility?: boolean): void;
	resume(): void;
	enableAudioFromGesture(): Promise<boolean>;
	setSettings(settings: GameSettings): void;
	setTouchVector(x: number, y: number): void;
	setTouchDash(pressed: boolean): void;
	setWalkTarget(clientX: number, clientY: number): void;
	stopWalking(): void;
	turnAround(): void;
	interact(): void;
	setLookOffset(deltaX: number, deltaY: number, active: boolean): void;
	destroy(): void;
}

export function runStatsFromRuntime(
	player: PlayerRuntime,
	metrics: PlayerMetrics,
	counters: GameCounters,
	elapsedMs: number,
	destinationDistance: number,
	won: boolean,
	retreatDistance: number
): RunStats {
	return {
		forwardDistance: Math.max(0, metrics.distance),
		retreatDistance,
		destinationDistance,
		elapsedMs,
		won,
		finalMorale: metrics.morale,
		nearMisses: counters.nearMisses,
		narrowGaps: counters.narrowGaps,
		usefulSnacks: counters.usefulSnacks,
		collisions: counters.collisions,
		recklessDashes: counters.recklessDashes,
		potholesEntered: counters.potholesEntered,
		dogsAwakened: counters.dogsAwakened,
		cowsOffended: counters.cowsOffended,
		collisionFreeSections: counters.collisionFreeSections
	};
}
