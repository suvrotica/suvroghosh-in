import {
	distance,
	dot,
	finiteDifferenceHessian,
	norm,
	normalize,
	quadraticForm,
	scale,
	subtract,
	symmetricEigenDecomposition
} from './linear-algebra';
import { SeededRandom } from './prng';
import { GradientDescentSimulation, runSimulation } from './simulation';
import type {
	BasinClassification,
	BasinGrid,
	Domain2D,
	GradientMode,
	KnownMinimum,
	LandscapeDefinition,
	Matrix2,
	OptimizerConfig,
	SimulationSnapshot,
	Vector2
} from './types';

export type DirectionalProfilePoint = {
	readonly offset: number;
	readonly theta: Vector2;
	readonly loss: number;
	readonly tangentLoss: number;
};

export type DirectionalProfile = {
	readonly origin: Vector2;
	readonly direction: Vector2;
	readonly rawDirection: Vector2;
	readonly directionalDerivative: number;
	readonly directionalCurvature: number;
	readonly points: readonly DirectionalProfilePoint[];
};

export type LocalStationaryClassification =
	| 'minimum-like'
	| 'maximum-like'
	| 'saddle-like'
	| 'degenerate-or-inconclusive';

export function hessianAt(landscape: LandscapeDefinition, theta: Vector2): Matrix2 {
	return landscape.hessian?.(theta) ?? finiteDifferenceHessian(landscape.gradient, theta);
}

export function classifyLocalHessian(
	hessian: Matrix2,
	relativeTolerance = 1e-9
): Readonly<{
	classification: LocalStationaryClassification;
	eigenvalues: readonly [number, number];
	eigenvectors: readonly [Vector2, Vector2];
	tolerance: number;
}> {
	const decomposition = symmetricEigenDecomposition(hessian);
	const scaleValue = Math.max(
		1,
		Math.abs(decomposition.values[0]),
		Math.abs(decomposition.values[1])
	);
	const tolerance = relativeTolerance * scaleValue;
	const [maximum, minimum] = decomposition.values;
	let classification: LocalStationaryClassification;
	if (minimum > tolerance) classification = 'minimum-like';
	else if (maximum < -tolerance) classification = 'maximum-like';
	else if (maximum > tolerance && minimum < -tolerance) classification = 'saddle-like';
	else classification = 'degenerate-or-inconclusive';
	return {
		classification,
		eigenvalues: decomposition.values,
		eigenvectors: decomposition.vectors,
		tolerance
	};
}

export function directionalLossProfile(
	options: Readonly<{
		landscape: LandscapeDefinition;
		theta: Vector2;
		direction: Vector2;
		radius?: number;
		samples?: number;
	}>
): DirectionalProfile {
	const radius = options.radius ?? 1;
	const samples = options.samples ?? 81;
	if (!(radius > 0) || !Number.isFinite(radius)) {
		throw new RangeError('Directional profile radius must be finite and positive.');
	}
	if (!Number.isSafeInteger(samples) || samples < 3 || samples > 10_001) {
		throw new RangeError('Directional profile samples must be an integer from 3 to 10,001.');
	}
	const direction = normalize(options.direction);
	const originLoss = options.landscape.value(options.theta);
	const gradient = options.landscape.gradient(options.theta);
	const hessian = hessianAt(options.landscape, options.theta);
	const directionalDerivative = dot(gradient, direction);
	const directionalCurvature = quadraticForm(direction, hessian);
	const points = Array.from({ length: samples }, (_, index): DirectionalProfilePoint => {
		const offset = -radius + (2 * radius * index) / (samples - 1);
		const theta: Vector2 = [
			options.theta[0] + direction[0] * offset,
			options.theta[1] + direction[1] * offset
		];
		return {
			offset,
			theta,
			loss: options.landscape.value(theta),
			tangentLoss: originLoss + directionalDerivative * offset
		};
	});
	return {
		origin: options.theta,
		direction,
		rawDirection: options.direction,
		directionalDerivative,
		directionalCurvature,
		points
	};
}

