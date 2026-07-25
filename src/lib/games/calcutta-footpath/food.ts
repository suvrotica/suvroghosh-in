import { applyMetricDelta, createPlayerMetrics, type PlayerMetrics } from './metrics';
import type { RandomSource } from './random';

export const FOOD_KINDS = ['fuchka', 'mishti', 'tea', 'ghugni'] as const;
export type FoodKind = (typeof FOOD_KINDS)[number];

export const GHUGNI_OUTCOMES = [
	'enormous-stamina-boost',
	'speed-burst',
	'stomach-warning',
	'reversed-controls',
	'urgent-destination',
	'duplicate-potholes',
	'confidence-boost',
	'morale-immunity',
	'wake-nearby-dogs',
	'ominous-nothing'
] as const;
export type GhugniOutcome = (typeof GHUGNI_OUTCOMES)[number];

export type FoodEffectId =
	| 'fuchka-crowd'
	| 'mishti-eating'
	| 'tea-sharpness'
	| 'tea-jitters'
	| `ghugni-${GhugniOutcome}`;

export interface FoodModifiers {
	speedMultiplier: number;
	responsivenessMultiplier: number;
	warningTimeMultiplier: number;
	fineControlMultiplier: number;
	staminaDrainMultiplier: number;
	moraleLossMultiplier: number;
	stallCrowdMultiplier: number;
	reversedControls: boolean;
	hallucinatedPotholes: boolean;
	urgentDestination: boolean;
	wakeNearbyDogs: boolean;
}

export interface ActiveFoodEffect {
	id: FoodEffectId;
	source: FoodKind;
	startedAtMs: number;
	expiresAtMs: number;
	modifiers: Partial<FoodModifiers>;
}

export interface FoodState {
	metrics: PlayerMetrics;
	activeEffects: readonly ActiveFoodEffect[];
	consumed: Readonly<Record<FoodKind, number>>;
	totalSnacks: number;
	lastGhugniOutcome: GhugniOutcome | null;
}

export type FoodEvent =
	| 'stall-crowd'
	| 'satisfied'
	| 'tea-clink'
	| 'stomach-warning'
	| 'destination-urgency'
	| 'hallucinated-potholes'
	| 'wake-nearby-dogs'
	| 'ominous-sting';

export interface FoodConsumptionResult {
	state: FoodState;
	outcome: GhugniOutcome | null;
	events: readonly FoodEvent[];
}

export const DEFAULT_FOOD_MODIFIERS: Readonly<FoodModifiers> = {
	speedMultiplier: 1,
	responsivenessMultiplier: 1,
	warningTimeMultiplier: 1,
	fineControlMultiplier: 1,
	staminaDrainMultiplier: 1,
	moraleLossMultiplier: 1,
	stallCrowdMultiplier: 1,
	reversedControls: false,
	hallucinatedPotholes: false,
	urgentDestination: false,
	wakeNearbyDogs: false
};

const EMPTY_CONSUMPTION_COUNTS: Readonly<Record<FoodKind, number>> = {
	fuchka: 0,
	mishti: 0,
	tea: 0,
	ghugni: 0
};

function finiteTime(atMs: number): number {
	if (!Number.isFinite(atMs)) throw new RangeError('Food-effect time must be finite.');
	return Math.max(0, atMs);
}

function timedEffect(
	id: FoodEffectId,
	source: FoodKind,
	atMs: number,
	durationMs: number,
	modifiers: Partial<FoodModifiers>
): ActiveFoodEffect {
	return {
		id,
		source,
		startedAtMs: atMs,
		expiresAtMs: atMs + durationMs,
		modifiers
	};
}

function upsertEffect(
	effects: readonly ActiveFoodEffect[],
	effect: ActiveFoodEffect
): readonly ActiveFoodEffect[] {
	return [...effects.filter((active) => active.id !== effect.id), effect];
}

export function createFoodState(metrics: PlayerMetrics = createPlayerMetrics()): FoodState {
	return {
		metrics: createPlayerMetrics(metrics),
		activeEffects: [],
		consumed: { ...EMPTY_CONSUMPTION_COUNTS },
		totalSnacks: 0,
		lastGhugniOutcome: null
	};
}

export function expireFoodEffects(state: FoodState, atMs: number): FoodState {
	const now = finiteTime(atMs);
	const activeEffects = state.activeEffects.filter((effect) => effect.expiresAtMs > now);
	if (activeEffects.length === state.activeEffects.length) return state;
	return { ...state, activeEffects };
}

function multiplyModifier<Key extends keyof FoodModifiers>(
	modifiers: FoodModifiers,
	key: Key,
	factor: number
): void {
	if (typeof modifiers[key] !== 'number') return;
	(modifiers[key] as number) *= factor;
}

export function getFoodModifiers(state: FoodState, atMs: number): FoodModifiers {
	const now = finiteTime(atMs);
	const modifiers: FoodModifiers = { ...DEFAULT_FOOD_MODIFIERS };

	for (const effect of state.activeEffects) {
		if (effect.expiresAtMs <= now) continue;
		for (const key of [
			'speedMultiplier',
			'responsivenessMultiplier',
			'warningTimeMultiplier',
			'fineControlMultiplier',
			'staminaDrainMultiplier',
			'moraleLossMultiplier',
			'stallCrowdMultiplier'
		] as const) {
			const value = effect.modifiers[key];
			if (typeof value === 'number' && Number.isFinite(value)) {
				multiplyModifier(modifiers, key, value);
			}
		}
		for (const key of [
			'reversedControls',
			'hallucinatedPotholes',
			'urgentDestination',
			'wakeNearbyDogs'
		] as const) {
			if (effect.modifiers[key]) modifiers[key] = true;
		}
	}

	return modifiers;
}

