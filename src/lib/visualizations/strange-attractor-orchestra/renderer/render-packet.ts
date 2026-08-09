import { ORCHESTRA_HARD_EVENT_CAP, ORCHESTRA_HARD_POINT_CAP, qualityProfile } from './quality';
import type {
	FloatChannel,
	OrchestraNoiseLens,
	OrchestraQualityTier,
	OrchestraRenderChoreography,
	OrchestraRenderPacket,
	OrchestraRenderPacketSource,
	OrchestraRenderView,
	RegionChannel
} from './types';

export const POSITION_STRIDE = 3;
export const FEATURE_STRIDE = 7;
export const EVENT_PULSE_STRIDE = 8;

export const FEATURE_OFFSET = Object.freeze({
	age01: 0,
	noiseValue01: 1,
	curvature01: 2,
	density01: 3,
	recurrence01: 4,
	region: 5,
	curlAngle01: 6
} as const);

export const EVENT_PULSE_OFFSET = Object.freeze({
	x01: 0,
	y01: 1,
	z01: 2,
	intensity01: 3,
	progress01: 4,
	cause: 5,
	region: 6,
	size01: 7
} as const);

export const DEFAULT_CHOREOGRAPHY = Object.freeze({
	reveal01: 1,
	trailHead01: 1,
	rawMix01: 1,
	weatherMix01: 1,
	voiceMix01: 1
} as const satisfies OrchestraRenderChoreography);

export type RenderPacketCapacity = Readonly<{
	pointCapacity?: number;
	eventCapacity?: number;
	view?: OrchestraRenderView;
	lens?: OrchestraNoiseLens;
	quality?: OrchestraQualityTier;
}>;

export type RenderPacketFillStats = Readonly<{
	sourcePointCount: number;
	pointCount: number;
	sourceEventCount: number;
	eventCount: number;
	pointStep: number;
	truncated: boolean;
}>;

export type VisiblePointRange = Readonly<{
	first: number;
	count: number;
	endExclusive: number;
}>;

export type RenderLayerMixes = Readonly<{
	raw: number;
	warped: number;
	voice: number;
}>;

/** Renderer-owned scratch shapes for allocation-free frame calculations. */
export type MutableVisiblePointRange = {
	first: number;
	count: number;
	endExclusive: number;
};

export type MutableRenderLayerMixes = {
	raw: number;
	warped: number;
	voice: number;
};

export class OrchestraRenderPacketError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'OrchestraRenderPacketError';
	}
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
	if (value === undefined || !Number.isFinite(value)) return fallback;
	return Math.min(maximum, Math.max(0, Math.round(value)));
}

function unit(value: number | undefined, fallback = 0): number {
	return Number.isFinite(value) ? Math.min(1, Math.max(0, Number(value))) : fallback;
}

function finite(value: number | undefined, fallback = 0): number {
	return Number.isFinite(value) ? Number(value) : fallback;
}

function channelValue(channel: FloatChannel | RegionChannel | undefined, index: number): number {
	return channel && index < channel.length ? Number(channel[index]) : Number.NaN;
}

function assertChannelLength(
	name: string,
	channel: FloatChannel | RegionChannel | undefined,
	pointCount: number
): void {
	if (channel && channel.length < pointCount) {
		throw new OrchestraRenderPacketError(
			`${name} contains ${channel.length} values for ${pointCount} source points.`
		);
	}
}

function validatePosition(value: number, label: string): number {
	if (!Number.isFinite(value)) {
		throw new OrchestraRenderPacketError(`${label} is not finite.`);
	}
	if (Math.abs(value) > 16) {
		throw new OrchestraRenderPacketError(
			`${label} exceeds the renderer's observation-space limit.`
		);
	}
	return value;
}

function sourceIndex(renderIndex: number, renderCount: number, sourceCount: number): number {
	if (renderCount <= 1 || sourceCount <= 1) return Math.max(0, sourceCount - 1);
	return Math.round((renderIndex * (sourceCount - 1)) / (renderCount - 1));
}

function normalizedChoreography(
	value: Partial<OrchestraRenderChoreography> | undefined
): OrchestraRenderChoreography {
	return {
		reveal01: unit(value?.reveal01, DEFAULT_CHOREOGRAPHY.reveal01),
		trailHead01: unit(value?.trailHead01, DEFAULT_CHOREOGRAPHY.trailHead01),
		rawMix01: unit(value?.rawMix01, DEFAULT_CHOREOGRAPHY.rawMix01),
		weatherMix01: unit(value?.weatherMix01, DEFAULT_CHOREOGRAPHY.weatherMix01),
		voiceMix01: unit(value?.voiceMix01, DEFAULT_CHOREOGRAPHY.voiceMix01)
	};
}

