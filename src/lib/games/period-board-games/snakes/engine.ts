import { nextDie } from '../rng';
import { createPlayers, currentPlayer, pushHistory } from '../shared';
import { squaresBetween, transportAt } from './board';
import type {
	SnakesAction,
	SnakesEffect,
	SnakesHouseRules,
	SnakesPhase,
	SnakesSetup,
	SnakesState,
	SnakesTransition
} from './types';

export const DEFAULT_SNAKES_HOUSE_RULES: SnakesHouseRules = {
	requireOneToEnter: true,
	extraThrowAfterSix: true
};

export const DEFAULT_SNAKES_SETUP: SnakesSetup = {
	humanName: 'You',
	humanColor: 'red',
	computerCount: 3,
	houseRules: { ...DEFAULT_SNAKES_HOUSE_RULES }
};

function transition(state: SnakesState, effects: SnakesEffect[] = []): SnakesTransition {
	return { state, effects };
}

export function createSnakesSetupState(setup: Partial<SnakesSetup> = {}): SnakesState {
	return {
		game: 'saap-ludo',
		version: 1,
		phase: 'setup',
		pausedFrom: null,
		setup: {
			...DEFAULT_SNAKES_SETUP,
			...setup,
			houseRules: { ...DEFAULT_SNAKES_HOUSE_RULES, ...setup.houseRules }
		},
		players: [],
		counters: [],
		turnIndex: 0,
		turnId: 0,
		effectId: 0,
		rngState: 1,
		die: null,
		opening: { contenders: [], cursor: 0, scores: {} },
		pendingMove: null,
		pendingBonus: false,
		winnerId: null,
		announcement: 'Choose the table and start a new Saap-Ludo match.',
		history: []
	};
}

export function configureSnakesSetup(state: SnakesState, setup: Partial<SnakesSetup>) {
	if (state.phase !== 'setup') return state;
	return {
		...state,
		setup: {
			...state.setup,
			...setup,
			houseRules: { ...state.setup.houseRules, ...setup.houseRules }
		}
	};
}

export function startSnakesGame(setup: SnakesSetup, seed: number): SnakesState {
	const created = createPlayers(setup.humanName, setup.humanColor, setup.computerCount, seed);
	return {
		game: 'saap-ludo',
		version: 1,
		phase: 'opening-roll',
		pausedFrom: null,
		setup: { ...setup, houseRules: { ...setup.houseRules } },
		players: created.players,
		counters: created.players.map((player) => ({
			id: `${player.id}-counter`,
			playerId: player.id,
			color: player.color,
			position: 0
		})),
		turnIndex: 0,
		turnId: 1,
		effectId: 1,
		rngState: created.rngState,
		die: null,
		opening: {
			contenders: created.players.map((player) => player.id),
			cursor: 0,
			scores: Object.fromEntries(created.players.map((player) => [player.id, null]))
		},
		pendingMove: null,
		pendingBonus: false,
		winnerId: null,
		announcement: `${created.players[0].name}: opening throw. Highest starts.`,
		history: []
	};
}

export function openingSnakesPlayer(state: SnakesState) {
	const id = state.opening.contenders[state.opening.cursor];
	return state.players.find((player) => player.id === id) ?? null;
}

function expectedRoller(state: SnakesState, playerId: string) {
	if (state.phase === 'opening-roll') return openingSnakesPlayer(state)?.id === playerId;
	if (state.phase === 'awaiting-roll') return currentPlayer(state)?.id === playerId;
	return false;
}

function settleOpening(state: SnakesState): SnakesTransition {
	const nextCursor = state.opening.cursor + 1;
	if (nextCursor < state.opening.contenders.length) {
		const next = state.players.find(
			(player) => player.id === state.opening.contenders[nextCursor]
		)!;
		return transition({
			...state,
			phase: 'opening-roll',
			effectId: state.effectId + 1,
			die: null,
			opening: { ...state.opening, cursor: nextCursor },
			announcement: `${next.name}: opening throw.`
		});
	}

	const entries = state.opening.contenders.map((id) => ({
		id,
		score: state.opening.scores[id] ?? 0
	}));
	const highest = Math.max(...entries.map((entry) => entry.score));
	const tied = entries.filter((entry) => entry.score === highest).map((entry) => entry.id);
	if (tied.length > 1) {
		const scores = { ...state.opening.scores };
		for (const id of tied) scores[id] = null;
		const effectId = state.effectId + 1;
		return transition({
			...state,
			phase: 'opening-roll',
			effectId,
			die: null,
			opening: { contenders: tied, cursor: 0, scores },
			announcement: 'Opening tie — the tied players throw again.',
			history: pushHistory(state.history, effectId, `Opening tie on ${highest}.`)
		});
	}

	const turnIndex = state.players.findIndex((player) => player.id === tied[0]);
	const starter = state.players[turnIndex];
	const effectId = state.effectId + 1;
	return transition({
		...state,
		phase: 'awaiting-roll',
		turnIndex,
		turnId: state.turnId + 1,
		effectId,
		die: null,
		opening: { ...state.opening, contenders: [], cursor: 0 },
		announcement: `${starter.name} begins.`,
		history: pushHistory(state.history, effectId, `${starter.name} won the opening throw.`)
	});
}

