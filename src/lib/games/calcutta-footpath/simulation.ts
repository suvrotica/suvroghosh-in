import type { GameSound } from './audio';
import {
	createCollisionState,
	resolveCollision,
	type CollisionSeverity,
	type CollisionState
} from './collision';
import {
	createDirectorObservation,
	createDirectorState,
	updateDirector,
	type DirectorState
} from './director';
import { checkRouteFairness, createPlayerSpawnExclusion, checkSpawnAllowed } from './fairness';
import {
	consumeFood,
	createFoodState,
	expireFoodEffects,
	getFoodModifiers,
	type FoodKind,
	type FoodState
} from './food';
import {
	CIVIC_RATINGS,
	FOOD_MESSAGES,
	GAME_OVER_MESSAGES,
	GHUGNI_MESSAGES,
	PEDESTRIAN_ARCHETYPES,
	REACTIONS,
	TUTORIAL_CUES,
	WORLD,
	ZONES,
	type LossContext
} from './game-data';
import {
	advanceMetrics,
	applyMetricDelta,
	createPlayerMetrics,
	type PlayerMetrics
} from './metrics';
import { createRandomStreams, type RandomStreams } from './random';
import { calculateScore } from './scoring';
import type { GameSettings } from './settings';
import type {
	GameCounters,
	HudSnapshot,
	PedestrianArchetype,
	PlayerRuntime,
	RunResult,
	RuntimePhase,
	StreetEntity,
	WeatherState
} from './runtime-types';
import { runStatsFromRuntime } from './runtime-types';

export interface SimulationInput {
	x: number;
	y: number;
	dash: boolean;
	source: 'keyboard' | 'touch' | 'gamepad';
}

export interface SimulationUpdate {
	sounds: GameSound[];
	ended: { won: boolean; context: LossContext; reason: string } | null;
	tutorialCue: string;
}

const EMPTY_COUNTERS: Readonly<GameCounters> = {
	collisions: 0,
	nearMisses: 0,
	snacksConsumed: 0,
	cowsOffended: 0,
	dogsAwakened: 0,
	potholesEntered: 0,
	narrowGaps: 0,
	recklessDashes: 0,
	longestStretch: 0,
	currentStretch: 0,
	collisionFreeSections: 0,
	usefulSnacks: 0
};

const FOOD_ORDER: readonly FoodKind[] = ['fuchka', 'mishti', 'tea', 'ghugni'];
const PEDESTRIAN_COLORS = ['#315e67', '#8f493d', '#ba7d42', '#536a49', '#6a536e', '#8b6950'];

function circleDistance(left: { x: number; y: number }, right: { x: number; y: number }): number {
	return Math.hypot(left.x - right.x, left.y - right.y);
}

function collisionRadius(entity: StreetEntity): number {
	return entity.radius * (entity.state === 'yielding' ? 0.55 : 1);
}

function severityFor(entity: StreetEntity): CollisionSeverity {
	switch (entity.kind) {
		case 'motorbike':
		case 'drain':
			return 'decisive';
		case 'cow':
			return 'severe';
		case 'rickshaw':
		case 'dog':
		case 'debris':
			return 'moderate';
		case 'pothole':
			return entity.wet && entity.phase && entity.phase > 0.68 ? 'moderate' : 'minor';
		default:
			return 'minor';
	}
}

function lossContextFor(entity: StreetEntity): LossContext {
	return entity.kind;
}

function reactionForKind(kind: StreetEntity['kind'], fallback: string): string {
	switch (kind) {
		case 'cow':
			return 'The bystanders agree that this was your fault.';
		case 'motorbike':
			return 'Dada, horn shonen na?';
		case 'dog':
			return 'The dog has filed an objection.';
		case 'hawker':
			return 'Ektu side, customer ashbe.';
		case 'pothole':
			return 'Shoe status: administratively muddy.';
		default:
			return fallback;
	}
}

export class StreetSimulation {
	readonly seed: string;
	readonly player: PlayerRuntime;
	readonly entities: StreetEntity[] = [];
	metrics: PlayerMetrics;
	food: FoodState;
	counters: GameCounters;
	weather: WeatherState = 'dry';
	elapsedMs = 0;
	retreatDistance = 0;
	lastWarning = '';
	lastReaction = '';
	lastFoodEffect = '';
	tutorialCue = '';
	cameraShake = 0;
	nearMissPulse = 0;
	splashVeil = 0;
	private settings: GameSettings;
	private streams: RandomStreams;
	private collision: CollisionState;
	private director: DirectorState;
	private previousFailedRuns: number;
	private entitySequence = 0;
	private safeLanes: number[] = [];
	private lastCollisionX: number = WORLD.startX;
	private lastZoneIndex = 0;
	private nextVehicleAtMs = 4_000;
	private nextAmbientAtMs = 2_500;
	private lastDirectorAtMs = 0;
	private lastHudWarningAtMs = 0;
	private lastFoodAtMs = 0;
	private lastHazardAtMs = 0;
	private recentCollisionTimes: number[] = [];
	private warningUntilMs = 0;
	private reactionUntilMs = 0;
	private foodMessageUntilMs = 0;
	private tutorialCueUntilMs = 0;
	private tutorialIndex = 0;
	private pressure = 0.82;
	private warningTimeMultiplier = 1;
	private foodSpawnMultiplier = 1;
	private weatherChanged = false;
	private ended = false;
	private dashWasPressed = false;
	private dashTimer = 0;
	private lastDashAtMs = -Infinity;
	private insideNarrowGap = false;
	private nextAssistedFoodAtX = WORLD.startX + 2_100;

	constructor(seed: string, settings: GameSettings, previousFailedRuns = 0) {
		this.seed = seed;
		this.settings = { ...settings };
		this.previousFailedRuns = Math.max(0, previousFailedRuns);
		this.foodSpawnMultiplier = 1 + Math.min(4, this.previousFailedRuns) * 0.04;
		this.nextAssistedFoodAtX = WORLD.startX + Math.max(900, 2_100 - this.previousFailedRuns * 250);
		this.streams = createRandomStreams(seed);
		this.player = {
			x: WORLD.startX,
			y: WORLD.laneY[2],
			vx: 0,
			vy: 0,
			radius: 17,
			facing: 0,
			dashing: false,
			dashCooldown: 0,
			stumbleTimer: 0,
			controlImpairmentTimer: 0,
			slowdownTimer: 0,
			muddyShoe: false
		};
		this.metrics = createPlayerMetrics();
		this.food = createFoodState(this.metrics);
		this.counters = { ...EMPTY_COUNTERS };
		this.collision = createCollisionState();
		this.director = createDirectorState();
		this.generateStreet();
	}

	setSettings(settings: GameSettings): void {
		this.settings = { ...settings };
	}

	private id(kind: StreetEntity['kind']): string {
		this.entitySequence += 1;
		return `${kind}-${this.entitySequence}`;
	}

