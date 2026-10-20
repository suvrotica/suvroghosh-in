export type ScenarioId = 'baseline' | 'haemoglobin' | 'flow' | 'demand';

export interface ElevatorState {
	progress: number;
	scenario: ScenarioId;
	control: number;
	selected: number;
	seed: number;
}

export interface FloorDefinition {
	id: string;
	name: string;
	question: string;
	verb: string;
	extent: string;
	metres: number;
	context: 'physical' | 'anatomical' | 'organisational';
	quantity: string;
	unit: string;
	denominator: string;
	interval: string;
	support: string;
	basis: string;
	takeaway: string;
	description: string;
	transition: string;
	controlLabel: string;
	controlUnit: string;
	lowLabel: string;
	highLabel: string;
}

export interface OxygenModel {
	occupancy: number;
	boundSites: number;
	gradient: number;
	flux: number;
	uptake: number;
	perfusion: number;
	saturation: number;
	haemoglobin: number;
	partialPressure: number;
	content: number;
	cardiacOutput: number;
	delivery: number;
	regionalDelivery: number[];
	regionalDemand: number[];
	bedDemands: number[];
	wardDemands: number[];
	wardAllocated: number[];
	wardCapacities: number[];
	hospitalDemand: number;
	hospitalCapacity: number;
	hospitalAllocated: number;
	unmet: number;
	cityDemand: number;
	citySupply: number;
	stock: number;
	reserveHours: number | null;
	trace: { minute: number; saturation: number; quality: number }[];
}

export interface Measurement {
	label: string;
	value: number | null;
	unit: string;
	precision: number;
}

export interface FloorReading {
	primary: Measurement;
	secondary: Measurement[];
	insight: string;
	effect: string;
}

export interface RenderState extends ElevatorState {
	time: number;
	model: OxygenModel;
}

export interface ElevatorRenderer {
	update(state: RenderState): void;
	dispose(): void;
}
