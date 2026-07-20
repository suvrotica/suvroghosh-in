import { createRandomGenome } from './genome';
import { randomPointInDish } from './environment';
import type { Genome, Organism, SimulationParameters } from './types';
import type { SeededRandom } from './seededRandom';

export function createFounder(
	id: number,
	random: SeededRandom,
	parameters: SimulationParameters
): Organism {
	const position = randomPointInDish(random, 24);
	return {
		id,
		lineageId: id,
		generation: 0,
		genome: createRandomGenome(random, parameters),
		...position,
		previousX: position.x,
		previousY: position.y,
		heading: random.range(0, Math.PI * 2),
		energy: random.range(58, 82),
		age: random.range(0, 8)
	};
}

export function createOffspring(
	id: number,
	parent: Organism,
	genome: Genome,
	energy: number,
	random: SeededRandom
): Organism {
	const offsetAngle = random.range(0, Math.PI * 2);
	const offset = parent.genome.bodySize + random.range(3, 8);
	return {
		id,
		lineageId: parent.lineageId,
		generation: parent.generation + 1,
		genome,
		x: parent.x + Math.cos(offsetAngle) * offset,
		y: parent.y + Math.sin(offsetAngle) * offset,
		previousX: parent.x,
		previousY: parent.y,
		heading: parent.heading + random.signed() * 0.45,
		energy,
		age: 0
	};
}
