import { createLudoSetupState, restoreLudoState } from './engine';
import { isSafeTrackPoint, LUDO_ROUTES, pointKey, trackPointFor } from './board';
import { applyLudoMove, getLegalLudoMoves } from './legal';
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
	LudoMove,
	LudoPendingMove,
	LudoPhase,
	LudoPosition,
	LudoSetup,
	LudoState,
	LudoToken
} from './types';

export const LUDO_STORAGE_KEY = 'suvroghosh:games:ludo:v1';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const phases = new Set<LudoPhase>([
	'setup',
	'opening-roll',
	'awaiting-roll',
	'die-rolling',
	'checking-moves',
	'awaiting-human-token',
	'computer-choosing',
	'token-moving',
	'resolving-landing',
	'resolving-bonus',
	'changing-turn',
	'paused',
	'game-over'
]);

const resumablePhases: ReadonlySet<LudoPhase> = new Set(
	[...phases].filter((phase) => phase !== 'paused')
);

function isLudoPosition(value: unknown): value is LudoPosition {
	if (!isRecord(value)) return false;
	if (value.kind === 'yard' || value.kind === 'finished') return true;
	if (value.kind === 'track') {
		return isNonNegativeInteger(value.progress) && value.progress <= 51;
	}
	if (value.kind === 'home') return isNonNegativeInteger(value.index) && value.index <= 4;
	return false;
}

function isLudoSetup(value: unknown): value is LudoSetup {
	if (!isRecord(value) || !isRecord(value.houseRules)) return false;
	return (
		typeof value.humanName === 'string' &&
		value.humanName.length <= 24 &&
		isPlayerColor(value.humanColor) &&
		isComputerCount(value.computerCount) &&
		isBoolean(value.houseRules.extraThrowAfterCapture) &&
		isBoolean(value.houseRules.extraThrowAfterHome) &&
		isBoolean(value.houseRules.blockades)
	);
}

function isLudoToken(value: unknown): value is LudoToken {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === 'string' &&
		typeof value.playerId === 'string' &&
		isPlayerColor(value.color) &&
		isNonNegativeInteger(value.number) &&
		value.number <= 3 &&
		isLudoPosition(value.position)
	);
}

function isLudoMove(value: unknown): value is LudoMove {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === 'string' &&
		typeof value.tokenId === 'string' &&
		isDie(value.die) &&
		value.die !== null &&
		(value.kind === 'enter' || value.kind === 'advance') &&
		isLudoPosition(value.from) &&
		isLudoPosition(value.to) &&
		Array.isArray(value.path) &&
		value.path.length <= 6 &&
		value.path.every(isLudoPosition) &&
		typeof value.label === 'string'
	);
}

function sameLudoPosition(left: LudoPosition, right: LudoPosition) {
	if (left.kind !== right.kind) return false;
	switch (left.kind) {
		case 'yard':
		case 'finished':
			return true;
		case 'track':
			return right.kind === 'track' && left.progress === right.progress;
		case 'home':
			return right.kind === 'home' && left.index === right.index;
	}
}

function sameLudoMove(left: LudoMove, right: LudoMove) {
	return (
		left.id === right.id &&
		left.tokenId === right.tokenId &&
		left.die === right.die &&
		left.kind === right.kind &&
		sameLudoPosition(left.from, right.from) &&
		sameLudoPosition(left.to, right.to) &&
		left.path.length === right.path.length &&
		left.path.every((position, index) => sameLudoPosition(position, right.path[index])) &&
		left.label === right.label
	);
}

function hasExpectedLegalMoves(state: LudoState) {
	const activePhase = state.phase === 'paused' ? state.pausedFrom : state.phase;
	const isChoicePhase =
		activePhase === 'awaiting-human-token' || activePhase === 'computer-choosing';
	if (!isChoicePhase) return state.legalMoves.length === 0;

	const player = state.players[state.turnIndex];
	if (
		!player ||
		(activePhase === 'awaiting-human-token' && player.kind !== 'human') ||
		(activePhase === 'computer-choosing' && player.kind !== 'computer')
	) {
		return false;
	}

	const expectedMoves = getLegalLudoMoves(state);
	return (
		expectedMoves.length > 0 &&
		state.legalMoves.length === expectedMoves.length &&
		state.legalMoves.every((move, index) => sameLudoMove(move, expectedMoves[index]))
	);
}

function hasValidOrdinaryOccupancy(state: LudoState) {
	const maximumMatchingTokens = state.setup.houseRules.blockades ? 2 : 1;
	const occupancies = new Map<string, { playerId: string; count: number }>();
	for (const token of state.tokens) {
		if (token.position.kind !== 'track') continue;
		const point = trackPointFor(token.color, token.position.progress);
		if (isSafeTrackPoint(point)) continue;
		const occupancyKey = pointKey(point);
		const occupancy = occupancies.get(occupancyKey);
		if (occupancy && occupancy.playerId !== token.playerId) return false;
		const count = (occupancy?.count ?? 0) + 1;
		if (count > maximumMatchingTokens) return false;
		occupancies.set(occupancyKey, { playerId: token.playerId, count });
	}
	return true;
}

