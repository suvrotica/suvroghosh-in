import { clamp } from './brush-random';
import type { Scene } from './scene-geometry';

const CELL_SIZE = 2;

export interface PaintFields {
	width: number;
	height: number;
	colors: Uint8Array;
	surfaces: Int32Array;
	groups: Int32Array;
}

export function rasterizeScene(scene: Scene): PaintFields {
	const width = Math.ceil(scene.width / CELL_SIZE);
	const height = Math.ceil(scene.height / CELL_SIZE);
	const colors = new Uint8Array(width * height * 3);
	const surfaces = new Int32Array(width * height).fill(-1);
	const groups = new Int32Array(scene.shapes.length);
	const objectGroups = new Map<string, number>();
	for (let offset = 0; offset < colors.length; offset += 3) {
		colors[offset] = 203;
		colors[offset + 1] = 187;
		colors[offset + 2] = 164;
	}

	// A half-resolution scanline map retains the top visible surface ID at every
	// sample. Color is composited independently, including translucent shadows.
	scene.shapes.forEach((shape, shapeIndex) => {
		const group = shape.objectId ?? shape.id;
		if (!objectGroups.has(group)) objectGroups.set(group, objectGroups.size + 1);
		groups[shapeIndex] = objectGroups.get(group) ?? 0;
		const points = shape.points;
		if (points.length < 3 || shape.opacity <= 0) return;
		const intersections: number[] = [];
		const ys = points.map((point) => point[1]);
		const firstRow = clamp(Math.ceil(Math.min(...ys) / CELL_SIZE - 0.5), 0, height);
		const endRow = clamp(Math.ceil(Math.max(...ys) / CELL_SIZE - 0.5), 0, height);
		const [red, green, blue] = shape.color;
		for (let row = firstRow; row < endRow; row += 1) {
			const y = (row + 0.5) * CELL_SIZE;
			intersections.length = 0;
			for (let index = 0; index < points.length; index += 1) {
				const [startX, startY] = points[index];
				const [endX, endY] = points[(index + 1) % points.length];
				if (startY > y !== endY > y) {
					intersections.push(startX + ((y - startY) * (endX - startX)) / (endY - startY));
				}
			}
			intersections.sort((a, b) => a - b);
			for (let index = 0; index + 1 < intersections.length; index += 2) {
				const start = clamp(Math.ceil(intersections[index] / CELL_SIZE - 0.5), 0, width);
				const end = clamp(Math.ceil(intersections[index + 1] / CELL_SIZE - 0.5), 0, width);
				const startPixel = row * width + start;
				const endPixel = row * width + end;
				if (shape.opacity >= 0.55) surfaces.fill(shapeIndex, startPixel, endPixel);
				for (let pixel = startPixel; pixel < endPixel; pixel += 1) {
					const offset = pixel * 3;
					const keep = 1 - shape.opacity;
					colors[offset] = Math.round(colors[offset] * keep + red * shape.opacity);
					colors[offset + 1] = Math.round(colors[offset + 1] * keep + green * shape.opacity);
					colors[offset + 2] = Math.round(colors[offset + 2] * keep + blue * shape.opacity);
				}
			}
		}
	});

	return { width, height, colors, surfaces, groups };
}

export function fieldPixel(fields: PaintFields, x: number, y: number): number {
	const column = clamp(Math.floor(x / CELL_SIZE), 0, fields.width - 1);
	const row = clamp(Math.floor(y / CELL_SIZE), 0, fields.height - 1);
	return row * fields.width + column;
}

function luminance(fields: PaintFields, pixel: number): number {
	const offset = pixel * 3;
	return (
		fields.colors[offset] * 0.24 +
		fields.colors[offset + 1] * 0.67 +
		fields.colors[offset + 2] * 0.09
	);
}

export function fieldEdge(
	fields: PaintFields,
	x: number,
	y: number,
	radius: number
): { strength: number; tangent: number } {
	const dx =
		luminance(fields, fieldPixel(fields, x + radius, y)) -
		luminance(fields, fieldPixel(fields, x - radius, y));
	const dy =
		luminance(fields, fieldPixel(fields, x, y + radius)) -
		luminance(fields, fieldPixel(fields, x, y - radius));
	return {
		strength: clamp((Math.hypot(dx, dy) - 5) / 83),
		tangent: Math.atan2(dy, dx) + Math.PI / 2
	};
}
