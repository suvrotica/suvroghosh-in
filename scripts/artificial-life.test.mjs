import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({
	configFile: false,
	root: process.cwd(),
	appType: 'custom',
	server: { middlewareMode: true }
});

const { ArtificialLifeEngine } = await vite.ssrLoadModule(
	'/src/lib/visualizations/artificial-life/artificialLifeEngine.ts'
);
const { inheritGenome, GENOME_BOUNDS, effectiveMutationProbability } = await vite.ssrLoadModule(
	'/src/lib/visualizations/artificial-life/genome.ts'
);
const { SeededRandom } = await vite.ssrLoadModule(
	'/src/lib/visualizations/artificial-life/seededRandom.ts'
);
const { DEFAULT_SIMULATION_PARAMETERS } = await vite.ssrLoadModule(
	'/src/lib/visualizations/artificial-life/simulationPresets.ts'
);
const { effectiveOrganismLifespan, microbeAppearance } = await vite.ssrLoadModule(
	'/src/lib/visualizations/artificial-life/microbeAppearance.ts'
);
const { FIXED_TIME_STEP } = await vite.ssrLoadModule(
	'/src/lib/visualizations/artificial-life/types.ts'
);

after(async () => {
	await vite.close();
});

function snapshot(engine) {
	return {
		time: Number(engine.simulationTime.toFixed(6)),
		births: engine.totalBirths,
		deaths: { ...engine.deathCounts },
		lineageSelection: { ...engine.lineageSelection },
		organisms: engine.organisms
			.map((organism) => ({
				id: organism.id,
				lineageId: organism.lineageId,
				generation: organism.generation,
				x: Number(organism.x.toFixed(5)),
				y: Number(organism.y.toFixed(5)),
				energy: Number(organism.energy.toFixed(5)),
				age: Number(organism.age.toFixed(5)),
				feedingPulse: Number(organism.feedingPulse.toFixed(5)),
				collisionPulse: Number(organism.collisionPulse.toFixed(5)),
				birthPulse: Number(organism.birthPulse.toFixed(5)),
				genome: Object.fromEntries(
					Object.entries(organism.genome).map(([key, value]) => [key, Number(value.toFixed(6))])
				)
			}))
			.sort((a, b) => a.id - b.id),
		food: engine.food
			.map((particle) => ({
				id: particle.id,
				x: Number(particle.x.toFixed(5)),
				y: Number(particle.y.toFixed(5)),
				energy: particle.energy
			}))
			.sort((a, b) => a.id - b.id)
	};
}

test('the same seed and parameters produce the same fixed-step history', () => {
	const parameters = {
		...DEFAULT_SIMULATION_PARAMETERS,
		startingPopulation: 24,
		populationLimit: 90,
		predatorsEnabled: true
	};
	const first = new ArtificialLifeEngine(parameters, 'repeatable-garden-17');
	const second = new ArtificialLifeEngine(parameters, 'repeatable-garden-17');

	first.stepMany(360, FIXED_TIME_STEP);
	second.stepMany(360, FIXED_TIME_STEP);

	assert.deepEqual(snapshot(first), snapshot(second));
});

test('inheritance copies an unchanged genome when mutation is disabled', () => {
	const engine = new ArtificialLifeEngine(
		{ ...DEFAULT_SIMULATION_PARAMETERS, startingPopulation: 1 },
		'parent-genome'
	);
	const parent = engine.organisms[0].genome;
	const child = inheritGenome(parent, new SeededRandom('no-mutation'), {
		...DEFAULT_SIMULATION_PARAMETERS,
		mutationProbability: 0,
		mutationMagnitude: 0.45
	});

	assert.deepEqual(child, parent);
	assert.notEqual(child, parent);
});

test('the inherited mutation-rate gene scales the baseline per-gene probability', () => {
	assert.equal(effectiveMutationProbability(0.08, 0.16), 0.08);
	assert.equal(effectiveMutationProbability(0.16, 0.16), 0.16);
	assert.equal(effectiveMutationProbability(0.24, 0.16), 0.24);
	assert.equal(effectiveMutationProbability(0.5, 0.8), 0.95);
});

