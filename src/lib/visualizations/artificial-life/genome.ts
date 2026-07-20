import type { Genome, SimulationParameters } from './types';
import type { SeededRandom } from './seededRandom';

type GenomeBounds = Record<keyof Genome, readonly [number, number]>;

export const GENOME_BOUNDS: GenomeBounds = {
	movementSpeed: [24, 88],
	bodySize: [3.8, 12],
	sensoryRadius: [24, 190],
	turningTendency: [0.2, 2.8],
	energyEfficiency: [0.55, 1.55],
	reproductionThreshold: [55, 190],
	mutationRate: [0.02, 0.5],
	lifespan: [28, 260],
	foodAttraction: [0.25, 2.1],
	dangerAvoidance: [0.2, 2.6],
	hue: [0, 360]
};

function clamp(value: number, minimum: number, maximum: number) {
	return Math.min(maximum, Math.max(minimum, value));
}

function around(
	random: SeededRandom,
	centre: number,
	spread: number,
	minimum: number,
	maximum: number
) {
	return clamp(centre * random.range(1 - spread, 1 + spread), minimum, maximum);
}

export function createRandomGenome(random: SeededRandom, parameters: SimulationParameters): Genome {
	return {
		movementSpeed: random.range(34, 70),
		bodySize: random.range(4.8, 9.2),
		sensoryRadius: around(random, parameters.sensoryRange, 0.28, ...GENOME_BOUNDS.sensoryRadius),
		turningTendency: random.range(0.45, 1.9),
		energyEfficiency: random.range(0.72, 1.3),
		reproductionThreshold: around(
			random,
			parameters.reproductionThreshold,
			0.18,
			...GENOME_BOUNDS.reproductionThreshold
		),
		mutationRate: random.range(0.08, 0.24),
		lifespan: around(random, parameters.maximumLifespan, 0.22, ...GENOME_BOUNDS.lifespan),
		foodAttraction: random.range(0.55, 1.55),
		dangerAvoidance: random.range(0.55, 1.75),
		hue: random.range(125, 335)
	};
}

export function boundGenome(genome: Genome): Genome {
	const bounded = { ...genome };
	for (const key of Object.keys(GENOME_BOUNDS) as (keyof Genome)[]) {
		const [minimum, maximum] = GENOME_BOUNDS[key];
		bounded[key] = clamp(bounded[key], minimum, maximum);
	}
	bounded.hue = ((genome.hue % 360) + 360) % 360;
	return bounded;
}

export function effectiveMutationProbability(parentMutationRate: number, baseline: number) {
	const inheritedMutationPressure = clamp(parentMutationRate / 0.16, 0.35, 2.5);
	return clamp(baseline * inheritedMutationPressure, 0, 0.95);
}

export function inheritGenome(
	parent: Genome,
	random: SeededRandom,
	parameters: SimulationParameters
) {
	const child = { ...parent };
	const probability = effectiveMutationProbability(
		parent.mutationRate,
		parameters.mutationProbability
	);

	for (const key of Object.keys(GENOME_BOUNDS) as (keyof Genome)[]) {
		if (!random.chance(probability)) continue;
		const [minimum, maximum] = GENOME_BOUNDS[key];
		const triangularNoise = (random.signed() + random.signed()) * 0.5;
		const delta = triangularNoise * (maximum - minimum) * parameters.mutationMagnitude;
		child[key] += delta;
	}

	return boundGenome(child);
}
