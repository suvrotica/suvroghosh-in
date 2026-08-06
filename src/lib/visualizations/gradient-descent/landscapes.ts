import { assertFiniteVector, matrixVector, quadraticForm } from './linear-algebra';
import type {
	LandscapeDefinition,
	LandscapeId,
	LandscapeSelection,
	Matrix2,
	QuadraticLandscapeDefinition,
	QuadraticParameters,
	RegressionLandscapeDefinition,
	RegressionPoint,
	Vector2
} from './types';

const PI2 = 2 * Math.PI;

function checkedTheta(theta: Vector2): Vector2 {
	assertFiniteVector(theta, 'theta');
	return theta;
}

export function createQuadraticLandscape(
	parameters: Partial<QuadraticParameters> = {}
): QuadraticLandscapeDefinition {
	const lambda1 = parameters.lambda1 ?? 1;
	const lambda2 = parameters.lambda2 ?? 14;
	const rotation = parameters.rotation ?? Math.PI / 6;
	if (
		!Number.isFinite(lambda1) ||
		!Number.isFinite(lambda2) ||
		!(lambda1 > 0) ||
		!(lambda2 > 0) ||
		!Number.isFinite(rotation)
	) {
		throw new RangeError('Quadratic eigenvalues must be positive and rotation must be finite.');
	}

	const cosine = Math.cos(rotation);
	const sine = Math.sin(rotation);
	const matrix: Matrix2 = [
		[lambda1 * cosine ** 2 + lambda2 * sine ** 2, (lambda1 - lambda2) * sine * cosine],
		[(lambda1 - lambda2) * sine * cosine, lambda1 * sine ** 2 + lambda2 * cosine ** 2]
	];
	const lambdaMin = Math.min(lambda1, lambda2);
	const lambdaMax = Math.max(lambda1, lambda2);

	return {
		id: 'quadratic',
		name: 'The quadratic bowl',
		shortDescription: 'A rotated positive-definite bowl whose conditioning can be read exactly.',
		parameterLabels: ['θ₁', 'θ₂'],
		domain: { min: [-5, -5], max: [5, 5] },
		defaultStart: [4, -3],
		defaultLearningRate: 0.08,
		knownMinima: [{ theta: [0, 0], loss: 0, label: 'Global minimum' }],
		knownMinimumLoss: 0,
		recommendedCamera: 'three-quarter',
		recommendedHeightMapping: 'linear',
		citationsOrNotes: [
			'Fixed-step vanilla gradient descent is stable here only for 0 < η < 2 / λmax.'
		],
		parameters: { lambda1, lambda2, rotation },
		matrix,
		lambdaMin,
		lambdaMax,
		conditionNumber: lambdaMax / lambdaMin,
		stableLearningRateUpperBound: 2 / lambdaMax,
		optimalFixedLearningRate: 2 / (lambdaMin + lambdaMax),
		value(theta) {
			checkedTheta(theta);
			return 0.5 * quadraticForm(theta, matrix);
		},
		gradient(theta) {
			checkedTheta(theta);
			return matrixVector(matrix, theta);
		},
		hessian(theta) {
			checkedTheta(theta);
			return matrix;
		}
	};
}

export const ROSENBROCK_LANDSCAPE: LandscapeDefinition = {
	id: 'rosenbrock',
	name: 'The Rosenbrock ravine',
	shortDescription: 'A narrow curved valley that punishes steps chosen for only one local scale.',
	parameterLabels: ['x', 'y'],
	domain: { min: [-2, -1], max: [2, 3] },
	defaultStart: [-1.2, 1],
	defaultLearningRate: 0.001,
	knownMinima: [{ theta: [1, 1], loss: 0, label: 'Global minimum' }],
	knownMinimumLoss: 0,
	recommendedCamera: 'ravine',
	recommendedHeightMapping: 'log-compressed',
	citationsOrNotes: ['Defaults use a = 1 and b = 100.'],
	value(theta) {
		const [x, y] = checkedTheta(theta);
		return (1 - x) ** 2 + 100 * (y - x ** 2) ** 2;
	},
	gradient(theta) {
		const [x, y] = checkedTheta(theta);
		return [-2 * (1 - x) - 400 * x * (y - x ** 2), 200 * (y - x ** 2)];
	},
	hessian(theta) {
		const [x, y] = checkedTheta(theta);
		return [
			[2 - 400 * y + 1200 * x ** 2, -400 * x],
			[-400 * x, 200]
		];
	}
};

