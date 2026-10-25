import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(
	new URL('../docs/visualizations/synthetic-data-lab-factor-inventory.txt', import.meta.url),
	'utf8'
);
const requirements = source
	.replace(/\[[^\]]+\]\([^\)]+\)/g, '')
	.split(',')
	.map((value) => value.trim())
	.filter(Boolean);
const groups = [
	{
		module: 'conditional_sampling',
		path: 'variables[].conditional/zero_inflation/hurdle; sampling',
		ui: 'Advanced JSON configuration and variable editor',
		items:
			'subgroup-specific distributions|conditional distributions|structural zeros|zero-inflation probability|hurdle model specification|sampling with or without replacement|sampling weights|stratification variables|sample allocation across strata|bootstrap sampling',
		note: 'Earlier-category conditional maps, structural-zero mixture or a distinct positive hurdle, exact stratified allocations, whole-row weighted/bootstrap source sampling. Compatibility checks restrict unsupported joint/copula/exact-sample combinations. Source resampling can copy real records.'
	},
	{
		module: 'metadata',
		path: 'name/purpose/target_population/observation_unit/variables',
		ui: 'Design and advanced JSON',
		items:
			'intended use of the synthetic dataset|target population|unit of observation|number of records|number of variables|number of independent dataset replications|column names and meanings|data dictionary|numerical versus categorical variables|continuous versus discrete numerical variables|nominal categories with unordered labels|binary variables|count variables|date and time variables|text variables|identifiers and entity keys|units of measurement|numerical precision|allowed decimal places|categorical value dictionaries|column ordering|output schema|synthetic record labeling|generation method documentation|configuration export|generator version|dependency versions|generation timestamp',
		note: 'Explicit schema/configuration and exported metadata; text uses bounded dictionary sampling.'
	},
	{
		module: 'distributions',
		path: 'variables[].distribution/parameters',
		ui: 'Variable distribution editor',
		items:
			'marginal distribution for each variable|normal distribution with mean and standard deviation|uniform distribution with lower and upper bounds|lognormal distribution with log-space mean and standard deviation|exponential distribution with rate or scale|gamma distribution with shape and rate or scale|beta distribution with two shape parameters|weibull distribution with shape and scale|poisson distribution with expected event count|bernoulli distribution with success probability|binomial distribution with trial count and success probability|negative binomial distribution with explicit parameterization|categorical distribution with category probabilities|multinomial distribution with trial count and category probabilities|dirichlet distribution with concentration parameters|student’s t distribution with degrees of freedom and location and scale|cauchy distribution with location and scale|laplace distribution with location and scale|logistic distribution with location and scale|pareto distribution with minimum value and tail index|zipf distribution with exponent|geometric distribution with success probability and counting convention|hypergeometric distribution with population composition and draw count|triangular distribution with minimum and mode and maximum|generalized extreme value distribution with shape and location and scale|multivariate normal distribution with mean vector and covariance matrix|symmetric positive semidefinite covariance requirements|empirical distribution from reference observations|histogram-based distribution|kernel density model and bandwidth|mixture component distributions|mixture component count|mixture component weights|component-specific parameters|distribution support|distribution truncation thresholds|observation censoring thresholds|value clipping rules|rounding and quantization rules|parameter naming conventions|rate versus scale convention|variance versus standard deviation convention|population parameters versus requested sample statistics|exact versus approximate sample mean|exact versus approximate sample variance|unimodal versus multimodal shape|compatibility of requested distribution properties',
		note: 'Validated adapters; empirical/KDE values are explicitly configured. Exact sample moments are limited to supported normal configurations. Custom PDFs/CDFs and arbitrary shape targets remain unavailable.'
	},
	{
		module: 'sampling',
		path: 'seed/replications/sampling/variables[].exact_counts',
		ui: 'Dataset settings and advanced JSON',
		items:
			'pseudorandom sampling|fixed seed or fresh seed per run|random number generator algorithm|reproducibility across parallel runs|exact category counts versus probabilistic category frequencies|quantile spacing|latin hypercube sampling settings|sobol sequence settings|halton sequence settings|quasi-random scrambling settings|minimum and maximum permitted values|integer-only requirements',
		note: 'PCG64DXSM named streams and a fixed logical configuration/version contract; sampling designs are limited to implemented adapters. No claim of hardware/version invariance.'
	},
	{
		module: 'dependence',
		path: 'dependence/variables[].expression',
		ui: 'Relationships and advanced JSON',
		items:
			'feature independence within each observation|target correlation matrix|deterministic relationships between variables|functional dependencies between columns',
		note: 'Independence or latent Gaussian copula matrix; achieved correlations shown separately. Derived fields use restricted acyclic mathematical expressions.'
	},
	{
		module: 'ml',
		path: 'outcome/split',
		ui: 'ML and data-quality controls',
		items:
			'target variable definitions|prediction task type|ground-truth outcome function|regression intercept and coefficients|label generation mechanism|label noise rate|irreducible outcome noise|training and validation and test split sizes|random versus temporal versus grouped splitting|entity separation across splits|duplicate separation across splits|prevention of target leakage|prevention of future information leakage',
		note: 'Regression and binary logistic labels with explicit clean truth, split roles and duplicate-family separation; arbitrary external task validity is not guaranteed.'
	},
	{
		module: 'quality',
		path: 'quality/variables[].missing/variables[].noise',
		ui: 'Quality controls and advanced JSON',
		items:
			'measurement error distribution|additive versus multiplicative noise|noise magnitude|contamination proportion|outlier generation mechanism|outlier magnitude|point anomalies|anomaly labels|natural extreme values versus injected anomalies|missingness rate per variable|mcar missingness (missing completely at random)|mar missingness (missing at random)|mnar missingness (missing not at random)|duplicate record rate|clean versus corrupted record labels|corruption and anomaly annotation export|latent variable export policy',
		note: 'Implemented noise is additive Gaussian; multiplicative noise remains planned. Missingness mechanisms and exact duplicates are supported; masks/clean truth require explicit bundle opt-in.'
	},
	{
		module: 'temporal',
		path: 'event/timeseries',
		ui: 'Events and series workspace',
		items:
			'time range|time zone|regular versus irregular observation intervals|sampling frequency|initial conditions|warm-up period|trend functions|seasonal periods|seasonal amplitudes|autoregressive coefficients|event arrival process|event intensity|interarrival time distribution|event duration distribution|event ordering constraints',
		note: 'UTC timestamps; stationary AR(1) with explicit trend/seasonality; Poisson, bounded sinusoidal NHPP, and positive renewal gaps. Event duration is currently constant, not an arbitrary duration distribution.'
	},
	{
		module: 'domain_models',
		path: 'domain.type/domain.parameters',
		ui: 'Domain presets, parameter editor and advanced JSON',
		items:
			'tabular or longitudinal or relational data structure|number of tables|rows per table|table relationships and key definitions|hierarchical grouping variables|within-group variation|between-group variation|random intercept distributions|random slope distributions|repeated observations per entity|dependence between repeated observations|causal graph|structural equations|intervention definitions|counterfactual scenario definitions|time-to-event distribution|baseline hazard function|covariate effects on event risk|dropout and censoring mechanisms for survival data|spatial dimensionality|coordinate reference system|spatial clustering strength|graph node count|graph edge count|directed versus undirected edges|graph community structure|graph connectivity requirements|node and edge attributes|primary key uniqueness|foreign key validity|relationship cardinality|child records per parent distribution|cross-table statistical dependencies',
		note: 'Bounded parametric adapters: declared causal DAGs and shared-noise interventions; Weibull PH/independent censoring; Cartesian Gaussian clusters; Bernoulli/block graphs; one parent-child relation; Gaussian repeated-entity effects. No arbitrary graph degree targets, competing risks, geodesic/spatial kernels, or arbitrary relational DAG fitting.'
	},
	{
		module: 'validation_export',
		path: 'validation/result/export',
		ui: 'Validate and export',
		items:
			'constraint compliance checks|exact target verification|finite-sample variability allowances|marginal distribution validation|correlation preservation checks|quantile preservation checks|machine-readable validation report|summary statistics report|ground-truth parameter export|output file format|character encoding|null value representation|date and time serialization format|categorical encoding format|compression settings|maximum file size|memory budget|computation budget|generation time limit|retry and failure behavior|generation progress reporting|known limitations and unsupported parameter combinations',
		note: 'Integrity and achieved-versus-requested diagnostics; not all formal fidelity tests are implemented. Immutable CSV/ZIP output, manifest, checksums, opt-in truth and bounded expiring jobs.'
	}
];

