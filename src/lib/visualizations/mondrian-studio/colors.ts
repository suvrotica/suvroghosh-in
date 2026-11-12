import { deriveStream, normalizeSeed } from './prng.ts';
import type {
	ColorAssignment,
	ColoredRegion,
	ColorEmphasis,
	LayoutModel,
	NormalizedRect,
	RegionColorKey
} from './types.ts';

type PrimaryKey = 'red' | 'yellow' | 'blue';
const PRIMARIES: readonly PrimaryKey[] = ['red', 'yellow', 'blue'] as const;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function sharePositiveBoundary(a: NormalizedRect, b: NormalizedRect): boolean {
	const EPS = 1e-5;
	const touchVertically = Math.abs(a.x1 - b.x0) <= EPS || Math.abs(b.x1 - a.x0) <= EPS;
	if (touchVertically) {
		const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
		if (overlapY > EPS) return true;
	}
	const touchHorizontally = Math.abs(a.y1 - b.y0) <= EPS || Math.abs(b.y1 - a.y0) <= EPS;
	if (touchHorizontally) {
		const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
		if (overlapX > EPS) return true;
	}
	return false;
}

function touchesCanvasCorner(r: NormalizedRect): boolean {
	const EPS = 1e-5;
	const atLeft = r.x0 <= EPS;
	const atRight = r.x1 >= 1 - EPS;
	const atTop = r.y0 <= EPS;
	const atBottom = r.y1 >= 1 - EPS;
	return (atLeft || atRight) && (atTop || atBottom);
}

function buildAdjacencyMap(regions: readonly NormalizedRect[]): Map<string, Set<string>> {
	const map = new Map<string, Set<string>>();
	for (const r of regions) map.set(r.id, new Set());
	for (let i = 0; i < regions.length; i++) {
		for (let j = i + 1; j < regions.length; j++) {
			const a = regions[i]!;
			const b = regions[j]!;
			if (sharePositiveBoundary(a, b)) {
				map.get(a.id)!.add(b.id);
				map.get(b.id)!.add(a.id);
			}
		}
	}
	return map;
}

/**
 * Ranks regions in a seeded compositional priority order so changing Color area
 * grows or shrinks the colored selection predictably while preserving open white space.
 */
function buildSelectionOrder(
	regions: readonly NormalizedRect[],
	seed: number
): NormalizedRect[] {
	const colorStream = deriveStream(seed, 'color');
	// Pick an asymmetric focal quadrant/anchor from the color stream so not every painting
	// puts its main primary block in the same place.
	const anchorX = colorStream.chance(0.5) ? colorStream.range(0.12, 0.38) : colorStream.range(0.62, 0.88);
	const anchorY = colorStream.chance(0.5) ? colorStream.range(0.12, 0.38) : colorStream.range(0.62, 0.88);

	const sortedAreas = [...regions].sort((a, b) => b.area - a.area);
	// Reserve the single largest white field as open breathing room unless coverage gets high.
	const primaryWhiteFieldId =
		regions.length >= 7 && (sortedAreas[0]?.area ?? 0) >= 0.16 ? sortedAreas[0]!.id : null;

	const baseScore = new Map<string, number>();
	for (const r of regions) {
		const regionRng = colorStream.fork(`region-rank:${r.id}`);
		const cx = (r.x0 + r.x1) * 0.5;
		const cy = (r.y0 + r.y1) * 0.5;
		const distToAnchor = Math.hypot(cx - anchorX, cy - anchorY);

		// Favor medium-to-strong blocks (5% to 20% of canvas) and crisp accents (2% to 5%),
		// rather than coloring only tiny slivers or swallowing half the canvas immediately.
		let areaSuitability: number;
		if (r.area >= 0.055 && r.area <= 0.21) {
			areaSuitability = 1.0;
		} else if (r.area >= 0.022 && r.area < 0.055) {
			areaSuitability = 0.84;
		} else if (r.area > 0.21 && r.area <= 0.32) {
			areaSuitability = 0.62;
		} else if (r.area < 0.022) {
			areaSuitability = 0.44;
		} else {
			areaSuitability = 0.28;
		}

		const edgeTouchBonus =
			r.x0 <= 1e-5 || r.x1 >= 1 - 1e-5 || r.y0 <= 1e-5 || r.y1 >= 1 - 1e-5 ? 0.12 : 0;
		const anchorTerm = (1 - clamp(distToAnchor / 1.25, 0, 1)) * 0.22;
		const whiteReservePenalty = r.id === primaryWhiteFieldId ? -0.95 : 0;
		const jitter = regionRng.range(0, 0.42);

		baseScore.set(r.id, areaSuitability + edgeTouchBonus + anchorTerm + jitter + whiteReservePenalty);
	}

	const adjacency = buildAdjacencyMap(regions);
	const remaining = [...regions];
	const ordered: NormalizedRect[] = [];
	let selectedCorners = 0;

	while (remaining.length > 0) {
		let bestIdx = 0;
		let bestVal = -Infinity;

		for (let i = 0; i < remaining.length; i++) {
			const cand = remaining[i]!;
			let val = baseScore.get(cand.id) ?? 0;

			// Early selections prefer spatial separation so primary blocks balance asymmetrically
			// across white space rather than clumping into a checkerboard.
			const adjSet = adjacency.get(cand.id)!;
			let coloredNeighbors = 0;
			for (const prev of ordered) {
				if (adjSet.has(prev.id)) coloredNeighbors++;
			}
			if (ordered.length < Math.ceil(regions.length * 0.45)) {
				val -= coloredNeighbors * 0.34;
			} else {
				val -= coloredNeighbors * 0.12;
			}

			// Avoid filling every corner early.
			if (touchesCanvasCorner(cand) && selectedCorners >= 2 && ordered.length < regions.length - 3) {
				val -= 0.48;
			}

			// Ensure the first chosen panel is a clear statement or medium accent when available.
			if (ordered.length === 0 && cand.area >= 0.07 && cand.area <= 0.22 && cand.id !== primaryWhiteFieldId) {
				val += 0.28;
			}

			if (val > bestVal) {
				bestVal = val;
				bestIdx = i;
			}
		}

		const picked = remaining.splice(bestIdx, 1)[0]!;
		if (touchesCanvasCorner(picked)) selectedCorners++;
		ordered.push(picked);
	}

	return ordered;
}

