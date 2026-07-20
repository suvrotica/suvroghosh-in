export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 620;
export const FIXED_TIME_STEP = 1 / 30;
export const GENERATION_WINDOW_STEPS = 240;

export type SimulationParameters = {
	simulationSpeed: number;
	startingPopulation: number;
	foodSpawnRate: number;
	foodEnergyValue: number;
	mutationProbability: number;
	mutationMagnitude: number;
	reproductionThreshold: number;
	basalEnergyCost: number;
	movementEnergyCost: number;
	maximumLifespan: number;
	sensoryRange: number;
	environmentalHarshness: number;
	populationLimit: number;
	predatorsEnabled: boolean;
};

export type NumericSimulationParameter = {
	[Key in keyof SimulationParameters]: SimulationParameters[Key] extends number ? Key : never;
}[keyof SimulationParameters];

export type Genome = {
	movementSpeed: number;
	bodySize: number;
	sensoryRadius: number;
	turningTendency: number;
	energyEfficiency: number;
	reproductionThreshold: number;
	mutationRate: number;
	lifespan: number;
	foodAttraction: number;
	dangerAvoidance: number;
	hue: number;
};

export type Organism = {
	id: number;
	lineageId: number;
	generation: number;
	genome: Genome;
	x: number;
	y: number;
	previousX: number;
	previousY: number;
	heading: number;
	energy: number;
	age: number;
};

export type FoodParticle = {
	id: number;
	x: number;
	y: number;
	energy: number;
};

export type Predator = {
	id: number;
	x: number;
	y: number;
	previousX: number;
	previousY: number;
	heading: number;
	radius: number;
	cooldown: number;
};

export type SimulationEvent = {
	kind: 'birth' | 'death';
	x: number;
	y: number;
	hue: number;
	age: number;
	duration: number;
};

export type DeathCause = 'starvation' | 'age' | 'predation' | 'pressure';

export type DeathCounts = Record<DeathCause, number>;

export type SimulationStats = {
	simulationTime: number;
	population: number;
	births: number;
	deaths: number;
	deathCounts: DeathCounts;
	generationEstimate: number;
	averageEnergy: number;
	averageSpeed: number;
	averageSize: number;
	averageSensoryRadius: number;
	averageMutationRate: number;
	oldestLineage: string;
	dominantPhenotype: string;
	foodAvailability: number;
	predatorCount: number;
	framesPerSecond: number;
};

export type SimulationHistoryPoint = {
	time: number;
	population: number;
	births: number;
	deaths: number;
};

export type TraitKey = 'movementSpeed' | 'bodySize' | 'sensoryRadius' | 'mutationRate';

export type TraitBin = {
	from: number;
	to: number;
	count: number;
};

export type TraitDistributions = Record<TraitKey, TraitBin[]>;

export type SimulationUpdate = {
	stats: SimulationStats;
	history: SimulationHistoryPoint[];
	distributions: TraitDistributions;
};

export const EMPTY_SIMULATION_STATS: SimulationStats = {
	simulationTime: 0,
	population: 0,
	births: 0,
	deaths: 0,
	deathCounts: { starvation: 0, age: 0, predation: 0, pressure: 0 },
	generationEstimate: 0,
	averageEnergy: 0,
	averageSpeed: 0,
	averageSize: 0,
	averageSensoryRadius: 0,
	averageMutationRate: 0,
	oldestLineage: 'No extant lineage',
	dominantPhenotype: 'No dominant phenotype',
	foodAvailability: 0,
	predatorCount: 0,
	framesPerSecond: 0
};
