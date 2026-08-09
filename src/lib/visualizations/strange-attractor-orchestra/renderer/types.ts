export type OrchestraRenderView = 'raw' | 'noise' | 'braided';
export type OrchestraNoiseLens = 'dye' | 'warp' | 'wake';
export type OrchestraQualityTier = 'low' | 'medium' | 'high';
export type OrchestraRendererKind = 'webgl2' | 'canvas2d';
export type OrchestraRendererStatus = 'ready' | 'suspended' | 'context-lost' | 'disposed';

export type FloatChannel = Float32Array | Float64Array;
export type RegionChannel =
	| Float32Array
	| Float64Array
	| Uint8Array
	| Uint16Array
	| Uint32Array
	| Int8Array
	| Int16Array
	| Int32Array;

/**
 * Low-rate film controls. They can reveal or crossfade an already-computed packet, but they never
 * alter its trajectory, feature channels, event ordering, or score.
 */
export type OrchestraRenderChoreography = Readonly<{
	reveal01: number;
	trailHead01: number;
	rawMix01: number;
	weatherMix01: number;
	voiceMix01: number;
}>;

export type OrchestraFeatureChannels = Readonly<{
	/** Oldest = 0, newest = 1. Omit to derive it from stable source order. */
	age01?: FloatChannel;
	noiseValue01?: FloatChannel;
	curvature01?: FloatChannel;
	density01?: FloatChannel;
	recurrence01?: FloatChannel;
	curlAngle01?: FloatChannel;
	region?: RegionChannel;
}>;

/**
 * Typed, renderer-facing source. Positions are projected observation coordinates, normally in
 * [0, 1]. A small overscan is permitted for weather displacement. `positionStride` may be 2 or 3;
 * a missing z component is filled with 0.5. No canonical dynamical state belongs in this type.
 */
export type OrchestraRenderPacketSource = Readonly<{
	rawPositions: FloatChannel;
	warpedPositions: FloatChannel;
	positionStride?: 2 | 3;
	pointCount?: number;
	features?: OrchestraFeatureChannels;
	/** Interleaved according to EVENT_PULSE_OFFSET and EVENT_PULSE_STRIDE. */
	eventPulses?: FloatChannel;
	eventCount?: number;
	view: OrchestraRenderView;
	lens: OrchestraNoiseLens;
	quality: OrchestraQualityTier;
	choreography?: Partial<OrchestraRenderChoreography>;
	sequence?: number;
	simulationTime?: number;
}>;

/** Fixed-capacity packet consumed by both renderers without per-point objects. */
export type OrchestraRenderPacket = {
	rawPositions: Float32Array;
	warpedPositions: Float32Array;
	features: Float32Array;
	eventPulses: Float32Array;
	/** Incremented only when position or feature storage is refilled. */
	geometryRevision: number;
	/** Incremented only when the interleaved event-pulse storage changes. */
	eventRevision: number;
	pointCount: number;
	eventCount: number;
	view: OrchestraRenderView;
	lens: OrchestraNoiseLens;
	quality: OrchestraQualityTier;
	choreography: OrchestraRenderChoreography;
	sequence: number;
	simulationTime: number;
};

export type OrchestraRenderStats = Readonly<{
	kind: OrchestraRendererKind;
	pointCount: number;
	eventCount: number;
	drawCalls: number;
	skipped: boolean;
	reason?: 'suspended' | 'context-lost' | 'disposed' | 'empty';
}>;

export type OrchestraSurfaceSize = Readonly<{
	cssWidth: number;
	cssHeight: number;
	pixelWidth: number;
	pixelHeight: number;
	pixelRatio: number;
}>;

export type OrchestraRendererCallbacks = Readonly<{
	onStatus?: (status: OrchestraRendererStatus, message: string) => void;
}>;

export type OrchestraRendererOptions = OrchestraRendererCallbacks &
	Readonly<{
		quality?: OrchestraQualityTier;
		devicePixelRatio?: number;
		background?: readonly [number, number, number];
	}>;

/** Renderers own no animation clock; a host decides when to call render. */
export interface OrchestraRenderer {
	readonly kind: OrchestraRendererKind;
	readonly status: OrchestraRendererStatus;
	readonly surface: OrchestraSurfaceSize;
	resize(
		cssWidth: number,
		cssHeight: number,
		devicePixelRatio?: number,
		quality?: OrchestraQualityTier
	): OrchestraSurfaceSize;
	render(packet: Readonly<OrchestraRenderPacket>): OrchestraRenderStats;
	setSuspended(suspended: boolean): void;
	dispose(): void;
}