export function classifyBasin(
	point: Vector2,
	knownMinima: readonly KnownMinimum[],
	tolerance = 0.25
): BasinClassification {
	if (!(tolerance > 0) || !Number.isFinite(tolerance)) {
		throw new RangeError('Basin tolerance must be finite and positive.');
	}
	if (knownMinima.length === 0)
		return { minimumIndex: null, distance: Number.POSITIVE_INFINITY, minimum: null };
	let minimumIndex = 0;
	let nearestDistance = distance(point, knownMinima[0].theta);
	for (let index = 1; index < knownMinima.length; index += 1) {
		const candidateDistance = distance(point, knownMinima[index].theta);
		if (candidateDistance < nearestDistance) {
			minimumIndex = index;
			nearestDistance = candidateDistance;
		}
	}
	return nearestDistance <= tolerance
		? { minimumIndex, distance: nearestDistance, minimum: knownMinima[minimumIndex] }
		: { minimumIndex: null, distance: nearestDistance, minimum: null };
}

function classifyCompletedRun(
	snapshot: SimulationSnapshot,
	knownMinima: readonly KnownMinimum[],
	tolerance: number
): BasinClassification {
	const nearest = classifyBasin(snapshot.theta, knownMinima, tolerance);
	if (snapshot.status === 'converged') return nearest;
	return { minimumIndex: null, distance: nearest.distance, minimum: null };
}

export type BasinGridOptions = {
	readonly landscape: LandscapeDefinition;
	readonly optimizer: OptimizerConfig;
	readonly gradientMode?: GradientMode;
	readonly seed?: string;
	readonly width?: number;
	readonly height?: number;
	readonly domain?: Domain2D;
	readonly maximumIterations?: number;
	readonly gradientTolerance?: number;
	readonly stepTolerance?: number;
	readonly stallPatience?: number;
	readonly classificationTolerance?: number;
	readonly shouldCancel?: () => boolean;
};

function validateGridSize(width: number, height: number): void {
	if (
		!Number.isSafeInteger(width) ||
		!Number.isSafeInteger(height) ||
		width < 2 ||
		height < 2 ||
		width > 512 ||
		height > 512
	) {
		throw new RangeError('Basin dimensions must be integers from 2 to 512.');
	}
}

export class AnalysisCancelledError extends Error {
	constructor() {
		super('Analysis was cancelled.');
		this.name = 'AnalysisCancelledError';
	}
}

function basinCell(options: BasinGridOptions, start: Vector2, index: number) {
	const snapshot = runSimulation(
		{
			landscape: options.landscape,
			start,
			optimizer: options.optimizer,
			gradientMode: options.gradientMode,
			seed: `${options.seed ?? 'descent-1847'}:basin:${index}`,
			maximumIterations: options.maximumIterations ?? 1_000,
			gradientTolerance: options.gradientTolerance ?? 1e-6,
			stepTolerance: options.stepTolerance,
			stallPatience: options.stallPatience
		},
		options.maximumIterations ?? 1_000
	);
	const classification = classifyCompletedRun(
		snapshot,
		options.landscape.knownMinima,
		options.classificationTolerance ?? 0.2
	);
	return {
		...classification,
		start,
		finalTheta: snapshot.theta,
		finalLoss: snapshot.loss,
		iterations: snapshot.iteration,
		status: snapshot.status
	};
}

export function computeBasinGrid(options: BasinGridOptions): BasinGrid {
	const width = options.width ?? 48;
	const height = options.height ?? 48;
	validateGridSize(width, height);
	const domain = options.domain ?? options.landscape.domain;
	const cells = [];
	for (let row = 0; row < height; row += 1) {
		if (options.shouldCancel?.()) throw new AnalysisCancelledError();
		for (let column = 0; column < width; column += 1) {
			const start: Vector2 = [
				domain.min[0] + ((domain.max[0] - domain.min[0]) * column) / (width - 1),
				domain.min[1] + ((domain.max[1] - domain.min[1]) * row) / (height - 1)
			];
			cells.push(basinCell(options, start, row * width + column));
		}
	}
	return { width, height, domain, cells };
}

