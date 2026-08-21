import { COLOR_LABELS } from '../shared';
import { coordinateForPosition, isSafeTrackPoint, pointKey, trackPointFor } from './board';
import type { LudoMove, LudoPosition, LudoState, LudoToken } from './types';

const FINAL_ROUTE_STEP = 57;

function routeStep(position: LudoPosition) {
	switch (position.kind) {
		case 'yard':
			return -1;
		case 'track':
			return position.progress;
		case 'home':
			return 52 + position.index;
		case 'finished':
			return FINAL_ROUTE_STEP;
	}
}

export function positionAtRouteStep(step: number): LudoPosition | null {
	if (step >= 0 && step <= 51) return { kind: 'track', progress: step };
	if (step >= 52 && step <= 56) return { kind: 'home', index: step - 52 };
	if (step === FINAL_ROUTE_STEP) return { kind: 'finished' };
	return null;
}

export function destinationForToken(token: LudoToken, die: number): LudoPosition | null {
	if (token.position.kind === 'yard') return die === 6 ? { kind: 'track', progress: 0 } : null;
	if (token.position.kind === 'finished') return null;
	return positionAtRouteStep(routeStep(token.position) + die);
}

export function movementPath(token: LudoToken, die: number): LudoPosition[] {
	if (token.position.kind === 'yard') {
		return die === 6 ? [{ kind: 'track', progress: 0 }] : [];
	}
	const start = routeStep(token.position);
	const path: LudoPosition[] = [];
	for (let step = start + 1; step <= start + die; step += 1) {
		const position = positionAtRouteStep(step);
		if (!position) return [];
		path.push(position);
	}
	return path;
}

function tokensAtTrackPoint(state: LudoState, point: readonly [number, number]) {
	const key = pointKey(point);
	return state.tokens.filter(
		(token) =>
			token.position.kind === 'track' &&
			pointKey(trackPointFor(token.color, token.position.progress)) === key
	);
}

export function isOpponentBlockade(
	state: LudoState,
	playerId: string,
	point: readonly [number, number]
) {
	if (!state.setup.houseRules.blockades || isSafeTrackPoint(point)) return false;
	const opponents = tokensAtTrackPoint(state, point).filter((token) => token.playerId !== playerId);
	const counts = new Map<string, number>();
	for (const token of opponents) counts.set(token.playerId, (counts.get(token.playerId) ?? 0) + 1);
	return [...counts.values()].some((count) => count >= 2);
}

function pathCrossesOpponentBlockade(state: LudoState, token: LudoToken, path: LudoPosition[]) {
	return path.some((position) => {
		if (position.kind !== 'track') return false;
		return isOpponentBlockade(state, token.playerId, trackPointFor(token.color, position.progress));
	});
}

function exceedsOrdinaryOccupancy(state: LudoState, token: LudoToken, destination: LudoPosition) {
	if (destination.kind !== 'track') return false;
	const point = trackPointFor(token.color, destination.progress);
	if (isSafeTrackPoint(point)) return false;
	const sameColorCount = tokensAtTrackPoint(state, point).filter(
		(candidate) => candidate.playerId === token.playerId && candidate.id !== token.id
	).length;
	return sameColorCount >= (state.setup.houseRules.blockades ? 2 : 1);
}

export function getLegalLudoMoves(state: LudoState, die = state.die): LudoMove[] {
	if (!die || die < 1 || die > 6 || state.players.length === 0) return [];
	const player = state.players[state.turnIndex];
	return state.tokens.flatMap((token) => {
		if (token.playerId !== player.id) return [];
		const destination = destinationForToken(token, die);
		if (!destination) return [];
		const path = movementPath(token, die);
		if (path.length === 0 || pathCrossesOpponentBlockade(state, token, path)) return [];
		if (exceedsOrdinaryOccupancy(state, token, destination)) return [];

		const kind = token.position.kind === 'yard' ? 'enter' : 'advance';
		return [
			{
				id: `${token.id}:${die}:${kind}`,
				tokenId: token.id,
				die,
				kind,
				from: token.position,
				to: destination,
				path,
				label:
					kind === 'enter'
						? `Bring ${COLOR_LABELS[token.color]} token ${token.number + 1} onto the board`
						: `Move ${COLOR_LABELS[token.color]} token ${token.number + 1} ${die} ${die === 1 ? 'space' : 'spaces'}`
			}
		];
	});
}

export type AppliedLudoMove = {
	tokens: LudoToken[];
	capturedTokenIds: string[];
	finished: boolean;
	enteredHomeLane: boolean;
};

export function applyLudoMove(state: LudoState, move: LudoMove): AppliedLudoMove {
	const token = state.tokens.find((candidate) => candidate.id === move.tokenId);
	if (!token) throw new Error(`Unknown Ludo token: ${move.tokenId}`);
	const destination = move.to;
	let capturedTokenIds: string[] = [];

	if (destination.kind === 'track') {
		const point = trackPointFor(token.color, destination.progress);
		if (!isSafeTrackPoint(point)) {
			const opponents = tokensAtTrackPoint(state, point).filter(
				(candidate) => candidate.playerId !== token.playerId
			);
			if (opponents.length === 1) capturedTokenIds = [opponents[0].id];
		}
	}

	const tokens = state.tokens.map<LudoToken>((candidate) => {
		if (candidate.id === token.id) return { ...candidate, position: destination };
		if (capturedTokenIds.includes(candidate.id))
			return { ...candidate, position: { kind: 'yard' } };
		return candidate;
	});

	return {
		tokens,
		capturedTokenIds,
		finished: destination.kind === 'finished',
		enteredHomeLane: token.position.kind === 'track' && destination.kind === 'home'
	};
}

export function positionDescription(token: LudoToken) {
	switch (token.position.kind) {
		case 'yard':
			return 'in the yard';
		case 'track': {
			const point = coordinateForPosition(token.color, token.position, token.number);
			return `${isSafeTrackPoint(point) ? 'on a safe shared square' : 'on the shared track'}, ${token.position.progress + 1} steps from entry`;
		}
		case 'home':
			return `in private home lane cell ${token.position.index + 1}`;
		case 'finished':
			return 'home in the centre';
	}
}
