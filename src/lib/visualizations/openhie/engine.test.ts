import { describe, expect, it } from 'vitest';
import {
	compileRun,
	DEFAULT_SETTINGS,
	normalizeSettings,
	SCENARIOS,
	type ScenarioId,
	type Settings
} from './index';

describe('OpenHIE explanatory model', () => {
	it('returns the persisted clinical subset rather than a separate success story', () => {
		const run = compileRun('success');
		const end = run.snapshots.at(-1)!;
		expect(end.status).toBe('success');
		expect(end.transactionStatus).toBe('returned');
		expect(end.sharedEvents).toHaveLength(2);
		expect(end.returnedEvents).toEqual(end.sharedEvents);
		expect(end.localEvents).toHaveLength(2);
		expect(new Set(end.sharedEvents.map((event) => event.id)).size).toBe(2);
		for (const shared of end.sharedEvents) {
			const source = end.localEvents.find((event) => event.id === shared.id)!;
			expect(source.patientExchangeId).toBeNull();
			expect(shared.patientExchangeId).toBe(end.identity.exchangeId);
			expect(shared.recordedAt).toBe(source.recordedAt);
			expect(shared.occurredAt).toBe(source.occurredAt);
			expect(source.exchangedAt).toBeNull();
			expect(shared.exchangedAt).not.toBeNull();
			expect(Date.parse(shared.occurredAt)).toBeLessThan(Date.parse(shared.recordedAt));
			expect(Date.parse(shared.recordedAt)).toBeLessThan(Date.parse(shared.exchangedAt!));
			expect(shared.provenance.sourceRecordId).toBe(source.id);
			expect(shared.provenance.originalCode).toBe(source.code.code);
			expect(shared.provenance.mapping).toContain('teaching-map-v1');
			expect(shared.code.system).not.toBe(source.code.system);
		}
	});

	it('keeps identity resolution, receipt, persistence and returned clinical data distinct', () => {
		const run = compileRun('success');
		const identityKnown = run.snapshots.find((snapshot) => snapshot.identity.state === 'linked')!;
		expect(identityKnown.sharedEvents).toHaveLength(0);
		expect(identityKnown.returnedEvents).toHaveLength(0);
		const accepted = run.snapshots.find((snapshot) => snapshot.transactionStatus === 'accepted')!;
		expect(accepted.persistedCount).toBe(0);
		const persisted = run.snapshots.find((snapshot) => snapshot.transactionStatus === 'persisted')!;
		expect(persisted.persistedCount).toBe(1);
		expect(persisted.returnedEvents).toHaveLength(0);
		expect(
			run.snapshots.slice(0, -1).every((snapshot) => snapshot.returnedEvents.length === 0)
		).toBe(true);
	});

	it.each(SCENARIOS.map((scenario) => [scenario.id] as const))(
		'keeps every %s exchange at the IOL boundary',
		(scenario) => {
			const run = compileRun(scenario);
			expect(run.events.every((event) => event.from === 'iol' || event.to === 'iol')).toBe(true);
			expect(new Set(run.events.map((event) => event.id)).size).toBe(run.events.length);
			for (const response of run.events.filter((event) => event.direction === 'response')) {
				expect(
					run.events.some(
						(event) => event.direction === 'request' && event.requestId === response.requestId
					)
				).toBe(true);
			}
			for (const snapshot of run.snapshots) {
				expect(snapshot.step).toBe(run.snapshots.indexOf(snapshot));
				expect(snapshot.trace).toEqual(run.events.slice(0, snapshot.trace.length));
				expect(snapshot.persistedCount).toBe(snapshot.sharedEvents.length);
			}
		}
	);

	it('requires identity review without silently merging or submitting clinical data', () => {
		const run = compileRun('ambiguous');
		const end = run.snapshots.at(-1)!;
		expect(end.status).toBe('blocked');
		expect(end.identity.state).toBe('review');
		expect(end.identity.exchangeId).toBeNull();
		expect(end.sharedEvents).toHaveLength(0);
		expect(end.localEvents).toHaveLength(1);
		expect(run.events.some((event) => event.requestId === 'encounter-save')).toBe(false);
	});

	it('holds an unmapped lab result while retaining the earlier shared encounter and both local sources', () => {
		const run = compileRun('terminology');
		const end = run.snapshots.at(-1)!;
		expect(end.status).toBe('blocked');
		expect(end.sharedEvents.map((event) => event.kind)).toEqual(['encounter']);
		expect(end.localEvents.map((event) => event.kind)).toEqual(['encounter', 'lab-result']);
		expect(run.events.some((event) => event.requestId === 'lab-save' && event.to === 'shr')).toBe(
			false
		);
	});

	it('denies clinical access before a shared-record query and returns no clinical payload', () => {
		const run = compileRun('denied');
		const end = run.snapshots.at(-1)!;
		expect(end.status).toBe('denied');
		expect(end.identity.state).toBe('linked');
		expect(end.sharedEvents).toHaveLength(2);
		expect(end.returnedEvents).toHaveLength(0);
		expect(end.payload).toBeNull();
		const clinicalQuery = run.events.filter((event) => event.requestId === 'clinical-query');
		expect(clinicalQuery.map((event) => event.to)).toEqual(['iol', 'hospital']);
		expect(clinicalQuery.at(-1)!.payload).toBeNull();
	});

	it('does not claim persistence after the declared pre-commit service outage', () => {
		const run = compileRun('outage');
		const end = run.snapshots.at(-1)!;
		expect(end.status).toBe('unavailable');
		expect(end.transactionStatus).toBe('timeout');
		expect(end.sharedEvents).toHaveLength(0);
		expect(end.localEvents).toHaveLength(1);
		expect(run.events.some((event) => event.status === 'persisted')).toBe(false);
		expect(end.payload).toMatchObject({ issue: 'persistence-unconfirmed' });
	});

	it('deduplicates a replayed source event without duplicating clinical history', () => {
		const run = compileRun('duplicate');
		const duplicate = run.snapshots.find((snapshot) => snapshot.status === 'duplicate')!;
		expect(duplicate.duplicateCount).toBe(1);
		expect(duplicate.persistedCount).toBe(2);
		expect(run.snapshots.at(-1)!.returnedEvents).toHaveLength(2);
		const retry = run.events.find(
			(event) => event.requestId === 'lab-retry' && event.from === 'lab'
		)!;
		const sourceKey = duplicate.localEvents.find((event) => event.kind === 'lab-result')!.id;
		expect(retry.payload?.durableEventKey).toBe(sourceKey);
		expect(run.events.filter((event) => event.status === 'deduplicated')).toHaveLength(2);
	});

	it.each([
		['ambiguous', 'identityKnown'],
		['terminology', 'terminologyMapped'],
		['denied', 'authorized'],
		['outage', 'serviceAvailable']
	] as const)(
		'recovers %s at its gate without rewriting its completed prefix',
		(scenario, setting) => {
			const failure = compileRun(scenario);
			const recovered = compileRun(scenario, { [setting]: true });
			expect(recovered.snapshots.at(-1)!.transactionStatus).toBe('returned');
			expect(recovered.snapshots.at(-1)!.returnedEvents).toHaveLength(2);
			expect(recovered.snapshots.slice(0, failure.snapshots.length - 1)).toEqual(
				failure.snapshots.slice(0, -1)
			);
		}
	);

	it('evaluates combined broken settings at the first unmet gate rather than choosing a scenario ending', () => {
		const broken: Settings = {
			identityKnown: false,
			terminologyMapped: false,
			authorized: false,
			serviceAvailable: false
		};
		const cases = [
			[broken, 'blocked', 'client'],
			[{ ...broken, identityKnown: true }, 'unavailable', 'shr'],
			[{ ...broken, identityKnown: true, serviceAvailable: true }, 'blocked', 'terminology'],
			[
				{ ...broken, identityKnown: true, serviceAvailable: true, terminologyMapped: true },
				'denied',
				'iol'
			],
			[DEFAULT_SETTINGS, 'success', 'hospital']
		] as const;
		for (const [settings, status, activeComponent] of cases) {
			const end = compileRun('success', settings).snapshots.at(-1)!;
			expect(end.status).toBe(status);
			expect(end.activeComponent).toBe(activeComponent);
		}
	});

	it('normalizes actual booleans only and does not trust unknown scenario keys', () => {
		expect(
			normalizeSettings({ authorized: 'false', identityKnown: false, serviceAvailable: 0 })
		).toEqual({ ...DEFAULT_SETTINGS, identityKnown: false });
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings({ terminologyMapped: false })).toEqual({
			...DEFAULT_SETTINGS,
			terminologyMapped: false
		});
		expect(compileRun('__proto__' as ScenarioId).scenario).toBe('success');
	});

	it('is deterministic, deeply immutable and isolated across compilation and replay', () => {
		const first = compileRun('success');
		const before = JSON.stringify(first);
		compileRun('denied');
		compileRun('duplicate');
		expect(compileRun('success')).toEqual(first);
		expect(JSON.stringify(first)).toBe(before);
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first.snapshots)).toBe(true);
		expect(Object.isFrozen(first.snapshots.at(-1)!.payload)).toBe(true);
		expect(Object.isFrozen(first.snapshots.at(-1)!.sharedEvents[0].provenance)).toBe(true);
		expect(Object.isFrozen(first.events[0].payload)).toBe(true);
	});
});
