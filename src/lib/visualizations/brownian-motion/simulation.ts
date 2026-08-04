import { validateBoundaryCondition } from './boundaries';
import { calculateSimulationMetrics } from './metrics';
import { ParticleState } from './particle-state';
import { createBrownianRandomStreams, type LabelledRandomStreams } from './rng';
import { FixedTimestepClock, type ClockAdvanceResult, type ClockStep } from './simulation-clock';
import { TrajectoryBuffer } from './trajectory-buffer';
import type {
	BoundaryCondition,
	BrownianSimulationOptions,
	InitialCondition,
	ProcessModel,
	SimulationMetrics,
	SimulationSnapshot
} from './types';
import type { Seed } from '$lib/utils/seeded-random';

const DEFAULT_TRAJECTORY_CAPACITY = 512;
const DEFAULT_TRACKED_PARTICLES = 256;

function copyBoundary(boundary: BoundaryCondition): BoundaryCondition {
	return boundary.mode === 'unbounded'
		? { mode: 'unbounded' }
		: { mode: boundary.mode, bounds: { ...boundary.bounds } };
}

function copyInitialCondition(initial: InitialCondition): InitialCondition {
	if (
		!Number.isFinite(initial.x) ||
		!Number.isFinite(initial.y) ||
		!Number.isFinite(initial.spread) ||
		initial.spread < 0
	) {
		throw new RangeError(
			'Initial condition must contain finite coordinates and non-negative spread.'
		);
	}
	return { x: initial.x, y: initial.y, spread: initial.spread };
}

function positiveInteger(value: number, label: string): number {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new RangeError(`${label} must be a positive integer.`);
	}
	return value;
}

/** Owns deterministic model state and time while remaining entirely rendering-agnostic. */
export class BrownianSimulation {
	readonly state: ParticleState;
	readonly model: ProcessModel<object>;
	readonly initialCondition: InitialCondition;
	readonly boundary: BoundaryCondition;
	readonly clock: FixedTimestepClock;
	readonly trajectories: TrajectoryBuffer;
	readonly trajectorySampleEverySteps: number;
	private activeSeed: Seed;
	private randomStreams: LabelledRandomStreams;

	constructor(options: BrownianSimulationOptions) {
		this.model = options.model;
		this.initialCondition = copyInitialCondition(options.initialCondition);
		this.boundary = copyBoundary(options.boundary);
		validateBoundaryCondition(this.boundary);
		this.state = new ParticleState(options.particleCount);
		this.clock = new FixedTimestepClock({
			timestep: options.timestep,
			speed: options.speed,
			maxFrameDelta: options.maxFrameDelta,
			maxStepsPerFrame: options.maxStepsPerFrame
		});
		const trajectory = options.trajectory;
		const trackedParticles = Math.min(
			this.state.count,
			positiveInteger(
				trajectory?.trackedParticleCount ?? Math.min(DEFAULT_TRACKED_PARTICLES, this.state.count),
				'Tracked trajectory particle count'
			)
		);
		this.trajectorySampleEverySteps = positiveInteger(
			trajectory?.sampleEverySteps ?? 1,
			'Trajectory sample interval'
		);
		this.trajectories = new TrajectoryBuffer(
			this.state.count,
			positiveInteger(trajectory?.capacity ?? DEFAULT_TRAJECTORY_CAPACITY, 'Trajectory capacity'),
			trackedParticles
		);
		this.activeSeed = options.seed;
		this.randomStreams = createBrownianRandomStreams(this.activeSeed);
		this.reset(this.activeSeed);
	}

	get seed(): Seed {
		return this.activeSeed;
	}

	advanceFrame(wallDeltaSeconds: number): ClockAdvanceResult {
		return this.clock.advance(wallDeltaSeconds, (step) => this.performStep(step));
	}

	step(steps = 1): ClockAdvanceResult {
		return this.clock.step(steps, (step) => this.performStep(step));
	}

	setSpeed(speed: number): void {
		this.clock.setSpeed(speed);
	}

	reset(seed: Seed = this.activeSeed): void {
		this.activeSeed = seed;
		this.randomStreams = createBrownianRandomStreams(seed);
		this.state.clear();
		this.clock.reset();
		this.model.initialize(this.state, {
			initialCondition: this.initialCondition,
			boundary: this.boundary,
			random: this.randomStreams
		});
		this.trajectories.clear();
		this.trajectories.push(0, this.state);
	}

	metrics(): SimulationMetrics {
		return calculateSimulationMetrics(this.state, this.boundary, this.clock.simulationTime);
	}

	snapshot(): SimulationSnapshot {
		return {
			seed: this.activeSeed,
			stepIndex: this.clock.stepIndex,
			simulationTime: this.clock.simulationTime,
			metrics: this.metrics()
		};
	}

	private performStep(step: ClockStep): void {
		this.model.step(this.state, {
			timestep: step.timestep,
			stepIndex: step.stepIndex,
			simulationTime: step.simulationTime,
			boundary: this.boundary,
			random: this.randomStreams
		});
		if (step.stepIndex % this.trajectorySampleEverySteps === 0) {
			this.trajectories.push(step.simulationTime, this.state);
		}
	}
}
