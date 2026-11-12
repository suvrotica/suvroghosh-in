import { deriveStream, normalizeSeed, type SeededRandom } from './prng.ts';
import {
	DEFAULT_ASPECT_RATIO,
	MAX_PANELS,
	MIN_PANELS,
	type BoundarySegment,
	type LayoutLimitNotice,
	type LayoutModel,
	type NormalizedRect,
	type SplitOrientation
} from './types.ts';

interface SplitSpec {
	readonly splitOrder: number;
	readonly orientation: SplitOrientation;
	/** Seeded asymmetric ratio in [0.10, 0.90] used at default/high unevenSpacing. */
	readonly targetRatio: number;
	/** Contrast boost factor in [1.0, 1.35] applied near unevenSpacing = 100%. */
	readonly extremePush: number;
	readonly left: SubdivisionNode;
	readonly right: SubdivisionNode;
}

interface SubdivisionNode {
	readonly id: string;
	readonly depth: number;
	split: SplitSpec | null;
}

interface SelectedTree {
	readonly root: SubdivisionNode;
	readonly candidateIndex: number;
}

interface SubtreeRequirements {
	readonly cols: number;
	readonly rows: number;
	readonly leaves: number;
}

const CANDIDATE_COUNT = 12;
const MAX_STACK_DEPTH = 8;
const MAX_SUPPORTED_LINE_WIDTH_PCT = 1.5;
const MIN_SUPPORTED_LINE_WIDTH_PCT = 0.25;

const treeCache = new Map<number, SelectedTree>();
const MAX_TREE_CACHE = 64;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function computeRequirements(node: SubdivisionNode, activePanels: number): SubtreeRequirements {
	if (!node.split || node.split.splitOrder >= activePanels) {
		return { cols: 1, rows: 1, leaves: 1 };
	}
	const leftReq = computeRequirements(node.split.left, activePanels);
	const rightReq = computeRequirements(node.split.right, activePanels);
	if (node.split.orientation === 'vertical') {
		return {
			cols: leftReq.cols + rightReq.cols,
			rows: Math.max(leftReq.rows, rightReq.rows),
			leaves: leftReq.leaves + rightReq.leaves
		};
	}
	return {
		cols: Math.max(leftReq.cols, rightReq.cols),
		rows: leftReq.rows + rightReq.rows,
		leaves: leftReq.leaves + rightReq.leaves
	};
}

function wouldExceedStack(
	root: SubdivisionNode,
	targetNode: SubdivisionNode,
	orientation: SplitOrientation,
	nextSplitOrder: number
): boolean {
	const saved = targetNode.split;
	targetNode.split = {
		splitOrder: nextSplitOrder,
		orientation,
		targetRatio: 0.5,
		extremePush: 1,
		left: { id: `${targetNode.id}a`, depth: targetNode.depth + 1, split: null },
		right: { id: `${targetNode.id}b`, depth: targetNode.depth + 1, split: null }
	};
	const req = computeRequirements(root, nextSplitOrder + 1);
	targetNode.split = saved;
	return req.cols > MAX_STACK_DEPTH || req.rows > MAX_STACK_DEPTH;
}

function sampleAsymmetricRatio(rng: SeededRandom, splitOrder: number): { targetRatio: number; extremePush: number } {
	const roll = rng.next();
	let base: number;
	if (splitOrder <= 2) {
		// Primary structural divisions: clear asymmetric thirds/fifths, avoiding dead-center halves.
		base = rng.chance(0.5) ? rng.range(0.24, 0.41) : rng.range(0.59, 0.76);
	} else if (roll < 0.28) {
		// Narrow accent strip on one side, generous field on the other.
		base = rng.chance(0.5) ? rng.range(0.13, 0.24) : rng.range(0.76, 0.87);
	} else if (roll < 0.82) {
		// Asymmetric medium split.
		base = rng.chance(0.5) ? rng.range(0.26, 0.42) : rng.range(0.58, 0.74);
	} else {
		// Quieter near-balanced split for rhythm variety.
		base = rng.range(0.43, 0.57);
	}
	const extremePush = rng.range(1.08, 1.32);
	return { targetRatio: base, extremePush };
}

interface LeafPreview {
	readonly node: SubdivisionNode;
	readonly x0: number;
	readonly y0: number;
	readonly x1: number;
	readonly y1: number;
	readonly parentOrientation: SplitOrientation | null;
}

