import { describe, expect, it } from 'vitest';
import { MAX_TIME, simulate, snapshotAt } from './engine';
import { CANONICAL_URL, receiptReport, withPngReplayMetadata } from './export';
import { DEFAULT_SETTINGS } from './presets';
import { decodeReplay, encodeReplay } from './serialization';

describe('frozen waiting receipt', () => {
	it('keeps metrics, settings and paired replay consistent after the source runs change', () => {
		const run = simulate({ ...DEFAULT_SETTINGS });
		const baseline = simulate({ ...DEFAULT_SETTINGS, servers: 3 });
		const time = 42.5;
		const report = receiptReport(run, baseline, time, CANONICAL_URL);
		const frozen = structuredClone(report);
		expect(report.metrics).toEqual(snapshotAt(run, time).metrics);
		expect(report.baseline?.metrics).toEqual(snapshotAt(baseline, time).metrics);
		expect(decodeReplay(encodeReplay(report.replay))).toEqual(report.replay);
		expect(report.replay.settings).toEqual(report.settings);
		expect(report.replay.baseline).toEqual(report.baseline?.settings);

		run.settings.servers = 12;
		run.jobs[0].service = 999;
		baseline.settings.policy = 'random';
		expect(report).toEqual(frozen);
	});

	it('bounds its serialized horizon and reports computation limits explicitly', () => {
		const run = simulate({ ...DEFAULT_SETTINGS });
		for (const [requested, expected] of [
			[-1, 0],
			[NaN, 0],
			[Infinity, 0],
			[MAX_TIME + 1, MAX_TIME]
		]) {
			const report = receiptReport(run, null, requested, CANONICAL_URL);
			expect(report.replay.time).toBe(expected);
			expect(decodeReplay(encodeReplay(report.replay))?.time).toBe(expected);
		}
		const limited = simulate({ ...DEFAULT_SETTINGS, servers: 1 }, [
			{
				id: 0,
				arrival: 0,
				service: MAX_TIME + 1,
				classId: 1,
				priority: 1,
				patience: 0,
				attends: true
			},
			{ id: 1, arrival: 0, service: 2, classId: 1, priority: 1, patience: 0, attends: true }
		]);
		const report = receiptReport(limited, null, limited.endTime, CANONICAL_URL);
		expect(report.status).toBe('limit');
		expect(report.completion).toBe('computation limit reached; unresolved waits remain');
		expect(report.metrics.waiting).toBe(1);
	});
});

describe('PNG replay metadata', () => {
	const pixel = new Uint8Array(
		Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+r5V8AAAAASUVORK5CYII=',
			'base64'
		)
	);
	const url = 'https://example.test/#waiting=fixture';

	it('inserts a Replay text chunk before IEND with an independently checked CRC', () => {
		const result = withPngReplayMetadata(pixel, url);
		const insertion = pixel.length - 12;
		expect(result.subarray(0, insertion)).toEqual(pixel.subarray(0, insertion));
		expect(result.subarray(-12)).toEqual(pixel.subarray(-12));
		const view = new DataView(result.buffer);
		const length = view.getUint32(insertion);
		expect(new TextDecoder().decode(result.subarray(insertion + 4, insertion + 8))).toBe('tEXt');
		expect(new TextDecoder().decode(result.subarray(insertion + 8, insertion + 8 + length))).toBe(
			`Replay\0${url}`
		);
		// Fixture CRC independently checked with Node's native zlib.crc32.
		expect(view.getUint32(insertion + 8 + length)).toBe(0x4898337e);
	});

	it('rejects malformed images, unbounded URLs and text that cannot inhabit PNG tEXt', () => {
		expect(() => withPngReplayMetadata(new Uint8Array([1, 2, 3]), url)).toThrow('signature');
		expect(() => withPngReplayMetadata(pixel.subarray(0, -4), url)).toThrow('end chunk');
		expect(() => withPngReplayMetadata(pixel, 'x'.repeat(8193))).toThrow('bounded ASCII');
		expect(() => withPngReplayMetadata(pixel, `${url}\0`)).toThrow('bounded ASCII');
	});
});
