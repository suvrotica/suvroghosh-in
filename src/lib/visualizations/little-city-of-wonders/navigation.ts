import { clamp, lerp } from './prng';
import type { BuildingObstacle, NavEdge, NavNode, Vec3, WalkerState } from './types';

/**
 * Multi-layered 3D walkable street, canal-bridge, cliff-stair, spiral-tower,
 * and suspension sky-bridge network connecting all 6 neighborhoods seamlessly.
 */
export const NAV_NODES: NavNode[] = [
	// Old Town (Terrace Y ~ 0.62 - 0.72)
	{ id: 'ot-piazza', position: [-9.2, 0.62, 1.8], neighborhoodId: 'old-town', kind: 'plaza' },
	{ id: 'ot-gatto', position: [-11.2, 0.64, -1.4], neighborhoodId: 'old-town', kind: 'entrance' },
	{ id: 'ot-west-lane', position: [-12.8, 0.66, 3.6], neighborhoodId: 'old-town', kind: 'street' },
	{ id: 'ot-arch-south', position: [-9.5, 0.65, -2.4], neighborhoodId: 'old-town', kind: 'street' },
	{ id: 'ot-arch-north', position: [-9.5, 0.72, -6.2], neighborhoodId: 'old-town', kind: 'street' },
	{ id: 'ot-quay-mid', position: [-4.2, 0.62, 1.6], neighborhoodId: 'old-town', kind: 'street' },
	{ id: 'ot-quay-north', position: [-5.6, 0.68, -6.4], neighborhoodId: 'old-town', kind: 'street' },

	// Central Canal Arch Bridge & North Canal Island
	{
		id: 'bridge-main-crest',
		position: [0.0, 1.38, 1.6],
		neighborhoodId: 'old-town',
		kind: 'bridge'
	},
	{
		id: 'canal-island-base',
		position: [0.0, 0.68, -5.2],
		neighborhoodId: 'floating-village',
		kind: 'bridge'
	},

	// Lighthouse District (Harbor Y ~ 0.65, Cliff Path Y ~ 2.1 -> 3.55 -> 5.62)
	{
		id: 'lh-pier',
		position: [-13.6, 0.7, -7.2],
		neighborhoodId: 'lighthouse-district',
		kind: 'entrance'
	},
	{
		id: 'lh-cliff-mid',
		position: [-13.2, 2.25, -9.8],
		neighborhoodId: 'lighthouse-district',
		kind: 'stair'
	},
	{
		id: 'lh-headland',
		position: [-16.2, 3.55, -11.2],
		neighborhoodId: 'lighthouse-district',
		kind: 'plaza'
	},
	{
		id: 'lh-rookery-steps',
		position: [-13.0, 4.55, -13.2],
		neighborhoodId: 'lighthouse-district',
		kind: 'stair'
	},
	{
		id: 'lh-rookery-top',
		position: [-10.2, 5.62, -14.0],
		neighborhoodId: 'lighthouse-district',
		kind: 'entrance'
	},

	// Teapot Quarter (Y ~ 0.74 - 0.86)
	{
		id: 'tp-lane-entry',
		position: [-9.6, 0.72, 7.2],
		neighborhoodId: 'teapot-quarter',
		kind: 'street'
	},
	{ id: 'tp-green', position: [-10.4, 0.8, 11.4], neighborhoodId: 'teapot-quarter', kind: 'plaza' },
	{
		id: 'tp-kettle',
		position: [-12.6, 0.85, 12.6],
		neighborhoodId: 'teapot-quarter',
		kind: 'entrance'
	},
	{
		id: 'tp-patisserie',
		position: [-9.2, 0.82, 13.0],
		neighborhoodId: 'teapot-quarter',
		kind: 'entrance'
	},
	{
		id: 'tp-conservatory',
		position: [-7.0, 0.74, 10.6],
		neighborhoodId: 'teapot-quarter',
		kind: 'entrance'
	},
	{
		id: 'south-canal-footbridge',
		position: [1.8, 1.15, 11.4],
		neighborhoodId: 'teapot-quarter',
		kind: 'bridge'
	},

	// Colorful Urban Quarter (Denki-Cho Y ~ 0.64 - 0.70)
	{ id: 'cu-quay', position: [4.4, 0.62, 1.8], neighborhoodId: 'colorful-urban', kind: 'street' },
	{ id: 'cu-corner', position: [7.2, 0.65, 3.6], neighborhoodId: 'colorful-urban', kind: 'plaza' },
	{
		id: 'cu-mid-street',
		position: [11.2, 0.68, 7.6],
		neighborhoodId: 'colorful-urban',
		kind: 'street'
	},
	{
		id: 'cu-loft',
		position: [12.4, 0.68, 9.6],
		neighborhoodId: 'colorful-urban',
		kind: 'entrance'
	},
	{
		id: 'cu-vinyl',
		position: [7.6, 0.65, 12.0],
		neighborhoodId: 'colorful-urban',
		kind: 'entrance'
	},

	// Lantern District (Alley Y ~ 0.75, Moon Bridge Y ~ 1.42, Umbra Crag Stairs Y ~ 3.4 -> 5.82)
	{
		id: 'ld-alley-south',
		position: [6.8, 0.7, -1.6],
		neighborhoodId: 'lantern-district',
		kind: 'street'
	},
	{
		id: 'ld-apothecary',
		position: [7.4, 0.75, -3.8],
		neighborhoodId: 'lantern-district',
		kind: 'entrance'
	},
	{
		id: 'ld-north-link',
		position: [4.8, 0.72, -5.6],
		neighborhoodId: 'lantern-district',
		kind: 'street'
	},
	{
		id: 'ld-moon-bridge',
		position: [11.2, 1.42, -8.4],
		neighborhoodId: 'lantern-district',
		kind: 'bridge'
	},
	{
		id: 'ld-crag-mid',
		position: [12.8, 3.55, -10.8],
		neighborhoodId: 'lantern-district',
		kind: 'stair'
	},
	{
		id: 'ld-crag-top',
		position: [13.6, 5.82, -12.2],
		neighborhoodId: 'lantern-district',
		kind: 'entrance'
	},

	// Floating Village (Sky Layer Y ~ 6.45 - 6.55)
	{
		id: 'fv-spiral-mid',
		position: [0.0, 3.55, -5.8],
		neighborhoodId: 'floating-village',
		kind: 'stair'
	},
	{
		id: 'fv-central-dock',
		position: [0.0, 6.48, -6.6],
		neighborhoodId: 'floating-village',
		kind: 'skywalk'
	},
	{
		id: 'fv-west-dock',
		position: [-3.0, 6.46, -8.8],
		neighborhoodId: 'floating-village',
		kind: 'skywalk'
	},
	{
		id: 'fv-east-dock',
		position: [3.4, 6.5, -7.4],
		neighborhoodId: 'floating-village',
		kind: 'skywalk'
	},
	{
		id: 'fv-aerie-plaza',
		position: [0.2, 6.52, -7.8],
		neighborhoodId: 'floating-village',
		kind: 'plaza'
	}
];

