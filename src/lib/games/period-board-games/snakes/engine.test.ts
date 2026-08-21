import { describe, expect, it } from 'vitest';
import { nextDie } from '../rng';
import { LADDERS, SNAKES, squareToGrid, transportAt } from './board';
import { DEFAULT_SNAKES_SETUP, reduceSnakes, startSnakesGame } from './engine';
import type { SnakesState } from './types';

function playable(seed = 2468): SnakesState {
	const started = startSnakesGame(DEFAULT_SNAKES_SETUP, seed);
	return {
		...started,
		phase: 'awaiting-roll' as const,
		opening: { ...started.opening, contenders: [] },
		turnIndex: started.players.findIndex((player) => player.id === 'human')
	};
}

function setPosition(state: SnakesState, playerId: string, position: number) {
	return {
		...state,
		counters: state.counters.map((counter) =>
			counter.playerId === playerId ? { ...counter, position } : counter
		)
	};
}

function settleDie(state: SnakesState, die: number) {
	const rolled = { ...state, phase: 'die-rolling' as const, die, effectId: state.effectId + 1 };
	return reduceSnakes(rolled, { type: 'DIE_SETTLED', effectId: rolled.effectId }).state;
}

function settleCounter(state: SnakesState) {
	return reduceSnakes(state, { type: 'COUNTER_SETTLED', effectId: state.effectId }).state;
}

function rngForDie(value: number) {
	for (let seed = 1; seed < 100_000; seed += 1) {
		if (nextDie(seed).value === value) return seed;
	}
	throw new Error(`Could not find a seed for die value ${value}`);
}

function settleOpeningDie(state: SnakesState, die: number) {
	const playerId = state.opening.contenders[state.opening.cursor];
	const rolled = reduceSnakes(
		{ ...state, rngState: rngForDie(die) },
		{ type: 'ROLL', playerId }
	).state;
	expect(rolled.die).toBe(die);
	return reduceSnakes(rolled, { type: 'DIE_SETTLED', effectId: rolled.effectId }).state;
}

describe('fixed Saap-Ludo board', () => {
	it('maps every boustrophedon row boundary correctly', () => {
		expect(squareToGrid(1)).toEqual({ row: 9, column: 0 });
		expect(squareToGrid(10)).toEqual({ row: 9, column: 9 });
		expect(squareToGrid(11)).toEqual({ row: 8, column: 9 });
		expect(squareToGrid(20)).toEqual({ row: 8, column: 0 });
		expect(squareToGrid(21)).toEqual({ row: 7, column: 0 });
		expect(squareToGrid(90)).toEqual({ row: 1, column: 9 });
		expect(squareToGrid(91)).toEqual({ row: 0, column: 9 });
		expect(squareToGrid(100)).toEqual({ row: 0, column: 0 });
		for (let square = 1; square <= 100; square += 1) {
			const coordinate = squareToGrid(square);
			expect(coordinate.row).toBeGreaterThanOrEqual(0);
			expect(coordinate.row).toBeLessThan(10);
			expect(coordinate.column).toBeGreaterThanOrEqual(0);
			expect(coordinate.column).toBeLessThan(10);
		}
	});

	it('keeps every configured ladder and snake endpoint exact and non-chaining', () => {
		expect(LADDERS).toEqual({ 3: 22, 8: 30, 20: 41, 28: 55, 36: 44, 51: 67, 71: 91, 80: 96 });
		expect(SNAKES).toEqual({ 17: 7, 32: 10, 48: 26, 59: 39, 64: 45, 79: 58, 88: 68, 99: 13 });
		for (const [from, to] of [...Object.entries(LADDERS), ...Object.entries(SNAKES)]) {
			expect(transportAt(Number(from))?.to).toBe(to);
			expect(transportAt(Number(to))).toBeNull();
		}
		expect(transportAt(1)).toBeNull();
	});
});