// These items require more than the available base module, so do not overstate coverage.
const planned = new Set([
	'additive versus multiplicative noise',
	'event duration distribution',
	'correlation preservation checks',
	'quantile preservation checks',
	'computation budget',
	'warm-up period',
	'sampling frequency'
]);
const unsupported =
	/^(differential privacy|privacy budget accounting|membership inference evaluation|attribute inference evaluation|linkage risk evaluation|allowed disclosure risk|privacy protection unit|exact real-record copying checks|near-copy detection)/;
const rows = requirements.map((requirement, index) => {
	const group = groups.find((candidate) => candidate.items.split('|').includes(requirement));
	const customDistribution = [
		'custom probability density function',
		'custom probability mass function',
		'custom cumulative distribution function'
	].includes(requirement);
	const status = unsupported.test(requirement)
		? 'unsupported'
		: (group && !planned.has(requirement)) || customDistribution
			? 'implemented'
			: 'planned';
	return {
		id: `F${String(index + 1).padStart(3, '0')}`,
		requirement,
		status,
		module: group?.module ?? (customDistribution ? 'distributions' : 'advanced'),
		config_path:
			group?.path ??
			(customDistribution
				? 'variables[].distribution = custom_pdf/custom_pmf/custom_cdf; parameters numeric knots'
				: 'No implemented configuration contract'),
		ui_location:
			group?.ui ??
			(customDistribution
				? 'Variable distribution editor / JSON points'
				: 'Capability coverage / future module'),
		implementation:
			status === 'implemented'
				? 'synthetic_lab engine, models/distributions or bounded service'
				: 'Not available in this release',
		validation:
			status === 'implemented'
				? 'Module invariants and engine/service tests; reports name uncomputed checks explicitly'
				: 'Not evaluated',
		export_effect:
			status === 'implemented'
				? 'Configuration and applicable result metadata are retained in the ZIP bundle'
				: 'No effect; do not silently accept this as implemented',
		limitations:
			group?.note ??
			(customDistribution
				? 'Bounded numerical knots with validated mass, CDF monotonicity or piecewise-linear PDF; no arbitrary submitted executable code.'
				: 'Specialized modelling or validation requires a later adapter. Related base features do not imply support for this factor.')
	};
});
const target = new URL(
	'../services/synthetic-data-lab/synthetic_lab/factor_coverage.json',
	import.meta.url
);
await writeFile(target, JSON.stringify(rows, null, 2) + '\n');
console.log(`Recorded ${rows.length} original factors with explicit capability status.`);
