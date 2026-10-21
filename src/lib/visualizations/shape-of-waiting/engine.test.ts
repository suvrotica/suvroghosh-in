import { describe, expect, it } from 'vitest';
import {
	generateDemand,
	MAX_TIME,
	normalizeSettings,
	quantile,
	simulate,
	snapshotAt
} from './engine';
import { DEFAULT_SETTINGS, DEMO_SETTINGS, MODEL_VERSION, PRESETS } from './presets';
import { decodeReplay, encodeReplay } from './serialization';
import type { DemandJob, Settings } from './types';

const settings = (overrides: Partial<Settings> = {}): Settings => ({
	...DEFAULT_SETTINGS,
	...overrides
});
const job = (id: number, overrides: Partial<DemandJob> = {}): DemandJob => ({
	id,
	arrival: 0,
	service: 2,
	classId: 1,
	priority: 1,
	patience: 0,
	attends: true,
	...overrides
});
const waits = (run: ReturnType<typeof simulate>) =>
	run.jobs.map((j) => (j.start === null ? null : j.start - j.arrival));
const final = (run: ReturnType<typeof simulate>) => snapshotAt(run, run.endTime);
const demandFields = (j: DemandJob): DemandJob => ({
	id: j.id,
	arrival: j.arrival,
	service: j.service,
	classId: j.classId,
	priority: j.priority,
	patience: j.patience,
	attends: j.attends
});

describe('event ordering and cohort conservation', () => {
	it('matches hand-calculated one- and two-server queues', () => {
		const demand = [job(0), job(1), job(2)];
		expect(waits(simulate(settings({ servers: 1 }), demand))).toEqual([0, 2, 4]);
		expect(waits(simulate(settings({ servers: 2 }), demand))).toEqual([0, 0, 2]);
	});
	it('makes availability at the exact patience deadline win', () => {
		const run = simulate(settings({ servers: 1 }), [job(0), job(1, { patience: 2 })]);
		expect(run.jobs[1].start).toBe(2);
		expect(run.jobs[1].abandonedAt).toBeNull();
	});
	it('processes all simultaneous arrivals before choosing priority', () => {
		const run = simulate(settings({ servers: 1, policy: 'priority' }), [
			job(0, { priority: 2 }),
			job(1, { priority: 0 })
		]);
		expect(waits(run)).toEqual([2, 0]);
	});
	it('never starts an abandoned person and accounts for every attended arrival', () => {
		const run = simulate(settings({ servers: 1 }), [
			job(0, { service: 10 }),
			job(1, { patience: 1 }),
			job(2, { patience: 2 })
		]);
		expect(run.jobs[1].start).toBeNull();
		expect(run.jobs[2].start).toBeNull();
		for (const time of [0, 1, 2, 4, run.endTime]) {
			const m = snapshotAt(run, time).metrics;
			expect(m.waiting + m.active + m.completed + m.abandoned).toBe(m.arrived);
		}
		expect(final(run).metrics.abandonmentRate).toBeCloseTo(2 / 3);
		expect(final(run).metrics.meanAbandonWait).toBe(1.5);
	});
	it('keeps no-shows outside joined demand and releases their slots', () => {
		const run = simulate(settings({ servers: 1, scenario: 'clinic' }), [
			job(0, { attends: false }),
			job(1)
		]);
		expect(run.jobs[1].start).toBe(0);
		expect(final(run).metrics).toMatchObject({ noShows: 1, arrived: 1, started: 1, abandoned: 0 });
		expect(run.jobs[0].start).toBeNull();
	});
	it('uses stable tie-breakers and repeats exact runs', () => {
		for (const policy of ['fifo', 'priority', 'aging', 'random'] as const) {
			expect(simulate(settings({ policy }))).toEqual(simulate(settings({ policy })));
		}
	});
	it('stops at the explicit horizon without inventing completed service', () => {
		const run = simulate(settings({ servers: 1 }), [job(0, { service: MAX_TIME + 1 }), job(1)]);
		expect(run.status).toBe('limit');
		expect(run.endTime).toBe(MAX_TIME);
		expect(final(run).metrics).toMatchObject({ active: 1, waiting: 1, completed: 0 });
		expect(final(run).final).toBe(false);
	});
	it('does not extend a finished session for cancelled patience clocks', () => {
		const run = simulate(settings({ servers: 1 }), [job(0, { patience: MAX_TIME * 2 })]);
		expect(run.status).toBe('complete');
		expect(run.endTime).toBe(DEFAULT_SETTINGS.window);
	});
});

