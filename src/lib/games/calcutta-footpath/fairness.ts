export interface Point {
	x: number;
	y: number;
}

export interface Rectangle extends Point {
	width: number;
	height: number;
}

export interface RouteBlocker extends Rectangle {
	id: string;
	blocking?: boolean;
	padding?: number;
}

export interface RouteFairnessInput {
	bounds: Rectangle;
	blockers: readonly RouteBlocker[];
	minimumRouteWidth: number;
	cellSize?: number;
	start?: Point;
	destination?: Point;
}

export type RouteFairnessReason =
	| 'route-available'
	| 'route-sealed'
	| 'start-blocked'
	| 'destination-blocked'
	| 'route-too-narrow'
	| 'invalid-bounds';

export interface RouteFairnessResult {
	fair: boolean;
	reason: RouteFairnessReason;
	path: readonly Point[];
	minimumEscapeWidth: number;
	bottleneckX: number;
}

export interface SpawnCircle extends Point {
	radius?: number;
}

export interface SpawnExclusionZone extends Point {
	id: string;
	radius: number;
}

export type SpawnThreat =
	| 'food'
	| 'pedestrian'
	| 'animal'
	| 'obstacle'
	| 'vehicle'
	| 'high-speed-vehicle';

export interface SpawnCheckResult {
	allowed: boolean;
	reason: 'clear' | 'outside-bounds' | 'excluded';
	zoneId: string | null;
}

const THREAT_EXCLUSION_DISTANCE: Readonly<Record<SpawnThreat, number>> = {
	food: 28,
	pedestrian: 48,
	animal: 68,
	obstacle: 76,
	vehicle: 120,
	'high-speed-vehicle': 190
};

function finite(value: number): boolean {
	return typeof value === 'number' && Number.isFinite(value);
}

function validRectangle(rectangle: Rectangle): boolean {
	return (
		finite(rectangle.x) &&
		finite(rectangle.y) &&
		finite(rectangle.width) &&
		finite(rectangle.height) &&
		rectangle.width > 0 &&
		rectangle.height > 0
	);
}

function blockerPadding(blocker: RouteBlocker): number {
	return finite(blocker.padding ?? 0) ? Math.max(0, blocker.padding ?? 0) : 0;
}

function isBlocking(blocker: RouteBlocker): boolean {
	return blocker.blocking !== false && validRectangle(blocker);
}

function blocksPoint(blocker: RouteBlocker, point: Point, clearance: number): boolean {
	if (!isBlocking(blocker)) return false;
	const padding = blockerPadding(blocker) + clearance;
	return (
		point.x > blocker.x - padding &&
		point.x < blocker.x + blocker.width + padding &&
		point.y > blocker.y - padding &&
		point.y < blocker.y + blocker.height + padding
	);
}

function axisSamples(minimum: number, maximum: number, step: number): number[] {
	if (maximum <= minimum) return [minimum];
	const samples: number[] = [];
	for (let value = minimum; value < maximum; value += step) samples.push(value);
	if (samples.at(-1) !== maximum) samples.push(maximum);
	return samples;
}

function addCriticalSamples(
	samples: readonly number[],
	minimum: number,
	maximum: number,
	values: readonly number[]
): number[] {
	const combined = [...samples];
	for (const value of values) {
		if (finite(value) && value >= minimum && value <= maximum) combined.push(value);
	}
	combined.sort((left, right) => left - right);
	return combined.filter(
		(value, index) => index === 0 || Math.abs(value - combined[index - 1]) > 0.001
	);
}

function mergeIntervals(intervals: readonly [number, number][]): [number, number][] {
	const sorted = [...intervals].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
	const merged: [number, number][] = [];
	for (const interval of sorted) {
		const previous = merged.at(-1);
		if (!previous || interval[0] > previous[1]) {
			merged.push([...interval]);
		} else {
			previous[1] = Math.max(previous[1], interval[1]);
		}
	}
	return merged;
}

export function measureEscapeWidthAtX(
	bounds: Rectangle,
	blockers: readonly RouteBlocker[],
	x: number
): number {
	if (!validRectangle(bounds) || !finite(x)) return 0;
	const minimumY = bounds.y;
	const maximumY = bounds.y + bounds.height;
	const intervals: [number, number][] = [];

	for (const blocker of blockers) {
		if (!isBlocking(blocker)) continue;
		const padding = blockerPadding(blocker);
		if (x < blocker.x - padding || x > blocker.x + blocker.width + padding) continue;
		const start = Math.max(minimumY, blocker.y - padding);
		const end = Math.min(maximumY, blocker.y + blocker.height + padding);
		if (end > start) intervals.push([start, end]);
	}

	let cursor = minimumY;
	let widestGap = 0;
	for (const [start, end] of mergeIntervals(intervals)) {
		widestGap = Math.max(widestGap, start - cursor);
		cursor = Math.max(cursor, end);
	}
	return Math.max(widestGap, maximumY - cursor);
}

