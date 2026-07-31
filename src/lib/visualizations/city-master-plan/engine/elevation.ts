import { hashUnit } from './hash';
import type { Portal } from './types';

const COARSE_SPACING = 5;

export function createElevationField(
	seed: string,
	width: number,
	height: number,
	portals: readonly Portal[]
): number[] {
	const coarseWidth = Math.ceil(width / COARSE_SPACING) + 1;
	const coarseHeight = Math.ceil(height / COARSE_SPACING) + 1;
	const coarse = new Float64Array(coarseWidth * coarseHeight);
	for (let y = 0; y < coarseHeight; y += 1) {
		for (let x = 0; x < coarseWidth; x += 1) {
			coarse[y * coarseWidth + x] = hashUnit(seed, 'elevation', x, y);
		}
	}
	const outlet = portals.find((portal) => portal.drainOutlet) ?? {
		x: width - 1,
		y: height - 1
	};
	const diagonal = Math.max(1, Math.hypot(width - 1, height - 1));
	const values = new Array<number>(width * height);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const coarseX = x / COARSE_SPACING;
			const coarseY = y / COARSE_SPACING;
			const x0 = Math.floor(coarseX);
			const y0 = Math.floor(coarseY);
			const x1 = Math.min(coarseWidth - 1, x0 + 1);
			const y1 = Math.min(coarseHeight - 1, y0 + 1);
			const tx = smoothstep(coarseX - x0);
			const ty = smoothstep(coarseY - y0);
			const north = lerp(coarse[y0 * coarseWidth + x0], coarse[y0 * coarseWidth + x1], tx);
			const south = lerp(coarse[y1 * coarseWidth + x0], coarse[y1 * coarseWidth + x1], tx);
			const noise = lerp(north, south, ty);
			const outletSlope = Math.hypot(x - outlet.x, y - outlet.y) / diagonal;
			const local = (hashUnit(seed, 'elevation-detail', x, y) - 0.5) * 0.035;
			values[y * width + x] = round4(clamp01(noise * 0.56 + outletSlope * 0.4 + local));
		}
	}
	return values;
}

function smoothstep(value: number): number {
	return value * value * (3 - 2 * value);
}

function lerp(first: number, second: number, amount: number): number {
	return first + (second - first) * amount;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function round4(value: number): number {
	return Math.round(value * 10_000) / 10_000;
}