	private add(entity: Omit<StreetEntity, 'id' | 'age' | 'active'>): StreetEntity {
		const created: StreetEntity = {
			...entity,
			id: this.id(entity.kind),
			age: 0,
			active: true
		};
		this.entities.push(created);
		return created;
	}

	private zoneAt(x: number) {
		return ZONES.find((zone) => x >= zone.start && x < zone.end) ?? ZONES.at(-1)!;
	}

	get zone() {
		return this.zoneAt(this.player.x);
	}

	get progress(): number {
		return Math.max(
			0,
			Math.min(1, (this.player.x - WORLD.startX) / (WORLD.destinationX - WORLD.startX))
		);
	}

	private generateStreet(): void {
		const chunks = Math.ceil(WORLD.destinationX / 310);
		let safeLane = 2;
		for (let chunk = 0; chunk < chunks; chunk += 1) {
			if (chunk > 0 && this.streams.environment.chance(0.48)) {
				safeLane = Math.max(
					0,
					Math.min(WORLD.laneY.length - 1, safeLane + this.streams.environment.pick([-1, 1]))
				);
			}
			this.safeLanes[chunk] = safeLane;
			const x = 500 + chunk * 310 + this.streams.environment.range(-58, 58);
			const zone = this.zoneAt(x);
			const blockedLanes = this.streams.environment
				.shuffle(WORLD.laneY.map((_, index) => index).filter((lane) => lane !== safeLane))
				.slice(0, this.streams.environment.chance(zone.density * 0.42) ? 2 : 1);

			for (const lane of blockedLanes) {
				const roll = this.streams.environment.next();
				if (roll < 0.34) this.spawnPothole(x, lane);
				else if (roll < 0.48) this.spawnDebris(x, lane);
				else if (roll < 0.64 && chunk > 3) this.spawnHawker(x, lane);
				else if (roll < 0.78 && chunk > 4) this.spawnCow(x, lane);
				else if (roll < 0.88 && chunk > 2) this.spawnDog(x, lane);
				else this.spawnPedestrian(x, lane);
			}

			const pedestrianCount = Math.min(
				4,
				Math.max(1, Math.round(zone.density * this.streams.pedestrians.range(1.2, 2.8)))
			);
			for (let index = 0; index < pedestrianCount; index += 1) {
				const lane = this.streams.pedestrians.integer(0, WORLD.laneY.length - 1);
				this.spawnPedestrian(x + this.streams.pedestrians.range(-130, 150), lane);
			}

			if (chunk > 5 && chunk % 7 === 0) {
				this.spawnRickshaw(x + 90, this.streams.vehicles.integer(1, 4));
			}
			if (chunk > 2 && chunk % 9 === 0) {
				const edgeLane = this.streams.environment.pick([0, 4]);
				this.spawnDrain(x + 55, edgeLane);
			}
		}

		for (let x = 1_100, index = 0; x < WORLD.destinationX - 700; x += 1_550, index += 1) {
			const food = FOOD_ORDER[index % FOOD_ORDER.length];
			const lane = index % 2 === 0 ? 0 : 4;
			this.spawnFood(x + this.streams.food.range(-120, 120), lane, food);
		}
		// The tea-stall zone contains an extra glass, making the third-tea jitter mechanic reachable.
		this.spawnFood(6_640 + this.streams.food.range(-70, 70), 4, 'tea');

		// A readable destination gate and a clear arrival pocket.
		for (const entity of this.entities) {
			if (entity.x > WORLD.destinationX - 260) entity.active = false;
		}
	}

	private spawnPothole(x: number, lane: number): void {
		const radius = this.streams.environment.range(22, 48);
		this.add({
			kind: 'pothole',
			x,
			y: WORLD.laneY[lane] + this.streams.environment.range(-18, 18),
			vx: 0,
			vy: 0,
			radius,
			width: radius * 2.25,
			height: radius * 1.2,
			rotation: this.streams.cosmetics.range(-0.3, 0.3),
			state: 'idle',
			stateTimer: 0,
			solid: false,
			dangerous: true,
			wet: false,
			hidden: this.streams.environment.chance(0.25),
			phase: this.streams.environment.next(),
			lane
		});
	}

	private spawnDrain(x: number, lane: number): void {
		const atTop = lane === 0;
		this.add({
			kind: 'drain',
			x,
			y: atTop ? WORLD.minY + 9 : WORLD.maxY - 8,
			vx: 0,
			vy: 0,
			radius: 48,
			width: this.streams.environment.range(90, 145),
			height: 33,
			rotation: this.streams.cosmetics.range(-0.08, 0.08),
			state: 'idle',
			stateTimer: 0,
			solid: false,
			dangerous: true,
			hidden: this.streams.environment.chance(0.35),
			phase: this.streams.environment.next(),
			lane
		});
	}

	private spawnDog(x: number, lane: number): void {
		this.add({
			kind: 'dog',
			x,
			y: WORLD.laneY[lane] + this.streams.animals.range(-20, 20),
			vx: 0,
			vy: 0,
			radius: 25,
			width: 57,
			height: 30,
			rotation: this.streams.animals.range(-0.3, 0.3),
			state: 'sleeping',
			stateTimer: this.streams.animals.range(3, 9),
			solid: true,
			dangerous: true,
			phase: this.streams.animals.next(),
			color: this.streams.animals.pick(['#8a603d', '#5e4938', '#b47b4c']),
			lane
		});
	}

	private spawnCow(x: number, lane: number): void {
		this.add({
			kind: 'cow',
			x,
			y: WORLD.laneY[lane],
			vx: this.streams.animals.range(-5, 7),
			vy: this.streams.animals.range(-2, 2),
			radius: 49,
			width: 112,
			height: 66,
			rotation: this.streams.animals.range(-0.28, 0.28),
			state: 'idle',
			stateTimer: this.streams.animals.range(2, 8),
			solid: true,
			dangerous: true,
			phase: this.streams.animals.next(),
			color: this.streams.animals.pick(['#d6c7a2', '#b99c77', '#ddd2b6']),
			lane
		});
	}

	private spawnRickshaw(x: number, lane: number): void {
		this.add({
			kind: 'rickshaw',
			x,
			y: WORLD.laneY[lane],
			vx: this.streams.vehicles.pick([-1, 1]) * this.streams.vehicles.range(24, 39),
			vy: this.streams.vehicles.range(-5, 5),
			radius: 42,
			width: 105,
			height: 62,
			rotation: 0,
			state: 'moving',
			stateTimer: this.streams.vehicles.range(2.5, 6),
			solid: true,
			dangerous: true,
			phase: this.streams.vehicles.next(),
			color: this.streams.vehicles.pick(['#38656b', '#8c4938', '#547449']),
			lane
		});
	}