function nearestIndex(samples: readonly number[], value: number): number {
	let closest = 0;
	let smallestDistance = Number.POSITIVE_INFINITY;
	for (let index = 0; index < samples.length; index += 1) {
		const distance = Math.abs(samples[index] - value);
		if (distance < smallestDistance) {
			smallestDistance = distance;
			closest = index;
		}
	}
	return closest;
}

function reconstructPath(
	predecessor: Int32Array,
	endIndex: number,
	xSamples: readonly number[],
	ySamples: readonly number[]
): Point[] {
	const path: Point[] = [];
	let index = endIndex;
	while (index >= 0) {
		const xIndex = index % xSamples.length;
		const yIndex = Math.floor(index / xSamples.length);
		path.push({ x: xSamples[xIndex], y: ySamples[yIndex] });
		index = predecessor[index];
	}
	return path.reverse();
}

export function checkRouteFairness(input: RouteFairnessInput): RouteFairnessResult {
	const { bounds } = input;
	if (!validRectangle(bounds) || !finite(input.minimumRouteWidth) || input.minimumRouteWidth <= 0) {
		return {
			fair: false,
			reason: 'invalid-bounds',
			path: [],
			minimumEscapeWidth: 0,
			bottleneckX: finite(bounds.x) ? bounds.x : 0
		};
	}

	const clearance = input.minimumRouteWidth / 2;
	const minimumX = bounds.x + clearance;
	const maximumX = bounds.x + bounds.width - clearance;
	const minimumY = bounds.y + clearance;
	const maximumY = bounds.y + bounds.height - clearance;
	if (maximumX < minimumX || maximumY < minimumY) {
		return {
			fair: false,
			reason: 'route-too-narrow',
			path: [],
			minimumEscapeWidth: Math.min(bounds.width, bounds.height),
			bottleneckX: bounds.x
		};
	}

	const requestedStep =
		finite(input.cellSize ?? Number.NaN) && (input.cellSize ?? 0) > 0
			? (input.cellSize as number)
			: Math.max(4, input.minimumRouteWidth / 3);
	const step = Math.max(2, requestedStep);
	const activeBlockers = input.blockers.filter(isBlocking);
	const xSamples = addCriticalSamples(axisSamples(minimumX, maximumX, step), minimumX, maximumX, [
		input.start?.x ?? Number.NaN,
		input.destination?.x ?? Number.NaN,
		...activeBlockers.flatMap((blocker) => {
			const padding = blockerPadding(blocker);
			return [
				blocker.x - padding - clearance,
				blocker.x + blocker.width / 2,
				blocker.x + blocker.width + padding + clearance
			];
		})
	]);
	const ySamples = addCriticalSamples(axisSamples(minimumY, maximumY, step), minimumY, maximumY, [
		input.start?.y ?? Number.NaN,
		input.destination?.y ?? Number.NaN,
		...activeBlockers.flatMap((blocker) => {
			const padding = blockerPadding(blocker);
			return [
				blocker.y - padding - clearance,
				blocker.y + blocker.height / 2,
				blocker.y + blocker.height + padding + clearance
			];
		})
	]);

	let minimumEscapeWidth = bounds.height;
	let bottleneckX = bounds.x;
	for (const x of xSamples) {
		const width = measureEscapeWidthAtX(bounds, activeBlockers, x);
		if (width < minimumEscapeWidth) {
			minimumEscapeWidth = width;
			bottleneckX = x;
		}
	}

	const cellCount = xSamples.length * ySamples.length;
	const blocked = new Uint8Array(cellCount);
	for (let yIndex = 0; yIndex < ySamples.length; yIndex += 1) {
		for (let xIndex = 0; xIndex < xSamples.length; xIndex += 1) {
			const point = { x: xSamples[xIndex], y: ySamples[yIndex] };
			if (activeBlockers.some((blocker) => blocksPoint(blocker, point, clearance))) {
				blocked[yIndex * xSamples.length + xIndex] = 1;
			}
		}
	}

	const startIndices: number[] = [];
	if (input.start) {
		if (
			!finite(input.start.x) ||
			!finite(input.start.y) ||
			input.start.x < minimumX ||
			input.start.x > maximumX ||
			input.start.y < minimumY ||
			input.start.y > maximumY
		) {
			return {
				fair: false,
				reason: 'start-blocked',
				path: [],
				minimumEscapeWidth,
				bottleneckX
			};
		}
		const startX = nearestIndex(xSamples, input.start.x);
		const startY = nearestIndex(ySamples, input.start.y);
		const startIndex = startY * xSamples.length + startX;
		if (blocked[startIndex]) {
			return {
				fair: false,
				reason: 'start-blocked',
				path: [],
				minimumEscapeWidth,
				bottleneckX
			};
		}
		startIndices.push(startIndex);
	} else {
		for (let yIndex = 0; yIndex < ySamples.length; yIndex += 1) {
			const index = yIndex * xSamples.length;
			if (!blocked[index]) startIndices.push(index);
		}
	}

	let destinationIndex: number | null = null;
	if (input.destination) {
		if (
			!finite(input.destination.x) ||
			!finite(input.destination.y) ||
			input.destination.x < minimumX ||
			input.destination.x > maximumX ||
			input.destination.y < minimumY ||
			input.destination.y > maximumY
		) {
			return {
				fair: false,
				reason: 'destination-blocked',
				path: [],
				minimumEscapeWidth,
				bottleneckX
			};
		}
		const destinationX = nearestIndex(xSamples, input.destination.x);
		const destinationY = nearestIndex(ySamples, input.destination.y);
		destinationIndex = destinationY * xSamples.length + destinationX;
		if (blocked[destinationIndex]) {
			return {
				fair: false,
				reason: 'destination-blocked',
				path: [],
				minimumEscapeWidth,
				bottleneckX
			};
		}
	}

	if (startIndices.length === 0) {
		return {
			fair: false,
			reason: 'start-blocked',
			path: [],
			minimumEscapeWidth,
			bottleneckX
		};
	}

	const predecessor = new Int32Array(cellCount);
	predecessor.fill(-2);
	const queue = new Int32Array(cellCount);
	let queueStart = 0;
	let queueEnd = 0;
	for (const startIndex of startIndices) {
		predecessor[startIndex] = -1;
		queue[queueEnd] = startIndex;
		queueEnd += 1;
	}

	let reached = -1;
	while (queueStart < queueEnd) {
		const index = queue[queueStart];
		queueStart += 1;
		const xIndex = index % xSamples.length;
		const yIndex = Math.floor(index / xSamples.length);

		if (destinationIndex !== null ? index === destinationIndex : xIndex === xSamples.length - 1) {
			reached = index;
			break;
		}

		for (const [nextX, nextY] of [
			[xIndex + 1, yIndex],
			[xIndex - 1, yIndex],
			[xIndex, yIndex + 1],
			[xIndex, yIndex - 1]
		] as const) {
			if (nextX < 0 || nextX >= xSamples.length || nextY < 0 || nextY >= ySamples.length) {
				continue;
			}
			const nextIndex = nextY * xSamples.length + nextX;
			if (blocked[nextIndex] || predecessor[nextIndex] !== -2) continue;
			predecessor[nextIndex] = index;
			queue[queueEnd] = nextIndex;
			queueEnd += 1;
		}
	}

	return reached >= 0
		? {
				fair: true,
				reason: 'route-available',
				path: reconstructPath(predecessor, reached, xSamples, ySamples),
				minimumEscapeWidth,
				bottleneckX
			}
		: {
				fair: false,
				reason: 'route-sealed',
				path: [],
				minimumEscapeWidth,
				bottleneckX
			};
}

