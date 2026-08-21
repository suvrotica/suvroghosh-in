import type { PlayerColor } from '../shared';
import type { LudoPosition } from './types';

export type GridPoint = readonly [row: number, column: number];

const points = (value: GridPoint[]) => Object.freeze(value);

export const GREEN_ROUTE: readonly GridPoint[] = Object.freeze([
	[6, 1],
	[6, 2],
	[6, 3],
	[6, 4],
	[6, 5],
	[5, 6],
	[4, 6],
	[3, 6],
	[2, 6],
	[1, 6],
	[0, 6],
	[0, 7],
	[0, 8],
	[1, 8],
	[2, 8],
	[3, 8],
	[4, 8],
	[5, 8],
	[6, 9],
	[6, 10],
	[6, 11],
	[6, 12],
	[6, 13],
	[6, 14],
	[7, 14],
	[8, 14],
	[8, 13],
	[8, 12],
	[8, 11],
	[8, 10],
	[8, 9],
	[9, 8],
	[10, 8],
	[11, 8],
	[12, 8],
	[13, 8],
	[14, 8],
	[14, 7],
	[14, 6],
	[13, 6],
	[12, 6],
	[11, 6],
	[10, 6],
	[9, 6],
	[8, 5],
	[8, 4],
	[8, 3],
	[8, 2],
	[8, 1],
	[8, 0],
	[7, 0],
	[6, 0]
]);

export const YELLOW_ROUTE: readonly GridPoint[] = Object.freeze([
	[1, 8],
	[2, 8],
	[3, 8],
	[4, 8],
	[5, 8],
	[6, 9],
	[6, 10],
	[6, 11],
	[6, 12],
	[6, 13],
	[6, 14],
	[7, 14],
	[8, 14],
	[8, 13],
	[8, 12],
	[8, 11],
	[8, 10],
	[8, 9],
	[9, 8],
	[10, 8],
	[11, 8],
	[12, 8],
	[13, 8],
	[14, 8],
	[14, 7],
	[14, 6],
	[13, 6],
	[12, 6],
	[11, 6],
	[10, 6],
	[9, 6],
	[8, 5],
	[8, 4],
	[8, 3],
	[8, 2],
	[8, 1],
	[8, 0],
	[7, 0],
	[6, 0],
	[6, 1],
	[6, 2],
	[6, 3],
	[6, 4],
	[6, 5],
	[5, 6],
	[4, 6],
	[3, 6],
	[2, 6],
	[1, 6],
	[0, 6],
	[0, 7],
	[0, 8]
]);

export const BLUE_ROUTE: readonly GridPoint[] = Object.freeze([
	[8, 13],
	[8, 12],
	[8, 11],
	[8, 10],
	[8, 9],
	[9, 8],
	[10, 8],
	[11, 8],
	[12, 8],
	[13, 8],
	[14, 8],
	[14, 7],
	[14, 6],
	[13, 6],
	[12, 6],
	[11, 6],
	[10, 6],
	[9, 6],
	[8, 5],
	[8, 4],
	[8, 3],
	[8, 2],
	[8, 1],
	[8, 0],
	[7, 0],
	[6, 0],
	[6, 1],
	[6, 2],
	[6, 3],
	[6, 4],
	[6, 5],
	[5, 6],
	[4, 6],
	[3, 6],
	[2, 6],
	[1, 6],
	[0, 6],
	[0, 7],
	[0, 8],
	[1, 8],
	[2, 8],
	[3, 8],
	[4, 8],
	[5, 8],
	[6, 9],
	[6, 10],
	[6, 11],
	[6, 12],
	[6, 13],
	[6, 14],
	[7, 14],
	[8, 14]
]);

export const RED_ROUTE: readonly GridPoint[] = Object.freeze([
	[13, 6],
	[12, 6],
	[11, 6],
	[10, 6],
	[9, 6],
	[8, 5],
	[8, 4],
	[8, 3],
	[8, 2],
	[8, 1],
	[8, 0],
	[7, 0],
	[6, 0],
	[6, 1],
	[6, 2],
	[6, 3],
	[6, 4],
	[6, 5],
	[5, 6],
	[4, 6],
	[3, 6],
	[2, 6],
	[1, 6],
	[0, 6],
	[0, 7],
	[0, 8],
	[1, 8],
	[2, 8],
	[3, 8],
	[4, 8],
	[5, 8],
	[6, 9],
	[6, 10],
	[6, 11],
	[6, 12],
	[6, 13],
	[6, 14],
	[7, 14],
	[8, 14],
	[8, 13],
	[8, 12],
	[8, 11],
	[8, 10],
	[8, 9],
	[9, 8],
	[10, 8],
	[11, 8],
	[12, 8],
	[13, 8],
	[14, 8],
	[14, 7],
	[14, 6]
]);

