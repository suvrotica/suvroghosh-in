import { createNamedStream, normalizeSeed } from './seed';
import type { SurfaceSample, Vec2 } from './types';

const EPSILON = 1e-9;
const MAX_RADIUS = 100_000;
const MAX_SAMPLES = 2_048;
const MAX_ATTEMPTS = 262_144;

export type GeneralizedSuperellipseMask = Readonly<{
	radiusX: number;
	radiusY: number;
	exponent: number;
	lobeAmplitude?: number;
	lobeCount?: number;
	lobePhase?: number;
}>;

export type MinimumDistanceSamplingOptions = Readonly<{
	seed: string;
	count: number;
	minimumDistance: number;
	mask: GeneralizedSuperellipseMask;
	edgePadding?: number;
	maxAttempts?: number;
	namespace?: string;
}>;

export type MinimumDistanceSamplingResult = Readonly<{
	points: readonly Vec2[];
	requested: number;
	minimumDistance: number;
	attempts: number;
	exhausted: boolean;
	mask: GeneralizedSuperellipseMask;
}>;

export type SurfaceSampleGenerationOptions = MinimumDistanceSamplingOptions &
	Readonly<{
		plateIndex: number;
		kind: SurfaceSample['kind'];
		minimumScale?: number;
		maximumScale?: number;
		radialAngle?: boolean;
	}>;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boundedInteger(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	return clamp(Math.round(finite(value, fallback)), minimum, maximum);
}

export function normalizeSuperellipseMask(
	mask: GeneralizedSuperellipseMask
): GeneralizedSuperellipseMask {
	return {
		radiusX: clamp(Math.abs(finite(mask.radiusX, 1)), 1e-4, MAX_RADIUS),
		radiusY: clamp(Math.abs(finite(mask.radiusY, 1)), 1e-4, MAX_RADIUS),
		exponent: clamp(Math.abs(finite(mask.exponent, 2)), 0.25, 16),
		lobeAmplitude: clamp(finite(mask.lobeAmplitude, 0), -0.35, 0.35),
		lobeCount: boundedInteger(mask.lobeCount, 0, 0, 32),
		lobePhase: finite(mask.lobePhase, 0)
	};
}

/**
 * Practical generalized-superellipse contour value. Zero is central, one is on
 * the modulated boundary, and values below one are inside the plate mask.
 */
export function generalizedSuperellipseMaskValue(
	point: Vec2,
	maskInput: GeneralizedSuperellipseMask
): number {
	const mask = normalizeSuperellipseMask(maskInput);
	const normalizedX = finite(point.x, Number.POSITIVE_INFINITY) / mask.radiusX;
	const normalizedY = finite(point.y, Number.POSITIVE_INFINITY) / mask.radiusY;
	if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) {
		return Number.POSITIVE_INFINITY;
	}
	const radial = Math.pow(
		Math.pow(Math.abs(normalizedX), mask.exponent) + Math.pow(Math.abs(normalizedY), mask.exponent),
		1 / mask.exponent
	);
	const lobeCount = mask.lobeCount ?? 0;
	const modulation =
		lobeCount > 0
			? clamp(
					1 +
						(mask.lobeAmplitude ?? 0) *
							Math.cos(lobeCount * Math.atan2(normalizedY, normalizedX) + (mask.lobePhase ?? 0)),
					0.55,
					1.45
				)
			: 1;
	return radial / modulation;
}

export function isInsideGeneralizedSuperellipse(
	point: Vec2,
	mask: GeneralizedSuperellipseMask,
	edgePadding = 0
): boolean {
	const normalized = normalizeSuperellipseMask(mask);
	const padding = clamp(
		Math.abs(finite(edgePadding, 0)) / Math.min(normalized.radiusX, normalized.radiusY),
		0,
		0.95
	);
	return generalizedSuperellipseMaskValue(point, normalized) <= 1 - padding + EPSILON;
}

function gridKey(x: number, y: number): string {
	return `${x}:${y}`;
}