const HIMMELBLAU_MINIMA = [
	[3, 2],
	[-2.805118, 3.131312],
	[-3.77931, -3.283186],
	[3.584428, -1.848126]
] as const satisfies readonly Vector2[];

export const HIMMELBLAU_LANDSCAPE: LandscapeDefinition = {
	id: 'himmelblau',
	name: 'Himmelblau’s four valleys',
	shortDescription: 'Four minima divide the same surface into optimizer-dependent destinations.',
	parameterLabels: ['x', 'y'],
	domain: { min: [-6, -6], max: [6, 6] },
	defaultStart: [0.1, 0.1],
	defaultLearningRate: 0.01,
	knownMinima: HIMMELBLAU_MINIMA.map((theta, index) => ({
		theta,
		loss: 0,
		label: `Valley ${index + 1}`
	})),
	knownMinimumLoss: 0,
	recommendedCamera: 'four-valleys',
	recommendedHeightMapping: 'log-compressed',
	citationsOrNotes: [
		'The basin map belongs to the surface, optimizer, hyperparameters and budget.'
	],
	value(theta) {
		const [x, y] = checkedTheta(theta);
		return (x ** 2 + y - 11) ** 2 + (x + y ** 2 - 7) ** 2;
	},
	gradient(theta) {
		const [x, y] = checkedTheta(theta);
		const first = x ** 2 + y - 11;
		const second = x + y ** 2 - 7;
		return [4 * x * first + 2 * second, 2 * first + 4 * y * second];
	},
	hessian(theta) {
		const [x, y] = checkedTheta(theta);
		return [
			[12 * x ** 2 + 4 * y - 42, 4 * (x + y)],
			[4 * (x + y), 4 * x + 12 * y ** 2 - 26]
		];
	}
};

export const RASTRIGIN_LANDSCAPE: LandscapeDefinition = {
	id: 'rastrigin',
	name: 'The Rastrigin corrugations',
	shortDescription: 'A regular field of local minima surrounding one global minimum.',
	parameterLabels: ['x', 'y'],
	domain: { min: [-5.12, -5.12], max: [5.12, 5.12] },
	defaultStart: [3.7, -3.2],
	defaultLearningRate: 0.008,
	knownMinima: [{ theta: [0, 0], loss: 0, label: 'Global minimum' }],
	knownMinimumLoss: 0,
	recommendedCamera: 'corrugations',
	recommendedHeightMapping: 'log-compressed',
	citationsOrNotes: ['Noise may change a path but does not guarantee global optimization.'],
	value(theta) {
		const [x, y] = checkedTheta(theta);
		return 20 + x ** 2 - 10 * Math.cos(PI2 * x) + y ** 2 - 10 * Math.cos(PI2 * y);
	},
	gradient(theta) {
		const [x, y] = checkedTheta(theta);
		return [2 * x + 20 * Math.PI * Math.sin(PI2 * x), 2 * y + 20 * Math.PI * Math.sin(PI2 * y)];
	},
	hessian(theta) {
		const [x, y] = checkedTheta(theta);
		return [
			[2 + 40 * Math.PI ** 2 * Math.cos(PI2 * x), 0],
			[0, 2 + 40 * Math.PI ** 2 * Math.cos(PI2 * y)]
		];
	}
};

const SADDLE_MINIMUM = Math.sqrt(5);

