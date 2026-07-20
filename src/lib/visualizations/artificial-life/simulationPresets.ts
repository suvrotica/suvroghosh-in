import type { NumericSimulationParameter, SimulationParameters } from './types';
import type { SeededRandom } from './seededRandom';

export const DEFAULT_SIMULATION_PARAMETERS: SimulationParameters = {
	simulationSpeed: 1,
	startingPopulation: 56,
	foodSpawnRate: 13,
	foodEnergyValue: 22,
	mutationProbability: 0.16,
	mutationMagnitude: 0.1,
	reproductionThreshold: 104,
	basalEnergyCost: 0.55,
	movementEnergyCost: 0.3,
	maximumLifespan: 125,
	sensoryRange: 88,
	environmentalHarshness: 0.2,
	populationLimit: 240,
	predatorsEnabled: false
};

export type SimulationControlDefinition = {
	key: NumericSimulationParameter;
	label: string;
	description: string;
	group: 'World' | 'Energy economy' | 'Evolution and pressure';
	minimum: number;
	maximum: number;
	step: number;
	unit?: string;
	restartRequired?: boolean;
	format?: 'integer' | 'decimal' | 'percent';
};

export const SIMULATION_CONTROLS: readonly SimulationControlDefinition[] = [
	{
		key: 'simulationSpeed',
		label: 'Simulation speed',
		description: 'Changes model time per real second without changing the biological rules.',
		group: 'World',
		minimum: 0.25,
		maximum: 4,
		step: 0.25,
		unit: '×',
		format: 'decimal'
	},
	{
		key: 'startingPopulation',
		label: 'Starting population',
		description:
			'Smaller founder groups amplify genetic drift: chance can dominate which traits survive.',
		group: 'World',
		minimum: 8,
		maximum: 180,
		step: 1,
		format: 'integer',
		restartRequired: true
	},
	{
		key: 'populationLimit',
		label: 'Population cap — browser safety limit',
		description:
			'A computational guard: births stop, and excess organisms are removed, when the habitat reaches this size. Resource economics determine the emergent sustainable population below it.',
		group: 'World',
		minimum: 40,
		maximum: 500,
		step: 10,
		format: 'integer'
	},
	{
		key: 'foodSpawnRate',
		label: 'Food spawn rate',
		description: 'Controls resource renewal and therefore the intensity of competition.',
		group: 'Energy economy',
		minimum: 0,
		maximum: 40,
		step: 1,
		unit: '/s',
		format: 'integer'
	},
	{
		key: 'foodEnergyValue',
		label: 'Food energy value',
		description: 'Sets the energy reward from consuming one nutrient particle.',
		group: 'Energy economy',
		minimum: 4,
		maximum: 60,
		step: 1,
		unit: ' E',
		format: 'integer'
	},
	{
		key: 'reproductionThreshold',
		label: 'Reproduction threshold',
		description:
			'Scales the inherited energy threshold for reproduction; lower values favour rapid but fragile lineages.',
		group: 'Energy economy',
		minimum: 55,
		maximum: 180,
		step: 1,
		unit: ' E',
		format: 'integer'
	},
	{
		key: 'basalEnergyCost',
		label: 'Basal energy cost',
		description: 'Energy lost merely by remaining alive, before movement is considered.',
		group: 'Energy economy',
		minimum: 0.1,
		maximum: 3,
		step: 0.05,
		unit: ' E/s',
		format: 'decimal'
	},
	{
		key: 'movementEnergyCost',
		label: 'Movement energy cost',
		description:
			'Makes speed expensive, creating selection against movement that finds too little food.',
		group: 'Energy economy',
		minimum: 0.05,
		maximum: 1.5,
		step: 0.05,
		unit: ' E',
		format: 'decimal'
	},
	{
		key: 'mutationProbability',
		label: 'Baseline mutation probability',
		description:
			'The environment-wide baseline chance that each inherited trait mutates. The parent’s inherited mutation-rate gene scales it, so lineages can mutate at different rates.',
		group: 'Evolution and pressure',
		minimum: 0,
		maximum: 0.8,
		step: 0.01,
		format: 'percent'
	},
	{
		key: 'mutationMagnitude',
		label: 'Mutation magnitude',
		description:
			'Controls how far a mutated trait may move while keeping every gene inside safe bounds.',
		group: 'Evolution and pressure',
		minimum: 0.01,
		maximum: 0.45,
		step: 0.01,
		format: 'percent'
	},
	{
		key: 'maximumLifespan',
		label: 'Maximum lifespan',
		description:
			'Scales inherited lifespans; surviving long enough to reproduce is one component of fitness.',
		group: 'Evolution and pressure',
		minimum: 30,
		maximum: 240,
		step: 5,
		unit: ' s',
		format: 'integer'
	},
	{
		key: 'sensoryRange',
		label: 'Sensory range',
		description:
			'Scales inherited sensing radii, trading better information for the energy cost of moving towards distant food.',
		group: 'Evolution and pressure',
		minimum: 20,
		maximum: 180,
		step: 5,
		unit: ' u',
		format: 'integer'
	},
	{
		key: 'environmentalHarshness',
		label: 'Environmental harshness',
		description:
			'Raises background costs and random pressure. This is selection pressure: the environment changes which variants leave descendants.',
		group: 'Evolution and pressure',
		minimum: 0,
		maximum: 1,
		step: 0.01,
		format: 'percent'
	}
] as const;

