import { CLASS_LABELS, DEFAULT_SETTINGS, MODEL_VERSION, PRESETS } from './presets';
import type { DemandJob, Job, Metrics, Person, Policy, Run, Settings, Snapshot } from './types';

export const MAX_JOBS = 2000;
export const MAX_TIME = 10000;
export const MAX_EVENTS = 100000;
const POLICIES: Policy[] = ['fifo', 'random', 'priority', 'aging'];
const finite = (value: unknown, fallback: number, min: number, max: number) =>
	typeof value === 'number' && Number.isFinite(value)
		? Math.min(max, Math.max(min, value))
		: fallback;

/** Clamp all decoded/UI configuration before allocating or computing anything. */
export function normalizeSettings(input: Partial<Settings> = {}): Settings {
	const d = DEFAULT_SETTINGS;
	return {
		scenario: PRESETS.some((p) => p.id === input.scenario) ? input.scenario! : d.scenario,
		policy: POLICIES.includes(input.policy!) ? input.policy! : d.policy,
		seed: Math.round(finite(input.seed, d.seed, 0, 2147483647)),
		servers: Math.round(finite(input.servers, d.servers, 1, 8)),
		arrivalRate: finite(input.arrivalRate, d.arrivalRate, 1, 240),
		meanService: finite(input.meanService, d.meanService, 0.1, 120),
		variability: finite(input.variability, d.variability, 0, 3),
		window: finite(input.window, d.window, 10, 360),
		burst: typeof input.burst === 'boolean' ? input.burst : d.burst,
		batchSize: Math.round(finite(input.batchSize, d.batchSize, 1, 12)),
		batchDelay: finite(input.batchDelay, d.batchDelay, 0, 60),
		setupTime: finite(input.setupTime, d.setupTime, 0, 30),
		noShow: finite(input.noShow, d.noShow, 0, 0.8),
		patience: finite(input.patience, d.patience, 0, 240),
		priorityStrength: finite(input.priorityStrength, d.priorityStrength, 0, 5),
		agingMinutes: finite(input.agingMinutes, d.agingMinutes, 1, 120)
	};
}

/** A draw depends only on identity and stream, never on scheduling decisions. */
function random(seed: number, id: number, stream: number): number {
	let x = (seed ^ Math.imul(id + 1, 0x9e3779b9) ^ Math.imul(stream + 1, 0x85ebca6b)) >>> 0;
	x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
	x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
	x ^= x >>> 16;
	return ((x >>> 0) + 0.5) / 4294967296;
}
function lognormal(mean: number, cv: number, seed: number, id: number, stream: number): number {
	if (cv === 0) return mean;
	const sigma = Math.sqrt(Math.log(1 + cv * cv));
	const z =
		Math.sqrt(-2 * Math.log(random(seed, id, stream))) *
		Math.cos(2 * Math.PI * random(seed, id, stream + 1));
	return mean * Math.exp(sigma * z - (sigma * sigma) / 2);
}

export function generateDemand(input: Settings): DemandJob[] {
	const settings = normalizeSettings(input);
	const jobs: DemandJob[] = [];
	let arrival = 0;
	for (let id = 0; id <= MAX_JOBS; id++) {
		arrival +=
			settings.scenario === 'clinic'
				? 60 / settings.arrivalRate
				: (-Math.log(random(settings.seed, id, 0)) * 60) / settings.arrivalRate;
		if (arrival > settings.window) break;
		const actualArrival = settings.burst
			? Math.floor(arrival / 30) * 30 + (arrival % 30) * 0.18
			: arrival;
		const classDraw = random(settings.seed, id, 5);
		const classId = classDraw < 0.12 ? 0 : classDraw < 0.4 ? 1 : 2;
		jobs.push({
			id,
			arrival: actualArrival,
			service: lognormal(settings.meanService, settings.variability, settings.seed, id, 1),
			classId,
			priority: classId,
			patience:
				settings.patience === 0 ? 0 : lognormal(settings.patience, 0.5, settings.seed, id, 6),
			attends: settings.scenario !== 'clinic' || random(settings.seed, id, 4) >= settings.noShow
		});
	}
	return jobs;
}