function collectPreviewLeaves(
	node: SubdivisionNode,
	activePanels: number,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	parentOrientation: SplitOrientation | null,
	out: LeafPreview[]
): void {
	if (!node.split || node.split.splitOrder >= activePanels) {
		out.push({ node, x0, y0, x1, y1, parentOrientation });
		return;
	}
	const reqL = computeRequirements(node.split.left, activePanels);
	const reqR = computeRequirements(node.split.right, activePanels);
	const minUnit = 0.04;
	if (node.split.orientation === 'vertical') {
		const w = x1 - x0;
		const low = clamp((reqL.cols * minUnit) / w, 0.08, 0.49);
		const high = clamp(1 - (reqR.cols * minUnit) / w, 0.51, 0.92);
		const ratio = clamp(node.split.targetRatio, low, high);
		const xm = x0 + w * ratio;
		collectPreviewLeaves(node.split.left, activePanels, x0, y0, xm, y1, 'vertical', out);
		collectPreviewLeaves(node.split.right, activePanels, xm, y0, x1, y1, 'vertical', out);
	} else {
		const h = y1 - y0;
		const low = clamp((reqL.rows * minUnit) / h, 0.08, 0.49);
		const high = clamp(1 - (reqR.rows * minUnit) / h, 0.51, 0.92);
		const ratio = clamp(node.split.targetRatio, low, high);
		const ym = y0 + h * ratio;
		collectPreviewLeaves(node.split.left, activePanels, x0, y0, x1, ym, 'horizontal', out);
		collectPreviewLeaves(node.split.right, activePanels, x0, ym, x1, y1, 'horizontal', out);
	}
}

function buildCandidateTree(rng: SeededRandom, candidateIdx: number): SubdivisionNode {
	const root: SubdivisionNode = { id: 'p0', depth: 0, split: null };
	// Designate one early quadrant/branch to stay relatively open until higher panel counts.
	const sanctuaryIndex = rng.int(0, 3);

	for (let splitOrder = 1; splitOrder < MAX_PANELS; splitOrder++) {
		const leaves: LeafPreview[] = [];
		collectPreviewLeaves(root, splitOrder, 0, 0, 1, 1, null, leaves);

		const choices: {
			leaf: LeafPreview;
			orientation: SplitOrientation;
			weight: number;
		}[] = [];

		// Sort leaves by area descending to identify the open sanctuary candidate.
		const sortedByArea = [...leaves].sort(
			(a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0)
		);
		const sanctuaryNode =
			splitOrder >= 4 && splitOrder <= 20 && sortedByArea.length > 2
				? sortedByArea[sanctuaryIndex % Math.min(2, sortedByArea.length)]?.node
				: null;

		for (const leaf of leaves) {
			const w = (leaf.x1 - leaf.x0) * DEFAULT_ASPECT_RATIO;
			const h = leaf.y1 - leaf.y0;
			const normArea = (leaf.x1 - leaf.x0) * (leaf.y1 - leaf.y0);

			const canV = !wouldExceedStack(root, leaf.node, 'vertical', splitOrder) && leaf.x1 - leaf.x0 > 0.095;
			const canH =
				!wouldExceedStack(root, leaf.node, 'horizontal', splitOrder) && leaf.y1 - leaf.y0 > 0.095;

			for (const orientation of ['vertical', 'horizontal'] as const) {
				const allowed = orientation === 'vertical' ? canV : canH;
				if (!allowed) continue;

				const aspectBias = orientation === 'vertical' ? clamp(w / (h + 1e-4), 0.35, 2.8) : clamp(h / (w + 1e-4), 0.35, 2.8);
				const alternateBias =
					leaf.parentOrientation === null
						? 1.0
						: leaf.parentOrientation !== orientation
							? 1.45
							: 0.68;
				const sanctuaryFactor = leaf.node === sanctuaryNode ? 0.14 : 1.0;
				const areaFactor = Math.pow(normArea, 0.82 + (candidateIdx % 3) * 0.08);
				const weight = Math.max(1e-5, areaFactor * aspectBias * alternateBias * sanctuaryFactor);
				choices.push({ leaf, orientation, weight });
			}
		}

		if (choices.length === 0) {
			// Guaranteed fallback: MAX_STACK_DEPTH = 8 holds up to 64 leaves >> 30.
			for (const leaf of leaves) {
				const area = (leaf.x1 - leaf.x0) * (leaf.y1 - leaf.y0);
				if (!wouldExceedStack(root, leaf.node, 'vertical', splitOrder)) {
					choices.push({ leaf, orientation: 'vertical', weight: area + 0.001 });
				}
				if (!wouldExceedStack(root, leaf.node, 'horizontal', splitOrder)) {
					choices.push({ leaf, orientation: 'horizontal', weight: area + 0.001 });
				}
			}
		}

		const totalWeight = choices.reduce((sum, c) => sum + c.weight, 0);
		let pickVal = rng.next() * totalWeight;
		let chosen = choices[choices.length - 1]!;
		for (const item of choices) {
			pickVal -= item.weight;
			if (pickVal <= 0) {
				chosen = item;
				break;
			}
		}

		const { targetRatio, extremePush } = sampleAsymmetricRatio(rng, splitOrder);
		chosen.leaf.node.split = {
			splitOrder,
			orientation: chosen.orientation,
			targetRatio,
			extremePush,
			left: {
				id: `s${splitOrder}a`,
				depth: chosen.leaf.node.depth + 1,
				split: null
			},
			right: {
				id: `s${splitOrder}b`,
				depth: chosen.leaf.node.depth + 1,
				split: null
			}
		};
	}

	return root;
}