	private spawnPedestrian(x: number, lane: number): void {
		const subtype = this.streams.pedestrians.pick(PEDESTRIAN_ARCHETYPES);
		const direction = this.streams.pedestrians.pick([-1, 1]);
		const speed =
			subtype === 'elderly'
				? this.streams.pedestrians.range(12, 20)
				: subtype === 'commuter'
					? this.streams.pedestrians.range(48, 66)
					: this.streams.pedestrians.range(24, 42);
		const radius =
			subtype === 'family' || subtype === 'conversation' ? 37 : subtype === 'large-bags' ? 31 : 20;
		this.add({
			kind: 'pedestrian',
			subtype,
			x,
			y: WORLD.laneY[lane] + this.streams.pedestrians.range(-27, 27),
			vx: direction * speed,
			vy: subtype === 'diagonal' ? this.streams.pedestrians.range(-18, 18) : 0,
			radius,
			width: radius * 1.3,
			height: radius * 2.15,
			rotation: 0,
			state: 'moving',
			stateTimer: this.streams.pedestrians.range(1.4, 6),
			solid: true,
			dangerous: false,
			phase: this.streams.pedestrians.next(),
			color: this.streams.pedestrians.pick(PEDESTRIAN_COLORS),
			lane
		});
	}

	private spawnHawker(x: number, lane: number): void {
		const edgeLane = lane <= 1 ? 0 : 4;
		this.add({
			kind: 'hawker',
			x,
			y: WORLD.laneY[edgeLane],
			vx: 0,
			vy: 0,
			radius: 45,
			width: 108,
			height: 72,
			rotation: this.streams.environment.range(-0.08, 0.08),
			state: 'idle',
			stateTimer: this.streams.environment.range(2, 7),
			solid: true,
			dangerous: false,
			phase: this.streams.environment.next(),
			color: this.streams.environment.pick(['#b76d39', '#3f6d68', '#7d4d42']),
			lane: edgeLane
		});
	}

	private spawnDebris(x: number, lane: number): void {
		this.add({
			kind: 'debris',
			subtype: this.streams.environment.pick(['bricks', 'sand', 'bamboo', 'boards', 'cables']),
			x,
			y: WORLD.laneY[lane],
			vx: 0,
			vy: 0,
			radius: this.streams.environment.range(26, 45),
			width: this.streams.environment.range(70, 115),
			height: this.streams.environment.range(34, 64),
			rotation: this.streams.environment.range(-0.3, 0.3),
			state: 'idle',
			stateTimer: 0,
			solid: true,
			dangerous: true,
			phase: this.streams.environment.next(),
			color: '#a1784e',
			lane
		});
	}

	private spawnFood(x: number, lane: number, food: FoodKind): void {
		this.add({
			kind: 'food',
			subtype: food,
			x,
			y: lane === 0 ? WORLD.minY + 22 : WORLD.maxY - 23,
			vx: 0,
			vy: 0,
			radius: 42,
			width: 96,
			height: 75,
			rotation: 0,
			state: 'idle',
			stateTimer: 0,
			solid: false,
			dangerous: false,
			phase: this.streams.food.next(),
			color:
				food === 'tea'
					? '#b25f32'
					: food === 'fuchka'
						? '#c4933f'
						: food === 'mishti'
							? '#ddad5e'
							: '#8a6137',
			lane
		});
	}

	private spawnMotorbike(sounds: GameSound[]): void {
		let inactiveKept = 0;
		for (let index = this.entities.length - 1; index >= 0; index -= 1) {
			const entity = this.entities[index];
			if (entity.kind !== 'motorbike' || entity.active) continue;
			inactiveKept += 1;
			if (inactiveKept > 2) this.entities.splice(index, 1);
		}
		const activeMotorbikes = this.entities.filter(
			(entity) => entity.active && entity.kind === 'motorbike'
		).length;
		if (activeMotorbikes >= 2) return;
		const fromBehind = this.streams.vehicles.chance(0.52);
		const x = this.player.x + (fromBehind ? -760 : 880);
		const y = WORLD.laneY[this.streams.vehicles.integer(1, 4)];
		const exclusion = createPlayerSpawnExclusion(this.player, 'high-speed-vehicle');
		if (
			!checkSpawnAllowed({ x, y, radius: 34 }, [exclusion], {
				x: 0,
				y: WORLD.minY,
				width: WORLD.width,
				height: WORLD.maxY - WORLD.minY
			}).allowed
		) {
			return;
		}
		const foodWarningMultiplier = getFoodModifiers(this.food, this.elapsedMs).warningTimeMultiplier;
		const warningDuration =
			(0.72 + this.previousFailedRuns * 0.04) * this.warningTimeMultiplier * foodWarningMultiplier;
		this.add({
			kind: 'motorbike',
			x,
			y,
			vx: fromBehind
				? this.streams.vehicles.range(260, 330)
				: -this.streams.vehicles.range(235, 300),
			vy: this.streams.vehicles.range(-5, 5),
			radius: 31,
			width: 86,
			height: 48,
			rotation: 0,
			state: 'warning',
			stateTimer: warningDuration,
			solid: false,
			dangerous: true,
			phase: fromBehind ? 1 : -1,
			color: this.streams.vehicles.pick(['#b13f30', '#d09a35', '#356d73']),
			lane: WORLD.laneY.findIndex((laneY) => laneY === y)
		});
		this.showWarning(
			fromBehind
				? 'HORN — pavement traffic approaching from behind'
				: 'HEADLIGHT — impossible direction',
			warningDuration * 1_000
		);
		sounds.push('horn');
		for (const dog of this.entities) {
			if (
				dog.active &&
				dog.kind === 'dog' &&
				dog.state === 'sleeping' &&
				Math.abs(dog.x - this.player.x) < 520
			) {
				dog.state = 'awake';
				dog.stateTimer = 0.45;
				dog.triggered = true;
				this.counters.dogsAwakened += 1;
			}
		}
		this.lastHazardAtMs = this.elapsedMs;
	}

	private showWarning(message: string, durationMs = 1_200): void {
		this.lastWarning = message;
		this.warningUntilMs = this.elapsedMs + durationMs;
		this.lastHudWarningAtMs = this.elapsedMs;
	}

	private showReaction(message: string, durationMs = 1_650): void {
		this.lastReaction = message;
		this.reactionUntilMs = this.elapsedMs + durationMs;
	}

	private showFood(message: string, durationMs = 2_600): void {
		this.lastFoodEffect = message;
		this.foodMessageUntilMs = this.elapsedMs + durationMs;
	}