export type SimulationPreset = {
	id: string;
	label: string;
	description: string;
	seed: string;
	parameters: SimulationParameters;
};

function preset(
	id: string,
	label: string,
	description: string,
	seed: string,
	parameters: Partial<SimulationParameters>
): SimulationPreset {
	return {
		id,
		label,
		description,
		seed,
		parameters: { ...DEFAULT_SIMULATION_PARAMETERS, ...parameters }
	};
}

export const ARTIFICIAL_LIFE_PRESETS: readonly SimulationPreset[] = [
	preset(
		'abundant-garden',
		'Abundant Garden',
		'Frequent, rich food supports diverse lineages with relatively gentle selection.',
		'abundant-garden-24',
		{
			startingPopulation: 52,
			foodSpawnRate: 22,
			foodEnergyValue: 28,
			mutationProbability: 0.12,
			mutationMagnitude: 0.07,
			reproductionThreshold: 94,
			basalEnergyCost: 0.4,
			movementEnergyCost: 0.2,
			maximumLifespan: 160,
			sensoryRange: 105,
			environmentalHarshness: 0.08,
			populationLimit: 300,
			predatorsEnabled: false
		}
	),
	preset(
		'scarcity-competition',
		'Scarcity and Competition',
		'Sparse food and higher costs make efficiency, sensing, and chance extinctions matter.',
		'scarcity-competition-17',
		{
			startingPopulation: 92,
			foodSpawnRate: 6,
			foodEnergyValue: 15,
			mutationProbability: 0.14,
			mutationMagnitude: 0.09,
			reproductionThreshold: 112,
			basalEnergyCost: 0.85,
			movementEnergyCost: 0.5,
			maximumLifespan: 105,
			sensoryRange: 82,
			environmentalHarshness: 0.58,
			populationLimit: 180,
			predatorsEnabled: false
		}
	),
	preset(
		'high-mutation-chaos',
		'High Mutation Chaos',
		'Large, frequent mutations explore trait space quickly but often break successful combinations.',
		'high-mutation-chaos-39',
		{
			startingPopulation: 58,
			foodSpawnRate: 15,
			foodEnergyValue: 21,
			mutationProbability: 0.66,
			mutationMagnitude: 0.3,
			reproductionThreshold: 100,
			basalEnergyCost: 0.62,
			movementEnergyCost: 0.35,
			maximumLifespan: 105,
			sensoryRange: 100,
			environmentalHarshness: 0.3,
			populationLimit: 270,
			predatorsEnabled: false
		}
	),
	preset(
		'predator-prey-arms-race',
		'Predator–Prey Arms Race',
		'Predators reward sensing, avoidance, and speed while charging an energy price for movement.',
		'predator-prey-arms-race-51',
		{
			startingPopulation: 96,
			foodSpawnRate: 17,
			foodEnergyValue: 21,
			mutationProbability: 0.28,
			mutationMagnitude: 0.16,
			reproductionThreshold: 96,
			basalEnergyCost: 0.58,
			movementEnergyCost: 0.32,
			maximumLifespan: 135,
			sensoryRange: 116,
			environmentalHarshness: 0.34,
			populationLimit: 290,
			predatorsEnabled: true
		}
	)
];

export function randomizeParameters(random: SeededRandom): SimulationParameters {
	return {
		simulationSpeed: Math.round(random.range(0.75, 2) * 4) / 4,
		startingPopulation: random.integer(24, 120),
		foodSpawnRate: random.integer(4, 28),
		foodEnergyValue: random.integer(10, 40),
		mutationProbability: Math.round(random.range(0.05, 0.65) * 100) / 100,
		mutationMagnitude: Math.round(random.range(0.04, 0.32) * 100) / 100,
		reproductionThreshold: random.integer(72, 145),
		basalEnergyCost: Math.round(random.range(0.25, 1.4) * 20) / 20,
		movementEnergyCost: Math.round(random.range(0.1, 0.9) * 20) / 20,
		maximumLifespan: random.integer(14, 40) * 5,
		sensoryRange: random.integer(8, 30) * 5,
		environmentalHarshness: Math.round(random.range(0.05, 0.75) * 100) / 100,
		populationLimit: random.integer(12, 40) * 10,
		predatorsEnabled: random.chance(0.4)
	};
}
