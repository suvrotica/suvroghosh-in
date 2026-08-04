export interface FixedTimestepClockOptions {
	readonly timestep: number;
	readonly speed?: number;
	readonly maxFrameDelta?: number;
	readonly maxStepsPerFrame?: number;
}

export interface ClockStep {
	readonly timestep: number;
	readonly stepIndex: number;
	readonly simulationTime: number;
}

export interface ClockAdvanceResult {
	readonly steps: number;
	readonly simulationTime: number;
	readonly stepIndex: number;
	readonly interpolationAlpha: number;
	readonly droppedWallTime: number;
}

export type ClockStepCallback = (step: ClockStep) => void;

const DEFAULT_MAX_FRAME_DELTA = 0.25;
const DEFAULT_MAX_STEPS_PER_FRAME = 240;
const STEP_EPSILON = 1e-10;

function positiveFinite(value: number, label: string): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new RangeError(`${label} must be finite and positive.`);
	}
	return value;
}

/** Wall-clock adapter that advances models only in exact, deterministic ticks. */
export class FixedTimestepClock {
	readonly timestep: number;
	readonly maxFrameDelta: number;
	readonly maxStepsPerFrame: number;
	private accumulator = 0;
	private currentStep = 0;
	private playbackSpeed: number;

	constructor(options: FixedTimestepClockOptions) {
		this.timestep = positiveFinite(options.timestep, 'Simulation timestep');
		this.maxFrameDelta = positiveFinite(
			options.maxFrameDelta ?? DEFAULT_MAX_FRAME_DELTA,
			'Maximum frame delta'
		);
		const maximumSteps = options.maxStepsPerFrame ?? DEFAULT_MAX_STEPS_PER_FRAME;
		if (!Number.isSafeInteger(maximumSteps) || maximumSteps < 1) {
			throw new RangeError('Maximum steps per frame must be a positive integer.');
		}
		this.maxStepsPerFrame = maximumSteps;
		this.playbackSpeed = positiveFinite(options.speed ?? 1, 'Simulation speed');
	}

	get stepIndex(): number {
		return this.currentStep;
	}

	get simulationTime(): number {
		return this.currentStep * this.timestep;
	}

	get speed(): number {
		return this.playbackSpeed;
	}

	setSpeed(speed: number): void {
		this.playbackSpeed = positiveFinite(speed, 'Simulation speed');
	}

	advance(wallDeltaSeconds: number, onStep: ClockStepCallback): ClockAdvanceResult {
		if (!Number.isFinite(wallDeltaSeconds) || wallDeltaSeconds < 0) {
			throw new RangeError('Wall-clock delta must be finite and non-negative.');
		}
		const acceptedDelta = Math.min(wallDeltaSeconds, this.maxFrameDelta);
		let droppedWallTime = wallDeltaSeconds - acceptedDelta;
		this.accumulator += acceptedDelta * this.playbackSpeed;

		const available = Math.floor((this.accumulator + this.timestep * STEP_EPSILON) / this.timestep);
		const steps = Math.min(available, this.maxStepsPerFrame);
		this.runSteps(steps, onStep, true);

		const remainingWholeSteps = Math.floor(
			(this.accumulator + this.timestep * STEP_EPSILON) / this.timestep
		);
		if (remainingWholeSteps > 0) {
			const discardedSimulationTime = remainingWholeSteps * this.timestep;
			this.accumulator -= discardedSimulationTime;
			droppedWallTime += discardedSimulationTime / this.playbackSpeed;
		}
		this.snapAccumulator();
		return this.result(steps, droppedWallTime);
	}

	step(steps: number, onStep: ClockStepCallback): ClockAdvanceResult {
		if (!Number.isSafeInteger(steps) || steps < 0) {
			throw new RangeError('Manual step count must be a non-negative integer.');
		}
		this.runSteps(steps, onStep, false);
		return this.result(steps, 0);
	}

	reset(): void {
		this.accumulator = 0;
		this.currentStep = 0;
	}

	private runSteps(steps: number, onStep: ClockStepCallback, consumeAccumulator: boolean): void {
		for (let offset = 0; offset < steps; offset += 1) {
			if (consumeAccumulator) this.accumulator -= this.timestep;
			this.currentStep += 1;
			onStep({
				timestep: this.timestep,
				stepIndex: this.currentStep,
				simulationTime: this.simulationTime
			});
		}
		this.snapAccumulator();
	}

	private snapAccumulator(): void {
		if (Math.abs(this.accumulator) <= this.timestep * STEP_EPSILON) this.accumulator = 0;
	}

	private result(steps: number, droppedWallTime: number): ClockAdvanceResult {
		return {
			steps,
			simulationTime: this.simulationTime,
			stepIndex: this.currentStep,
			interpolationAlpha: Math.min(1, Math.max(0, this.accumulator / this.timestep)),
			droppedWallTime
		};
	}
}