export const NAV_NODE_BY_ID: Record<string, NavNode> = Object.fromEntries(
	NAV_NODES.map((n) => [n.id, n])
);

export const NAV_EDGES: NavEdge[] = [
	// Old Town street network
	{ from: 'ot-piazza', to: 'ot-gatto', width: 2.2, kind: 'cobble' },
	{ from: 'ot-piazza', to: 'ot-west-lane', width: 2.2, kind: 'cobble' },
	{ from: 'ot-gatto', to: 'ot-west-lane', width: 1.8, kind: 'cobble' },
	{ from: 'ot-piazza', to: 'ot-arch-south', width: 2.2, kind: 'cobble' },
	{ from: 'ot-arch-south', to: 'ot-arch-north', width: 1.9, kind: 'cobble' },
	{ from: 'ot-piazza', to: 'ot-quay-mid', width: 2.5, kind: 'cobble' },
	{ from: 'ot-arch-north', to: 'ot-quay-north', width: 2.0, kind: 'cobble' },
	{ from: 'ot-quay-mid', to: 'ot-quay-north', width: 1.9, kind: 'cobble' },

	// Main Canal Bridge & North Canal Island Bridge
	{
		from: 'ot-quay-mid',
		to: 'bridge-main-crest',
		width: 2.2,
		kind: 'bridge',
		waypoints: [[-2.1, 1.08, 1.6]]
	},
	{
		from: 'bridge-main-crest',
		to: 'cu-quay',
		width: 2.2,
		kind: 'bridge',
		waypoints: [[2.1, 1.08, 1.7]]
	},
	{
		from: 'ot-quay-north',
		to: 'canal-island-base',
		width: 1.8,
		kind: 'bridge',
		waypoints: [[-2.8, 1.05, -5.8]]
	},
	{
		from: 'canal-island-base',
		to: 'ld-north-link',
		width: 1.8,
		kind: 'bridge',
		waypoints: [[2.4, 1.05, -5.4]]
	},

	// Lighthouse District climbs & harbor
	{ from: 'ot-arch-north', to: 'lh-pier', width: 1.9, kind: 'cobble' },
	{ from: 'ot-arch-north', to: 'lh-cliff-mid', width: 1.7, kind: 'stair' },
	{ from: 'lh-pier', to: 'lh-cliff-mid', width: 1.6, kind: 'stair' },
	{ from: 'lh-cliff-mid', to: 'lh-headland', width: 2.2, kind: 'cliff' },
	{ from: 'lh-headland', to: 'lh-rookery-steps', width: 1.6, kind: 'stair' },
	{ from: 'lh-rookery-steps', to: 'lh-rookery-top', width: 1.6, kind: 'stair' },

	// Teapot Quarter lanes & south canal bridge
	{ from: 'ot-piazza', to: 'tp-lane-entry', width: 2.2, kind: 'cobble' },
	{ from: 'ot-west-lane', to: 'tp-lane-entry', width: 1.9, kind: 'cobble' },
	{ from: 'tp-lane-entry', to: 'tp-green', width: 2.4, kind: 'cobble' },
	{ from: 'tp-green', to: 'tp-kettle', width: 2.2, kind: 'cobble' },
	{ from: 'tp-green', to: 'tp-patisserie', width: 2.2, kind: 'cobble' },
	{ from: 'tp-green', to: 'tp-conservatory', width: 2.0, kind: 'cobble' },
	{ from: 'tp-conservatory', to: 'south-canal-footbridge', width: 1.8, kind: 'bridge' },
	{ from: 'south-canal-footbridge', to: 'cu-vinyl', width: 1.8, kind: 'bridge' },

	// Colorful Urban Quarter streets
	{ from: 'cu-quay', to: 'cu-corner', width: 2.4, kind: 'cobble' },
	{ from: 'cu-corner', to: 'cu-mid-street', width: 2.3, kind: 'cobble' },
	{ from: 'cu-mid-street', to: 'cu-loft', width: 2.1, kind: 'cobble' },
	{ from: 'cu-mid-street', to: 'cu-vinyl', width: 2.1, kind: 'cobble' },
	{ from: 'cu-corner', to: 'cu-vinyl', width: 1.9, kind: 'cobble' },

	// Lantern District alleys & crag climb
	{ from: 'cu-quay', to: 'ld-alley-south', width: 2.1, kind: 'cobble' },
	{ from: 'cu-corner', to: 'ld-alley-south', width: 2.0, kind: 'cobble' },
	{ from: 'ld-alley-south', to: 'ld-apothecary', width: 2.1, kind: 'cobble' },
	{ from: 'ld-apothecary', to: 'ld-north-link', width: 1.9, kind: 'cobble' },
	{ from: 'ld-apothecary', to: 'ld-moon-bridge', width: 1.8, kind: 'bridge' },
	{ from: 'ld-moon-bridge', to: 'ld-crag-mid', width: 1.6, kind: 'stair' },
	{ from: 'ld-crag-mid', to: 'ld-crag-top', width: 1.6, kind: 'stair' },

	// Floating Village Spiral Ascent & Suspension Sky-Bridges!
	{
		from: 'canal-island-base',
		to: 'fv-spiral-mid',
		width: 1.5,
		kind: 'stair',
		waypoints: [[0.85, 2.1, -5.5]]
	},
	{
		from: 'fv-spiral-mid',
		to: 'fv-central-dock',
		width: 1.5,
		kind: 'stair',
		waypoints: [[-0.85, 5.0, -6.1]]
	},
	{
		from: 'lh-rookery-top',
		to: 'fv-west-dock',
		width: 1.5,
		kind: 'skywalk',
		waypoints: [
			[-7.6, 5.75, -12.1],
			[-5.2, 6.02, -10.4]
		]
	},
	{
		from: 'ld-crag-top',
		to: 'fv-east-dock',
		width: 1.5,
		kind: 'skywalk',
		waypoints: [
			[10.2, 5.92, -10.6],
			[6.8, 6.18, -9.0]
		]
	},
	{ from: 'fv-central-dock', to: 'fv-aerie-plaza', width: 2.2, kind: 'skywalk' },
	{ from: 'fv-west-dock', to: 'fv-aerie-plaza', width: 1.9, kind: 'skywalk' },
	{ from: 'fv-east-dock', to: 'fv-aerie-plaza', width: 1.9, kind: 'skywalk' },
	{ from: 'fv-central-dock', to: 'fv-east-dock', width: 1.8, kind: 'skywalk' },
	{ from: 'fv-central-dock', to: 'fv-west-dock', width: 1.8, kind: 'skywalk' }
];