describe('Calcutta-family Saap-Ludo rules', () => {
	function completeSeededMatch(seed: number) {
		let state = startSnakesGame({ ...DEFAULT_SNAKES_SETUP, computerCount: 1 }, seed);
		for (let step = 0; step < 40_000 && state.phase !== 'game-over'; step += 1) {
			switch (state.phase) {
				case 'opening-roll':
					state = reduceSnakes(state, {
						type: 'ROLL',
						playerId: state.opening.contenders[state.opening.cursor]
					}).state;
					break;
				case 'awaiting-roll':
					state = reduceSnakes(state, {
						type: 'ROLL',
						playerId: state.players[state.turnIndex].id
					}).state;
					break;
				case 'die-rolling':
					state = reduceSnakes(state, { type: 'DIE_SETTLED', effectId: state.effectId }).state;
					break;
				case 'counter-moving':
					state = reduceSnakes(state, { type: 'COUNTER_SETTLED', effectId: state.effectId }).state;
					break;
				case 'resolving-transport':
					state = reduceSnakes(state, {
						type: 'TRANSPORT_SETTLED',
						effectId: state.effectId
					}).state;
					break;
				case 'resolving-bonus':
					state = reduceSnakes(state, { type: 'BONUS_SETTLED', effectId: state.effectId }).state;
					break;
				case 'changing-turn':
					state = reduceSnakes(state, { type: 'TURN_SETTLED', effectId: state.effectId }).state;
					break;
				default:
					throw new Error(`Unexpected simulation phase: ${state.phase}`);
			}
		}
		if (state.phase !== 'game-over') throw new Error('Seeded Saap-Ludo match did not finish');
		return state;
	}

	it('plays a complete seeded two-player match reproducibly', () => {
		const first = completeSeededMatch(0x1984cafe);
		const second = completeSeededMatch(0x1984cafe);
		expect(first.winnerId).toBeTruthy();
		expect(second.winnerId).toBe(first.winnerId);
		expect(second.rngState).toBe(first.rngState);
		expect(second.counters).toEqual(first.counters);
	});

	it('rerolls only the tied highest opening throwers and starts with the reroll winner', () => {
		let state = startSnakesGame({ ...DEFAULT_SNAKES_SETUP, computerCount: 2 }, 0x51a7);
		const originalContenders = [...state.opening.contenders];
		state = settleOpeningDie(state, 6);
		state = settleOpeningDie(state, 6);
		state = settleOpeningDie(state, 2);

		expect(state.phase).toBe('opening-roll');
		expect(state.opening.contenders).toEqual(originalContenders.slice(0, 2));
		expect(state.opening.cursor).toBe(0);
		expect(state.opening.scores[originalContenders[0]]).toBeNull();
		expect(state.opening.scores[originalContenders[1]]).toBeNull();
		expect(state.opening.scores[originalContenders[2]]).toBe(2);

		state = settleOpeningDie(state, 3);
		state = settleOpeningDie(state, 5);
		expect(state.phase).toBe('awaiting-roll');
		expect(state.opening.contenders).toEqual([]);
		expect(state.players[state.turnIndex].id).toBe(originalContenders[1]);
	});

	it('keeps rolls two through six off the board before entry', () => {
		for (let die = 2; die <= 6; die += 1) {
			const state = settleDie(playable(), die);
			expect(state.counters.find((counter) => counter.playerId === 'human')!.position).toBe(0);
			expect(state.phase).toBe('changing-turn');
			expect(state.pendingBonus).toBe(false);
		}
	});

	it('moves an off-board counter through one to six and grants the six bonus when entry is open', () => {
		let state = playable(9090);
		state = {
			...state,
			setup: {
				...state.setup,
				houseRules: { ...state.setup.houseRules, requireOneToEnter: false }
			}
		};
		const playerId = state.players[state.turnIndex].id;
		const rolled = reduceSnakes(
			{ ...state, rngState: rngForDie(6) },
			{ type: 'ROLL', playerId }
		).state;
		expect(rolled.die).toBe(6);
		const moved = reduceSnakes(rolled, {
			type: 'DIE_SETTLED',
			effectId: rolled.effectId
		});

		expect(moved.state.counters.find((counter) => counter.playerId === playerId)?.position).toBe(6);
		expect(moved.state.pendingMove).toEqual({
			from: 0,
			landed: 6,
			transport: null,
			entered: false,
			overshoot: false,
			bonus: true
		});
		expect(moved.state.pendingBonus).toBe(true);
		expect(moved.effects).toEqual([
			{ type: 'counter', effectId: moved.state.effectId, squares: [1, 2, 3, 4, 5, 6] }
		]);

		state = settleCounter(moved.state);
		expect(state.phase).toBe('resolving-bonus');
		state = reduceSnakes(state, { type: 'BONUS_SETTLED', effectId: state.effectId }).state;
		expect(state.phase).toBe('awaiting-roll');
		expect(state.players[state.turnIndex].id).toBe(playerId);
	});

	it('enters on exactly one and ends that turn', () => {
		let state = settleDie(playable(), 1);
		expect(state.counters.find((counter) => counter.playerId === 'human')!.position).toBe(1);
		expect(state.phase).toBe('counter-moving');
		state = settleCounter(state);
		expect(state.phase).toBe('resolving-bonus');
		expect(state.pendingBonus).toBe(false);
	});

	it('triggers transport only on exact landing, never while passing', () => {
		let exact = setPosition(playable(), 'human', 2);
		exact = settleDie(exact, 1);
		expect(exact.pendingMove?.transport).toEqual({ type: 'ladder', from: 3, to: 22 });
		exact = settleCounter(exact);
		expect(exact.counters.find((counter) => counter.playerId === 'human')!.position).toBe(22);
		expect(exact.phase).toBe('resolving-transport');

		let passing = setPosition(playable(), 'human', 2);
		passing = settleDie(passing, 2);
		expect(passing.pendingMove?.transport).toBeNull();
		expect(passing.counters.find((counter) => counter.playerId === 'human')!.position).toBe(4);
	});

	it('resolves a transport only once', () => {
		let state = setPosition(playable(), 'human', 98);
		state = settleDie(state, 1);
		state = settleCounter(state);
		expect(state.counters.find((counter) => counter.playerId === 'human')!.position).toBe(13);
		const stale = reduceSnakes(state, { type: 'COUNTER_SETTLED', effectId: state.effectId }).state;
		expect(stale).toEqual(state);
	});

	it('grants one additional throw after an entered player rolls six', () => {
		let state = setPosition(playable(), 'human', 40);
		state = settleDie(state, 6);
		state = settleCounter(state);
		expect(state.pendingBonus).toBe(true);
		state = reduceSnakes(state, { type: 'BONUS_SETTLED', effectId: state.effectId }).state;
		expect(state.phase).toBe('awaiting-roll');
		expect(state.turnIndex).toBe(playable().turnIndex);
	});

	it('allows several counters to share a square', () => {
		let state = playable();
		const opponent = state.players.find((player) => player.kind === 'computer')!;
		state = setPosition(state, 'human', 42);
		state = setPosition(state, opponent.id, 42);
		expect(state.counters.filter((counter) => counter.position === 42)).toHaveLength(2);
		state = settleDie(state, 2);
		expect(state.counters.find((counter) => counter.playerId === opponent.id)!.position).toBe(42);
	});

	it('leaves a counter stationary on overshoot and wins on exact 100', () => {
		let overshoot = setPosition(playable(), 'human', 98);
		overshoot = settleDie(overshoot, 4);
		expect(overshoot.counters.find((counter) => counter.playerId === 'human')!.position).toBe(98);
		expect(overshoot.pendingMove?.overshoot).toBe(true);

		let exact = setPosition(playable(), 'human', 98);
		exact = settleDie(exact, 2);
		exact = settleCounter(exact);
		expect(exact.phase).toBe('game-over');
		expect(exact.winnerId).toBe('human');
	});
});
