import {
	finiteDifferenceHessian,
	isFiniteVector,
	norm,
	pointInDomain,
	symmetricEigenDecomposition
} from './linear-algebra';
import { sampleGradient } from './gradients';
import { isRegressionLandscape } from './landscapes';
import {
	initializeOptimizer,
	normalizeOptimizerConfig,
	optimizerMemoryStepNorm,
	stepOptimizer,
	validateOptimizerConfig
} from './optimizers';
import { SeededRandom } from './prng';
import type {
	GradientSample,
	GradientMode,
	OptimizerConfig,
	OptimizerState,
	RunStatus,
	SimulationConfig,
	SimulationHistoryPoint,
	SimulationSnapshot,
	Vector2
} from './types';

const TERMINAL_STATUSES = new Set<RunStatus>([
	'converged',
	'iteration-limit',
	'escaped-domain',
	'numerically-diverged',
	'stalled',
	'invalid-configuration'
]);

export const DEFAULT_MAXIMUM_HISTORY_LENGTH = 10_001;
export const MAXIMUM_HISTORY_LENGTH = 100_001;

export function isTerminalStatus(status: RunStatus): boolean {
	return TERMINAL_STATUSES.has(status);
}

type NormalizedSimulationConfig = {
	readonly landscape: SimulationConfig['landscape'];
	readonly start: Vector2;
	readonly optimizer: Required<OptimizerConfig>;
	readonly gradientMode: GradientMode;
	readonly seed: string;
	readonly maximumIterations: number;
	readonly maximumHistoryLength: number;
	readonly gradientTolerance: number;
	readonly stepTolerance: number;
	readonly stallPatience: number;
};

function normalizeSimulationConfig(config: SimulationConfig): NormalizedSimulationConfig {
	const start = config.start ?? config.landscape.defaultStart;
	if (!isFiniteVector(start))
		throw new RangeError('Simulation start must contain finite coordinates.');
	const seed = config.seed ?? 'descent-1847';
	if (seed.trim().length === 0 || seed.length > 128) {
		throw new RangeError('Simulation seed must contain 1 to 128 characters.');
	}
	const maximumIterations = config.maximumIterations ?? 2_000;
	if (
		!Number.isSafeInteger(maximumIterations) ||
		maximumIterations < 1 ||
		maximumIterations > 1_000_000
	) {
		throw new RangeError('maximumIterations must be an integer between 1 and 1,000,000.');
	}
	const maximumHistoryLength = config.maximumHistoryLength ?? DEFAULT_MAXIMUM_HISTORY_LENGTH;
	if (
		!Number.isSafeInteger(maximumHistoryLength) ||
		maximumHistoryLength < 2 ||
		maximumHistoryLength > MAXIMUM_HISTORY_LENGTH
	) {
		throw new RangeError(
			`maximumHistoryLength must be an integer between 2 and ${MAXIMUM_HISTORY_LENGTH.toLocaleString('en-US')}.`
		);
	}
	const gradientTolerance = config.gradientTolerance ?? 1e-7;
	const stepTolerance = config.stepTolerance ?? 1e-12;
	for (const [name, value] of [
		['gradientTolerance', gradientTolerance],
		['stepTolerance', stepTolerance]
	] as const) {
		if (!(value >= 0) || !Number.isFinite(value)) {
			throw new RangeError(`${name} must be a finite non-negative number.`);
		}
	}
	const stallPatience = config.stallPatience ?? 8;
	if (!Number.isSafeInteger(stallPatience) || stallPatience < 1 || stallPatience > 10_000) {
		throw new RangeError('stallPatience must be an integer between 1 and 10,000.');
	}

	validateOptimizerConfig(config.optimizer);
	const optimizer = normalizeOptimizerConfig(config.optimizer);
	const gradientMode = config.gradientMode ?? { kind: 'full' };
	if (gradientMode.kind === 'minibatch' && !isRegressionLandscape(config.landscape)) {
		throw new TypeError('Minibatch mode requires the regression landscape.');
	}
	if (gradientMode.kind === 'noisy') {
		if (isRegressionLandscape(config.landscape)) {
			throw new TypeError('Regression stochastic gradients use minibatches, not additive noise.');
		}
		if (!(gradientMode.sigma >= 0) || !Number.isFinite(gradientMode.sigma)) {
			throw new RangeError('Noisy-gradient sigma must be finite and non-negative.');
		}
	}

	return {
		landscape: config.landscape,
		start: [start[0], start[1]],
		optimizer,
		gradientMode,
		seed,
		maximumIterations,
		maximumHistoryLength,
		gradientTolerance,
		stepTolerance,
		stallPatience
	};
}

