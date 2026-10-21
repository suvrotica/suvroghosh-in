/** All durations are simulated minutes. Rates are arrivals per simulated hour. */
export type ScenarioId =
	| 'clinic'
	| 'bank'
	| 'visa'
	| 'railway'
	| 'call-centre'
	| 'emergency'
	| 'inbox';
export type Policy = 'fifo' | 'random' | 'priority' | 'aging';
export interface Settings {
	scenario: ScenarioId;
	policy: Policy;
	seed: number;
	servers: number;
	arrivalRate: number;
	meanService: number;
	variability: number;
	window: number;
	burst: boolean;
	batchSize: number;
	batchDelay: number;
	setupTime: number;
	noShow: number;
	patience: number;
	priorityStrength: number;
	agingMinutes: number;
}
export interface Preset {
	id: ScenarioId;
	label: string;
	description: string;
	simplification: string;
	settings: Settings;
}
/** Immutable identity-keyed demand. Patience zero means infinite patience. */
export interface DemandJob {
	id: number;
	arrival: number;
	service: number;
	classId: number;
	priority: number;
	patience: number;
	attends: boolean;
}
export interface Job extends DemandJob {
	start: number | null;
	end: number | null;
	abandonedAt: number | null;
	server: number | null;
	batch: number | null;
	overtaken: boolean;
}
export interface Run {
	settings: Settings;
	jobs: Job[];
	endTime: number;
	status: 'complete' | 'limit';
	limitReason: string | null;
	events: number;
	modelVersion: string;
}
export type JobState = 'waiting' | 'in-service' | 'completed' | 'abandoned';
export interface Person extends Job {
	state: JobState;
	wait: number;
}
export interface ClassSummary {
	classId: number;
	label: string;
	n: number;
	median: number | null;
	p90: number | null;
}
export interface Metrics {
	mean: number | null;
	median: number | null;
	p90: number | null;
	max: number | null;
	started: number;
	completed: number;
	waiting: number;
	active: number;
	abandoned: number;
	arrived: number;
	noShows: number;
	abandonmentRate: number;
	meanAbandonWait: number | null;
	oldestAge: number | null;
	overtakenRate: number;
	classes: ClassSummary[];
	classGap: number | null;
}
export interface Snapshot {
	time: number;
	people: Person[];
	waiting: Person[];
	active: Person[];
	metrics: Metrics;
	oldest: Person | null;
	final: boolean;
}
export interface Replay {
	version: string;
	settings: Settings;
	baseline: Settings | null;
	time: number;
}