	private updateWeather(sounds: GameSound[]): void {
		const rainStart = 0.47 + (this.streams.weather.getState() % 7) * 0.004;
		const postRainStart = 0.76;
		const next: WeatherState =
			this.progress >= postRainStart ? 'post-rain' : this.progress >= rainStart ? 'rain' : 'dry';
		if (next !== this.weather) {
			this.weather = next;
			this.weatherChanged = true;
			if (next === 'rain') {
				this.showWarning('SUDDEN RAIN — umbrellas have expanded their jurisdiction', 2_600);
				sounds.push('rain-start');
			} else if (next === 'post-rain') {
				this.showWarning('RAIN EASED — pothole depth remains confidential', 2_100);
			}
		}
		if (this.weatherChanged) {
			for (const entity of this.entities) {
				if (entity.kind === 'pothole') entity.wet = next !== 'dry';
			}
			this.weatherChanged = false;
		}
	}

	private updatePlayer(deltaSeconds: number, input: SimulationInput): void {
		const modifiers = getFoodModifiers(this.food, this.elapsedMs);
		let inputX = input.x;
		let inputY = input.y;
		if (modifiers.reversedControls) {
			inputX *= -1;
			inputY *= -1;
		}
		if (modifiers.fineControlMultiplier < 0.9) {
			const jitter = Math.sin(this.elapsedMs * 0.019) * (1 - modifiers.fineControlMultiplier) * 0.5;
			inputY += jitter;
		}
		const inputLength = Math.hypot(inputX, inputY);
		if (inputLength > 1) {
			inputX /= inputLength;
			inputY /= inputLength;
		}

		this.player.dashCooldown = Math.max(0, this.player.dashCooldown - deltaSeconds);
		this.dashTimer = Math.max(0, this.dashTimer - deltaSeconds);
		this.player.stumbleTimer = Math.max(0, this.player.stumbleTimer - deltaSeconds);
		this.player.controlImpairmentTimer = Math.max(
			0,
			this.player.controlImpairmentTimer - deltaSeconds
		);
		this.player.slowdownTimer = Math.max(0, this.player.slowdownTimer - deltaSeconds);

		const dashRequested = input.dash && inputLength > 0.1;
		const canDash =
			dashRequested &&
			!this.dashWasPressed &&
			this.player.dashCooldown <= 0 &&
			this.metrics.stamina > 7 &&
			this.player.stumbleTimer <= 0;
		if (canDash) {
			this.player.dashCooldown = 1.05;
			this.dashTimer = 0.23;
			if (
				this.elapsedMs - this.lastDashAtMs < 2_400 ||
				(this.counters.collisions > 0 && this.player.x - this.lastCollisionX < 180)
			) {
				this.counters.recklessDashes += 1;
			}
			this.lastDashAtMs = this.elapsedMs;
		}
		this.player.dashing = this.dashTimer > 0 && inputLength > 0.1;
		this.dashWasPressed = input.dash;

		let speed = 88 * modifiers.speedMultiplier;
		if (this.player.dashing) speed *= 1.68;
		if (this.metrics.stamina < 22) speed *= 0.68 + this.metrics.stamina / 70;
		if (this.player.slowdownTimer > 0) speed *= 0.48;
		if (this.player.stumbleTimer > 0) speed *= 0.18;
		if (this.player.controlImpairmentTimer > 0) {
			inputX *= 0.66;
			inputY *= -0.32;
		}

		const rainInertia = this.weather === 'rain' ? 0.72 : 1;
		const responsiveness =
			(6.2 * modifiers.responsivenessMultiplier * rainInertia) / (this.player.dashing ? 1.25 : 1);
		const targetVx = inputX * speed;
		const targetVy = inputY * speed;
		const blend = Math.min(1, responsiveness * deltaSeconds);
		this.player.vx += (targetVx - this.player.vx) * blend;
		this.player.vy += (targetVy - this.player.vy) * blend;
		if (inputLength < 0.08) {
			const friction = Math.pow(this.weather === 'rain' ? 0.94 : 0.86, deltaSeconds * 60);
			this.player.vx *= friction;
			this.player.vy *= friction;
		}

		const previousX = this.player.x;
		this.player.x += this.player.vx * deltaSeconds;
		this.player.y += this.player.vy * deltaSeconds;
		this.player.x = Math.max(34, Math.min(WORLD.destinationX + 80, this.player.x));
		this.player.y = Math.max(WORLD.minY + 9, Math.min(WORLD.maxY - 8, this.player.y));
		if (Math.hypot(this.player.vx, this.player.vy) > 4) {
			this.player.facing = Math.atan2(this.player.vy, this.player.vx);
		}

		const forwardDelta = this.player.x - previousX;
		if (forwardDelta < 0) this.retreatDistance += -forwardDelta;
		this.counters.currentStretch = Math.max(0, this.player.x - this.lastCollisionX);
		this.counters.longestStretch = Math.max(
			this.counters.longestStretch,
			this.counters.currentStretch
		);
		this.metrics = advanceMetrics(this.metrics, {
			deltaMs: deltaSeconds * 1_000,
			moving: inputLength > 0.08,
			dashing: this.player.dashing,
			squeezing: this.player.dashing && inputLength > 0.08,
			weather: this.weather,
			heatIntensity: this.weather === 'dry' ? 0.82 : 0.25,
			staminaDrainMultiplier: modifiers.staminaDrainMultiplier
		});
		this.metrics = { ...this.metrics, distance: Math.max(0, this.player.x - WORLD.startX) };
		this.food = { ...this.food, metrics: this.metrics };
	}

	private updatePedestrian(
		entity: StreetEntity,
		deltaSeconds: number,
		nearbyAgents: readonly StreetEntity[]
	): void {
		const subtype = entity.subtype as PedestrianArchetype;
		entity.stateTimer -= deltaSeconds;
		const umbrella = subtype === 'umbrella';
		entity.radius =
			umbrella && this.weather === 'rain'
				? 34
				: subtype === 'family' || subtype === 'conversation'
					? 37
					: subtype === 'large-bags'
						? 31
						: 20;

		if (entity.y <= WORLD.minY + 15 || entity.y >= WORLD.maxY - 15) entity.vy *= -1;
		if (entity.stateTimer <= 0) {
			switch (subtype) {
				case 'phone-stop':
					entity.state = entity.state === 'idle' ? 'moving' : 'idle';
					entity.stateTimer = entity.state === 'idle' ? 1.5 + entity.phase! * 2.4 : 2.5;
					break;
				case 'reverser':
					entity.vx *= -1;
					entity.stateTimer = 2.8 + entity.phase! * 3;
					break;
				case 'diagonal':
					entity.vy = this.streams.pedestrians.range(-20, 20);
					entity.stateTimer = 1.8;
					break;
				case 'conversation':
					entity.state = entity.state === 'idle' ? 'moving' : 'idle';
					entity.stateTimer = entity.state === 'idle' ? 3.2 : 1.8;
					break;
				default:
					if (this.streams.pedestrians.chance(0.34)) entity.vx *= -1;
					entity.stateTimer = this.streams.pedestrians.range(2.2, 6.4);
			}
		}

		if (
			subtype === 'same-side' &&
			entity.x > this.player.x &&
			entity.x - this.player.x < 180 &&
			Math.abs(entity.y - this.player.y) < 90
		) {
			entity.vy += Math.sign(this.player.vy || this.player.y - entity.y) * 15 * deltaSeconds;
		}

		let avoided = 0;
		for (const other of nearbyAgents) {
			if (
				other === entity ||
				!other.active ||
				!other.solid ||
				Math.abs(other.x - entity.x) > 58 ||
				Math.abs(other.y - entity.y) > 58
			) {
				continue;
			}
			const distance = Math.max(1, circleDistance(entity, other));
			const minimum = entity.radius + collisionRadius(other);
			if (distance < minimum * 1.35) {
				entity.vy += Math.sign(entity.y - other.y || entity.phase! - 0.5) * 18 * deltaSeconds;
				if (distance < minimum * 0.58 && this.streams.pedestrians.chance(0.018)) {
					entity.state = 'idle';
					entity.stateTimer = this.streams.pedestrians.range(0.35, 0.9);
				}
				avoided += 1;
				if (avoided >= 3) break;
			}
		}

		if (entity.state !== 'idle') {
			const weatherPace = this.weather === 'rain' ? (subtype === 'umbrella' ? 0.82 : 1.12) : 1;
			entity.x += entity.vx * deltaSeconds * weatherPace;
			entity.y += entity.vy * deltaSeconds * weatherPace;
		}
	}

