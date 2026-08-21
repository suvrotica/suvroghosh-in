import { describe, expect, it } from 'vitest';
import { nextDie } from '../rng';
import { PLAYER_COLORS } from '../shared';
import { LUDO_ROUTES, PRINTED_STAR_COORDINATES, pointKey } from './board';
import { chooseLudoBotMove, scoreLudoMove } from './bot';
import { DEFAULT_LUDO_SETUP, reduceLudo, startLudoGame } from './engine';
import { applyLudoMove, destinationForToken, getLegalLudoMoves } from './legal';
import type { LudoPosition, LudoState, LudoToken } from './types';

function playable(seed = 12345, computerCount: 1 | 2 | 3 = 3): LudoState {
	const started = startLudoGame({ ...DEFAULT_LUDO_SETUP, computerCount }, seed);
	const turnIndex = started.players.findIndex((player) => player.id === 'human');
	return {
		...started,
		phase: 'awaiting-roll' as const,
		opening: { ...started.opening, contenders: [] },
		turnIndex,
		die: null
	};
}

function token(state: LudoState, playerId: string, number = 0) {
	return state.tokens.find(
		(candidate) => candidate.playerId === playerId && candidate.number === number
	)!;
}

function place(state: LudoState, tokenId: string, position: LudoPosition) {
	return {
		...state,
		tokens: state.tokens.map((candidate) =>
			candidate.id === tokenId ? { ...candidate, position } : candidate
		)
	};
}

function withDie(state: LudoState, die: number, consecutiveSixes = die === 6 ? 1 : 0) {
	return {
		...state,
		phase: 'die-rolling' as const,
		die,
		consecutiveSixes,
		effectId: state.effectId + 1
	};
}

function settleDie(state: LudoState, die: number, consecutiveSixes = die === 6 ? 1 : 0) {
	const rolled = withDie(state, die, consecutiveSixes);
	return reduceLudo(rolled, { type: 'DIE_SETTLED', effectId: rolled.effectId }).state;
}

function currentOpponent(state: LudoState) {
	return state.players.find((player) => player.kind === 'computer')!;
}

function routeIndex(color: (typeof PLAYER_COLORS)[number], point: readonly [number, number]) {
	return LUDO_ROUTES[color].findIndex((candidate) => pointKey(candidate) === pointKey(point));
}

function rngForDie(value: number) {
	for (let seed = 1; seed < 100_000; seed += 1) {
		if (nextDie(seed).value === value) return seed;
	}
	throw new Error(`Could not find a seed for die value ${value}`);
}

function rollGameplayDie(state: LudoState, die: number) {
	const playerId = state.players[state.turnIndex].id;
	const rolled = reduceLudo(
		{ ...state, rngState: rngForDie(die) },
		{ type: 'ROLL', playerId }
	).state;
	expect(rolled.die).toBe(die);
	return reduceLudo(rolled, { type: 'DIE_SETTLED', effectId: rolled.effectId }).state;
}

function settleChosenMove(state: LudoState, tokenId: string) {
	const move = state.legalMoves.find((candidate) => candidate.tokenId === tokenId)!;
	let moved = reduceLudo(state, {
		type: 'MOVE',
		playerId: state.players[state.turnIndex].id,
		moveId: move.id
	}).state;
	moved = reduceLudo(moved, { type: 'MOVE_SETTLED', effectId: moved.effectId }).state;
	moved = reduceLudo(moved, { type: 'LANDING_SETTLED', effectId: moved.effectId }).state;
	return reduceLudo(moved, { type: 'BONUS_SETTLED', effectId: moved.effectId }).state;
}

function settleOpeningDie(state: LudoState, die: number) {
	const playerId = state.opening.contenders[state.opening.cursor];
	const rolled = reduceLudo(
		{ ...state, rngState: rngForDie(die) },
		{ type: 'ROLL', playerId }
	).state;
	expect(rolled.die).toBe(die);
	return reduceLudo(rolled, { type: 'DIE_SETTLED', effectId: rolled.effectId }).state;
}

