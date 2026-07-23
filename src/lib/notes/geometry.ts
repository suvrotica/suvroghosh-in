import type { CanvasObject, InkPoint, NoteDocument, Viewport } from './model';

export type Point = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function screenToWorld(point: Point, viewport: Viewport): Point {
	return {
		x: (point.x - viewport.x) / viewport.zoom,
		y: (point.y - viewport.y) / viewport.zoom
	};
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
	return {
		x: point.x * viewport.zoom + viewport.x,
		y: point.y * viewport.zoom + viewport.y
	};
}

export function clampZoom(zoom: number) {
	return Math.min(8, Math.max(0.1, zoom));
}

export function zoomAround(viewport: Viewport, screenPoint: Point, nextZoom: number): Viewport {
	const worldPoint = screenToWorld(screenPoint, viewport);
	const zoom = clampZoom(nextZoom);
	return {
		zoom,
		x: screenPoint.x - worldPoint.x * zoom,
		y: screenPoint.y - worldPoint.y * zoom
	};
}

export function boundsFromPoints(points: readonly Point[], padding = 0): Bounds {
	if (points.length === 0) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
	}
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const point of points) {
		minX = Math.min(minX, point.x);
		minY = Math.min(minY, point.y);
		maxX = Math.max(maxX, point.x);
		maxY = Math.max(maxY, point.y);
	}
	return {
		minX: minX - padding,
		minY: minY - padding,
		maxX: maxX + padding,
		maxY: maxY + padding
	};
}

export function objectBounds(object: CanvasObject): Bounds {
	const width = Math.max(object.width, 1);
	const height = Math.max(object.height, 1);
	if (object.rotation % 360 === 0) {
		return {
			minX: object.x,
			minY: object.y,
			maxX: object.x + width,
			maxY: object.y + height
		};
	}
	const angle = (object.rotation * Math.PI) / 180;
	const cos = Math.abs(Math.cos(angle));
	const sin = Math.abs(Math.sin(angle));
	const rotatedWidth = width * cos + height * sin;
	const rotatedHeight = width * sin + height * cos;
	const centerX = object.x + width / 2;
	const centerY = object.y + height / 2;
	return {
		minX: centerX - rotatedWidth / 2,
		minY: centerY - rotatedHeight / 2,
		maxX: centerX + rotatedWidth / 2,
		maxY: centerY + rotatedHeight / 2
	};
}

export function intersects(a: Bounds, b: Bounds) {
	return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function containsPoint(bounds: Bounds, point: Point, tolerance = 0) {
	return (
		point.x >= bounds.minX - tolerance &&
		point.x <= bounds.maxX + tolerance &&
		point.y >= bounds.minY - tolerance &&
		point.y <= bounds.maxY + tolerance
	);
}

export function viewportBounds(viewport: Viewport, width: number, height: number, margin = 120) {
	const topLeft = screenToWorld({ x: -margin, y: -margin }, viewport);
	const bottomRight = screenToWorld({ x: width + margin, y: height + margin }, viewport);
	return {
		minX: topLeft.x,
		minY: topLeft.y,
		maxX: bottomRight.x,
		maxY: bottomRight.y
	};
}

export function documentBounds(document: NoteDocument, padding = 80): Bounds {
	const visible = document.objects.filter((object) => !object.hidden);
	if (visible.length === 0) {
		return { minX: -400, minY: -300, maxX: 400, maxY: 300 };
	}
	const bounds = visible.map(objectBounds);
	return {
		minX: Math.min(...bounds.map((item) => item.minX)) - padding,
		minY: Math.min(...bounds.map((item) => item.minY)) - padding,
		maxX: Math.max(...bounds.map((item) => item.maxX)) + padding,
		maxY: Math.max(...bounds.map((item) => item.maxY)) + padding
	};
}

function pointSegmentDistance(point: InkPoint, start: InkPoint, end: InkPoint) {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
	const t = Math.max(
		0,
		Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy))
	);
	const x = start.x + t * dx;
	const y = start.y + t * dy;
	return Math.hypot(point.x - x, point.y - y);
}

export function simplifyStroke(points: readonly InkPoint[], tolerance = 0.35): InkPoint[] {
	if (points.length <= 2) return points.map((point) => ({ ...point }));
	let maxDistance = 0;
	let index = 0;
	for (let i = 1; i < points.length - 1; i += 1) {
		const distance = pointSegmentDistance(points[i], points[0], points[points.length - 1]);
		if (distance > maxDistance) {
			index = i;
			maxDistance = distance;
		}
	}
	if (maxDistance > tolerance) {
		const left = simplifyStroke(points.slice(0, index + 1), tolerance);
		const right = simplifyStroke(points.slice(index), tolerance);
		return [...left.slice(0, -1), ...right];
	}
	return [{ ...points[0] }, { ...points[points.length - 1] }];
}

export function snap(value: number, size: number) {
	return Math.round(value / size) * size;
}
