import type { Seed } from '$lib/utils/seeded-random';
import type { LabelledRandomStreams } from './rng';

export type BoundaryMode = 'unbounded' | 'reflecting' | 'periodic' | 'absorbing';

export const PROCESS_IDS = [
	'random-walk',
	'free-brownian',
	'drift-diffusion',
	'anisotropic-diffusion',
	'ornstein-uhlenbeck',
	'underdamped-langevin',
	'potential-diffusion',
	'active-brownian',
	'brownian-bridge',
	'fractional-brownian',
	'geometric-brownian',
	'levy-flight',
	'first-passage'
] as const;

export type ProcessId = (typeof PROCESS_IDS)[number];

export type NumericParticleArray =
	| Float64Array
	| Float32Array
	| Uint32Array
	| Uint16Array
	| Uint8Array
	| Int32Array;

/** Model-owned, typed-array scratch space. It is cleared whenever a run resets. */
export type ParticleModelData = Record<string, NumericParticleArray>;

export interface RectangleBounds {
	readonly minX: number;
	readonly maxX: number;
	readonly minY: number;
	readonly maxY: number;
}

export type BoundaryCondition =
	| { readonly mode: 'unbounded' }
	| {
			readonly mode: Exclude<BoundaryMode, 'unbounded'>;
			readonly bounds: RectangleBounds;
	  };

export interface InitialCondition {
	readonly x: number;
	readonly y: number;
	/** Per-axis standard deviation of the initial Gaussian cloud. */
	readonly spread: number;
}

/**
 * Structure-of-arrays storage shared by every process model. `x` and `y` are
 * display-space coordinates; the unwrapped arrays preserve the latent path
 * through periodic seams and repeated reflections.
 */
export interface ParticleArrays {
	readonly count: number;
	readonly x: Float64Array;
	readonly y: Float64Array;
	readonly unwrappedX: Float64Array;
	readonly unwrappedY: Float64Array;
	readonly originX: Float64Array;
	readonly originY: Float64Array;
	readonly originUnwrappedX: Float64Array;
	readonly originUnwrappedY: Float64Array;
	readonly alive: Uint8Array;
	/** Velocity is meaningful only for models that define it. Other models leave it at zero. */
	readonly velocityX: Float64Array;
	readonly velocityY: Float64Array;
	/** Particle heading in radians; meaningful for active-particle models. */
	readonly orientation: Float64Array;
	/** NaN until absorption, then the estimated simulated first-arrival time. */
	readonly firstPassageTime: Float64Array;
	readonly modelData: ParticleModelData;
}

export interface ProcessInitializationContext {
	readonly initialCondition: InitialCondition;
	readonly boundary: BoundaryCondition;
	readonly random: LabelledRandomStreams;
}

export interface ProcessStepContext {
	readonly timestep: number;
	readonly stepIndex: number;
	/** Simulated time after this step completes. */
	readonly simulationTime: number;
	readonly boundary: BoundaryCondition;
	readonly random: LabelledRandomStreams;
}

/** Rendering-independent contract implemented by every stochastic process. */
export interface ProcessModel<Parameters extends object = Record<string, never>> {
	readonly id: ProcessId;
	readonly dimensions?: 1 | 2;
	readonly parameters: Readonly<Parameters>;
	initialize(state: ParticleArrays, context: ProcessInitializationContext): void;
	step(state: ParticleArrays, context: ProcessStepContext): void;
}

export interface TrajectoryOptions {
	readonly capacity: number;
	readonly sampleEverySteps?: number;
	readonly trackedParticleCount?: number;
}

export interface BrownianSimulationOptions {
	readonly seed: Seed;
	readonly particleCount: number;
	readonly timestep: number;
	readonly model: ProcessModel<object>;
	readonly initialCondition: InitialCondition;
	readonly boundary: BoundaryCondition;
	readonly speed?: number;
	readonly maxFrameDelta?: number;
	readonly maxStepsPerFrame?: number;
	readonly trajectory?: TrajectoryOptions;
}

export interface Vector2 {
	readonly x: number;
	readonly y: number;
}

export interface SimulationMetrics {
	readonly simulationTime: number;
	readonly particleCount: number;
	readonly aliveCount: number;
	readonly absorbedCount: number;
	readonly survivalFraction: number;
	readonly mean: Vector2 | null;
	readonly variance: Vector2 | null;
	readonly covarianceXY: number | null;
	readonly meanSquareDisplacement: number | null;
	readonly meanSquareDisplacementByAxis: Vector2 | null;
	readonly rootMeanSquareDisplacement: number | null;
}

export interface SimulationSnapshot {
	readonly seed: Seed;
	readonly stepIndex: number;
	readonly simulationTime: number;
	readonly metrics: SimulationMetrics;
}
