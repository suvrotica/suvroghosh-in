import type { Canvas2DContext, MaskKind } from './types';

export type MaskOptions = Readonly<{ inset?: number; phase?: number }>;

function rectangleContains(x: number, y: number, inset: number): boolean {
	return x >= inset && x <= 1 - inset && y >= inset && y <= 1 - inset;
}

function polygonContains(
	x: number,
	y: number,
	points: readonly (readonly [number, number])[]
): boolean {
	let inside = false;
	for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
		const [xi, yi] = points[index];
		const [xj, yj] = points[previous];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

export function maskContains(
	kind: MaskKind,
	x: number,
	y: number,
	options: MaskOptions = {}
): boolean {
	if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
	const inset = Math.max(0, Math.min(0.2, options.inset ?? 0.035));
	if (kind === 'rectangle') return rectangleContains(x, y, inset);
	if (kind === 'ellipse' || kind === 'oval') {
		return ((x - 0.5) / (0.5 - inset)) ** 2 + ((y - 0.5) / (0.46 - inset)) ** 2 <= 1;
	}
	if (kind === 'circle') return Math.hypot(x - 0.5, y - 0.5) <= 0.46 - inset;
	if (kind === 'capsule') {
		const radius = 0.25 - inset;
		return (
			(x >= 0.25 && x <= 0.75 && y >= inset && y <= 1 - inset) ||
			Math.hypot(x - 0.25, y - 0.5) <= radius ||
			Math.hypot(x - 0.75, y - 0.5) <= radius
		);
	}
	if (kind === 'arch') {
		if (x < 0.09 + inset || x > 0.91 - inset || y < 0.08 + inset || y > 0.94 - inset) return false;
		return y >= 0.42 || Math.hypot(x - 0.5, y - 0.42) <= 0.41 - inset;
	}
	if (kind === 'diamond') {
		return Math.abs(x - 0.5) / (0.47 - inset) + Math.abs(y - 0.5) / (0.47 - inset) <= 1;
	}
	if (kind === 'quadrilateral') {
		return polygonContains(x, y, [
			[0.1 + inset, 0.18 + inset],
			[0.88 - inset, 0.08 + inset],
			[0.94 - inset, 0.84 - inset],
			[0.18 + inset, 0.94 - inset]
		]);
	}
	if (kind === 'stepped-niche') {
		return polygonContains(x, y, [
			[0.16, 0.08],
			[0.84, 0.08],
			[0.84, 0.25],
			[0.92, 0.25],
			[0.92, 0.92],
			[0.08, 0.92],
			[0.08, 0.25],
			[0.16, 0.25]
		]);
	}
	if (kind === 'offset-diptych') {
		return (
			(x >= 0.07 && x <= 0.47 && y >= 0.08 && y <= 0.84) ||
			(x >= 0.54 && x <= 0.93 && y >= 0.18 && y <= 0.94)
		);
	}
	if (kind === 'split-horizontal') {
		return (
			(x >= 0.07 && x <= 0.93 && y >= 0.07 && y <= 0.45) ||
			(x >= 0.07 && x <= 0.93 && y >= 0.54 && y <= 0.93)
		);
	}
	if (kind === 'three-window') {
		return [0.06, 0.37, 0.68].some(
			(left) => x >= left && x <= left + 0.25 && y >= 0.09 && y <= 0.91
		);
	}
	const centre = 0.5 + Math.sin(x * Math.PI * 2.4) * 0.13;
	return rectangleContains(x, y, inset) && Math.abs(y - centre) <= 0.13;
}

/** Five-point coverage estimate for inexpensive anti-aliased mask edges. */
export function maskWeight(
	kind: MaskKind,
	x: number,
	y: number,
	options: MaskOptions & Readonly<{ feather?: number }> = {}
): number {
	const feather = Math.max(0.0001, Math.min(0.03, options.feather ?? 0.006));
	const samples = [
		[x, y],
		[x - feather, y],
		[x + feather, y],
		[x, y - feather],
		[x, y + feather]
	] as const;
	return (
		samples.reduce(
			(sum, [sampleX, sampleY]) => sum + (maskContains(kind, sampleX, sampleY, options) ? 1 : 0),
			0
		) / samples.length
	);
}

function tracePolygon(
	context: Canvas2DContext,
	points: readonly (readonly [number, number])[],
	left: number,
	top: number,
	width: number,
	height: number
): void {
	points.forEach(([x, y], index) => {
		if (index === 0) context.moveTo(left + x * width, top + y * height);
		else context.lineTo(left + x * width, top + y * height);
	});
	context.closePath();
}

/** Traces the same mask family used by maskContains into an existing 2D context. */
export function traceMaskPath(
	context: Canvas2DContext,
	kind: MaskKind,
	left: number,
	top: number,
	width: number,
	height: number
): void {
	context.beginPath();
	if (kind === 'rectangle') context.rect(left, top, width, height);
	else if (kind === 'ellipse' || kind === 'oval')
		context.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
	else if (kind === 'circle') {
		const radius = Math.min(width, height) / 2;
		context.arc(left + width / 2, top + height / 2, radius, 0, Math.PI * 2);
	} else if (kind === 'arch') {
		context.moveTo(left, top + height);
		context.lineTo(left, top + height * 0.42);
		context.arc(left + width / 2, top + height * 0.42, width / 2, Math.PI, 0);
		context.lineTo(left + width, top + height);
		context.closePath();
	} else if (kind === 'capsule') {
		const radius = Math.min(width, height) / 2;
		context.roundRect(left, top, width, height, radius);
	} else if (kind === 'diamond') {
		tracePolygon(
			context,
			[
				[0.5, 0],
				[1, 0.5],
				[0.5, 1],
				[0, 0.5]
			],
			left,
			top,
			width,
			height
		);
	} else if (kind === 'quadrilateral') {
		tracePolygon(
			context,
			[
				[0.03, 0.12],
				[0.94, 0],
				[1, 0.88],
				[0.12, 1]
			],
			left,
			top,
			width,
			height
		);
	} else if (kind === 'stepped-niche') {
		tracePolygon(
			context,
			[
				[0.1, 0],
				[0.9, 0],
				[0.9, 0.2],
				[1, 0.2],
				[1, 1],
				[0, 1],
				[0, 0.2],
				[0.1, 0.2]
			],
			left,
			top,
			width,
			height
		);
	} else if (kind === 'offset-diptych') {
		context.rect(left, top, width * 0.46, height * 0.88);
		context.rect(left + width * 0.54, top + height * 0.12, width * 0.46, height * 0.88);
	} else if (kind === 'split-horizontal') {
		context.rect(left, top, width, height * 0.44);
		context.rect(left, top + height * 0.56, width, height * 0.44);
	} else if (kind === 'three-window') {
		for (const offset of [0, 0.375, 0.75])
			context.rect(left + width * offset, top, width * 0.25, height);
	} else {
		const points = Array.from({ length: 25 }, (_, index) => {
			const x = index / 24;
			const centre = 0.5 + Math.sin(x * Math.PI * 2.4) * 0.13;
			return [x, centre - 0.13] as const;
		});
		const lower = [...points].reverse().map(([x]) => {
			const centre = 0.5 + Math.sin(x * Math.PI * 2.4) * 0.13;
			return [x, centre + 0.13] as const;
		});
		tracePolygon(context, [...points, ...lower], left, top, width, height);
	}
}