describe('Calcutta-family Ludo legal moves', () => {
	it('does not let rolls one through five leave the yard', () => {
		const state = playable();
		for (let die = 1; die <= 5; die += 1) expect(getLegalLudoMoves(state, die)).toEqual([]);
	});

	it('lets a six open a token and grants exactly one bonus throw', () => {
		let state = settleDie(playable(), 6);
		expect(state.legalMoves).toHaveLength(4);
		expect(state.legalMoves.every((move) => move.kind === 'enter')).toBe(true);
		state = reduceLudo(state, {
			type: 'MOVE',
			playerId: 'human',
			moveId: state.legalMoves[0].id
		}).state;
		state = reduceLudo(state, { type: 'MOVE_SETTLED', effectId: state.effectId }).state;
		state = reduceLudo(state, { type: 'LANDING_SETTLED', effectId: state.effectId }).state;
		expect(state.phase).toBe('resolving-bonus');
		expect(state.pendingBonus).toBe(true);
		state = reduceLudo(state, { type: 'BONUS_SETTLED', effectId: state.effectId }).state;
		expect(state.phase).toBe('awaiting-roll');
		expect(state.turnIndex).toBe(playable().turnIndex);
	});

	it('lets a six move an active token', () => {
		let state = playable();
		state = place(state, token(state, 'human').id, { kind: 'track', progress: 4 });
		const moves = getLegalLudoMoves(state, 6);
		const activeMove = moves.find((move) => move.tokenId === token(state, 'human').id)!;
		expect(activeMove.to).toEqual({ kind: 'track', progress: 10 });
		expect(activeMove.path).toHaveLength(6);
	});

	it('discards a third consecutive six while preserving prior moves', () => {
		let state = playable(12345, 1);
		const first = token(state, 'human');

		state = rollGameplayDie(state, 6);
		state = settleChosenMove(state, first.id);
		expect(token(state, 'human').position).toEqual({ kind: 'track', progress: 0 });
		expect(state.consecutiveSixes).toBe(1);

		state = rollGameplayDie(state, 6);
		state = settleChosenMove(state, first.id);
		expect(token(state, 'human').position).toEqual({ kind: 'track', progress: 6 });
		expect(state.consecutiveSixes).toBe(2);

		state = rollGameplayDie(state, 6);
		expect(state.phase).toBe('changing-turn');
		expect(state.legalMoves).toEqual([]);
		expect(token(state, 'human').position).toEqual({ kind: 'track', progress: 6 });
		expect(state.consecutiveSixes).toBe(3);
		expect(state.announcement).toContain('Third consecutive six');
	});

	it('keeps every color route as the exact clockwise rotation from its printed start', () => {
		const expected = {
			green: { offset: 0, start: [6, 1], next: [6, 2], last: [6, 0] },
			yellow: { offset: 13, start: [1, 8], next: [2, 8], last: [0, 8] },
			blue: { offset: 26, start: [8, 13], next: [8, 12], last: [8, 14] },
			red: { offset: 39, start: [13, 6], next: [12, 6], last: [14, 6] }
		} as const;
		const canonical = [...LUDO_ROUTES.green];

		for (const color of PLAYER_COLORS) {
			const route = LUDO_ROUTES[color];
			const { offset, start, next, last } = expected[color];
			expect(route[0]).toEqual(start);
			expect(route[1]).toEqual(next);
			expect(route.at(-1)).toEqual(last);
			expect(route).toEqual([...canonical.slice(offset), ...canonical.slice(0, offset)]);
		}
	});

	it('defines every complete route and its home-lane transition exactly', () => {
		const sharedSet = new Set(LUDO_ROUTES.green.map(pointKey));
		for (const color of PLAYER_COLORS) {
			expect(LUDO_ROUTES[color]).toHaveLength(52);
			expect(new Set(LUDO_ROUTES[color].map(pointKey))).toEqual(sharedSet);
			const sample: LudoToken = {
				id: 'sample',
				playerId: 'sample',
				color,
				number: 0,
				position: { kind: 'track', progress: 51 }
			};
			expect(destinationForToken(sample, 1)).toEqual({ kind: 'home', index: 0 });
			sample.position = { kind: 'home', index: 4 };
			expect(destinationForToken(sample, 1)).toEqual({ kind: 'finished' });
		}
	});

	it('rejects exact-home overshoot', () => {
		const sample: LudoToken = {
			id: 'sample',
			playerId: 'sample',
			color: 'red',
			number: 0,
			position: { kind: 'home', index: 4 }
		};
		expect(destinationForToken(sample, 2)).toBeNull();
	});

	it('prevents capture on stars and all four colored starts', () => {
		const state = playable();
		const human = token(state, 'human');
		const opponent = currentOpponent(state);
		const opponentToken = token(state, opponent.id);
		const safePoints = [
			...PRINTED_STAR_COORDINATES,
			...PLAYER_COLORS.map((color) => LUDO_ROUTES[color][0])
		];
		for (const point of safePoints) {
			const humanDestination = routeIndex(human.color, point);
			const opponentPosition = routeIndex(opponent.color, point);
			if (humanDestination < 1) continue;
			let scenario = place(state, human.id, { kind: 'track', progress: humanDestination - 1 });
			scenario = place(scenario, opponentToken.id, { kind: 'track', progress: opponentPosition });
			const move = getLegalLudoMoves(scenario, 1).find(
				(candidate) => candidate.tokenId === human.id
			)!;
			expect(applyLudoMove(scenario, move).capturedTokenIds).toEqual([]);
		}
	});

	it('captures exactly one opponent on an ordinary shared square', () => {
		let state = playable();
		const human = token(state, 'human');
		const opponent = currentOpponent(state);
		const opponentToken = token(state, opponent.id);
		const destination: readonly [number, number] = [6, 2];
		const humanProgress = routeIndex(human.color, destination);
		state = place(state, human.id, { kind: 'track', progress: humanProgress - 1 });
		state = place(state, opponentToken.id, {
			kind: 'track',
			progress: routeIndex(opponent.color, destination)
		});
		const move = getLegalLudoMoves(state, 1).find((candidate) => candidate.tokenId === human.id)!;
		const applied = applyLudoMove(state, move);
		expect(applied.capturedTokenIds).toEqual([opponentToken.id]);
		expect(applied.tokens.find((candidate) => candidate.id === opponentToken.id)!.position).toEqual(
			{
				kind: 'yard'
			}
		);
	});

	it('blocks opponents from landing on or passing an unsafe blockade', () => {
		let state = playable();
		const human = token(state, 'human');
		const opponent = currentOpponent(state);
		const blockedPoint: readonly [number, number] = [6, 2];
		const humanBlocked = routeIndex(human.color, blockedPoint);
		state = place(state, human.id, { kind: 'track', progress: humanBlocked - 2 });
		state = place(state, token(state, opponent.id, 0).id, {
			kind: 'track',
			progress: routeIndex(opponent.color, blockedPoint)
		});
		state = place(state, token(state, opponent.id, 1).id, {
			kind: 'track',
			progress: routeIndex(opponent.color, blockedPoint)
		});
		expect(getLegalLudoMoves(state, 2).some((move) => move.tokenId === human.id)).toBe(false);
		expect(getLegalLudoMoves(state, 3).some((move) => move.tokenId === human.id)).toBe(false);
	});

	it('lets the blockade owner move either blocker and pass its own blockade', () => {
		let state = playable();
		const first = token(state, 'human', 0);
		const second = token(state, 'human', 1);
		const third = token(state, 'human', 2);
		state = place(state, first.id, { kind: 'track', progress: 14 });
		state = place(state, second.id, { kind: 'track', progress: 14 });
		state = place(state, third.id, { kind: 'track', progress: 13 });
		const oneMoves = getLegalLudoMoves(state, 1);
		expect(oneMoves.some((move) => move.tokenId === first.id)).toBe(true);
		expect(oneMoves.some((move) => move.tokenId === second.id)).toBe(true);
		const twoMoves = getLegalLudoMoves(state, 2);
		expect(twoMoves.some((move) => move.tokenId === third.id)).toBe(true);
	});

	it('prevents a third same-color token joining two on an ordinary square', () => {
		let state = playable();
		state = place(state, token(state, 'human', 0).id, { kind: 'track', progress: 14 });
		state = place(state, token(state, 'human', 1).id, { kind: 'track', progress: 14 });
		state = place(state, token(state, 'human', 2).id, { kind: 'track', progress: 13 });
		expect(
			getLegalLudoMoves(state, 1).some((move) => move.tokenId === token(state, 'human', 2).id)
		).toBe(false);
	});

	it('prevents ordinary same-color stacks when the blockade house rule is off', () => {
		let state = playable();
		state = {
			...state,
			setup: {
				...state.setup,
				houseRules: { ...state.setup.houseRules, blockades: false }
			}
		};
		state = place(state, token(state, 'human', 0).id, { kind: 'track', progress: 14 });
		state = place(state, token(state, 'human', 1).id, { kind: 'track', progress: 13 });
		expect(
			getLegalLudoMoves(state, 1).some((move) => move.tokenId === token(state, 'human', 1).id)
		).toBe(false);
	});

	it('allows mixed and crowded occupancy on safe squares', () => {
		let state = playable();
		const safe = PRINTED_STAR_COORDINATES[0];
		const humanProgress = routeIndex('red', safe);
		const opponent = currentOpponent(state);
		state = place(state, token(state, 'human', 0).id, { kind: 'track', progress: humanProgress });
		state = place(state, token(state, 'human', 1).id, { kind: 'track', progress: humanProgress });
		state = place(state, token(state, 'human', 2).id, {
			kind: 'track',
			progress: humanProgress - 1
		});
		state = place(state, token(state, opponent.id, 0).id, {
			kind: 'track',
			progress: routeIndex(opponent.color, safe)
		});
		expect(
			getLegalLudoMoves(state, 1).some((move) => move.tokenId === token(state, 'human', 2).id)
		).toBe(true);
	});
});

