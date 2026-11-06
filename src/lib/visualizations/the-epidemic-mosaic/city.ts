import { Delaunay, polygonArea as d3PolygonArea, polygonCentroid } from 'd3';
import { createSeededRng } from './random.ts';
import {
	CITY_MARGIN,
	DEFAULT_BRIDGE_A_ID,
	DEFAULT_BRIDGE_B_ID,
	DEFAULT_CITY_SEED,
	LOGICAL_HEIGHT,
	LOGICAL_WIDTH,
	POPULATION_PER_REGION,
	REGIONS_PER_COMMUNITY,
	TOTAL_REGIONS,
	type BridgeSelection,
	type CityNetwork,
	type CityRegion,
	type CommunityId,
	type CompartmentKey,
	type ContactEdge,
	type HorizontalColourBand,
	type Point2D,
	type RegionCompartmentCounts
} from './types.ts';

const COMMUNITY_A_NAMES: readonly string[] = [
	'Millfield',
	'Old Wharf',
	'Clocktower',
	'Copper Lane',
	'Market Cross',
	'Foundry Quay',
	'Weavers Row',
	"St Jude's",
	'Brickfields',
	'Westgate',
	'Orchard Hill',
	'Tannery Yard',
	'Limehouse',
	'Beacon Hill',
	'Ropewalk',
	'South Downs',
	'Maltings',
	'Cinder Bank'
];

const COMMUNITY_B_NAMES: readonly string[] = [
	'North Priory',
	'Glassworks',
	'Canal Basin',
	'Abbey Mead',
	'Station Yard',
	'Eastgate',
	'Corn Exchange',
	"Potter's Field",
	'Saffron Hill',
	'Timber Dock',
	'Chalk Farm',
	'Ironbridge',
	'Vicarage',
	'Waterworks',
	'Quarry Bank',
	'Greenwich Fold',
	'Highgate',
	'Harbour Wall'
];

function roundCoord(v: number): number {
	return Math.round(v * 100) / 100;
}

export function polygonToSvgPath(polygon: Point2D[]): string {
	if (polygon.length === 0) return '';
	const parts = polygon.map(
		(pt, idx) => `${idx === 0 ? 'M' : 'L'}${roundCoord(pt[0])},${roundCoord(pt[1])}`
	);
	parts.push('Z');
	return parts.join(' ');
}

export function computeUnsignedPolygonArea(polygon: Point2D[]): number {
	if (polygon.length < 3) return 0;
	return Math.abs(d3PolygonArea(polygon));
}

function removeDuplicateClosingVertex(rawRing: Point2D[]): Point2D[] {
	if (rawRing.length <= 1) return rawRing.slice();
	const out: Point2D[] = [];
	for (let i = 0; i < rawRing.length; i++) {
		const [x, y] = rawRing[i];
		if (i === rawRing.length - 1) {
			const [fx, fy] = rawRing[0];
			if (Math.hypot(x - fx, y - fy) < 1e-5) continue;
		}
		if (out.length > 0) {
			const [px, py] = out[out.length - 1];
			if (Math.hypot(x - px, y - py) < 1e-5) continue;
		}
		out.push([x, y]);
	}
	return out;
}

/**
 * Clips a polygon against the horizontal strip [yMin, yMax] using Sutherland-Hodgman half-plane clipping.
 */