	private updateDog(entity: StreetEntity, deltaSeconds: number, sounds: GameSound[]): void {
		const distance = circleDistance(entity, this.player);
		entity.stateTimer -= deltaSeconds;
		if (entity.state === 'sleeping') {
			const dashWake = this.player.dashing && distance < 112;
			const rainWake =
				this.weather === 'rain' && distance < 210 && this.streams.animals.chance(0.006);
			const randomPolicy = distance < 170 && this.streams.animals.chance(0.0012);
			if (dashWake || rainWake || randomPolicy) {
				entity.state = 'awake';
				entity.stateTimer = 0.65;
				entity.triggered = true;
				this.counters.dogsAwakened += 1;
				this.showWarning('BARK — random canine policy now in effect', 1_500);
				sounds.push('bark');
			}
		} else if (entity.state === 'awake' && entity.stateTimer <= 0) {
			entity.state = 'chasing';
			entity.stateTimer = 2.8 + entity.phase! * 2;
		} else if (entity.state === 'chasing') {
			const dx = this.player.x - entity.x;
			const dy = this.player.y - entity.y;
			const length = Math.max(1, Math.hypot(dx, dy));
			entity.vx += (dx / length) * 62 * deltaSeconds;
			entity.vy += (dy / length) * 62 * deltaSeconds;
			const speed = Math.max(1, Math.hypot(entity.vx, entity.vy));
			if (speed > 74) {
				entity.vx = (entity.vx / speed) * 74;
				entity.vy = (entity.vy / speed) * 74;
			}
			entity.x += entity.vx * deltaSeconds;
			entity.y += entity.vy * deltaSeconds;
			if (entity.stateTimer <= 0 || distance > 360) {
				entity.state = 'awake';
				entity.stateTimer = 2.5;
				entity.vx *= 0.15;
				entity.vy *= 0.15;
			}
		}
	}

	private updateCow(entity: StreetEntity, deltaSeconds: number): void {
		entity.stateTimer -= deltaSeconds;
		if (entity.yieldTimer && entity.yieldTimer > 0) {
			entity.state = 'yielding';
			entity.yieldTimer -= deltaSeconds;
			const targetY = entity.y < (WORLD.minY + WORLD.maxY) / 2 ? WORLD.minY + 18 : WORLD.maxY - 18;
			entity.y += Math.sign(targetY - entity.y) * 18 * deltaSeconds;
			return;
		}
		if (entity.state === 'yielding') entity.state = 'idle';
		if (entity.stateTimer <= 0) {
			entity.vx = this.streams.animals.range(-8, 10);
			entity.vy = this.streams.animals.range(-5, 5);
			entity.stateTimer = this.streams.animals.range(2, 7);
		}
		entity.rotation += this.streams.animals.range(-0.08, 0.08) * deltaSeconds;
		entity.x += entity.vx * deltaSeconds;
		entity.y = Math.max(
			WORLD.minY + 35,
			Math.min(WORLD.maxY - 35, entity.y + entity.vy * deltaSeconds)
		);
	}

	private updateVehicle(
		entity: StreetEntity,
		deltaSeconds: number,
		sounds: GameSound[],
		nearbyAgents: readonly StreetEntity[]
	): void {
		entity.stateTimer -= deltaSeconds;
		if (entity.kind === 'motorbike' && entity.state === 'warning') {
			if (entity.stateTimer <= 0) {
				entity.state = 'moving';
				entity.solid = true;
				entity.stateTimer = 4.5;
				sounds.push('warning');
			}
			return;
		}
		if (entity.kind === 'rickshaw' && entity.stateTimer <= 0) {
			entity.vx *= -this.streams.vehicles.range(0.72, 1.04);
			entity.vy = this.streams.vehicles.range(-14, 14);
			entity.stateTimer = this.streams.vehicles.range(2.3, 5.5);
			this.showWarning('RICKSHAW REVERSING — geometry larger than it appears', 1_100);
			sounds.push('bell');
		}
		const direction = Math.sign(entity.vx) || 1;
		const obstacle = nearbyAgents.find((other) => {
			if (
				other === entity ||
				!other.active ||
				!other.solid ||
				!['cow', 'pedestrian', 'rickshaw'].includes(other.kind)
			) {
				return false;
			}
			const ahead = (other.x - entity.x) * direction;
			return (
				ahead > 0 && ahead < 155 && Math.abs(other.y - entity.y) < other.radius + entity.radius
			);
		});
		if (obstacle) {
			const side = Math.sign(entity.y - obstacle.y || (entity.phase ?? 0.5) - 0.5) || 1;
			entity.vy += side * (entity.kind === 'motorbike' ? 94 : 46) * deltaSeconds;
			if (obstacle.kind === 'cow') entity.vx *= Math.max(0.72, 1 - deltaSeconds * 0.5);
		}
		if (entity.y <= WORLD.minY + 25 || entity.y >= WORLD.maxY - 25) entity.vy *= -1;
		const trafficPace = this.weather === 'rain' ? (entity.kind === 'motorbike' ? 0.88 : 0.76) : 1;
		if (this.weather === 'rain' && entity.kind === 'motorbike') {
			entity.vy += Math.sin(this.elapsedMs * 0.004 + entity.phase!) * deltaSeconds * 2.4;
		}
		entity.x += entity.vx * deltaSeconds * trafficPace;
		entity.y += entity.vy * deltaSeconds * trafficPace;
		entity.rotation = Math.atan2(entity.vy, entity.vx);
		if (
			entity.kind === 'motorbike' &&
			(entity.stateTimer <= 0 || Math.abs(entity.x - this.player.x) > 1_600)
		) {
			entity.active = false;
		}
	}

