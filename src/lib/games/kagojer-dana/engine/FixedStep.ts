export const FIXED_STEP_SECONDS = 1 / 120;
export const DEFAULT_MAX_CATCH_UP_STEPS = 8;

const STEP_EPSILON = 1e-10;

export interface FixedStepOptions {
	/** Defaults to the flight model's required 1/120 second tick. */
	stepSeconds?: number;
	/** Maximum physics ticks performed after one rendered frame. */
	maxCatchUpSteps?: number;
}

export interface FixedStepTick {
	stepSeconds: number;
	stepIndex: number;
	simulationTime: number;
}

export interface FixedStepResult {
	steps: number;
	stepIndex: number;
	simulationTime: number;
	/** Render interpolation fraction between the preceding and current simulation states. */
	alpha: number;
	/** Wall time deliberately discarded by the catch-up cap. */
	droppedSeconds: number;
}

export type FixedStepCallback = (tick: FixedStepTick) => void;

function positiveFinite(value: number, label: string): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new RangeError(`${label} must be finite and positive.`);
	}
	return value;
}

/** Deterministic wall-clock adapter for the 120 Hz flight simulation. */
export class FixedStep {
	readonly stepSeconds: number;
	readonly maxCatchUpSteps: number;
	private accumulatorSeconds = 0;
	private currentStep = 0;
	private suspended = false;

	constructor(options: FixedStepOptions = {}) {
		this.stepSeconds = positiveFinite(options.stepSeconds ?? FIXED_STEP_SECONDS, 'Fixed step');
		const maximumSteps = options.maxCatchUpSteps ?? DEFAULT_MAX_CATCH_UP_STEPS;
		if (!Number.isSafeInteger(maximumSteps) || maximumSteps < 1) {
			throw new RangeError('Maximum catch-up steps must be a positive integer.');
		}
		this.maxCatchUpSteps = maximumSteps;
	}

	get stepIndex(): number {
		return this.currentStep;
	}

	get simulationTime(): number {
		return this.currentStep * this.stepSeconds;
	}

	get alpha(): number {
		return Math.max(0, Math.min(1, this.accumulatorSeconds / this.stepSeconds));
	}

	get isSuspended(): boolean {
		return this.suspended;
	}

	advance(frameDeltaSeconds: number, onStep: FixedStepCallback): FixedStepResult {
		if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds < 0) {
			throw new RangeError('Frame delta must be finite and non-negative.');
		}
		if (this.suspended) return this.result(0, frameDeltaSeconds);

		const maximumAccumulation = this.maxCatchUpSteps * this.stepSeconds;
		const acceptedDelta = Math.min(frameDeltaSeconds, maximumAccumulation);
		let droppedSeconds = frameDeltaSeconds - acceptedDelta;
		this.accumulatorSeconds += acceptedDelta;
		if (this.accumulatorSeconds > maximumAccumulation) {
			droppedSeconds += this.accumulatorSeconds - maximumAccumulation;
			this.accumulatorSeconds = maximumAccumulation;
		}

		const availableSteps = Math.floor(
			(this.accumulatorSeconds + this.stepSeconds * STEP_EPSILON) / this.stepSeconds
		);
		const steps = Math.min(availableSteps, this.maxCatchUpSteps);
		this.runSteps(steps, onStep, true);
		return this.result(steps, droppedSeconds);
	}

	/** Runs an exact number of deterministic ticks without affecting the render accumulator. */
	step(steps: number, onStep: FixedStepCallback): FixedStepResult {
		if (!Number.isSafeInteger(steps) || steps < 0) {
			throw new RangeError('Manual step count must be a non-negative integer.');
		}
		this.runSteps(steps, onStep, false);
		return this.result(steps, 0);
	}

	/** Clears stale fractional wall time while preserving simulation time and state. */
	resetAccumulator(): void {
		this.accumulatorSeconds = 0;
	}

	/**
	 * Use this for document visibility. Both entering and leaving the hidden state clear the
	 * accumulator, so a backgrounded tab can never trigger a catch-up burst on return.
	 */
	setSuspended(suspended: boolean): void {
		this.suspended = suspended;
		this.resetAccumulator();
	}

	reset(): void {
		this.accumulatorSeconds = 0;
		this.currentStep = 0;
		this.suspended = false;
	}

	private runSteps(steps: number, onStep: FixedStepCallback, consumeAccumulator: boolean): void {
		for (let offset = 0; offset < steps; offset += 1) {
			if (consumeAccumulator) this.accumulatorSeconds -= this.stepSeconds;
			this.currentStep += 1;
			onStep({
				stepSeconds: this.stepSeconds,
				stepIndex: this.currentStep,
				simulationTime: this.simulationTime
			});
		}
		if (Math.abs(this.accumulatorSeconds) <= this.stepSeconds * STEP_EPSILON) {
			this.accumulatorSeconds = 0;
		}
	}

	private result(steps: number, droppedSeconds: number): FixedStepResult {
		return {
			steps,
			stepIndex: this.currentStep,
			simulationTime: this.simulationTime,
			alpha: this.alpha,
			droppedSeconds
		};
	}
}

export { FixedStep as FixedStepClock };