export function clipPolygonHorizontalStrip(
	polygon: Point2D[],
	yMin: number,
	yMax: number
): Point2D[] {
	if (polygon.length < 3 || yMax <= yMin + 1e-9) return [];

	const clipLower = (pts: Point2D[], yBound: number): Point2D[] => {
		if (pts.length === 0) return [];
		const out: Point2D[] = [];
		for (let i = 0; i < pts.length; i++) {
			const curr = pts[i];
			const prev = pts[(i + pts.length - 1) % pts.length];
			const currInside = curr[1] >= yBound - 1e-9;
			const prevInside = prev[1] >= yBound - 1e-9;

			if (currInside !== prevInside) {
				const dy = curr[1] - prev[1];
				const t = Math.abs(dy) < 1e-12 ? 0 : (yBound - prev[1]) / dy;
				const ix = prev[0] + t * (curr[0] - prev[0]);
				out.push([ix, yBound]);
			}
			if (currInside) {
				out.push([curr[0], Math.max(yBound, curr[1])]);
			}
		}
		return out;
	};

	const clipUpper = (pts: Point2D[], yBound: number): Point2D[] => {
		if (pts.length === 0) return [];
		const out: Point2D[] = [];
		for (let i = 0; i < pts.length; i++) {
			const curr = pts[i];
			const prev = pts[(i + pts.length - 1) % pts.length];
			const currInside = curr[1] <= yBound + 1e-9;
			const prevInside = prev[1] <= yBound + 1e-9;

			if (currInside !== prevInside) {
				const dy = curr[1] - prev[1];
				const t = Math.abs(dy) < 1e-12 ? 0 : (yBound - prev[1]) / dy;
				const ix = prev[0] + t * (curr[0] - prev[0]);
				out.push([ix, yBound]);
			}
			if (currInside) {
				out.push([curr[0], Math.min(yBound, curr[1])]);
			}
		}
		return out;
	};

	const afterLower = clipLower(polygon, yMin);
	const afterBoth = clipUpper(afterLower, yMax);
	return removeDuplicateClosingVertex(afterBoth);
}

/**
 * Finds the horizontal cut y in [minY, maxY] such that the area of polygon above minY up to y
 * equals targetFraction * totalArea. Uses binary search with exact Sutherland-Hodgman area evaluation.
 */