function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Chunked worker-safe form; yielding between rows lets a cancel message run. */
export async function computeBasinGridAsync(options: BasinGridOptions): Promise<BasinGrid> {
	const width = options.width ?? 48;
	const height = options.height ?? 48;
	validateGridSize(width, height);
	const domain = options.domain ?? options.landscape.domain;
	const cells = [];
	for (let row = 0; row < height; row += 1) {
		if (options.shouldCancel?.()) throw new AnalysisCancelledError();
		for (let column = 0; column < width; column += 1) {
			const start: Vector2 = [
				domain.min[0] + ((domain.max[0] - domain.min[0]) * column) / (width - 1),
				domain.min[1] + ((domain.max[1] - domain.min[1]) * row) / (height - 1)
			];
			cells.push(basinCell(options, start, row * width + column));
		}
		await yieldToEventLoop();
	}
	return { width, height, domain, cells };
}

export type ParticleStartOptions = {
	readonly domain: Domain2D;
	readonly columns?: number;
	readonly rows?: number;
	readonly jitter?: number;
	readonly seed?: string;
};

export function releaseParticleStarts(options: ParticleStartOptions): readonly Vector2[] {
	const columns = options.columns ?? 12;
	const rows = options.rows ?? 12;
	validateGridSize(columns, rows);
	const jitter = options.jitter ?? 0;
	if (!(jitter >= 0) || jitter > 0.49 || !Number.isFinite(jitter)) {
		throw new RangeError('Particle jitter must be finite and between 0 and 0.49.');
	}
	const random = new SeededRandom(options.seed ?? 'descent-1847');
	const cellWidth = (options.domain.max[0] - options.domain.min[0]) / columns;
	const cellHeight = (options.domain.max[1] - options.domain.min[1]) / rows;
	const starts: Vector2[] = [];
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const xJitter = jitter === 0 ? 0 : (random.next() * 2 - 1) * jitter * cellWidth;
			const yJitter = jitter === 0 ? 0 : (random.next() * 2 - 1) * jitter * cellHeight;
			starts.push([
				options.domain.min[0] + (column + 0.5) * cellWidth + xJitter,
				options.domain.min[1] + (row + 0.5) * cellHeight + yJitter
			]);
		}
	}
	return starts;
}

export type ParticleTrajectory = {
	readonly id: number;
	readonly start: Vector2;
	readonly path: readonly Vector2[];
	readonly finalTheta: Vector2;
	readonly finalLoss: number;
	readonly status: SimulationSnapshot['status'];
	readonly classification: BasinClassification;
};

export type ParticleFlowOptions = Readonly<{
	landscape: LandscapeDefinition;
	optimizer: OptimizerConfig;
	starts: readonly Vector2[];
	gradientMode?: GradientMode;
	seed?: string;
	maximumIterations?: number;
	gradientTolerance?: number;
	stepTolerance?: number;
	stallPatience?: number;
	classificationTolerance?: number;
	shouldCancel?: () => boolean;
}>;

function particleTrajectory(
	options: ParticleFlowOptions,
	start: Vector2,
	index: number
): ParticleTrajectory {
	const snapshot = runSimulation(
		{
			landscape: options.landscape,
			start,
			optimizer: options.optimizer,
			gradientMode: options.gradientMode,
			seed: `${options.seed ?? 'descent-1847'}:particle:${index}`,
			maximumIterations: options.maximumIterations ?? 1_000,
			gradientTolerance: options.gradientTolerance,
			stepTolerance: options.stepTolerance,
			stallPatience: options.stallPatience
		},
		options.maximumIterations ?? 1_000
	);
	return {
		id: index,
		start,
		path: snapshot.history.map((point) => point.theta),
		finalTheta: snapshot.theta,
		finalLoss: snapshot.loss,
		status: snapshot.status,
		classification: classifyCompletedRun(
			snapshot,
			options.landscape.knownMinima,
			options.classificationTolerance ?? 0.2
		)
	};
}

