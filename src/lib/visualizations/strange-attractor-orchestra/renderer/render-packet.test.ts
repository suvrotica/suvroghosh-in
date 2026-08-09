import { describe, expect, it } from 'vitest';
import {
	DEFAULT_CHOREOGRAPHY,
	EVENT_PULSE_OFFSET,
	EVENT_PULSE_STRIDE,
	FEATURE_OFFSET,
	FEATURE_STRIDE,
	OrchestraRenderPacketError,
	POSITION_STRIDE,
	createRenderPacket,
	fillRenderPacket,
	renderLayerMixes,
	renderPacketFingerprint,
	visiblePointRange,
	writeRenderLayerMixes,
	writeVisiblePointRange
} from './render-packet';
import type { OrchestraRenderPacketSource } from './types';

function positions(count: number, stride: 2 | 3 = 3, offset = 0): Float64Array {
	const result = new Float64Array(count * stride);
	for (let point = 0; point < count; point += 1) {
		result[point * stride] = offset + point / Math.max(1, count - 1);
		result[point * stride + 1] = 0.25 + point / Math.max(1, count * 2);
		if (stride === 3) result[point * stride + 2] = 0.4;
	}
	return result;
}

function source(count = 5): OrchestraRenderPacketSource {
	return {
		rawPositions: positions(count),
		warpedPositions: positions(count, 3, 0.03),
		pointCount: count,
		features: {
			noiseValue01: Float64Array.from(
				{ length: count },
				(_, index) => index / Math.max(1, count - 1)
			),
			curvature01: Float32Array.from({ length: count }, (_, index) => index * 0.1),
			density01: Float32Array.from({ length: count }, () => 0.4),
			recurrence01: Float32Array.from({ length: count }, (_, index) =>
				index === count - 1 ? 1 : 0
			),
			region: Uint8Array.from({ length: count }, (_, index) => index % 4)
		},
		view: 'braided',
		lens: 'warp',
		quality: 'high',
		sequence: 12,
		simulationTime: 4.5
	};
}

