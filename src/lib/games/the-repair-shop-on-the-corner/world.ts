import type { AfternoonPhase, CharacterId, RepairShopGameState, Vec2 } from './types';

export type WalkZoneId = 'shop-main' | 'shop-door' | 'lane' | 'courtyard-arch' | 'courtyard';

export type WalkRect = {
	id: WalkZoneId;
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
	surface: 'oxide' | 'tarmac' | 'brick';
};

/**
 * Compact Calcutta corner layout (all key spaces face +Z toward the elevated camera):
 * - West (`x: -10.4..-5.3, z: -4.5..0.6`): Shared Courtyard with cloth screen on north wall (`z = -4.35`) facing +Z.
 * - Centre (`x: -4.8..0.7, z: -4.5..0.65`): Corner Repair Shop interior (fully walkable).
 * - East (`x: 1.0..6.2, z: -3.4..0.65`): Sen Brothers Stores with visible open counter & wall clock facing +Z.
 * - Front (`x: -9.8..7.6, z: 0.95..4.85`): Kusumtala Lane & Bapi's Tea Stall (`x: 7.8..9.6, z: 1.5..4.2`).
 */
export const WALKABLE_RECTS: readonly WalkRect[] = [
	{ id: 'shop-main', minX: -4.05, maxX: 0.15, minZ: -3.05, maxZ: 0.65, surface: 'oxide' },
	{ id: 'shop-door', minX: -1.9, maxX: -0.1, minZ: 0.2, maxZ: 1.25, surface: 'oxide' },
	{ id: 'lane', minX: -9.6, maxX: 7.45, minZ: 0.95, maxZ: 4.75, surface: 'tarmac' },
	{ id: 'courtyard-arch', minX: -8.65, maxX: -7.05, minZ: 0.25, maxZ: 1.35, surface: 'brick' },
	{ id: 'courtyard', minX: -10.1, maxX: -5.55, minZ: -3.55, maxZ: 0.55, surface: 'brick' }
] as const;

export type ObstacleCircle = {
	x: number;
	z: number;
	radius: number;
};

export const STATIC_OBSTACLES: readonly ObstacleCircle[] = [
	// Courtyard wooden projector table
	{ x: -7.85, z: -0.65, radius: 0.52 },
	// Municipal cast-iron lamp post on south edge of lane
	{ x: 1.4, z: 4.55, radius: 0.34 }
] as const;

export const SAFE_SPAWN_POS: Vec2 = { x: -1.35, z: -0.85 };

export const KEY_PLACES = {
	workbench: { x: -2.15, z: -2.85, label: 'Workbench' },
	drawers: { x: -3.85, z: -2.35, label: 'Spare-parts drawers' },
	shopDoor: { x: -1.0, z: 0.7, label: 'Shop doorway' },
	laneShopfront: { x: -0.9, z: 1.85, label: 'Outside shop' },
	senCounter: { x: 3.65, z: 1.35, label: 'Sen Brothers counter' },
	teaStall: { x: 6.85, z: 2.8, label: 'Bapi’s tea stall' },
	courtyardArch: { x: -7.85, z: 0.85, label: 'Courtyard archway' },
	courtyardTable: { x: -7.85, z: 0.12, label: 'Courtyard projector table' },
	courtyardRuma: { x: -6.35, z: -1.45, label: 'Ruma in courtyard' }
} as const;

const NAV_NODES: Record<string, Vec2> = {
	'shop-centre': { x: -1.4, z: -1.45 },
	'shop-bench': KEY_PLACES.workbench,
	'shop-drawers': KEY_PLACES.drawers,
	'shop-door-in': { x: -1.0, z: 0.35 },
	'shop-door-out': { x: -1.0, z: 1.55 },
	'lane-west': { x: -5.2, z: 2.1 },
	'lane-arch': { x: -7.85, z: 1.55 },
	'lane-mid': { x: 1.3, z: 2.2 },
	'lane-sen': KEY_PLACES.senCounter,
	'lane-tea': KEY_PLACES.teaStall,
	'arch-in': { x: -7.85, z: 0.35 },
	'court-east': { x: -6.3, z: -0.5 },
	'court-ruma': KEY_PLACES.courtyardRuma,
	'court-west': { x: -9.3, z: -0.8 }
};

