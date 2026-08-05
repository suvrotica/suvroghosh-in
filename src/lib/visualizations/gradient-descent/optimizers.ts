import {
	add,
	assertFiniteVector,
	divideElements,
	isFiniteVector,
	multiplyElements,
	norm,
	scale,
	ZERO_VECTOR
} from './linear-algebra';
import type {
	OptimizerConfig,
	OptimizerDiagnostics,
	OptimizerId,
	OptimizerState,
	OptimizerStepResult,
	Vector2
} from './types';

export const DEFAULT_OPTIMIZER_CONFIGS: Readonly<Record<OptimizerId, OptimizerConfig>> = {
	gd: { id: 'gd', learningRate: 0.01 },
	momentum: { id: 'momentum', learningRate: 0.01, beta: 0.9 },
	rmsprop: { id: 'rmsprop', learningRate: 0.01, rho: 0.9, epsilon: 1e-8 },
	adam: { id: 'adam', learningRate: 0.01, beta1: 0.9, beta2: 0.999, epsilon: 1e-8 }
};

export function normalizeOptimizerConfig(config: OptimizerConfig): Required<OptimizerConfig> {
	const defaults = DEFAULT_OPTIMIZER_CONFIGS[config.id];
	const normalized = {
		id: config.id,
		learningRate: config.learningRate,
		beta: config.beta ?? defaults.beta ?? 0.9,
		rho: config.rho ?? defaults.rho ?? 0.9,
		beta1: config.beta1 ?? defaults.beta1 ?? 0.9,
		beta2: config.beta2 ?? defaults.beta2 ?? 0.999,
		epsilon: config.epsilon ?? defaults.epsilon ?? 1e-8
	};
	validateOptimizerConfig(normalized);
	return normalized;
}

export function validateOptimizerConfig(config: OptimizerConfig): void {
	if (!(config.learningRate > 0) || !Number.isFinite(config.learningRate)) {
		throw new RangeError('learningRate must be a finite positive number.');
	}
	for (const [name, value] of [
		['beta', config.beta],
		['rho', config.rho],
		['beta1', config.beta1],
		['beta2', config.beta2]
	] as const) {
		if (value !== undefined && (!(value >= 0) || !(value < 1) || !Number.isFinite(value))) {
			throw new RangeError(`${name} must be finite and in [0, 1).`);
		}
	}
	if (config.epsilon !== undefined && (!(config.epsilon > 0) || !Number.isFinite(config.epsilon))) {
		throw new RangeError('epsilon must be a finite positive number.');
	}
}

export function initializeOptimizer(config: OptimizerConfig): OptimizerState {
	normalizeOptimizerConfig(config);
	switch (config.id) {
		case 'gd':
			return { id: 'gd', iteration: 0 };
		case 'momentum':
			return { id: 'momentum', iteration: 0, velocity: ZERO_VECTOR };
		case 'rmsprop':
			return { id: 'rmsprop', iteration: 0, accumulatedSquares: ZERO_VECTOR };
		case 'adam':
			return { id: 'adam', iteration: 0, firstMoment: ZERO_VECTOR, secondMoment: ZERO_VECTOR };
	}
}

function assertFiniteNumericTree(value: unknown, path: string): void {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new RangeError(`${path} must be finite.`);
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((entry, index) => assertFiniteNumericTree(entry, `${path}[${index}]`));
		return;
	}
	if (value && typeof value === 'object') {
		for (const [key, entry] of Object.entries(value)) {
			if (key !== 'id') assertFiniteNumericTree(entry, `${path}.${key}`);
		}
	}
}

/** Validate every numeric leaf, including each component of vector-valued memory. */
export function assertFiniteOptimizerState(state: OptimizerState): void {
	if (!Number.isSafeInteger(state.iteration) || state.iteration < 0) {
		throw new RangeError('optimizer state.iteration must be a non-negative safe integer.');
	}
	assertFiniteNumericTree(state, 'optimizer state');
}

