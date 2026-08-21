import { createSnakesSetupState, restoreSnakesState } from './engine';
import { transportAt, type Transport } from './board';
import {
	hasValidPlayers,
	isBoolean,
	isComputerCount,
	isDie,
	isHistory,
	isNonNegativeInteger,
	isOpeningState,
	isPlayerColor,
	isRecord
} from '../persistence-validation';
import type {
	SnakesCounter,
	SnakesPendingMove,
	SnakesPhase,
	SnakesSetup,
	SnakesState
} from './types';

export const SNAKES_STORAGE_KEY = 'suvroghosh:games:saap-ludo:v1';
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const phases = new Set<SnakesPhase>([
	'setup',
	'opening-roll',
	'awaiting-roll',
	'die-rolling',
	'counter-moving',
	'resolving-transport',
	'resolving-bonus',
	'changing-turn',
	'paused',
	'game-over'
]);

const resumablePhases: ReadonlySet<SnakesPhase> = new Set(
	[...phases].filter((phase) => phase !== 'paused')
);

function isSnakesSetup(value: unknown): value is SnakesSetup {
	if (!isRecord(value) || !isRecord(value.houseRules)) return false;
	return (
		typeof value.humanName === 'string' &&
		value.humanName.length <= 24 &&
		isPlayerColor(value.humanColor) &&
		isComputerCount(value.computerCount) &&
		isBoolean(value.houseRules.requireOneToEnter) &&
		isBoolean(value.houseRules.extraThrowAfterSix)
	);
}

function isSnakesCounter(value: unknown): value is SnakesCounter {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === 'string' &&
		typeof value.playerId === 'string' &&
		isPlayerColor(value.color) &&
		isNonNegativeInteger(value.position) &&
		value.position <= 100
	);
}

function isTransport(value: unknown): value is Transport {
	if (!isRecord(value)) return false;
	return (
		(value.type === 'ladder' || value.type === 'snake') &&
		isNonNegativeInteger(value.from) &&
		value.from >= 1 &&
		value.from <= 100 &&
		isNonNegativeInteger(value.to) &&
		value.to >= 1 &&
		value.to <= 100
	);
}

function sameTransport(left: Transport | null, right: Transport | null) {
	return (
		(left === null && right === null) ||
		(left !== null &&
			right !== null &&
			left.type === right.type &&
			left.from === right.from &&
			left.to === right.to)
	);
}

function isPendingMove(value: unknown): value is SnakesPendingMove {
	if (!isRecord(value)) return false;
	return (
		isNonNegativeInteger(value.from) &&
		value.from <= 100 &&
		isNonNegativeInteger(value.landed) &&
		value.landed <= 100 &&
		(value.transport === null || isTransport(value.transport)) &&
		isBoolean(value.entered) &&
		isBoolean(value.overshoot) &&
		isBoolean(value.bonus)
	);
}

function hasValidPendingMove(state: SnakesState) {
	const activePhase = state.phase === 'paused' ? state.pausedFrom : state.phase;
	const isPendingPhase =
		activePhase === 'counter-moving' ||
		activePhase === 'resolving-transport' ||
		activePhase === 'resolving-bonus' ||
		activePhase === 'game-over';
	if (!isPendingPhase) {
		return state.pendingMove === null && !state.pendingBonus && state.winnerId === null;
	}

	const pending = state.pendingMove;
	const player = state.players[state.turnIndex];
	const counter = player
		? state.counters.find((candidate) => candidate.playerId === player.id)
		: undefined;
	if (!pending || !player || !counter || state.die === null || pending.from >= 100) return false;
	if (pending.from === 0 && state.setup.houseRules.requireOneToEnter && state.die !== 1) {
		return false;
	}

	const entered = pending.from === 0 && state.setup.houseRules.requireOneToEnter;
	const target = entered ? 1 : pending.from + state.die;
	const overshoot = target > 100;
	const landed = overshoot ? pending.from : target;
	const transport = overshoot ? null : transportAt(landed);
	const bonus = !entered && state.die === 6 && state.setup.houseRules.extraThrowAfterSix;
	if (
		pending.landed !== landed ||
		!sameTransport(pending.transport, transport) ||
		pending.entered !== entered ||
		pending.overshoot !== overshoot ||
		pending.bonus !== bonus
	) {
		return false;
	}

	const expectedCounterPosition =
		activePhase === 'counter-moving' ? landed : (transport?.to ?? landed);
	if (counter.position !== expectedCounterPosition) return false;
	if (activePhase === 'resolving-transport' && transport === null) return false;
	if (activePhase === 'resolving-bonus' && landed === 100) return false;

	if (activePhase === 'game-over') {
		return (
			state.phase === 'game-over' &&
			landed === 100 &&
			transport === null &&
			state.winnerId === player.id &&
			!state.pendingBonus
		);
	}
	return state.winnerId === null && state.pendingBonus === bonus;
}

