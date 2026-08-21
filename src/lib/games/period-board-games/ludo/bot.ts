import { nextRandom } from '../rng';
import { isSafeTrackPoint, pointKey, trackPointFor } from './board';
import { applyLudoMove } from './legal';
import type { LudoMove, LudoState, LudoToken } from './types';

function tokensAtDestination(state: LudoState, token: LudoToken, move: LudoMove) {
	if (move.to.kind !== 'track') return [];
	const destinationKey = pointKey(trackPointFor(token.color, move.to.progress));
	return state.tokens.filter(
		(candidate) =>
			candidate.position.kind === 'track' &&
			pointKey(trackPointFor(candidate.color, candidate.position.progress)) === destinationKey
	);
}

function threatened(state: LudoState, token: LudoToken, position = token.position) {
	if (position.kind !== 'track') return false;
	const point = trackPointFor(token.color, position.progress);
	if (isSafeTrackPoint(point)) return false;
	const key = pointKey(point);
	return state.tokens.some((opponent) => {
		if (opponent.playerId === token.playerId || opponent.position.kind !== 'track') return false;
		for (let die = 1; die <= 6; die += 1) {
			const progress = opponent.position.progress + die;
			if (progress <= 51 && pointKey(trackPointFor(opponent.color, progress)) === key) return true;
		}
		return false;
	});
}

export function scoreLudoMove(state: LudoState, move: LudoMove) {
	const token = state.tokens.find((candidate) => candidate.id === move.tokenId)!;
	const applied = applyLudoMove(state, move);
	let score = 0;
	if (applied.finished) score += 120;
	if (applied.capturedTokenIds.length > 0) score += 82;
	if (applied.enteredHomeLane || move.to.kind === 'home') score += 58;
	if (threatened(state, token) && !threatened(state, token, move.to)) score += 31;
	if (move.to.kind === 'track' && isSafeTrackPoint(trackPointFor(token.color, move.to.progress))) {
		score += 24;
	}
	if (move.kind === 'enter') score += 22;

	const destinationOccupants = tokensAtDestination(state, token, move);
	if (
		move.to.kind === 'track' &&
		!isSafeTrackPoint(trackPointFor(token.color, move.to.progress)) &&
		destinationOccupants.some((candidate) => candidate.playerId === token.playerId)
	) {
		score += 20;
	}

	if (token.position.kind === 'track') {
		const origin = trackPointFor(token.color, token.position.progress);
		const sameAtOrigin = state.tokens.filter(
			(candidate) =>
				candidate.playerId === token.playerId &&
				candidate.position.kind === 'track' &&
				pointKey(trackPointFor(candidate.color, candidate.position.progress)) === pointKey(origin)
		).length;
		if (sameAtOrigin === 2 && !isSafeTrackPoint(origin)) score -= 10;
	}

	const after = applied.tokens.filter((candidate) => candidate.playerId === token.playerId);
	const spread = new Set(
		after.map((candidate) =>
			candidate.position.kind === 'track'
				? pointKey(trackPointFor(candidate.color, candidate.position.progress))
				: `${candidate.position.kind}:${candidate.position.kind === 'home' ? candidate.position.index : candidate.number}`
		)
	).size;
	score += spread * 1.5;
	if (move.to.kind === 'track') score += move.to.progress * 0.35;
	if (move.to.kind === 'home') score += 20 + move.to.index * 2;
	if (threatened({ ...state, tokens: applied.tokens }, { ...token, position: move.to }))
		score -= 28;
	return score;
}

export function chooseLudoBotMove(state: LudoState, moves: readonly LudoMove[]) {
	if (moves.length === 0) throw new Error('A computer cannot choose from an empty legal move set');
	let rngState = state.rngState;
	const scored = moves.map((move) => {
		const jitter = nextRandom(rngState);
		rngState = jitter.state;
		return { move, score: scoreLudoMove(state, move) + (jitter.value - 0.5) * 8 };
	});
	scored.sort(
		(left, right) => right.score - left.score || left.move.id.localeCompare(right.move.id)
	);
	const choice = nextRandom(rngState);
	rngState = choice.state;
	const selected = scored.length > 1 && choice.value < 0.2 ? scored[1] : scored[0];
	return { move: selected.move, rngState, scores: scored };
}
