import { getStroke } from 'perfect-freehand';
import type { DrawingTool, InkPoint, StrokeObject } from './model';

const toolOptions: Record<
	DrawingTool,
	{ thinning: number; streamline: number; easing: (value: number) => number }
> = {
	charcoal: { thinning: 0.68, streamline: 0.32, easing: (value) => Math.sqrt(value) },
	pencil: { thinning: 0.52, streamline: 0.4, easing: (value) => value },
	fountain: { thinning: 0.82, streamline: 0.46, easing: (value) => value * value },
	marker: { thinning: 0.18, streamline: 0.36, easing: (value) => value },
	highlighter: { thinning: 0.05, streamline: 0.45, easing: (value) => value }
};

export function getStrokeOutline(stroke: StrokeObject) {
	const options = toolOptions[stroke.tool];
	const scaleX = stroke.width / Math.max(stroke.sourceWidth, 1);
	const scaleY = stroke.height / Math.max(stroke.sourceHeight, 1);
	const points = stroke.points.map((point) => {
		const tilt =
			point.altitudeAngle !== undefined
				? 1 - point.altitudeAngle / (Math.PI / 2)
				: Math.min(1, Math.hypot(point.tiltX ?? 0, point.tiltY ?? 0) / 90);
		const tiltInfluence = stroke.tool === 'charcoal' || stroke.tool === 'pencil' ? tilt * 0.22 : 0;
		const pressure = Math.max(0.01, Math.min(1, point.pressure + tiltInfluence));
		return [point.x * scaleX, point.y * scaleY, Math.pow(pressure, stroke.style.pressureCurve)];
	});
	return getStroke(points, {
		size: stroke.style.size,
		thinning: options.thinning * stroke.style.pressure,
		smoothing: stroke.style.smoothing,
		streamline: options.streamline,
		easing: options.easing,
		simulatePressure: stroke.points.every((point) => point.pressure === 0.5),
		start: { cap: true, taper: stroke.tool === 'fountain' ? 3 : 0 },
		end: { cap: true, taper: stroke.tool === 'fountain' ? 4 : 0 }
	});
}

export function outlineToSvgPath(points: number[][], closed = true) {
	if (points.length < 3) return '';
	const average = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
	const current = points[0];
	let next = points[1];
	const parts = [`M ${current[0].toFixed(2)} ${current[1].toFixed(2)}`];
	for (let index = 1; index < points.length - 1; index += 1) {
		const midpoint = average(next, points[index + 1]);
		parts.push(
			`Q ${next[0].toFixed(2)} ${next[1].toFixed(2)} ${midpoint[0].toFixed(2)} ${midpoint[1].toFixed(2)}`
		);
		next = points[index + 1];
	}
	if (closed) parts.push('Z');
	return parts.join(' ');
}

export function normalizeStrokePoints(points: InkPoint[], minX: number, minY: number) {
	return points.map((point) => ({ ...point, x: point.x - minX, y: point.y - minY }));
}
