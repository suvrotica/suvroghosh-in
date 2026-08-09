import type { AxisPoint, Vec2 } from './types';

const EPSILON = 1e-9;
const MAX_COORDINATE = 1_000_000;
const MAX_CONTROL_POINTS = 256;
const MIN_SAMPLES_PER_SEGMENT = 4;
const MAX_SAMPLES_PER_SEGMENT = 256;

export type ArcLengthLookup = Readonly<{
	controlPoints: readonly Vec2[];
	parameters: Float64Array;
	cumulativeLengths: Float64Array;
	positions: Float64Array;
	totalLength: number;
	segmentCount: number;
}>;

export type ArcLengthLookupOptions = Readonly<{
	samplesPerSegment?: number;
	repairSpacing?: number;
}>;

export type AxisSampleOptions = Readonly<{
	tangentEpsilon?: number;
	depth?: number | ((s: number, position: Vec2) => number);
}>;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function finiteCoordinate(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? clamp(value, -MAX_COORDINATE, MAX_COORDINATE)
		: fallback;
}

function boundedInteger(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return clamp(Math.round(value), minimum, maximum);
}

function distance(left: Vec2, right: Vec2): number {
	return Math.hypot(right.x - left.x, right.y - left.y);
}

function normalise(vector: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 {
	const magnitude = Math.hypot(vector.x, vector.y);
	if (!Number.isFinite(magnitude) || magnitude <= EPSILON) return fallback;
	return { x: vector.x / magnitude, y: vector.y / magnitude };
}

/**
 * Repairs hostile or degenerate control-point input without introducing entropy.
 * Keeping repair deterministic is important because the repaired axis contributes
 * to the creature fingerprint.
 */
export function repairAxisControlPoints(
	controlPoints: readonly Vec2[],
	repairSpacing = 1
): readonly Vec2[] {
	const spacing = clamp(
		Number.isFinite(repairSpacing) ? Math.abs(repairSpacing) : 1,
		1e-4,
		MAX_COORDINATE / 4
	);
	const source = controlPoints.slice(0, MAX_CONTROL_POINTS);
	if (source.length === 0) {
		return Object.freeze([
			Object.freeze({ x: -spacing * 0.5, y: 0 }),
			Object.freeze({ x: spacing * 0.5, y: 0 })
		]);
	}

	const repaired: Vec2[] = [];
	let previous: Vec2 = { x: 0, y: 0 };
	for (let index = 0; index < source.length; index += 1) {
		const candidate = source[index] as Partial<Vec2> | null | undefined;
		const point = {
			x: finiteCoordinate(candidate?.x, index === 0 ? 0 : previous.x + spacing),
			y: finiteCoordinate(candidate?.y, previous.y)
		};
		repaired.push(point);
		previous = point;
	}

	if (repaired.length === 1) {
		repaired.push({
			x: clamp(repaired[0].x + spacing, -MAX_COORDINATE, MAX_COORDINATE),
			y: repaired[0].y
		});
	}

	const origin = repaired[0];
	let maximumDisplacement = 0;
	for (let index = 1; index < repaired.length; index += 1) {
		maximumDisplacement = Math.max(maximumDisplacement, distance(origin, repaired[index]));
	}
	if (maximumDisplacement <= EPSILON) {
		const centre = { ...origin };
		const denominator = Math.max(1, repaired.length - 1);
		for (let index = 0; index < repaired.length; index += 1) {
			repaired[index] = {
				x: clamp(centre.x + spacing * (index / denominator - 0.5), -MAX_COORDINATE, MAX_COORDINATE),
				y: centre.y
			};
		}
	}

	return Object.freeze(repaired.map((point) => Object.freeze(point)));
}

/** Uniform Catmull-Rom segment evaluation, with endpoints supplied explicitly. */
export function catmullRomPoint(
	point0: Vec2,
	point1: Vec2,
	point2: Vec2,
	point3: Vec2,
	t: number
): Vec2 {
	const boundedT = clamp(Number.isFinite(t) ? t : 0, 0, 1);
	const t2 = boundedT * boundedT;
	const t3 = t2 * boundedT;
	return {
		x:
			0.5 *
			(2 * point1.x +
				(-point0.x + point2.x) * boundedT +
				(2 * point0.x - 5 * point1.x + 4 * point2.x - point3.x) * t2 +
				(-point0.x + 3 * point1.x - 3 * point2.x + point3.x) * t3),
		y:
			0.5 *
			(2 * point1.y +
				(-point0.y + point2.y) * boundedT +
				(2 * point0.y - 5 * point1.y + 4 * point2.y - point3.y) * t2 +
				(-point0.y + 3 * point1.y - 3 * point2.y + point3.y) * t3)
	};
}

function evaluateRawParameter(controlPoints: readonly Vec2[], parameter: number): Vec2 {
	const segmentCount = controlPoints.length - 1;
	const bounded = clamp(Number.isFinite(parameter) ? parameter : 0, 0, segmentCount);
	const segment = Math.min(segmentCount - 1, Math.floor(bounded));
	const local = segment === segmentCount - 1 && bounded === segmentCount ? 1 : bounded - segment;
	const point0 = controlPoints[Math.max(0, segment - 1)];
	const point1 = controlPoints[segment];
	const point2 = controlPoints[Math.min(controlPoints.length - 1, segment + 1)];
	const point3 = controlPoints[Math.min(controlPoints.length - 1, segment + 2)];
	return catmullRomPoint(point0, point1, point2, point3, local);
}

/**
 * Samples densely in raw spline parameter and accumulates physical distance.
 * Consumers then use cumulative distance as the measuring tape for body plates.
 */
export function buildArcLengthLookup(
	controlPoints: readonly Vec2[],
	options: ArcLengthLookupOptions = {}
): ArcLengthLookup {
	const repaired = repairAxisControlPoints(controlPoints, options.repairSpacing);
	const segmentCount = repaired.length - 1;
	const samplesPerSegment = boundedInteger(
		options.samplesPerSegment,
		32,
		MIN_SAMPLES_PER_SEGMENT,
		MAX_SAMPLES_PER_SEGMENT
	);
	const sampleCount = segmentCount * samplesPerSegment + 1;
	const parameters = new Float64Array(sampleCount);
	const cumulativeLengths = new Float64Array(sampleCount);
	const positions = new Float64Array(sampleCount * 2);
	let totalLength = 0;
	let previous = evaluateRawParameter(repaired, 0);

	for (let index = 0; index < sampleCount; index += 1) {
		const parameter = (index / (sampleCount - 1)) * segmentCount;
		const point = evaluateRawParameter(repaired, parameter);
		if (index > 0) totalLength += distance(previous, point);
		parameters[index] = parameter;
		cumulativeLengths[index] = totalLength;
		positions[index * 2] = finiteCoordinate(point.x, previous.x);
		positions[index * 2 + 1] = finiteCoordinate(point.y, previous.y);
		previous = point;
	}

	// repairAxisControlPoints guarantees a non-zero span, but retain a bounded
	// last-resort table in case floating-point cancellation defeats that promise.
	if (!Number.isFinite(totalLength) || totalLength <= EPSILON) {
		totalLength = 1;
		for (let index = 0; index < sampleCount; index += 1) {
			const unit = index / (sampleCount - 1);
			cumulativeLengths[index] = unit;
			positions[index * 2] = repaired[0].x + unit;
			positions[index * 2 + 1] = repaired[0].y;
		}
	}

	return {
		controlPoints: repaired,
		parameters,
		cumulativeLengths,
		positions,
		totalLength,
		segmentCount
	};
}

function lowerBound(values: Float64Array, target: number): number {
	let low = 0;
	let high = values.length - 1;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (values[middle] < target) low = middle + 1;
		else high = middle;
	}
	return low;
}

