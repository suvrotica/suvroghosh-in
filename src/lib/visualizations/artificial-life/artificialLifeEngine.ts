import { inheritGenome, GENOME_BOUNDS } from './genome';
import {
	angleDifference,
	createFoodParticle,
	createPredator,
	keepInsideDish,
	nearestFoodIndex,
	nearestOrganismIndex,
	nearestPredatorIndex,
	phenotypeName
} from './environment';
import { createFounder, createOffspring } from './organism';
import { SeededRandom } from './seededRandom';
import { DEFAULT_SIMULATION_PARAMETERS } from './simulationPresets';
import type {
	DeathCause,
	DeathCounts,
	FoodParticle,
	Organism,
	Predator,
	SimulationEvent,
	SimulationParameters,
	SimulationStats,
	TraitBin,
	TraitDistributions,
	TraitKey
} from './types';

function clamp(value: number, minimum: number, maximum: number) {
	return Math.min(maximum, Math.max(minimum, value));
}

function average(total: number, count: number) {
	return count === 0 ? 0 : total / count;
}

function swapRemove<Value>(values: Value[], index: number) {
	const lastIndex = values.length - 1;
	if (index < 0 || index > lastIndex) return;
	if (index !== lastIndex) values[index] = values[lastIndex];
	values.pop();
}

export class ArtificialLifeEngine {
	parameters: SimulationParameters;
	seed: string;
	random: SeededRandom;
	organisms: Organism[] = [];
	food: FoodParticle[] = [];
	predators: Predator[] = [];
	events: SimulationEvent[] = [];
	simulationTime = 0;
	totalBirths = 0;
	deathCounts: DeathCounts = { starvation: 0, age: 0, predation: 0, pressure: 0 };
	private foodAccumulator = 0;
	private nextOrganismId = 1;
	private nextFoodId = 1;
	private nextPredatorId = 1;
	private lineageBornAt = new Map<number, number>();

	constructor(
		parameters: SimulationParameters = DEFAULT_SIMULATION_PARAMETERS,
		seed = 'evolving-microbe-garden'
	) {
		this.parameters = { ...parameters };
		this.seed = seed;
		this.random = new SeededRandom(seed);
		this.restart(parameters, seed);
	}

	restart(parameters: SimulationParameters = this.parameters, seed = this.seed) {
		this.parameters = { ...parameters };
		this.seed = seed.trim() || 'evolving-microbe-garden';
		this.random = new SeededRandom(this.seed);
		this.organisms.length = 0;
		this.food.length = 0;
		this.predators.length = 0;
		this.events.length = 0;
		this.simulationTime = 0;
		this.totalBirths = 0;
		this.deathCounts = { starvation: 0, age: 0, predation: 0, pressure: 0 };
		this.foodAccumulator = 0;
		this.nextOrganismId = 1;
		this.nextFoodId = 1;
		this.nextPredatorId = 1;
		this.lineageBornAt.clear();

		const founderCount = Math.min(
			Math.round(this.parameters.startingPopulation),
			Math.round(this.parameters.populationLimit)
		);
		for (let index = 0; index < founderCount; index += 1) {
			const organism = createFounder(this.nextOrganismId, this.random, this.parameters);
			this.nextOrganismId += 1;
			this.organisms.push(organism);
			this.lineageBornAt.set(organism.lineageId, 0);
		}

		const startingFood = Math.min(Math.max(30, founderCount * 2), this.maximumFoodParticles());
		for (let index = 0; index < startingFood; index += 1) this.spawnFood();
		this.synchronizePredators();
	}

	setParameters(parameters: SimulationParameters) {
		this.parameters = { ...parameters };
		const limit = Math.max(1, Math.round(parameters.populationLimit));
		while (this.organisms.length > limit) {
			let weakestIndex = 0;
			for (let index = 1; index < this.organisms.length; index += 1) {
				if (this.organisms[index].energy < this.organisms[weakestIndex].energy)
					weakestIndex = index;
			}
			this.removeOrganism(weakestIndex, 'pressure');
		}
		this.synchronizePredators();
	}

