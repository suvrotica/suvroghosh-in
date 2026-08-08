import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OREGONATOR_SETUP } from '../constants';
import type { BZFieldState, BZIntervention, BZSetup } from '../types';
import {
	BZ_CHECKPOINT_ENDIAN_MARKER,
	BZ_CHECKPOINT_HEADER_BYTES,
	BZ_CHECKPOINT_MAGIC,
	BZ_CHECKPOINT_TRAILER_BYTES,
	canonicalBZJSONStringify,
	checkpointDescriptorV2,
	checkpointStateToBZFieldState,
	decodeBZCheckpointV1,
	encodeBZCheckpointV1
} from './codec';

const setup: BZSetup = {
	...DEFAULT_OREGONATOR_SETUP,
	parameters: { ...DEFAULT_OREGONATOR_SETUP.parameters },
	gridSize: 2,
	initialCondition: 'central-pulse',
	seed: 'checkpoint-codec-test'
};

const state: BZFieldState = {
	size: 2,
	u: new Float64Array([1, -2.5, Math.PI, 1 / 3]),
	v: new Float64Array([0, 2 ** -20, -17.25, 123.5]),
	domainMask: new Uint8Array([1, 1, 0, 1]),
	mask: new Uint8Array([1, 0, 0, 1])
};

const interventions: readonly BZIntervention[] = [
	{
		schemaVersion: 1,
		sequence: 0,
		step: 4,
		kind: 'excite',
		center: [0.5, 0.5],
		radius: 0.1,
		amount: 0.2
	}
];

const options = {
	checkpointId: 'codec-fixture',
	sourcePresetId: 'fixture-preset',
	setup,
	interventions,
	warmupStep: 40,
	cpuFloat64State: state,
	validationRecordId: 'fixture-calibration',
	generatedBy: 'checkpoint-codec.test.ts',
	generatedAt: '2026-08-08T00:00:00.000Z'
} as const;

function metadataAndPayloadOffsets(bytes: Uint8Array): {
	metadataStart: number;
	payloadStart: number;
	trailerStart: number;
} {
	const header = new DataView(bytes.buffer, bytes.byteOffset, BZ_CHECKPOINT_HEADER_BYTES);
	const metadataStart = BZ_CHECKPOINT_HEADER_BYTES;
	const payloadStart = metadataStart + header.getUint32(16, true);
	return {
		metadataStart,
		payloadStart,
		trailerStart: payloadStart + header.getUint32(20, true)
	};
}

function rewriteTrailer(bytes: Uint8Array): void {
	const { trailerStart } = metadataAndPayloadOffsets(bytes);
	const digest = createHash('sha256').update(bytes.subarray(0, trailerStart)).digest();
	bytes.set(digest, trailerStart);
}