type EventKind = 'complete' | 'arrival' | 'batch' | 'dispatch' | 'patience';
type Event = {
	time: number;
	kind: EventKind;
	order: number;
	job?: number;
	server?: number;
	members?: number[];
};
const PRECEDENCE: Record<EventKind, number> = {
	complete: 0,
	arrival: 1,
	batch: 2,
	dispatch: 3,
	patience: 4
};
function before(a: Event, b: Event) {
	return a.time - b.time || PRECEDENCE[a.kind] - PRECEDENCE[b.kind] || a.order - b.order;
}
class EventHeap {
	items: Event[] = [];
	push(event: Event) {
		const a = this.items;
		a.push(event);
		let i = a.length - 1;
		while (i > 0) {
			const parent = (i - 1) >>> 1;
			if (before(a[parent], event) <= 0) break;
			a[i] = a[parent];
			i = parent;
		}
		a[i] = event;
	}
	pop(): Event | undefined {
		const a = this.items,
			first = a[0],
			last = a.pop();
		if (!a.length || !last) return first;
		let i = 0;
		while (i * 2 + 1 < a.length) {
			let child = i * 2 + 1;
			if (child + 1 < a.length && before(a[child + 1], a[child]) < 0) child++;
			if (before(last, a[child]) <= 0) break;
			a[i] = a[child];
			i = child;
		}
		a[i] = last;
		return first;
	}
}

function queueScore(job: Job, settings: Settings, time: number, dispatch: number) {
	if (settings.policy === 'random') return random(settings.seed, job.id, 100 + dispatch);
	if (settings.policy === 'priority') return job.priority * settings.priorityStrength;
	if (settings.policy === 'aging')
		return job.priority * settings.priorityStrength - (time - job.arrival) / settings.agingMinutes;
	return 0;
}
export function orderWaiting(jobs: Job[], settings: Settings, time: number, dispatch = 0): Job[] {
	return [...jobs].sort(
		(a, b) =>
			queueScore(a, settings, time, dispatch) - queueScore(b, settings, time, dispatch) ||
			a.arrival - b.arrival ||
			a.id - b.id
	);
}

/** Complete a finite arrivals window, then drain. A worker owns this bounded operation. */
export function simulate(input: Settings, demandOverride?: DemandJob[]): Run {
	const settings = normalizeSettings(input);
	const demand = demandOverride ?? generateDemand(settings);
	const capped = demand.length > MAX_JOBS;
	const jobs: Job[] = demand.slice(0, MAX_JOBS).map((d) => ({
		...d,
		start: null,
		end: null,
		abandonedAt: null,
		server: null,
		batch: null,
		overtaken: false
	}));
	const heap = new EventHeap();
	let order = 0,
		time = 0,
		events = 0,
		dispatchCount = 0,
		batchCount = 0;
	const push = (event: Omit<Event, 'order'>) => heap.push({ ...event, order: order++ });
	const servers: boolean[] = Array(settings.servers).fill(false);
	const waiting = new Set<number>();
	const dispatchAt = new Set<number>();
	const wakeAt = new Set<number>();
	const requestDispatch = (at: number) => {
		if (!dispatchAt.has(at)) {
			dispatchAt.add(at);
			push({ time: at, kind: 'dispatch' });
		}
	};
	for (let index = 0; index < jobs.length; index++)
		push({ time: jobs[index].arrival, kind: 'arrival', job: index });
	let limitReason: string | null = capped
		? 'The 2,000-person demand limit was reached; this is a truncated arrival cohort.'
		: null;
	while (heap.items.length) {
		const event = heap.pop()!;
		// A cancelled patience clock is not part of the realised session horizon.
		if (event.kind === 'patience' && !waiting.has(event.job!)) continue;
		if (event.kind === 'batch' && !waiting.size) continue;
		if (event.time > MAX_TIME || events >= MAX_EVENTS) {
			limitReason =
				event.time > MAX_TIME
					? 'The 10,000-minute horizon was reached before the cohort finished.'
					: 'The 100,000-event safety limit was reached.';
			time = Math.min(MAX_TIME, event.time);
			break;
		}
		time = event.time;
		events++;
		if (event.kind === 'arrival') {
			const job = jobs[event.job!];
			if (!job.attends) continue;
			waiting.add(event.job!);
			if (job.patience > 0) push({ time: time + job.patience, kind: 'patience', job: event.job });
			requestDispatch(time);
		} else if (event.kind === 'complete') {
			servers[event.server!] = false;
			requestDispatch(time);
		} else if (event.kind === 'patience') {
			if (waiting.delete(event.job!)) {
				jobs[event.job!].abandonedAt = time;
				requestDispatch(time);
			}
		} else if (event.kind === 'batch') {
			wakeAt.delete(time);
			requestDispatch(time);
		} else {
			dispatchAt.delete(time);
			for (let server = 0; server < servers.length && waiting.size; server++) {
				if (servers[server]) continue;
				const indices = [...waiting];
				const oldestArrival = Math.min(...indices.map((i) => jobs[i].arrival));
				const deadline = oldestArrival + settings.batchDelay;
				if (settings.batchSize > 1 && indices.length < settings.batchSize && time < deadline) {
					if (!wakeAt.has(deadline)) {
						wakeAt.add(deadline);
						push({ time: deadline, kind: 'batch' });
					}
					break;
				}
				const chosen = orderWaiting(
					indices.map((i) => jobs[i]),
					settings,
					time,
					dispatchCount++
				).slice(0, settings.batchSize);
				const end = time + settings.setupTime + chosen.reduce((sum, job) => sum + job.service, 0);
				const batch = batchCount++;
				for (const job of chosen) {
					job.overtaken = jobs.some(
						(other) => other.arrival > job.arrival && other.start !== null && other.start < time
					);
					job.start = time;
					job.end = end;
					job.server = server;
					job.batch = batch;
					waiting.delete(jobs.indexOf(job));
				}
				servers[server] = true;
				push({ time: end, kind: 'complete', server });
			}
		}
	}
	const resolvedAt = Math.max(
		settings.window,
		...jobs.map((j) => Math.max(j.end ?? 0, j.abandonedAt ?? 0))
	);
	return {
		settings,
		jobs,
		endTime: limitReason ? Math.min(MAX_TIME, time) : resolvedAt,
		status: limitReason ? 'limit' : 'complete',
		limitReason,
		events,
		modelVersion: MODEL_VERSION
	};
}

