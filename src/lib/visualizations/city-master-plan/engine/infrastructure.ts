import { ANOMALY_MULTIPLIERS } from './constants';
import { neighbourIndex, oppositeDirection } from './directions';
import { hashUnit } from './hash';
import { synthesizeMunicipalPatch } from './municipalPatch';
import type {
	CityConfig,
	CityTile,
	Direction,
	EdgeSignature,
	InfrastructureDetail,
	MunicipalPatch,
	Portal
} from './types';

export interface InfrastructureResult {
	details: readonly InfrastructureDetail[];
	patches: readonly MunicipalPatch[];
}

export function generateInfrastructure(
	config: CityConfig,
	width: number,
	height: number,
	fabric: readonly CityTile[],
	occupation: readonly CityTile[],
	elevation: readonly number[],
	portals: readonly Portal[],
	existingPatches: readonly MunicipalPatch[] = []
): InfrastructureResult {
	const details: InfrastructureDetail[] = [];
	const patches: MunicipalPatch[] = [];
	const anomalyScale = ANOMALY_MULTIPLIERS[config.anomalyAppetite];
	details.push(...generateDrainNetwork(config, width, height, fabric, elevation, portals));
	const deliberateTramGarage =
		config.anchor.id === 'tram-stop' &&
		config.tramPreference === 'high' &&
		config.anomalyAppetite === 'enthusiastic'
			? occupation
					.map((tile, index) => ({ tile, index }))
					.filter(
						({ tile, index }) =>
							tile.tags.includes('garage') && hasAdjacentTag(index, width, height, fabric, 'tram')
					)
					.sort((first, second) => {
						const firstX = first.index % width;
						const firstY = Math.floor(first.index / width);
						const secondX = second.index % width;
						const secondY = Math.floor(second.index / width);
						return (
							Math.abs(firstX - config.anchor.x) +
								Math.abs(firstY - config.anchor.y) -
								(Math.abs(secondX - config.anchor.x) + Math.abs(secondY - config.anchor.y)) ||
							first.index - second.index
						);
					})[0]?.index
			: undefined;

	for (let index = 0; index < fabric.length; index += 1) {
		const tile = fabric[index];
		const coordinate = { x: index % width, y: Math.floor(index / width) };
		const isRoute = tile.tags.includes('walkable');
		const isBank = tile.tags.includes('pond-bank');

		if (tile.tags.includes('tram')) {
			const orientation = throughDirections(tile);
			details.push({
				id: `tram-wire-${coordinate.x}-${coordinate.y}`,
				kind: 'tram-wire',
				cell: coordinate,
				from: orientation[0],
				to: orientation[1] ?? orientation[0],
				tags: ['utility', 'tram']
			});
		}

		const poleProbability = isRoute ? 0.12 : isBank ? 0.025 : 0;
		if (hashUnit(config.seed, 'electric-pole', index) < poleProbability) {
			details.push({
				id: `electric-pole-${coordinate.x}-${coordinate.y}`,
				kind: 'electric-pole',
				cell: coordinate,
				tags: ['utility', 'electric-pole']
			});
		}

		if (isBank && hasAdjacentTag(index, width, height, fabric, 'pond')) {
			if (hashUnit(config.seed, 'ghat', index) < 0.18) {
				const pondDirection = adjacentDirectionWithTag(index, width, height, fabric, 'pond');
				details.push({
					id: `ghat-${coordinate.x}-${coordinate.y}`,
					kind: 'ghat',
					cell: coordinate,
					to: pondDirection,
					tags: ['pond-access', 'steps']
				});
			}
		}
	}

	const allPatches = () => existingPatches.concat(patches);
	const addPatch = (index: number, tags: readonly string[], demands?: readonly EdgeSignature[]) => {
		const cell = { x: index % width, y: Math.floor(index / width) };
		if (
			allPatches().some(
				(patch) =>
					patch.cell.x === cell.x && patch.cell.y === cell.y && patch.pass === 'infrastructure'
			)
		) {
			return;
		}
		const patch = synthesizeMunicipalPatch({
			seed: config.seed,
			cell,
			pass: 'infrastructure',
			demandedEdges: demands,
			conflictTags: tags,
			previousPatches: allPatches()
		});
		if (!patches.some((candidate) => candidate.id === patch.id)) patches.push(patch);
	};

	for (const detail of details) {
		if (
			(detail.kind === 'drain' || detail.kind === 'culvert') &&
			detail.uphill &&
			hashUnit(config.seed, 'uphill-patch', detail.cell.x, detail.cell.y) <
				Math.min(1, 0.28 * anomalyScale)
		) {
			addPatch(detail.cell.y * width + detail.cell.x, ['drain', 'uphill', 'elevation-conflict']);
		}
	}

	for (let index = 0; index < occupation.length; index += 1) {
		const occupied = occupation[index];
		const routeDirections = adjacentDirectionsWithTag(index, width, height, fabric, 'walkable');
		const tramDirections = adjacentDirectionsWithTag(index, width, height, fabric, 'tram');
		const pondDirections = adjacentDirectionsWithTag(index, width, height, fabric, 'pond');
		const demandFor = (directions: readonly Direction[], kind: 'lane' | 'tram' | 'pond') =>
			demandEdges(directions, kind);

		if (
			occupied.tags.includes('garage') &&
			tramDirections.length > 0 &&
			(index === deliberateTramGarage ||
				hashUnit(config.seed, 'tram-garage', index) < Math.min(1, 0.14 * anomalyScale))
		) {
			addPatch(index, ['tram', 'garage'], demandFor(tramDirections, 'tram'));
		}
		if (
			occupied.tags.includes('verandah') &&
			routeDirections.length > 0 &&
			hasNearbyInfrastructure(index, width, height, details, 'electric-pole') &&
			hashUnit(config.seed, 'pole-verandah', index) < Math.min(1, 0.26 * anomalyScale)
		) {
			addPatch(index, ['utility', 'electric-pole', 'verandah']);
		}
		if (
			occupied.tags.includes('balcony') &&
			routeDirections.length > 0 &&
			hashUnit(config.seed, 'balcony-lane', index) < Math.min(1, 0.2 * anomalyScale)
		) {
			addPatch(index, ['balcony', 'structure-mass', 'route'], demandFor(routeDirections, 'lane'));
		}
		if (
			occupied.tags.includes('house') &&
			!occupied.tags.includes('balcony') &&
			routeDirections.length > 0 &&
			hashUnit(config.seed, 'bedroom-lane', index) < Math.min(1, 0.12 * anomalyScale)
		) {
			addPatch(index, ['house', 'bedroom', 'residential'], demandFor(routeDirections, 'lane'));
		}
		if (
			occupied.tags.includes('sand') &&
			fabric[index].tags.includes('walkable') &&
			(config.anchor.id === 'sand-pile' ||
				hashUnit(config.seed, 'sand-occupation', index) < Math.min(1, 0.14 * anomalyScale))
		) {
			addPatch(index, ['sand', 'route'], demandFor(throughDirections(fabric[index]), 'lane'));
		}
		if (
			occupied.tags.includes('pillar') &&
			(hasAdjacentTag(index, width, height, occupation, 'building') ||
				config.anchor.id === 'flyover-pillar') &&
			(config.anchor.id === 'flyover-pillar' ||
				hashUnit(config.seed, 'pillar-occupation', index) < Math.min(1, 0.12 * anomalyScale))
		) {
			addPatch(index, ['pillar', 'building', 'occupied']);
		}
		if (
			pondDirections.length > 0 &&
			fabric[index].tags.includes('walkable') &&
			hashUnit(config.seed, 'pond-lane-bridge', index) < Math.min(1, 0.16 * anomalyScale)
		) {
			const demands = demandFor(pondDirections, 'pond').map((edge, direction) => ({
				...edge,
				...(throughDirections(fabric[index]).includes(direction as Direction)
					? { passage: 'foot' as const }
					: {})
			}));
			addPatch(index, ['pond', 'route'], demands);
			details.push({
				id: `bridge-${index % width}-${Math.floor(index / width)}`,
				kind: 'bridge',
				cell: { x: index % width, y: Math.floor(index / width) },
				to: pondDirections[0],
				tags: ['pond-access', 'improvised']
			});
		}
	}

	return { details, patches };
}