	private maximumFoodParticles() {
		return Math.max(80, Math.round(this.parameters.populationLimit * 1.25));
	}

	private spawnFood() {
		if (this.food.length >= this.maximumFoodParticles()) return;
		this.food.push(
			createFoodParticle(this.nextFoodId, this.random, this.parameters.foodEnergyValue)
		);
		this.nextFoodId += 1;
	}

	private synchronizePredators() {
		if (!this.parameters.predatorsEnabled) {
			this.predators.length = 0;
			return;
		}

		const targetCount = clamp(Math.round(2 + this.parameters.environmentalHarshness * 3), 2, 5);
		while (this.predators.length < targetCount) {
			this.predators.push(createPredator(this.nextPredatorId, this.random));
			this.nextPredatorId += 1;
		}
		if (this.predators.length > targetCount) this.predators.length = targetCount;
	}

	private effectiveTrait(
		inheritedValue: number,
		controlValue: number,
		defaultControlValue: number
	) {
		return inheritedValue * (controlValue / defaultControlValue);
	}

	private removeOrganism(index: number, cause: DeathCause) {
		const organism = this.organisms[index];
		if (!organism) return;
		this.events.push({
			kind: 'death',
			x: organism.x,
			y: organism.y,
			hue: organism.genome.hue,
			age: 0,
			duration: 0.8
		});
		this.deathCounts[cause] += 1;
		swapRemove(this.organisms, index);
	}

	private updateOrganisms(deltaTime: number) {
		const initialCount = this.organisms.length;
		for (let index = initialCount - 1; index >= 0; index -= 1) {
			const organism = this.organisms[index];
			if (!organism) continue;
			const genome = organism.genome;
			const effectiveSensoryRadius = this.effectiveTrait(
				genome.sensoryRadius,
				this.parameters.sensoryRange,
				DEFAULT_SIMULATION_PARAMETERS.sensoryRange
			);
			const nearestFood = nearestFoodIndex(
				organism.x,
				organism.y,
				effectiveSensoryRadius,
				this.food
			);
			const nearestPredator = nearestPredatorIndex(
				organism.x,
				organism.y,
				effectiveSensoryRadius * 1.1,
				this.predators
			);

			organism.previousX = organism.x;
			organism.previousY = organism.y;
			organism.heading += this.random.signed() * genome.turningTendency * deltaTime * 1.8;

			if (nearestFood >= 0) {
				const particle = this.food[nearestFood];
				const desiredHeading = Math.atan2(particle.y - organism.y, particle.x - organism.x);
				organism.heading +=
					angleDifference(desiredHeading, organism.heading) *
					clamp(genome.foodAttraction * deltaTime * 1.7, 0, 0.8);
			}

			if (nearestPredator >= 0) {
				const predator = this.predators[nearestPredator];
				const escapeHeading = Math.atan2(organism.y - predator.y, organism.x - predator.x);
				organism.heading +=
					angleDifference(escapeHeading, organism.heading) *
					clamp(genome.dangerAvoidance * deltaTime * 2.6, 0, 0.9);
			}

			const movementSpeed = genome.movementSpeed;
			organism.x += Math.cos(organism.heading) * movementSpeed * deltaTime;
			organism.y += Math.sin(organism.heading) * movementSpeed * deltaTime;
			keepInsideDish(organism, this.random, genome.bodySize + 8);
			organism.age += deltaTime;

			const harshnessMultiplier = 1 + this.parameters.environmentalHarshness * 1.6;
			const efficiency = Math.max(0.35, genome.energyEfficiency);
			const basalCost = (this.parameters.basalEnergyCost * harshnessMultiplier) / efficiency;
			const movementCost =
				(this.parameters.movementEnergyCost *
					(movementSpeed / 50) *
					(genome.bodySize / 7) *
					harshnessMultiplier) /
				efficiency;
			organism.energy -= (basalCost + movementCost) * deltaTime;

			if (nearestFood >= 0 && this.food[nearestFood]) {
				const particle = this.food[nearestFood];
				if (Math.hypot(particle.x - organism.x, particle.y - organism.y) <= genome.bodySize + 4) {
					organism.energy += particle.energy * (0.8 + genome.energyEfficiency * 0.2);
					swapRemove(this.food, nearestFood);
				}
			}

			const effectiveLifespan = this.effectiveTrait(
				genome.lifespan,
				this.parameters.maximumLifespan,
				DEFAULT_SIMULATION_PARAMETERS.maximumLifespan
			);
			if (organism.energy <= 0) {
				this.removeOrganism(index, 'starvation');
				continue;
			}
			if (organism.age >= effectiveLifespan) {
				this.removeOrganism(index, 'age');
				continue;
			}
			if (this.random.chance(this.parameters.environmentalHarshness * 0.004 * deltaTime)) {
				this.removeOrganism(index, 'pressure');
				continue;
			}

			const threshold = this.effectiveTrait(
				genome.reproductionThreshold,
				this.parameters.reproductionThreshold,
				DEFAULT_SIMULATION_PARAMETERS.reproductionThreshold
			);
			if (
				organism.energy >= threshold &&
				this.organisms.length < Math.round(this.parameters.populationLimit)
			) {
				const availableEnergy = organism.energy;
				organism.energy = availableEnergy * 0.55;
				const childGenome = inheritGenome(genome, this.random, this.parameters);
				const child = createOffspring(
					this.nextOrganismId,
					organism,
					childGenome,
					availableEnergy * 0.45,
					this.random
				);
				this.nextOrganismId += 1;
				keepInsideDish(child, this.random, child.genome.bodySize + 8);
				this.organisms.push(child);
				this.totalBirths += 1;
				this.events.push({
					kind: 'birth',
					x: child.x,
					y: child.y,
					hue: child.genome.hue,
					age: 0,
					duration: 0.65
				});
			}
		}
	}

