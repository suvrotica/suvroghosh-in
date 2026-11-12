import { deriveStream, normalizeSeed } from './prng.ts';
import type {
	BoundaryPaintPass,
	ColorAssignment,
	LayoutModel,
	PaintTimeline,
	RegionPaintPass,
	SplitOrientation
} from './types.ts';

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function chooseRegionBrushOrientation(
	width: number,
	height: number,
	aspectRatio: number,
	tieSeed: number
): SplitOrientation {
	const physW = width * aspectRatio;
	const physH = height;
	if (physW > physH * 1.16) return 'horizontal';
	if (physH > physW * 1.16) return 'vertical';
	return (tieSeed & 1) === 0 ? 'horizontal' : 'vertical';
}

/**
 * Builds a deterministic reveal schedule budgeted to [0, 1] normalized progress.
 * Dense 30-panel compositions overlap passes so total playback always honors paintingTime.
 */
export function buildPaintTimeline(
	layout: LayoutModel,
	colors: ColorAssignment,
	paintingTimeSeconds: number
): PaintTimeline {
	const seed = normalizeSeed(layout.seed);
	const durationSeconds = clamp(paintingTimeSeconds, 3, 18);
	const timelineRng = deriveStream(seed, 'timeline');
	const matOrientationRng = deriveStream(seed, 'material', 'orientations');

	// Deterministic tie-breaker per region ID (matching material.ts orientation choice).
	const orientationByRegion = new Map<string, SplitOrientation>();
	for (const r of layout.regions) {
		const sub = matOrientationRng.fork(r.id);
		const tie = sub.int(0, 1);
		orientationByRegion.set(
			r.id,
			chooseRegionBrushOrientation(r.width, r.height, layout.aspectRatio, tie)
		);
	}

	// Order panels so warm-white structural fields and primary blocks interleave naturally,
	// with visible brushwork starting right away (progress = 0.01).
	const weightedRegions = layout.regions.map((r) => {
		const sub = timelineRng.fork(`order:${r.id}`);
		const isColored = colors.colorByRegionId[r.id] !== 'warm-white';
		// Start with a couple of generous white panels, then primary blocks and remaining white panels.
		const basePriority = isColored ? 0.22 + sub.range(0, 0.48) : sub.range(0, 0.58) - r.area * 0.35;
		return { region: r, sortKey: basePriority, direction: sub.chance(0.55) ? (1 as const) : (-1 as const) };
	});
	weightedRegions.sort((a, b) => a.sortKey - b.sortKey || a.region.index - b.region.index);

	const nRegions = Math.max(1, weightedRegions.length);
	// Panels occupy [0.01, 0.68] of the normalized reveal budget.
	const regionWindowStart = 0.01;
	const regionWindowEnd = 0.68;
	const regionSpan = regionWindowEnd - regionWindowStart;

	// Scale individual panel pass duration so 6-panel and 30-panel paintings both feel brisk and overlapping.
	const passDuration = clamp(regionSpan * (2.6 / Math.max(4, nRegions * 0.65)), 0.085, 0.22);
	const coatGap = passDuration * 0.45;
	const totalPanelFootprint = passDuration + coatGap + passDuration * 0.92;
	const maxStartOffset = Math.max(0.01, regionSpan - totalPanelFootprint);

	const regionPasses: RegionPaintPass[] = [];
	for (let i = 0; i < weightedRegions.length; i++) {
		const item = weightedRegions[i]!;
		const tFrac = nRegions === 1 ? 0 : i / (nRegions - 1);
		const start1 = regionWindowStart + tFrac * maxStartOffset;
		const end1 = Math.min(regionWindowEnd - 0.02, start1 + passDuration);
		const start2 = Math.min(regionWindowEnd - 0.04, start1 + coatGap);
		const end2 = Math.min(regionWindowEnd, start2 + passDuration * 0.92);
		const orientation = orientationByRegion.get(item.region.id) ?? 'horizontal';

		regionPasses.push({
			regionId: item.region.id,
			passIndex: i * 2,
			coat: 1,
			orientation,
			direction: item.direction,
			startProgress: Number(start1.toFixed(4)),
			endProgress: Number(Math.max(start1 + 0.03, end1).toFixed(4))
		});
		regionPasses.push({
			regionId: item.region.id,
			passIndex: i * 2 + 1,
			coat: 2,
			orientation,
			direction: item.direction,
			startProgress: Number(start2.toFixed(4)),
			endProgress: Number(Math.max(start2 + 0.03, end2).toFixed(4))
		});
	}

	// Boundaries occupy [0.63, 0.955], ordered from major longer structural lines to shorter crossbars.
	const orderedBoundaries = [...layout.boundaries].map((b) => {
		const sub = timelineRng.fork(`line:${b.id}`);
		const priority = (1 - b.length) * 0.72 + sub.range(0, 0.25);
		const direction: 1 | -1 = sub.chance(0.65) ? 1 : -1;
		return { boundary: b, priority, direction };
	});
	orderedBoundaries.sort((a, b) => a.priority - b.priority || a.boundary.splitOrder - b.boundary.splitOrder);

	const nLines = Math.max(1, orderedBoundaries.length);
	const lineWindowStart = 0.63;
	const lineWindowEnd = 0.955;
	const lineSpan = lineWindowEnd - lineWindowStart;
	const strokeDuration = clamp(lineSpan * (2.4 / Math.max(3.5, nLines * 0.55)), 0.055, 0.14);
	const maxLineStart = Math.max(0.005, lineSpan - strokeDuration);

	const boundaryPasses: BoundaryPaintPass[] = orderedBoundaries.map((entry, idx) => {
		const frac = nLines === 1 ? 0 : idx / (nLines - 1);
		const s = lineWindowStart + frac * maxLineStart;
		const e = Math.min(lineWindowEnd, s + strokeDuration * (0.75 + 0.35 * entry.boundary.length));
		return {
			boundaryId: entry.boundary.id,
			orientation: entry.boundary.orientation,
			direction: entry.direction,
			startProgress: Number(s.toFixed(4)),
			endProgress: Number(Math.max(s + 0.025, e).toFixed(4))
		};
	});

	return {
		durationSeconds,
		regionPasses,
		boundaryPasses,
		settleStartProgress: 0.96
	};
}
