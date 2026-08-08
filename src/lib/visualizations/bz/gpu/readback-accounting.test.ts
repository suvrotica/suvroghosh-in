import { describe, expect, it } from 'vitest';
import { BZGpuReadbackLedger, assertBZGpuFullReadReason } from './readback-accounting';

describe('BZ GPU readback accounting', () => {
	it('starts at an honest zero without counting constructor capability probes', () => {
		const accounting = new BZGpuReadbackLedger().snapshot();
		expect(accounting).toMatchObject({
			accountingScope: 'engine-readbacks-excluding-capability-probes',
			fullFieldReadbacks: 0,
			probeReadbacks: 0,
			reductionReadbacks: 0,
			telemetrySamples: 0,
			totalReadPixelsCalls: 0,
			totalReadTexels: 0
		});
	});

	it('separates explicit full fields, probes and reduction reads', () => {
		const ledger = new BZGpuReadbackLedger();
		ledger.recordProbe(1);
		for (let index = 0; index < 4; index += 1) ledger.recordReduction(1);
		ledger.recordTelemetrySample();
		ledger.recordFullField('export', 256 * 256, 1_234);
		const accounting = ledger.snapshot();
		expect(accounting).toMatchObject({
			fullFieldReadbacks: 1,
			fullFieldTexels: 65_536,
			fullFieldByReason: { export: 1, checkpoint: 0, debug: 0 },
			lastFullFieldReason: 'export',
			lastFullFieldStep: 1_234,
			probeReadbacks: 1,
			probeTexels: 1,
			reductionReadbacks: 4,
			reductionTexels: 4,
			telemetrySamples: 1,
			totalReadPixelsCalls: 6,
			totalReadTexels: 65_541
		});
	});

	it('tracks every permitted full-read reason independently', () => {
		const ledger = new BZGpuReadbackLedger();
		for (const reason of [
			'checkpoint',
			'scientific-snapshot',
			'debug',
			'context-recovery',
			'deterministic-replay'
		] as const) {
			ledger.recordFullField(reason, 4, 0);
		}
		expect(ledger.snapshot().fullFieldByReason).toEqual({
			export: 0,
			checkpoint: 1,
			'scientific-snapshot': 1,
			debug: 1,
			'context-recovery': 1,
			'deterministic-replay': 1
		});
	});

	it('refuses to disguise a larger region as a bounded read', () => {
		const ledger = new BZGpuReadbackLedger();
		expect(() => ledger.recordProbe(17)).toThrow(/16-texel bound/iu);
		expect(() => ledger.recordReduction(64)).toThrow(/16-texel bound/iu);
		expect(ledger.snapshot().totalReadPixelsCalls).toBe(0);
	});

	it('rejects missing or unsupported full-field reasons at runtime', () => {
		const ledger = new BZGpuReadbackLedger();
		expect(() => assertBZGpuFullReadReason(undefined)).toThrow(/explicit supported reason/iu);
		expect(() => assertBZGpuFullReadReason('ordinary-animation')).toThrow(
			/explicit supported reason/iu
		);
		expect(() => assertBZGpuFullReadReason('scientific-snapshot')).not.toThrow();
		expect(() => ledger.recordFullField(undefined as never, 64, 0)).toThrow(
			/explicit supported reason/iu
		);
		expect(() => ledger.recordFullField('ordinary-animation' as never, 64, 0)).toThrow(
			/explicit supported reason/iu
		);
	});

	it('returns detached reason counters', () => {
		const ledger = new BZGpuReadbackLedger();
		ledger.recordFullField('export', 4, 0);
		const first = ledger.snapshot();
		expect(Object.isFrozen(first.fullFieldByReason)).toBe(true);
		ledger.recordFullField('checkpoint', 4, 1);
		expect(first.fullFieldByReason.checkpoint).toBe(0);
		expect(ledger.snapshot().fullFieldByReason.checkpoint).toBe(1);
	});
});
