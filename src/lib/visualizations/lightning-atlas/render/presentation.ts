import type { LightningSegment, QualityTier } from '../types';

export type BranchEmphasis = 'primary' | 'full';
export type EventCameraPreset = 'hero' | 'wide';

export type EventBounds = {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	minZ: number;
	maxZ: number;
};

export type EventFraming = {
	centerX: number;
	centerY: number;
	centerZ: number;
	horizontalSpan: number;
	height: number;
	lineOfSightDistance: number;
	projectedHeightRatio: number;
	projectedWidthRatio: number;
};

const FALLBACK_THICKNESS = [1, 0.56, 0.32, 0.18] as const;
const FALLBACK_BRIGHTNESS = [1, 0.78, 0.54, 0.34] as const;
const FALLBACK_PERSISTENCE = [1, 0.76, 0.54, 0.34] as const;

const clamp = (value: number, minimum: number, maximum: number) =>
	Math.max(minimum, Math.min(maximum, value));

export function segmentHierarchy(segment: LightningSegment): 0 | 1 | 2 | 3 {
	if (segment.isMainChannel || segment.channelClass === 'main') return 0;
	if (segment.channelClass === 'primary') return 1;
	if (segment.channelClass === 'secondary') return 2;
	if (segment.channelClass === 'tertiary') return 3;
	const depth = Number.isFinite(segment.hierarchyDepth)
		? segment.hierarchyDepth
		: segment.branchDepth;
	return clamp(Math.round(depth || 1), 1, 3) as 1 | 2 | 3;
}

export function segmentRelativeThickness(segment: LightningSegment): number {
	const hierarchy = segmentHierarchy(segment);
	return clamp(
		Number.isFinite(segment.relativeThickness)
			? segment.relativeThickness
			: FALLBACK_THICKNESS[hierarchy],
		0.12,
		1.8
	);
}

export function segmentRelativeBrightness(segment: LightningSegment): number {
	const hierarchy = segmentHierarchy(segment);
	return clamp(
		Number.isFinite(segment.relativeBrightness)
			? segment.relativeBrightness
			: FALLBACK_BRIGHTNESS[hierarchy],
		0.18,
		1.15
	);
}

export function segmentPersistence(segment: LightningSegment): number {
	const hierarchy = segmentHierarchy(segment);
	return clamp(
		Number.isFinite(segment.persistence) ? segment.persistence : FALLBACK_PERSISTENCE[hierarchy],
		0.2,
		1
	);
}

export function shouldPresentSegment(
	segment: LightningSegment,
	showBranches: boolean,
	emphasis: BranchEmphasis,
	quality: QualityTier
): boolean {
	const hierarchy = segmentHierarchy(segment);
	if (!showBranches) return hierarchy === 0;
	if (emphasis === 'primary') return hierarchy <= 1;
	return quality !== 'low' || hierarchy <= 2;
}

function includePoint(bounds: EventBounds, x: number, y: number, z: number): void {
	bounds.minX = Math.min(bounds.minX, x);
	bounds.maxX = Math.max(bounds.maxX, x);
	bounds.minY = Math.min(bounds.minY, y);
	bounds.maxY = Math.max(bounds.maxY, y);
	bounds.minZ = Math.min(bounds.minZ, z);
	bounds.maxZ = Math.max(bounds.maxZ, z);
}

function boundsForHierarchy(
	segments: readonly LightningSegment[],
	maximumHierarchy: number
): EventBounds | null {
	const bounds: EventBounds = {
		minX: Number.POSITIVE_INFINITY,
		maxX: Number.NEGATIVE_INFINITY,
		minY: Number.POSITIVE_INFINITY,
		maxY: Number.NEGATIVE_INFINITY,
		minZ: Number.POSITIVE_INFINITY,
		maxZ: Number.NEGATIVE_INFINITY
	};
	let included = 0;
	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		if (segmentHierarchy(segment) > maximumHierarchy) continue;
		includePoint(bounds, segment.start.x, segment.start.y, segment.start.z);
		includePoint(bounds, segment.end.x, segment.end.y, segment.end.z);
		included += 1;
	}
	return included ? bounds : null;
}

