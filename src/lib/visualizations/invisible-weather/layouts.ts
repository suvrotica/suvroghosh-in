import { MAX_ARTWORK_COUNT, MIN_ARTWORK_COUNT } from './defaults';
import { SeededRandom } from './prng';
import type { LayoutId, NormalizedFrame, Orientation } from './types';

const BOUNDS = Object.freeze({ x: 0.045, y: 0.055, width: 0.91, height: 0.89 });

function clampCount(count: number, layout: LayoutId): number {
	if (layout === 'triptych') return 3;
	const safe = Number.isFinite(count) ? Math.round(count) : MIN_ARTWORK_COUNT;
	return Math.max(MIN_ARTWORK_COUNT, Math.min(MAX_ARTWORK_COUNT, safe));
}

function gridDimensions(count: number, orientation: Orientation, bias = 1): [number, number] {
	const aspectBias = orientation === 'landscape' ? 1.28 : 0.72;
	const columns = Math.max(1, Math.ceil(Math.sqrt(count * aspectBias * bias)));
	return [columns, Math.ceil(count / columns)];
}

function cellFrames(
	layout: LayoutId,
	count: number,
	orientation: Orientation,
	seed: string,
	columns: number,
	rows: number
): NormalizedFrame[] {
	const random = new SeededRandom(`${seed}:${layout}:${orientation}:${count}`);
	const cellWidth = BOUNDS.width / columns;
	const cellHeight = BOUNDS.height / rows;
	return Array.from({ length: count }, (_, artworkIndex) => {
		const column = artworkIndex % columns;
		const row = Math.floor(artworkIndex / columns);
		const local = random.fork(artworkIndex);
		let widthFactor = 0.76;
		let heightFactor = 0.76;
		let offsetX = 0;
		let offsetY = 0;
		let rotation = 0;

		if (layout === 'quiet-grid') {
			widthFactor = local.float(0.71, 0.8);
			heightFactor = local.float(0.69, 0.78);
		} else if (layout === 'salon-wall') {
			widthFactor = artworkIndex === 0 ? 0.91 : local.float(0.57, 0.72);
			heightFactor = artworkIndex === 0 ? 0.9 : local.float(0.54, 0.71);
			offsetX = local.float(-0.055, 0.055) * cellWidth;
			offsetY = local.float(-0.055, 0.055) * cellHeight;
			rotation = artworkIndex === 0 ? 0 : local.float(-0.018, 0.018);
		} else if (layout === 'cabinet') {
			widthFactor = artworkIndex % 3 === 1 ? 0.68 : 0.8;
			heightFactor = 0.66;
			offsetY = 0.03 * cellHeight;
		} else if (layout === 'procession') {
			widthFactor = 0.72;
			heightFactor = artworkIndex % 2 === 0 ? 0.74 : 0.62;
			offsetY = (artworkIndex % 2 === 0 ? -0.025 : 0.035) * cellHeight;
		}

		const width = cellWidth * widthFactor;
		const height = cellHeight * heightFactor;
		return {
			id: `frame-${artworkIndex + 1}`,
			artworkIndex,
			x: BOUNDS.x + column * cellWidth + (cellWidth - width) / 2 + offsetX,
			y: BOUNDS.y + row * cellHeight + (cellHeight - height) / 2 + offsetY,
			width,
			height,
			rotation,
			zIndex: artworkIndex,
			primary: layout !== 'salon-wall' || artworkIndex === 0
		};
	});
}

type SalonSlot = Readonly<{ x: number; y: number; width: number; height: number }>;

function salonSlots(orientation: Orientation): readonly SalonSlot[] {
	if (orientation === 'portrait') {
		const anchor = { x: 0.2, y: 0.31, width: 0.6, height: 0.38 };
		const top = [0.065, 0.295, 0.525, 0.755].map((x) => ({
			x,
			y: 0.065,
			width: 0.18,
			height: 0.17
		}));
		const bottom = [0.065, 0.295, 0.525, 0.755].map((x) => ({
			x,
			y: 0.765,
			width: 0.18,
			height: 0.17
		}));
		const left = [0.31, 0.45, 0.59].map((y) => ({ x: 0.065, y, width: 0.105, height: 0.1 }));
		const right = [0.31, 0.45, 0.59].map((y) => ({ x: 0.83, y, width: 0.105, height: 0.1 }));
		return [
			anchor,
			left[1],
			right[1],
			top[1],
			bottom[2],
			top[2],
			bottom[1],
			left[0],
			right[2],
			top[0],
			bottom[3],
			right[0],
			left[2],
			top[3],
			bottom[0]
		];
	}
	const anchor = { x: 0.3, y: 0.215, width: 0.4, height: 0.57 };
	const left = [0.065, 0.24, 0.415, 0.59, 0.765].map((y) => ({
		x: 0.055,
		y,
		width: 0.21,
		height: 0.14
	}));
	const right = [0.065, 0.24, 0.415, 0.59, 0.765].map((y) => ({
		x: 0.735,
		y,
		width: 0.21,
		height: 0.14
	}));
	const top = [0.31, 0.515].map((x) => ({ x, y: 0.065, width: 0.175, height: 0.105 }));
	const bottom = [0.31, 0.515].map((x) => ({ x, y: 0.83, width: 0.175, height: 0.105 }));
	return [
		anchor,
		left[2],
		right[2],
		top[0],
		bottom[1],
		top[1],
		bottom[0],
		left[1],
		right[3],
		left[3],
		right[1],
		left[0],
		right[4],
		left[4],
		right[0]
	];
}