export function createRenderPacket(capacity: RenderPacketCapacity = {}): OrchestraRenderPacket {
	const pointCapacity = boundedInteger(
		capacity.pointCapacity,
		ORCHESTRA_QUALITY_PROFILES_POINT_CAPACITY,
		ORCHESTRA_HARD_POINT_CAP
	);
	const eventCapacity = boundedInteger(
		capacity.eventCapacity,
		ORCHESTRA_HARD_EVENT_CAP,
		ORCHESTRA_HARD_EVENT_CAP
	);
	return {
		rawPositions: new Float32Array(pointCapacity * POSITION_STRIDE),
		warpedPositions: new Float32Array(pointCapacity * POSITION_STRIDE),
		features: new Float32Array(pointCapacity * FEATURE_STRIDE),
		eventPulses: new Float32Array(eventCapacity * EVENT_PULSE_STRIDE),
		geometryRevision: 0,
		eventRevision: 0,
		pointCount: 0,
		eventCount: 0,
		view: capacity.view ?? 'braided',
		lens: capacity.lens ?? 'warp',
		quality: capacity.quality ?? 'high',
		choreography: { ...DEFAULT_CHOREOGRAPHY },
		sequence: 0,
		simulationTime: 0
	};
}

const ORCHESTRA_QUALITY_PROFILES_POINT_CAPACITY = qualityProfile('high').maxVisiblePoints;

/**
 * Fills fixed packet storage through endpoint-preserving uniform decimation. The same source and
 * capacity always produce byte-identical packet arrays.
 */
