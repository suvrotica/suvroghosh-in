import { createLandscape } from './landscapes';
import { normalizeOptimizerConfig } from './optimizers';
import type {
	GradientMode,
	LandscapeId,
	LandscapeSelection,
	OptimizerConfig,
	OptimizerId,
	Vector2
} from './types';

export type ExperimentUrlState = {
	readonly version: 1;
	readonly landscape: LandscapeSelection;
	readonly optimizer: OptimizerConfig;
	readonly start: Vector2;
	readonly seed: string;
	readonly speed: number;
	readonly maximumIterations: number;
	readonly gradientTolerance: number;
	readonly gradientMode: GradientMode;
};

export type ParsedExperimentUrlState = {
	readonly state: ExperimentUrlState;
	readonly warnings: readonly string[];
};

const LANDSCAPE_IDS = new Set<LandscapeId>([
	'quadratic',
	'rosenbrock',
	'himmelblau',
	'rastrigin',
	'saddle',
	'plateau',
	'regression'
]);
const OPTIMIZER_IDS = new Set<OptimizerId>(['gd', 'momentum', 'rmsprop', 'adam']);
const SPEED_OPTIONS = new Set([0.5, 1, 2, 5, 12, 30, 60, 120]);

export function createDefaultExperimentState(
	landscapeId: LandscapeId = 'rosenbrock'
): ExperimentUrlState {
	const landscape = createLandscape(landscapeId);
	return {
		version: 1,
		landscape: { id: landscapeId },
		optimizer: { id: 'gd', learningRate: landscape.defaultLearningRate },
		start: landscape.defaultStart,
		seed: 'descent-1847',
		speed: 12,
		maximumIterations: 2_000,
		gradientTolerance: 1e-7,
		gradientMode:
			landscapeId === 'regression'
				? { kind: 'minibatch', batchSize: 'full' }
				: { kind: 'full' }
	};
}

/** Twelve significant digits keep URLs readable while preserving declared precision. */
export function formatUrlNumber(value: number): string {
	if (!Number.isFinite(value)) throw new RangeError('URL numbers must be finite.');
	return Number(value.toPrecision(12)).toString();
}

export function serializeExperimentUrlState(state: ExperimentUrlState): URLSearchParams {
	const parameters = new URLSearchParams();
	const defaults = createDefaultExperimentState(state.landscape.id);
	parameters.set('v', '1');
	if (state.landscape.id !== 'rosenbrock') parameters.set('landscape', state.landscape.id);
	if (state.optimizer.id !== defaults.optimizer.id) parameters.set('optimizer', state.optimizer.id);
	if (state.optimizer.learningRate !== defaults.optimizer.learningRate)
		parameters.set('lr', formatUrlNumber(state.optimizer.learningRate));
	if (state.start[0] !== defaults.start[0]) parameters.set('x', formatUrlNumber(state.start[0]));
	if (state.start[1] !== defaults.start[1]) parameters.set('y', formatUrlNumber(state.start[1]));
	if (state.seed !== defaults.seed) parameters.set('seed', state.seed);
	if (state.speed !== defaults.speed) parameters.set('speed', formatUrlNumber(state.speed));
	if (state.maximumIterations !== defaults.maximumIterations)
		parameters.set('max', String(state.maximumIterations));
	if (state.gradientTolerance !== defaults.gradientTolerance)
		parameters.set('tol', formatUrlNumber(state.gradientTolerance));

	if (state.landscape.id === 'quadratic' && state.landscape.quadratic) {
		const { lambda1, lambda2, rotation } = state.landscape.quadratic;
		if (lambda1 !== undefined && lambda1 !== 1) parameters.set('l1', formatUrlNumber(lambda1));
		if (lambda2 !== undefined && lambda2 !== 14) parameters.set('l2', formatUrlNumber(lambda2));
		if (rotation !== undefined && rotation !== Math.PI / 6)
			parameters.set('angle', formatUrlNumber(rotation));
	}
	if (state.landscape.id === 'regression' && state.landscape.regressionOutlier)
		parameters.set('outlier', '1');

	const normalizedOptimizer = normalizeOptimizerConfig(state.optimizer);
	if (state.optimizer.id === 'momentum' && normalizedOptimizer.beta !== 0.9)
		parameters.set('beta', formatUrlNumber(normalizedOptimizer.beta));
	if (state.optimizer.id === 'rmsprop') {
		if (normalizedOptimizer.rho !== 0.9)
			parameters.set('rho', formatUrlNumber(normalizedOptimizer.rho));
		if (normalizedOptimizer.epsilon !== 1e-8)
			parameters.set('eps', formatUrlNumber(normalizedOptimizer.epsilon));
	}
	if (state.optimizer.id === 'adam') {
		if (normalizedOptimizer.beta1 !== 0.9)
			parameters.set('beta1', formatUrlNumber(normalizedOptimizer.beta1));
		if (normalizedOptimizer.beta2 !== 0.999)
			parameters.set('beta2', formatUrlNumber(normalizedOptimizer.beta2));
		if (normalizedOptimizer.epsilon !== 1e-8)
			parameters.set('eps', formatUrlNumber(normalizedOptimizer.epsilon));
	}

	if (state.gradientMode.kind === 'minibatch' && state.gradientMode.batchSize !== 'full')
		parameters.set('batch', String(state.gradientMode.batchSize));
	if (state.gradientMode.kind === 'noisy' && state.gradientMode.sigma !== 0)
		parameters.set('noise', formatUrlNumber(state.gradientMode.sigma));
	return parameters;
}

