import { nextDie } from '../rng';
import { createPlayers, currentPlayer, pushHistory } from '../shared';
import { chooseLudoBotMove } from './bot';
import { applyLudoMove, getLegalLudoMoves } from './legal';
import type {
	LudoAction,
	LudoEffect,
	LudoHouseRules,
	LudoMove,
	LudoPhase,
	LudoSetup,
	LudoState,
	LudoTransition
} from './types';

export const DEFAULT_LUDO_HOUSE_RULES: LudoHouseRules = {
	extraThrowAfterCapture: true,
	extraThrowAfterHome: true,
	blockades: true
};

export const DEFAULT_LUDO_SETUP: LudoSetup = {
	humanName: 'You',
	humanColor: 'red',
	computerCount: 3,
	houseRules: { ...DEFAULT_LUDO_HOUSE_RULES }
};

function transition(state: LudoState, effects: LudoEffect[] = []): LudoTransition {
	return { state, effects };
}

export function createLudoSetupState(setup: Partial<LudoSetup> = {}): LudoState {
	return {
		game: 'ludo',
		version: 1,
		phase: 'setup',
		pausedFrom: null,
		setup: {
			...DEFAULT_LUDO_SETUP,
			...setup,
			houseRules: { ...DEFAULT_LUDO_HOUSE_RULES, ...setup.houseRules }
		},
		players: [],
		tokens: [],
		turnIndex: 0,
		turnId: 0,
		effectId: 0,
		rngState: 1,
		die: null,
		consecutiveSixes: 0,
		legalMoves: [],
		opening: { contenders: [], cursor: 0, scores: {} },
		pendingMove: null,
		pendingBonus: false,
		winnerId: null,
		announcement: 'Choose the table and start a new Ludo match.',
		history: []
	};
}