/**
 * Practical compositional heuristic evaluated once at a fixed reference configuration
 * (14 panels, 65% uneven spacing, 1.5 aspect ratio) so parameter adjustments never
 * switch trees mid-interaction.
 */
function scoreCandidateTree(root: SubdivisionNode): number {
	const reference = evaluateTree(root, 418207, 0, 14, 65, DEFAULT_ASPECT_RATIO, 0.7);
	const areas = reference.regions.map((r) => r.area).sort((a, b) => b - a);
	const largest = areas[0] ?? 0;
	const secondLargest = areas[1] ?? 0;
	const smallest = areas[areas.length - 1] ?? 0;

	let score = 0;

	// Reward a generous open field (~16% to 34% of canvas) without letting one region swallow >46%.
	if (largest >= 0.16 && largest <= 0.35) score += 28;
	else if (largest > 0.35 && largest <= 0.45) score += 14;
	else score -= 12;

	if (secondLargest >= 0.1 && secondLargest <= 0.26) score += 14;

	// Reward area spread (coefficient of variation) so panels are not a uniform grid.
	const mean = 1 / areas.length;
	const variance = areas.reduce((acc, a) => acc + (a - mean) * (a - mean), 0) / areas.length;
	const cv = Math.sqrt(variance) / mean;
	score += clamp(cv * 22, 0, 26);

	// Penalize cramped slivers at reference configuration.
	if (smallest < 0.014) score -= 24;
	else if (smallest >= 0.018 && smallest <= 0.042) score += 10;

	// Reward a healthy balance of horizontal and vertical boundaries and mix of long + short lines.
	const horiz = reference.boundaries.filter((b) => b.orientation === 'horizontal');
	const vert = reference.boundaries.filter((b) => b.orientation === 'vertical');
	const hFrac = horiz.length / Math.max(1, reference.boundaries.length);
	score += 18 * (1 - Math.abs(hFrac - 0.5) * 2.4);

	const longLines = reference.boundaries.filter((b) => b.length >= 0.68).length;
	const shortLines = reference.boundaries.filter((b) => b.length <= 0.45).length;
	if (longLines >= 2 && longLines <= 5) score += 16;
	if (shortLines >= 3) score += 10;

	return score;
}

function getSelectedTree(seed: number): SelectedTree {
	const normalized = normalizeSeed(seed);
	const cached = treeCache.get(normalized);
	if (cached) return cached;

	const layoutStream = deriveStream(normalized, 'layout');
	let bestRoot: SubdivisionNode | null = null;
	let bestScore = -Infinity;
	let bestIndex = 0;

	for (let i = 0; i < CANDIDATE_COUNT; i++) {
		const candidateRng = layoutStream.fork(`candidate-${i}`);
		const candidate = buildCandidateTree(candidateRng, i);
		const score = scoreCandidateTree(candidate);
		if (score > bestScore) {
			bestScore = score;
			bestRoot = candidate;
			bestIndex = i;
		}
	}

	const selected: SelectedTree = {
		root: bestRoot!,
		candidateIndex: bestIndex
	};

	if (treeCache.size >= MAX_TREE_CACHE) {
		const oldestKey = treeCache.keys().next().value;
		if (oldestKey !== undefined) treeCache.delete(oldestKey);
	}
	treeCache.set(normalized, selected);
	return selected;
}

interface RawSegment {
	readonly orientation: SplitOrientation;
	readonly coord: number;
	readonly start: number;
	readonly end: number;
	readonly splitOrder: number;
}

