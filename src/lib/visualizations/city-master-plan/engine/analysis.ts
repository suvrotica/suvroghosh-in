import { explainEdgeCompatibility } from './compatibility';
import { neighbourIndex, oppositeDirection } from './directions';
import type {
	CityAnalysis,
	CityTile,
	Direction,
	InfrastructureDetail,
	MunicipalPatch,
	Portal
} from './types';

export function analyseCity(
	width: number,
	height: number,
	fabric: readonly CityTile[],
	occupation: readonly CityTile[],
	infrastructure: readonly InfrastructureDetail[],
	patches: readonly MunicipalPatch[],
	portals: readonly Portal[]
): CityAnalysis {
	const fabricPatches = patchesByCell(width, patches, 'fabric');
	const occupationPatches = patchesByCell(width, patches, 'occupation');
	const effectiveFabric = applyPatchEdges(fabric, fabricPatches);
	const effectiveOccupation = applyPatchEdges(occupation, occupationPatches);
	const walkable = new Uint8Array(fabric.length);
	for (let index = 0; index < fabric.length; index += 1) {
		walkable[index] =
			effectiveFabric[index].tags.includes('walkable') ||
			fabricPatches.get(index)?.selectedEdges.some((edge) => edge.passage !== 'closed')
				? 1
				: 0;
	}
	const graph = buildWalkableGraph(width, height, effectiveFabric, walkable);
	const components = connectedComponents(graph, walkable);
	const largest = components.reduce<number[]>(
		(best, component) => (component.length > best.length ? component : best),
		[]
	);
	const largestSet = new Set(largest);
	const portalIndices = portals.map((portal) => portal.y * width + portal.x);
	const reachedBorderExits = portalIndices.filter((index) => largestSet.has(index)).length;
	let deadEnds = 0;
	for (let index = 0; index < graph.length; index += 1) {
		if (walkable[index] !== 0 && graph[index].length <= 1) deadEnds += 1;
	}

	let occupiedCount = 0;
	let accessibleCount = 0;
	let isolatedCount = 0;
	let reachableServices = 0;
	let serviceCount = 0;
	const serviceFamilies = new Set<string>();
	const reachableServiceFamilies = new Set<string>();
	let treeCount = 0;
	const routeObstructionCells = new Set<number>();
	for (let index = 0; index < effectiveOccupation.length; index += 1) {
		const tile = effectiveOccupation[index];
		if (tile.tags.includes('tree')) treeCount += 1;
		if (
			tile.tags.includes('obstruction') &&
			(effectiveFabric[index].tags.includes('walkable') || graph[index].length > 0)
		) {
			routeObstructionCells.add(index);
		}
		if (!tile.tags.includes('occupied')) continue;
		occupiedCount += 1;
		const frontage = accessibleFrontage(index, width, height, effectiveFabric, tile);
		if (frontage.length > 0) {
			accessibleCount += 1;
		} else {
			isolatedCount += 1;
		}
		if (tile.tags.includes('service')) {
			serviceCount += 1;
			serviceFamilies.add(tile.prototypeId);
			if (frontage.some((neighbour) => largestSet.has(neighbour))) {
				reachableServices += 1;
				reachableServiceFamilies.add(tile.prototypeId);
			}
		}
	}

	const drains = infrastructure.filter(
		(detail) => detail.kind === 'drain' || detail.kind === 'culvert'
	);
	const connectedToOutlet = drains.filter((detail) => detail.connectsToOutlet).length;
	const uphill = drains.filter((detail) => detail.uphill).length;
	const broken = drains.filter((detail) => detail.to === undefined).length;
	const internallyTrapped = Math.max(0, drains.length - connectedToOutlet - broken);

	const tramIndices = effectiveFabric.flatMap((tile, index) =>
		tile.tags.includes('tram') ? [index] : []
	);
	const tramSet = new Set(tramIndices);
	let strandedSegments = 0;
	for (const index of tramIndices) {
		let tramNeighbours = 0;
		for (const neighbour of graph[index]) if (tramSet.has(neighbour)) tramNeighbours += 1;
		if (tramNeighbours < 2 && !portalIndices.includes(index)) strandedSegments += 1;
	}
	const reachesBorder = tramIndices.some((index) => portalIndices.includes(index));
	const continuous =
		tramIndices.length === 0 ||
		(strandedSegments <= (reachesBorder ? 1 : 0) && tramConnected(tramIndices, graph));

	let pondAccessPoints = infrastructure.filter(
		(detail) => detail.kind === 'ghat' || detail.kind === 'bridge'
	).length;
	for (let index = 0; index < effectiveFabric.length; index += 1) {
		if (
			effectiveFabric[index].tags.includes('pond-bank') &&
			hasAdjacentTag(index, width, height, effectiveFabric, 'pond') &&
			hasAdjacentWalkable(index, width, height, effectiveFabric)
		) {
			pondAccessPoints += 1;
		}
	}
	const openSpaceCount = effectiveFabric.filter(
		(tile) =>
			tile.tags.includes('open') || tile.tags.includes('pond') || tile.tags.includes('pond-bank')
	).length;
	const availableOccupationCells = Math.max(
		1,
		effectiveFabric.filter((tile) => !tile.tags.includes('pond') && !tile.tags.includes('water'))
			.length
	);
	const exceptionTypes = new Set(patches.map((patch) => patch.anomalyType));
	for (const patch of patches) {
		if (
			[
				'balcony-over-lane',
				'lane-through-bedroom',
				'tram-through-garage',
				'permanent-sand-occupation'
			].includes(patch.anomalyType)
		) {
			const index = patch.cell.y * width + patch.cell.x;
			if (index >= 0 && index < effectiveFabric.length) routeObstructionCells.add(index);
		}
	}

	return {
		walkable: {
			cellCount: graph.filter((_, index) => walkable[index] !== 0).length,
			componentCount: components.length,
			largestComponent: largest.length,
			largestComponentRatio:
				largest.length / Math.max(1, graph.filter((_, index) => walkable[index] !== 0).length),
			borderExits: portals.length,
			reachedBorderExits,
			deadEnds
		},
		frontage: {
			occupiedCount,
			accessibleCount,
			accessibleRatio: accessibleCount / Math.max(1, occupiedCount),
			isolatedCount,
			reachableServices,
			serviceCount,
			reachableServiceVariety: reachableServiceFamilies.size,
			serviceVariety: serviceFamilies.size
		},
		drainage: {
			segmentCount: drains.length,
			connectedToOutlet,
			internallyTrapped,
			broken,
			uphill,
			missing: drains.length === 0
		},
		tram: {
			segmentCount: tramIndices.length,
			continuous,
			strandedSegments,
			reachesBorder
		},
		routeObstructions: routeObstructionCells.size,
		exceptionCount: patches.length,
		exceptionSeverity: patches.reduce((sum, patch) => sum + patch.severity, 0),
		exceptionDiversity: exceptionTypes.size,
		treeCount,
		openSpaceCount,
		pondAccessPoints,
		occupiedDensity: Math.min(1, occupiedCount / availableOccupationCells)
	};
}