function selectRegionsForTargetArea(
	ordered: readonly NormalizedRect[],
	targetPct: number
): NormalizedRect[] {
	const clampedTargetPct = clamp(targetPct, 0, 60);
	if (clampedTargetPct <= 0 || ordered.length === 0) {
		return [];
	}

	const target = clampedTargetPct / 100;
	const candidates: { subset: NormalizedRect[]; cost: number }[] = [];

	// Evaluate prefixes and single-item replacements near the prefix boundary so
	// slider changes remain monotonic/predictable while matching feasible whole-panel sums closely.
	for (let k = 1; k <= ordered.length; k++) {
		const prefix = ordered.slice(0, k);
		const prefixSum = prefix.reduce((s, r) => s + r.area, 0);
		const areaError = Math.abs(prefixSum - target);
		// Small prefix-order preference keeps adjacent target steps stable unless a swap is clearly closer.
		candidates.push({
			subset: prefix,
			cost: areaError
		});

		// Consider replacing the last item in prefix with one of the next 5 items in priority order.
		const basePrefix = ordered.slice(0, k - 1);
		const baseSum = basePrefix.reduce((s, r) => s + r.area, 0);
		const maxLookahead = Math.min(ordered.length, k + 5);
		for (let altIdx = k; altIdx < maxLookahead; altIdx++) {
			const alt = ordered[altIdx]!;
			const altSum = baseSum + alt.area;
			const altError = Math.abs(altSum - target);
			const switchPenalty = 0.012 + (altIdx - k) * 0.003;
			candidates.push({
				subset: [...basePrefix, alt],
				cost: altError + switchPenalty
			});
		}

		if (prefixSum > target + 0.25) break;
	}

	candidates.sort((a, b) => a.cost - b.cost || a.subset.length - b.subset.length);
	return candidates[0]?.subset ?? [ordered[0]!];
}

function emphasisWeights(emphasis: ColorEmphasis, seed: number): Record<PrimaryKey, number> {
	const stream = deriveStream(seed, 'color', 'palette-balance');
	if (emphasis === 'red') return { red: 0.58, yellow: 0.21, blue: 0.21 };
	if (emphasis === 'yellow') return { red: 0.21, yellow: 0.58, blue: 0.21 };
	if (emphasis === 'blue') return { red: 0.21, yellow: 0.2, blue: 0.59 };

	// Balanced mode varies which primary leads slightly per seed without hardcoding one recipe.
	const lead = stream.pick(PRIMARIES);
	return {
		red: lead === 'red' ? 0.39 : 0.305,
		yellow: lead === 'yellow' ? 0.37 : 0.305,
		blue: lead === 'blue' ? 0.39 : 0.305
	};
}