/** Hyndman–Fan type 7: linear interpolation at (n−1)p. */
export function quantile(values: number[], p: number): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b),
		rank = (sorted.length - 1) * Math.min(1, Math.max(0, p));
	const low = Math.floor(rank),
		fraction = rank - low;
	return sorted[low] + (sorted[Math.ceil(rank)] - sorted[low]) * fraction;
}
export function snapshotAt(run: Run, requestedTime: number): Snapshot {
	const time = Math.min(
		run.endTime,
		Math.max(0, Number.isFinite(requestedTime) ? requestedTime : 0)
	);
	const people: Person[] = run.jobs
		.filter((job) => job.attends && job.arrival <= time)
		.map((job) => {
			const state =
				job.abandonedAt !== null && job.abandonedAt <= time
					? 'abandoned'
					: job.start !== null && job.start <= time
						? job.end! <= time
							? 'completed'
							: 'in-service'
						: 'waiting';
			const wait =
				state === 'abandoned'
					? job.abandonedAt! - job.arrival
					: state === 'waiting'
						? time - job.arrival
						: job.start! - job.arrival;
			return { ...job, state, wait };
		});
	const waiting = orderWaiting(
		people.filter((p) => p.state === 'waiting'),
		run.settings,
		time
	) as Person[];
	const active = people.filter((p) => p.state === 'in-service');
	const started = people.filter((p) => p.state === 'in-service' || p.state === 'completed');
	const abandoned = people.filter((p) => p.state === 'abandoned');
	const waits = started.map((p) => p.wait);
	const classes = CLASS_LABELS.map((label, classId) => {
		const sample = started.filter((p) => p.classId === classId).map((p) => p.wait);
		return {
			classId,
			label,
			n: sample.length,
			median: quantile(sample, 0.5),
			p90: quantile(sample, 0.9)
		};
	});
	const tails = classes.map((c) => c.p90).filter((v): v is number => v !== null);
	const oldest = waiting.length ? waiting.reduce((a, b) => (a.arrival <= b.arrival ? a : b)) : null;
	const metrics: Metrics = {
		mean: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null,
		median: quantile(waits, 0.5),
		p90: quantile(waits, 0.9),
		max: waits.length ? Math.max(...waits) : null,
		started: started.length,
		completed: started.length - active.length,
		waiting: waiting.length,
		active: active.length,
		abandoned: abandoned.length,
		arrived: people.length,
		noShows: run.jobs.filter((j) => !j.attends && j.arrival <= time).length,
		abandonmentRate: people.length ? abandoned.length / people.length : 0,
		meanAbandonWait: abandoned.length
			? abandoned.reduce((sum, p) => sum + p.wait, 0) / abandoned.length
			: null,
		oldestAge: oldest?.wait ?? null,
		overtakenRate: started.length ? started.filter((p) => p.overtaken).length / started.length : 0,
		classes,
		classGap: tails.length > 1 ? Math.max(...tails) - Math.min(...tails) : null
	};
	return {
		time,
		people,
		waiting,
		active,
		metrics,
		oldest,
		final: time >= run.endTime && run.status === 'complete'
	};
}