function generateDrainNetwork(
	config: CityConfig,
	width: number,
	height: number,
	fabric: readonly CityTile[],
	elevation: readonly number[],
	portals: readonly Portal[]
): InfrastructureDetail[] {
	const cellCount = width * height;
	const drainable = Uint8Array.from(fabric, (tile) =>
		tile.tags.includes('walkable') || tile.tags.includes('pond-bank') ? 1 : 0
	);
	const roots = new Map<number, Direction>();
	for (const portal of portals) {
		const index = portal.y * width + portal.x;
		if (portal.drainOutlet && drainable[index] !== 0) roots.set(index, portal.direction);
	}
	for (let index = 0; index < cellCount; index += 1) {
		if (!fabric[index].tags.includes('pond-bank')) continue;
		const direction = adjacentDirectionWithTag(index, width, height, fabric, 'pond');
		if (direction !== undefined) roots.set(index, direction);
	}
	if (roots.size === 0) return [];

	const ROOT = -2;
	const UNREACHED = -1;
	const distance = new Float64Array(cellCount);
	distance.fill(Number.POSITIVE_INFINITY);
	const parent = new Int8Array(cellCount);
	parent.fill(UNREACHED);
	const visited = new Uint8Array(cellCount);
	for (const index of roots.keys()) {
		distance[index] = 0;
		parent[index] = ROOT;
	}

	// A tiny deterministic Dijkstra pass grows a drainage catchment outward from real outlets.
	// Flow later follows the parent pointers back down the tree, so connectivity is structural
	// rather than the accidental product of independently sampled neighbouring segments.
	for (let iteration = 0; iteration < cellCount; iteration += 1) {
		let current = -1;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (let index = 0; index < cellCount; index += 1) {
			if (visited[index] !== 0 || distance[index] >= bestDistance) continue;
			current = index;
			bestDistance = distance[index];
		}
		if (current < 0) break;
		visited[current] = 1;
		for (let rawDirection = 0; rawDirection < 4; rawDirection += 1) {
			const direction = rawDirection as Direction;
			const neighbour = neighbourIndex(current, direction, width, height);
			if (
				neighbour < 0 ||
				drainable[neighbour] === 0 ||
				!drainCellsConnect(current, neighbour, direction, fabric)
			) {
				continue;
			}
			// The prospective flow is neighbour -> current. Penalise, but do not prohibit, a rise;
			// an uphill segment can therefore remain as a rare, inspectable municipal exception.
			const rise = Math.max(0, elevation[current] - elevation[neighbour]);
			const candidateDistance = bestDistance + 1 + rise * 180;
			if (candidateDistance >= distance[neighbour]) continue;
			distance[neighbour] = candidateDistance;
			parent[neighbour] = oppositeDirection(direction);
		}
	}

	const selected = new Uint8Array(cellCount);
	const selectPath = (source: number) => {
		let current = source;
		for (let guard = 0; guard < cellCount; guard += 1) {
			if (current < 0 || parent[current] === UNREACHED) return;
			selected[current] = 1;
			if (parent[current] === ROOT) return;
			current = neighbourIndex(current, parent[current] as Direction, width, height);
		}
	};
	let sourceCount = 0;
	let farthest = -1;
	for (let index = 0; index < cellCount; index += 1) {
		if (!Number.isFinite(distance[index]) || parent[index] === ROOT) continue;
		if (farthest < 0 || distance[index] > distance[farthest]) farthest = index;
		const junctionBonus = throughDirections(fabric[index]).length >= 3 ? 0.022 : 0;
		const sourceProbability = 0.038 + junctionBonus;
		if (hashUnit(config.seed, 'drain-source', index) >= sourceProbability) continue;
		selectPath(index);
		sourceCount += 1;
	}
	if (sourceCount === 0 && farthest >= 0) selectPath(farthest);
	if (!selected.some((value) => value !== 0)) {
		const firstRoot = roots.keys().next().value as number | undefined;
		if (firstRoot !== undefined) selected[firstRoot] = 1;
	}

	const details: InfrastructureDetail[] = [];
	for (let index = 0; index < cellCount; index += 1) {
		if (selected[index] === 0) continue;
		const coordinate = { x: index % width, y: Math.floor(index / width) };
		const rootDirection = roots.get(index);
		const to = rootDirection ?? (parent[index] as Direction);
		const next = rootDirection === undefined ? neighbourIndex(index, to, width, height) : -1;
		const uphill = next >= 0 && elevation[next] > elevation[index] + 0.03 && parent[index] !== ROOT;
		let from = oppositeDirection(to);
		for (let rawDirection = 0; rawDirection < 4; rawDirection += 1) {
			const direction = rawDirection as Direction;
			const neighbour = neighbourIndex(index, direction, width, height);
			if (
				neighbour >= 0 &&
				selected[neighbour] !== 0 &&
				parent[neighbour] === oppositeDirection(direction)
			) {
				from = direction;
				break;
			}
		}
		const kind = fabric[index].tags.includes('road') ? 'culvert' : 'drain';
		details.push({
			id: `${kind}-${coordinate.x}-${coordinate.y}`,
			kind,
			cell: coordinate,
			from,
			to,
			connectsToOutlet: true,
			uphill,
			tags: ['drainage', 'outlet-network', ...(uphill ? ['uphill'] : [])]
		});
	}
	return details;
}