	private updatePredators(deltaTime: number) {
		for (const predator of this.predators) {
			predator.previousX = predator.x;
			predator.previousY = predator.y;
			predator.cooldown = Math.max(0, predator.cooldown - deltaTime);
			const targetIndex = nearestOrganismIndex(predator.x, predator.y, this.organisms);
			if (targetIndex >= 0) {
				const target = this.organisms[targetIndex];
				const desiredHeading = Math.atan2(target.y - predator.y, target.x - predator.x);
				predator.heading +=
					angleDifference(desiredHeading, predator.heading) * clamp(deltaTime * 2.4, 0, 0.7);
			} else {
				predator.heading += this.random.signed() * deltaTime;
			}

			const predatorSpeed = 52 + this.parameters.environmentalHarshness * 18;
			predator.x += Math.cos(predator.heading) * predatorSpeed * deltaTime;
			predator.y += Math.sin(predator.heading) * predatorSpeed * deltaTime;
			keepInsideDish(predator, this.random, predator.radius + 12);

			if (targetIndex < 0 || predator.cooldown > 0 || !this.organisms[targetIndex]) continue;
			const target = this.organisms[targetIndex];
			if (
				Math.hypot(target.x - predator.x, target.y - predator.y) <=
				predator.radius + target.genome.bodySize
			) {
				this.removeOrganism(targetIndex, 'predation');
				predator.cooldown = 0.55;
			}
		}
	}

	private updateEvents(deltaTime: number) {
		for (let index = this.events.length - 1; index >= 0; index -= 1) {
			this.events[index].age += deltaTime;
			if (this.events[index].age >= this.events[index].duration) swapRemove(this.events, index);
		}
		if (this.events.length > 140) this.events.splice(0, this.events.length - 140);
	}