function statusMessage(status: RunStatus): string {
	switch (status) {
		case 'ready':
			return 'Ready';
		case 'running':
			return 'Running';
		case 'paused':
			return 'Paused';
		case 'converged':
			return 'Converged';
		case 'iteration-limit':
			return 'Iteration limit reached';
		case 'escaped-domain':
			return 'Escaped visible domain';
		case 'numerically-diverged':
			return 'Numerically diverged';
		case 'stalled':
			return 'Stalled near a stationary point';
		case 'invalid-configuration':
			return 'Invalid parameter configuration';
	}
}

export class GradientDescentSimulation {
	readonly originalConfig: SimulationConfig;
	private normalized: NormalizedSimulationConfig | null = null;
	private random = new SeededRandom('invalid-configuration');
	private optimizerState: OptimizerState = { id: 'gd', iteration: 0 };
	private records: SimulationHistoryPoint[] = [];
	private stalledSteps = 0;
	private currentTheta: Vector2 = [0, 0];
	private currentLoss = Number.NaN;
	private currentStatus: RunStatus = 'invalid-configuration';
	private currentStatusMessage = statusMessage('invalid-configuration');
	private evaluations = 0;
	private configurationError: string | null = null;

	constructor(config: SimulationConfig) {
		this.originalConfig = config;
		try {
			this.normalized = normalizeSimulationConfig(config);
			this.reset();
		} catch (error) {
			this.configurationError = error instanceof Error ? error.message : String(error);
			this.currentStatus = 'invalid-configuration';
			this.currentStatusMessage = `${statusMessage(this.currentStatus)}: ${this.configurationError}`;
		}
	}

	get status(): RunStatus {
		return this.currentStatus;
	}

	get iteration(): number {
		return this.records.at(-1)?.iteration ?? 0;
	}

	get gradientEvaluations(): number {
		return this.evaluations;
	}

	get theta(): Vector2 {
		return this.currentTheta;
	}

	get loss(): number {
		return this.currentLoss;
	}

	get history(): readonly SimulationHistoryPoint[] {
		return this.records;
	}

	reset(): SimulationSnapshot {
		if (!this.normalized) return this.snapshot();
		try {
			const loss = this.normalized.landscape.value(this.normalized.start);
			if (!Number.isFinite(loss)) throw new RangeError('Initial loss is not finite.');
			this.random = new SeededRandom(this.normalized.seed);
			this.optimizerState = initializeOptimizer(this.normalized.optimizer);
			this.currentTheta = this.normalized.start;
			this.currentLoss = loss;
			this.currentStatus = 'ready';
			this.currentStatusMessage = statusMessage('ready');
			this.evaluations = 0;
			this.stalledSteps = 0;
			this.configurationError = null;
			this.records = [
				{
					iteration: 0,
					gradientEvaluations: 0,
					theta: this.currentTheta,
					loss,
					gradient: null,
					fullGradient: null,
					update: null,
					gradientNorm: null,
					stepNorm: null,
					optimizerDiagnostics: null,
					batchIndices: null,
					terminalEvaluation: null
				}
			];
		} catch (error) {
			this.configurationError = error instanceof Error ? error.message : String(error);
			this.currentStatus = 'invalid-configuration';
			this.currentStatusMessage = `${statusMessage(this.currentStatus)}: ${this.configurationError}`;
		}
		return this.snapshot();
	}

	pause(): SimulationSnapshot {
		if (this.currentStatus === 'running') {
			this.currentStatus = 'paused';
			this.currentStatusMessage = statusMessage('paused');
		}
		return this.snapshot();
	}

