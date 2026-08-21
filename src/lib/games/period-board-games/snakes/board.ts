export const LADDERS = {
	3: 22,
	8: 30,
	20: 41,
	28: 55,
	36: 44,
	51: 67,
	71: 91,
	80: 96
} as const;

export const SNAKES = {
	17: 7,
	32: 10,
	48: 26,
	59: 39,
	64: 45,
	79: 58,
	88: 68,
	99: 13
} as const;

export type LadderStart = keyof typeof LADDERS;
export type SnakeStart = keyof typeof SNAKES;

export type Transport = {
	type: 'ladder' | 'snake';
	from: number;
	to: number;
};

export const TRANSPORTS: readonly Transport[] = Object.freeze([
	...Object.entries(LADDERS).map(([from, to]) => ({
		type: 'ladder' as const,
		from: Number(from),
		to
	})),
	...Object.entries(SNAKES).map(([from, to]) => ({
		type: 'snake' as const,
		from: Number(from),
		to
	}))
]);

export function transportAt(square: number): Transport | null {
	return TRANSPORTS.find((transport) => transport.from === square) ?? null;
}

export type SnakesGridCoordinate = {
	row: number;
	column: number;
};

/** Zero-based grid coordinate, with row zero at the top. */
export function squareToGrid(square: number): SnakesGridCoordinate {
	if (!Number.isInteger(square) || square < 1 || square > 100) {
		throw new RangeError('Saap-Ludo square must be an integer from 1 to 100');
	}
	const rowFromBottom = Math.floor((square - 1) / 10);
	const offset = (square - 1) % 10;
	return {
		row: 9 - rowFromBottom,
		column: rowFromBottom % 2 === 0 ? offset : 9 - offset
	};
}

export function squareCenter(square: number) {
	const { row, column } = squareToGrid(square);
	return {
		x: column * 10 + 5,
		y: row * 10 + 5
	};
}

export function squaresBetween(from: number, to: number) {
	if (to <= from) return [];
	return Array.from({ length: to - from }, (_, index) => from + index + 1);
}
