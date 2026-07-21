import type { StrokePoint } from './types';

function finite(value: number, fallback: number) {
	return Number.isFinite(value) ? value : fallback;
}

export function sanitizeStrokePoint(point: StrokePoint): StrokePoint {
	return {
		x: Math.min(1, Math.max(0, finite(point.x, 0.5))),
		y: Math.min(1, Math.max(0, finite(point.y, 0.5))),
		pressure: Math.min(1, Math.max(0.05, finite(point.pressure, 0.5))),
		tiltX: Math.min(90, Math.max(-90, finite(point.tiltX, 0))),
		tiltY: Math.min(90, Math.max(-90, finite(point.tiltY, 0))),
		time: Math.max(0, finite(point.time, 0))
	};
}

export function interpolateStroke(
	fromInput: StrokePoint,
	toInput: StrokePoint,
	spacing = 0.012
): StrokePoint[] {
	const from = sanitizeStrokePoint(fromInput);
	const to = sanitizeStrokePoint(toInput);
	const distance = Math.hypot(to.x - from.x, to.y - from.y);
	const safeSpacing = Math.min(0.2, Math.max(0.001, finite(spacing, 0.012)));
	const steps = Math.min(128, Math.max(1, Math.ceil(distance / safeSpacing)));
	const points: StrokePoint[] = [];

	for (let step = 1; step <= steps; step += 1) {
		const amount = step / steps;
		points.push({
			x: from.x + (to.x - from.x) * amount,
			y: from.y + (to.y - from.y) * amount,
			pressure: from.pressure + (to.pressure - from.pressure) * amount,
			tiltX: from.tiltX + (to.tiltX - from.tiltX) * amount,
			tiltY: from.tiltY + (to.tiltY - from.tiltY) * amount,
			time: from.time + (to.time - from.time) * amount
		});
	}

	return points;
}

export function inferredPressure(speed: number) {
	const safeSpeed = Math.max(0, finite(speed, 0));
	return Math.min(0.72, Math.max(0.32, 0.68 - safeSpeed * 0.12));
}
