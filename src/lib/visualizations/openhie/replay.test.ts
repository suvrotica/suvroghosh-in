import { describe, expect, it } from 'vitest';
import {
	compileRun,
	decodeReplay,
	DEFAULT_SETTINGS,
	encodeReplay,
	exchangeReceipt,
	MODEL_VERSION,
	SCENARIOS,
	type Settings
} from './index';

const valid = () => new URLSearchParams(encodeReplay('success', DEFAULT_SETTINGS, 3));

describe('OpenHIE replay links', () => {
	it.each(SCENARIOS.map((scenario) => [scenario.id] as const))(
		'round-trips %s with explicit settings',
		(scenario) => {
			const run = compileRun(scenario);
			const step = run.snapshots.length - 1;
			const encoded = encodeReplay(scenario, run.settings, step);
			expect(encoded.startsWith('?')).toBe(false);
			expect(encoded).toContain('ohie_v=1');
			expect(new URLSearchParams(encoded).size).toBe(7);
			expect(decodeReplay(encoded)).toEqual({ scenario, settings: run.settings, step });
			expect(decodeReplay(`?${encoded}`)).toEqual(decodeReplay(encoded));
		}
	);

	it('preserves a recovered scenario instead of silently reapplying its default failure', () => {
		const run = compileRun('denied', { authorized: true });
		const restored = decodeReplay(encodeReplay('denied', run.settings, run.snapshots.length - 1))!;
		expect(restored.scenario).toBe('denied');
		expect(restored.settings.authorized).toBe(true);
		expect(compileRun(restored.scenario, restored.settings).snapshots.at(-1)!.status).toBe(
			'success'
		);
	});

	it.each(['', '0', '2', '01', '1.0', 'true'])('rejects unsupported version %j', (version) => {
		const query = valid();
		query.set('ohie_v', version);
		expect(decodeReplay(query.toString())).toBeNull();
	});

	it.each(['true', 'false', 'yes', 'no', '2', '-1', '01', '1.0', ''])(
		'rejects noncanonical boolean %j',
		(value) => {
			const query = valid();
			query.set('ohie_authorized', value);
			expect(decodeReplay(query.toString())).toBeNull();
		}
	);

	it.each(['-1', '1.5', '1e1', 'Infinity', 'NaN', '01', '+1', ' 1', '65', '1000000000000000', ''])(
		'rejects an invalid step %j',
		(step) => {
			const query = valid();
			query.set('ohie_step', step);
			expect(decodeReplay(query.toString())).toBeNull();
		}
	);

	it('bounds encoding and receipts to the compiled scenario, and admitted replay indices to its end', () => {
		const run = compileRun('ambiguous');
		const finalStep = run.snapshots.length - 1;
		expect(decodeReplay(encodeReplay('ambiguous', run.settings, 1e20))!.step).toBe(finalStep);
		expect(decodeReplay(encodeReplay('ambiguous', run.settings, -100))!.step).toBe(0);
		expect(decodeReplay(encodeReplay('ambiguous', run.settings, NaN))!.step).toBe(0);
		expect(decodeReplay(encodeReplay('success', DEFAULT_SETTINGS, 2.9))!.step).toBe(2);
		const query = new URLSearchParams(encodeReplay('ambiguous', run.settings, 0));
		query.set('ohie_step', '64');
		expect(decodeReplay(query.toString())!.step).toBe(finalStep);
		expect(exchangeReceipt(run, 1e20).step).toBe(finalStep);
		expect(exchangeReceipt(run, -1).step).toBe(0);
	});

	it('rejects missing, repeated and unknown owned keys without rejecting unrelated page parameters', () => {
		for (const key of valid().keys()) {
			const missing = valid();
			missing.delete(key);
			expect(decodeReplay(missing.toString())).toBeNull();
			const duplicate = valid();
			duplicate.append(key, duplicate.get(key)!);
			expect(decodeReplay(duplicate.toString())).toBeNull();
		}
		const unknown = valid();
		unknown.set('ohie_approveEverything', '1');
		expect(decodeReplay(unknown.toString())).toBeNull();
		const unrelated = valid();
		unrelated.set('utm_source', 'example');
		expect(decodeReplay(unrelated.toString())).toEqual(decodeReplay(valid().toString()));
	});

	it('rejects unknown scenarios and excessively large query strings', () => {
		for (const value of ['__proto__', 'constructor', 'SUCCESS', 'unknown']) {
			const query = valid();
			query.set('ohie_s', value);
			expect(decodeReplay(query.toString())).toBeNull();
		}
		expect(decodeReplay(`${valid().toString()}&extra=${'a'.repeat(4096)}`)).toBeNull();
		expect(decodeReplay('')).toBeNull();
	});

	it('normalizes untyped encoder settings without interpreting boolean-like strings as permission', () => {
		const settings = { ...DEFAULT_SETTINGS, authorized: 'false' } as unknown as Settings;
		expect(decodeReplay(encodeReplay('success', settings, 0))!.settings).toEqual(DEFAULT_SETTINGS);
	});
});

describe('OpenHIE exchange receipt', () => {
	it('exports the exact selected immutable snapshot, model assumptions and primary references', () => {
		const run = compileRun('success');
		const receipt = exchangeReceipt(run, 5);
		expect(receipt.version).toBe(1);
		expect(receipt.model).toBe(MODEL_VERSION);
		expect(receipt.snapshot).toBe(run.snapshots[5]);
		expect(receipt.settings).toBe(run.settings);
		expect(receipt.assumptions).toBe(run.assumptions);
		expect(
			receipt.sources.every((source) => source.url.startsWith('https://guides.ohie.org/'))
		).toBe(true);
		expect(Object.isFrozen(receipt)).toBe(true);
		expect(Object.isFrozen(receipt.snapshot)).toBe(true);
		expect(JSON.stringify(exchangeReceipt(run, 5))).toBe(JSON.stringify(receipt));
	});

	it('retains denied-query semantics without inventing a successful response for the export', () => {
		const run = compileRun('denied');
		const receipt = exchangeReceipt(run, run.snapshots.length - 1);
		expect(receipt.snapshot.status).toBe('denied');
		expect(receipt.snapshot.payload).toBeNull();
		expect(receipt.snapshot.returnedEvents).toHaveLength(0);
		expect(
			receipt.snapshot.trace.filter((event) => event.requestId === 'clinical-query').at(-1)!.payload
		).toBeNull();
		expect(receipt.snapshot.sharedEvents).toHaveLength(2);
	});
});