export function runParticleFlow(options: ParticleFlowOptions): readonly ParticleTrajectory[] {
	return options.starts.map((start, index) => {
		if (options.shouldCancel?.()) throw new AnalysisCancelledError();
		return particleTrajectory(options, start, index);
	});
}

/** Worker-safe particle flow that yields between complete deterministic runs. */
export async function runParticleFlowAsync(
	options: ParticleFlowOptions
): Promise<readonly ParticleTrajectory[]> {
	const trajectories: ParticleTrajectory[] = [];
	// Yield before the first particle so an immediately superseded request can be
	// cancelled without performing a discarded simulation on the main thread.
	await yieldToEventLoop();
	for (let index = 0; index < options.starts.length; index += 1) {
		if (options.shouldCancel?.()) throw new AnalysisCancelledError();
		trajectories.push(particleTrajectory(options, options.starts[index], index));
		await yieldToEventLoop();
	}
	return trajectories;
}

export type OptimizerRaceEntry = {
	readonly config: OptimizerConfig;
	readonly snapshot: SimulationSnapshot;
	readonly lossReduction: number;
	readonly destination: BasinClassification;
};

export function runOptimizerRace(
	options: Readonly<{
		landscape: LandscapeDefinition;
		start?: Vector2;
		optimizers: readonly OptimizerConfig[];
		gradientMode?: GradientMode;
		seed?: string;
		gradientEvaluationBudget: number;
		gradientTolerance?: number;
		stepTolerance?: number;
		stallPatience?: number;
		classificationTolerance?: number;
	}>
): readonly OptimizerRaceEntry[] {
	if (
		!Number.isSafeInteger(options.gradientEvaluationBudget) ||
		options.gradientEvaluationBudget < 1
	) {
		throw new RangeError('Gradient-evaluation budget must be a positive safe integer.');
	}
	const start = options.start ?? options.landscape.defaultStart;
	const initialLoss = options.landscape.value(start);
	return options.optimizers.map((optimizer) => {
		const snapshot = runSimulation(
			{
				landscape: options.landscape,
				start,
				optimizer,
				gradientMode: options.gradientMode,
				seed: options.seed ?? 'descent-1847',
				maximumIterations: options.gradientEvaluationBudget,
				gradientTolerance: options.gradientTolerance,
				stepTolerance: options.stepTolerance,
				stallPatience: options.stallPatience
			},
			options.gradientEvaluationBudget
		);
		return {
			config: optimizer,
			snapshot,
			lossReduction: initialLoss - snapshot.loss,
			destination: classifyCompletedRun(
				snapshot,
				options.landscape.knownMinima,
				options.classificationTolerance ?? 0.2
			)
		};
	});
}

export type StabilitySweepEntry = {
	readonly learningRate: number;
	readonly status: SimulationSnapshot['status'];
	readonly iterations: number;
	readonly finalTheta: Vector2;
	readonly finalLoss: number;
	readonly minimumLoss: number;
	readonly maximumLoss: number;
	readonly directionReversalCount: number;
	readonly directionComparisonCount: number;
	readonly directionReversalRate: number;
	readonly isOscillatory: boolean;
};

export const OSCILLATION_MINIMUM_REVERSALS = 2;
export const OSCILLATION_REVERSAL_RATE_THRESHOLD = 0.5;

export type DirectionReversalEvidence = {
	readonly directionReversalCount: number;
	readonly directionComparisonCount: number;
	readonly directionReversalRate: number;
	readonly isOscillatory: boolean;
};