	private updateHawker(entity: StreetEntity, deltaSeconds: number): void {
		entity.stateTimer -= deltaSeconds;
		if (entity.yieldTimer && entity.yieldTimer > 0) {
			entity.yieldTimer -= deltaSeconds;
			entity.state = 'yielding';
			entity.radius += (30 - entity.radius) * Math.min(1, deltaSeconds * 3);
			return;
		}
		if (entity.state === 'yielding') entity.state = 'idle';
		if (entity.stateTimer <= 0) {
			entity.state = entity.state === 'idle' ? 'moving' : 'idle';
			entity.stateTimer = this.streams.environment.range(2.5, 6.5);
		}
		const stallCrowdMultiplier = getFoodModifiers(this.food, this.elapsedMs).stallCrowdMultiplier;
		const shelterMultiplier = this.weather === 'rain' ? 1.17 : 1;
		const targetRadius =
			(entity.state === 'moving' ? 62 : 44) * stallCrowdMultiplier * shelterMultiplier;
		entity.radius += (targetRadius - entity.radius) * Math.min(1, deltaSeconds * 0.7);
	}

	private updateEntities(deltaSeconds: number, sounds: GameSound[]): void {
		const nearbyAgents = this.entities.filter(
			(entity) =>
				entity.active && (Math.abs(entity.x - this.player.x) < 1_900 || entity.kind === 'motorbike')
		);
		for (const entity of nearbyAgents) {
			entity.age += deltaSeconds;
			if (entity.yieldTimer && entity.kind !== 'cow' && entity.kind !== 'hawker') {
				entity.yieldTimer = Math.max(0, entity.yieldTimer - deltaSeconds);
				if (entity.yieldTimer > 0) {
					entity.state = 'yielding';
					entity.y +=
						Math.sign(entity.y < this.player.y ? WORLD.minY - entity.y : WORLD.maxY - entity.y) *
						42 *
						deltaSeconds;
					continue;
				}
				if (entity.state === 'yielding') entity.state = 'moving';
			}
			switch (entity.kind) {
				case 'pedestrian':
					this.updatePedestrian(entity, deltaSeconds, nearbyAgents);
					break;
				case 'dog':
					this.updateDog(entity, deltaSeconds, sounds);
					break;
				case 'cow':
					this.updateCow(entity, deltaSeconds);
					break;
				case 'rickshaw':
				case 'motorbike':
					this.updateVehicle(entity, deltaSeconds, sounds, nearbyAgents);
					break;
				case 'hawker':
					this.updateHawker(entity, deltaSeconds);
					break;
			}
		}
	}

	private updateNarrowGapCounter(): void {
		let upperEdge = -Infinity;
		let lowerEdge = Infinity;
		for (const entity of this.entities) {
			if (
				!entity.active ||
				!entity.solid ||
				entity.state === 'warning' ||
				entity.state === 'yielding' ||
				Math.abs(entity.x - this.player.x) > 54
			) {
				continue;
			}
			const radius = collisionRadius(entity);
			if (entity.y <= this.player.y) upperEdge = Math.max(upperEdge, entity.y + radius);
			else lowerEdge = Math.min(lowerEdge, entity.y - radius);
		}
		const gapWidth = lowerEdge - upperEdge;
		const narrow =
			Number.isFinite(gapWidth) &&
			gapWidth >= this.player.radius * 2 - 2 &&
			gapWidth <= this.player.radius * 2 + 46;
		if (narrow && !this.insideNarrowGap) this.counters.narrowGaps += 1;
		this.insideNarrowGap = narrow;
	}

	private maybeSpawnAssistedFood(): void {
		if (this.player.x < this.nextAssistedFoodAtX) return;
		const spacing = Math.max(1_900, 3_600 / Math.max(1, this.foodSpawnMultiplier));
		this.nextAssistedFoodAtX += spacing;
		if (this.player.x > WORLD.destinationX - 950) return;

		const existingStallAhead = this.entities.some(
			(entity) =>
				entity.active &&
				entity.kind === 'food' &&
				!entity.consumed &&
				entity.x > this.player.x + 120 &&
				entity.x < this.player.x + 760
		);
		const assistanceNeeded =
			this.foodSpawnMultiplier > 1.015 || this.metrics.stamina < 58 || this.metrics.morale < 55;
		if (existingStallAhead || !assistanceNeeded) return;

		const kind: FoodKind =
			this.metrics.stamina < 58
				? 'fuchka'
				: this.metrics.morale < 55
					? 'mishti'
					: this.streams.food.pick(FOOD_ORDER);
		const lane = this.streams.food.chance(0.5) ? 0 : 4;
		this.spawnFood(this.player.x + this.streams.food.range(420, 570), lane, kind);
	}

	private consumeNearbyFood(sounds: GameSound[]): void {
		for (const entity of this.entities) {
			if (
				!entity.active ||
				entity.kind !== 'food' ||
				entity.consumed ||
				circleDistance(entity, this.player) > entity.radius + this.player.radius + 8
			) {
				continue;
			}
			const kind = entity.subtype as FoodKind;
			const beforeStamina = this.metrics.stamina;
			const beforeMorale = this.metrics.morale;
			const result = consumeFood(this.food, kind, this.elapsedMs, this.streams.food);
			this.food = result.state;
			this.metrics = result.state.metrics;
			entity.consumed = true;
			entity.state = 'leaving';
			this.counters.snacksConsumed += 1;
			if (this.metrics.stamina > beforeStamina || this.metrics.morale > beforeMorale) {
				this.counters.usefulSnacks += 1;
			}
			this.lastFoodAtMs = this.elapsedMs;
			const outcomeMessage = result.outcome ? GHUGNI_MESSAGES[result.outcome] : '';
			this.showFood(
				outcomeMessage ? `${FOOD_MESSAGES[kind]} ${outcomeMessage}` : FOOD_MESSAGES[kind],
				3_200
			);
			sounds.push(kind === 'tea' ? 'tea' : 'snack');
			if (result.events.includes('wake-nearby-dogs')) {
				for (const dog of this.entities) {
					if (
						dog.kind === 'dog' &&
						dog.state === 'sleeping' &&
						circleDistance(dog, this.player) < 390
					) {
						dog.state = 'awake';
						dog.stateTimer = 0.35;
						dog.triggered = true;
						this.counters.dogsAwakened += 1;
					}
				}
				sounds.push('bark');
			}
			if (result.events.includes('ominous-sting')) sounds.push('ominous');
		}
	}

