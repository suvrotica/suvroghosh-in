import { finite, positive } from './model-utils';

export interface CircleObstacle {
	readonly x: number;
	readonly y: number;
	readonly radius: number;
}

export interface ResolvedObstacleMove {
	readonly deltaX: number;
	readonly deltaY: number;
	readonly collided: boolean;
}

export function validateCircleObstacle(obstacle: CircleObstacle): CircleObstacle {
	return Object.freeze({
		x: finite(obstacle.x, 'Obstacle x coordinate'),
		y: finite(obstacle.y, 'Obstacle y coordinate'),
		radius: positive(obstacle.radius, 'Obstacle radius')
	});
}

function projectOutside(
	x: number,
	y: number,
	obstacle: CircleObstacle,
	epsilon: number
): { x: number; y: number; projected: boolean } {
	const offsetX = x - obstacle.x;
	const offsetY = y - obstacle.y;
	const distance = Math.hypot(offsetX, offsetY);
	if (distance >= obstacle.radius + epsilon) return { x, y, projected: false };
	const normalX = distance > 0 ? offsetX / distance : 1;
	const normalY = distance > 0 ? offsetY / distance : 0;
	return {
		x: obstacle.x + normalX * (obstacle.radius + epsilon),
		y: obstacle.y + normalY * (obstacle.radius + epsilon),
		projected: true
	};
}

/**
 * Specularly reflect a proposed straight segment from excluded circular regions.
 * The earliest segment/circle intersection is used, so a long step cannot tunnel
 * through an obstacle merely because its final endpoint lies outside it.
 */
export function resolveCircularObstacleMove(
	startX: number,
	startY: number,
	deltaX: number,
	deltaY: number,
	obstacles: readonly CircleObstacle[]
): ResolvedObstacleMove {
	finite(startX, 'Obstacle move start x');
	finite(startY, 'Obstacle move start y');
	finite(deltaX, 'Obstacle move delta x');
	finite(deltaY, 'Obstacle move delta y');
	if (obstacles.length === 0) return { deltaX, deltaY, collided: false };

	const epsilon = 1e-10;
	let currentX = startX;
	let currentY = startY;
	let remainingX = deltaX;
	let remainingY = deltaY;
	let collided = false;

	for (const obstacle of obstacles) {
		const projected = projectOutside(currentX, currentY, obstacle, epsilon);
		if (projected.projected) collided = true;
		currentX = projected.x;
		currentY = projected.y;
	}

	for (let reflection = 0; reflection < 12; reflection += 1) {
		const lengthSquared = remainingX * remainingX + remainingY * remainingY;
		if (lengthSquared === 0) break;
		let firstTime = Number.POSITIVE_INFINITY;
		let hit: CircleObstacle | null = null;

		for (const obstacle of obstacles) {
			const offsetX = currentX - obstacle.x;
			const offsetY = currentY - obstacle.y;
			const radius = obstacle.radius + epsilon;
			const radialVelocity = offsetX * remainingX + offsetY * remainingY;
			const surfaceError = offsetX * offsetX + offsetY * offsetY - radius * radius;
			if (Math.abs(surfaceError) <= radius * epsilon * 8 && radialVelocity < 0) {
				firstTime = 0;
				hit = obstacle;
				break;
			}
			const discriminant = radialVelocity * radialVelocity - lengthSquared * surfaceError;
			if (discriminant < 0) continue;
			const root = (-radialVelocity - Math.sqrt(Math.max(0, discriminant))) / lengthSquared;
			if (root >= 0 && root <= 1 && root < firstTime) {
				firstTime = root;
				hit = obstacle;
			}
		}

		if (!hit) {
			currentX += remainingX;
			currentY += remainingY;
			remainingX = 0;
			remainingY = 0;
			break;
		}

		collided = true;
		currentX += remainingX * firstTime;
		currentY += remainingY * firstTime;
		const normalLength = Math.hypot(currentX - hit.x, currentY - hit.y);
		const normalX = normalLength > 0 ? (currentX - hit.x) / normalLength : 1;
		const normalY = normalLength > 0 ? (currentY - hit.y) / normalLength : 0;
		const residualScale = 1 - firstTime;
		let residualX = remainingX * residualScale;
		let residualY = remainingY * residualScale;
		const normalComponent = residualX * normalX + residualY * normalY;
		residualX -= 2 * normalComponent * normalX;
		residualY -= 2 * normalComponent * normalY;
		currentX = hit.x + normalX * (hit.radius + epsilon);
		currentY = hit.y + normalY * (hit.radius + epsilon);
		remainingX = residualX;
		remainingY = residualY;
	}

	currentX += remainingX;
	currentY += remainingY;
	for (const obstacle of obstacles) {
		const projected = projectOutside(currentX, currentY, obstacle, epsilon);
		if (projected.projected) collided = true;
		currentX = projected.x;
		currentY = projected.y;
	}
	return { deltaX: currentX - startX, deltaY: currentY - startY, collided };
}
