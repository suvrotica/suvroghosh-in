export const MODEL_VERSION = 'missing-score-1';
export type ScenarioId =
	| 'mcar'
	| 'mar'
	| 'mnar'
	| 'dropout'
	| 'variables'
	| 'instrument'
	| 'nonresponse';
export type ViewId = 'variables' | 'time';
export type ImputationId = 'none' | 'mean' | 'predictive';
export type OrderingId = 'original' | 'missing' | 'driver' | 'dropout';
export interface Settings {
	seed: number;
	scenario: ScenarioId;
	view: ViewId;
	rate: number;
	strength: number;
	imputation: ImputationId;
	draw: number;
	delta: number;
	ordering: OrderingId;
	reveal: boolean;
}
export interface Scenario {
	id: ScenarioId;
	label: string;
	short: string;
	mechanism: string;
	story: string;
	rule: string;
	look: string;
	view: ViewId;
}
export interface Dataset {
	seed: number;
	view: ViewId;
	rows: number;
	cols: number;
	truth: Float64Array;
	driver: Float64Array;
	groups: Uint8Array;
	uniforms: Float64Array;
	columns: string[];
	unit: string;
}
export interface ObservedData {
	rows: number;
	cols: number;
	values: Float64Array;
	mask: Uint8Array;
	driver: Float64Array;
}
export interface Completion {
	values: Float64Array;
	spread: Float64Array;
	method: ImputationId;
	unestimable: number[];
}
export interface Estimate {
	mean: number | null;
	sd: number | null;
	n: number;
}
export interface Summary {
	missing: number;
	rate: number;
	completeCases: number;
	rowMissing: number[];
	columnMissing: number[];
	patterns: { pattern: string; count: number }[];
	coMissing: number[][];
}
export interface Experiment {
	settings: Settings;
	data: Dataset;
	observed: ObservedData;
	completion: Completion;
	summary: Summary;
	order: number[];
}
export interface MatrixFrame {
	experiment: Experiment;
	reveal: boolean;
	selectedRow: number;
	selectedColumn: number;
	playhead: number;
}