function settleGameplayRoll(state: SnakesState): SnakesTransition {
	const player = currentPlayer(state);
	const counter = state.counters.find((candidate) => candidate.playerId === player.id)!;
	const die = state.die!;
	const effectId = state.effectId + 1;

	if (counter.position === 0 && state.setup.houseRules.requireOneToEnter && die !== 1) {
		return transition(
			{
				...state,
				phase: 'changing-turn',
				effectId,
				pendingBonus: false,
				announcement: `${player.name} needs exactly one to enter.`,
				history: pushHistory(state.history, effectId, `${player.name} stayed off the board.`)
			},
			[{ type: 'delay', effectId, kind: 'no-move' }]
		);
	}

	const entered = counter.position === 0 && state.setup.houseRules.requireOneToEnter;
	const target = entered ? 1 : counter.position + die;
	if (target > 100) {
		const bonus = counter.position > 0 && die === 6 && state.setup.houseRules.extraThrowAfterSix;
		return transition(
			{
				...state,
				phase: 'counter-moving',
				effectId,
				pendingBonus: bonus,
				pendingMove: {
					from: counter.position,
					landed: counter.position,
					transport: null,
					entered: false,
					overshoot: true,
					bonus
				},
				announcement: `Exact roll required. ${player.name} stays on ${counter.position}.`,
				history: pushHistory(state.history, effectId, `${player.name} overshot 100 and stayed put.`)
			},
			[{ type: 'counter', effectId, squares: [] }]
		);
	}

	const transport = transportAt(target);
	const bonus = !entered && die === 6 && state.setup.houseRules.extraThrowAfterSix;
	return transition(
		{
			...state,
			phase: 'counter-moving',
			effectId,
			counters: state.counters.map((candidate) =>
				candidate.id === counter.id ? { ...candidate, position: target } : candidate
			),
			pendingBonus: bonus,
			pendingMove: {
				from: counter.position,
				landed: target,
				transport,
				entered,
				overshoot: false,
				bonus
			},
			announcement: entered
				? `${player.name} enters square 1.`
				: `${player.name} moves to ${target}.`
		},
		[
			{
				type: 'counter',
				effectId,
				squares: entered ? [1] : squaresBetween(counter.position, target)
			}
		]
	);
}

function settleCounter(state: SnakesState): SnakesTransition {
	if (!state.pendingMove) return transition(state);
	const player = currentPlayer(state);
	const move = state.pendingMove;
	const effectId = state.effectId + 1;
	if (move.transport) {
		return transition(
			{
				...state,
				phase: 'resolving-transport',
				effectId,
				counters: state.counters.map((counter) =>
					counter.playerId === player.id ? { ...counter, position: move.transport!.to } : counter
				),
				announcement:
					move.transport.type === 'ladder'
						? 'মই বেয়ে ওপরে / Up the ladder'
						: 'সাপের মুখে! / A snake!',
				history: pushHistory(
					state.history,
					effectId,
					`${player.name} took a ${move.transport.type} from ${move.transport.from} to ${move.transport.to}.`
				)
			},
			[{ type: 'delay', effectId, kind: 'transport' }]
		);
	}

	if (move.landed === 100) {
		return transition({
			...state,
			phase: 'game-over',
			effectId,
			winnerId: player.id,
			pendingBonus: false,
			announcement: `${player.name} reaches 100 and wins.`,
			history: pushHistory(state.history, effectId, `${player.name} won the match.`)
		});
	}

	return transition({
		...state,
		phase: 'resolving-bonus',
		effectId,
		announcement: move.entered
			? `${player.name} entered; the entry throw ends the turn.`
			: move.overshoot
				? `${player.name} remains on ${move.landed}.`
				: `${player.name} reached ${move.landed}.`,
		history: move.overshoot
			? state.history
			: pushHistory(state.history, effectId, `${player.name} reached square ${move.landed}.`)
	});
}

function settleTransport(state: SnakesState): SnakesTransition {
	const effectId = state.effectId + 1;
	return transition({
		...state,
		phase: 'resolving-bonus',
		effectId,
		announcement: state.pendingBonus ? 'Six — throw again.' : 'Transport complete.'
	});
}