describe('queue policies and batches', () => {
	it('applies non-preemptive priority and reports overtaking', () => {
		const run = simulate(settings({ servers: 1, policy: 'priority' }), [
			job(0, { service: 10 }),
			job(1, { arrival: 1, priority: 2 }),
			job(2, { arrival: 2, priority: 0 })
		]);
		expect(run.jobs.map((j) => j.start)).toEqual([0, 12, 10]);
		expect(run.jobs[1].overtaken).toBe(true);
		expect(final(run).metrics.overtakenRate).toBeCloseTo(1 / 3);
	});
	it('lets an old low-priority person move ahead through ageing', () => {
		const demand = [
			job(0, { service: 20 }),
			job(1, { arrival: 1, priority: 2 }),
			job(2, { arrival: 19, priority: 0 })
		];
		const priority = simulate(settings({ servers: 1, policy: 'priority' }), demand);
		const aging = simulate(settings({ servers: 1, policy: 'aging', agingMinutes: 5 }), demand);
		expect(priority.jobs[2].start).toBe(20);
		expect(aging.jobs[1].start).toBe(20);
	});
	it('charges setup and all member work to one occupied server', () => {
		const run = simulate(settings({ servers: 1, batchSize: 2, batchDelay: 5, setupTime: 1 }), [
			job(0),
			job(1),
			job(2)
		]);
		expect(run.jobs.map((j) => [j.start, j.end])).toEqual([
			[0, 5],
			[0, 5],
			[5, 8]
		]);
		expect(run.jobs[0].batch).toBe(run.jobs[1].batch);
	});
	it('times out and serves an undersized final batch', () => {
		const run = simulate(settings({ servers: 1, batchSize: 3, batchDelay: 5, setupTime: 1 }), [
			job(0),
			job(1)
		]);
		expect(run.jobs.map((j) => [j.start, j.end])).toEqual([
			[5, 10],
			[5, 10]
		]);
	});
	it('removes abandoned batch candidates before forming the group', () => {
		const run = simulate(settings({ servers: 1, batchSize: 3, batchDelay: 5 }), [
			job(0, { patience: 2 }),
			job(1)
		]);
		expect(run.jobs[0].abandonedAt).toBe(2);
		expect(run.jobs[0].start).toBeNull();
		expect(run.jobs[1].start).toBe(5);
	});
});