export const LUDO_ROUTES: Readonly<Record<PlayerColor, readonly GridPoint[]>> = Object.freeze({
	green: GREEN_ROUTE,
	yellow: YELLOW_ROUTE,
	blue: BLUE_ROUTE,
	red: RED_ROUTE
});

export const HOME_LANES: Readonly<Record<PlayerColor, readonly GridPoint[]>> = Object.freeze({
	green: points([
		[7, 1],
		[7, 2],
		[7, 3],
		[7, 4],
		[7, 5]
	]),
	yellow: points([
		[1, 7],
		[2, 7],
		[3, 7],
		[4, 7],
		[5, 7]
	]),
	blue: points([
		[7, 13],
		[7, 12],
		[7, 11],
		[7, 10],
		[7, 9]
	]),
	red: points([
		[13, 7],
		[12, 7],
		[11, 7],
		[10, 7],
		[9, 7]
	])
});

export const START_COORDINATES: Readonly<Record<PlayerColor, GridPoint>> = Object.freeze({
	green: GREEN_ROUTE[0],
	yellow: YELLOW_ROUTE[0],
	blue: BLUE_ROUTE[0],
	red: RED_ROUTE[0]
});

/** Printed safe rosettes. The same list drives drawing and capture rules. */
export const PRINTED_STAR_COORDINATES: readonly GridPoint[] = Object.freeze([
	[2, 6],
	[6, 12],
	[12, 8],
	[8, 2]
]);

export const YARD_TOKEN_COORDINATES: Readonly<Record<PlayerColor, readonly GridPoint[]>> =
	Object.freeze({
		green: points([
			[1.6, 1.6],
			[1.6, 3.4],
			[3.4, 1.6],
			[3.4, 3.4]
		]),
		yellow: points([
			[1.6, 10.6],
			[1.6, 12.4],
			[3.4, 10.6],
			[3.4, 12.4]
		]),
		blue: points([
			[10.6, 10.6],
			[10.6, 12.4],
			[12.4, 10.6],
			[12.4, 12.4]
		]),
		red: points([
			[10.6, 1.6],
			[10.6, 3.4],
			[12.4, 1.6],
			[12.4, 3.4]
		])
	});

export const FINISHED_COORDINATES: Readonly<Record<PlayerColor, readonly GridPoint[]>> =
	Object.freeze({
		green: points([
			[6.6, 6],
			[6.6, 6.3],
			[7.4, 6],
			[7.4, 6.3]
		]),
		yellow: points([
			[6, 6.6],
			[6, 7.4],
			[6.3, 6.6],
			[6.3, 7.4]
		]),
		blue: points([
			[6.6, 7.7],
			[6.6, 8],
			[7.4, 7.7],
			[7.4, 8]
		]),
		red: points([
			[7.7, 6.6],
			[7.7, 7.4],
			[8, 6.6],
			[8, 7.4]
		])
	});

export function pointKey(point: GridPoint) {
	return `${point[0]},${point[1]}`;
}

const safeTrackKeys = new Set([
	...Object.values(START_COORDINATES).map(pointKey),
	...PRINTED_STAR_COORDINATES.map(pointKey)
]);

export function isSafeTrackPoint(point: GridPoint) {
	return safeTrackKeys.has(pointKey(point));
}

export function coordinateForPosition(
	color: PlayerColor,
	position: LudoPosition,
	tokenNumber = 0
): GridPoint {
	switch (position.kind) {
		case 'yard':
			return YARD_TOKEN_COORDINATES[color][tokenNumber];
		case 'track':
			return LUDO_ROUTES[color][position.progress];
		case 'home':
			return HOME_LANES[color][position.index];
		case 'finished':
			return FINISHED_COORDINATES[color][tokenNumber];
	}
}

export function trackPointFor(color: PlayerColor, progress: number) {
	return LUDO_ROUTES[color][progress];
}