function isSnakesState(value: unknown): value is SnakesState {
	if (!isRecord(value)) return false;
	const state = value;
	const phase = state.phase as SnakesPhase;
	if (
		state.game !== 'saap-ludo' ||
		state.version !== 1 ||
		typeof state.phase !== 'string' ||
		!phases.has(phase) ||
		!isSnakesSetup(state.setup) ||
		!Array.isArray(state.players) ||
		!Array.isArray(state.counters) ||
		!state.counters.every(isSnakesCounter) ||
		!isNonNegativeInteger(state.turnIndex) ||
		!isNonNegativeInteger(state.turnId) ||
		!isNonNegativeInteger(state.effectId) ||
		!isNonNegativeInteger(state.rngState) ||
		!isDie(state.die) ||
		!isOpeningState(state.opening) ||
		!(state.pendingMove === null || isPendingMove(state.pendingMove)) ||
		!isBoolean(state.pendingBonus) ||
		!(state.winnerId === null || typeof state.winnerId === 'string') ||
		typeof state.announcement !== 'string' ||
		!isHistory(state.history) ||
		!(state.pausedFrom === null || resumablePhases.has(state.pausedFrom as SnakesPhase))
	) {
		return false;
	}

	const validState = state as unknown as SnakesState;
	if ((phase === 'paused') !== (validState.pausedFrom !== null)) return false;
	if (phase === 'setup') {
		return (
			validState.players.length === 0 &&
			validState.counters.length === 0 &&
			validState.turnIndex === 0 &&
			validState.pendingMove === null
		);
	}

	const expectedPlayers = validState.setup.computerCount + 1;
	if (!hasValidPlayers(validState.players, expectedPlayers)) return false;
	const playerIds = new Set(validState.players.map((player) => player.id));
	const human = validState.players.find((player) => player.kind === 'human');
	if (!human || human.color !== validState.setup.humanColor) return false;
	if (validState.turnIndex >= validState.players.length) return false;
	if (validState.counters.length !== validState.players.length) return false;
	if (new Set(validState.counters.map((counter) => counter.id)).size !== validState.counters.length)
		return false;
	if (
		validState.counters.some(
			(counter) =>
				!playerIds.has(counter.playerId) ||
				validState.players.find((player) => player.id === counter.playerId)?.color !== counter.color
		)
	) {
		return false;
	}
	if (
		new Set(validState.counters.map((counter) => counter.playerId)).size !==
		validState.players.length
	)
		return false;
	if (
		validState.opening.contenders.some((id) => !playerIds.has(id)) ||
		(validState.opening.contenders.length > 0 &&
			validState.opening.cursor >= validState.opening.contenders.length)
	) {
		return false;
	}
	if (!hasValidPendingMove(validState)) return false;
	if (validState.winnerId !== null && !playerIds.has(validState.winnerId)) return false;
	if (phase === 'opening-roll' && validState.opening.contenders.length === 0) return false;
	if (phase === 'game-over' && validState.winnerId === null) return false;
	return true;
}

export function serializeSnakesState(state: SnakesState) {
	return JSON.stringify({ version: 1, state });
}

export function parseSnakesState(raw: string | null) {
	if (!raw) return createSnakesSetupState();
	try {
		const record = JSON.parse(raw) as { version?: unknown; state?: unknown };
		if (record.version !== 1 || !isSnakesState(record.state)) return createSnakesSetupState();
		return restoreSnakesState(record.state);
	} catch {
		return createSnakesSetupState();
	}
}

export function loadSnakesState(storage: StorageLike) {
	try {
		return parseSnakesState(storage.getItem(SNAKES_STORAGE_KEY));
	} catch {
		return createSnakesSetupState();
	}
}

export function saveSnakesState(storage: StorageLike, state: SnakesState) {
	try {
		storage.setItem(SNAKES_STORAGE_KEY, serializeSnakesState(state));
		return true;
	} catch {
		return false;
	}
}