/** Bounds the coherent main-and-primary network so tiny tertiary outliers cannot shrink the hero. */
export function majorEventBounds(segments: readonly LightningSegment[]): EventBounds | null {
	return boundsForHierarchy(segments, 1) ?? boundsForHierarchy(segments, 3);
}

/** Orients the camera so the coherent horizontal canopy projects across the screen. */
export function dominantEventYaw(
	segments: readonly LightningSegment[],
	fallbackYaw: number
): number {
	let yaw = 0;
	let maximumSpan = Number.NEGATIVE_INFINITY;
	for (let sample = 0; sample < 32; sample += 1) {
		const candidateYaw = (sample / 32) * Math.PI;
		const span = majorProjectedSpan(segments, candidateYaw);
		if (span > maximumSpan + 1e-6) {
			maximumSpan = span;
			yaw = candidateYaw;
		}
	}
	if (maximumSpan < 1) return fallbackYaw;
	return yaw;
}

export function majorProjectedSpan(segments: readonly LightningSegment[], yaw: number): number {
	const rightX = -Math.sin(yaw);
	const rightZ = Math.cos(yaw);
	let minimum = Number.POSITIVE_INFINITY;
	let maximum = Number.NEGATIVE_INFINITY;
	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		if (segmentHierarchy(segment) > 1) continue;
		const start = segment.start.x * rightX + segment.start.z * rightZ;
		const end = segment.end.x * rightX + segment.end.z * rightZ;
		minimum = Math.min(minimum, start, end);
		maximum = Math.max(maximum, start, end);
	}
	return Number.isFinite(minimum) ? maximum - minimum : 0;
}

/**
 * Produces a deterministic perspective fit. Ratios are fractions of the viewport's visible
 * height/width under the camera's vertical/horizontal field of view.
 */
export function calculateEventFraming(
	bounds: EventBounds,
	aspect: number,
	verticalFovDegrees: number,
	yaw: number,
	preset: EventCameraPreset,
	projectedHorizontalSpan?: number
): EventFraming {
	const safeAspect = Math.max(0.35, aspect);
	const verticalTangent = Math.tan((clamp(verticalFovDegrees, 30, 75) * Math.PI) / 360);
	const horizontalTangent = verticalTangent * safeAspect;
	const spanX = Math.max(1, bounds.maxX - bounds.minX);
	const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
	const height = Math.max(320, bounds.maxY - bounds.minY);
	const horizontalSpan = Math.max(
		320,
		projectedHorizontalSpan ?? Math.abs(Math.sin(yaw)) * spanX + Math.abs(Math.cos(yaw)) * spanZ
	);
	const narrow = safeAspect < 0.8;
	const targetHeight = preset === 'hero' ? 0.72 : 0.52;
	const targetWidth = preset === 'hero' ? (narrow ? 0.7 : 0.54) : narrow ? 0.62 : 0.44;
	const heightDistance = height / (2 * verticalTangent * targetHeight);
	const widthDistance = horizontalSpan / (2 * horizontalTangent * targetWidth);
	const minimumDistance = Math.max(
		height / (2 * verticalTangent * 0.78),
		horizontalSpan / (2 * horizontalTangent * (narrow ? 0.74 : 0.6))
	);
	const maximumDistance = Math.min(
		height / (2 * verticalTangent * (preset === 'hero' ? 0.4 : 0.32)),
		horizontalSpan / (2 * horizontalTangent * 0.25)
	);
	const desiredDistance = Math.max(heightDistance, widthDistance);
	const lineOfSightDistance =
		minimumDistance <= maximumDistance
			? clamp(desiredDistance, minimumDistance, maximumDistance)
			: minimumDistance;

	return {
		centerX: (bounds.minX + bounds.maxX) * 0.5,
		centerY: (bounds.minY + bounds.maxY) * 0.5,
		centerZ: (bounds.minZ + bounds.maxZ) * 0.5,
		horizontalSpan,
		height,
		lineOfSightDistance,
		projectedHeightRatio: height / (2 * lineOfSightDistance * verticalTangent),
		projectedWidthRatio: horizontalSpan / (2 * lineOfSightDistance * horizontalTangent)
	};
}
