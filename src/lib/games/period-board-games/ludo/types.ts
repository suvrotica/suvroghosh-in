import type { RngState } from '../rng';
import type { BoardPlayer, GameHistoryEntry, PlayerColor } from '../shared';

export type LudoPhase =
	| 'setup'
	| 'opening-roll'
	| 'awaiting-roll'
	| 'die-rolling'
	| 'checking-moves'
	| 'awaiting-human-token'
	| 'computer-choosing'
	| 'token-moving'
	| 'resolving-landing'
	| 'resolving-bonus'
	| 'changing-turn'
	| 'paused'
	| 'game-over';

export type LudoPosition =
	| { kind: 'yard' }
	| { kind: 'track'; progress: number }
	| { kind: 'home'; index: number }
	| { kind: 'finished' };

export type LudoToken = {
	id: string;
	playerId: string;
	color: PlayerColor;
	number: number;
	position: LudoPosition;
};

export type LudoHouseRules = {
	extraThrowAfterCapture: boolean;
	extraThrowAfterHome: boolean;
	blockades: boolean;
};

export type LudoSetup = {
	humanName: string;
	humanColor: PlayerColor;
	computerCount: 1 | 2 | 3;
	houseRules: LudoHouseRules;
};

export type LudoMove = {
	id: string;
	tokenId: string;
	die: number;
	kind: 'enter' | 'advance';
	from: LudoPosition;
	to: LudoPosition;
	path: LudoPosition[];
	label: string;
};

export type LudoPendingMove = {
	move: LudoMove;
	capturedTokenIds: string[];
	finished: boolean;
	enteredHomeLane: boolean;
	bonus: boolean;
	bonusReasons: ('six' | 'capture' | 'home')[];
	winnerId: string | null;
};

export type LudoOpeningState = {
	contenders: string[];
	cursor: number;
	scores: Record<string, number | null>;
};

export type LudoState = {
	game: 'ludo';
	version: 1;
	phase: LudoPhase;
	pausedFrom: Exclude<LudoPhase, 'paused'> | null;
	setup: LudoSetup;
	players: BoardPlayer[];
	tokens: LudoToken[];
	turnIndex: number;
	turnId: number;
	effectId: number;
	rngState: RngState;
	die: number | null;
	consecutiveSixes: number;
	legalMoves: LudoMove[];
	opening: LudoOpeningState;
	pendingMove: LudoPendingMove | null;
	pendingBonus: boolean;
	winnerId: string | null;
	announcement: string;
	history: GameHistoryEntry[];
};

export type LudoEffect =
	| { type: 'delay'; effectId: number; kind: 'die' | 'landing' | 'no-move' | 'turn' }
	| { type: 'move'; effectId: number; tokenId: string; path: LudoPosition[] };

export type LudoTransition = {
	state: LudoState;
	effects: LudoEffect[];
};

export type LudoAction =
	| { type: 'ROLL'; playerId: string }
	| { type: 'DIE_SETTLED'; effectId: number }
	| { type: 'MOVE'; playerId: string; moveId: string }
	| { type: 'BOT_CHOOSE'; effectId: number }
	| { type: 'MOVE_SETTLED'; effectId: number }
	| { type: 'LANDING_SETTLED'; effectId: number }
	| { type: 'BONUS_SETTLED'; effectId: number }
	| { type: 'TURN_SETTLED'; effectId: number }
	| { type: 'PAUSE' }
	| { type: 'RESUME' };