	play(): SimulationSnapshot {
		if (this.currentStatus === 'ready' || this.currentStatus === 'paused') {
			this.currentStatus = 'running';
			this.currentStatusMessage = statusMessage('running');
		}
		return this.snapshot();
	}

	step(): SimulationSnapshot {
		this.advanceOneStep();
		return this.snapshot();
	}

	private advanceOneStep(): void {
		const config = this.normalized;
		if (!config || isTerminalStatus(this.currentStatus)) return;
		const remainRunning = this.currentStatus === 'running';
		this.currentStatus = 'running';
		this.currentStatusMessage = statusMessage('running');

		let gradientSample;
		try {
			gradientSample = sampleGradient(
				config.landscape,
				this.currentTheta,
				config.gradientMode,
				this.random
			);
			this.evaluations += 1;
		} catch (error) {
			this.failNumerically(error);
			return;
		}

		if (!isFiniteVector(gradientSample.active) || !isFiniteVector(gradientSample.full)) {
			this.recordTerminalEvaluation(gradientSample);
			this.failNumerically('The gradient was not finite.');
			return;
		}

		const gradientNorm = norm(gradientSample.active);
		const fullGradientNorm = norm(gradientSample.full);
		// Apply the stopping test at the same theta where the full gradient and
		// Hessian are evaluated. This is essential for stochastic modes: an active
		// sample can be non-zero at the full-data optimum (or zero away from it).
		if (fullGradientNorm <= config.gradientTolerance) {
			let memoryStepNorm: number;
			try {
				memoryStepNorm = optimizerMemoryStepNorm(this.optimizerState, config.optimizer);
			} catch (error) {
				this.recordTerminalEvaluation(gradientSample, gradientNorm, fullGradientNorm);
				this.failNumerically(error);
				return;
			}
			if (memoryStepNorm <= config.stepTolerance) {
				this.recordTerminalEvaluation(gradientSample, gradientNorm, fullGradientNorm);
				this.setStatus(this.currentPointIsMinimumLike() ? 'converged' : 'stalled');
				return;
			}
		}
		let optimizerStep;
		try {
			optimizerStep = stepOptimizer(
				this.currentTheta,
				gradientSample.active,
				this.optimizerState,
				config.optimizer
			);
		} catch (error) {
			this.recordTerminalEvaluation(gradientSample, gradientNorm, fullGradientNorm);
			this.failNumerically(error);
			return;
		}

		// A non-finite attempted point is never committed: currentTheta remains the
		// last valid point. A finite point outside the map is committed unchanged.
		if (!isFiniteVector(optimizerStep.theta)) {
			this.recordTerminalEvaluation(gradientSample, gradientNorm, fullGradientNorm);
			this.failNumerically('The optimizer produced non-finite coordinates.');
			return;
		}

		let nextLoss: number;
		try {
			nextLoss = config.landscape.value(optimizerStep.theta);
		} catch (error) {
			this.recordTerminalEvaluation(gradientSample, gradientNorm, fullGradientNorm);
			this.failNumerically(error);
			return;
		}
		if (!Number.isFinite(nextLoss)) {
			this.recordTerminalEvaluation(gradientSample, gradientNorm, fullGradientNorm);
			this.failNumerically('The updated point produced non-finite loss.');
			return;
		}

		this.currentTheta = optimizerStep.theta;
		this.currentLoss = nextLoss;
		this.optimizerState = optimizerStep.state;
		const iteration = this.iteration + 1;
		this.records.push({
			iteration,
			gradientEvaluations: this.evaluations,
			theta: this.currentTheta,
			loss: nextLoss,
			gradient: gradientSample.active,
			fullGradient: gradientSample.full,
			update: optimizerStep.diagnostics.update,
			gradientNorm,
			stepNorm: optimizerStep.diagnostics.stepNorm,
			optimizerDiagnostics: optimizerStep.diagnostics,
			batchIndices: gradientSample.batchIndices,
			terminalEvaluation: null
		});
		if (this.records.length > config.maximumHistoryLength) {
			// Preserve the initial condition for path provenance, then keep only the
			// newest transition rows. Iteration is carried by the last retained row.
			this.records.splice(1, this.records.length - config.maximumHistoryLength);
		}

		if (!pointInDomain(this.currentTheta, config.landscape.domain)) {
			this.setStatus('escaped-domain');
		} else {
			this.stalledSteps =
				optimizerStep.diagnostics.stepNorm <= config.stepTolerance ? this.stalledSteps + 1 : 0;
			if (this.stalledSteps >= config.stallPatience) this.setStatus('stalled');
			else if (iteration >= config.maximumIterations) this.setStatus('iteration-limit');
			else this.setStatus(remainRunning ? 'running' : 'paused');
		}
	}