export function serializeExperimentUrl(state: ExperimentUrlState): string {
	return serializeExperimentUrlState(state).toString();
}

function parseNumber(
	parameters: URLSearchParams,
	key: string,
	fallback: number,
	warnings: string[],
	minimum: number,
	maximum: number,
	minimumInclusive = true,
	maximumInclusive = true
): number {
	const raw = parameters.get(key);
	if (raw === null) return fallback;
	const value = Number(raw);
	const below = minimumInclusive ? value < minimum : value <= minimum;
	const above = maximumInclusive ? value > maximum : value >= maximum;
	if (!Number.isFinite(value) || below || above) {
		warnings.push(`Ignored invalid ${key}=${raw}.`);
		return fallback;
	}
	return value;
}

function parseInteger(
	parameters: URLSearchParams,
	key: string,
	fallback: number,
	warnings: string[],
	minimum: number,
	maximum: number
): number {
	const value = parseNumber(parameters, key, fallback, warnings, minimum, maximum);
	if (!Number.isSafeInteger(value)) {
		warnings.push(`Ignored non-integer ${key}=${parameters.get(key)}.`);
		return fallback;
	}
	return value;
}

function parseSpeed(parameters: URLSearchParams, fallback: number, warnings: string[]): number {
	const raw = parameters.get('speed');
	if (raw === null) return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value) || !SPEED_OPTIONS.has(value)) {
		warnings.push(`Ignored unsupported speed=${raw}.`);
		return fallback;
	}
	return value;
}