export const BUILDING_OBSTACLES: BuildingObstacle[] = [
	{ id: 'casa-gatto', x: -14.5, z: -1.8, radiusX: 2.4, radiusZ: 2.3, minY: 0, maxY: 10.5 },
	{ id: 'clock-west', x: -11.5, z: -4.4, radiusX: 1.35, radiusZ: 1.6, minY: 0, maxY: 7.0 },
	{ id: 'clock-east', x: -7.5, z: -4.4, radiusX: 1.35, radiusZ: 1.6, minY: 0, maxY: 7.0 },
	{ id: 'fountain-basin', x: -7.8, z: 1.8, radiusX: 1.05, radiusZ: 1.05, minY: 0, maxY: 2.6 },
	{ id: 'lighthouse', x: -18.8, z: -13.8, radiusX: 2.5, radiusZ: 2.3, minY: 2.5, maxY: 14.0 },
	{ id: 'rookery-tower', x: -10.5, z: -16.5, radiusX: 1.9, radiusZ: 1.9, minY: 4.5, maxY: 16.5 },
	{ id: 'blue-kettle', x: -15.4, z: 13.4, radiusX: 2.5, radiusZ: 2.5, minY: 0, maxY: 10.5 },
	{ id: 'coffee-patisserie', x: -9.2, z: 15.6, radiusX: 2.6, radiusZ: 1.9, minY: 0, maxY: 9.0 },
	{ id: 'conservatory', x: -5.1, z: 11.4, radiusX: 1.65, radiusZ: 1.65, minY: 0, maxY: 6.0 },
	{ id: 'apothecary', x: 9.2, z: -6.0, radiusX: 2.1, radiusZ: 2.0, minY: 0, maxY: 9.0 },
	{ id: 'umbra-crag', x: 15.8, z: -14.5, radiusX: 2.4, radiusZ: 2.3, minY: 4.5, maxY: 17.0 },
	{ id: 'ramen-stack', x: 9.8, z: 4.4, radiusX: 2.0, radiusZ: 1.9, minY: 0, maxY: 10.5 },
	{ id: 'turquoise-loft', x: 15.4, z: 9.8, radiusX: 2.2, radiusZ: 2.1, minY: 0, maxY: 10.8 },
	{ id: 'vinyl-shop', x: 9.2, z: 14.2, radiusX: 1.85, radiusZ: 1.75, minY: 0, maxY: 8.5 },
	{ id: 'sky-observatory', x: 0.2, z: -9.6, radiusX: 1.6, radiusZ: 1.5, minY: 6.0, maxY: 15.0 }
];

