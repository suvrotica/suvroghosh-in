import type {
	AttractorDefinition,
	FeatureStreamData,
	GenerationProgress,
	SonificationFrame,
	TrajectoryData,
	WeatherData
} from '../types';
import { robustUnitNormalize } from './normalization';
import { getAttractorDefinition } from './registry';

const OCCUPANCY_RESOLUTION = 28;
const OCCUPANCY_CELL_COUNT = OCCUPANCY_RESOLUTION ** 3;
const SECTION_REFRACTORY_POINTS = 8;
const MAX_THEILER_WINDOW = 512;
const MIN_THEILER_WINDOW = 32;
const RECURRENCE_RADIUS = 0.035;

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function validateInputs(trajectory: TrajectoryData, weather: WeatherData): void {
	const count = trajectory.pointCount;
	if (
		trajectory.rawPositions.length !== count * 3 ||
		trajectory.normalizedPositions.length !== count * 3 ||
		trajectory.simulationSteps.length !== count ||
		trajectory.simulationTimes.length !== count
	) {
		throw new RangeError('Trajectory arrays do not share the declared point count.');
	}
	if (
		weather.warpedPositions.length !== count * 3 ||
		weather.value01.length !== count ||
		weather.gradient01.length !== count ||
		weather.curlAngle01.length !== count ||
		weather.cellBoundary01.length !== count
	) {
		throw new RangeError('Weather arrays do not share the trajectory point count.');
	}
}

function calculateKinematics(
	positions: Float64Array,
	times: Float64Array
): {
	speed01: Float64Array;
	curvature01: Float64Array;
	stretching01: Float64Array;
} {
	const count = times.length;
	const rawSpeed = new Float64Array(count);
	const rawCurvature = new Float64Array(count);
	const rawStretching = new Float64Array(count);
	let previousDistance = 0;
	for (let index = 1; index < count; index += 1) {
		const offset = index * 3;
		const previousOffset = offset - 3;
		const dx = positions[offset] - positions[previousOffset];
		const dy = positions[offset + 1] - positions[previousOffset + 1];
		const dz = positions[offset + 2] - positions[previousOffset + 2];
		const distance = Math.hypot(dx, dy, dz);
		const deltaTime = Math.max(1e-12, times[index] - times[index - 1]);
		rawSpeed[index] = distance / deltaTime;
		if (index > 1) {
			const earlierOffset = offset - 6;
			const previousX = positions[previousOffset] - positions[earlierOffset];
			const previousY = positions[previousOffset + 1] - positions[earlierOffset + 1];
			const previousZ = positions[previousOffset + 2] - positions[earlierOffset + 2];
			const previousLength = Math.hypot(previousX, previousY, previousZ);
			if (previousLength > 1e-12 && distance > 1e-12) {
				const cosine = Math.max(
					-1,
					Math.min(
						1,
						(previousX * dx + previousY * dy + previousZ * dz) / (previousLength * distance)
					)
				);
				rawCurvature[index] = Math.acos(cosine) / Math.PI;
			}
			rawStretching[index] = Math.abs(Math.log((distance + 1e-12) / (previousDistance + 1e-12)));
		}
		previousDistance = distance;
	}
	return {
		speed01: robustUnitNormalize(rawSpeed),
		// This fit is performed once over the completed post-transient feature buffer. It is
		// frozen before playback; neither the camera nor subsequent frames can refit it.
		curvature01: robustUnitNormalize(rawCurvature),
		stretching01: robustUnitNormalize(rawStretching)
	};
}

function cellCoordinate(value: number): number {
	return Math.max(
		0,
		Math.min(OCCUPANCY_RESOLUTION - 1, Math.floor(clamp01(value) * OCCUPANCY_RESOLUTION))
	);
}

function occupancyKey(position01: Float64Array, pointIndex: number): number {
	const offset = pointIndex * 3;
	const x = cellCoordinate(position01[offset]);
	const y = cellCoordinate(position01[offset + 1]);
	const z = cellCoordinate(position01[offset + 2]);
	return (z * OCCUPANCY_RESOLUTION + y) * OCCUPANCY_RESOLUTION + x;
}

