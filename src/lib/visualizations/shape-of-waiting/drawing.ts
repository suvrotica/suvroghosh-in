/** Browser-independent geometry and the fixed age scale shared by queue views. */
import type { Snapshot } from './types';

export interface QueuePoint {
	x: number;
	y: number;
}

const AGE_STOPS = [
	[0, 40, 127, 121],
	[30, 196, 156, 77],
	[90, 185, 81, 62],
	[180, 110, 36, 50]
] as const;

export function ageColour(minutes: number): string {
	const age = Math.max(0, minutes);
	for (let i = 1; i < AGE_STOPS.length; i++) {
		const left = AGE_STOPS[i - 1];
		const right = AGE_STOPS[i];
		if (age <= right[0]) {
			const fraction = (age - left[0]) / (right[0] - left[0]);
			return `rgb(${[1, 2, 3].map((channel) => Math.round(left[channel] + (right[channel] - left[channel]) * fraction)).join(', ')})`;
		}
	}
	return 'rgb(110, 36, 50)';
}

/** Two rounded perimeter turns leave a quiet, readable centre at every viewport. */
export function queuePath(width: number, height: number): QueuePoint[] {
	const gap = width < 450 ? 25 : 30;
	const left = width < 450 ? 22 : 33;
	const right = width - (width < 450 ? 77 : 100);
	const top = 49;
	const bottom = height - 45;
	const vertices: QueuePoint[] = [
		{ x: right, y: top },
		{ x: left, y: top },
		{ x: left, y: bottom },
		{ x: right, y: bottom },
		{ x: right, y: top + gap },
		{ x: left + gap, y: top + gap },
		{ x: left + gap, y: bottom - gap },
		{ x: right - gap, y: bottom - gap },
		{ x: right - gap, y: top + 2 * gap }
	];
	const points: QueuePoint[] = [vertices[0]];
	for (let i = 1; i < vertices.length - 1; i++) {
		const previous = vertices[i - 1];
		const vertex = vertices[i];
		const next = vertices[i + 1];
		const before = Math.hypot(previous.x - vertex.x, previous.y - vertex.y);
		const after = Math.hypot(next.x - vertex.x, next.y - vertex.y);
		const radius = Math.min(20, before / 3, after / 3);
		const enter = {
			x: vertex.x + ((previous.x - vertex.x) / before) * radius,
			y: vertex.y + ((previous.y - vertex.y) / before) * radius
		};
		const leave = {
			x: vertex.x + ((next.x - vertex.x) / after) * radius,
			y: vertex.y + ((next.y - vertex.y) / after) * radius
		};
		points.push(enter);
		for (let step = 1; step <= 8; step++) {
			const t = step / 8;
			points.push({
				x: (1 - t) ** 2 * enter.x + 2 * (1 - t) * t * vertex.x + t ** 2 * leave.x,
				y: (1 - t) ** 2 * enter.y + 2 * (1 - t) * t * vertex.y + t ** 2 * leave.y
			});
		}
	}
	points.push(vertices[vertices.length - 1]);
	return points;
}

export function pathLengths(points: QueuePoint[]): number[] {
	const distances = [0];
	for (let i = 1; i < points.length; i++) {
		distances.push(
			distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
		);
	}
	return distances;
}

export function pointOnPath(
	points: QueuePoint[],
	distances: number[],
	distance: number
): QueuePoint {
	const clamped = Math.max(0, Math.min(distance, distances[distances.length - 1]));
	for (let i = 1; i < points.length; i++) {
		if (clamped <= distances[i]) {
			const length = distances[i] - distances[i - 1];
			const t = length ? (clamped - distances[i - 1]) / length : 0;
			return {
				x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
				y: points[i - 1].y + (points[i].y - points[i - 1].y) * t
			};
		}
	}
	return points[points.length - 1];
}

export function ticketLabel(id: number): string {
	return String(id + 1).padStart(3, '0');
}

export function distributionDomain(snapshot: Snapshot, maximum: number): number {
	return Math.max(
		10,
		maximum,
		Math.ceil(Math.max(0, ...snapshot.people.map((person) => person.wait)) / 10) * 10
	);
}

export function waitBins(snapshot: Snapshot, maximum: number) {
	const domain = distributionDomain(snapshot, maximum);
	const bins = Array.from({ length: 16 }, (_, index) => ({
		start: (index * domain) / 16,
		end: ((index + 1) * domain) / 16,
		ids: [] as number[]
	}));
	for (const person of snapshot.people) {
		if (person.start !== null && person.start <= snapshot.time) {
			bins[Math.min(15, Math.floor((person.wait / domain) * 16))].ids.push(person.id);
		}
	}
	return bins;
}

/** The paired charts use the greater count ceiling so equal bars mean equal populations. */
export function histogramCeiling(snapshot: Snapshot, maximum: number): number {
	return Math.max(
		2,
		Math.ceil(Math.max(0, ...waitBins(snapshot, maximum).map((bin) => bin.ids.length)) / 2) * 2
	);
}