describe('Calcutta-family Ludo state transitions and computers', () => {
	function completeSeededMatch(seed: number) {
		let state = startLudoGame({ ...DEFAULT_LUDO_SETUP, computerCount: 1 }, seed);
		for (let step = 0; step < 120_000 && state.phase !== 'game-over'; step += 1) {
			switch (state.phase) {
				case 'opening-roll':
					state = reduceLudo(state, {
						type: 'ROLL',
						playerId: state.opening.contenders[state.opening.cursor]
					}).state;
					break;
				case 'awaiting-roll':
					state = reduceLudo(state, {
						type: 'ROLL',
						playerId: state.players[state.turnIndex].id
					}).state;
					break;
				case 'die-rolling':
					state = reduceLudo(state, { type: 'DIE_SETTLED', effectId: state.effectId }).state;
					break;
				case 'awaiting-human-token':
					state = reduceLudo(state, {
						type: 'MOVE',
						playerId: state.players[state.turnIndex].id,
						moveId: state.legalMoves[0].id
					}).state;
					break;
				case 'computer-choosing':
					state = reduceLudo(state, { type: 'BOT_CHOOSE', effectId: state.effectId }).state;
					break;
				case 'token-moving':
					state = reduceLudo(state, { type: 'MOVE_SETTLED', effectId: state.effectId }).state;
					break;
				case 'resolving-landing':
					state = reduceLudo(state, { type: 'LANDING_SETTLED', effectId: state.effectId }).state;
					break;
				case 'resolving-bonus':
					state = reduceLudo(state, { type: 'BONUS_SETTLED', effectId: state.effectId }).state;
					break;
				case 'changing-turn':
					state = reduceLudo(state, { type: 'TURN_SETTLED', effectId: state.effectId }).state;
					break;
				default:
					throw new Error(`Unexpected simulation phase: ${state.phase}`);
			}
		}
		if (state.phase !== 'game-over') throw new Error('Seeded Ludo match did not finish');
		return state;
	}

	it('plays a complete seeded two-player match reproducibly', () => {
		const first = completeSeededMatch(0x1984cafe);
		const second = completeSeededMatch(0x1984cafe);
		expect(first.winnerId).toBeTruthy();
		expect(second.winnerId).toBe(first.winnerId);
		expect(second.rngState).toBe(first.rngState);
		expect(second.tokens).toEqual(first.tokens);
	});

	it('rerolls only the tied highest opening throwers and starts with the reroll winner', () => {
		let state = startLudoGame({ ...DEFAULT_LUDO_SETUP, computerCount: 2 }, 0x51a7);
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

	it('resets the consecutive-six counter as soon as a non-six roll commits', () => {
		let state = place(playable(44, 1), token(playable(44, 1), 'human').id, {
			kind: 'track',
			progress: 6
		});
		state = { ...state, consecutiveSixes: 2 };
		const playerId = state.players[state.turnIndex].id;
		const rolled = reduceLudo(
			{ ...state, rngState: rngForDie(4) },
			{ type: 'ROLL', playerId }
		).state;
		expect(rolled.die).toBe(4);
		expect(rolled.consecutiveSixes).toBe(0);
		expect(
			reduceLudo(rolled, { type: 'DIE_SETTLED', effectId: rolled.effectId }).state.consecutiveSixes
		).toBe(0);
	});

	it('collapses six, capture, and home reasons into one additional throw', () => {
		let state = playable();
		const human = token(state, 'human');
		const opponent = currentOpponent(state);
		state = place(state, human.id, { kind: 'track', progress: 8 });
		const destination = LUDO_ROUTES.red[14];
		state = place(state, token(state, opponent.id).id, {
			kind: 'track',
			progress: routeIndex(opponent.color, destination)
		});
		state = settleDie(state, 6);
		const move = state.legalMoves.find((candidate) => candidate.tokenId === human.id)!;
		state = reduceLudo(state, { type: 'MOVE', playerId: 'human', moveId: move.id }).state;
		expect(state.pendingMove?.bonusReasons).toEqual(['six', 'capture']);
		expect(state.pendingBonus).toBe(true);
	});

	it('resolves no-legal-move turns and keeps a six bonus', () => {
		let state = settleDie(playable(), 4);
		expect(state.phase).toBe('changing-turn');
		state = settleDie(playable(), 6);
		expect(state.phase).toBe('awaiting-human-token');
		let blocked = playable();
		blocked = {
			...blocked,
			tokens: blocked.tokens.map((candidate) => ({
				...candidate,
				position: { kind: 'finished' as const }
			}))
		};
		blocked = settleDie(blocked, 6);
		expect(blocked.phase).toBe('resolving-bonus');
		expect(blocked.pendingBonus).toBe(true);
	});

	it('declares an immediate winner when the fourth token reaches home', () => {
		let state = playable();
		for (let number = 0; number < 3; number += 1) {
			state = place(state, token(state, 'human', number).id, { kind: 'finished' });
		}
		state = place(state, token(state, 'human', 3).id, { kind: 'home', index: 4 });
		state = settleDie(state, 1);
		state = reduceLudo(state, {
			type: 'MOVE',
			playerId: 'human',
			moveId: state.legalMoves[0].id
		}).state;
		state = reduceLudo(state, { type: 'MOVE_SETTLED', effectId: state.effectId }).state;
		state = reduceLudo(state, { type: 'LANDING_SETTLED', effectId: state.effectId }).state;
		expect(state.phase).toBe('game-over');
		expect(state.winnerId).toBe('human');
	});

	it('always selects a computer move from the current legal set', () => {
		let state = playable(314159);
		const computer = currentOpponent(state);
		state = { ...state, turnIndex: state.players.findIndex((player) => player.id === computer.id) };
		state = place(state, token(state, computer.id, 0).id, { kind: 'track', progress: 4 });
		state = place(state, token(state, computer.id, 1).id, { kind: 'track', progress: 17 });
		const legalMoves = getLegalLudoMoves(state, 6);
		for (let iteration = 0; iteration < 40; iteration += 1) {
			const choice = chooseLudoBotMove(
				{ ...state, rngState: state.rngState + iteration },
				legalMoves
			);
			expect(legalMoves.map((move) => move.id)).toContain(choice.move.id);
		}
	});

	it('scores a capture above a plain entry without favouring human or computer players', () => {
		let state = playable(8675309, 1);
		const mover = token(state, 'human', 0);
		const opponent = currentOpponent(state);
		state = place(state, mover.id, { kind: 'track', progress: 8 });
		const destination = LUDO_ROUTES[mover.color][14];
		state = place(state, token(state, opponent.id).id, {
			kind: 'track',
			progress: routeIndex(opponent.color, destination)
		});
		const moves = getLegalLudoMoves(state, 6);
		const capture = moves.find((move) => move.tokenId === mover.id)!;
		const entry = moves.find((move) => move.kind === 'enter')!;
		const captureScore = scoreLudoMove(state, capture);
		expect(captureScore).toBeGreaterThan(scoreLudoMove(state, entry));

		const computerScoredState = {
			...state,
			players: state.players.map((player) =>
				player.id === 'human' ? { ...player, kind: 'computer' as const } : player
			)
		};
		expect(scoreLudoMove(computerScoredState, capture)).toBe(captureScore);
	});

	it('replays seeded rolls and choices identically', () => {
		const first = startLudoGame(DEFAULT_LUDO_SETUP, 90210);
		const second = startLudoGame(DEFAULT_LUDO_SETUP, 90210);
		const playerId = first.players[0].id;
		expect(reduceLudo(first, { type: 'ROLL', playerId })).toEqual(
			reduceLudo(second, { type: 'ROLL', playerId })
		);

		let botState = playable(90210);
		const computer = currentOpponent(botState);
		botState = {
			...botState,
			turnIndex: botState.players.findIndex((player) => player.id === computer.id)
		};
		botState = place(botState, token(botState, computer.id, 0).id, { kind: 'track', progress: 4 });
		botState = place(botState, token(botState, computer.id, 1).id, { kind: 'track', progress: 11 });
		const moves = getLegalLudoMoves(botState, 6);
		expect(chooseLudoBotMove(botState, moves)).toEqual(
			chooseLudoBotMove(structuredClone(botState), structuredClone(moves))
		);
	});
});
