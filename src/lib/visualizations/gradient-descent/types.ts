export type Vector2 = readonly [x: number, y: number];

export type Matrix2 = readonly [
	readonly [m00: number, m01: number],
	readonly [m10: number, m11: number]
];

export type LandscapeId =
	| 'quadratic'
	| 'rosenbrock'
	| 'himmelblau'
	| 'rastrigin'
	| 'saddle'
	| 'plateau'
	| 'regression';

export type OptimizerId = 'gd' | 'momentum' | 'rmsprop' | 'adam';

export type RunStatus =
	| 'ready'
	| 'running'
	| 'paused'
	| 'converged'
	| 'iteration-limit'
	| 'escaped-domain'
	| 'numerically-diverged'
	| 'stalled'
	| 'invalid-configuration';

export type HeightMapping = 'linear' | 'log-compressed';

export type Domain2D = {
	readonly min: Vector2;
	readonly max: Vector2;
};

export type KnownMinimum = {
	readonly theta: Vector2;
	readonly loss: number;
	readonly label?: string;
};

export type LandscapeDefinition = {
	readonly id: LandscapeId;
	readonly name: string;
	readonly shortDescription: string;
	readonly parameterLabels: readonly [x: string, y: string];
	readonly domain: Domain2D;
	readonly defaultStart: Vector2;
	readonly defaultLearningRate: number;
	readonly knownMinima: readonly KnownMinimum[];
	readonly recommendedCamera: string;
	readonly recommendedHeightMapping: HeightMapping;
	readonly citationsOrNotes: readonly string[];
	value(theta: Vector2): number;
	gradient(theta: Vector2): Vector2;
	hessian?(theta: Vector2): Matrix2;
};

export type RegressionPoint = {
	readonly x: number;
	readonly y: number;
	readonly id: string;
	readonly isOutlier?: boolean;
};

export type RegressionLandscapeDefinition = LandscapeDefinition & {
	readonly id: 'regression';
	readonly points: readonly RegressionPoint[];
	readonly includesOutlier: boolean;
	gradientForIndices(theta: Vector2, indices: readonly number[]): Vector2;
};

export type QuadraticParameters = {
	readonly lambda1: number;
	readonly lambda2: number;
	readonly rotation: number;
};

export type QuadraticLandscapeDefinition = LandscapeDefinition & {
	readonly id: 'quadratic';
	readonly parameters: QuadraticParameters;
	readonly matrix: Matrix2;
	readonly lambdaMin: number;
	readonly lambdaMax: number;
	readonly conditionNumber: number;
	readonly stableLearningRateUpperBound: number;
	readonly optimalFixedLearningRate: number;
};

export type OptimizerConfig = {
	readonly id: OptimizerId;
	readonly learningRate: number;
	/** Momentum convention: v(t+1) = beta * v(t) + g(t). */
	readonly beta?: number;
	readonly rho?: number;
	readonly beta1?: number;
	readonly beta2?: number;
	readonly epsilon?: number;
};

export type GradientMode =
	| { readonly kind: 'full' }
	| { readonly kind: 'minibatch'; readonly batchSize: 1 | 2 | 4 | 'full' }
	| { readonly kind: 'noisy'; readonly sigma: number };

export type GradientSample = {
	readonly active: Vector2;
	readonly full: Vector2;
	readonly batchIndices: readonly number[] | null;
	/** Undefined when either the active or full gradient has zero norm. */
	readonly angularErrorRadians: number | null;
	readonly magnitudeError: number;
};

export type GradientDescentState = {
	readonly id: 'gd';
	readonly iteration: number;
};

export type MomentumState = {
	readonly id: 'momentum';
	readonly iteration: number;
	readonly velocity: Vector2;
};

export type RmsPropState = {
	readonly id: 'rmsprop';
	readonly iteration: number;
	readonly accumulatedSquares: Vector2;
};

export type AdamState = {
	readonly id: 'adam';
	readonly iteration: number;
	readonly firstMoment: Vector2;
	readonly secondMoment: Vector2;
};