interface Segment3D {
	a: Vec3;
	b: Vec3;
	width: number;
	kind: NavEdge['kind'];
}

function buildAllWalkSegments(): Segment3D[] {
	const list: Segment3D[] = [];
	for (const edge of NAV_EDGES) {
		const nA = NAV_NODE_BY_ID[edge.from];
		const nB = NAV_NODE_BY_ID[edge.to];
		if (!nA || !nB) continue;
		const pts: Vec3[] = [nA.position, ...(edge.waypoints ?? []), nB.position];
		for (let i = 0; i < pts.length - 1; i++) {
			list.push({
				a: pts[i],
				b: pts[i + 1],
				width: edge.width,
				kind: edge.kind
			});
		}
	}
	return list;
}

export const WALK_SEGMENTS: Segment3D[] = buildAllWalkSegments();

function dist3(a: Vec3, b: Vec3): number {
	const dx = a[0] - b[0];
	const dy = a[1] - b[1];
	const dz = a[2] - b[2];
	return Math.hypot(dx, dy, dz);
}

/**
 * Projects any candidate (x, z, currentY) onto the walkable 3D street/bridge/stair/skywalk
 * manifold while respecting vertical layer separation (e.g. canal quay vs overhead skywalk)
 * and sliding smoothly around building walls.
 */