export function recurrenceTheilerWindow(pointCount: number): number {
	if (!Number.isSafeInteger(pointCount) || pointCount < 2) {
		throw new RangeError('Recurrence point count must be an integer of at least two.');
	}
	return Math.min(
		pointCount - 1,
		Math.max(MIN_THEILER_WINDOW, Math.min(MAX_THEILER_WINDOW, Math.floor(pointCount / 24)))
	);
}

export function calculateRecurrenceAndDensity(
	position01: Float64Array,
	theilerWindow = recurrenceTheilerWindow(position01.length / 3)
): {
	recurrence01: Float64Array;
	density01: Float64Array;
} {
	if (position01.length % 3 !== 0 || position01.length < 6) {
		throw new RangeError('Recurrence positions must contain packed x/y/z points.');
	}
	const pointCount = position01.length / 3;
	if (!Number.isSafeInteger(theilerWindow) || theilerWindow < 1 || theilerWindow >= pointCount) {
		throw new RangeError('The recurrence Theiler window must be smaller than the point count.');
	}
	const recurrence01 = new Float64Array(pointCount);
	const density01 = new Float64Array(pointCount);
	const counts = new Uint16Array(OCCUPANCY_CELL_COUNT);
	// A typed spatial index keeps every eligible historical point, not merely the most
	// recent occupant of a cell, so the reported value is a true nonlocal nearest return.
	const eligibleCellHeads = new Int32Array(OCCUPANCY_CELL_COUNT);
	const nextEligibleInCell = new Int32Array(pointCount);
	eligibleCellHeads.fill(-1);
	nextEligibleInCell.fill(-1);
	for (let index = 0; index < pointCount; index += 1) {
		const offset = index * 3;
		const x = cellCoordinate(position01[offset]);
		const y = cellCoordinate(position01[offset + 1]);
		const z = cellCoordinate(position01[offset + 2]);
		const key = (z * OCCUPANCY_RESOLUTION + y) * OCCUPANCY_RESOLUTION + x;
		const count = counts[key];
		density01[index] = 1 - Math.exp(-count / 5);
		if (count < 0xffff) counts[key] = count + 1;

		// Only points outside the Theiler window enter the recurrence index. This prevents
		// ordinary along-curve persistence from masquerading as a return to old phase space.
		const eligibleIndex = index - theilerWindow - 1;
		if (eligibleIndex >= 0) {
			const eligibleKey = occupancyKey(position01, eligibleIndex);
			nextEligibleInCell[eligibleIndex] = eligibleCellHeads[eligibleKey];
			eligibleCellHeads[eligibleKey] = eligibleIndex;
		}
		let nearestDistanceSquared = Number.POSITIVE_INFINITY;
		for (let dz = -1; dz <= 1; dz += 1) {
			const neighbourZ = z + dz;
			if (neighbourZ < 0 || neighbourZ >= OCCUPANCY_RESOLUTION) continue;
			for (let dy = -1; dy <= 1; dy += 1) {
				const neighbourY = y + dy;
				if (neighbourY < 0 || neighbourY >= OCCUPANCY_RESOLUTION) continue;
				for (let dx = -1; dx <= 1; dx += 1) {
					const neighbourX = x + dx;
					if (neighbourX < 0 || neighbourX >= OCCUPANCY_RESOLUTION) continue;
					const neighbourKey =
						(neighbourZ * OCCUPANCY_RESOLUTION + neighbourY) * OCCUPANCY_RESOLUTION + neighbourX;
					let previous = eligibleCellHeads[neighbourKey];
					while (previous >= 0) {
						const previousOffset = previous * 3;
						const distanceSquared =
							(position01[offset] - position01[previousOffset]) ** 2 +
							(position01[offset + 1] - position01[previousOffset + 1]) ** 2 +
							(position01[offset + 2] - position01[previousOffset + 2]) ** 2;
						nearestDistanceSquared = Math.min(nearestDistanceSquared, distanceSquared);
						previous = nextEligibleInCell[previous];
					}
				}
			}
		}
		if (Number.isFinite(nearestDistanceSquared)) {
			recurrence01[index] = Math.exp(
				-nearestDistanceSquared / (2 * RECURRENCE_RADIUS * RECURRENCE_RADIUS)
			);
		}
	}
	return { recurrence01, density01 };
}