function patchesByCell(
	width: number,
	patches: readonly MunicipalPatch[],
	pass: MunicipalPatch['pass']
): Map<number, MunicipalPatch> {
	return new Map(
		patches
			.filter((patch) => patch.pass === pass && patch.selectedEdges.length >= 4)
			.map((patch) => [patch.cell.y * width + patch.cell.x, patch])
	);
}

function applyPatchEdges(
	tiles: readonly CityTile[],
	patches: ReadonlyMap<number, MunicipalPatch>
): readonly CityTile[] {
	return tiles.map((tile, index) => {
		const selected = patches.get(index)?.selectedEdges;
		if (!selected || selected.length < 4) return tile;
		return {
			...tile,
			edges: [{ ...selected[0] }, { ...selected[1] }, { ...selected[2] }, { ...selected[3] }]
		};
	});
}

export function buildWalkableGraph(
	width: number,
	height: number,
	fabric: readonly CityTile[],
	walkableMask?: Uint8Array
): number[][] {
	const walkable =
		walkableMask ?? Uint8Array.from(fabric, (tile) => (tile.tags.includes('walkable') ? 1 : 0));
	const graph = Array.from({ length: fabric.length }, () => [] as number[]);
	for (let index = 0; index < fabric.length; index += 1) {
		if (walkable[index] === 0) continue;
		for (let rawDirection = 0; rawDirection < 4; rawDirection += 1) {
			const direction = rawDirection as Direction;
			const neighbour = neighbourIndex(index, direction, width, height);
			if (neighbour < 0 || walkable[neighbour] === 0) continue;
			const first = fabric[index].edges[direction];
			const second = fabric[neighbour].edges[oppositeDirection(direction)];
			if (first.passage === 'closed' || second.passage === 'closed') continue;
			if (explainEdgeCompatibility(first, second, direction).compatible) {
				graph[index].push(neighbour);
			}
		}
	}
	return graph;
}