export function mergeBoundaries(rawSegments: readonly RawSegment[]): BoundarySegment[] {
	const EPS = 1e-5;
	const groups: {
		orientation: SplitOrientation;
		coord: number;
		intervals: { start: number; end: number; splitOrder: number }[];
	}[] = [];

	for (const seg of rawSegments) {
		if (seg.end - seg.start <= EPS) continue;
		let group = groups.find(
			(g) => g.orientation === seg.orientation && Math.abs(g.coord - seg.coord) <= EPS
		);
		if (!group) {
			group = { orientation: seg.orientation, coord: seg.coord, intervals: [] };
			groups.push(group);
		}
		group.intervals.push({
			start: seg.start,
			end: seg.end,
			splitOrder: seg.splitOrder
		});
	}

	const merged: BoundarySegment[] = [];
	for (const group of groups) {
		group.intervals.sort((a, b) => a.start - b.start || a.splitOrder - b.splitOrder);
		let current = { ...group.intervals[0]! };
		for (let i = 1; i < group.intervals.length; i++) {
			const next = group.intervals[i]!;
			if (next.start <= current.end + EPS) {
				current.end = Math.max(current.end, next.end);
				current.splitOrder = Math.min(current.splitOrder, next.splitOrder);
			} else {
				merged.push({
					id: `line-${current.splitOrder}-${group.orientation[0]}-${Math.round(current.start * 1000)}`,
					orientation: group.orientation,
					coord: group.coord,
					start: current.start,
					end: current.end,
					length: current.end - current.start,
					splitOrder: current.splitOrder
				});
				current = { ...next };
			}
		}
		merged.push({
			id: `line-${current.splitOrder}-${group.orientation[0]}-${Math.round(current.start * 1000)}`,
			orientation: group.orientation,
			coord: group.coord,
			start: current.start,
			end: current.end,
			length: current.end - current.start,
			splitOrder: current.splitOrder
		});
	}

	merged.sort((a, b) => a.splitOrder - b.splitOrder || a.coord - b.coord || a.start - b.start);
	return merged;
}

