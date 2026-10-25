export type Cell = string | number | boolean | null;
export interface Variable {
	id: string;
	name: string;
	kind: 'numeric' | 'categorical' | 'id' | 'datetime' | 'derived' | 'text';
	distribution: string;
	parameters: Record<string, unknown>;
	role: string;
	decimals: number;
	missing: number;
	noise: number;
	expression?: string;
	truncate?: { lower: number; upper: number };
	clip?: { lower: number; upper: number };
}
export interface ExperimentConfig {
	[key: string]: unknown;
	version: 1;
	name: string;
	purpose?: string;
	rows: number;
	seed: number;
	replications: number;
	variables: Variable[];
	dependence: { mode: 'independent' | 'gaussian_copula'; columns: string[]; matrix: number[][] };
	outcome: {
		task: 'none' | 'regression' | 'classification';
		name: string;
		coefficients: Record<string, number>;
		intercept: number;
		noise: number;
		label_noise: number;
	};
	event: {
		enabled: boolean;
		process: 'renewal' | 'poisson' | 'nonhomogeneous';
		stop: 'count' | 'window';
		count: number;
		window: number;
		distribution: string;
		parameters: Record<string, unknown>;
		start: string;
		unit: string;
		duration: number;
		intensity_amplitude: number;
		period: number;
	};
	timeseries: {
		enabled: boolean;
		column: string;
		trend: number;
		seasonal_period: number;
		amplitude: number;
		ar: number;
	};
	quality: {
		missingness: 'mcar' | 'mar' | 'mnar';
		rate: number;
		driver?: string;
		outlier_rate: number;
		outlier_scale: number;
		duplicate_rate: number;
	};
	split: {
		mode: 'none' | 'random' | 'stratified' | 'temporal' | 'group';
		train: number;
		validation: number;
		group_column?: string;
	};
	domain?: { type: string; parameters: Record<string, unknown> };
	sampling?: { method: string; scramble?: boolean };
}
export interface DistributionParameter {
	name: string;
	label: string;
	default: unknown;
	min?: number;
	max?: number;
	step?: number;
	kind?: string;
	choices?: string[];
}
export interface DistributionDefinition {
	id: string;
	label: string;
	kind: string;
	parameters: DistributionParameter[];
	description: string;
	support?: string;
}
export interface Capabilities {
	distributions: DistributionDefinition[];
	modules: { id: string; label: string; status: string; description: string }[];
	execution_mode?: 'request_bound' | 'background';
	cancellation_mode?: 'request_abort' | 'job_cancel';
	factor_coverage?: {
		id: string;
		requirement: string;
		status: string;
		module: string;
		config_path: string;
		ui_location: string;
		implementation: string;
		validation: string;
		export_effect: string;
		limitations: string;
	}[];
}
export interface ColumnSummary {
	count: number;
	missing: number;
	mean?: number | null;
	std?: number | null;
	min?: number | null;
	max?: number | null;
	median?: number | null;
	q05?: number | null;
	q25?: number | null;
	q75?: number | null;
	q95?: number | null;
	skewness?: number | null;
	histogram?: { edges: number[]; counts: number[] };
	density?: { x: number; y: number }[];
	density_kind?: 'pmf' | 'pdf' | 'kde';
	density_note?: string;
	cdf?: { x: number; y: number }[];
	categories?: { label: string; count: number }[];
	theoretical?: Record<string, number | string | null>;
}
export interface ValidationCheck {
	name: string;
	status: 'pass' | 'fail' | 'warning' | 'not_evaluated';
	target?: unknown;
	actual?: unknown;
	message: string;
}
export interface GenerationResult {
	result_id: string;
	config_hash: string;
	config: ExperimentConfig;
	effective_config: ExperimentConfig;
	preview: boolean;
	row_count: number;
	requested_rows: number;
	columns: { name: string; type: string; role: string; units?: string }[];
	rows: Record<string, Cell>[];
	stats: Record<string, ColumnSummary>;
	correlation: { columns: string[]; matrix: (number | null)[][] };
	validation: ValidationCheck[];
	warnings: string[];
	engine_version: string;
	created_at?: string;
	tables?: Record<
		string,
		{
			columns: { name: string; type: string; role: string }[];
			rows: Record<string, Cell>[];
			row_count: number;
		}
	>;
	domain?: {
		type?: string;
		assumptions?: string[];
		kaplan_meier?: { time: number; survival: number }[];
		[key: string]: unknown;
	};
}
export interface GenerationJob {
	job_id: string;
	status: string;
	progress: number;
	stage: string;
	result_id?: string;
	result?: GenerationResult;
	error?: string;
}