export function createPlayerSpawnExclusion(
	player: SpawnCircle,
	threat: SpawnThreat,
	extraDistance = 0
): SpawnExclusionZone {
	const radius = Math.max(0, finite(player.radius ?? 0) ? (player.radius ?? 0) : 0);
	const extra = Math.max(0, finite(extraDistance) ? extraDistance : 0);
	return {
		id: 'player',
		x: player.x,
		y: player.y,
		radius: radius + THREAT_EXCLUSION_DISTANCE[threat] + extra
	};
}

export function checkSpawnAllowed(
	candidate: SpawnCircle,
	exclusionZones: readonly SpawnExclusionZone[],
	bounds?: Rectangle
): SpawnCheckResult {
	const radius = Math.max(0, finite(candidate.radius ?? 0) ? (candidate.radius ?? 0) : 0);
	if (!finite(candidate.x) || !finite(candidate.y)) {
		return { allowed: false, reason: 'outside-bounds', zoneId: null };
	}

	if (
		bounds &&
		(!validRectangle(bounds) ||
			candidate.x - radius < bounds.x ||
			candidate.x + radius > bounds.x + bounds.width ||
			candidate.y - radius < bounds.y ||
			candidate.y + radius > bounds.y + bounds.height)
	) {
		return { allowed: false, reason: 'outside-bounds', zoneId: null };
	}

	for (const zone of exclusionZones) {
		const zoneRadius = Math.max(0, finite(zone.radius) ? zone.radius : 0);
		const minimumDistance = radius + zoneRadius;
		if (Math.hypot(candidate.x - zone.x, candidate.y - zone.y) < minimumDistance) {
			return { allowed: false, reason: 'excluded', zoneId: zone.id };
		}
	}

	return { allowed: true, reason: 'clear', zoneId: null };
}

export function filterSpawnCandidates<Value extends SpawnCircle>(
	candidates: readonly Value[],
	exclusionZones: readonly SpawnExclusionZone[],
	bounds?: Rectangle
): Value[] {
	return candidates.filter(
		(candidate) => checkSpawnAllowed(candidate, exclusionZones, bounds).allowed
	);
}
