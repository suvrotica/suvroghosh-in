import type { Direction, EdgeSignature, Rotation } from './types';

export const DIRECTION_NAMES = ['north', 'east', 'south', 'west'] as const;
export const DIRECTION_DELTAS = [
	{ x: 0, y: -1 },
	{ x: 1, y: 0 },
	{ x: 0, y: 1 },
	{ x: -1, y: 0 }
] as const;

export function oppositeDirection(direction: Direction): Direction {
	return ((direction + 2) % 4) as Direction;
}

export function rotateDirection(direction: Direction, rotation: Rotation): Direction {
	return ((direction + rotation) % 4) as Direction;
}

export function unrotateDirection(direction: Direction, rotation: Rotation): Direction {
	return ((direction - rotation + 4) % 4) as Direction;
}

export function rotateEdges(
	edges: readonly [EdgeSignature, EdgeSignature, EdgeSignature, EdgeSignature],
	rotation: Rotation
): [EdgeSignature, EdgeSignature, EdgeSignature, EdgeSignature] {
	const result = new Array<EdgeSignature>(4);
	for (let direction = 0; direction < 4; direction += 1) {
		const rotated = rotateDirection(direction as Direction, rotation);
		result[rotated] = { ...edges[direction] };
	}
	return result as [EdgeSignature, EdgeSignature, EdgeSignature, EdgeSignature];
}

export function neighbourIndex(
	index: number,
	direction: Direction,
	width: number,
	height: number
): number {
	const x = index % width;
	const y = Math.floor(index / width);
	const delta = DIRECTION_DELTAS[direction];
	const nextX = x + delta.x;
	const nextY = y + delta.y;
	if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) return -1;
	return nextY * width + nextX;
}

export function coordinateForIndex(index: number, width: number) {
	return { x: index % width, y: Math.floor(index / width) };
}

export function indexForCoordinate(x: number, y: number, width: number): number {
	return y * width + x;
}

export function isBoundaryCell(x: number, y: number, width: number, height: number): boolean {
	return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}