const NAV_EDGES: readonly [string, string][] = [
	['shop-centre', 'shop-bench'],
	['shop-centre', 'shop-drawers'],
	['shop-bench', 'shop-drawers'],
	['shop-centre', 'shop-door-in'],
	['shop-door-in', 'shop-door-out'],
	['shop-door-out', 'lane-west'],
	['shop-door-out', 'lane-mid'],
	['lane-west', 'lane-arch'],
	['lane-west', 'lane-mid'],
	['lane-mid', 'lane-sen'],
	['lane-sen', 'lane-tea'],
	['lane-mid', 'lane-tea'],
	['lane-arch', 'arch-in'],
	['arch-in', 'court-east'],
	['arch-in', 'court-west'],
	['court-east', 'court-ruma']
];

export function distance2D(a: Vec2, b: Vec2): number {
	return Math.hypot(a.x - b.x, a.z - b.z);
}

export function isPointInWalkRects(p: Vec2): boolean {
	for (const rect of WALKABLE_RECTS) {
		if (p.x >= rect.minX && p.x <= rect.maxX && p.z >= rect.minZ && p.z <= rect.maxZ) {
			return true;
		}
	}
	return false;
}

export function surfaceAtPoint(p: Vec2): 'oxide' | 'tarmac' | 'brick' {
	for (const rect of WALKABLE_RECTS) {
		if (p.x >= rect.minX && p.x <= rect.maxX && p.z >= rect.minZ && p.z <= rect.maxZ) {
			return rect.surface;
		}
	}
	return 'tarmac';
}

export function resolveObstaclePush(p: Vec2): Vec2 {
	let x = p.x;
	let z = p.z;
	for (const obs of STATIC_OBSTACLES) {
		const dx = x - obs.x;
		const dz = z - obs.z;
		const d = Math.hypot(dx, dz);
		if (d < obs.radius && d > 1e-4) {
			x = obs.x + (dx / d) * obs.radius;
			z = obs.z + (dz / d) * obs.radius;
		} else if (d <= 1e-4) {
			z = obs.z + obs.radius;
		}
	}
	return { x, z };
}

export function clampToWalkable(target: Vec2, fallback: Vec2 = SAFE_SPAWN_POS): Vec2 {
	if (isPointInWalkRects(target)) {
		const pushed = resolveObstaclePush(target);
		if (isPointInWalkRects(pushed)) return pushed;
	}

	let best: Vec2 | null = null;
	let bestDist = Infinity;
	for (const rect of WALKABLE_RECTS) {
		const cx = Math.max(rect.minX + 0.08, Math.min(rect.maxX - 0.08, target.x));
		const cz = Math.max(rect.minZ + 0.08, Math.min(rect.maxZ - 0.08, target.z));
		const candidate = resolveObstaclePush({ x: cx, z: cz });
		if (!isPointInWalkRects(candidate)) continue;
		const d = distance2D(target, candidate);
		if (d < bestDist) {
			bestDist = d;
			best = candidate;
		}
	}
	return best ?? { ...fallback };
}

function segmentWalkable(a: Vec2, b: Vec2): boolean {
	const steps = Math.max(4, Math.ceil(distance2D(a, b) / 0.22));
	for (let i = 1; i < steps; i += 1) {
		const t = i / steps;
		const sample = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
		if (!isPointInWalkRects(sample)) return false;
		for (const obs of STATIC_OBSTACLES) {
			if (distance2D(sample, obs) < obs.radius * 0.92) return false;
		}
	}
	return true;
}

