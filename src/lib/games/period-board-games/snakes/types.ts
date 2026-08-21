import type { RngState } from '../rng';
import type { BoardPlayer, GameHistoryEntry, PlayerColor } from '../shared';
import type { Transport } from './board';

export type SnakesPhase =
	| 'setup'
	| 'opening-roll'
	| 'awaiting-roll'
	| 'die-rolling'
	| 'counter-moving'
	| 'resolving-transport'
	| 'resolving-bonus'
	| 'changing-turn'
	| 'paused'
	| 'game-over';

export type SnakesHouseRules = {
	requireOneToEnter: boolean;
	extraThrowAfterSix: boolean;
};

export type SnakesSetup = {
	humanName: string;
	humanColor: PlayerColor;
	computerCount: 1 | 2 | 3;
	houseRules: SnakesHouseRules;
};

export type SnakesCounter = {
	id: string;
	playerId: string;
	color: PlayerColor;
	position: number;
};

export type SnakesOpeningState = {
	contenders: string[];
	cursor: number;
	scores: Record<string, number | null>;
};

export type SnakesPendingMove = {
	from: number;
	landed: number;
	transport: Transport | null;
	entered: boolean;
	overshoot: boolean;
	bonus: boolean;
};

export type SnakesState = {
	game: 'saap-ludo';
	version: 1;
	phase: SnakesPhase;
	pausedFrom: Exclude<SnakesPhase, 'paused'> | null;
	setup: SnakesSetup;
	players: BoardPlayer[];
	counters: SnakesCounter[];
	turnIndex: number;
	turnId: number;
	effectId: number;
	rngState: RngState;
	die: number | null;
	opening: SnakesOpeningState;
	pendingMove: SnakesPendingMove | null;
	pendingBonus: boolean;
	winnerId: string | null;
	announcement: string;
	history: GameHistoryEntry[];
};

export type SnakesEffect =
	| { type: 'delay'; effectId: number; kind: 'die' | 'transport' | 'turn' | 'no-move' }
	| { type: 'counter'; effectId: number; squares: number[] };

export type SnakesTransition = {
	state: SnakesState;
	effects: SnakesEffect[];
};

export type SnakesAction =
	| { type: 'ROLL'; playerId: string }
	| { type: 'DIE_SETTLED'; effectId: number }
	| { type: 'COUNTER_SETTLED'; effectId: number }
	| { type: 'TRANSPORT_SETTLED'; effectId: number }
	| { type: 'BONUS_SETTLED'; effectId: number }
	| { type: 'TURN_SETTLED'; effectId: number }
	| { type: 'PAUSE' }
	| { type: 'RESUME' };