	step(deltaTime: number) {
		const step = clamp(deltaTime, 0.001, 0.1);
		this.simulationTime += step;
		this.foodAccumulator += this.parameters.foodSpawnRate * step;
		while (this.foodAccumulator >= 1) {
			this.spawnFood();
			this.foodAccumulator -= 1;
		}
		this.synchronizePredators();
		this.updateOrganisms(step);
		this.updatePredators(step);
		this.updateEvents(step);
	}

	stepMany(steps: number, deltaTime: number) {
		for (let index = 0; index < steps; index += 1) this.step(deltaTime);
	}

	private totalDeaths() {
		return Object.values(this.deathCounts).reduce((total, count) => total + count, 0);
	}

	statistics(framesPerSecond = 0): SimulationStats {
		let totalEnergy = 0;
		let totalSpeed = 0;
		let totalSize = 0;
		let totalSensoryRadius = 0;
		let totalMutationRate = 0;
		let generationEstimate = 0;
		const phenotypes = new Map<string, number>();
		const lineages = new Map<number, number>();

		for (const organism of this.organisms) {
			totalEnergy += organism.energy;
			totalSpeed += organism.genome.movementSpeed;
			totalSize += organism.genome.bodySize;
			totalSensoryRadius += organism.genome.sensoryRadius;
			totalMutationRate += organism.genome.mutationRate;
			generationEstimate = Math.max(generationEstimate, organism.generation);
			const phenotype = phenotypeName(organism.genome.hue);
			phenotypes.set(phenotype, (phenotypes.get(phenotype) ?? 0) + 1);
			lineages.set(
				organism.lineageId,
				Math.max(lineages.get(organism.lineageId) ?? 0, organism.generation)
			);
		}

		const dominantPhenotype =
			Array.from(phenotypes.entries()).sort(
				(a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
			)[0]?.[0] ?? 'No dominant phenotype';
		const oldestLineageEntry = Array.from(lineages.entries()).sort((a, b) => {
			const birthDifference =
				(this.lineageBornAt.get(a[0]) ?? 0) - (this.lineageBornAt.get(b[0]) ?? 0);
			return birthDifference || b[1] - a[1] || a[0] - b[0];
		})[0];

		return {
			simulationTime: this.simulationTime,
			population: this.organisms.length,
			births: this.totalBirths,
			deaths: this.totalDeaths(),
			deathCounts: { ...this.deathCounts },
			generationEstimate,
			averageEnergy: average(totalEnergy, this.organisms.length),
			averageSpeed: average(totalSpeed, this.organisms.length),
			averageSize: average(totalSize, this.organisms.length),
			averageSensoryRadius: average(totalSensoryRadius, this.organisms.length),
			averageMutationRate: average(totalMutationRate, this.organisms.length),
			oldestLineage: oldestLineageEntry
				? `L-${String(oldestLineageEntry[0]).padStart(3, '0')} · ${oldestLineageEntry[1]} gen`
				: 'No extant lineage',
			dominantPhenotype,
			foodAvailability: this.food.length,
			predatorCount: this.predators.length,
			framesPerSecond
		};
	}

	private distribution(key: TraitKey, binCount = 8): TraitBin[] {
		const [minimum, maximum] = GENOME_BOUNDS[key];
		const width = (maximum - minimum) / binCount;
		const bins = Array.from({ length: binCount }, (_, index) => ({
			from: minimum + width * index,
			to: minimum + width * (index + 1),
			count: 0
		}));
		for (const organism of this.organisms) {
			const value = organism.genome[key];
			const index = clamp(Math.floor((value - minimum) / width), 0, binCount - 1);
			bins[index].count += 1;
		}
		return bins;
	}

	traitDistributions(): TraitDistributions {
		return {
			movementSpeed: this.distribution('movementSpeed'),
			bodySize: this.distribution('bodySize'),
			sensoryRadius: this.distribution('sensoryRadius'),
			mutationRate: this.distribution('mutationRate')
		};
	}
}