export function resolveWalkablePosition(
	candidateX: number,
	candidateZ: number,
	currentY: number
): Vec3 {
	let x = clamp(candidateX, -22.5, 22.5);
	let z = clamp(candidateZ, -19.5, 19.5);

	// Push outside building footprints at matching elevation
	for (const obs of BUILDING_OBSTACLES) {
		if (currentY + 1.4 < obs.minY || currentY > obs.maxY) continue;
		const dx = x - obs.x;
		const dz = z - obs.z;
		const nx = dx / obs.radiusX;
		const nz = dz / obs.radiusZ;
		const d = Math.hypot(nx, nz);
		if (d < 1.0 && d > 1e-5) {
			const push = 1.02 / d;
			x = obs.x + dx * push;
			z = obs.z + dz * push;
		} else if (d <= 1e-5) {
			x = obs.x + obs.radiusX * 1.04;
		}
	}

	// Find closest walkable segment compatible with currentY
	let bestScore = Infinity;
	let bestPoint: Vec3 = [x, currentY, z];
	let bestPlanarDist = Infinity;

	for (const seg of WALK_SEGMENTS) {
		const abx = seg.b[0] - seg.a[0];
		const aby = seg.b[1] - seg.a[1];
		const abz = seg.b[2] - seg.a[2];
		const lenSq = abx * abx + abz * abz;
		const t = lenSq > 1e-6 ? clamp(((x - seg.a[0]) * abx + (z - seg.a[2]) * abz) / lenSq, 0, 1) : 0;

		const px = seg.a[0] + abx * t;
		const py = seg.a[1] + aby * t;
		const pz = seg.a[2] + abz * t;

		const planarDist = Math.hypot(x - px, z - pz);
		const vertDiff = Math.abs(currentY - py);

		// Prevent snapping upward 6m onto a skybridge when walking underneath it
		if (vertDiff > 2.6) continue;

		const excess = Math.max(0, planarDist - seg.width * 0.82);
		const score = excess * 3.2 + planarDist * 0.25 + vertDiff * 1.4;
		if (score < bestScore) {
			bestScore = score;
			bestPlanarDist = planarDist;
			if (planarDist <= seg.width * 0.85) {
				bestPoint = [x, py, z];
			} else {
				const k = (seg.width * 0.85) / Math.max(planarDist, 1e-4);
				bestPoint = [lerp(px, x, k), py, lerp(pz, z, k)];
			}
		}
	}

	// Fallback if currentY had no nearby layer within 2.6m (e.g. teleported)
	if (!Number.isFinite(bestPlanarDist)) {
		let nearestNode = NAV_NODES[0];
		let minD = Infinity;
		for (const n of NAV_NODES) {
			const d = dist3([x, currentY, z], n.position);
			if (d < minD) {
				minD = d;
				nearestNode = n;
			}
		}
		return [...nearestNode.position];
	}

	return bestPoint;
}