describe('orchestra typed render packet', () => {
	it('allocates fixed, interleaved backing stores and no per-point objects', () => {
		const packet = createRenderPacket({ pointCapacity: 7, eventCapacity: 3 });
		expect(packet.rawPositions).toBeInstanceOf(Float32Array);
		expect(packet.warpedPositions).toBeInstanceOf(Float32Array);
		expect(packet.features).toBeInstanceOf(Float32Array);
		expect(packet.eventPulses).toBeInstanceOf(Float32Array);
		expect(packet.rawPositions).toHaveLength(7 * POSITION_STRIDE);
		expect(packet.features).toHaveLength(7 * FEATURE_STRIDE);
		expect(packet.eventPulses).toHaveLength(3 * EVENT_PULSE_STRIDE);
		expect(packet.choreography).toEqual(DEFAULT_CHOREOGRAPHY);
	});

	it('fills Float32 storage from Float64 scientific observations without mutating the source', () => {
		const input = source(5);
		const originalRaw = input.rawPositions.slice();
		const packet = createRenderPacket({ pointCapacity: 8 });
		const identities = {
			raw: packet.rawPositions,
			warped: packet.warpedPositions,
			features: packet.features,
			events: packet.eventPulses
		};
		const stats = fillRenderPacket(packet, input);

		expect(stats).toMatchObject({ pointCount: 5, sourcePointCount: 5, truncated: false });
		expect(input.rawPositions).toEqual(originalRaw);
		expect(packet.rawPositions).toBe(identities.raw);
		expect(packet.warpedPositions).toBe(identities.warped);
		expect(packet.features).toBe(identities.features);
		expect(packet.eventPulses).toBe(identities.events);
		expect(packet.sequence).toBe(12);
		expect(packet.simulationTime).toBe(4.5);
		expect(packet.features[FEATURE_OFFSET.age01]).toBe(0);
		expect(packet.features[4 * FEATURE_STRIDE + FEATURE_OFFSET.age01]).toBe(1);
	});

	it('revisions distinguish stable geometry uploads from dynamic event uploads', () => {
		const packet = createRenderPacket({ pointCapacity: 8, eventCapacity: 4 });
		expect(packet.geometryRevision).toBe(0);
		expect(packet.eventRevision).toBe(0);
		fillRenderPacket(packet, source(5));
		expect(packet.geometryRevision).toBe(1);
		expect(packet.eventRevision).toBe(1);
		packet.eventPulses[0] = 0.25;
		packet.eventRevision = (packet.eventRevision + 1) >>> 0;
		expect(packet.geometryRevision).toBe(1);
		expect(packet.eventRevision).toBe(2);
		fillRenderPacket(packet, source(5));
		expect(packet.geometryRevision).toBe(2);
		expect(packet.eventRevision).toBe(3);
	});

	it('accepts 2D projected positions and supplies a neutral z coordinate', () => {
		const packet = createRenderPacket({ pointCapacity: 4 });
		fillRenderPacket(packet, {
			...source(4),
			rawPositions: positions(4, 2),
			warpedPositions: positions(4, 2, 0.02),
			positionStride: 2
		});
		for (let point = 0; point < 4; point += 1) {
			expect(packet.rawPositions[point * POSITION_STRIDE + 2]).toBe(0.5);
			expect(packet.warpedPositions[point * POSITION_STRIDE + 2]).toBe(0.5);
		}
	});

	it('uniformly decimates while preserving both trajectory endpoints', () => {
		const packet = createRenderPacket({ pointCapacity: 4 });
		const stats = fillRenderPacket(packet, source(10));
		expect(stats).toMatchObject({
			sourcePointCount: 10,
			pointCount: 4,
			pointStep: 3,
			truncated: true
		});
		expect(packet.rawPositions[0]).toBeCloseTo(0);
		expect(packet.rawPositions[3]).toBeCloseTo(3 / 9);
		expect(packet.rawPositions[6]).toBeCloseTo(6 / 9);
		expect(packet.rawPositions[9]).toBeCloseTo(1);
	});

	it('clamps display features while retaining a bounded integer region identity', () => {
		const packet = createRenderPacket({ pointCapacity: 2 });
		fillRenderPacket(packet, {
			...source(2),
			features: {
				age01: Float32Array.of(-1, 2),
				noiseValue01: Float32Array.of(Number.NaN, 1.4),
				curvature01: Float32Array.of(-3, 4),
				density01: Float32Array.of(0.2, 0.8),
				recurrence01: Float32Array.of(0.1, 0.9),
				curlAngle01: Float32Array.of(-2, 3),
				region: Int32Array.of(-4, 900)
			}
		});
		const first = packet.features.slice(0, FEATURE_STRIDE);
		expect(first[0]).toBe(0);
		expect(first[1]).toBe(0.5);
		expect(first[2]).toBe(0);
		expect(first[3]).toBeCloseTo(0.2);
		expect(first[4]).toBeCloseTo(0.1);
		expect(first[5]).toBe(0);
		expect(first[6]).toBe(0);
		const second = packet.features.slice(FEATURE_STRIDE, FEATURE_STRIDE * 2);
		expect(Array.from(second.slice(0, 3))).toEqual([1, 1, 1]);
		expect(second[3]).toBeCloseTo(0.8);
		expect(second[4]).toBeCloseTo(0.9);
		expect(second[5]).toBe(255);
		expect(second[6]).toBe(1);
	});

	it('retains the newest bounded event pulses and normalizes their metadata', () => {
		const events = new Float64Array(4 * EVENT_PULSE_STRIDE);
		for (let event = 0; event < 4; event += 1) {
			const offset = event * EVENT_PULSE_STRIDE;
			events[offset + EVENT_PULSE_OFFSET.x01] = event * 0.1;
			events[offset + EVENT_PULSE_OFFSET.y01] = 0.5;
			events[offset + EVENT_PULSE_OFFSET.z01] = 0.5;
			events[offset + EVENT_PULSE_OFFSET.intensity01] = event === 3 ? 3 : 0.5;
			events[offset + EVENT_PULSE_OFFSET.progress01] = -1;
			events[offset + EVENT_PULSE_OFFSET.cause] = 20;
			events[offset + EVENT_PULSE_OFFSET.region] = 900;
			events[offset + EVENT_PULSE_OFFSET.size01] = 0.6;
		}
		const packet = createRenderPacket({ pointCapacity: 5, eventCapacity: 2 });
		const stats = fillRenderPacket(packet, { ...source(5), eventPulses: events, eventCount: 4 });
		expect(stats).toMatchObject({ sourceEventCount: 4, eventCount: 2, truncated: true });
		expect(packet.eventPulses[EVENT_PULSE_OFFSET.x01]).toBeCloseTo(0.2);
		expect(packet.eventPulses[EVENT_PULSE_STRIDE + EVENT_PULSE_OFFSET.x01]).toBeCloseTo(0.3);
		expect(packet.eventPulses[EVENT_PULSE_STRIDE + EVENT_PULSE_OFFSET.intensity01]).toBe(1);
		expect(packet.eventPulses[EVENT_PULSE_OFFSET.progress01]).toBe(0);
		expect(packet.eventPulses[EVENT_PULSE_OFFSET.cause]).toBe(7);
		expect(packet.eventPulses[EVENT_PULSE_OFFSET.region]).toBe(255);
	});

	it('rejects incomplete and non-finite positional data rather than drawing a changed system', () => {
		const packet = createRenderPacket({ pointCapacity: 5 });
		expect(() =>
			fillRenderPacket(packet, { ...source(5), rawPositions: new Float64Array(4) })
		).toThrow(OrchestraRenderPacketError);
		const invalid = positions(5);
		invalid[3] = Number.NaN;
		expect(() => fillRenderPacket(packet, { ...source(5), rawPositions: invalid })).toThrow(
			/rawPositions\[1, 0\] is not finite/u
		);
		const escaped = positions(5);
		escaped[6] = 40;
		expect(() => fillRenderPacket(packet, { ...source(5), rawPositions: escaped })).toThrow(
			/observation-space limit/u
		);
	});

	it('rejects feature channels shorter than the declared point count', () => {
		const packet = createRenderPacket({ pointCapacity: 5 });
		expect(() =>
			fillRenderPacket(packet, {
				...source(5),
				features: { curvature01: Float32Array.of(0, 1) }
			})
		).toThrow(/curvature01 contains 2 values for 5/u);
	});

	it('resolves raw, noise, and braided layer mixes without changing packet arrays', () => {
		const packet = createRenderPacket({ pointCapacity: 8 });
		fillRenderPacket(packet, {
			...source(5),
			choreography: { rawMix01: 0.5, weatherMix01: 0.75, voiceMix01: 0.25 }
		});
		const arrays = [packet.rawPositions, packet.warpedPositions, packet.features];
		packet.view = 'raw';
		expect(renderLayerMixes(packet)).toEqual({ raw: 0.5, warped: 0, voice: 0.25 });
		packet.view = 'noise';
		expect(renderLayerMixes(packet)).toEqual({ raw: 0, warped: 0.75, voice: 0.25 });
		packet.view = 'braided';
		expect(renderLayerMixes(packet)).toEqual({ raw: 0.5, warped: 0.75, voice: 0.25 });
		expect([packet.rawPositions, packet.warpedPositions, packet.features]).toEqual(arrays);
	});

	it('derives a bounded quality trail and a pause-safe reveal range', () => {
		const packet = createRenderPacket({ pointCapacity: 100, quality: 'low' });
		fillRenderPacket(packet, { ...source(100), quality: 'low' });
		packet.choreography = { ...packet.choreography, reveal01: 0 };
		expect(visiblePointRange(packet)).toEqual({ first: 0, count: 0, endExclusive: 0 });
		packet.choreography = { ...packet.choreography, reveal01: 0.5, trailHead01: 1 };
		expect(visiblePointRange(packet)).toEqual({ first: 0, count: 50, endExclusive: 50 });
		packet.choreography = { ...packet.choreography, reveal01: 1, trailHead01: 1 };
		expect(visiblePointRange(packet)).toEqual({ first: 48, count: 52, endExclusive: 100 });
	});

	it('writes frame range and layer mixes into renderer-owned scratch without replacing it', () => {
		const packet = createRenderPacket({ pointCapacity: 100, quality: 'low' });
		fillRenderPacket(packet, {
			...source(100),
			quality: 'low',
			view: 'braided',
			choreography: { rawMix01: 0.5, weatherMix01: 0.75, voiceMix01: 0.25 }
		});
		const range = { first: -1, count: -1, endExclusive: -1 };
		const mixes = { raw: -1, warped: -1, voice: -1 };
		const rangeIdentity = range;
		const mixesIdentity = mixes;

		writeVisiblePointRange(packet, range);
		writeRenderLayerMixes(packet, mixes);

		expect(range).toBe(rangeIdentity);
		expect(mixes).toBe(mixesIdentity);
		expect(range).toEqual(visiblePointRange(packet));
		expect(mixes).toEqual(renderLayerMixes(packet));
	});

	it('produces stable fingerprints and changes them only when visible packet state changes', () => {
		const first = createRenderPacket({ pointCapacity: 8 });
		const second = createRenderPacket({ pointCapacity: 8 });
		fillRenderPacket(first, source(5));
		fillRenderPacket(second, source(5));
		expect(renderPacketFingerprint(first)).toBe(renderPacketFingerprint(second));
		second.warpedPositions[0] += 0.001;
		expect(renderPacketFingerprint(first)).not.toBe(renderPacketFingerprint(second));
		second.warpedPositions[0] = first.warpedPositions[0];
		second.view = 'raw';
		expect(renderPacketFingerprint(first)).not.toBe(renderPacketFingerprint(second));
		second.view = first.view;
		second.choreography = { ...first.choreography, reveal01: 0.5 };
		expect(renderPacketFingerprint(first)).not.toBe(renderPacketFingerprint(second));
		second.choreography = first.choreography;
		second.simulationTime = first.simulationTime + 0.25;
		expect(renderPacketFingerprint(first)).not.toBe(renderPacketFingerprint(second));
	});
});