function checkedResult(
	config: OptimizerConfig,
	theta: Vector2,
	state: OptimizerState,
	gradient: Vector2,
	effectiveDirection: Vector2,
	diagnostics: Omit<
		OptimizerDiagnostics,
		'optimizer' | 'iteration' | 'gradient' | 'effectiveDirection' | 'update' | 'stepNorm'
	>
): OptimizerStepResult {
	assertFiniteOptimizerState(state);
	const update = scale(effectiveDirection, -config.learningRate);
	const nextTheta = add(theta, update);
	if (
		!isFiniteVector(effectiveDirection) ||
		!isFiniteVector(update) ||
		!isFiniteVector(nextTheta)
	) {
		throw new RangeError('Optimizer step produced a non-finite value.');
	}
	const optimizerDiagnostics: OptimizerDiagnostics = {
		optimizer: config.id,
		iteration: state.iteration,
		gradient,
		effectiveDirection,
		update,
		stepNorm: norm(update),
		...diagnostics
	};
	assertFiniteNumericTree(optimizerDiagnostics, 'optimizer diagnostics');
	return {
		theta: nextTheta,
		state,
		diagnostics: optimizerDiagnostics
	};
}

export function stepOptimizer(
	theta: Vector2,
	gradient: Vector2,
	state: OptimizerState,
	configuration: OptimizerConfig
): OptimizerStepResult {
	assertFiniteVector(theta, 'theta');
	assertFiniteVector(gradient, 'gradient');
	const config = normalizeOptimizerConfig(configuration);
	assertFiniteOptimizerState(state);
	if (state.id !== config.id) {
		throw new TypeError(`Optimizer state ${state.id} does not match configuration ${config.id}.`);
	}

	switch (state.id) {
		case 'gd': {
			const nextState: OptimizerState = { id: 'gd', iteration: state.iteration + 1 };
			return checkedResult(config, theta, nextState, gradient, gradient, {});
		}
		case 'momentum': {
			const velocity = add(scale(state.velocity, config.beta), gradient);
			const nextState: OptimizerState = {
				id: 'momentum',
				iteration: state.iteration + 1,
				velocity
			};
			return checkedResult(config, theta, nextState, gradient, velocity, { velocity });
		}
		case 'rmsprop': {
			const squares = multiplyElements(gradient, gradient);
			const accumulatedSquares = add(
				scale(state.accumulatedSquares, config.rho),
				scale(squares, 1 - config.rho)
			);
			const denominator: Vector2 = [
				Math.sqrt(accumulatedSquares[0]) + config.epsilon,
				Math.sqrt(accumulatedSquares[1]) + config.epsilon
			];
			const effectiveDirection = divideElements(gradient, denominator);
			const nextState: OptimizerState = {
				id: 'rmsprop',
				iteration: state.iteration + 1,
				accumulatedSquares
			};
			return checkedResult(config, theta, nextState, gradient, effectiveDirection, {
				accumulatedSquares
			});
		}
		case 'adam': {
			const iteration = state.iteration + 1;
			const firstMoment = add(
				scale(state.firstMoment, config.beta1),
				scale(gradient, 1 - config.beta1)
			);
			const secondMoment = add(
				scale(state.secondMoment, config.beta2),
				scale(multiplyElements(gradient, gradient), 1 - config.beta2)
			);
			const biasCorrectedFirstMoment = scale(firstMoment, 1 / (1 - config.beta1 ** iteration));
			const biasCorrectedSecondMoment = scale(secondMoment, 1 / (1 - config.beta2 ** iteration));
			const denominator: Vector2 = [
				Math.sqrt(biasCorrectedSecondMoment[0]) + config.epsilon,
				Math.sqrt(biasCorrectedSecondMoment[1]) + config.epsilon
			];
			const effectiveDirection = divideElements(biasCorrectedFirstMoment, denominator);
			const nextState: OptimizerState = {
				id: 'adam',
				iteration,
				firstMoment,
				secondMoment
			};
			return checkedResult(config, theta, nextState, gradient, effectiveDirection, {
				firstMoment,
				secondMoment,
				biasCorrectedFirstMoment,
				biasCorrectedSecondMoment
			});
		}
	}
}

/**
 * Predict the displacement caused by stored optimizer memory if the objective
 * gradient were exactly zero. This is pure: it consumes no randomness and the
 * returned hypothetical state is discarded by callers.
 */
export function optimizerMemoryStepNorm(
	state: OptimizerState,
	configuration: OptimizerConfig
): number {
	const config = normalizeOptimizerConfig(configuration);
	assertFiniteOptimizerState(state);
	if (state.id !== config.id) {
		throw new TypeError(`Optimizer state ${state.id} does not match configuration ${config.id}.`);
	}
	return stepOptimizer(ZERO_VECTOR, ZERO_VECTOR, state, config).diagnostics.stepNorm;
}