export function fillRenderPacket(
	packet: OrchestraRenderPacket,
	source: OrchestraRenderPacketSource
): RenderPacketFillStats {
	const positionStride = source.positionStride ?? 3;
	if (positionStride !== 2 && positionStride !== 3) {
		throw new OrchestraRenderPacketError('positionStride must be 2 or 3.');
	}
	const availableRaw = Math.floor(source.rawPositions.length / positionStride);
	const availableWarped = Math.floor(source.warpedPositions.length / positionStride);
	const requestedPointCount = source.pointCount ?? Math.min(availableRaw, availableWarped);
	if (!Number.isSafeInteger(requestedPointCount) || requestedPointCount < 0) {
		throw new OrchestraRenderPacketError('pointCount must be a non-negative safe integer.');
	}
	if (availableRaw < requestedPointCount || availableWarped < requestedPointCount) {
		throw new OrchestraRenderPacketError(
			`Position buffers do not contain ${requestedPointCount} complete points.`
		);
	}

	const features = source.features;
	assertChannelLength('age01', features?.age01, requestedPointCount);
	assertChannelLength('noiseValue01', features?.noiseValue01, requestedPointCount);
	assertChannelLength('curvature01', features?.curvature01, requestedPointCount);
	assertChannelLength('density01', features?.density01, requestedPointCount);
	assertChannelLength('recurrence01', features?.recurrence01, requestedPointCount);
	assertChannelLength('curlAngle01', features?.curlAngle01, requestedPointCount);
	assertChannelLength('region', features?.region, requestedPointCount);

	const pointCapacity = Math.floor(
		Math.min(packet.rawPositions.length, packet.warpedPositions.length) / POSITION_STRIDE
	);
	const featureCapacity = Math.floor(packet.features.length / FEATURE_STRIDE);
	const pointLimit = Math.min(
		pointCapacity,
		featureCapacity,
		qualityProfile(source.quality).maxVisiblePoints,
		ORCHESTRA_HARD_POINT_CAP
	);
	const renderPointCount = Math.min(requestedPointCount, pointLimit);

	for (let renderIndex = 0; renderIndex < renderPointCount; renderIndex += 1) {
		const readIndex = sourceIndex(renderIndex, renderPointCount, requestedPointCount);
		const readOffset = readIndex * positionStride;
		const writeOffset = renderIndex * POSITION_STRIDE;
		for (let component = 0; component < POSITION_STRIDE; component += 1) {
			const fallback = component === 2 ? 0.5 : 0;
			const raw =
				component < positionStride ? Number(source.rawPositions[readOffset + component]) : fallback;
			const warped =
				component < positionStride
					? Number(source.warpedPositions[readOffset + component])
					: fallback;
			packet.rawPositions[writeOffset + component] = validatePosition(
				raw,
				`rawPositions[${readIndex}, ${component}]`
			);
			packet.warpedPositions[writeOffset + component] = validatePosition(
				warped,
				`warpedPositions[${readIndex}, ${component}]`
			);
		}

		const featureOffset = renderIndex * FEATURE_STRIDE;
		const derivedAge = requestedPointCount <= 1 ? 1 : readIndex / (requestedPointCount - 1);
		packet.features[featureOffset + FEATURE_OFFSET.age01] = unit(
			channelValue(features?.age01, readIndex),
			derivedAge
		);
		packet.features[featureOffset + FEATURE_OFFSET.noiseValue01] = unit(
			channelValue(features?.noiseValue01, readIndex),
			0.5
		);
		packet.features[featureOffset + FEATURE_OFFSET.curvature01] = unit(
			channelValue(features?.curvature01, readIndex)
		);
		packet.features[featureOffset + FEATURE_OFFSET.density01] = unit(
			channelValue(features?.density01, readIndex)
		);
		packet.features[featureOffset + FEATURE_OFFSET.recurrence01] = unit(
			channelValue(features?.recurrence01, readIndex)
		);
		packet.features[featureOffset + FEATURE_OFFSET.region] = Math.min(
			255,
			Math.max(0, Math.round(finite(channelValue(features?.region, readIndex))))
		);
		packet.features[featureOffset + FEATURE_OFFSET.curlAngle01] = unit(
			channelValue(features?.curlAngle01, readIndex),
			0.5
		);
	}

	const eventSource = source.eventPulses;
	const availableEvents = eventSource ? Math.floor(eventSource.length / EVENT_PULSE_STRIDE) : 0;
	const requestedEventCount = source.eventCount ?? availableEvents;
	if (!Number.isSafeInteger(requestedEventCount) || requestedEventCount < 0) {
		throw new OrchestraRenderPacketError('eventCount must be a non-negative safe integer.');
	}
	if (availableEvents < requestedEventCount) {
		throw new OrchestraRenderPacketError(
			`eventPulses does not contain ${requestedEventCount} complete events.`
		);
	}
	const eventCapacity = Math.floor(packet.eventPulses.length / EVENT_PULSE_STRIDE);
	const renderEventCount = Math.min(
		requestedEventCount,
		eventCapacity,
		qualityProfile(source.quality).maxEventPulses,
		ORCHESTRA_HARD_EVENT_CAP
	);
	const firstEvent = requestedEventCount - renderEventCount;
	for (let eventIndex = 0; eventIndex < renderEventCount; eventIndex += 1) {
		const readIndex = firstEvent + eventIndex;
		const readOffset = readIndex * EVENT_PULSE_STRIDE;
		const writeOffset = eventIndex * EVENT_PULSE_STRIDE;
		packet.eventPulses[writeOffset + EVENT_PULSE_OFFSET.x01] = validatePosition(
			Number(eventSource![readOffset + EVENT_PULSE_OFFSET.x01]),
			`eventPulses[${readIndex}].x01`
		);
		packet.eventPulses[writeOffset + EVENT_PULSE_OFFSET.y01] = validatePosition(
			Number(eventSource![readOffset + EVENT_PULSE_OFFSET.y01]),
			`eventPulses[${readIndex}].y01`
		);
		packet.eventPulses[writeOffset + EVENT_PULSE_OFFSET.z01] = validatePosition(
			Number(eventSource![readOffset + EVENT_PULSE_OFFSET.z01]),
			`eventPulses[${readIndex}].z01`
		);
		packet.eventPulses[writeOffset + EVENT_PULSE_OFFSET.intensity01] = unit(
			Number(eventSource![readOffset + EVENT_PULSE_OFFSET.intensity01])
		);
		packet.eventPulses[writeOffset + EVENT_PULSE_OFFSET.progress01] = unit(
			Number(eventSource![readOffset + EVENT_PULSE_OFFSET.progress01])
		);
		packet.eventPulses[writeOffset + EVENT_PULSE_OFFSET.cause] = Math.min(
			7,
			Math.max(0, Math.round(finite(Number(eventSource![readOffset + EVENT_PULSE_OFFSET.cause]))))
		);
		packet.eventPulses[writeOffset + EVENT_PULSE_OFFSET.region] = Math.min(
			255,
			Math.max(0, Math.round(finite(Number(eventSource![readOffset + EVENT_PULSE_OFFSET.region]))))
		);
		packet.eventPulses[writeOffset + EVENT_PULSE_OFFSET.size01] = unit(
			Number(eventSource![readOffset + EVENT_PULSE_OFFSET.size01]),
			0.5
		);
	}

	packet.pointCount = renderPointCount;
	packet.eventCount = renderEventCount;
	packet.view = source.view;
	packet.lens = source.lens;
	packet.quality = source.quality;
	packet.choreography = normalizedChoreography(source.choreography);
	packet.sequence = boundedInteger(source.sequence, packet.sequence, Number.MAX_SAFE_INTEGER);
	packet.simulationTime = Math.max(0, finite(source.simulationTime));
	packet.geometryRevision = (packet.geometryRevision + 1) >>> 0;
	packet.eventRevision = (packet.eventRevision + 1) >>> 0;

	return {
		sourcePointCount: requestedPointCount,
		pointCount: renderPointCount,
		sourceEventCount: requestedEventCount,
		eventCount: renderEventCount,
		pointStep:
			renderPointCount <= 1
				? requestedPointCount
				: (requestedPointCount - 1) / (renderPointCount - 1),
		truncated: renderPointCount < requestedPointCount || renderEventCount < requestedEventCount
	};
}