/**
 * Compare consecutive retained, non-zero parameter updates. A reversal is an
 * obtuse change of direction (negative dot product). We call a path oscillatory
 * only when at least two such reversals make up at least half of comparisons.
 */
export function directionReversalEvidence(
	snapshot: SimulationSnapshot,
	zeroStepTolerance = 1e-12
): DirectionReversalEvidence {
	if (!(zeroStepTolerance >= 0) || !Number.isFinite(zeroStepTolerance)) {
		throw new RangeError('zeroStepTolerance must be finite and non-negative.');
	}
	const nonzeroThreshold = Math.max(zeroStepTolerance, Number.EPSILON);
	let previous: Readonly<{ iteration: number; update: Vector2 }> | null = null;
	let directionReversalCount = 0;
	let directionComparisonCount = 0;
	for (const point of snapshot.history) {
		if (!point.update || norm(point.update) <= nonzeroThreshold) {
			previous = null;
			continue;
		}
		if (previous && point.iteration === previous.iteration + 1) {
			directionComparisonCount += 1;
			if (dot(previous.update, point.update) < 0) directionReversalCount += 1;
		}
		previous = { iteration: point.iteration, update: point.update };
	}
	const directionReversalRate =
		directionComparisonCount === 0 ? 0 : directionReversalCount / directionComparisonCount;
	return {
		directionReversalCount,
		directionComparisonCount,
		directionReversalRate,
		isOscillatory:
			directionReversalCount >= OSCILLATION_MINIMUM_REVERSALS &&
			directionReversalRate >= OSCILLATION_REVERSAL_RATE_THRESHOLD
	};
}

export type StabilitySweepOptions = {
	readonly landscape: LandscapeDefinition;
	readonly start?: Vector2;
	readonly optimizer: Omit<OptimizerConfig, 'learningRate'>;
	readonly learningRates: readonly number[];
	readonly gradientMode?: GradientMode;
	readonly seed?: string;
	readonly maximumIterations?: number;
	readonly gradientTolerance?: number;
	readonly stepTolerance?: number;
	readonly stallPatience?: number;
	readonly shouldCancel?: () => boolean;
};

function stabilityEntry(options: StabilitySweepOptions, learningRate: number): StabilitySweepEntry {
	const snapshot = runSimulation(
		{
			landscape: options.landscape,
			start: options.start,
			optimizer: { ...options.optimizer, learningRate },
			gradientMode: options.gradientMode,
			seed: options.seed,
			maximumIterations: options.maximumIterations ?? 500,
			gradientTolerance: options.gradientTolerance,
			stepTolerance: options.stepTolerance,
			stallPatience: options.stallPatience
		},
		options.maximumIterations ?? 500
	);
	const losses = snapshot.history.map((point) => point.loss);
	const reversalEvidence = directionReversalEvidence(snapshot, options.stepTolerance);
	return {
		learningRate,
		status: snapshot.status,
		iterations: snapshot.iteration,
		finalTheta: snapshot.theta,
		finalLoss: snapshot.loss,
		minimumLoss: Math.min(...losses),
		maximumLoss: Math.max(...losses),
		...reversalEvidence
	};
}

export function runStabilitySweep(options: StabilitySweepOptions): readonly StabilitySweepEntry[] {
	return options.learningRates.map((learningRate) => {
		if (options.shouldCancel?.()) throw new AnalysisCancelledError();
		return stabilityEntry(options, learningRate);
	});
}

export async function runStabilitySweepAsync(
	options: StabilitySweepOptions
): Promise<readonly StabilitySweepEntry[]> {
	const entries: StabilitySweepEntry[] = [];
	for (const learningRate of options.learningRates) {
		if (options.shouldCancel?.()) throw new AnalysisCancelledError();
		entries.push(stabilityEntry(options, learningRate));
		await yieldToEventLoop();
	}
	return entries;
}