export function findWalkPath(fromRaw: Vec2, toRaw: Vec2): Vec2[] {
	const from = clampToWalkable(fromRaw);
	const to = clampToWalkable(toRaw, from);
	if (distance2D(from, to) < 0.08) return [];
	if (segmentWalkable(from, to)) return [to];

	const ids = ['__start', ...Object.keys(NAV_NODES), '__goal'];
	const coords: Record<string, Vec2> = {
		...NAV_NODES,
		__start: from,
		__goal: to
	};
	const adjacency = new Map<string, { to: string; cost: number }[]>();
	for (const id of ids) adjacency.set(id, []);

	const addEdge = (u: string, v: string) => {
		const cost = distance2D(coords[u], coords[v]);
		adjacency.get(u)?.push({ to: v, cost });
		adjacency.get(v)?.push({ to: u, cost });
	};

	for (const [u, v] of NAV_EDGES) addEdge(u, v);

	for (const nodeId of Object.keys(NAV_NODES)) {
		if (segmentWalkable(from, coords[nodeId])) addEdge('__start', nodeId);
		if (segmentWalkable(to, coords[nodeId])) addEdge('__goal', nodeId);
	}

	if ((adjacency.get('__start')?.length ?? 0) === 0) {
		const nearest = Object.keys(NAV_NODES).sort(
			(a, b) => distance2D(from, coords[a]) - distance2D(from, coords[b])
		)[0];
		addEdge('__start', nearest);
	}
	if ((adjacency.get('__goal')?.length ?? 0) === 0) {
		const nearest = Object.keys(NAV_NODES).sort(
			(a, b) => distance2D(to, coords[a]) - distance2D(to, coords[b])
		)[0];
		addEdge('__goal', nearest);
	}

	const dist = new Map<string, number>(ids.map((id) => [id, Infinity]));
	const prev = new Map<string, string | null>(ids.map((id) => [id, null]));
	const unvisited = new Set(ids);
	dist.set('__start', 0);

	while (unvisited.size > 0) {
		let current: string | null = null;
		let best = Infinity;
		for (const id of unvisited) {
			const d = dist.get(id) ?? Infinity;
			if (d < best) {
				best = d;
				current = id;
			}
		}
		if (!current || current === '__goal' || best === Infinity) break;
		unvisited.delete(current);

		for (const edge of adjacency.get(current) ?? []) {
			if (!unvisited.has(edge.to)) continue;
			const alt = best + edge.cost;
			if (alt < (dist.get(edge.to) ?? Infinity)) {
				dist.set(edge.to, alt);
				prev.set(edge.to, current);
			}
		}
	}

	const chain: Vec2[] = [];
	let cursor: string | null = '__goal';
	while (cursor && cursor !== '__start') {
		chain.push(coords[cursor]);
		cursor = prev.get(cursor) ?? null;
	}
	chain.reverse();
	return chain.length > 0 ? chain : [to];
}

export function getCharacterWorldPosition(
	characterId: CharacterId,
	state: Pick<RepairShopGameState, 'jobs' | 'afternoonPhase' | 'unlocks'>
): { pos: Vec2; interactStandPos: Vec2; facingRad: number } {
	const inScreening =
		state.afternoonPhase === 'screening' ||
		(state.afternoonPhase === 'afterglow' && state.unlocks.screeningStarted);

	switch (characterId) {
		case 'bapi': {
			if (state.jobs.radio === 'not_started') {
				return {
					pos: { x: -0.15, z: 1.55 },
					interactStandPos: { x: -0.95, z: 1.5 },
					facingRad: -Math.PI * 0.65
				};
			}
			if (inScreening) {
				// Seated in courtyard facing north (-Z -> Math.PI) toward the cloth screen!
				return {
					pos: { x: -8.9, z: -1.55 },
					interactStandPos: { x: -8.9, z: -0.6 },
					facingRad: Math.PI
				};
			}
			return {
				pos: { x: 8.05, z: 2.8 },
				interactStandPos: { x: 6.85, z: 2.8 },
				facingRad: -Math.PI * 0.5
			};
		}
		case 'mala': {
			if (inScreening) {
				return {
					pos: { x: -6.85, z: -1.55 },
					interactStandPos: { x: -6.7, z: -0.6 },
					facingRad: Math.PI
				};
			}
			return {
				pos: { x: 3.65, z: -0.25 },
				interactStandPos: { x: 3.65, z: 1.35 },
				facingRad: 0
			};
		}
		case 'ruma': {
			if (inScreening) {
				return {
					pos: { x: -6.35, z: -0.8 },
					interactStandPos: { x: -6.35, z: -0.1 },
					facingRad: Math.PI
				};
			}
			return {
				pos: { x: -6.05, z: -2.05 },
				interactStandPos: { x: -6.5, z: -1.4 },
				facingRad: -Math.PI * 0.25
			};
		}
		case 'nikhil': {
			if (inScreening) {
				return {
					pos: { x: -8.4, z: -2.3 },
					interactStandPos: { x: -8.9, z: -1.1 },
					facingRad: Math.PI
				};
			}
			return {
				pos: { x: -4.2, z: 4.35 },
				interactStandPos: { x: -4.2, z: 3.5 },
				facingRad: Math.PI
			};
		}
		case 'sabita': {
			if (inScreening) {
				return {
					pos: { x: -7.3, z: -2.3 },
					interactStandPos: { x: -6.6, z: -1.1 },
					facingRad: Math.PI
				};
			}
			return {
				pos: { x: -9.65, z: -2.1 },
				interactStandPos: { x: -8.95, z: -2.0 },
				facingRad: Math.PI * 0.5
			};
		}
	}
}