function evaluateTree(
	root: SubdivisionNode,
	seed: number,
	candidateIndex: number,
	panelsInput: number,
	unevenSpacingInput: number,
	aspectRatioInput: number,
	lineWidthInput: number
): LayoutModel {
	const panels = Math.round(clamp(panelsInput, MIN_PANELS, MAX_PANELS));
	const unevenSpacing = clamp(unevenSpacingInput, 0, 100);
	const aspectRatio = clamp(Number.isFinite(aspectRatioInput) ? aspectRatioInput : DEFAULT_ASPECT_RATIO, 0.12, 8.5);
	const requestedLineWidth = clamp(
		lineWidthInput,
		MIN_SUPPORTED_LINE_WIDTH_PCT,
		MAX_SUPPORTED_LINE_WIDTH_PCT
	);

	const rootReq = computeRequirements(root, panels);
	const scaleX = Math.min(1, 1 / aspectRatio);
	const scaleY = Math.min(1, aspectRatio);

	// Check whether maximum supported line width fits comfortably at this aspect ratio.
	const maxAllowedLwByX = (0.86 / (rootReq.cols * 2.15 * scaleX)) * 100;
	const maxAllowedLwByY = (0.86 / (rootReq.rows * 2.15 * scaleY)) * 100;
	const maxFeasibleLineWidthPct = Math.max(
		0.15,
		Math.min(MAX_SUPPORTED_LINE_WIDTH_PCT, maxAllowedLwByX, maxAllowedLwByY)
	);

	let effectiveLineWidth = requestedLineWidth;
	let reason: string | null = null;
	if (requestedLineWidth > maxFeasibleLineWidthPct + 1e-4) {
		effectiveLineWidth = Number(maxFeasibleLineWidthPct.toFixed(2));
		reason =
			'Line width was slightly limited for this very narrow viewport so every panel interior stays visible.';
	}

	// Minimum normalized leaf dimensions guarantee positive visible interiors across the entire
	// supported line-width range (or up to maxFeasibleLineWidthPct on extreme viewports).
	const guardLwPct = Math.min(MAX_SUPPORTED_LINE_WIDTH_PCT, maxFeasibleLineWidthPct);
	const minLeafW = Math.min(
		0.9 / rootReq.cols,
		Math.max(0.034, (guardLwPct / 100) * scaleX * 2.2)
	);
	const minLeafH = Math.min(
		0.9 / rootReq.rows,
		Math.max(0.034, (guardLwPct / 100) * scaleY * 2.2)
	);

	const unevenT = unevenSpacing / 100;
	const regions: NormalizedRect[] = [];
	const rawSegments: RawSegment[] = [];

	const traverse = (
		node: SubdivisionNode,
		x0: number,
		y0: number,
		x1: number,
		y1: number
	): void => {
		if (!node.split || node.split.splitOrder >= panels) {
			const width = Math.max(0, x1 - x0);
			const height = Math.max(0, y1 - y0);
			regions.push({
				id: node.id,
				index: regions.length,
				x0,
				y0,
				x1,
				y1,
				width,
				height,
				area: width * height,
				depth: node.depth
			});
			return;
		}

		const { splitOrder, orientation, targetRatio, extremePush, left, right } = node.split;
		const leftReq = computeRequirements(left, panels);
		const rightReq = computeRequirements(right, panels);

		if (orientation === 'vertical') {
			const w = x1 - x0;
			const minFrac = clamp((leftReq.cols * minLeafW) / w, 0.02, 0.98);
			const maxFrac = clamp(1 - (rightReq.cols * minLeafW) / w, minFrac, 0.98);

			const structuralEven = leftReq.cols / (leftReq.cols + rightReq.cols);
			const evenRatio = clamp(0.5 * 0.45 + structuralEven * 0.55, minFrac, maxFrac);
			let desiredRatio: number;
			if (unevenT <= 0.65) {
				const k = unevenT / 0.65;
				desiredRatio = evenRatio + (targetRatio - evenRatio) * k;
			} else {
				const extra = (unevenT - 0.65) / 0.35;
				const pushed = 0.5 + (targetRatio - 0.5) * (1 + extra * 0.42 * extremePush);
				desiredRatio = targetRatio + (pushed - targetRatio) * extra;
			}
			const ratio = clamp(desiredRatio, minFrac, maxFrac);
			const xm = x0 + w * ratio;

			rawSegments.push({
				orientation: 'vertical',
				coord: xm,
				start: y0,
				end: y1,
				splitOrder
			});

			traverse(left, x0, y0, xm, y1);
			traverse(right, xm, y0, x1, y1);
		} else {
			const h = y1 - y0;
			const minFrac = clamp((leftReq.rows * minLeafH) / h, 0.02, 0.98);
			const maxFrac = clamp(1 - (rightReq.rows * minLeafH) / h, minFrac, 0.98);

			const structuralEven = leftReq.rows / (leftReq.rows + rightReq.rows);
			const evenRatio = clamp(0.5 * 0.45 + structuralEven * 0.55, minFrac, maxFrac);
			let desiredRatio: number;
			if (unevenT <= 0.65) {
				const k = unevenT / 0.65;
				desiredRatio = evenRatio + (targetRatio - evenRatio) * k;
			} else {
				const extra = (unevenT - 0.65) / 0.35;
				const pushed = 0.5 + (targetRatio - 0.5) * (1 + extra * 0.42 * extremePush);
				desiredRatio = targetRatio + (pushed - targetRatio) * extra;
			}
			const ratio = clamp(desiredRatio, minFrac, maxFrac);
			const ym = y0 + h * ratio;

			rawSegments.push({
				orientation: 'horizontal',
				coord: ym,
				start: x0,
				end: x1,
				splitOrder
			});

			traverse(left, x0, y0, x1, ym);
			traverse(right, x0, ym, x1, y1);
		}
	};

	traverse(root, 0, 0, 1, 1);

	const boundaries = mergeBoundaries(rawSegments);
	const lineThicknessX = (effectiveLineWidth / 100) * scaleX;
	const lineThicknessY = (effectiveLineWidth / 100) * scaleY;
	const limitNotice: LayoutLimitNotice = {
		clamped: reason !== null,
		effectiveLineWidth,
		reason
	};

	return {
		seed: normalizeSeed(seed),
		panels,
		unevenSpacing,
		aspectRatio,
		lineWidth: requestedLineWidth,
		effectiveLineWidth,
		lineThicknessX,
		lineThicknessY,
		regions,
		boundaries,
		candidateIndex,
		limitNotice
	};
}

export function generateLayout(params: {
	seed: number;
	panels: number;
	unevenSpacing: number;
	aspectRatio: number;
	lineWidth: number;
}): LayoutModel {
	const selected = getSelectedTree(params.seed);
	return evaluateTree(
		selected.root,
		params.seed,
		selected.candidateIndex,
		params.panels,
		params.unevenSpacing,
		params.aspectRatio,
		params.lineWidth
	);
}