function settleBonus(state: SnakesState): SnakesTransition {
	const effectId = state.effectId + 1;
	if (state.pendingBonus) {
		return transition({
			...state,
			phase: 'awaiting-roll',
			effectId,
			die: null,
			pendingBonus: false,
			pendingMove: null,
			announcement: 'ছক্কা! আবার দাও / Six — throw again'
		});
	}
	return transition({
		...state,
		phase: 'changing-turn',
		effectId,
		pendingMove: null,
		announcement: 'Passing the die.'
	});
}

function changeTurn(state: SnakesState): SnakesTransition {
	const turnIndex = (state.turnIndex + 1) % state.players.length;
	const player = state.players[turnIndex];
	return transition({
		...state,
		phase: 'awaiting-roll',
		turnIndex,
		turnId: state.turnId + 1,
		effectId: state.effectId + 1,
		die: null,
		pendingBonus: false,
		pendingMove: null,
		announcement: player.kind === 'human' ? 'তোমার দান / Your throw' : `${player.name}'s throw.`
	});
}

export function reduceSnakes(state: SnakesState, action: SnakesAction): SnakesTransition {
	switch (action.type) {
		case 'ROLL': {
			if (!expectedRoller(state, action.playerId)) return transition(state);
			const roll = nextDie(state.rngState);
			const effectId = state.effectId + 1;
			const opening =
				state.phase === 'opening-roll'
					? {
							...state.opening,
							scores: { ...state.opening.scores, [action.playerId]: roll.value }
						}
					: state.opening;
			const player = state.players.find((candidate) => candidate.id === action.playerId)!;
			return transition(
				{
					...state,
					phase: 'die-rolling',
					effectId,
					rngState: roll.state,
					die: roll.value,
					opening,
					announcement: `${player.name} rolled ${roll.value}.`,
					history: pushHistory(state.history, effectId, `${player.name} rolled ${roll.value}.`)
				},
				[{ type: 'delay', effectId, kind: 'die' }]
			);
		}
		case 'DIE_SETTLED':
			if (state.phase !== 'die-rolling' || action.effectId !== state.effectId)
				return transition(state);
			return state.opening.contenders.length > 0 ? settleOpening(state) : settleGameplayRoll(state);
		case 'COUNTER_SETTLED':
			return state.phase === 'counter-moving' && action.effectId === state.effectId
				? settleCounter(state)
				: transition(state);
		case 'TRANSPORT_SETTLED':
			return state.phase === 'resolving-transport' && action.effectId === state.effectId
				? settleTransport(state)
				: transition(state);
		case 'BONUS_SETTLED':
			return state.phase === 'resolving-bonus' && action.effectId === state.effectId
				? settleBonus(state)
				: transition(state);
		case 'TURN_SETTLED':
			return state.phase === 'changing-turn' && action.effectId === state.effectId
				? changeTurn(state)
				: transition(state);
		case 'PAUSE':
			if (state.phase === 'setup' || state.phase === 'paused' || state.phase === 'game-over') {
				return transition(state);
			}
			return transition({
				...state,
				phase: 'paused',
				pausedFrom: state.phase as Exclude<SnakesPhase, 'paused'>,
				effectId: state.effectId + 1,
				announcement: 'Match paused.'
			});
		case 'RESUME':
			if (state.phase !== 'paused' || !state.pausedFrom) return transition(state);
			return transition({
				...state,
				phase: state.pausedFrom,
				pausedFrom: null,
				effectId: state.effectId + 1,
				announcement: 'Match resumed.'
			});
	}
}

export function restoreSnakesState(saved: SnakesState) {
	// Preserve inactive-board saves exactly. Only the active controller may
	// dispatch RESUME and restart the interrupted presentation phase.
	if (saved.phase === 'paused') return saved;

	let state = saved;
	for (let count = 0; count < 10; count += 1) {
		if (state.phase === 'die-rolling') {
			state = reduceSnakes(state, { type: 'DIE_SETTLED', effectId: state.effectId }).state;
			continue;
		}
		if (state.phase === 'counter-moving') {
			state = reduceSnakes(state, { type: 'COUNTER_SETTLED', effectId: state.effectId }).state;
			continue;
		}
		if (state.phase === 'resolving-transport') {
			state = reduceSnakes(state, { type: 'TRANSPORT_SETTLED', effectId: state.effectId }).state;
			continue;
		}
		if (state.phase === 'resolving-bonus') {
			state = reduceSnakes(state, { type: 'BONUS_SETTLED', effectId: state.effectId }).state;
			continue;
		}
		if (state.phase === 'changing-turn') {
			state = reduceSnakes(state, { type: 'TURN_SETTLED', effectId: state.effectId }).state;
			continue;
		}
		break;
	}
	return state;
}

export function isCustomSnakesRules(rules: SnakesHouseRules) {
	return (
		rules.requireOneToEnter !== DEFAULT_SNAKES_HOUSE_RULES.requireOneToEnter ||
		rules.extraThrowAfterSix !== DEFAULT_SNAKES_HOUSE_RULES.extraThrowAfterSix
	);
}