export function sampleAxisPosition(lookup: ArcLengthLookup, s: number): Vec2 {
	const normalized = clamp(Number.isFinite(s) ? s : 0, 0, 1);
	const targetLength = normalized * lookup.totalLength;
	const upper = lowerBound(lookup.cumulativeLengths, targetLength);
	if (upper <= 0) return { x: lookup.positions[0], y: lookup.positions[1] };
	const lower = upper - 1;
	const lowerLength = lookup.cumulativeLengths[lower];
	const upperLength = lookup.cumulativeLengths[upper];
	const span = upperLength - lowerLength;
	const mix = span <= EPSILON ? 0 : (targetLength - lowerLength) / span;
	return {
		x:
			lookup.positions[lower * 2] +
			(lookup.positions[upper * 2] - lookup.positions[lower * 2]) * mix,
		y:
			lookup.positions[lower * 2 + 1] +
			(lookup.positions[upper * 2 + 1] - lookup.positions[lower * 2 + 1]) * mix
	};
}

export function sampleAxisPoint(
	lookup: ArcLengthLookup,
	s: number,
	options: AxisSampleOptions = {}
): AxisPoint {
	const normalizedS = clamp(Number.isFinite(s) ? s : 0, 0, 1);
	const position = sampleAxisPosition(lookup, normalizedS);
	const epsilon = clamp(
		Number.isFinite(options.tangentEpsilon) ? Math.abs(options.tangentEpsilon as number) : 1e-3,
		1e-6,
		0.1
	);
	const beforeS = Math.max(0, normalizedS - epsilon);
	const afterS = Math.min(1, normalizedS + epsilon);
	const before = sampleAxisPosition(lookup, beforeS);
	const after = sampleAxisPosition(lookup, afterS);
	let tangent = normalise({ x: after.x - before.x, y: after.y - before.y });

	if (!Number.isFinite(tangent.x) || !Number.isFinite(tangent.y)) tangent = { x: 1, y: 0 };
	const normal = { x: -tangent.y, y: tangent.x };
	const requestedDepth =
		typeof options.depth === 'function'
			? options.depth(normalizedS, position)
			: (options.depth ?? 0);
	const depth = Number.isFinite(requestedDepth) ? requestedDepth : 0;

	return { s: normalizedS, position, tangent, normal, depth };
}

export function sampleAxisPoints(
	lookup: ArcLengthLookup,
	normalizedPositions: readonly number[],
	options: AxisSampleOptions = {}
): readonly AxisPoint[] {
	return normalizedPositions.map((s) => sampleAxisPoint(lookup, s, options));
}

export function buildBodyAxis(
	controlPoints: readonly Vec2[],
	pointCount: number,
	options: ArcLengthLookupOptions & AxisSampleOptions = {}
): readonly AxisPoint[] {
	const count = boundedInteger(pointCount, 2, 1, 1_024);
	const lookup = buildArcLengthLookup(controlPoints, options);
	if (count === 1) return [sampleAxisPoint(lookup, 0.5, options)];
	return Array.from({ length: count }, (_, index) =>
		sampleAxisPoint(lookup, index / (count - 1), options)
	);
}
