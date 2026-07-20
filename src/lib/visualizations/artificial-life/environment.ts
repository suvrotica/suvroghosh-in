import {
	WORLD_HEIGHT,
	WORLD_WIDTH,
	type FoodParticle,
	type Organism,
	type Predator
} from './types';
import type { SeededRandom } from './seededRandom';

const DISH_CENTRE_X = WORLD_WIDTH / 2;
const DISH_CENTRE_Y = WORLD_HEIGHT / 2;
const DISH_RADIUS_X = WORLD_WIDTH * 0.47;
const DISH_RADIUS_Y = WORLD_HEIGHT * 0.44;

export function randomPointInDish(random: SeededRandom, inset = 0) {
	const angle = random.range(0, Math.PI * 2);
	const radius = Math.sqrt(random.next());
	return {
		x: DISH_CENTRE_X + Math.cos(angle) * (DISH_RADIUS_X - inset) * radius,
		y: DISH_CENTRE_Y + Math.sin(angle) * (DISH_RADIUS_Y - inset) * radius
	};
}

export function keepInsideDish(
	entity: Pick<Organism | Predator, 'x' | 'y' | 'heading'>,
	random: SeededRandom,
	inset: number
) {
	const radiusX = Math.max(10, DISH_RADIUS_X - inset);
	const radiusY = Math.max(10, DISH_RADIUS_Y - inset);
	const normalizedX = (entity.x - DISH_CENTRE_X) / radiusX;
	const normalizedY = (entity.y - DISH_CENTRE_Y) / radiusY;
	const distance = Math.hypot(normalizedX, normalizedY);
	if (distance <= 1) return;

	entity.x = DISH_CENTRE_X + (normalizedX / distance) * radiusX * 0.995;
	entity.y = DISH_CENTRE_Y + (normalizedY / distance) * radiusY * 0.995;
	entity.heading =
		Math.atan2(DISH_CENTRE_Y - entity.y, DISH_CENTRE_X - entity.x) + random.signed() * 0.3;
}

export function createFoodParticle(id: number, random: SeededRandom, energy: number): FoodParticle {
	return { id, ...randomPointInDish(random, 16), energy };
}

export function createPredator(id: number, random: SeededRandom): Predator {
	const position = randomPointInDish(random, 34);
	return {
		id,
		...position,
		previousX: position.x,
		previousY: position.y,
		heading: random.range(0, Math.PI * 2),
		radius: random.range(10, 15),
		cooldown: 0,
		feedingPulse: 0
	};
}

export function nearestFoodIndex(
	x: number,
	y: number,
	maximumDistance: number,
	food: readonly FoodParticle[]
) {
	let nearestIndex = -1;
	let nearestDistanceSquared = maximumDistance * maximumDistance;
	for (let index = 0; index < food.length; index += 1) {
		const offsetX = food[index].x - x;
		const offsetY = food[index].y - y;
		const distanceSquared = offsetX * offsetX + offsetY * offsetY;
		if (distanceSquared >= nearestDistanceSquared) continue;
		nearestDistanceSquared = distanceSquared;
		nearestIndex = index;
	}
	return nearestIndex;
}

export function nearestOrganismIndex(x: number, y: number, organisms: readonly Organism[]) {
	let nearestIndex = -1;
	let nearestDistanceSquared = Number.POSITIVE_INFINITY;
	for (let index = 0; index < organisms.length; index += 1) {
		const offsetX = organisms[index].x - x;
		const offsetY = organisms[index].y - y;
		const distanceSquared = offsetX * offsetX + offsetY * offsetY;
		if (distanceSquared >= nearestDistanceSquared) continue;
		nearestDistanceSquared = distanceSquared;
		nearestIndex = index;
	}
	return nearestIndex;
}

export function nearestPredatorIndex(
	x: number,
	y: number,
	maximumDistance: number,
	predators: readonly Predator[]
) {
	let nearestIndex = -1;
	let nearestDistanceSquared = maximumDistance * maximumDistance;
	for (let index = 0; index < predators.length; index += 1) {
		const offsetX = predators[index].x - x;
		const offsetY = predators[index].y - y;
		const distanceSquared = offsetX * offsetX + offsetY * offsetY;
		if (distanceSquared >= nearestDistanceSquared) continue;
		nearestDistanceSquared = distanceSquared;
		nearestIndex = index;
	}
	return nearestIndex;
}

export function angleDifference(target: number, current: number) {
	return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

export function phenotypeName(hue: number) {
	const normalized = ((hue % 360) + 360) % 360;
	if (normalized < 35 || normalized >= 330) return 'Coral membrane';
	if (normalized < 85) return 'Amber membrane';
	if (normalized < 165) return 'Moss membrane';
	if (normalized < 235) return 'Cyan membrane';
	if (normalized < 285) return 'Violet membrane';
	return 'Rose membrane';
}