function hasValidPendingMove(state: LudoState) {
	const activePhase = state.phase === 'paused' ? state.pausedFrom : state.phase;
	if (activePhase === 'resolving-bonus' && state.pendingMove === null) {
		return (
			state.die === 6 &&
			state.consecutiveSixes < 3 &&
			state.pendingBonus &&
			state.winnerId === null &&
			getLegalLudoMoves(state, state.die).length === 0
		);
	}
	const isPendingPhase =
		activePhase === 'token-moving' ||
		activePhase === 'resolving-landing' ||
		activePhase === 'resolving-bonus' ||
		activePhase === 'game-over';
	if (!isPendingPhase) {
		return state.pendingMove === null && !state.pendingBonus && state.winnerId === null;
	}

	const pending = state.pendingMove;
	const player = state.players[state.turnIndex];
	if (!pending || !player || state.die === null || pending.move.die !== state.die) return false;
	const mover = state.tokens.find((token) => token.id === pending.move.tokenId);
	if (
		!mover ||
		mover.playerId !== player.id ||
		!sameLudoPosition(mover.position, pending.move.to)
	) {
		return false;
	}

	const capturedIds = new Set(pending.capturedTokenIds);
	if (capturedIds.size !== pending.capturedTokenIds.length || capturedIds.size > 1) return false;
	const capturedPositions = new Map<string, LudoPosition>();
	for (const capturedId of capturedIds) {
		const captured = state.tokens.find((token) => token.id === capturedId);
		if (
			!captured ||
			captured.playerId === player.id ||
			captured.position.kind !== 'yard' ||
			pending.move.to.kind !== 'track'
		) {
			return false;
		}
		const destinationPoint = trackPointFor(mover.color, pending.move.to.progress);
		if (isSafeTrackPoint(destinationPoint)) return false;
		const capturedProgress = LUDO_ROUTES[captured.color].findIndex(
			(point) => pointKey(point) === pointKey(destinationPoint)
		);
		if (capturedProgress < 0) return false;
		capturedPositions.set(capturedId, { kind: 'track', progress: capturedProgress });
	}

	const beforeMove: LudoState = {
		...state,
		tokens: state.tokens.map((token) => {
			if (token.id === mover.id) return { ...token, position: pending.move.from };
			const capturedPosition = capturedPositions.get(token.id);
			return capturedPosition ? { ...token, position: capturedPosition } : token;
		}),
		legalMoves: [],
		pendingMove: null,
		pendingBonus: false,
		winnerId: null
	};
	const expectedMove = getLegalLudoMoves(beforeMove, state.die).find((move) =>
		sameLudoMove(move, pending.move)
	);
	if (!expectedMove) return false;
	const applied = applyLudoMove(beforeMove, expectedMove);
	if (
		applied.capturedTokenIds.length !== pending.capturedTokenIds.length ||
		applied.capturedTokenIds.some((id, index) => id !== pending.capturedTokenIds[index]) ||
		applied.tokens.some((token) => {
			const savedToken = state.tokens.find((candidate) => candidate.id === token.id);
			return !savedToken || !sameLudoPosition(token.position, savedToken.position);
		})
	) {
		return false;
	}

	const expectedBonusReasons: ('six' | 'capture' | 'home')[] = [];
	if (state.die === 6) expectedBonusReasons.push('six');
	if (applied.capturedTokenIds.length > 0 && state.setup.houseRules.extraThrowAfterCapture) {
		expectedBonusReasons.push('capture');
	}
	if (applied.finished && state.setup.houseRules.extraThrowAfterHome) {
		expectedBonusReasons.push('home');
	}
	const expectedWinnerId =
		applied.tokens.filter(
			(token) => token.playerId === player.id && token.position.kind === 'finished'
		).length === 4
			? player.id
			: null;
	const expectedBonus = expectedBonusReasons.length > 0;
	if (
		pending.finished !== applied.finished ||
		pending.enteredHomeLane !== applied.enteredHomeLane ||
		pending.bonus !== expectedBonus ||
		pending.bonusReasons.length !== expectedBonusReasons.length ||
		pending.bonusReasons.some((reason, index) => reason !== expectedBonusReasons[index]) ||
		pending.winnerId !== expectedWinnerId
	) {
		return false;
	}

	if (activePhase === 'game-over') {
		return (
			state.phase === 'game-over' &&
			expectedWinnerId !== null &&
			state.winnerId === expectedWinnerId &&
			!state.pendingBonus
		);
	}
	if (state.winnerId !== null || state.pendingBonus !== expectedBonus) return false;
	return activePhase !== 'resolving-bonus' || expectedWinnerId === null;
}