function connectedComponents(graph: readonly number[][], mask: Uint8Array): number[][] {
	const visited = new Uint8Array(graph.length);
	const components: number[][] = [];
	for (let start = 0; start < graph.length; start += 1) {
		if (mask[start] === 0 || visited[start] !== 0) continue;
		const component: number[] = [];
		const queue = [start];
		visited[start] = 1;
		for (let cursor = 0; cursor < queue.length; cursor += 1) {
			const current = queue[cursor];
			component.push(current);
			for (const neighbour of graph[current]) {
				if (visited[neighbour] !== 0) continue;
				visited[neighbour] = 1;
				queue.push(neighbour);
			}
		}
		components.push(component);
	}
	return components;
}

function accessibleFrontage(
	index: number,
	width: number,
	height: number,
	fabric: readonly CityTile[],
	occupation: CityTile
): number[] {
	const neighbours: number[] = [];
	for (let rawDirection = 0; rawDirection < 4; rawDirection += 1) {
		const direction = rawDirection as Direction;
		const face = occupation.edges[direction].face;
		if (face !== 'entrance' && face !== 'shopfront' && face !== 'garage-door') continue;
		const neighbour = neighbourIndex(index, direction, width, height);
		if (neighbour < 0) continue;
		const substrate = fabric[neighbour];
		const accessible =
			face === 'garage-door'
				? substrate.tags.includes('vehicle-access')
				: substrate.tags.includes('walkable') || substrate.tags.includes('open');
		if (accessible) neighbours.push(neighbour);
	}
	return neighbours;
}

function hasAdjacentWalkable(
	index: number,
	width: number,
	height: number,
	fabric: readonly CityTile[]
): boolean {
	for (let direction = 0; direction < 4; direction += 1) {
		const neighbour = neighbourIndex(index, direction as Direction, width, height);
		if (neighbour >= 0 && fabric[neighbour].tags.includes('walkable')) return true;
	}
	return false;
}

function hasAdjacentTag(
	index: number,
	width: number,
	height: number,
	tiles: readonly CityTile[],
	tag: string
): boolean {
	for (let direction = 0; direction < 4; direction += 1) {
		const neighbour = neighbourIndex(index, direction as Direction, width, height);
		if (neighbour >= 0 && tiles[neighbour].tags.includes(tag)) return true;
	}
	return false;
}

function tramConnected(indices: readonly number[], graph: readonly number[][]): boolean {
	if (indices.length <= 1) return true;
	const tram = new Set(indices);
	const visited = new Set<number>([indices[0]]);
	const queue = [indices[0]];
	for (let cursor = 0; cursor < queue.length; cursor += 1) {
		for (const neighbour of graph[queue[cursor]]) {
			if (!tram.has(neighbour) || visited.has(neighbour)) continue;
			visited.add(neighbour);
			queue.push(neighbour);
		}
	}
	return visited.size === indices.length;
}