export function writeVisiblePointRange(
	packet: Readonly<OrchestraRenderPacket>,
	target: MutableVisiblePointRange
): void {
	if (packet.pointCount <= 0) {
		target.first = 0;
		target.count = 0;
		target.endExclusive = 0;
		return;
	}
	const reveal = unit(packet.choreography.reveal01, 1);
	const head = Math.min(reveal, unit(packet.choreography.trailHead01, 1));
	if (head <= 0) {
		target.first = 0;
		target.count = 0;
		target.endExclusive = 0;
		return;
	}
	const endExclusive = Math.min(
		packet.pointCount,
		Math.max(1, Math.ceil(packet.pointCount * head))
	);
	const profile = qualityProfile(packet.quality);
	const maximumTrail = Math.min(
		profile.maxVisiblePoints,
		Math.max(2, Math.ceil(packet.pointCount * profile.trailFraction))
	);
	const first = Math.max(0, endExclusive - maximumTrail);
	target.first = first;
	target.count = endExclusive - first;
	target.endExclusive = endExclusive;
}

export function visiblePointRange(packet: Readonly<OrchestraRenderPacket>): VisiblePointRange {
	const range: MutableVisiblePointRange = { first: 0, count: 0, endExclusive: 0 };
	writeVisiblePointRange(packet, range);
	return range;
}

export function writeRenderLayerMixes(
	packet: Readonly<OrchestraRenderPacket>,
	target: MutableRenderLayerMixes
): void {
	const rawBase = packet.view === 'noise' ? 0 : 1;
	const warpedBase = packet.view === 'raw' ? 0 : 1;
	target.raw = rawBase * unit(packet.choreography.rawMix01, 1);
	target.warped = warpedBase * unit(packet.choreography.weatherMix01, 1);
	target.voice = unit(packet.choreography.voiceMix01, 1);
}

export function renderLayerMixes(packet: Readonly<OrchestraRenderPacket>): RenderLayerMixes {
	const mixes: MutableRenderLayerMixes = { raw: 0, warped: 0, voice: 0 };
	writeRenderLayerMixes(packet, mixes);
	return mixes;
}

/** Stable FNV-1a fingerprint for deterministic screenshot/debug fixtures. */
export function renderPacketFingerprint(packet: Readonly<OrchestraRenderPacket>): string {
	let hash = 0x811c9dc5;
	const updateByte = (byte: number) => {
		hash ^= byte & 0xff;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	};
	const updateView = (view: ArrayBufferView, byteLength: number) => {
		const bytes = new Uint8Array(view.buffer, view.byteOffset, byteLength);
		for (let index = 0; index < bytes.length; index += 1) updateByte(bytes[index]);
	};
	updateView(packet.rawPositions, packet.pointCount * POSITION_STRIDE * 4);
	updateView(packet.warpedPositions, packet.pointCount * POSITION_STRIDE * 4);
	updateView(packet.features, packet.pointCount * FEATURE_STRIDE * 4);
	updateView(packet.eventPulses, packet.eventCount * EVENT_PULSE_STRIDE * 4);
	const choreography = packet.choreography;
	const visibleMetadata = [
		packet.view,
		packet.lens,
		packet.quality,
		packet.sequence,
		packet.simulationTime,
		choreography.reveal01,
		choreography.trailHead01,
		choreography.rawMix01,
		choreography.weatherMix01,
		choreography.voiceMix01
	].join('|');
	for (const character of visibleMetadata) {
		updateByte(character.charCodeAt(0));
	}
	return hash.toString(16).padStart(8, '0');
}