	private collisionWith(entity: StreetEntity, sounds: GameSound[]): SimulationUpdate['ended'] {
		const resolution = resolveCollision(this.collision, {
			atMs: this.elapsedMs,
			sourceId: entity.id,
			severity: severityFor(entity)
		});
		this.collision = resolution.state;
		if (!resolution.applied || !resolution.consequences) return null;

		const modifiers = getFoodModifiers(this.food, this.elapsedMs);
		const delta = {
			...resolution.consequences.metricDelta,
			morale: (resolution.consequences.metricDelta.morale ?? 0) * modifiers.moraleLossMultiplier
		};
		this.metrics = applyMetricDelta(this.metrics, delta);
		this.food = { ...this.food, metrics: this.metrics };
		this.player.slowdownTimer = resolution.consequences.slowdownMs / 1_000;
		this.player.controlImpairmentTimer = resolution.consequences.controlImpairmentMs / 1_000;
		this.player.stumbleTimer = resolution.consequences.stumble ? 0.75 : 0;
		this.player.x = Math.max(30, this.player.x - resolution.consequences.pushback * 5.2);
		this.player.vx *= -0.28;
		this.player.vy *= 0.32;
		this.counters.collisions += 1;
		this.lastCollisionX = this.player.x;
		this.counters.currentStretch = 0;
		this.recentCollisionTimes.push(this.elapsedMs);
		this.lastHazardAtMs = this.elapsedMs;
		this.cameraShake = this.settings.reducedMotion
			? 0
			: resolution.consequences.stumble
				? 0.9
				: 0.35;
		this.showReaction(
			reactionForKind(entity.kind, this.streams.cosmetics.pick(REACTIONS)),
			entity.kind === 'cow' ? 2_100 : 1_550
		);
		sounds.push(resolution.consequences.stumble ? 'stumble' : 'bump');

		if (entity.kind === 'cow') {
			this.counters.cowsOffended += 1;
			sounds.push('cow');
		} else if (entity.kind === 'pothole') {
			this.counters.potholesEntered += 1;
			this.player.muddyShoe = true;
			if (entity.wet) {
				sounds.push('splash');
				this.splashVeil = 1;
				this.showWarning('PUDDLE SPLASH — depth remains a matter of opinion', 1_250);
				for (const pedestrian of this.entities) {
					if (
						pedestrian.active &&
						pedestrian.kind === 'pedestrian' &&
						circleDistance(pedestrian, entity) < 165
					) {
						pedestrian.vy +=
							Math.sign(pedestrian.y - entity.y || (pedestrian.phase ?? 0.5) - 0.5) * 24;
					}
				}
			}
		}

		if (resolution.consequences.fatal) {
			return {
				won: false,
				context: lossContextFor(entity),
				reason:
					entity.kind === 'drain'
						? 'The open drain was decisive.'
						: 'A motorbike completed the civic encounter.'
			};
		}
		return null;
	}

	private resolveCollisions(sounds: GameSound[]): SimulationUpdate['ended'] {
		for (const entity of this.entities) {
			if (
				!entity.active ||
				entity.consumed ||
				entity.state === 'warning' ||
				(!entity.solid && !entity.dangerous) ||
				Math.abs(entity.x - this.player.x) > 125
			) {
				continue;
			}
			const radius =
				entity.kind === 'drain' ? Math.min(entity.width ?? 70, 90) * 0.35 : collisionRadius(entity);
			const distance = circleDistance(entity, this.player);

			if (
				entity.kind === 'motorbike' &&
				entity.state === 'moving' &&
				!entity.triggered &&
				distance < radius + this.player.radius + 38 &&
				distance > radius + this.player.radius
			) {
				entity.triggered = true;
				this.counters.nearMisses += 1;
				this.nearMissPulse = this.settings.reducedMotion ? 0.25 : 1;
				this.showReaction('Aste! That counted as survival.', 1_250);
			}

			if (distance >= radius + this.player.radius) continue;
			if (entity.kind === 'pothole' && entity.triggered) continue;
			if (entity.kind === 'pothole') entity.triggered = true;
			const ended = this.collisionWith(entity, sounds);
			if (ended) return ended;
		}
		return null;
	}

	checkLocalRouteFairness() {
		const minimumRouteWidth = 39;
		const clearance = minimumRouteWidth / 2;
		const bounds = {
			x: this.player.x + 35,
			y: WORLD.minY,
			width: 690,
			height: WORLD.maxY - WORLD.minY
		};
		const nearby = this.entities.filter(
			(entity) =>
				entity.active &&
				entity.solid &&
				entity.state !== 'warning' &&
				entity.x > bounds.x - 80 &&
				entity.x < bounds.x + bounds.width + 80
		);
		const blockers = nearby.map((entity) => ({
			id: entity.id,
			x: entity.x - collisionRadius(entity),
			y: entity.y - collisionRadius(entity),
			width: collisionRadius(entity) * 2,
			height: collisionRadius(entity) * 2,
			padding: 5,
			blocking: entity.state !== 'yielding'
		}));
		const fairness = checkRouteFairness({
			bounds,
			blockers,
			minimumRouteWidth,
			cellSize: 34,
			start: {
				x: bounds.x + clearance,
				y: Math.max(
					bounds.y + clearance,
					Math.min(bounds.y + bounds.height - clearance, this.player.y)
				)
			}
		});
		return { bounds, nearby, fairness };
	}

	private updateDirector(): void {
		if (this.elapsedMs - this.lastDirectorAtMs < 520) return;
		this.lastDirectorAtMs = this.elapsedMs;
		const { nearby, fairness } = this.checkLocalRouteFairness();
		this.recentCollisionTimes = this.recentCollisionTimes.filter(
			(time) => this.elapsedMs - time < 12_000
		);
		const decision = updateDirector(
			this.director,
			createDirectorObservation({
				nowMs: this.elapsedMs,
				routeFair: fairness.fair,
				availableEscapeWidth: fairness.minimumEscapeWidth,
				requiredEscapeWidth: 39,
				blockers: nearby.map((entity) => ({
					id: entity.id,
					kind:
						entity.kind === 'cow'
							? 'cow'
							: entity.kind === 'pedestrian'
								? 'pedestrian'
								: entity.kind === 'rickshaw' || entity.kind === 'motorbike'
									? 'vehicle'
									: entity.kind === 'hawker'
										? 'stall-customer'
										: entity.kind === 'debris'
											? 'temporary-obstacle'
											: 'fixed',
					releasable: !['drain', 'pothole'].includes(entity.kind)
				})),
				recentCollisions: this.recentCollisionTimes.length,
				playerSpeed: Math.hypot(this.player.vx, this.player.vy) / 88,
				stamina: this.metrics.stamina,
				morale: this.metrics.morale,
				timeSinceMeaningfulHazardMs: this.elapsedMs - this.lastHazardAtMs,
				currentDensity: Math.min(1.4, nearby.length / 10),
				timeSinceFoodMs: this.elapsedMs - this.lastFoodAtMs,
				progress: this.progress,
				previousFailedRuns: this.previousFailedRuns
			})
		);
		this.director = decision.state;
		this.pressure = decision.pressure;
		this.warningTimeMultiplier = decision.warningTimeMultiplier;
		this.foodSpawnMultiplier = decision.foodSpawnMultiplier;
		if (decision.release) {
			const target = decision.release.targetId
				? this.entities.find((entity) => entity.id === decision.release!.targetId)
				: nearby.find((entity) => !['drain', 'pothole'].includes(entity.kind));
			if (target) {
				target.yieldTimer = decision.release.durationMs / 1_000;
				target.state = 'yielding';
			}
		}
	}