function classifyRegion(
	definition: AttractorDefinition,
	raw: Float64Array,
	position01: Float64Array,
	index: number
): number {
	const classifier = definition.regionClassifier;
	const offset = index * 3;
	switch (classifier.kind) {
		case 'axis-sign':
			return raw[offset + classifier.axis] < classifier.boundary ? 0 : 1;
		case 'angular': {
			const x = position01[offset + classifier.axes[0]] - 0.5;
			const y = position01[offset + classifier.axes[1]] - 0.5;
			const normalizedAngle = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI);
			return Math.min(classifier.sectors - 1, Math.floor(normalizedAngle * classifier.sectors));
		}
		case 'quantile':
			return Math.min(
				classifier.bins - 1,
				Math.floor(clamp01(position01[offset + classifier.axis]) * classifier.bins)
			);
	}
}

function normalizeReturnIntervals(intervals: Float64Array, directions: Int8Array): Float64Array {
	let minimum = Number.POSITIVE_INFINITY;
	let maximum = Number.NEGATIVE_INFINITY;
	let eventCount = 0;
	for (let index = 0; index < intervals.length; index += 1) {
		if (directions[index] === 0 || !(intervals[index] > 0)) continue;
		minimum = Math.min(minimum, intervals[index]);
		maximum = Math.max(maximum, intervals[index]);
		eventCount += 1;
	}
	const normalized = new Float64Array(intervals.length);
	if (eventCount === 0) return normalized;
	const span = maximum - minimum;
	for (let index = 0; index < intervals.length; index += 1) {
		if (directions[index] === 0) continue;
		normalized[index] = span > 1e-12 ? clamp01((intervals[index] - minimum) / span) : 0.5;
	}
	return normalized;
}

export function calculateSectionEvents(
	definition: AttractorDefinition,
	rawPositions: Float64Array,
	times: Float64Array
): { sectionDirection: Int8Array; returnInterval01: Float64Array } {
	const count = times.length;
	const direction = new Int8Array(count);
	const rawIntervals = new Float64Array(count);
	const section = definition.poincareSection;
	if (!section || count < 3) return { sectionDirection: direction, returnInterval01: rawIntervals };
	let lastEventIndex = -SECTION_REFRACTORY_POINTS;
	let lastEventTime: number | null = null;
	if (section.kind === 'plane') {
		const value = section.value ?? 0;
		const hysteresis = Math.max(section.hysteresis, 1e-12);
		const first = rawPositions[section.axis];
		let stableSide = first > value + hysteresis ? 1 : first < value - hysteresis ? -1 : 0;
		for (let index = 1; index < count; index += 1) {
			const current = rawPositions[index * 3 + section.axis];
			const nextSide = current > value + hysteresis ? 1 : current < value - hysteresis ? -1 : 0;
			if (nextSide === 0 || nextSide === stableSide) continue;
			const crossingDirection = nextSide as -1 | 1;
			const permitted = section.direction === 0 || section.direction === crossingDirection;
			if (stableSide !== 0 && permitted && index - lastEventIndex >= SECTION_REFRACTORY_POINTS) {
				direction[index] = crossingDirection;
				if (lastEventTime !== null) rawIntervals[index] = times[index] - lastEventTime;
				lastEventTime = times[index];
				lastEventIndex = index;
			}
			stableSide = nextSide;
		}
	} else {
		const epsilon = Math.max(section.hysteresis * 0.01, 1e-9);
		let stableSlope = 0;
		for (let index = 1; index < count; index += 1) {
			const delta =
				rawPositions[index * 3 + section.axis] - rawPositions[(index - 1) * 3 + section.axis];
			const slope = delta > epsilon ? 1 : delta < -epsilon ? -1 : 0;
			if (slope === 0 || slope === stableSlope) continue;
			const extremumDirection =
				stableSlope > 0 && slope < 0 ? 1 : stableSlope < 0 && slope > 0 ? -1 : 0;
			const permitted =
				extremumDirection !== 0 &&
				(section.direction === 0 || section.direction === extremumDirection);
			if (permitted && index - lastEventIndex >= SECTION_REFRACTORY_POINTS) {
				direction[index] = extremumDirection as -1 | 1;
				if (lastEventTime !== null) rawIntervals[index] = times[index] - lastEventTime;
				lastEventTime = times[index];
				lastEventIndex = index;
			}
			stableSlope = slope;
		}
	}
	return {
		sectionDirection: direction,
		returnInterval01: normalizeReturnIntervals(rawIntervals, direction)
	};
}