function salonFrames(count: number, orientation: Orientation, seed: string): NormalizedFrame[] {
	const slots = salonSlots(orientation).slice(0, count);
	return slots.map((slot, artworkIndex) => {
		const random = new SeededRandom(`${seed}:salon:${orientation}:${artworkIndex}`);
		const widthFactor = artworkIndex === 0 ? 1 : random.float(0.86, 0.97);
		const heightFactor = artworkIndex === 0 ? 1 : random.float(0.84, 0.97);
		const width = slot.width * widthFactor;
		const height = slot.height * heightFactor;
		return {
			id: `frame-${artworkIndex + 1}`,
			artworkIndex,
			x: slot.x + (slot.width - width) / 2,
			y: slot.y + (slot.height - height) / 2,
			width,
			height,
			rotation: artworkIndex === 0 ? 0 : random.float(-0.012, 0.012),
			zIndex: artworkIndex,
			primary: artworkIndex === 0
		};
	});
}

function triptychFrames(orientation: Orientation): NormalizedFrame[] {
	if (orientation === 'portrait') {
		return Array.from({ length: 3 }, (_, artworkIndex) => ({
			id: `frame-${artworkIndex + 1}`,
			artworkIndex,
			x: 0.15,
			y: 0.07 + artworkIndex * 0.305,
			width: 0.7,
			height: 0.25,
			rotation: 0,
			zIndex: artworkIndex,
			primary: true
		}));
	}
	return Array.from({ length: 3 }, (_, artworkIndex) => ({
		id: `frame-${artworkIndex + 1}`,
		artworkIndex,
		x: 0.055 + artworkIndex * 0.31,
		y: 0.14,
		width: 0.27,
		height: 0.72,
		rotation: 0,
		zIndex: artworkIndex,
		primary: true
	}));
}

/** Creates deterministic, normalized, non-overlapping gallery geometry. */
export function createLayout(
	layout: LayoutId,
	count: number,
	orientation: Orientation,
	seed = 'invisible-weather-layout'
): NormalizedFrame[] {
	const safeCount = clampCount(count, layout);
	if (layout === 'triptych') return triptychFrames(orientation);
	if (layout === 'salon-wall') return salonFrames(safeCount, orientation, seed);
	let dimensions: [number, number];
	if (layout === 'procession') {
		const columns = orientation === 'landscape' ? Math.min(7, safeCount) : Math.min(2, safeCount);
		dimensions = [columns, Math.ceil(safeCount / columns)];
	} else if (layout === 'cabinet') {
		dimensions = gridDimensions(safeCount, orientation, orientation === 'landscape' ? 1.22 : 0.86);
	} else {
		dimensions = gridDimensions(safeCount, orientation);
	}
	return cellFrames(layout, safeCount, orientation, seed, dimensions[0], dimensions[1]);
}

export function framesOverlap(
	first: NormalizedFrame,
	second: NormalizedFrame,
	minimumGutter = 0
): boolean {
	return !(
		first.x + first.width + minimumGutter <= second.x ||
		second.x + second.width + minimumGutter <= first.x ||
		first.y + first.height + minimumGutter <= second.y ||
		second.y + second.height + minimumGutter <= first.y
	);
}

export function validateLayout(
	frames: readonly NormalizedFrame[],
	minimumGutter = 0.003
): string[] {
	const issues: string[] = [];
	const ids = new Set<string>();
	for (const frame of frames) {
		if (ids.has(frame.id)) issues.push(`Duplicate frame id ${frame.id}.`);
		ids.add(frame.id);
		if (
			frame.x < 0 ||
			frame.y < 0 ||
			frame.width <= 0 ||
			frame.height <= 0 ||
			frame.x + frame.width > 1 ||
			frame.y + frame.height > 1
		) {
			issues.push(`${frame.id} leaves normalized gallery bounds.`);
		}
	}
	for (let left = 0; left < frames.length; left += 1) {
		for (let right = left + 1; right < frames.length; right += 1) {
			if (framesOverlap(frames[left], frames[right], minimumGutter)) {
				issues.push(`${frames[left].id} overlaps ${frames[right].id}.`);
			}
		}
	}
	return issues;
}

export function findFrameAtPoint(
	frames: readonly NormalizedFrame[],
	x: number,
	y: number
): NormalizedFrame | null {
	return (
		[...frames]
			.sort((left, right) => right.zIndex - left.zIndex)
			.find(
				(frame) =>
					x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height
			) ?? null
	);
}

export const hitTestLayout = findFrameAtPoint;