	run(iterationBudget = this.normalized?.maximumIterations ?? 0): SimulationSnapshot {
		if (!Number.isSafeInteger(iterationBudget) || iterationBudget < 0) {
			throw new RangeError('iterationBudget must be a non-negative safe integer.');
		}
		while (!isTerminalStatus(this.currentStatus) && this.iteration < iterationBudget) {
			this.advanceOneStep();
		}
		return this.snapshot();
	}

	replay(iterations = this.iteration): GradientDescentSimulation {
		if (!Number.isSafeInteger(iterations) || iterations < 0) {
			throw new RangeError('Replay iterations must be a non-negative safe integer.');
		}
		const replay = new GradientDescentSimulation(this.originalConfig);
		replay.run(iterations);
		if (
			iterations === this.iteration &&
			Boolean(this.records.at(-1)?.terminalEvaluation) &&
			!isTerminalStatus(replay.status)
		) {
			replay.advanceOneStep();
		}
		return replay;
	}

	snapshot(): SimulationSnapshot {
		const normalized = this.normalized;
		return {
			landscapeId: normalized?.landscape.id ?? this.originalConfig.landscape.id,
			optimizer: normalized?.optimizer ?? this.originalConfig.optimizer,
			gradientMode: normalized?.gradientMode ??
				this.originalConfig.gradientMode ?? { kind: 'full' },
			seed: normalized?.seed ?? this.originalConfig.seed ?? 'descent-1847',
			start:
				normalized?.start ??
				this.originalConfig.start ??
				this.originalConfig.landscape.defaultStart,
			status: this.currentStatus,
			statusMessage: this.currentStatusMessage,
			iteration: this.iteration,
			gradientEvaluations: this.evaluations,
			theta: this.currentTheta,
			loss: this.currentLoss,
			history: this.records.slice()
		};
	}

	private failNumerically(error: unknown): void {
		const detail = error instanceof Error ? error.message : String(error);
		this.currentStatus = 'numerically-diverged';
		this.currentStatusMessage = `${statusMessage(this.currentStatus)}: ${detail}`;
	}

	private recordTerminalEvaluation(
		sample: GradientSample,
		gradientNorm = norm(sample.active),
		fullGradientNorm = norm(sample.full)
	): void {
		const index = this.records.length - 1;
		if (index < 0) return;
		this.records[index] = {
			...this.records[index],
			gradientEvaluations: this.evaluations,
			terminalEvaluation: {
				gradient: sample.active,
				fullGradient: sample.full,
				gradientNorm,
				fullGradientNorm,
				batchIndices: sample.batchIndices
			}
		};
	}

	private setStatus(status: RunStatus): void {
		this.currentStatus = status;
		this.currentStatusMessage = statusMessage(status);
	}

	private currentPointIsMinimumLike(): boolean {
		if (!this.normalized) return false;
		try {
			const hessian =
				this.normalized.landscape.hessian?.(this.currentTheta) ??
				finiteDifferenceHessian(this.normalized.landscape.gradient, this.currentTheta);
			const eigenvalues = symmetricEigenDecomposition(hessian).values;
			const tolerance = 1e-9 * Math.max(1, Math.abs(eigenvalues[0]), Math.abs(eigenvalues[1]));
			return eigenvalues[1] > tolerance;
		} catch {
			return false;
		}
	}
}

export function runSimulation(
	config: SimulationConfig,
	iterationBudget = config.maximumIterations ?? 2_000
): SimulationSnapshot {
	return new GradientDescentSimulation(config).run(iterationBudget);
}
