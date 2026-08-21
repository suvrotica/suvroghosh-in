import type { BoardPlayer, GameHistoryEntry, PlayerColor } from './shared';

export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) >= 0;
}

export function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean';
}

export function isPlayerColor(value: unknown): value is PlayerColor {
	return value === 'green' || value === 'yellow' || value === 'blue' || value === 'red';
}

export function isComputerCount(value: unknown): value is 1 | 2 | 3 {
	return value === 1 || value === 2 || value === 3;
}

export function isBoardPlayer(value: unknown): value is BoardPlayer {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === 'string' &&
		value.id.length > 0 &&
		typeof value.name === 'string' &&
		value.name.length > 0 &&
		value.name.length <= 24 &&
		isPlayerColor(value.color) &&
		(value.kind === 'human' || value.kind === 'computer')
	);
}

export function isHistory(value: unknown): value is GameHistoryEntry[] {
	return (
		Array.isArray(value) &&
		value.length <= 8 &&
		value.every(
			(entry) =>
				isRecord(entry) &&
				isNonNegativeInteger(entry.id) &&
				typeof entry.text === 'string' &&
				entry.text.length <= 240
		)
	);
}

export function isOpeningState(value: unknown): value is {
	contenders: string[];
	cursor: number;
	scores: Record<string, number | null>;
} {
	if (!isRecord(value) || !Array.isArray(value.contenders) || !isRecord(value.scores)) return false;
	if (
		!value.contenders.every((id) => typeof id === 'string') ||
		!isNonNegativeInteger(value.cursor)
	) {
		return false;
	}
	return Object.values(value.scores).every(
		(score) =>
			score === null ||
			(Number.isInteger(score) && (score as number) >= 1 && (score as number) <= 6)
	);
}

export function hasValidPlayers(value: unknown, expectedCount: number): value is BoardPlayer[] {
	if (!Array.isArray(value) || value.length !== expectedCount || !value.every(isBoardPlayer))
		return false;
	const ids = new Set(value.map((player) => player.id));
	const colors = new Set(value.map((player) => player.color));
	return (
		ids.size === value.length &&
		colors.size === value.length &&
		value.filter((p) => p.kind === 'human').length === 1
	);
}

export function isDie(value: unknown): value is number | null {
	return (
		value === null || (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 6)
	);
}