export type LightingPalette = {
	skyHex: number;
	fogHex: number;
	sunHex: number;
	sunIntensity: number;
	sunDirection: [number, number, number];
	ambientHex: number;
	ambientIntensity: number;
	warmLampStrength: number;
	stringLightsOn: boolean;
	timeLabel: string;
};

export function getAfternoonLighting(phase: AfternoonPhase): LightingPalette {
	switch (phase) {
		case 'early_afternoon':
			return {
				skyHex: 0xdbe6ec,
				fogHex: 0xd8dfd9,
				sunHex: 0xfff2d6,
				sunIntensity: 1.55,
				sunDirection: [8, 14, 9],
				ambientHex: 0xf4ead8,
				ambientIntensity: 0.88,
				warmLampStrength: 0.9,
				stringLightsOn: false,
				timeLabel: '3:15 PM · Early afternoon'
			};
		case 'mid_afternoon':
			return {
				skyHex: 0xe3dfd4,
				fogHex: 0xddd4c5,
				sunHex: 0xffe4b5,
				sunIntensity: 1.48,
				sunDirection: [10, 11, 8],
				ambientHex: 0xf0dfc8,
				ambientIntensity: 0.82,
				warmLampStrength: 1.05,
				stringLightsOn: false,
				timeLabel: '4:15 PM · Tea time'
			};
		case 'golden_hour':
			return {
				skyHex: 0xd9b89c,
				fogHex: 0xcfa98c,
				sunHex: 0xffb86c,
				sunIntensity: 1.32,
				sunDirection: [12, 7.5, 6],
				ambientHex: 0xdfb99b,
				ambientIntensity: 0.75,
				warmLampStrength: 1.35,
				stringLightsOn: true,
				timeLabel: '5:05 PM · Late sun'
			};
		case 'evening_ready':
			return {
				skyHex: 0x3b4866,
				fogHex: 0x353f59,
				sunHex: 0xd98a5f,
				sunIntensity: 0.55,
				sunDirection: [10, 4.5, 5],
				ambientHex: 0x767c9c,
				ambientIntensity: 0.62,
				warmLampStrength: 1.7,
				stringLightsOn: true,
				timeLabel: '5:45 PM · Dusk in the courtyard'
			};
		case 'screening':
		case 'afterglow':
			return {
				skyHex: 0x222b42,
				fogHex: 0x20283d,
				sunHex: 0x8d6b7c,
				sunIntensity: 0.3,
				sunDirection: [8, 4, 4],
				ambientHex: 0x5c6486,
				ambientIntensity: 0.54,
				warmLampStrength: 1.8,
				stringLightsOn: true,
				timeLabel:
					phase === 'screening'
						? '6:05 PM · Courtyard screening'
						: '6:20 PM · Evening on Kusumtala Lane'
			};
	}
}