export type MomentumStabilityCell = {
	/** Learning rate eta represented by this column. */
	readonly learningRate: number;
	/** Base-10 logarithm of eta, supplied for a genuinely logarithmic horizontal axis. */
	readonly logLearningRate: number;
	/** Momentum coefficient beta represented by this row. */
	readonly beta: number;
	readonly status: SimulationSnapshot['status'];
	readonly iterations: number;
	readonly gradientEvaluations: number;
	readonly finalTheta: Vector2;
	readonly finalLoss: number;
	readonly minimumLoss: number;
	readonly lossReduction: number;
	readonly directionReversalCount: number;
	readonly directionComparisonCount: number;
	readonly directionReversalRate: number;
	readonly isOscillatory: boolean;
};

/**
 * Row-major stability grid: beta varies by row and learning rate eta varies by
 * column. Every cell uses the same start, seed, iteration budget and stopping
 * rules, so cells differ only in eta and beta.
 */
export type MomentumStabilityGrid = {
	readonly width: number;
	readonly height: number;
	readonly learningRates: readonly number[];
	readonly logLearningRates: readonly number[];
	readonly betaValues: readonly number[];
	readonly start: Vector2;
	readonly seed: string;
	readonly maximumIterations: number;
	readonly initialLoss: number;
	readonly cells: readonly MomentumStabilityCell[];
};

export type MomentumStabilitySweepOptions = {
	readonly landscape: LandscapeDefinition;
	readonly start?: Vector2;
	readonly learningRates: readonly number[];
	readonly betaValues: readonly number[];
	readonly gradientMode?: GradientMode;
	readonly seed?: string;
	readonly maximumIterations?: number;
	readonly gradientTolerance?: number;
	readonly stepTolerance?: number;
	readonly stallPatience?: number;
	readonly shouldCancel?: () => boolean;
};

function validateMomentumAxis(
	values: readonly number[],
	name: 'learningRates' | 'betaValues',
	predicate: (value: number) => boolean,
	description: string
): void {
	if (!Array.isArray(values) || values.length < 2 || values.length > 512) {
		throw new RangeError(`${name} must contain between 2 and 512 values.`);
	}
	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];
		if (!Number.isFinite(value) || !predicate(value)) {
			throw new RangeError(`${name} ${description}`);
		}
		if (index > 0 && value <= values[index - 1]) {
			throw new RangeError(`${name} must be strictly increasing.`);
		}
	}
}

function normalizeMomentumStabilityOptions(options: MomentumStabilitySweepOptions): Readonly<{
	start: Vector2;
	seed: string;
	maximumIterations: number;
	initialLoss: number;
}> {
	validateMomentumAxis(
		options.learningRates,
		'learningRates',
		(value) => value > 0,
		'must contain only finite positive values.'
	);
	validateMomentumAxis(
		options.betaValues,
		'betaValues',
		(value) => value >= 0 && value < 1,
		'must contain only values in the interval [0, 1).'
	);
	const start: Vector2 = options.start ?? options.landscape.defaultStart;
	const seed = options.seed ?? 'descent-1847';
	const maximumIterations = options.maximumIterations ?? 500;
	const initialLoss = options.landscape.value(start);
	return { start, seed, maximumIterations, initialLoss };
}

function momentumStabilityCell(
	options: MomentumStabilitySweepOptions,
	normalized: ReturnType<typeof normalizeMomentumStabilityOptions>,
	learningRate: number,
	beta: number
): MomentumStabilityCell {
	const snapshot = runSimulation(
		{
			landscape: options.landscape,
			start: normalized.start,
			optimizer: { id: 'momentum', learningRate, beta },
			gradientMode: options.gradientMode,
			seed: normalized.seed,
			maximumIterations: normalized.maximumIterations,
			gradientTolerance: options.gradientTolerance,
			stepTolerance: options.stepTolerance,
			stallPatience: options.stallPatience
		},
		normalized.maximumIterations
	);
	const minimumLoss = snapshot.history.reduce(
		(minimum, point) => Math.min(minimum, point.loss),
		Number.POSITIVE_INFINITY
	);
	const reversalEvidence = directionReversalEvidence(snapshot, options.stepTolerance);
	return {
		learningRate,
		logLearningRate: Math.log10(learningRate),
		beta,
		status: snapshot.status,
		iterations: snapshot.iteration,
		gradientEvaluations: snapshot.gradientEvaluations,
		finalTheta: snapshot.theta,
		finalLoss: snapshot.loss,
		minimumLoss,
		lossReduction: normalized.initialLoss - snapshot.loss,
		...reversalEvidence
	};
}

