import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LUDO_ROUTES, pointKey, trackPointFor } from './ludo/board';
import { DEFAULT_LUDO_SETUP, reduceLudo, startLudoGame } from './ludo/engine';
import {
	LUDO_STORAGE_KEY,
	loadLudoState,
	parseLudoState,
	saveLudoState,
	serializeLudoState
} from './ludo/persistence';
import type { LudoState } from './ludo/types';
import { DEFAULT_SNAKES_SETUP, reduceSnakes, startSnakesGame } from './snakes/engine';
import {
	SNAKES_STORAGE_KEY,
	loadSnakesState,
	parseSnakesState,
	saveSnakesState,
	serializeSnakesState
} from './snakes/persistence';
import type { SnakesState } from './snakes/types';
import {
	loadPreferences,
	parsePreferences,
	savePreferences,
	serializePreferences
} from './preferences';
import { EffectScheduler } from './timing';

class MemoryStorage implements Storage {
	#values = new Map<string, string>();
	get length() {
		return this.#values.size;
	}
	clear() {
		this.#values.clear();
	}
	getItem(key: string) {
		return this.#values.get(key) ?? null;
	}
	key(index: number) {
		return [...this.#values.keys()][index] ?? null;
	}
	removeItem(key: string) {
		this.#values.delete(key);
	}
	setItem(key: string, value: string) {
		this.#values.set(key, value);
	}
}

function playableLudo(seed = 55): LudoState {
	const started = startLudoGame(DEFAULT_LUDO_SETUP, seed);
	return {
		...started,
		phase: 'awaiting-roll',
		opening: { ...started.opening, contenders: [] },
		turnIndex: started.players.findIndex((player) => player.id === 'human')
	};
}

function playableSnakes(seed = 77): SnakesState {
	const started = startSnakesGame(DEFAULT_SNAKES_SETUP, seed);
	return {
		...started,
		phase: 'awaiting-roll',
		opening: { ...started.opening, contenders: [] },
		turnIndex: started.players.findIndex((player) => player.id === 'human')
	};
}

function snakesMovingOntoLadder() {
	let state = playableSnakes();
	state = {
		...state,
		counters: state.counters.map((counter) =>
			counter.playerId === 'human' ? { ...counter, position: 2 } : counter
		),
		phase: 'die-rolling',
		die: 1,
		effectId: state.effectId + 1
	};
	return reduceSnakes(state, { type: 'DIE_SETTLED', effectId: state.effectId }).state;
}

function corruptedSave<T>(state: T, mutate: (copy: T) => void) {
	const copy = structuredClone(state);
	mutate(copy);
	return JSON.stringify({ version: 1, state: copy });
}

describe('input guards and stale presentation work', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('commits only one roll under rapid repeated activation', () => {
		const state = playableLudo();
		const first = reduceLudo(state, { type: 'ROLL', playerId: 'human' }).state;
		const second = reduceLudo(first, { type: 'ROLL', playerId: 'human' }).state;
		expect(first.phase).toBe('die-rolling');
		expect(second).toBe(first);
		expect(second.rngState).toBe(first.rngState);
	});

	it('commits only one token move under rapid repeated activation', () => {
		let state = playableLudo();
		state = {
			...state,
			phase: 'die-rolling',
			die: 6,
			consecutiveSixes: 1,
			effectId: state.effectId + 1
		};
		state = reduceLudo(state, { type: 'DIE_SETTLED', effectId: state.effectId }).state;
		const moveId = state.legalMoves[0].id;
		const first = reduceLudo(state, { type: 'MOVE', playerId: 'human', moveId }).state;
		const second = reduceLudo(first, { type: 'MOVE', playerId: 'human', moveId }).state;
		expect(first.phase).toBe('token-moving');
		expect(second).toBe(first);
	});

	it('cancels a computer delay when a tab hides and never drains it later', () => {
		const scheduler = new EffectScheduler();
		const callback = vi.fn();
		expect(scheduler.schedule('turn:4', 900, callback)).toBe(true);
		expect(scheduler.schedule('turn:4', 900, callback)).toBe(false);
		scheduler.cancel();
		vi.advanceTimersByTime(5_000);
		expect(callback).not.toHaveBeenCalled();
	});

	it('invalidates old callbacks on restart while allowing a fresh generation', () => {
		const scheduler = new EffectScheduler();
		const stale = vi.fn();
		const fresh = vi.fn();
		scheduler.schedule('old-match', 400, stale);
		scheduler.cancel();
		scheduler.schedule('new-match', 250, fresh);
		vi.advanceTimersByTime(1_000);
		expect(stale).not.toHaveBeenCalled();
		expect(fresh).toHaveBeenCalledOnce();
	});
});