export function findHorizontalCutForAreaFraction(
	polygon: Point2D[],
	minY: number,
	maxY: number,
	totalArea: number,
	targetFraction: number
): number {
	if (targetFraction <= 0) return minY;
	if (targetFraction >= 1) return maxY;
	const targetArea = targetFraction * totalArea;

	let lo = minY;
	let hi = maxY;
	for (let iter = 0; iter < 38; iter++) {
		const mid = 0.5 * (lo + hi);
		const clipped = clipPolygonHorizontalStrip(polygon, minY, mid);
		const area = computeUnsignedPolygonArea(clipped);
		if (area < targetArea) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return 0.5 * (lo + hi);
}

/**
 * Calculates horizontal colour bands within an irregular polygon so that each band's
 * geometric AREA (rather than merely its vertical height) matches the compartment population fraction.
 *
 * Band order from top (minY) to bottom (maxY):
 *   S (Susceptible) -> V (Vaccinated) -> R (Recovered) -> I (Infectious)
 * This places Infectious at the base and Susceptible at the top in a consistent vertical stack.
 */
export function computePolygonPopulationBands(
	region: Pick<CityRegion, 'polygon' | 'boundsY' | 'polygonArea'>,
	counts: RegionCompartmentCounts
): HorizontalColourBand[] {
	const totalPop = counts.N > 0 ? counts.N : counts.S + counts.I + counts.R + counts.V;
	if (totalPop <= 0 || region.polygonArea <= 0) return [];

	const order: CompartmentKey[] = ['S', 'V', 'R', 'I'];
	const [minY, maxY] = region.boundsY;
	const bands: HorizontalColourBand[] = [];

	let cumulativeCount = 0;
	let prevY = minY;

	for (let i = 0; i < order.length; i++) {
		const key = order[i];
		const count = counts[key];
		if (count <= 0) continue;

		cumulativeCount += count;
		const cumFraction = Math.min(1, cumulativeCount / totalPop);
		const nextY =
			cumulativeCount >= totalPop
				? maxY
				: findHorizontalCutForAreaFraction(
						region.polygon,
						minY,
						maxY,
						region.polygonArea,
						cumFraction
					);

		const clippedPolygon = clipPolygonHorizontalStrip(region.polygon, prevY, nextY);
		const area = computeUnsignedPolygonArea(clippedPolygon);

		bands.push({
			compartment: key,
			count,
			fraction: count / totalPop,
			yStart: prevY,
			yEnd: nextY,
			clippedPolygon,
			svgPath: polygonToSvgPath(clippedPolygon),
			area
		});

		prevY = nextY;
	}

	return bands;
}

function polygonsShareBorderSegment(
	polyA: Point2D[],
	polyB: Point2D[]
): [Point2D, Point2D] | null {
	const eps = 0.75;
	for (let i = 0; i < polyA.length; i++) {
		const a1 = polyA[i];
		const a2 = polyA[(i + 1) % polyA.length];
		for (let j = 0; j < polyB.length; j++) {
			const b1 = polyB[j];
			const b2 = polyB[(j + 1) % polyB.length];
			const matchForward =
				Math.hypot(a1[0] - b1[0], a1[1] - b1[1]) < eps &&
				Math.hypot(a2[0] - b2[0], a2[1] - b2[1]) < eps;
			const matchReverse =
				Math.hypot(a1[0] - b2[0], a1[1] - b2[1]) < eps &&
				Math.hypot(a2[0] - b1[0], a2[1] - b1[1]) < eps;
			if (matchForward || matchReverse) {
				const len = Math.hypot(a2[0] - a1[0], a2[1] - a1[1]);
				if (len >= 5) {
					return [a1, a2];
				}
			}
		}
	}
	return null;
}

/**
 * Generates the reproducible 36-region Voronoi city and sparse intra-community contact networks.
 */
export function generateCityNetwork(citySeed: number = DEFAULT_CITY_SEED): CityNetwork {
	const rng = createSeededRng(citySeed);
	const minX = CITY_MARGIN;
	const maxX = LOGICAL_WIDTH - CITY_MARGIN;
	const minY = CITY_MARGIN;
	const maxY = LOGICAL_HEIGHT - CITY_MARGIN;
	const midX = LOGICAL_WIDTH / 2;

	// Generate 18 well-spaced points in Community A (left half) and 18 in Community B (right half)
	// using a 6-row x 3-col stratified grid per community, followed by constrained Lloyd relaxation.
	const cols = 3;
	const rows = 6;
	const points: Point2D[] = [];

	const leftSpanX = midX - minX - 10;
	const rightStart = midX + 10;
	const rightSpanX = maxX - rightStart;
	const spanY = maxY - minY;

	for (let comm = 0; comm < 2; comm++) {
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const jx = (rng() - 0.5) * 0.46;
				const jy = (rng() - 0.5) * 0.46;
				const normX = (c + 0.5 + jx) / cols;
				const normY = (r + 0.5 + jy) / rows;
				const x =
					comm === 0 ? minX + 6 + normX * (leftSpanX - 12) : rightStart + 6 + normX * (rightSpanX - 12);
				const y = minY + 8 + normY * (spanY - 16);
				points.push([x, y]);
			}
		}
	}

	// 3 iterations of constrained Lloyd relaxation to avoid slivers while preserving irregularity
	for (let iter = 0; iter < 3; iter++) {
		const delaunay = Delaunay.from(points);
		const voronoi = delaunay.voronoi([minX, minY, maxX, maxY]);
		for (let i = 0; i < TOTAL_REGIONS; i++) {
			const cell = voronoi.cellPolygon(i) as Point2D[] | null;
			if (!cell || cell.length < 3) continue;
			const clean = removeDuplicateClosingVertex(cell);
			const [cx, cy] = polygonCentroid(clean);
			const isA = i < REGIONS_PER_COMMUNITY;
			const nextX = points[i][0] * 0.35 + cx * 0.65;
			const nextY = points[i][1] * 0.35 + cy * 0.65;
			points[i] = [
				isA
					? Math.max(minX + 18, Math.min(midX - 16, nextX))
					: Math.max(midX + 16, Math.min(maxX - 18, nextX)),
				Math.max(minY + 18, Math.min(maxY - 18, nextY))
			];
		}
	}

	const finalDelaunay = Delaunay.from(points);
	const finalVoronoi = finalDelaunay.voronoi([minX, minY, maxX, maxY]);

	const regions: CityRegion[] = [];
	const regionById = new Map<string, CityRegion>();

	for (let i = 0; i < TOTAL_REGIONS; i++) {
		const isA = i < REGIONS_PER_COMMUNITY;
		const localNum = isA ? i + 1 : i - REGIONS_PER_COMMUNITY + 1;
		const community: CommunityId = isA ? 'A' : 'B';
		const id = `${community}${String(localNum).padStart(2, '0')}`;
		const shortLabel = `${community}${localNum}`;
		const name = isA ? COMMUNITY_A_NAMES[localNum - 1] : COMMUNITY_B_NAMES[localNum - 1];
		const fullName = `${shortLabel} · ${name}`;

		const rawCell = finalVoronoi.cellPolygon(i) as Point2D[];
		const polygon = removeDuplicateClosingVertex(rawCell).map(
			([x, y]): Point2D => [roundCoord(x), roundCoord(y)]
		);
		const [cx, cy] = polygonCentroid(polygon);
		const centroid: Point2D = [roundCoord(cx), roundCoord(cy)];
		const area = computeUnsignedPolygonArea(polygon);

		let bMinX = Infinity;
		let bMaxX = -Infinity;
		let bMinY = Infinity;
		let bMaxY = -Infinity;
		for (const [px, py] of polygon) {
			if (px < bMinX) bMinX = px;
			if (px > bMaxX) bMaxX = px;
			if (py < bMinY) bMinY = py;
			if (py > bMaxY) bMaxY = py;
		}

		const region: CityRegion = {
			index: i,
			id,
			shortLabel,
			name,
			fullName,
			community,
			population: POPULATION_PER_REGION,
			seedPoint: [roundCoord(points[i][0]), roundCoord(points[i][1])],
			centroid,
			polygon,
			svgPath: polygonToSvgPath(polygon),
			polygonArea: area,
			boundsY: [bMinY, bMaxY],
			boundsX: [bMinX, bMaxX],
			borderNeighbourIndices: []
		};

		regions.push(region);
		regionById.set(id, region);
	}

	// Detect polygon border neighbours and extract the seam between Community A and Community B
	const communitySeamSegments: [Point2D, Point2D][] = [];
	for (let i = 0; i < TOTAL_REGIONS; i++) {
		for (let j = i + 1; j < TOTAL_REGIONS; j++) {
			const sharedSeg = polygonsShareBorderSegment(regions[i].polygon, regions[j].polygon);
			if (sharedSeg) {
				regions[i].borderNeighbourIndices.push(j);
				regions[j].borderNeighbourIndices.push(i);
				if (regions[i].community !== regions[j].community) {
					communitySeamSegments.push(sharedSeg);
				}
			}
		}
	}

	// Build sparse, connected intra-community graphs with:
	// 1. Spanning tree + selected short links
	// 2. Deliberately omitted border-neighbour edges (so touching regions can remain disconnected)
	// 3. Explicit long-range links joining visually distant non-neighbouring regions
	const baseEdges: ContactEdge[] = [];
	const edgeKeySet = new Set<string>();

	const addIntraEdge = (u: number, v: number) => {
		if (u === v) return;
		if (regions[u].community !== regions[v].community) return;
		const a = Math.min(u, v);
		const b = Math.max(u, v);
		const key = `${a}--${b}`;
		if (edgeKeySet.has(key)) return;
		edgeKeySet.add(key);

		const regA = regions[a];
		const regB = regions[b];
		const sharesPolygonBorder = regA.borderNeighbourIndices.includes(b);
		const euclideanDistance = Math.hypot(
			regA.centroid[0] - regB.centroid[0],
			regA.centroid[1] - regB.centroid[1]
		);

		baseEdges.push({
			id: `${regA.id}--${regB.id}`,
			sourceIndex: a,
			targetIndex: b,
			sourceId: regA.id,
			targetId: regB.id,
			weight: 1,
			sharesPolygonBorder,
			euclideanDistance: roundCoord(euclideanDistance),
			isBridge: false
		});
	};

	const buildCommunityGraph = (offset: number, omittedPairs: [number, number][], longPairs: [number, number][]) => {
		const omittedSet = new Set(
			omittedPairs.map(([u, v]) => `${Math.min(u, v)}--${Math.max(u, v)}`)
		);

		// Grid-backbone spanning tree on the 6x3 layout (ensuring every node in the 18-node community is connected)
		// Wait: only add backbone edge if not in omittedSet; afterwards repair connectivity with non-omitted border neighbours
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const u = offset + r * cols + c;
				if (c + 1 < cols) {
					const v = offset + r * cols + (c + 1);
					const k = `${Math.min(u, v)}--${Math.max(u, v)}`;
					if (!omittedSet.has(k)) addIntraEdge(u, v);
				}
				if (r + 1 < rows) {
					const v = offset + (r + 1) * cols + c;
					const k = `${Math.min(u, v)}--${Math.max(u, v)}`;
					if (!omittedSet.has(k)) addIntraEdge(u, v);
				}
			}
		}

		// Ensure connectivity across all 18 nodes in the community if an omitted backbone edge split anything
		const getComponent = (start: number): Set<number> => {
			const visited = new Set<number>([start]);
			const queue = [start];
			while (queue.length > 0) {
				const curr = queue.shift()!;
				for (const e of baseEdges) {
					if (e.sourceIndex === curr && !visited.has(e.targetIndex)) {
						visited.add(e.targetIndex);
						queue.push(e.targetIndex);
					} else if (e.targetIndex === curr && !visited.has(e.sourceIndex)) {
						visited.add(e.sourceIndex);
						queue.push(e.sourceIndex);
					}
				}
			}
			return visited;
		};

		while (true) {
			const comp = getComponent(offset);
			if (comp.size === REGIONS_PER_COMMUNITY) break;
			let bridged = false;
			for (let u = offset; u < offset + REGIONS_PER_COMMUNITY && !bridged; u++) {
				if (!comp.has(u)) continue;
				for (const v of regions[u].borderNeighbourIndices) {
					if (v < offset || v >= offset + REGIONS_PER_COMMUNITY) continue;
					if (comp.has(v)) continue;
					const k = `${Math.min(u, v)}--${Math.max(u, v)}`;
					if (!omittedSet.has(k)) {
						addIntraEdge(u, v);
						bridged = true;
						break;
					}
				}
			}
			if (!bridged) {
				// Fallback: connect first unreached node to nearest reached node
				for (let v = offset; v < offset + REGIONS_PER_COMMUNITY; v++) {
					if (!comp.has(v)) {
						addIntraEdge(offset, v);
						break;
					}
				}
			}
		}

		// Add explicit long-range connections between visually distant non-neighbouring polygons
		for (const [lu, lv] of longPairs) {
			addIntraEdge(offset + lu, offset + lv);
		}
	};

	// Community A (indices 0..17):
	// Region A05 is index 4 (row 1, col 1). Its neighbours include A02 (idx 1), A04 (idx 3), A06 (idx 5), A08 (idx 7).
	// Deliberately omit (4, 1) [A05--A02], (4, 7) [A05--A08], (0, 3) [A01--A04], (10, 13) [A11--A14]
	// so touching regions remain visibly disconnected!
	// Add long-range links: A05 (4) <-> A16 (15), A02 (1) <-> A17 (16), A03 (2) <-> A13 (12)
	buildCommunityGraph(
		0,
		[
			[4, 1],
			[4, 7],
			[0, 3],
			[10, 13],
			[6, 9]
		],
		[
			[4, 15],
			[1, 16],
			[2, 12]
		]
	);

	// Community B (indices 18..35):
	// Region B03 is local index 2 (row 0, col 2) or local index 6 (row 2, col 0 -> B07).
	// Wait: B03 (local index 2) is row 0 col 2; B04 (local index 3) is row 1 col 0 (along central seam).
	// Deliberately omit several touching pairs in B and add 3 long-range links in B:
	buildCommunityGraph(
		REGIONS_PER_COMMUNITY,
		[
			[2, 5],
			[4, 7],
			[1, 4],
			[9, 12],
			[11, 14]
		],
		[
			[2, 15],
			[0, 16],
			[5, 12]
		]
	);

	return {
		citySeed,
		logicalWidth: LOGICAL_WIDTH,
		logicalHeight: LOGICAL_HEIGHT,
		regions,
		regionById,
		baseEdges,
		communitySeamSegments,
		exampleTouchingDisconnectedPair: ['A05', 'A02'],
		exampleDistantConnectedPair: ['A05', 'A16']
	};
}