function applyGhugniOutcome(
	state: FoodState,
	outcome: GhugniOutcome,
	atMs: number
): Pick<FoodConsumptionResult, 'state' | 'events'> {
	let metrics = state.metrics;
	let effects = state.activeEffects;
	const events: FoodEvent[] = [];

	switch (outcome) {
		case 'enormous-stamina-boost':
			metrics = applyMetricDelta(metrics, { stamina: 48 });
			break;
		case 'speed-burst':
			effects = upsertEffect(
				effects,
				timedEffect('ghugni-speed-burst', 'ghugni', atMs, 7_000, { speedMultiplier: 1.36 })
			);
			break;
		case 'stomach-warning':
			effects = upsertEffect(
				effects,
				timedEffect('ghugni-stomach-warning', 'ghugni', atMs, 5_500, {
					responsivenessMultiplier: 0.78,
					warningTimeMultiplier: 0.82
				})
			);
			events.push('stomach-warning');
			break;
		case 'reversed-controls':
			effects = upsertEffect(
				effects,
				timedEffect('ghugni-reversed-controls', 'ghugni', atMs, 4_500, {
					reversedControls: true
				})
			);
			break;
		case 'urgent-destination':
			effects = upsertEffect(
				effects,
				timedEffect('ghugni-urgent-destination', 'ghugni', atMs, 8_000, {
					urgentDestination: true,
					speedMultiplier: 1.08
				})
			);
			events.push('destination-urgency');
			break;
		case 'duplicate-potholes':
			effects = upsertEffect(
				effects,
				timedEffect('ghugni-duplicate-potholes', 'ghugni', atMs, 8_000, {
					hallucinatedPotholes: true
				})
			);
			events.push('hallucinated-potholes');
			break;
		case 'confidence-boost':
			metrics = applyMetricDelta(metrics, { morale: 16 });
			break;
		case 'morale-immunity':
			effects = upsertEffect(
				effects,
				timedEffect('ghugni-morale-immunity', 'ghugni', atMs, 8_000, {
					moraleLossMultiplier: 0
				})
			);
			break;
		case 'wake-nearby-dogs':
			effects = upsertEffect(
				effects,
				timedEffect('ghugni-wake-nearby-dogs', 'ghugni', atMs, 750, {
					wakeNearbyDogs: true
				})
			);
			events.push('wake-nearby-dogs');
			break;
		case 'ominous-nothing':
			events.push('ominous-sting');
			break;
	}

	return { state: { ...state, metrics, activeEffects: effects }, events };
}

export function consumeFood(
	currentState: FoodState,
	food: FoodKind,
	atMs: number,
	random?: RandomSource
): FoodConsumptionResult {
	const now = finiteTime(atMs);
	let state = expireFoodEffects(currentState, now);
	let metrics = state.metrics;
	let effects = state.activeEffects;
	const events: FoodEvent[] = [];
	let outcome: GhugniOutcome | null = null;
	const consumedBefore = state.consumed[food];

	switch (food) {
		case 'fuchka':
			metrics = applyMetricDelta(metrics, { stamina: 26, morale: 7 });
			effects = upsertEffect(
				effects,
				timedEffect('fuchka-crowd', 'fuchka', now, 2_500, { stallCrowdMultiplier: 1.35 })
			);
			events.push('stall-crowd');
			break;
		case 'mishti': {
			const moraleBenefit = Math.max(7, Math.round(25 * 0.64 ** consumedBefore));
			metrics = applyMetricDelta(metrics, { morale: moraleBenefit });
			effects = upsertEffect(
				effects,
				timedEffect('mishti-eating', 'mishti', now, 2_200, {
					speedMultiplier: 0.76,
					responsivenessMultiplier: 0.88
				})
			);
			events.push('satisfied');
			break;
		}
		case 'tea':
			effects = upsertEffect(
				effects,
				timedEffect('tea-sharpness', 'tea', now, 8_000, {
					responsivenessMultiplier: 1.2,
					warningTimeMultiplier: 1.22
				})
			);
			if (consumedBefore >= 2) {
				effects = upsertEffect(
					effects,
					timedEffect('tea-jitters', 'tea', now, 6_000, {
						fineControlMultiplier: 0.68,
						responsivenessMultiplier: 1.08,
						staminaDrainMultiplier: 1.12
					})
				);
			}
			events.push('tea-clink');
			break;
		case 'ghugni': {
			if (!random) {
				throw new Error(
					'Ghugni needs the run food random stream to select a deterministic outcome.'
				);
			}
			const index = Math.min(
				GHUGNI_OUTCOMES.length - 1,
				Math.floor(Math.max(0, random.next()) * GHUGNI_OUTCOMES.length)
			);
			outcome = GHUGNI_OUTCOMES[index];
			const applied = applyGhugniOutcome(
				{ ...state, metrics, activeEffects: effects },
				outcome,
				now
			);
			metrics = applied.state.metrics;
			effects = applied.state.activeEffects;
			events.push(...applied.events);
			break;
		}
	}

	const consumed = {
		...state.consumed,
		[food]: consumedBefore + 1
	};

	state = {
		...state,
		metrics,
		activeEffects: effects,
		consumed,
		totalSnacks: state.totalSnacks + 1,
		lastGhugniOutcome: outcome ?? state.lastGhugniOutcome
	};

	return { state, outcome, events };
}
