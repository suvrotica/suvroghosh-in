import { GENOME_BOUNDS } from './genome';
import { DEFAULT_SIMULATION_PARAMETERS } from './simulationPresets';
import type { Organism, SimulationParameters } from './types';

export type LifeStage = 'juvenile' | 'adult' | 'elder';

export type MicrobeAppearance = {
	stage: LifeStage;
	ageRatio: number;
	juvenileAmount: number;
	elderAmount: number;
	growthScale: number;
	fullnessScale: number;
	bodyLength: number;
	bodyWidth: number;
	curvature: number;
	ciliaCount: number;
	ciliaLength: number;
	flagellaCount: number;
	flagellaLength: number;
	spikeCount: number;
	vacuoleCount: number;
	speckleCount: number;
	nucleusScale: number;
	opacity: number;
};

function clamp(value: number, minimum = 0, maximum = 1) {
	return Math.min(maximum, Math.max(minimum, value));
}

function normalize(value: number, bounds: readonly [number, number]) {
	return clamp((value - bounds[0]) / (bounds[1] - bounds[0]));
}

export function effectiveOrganismLifespan(organism: Organism, parameters: SimulationParameters) {
	return (
		organism.genome.lifespan *
		(parameters.maximumLifespan / DEFAULT_SIMULATION_PARAMETERS.maximumLifespan)
	);
}

export function microbeAppearance(
	organism: Organism,
	parameters: SimulationParameters,
	crowdingScale = 1
): MicrobeAppearance {
	const genome = organism.genome;
	const speed = normalize(genome.movementSpeed, GENOME_BOUNDS.movementSpeed);
	const sensing = normalize(genome.sensoryRadius, GENOME_BOUNDS.sensoryRadius);
	const turning = normalize(genome.turningTendency, GENOME_BOUNDS.turningTendency);
	const efficiency = normalize(genome.energyEfficiency, GENOME_BOUNDS.energyEfficiency);
	const attraction = normalize(genome.foodAttraction, GENOME_BOUNDS.foodAttraction);
	const avoidance = normalize(genome.dangerAvoidance, GENOME_BOUNDS.dangerAvoidance);
	const mutation = normalize(genome.mutationRate, GENOME_BOUNDS.mutationRate);
	const reproduction = normalize(genome.reproductionThreshold, GENOME_BOUNDS.reproductionThreshold);
	const ageRatio = clamp(
		organism.age / Math.max(1, effectiveOrganismLifespan(organism, parameters))
	);
	const juvenileAmount = clamp((0.16 - ageRatio) / 0.16);
	const elderAmount = clamp((ageRatio - 0.7) / 0.3);
	const stage: LifeStage = juvenileAmount > 0 ? 'juvenile' : elderAmount > 0 ? 'elder' : 'adult';
	const growthScale = (1 - juvenileAmount * 0.45 - elderAmount * 0.06) * crowdingScale;
	const effectiveThreshold =
		genome.reproductionThreshold *
		(parameters.reproductionThreshold / DEFAULT_SIMULATION_PARAMETERS.reproductionThreshold);
	const energyRatio = clamp(organism.energy / Math.max(1, effectiveThreshold), 0, 1.35);
	const fullnessScale = 0.82 + Math.min(1, energyRatio) * 0.2;
	const baseSize = Math.max(5.5, genome.bodySize + 2.2) * growthScale;

	return {
		stage,
		ageRatio,
		juvenileAmount,
		elderAmount,
		growthScale,
		fullnessScale,
		bodyLength: baseSize * (1.05 + speed * 0.72),
		bodyWidth: baseSize * (0.78 + efficiency * 0.28) * fullnessScale,
		curvature: (turning - 0.5) * 0.48,
		ciliaCount: Math.round(4 + sensing * 10),
		ciliaLength: 2.2 + sensing * 6.2,
		flagellaCount: speed > 0.76 ? 3 : speed > 0.4 ? 2 : 1,
		flagellaLength: baseSize * (1.5 + speed * 2.15),
		spikeCount: avoidance < 0.3 ? 0 : Math.round(2 + avoidance * 6),
		vacuoleCount: Math.round(2 + efficiency * 4 + attraction * 2),
		speckleCount: Math.round(1 + mutation * 7),
		nucleusScale: 0.78 + reproduction * 0.48,
		opacity: clamp(0.88 - juvenileAmount * 0.2 - elderAmount * 0.2, 0.52, 0.9)
	};
}