export const CONTAINED_SADDLE_LANDSCAPE: LandscapeDefinition = {
	id: 'saddle',
	name: 'The contained saddle',
	shortDescription: 'A stationary saddle sits between two minima in a bounded quartic surface.',
	parameterLabels: ['x', 'y'],
	domain: { min: [-3, -3], max: [3, 3] },
	defaultStart: [0.08, 0.04],
	defaultLearningRate: 0.08,
	knownMinima: [
		{ theta: [0, SADDLE_MINIMUM], loss: -2.5, label: 'Northern minimum' },
		{ theta: [0, -SADDLE_MINIMUM], loss: -2.5, label: 'Southern minimum' }
	],
	knownMinimumLoss: -2.5,
	recommendedCamera: 'saddle',
	recommendedHeightMapping: 'linear',
	citationsOrNotes: [
		'At the origin the gradient is zero while Hessian eigenvalues have opposite signs.'
	],
	value(theta) {
		const [x, y] = checkedTheta(theta);
		return x ** 2 - y ** 2 + 0.1 * (x ** 4 + y ** 4);
	},
	gradient(theta) {
		const [x, y] = checkedTheta(theta);
		return [2 * x + 0.4 * x ** 3, -2 * y + 0.4 * y ** 3];
	},
	hessian(theta) {
		const [x, y] = checkedTheta(theta);
		return [
			[2 + 1.2 * x ** 2, 0],
			[0, -2 + 1.2 * y ** 2]
		];
	}
};

export const PLATEAU_LANDSCAPE: LandscapeDefinition = {
	id: 'plateau',
	name: 'The plateau',
	shortDescription: 'A saturating bowl whose outer slopes are almost imperceptibly small.',
	parameterLabels: ['x', 'y'],
	domain: { min: [-8, -8], max: [8, 8] },
	defaultStart: [6, -5],
	defaultLearningRate: 1,
	knownMinima: [{ theta: [0, 0], loss: 0, label: 'Global minimum' }],
	knownMinimumLoss: 0,
	recommendedCamera: 'low-angle',
	recommendedHeightMapping: 'linear',
	citationsOrNotes: ['A tiny gradient on the outer plateau is not evidence of a nearby minimum.'],
	value(theta) {
		const [x, y] = checkedTheta(theta);
		return 1 - Math.exp(-0.12 * (x ** 2 + y ** 2));
	},
	gradient(theta) {
		const [x, y] = checkedTheta(theta);
		const exponential = Math.exp(-0.12 * (x ** 2 + y ** 2));
		return [0.24 * exponential * x, 0.24 * exponential * y];
	},
	hessian(theta) {
		const [x, y] = checkedTheta(theta);
		const exponential = Math.exp(-0.12 * (x ** 2 + y ** 2));
		return [
			[0.24 * exponential * (1 - 0.24 * x ** 2), -0.0576 * exponential * x * y],
			[-0.0576 * exponential * x * y, 0.24 * exponential * (1 - 0.24 * y ** 2)]
		];
	}
};

export const REGRESSION_BASE_POINTS: readonly RegressionPoint[] = [
	{ id: 'p1', x: -2.5, y: -4.9 },
	{ id: 'p2', x: -1.8, y: -3.96 },
	{ id: 'p3', x: -1, y: -2.42 },
	{ id: 'p4', x: -0.25, y: -1.285 },
	{ id: 'p5', x: 0.5, y: 0.17 },
	{ id: 'p6', x: 1.2, y: 1.1 },
	{ id: 'p7', x: 2, y: 2.65 },
	{ id: 'p8', x: 2.7, y: 3.71 }
];

export const REGRESSION_OUTLIER: RegressionPoint = {
	id: 'outlier',
	x: 2.4,
	y: 7.4,
	isOutlier: true
};

function regressionValue(points: readonly RegressionPoint[], theta: Vector2): number {
	const [slope, intercept] = checkedTheta(theta);
	let squaredError = 0;
	for (const point of points) {
		const residual = slope * point.x + intercept - point.y;
		squaredError += residual ** 2;
	}
	return squaredError / points.length;
}

function regressionGradient(
	points: readonly RegressionPoint[],
	theta: Vector2,
	indices?: readonly number[]
): Vector2 {
	const [slope, intercept] = checkedTheta(theta);
	const selected = indices ?? points.map((_, index) => index);
	if (selected.length === 0)
		throw new RangeError('A regression gradient needs at least one point.');
	let slopeGradient = 0;
	let interceptGradient = 0;
	for (const index of selected) {
		if (!Number.isSafeInteger(index) || index < 0 || index >= points.length) {
			throw new RangeError(`Regression point index ${index} is outside the dataset.`);
		}
		const point = points[index];
		const residual = slope * point.x + intercept - point.y;
		slopeGradient += point.x * residual;
		interceptGradient += residual;
	}
	const factor = 2 / selected.length;
	return [factor * slopeGradient, factor * interceptGradient];
}