describe('BZCP v1 checkpoint codec', () => {
	it('writes one deterministic, explicitly little-endian stored representation', async () => {
		const first = await encodeBZCheckpointV1(options);
		const second = await encodeBZCheckpointV1(options);
		expect(first.bytes).toEqual(second.bytes);
		expect(first.sha256).toBe(second.sha256);
		// This fixture pins every byte of BZCP v1. A deliberate representation
		// change therefore requires a codec-version change, not a silent rewrite.
		expect(first.sha256).toBe('e0cb6d96acd762f7a3f7f1f9873126d7adf23cc700f1743d70838c93fa815185');
		expect(first.metadata.checksums.cpuFloat64State).toBe(
			'82e767b2ca18d1a809cdb38bed23a28d0047f920b6c4b7cbb86b454346669953'
		);
		expect(first.bytes.length).toBe(2_159);

		expect([...first.bytes.subarray(0, BZ_CHECKPOINT_MAGIC.length)]).toEqual([
			...BZ_CHECKPOINT_MAGIC
		]);
		const header = new DataView(
			first.bytes.buffer,
			first.bytes.byteOffset,
			BZ_CHECKPOINT_HEADER_BYTES
		);
		expect(header.getUint16(8, true)).toBe(1);
		expect(header.getUint16(10, true)).toBe(BZ_CHECKPOINT_HEADER_BYTES);
		expect(header.getUint32(12, true)).toBe(BZ_CHECKPOINT_ENDIAN_MARKER);
		expect(header.getUint32(20, true)).toBe(40);
		expect(header.getUint32(24, true)).toBe(2);
		expect(header.getUint32(28, true)).toBe(2);

		const { payloadStart, trailerStart } = metadataAndPayloadOffsets(first.bytes);
		// IEEE-754 1.0 and -2.5 written least-significant byte first.
		expect([...first.bytes.subarray(payloadStart, payloadStart + 8)]).toEqual([
			0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x20, 0xc0
		]);
		expect(first.bytes.length).toBe(trailerStart + BZ_CHECKPOINT_TRAILER_BYTES);
		expect(createHash('sha256').update(first.bytes.subarray(0, trailerStart)).digest('hex')).toBe(
			first.sha256
		);
	});

	it('round-trips exact Float32 fields, masks and provenance', async () => {
		const encoded = await encodeBZCheckpointV1(options);
		const decoded = await decodeBZCheckpointV1(encoded.bytes, {
			checkpointId: options.checkpointId,
			sourcePresetId: options.sourcePresetId,
			setup,
			interventions,
			engineVersion: 'bz-heun-five-point-v2',
			validationRecordId: options.validationRecordId,
			cpuFloat64StateSha256: encoded.metadata.checksums.cpuFloat64State,
			fileSha256: encoded.sha256
		});
		expect(decoded.sha256).toBe(encoded.sha256);
		expect(decoded.state.u).toEqual(Float32Array.from(state.u));
		expect(decoded.state.v).toEqual(Float32Array.from(state.v));
		expect(decoded.state.domainMask).toEqual(state.domainMask);
		expect(decoded.state.activeMask).toEqual(state.mask);
		expect(decoded.metadata.modelTime).toBe(options.warmupStep * setup.timestep);
		expect(decoded.metadata.setup).toEqual(setup);
		expect(decoded.metadata.interventions).toEqual(interventions);

		const cpuState = checkpointStateToBZFieldState(decoded.state);
		expect(cpuState.u).toEqual(Float64Array.from(Float32Array.from(state.u)));
		expect(cpuState.v).toEqual(Float64Array.from(Float32Array.from(state.v)));
		expect(cpuState.mask).toEqual(state.mask);
	});

	it('detects whole-file corruption before parsing fields', async () => {
		const encoded = await encodeBZCheckpointV1(options);
		const corrupted = Uint8Array.from(encoded.bytes);
		const { payloadStart } = metadataAndPayloadOffsets(corrupted);
		corrupted[payloadStart + 3] ^= 0x01;
		await expect(decodeBZCheckpointV1(corrupted)).rejects.toThrow(/trailer does not match/iu);
	});

	it('detects a field checksum mismatch even if a corrupt file gets a new trailer', async () => {
		const encoded = await encodeBZCheckpointV1(options);
		const corrupted = Uint8Array.from(encoded.bytes);
		const { payloadStart } = metadataAndPayloadOffsets(corrupted);
		corrupted[payloadStart + 3] ^= 0x01;
		rewriteTrailer(corrupted);
		await expect(decodeBZCheckpointV1(corrupted)).rejects.toThrow(/checksum does not match/iu);
	});

	it('refuses valid files whose requested provenance does not match', async () => {
		const encoded = await encodeBZCheckpointV1(options);
		await expect(
			decodeBZCheckpointV1(encoded.bytes, { sourcePresetId: 'different-preset' })
		).rejects.toThrow(/source preset does not match/iu);
		await expect(
			decodeBZCheckpointV1(encoded.bytes, {
				setup: { ...setup, seed: 'a-different-seed' }
			})
		).rejects.toThrow(/setup does not match/iu);
	});

	it('rejects invalid masks and non-finite reference fields before encoding', async () => {
		await expect(
			encodeBZCheckpointV1({
				...options,
				cpuFloat64State: { ...state, mask: new Uint8Array([1, 0, 1, 1]) }
			})
		).rejects.toThrow(/active mask cannot extend/iu);
		await expect(
			encodeBZCheckpointV1({
				...options,
				cpuFloat64State: {
					...state,
					u: new Float64Array([1, Number.NaN, 2, 3])
				}
			})
		).rejects.toThrow(/non-finite/iu);
	});

	it('derives a manifest descriptor without duplicating scientific values', async () => {
		const encoded = await encodeBZCheckpointV1(options);
		const descriptor = checkpointDescriptorV2(encoded, '/data/bz/checkpoints/codec-fixture.bzcp');
		expect(descriptor).toMatchObject({
			id: 'codec-fixture',
			sourcePresetId: 'fixture-preset',
			encoding: 'bzcp-f32le-v1',
			losslessForStoredRepresentation: true,
			width: 2,
			height: 2,
			modelStep: 40,
			modelTime: 0.02,
			byteLength: encoded.bytes.length,
			sha256: encoded.sha256,
			fieldSha256F64Reference: encoded.metadata.checksums.cpuFloat64State,
			browserStateSha256: encoded.metadata.checksums.browserFloat32State,
			setupChecksum: encoded.metadata.checksums.setupCanonicalJson,
			interventionLogChecksum: encoded.metadata.checksums.interventionLogCanonicalJson,
			seed: setup.seed,
			setup,
			interventions,
			validationRecordId: 'fixture-calibration'
		});
	});

	it('canonicalizes document keys while preserving event order', () => {
		expect(canonicalBZJSONStringify({ z: 1, a: { d: 2, b: 3 } })).toBe('{"a":{"b":3,"d":2},"z":1}');
		expect(canonicalBZJSONStringify([{ z: 1 }, { a: 2 }])).toBe('[{"z":1},{"a":2}]');
	});
});