describe('distributions, unresolved waits and comparisons', () => {
	it('uses type-7 quantiles and null for empty samples', () => {
		expect(quantile([], 0.9)).toBeNull();
		expect(quantile([4, 0, 2], 0.5)).toBe(2);
		expect(quantile([4, 0, 2], 0.9)).toBeCloseTo(3.6);
		expect(quantile([7], 0.9)).toBe(7);
	});
	it('keeps current ages separate from realized waiting statistics', () => {
		const run = simulate(settings({ servers: 1 }), [job(0, { service: 20 }), job(1)]);
		const s = snapshotAt(run, 12);
		expect(s.metrics).toMatchObject({ mean: 0, p90: 0, started: 1, waiting: 1, oldestAge: 12 });
		expect(s.oldest?.id).toBe(1);
		expect(snapshotAt(run, -1).metrics.mean).toBe(0);
		expect(snapshotAt(simulate(settings(), [job(0, { arrival: 5 })]), 0).metrics.mean).toBeNull();
	});
	it('preserves exogenous demand across every scheduling choice', () => {
		const base = generateDemand(settings({ scenario: 'clinic', noShow: 0.2, patience: 20 }));
		const changed = generateDemand(
			settings({
				scenario: 'clinic',
				noShow: 0.2,
				patience: 20,
				policy: 'random',
				servers: 5,
				batchSize: 7,
				batchDelay: 20,
				priorityStrength: 4
			})
		);
		expect(changed).toEqual(base);
	});
	it('preserves arrivals and classes while changing service variability', () => {
		const a = generateDemand(settings({ variability: 0 }));
		const b = generateDemand(settings({ variability: 2 }));
		const otherDemand = ({ id, arrival, classId, priority, patience, attends }: DemandJob) => ({
			id,
			arrival,
			classId,
			priority,
			patience,
			attends
		});
		expect(a.map(otherDemand)).toEqual(b.map(otherDemand));
		expect(a.every((j) => j.service === DEFAULT_SETTINGS.meanService)).toBe(true);
		expect(b.every((j) => j.service > 0)).toBe(true);
	});
	it('keeps snapshots independent of playback speed and previous snapshot order', () => {
		const run = simulate(settings());
		const expected = snapshotAt(run, 60);
		for (let time = 0; time < 100; time += 0.5) snapshotAt(run, time);
		expect(snapshotAt(run, 60)).toEqual(expected);
		expect(final(run).metrics.waiting).toBe(0);
	});
	it('demonstrates a lower closed-cohort mean with a worse p90 and maximum', () => {
		const fifo = simulate({ ...DEMO_SETTINGS, policy: 'fifo' });
		const priority = simulate(DEMO_SETTINGS);
		const a = final(fifo).metrics,
			b = final(priority).metrics;
		expect(fifo.status).toBe('complete');
		expect(priority.status).toBe('complete');
		expect(a.started).toBe(69);
		expect(b.started).toBe(a.started);
		expect(b.abandoned).toBe(0);
		expect(b.mean!).toBeLessThan(a.mean! * 0.92);
		expect(b.p90!).toBeGreaterThan(a.p90! * 1.3);
		expect(b.max!).toBeGreaterThan(a.max! * 1.5);
		expect(priority.jobs.map(demandFields)).toEqual(fifo.jobs.map(demandFields));
	});
});

describe('bounded replay', () => {
	it('round-trips settings, paired baseline and horizon into identical snapshots', () => {
		const replay = {
			version: MODEL_VERSION,
			settings: DEMO_SETTINGS,
			baseline: { ...DEMO_SETTINGS, policy: 'fifo' as const },
			time: 120
		};
		const restored = decodeReplay(encodeReplay(replay));
		expect(restored).toEqual(replay);
		expect(snapshotAt(simulate(restored!.settings), restored!.time)).toEqual(
			snapshotAt(simulate(replay.settings), replay.time)
		);
	});
	it('rejects unknown versions, oversized state, malformed values and out-of-bound settings', () => {
		const valid = { version: MODEL_VERSION, settings: DEFAULT_SETTINGS, baseline: null, time: 60 };
		for (const raw of [
			'{',
			'x'.repeat(6001),
			'%',
			JSON.stringify({ ...valid, version: 'future' }),
			JSON.stringify({ ...valid, time: -1 }),
			JSON.stringify({ ...valid, settings: { ...DEFAULT_SETTINGS, servers: 99999 } })
		])
			expect(decodeReplay(raw)).toBeNull();
		expect(
			normalizeSettings({ servers: Infinity, arrivalRate: -100, variability: 999 })
		).toMatchObject({ servers: 2, arrivalRate: 1, variability: 3 });
	});
	it('provides seven different coherent presets', () => {
		expect(PRESETS).toHaveLength(7);
		expect(new Set(PRESETS.map((p) => JSON.stringify(p.settings))).size).toBe(7);
		for (const preset of PRESETS) expect(simulate(preset.settings).jobs.length).toBeGreaterThan(0);
	});
});
