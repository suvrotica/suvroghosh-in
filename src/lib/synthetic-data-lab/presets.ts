import type { ExperimentConfig, Variable } from './types';

export function variable(
	id: string,
	name: string,
	distribution = 'normal',
	parameters: Record<string, unknown> = { mean: 0, std: 1 }
): Variable {
	return {
		id,
		name,
		kind: distribution === 'categorical' ? 'categorical' : 'numeric',
		distribution,
		parameters,
		role: 'feature',
		decimals: 3,
		missing: 0,
		noise: 0
	};
}

export function defaultConfig(): ExperimentConfig {
	return {
		version: 1,
		name: 'My first experiment',
		purpose: 'Explore distributions and generate an ML-ready dataset.',
		rows: 5000,
		seed: 1847,
		replications: 1,
		variables: [
			variable('x', 'feature_x'),
			variable('y', 'feature_y', 'lognormal', { log_mean: 0, log_sd: 0.55 }),
			variable('segment', 'segment', 'categorical', {
				categories: ['A', 'B', 'C'],
				probabilities: [0.5, 0.3, 0.2]
			})
		],
		dependence: { mode: 'independent', columns: [], matrix: [] },
		outcome: {
			task: 'regression',
			name: 'target',
			coefficients: { x: 1.5, y: 0.7 },
			intercept: 0,
			noise: 0.5,
			label_noise: 0
		},
		event: {
			enabled: false,
			process: 'renewal',
			stop: 'count',
			count: 5000,
			window: 3600,
			distribution: 'exponential',
			parameters: { rate: 1 },
			start: '2026-01-01T00:00:00Z',
			unit: 'seconds',
			duration: 0,
			intensity_amplitude: 0,
			period: 3600
		},
		timeseries: { enabled: false, column: 'x', trend: 0, seasonal_period: 50, amplitude: 0, ar: 0 },
		quality: {
			missingness: 'mcar',
			rate: 0,
			driver: 'x',
			outlier_rate: 0,
			outlier_scale: 5,
			duplicate_rate: 0
		},
		split: { mode: 'none', train: 0.7, validation: 0.15 }
	};
}

export const presetDefinitions = [
	{
		id: 'distribution',
		label: 'Distribution explorer',
		tag: 'START HERE',
		description: 'Normal, skewed and categorical features.'
	},
	{
		id: 'regression',
		label: 'Correlated regression',
		tag: 'MACHINE LEARNING',
		description: 'Known coefficients, related features and noise.'
	},
	{
		id: 'classification',
		label: 'Classification boundary',
		tag: 'MACHINE LEARNING',
		description: 'A probabilistic target with label noise.'
	},
	{
		id: 'events',
		label: 'Event arrivals',
		tag: 'SIMULATION',
		description: 'Change the shape of time between arrivals.'
	},
	{
		id: 'timeseries',
		label: 'Seasonal sensor',
		tag: 'TIME SERIES',
		description: 'Trend, seasonality and autocorrelated readings.'
	},
	{
		id: 'quality',
		label: 'Imperfect observations',
		tag: 'ROBUSTNESS',
		description: 'Missing values, outliers and repeated records.'
	},
	{
		id: 'causal',
		label: 'Causal scenarios',
		tag: 'STRUCTURAL MODEL',
		description: 'Specify a causal mechanism and compare an intervention.'
	},
	{
		id: 'survival',
		label: 'Time to event',
		tag: 'SURVIVAL',
		description: 'Weibull event times with independent censoring.'
	},
	{
		id: 'spatial',
		label: 'Spatial clusters',
		tag: 'SPACE',
		description: 'Gaussian clusters in Cartesian coordinates.'
	},
	{
		id: 'graph',
		label: 'Community graph',
		tag: 'NETWORKS',
		description: 'A stochastic-block graph with nodes and edges.'
	},
	{
		id: 'relational',
		label: 'Parents & children',
		tag: 'RELATIONAL',
		description: 'Linked tables with a declared child-count model.'
	},
	{
		id: 'longitudinal',
		label: 'Repeated measures',
		tag: 'HIERARCHICAL',
		description: 'Entity-specific intercepts and slopes over time.'
	}
];