/** Bounded deterministic dart throwing with a local grid for neighbour checks. */
export function sampleMinimumDistanceInSuperellipse(
	options: MinimumDistanceSamplingOptions
): MinimumDistanceSamplingResult {
	const mask = normalizeSuperellipseMask(options.mask);
	const requested = boundedInteger(options.count, 0, 0, MAX_SAMPLES);
	const maximumUsefulDistance = Math.hypot(mask.radiusX * 2, mask.radiusY * 2);
	const minimumDistance = clamp(
		Math.abs(finite(options.minimumDistance, 0.01)),
		1e-6,
		Math.max(1e-6, maximumUsefulDistance)
	);
	const defaultAttempts = Math.max(128, requested * 96);
	const maxAttempts = boundedInteger(options.maxAttempts, defaultAttempts, 1, MAX_ATTEMPTS);
	const edgePadding = clamp(
		Math.abs(finite(options.edgePadding, 0)),
		0,
		Math.min(mask.radiusX, mask.radiusY) * 0.95
	);
	const namespace = options.namespace?.trim() || 'surface-sampling';
	const stream = createNamedStream(normalizeSeed(options.seed), namespace);
	const points: Vec2[] = [];
	if (requested === 0) {
		return { points, requested, minimumDistance, attempts: 0, exhausted: false, mask };
	}

	const lobeExtent = 1 + Math.abs(mask.lobeAmplitude ?? 0);
	const boundX = mask.radiusX * lobeExtent;
	const boundY = mask.radiusY * lobeExtent;
	const cellSize = minimumDistance / Math.SQRT2;
	const neighborRadius = Math.max(1, Math.ceil(minimumDistance / cellSize));
	const grid = new Map<string, number[]>();
	const minimumDistanceSquared = minimumDistance * minimumDistance;
	let attempts = 0;

	while (points.length < requested && attempts < maxAttempts) {
		attempts += 1;
		const candidate = {
			x: stream.float(-boundX, boundX),
			y: stream.float(-boundY, boundY)
		};
		if (!isInsideGeneralizedSuperellipse(candidate, mask, edgePadding)) continue;

		const gridX = Math.floor((candidate.x + boundX) / cellSize);
		const gridY = Math.floor((candidate.y + boundY) / cellSize);
		let accepted = true;
		for (let y = gridY - neighborRadius; y <= gridY + neighborRadius && accepted; y += 1) {
			for (let x = gridX - neighborRadius; x <= gridX + neighborRadius; x += 1) {
				for (const pointIndex of grid.get(gridKey(x, y)) ?? []) {
					const point = points[pointIndex];
					const dx = point.x - candidate.x;
					const dy = point.y - candidate.y;
					if (dx * dx + dy * dy < minimumDistanceSquared - EPSILON) {
						accepted = false;
						break;
					}
				}
				if (!accepted) break;
			}
		}
		if (!accepted) continue;

		const pointIndex = points.length;
		points.push(candidate);
		const key = gridKey(gridX, gridY);
		const cell = grid.get(key);
		if (cell) cell.push(pointIndex);
		else grid.set(key, [pointIndex]);
	}

	return {
		points,
		requested,
		minimumDistance,
		attempts,
		exhausted: points.length < requested,
		mask
	};
}

export function generateSurfaceSamples(
	options: SurfaceSampleGenerationOptions
): readonly SurfaceSample[] {
	const namespace = options.namespace?.trim() || `surface:${options.plateIndex}:${options.kind}`;
	const placement = sampleMinimumDistanceInSuperellipse({
		...options,
		namespace: `${namespace}:placement`
	});
	const attributeStream = createNamedStream(normalizeSeed(options.seed), `${namespace}:attributes`);
	let minimumScale = clamp(Math.abs(finite(options.minimumScale, 0.5)), 1e-4, 1_000);
	let maximumScale = clamp(Math.abs(finite(options.maximumScale, 1)), 1e-4, 1_000);
	if (maximumScale < minimumScale) [minimumScale, maximumScale] = [maximumScale, minimumScale];
	const plateIndex = boundedInteger(options.plateIndex, 0, 0, 1_000_000);

	return placement.points.map((local) => {
		const radial = Math.atan2(local.y / placement.mask.radiusY, local.x / placement.mask.radiusX);
		return {
			plateIndex,
			local,
			kind: options.kind,
			scale: attributeStream.float(minimumScale, maximumScale),
			angle: options.radialAngle ? radial : attributeStream.float(-Math.PI, Math.PI)
		};
	});
}
