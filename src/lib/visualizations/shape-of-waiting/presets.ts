import type { Policy, Preset, Settings } from './types';

export const MODEL_VERSION = 'waiting-1';
export const POLICY_LABELS: Record<Policy, string> = {
	fifo: 'First come, first served',
	random: 'Random selection',
	priority: 'Non-preemptive priority',
	aging: 'Priority with ageing'
};
export const CLASS_LABELS = ['Priority 1', 'Priority 2', 'Priority 3'];
export const DEFAULT_SETTINGS: Settings = {
	scenario: 'bank',
	policy: 'fifo',
	seed: 1847,
	servers: 2,
	arrivalRate: 30,
	meanService: 5,
	variability: 0.8,
	window: 150,
	burst: false,
	batchSize: 1,
	batchDelay: 5,
	setupTime: 0,
	noShow: 0,
	patience: 0,
	priorityStrength: 1,
	agingMinutes: 20
};
const preset = (
	id: Preset['id'],
	label: string,
	description: string,
	simplification: string,
	settings: Partial<Settings>
): Preset => ({
	id,
	label,
	description,
	simplification,
	settings: { ...DEFAULT_SETTINGS, ...settings, scenario: id }
});
export const PRESETS: Preset[] = [
	preset(
		'bank',
		'Bank',
		'A shared queue, two counters, and an ordinary afternoon that is slightly too busy.',
		'Poisson arrivals, independent lognormal work durations, a shared queue and interchangeable staff. All priority classes have the same service distribution.',
		{}
	),
	preset(
		'clinic',
		'Clinic',
		'Appointments arrive on schedule. Some never arrive at all.',
		'Appointments are evenly spaced. A missed appointment releases its place immediately and consumes no staff capacity. Three synthetic priority classes; no clinical model.',
		{
			arrivalRate: 18,
			meanService: 8,
			servers: 2,
			noShow: 0.18,
			variability: 0.45,
			policy: 'aging'
		}
	),
	preset(
		'visa',
		'Visa office',
		'Files move in groups. The first arrival pays in patience for the batch to form.',
		'Each group enters service together. One server is occupied for setup plus the sum of each member’s work; all finish together. An undersized final group forms at its oldest member’s timeout.',
		{
			arrivalRate: 24,
			meanService: 3,
			servers: 2,
			batchSize: 5,
			batchDelay: 12,
			setupTime: 4,
			variability: 0.55
		}
	),
	preset(
		'railway',
		'Railway counter',
		'Quiet intervals give way to a trainload of people arriving together.',
		'Poisson arrival times are compressed into the first 18% of each half-hour when bursts are enabled. People share interchangeable counters.',
		{ arrivalRate: 40, meanService: 3, servers: 2, burst: true, variability: 0.65 }
	),
	preset(
		'call-centre',
		'Call centre',
		'The queue gets shorter when callers hang up. That is not the same as serving them.',
		'Callers receive independent lognormal patience, with the configured value as its expected duration. Patience expiry only applies while waiting.',
		{ arrivalRate: 38, meanService: 5, servers: 2, patience: 18, variability: 1.1 }
	),
	preset(
		'emergency',
		'Emergency department',
		'Urgent arrivals can move ahead. Everyone else keeps waiting.',
		'Three synthetic urgency levels, identical service distributions and non-preemptive service. An illustration of scheduling only; not clinical advice or measured hospital data.',
		{
			arrivalRate: 24,
			meanService: 7,
			servers: 2,
			policy: 'priority',
			variability: 1.2,
			priorityStrength: 2
		}
	),
	preset(
		'inbox',
		'Business inbox',
		'A new message takes a second to arrive. Answering it can take much longer.',
		'Messages are jobs and staff are interchangeable responders. All classes have the same work distribution. Time is compressed to an illustrative work session; no business data is used.',
		{ arrivalRate: 26, meanService: 6, servers: 2, variability: 1.8, window: 180 }
	)
];

/** Paired seed calibrated against the real engine; see the regression test. */
export const DEMO_SETTINGS: Settings = { ...DEFAULT_SETTINGS, seed: 1817, policy: 'priority' };