export type OptimizerState = GradientDescentState | MomentumState | RmsPropState | AdamState;

export type OptimizerDiagnostics = {
	readonly optimizer: OptimizerId;
	readonly iteration: number;
	readonly gradient: Vector2;
	readonly effectiveDirection: Vector2;
	/** The actual parameter displacement, theta(t+1) - theta(t). */
	readonly update: Vector2;
	readonly stepNorm: number;
	readonly velocity?: Vector2;
	readonly accumulatedSquares?: Vector2;
	readonly firstMoment?: Vector2;
	readonly secondMoment?: Vector2;
	readonly biasCorrectedFirstMoment?: Vector2;
	readonly biasCorrectedSecondMoment?: Vector2;
};

export type OptimizerStepResult = {
	readonly theta: Vector2;
	readonly state: OptimizerState;
	readonly diagnostics: OptimizerDiagnostics;
};

export type TerminalGradientEvaluation = {
	/** Active full, minibatch or noisy gradient sampled at the retained theta. */
	readonly gradient: Vector2;
	readonly fullGradient: Vector2;
	readonly gradientNorm: number;
	readonly fullGradientNorm: number;
	readonly batchIndices: readonly number[] | null;
};

export type SimulationConfig = {
	readonly landscape: LandscapeDefinition;
	readonly start?: Vector2;
	readonly optimizer: OptimizerConfig;
	readonly gradientMode?: GradientMode;
	readonly seed?: string;
	readonly maximumIterations?: number;
	/** Retain iteration zero plus the most recent transition rows, bounded in simulation.ts. */
	readonly maximumHistoryLength?: number;
	readonly gradientTolerance?: number;
	readonly stepTolerance?: number;
	readonly stallPatience?: number;
};

export type SimulationHistoryPoint = {
	/**
	 * Iteration zero is the initial point. For iteration t > 0, theta and loss
	 * describe theta_t while gradient/update diagnostics describe the transition
	 * from theta_(t-1) to theta_t.
	 */
	readonly iteration: number;
	readonly gradientEvaluations: number;
	readonly theta: Vector2;
	readonly loss: number;
	/** Gradient evaluated at the preceding theta to make this step; null for iteration zero. */
	readonly gradient: Vector2 | null;
	readonly fullGradient: Vector2 | null;
	readonly update: Vector2 | null;
	/** Norm of the active full, minibatch or noisy gradient used for this transition. */
	readonly gradientNorm: number | null;
	readonly stepNorm: number | null;
	readonly optimizerDiagnostics: OptimizerDiagnostics | null;
	readonly batchIndices: readonly number[] | null;
	/**
	 * A gradient evaluation that terminated the run without committing another
	 * parameter transition. The row's cumulative gradientEvaluations includes it.
	 */
	readonly terminalEvaluation?: TerminalGradientEvaluation | null;
};

export type SimulationSnapshot = {
	readonly landscapeId: LandscapeId;
	readonly optimizer: OptimizerConfig;
	readonly gradientMode: GradientMode;
	readonly seed: string;
	readonly start: Vector2;
	readonly status: RunStatus;
	readonly statusMessage: string;
	readonly iteration: number;
	readonly gradientEvaluations: number;
	readonly theta: Vector2;
	readonly loss: number;
	readonly history: readonly SimulationHistoryPoint[];
};

export type BasinClassification = {
	readonly minimumIndex: number | null;
	readonly distance: number;
	readonly minimum: KnownMinimum | null;
};

export type BasinCell = BasinClassification & {
	readonly start: Vector2;
	readonly finalTheta: Vector2;
	readonly finalLoss: number;
	readonly iterations: number;
	readonly status: RunStatus;
};

export type BasinGrid = {
	readonly width: number;
	readonly height: number;
	readonly domain: Domain2D;
	readonly cells: readonly BasinCell[];
};

export type LandscapeSelection = {
	readonly id: LandscapeId;
	readonly quadratic?: Partial<QuadraticParameters>;
	readonly regressionOutlier?: boolean;
};