function isLudoPendingMove(value: unknown): value is LudoPendingMove {
	if (!isRecord(value)) return false;
	return (
		isLudoMove(value.move) &&
		Array.isArray(value.capturedTokenIds) &&
		value.capturedTokenIds.every((id) => typeof id === 'string') &&
		isBoolean(value.finished) &&
		isBoolean(value.enteredHomeLane) &&
		isBoolean(value.bonus) &&
		Array.isArray(value.bonusReasons) &&
		value.bonusReasons.every(
			(reason) => reason === 'six' || reason === 'capture' || reason === 'home'
		) &&
		(value.winnerId === null || typeof value.winnerId === 'string')
	);
}

function isLudoState(value: unknown): value is LudoState {
	if (!isRecord(value)) return false;
	const state = value;
	const phase = state.phase as LudoPhase;
	if (
		state.game !== 'ludo' ||
		state.version !== 1 ||
		typeof state.phase !== 'string' ||
		!phases.has(phase) ||
		!isLudoSetup(state.setup) ||
		!Array.isArray(state.players) ||
		!Array.isArray(state.tokens) ||
		!state.tokens.every(isLudoToken) ||
		!isNonNegativeInteger(state.turnIndex) ||
		!isNonNegativeInteger(state.turnId) ||
		!isNonNegativeInteger(state.effectId) ||
		!isNonNegativeInteger(state.rngState) ||
		!isDie(state.die) ||
		!isNonNegativeInteger(state.consecutiveSixes) ||
		state.consecutiveSixes > 3 ||
		!Array.isArray(state.legalMoves) ||
		!state.legalMoves.every(isLudoMove) ||
		!isOpeningState(state.opening) ||
		!(state.pendingMove === null || isLudoPendingMove(state.pendingMove)) ||
		!isBoolean(state.pendingBonus) ||
		!(state.winnerId === null || typeof state.winnerId === 'string') ||
		typeof state.announcement !== 'string' ||
		!isHistory(state.history) ||
		!(state.pausedFrom === null || resumablePhases.has(state.pausedFrom as LudoPhase))
	) {
		return false;
	}

	const validState = state as unknown as LudoState;
	if ((phase === 'paused') !== (validState.pausedFrom !== null)) return false;
	if (phase === 'setup') {
		return (
			validState.players.length === 0 &&
			validState.tokens.length === 0 &&
			validState.turnIndex === 0 &&
			validState.legalMoves.length === 0 &&
			validState.pendingMove === null
		);
	}

	const expectedPlayers = validState.setup.computerCount + 1;
	if (!hasValidPlayers(validState.players, expectedPlayers)) return false;
	const playerIds = new Set(validState.players.map((player) => player.id));
	const human = validState.players.find((player) => player.kind === 'human');
	if (!human || human.color !== validState.setup.humanColor) return false;
	if (validState.turnIndex >= validState.players.length) return false;
	if (validState.tokens.length !== validState.players.length * 4) return false;
	if (new Set(validState.tokens.map((token) => token.id)).size !== validState.tokens.length)
		return false;
	if (
		validState.tokens.some(
			(token) =>
				!playerIds.has(token.playerId) ||
				validState.players.find((player) => player.id === token.playerId)?.color !== token.color
		)
	) {
		return false;
	}
	for (const player of validState.players) {
		const numbers = validState.tokens
			.filter((token) => token.playerId === player.id)
			.map((token) => token.number);
		if (numbers.length !== 4 || new Set(numbers).size !== 4) return false;
	}
	if (!hasValidOrdinaryOccupancy(validState)) return false;
	if (
		validState.opening.contenders.some((id) => !playerIds.has(id)) ||
		(validState.opening.contenders.length > 0 &&
			validState.opening.cursor >= validState.opening.contenders.length)
	) {
		return false;
	}
	if (
		validState.legalMoves.some(
			(move) => !validState.tokens.some((token) => token.id === move.tokenId)
		)
	) {
		return false;
	}
	if (!hasExpectedLegalMoves(validState)) return false;
	if (
		validState.pendingMove &&
		!validState.tokens.some((token) => token.id === validState.pendingMove!.move.tokenId)
	) {
		return false;
	}
	if (!hasValidPendingMove(validState)) return false;
	if (validState.winnerId !== null && !playerIds.has(validState.winnerId)) return false;
	if (phase === 'opening-roll' && validState.opening.contenders.length === 0) return false;
	if (phase === 'game-over' && validState.winnerId === null) return false;
	return true;
}

export function serializeLudoState(state: LudoState) {
	return JSON.stringify({ version: 1, state });
}

export function parseLudoState(raw: string | null) {
	if (!raw) return createLudoSetupState();
	try {
		const record = JSON.parse(raw) as { version?: unknown; state?: unknown };
		if (record.version !== 1 || !isLudoState(record.state)) return createLudoSetupState();
		return restoreLudoState(record.state);
	} catch {
		return createLudoSetupState();
	}
}

export function loadLudoState(storage: StorageLike) {
	try {
		return parseLudoState(storage.getItem(LUDO_STORAGE_KEY));
	} catch {
		return createLudoSetupState();
	}
}

export function saveLudoState(storage: StorageLike, state: LudoState) {
	try {
		storage.setItem(LUDO_STORAGE_KEY, serializeLudoState(state));
		return true;
	} catch {
		return false;
	}
}