function regressionHessian(points: readonly RegressionPoint[]): Matrix2 {
	let sumX = 0;
	let sumX2 = 0;
	for (const point of points) {
		sumX += point.x;
		sumX2 += point.x ** 2;
	}
	const factor = 2 / points.length;
	return [
		[factor * sumX2, factor * sumX],
		[factor * sumX, 2]
	];
}

function leastSquaresOptimum(points: readonly RegressionPoint[]): Vector2 {
	const count = points.length;
	let sumX = 0;
	let sumY = 0;
	let sumXX = 0;
	let sumXY = 0;
	for (const point of points) {
		sumX += point.x;
		sumY += point.y;
		sumXX += point.x ** 2;
		sumXY += point.x * point.y;
	}
	const denominator = count * sumXX - sumX ** 2;
	if (Math.abs(denominator) <= Number.EPSILON) {
		throw new RangeError('Regression data do not identify both slope and intercept.');
	}
	const slope = (count * sumXY - sumX * sumY) / denominator;
	return [slope, (sumY - slope * sumX) / count];
}

export function createRegressionLandscape(includesOutlier = false): RegressionLandscapeDefinition {
	const points = includesOutlier
		? [...REGRESSION_BASE_POINTS, REGRESSION_OUTLIER]
		: Array.from(REGRESSION_BASE_POINTS);
	const optimum = leastSquaresOptimum(points);
	const hessian = regressionHessian(points);
	return {
		id: 'regression',
		name: 'Regression as terrain',
		shortDescription: 'Mean squared error over the slope and intercept of one ordinary line.',
		parameterLabels: ['m', 'b'],
		domain: { min: [-1.5, -4], max: [4.5, 4.5] },
		defaultStart: [-0.8, 3],
		defaultLearningRate: 0.08,
		knownMinima: [
			{
				theta: optimum,
				loss: regressionValue(points, optimum),
				label: includesOutlier ? 'Least-squares fit with outlier' : 'Least-squares fit'
			}
		],
		knownMinimumLoss: regressionValue(points, optimum),
		recommendedCamera: 'regression-bowl',
		recommendedHeightMapping: 'log-compressed',
		citationsOrNotes: [
			'Squared error gives large residuals disproportionately large influence; the optional point is fixed.'
		],
		points,
		includesOutlier,
		value(theta) {
			return regressionValue(points, theta);
		},
		gradient(theta) {
			return regressionGradient(points, theta);
		},
		gradientForIndices(theta, indices) {
			return regressionGradient(points, theta, indices);
		},
		hessian(theta) {
			checkedTheta(theta);
			return hessian;
		}
	};
}

export const DEFAULT_QUADRATIC_LANDSCAPE = createQuadraticLandscape();
export const DEFAULT_REGRESSION_LANDSCAPE = createRegressionLandscape(false);

export const DEFAULT_LANDSCAPES: Readonly<Record<LandscapeId, LandscapeDefinition>> = {
	quadratic: DEFAULT_QUADRATIC_LANDSCAPE,
	rosenbrock: ROSENBROCK_LANDSCAPE,
	himmelblau: HIMMELBLAU_LANDSCAPE,
	rastrigin: RASTRIGIN_LANDSCAPE,
	saddle: CONTAINED_SADDLE_LANDSCAPE,
	plateau: PLATEAU_LANDSCAPE,
	regression: DEFAULT_REGRESSION_LANDSCAPE
};

export function createLandscape(selection: LandscapeSelection | LandscapeId): LandscapeDefinition {
	const normalized = typeof selection === 'string' ? { id: selection } : selection;
	if (normalized.id === 'quadratic') return createQuadraticLandscape(normalized.quadratic);
	if (normalized.id === 'regression') {
		return createRegressionLandscape(normalized.regressionOutlier ?? false);
	}
	return DEFAULT_LANDSCAPES[normalized.id];
}

export function isRegressionLandscape(
	landscape: LandscapeDefinition
): landscape is RegressionLandscapeDefinition {
	return landscape.id === 'regression' && 'gradientForIndices' in landscape;
}