/**
 * Normalizes a proposed bridge selection to guarantee one valid region in Community A
 * and one valid region in Community B.
 */
export function normalizeBridgeSelection(
	city: CityNetwork,
	selection?: Partial<BridgeSelection> | null
): BridgeSelection {
	const candA = selection?.regionAId ? city.regionById.get(selection.regionAId) : undefined;
	const candB = selection?.regionBId ? city.regionById.get(selection.regionBId) : undefined;

	const regionAId =
		candA && candA.community === 'A' ? candA.id : DEFAULT_BRIDGE_A_ID;
	const regionBId =
		candB && candB.community === 'B' ? candB.id : DEFAULT_BRIDGE_B_ID;

	return { regionAId, regionBId };
}

/**
 * Constructs the edge list for a scenario:
 * - If bridge is null, returns a shallow copy of baseEdges.
 * - If bridge is provided, returns all existing baseEdges with their weights preserved
 *   plus exactly one undirected bridge edge of weight 1 connecting regionAId and regionBId.
 */
export function buildScenarioEdges(
	city: CityNetwork,
	bridge: BridgeSelection | null
): ContactEdge[] {
	const edges = city.baseEdges.map((e) => ({ ...e }));
	if (!bridge) return edges;

	const clean = normalizeBridgeSelection(city, bridge);
	const regA = city.regionById.get(clean.regionAId)!;
	const regB = city.regionById.get(clean.regionBId)!;

	const sharesPolygonBorder = regA.borderNeighbourIndices.includes(regB.index);
	const euclideanDistance = roundCoord(
		Math.hypot(regA.centroid[0] - regB.centroid[0], regA.centroid[1] - regB.centroid[1])
	);

	edges.push({
		id: `${regA.id}--${regB.id}`,
		sourceIndex: regA.index,
		targetIndex: regB.index,
		sourceId: regA.id,
		targetId: regB.id,
		weight: 1,
		sharesPolygonBorder,
		euclideanDistance,
		isBridge: true
	});

	return edges;
}

/**
 * Computes total incident contact weight W_i = sum_{j != i} w_{ij} for each region.
 */
export function computeRegionContactWeights(
	regionCount: number,
	edges: readonly ContactEdge[]
): number[] {
	const weights = new Array<number>(regionCount).fill(0);
	for (const edge of edges) {
		weights[edge.sourceIndex] += edge.weight;
		weights[edge.targetIndex] += edge.weight;
	}
	return weights;
}

/**
 * Returns the connected neighbors of a given region index in the supplied edge list.
 */
export function getConnectedNeighbourIndices(
	regionIndex: number,
	edges: readonly ContactEdge[]
): number[] {
	const neighbours: number[] = [];
	for (const edge of edges) {
		if (edge.sourceIndex === regionIndex) {
			neighbours.push(edge.targetIndex);
		} else if (edge.targetIndex === regionIndex) {
			neighbours.push(edge.sourceIndex);
		}
	}
	return neighbours.sort((a, b) => a - b);
}