export function loadPreset(id: string): ExperimentConfig {
	const c = defaultConfig();
	if (id === 'distribution') c.outcome.task = 'none';
	if (id === 'regression') {
		c.name = 'Correlated regression';
		c.variables = [variable('x', 'feature_x'), variable('y', 'feature_y')];
		c.dependence = {
			mode: 'gaussian_copula',
			columns: ['x', 'y'],
			matrix: [
				[1, 0.65],
				[0.65, 1]
			]
		};
	}
	if (id === 'classification') {
		c.name = 'Classification boundary';
		c.variables = [variable('x', 'feature_x'), variable('y', 'feature_y')];
		c.outcome = {
			task: 'classification',
			name: 'target',
			coefficients: { x: 1.5, y: -1 },
			intercept: -0.8,
			noise: 1,
			label_noise: 0.03
		};
	}
	if (id === 'events') {
		c.name = 'Renewal process';
		c.outcome.task = 'none';
		c.variables = [variable('amount', 'amount', 'gamma', { shape: 2, scale: 10 })];
		c.event.enabled = true;
		c.rows = 1500;
		c.event.count = 1500;
	}
	if (id === 'timeseries') {
		c.name = 'Seasonal sensor';
		c.variables = [variable('x', 'reading')];
		c.outcome.task = 'none';
		c.rows = 600;
		c.timeseries = {
			enabled: true,
			column: 'x',
			trend: 0.005,
			seasonal_period: 50,
			amplitude: 2,
			ar: 0.7
		};
	}
	if (id === 'quality') {
		c.name = 'Imperfect observations';
		c.quality = {
			missingness: 'mcar',
			rate: 0.1,
			driver: 'x',
			outlier_rate: 0.025,
			outlier_scale: 5,
			duplicate_rate: 0.03
		};
	}
	if (['causal', 'survival', 'spatial', 'graph', 'relational', 'longitudinal'].includes(id)) {
		c.name = presetDefinitions.find((p) => p.id === id)?.label ?? id;
		c.variables = [variable('x', 'x')];
		c.outcome.task = 'none';
		if (id === 'causal')
			c.domain = {
				type: 'causal',
				parameters: {
					nodes: [
						{ name: 'treatment', expression: '0.8*x', noise_std: 1 },
						{ name: 'response', expression: '2*treatment+x', noise_std: 1, role: 'target' }
					],
					interventions: { treatment: 1 }
				}
			};
		if (id === 'survival')
			c.domain = {
				type: 'survival',
				parameters: { shape: 1.5, scale: 10, censor_time: 15, coefficients: { x: 0.5 } }
			};
		if (id === 'spatial')
			c.domain = {
				type: 'spatial',
				parameters: {
					centres: [
						[-3, -2],
						[3, 2]
					],
					std: 0.8
				}
			};
		if (id === 'graph') {
			c.rows = 180;
			c.domain = {
				type: 'graph',
				parameters: {
					communities: 3,
					within_probability: 0.2,
					between_probability: 0.02,
					ensure_connected: true
				}
			};
		}
		if (id === 'relational') {
			c.rows = 1000;
			c.domain = {
				type: 'relational',
				parameters: { mean_children: 3, parent_coefficient: 2, child_noise: 1, driver: 'x' }
			};
		}
		if (id === 'longitudinal') {
			c.rows = 1000;
			c.domain = {
				type: 'longitudinal',
				parameters: {
					entities: 100,
					random_intercept_std: 2,
					random_slope_std: 0.2,
					measurement_std: 0.5,
					trend: 0.1
				}
			};
			c.split = { mode: 'group', train: 0.7, validation: 0.15, group_column: 'entity_id' };
		}
	}
	return c;
}
