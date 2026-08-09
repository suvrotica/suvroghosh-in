import type { AttractorDefinition, AttractorId } from '../types';

/*
 * Point counts, calibration windows, and escape guards are deliberately bounded for an
 * interactive browser instrument. Scientific parameters and required burn-in durations
 * follow the implementation brief; guards are conservative failure detectors, not clamps.
 */
const RAW_ATTRACTOR_REGISTRY: AttractorDefinition[] = [
	{
		id: 'lorenz-63',
		name: 'Lorenz–63',
		family: 'continuous',
		dimension: 3,
		equationLatex: '\\dot x=\\sigma(y-x),\\quad\\dot y=x(\\rho-z)-y,\\quad\\dot z=xy-\\beta z',
		parameters: Object.freeze({ sigma: 10, rho: 28, beta: 8 / 3 }),
		initialState: Object.freeze([1, 1, 1]),
		integrator: 'rk4',
		stepSize: 0.005,
		burnInSteps: 5_000,
		calibrationSteps: 2_048,
		pointCount: 8_192,
		escapeRadius: 1_000,
		maxDerivative: 100_000,
		robustBounds: { lower: [-25, -35, 0], upper: [25, 35, 55] },
		projection: { kind: 'coordinates', axes: [0, 1, 2], labels: ['x', 'y', 'z'] },
		poincareSection: { kind: 'plane', axis: 0, value: 0, direction: 0, hysteresis: 0.5 },
		regionClassifier: {
			kind: 'axis-sign',
			axis: 0,
			boundary: 0,
			labels: ['left lobe', 'right lobe']
		},
		divergenceCheck: {
			kind: 'constant',
			expected: -(10 + 1 + 8 / 3),
			expression: '−(σ + 1 + β)'
		},
		source: {
			title: 'Deterministic Nonperiodic Flow',
			authors: 'Edward N. Lorenz',
			year: 1963,
			doiOrUrl: 'https://doi.org/10.1175/1520-0469(1963)020%3C0130:DNF%3E2.0.CO;2'
		}
	},
	{
		id: 'rossler',
		name: 'Rössler',
		family: 'continuous',
		dimension: 3,
		equationLatex: '\\dot x=-y-z,\\quad\\dot y=x+ay,\\quad\\dot z=b+z(x-c)',
		parameters: Object.freeze({ a: 0.2, b: 0.2, c: 5.7 }),
		initialState: Object.freeze([0.1, 0, 0]),
		integrator: 'rk4',
		stepSize: 0.01,
		burnInSteps: 10_000,
		calibrationSteps: 2_048,
		pointCount: 8_192,
		escapeRadius: 1_000,
		maxDerivative: 100_000,
		robustBounds: { lower: [-13, -14, 0], upper: [16, 12, 25] },
		projection: { kind: 'coordinates', axes: [0, 1, 2], labels: ['x', 'y', 'z'] },
		poincareSection: { kind: 'plane', axis: 1, value: 0, direction: 1, hysteresis: 0.1 },
		regionClassifier: {
			kind: 'angular',
			axes: [0, 1],
			sectors: 4,
			labels: ['east', 'north', 'west', 'south']
		},
		divergenceCheck: { kind: 'state-dependent', expression: 'a + x − c' },
		source: {
			title: 'An equation for continuous chaos',
			authors: 'Otto E. Rössler',
			year: 1976,
			doiOrUrl: 'https://doi.org/10.1016/0375-9601(76)90101-8'
		}
	},
	{
		id: 'thomas',
		name: 'Thomas labyrinth',
		family: 'continuous',
		dimension: 3,
		equationLatex: '\\dot x=\\sin y-bx,\\quad\\dot y=\\sin z-by,\\quad\\dot z=\\sin x-bz',
		parameters: Object.freeze({ b: 0.18 }),
		initialState: Object.freeze([0.1, 0, 0]),
		integrator: 'rk4',
		stepSize: 0.01,
		burnInSteps: 40_000,
		calibrationSteps: 2_048,
		pointCount: 8_192,
		escapeRadius: 100,
		maxDerivative: 10_000,
		robustBounds: { lower: [-4, -4, -4], upper: [4, 4, 4] },
		projection: { kind: 'coordinates', axes: [0, 1, 2], labels: ['x', 'y', 'z'] },
		poincareSection: { kind: 'plane', axis: 2, value: 0, direction: 0, hysteresis: 0.03 },
		regionClassifier: {
			kind: 'angular',
			axes: [0, 1],
			sectors: 6,
			labels: ['I', 'II', 'III', 'IV', 'V', 'VI']
		},
		divergenceCheck: { kind: 'constant', expected: -0.54, expression: '−3b' },
		warnings: Object.freeze([
			'Do not initialise on the invariant diagonal x = y = z.',
			'The b = 0 labyrinth is non-dissipative and is not this attractor preset.'
		]),
		source: {
			title: 'Deterministic chaos seen in terms of feedback circuits',
			authors: 'René Thomas',
			year: 1999,
			doiOrUrl:
				'https://difusion.ulb.ac.be/vufind/Record/ULB-DIPOT%3Aoai%3Adipot.ulb.ac.be%3A2013/128721/Details'
		}
	},
	{
		id: 'sprott-b',
		name: 'Sprott B',
		family: 'continuous',
		dimension: 3,
		equationLatex: '\\dot x=yz,\\quad\\dot y=x-y,\\quad\\dot z=1-xy',
		parameters: Object.freeze({}),
		initialState: Object.freeze([0.05, 0.05, 0.05]),
		integrator: 'rk4',
		stepSize: 0.01,
		burnInSteps: 10_000,
		calibrationSteps: 2_048,
		pointCount: 8_192,
		escapeRadius: 1_000,
		maxDerivative: 100_000,
		robustBounds: { lower: [-4, -4, -1], upper: [4, 4, 6] },
		projection: { kind: 'coordinates', axes: [0, 1, 2], labels: ['x', 'y', 'z'] },
		poincareSection: { kind: 'plane', axis: 1, value: 0, direction: 1, hysteresis: 0.03 },
		regionClassifier: {
			kind: 'angular',
			axes: [0, 1],
			sectors: 4,
			labels: ['I', 'II', 'III', 'IV']
		},
		divergenceCheck: { kind: 'constant', expected: -1, expression: '−1' },
		source: {
			title: 'Some simple chaotic flows',
			authors: 'Julien C. Sprott',
			year: 1994,
			doiOrUrl: 'https://doi.org/10.1103/PhysRevE.50.R647'
		}
	},
	{
		id: 'langford',
		name: 'Langford torus-breakdown',
		family: 'continuous',
		dimension: 3,
		equationLatex:
			'\\dot x=(z-b)x-dy,\\quad\\dot y=dx+(z-b)y,\\quad\\dot z=c+az-z^3/3-(x^2+y^2)(1+ez)+fz x^3',
		parameters: Object.freeze({ a: 0.95, b: 0.7, c: 0.6, d: 3.5, e: 0.25, f: 0.1 }),
		initialState: Object.freeze([0.1, 0, 0]),
		integrator: 'rk4',
		stepSize: 0.005,
		burnInSteps: 40_000,
		calibrationSteps: 2_048,
		pointCount: 8_192,
		escapeRadius: 100,
		maxDerivative: 100_000,
		robustBounds: { lower: [-2, -2, -1], upper: [2, 2, 2.5] },
		projection: { kind: 'coordinates', axes: [0, 1, 2], labels: ['x', 'y', 'z'] },
		poincareSection: { kind: 'plane', axis: 1, value: 0, direction: 1, hysteresis: 0.02 },
		regionClassifier: {
			kind: 'angular',
			axes: [0, 1],
			sectors: 5,
			labels: ['I', 'II', 'III', 'IV', 'V']
		},
		divergenceCheck: {
			kind: 'state-dependent',
			expression: '2(z−b)+a−z²−e(x²+y²)+fx³'
		},
		warnings: Object.freeze([
			'Often mislabelled online as the Aizawa attractor; attribution here follows Langford.',
			'The complete radial term −(x²+y²)(1+ez) is retained.'
		]),
		source: {
			title: 'Numerical studies of torus bifurcations',
			authors: 'William F. Langford',
			year: 1984,
			doiOrUrl: 'https://doi.org/10.1007/978-3-0348-6256-1_19'
		}
	},
	{
		id: 'rucklidge',
		name: 'Rucklidge magnetoconvective system',
		family: 'continuous',
		dimension: 3,
		equationLatex: '\\dot x=-\\kappa x+\\lambda y-yz,\\quad\\dot y=x,\\quad\\dot z=-z+y^2',
		parameters: Object.freeze({ kappa: 2, lambda: 6.7 }),
		initialState: Object.freeze([1, 0, 0]),
		integrator: 'rk4',
		stepSize: 0.005,
		burnInSteps: 20_000,
		calibrationSteps: 2_048,
		pointCount: 8_192,
		escapeRadius: 1_000,
		maxDerivative: 100_000,
		robustBounds: { lower: [-15, -8, 0], upper: [15, 8, 20] },
		projection: { kind: 'coordinates', axes: [0, 1, 2], labels: ['x', 'y', 'z'] },
		poincareSection: { kind: 'plane', axis: 1, value: 0, direction: 0, hysteresis: 0.04 },
		regionClassifier: {
			kind: 'axis-sign',
			axis: 1,
			boundary: 0,
			labels: ['negative roll', 'positive roll']
		},
		divergenceCheck: { kind: 'constant', expected: -3, expression: '−(κ+1)' },
		source: {
			title: 'Chaos in models of double convection',
			authors: 'Alastair M. Rucklidge',
			year: 1992,
			doiOrUrl: 'https://doi.org/10.1017/S0022112092003392'
		}
	},
	{
		id: 'chua',
		name: 'Chua double scroll',
		family: 'continuous',
		dimension: 3,
		equationLatex: '\\dot x=\\alpha[y-x-h(x)],\\quad\\dot y=x-y+z,\\quad\\dot z=-\\beta y',
		parameters: Object.freeze({ alpha: 15.6, beta: 28, m0: -8 / 7, m1: -5 / 7 }),
		initialState: Object.freeze([0.1, 0, 0]),
		integrator: 'rk4',
		stepSize: 0.005,
		burnInSteps: 20_000,
		calibrationSteps: 2_048,
		pointCount: 8_192,
		escapeRadius: 1_000,
		maxDerivative: 100_000,
		robustBounds: { lower: [-3, -1, -5], upper: [3, 1, 5] },
		projection: { kind: 'coordinates', axes: [0, 1, 2], labels: ['x', 'y', 'z'] },
		poincareSection: { kind: 'plane', axis: 0, value: 0, direction: 0, hysteresis: 0.03 },
		regionClassifier: {
			kind: 'axis-sign',
			axis: 0,
			boundary: 0,
			labels: ['left scroll', 'right scroll']
		},
		divergenceCheck: {
			kind: 'state-dependent',
			expression: 'α(−1−h′(x))−1'
		},
		source: {
			title: "A chaotic attractor from Chua's circuit",
			authors: 'Takashi Matsumoto',
			year: 1984,
			doiOrUrl: 'https://doi.org/10.1109/TCS.1984.1085459'
		}
	},
	{
		id: 'henon',
		name: 'Hénon map',
		family: 'discrete-map',
		dimension: 2,
		equationLatex: 'x_{n+1}=1-ax_n^2+y_n,\\quad y_{n+1}=bx_n',
		parameters: Object.freeze({ a: 1.4, b: 0.3 }),
		initialState: Object.freeze([0, 0]),
		integrator: 'direct-map',
		burnInSteps: 1_000,
		calibrationSteps: 2_048,
		pointCount: 10_000,
		escapeRadius: 100,
		maxDerivative: 10_000,
		robustBounds: { lower: [-1.6, -0.5, -1], upper: [1.6, 0.5, 1] },
		projection: { kind: 'coordinates', axes: [0, 1, 1], labels: ['xₙ', 'yₙ', '0'] },
		poincareSection: { kind: 'extremum', axis: 0, direction: 0, hysteresis: 0.01 },
		regionClassifier: {
			kind: 'quantile',
			axis: 0,
			bins: 4,
			labels: ['low', 'lower middle', 'upper middle', 'high']
		},
		divergenceCheck: { kind: 'constant', expected: -0.3, expression: 'det DF = −b' },
		warnings: Object.freeze([
			'Points are canonical; connecting them is an explicitly artistic interpolation.'
		]),
		source: {
			title: 'A two-dimensional mapping with a strange attractor',
			authors: 'Michel Hénon',
			year: 1976,
			doiOrUrl: 'https://doi.org/10.1007/BF01608556'
		}
	},
	{
		id: 'mackey-glass',
		name: 'Mackey–Glass delay system',
		family: 'delay-system',
		dimension: 1,
		equationLatex: '\\dot x(t)=\\frac{\\beta x(t-\\tau)}{1+x(t-\\tau)^n}-\\gamma x(t)',
		parameters: Object.freeze({ beta: 0.2, gamma: 0.1, n: 10, tau: 17, history: 1.2 }),
		initialState: Object.freeze([1.2]),
		integrator: 'delay-rk4',
		stepSize: 0.05,
		burnInSteps: 20_000,
		calibrationSteps: 2_048,
		pointCount: 8_192,
		escapeRadius: 10,
		maxDerivative: 1_000,
		robustBounds: { lower: [0.2, 0.2, 0.2], upper: [1.6, 1.6, 1.6] },
		projection: {
			kind: 'delay-embedding',
			delays: [0, 17, 34],
			labels: ['x(t)', 'x(t−τ)', 'x(t−2τ)']
		},
		poincareSection: { kind: 'extremum', axis: 0, direction: 1, hysteresis: 0.005 },
		regionClassifier: {
			kind: 'quantile',
			axis: 0,
			bins: 4,
			labels: ['low', 'rising', 'falling', 'high']
		},
		warnings: Object.freeze([
			'The displayed three coordinates form a delay embedding, not the literal state dimension.'
		]),
		source: {
			title: 'Oscillation and chaos in physiological control systems',
			authors: 'Michael C. Mackey and Leon Glass',
			year: 1977,
			doiOrUrl: 'https://doi.org/10.1126/science.267326'
		}
	},
	{
		id: 'rabinovich-fabrikant',
		name: 'Rabinovich–Fabrikant',
		family: 'continuous',
		dimension: 3,
		equationLatex: '\\dot x=y(z-1+x^2)+ax,\\quad\\dot y=x(3z+1-x^2)+ay,\\quad\\dot z=-2z(b+xy)',
		parameters: Object.freeze({ a: 0.1, b: 0.2876 }),
		initialState: Object.freeze([0.05, -0.05, 0.3]),
		integrator: 'rk4',
		stepSize: 0.0001,
		// This sensitive preset is not sampled from its short initial transient. A fixed
		// 100-time-unit warm-up is followed by observations every 0.005 simulated units.
		sampleStride: 50,
		burnInSteps: 1_000_000,
		calibrationSteps: 2_048,
		pointCount: 6_144,
		escapeRadius: 100,
		maxDerivative: 100_000,
		robustBounds: { lower: [-3, -3, -1], upper: [3, 3, 5] },
		projection: { kind: 'coordinates', axes: [0, 1, 2], labels: ['x', 'y', 'z'] },
		poincareSection: { kind: 'plane', axis: 2, value: 0.5, direction: 0, hysteresis: 0.01 },
		regionClassifier: {
			kind: 'angular',
			axes: [0, 1],
			sectors: 4,
			labels: ['I', 'II', 'III', 'IV']
		},
		divergenceCheck: { kind: 'constant', expected: -0.3752, expression: '2a−2b' },
		warnings: Object.freeze([
			'Experimental / sensitive to initial conditions and numerical settings.',
			'Stable sinks and chaotic sets can coexist; this preset does not claim a universal basin.'
		]),
		source: {
			title: 'Stochastic self-modulation of waves in nonequilibrium media',
			authors: 'Mikhail I. Rabinovich and Anatoly L. Fabrikant',
			year: 1979,
			doiOrUrl: 'https://www.jetp.ras.ru/cgi-bin/e/index/e/50/2/p311?a=list'
		}
	}
];

function deepFreeze<Value>(value: Value): Value {
	if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
	for (const child of Object.values(value)) deepFreeze(child);
	return Object.freeze(value);
}

export const ATTRACTOR_REGISTRY: readonly AttractorDefinition[] = Object.freeze(
	RAW_ATTRACTOR_REGISTRY.map((definition) => deepFreeze(definition))
);

const BY_ID = new Map<AttractorId, AttractorDefinition>(
	ATTRACTOR_REGISTRY.map((definition) => [definition.id, definition])
);

export function isAttractorId(value: unknown): value is AttractorId {
	return typeof value === 'string' && BY_ID.has(value as AttractorId);
}

export function getAttractorDefinition(id: AttractorId | string): AttractorDefinition {
	const definition = BY_ID.get(id as AttractorId);
	if (!definition) throw new RangeError(`Unknown strange-attractor preset: ${String(id)}`);
	return definition;
}