export interface ExtractFeatureOptions {
	readonly onProgress?: (progress: GenerationProgress) => void;
}

export function extractFeatureStream(
	trajectory: TrajectoryData,
	weather: WeatherData,
	options: ExtractFeatureOptions = {}
): FeatureStreamData {
	validateInputs(trajectory, weather);
	const definition = getAttractorDefinition(trajectory.attractorId);
	const count = trajectory.pointCount;
	const position01 = new Float64Array(count * 3);
	const warpedPosition01 = new Float64Array(count * 3);
	for (let index = 0; index < count * 3; index += 1) {
		position01[index] = clamp01((trajectory.normalizedPositions[index] + 1) / 2);
		warpedPosition01[index] = clamp01((weather.warpedPositions[index] + 1) / 2);
	}
	const kinematics = calculateKinematics(
		trajectory.normalizedPositions,
		trajectory.simulationTimes
	);
	const occupancy = calculateRecurrenceAndDensity(position01);
	const region = new Uint8Array(count);
	for (let index = 0; index < count; index += 1) {
		region[index] = classifyRegion(definition, trajectory.rawPositions, position01, index);
		if ((index + 1) % 2_048 === 0 || index + 1 === count) {
			options.onProgress?.({
				phase: 'features',
				completed: index + 1,
				total: count,
				progress01: (index + 1) / count
			});
		}
	}
	const section = calculateSectionEvents(
		definition,
		trajectory.rawPositions,
		trajectory.simulationTimes
	);
	return {
		pointCount: count,
		simulationSteps: trajectory.simulationSteps.slice(),
		simulationTimes: trajectory.simulationTimes.slice(),
		position01,
		warpedPosition01,
		speed01: kinematics.speed01,
		curvature01: kinematics.curvature01,
		stretching01: kinematics.stretching01,
		recurrence01: occupancy.recurrence01,
		density01: occupancy.density01,
		region,
		sectionDirection: section.sectionDirection,
		returnInterval01: section.returnInterval01,
		noiseValue01: weather.value01.slice(),
		noiseGradient01: weather.gradient01.slice(),
		noiseCurlAngle01: weather.curlAngle01.slice(),
		noiseCellBoundary01: weather.cellBoundary01.slice()
	};
}

export function sonificationFrameAt(features: FeatureStreamData, index: number): SonificationFrame {
	if (!Number.isSafeInteger(index) || index < 0 || index >= features.pointCount) {
		throw new RangeError('Sonification-frame index is outside the feature stream.');
	}
	const offset = index * 3;
	const sectionDirection = features.sectionDirection[index];
	return {
		step: features.simulationSteps[index],
		simulationTime: features.simulationTimes[index],
		position01: [
			features.position01[offset],
			features.position01[offset + 1],
			features.position01[offset + 2]
		],
		warpedPosition01: [
			features.warpedPosition01[offset],
			features.warpedPosition01[offset + 1],
			features.warpedPosition01[offset + 2]
		],
		speed01: features.speed01[index],
		curvature01: features.curvature01[index],
		stretching01: features.stretching01[index],
		recurrence01: features.recurrence01[index],
		density01: features.density01[index],
		region: features.region[index],
		...(sectionDirection === -1 || sectionDirection === 1
			? {
					sectionCrossing: {
						direction: sectionDirection,
						returnInterval01: features.returnInterval01[index]
					}
				}
			: {}),
		noise: {
			value01: features.noiseValue01[index],
			gradient01: features.noiseGradient01[index],
			curlAngle01: features.noiseCurlAngle01[index],
			cellBoundary01: features.noiseCellBoundary01[index]
		}
	};
}
