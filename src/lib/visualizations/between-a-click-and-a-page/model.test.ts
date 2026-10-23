import { describe, expect, it } from 'vitest';
import {
	ASSUMPTIONS,
	createJourney,
	DEFAULT_INPUT,
	normaliseInput,
	sampleJourney,
	type Journey,
	type JourneyInput
} from './model';

const stage = (journey: Journey, id: string) => journey.stages.find((entry) => entry.id === id)!;

describe('one HTTP request teaching model', () => {
	it('gives a fresh HTTPS visit separate address, TCP, TLS, request, work and response phases', () => {
		const journey = createJourney();
		expect(journey.stages.map((entry) => entry.id)).toEqual([
			'dns',
			'tcp',
			'tls',
			'request',
			'server',
			'response',
			'resources',
			'complete'
		]);
		expect(stage(journey, 'request').startMs).toBe(360);
		expect(stage(journey, 'server').startMs).toBe(420);
		expect(stage(journey, 'response').startMs).toBe(500);
		expect(stage(journey, 'response').endMs).toBe(640);
		expect(journey.totalMs).toBe(872);
		expect(sampleJourney(journey, 359).stage.id).toBe('tls');
		expect(sampleJourney(journey, 360).stage.id).toBe('request');
		expect(sampleJourney(journey, 420).stage.id).toBe('server');
	});

	it('reuses address and established connection state without making server work faster', () => {
		const fresh = createJourney();
		const reused = createJourney({ connection: 'reused' });
		expect(reused.totalMs).toBe(fresh.totalMs - 3 * DEFAULT_INPUT.rttMs);
		for (const id of ['dns', 'tcp', 'tls']) {
			expect(stage(reused, id).skipped).toBe(true);
			expect(stage(reused, id).endMs - stage(reused, id).startMs).toBe(0);
		}
		expect(sampleJourney(reused, 0).stage.id).toBe('request');
		expect(reused.accounting.serverWorkMs).toBe(fresh.accounting.serverWorkMs);
		expect(reused.accounting.resourceNetworkMs).toBe(fresh.accounting.resourceNetworkMs);
		expect(reused.accounting.responseSerializationMs).toBe(
			fresh.accounting.responseSerializationMs
		);
	});

	it('a fresh local cache bypasses every network and origin phase, including a selected loss', () => {
		const cached = createJourney({ cache: 'fresh', lostSegment: true, serverMs: 1500, rttMs: 600 });
		expect(cached.segments).toEqual([]);
		expect(cached.totalMs).toBe(ASSUMPTIONS.browserAssemblyMs);
		expect(sampleJourney(cached, 0).stage.id).toBe('resources');
		expect(sampleJourney(cached, cached.totalMs / 2)).toMatchObject({
			pageProgress: 0.5,
			deliveredBytes: 0,
			bufferedBytes: 0,
			nextExpectedByte: 0,
			source: 'browser-cache'
		});
		for (const [key, value] of Object.entries(cached.accounting))
			if (key !== 'totalMs' && key !== 'browserAssemblyMs') expect(value).toBe(0);
		expect(sampleJourney(cached, cached.totalMs).pageProgress).toBe(1);
	});

	it('holds later byte ranges until the gap is repaired and then releases each byte once', () => {
		const journey = createJourney({ lostSegment: true });
		const [first, missing, third, fourth] = journey.segments;
		expect(missing.retransmitMs).not.toBeNull();
		expect(missing.arrivalMs).toBeGreaterThan(fourth.arrivalMs);
		const afterFirst = sampleJourney(journey, first.arrivalMs);
		expect(afterFirst.deliveredBytes).toBe(1200);
		expect(afterFirst.nextExpectedByte).toBe(1200);
		const afterThird = sampleJourney(journey, third.arrivalMs);
		expect(afterThird.deliveredBytes).toBe(1200);
		expect(afterThird.bufferedBytes).toBe(1200);
		expect(afterThird.nextExpectedByte).toBe(1200);
		expect(afterThird.segments[2].state).toBe('buffered');
		const beforeRepair = sampleJourney(journey, missing.arrivalMs - 0.001);
		expect(beforeRepair.deliveredBytes).toBe(1200);
		expect(beforeRepair.bufferedBytes).toBe(2400);
		expect(beforeRepair.nextExpectedByte).toBe(1200);
		const repaired = sampleJourney(journey, missing.arrivalMs);
		expect(repaired.deliveredBytes).toBe(4800);
		expect(repaired.bufferedBytes).toBe(0);
		expect(repaired.nextExpectedByte).toBe(4800);
		expect(repaired.segments.every((segment) => segment.state === 'delivered')).toBe(true);
		expect(sampleJourney(journey, journey.totalMs).deliveredBytes).toBe(4800);
	});

	it('shows original loss, waiting, retry and arrival as distinct states on the same byte range', () => {
		const journey = createJourney({ lostSegment: true });
		const missing = journey.segments[1];
		const sampleState = (time: number) => sampleJourney(journey, time).segments[1];
		expect(sampleState(missing.sendMs - 0.001).state).toBe('waiting');
		expect(sampleState(missing.sendMs).state).toBe('travelling');
		expect(sampleState(missing.lostAtMs!).state).toBe('lost');
		expect(sampleState(missing.retransmitMs! - 0.001).state).toBe('lost');
		expect(sampleState(missing.retransmitMs!).state).toBe('retransmitting');
		expect(sampleState(missing.retransmitMs!).travelProgress).toBe(0);
		expect(sampleState(missing.arrivalMs).state).toBe('delivered');
		expect(sampleState(missing.arrivalMs).firstByte).toBe(1200);
		expect(sampleState(missing.arrivalMs).endByte).toBe(2400);
		expect(journey.segments).toHaveLength(4);
	});

	it('increasing server work changes only server time and the downstream schedule', () => {
		const fast = createJourney({ serverMs: 40 });
		const busy = createJourney({ serverMs: 740 });
		expect(busy.totalMs - fast.totalMs).toBe(700);
		for (const id of ['dns', 'tcp', 'tls', 'request'])
			expect(stage(busy, id)).toEqual(stage(fast, id));
		expect(stage(busy, 'server').startMs).toBe(stage(fast, 'server').startMs);
		expect(stage(busy, 'response').startMs - stage(fast, 'response').startMs).toBe(700);
		expect(busy.accounting.requestTransitMs).toBe(fast.accounting.requestTransitMs);
		expect(busy.accounting.responseTransitMs).toBe(fast.accounting.responseTransitMs);
		expect(busy.accounting.lossRecoveryMs).toBe(fast.accounting.lossRecoveryMs);
	});

	it('network delay affects travel and handshakes while preserving server and serialization costs', () => {
		const near = createJourney({ rttMs: 20 });
		const far = createJourney({ rttMs: 220 });
		// DNS + TCP + TLS + first request/response + follow-up request/response.
		expect(far.totalMs - near.totalMs).toBe(5 * 200);
		expect(far.accounting.serverWorkMs).toBe(near.accounting.serverWorkMs);
		expect(far.accounting.responseSerializationMs).toBe(near.accounting.responseSerializationMs);
		expect(far.accounting.resourceSerializationMs).toBe(near.accounting.resourceSerializationMs);
	});

	it('has exact non-negative accounting and monotonic receiver state across all controls', () => {
		for (const rttMs of [20, 121, 600]) {
			for (const connection of ['fresh', 'reused'] as const) {
				for (const lostSegment of [false, true]) {
					for (const serverMs of [0, 80, 1500]) {
						for (const cache of ['origin', 'fresh'] as const) {
							const journey = createJourney({ rttMs, connection, lostSegment, serverMs, cache });
							const entries = Object.entries(journey.accounting).filter(
								([key]) => key !== 'totalMs'
							);
							expect(entries.every(([, value]) => value >= 0 && Number.isFinite(value))).toBe(true);
							expect(entries.reduce((sum, [, value]) => sum + value, 0)).toBe(journey.totalMs);
							for (let index = 0; index < journey.stages.length; index++) {
								const entry = journey.stages[index];
								expect(entry.endMs).toBeGreaterThanOrEqual(entry.startMs);
								if (index > 0) expect(entry.startMs).toBe(journey.stages[index - 1].endMs);
							}
							let delivered = 0;
							let page = 0;
							for (let step = 0; step <= 100; step++) {
								const snapshot = sampleJourney(journey, (step / 100) * journey.totalMs);
								expect(snapshot.deliveredBytes).toBeGreaterThanOrEqual(delivered);
								expect(snapshot.pageProgress).toBeGreaterThanOrEqual(page);
								expect(snapshot.pageProgress).toBeLessThanOrEqual(1);
								expect(snapshot.deliveredBytes + snapshot.bufferedBytes).toBeLessThanOrEqual(4800);
								expect(snapshot.nextExpectedByte).toBe(snapshot.deliveredBytes);
								for (const segment of snapshot.segments) {
									expect(segment.travelProgress).toBeGreaterThanOrEqual(0);
									expect(segment.travelProgress).toBeLessThanOrEqual(1);
								}
								delivered = snapshot.deliveredBytes;
								page = snapshot.pageProgress;
							}
							const end = sampleJourney(journey, journey.totalMs);
							expect(end.stage.id).toBe('complete');
							expect(end.pageProgress).toBe(1);
							expect(end.deliveredBytes).toBe(cache === 'fresh' ? 0 : 4800);
							expect(end.bufferedBytes).toBe(0);
						}
					}
				}
			}
		}
	});

	it('bounds malformed controls and times without converting strings into choices', () => {
		expect(normaliseInput({})).toEqual(DEFAULT_INPUT);
		expect(normaliseInput({ rttMs: NaN, serverMs: Infinity })).toEqual(DEFAULT_INPUT);
		expect(normaliseInput({ rttMs: -3, serverMs: 9000 })).toMatchObject({
			rttMs: 20,
			serverMs: 1500
		});
		expect(normaliseInput({ rttMs: 9999, serverMs: -1 })).toMatchObject({
			rttMs: 600,
			serverMs: 0
		});
		expect(
			normaliseInput({ lostSegment: 'true', cache: 'true', connection: true } as never)
		).toMatchObject({
			lostSegment: false,
			cache: 'origin',
			connection: 'fresh'
		});
		const journey = createJourney();
		expect(sampleJourney(journey, NaN).timeMs).toBe(0);
		expect(sampleJourney(journey, -1).timeMs).toBe(0);
		expect(sampleJourney(journey, -Infinity).timeMs).toBe(0);
		expect(sampleJourney(journey, Infinity).timeMs).toBe(journey.totalMs);
		expect(sampleJourney(journey, journey.totalMs + 1).stage.id).toBe('complete');
	});

	it('is deterministic, isolated from later caller edits and read-only between samples', () => {
		const input: JourneyInput = { ...DEFAULT_INPUT, lostSegment: true };
		const journey = createJourney(input);
		const reference = createJourney(input);
		expect(journey).toEqual(reference);
		input.rttMs = 600;
		input.connection = 'reused';
		expect(journey.input.rttMs).toBe(120);
		expect(journey.input.connection).toBe('fresh');
		const middle = sampleJourney(journey, journey.totalMs / 2);
		sampleJourney(journey, journey.totalMs);
		sampleJourney(journey, 0);
		expect(sampleJourney(journey, journey.totalMs / 2)).toEqual(middle);
		expect(journey).toEqual(reference);
		expect(Object.isFrozen(journey)).toBe(true);
		expect(Object.isFrozen(journey.input)).toBe(true);
		expect(Object.isFrozen(journey.segments[0])).toBe(true);
		expect(Object.isFrozen(middle.segments)).toBe(true);
	});
});