export function findNearestNavNode(pos: Vec3): NavNode {
	let best = NAV_NODES[0];
	let bestScore = Infinity;
	for (const node of NAV_NODES) {
		const dx = pos[0] - node.position[0];
		const dy = (pos[1] - node.position[1]) * 2.2;
		const dz = pos[2] - node.position[2];
		const d = Math.hypot(dx, dy, dz);
		if (d < bestScore) {
			bestScore = d;
			best = node;
		}
	}
	return best;
}

/**
 * Shortest-path A* over the 3D multi-layered street, stair, bridge, and skywalk graph.
 */
export function findShortestWalkPath(start: Vec3, goal: Vec3): Vec3[] {
	const startNode = findNearestNavNode(start);
	const goalNode = findNearestNavNode(goal);

	if (startNode.id === goalNode.id) {
		return [resolveWalkablePosition(goal[0], goal[2], goalNode.position[1])];
	}

	const adj = new Map<string, Array<{ to: string; cost: number; waypoints: Vec3[] }>>();
	for (const n of NAV_NODES) adj.set(n.id, []);

	for (const edge of NAV_EDGES) {
		const nA = NAV_NODE_BY_ID[edge.from];
		const nB = NAV_NODE_BY_ID[edge.to];
		if (!nA || !nB) continue;
		const forwardWps = edge.waypoints ?? [];
		const reverseWps = [...forwardWps].reverse();
		const pts: Vec3[] = [nA.position, ...forwardWps, nB.position];
		let len = 0;
		for (let i = 0; i < pts.length - 1; i++) len += dist3(pts[i], pts[i + 1]);
		adj.get(edge.from)?.push({ to: edge.to, cost: len, waypoints: forwardWps });
		adj.get(edge.to)?.push({ to: edge.from, cost: len, waypoints: reverseWps });
	}

	const open = new Set<string>([startNode.id]);
	const cameFrom = new Map<string, { prev: string; waypoints: Vec3[] }>();
	const gScore = new Map<string, number>([[startNode.id, 0]]);
	const fScore = new Map<string, number>([
		[startNode.id, dist3(startNode.position, goalNode.position)]
	]);

	while (open.size > 0) {
		let current = '';
		let bestF = Infinity;
		for (const id of open) {
			const f = fScore.get(id) ?? Infinity;
			if (f < bestF) {
				bestF = f;
				current = id;
			}
		}
		if (!current) break;

		if (current === goalNode.id) {
			const nodeChain: Vec3[] = [];
			let cursor: string = current;
			const segmentsReversed: Vec3[][] = [];
			while (cameFrom.has(cursor)) {
				const step: { prev: string; waypoints: Vec3[] } = cameFrom.get(cursor)!;
				const targetNode = NAV_NODE_BY_ID[cursor]!;
				segmentsReversed.push([...step.waypoints, targetNode.position]);
				cursor = step.prev;
			}
			nodeChain.push(startNode.position);
			for (let i = segmentsReversed.length - 1; i >= 0; i--) {
				nodeChain.push(...segmentsReversed[i]);
			}
			const snappedGoal = resolveWalkablePosition(goal[0], goal[2], goalNode.position[1]);
			if (dist3(nodeChain[nodeChain.length - 1], snappedGoal) > 0.25) {
				nodeChain.push(snappedGoal);
			}
			return nodeChain;
		}

		open.delete(current);
		const currentG = gScore.get(current) ?? Infinity;
		for (const neighbor of adj.get(current) ?? []) {
			const tentative = currentG + neighbor.cost;
			if (tentative < (gScore.get(neighbor.to) ?? Infinity)) {
				cameFrom.set(neighbor.to, { prev: current, waypoints: neighbor.waypoints });
				gScore.set(neighbor.to, tentative);
				const targetPos = NAV_NODE_BY_ID[neighbor.to]!.position;
				fScore.set(neighbor.to, tentative + dist3(targetPos, goalNode.position));
				open.add(neighbor.to);
			}
		}
	}

	return [goalNode.position];
}