	private updateTutorial(): string {
		if (!this.settings.tutorialEnabled || this.tutorialIndex >= TUTORIAL_CUES.length) return '';
		const cue = TUTORIAL_CUES[this.tutorialIndex];
		if (this.progress >= cue.progress) {
			this.tutorialIndex += 1;
			this.tutorialCue = cue.text;
			this.tutorialCueUntilMs = this.elapsedMs + 3_200;
			return cue.text;
		}
		return '';
	}

	update(deltaSeconds: number, input: SimulationInput): SimulationUpdate {
		if (this.ended) return { sounds: [], ended: null, tutorialCue: '' };
		const safeDelta = Math.max(0, Math.min(0.05, deltaSeconds));
		this.elapsedMs += safeDelta * 1_000;
		const sounds: GameSound[] = [];

		this.updateWeather(sounds);
		this.food = expireFoodEffects(this.food, this.elapsedMs);
		this.metrics = this.food.metrics;
		this.updatePlayer(safeDelta, input);
		this.updateEntities(safeDelta, sounds);
		this.updateNarrowGapCounter();
		this.maybeSpawnAssistedFood();
		this.consumeNearbyFood(sounds);
		let ended = this.resolveCollisions(sounds);
		this.updateDirector();

		if (this.elapsedMs >= this.nextVehicleAtMs) {
			this.spawnMotorbike(sounds);
			const densityDelay = 8_500 / Math.max(0.65, this.pressure);
			this.nextVehicleAtMs =
				this.elapsedMs + this.streams.vehicles.range(densityDelay * 0.72, densityDelay * 1.3);
		}
		if (this.elapsedMs >= this.nextAmbientAtMs) {
			if (this.streams.cosmetics.chance(0.45)) {
				sounds.push(this.streams.cosmetics.chance(0.55) ? 'bell' : 'horn');
			}
			this.nextAmbientAtMs = this.elapsedMs + this.streams.cosmetics.range(4_000, 9_000);
		}

		if (this.elapsedMs > this.warningUntilMs) this.lastWarning = '';
		if (this.elapsedMs > this.reactionUntilMs) this.lastReaction = '';
		if (this.elapsedMs > this.foodMessageUntilMs) this.lastFoodEffect = '';
		if (this.elapsedMs > this.tutorialCueUntilMs) this.tutorialCue = '';
		this.cameraShake = Math.max(0, this.cameraShake - safeDelta * 2.6);
		this.nearMissPulse = Math.max(0, this.nearMissPulse - safeDelta * 2.2);
		this.splashVeil = Math.max(0, this.splashVeil - safeDelta * 1.8);

		const zoneIndex = ZONES.findIndex((zone) => zone.id === this.zone.id);
		if (zoneIndex > this.lastZoneIndex) {
			if (this.player.x - this.lastCollisionX > 1_000) this.counters.collisionFreeSections += 1;
			this.lastZoneIndex = zoneIndex;
			this.showWarning(`ENTERING — ${this.zone.name}`, 1_700);
		}

		if (!ended && this.metrics.stamina <= 0) {
			ended = { won: false, context: 'stamina', reason: 'Stamina reached zero.' };
		}
		if (!ended && this.metrics.morale <= 0) {
			ended = { won: false, context: 'morale', reason: 'Morale reached zero.' };
		}
		if (!ended && this.player.x >= WORLD.destinationX) {
			ended = { won: true, context: 'generic', reason: 'Destination reached.' };
		}
		if (ended) this.ended = true;

		return {
			sounds,
			ended,
			tutorialCue: this.updateTutorial()
		};
	}

	hud(phase: RuntimePhase, pausedByVisibility = false): HudSnapshot {
		const stats = runStatsFromRuntime(
			this.player,
			this.metrics,
			this.counters,
			this.elapsedMs,
			WORLD.destinationX - WORLD.startX,
			false,
			this.retreatDistance
		);
		return {
			phase,
			stamina: this.metrics.stamina,
			morale: this.metrics.morale,
			reflex: getFoodModifiers(this.food, this.elapsedMs).responsivenessMultiplier,
			distance: this.progress,
			distanceMetres: Math.round(Math.max(0, this.player.x - WORLD.startX) * 0.085),
			zone: this.zone.name,
			weather: this.weather,
			elapsedMs: this.elapsedMs,
			score: calculateScore(stats).total,
			warning: this.lastWarning,
			tutorialCue: this.tutorialCue,
			reaction: this.lastReaction,
			foodEffect: this.lastFoodEffect,
			seed: this.seed,
			dashReady: this.player.dashCooldown <= 0 && this.metrics.stamina > 7,
			pausedByVisibility
		};
	}

	result(won: boolean, context: LossContext, reason: string): RunResult {
		const stats = runStatsFromRuntime(
			this.player,
			this.metrics,
			this.counters,
			this.elapsedMs,
			WORLD.destinationX - WORLD.startX,
			won,
			this.retreatDistance
		);
		const score = calculateScore(stats);
		const rating =
			[...CIVIC_RATINGS].reverse().find((candidate) => score.total >= candidate.minimum)?.title ??
			CIVIC_RATINGS[0].title;
		const messages = won
			? [
					'You crossed the neighbourhood. The neighbourhood denies everything.',
					'Arrival confirmed. Dignity status: surprisingly adequate.',
					'Against planning, physics, and precedent: you have arrived.'
				]
			: (GAME_OVER_MESSAGES[context] ?? GAME_OVER_MESSAGES.generic);
		const message = this.streams.cosmetics.pick(messages);
		return {
			won,
			reason,
			message,
			seed: this.seed,
			elapsedMs: this.elapsedMs,
			distanceMetres: Math.round(Math.max(0, this.player.x - WORLD.startX) * 0.085),
			counters: { ...this.counters },
			metrics: { ...this.metrics },
			food: {
				...this.food,
				metrics: { ...this.food.metrics },
				activeEffects: [...this.food.activeEffects],
				consumed: { ...this.food.consumed }
			},
			score,
			rating
		};
	}

	destroy(): void {
		this.entities.length = 0;
		this.ended = true;
	}
}