function momentumStabilityGrid(
	options: MomentumStabilitySweepOptions,
	normalized: ReturnType<typeof normalizeMomentumStabilityOptions>,
	cells: readonly MomentumStabilityCell[]
): MomentumStabilityGrid {
	return {
		width: options.learningRates.length,
		height: options.betaValues.length,
		learningRates: [...options.learningRates],
		logLearningRates: options.learningRates.map((learningRate) => Math.log10(learningRate)),
		betaValues: [...options.betaValues],
		start: normalized.start,
		seed: normalized.seed,
		maximumIterations: normalized.maximumIterations,
		initialLoss: normalized.initialLoss,
		cells
	};
}

export function runMomentumStabilitySweep(
	options: MomentumStabilitySweepOptions
): MomentumStabilityGrid {
	const normalized = normalizeMomentumStabilityOptions(options);
	const cells: MomentumStabilityCell[] = [];
	for (const beta of options.betaValues) {
		if (options.shouldCancel?.()) throw new AnalysisCancelledError();
		for (const learningRate of options.learningRates) {
			if (options.shouldCancel?.()) throw new AnalysisCancelledError();
			cells.push(momentumStabilityCell(options, normalized, learningRate, beta));
		}
	}
	return momentumStabilityGrid(options, normalized, cells);
}

/** Worker-safe form; yielding after each beta row makes cancellation responsive. */
export async function runMomentumStabilitySweepAsync(
	options: MomentumStabilitySweepOptions
): Promise<MomentumStabilityGrid> {
	const normalized = normalizeMomentumStabilityOptions(options);
	const cells: MomentumStabilityCell[] = [];
	for (const beta of options.betaValues) {
		if (options.shouldCancel?.()) throw new AnalysisCancelledError();
		for (const learningRate of options.learningRates) {
			if (options.shouldCancel?.()) throw new AnalysisCancelledError();
			cells.push(momentumStabilityCell(options, normalized, learningRate, beta));
		}
		await yieldToEventLoop();
	}
	return momentumStabilityGrid(options, normalized, cells);
}

export function trajectoryArcLength(snapshot: SimulationSnapshot): number {
	let total = 0;
	for (let index = 1; index < snapshot.history.length; index += 1) {
		total += distance(snapshot.history[index - 1].theta, snapshot.history[index].theta);
	}
	return total;
}

export function updateAlignment(snapshot: SimulationSnapshot, iteration: number): number | null {
	const point = snapshot.history.find((entry) => entry.iteration === iteration);
	if (!point?.gradient || !point.update || norm(point.gradient) === 0 || norm(point.update) === 0) {
		return null;
	}
	return dot(normalize(scale(point.gradient, -1)), normalize(point.update));
}

export function replayPath(
	snapshot: SimulationSnapshot,
	simulation: GradientDescentSimulation
): boolean {
	const replay = simulation.replay(snapshot.iteration).snapshot();
	if (replay.history.length !== snapshot.history.length) return false;
	return replay.history.every((point, index) => {
		const original = snapshot.history[index];
		return (
			point.loss === original.loss &&
			point.theta[0] === original.theta[0] &&
			point.theta[1] === original.theta[1]
		);
	});
}

export function displacementFromStart(snapshot: SimulationSnapshot): Vector2 {
	return subtract(snapshot.theta, snapshot.start);
}