export interface WalkInputVector {
	forward: number; // -1..+1
	strafe: number; // -1..+1
	cameraYawRad: number;
	sprint?: boolean;
}

export function stepWalker(walker: WalkerState, input: WalkInputVector, dtSeconds: number): void {
	const dt = clamp(dtSeconds, 0, 0.1);
	const hasManualInput = Math.abs(input.forward) > 0.04 || Math.abs(input.strafe) > 0.04;
	const baseWalkSpeed = input.sprint ? 6.2 : 4.1;

	if (hasManualInput) {
		// Manual WASD / Touch Joystick overrides click-to-walk path
		walker.activePath = [];
		walker.targetLandmarkId = null;

		const sinY = Math.sin(input.cameraYawRad);
		const cosY = Math.cos(input.cameraYawRad);

		// Forward moves along (-sinY, -cosY), strafe right along (+cosY, -sinY)
		let moveX = -sinY * input.forward + cosY * input.strafe;
		let moveZ = -cosY * input.forward - sinY * input.strafe;
		const mag = Math.hypot(moveX, moveZ);
		if (mag > 1) {
			moveX /= mag;
			moveZ /= mag;
		}

		const nextX = walker.position[0] + moveX * baseWalkSpeed * dt;
		const nextZ = walker.position[2] + moveZ * baseWalkSpeed * dt;
		const resolved = resolveWalkablePosition(nextX, nextZ, walker.position[1]);

		const actualDx = resolved[0] - walker.position[0];
		const actualDz = resolved[2] - walker.position[2];
		walker.position = [
			resolved[0],
			lerp(walker.position[1], resolved[1], clamp(dt * 14, 0, 1)),
			resolved[2]
		];
		walker.speed = Math.hypot(actualDx, actualDz) / Math.max(dt, 1e-4);

		if (mag > 0.08) {
			const desiredHeading = Math.atan2(moveX, moveZ);
			let diff = desiredHeading - walker.headingRad;
			while (diff > Math.PI) diff -= Math.PI * 2;
			while (diff < -Math.PI) diff += Math.PI * 2;
			walker.headingRad += diff * clamp(dt * 11, 0, 1);
		}
		walker.stridePhase += walker.speed * dt * 2.8;
		return;
	}

	if (walker.activePath.length > 0) {
		const target = walker.activePath[0];
		const dx = target[0] - walker.position[0];
		const dy = target[1] - walker.position[1];
		const dz = target[2] - walker.position[2];
		const planarDist = Math.hypot(dx, dz);

		if (planarDist < 0.28 && Math.abs(dy) < 0.45) {
			walker.position = [...target];
			walker.activePath.shift();
			if (walker.activePath.length === 0) {
				walker.speed = 0;
			}
			return;
		}

		const stepDist = Math.min(planarDist, baseWalkSpeed * dt);
		const dirX = dx / Math.max(planarDist, 1e-4);
		const dirZ = dz / Math.max(planarDist, 1e-4);
		const nx = walker.position[0] + dirX * stepDist;
		const nz = walker.position[2] + dirZ * stepDist;
		const ny = lerp(
			walker.position[1],
			target[1],
			clamp(stepDist / Math.max(planarDist, 0.25), 0, 1)
		);

		walker.position = [nx, ny, nz];
		walker.speed = baseWalkSpeed;

		const desiredHeading = Math.atan2(dirX, dirZ);
		let diff = desiredHeading - walker.headingRad;
		while (diff > Math.PI) diff -= Math.PI * 2;
		while (diff < -Math.PI) diff += Math.PI * 2;
		walker.headingRad += diff * clamp(dt * 10, 0, 1);
		walker.stridePhase += walker.speed * dt * 2.8;
		return;
	}

	walker.speed = lerp(walker.speed, 0, clamp(dt * 10, 0, 1));
}