test('mutation changes inherited traits but never leaves their declared bounds', () => {
	const engine = new ArtificialLifeEngine(
		{ ...DEFAULT_SIMULATION_PARAMETERS, startingPopulation: 1 },
		'mutating-parent'
	);
	const parent = { ...engine.organisms[0].genome, mutationRate: 0.5 };
	const random = new SeededRandom('bounded-mutation');
	let changedTraits = 0;

	for (let sample = 0; sample < 80; sample += 1) {
		const child = inheritGenome(parent, random, {
			...DEFAULT_SIMULATION_PARAMETERS,
			mutationProbability: 0.8,
			mutationMagnitude: 0.45
		});
		for (const [key, [minimum, maximum]] of Object.entries(GENOME_BOUNDS)) {
			assert.ok(child[key] >= minimum, `${key} fell below its bound`);
			assert.ok(child[key] <= maximum, `${key} exceeded its bound`);
			if (child[key] !== parent[key]) changedTraits += 1;
		}
	}

	assert.ok(changedTraits > 0);
});

test('living and moving consumes energy when there is no food', () => {
	const engine = new ArtificialLifeEngine(
		{
			...DEFAULT_SIMULATION_PARAMETERS,
			startingPopulation: 1,
			foodSpawnRate: 0,
			basalEnergyCost: 1,
			movementEnergyCost: 1,
			environmentalHarshness: 0,
			predatorsEnabled: false
		},
		'energy-ledger'
	);
	engine.food.length = 0;
	const before = engine.organisms[0].energy;

	engine.stepMany(10, FIXED_TIME_STEP);

	assert.ok(engine.organisms[0].energy < before);
});

test('feeding produces a visible pulse and a named short-lived event', () => {
	const parameters = {
		...DEFAULT_SIMULATION_PARAMETERS,
		startingPopulation: 1,
		foodSpawnRate: 0,
		basalEnergyCost: 0.1,
		movementEnergyCost: 0.05,
		reproductionThreshold: 180,
		predatorsEnabled: false
	};
	const engine = new ArtificialLifeEngine(parameters, 'visible-feeding');
	const organism = engine.organisms[0];
	organism.genome.movementSpeed = 0;
	organism.energy = 20;
	engine.food.length = 0;
	engine.food.push({ id: 999, x: organism.x, y: organism.y, energy: 24 });

	engine.step(FIXED_TIME_STEP);

	assert.equal(engine.food.length, 0);
	assert.ok(organism.feedingPulse > 0);
	assert.ok(engine.events.some((event) => event.kind === 'feeding'));
});

test('overlapping microbes separate, turn apart, and expose collision pulses', () => {
	const parameters = {
		...DEFAULT_SIMULATION_PARAMETERS,
		startingPopulation: 2,
		foodSpawnRate: 0,
		basalEnergyCost: 0.1,
		movementEnergyCost: 0.05,
		reproductionThreshold: 180,
		predatorsEnabled: false
	};
	const engine = new ArtificialLifeEngine(parameters, 'visible-collision');
	engine.food.length = 0;
	const [first, second] = engine.organisms;
	first.x = second.x = 500;
	first.y = second.y = 310;
	first.genome.movementSpeed = 0;
	second.genome.movementSpeed = 0;

	engine.step(FIXED_TIME_STEP);

	assert.ok(Math.hypot(first.x - second.x, first.y - second.y) > 1);
	assert.ok(first.collisionPulse > 0);
	assert.ok(second.collisionPulse > 0);
	assert.ok(engine.events.some((event) => event.kind === 'collision'));
});

test('age and inherited traits map to visibly different procedural bodies', () => {
	const parameters = { ...DEFAULT_SIMULATION_PARAMETERS, startingPopulation: 1 };
	const engine = new ArtificialLifeEngine(parameters, 'visible-phenotype');
	const organism = engine.organisms[0];
	organism.age = 0;
	const juvenile = microbeAppearance(organism, parameters);
	organism.age = effectiveOrganismLifespan(organism, parameters) * 0.86;
	const elder = microbeAppearance(organism, parameters);
	const subtle = microbeAppearance(
		{
			...organism,
			genome: {
				...organism.genome,
				movementSpeed: 24,
				sensoryRadius: 24,
				dangerAvoidance: 0.2
			}
		},
		parameters
	);
	const expressive = microbeAppearance(
		{
			...organism,
			genome: {
				...organism.genome,
				movementSpeed: 88,
				sensoryRadius: 190,
				dangerAvoidance: 2.6
			}
		},
		parameters
	);

	assert.equal(juvenile.stage, 'juvenile');
	assert.equal(elder.stage, 'elder');
	assert.ok(juvenile.growthScale < elder.growthScale);
	assert.ok(expressive.bodyLength > subtle.bodyLength);
	assert.ok(expressive.flagellaCount > subtle.flagellaCount);
	assert.ok(expressive.ciliaCount > subtle.ciliaCount);
	assert.ok(expressive.spikeCount > subtle.spikeCount);
});