function drainCellsConnect(
	index: number,
	neighbour: number,
	direction: Direction,
	fabric: readonly CityTile[]
): boolean {
	const first = fabric[index];
	const second = fabric[neighbour];
	if (first.tags.includes('pond-bank') || second.tags.includes('pond-bank')) return true;
	return (
		first.edges[direction].passage !== 'closed' &&
		second.edges[oppositeDirection(direction)].passage !== 'closed'
	);
}

function demandEdges(
	directions: readonly Direction[],
	kind: 'lane' | 'tram' | 'pond'
): readonly EdgeSignature[] {
	return Array.from({ length: 4 }, (_, rawDirection) => {
		const active = directions.includes(rawDirection as Direction);
		return {
			passage: active && kind !== 'pond' ? (kind === 'tram' ? 'tram' : 'lane') : 'closed',
			water: active && kind === 'pond' ? 'pond' : 'dry',
			drain: 'none',
			face: 'neutral',
			clearance: active && kind !== 'pond' ? (kind === 'tram' ? 2 : 1) : 0
		};
	});
}

function throughDirections(tile: CityTile): Direction[] {
	const directions: Direction[] = [];
	for (let direction = 0; direction < 4; direction += 1) {
		if (tile.edges[direction].passage !== 'closed') directions.push(direction as Direction);
	}
	return directions;
}