export function parseExperimentUrlState(
	input: string | URLSearchParams,
	fallback?: ExperimentUrlState
): ParsedExperimentUrlState {
	const parameters =
		typeof input === 'string'
			? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
			: new URLSearchParams(input);
	const warnings: string[] = [];
	if (parameters.has('v') && parameters.get('v') !== '1')
		warnings.push('Unknown URL-state version; read supported fields as version 1.');

	const rawLandscape = parameters.get('landscape');
	const fallbackLandscapeId = fallback?.landscape.id ?? 'rosenbrock';
	const landscapeId =
		rawLandscape && LANDSCAPE_IDS.has(rawLandscape as LandscapeId)
			? (rawLandscape as LandscapeId)
			: fallbackLandscapeId;
	if (rawLandscape && rawLandscape !== landscapeId)
		warnings.push(`Ignored unknown landscape=${rawLandscape}.`);

	const landscapeSelection: LandscapeSelection =
		landscapeId === 'quadratic'
			? {
					id: 'quadratic',
					quadratic: {
						lambda1: parseNumber(parameters, 'l1', 1, warnings, 0.05, 100),
						lambda2: parseNumber(parameters, 'l2', 14, warnings, 0.05, 100),
						rotation: parseNumber(parameters, 'angle', Math.PI / 6, warnings, -Math.PI, Math.PI)
					}
				}
			: landscapeId === 'regression'
				? { id: 'regression', regressionOutlier: parameters.get('outlier') === '1' }
				: { id: landscapeId };
	const landscape = createLandscape(landscapeSelection);
	const defaults =
		fallback?.landscape.id === landscapeId ? fallback : createDefaultExperimentState(landscapeId);

	const rawOptimizer = parameters.get('optimizer');
	const optimizerId =
		rawOptimizer && OPTIMIZER_IDS.has(rawOptimizer as OptimizerId)
			? (rawOptimizer as OptimizerId)
			: defaults.optimizer.id;
	if (rawOptimizer && rawOptimizer !== optimizerId)
		warnings.push(`Ignored unknown optimizer=${rawOptimizer}.`);
	const learningRate = parseNumber(
		parameters,
		'lr',
		defaults.optimizer.learningRate ?? landscape.defaultLearningRate,
		warnings,
		1e-6,
		10
	);
	const common = { id: optimizerId, learningRate } as OptimizerConfig;
	let optimizer: OptimizerConfig = common;
	if (optimizerId === 'momentum') {
		optimizer = {
			...common,
			beta: parseNumber(parameters, 'beta', 0.9, warnings, 0, 0.999)
		};
	} else if (optimizerId === 'rmsprop') {
		optimizer = {
			...common,
			rho: parseNumber(parameters, 'rho', 0.9, warnings, 0, 0.999),
			epsilon: parseNumber(parameters, 'eps', 1e-8, warnings, 1e-12, 0.1)
		};
	} else if (optimizerId === 'adam') {
		optimizer = {
			...common,
			beta1: parseNumber(parameters, 'beta1', 0.9, warnings, 0, 0.999),
			beta2: parseNumber(parameters, 'beta2', 0.999, warnings, 0, 0.9999),
			epsilon: parseNumber(parameters, 'eps', 1e-8, warnings, 1e-12, 0.1)
		};
	}

	const start: Vector2 = [
		parseNumber(
			parameters,
			'x',
			defaults.start[0],
			warnings,
			landscape.domain.min[0],
			landscape.domain.max[0]
		),
		parseNumber(
			parameters,
			'y',
			defaults.start[1],
			warnings,
			landscape.domain.min[1],
			landscape.domain.max[1]
		)
	];
	const rawSeed = parameters.get('seed');
	const seed =
		rawSeed && rawSeed.trim().length > 0 && rawSeed.length <= 128 ? rawSeed : defaults.seed;
	if (rawSeed !== null && rawSeed !== seed) warnings.push('Ignored invalid seed.');

	let gradientMode: GradientMode =
		landscapeId === 'regression' ? { kind: 'minibatch', batchSize: 'full' } : { kind: 'full' };
	if (landscapeId === 'regression' && parameters.has('batch')) {
		const batch = parameters.get('batch');
		if (batch === '1' || batch === '2' || batch === '4') {
			gradientMode = { kind: 'minibatch', batchSize: Number(batch) as 1 | 2 | 4 };
		} else if (batch === 'full') gradientMode = { kind: 'minibatch', batchSize: 'full' };
		else warnings.push(`Ignored invalid batch=${batch}.`);
	} else if (landscapeId !== 'regression' && parameters.has('noise')) {
		gradientMode = {
			kind: 'noisy',
			sigma: parseNumber(parameters, 'noise', 0, warnings, 0, 20)
		};
	}

	return {
		state: {
			version: 1,
			landscape: landscapeSelection,
			optimizer,
			start,
			seed,
			speed: parseSpeed(parameters, defaults.speed, warnings),
			maximumIterations: parseInteger(
				parameters,
				'max',
				defaults.maximumIterations,
				warnings,
				1,
				10_000
			),
			gradientTolerance: parseNumber(parameters, 'tol', defaults.gradientTolerance, warnings, 0, 1),
			gradientMode
		},
		warnings
	};
}