export function configureLudoSetup(state: LudoState, setup: Partial<LudoSetup>) {
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

export function startLudoGame(setup: LudoSetup, seed: number): LudoState {
	const created = createPlayers(setup.humanName, setup.humanColor, setup.computerCount, seed);
	const scores = Object.fromEntries(created.players.map((player) => [player.id, null]));
	return {
		game: 'ludo',
		version: 1,
		phase: 'opening-roll',
		pausedFrom: null,
		setup: {
			...setup,
			houseRules: { ...setup.houseRules }
		},
		players: created.players,
		tokens: created.players.flatMap((player) =>
			Array.from({ length: 4 }, (_, number) => ({
				id: `${player.id}-token-${number + 1}`,
				playerId: player.id,
				color: player.color,
				number,
				position: { kind: 'yard' as const }
			}))
		),
		turnIndex: 0,
		turnId: 1,
		effectId: 1,
		rngState: created.rngState,
		die: null,
		consecutiveSixes: 0,
		legalMoves: [],
		opening: {
			contenders: created.players.map((player) => player.id),
			cursor: 0,
			scores
		},
		pendingMove: null,
		pendingBonus: false,
		winnerId: null,
		announcement: `${created.players[0].name}: opening throw. Highest starts.`,
		history: []
	};
}

export function openingPlayer(state: LudoState) {
	const id = state.opening.contenders[state.opening.cursor];
	return state.players.find((player) => player.id === id) ?? null;
}

function isExpectedRoller(state: LudoState, playerId: string) {
	if (state.phase === 'opening-roll') return openingPlayer(state)?.id === playerId;
	if (state.phase === 'awaiting-roll') return currentPlayer(state)?.id === playerId;
	return false;
}

function settleOpeningRoll(state: LudoState): LudoTransition {
	const nextCursor = state.opening.cursor + 1;
	if (nextCursor < state.opening.contenders.length) {
		const nextId = state.opening.contenders[nextCursor];
		const nextPlayer = state.players.find((player) => player.id === nextId)!;
		return transition({
			...state,
			phase: 'opening-roll',
			effectId: state.effectId + 1,
			die: null,
			opening: { ...state.opening, cursor: nextCursor },
			announcement: `${nextPlayer.name}: opening throw.`
		});
	}

	const scored = state.opening.contenders.map((id) => ({
		id,
		score: state.opening.scores[id] ?? 0
	}));
	const highest = Math.max(...scored.map((entry) => entry.score));
	const tied = scored.filter((entry) => entry.score === highest).map((entry) => entry.id);
	if (tied.length > 1) {
		const scores = { ...state.opening.scores };
		for (const id of tied) scores[id] = null;
		const names = tied
			.map((id) => state.players.find((player) => player.id === id)!.name)
			.join(' and ');
		const effectId = state.effectId + 1;
		return transition({
			...state,
			phase: 'opening-roll',
			effectId,
			die: null,
			opening: { contenders: tied, cursor: 0, scores },
			announcement: `Opening tie: ${names} throw again.`,
			history: pushHistory(state.history, effectId, `Opening tie on ${highest}.`)
		});
	}

	const starterId = tied[0];
	const turnIndex = state.players.findIndex((player) => player.id === starterId);
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

function settleGameplayRoll(state: LudoState): LudoTransition {
	const player = currentPlayer(state);
	if (state.die === 6 && state.consecutiveSixes >= 3) {
		const effectId = state.effectId + 1;
		return transition(
			{
				...state,
				phase: 'changing-turn',
				effectId,
				legalMoves: [],
				pendingBonus: false,
				announcement: 'Third consecutive six — discarded. Turn over.',
				history: pushHistory(state.history, effectId, `${player.name}'s third six was discarded.`)
			},
			[{ type: 'delay', effectId, kind: 'no-move' }]
		);
	}

	const legalMoves = getLegalLudoMoves(state);
	if (legalMoves.length === 0) {
		const pendingBonus = state.die === 6;
		const effectId = state.effectId + 1;
		return transition(
			{
				...state,
				phase: pendingBonus ? 'resolving-bonus' : 'changing-turn',
				effectId,
				legalMoves: [],
				pendingBonus,
				announcement: 'কোনো চাল নেই / No legal move',
				history: pushHistory(state.history, effectId, `${player.name}: no legal move.`)
			},
			[{ type: 'delay', effectId, kind: 'no-move' }]
		);
	}

	return transition({
		...state,
		phase: player.kind === 'human' ? 'awaiting-human-token' : 'computer-choosing',
		effectId: state.effectId + 1,
		legalMoves,
		announcement:
			player.kind === 'human'
				? `${legalMoves.length} legal ${legalMoves.length === 1 ? 'move' : 'moves'}. Choose a token.`
				: `${player.name} is considering ${legalMoves.length === 1 ? 'the move' : 'the board'}.`
	});
}

function commitMove(state: LudoState, move: LudoMove, rngState = state.rngState): LudoTransition {
	const applied = applyLudoMove(state, move);
	const player = currentPlayer(state);
	const finishedCount = applied.tokens.filter(
		(token) => token.playerId === player.id && token.position.kind === 'finished'
	).length;
	const winnerId = finishedCount === 4 ? player.id : null;
	const bonusReasons: ('six' | 'capture' | 'home')[] = [];
	if (state.die === 6) bonusReasons.push('six');
	if (applied.capturedTokenIds.length > 0 && state.setup.houseRules.extraThrowAfterCapture) {
		bonusReasons.push('capture');
	}
	if (applied.finished && state.setup.houseRules.extraThrowAfterHome) bonusReasons.push('home');
	const effectId = state.effectId + 1;
	return transition(
		{
			...state,
			phase: 'token-moving',
			effectId,
			rngState,
			tokens: applied.tokens,
			legalMoves: [],
			pendingBonus: bonusReasons.length > 0,
			pendingMove: {
				move,
				capturedTokenIds: applied.capturedTokenIds,
				finished: applied.finished,
				enteredHomeLane: applied.enteredHomeLane,
				bonus: bonusReasons.length > 0,
				bonusReasons,
				winnerId
			},
			announcement: `${player.name} moves token ${state.tokens.find((token) => token.id === move.tokenId)!.number + 1}.`
		},
		[{ type: 'move', effectId, tokenId: move.tokenId, path: move.path }]
	);
}

function settleMove(state: LudoState): LudoTransition {
	if (!state.pendingMove) return transition(state);
	const player = currentPlayer(state);
	const move = state.pendingMove;
	let message = `${player.name} moved token ${state.tokens.find((token) => token.id === move.move.tokenId)!.number + 1}.`;
	let announcement = message;
	if (move.capturedTokenIds.length > 0) {
		message = `${player.name} captured a token.`;
		announcement = 'গুটি কাটা গেল / Token captured';
	} else if (move.finished) {
		message = `${player.name} brought a token home.`;
		announcement = 'ঘরে পৌঁছল / Reached home';
	} else if (move.move.kind === 'enter') {
		message = `${player.name} entered a token.`;
		announcement = 'পুট—গুটি বেরোল / A token entered';
	} else if (move.enteredHomeLane) {
		message = `${player.name} entered the private home lane.`;
		announcement = message;
	}
	const effectId = state.effectId + 1;
	return transition(
		{
			...state,
			phase: 'resolving-landing',
			effectId,
			announcement,
			history: pushHistory(state.history, effectId, message)
		},
		[{ type: 'delay', effectId, kind: 'landing' }]
	);
}

function settleLanding(state: LudoState): LudoTransition {
	if (!state.pendingMove) return transition(state);
	const winnerId = state.pendingMove.winnerId;
	const effectId = state.effectId + 1;
	if (winnerId) {
		const winner = state.players.find((player) => player.id === winnerId)!;
		return transition({
			...state,
			phase: 'game-over',
			effectId,
			winnerId,
			pendingBonus: false,
			announcement: `${winner.name} wins — all four tokens are home.`,
			history: pushHistory(state.history, effectId, `${winner.name} won the match.`)
		});
	}
	return transition({
		...state,
		phase: 'resolving-bonus',
		effectId,
		announcement: state.pendingBonus ? 'An extra throw is due.' : 'Turn complete.'
	});
}

function settleBonus(state: LudoState): LudoTransition {
	const effectId = state.effectId + 1;
	if (state.pendingBonus) {
		const reasons = state.pendingMove?.bonusReasons ?? (state.die === 6 ? ['six'] : []);
		const announcement = reasons.includes('six')
			? 'ছক্কা! আবার দাও / Six — throw again'
			: reasons.includes('capture')
				? 'Capture — throw again.'
				: 'Reached home — throw again.';
		return transition({
			...state,
			phase: 'awaiting-roll',
			effectId,
			die: null,
			legalMoves: [],
			pendingMove: null,
			pendingBonus: false,
			announcement
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

function changeTurn(state: LudoState): LudoTransition {
	const turnIndex = (state.turnIndex + 1) % state.players.length;
	const player = state.players[turnIndex];
	const effectId = state.effectId + 1;
	return transition({
		...state,
		phase: 'awaiting-roll',
		turnIndex,
		turnId: state.turnId + 1,
		effectId,
		die: null,
		consecutiveSixes: 0,
		legalMoves: [],
		pendingMove: null,
		pendingBonus: false,
		announcement: player.kind === 'human' ? 'তোমার দান / Your throw' : `${player.name}'s throw.`
	});
}

export function reduceLudo(state: LudoState, action: LudoAction): LudoTransition {
	switch (action.type) {
		case 'ROLL': {
			if (!isExpectedRoller(state, action.playerId)) return transition(state);
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
					consecutiveSixes:
						state.phase === 'opening-roll' ? 0 : roll.value === 6 ? state.consecutiveSixes + 1 : 0,
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
			return state.opening.contenders.length > 0
				? settleOpeningRoll(state)
				: settleGameplayRoll(state);
		case 'MOVE': {
			if (
				state.phase !== 'awaiting-human-token' ||
				currentPlayer(state).id !== action.playerId ||
				currentPlayer(state).kind !== 'human'
			) {
				return transition(state);
			}
			const move = state.legalMoves.find((candidate) => candidate.id === action.moveId);
			return move ? commitMove(state, move) : transition(state);
		}
		case 'BOT_CHOOSE': {
			if (
				state.phase !== 'computer-choosing' ||
				action.effectId !== state.effectId ||
				currentPlayer(state).kind !== 'computer'
			) {
				return transition(state);
			}
			const choice = chooseLudoBotMove(state, state.legalMoves);
			return commitMove(state, choice.move, choice.rngState);
		}
		case 'MOVE_SETTLED':
			return state.phase === 'token-moving' && action.effectId === state.effectId
				? settleMove(state)
				: transition(state);
		case 'LANDING_SETTLED':
			return state.phase === 'resolving-landing' && action.effectId === state.effectId
				? settleLanding(state)
				: transition(state);
		case 'BONUS_SETTLED':
			return state.phase === 'resolving-bonus' && action.effectId === state.effectId
				? settleBonus(state)
				: transition(state);
		case 'TURN_SETTLED':
			return state.phase === 'changing-turn' && action.effectId === state.effectId
				? changeTurn(state)
				: transition(state);
		case 'PAUSE': {
			if (state.phase === 'paused' || state.phase === 'setup' || state.phase === 'game-over') {
				return transition(state);
			}
			return transition({
				...state,
				phase: 'paused',
				pausedFrom: state.phase as Exclude<LudoPhase, 'paused'>,
				effectId: state.effectId + 1,
				announcement: 'Match paused.'
			});
		}
		case 'RESUME': {
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
}

export function restoreLudoState(saved: LudoState) {
	// An inactive board owns the pause boundary. Loading its save must not
	// consume a committed roll or move before the active controller resumes it.
	if (saved.phase === 'paused') return saved;

	let state = saved;

	for (let count = 0; count < 10; count += 1) {
		if (state.phase === 'die-rolling') {
			state = reduceLudo(state, { type: 'DIE_SETTLED', effectId: state.effectId }).state;
			continue;
		}
		if (state.phase === 'token-moving') {
			state = reduceLudo(state, { type: 'MOVE_SETTLED', effectId: state.effectId }).state;
			continue;
		}
		if (state.phase === 'resolving-landing') {
			state = reduceLudo(state, { type: 'LANDING_SETTLED', effectId: state.effectId }).state;
			continue;
		}
		if (state.phase === 'resolving-bonus') {
			state = reduceLudo(state, { type: 'BONUS_SETTLED', effectId: state.effectId }).state;
			continue;
		}
		if (state.phase === 'changing-turn') {
			state = reduceLudo(state, { type: 'TURN_SETTLED', effectId: state.effectId }).state;
			continue;
		}
		if (state.phase === 'checking-moves') {
			state = { ...state, phase: 'awaiting-roll', die: null, legalMoves: [] };
			continue;
		}
		break;
	}
	return state;
}

export function isCustomLudoRules(rules: LudoHouseRules) {
	return (
		rules.extraThrowAfterCapture !== DEFAULT_LUDO_HOUSE_RULES.extraThrowAfterCapture ||
		rules.extraThrowAfterHome !== DEFAULT_LUDO_HOUSE_RULES.extraThrowAfterHome ||
		rules.blockades !== DEFAULT_LUDO_HOUSE_RULES.blockades
	);
}