function hasAdjacentTag(
	index: number,
	width: number,
	height: number,
	tiles: readonly CityTile[],
	tag: string
): boolean {
	return adjacentDirectionWithTag(index, width, height, tiles, tag) !== undefined;
}

function adjacentDirectionWithTag(
	index: number,
	width: number,
	height: number,
	tiles: readonly CityTile[],
	tag: string
): Direction | undefined {
	return adjacentDirectionsWithTag(index, width, height, tiles, tag)[0];
}

function adjacentDirectionsWithTag(
	index: number,
	width: number,
	height: number,
	tiles: readonly CityTile[],
	tag: string
): Direction[] {
	const directions: Direction[] = [];
	for (let rawDirection = 0; rawDirection < 4; rawDirection += 1) {
		const direction = rawDirection as Direction;
		const neighbour = neighbourIndex(index, direction, width, height);
		if (neighbour >= 0 && tiles[neighbour].tags.includes(tag)) directions.push(direction);
	}
	return directions;
}

function hasNearbyInfrastructure(
	index: number,
	width: number,
	height: number,
	details: readonly InfrastructureDetail[],
	kind: InfrastructureDetail['kind']
): boolean {
	const x = index % width;
	const y = Math.floor(index / width);
	return details.some(
		(detail) =>
			detail.kind === kind && Math.abs(detail.cell.x - x) + Math.abs(detail.cell.y - y) <= 1
	);
}