test('an organism above its effective threshold reproduces and shares energy', () => {
	const parameters = {
		...DEFAULT_SIMULATION_PARAMETERS,
		startingPopulation: 1,
		foodSpawnRate: 0,
		reproductionThreshold: 55,
		populationLimit: 10,
		predatorsEnabled: false
	};
	const engine = new ArtificialLifeEngine(parameters, 'reproduction');
	engine.food.length = 0;
	engine.organisms[0].genome.reproductionThreshold = 55;
	engine.organisms[0].energy = 200;

	engine.step(FIXED_TIME_STEP);

	assert.equal(engine.totalBirths, 1);
	assert.equal(engine.organisms.length, 2);
	assert.equal(engine.organisms[1].generation, 1);
	assert.equal(engine.organisms[1].lineageId, engine.organisms[0].lineageId);
	assert.ok(engine.organisms[0].energy < 200);
});

test('starvation and ageing remove organisms and record the death cause', () => {
	const starvation = new ArtificialLifeEngine(
		{
			...DEFAULT_SIMULATION_PARAMETERS,
			startingPopulation: 1,
			foodSpawnRate: 0,
			basalEnergyCost: 3,
			movementEnergyCost: 1.5,
			environmentalHarshness: 0,
			predatorsEnabled: false
		},
		'starvation'
	);
	starvation.food.length = 0;
	starvation.organisms[0].energy = 0.001;
	starvation.step(FIXED_TIME_STEP);
	assert.equal(starvation.organisms.length, 0);
	assert.equal(starvation.deathCounts.starvation, 1);

	const ageing = new ArtificialLifeEngine(
		{ ...DEFAULT_SIMULATION_PARAMETERS, startingPopulation: 1, predatorsEnabled: false },
		'ageing'
	);
	ageing.organisms[0].age = ageing.organisms[0].genome.lifespan + 1;
	ageing.step(FIXED_TIME_STEP);
	assert.equal(ageing.organisms.length, 0);
	assert.equal(ageing.deathCounts.age, 1);
});

test('the engine selects one deepest surviving lineage for statistics and highlighting', () => {
	const engine = new ArtificialLifeEngine(
		{
			...DEFAULT_SIMULATION_PARAMETERS,
			startingPopulation: 3,
			foodSpawnRate: 0,
			reproductionThreshold: 180,
			basalEnergyCost: 0.1,
			movementEnergyCost: 0.05,
			maximumLifespan: 240,
			environmentalHarshness: 0,
			populationLimit: 10,
			predatorsEnabled: false
		},
		'deepest-lineage'
	);
	engine.food.length = 0;
	engine.organisms[0].generation = 2;
	engine.organisms[1].generation = 5;
	engine.organisms[2].generation = 5;
	engine.organisms.push({
		...engine.organisms[2],
		id: 999,
		generation: 1,
		energy: 50,
		age: 0
	});

	engine.step(FIXED_TIME_STEP);
	const stats = engine.statistics();

	assert.equal(engine.lineageSelection.id, engine.organisms[2].lineageId);
	assert.equal(stats.deepestSurvivingLineageId, engine.lineageSelection.id);
	assert.match(stats.deepestSurvivingLineage, /generation 5 · 2 living/);
});

test('founders and offspring never exceed the configured population limit', () => {
	const parameters = {
		...DEFAULT_SIMULATION_PARAMETERS,
		startingPopulation: 40,
		foodSpawnRate: 0,
		reproductionThreshold: 55,
		populationLimit: 7,
		predatorsEnabled: false
	};
	const engine = new ArtificialLifeEngine(parameters, 'population-cap');
	assert.equal(engine.organisms.length, 7);

	for (const organism of engine.organisms) {
		organism.genome.reproductionThreshold = 55;
		organism.energy = 300;
	}
	engine.stepMany(60, FIXED_TIME_STEP);

	assert.ok(engine.organisms.length <= parameters.populationLimit);
});
