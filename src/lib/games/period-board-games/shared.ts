import { nextInt, type RngState } from './rng';

export const PLAYER_COLORS = ['green', 'yellow', 'blue', 'red'] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

export type BoardPlayer = {
	id: string;
	name: string;
	color: PlayerColor;
	kind: 'human' | 'computer';
};

export type Pace = 'relaxed' | 'normal' | 'brisk';

export type BoardPreferences = {
	pace: Pace;
	sound: boolean;
};

export type GameHistoryEntry = {
	id: number;
	text: string;
};

export const DEFAULT_PREFERENCES: BoardPreferences = {
	pace: 'normal',
	sound: false
};

export const BENGALI_NICKNAMES = ['Mithu', 'Babai', 'Tukai', 'Rini', 'Piku', 'Bulti'] as const;

export const COLOR_LABELS: Record<PlayerColor, string> = {
	green: 'green',
	yellow: 'yellow',
	blue: 'blue',
	red: 'red'
};

export const COLOR_SYMBOLS: Record<PlayerColor, string> = {
	green: 'G',
	yellow: 'Y',
	blue: 'B',
	red: 'R'
};

export function selectedColors(humanColor: PlayerColor, computerCount: 1 | 2 | 3) {
	if (computerCount === 1) {
		const opposite: Record<PlayerColor, PlayerColor> = {
			green: 'blue',
			yellow: 'red',
			blue: 'green',
			red: 'yellow'
		};
		return PLAYER_COLORS.filter((color) => color === humanColor || color === opposite[humanColor]);
	}

	const humanIndex = PLAYER_COLORS.indexOf(humanColor);
	const chosen = new Set<PlayerColor>([humanColor]);
	for (let offset = 1; chosen.size < computerCount + 1; offset += 1) {
		chosen.add(PLAYER_COLORS[(humanIndex + offset) % PLAYER_COLORS.length]);
	}
	return PLAYER_COLORS.filter((color) => chosen.has(color));
}

export function createPlayers(
	humanName: string,
	humanColor: PlayerColor,
	computerCount: 1 | 2 | 3,
	rngState: RngState
) {
	const colors = selectedColors(humanColor, computerCount);
	let state = rngState;
	const names = [...BENGALI_NICKNAMES];
	for (let index = names.length - 1; index > 0; index -= 1) {
		const step = nextInt(state, index + 1);
		state = step.state;
		[names[index], names[step.value]] = [names[step.value], names[index]];
	}

	let botIndex = 0;
	const players = colors.map<BoardPlayer>((color) => {
		if (color === humanColor) {
			return {
				id: 'human',
				name: humanName.trim() || 'You',
				color,
				kind: 'human'
			};
		}
		const id = `computer-${botIndex + 1}`;
		const player: BoardPlayer = {
			id,
			name: names[botIndex],
			color,
			kind: 'computer'
		};
		botIndex += 1;
		return player;
	});

	return { players, rngState: state };
}

export function pushHistory(history: GameHistoryEntry[], id: number, text: string) {
	return [{ id, text }, ...history].slice(0, 8);
}

export function currentPlayer<T extends { players: BoardPlayer[]; turnIndex: number }>(state: T) {
	return state.players[state.turnIndex];
}

export function paceMultiplier(pace: Pace) {
	return pace === 'relaxed' ? 1.35 : pace === 'brisk' ? 0.6 : 1;
}