export function assignColors(
	layout: LayoutModel,
	params: { colorArea: number; colorEmphasis: ColorEmphasis }
): ColorAssignment {
	const seed = normalizeSeed(layout.seed);
	const targetColorAreaPct = clamp(params.colorArea, 0, 60);
	const ordered = buildSelectionOrder(layout.regions, seed);
	const selected = selectRegionsForTargetArea(ordered, targetColorAreaPct);
	const selectedIds = new Set(selected.map((r) => r.id));

	const adjacency = buildAdjacencyMap(layout.regions);
	const weights = emphasisWeights(params.colorEmphasis, seed);
	const colorStream = deriveStream(seed, 'color', 'region-affinity');

	// Deterministic per-region primary affinities keyed by region ID so a panel keeps its
	// character when neighboring settings change.
	const affinity = new Map<string, Record<PrimaryKey, number>>();
	for (const r of layout.regions) {
		const rng = colorStream.fork(r.id);
		affinity.set(r.id, {
			red: rng.range(0.15, 0.95),
			yellow: rng.range(0.15, 0.95),
			blue: rng.range(0.15, 0.95)
		});
	}

	const assignedPrimary = new Map<string, PrimaryKey>();
	const areaByPrimary: Record<PrimaryKey, number> = { red: 0, yellow: 0, blue: 0 };
	const countByPrimary: Record<PrimaryKey, number> = { red: 0, yellow: 0, blue: 0 };
	const totalSelectedArea = selected.reduce((s, r) => s + r.area, 0);
	let assignedAreaSoFar = 0;

	// Assign colors in stable priority order using cumulative area so far, ensuring
	// panels that remain selected when Color area changes keep their exact primary color.
	const selectedInPriorityOrder = ordered.filter((r) => selectedIds.has(r.id));

	for (let idx = 0; idx < selectedInPriorityOrder.length; idx++) {
		const region = selectedInPriorityOrder[idx]!;
		const neighborColors = new Set<PrimaryKey>();
		for (const neighborId of adjacency.get(region.id) ?? []) {
			const c = assignedPrimary.get(neighborId);
			if (c) neighborColors.add(c);
		}

		const regionAff = affinity.get(region.id)!;
		let bestPrimary: PrimaryKey = 'red';
		let bestScore = -Infinity;

		for (const p of PRIMARIES) {
			const desiredShare = weights[p];
			const currentShare =
				assignedAreaSoFar > 1e-6 ? areaByPrimary[p] / assignedAreaSoFar : 0;
			const deficit = desiredShare - currentShare;

			let score = weights[p] * 1.15 + regionAff[p] * 0.55 + deficit * 1.35;

			// Strongly avoid touching panels having the exact same primary color.
			if (neighborColors.has(p)) {
				score -= 2.5;
			}

			// When emphasis is active (More red/yellow/blue), give the second panel a counterweight
			// primary so multi-panel compositions retain contrast instead of turning monochrome.
			if (params.colorEmphasis !== 'balanced' && idx === 1 && countByPrimary[p] > 0) {
				score -= 1.4;
			}

			if (score > bestScore) {
				bestScore = score;
				bestPrimary = p;
			}
		}

		assignedPrimary.set(region.id, bestPrimary);
		areaByPrimary[bestPrimary] += region.area;
		countByPrimary[bestPrimary] += 1;
		assignedAreaSoFar += region.area;
	}

	const colorByRegionId: Record<string, RegionColorKey> = {};
	const coloredRegions: ColoredRegion[] = layout.regions.map((r) => {
		const color: RegionColorKey = selectedIds.has(r.id)
			? (assignedPrimary.get(r.id) ?? 'red')
			: 'warm-white';
		colorByRegionId[r.id] = color;
		return { ...r, color };
	});

	const actualColorAreaPct = Number((totalSelectedArea * 100).toFixed(1));

	return {
		regions: coloredRegions,
		colorByRegionId,
		targetColorAreaPct,
		actualColorAreaPct,
		primaryCounts: countByPrimary,
		primaryAreaPct: {
			red: Number((areaByPrimary.red * 100).toFixed(1)),
			yellow: Number((areaByPrimary.yellow * 100).toFixed(1)),
			blue: Number((areaByPrimary.blue * 100).toFixed(1))
		}
	};
}

const NUMBER_WORDS: Readonly<Record<number, string>> = {
	6: 'Six',
	7: 'Seven',
	8: 'Eight',
	9: 'Nine',
	10: 'Ten',
	11: 'Eleven',
	12: 'Twelve',
	13: 'Thirteen',
	14: 'Fourteen',
	15: 'Fifteen',
	16: 'Sixteen',
	17: 'Seventeen',
	18: 'Eighteen',
	19: 'Nineteen',
	20: 'Twenty'
};

export function describeComposition(layout: LayoutModel, colors: ColorAssignment): string {
	const countLabel = NUMBER_WORDS[layout.panels] ?? String(layout.panels);
	const presentPrimaries = (['red', 'yellow', 'blue'] as const).filter(
		(c) => colors.primaryCounts[c] > 0
	);

	if (presentPrimaries.length === 0 || colors.actualColorAreaPct <= 0) {
		return `${countLabel} rectangular panels with near-black boundaries, all warm white with no primary color blocks.`;
	}

	const listText =
		presentPrimaries.length === 1
			? presentPrimaries[0]!
			: presentPrimaries.length === 2
				? `${presentPrimaries[0]} and ${presentPrimaries[1]}`
				: 'red, yellow, and blue';

	const roundedPct = Math.round(colors.actualColorAreaPct);
	const balancePhrase = roundedPct <= 35 ? 'mostly warm white, with' : 'combining warm white with';

	return `${countLabel} rectangular panels with near-black boundaries, ${balancePhrase} ${listText} areas covering ${roundedPct}% of the canvas.`;
}