describe('versioned game persistence', () => {
	it('restores a committed roll and its exact legal token choices', () => {
		let state = playableLudo();
		state = {
			...state,
			phase: 'die-rolling',
			die: 6,
			consecutiveSixes: 1,
			effectId: state.effectId + 1
		};
		state = reduceLudo(state, { type: 'DIE_SETTLED', effectId: state.effectId }).state;
		const restored = parseLudoState(serializeLudoState(state));
		expect(restored.phase).toBe('awaiting-human-token');
		expect(restored.die).toBe(6);
		expect(restored.legalMoves.map((move) => move.id)).toEqual(
			state.legalMoves.map((move) => move.id)
		);
		expect(restored.rngState).toBe(state.rngState);
	});

	it('rejects fabricated or stale persisted Ludo legal moves', () => {
		let state = playableLudo();
		state = {
			...state,
			phase: 'die-rolling',
			die: 6,
			consecutiveSixes: 1,
			effectId: state.effectId + 1
		};
		state = reduceLudo(state, { type: 'DIE_SETTLED', effectId: state.effectId }).state;
		expect(state.phase).toBe('awaiting-human-token');
		const opponentToken = state.tokens.find((token) => token.playerId !== 'human')!;

		const invalidSaves = [
			corruptedSave(state, (saved) => {
				saved.legalMoves[0].tokenId = opponentToken.id;
			}),
			corruptedSave(state, (saved) => {
				saved.legalMoves[0].to = { kind: 'track', progress: 17 };
				saved.legalMoves[0].path = [{ kind: 'track', progress: 17 }];
			}),
			corruptedSave(state, (saved) => {
				const tokenId = saved.legalMoves[0].tokenId;
				saved.tokens.find((token) => token.id === tokenId)!.position = {
					kind: 'track',
					progress: 4
				};
			}),
			corruptedSave(playableLudo(), (saved) => {
				saved.legalMoves = structuredClone(state.legalMoves);
			})
		];

		for (const raw of invalidSaves) {
			expect(parseLudoState(raw)).toMatchObject({ phase: 'setup', players: [], tokens: [] });
		}
	});

	it('rejects fabricated capture, destination, and winner fields in a pending Ludo move', () => {
		let moving = playableLudo();
		moving = {
			...moving,
			phase: 'die-rolling',
			die: 6,
			consecutiveSixes: 1,
			effectId: moving.effectId + 1
		};
		moving = reduceLudo(moving, { type: 'DIE_SETTLED', effectId: moving.effectId }).state;
		moving = reduceLudo(moving, {
			type: 'MOVE',
			playerId: 'human',
			moveId: moving.legalMoves[0].id
		}).state;
		const opponentToken = moving.tokens.find((token) => token.playerId !== 'human')!;

		const invalidSaves = [
			corruptedSave(moving, (saved) => {
				saved.pendingMove!.capturedTokenIds = [opponentToken.id];
				saved.pendingMove!.bonusReasons = ['six', 'capture'];
			}),
			corruptedSave(moving, (saved) => {
				saved.pendingMove!.move.to = { kind: 'track', progress: 17 };
				saved.pendingMove!.move.path = [{ kind: 'track', progress: 17 }];
			}),
			corruptedSave(moving, (saved) => {
				saved.pendingMove!.winnerId = 'human';
			})
		];

		for (const raw of invalidSaves) {
			expect(parseLudoState(raw)).toMatchObject({ phase: 'setup', players: [], tokens: [] });
		}
	});

	it('accepts canonical Ludo capture, winning, and no-move bonus states', () => {
		let capture = playableLudo();
		const humanToken = capture.tokens.find((token) => token.playerId === 'human')!;
		const capturedToken = capture.tokens.find((token) => token.playerId !== 'human')!;
		humanToken.position = { kind: 'track', progress: 0 };
		const capturePoint = trackPointFor(humanToken.color, 1);
		const capturedProgress = LUDO_ROUTES[capturedToken.color].findIndex(
			(point) => pointKey(point) === pointKey(capturePoint)
		);
		capturedToken.position = { kind: 'track', progress: capturedProgress };
		capture = { ...capture, phase: 'die-rolling', die: 1, effectId: 51 };
		capture = reduceLudo(capture, { type: 'DIE_SETTLED', effectId: capture.effectId }).state;
		capture = reduceLudo(capture, {
			type: 'MOVE',
			playerId: 'human',
			moveId: capture.legalMoves[0].id
		}).state;
		const restoredCapture = parseLudoState(serializeLudoState(capture));
		expect(restoredCapture.phase).toBe('awaiting-roll');
		expect(restoredCapture.tokens.find((token) => token.id === capturedToken.id)?.position).toEqual(
			{
				kind: 'yard'
			}
		);

		let winning = playableLudo();
		const humanTokens = winning.tokens.filter((token) => token.playerId === 'human');
		winning.tokens = winning.tokens.map((token) => {
			if (token.id === humanTokens[3].id) return { ...token, position: { kind: 'home', index: 4 } };
			return token.playerId === 'human' ? { ...token, position: { kind: 'finished' } } : token;
		});
		winning = { ...winning, phase: 'die-rolling', die: 1, effectId: 52 };
		winning = reduceLudo(winning, { type: 'DIE_SETTLED', effectId: winning.effectId }).state;
		winning = reduceLudo(winning, {
			type: 'MOVE',
			playerId: 'human',
			moveId: winning.legalMoves[0].id
		}).state;
		winning = reduceLudo(winning, {
			type: 'MOVE_SETTLED',
			effectId: winning.effectId
		}).state;
		winning = reduceLudo(winning, {
			type: 'LANDING_SETTLED',
			effectId: winning.effectId
		}).state;
		expect(parseLudoState(serializeLudoState(winning))).toMatchObject({
			phase: 'game-over',
			winnerId: 'human'
		});

		let noMove = playableLudo();
		noMove.tokens = noMove.tokens.map((token) =>
			token.playerId === 'human' ? { ...token, position: { kind: 'home', index: 4 } } : token
		);
		noMove = {
			...noMove,
			phase: 'die-rolling',
			die: 6,
			consecutiveSixes: 1,
			effectId: 53
		};
		noMove = reduceLudo(noMove, { type: 'DIE_SETTLED', effectId: noMove.effectId }).state;
		expect(noMove).toMatchObject({ phase: 'resolving-bonus', pendingMove: null });
		expect(parseLudoState(serializeLudoState(noMove)).phase).toBe('awaiting-roll');
	});

	it('rejects persisted ordinary stacks that exceed the selected blockade policy', () => {
		const state = playableLudo();
		const invalidSaves = [
			corruptedSave(state, (saved) => {
				saved.setup.houseRules.blockades = false;
				for (const token of saved.tokens
					.filter((token) => token.playerId === 'human')
					.slice(0, 2)) {
					token.position = { kind: 'track', progress: 1 };
				}
			}),
			corruptedSave(state, (saved) => {
				for (const token of saved.tokens
					.filter((token) => token.playerId === 'human')
					.slice(0, 3)) {
					token.position = { kind: 'track', progress: 1 };
				}
			})
		];

		for (const raw of invalidSaves) {
			expect(parseLudoState(raw)).toMatchObject({ phase: 'setup', players: [], tokens: [] });
		}
	});

	it('rejects mixed-player occupancy on an ordinary unsafe Ludo square', () => {
		const state = playableLudo();
		const humanToken = state.tokens.find((token) => token.playerId === 'human')!;
		const opponentToken = state.tokens.find((token) => token.playerId !== 'human')!;
		humanToken.position = { kind: 'track', progress: 1 };
		const occupiedPoint = trackPointFor(humanToken.color, 1);
		const opponentProgress = LUDO_ROUTES[opponentToken.color].findIndex(
			(point) => pointKey(point) === pointKey(occupiedPoint)
		);
		expect(opponentProgress).toBeGreaterThanOrEqual(0);
		opponentToken.position = { kind: 'track', progress: opponentProgress };

		expect(parseLudoState(serializeLudoState(state))).toMatchObject({
			phase: 'setup',
			players: [],
			tokens: []
		});
	});

	it('allows same-player and mixed-player sharing on safe squares with either blockade setting', () => {
		for (const blockades of [false, true]) {
			const state = playableLudo();
			state.setup.houseRules.blockades = blockades;
			for (const token of state.tokens.filter((token) => token.playerId === 'human')) {
				token.position = { kind: 'track', progress: 0 };
			}
			const safePoint = trackPointFor(state.setup.humanColor, 0);
			const opponentToken = state.tokens.find((token) => token.playerId !== 'human')!;
			const opponentProgress = LUDO_ROUTES[opponentToken.color].findIndex(
				(point) => pointKey(point) === pointKey(safePoint)
			);
			opponentToken.position = { kind: 'track', progress: opponentProgress };

			const restored = parseLudoState(serializeLudoState(state));
			expect(restored.phase).toBe('awaiting-roll');
			expect(
				restored.tokens.filter(
					(token) =>
						token.position.kind === 'track' &&
						pointKey(trackPointFor(token.color, token.position.progress)) === pointKey(safePoint)
				)
			).toHaveLength(5);
		}
	});

	it('preserves a valid paused Ludo token choice with freshly derived moves', () => {
		let state = playableLudo();
		state = {
			...state,
			phase: 'die-rolling',
			die: 6,
			consecutiveSixes: 1,
			effectId: state.effectId + 1
		};
		state = reduceLudo(state, { type: 'DIE_SETTLED', effectId: state.effectId }).state;
		const paused = reduceLudo(state, { type: 'PAUSE' }).state;
		const restored = parseLudoState(serializeLudoState(paused));

		expect(restored.phase).toBe('paused');
		expect(restored.pausedFrom).toBe('awaiting-human-token');
		expect(restored.legalMoves).toEqual(state.legalMoves);
	});

	it('settles a reload during movement without duplicating the move', () => {
		let state = playableLudo();
		state = {
			...state,
			phase: 'die-rolling',
			die: 6,
			consecutiveSixes: 1,
			effectId: state.effectId + 1
		};
		state = reduceLudo(state, { type: 'DIE_SETTLED', effectId: state.effectId }).state;
		state = reduceLudo(state, {
			type: 'MOVE',
			playerId: 'human',
			moveId: state.legalMoves[0].id
		}).state;
		expect(state.phase).toBe('token-moving');
		const movedToken = state.pendingMove!.move.tokenId;
		const logicalPosition = state.tokens.find((token) => token.id === movedToken)!.position;
		const restored = parseLudoState(serializeLudoState(state));
		expect(restored.tokens.find((token) => token.id === movedToken)!.position).toEqual(
			logicalPosition
		);
		expect(restored.phase).toBe('awaiting-roll');
	});

	it('keeps paused committed rolls inert until an explicit resume', () => {
		const ludoRolling: LudoState = {
			...playableLudo(),
			phase: 'die-rolling',
			die: 6,
			consecutiveSixes: 1,
			effectId: 12,
			rngState: 0x12345678
		};
		const expectedLudo = reduceLudo(ludoRolling, {
			type: 'DIE_SETTLED',
			effectId: ludoRolling.effectId
		}).state;
		const pausedLudo = reduceLudo(ludoRolling, { type: 'PAUSE' }).state;
		const parsedLudo = parseLudoState(serializeLudoState(pausedLudo));
		const storage = new MemoryStorage();
		saveLudoState(storage, pausedLudo);
		const loadedLudo = loadLudoState(storage);

		for (const restored of [parsedLudo, loadedLudo]) {
			expect(restored.phase).toBe('paused');
			expect(restored.pausedFrom).toBe('die-rolling');
			expect(restored.die).toBe(6);
			expect(restored.rngState).toBe(ludoRolling.rngState);
			expect(restored.tokens).toEqual(ludoRolling.tokens);
		}
		const resumedLudo = reduceLudo(loadedLudo, { type: 'RESUME' }).state;
		expect(resumedLudo.phase).toBe('die-rolling');
		const settledLudo = reduceLudo(resumedLudo, {
			type: 'DIE_SETTLED',
			effectId: resumedLudo.effectId
		}).state;
		expect(settledLudo.phase).toBe('awaiting-human-token');
		expect(settledLudo.rngState).toBe(ludoRolling.rngState);
		expect(settledLudo.legalMoves.map((move) => move.id)).toEqual(
			expectedLudo.legalMoves.map((move) => move.id)
		);

		const snakesRolling: SnakesState = {
			...playableSnakes(),
			phase: 'die-rolling',
			die: 1,
			effectId: 22,
			rngState: 0x87654321
		};
		const pausedSnakes = reduceSnakes(snakesRolling, { type: 'PAUSE' }).state;
		const parsedSnakes = parseSnakesState(serializeSnakesState(pausedSnakes));
		saveSnakesState(storage, pausedSnakes);
		const loadedSnakes = loadSnakesState(storage);

		for (const restored of [parsedSnakes, loadedSnakes]) {
			expect(restored.phase).toBe('paused');
			expect(restored.pausedFrom).toBe('die-rolling');
			expect(restored.die).toBe(1);
			expect(restored.rngState).toBe(snakesRolling.rngState);
			expect(restored.counters).toEqual(snakesRolling.counters);
		}
		const resumedSnakes = reduceSnakes(loadedSnakes, { type: 'RESUME' }).state;
		expect(resumedSnakes.phase).toBe('die-rolling');
		const settledSnakes = reduceSnakes(resumedSnakes, {
			type: 'DIE_SETTLED',
			effectId: resumedSnakes.effectId
		}).state;
		expect(settledSnakes.phase).toBe('counter-moving');
		expect(settledSnakes.rngState).toBe(snakesRolling.rngState);
		expect(settledSnakes.counters.find((counter) => counter.playerId === 'human')?.position).toBe(
			1
		);
	});

	it('resumes paused token movement and transport without applying either twice', () => {
		let movingLudo: LudoState = {
			...playableLudo(),
			phase: 'die-rolling',
			die: 6,
			consecutiveSixes: 1,
			effectId: 30
		};
		movingLudo = reduceLudo(movingLudo, {
			type: 'DIE_SETTLED',
			effectId: movingLudo.effectId
		}).state;
		movingLudo = reduceLudo(movingLudo, {
			type: 'MOVE',
			playerId: 'human',
			moveId: movingLudo.legalMoves[0].id
		}).state;
		const movedTokenId = movingLudo.pendingMove!.move.tokenId;
		const committedPosition = movingLudo.tokens.find(
			(token) => token.id === movedTokenId
		)!.position;
		const pausedLudo = reduceLudo(movingLudo, { type: 'PAUSE' }).state;
		const storage = new MemoryStorage();
		saveLudoState(storage, pausedLudo);
		const loadedLudo = loadLudoState(storage);

		expect(loadedLudo.phase).toBe('paused');
		expect(loadedLudo.pausedFrom).toBe('token-moving');
		expect(loadedLudo.pendingMove).toEqual(movingLudo.pendingMove);
		expect(loadedLudo.tokens.find((token) => token.id === movedTokenId)?.position).toEqual(
			committedPosition
		);
		let resumedLudo = reduceLudo(loadedLudo, { type: 'RESUME' }).state;
		expect(resumedLudo.phase).toBe('token-moving');
		const moveEffectId = resumedLudo.effectId;
		resumedLudo = reduceLudo(resumedLudo, {
			type: 'MOVE_SETTLED',
			effectId: moveEffectId
		}).state;
		expect(
			resumedLudo.history.filter((entry) => entry.text.includes('entered a token'))
		).toHaveLength(1);
		const duplicateMove = reduceLudo(resumedLudo, {
			type: 'MOVE_SETTLED',
			effectId: moveEffectId
		}).state;
		expect(duplicateMove).toBe(resumedLudo);
		expect(duplicateMove.tokens.find((token) => token.id === movedTokenId)?.position).toEqual(
			committedPosition
		);

		const movingSnakes = snakesMovingOntoLadder();
		const transporting = reduceSnakes(movingSnakes, {
			type: 'COUNTER_SETTLED',
			effectId: movingSnakes.effectId
		}).state;
		expect(transporting.phase).toBe('resolving-transport');
		const pausedTransport = reduceSnakes(transporting, { type: 'PAUSE' }).state;
		saveSnakesState(storage, pausedTransport);
		const loadedTransport = loadSnakesState(storage);
		expect(loadedTransport.phase).toBe('paused');
		expect(loadedTransport.pausedFrom).toBe('resolving-transport');
		expect(loadedTransport.counters.find((counter) => counter.playerId === 'human')?.position).toBe(
			22
		);
		expect(loadedTransport.history.filter((entry) => entry.text.includes('ladder'))).toHaveLength(
			1
		);

		let resumedTransport = reduceSnakes(loadedTransport, { type: 'RESUME' }).state;
		expect(resumedTransport.phase).toBe('resolving-transport');
		const transportEffectId = resumedTransport.effectId;
		resumedTransport = reduceSnakes(resumedTransport, {
			type: 'TRANSPORT_SETTLED',
			effectId: transportEffectId
		}).state;
		const duplicateTransport = reduceSnakes(resumedTransport, {
			type: 'TRANSPORT_SETTLED',
			effectId: transportEffectId
		}).state;
		expect(duplicateTransport).toBe(resumedTransport);
		expect(
			duplicateTransport.counters.find((counter) => counter.playerId === 'human')?.position
		).toBe(22);
		expect(
			duplicateTransport.history.filter((entry) => entry.text.includes('ladder'))
		).toHaveLength(1);
	});

	it('settles Saap-Ludo reloads during counter movement and transport exactly once', () => {
		const moving = snakesMovingOntoLadder();
		expect(moving.phase).toBe('counter-moving');
		expect(moving.pendingMove?.transport).toEqual({ type: 'ladder', from: 3, to: 22 });

		const restoredMoving = parseSnakesState(JSON.stringify({ version: 1, state: moving }));
		expect(restoredMoving.phase).toBe('awaiting-roll');
		expect(restoredMoving.counters.find((counter) => counter.playerId === 'human')?.position).toBe(
			22
		);
		expect(restoredMoving.history.filter((entry) => entry.text.includes('ladder'))).toHaveLength(1);

		const transporting = reduceSnakes(moving, {
			type: 'COUNTER_SETTLED',
			effectId: moving.effectId
		}).state;
		expect(transporting.phase).toBe('resolving-transport');
		const restoredTransport = parseSnakesState(JSON.stringify({ version: 1, state: transporting }));
		expect(restoredTransport.phase).toBe('awaiting-roll');
		expect(
			restoredTransport.counters.find((counter) => counter.playerId === 'human')?.position
		).toBe(22);
		expect(restoredTransport.history.filter((entry) => entry.text.includes('ladder'))).toHaveLength(
			1
		);
	});

	it('rejects fabricated Saap-Ludo pending move semantics', () => {
		const moving = snakesMovingOntoLadder();
		const invalidSaves = [
			corruptedSave(moving, (saved) => {
				saved.pendingMove!.from = 1;
			}),
			corruptedSave(moving, (saved) => {
				saved.pendingMove!.landed = 4;
			}),
			corruptedSave(moving, (saved) => {
				saved.pendingMove!.transport = { type: 'ladder', from: 3, to: 23 };
			}),
			corruptedSave(moving, (saved) => {
				saved.pendingMove!.entered = true;
			}),
			corruptedSave(moving, (saved) => {
				saved.pendingMove!.overshoot = true;
			}),
			corruptedSave(moving, (saved) => {
				saved.pendingMove!.bonus = true;
				saved.pendingBonus = true;
			}),
			corruptedSave(moving, (saved) => {
				saved.die = 2;
			}),
			corruptedSave(moving, (saved) => {
				saved.counters.find((counter) => counter.playerId === 'human')!.position = 4;
			})
		];

		for (const raw of invalidSaves) {
			expect(parseSnakesState(raw)).toMatchObject({
				phase: 'setup',
				players: [],
				counters: []
			});
		}
	});

	it('accepts canonical Saap-Ludo entry, overshoot, and winning pending moves', () => {
		let entry: SnakesState = {
			...playableSnakes(),
			phase: 'die-rolling',
			die: 1,
			effectId: 41
		};
		entry = reduceSnakes(entry, { type: 'DIE_SETTLED', effectId: entry.effectId }).state;
		expect(
			parseSnakesState(serializeSnakesState(entry)).counters.find(
				(counter) => counter.playerId === 'human'
			)?.position
		).toBe(1);

		let overshoot: SnakesState = {
			...playableSnakes(),
			counters: playableSnakes().counters.map((counter) =>
				counter.playerId === 'human' ? { ...counter, position: 98 } : counter
			),
			phase: 'die-rolling',
			die: 3,
			effectId: 42
		};
		overshoot = reduceSnakes(overshoot, {
			type: 'DIE_SETTLED',
			effectId: overshoot.effectId
		}).state;
		expect(
			parseSnakesState(serializeSnakesState(overshoot)).counters.find(
				(counter) => counter.playerId === 'human'
			)?.position
		).toBe(98);

		let winning: SnakesState = {
			...playableSnakes(),
			counters: playableSnakes().counters.map((counter) =>
				counter.playerId === 'human' ? { ...counter, position: 99 } : counter
			),
			phase: 'die-rolling',
			die: 1,
			effectId: 43
		};
		winning = reduceSnakes(winning, {
			type: 'DIE_SETTLED',
			effectId: winning.effectId
		}).state;
		winning = reduceSnakes(winning, {
			type: 'COUNTER_SETTLED',
			effectId: winning.effectId
		}).state;
		expect(parseSnakesState(serializeSnakesState(winning))).toMatchObject({
			phase: 'game-over',
			winnerId: 'human'
		});
	});

	it('stores and restores the two board faces independently', () => {
		const storage = new MemoryStorage();
		const ludo = playableLudo(101);
		const snakesStarted = startSnakesGame(DEFAULT_SNAKES_SETUP, 202);
		const snakes = {
			...snakesStarted,
			phase: 'awaiting-roll' as const,
			opening: { ...snakesStarted.opening, contenders: [] },
			turnIndex: snakesStarted.players.findIndex((player) => player.id === 'human')
		};
		saveLudoState(storage, ludo);
		saveSnakesState(storage, snakes);
		expect(storage.getItem(LUDO_STORAGE_KEY)).not.toBe(storage.getItem(SNAKES_STORAGE_KEY));
		expect(loadLudoState(storage).rngState).toBe(ludo.rngState);
		expect(loadSnakesState(storage).rngState).toBe(snakes.rngState);
	});

	it('pauses and resumes browser-hidden matches without advancing a turn', () => {
		const ludo = playableLudo();
		const paused = reduceLudo(ludo, { type: 'PAUSE' }).state;
		expect(paused.phase).toBe('paused');
		expect(paused.turnId).toBe(ludo.turnId);
		const resumed = reduceLudo(paused, { type: 'RESUME' }).state;
		expect(resumed.phase).toBe('awaiting-roll');
		expect(resumed.turnId).toBe(ludo.turnId);

		const snakesStarted = startSnakesGame(DEFAULT_SNAKES_SETUP, 1);
		const snakes = {
			...snakesStarted,
			phase: 'awaiting-roll' as const,
			opening: { ...snakesStarted.opening, contenders: [] }
		};
		const snakesPaused = reduceSnakes(snakes, { type: 'PAUSE' }).state;
		expect(reduceSnakes(snakesPaused, { type: 'RESUME' }).state.turnId).toBe(snakes.turnId);
	});

	it('persists sound and pace preferences and rejects malformed values', () => {
		const serialized = serializePreferences({ sound: true, pace: 'relaxed' });
		expect(parsePreferences(serialized)).toEqual({ sound: true, pace: 'relaxed' });
		expect(parsePreferences('{"version":2}')).toEqual({ sound: false, pace: 'normal' });
		expect(parsePreferences('not json')).toEqual({ sound: false, pace: 'normal' });
	});

	it('fails invalid saved schemas safely to setup', () => {
		expect(parseLudoState('{"version":1,"state":{"game":"ludo"}}').phase).toBe('setup');
		expect(parseSnakesState('{"version":1,"state":{"game":"saap-ludo"}}').phase).toBe('setup');
		expect(parseLudoState('{broken').phase).toBe('setup');
		expect(parseSnakesState('{broken').phase).toBe('setup');
	});

	it('rejects deeply malformed nested game records instead of partially restoring them', () => {
		const ludo = playableLudo();
		let movingLudo: LudoState = {
			...ludo,
			phase: 'die-rolling' as const,
			die: 6,
			consecutiveSixes: 1,
			effectId: ludo.effectId + 1
		};
		movingLudo = reduceLudo(movingLudo, {
			type: 'DIE_SETTLED',
			effectId: movingLudo.effectId
		}).state;
		movingLudo = reduceLudo(movingLudo, {
			type: 'MOVE',
			playerId: 'human',
			moveId: movingLudo.legalMoves[0].id
		}).state;

		const invalidLudoSaves = [
			corruptedSave(ludo, (state) => {
				state.setup.houseRules.blockades = 'yes' as unknown as boolean;
			}),
			corruptedSave(ludo, (state) => {
				state.tokens[0].position = { kind: 'track', progress: 52 };
			}),
			corruptedSave(ludo, (state) => {
				state.opening.contenders = ['missing-player'];
				state.opening.cursor = 0;
			}),
			corruptedSave(movingLudo, (state) => {
				state.pendingMove!.move.path = [{ kind: 'home', index: 5 }];
			})
		];
		for (const raw of invalidLudoSaves) {
			expect(parseLudoState(raw)).toMatchObject({ phase: 'setup', players: [], tokens: [] });
		}

		const snakes = playableSnakes();
		const movingSnakes = snakesMovingOntoLadder();
		const invalidSnakesSaves = [
			corruptedSave(snakes, (state) => {
				state.setup.houseRules.requireOneToEnter = 'one' as unknown as boolean;
			}),
			corruptedSave(snakes, (state) => {
				state.counters[0].position = 101;
			}),
			corruptedSave(snakes, (state) => {
				state.opening.contenders = ['missing-player'];
				state.opening.cursor = 0;
			}),
			corruptedSave(movingSnakes, (state) => {
				state.pendingMove!.transport!.to = 101;
			})
		];
		for (const raw of invalidSnakesSaves) {
			expect(parseSnakesState(raw)).toMatchObject({
				phase: 'setup',
				players: [],
				counters: []
			});
		}
	});

	it('falls back safely when storage reads or writes throw', () => {
		const throwingStorage = {
			getItem() {
				throw new Error('storage read denied');
			},
			setItem() {
				throw new Error('storage write denied');
			},
			removeItem() {
				throw new Error('storage remove denied');
			}
		};

		expect(loadLudoState(throwingStorage).phase).toBe('setup');
		expect(loadSnakesState(throwingStorage).phase).toBe('setup');
		expect(loadPreferences(throwingStorage)).toEqual({ sound: false, pace: 'normal' });
		expect(saveLudoState(throwingStorage, playableLudo())).toBe(false);
		expect(saveSnakesState(throwingStorage, playableSnakes())).toBe(false);
		expect(savePreferences(throwingStorage, { sound: true, pace: 'brisk' })).toBe(false);
	});
});
