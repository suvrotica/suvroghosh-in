import { describe, expect, it } from 'vitest';
import { consumeFood, createFoodState, expireFoodEffects, getFoodModifiers } from './food';
import {
	advanceMetrics,
	applyMetricDelta,
	createPlayerMetrics,
	hasLostMorale,
	isExhausted
} from './metrics';
import { calculateScore, type RunStats } from './scoring';

describe('player metrics', () => {
	it('clamps stamina, morale, reflex, and distance at their valid bounds', () => {
		expect(
			createPlayerMetrics({
				stamina: 900,
				morale: -12,
				reflex: 20,
				distance: -5
			})
		).toEqual({
			stamina: 100,
			morale: 0,
			reflex: 1.5,
			distance: 0
		});

		const depleted = applyMetricDelta(createPlayerMetrics(), { stamina: -500, morale: -500 });
		expect(isExhausted(depleted)).toBe(true);
		expect(hasLostMorale(depleted)).toBe(true);
	});

	it('drains on movement and dash but recovers while resting', () => {
		const starting = createPlayerMetrics({ stamina: 50 });
		const dashing = advanceMetrics(starting, {
			deltaMs: 2_000,
			moving: true,
			dashing: true,
			weather: 'rain'
		});
		const rested = advanceMetrics(dashing, { deltaMs: 2_000, moving: false });

		expect(dashing.stamina).toBeLessThan(starting.stamina);
		expect(rested.stamina).toBeGreaterThan(dashing.stamina);
	});
});

describe('food effects', () => {
	it('applies immediate benefits and diminishing mishti morale', () => {
		let state = createFoodState(createPlayerMetrics({ stamina: 20, morale: 0 }));
		state = consumeFood(state, 'fuchka', 0).state;
		expect(state.metrics.stamina).toBe(46);
		expect(state.metrics.morale).toBe(7);

		const firstMishti = consumeFood(state, 'mishti', 3_000).state;
		const secondMishti = consumeFood(firstMishti, 'mishti', 6_000).state;
		expect(firstMishti.metrics.morale - state.metrics.morale).toBe(25);
		expect(secondMishti.metrics.morale - firstMishti.metrics.morale).toBe(16);
	});

	it('applies tea sharpness only until its exact expiry time', () => {
		const consumed = consumeFood(createFoodState(), 'tea', 1_000).state;
		expect(getFoodModifiers(consumed, 8_999).warningTimeMultiplier).toBeCloseTo(1.22);
		expect(getFoodModifiers(consumed, 9_000).warningTimeMultiplier).toBe(1);

		const expired = expireFoodEffects(consumed, 9_000);
		expect(expired.activeEffects).toEqual([]);
	});

	it('adds fine-control jitters after the third tea', () => {
		let state = createFoodState();
		state = consumeFood(state, 'tea', 0).state;
		state = consumeFood(state, 'tea', 1_000).state;
		state = consumeFood(state, 'tea', 2_000).state;

		const modifiers = getFoodModifiers(state, 2_001);
		expect(modifiers.responsivenessMultiplier).toBeGreaterThan(1);
		expect(modifiers.fineControlMultiplier).toBeLessThan(1);
		expect(getFoodModifiers(state, 8_000).fineControlMultiplier).toBe(1);
	});

	it('selects and expires a ghugni consequence through the supplied run stream', () => {
		const result = consumeFood(createFoodState(), 'ghugni', 10_000, {
			next: () => 0.35
		});

		expect(result.outcome).toBe('reversed-controls');
		expect(getFoodModifiers(result.state, 14_499).reversedControls).toBe(true);
		expect(getFoodModifiers(result.state, 14_500).reversedControls).toBe(false);
	});
});

describe('scoring', () => {
	it('returns an auditable deterministic score breakdown', () => {
		const stats: RunStats = {
			forwardDistance: 1_200,
			retreatDistance: 10,
			destinationDistance: 1_200,
			elapsedMs: 180_000,
			won: true,
			finalMorale: 80,
			nearMisses: 2,
			narrowGaps: 3,
			usefulSnacks: 2,
			collisions: 1,
			recklessDashes: 1,
			potholesEntered: 0,
			dogsAwakened: 1,
			cowsOffended: 0,
			collisionFreeSections: 4
		};

		const score = calculateScore(stats);
		expect(score.total).toBe(9_485);
		expect(Object.values(score.breakdown).reduce((total, component) => total + component, 0)).toBe(
			score.total
		);
	});

	it('penalises a reckless run without allowing a negative or non-finite total', () => {
		const result = calculateScore({
			forwardDistance: Number.NaN,
			retreatDistance: 99_999,
			destinationDistance: 0,
			elapsedMs: Number.POSITIVE_INFINITY,
			won: false,
			finalMorale: -10,
			nearMisses: 0,
			narrowGaps: 0,
			usefulSnacks: 0,
			collisions: 50,
			recklessDashes: 50,
			potholesEntered: 50,
			dogsAwakened: 50,
			cowsOffended: 50,
			collisionFreeSections: 0
		});

		expect(result.total).toBe(0);
		expect(Number.isFinite(result.total)).toBe(true);
	});
});
