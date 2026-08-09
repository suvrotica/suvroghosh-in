import { describe, expect, it } from 'vitest';
import {
	CALCUTTA_SPATIAL_WORLD,
	CALCUTTA_WORLD_BOUNDS,
	distanceToDestination,
	edgeLengthM,
	findShortestPath,
	getSpatialNode,
	getWorldBounds,
	isWalkable,
	nearestWalkableEdge,
	nearestWalkablePoint,
	pathToDestination,
	type StreetArchetype
} from './spatial-world';

describe('authored Calcutta spatial world', () => {
	it('is a small irregular metre-based network with loops, bylanes, a wider road, and dead ends', () => {
		const world = CALCUTTA_SPATIAL_WORLD;
		const archetypes = new Set(world.edges.map((edge) => edge.archetype));
		const meaningfulBylanes: readonly StreetArchetype[] = [
			'residential-lane',
			'bazaar-lane',
			'workshop-lane',
			'old-house-lane'
		];
		const terminalSpaces = world.nodes.filter(
			(node) => node.kind === 'dead-end' || node.kind === 'courtyard'
		);
		const cycleRank = world.edges.length - world.nodes.length + 1;
		const diagonalEdges = world.edges.filter((edge) => {
			const from = getSpatialNode(edge.from).position;
			const to = getSpatialNode(edge.to).position;
			return Math.abs(from.x - to.x) > 1 && Math.abs(from.z - to.z) > 1;
		});

		expect(world.unit).toBe('metre');
		expect(world.edges.filter((edge) => edge.archetype === 'main-spine')).toHaveLength(6);
		for (const archetype of meaningfulBylanes) expect(archetypes.has(archetype)).toBe(true);
		expect(
			world.edges.filter((edge) => edge.archetype === 'connector-lane').length
		).toBeGreaterThanOrEqual(3);
		expect(archetypes.has('wider-road')).toBe(true);
		expect(terminalSpaces.length).toBeGreaterThanOrEqual(5);
		expect(cycleRank).toBeGreaterThanOrEqual(5);
		expect(diagonalEdges.length).toBeGreaterThan(world.edges.length * 0.7);
		expect(CALCUTTA_WORLD_BOUNDS.widthM).toBeLessThan(180);
		expect(CALCUTTA_WORLD_BOUNDS.depthM).toBeLessThan(230);
	});

	it('gives every edge complete, plausible simulation metadata', () => {
		const nodeIds = new Set(CALCUTTA_SPATIAL_WORLD.nodes.map((node) => node.id));
		for (const edge of CALCUTTA_SPATIAL_WORLD.edges) {
			expect(nodeIds.has(edge.from)).toBe(true);
			expect(nodeIds.has(edge.to)).toBe(true);
			expect(edgeLengthM(edge)).toBeGreaterThan(2);
			expect(edge.widthM).toBeGreaterThanOrEqual(2);
			expect(edge.widthM).toBeLessThanOrEqual(12);
			for (const value of [
				edge.traffic,
				edge.pedestrianDensity,
				edge.shopDensity,
				edge.animalChance,
				edge.weatherExposure
			]) {
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThanOrEqual(1);
			}
			expect(edge.lighting.length).toBeGreaterThan(0);
			expect(edge.surface.length).toBeGreaterThan(0);
			if (edge.blockage) {
				expect(edge.blockage.chance).toBeGreaterThan(0);
				expect(edge.blockage.kinds.length).toBeGreaterThan(0);
				expect(edge.blockage.resolvesAfterSeconds[1]).toBeGreaterThan(
					edge.blockage.resolvesAfterSeconds[0]
				);
			}
		}
	});

	it('finds centre lines and radius-safe walkable points', () => {
		const onSouthLane = { x: -7, z: 8 };
		const nearestEdge = nearestWalkableEdge(onSouthLane);
		expect(nearestEdge.edge.id).toBe('spine-south-1');
		expect(nearestEdge.distanceToCentrelineM).toBeLessThan(2.3);
		expect(isWalkable(onSouthLane, 0.35)).toBe(true);

		const remote = { x: 120, z: 40 };
		const nearest = nearestWalkablePoint(remote, 0.5);
		expect(nearest.distanceM).toBeGreaterThan(20);
		expect(isWalkable(nearest.walkablePoint, 0.5)).toBe(true);

		const narrowCentre = nearestWalkableEdge(
			{ x: 38, z: 106 },
			{
				blockedEdgeIds: CALCUTTA_SPATIAL_WORLD.edges
					.filter((edge) => edge.id !== 'bazaar-work-connector')
					.map((edge) => edge.id)
			}
		).point;
		expect(isWalkable(narrowCentre, 1.2)).toBe(true);
		expect(isWalkable(narrowCentre, 1.3)).toBe(false);
	});

	it('routes arbitrary positions to the destination and exposes consistent distance helpers', () => {
		const requestedStart = { x: -7.4, z: 3.2 };
		const route = pathToDestination(requestedStart, { radiusM: 0.35 });
		expect(route).not.toBeNull();
		expect(route!.distanceM).toBeGreaterThan(180);
		expect(route!.distanceM).toBeLessThan(300);
		expect(route!.points.length).toBeGreaterThan(10);
		expect(route!.edgeIds).toContain('spine-south-1');
		expect(route!.end).toEqual(getSpatialNode(CALCUTTA_SPATIAL_WORLD.destinationNodeId).position);
		expect(distanceToDestination(requestedStart, { radiusM: 0.35 })).toBeCloseTo(
			route!.distanceM,
			8
		);

		const reverse = findShortestPath(route!.end, route!.start, { radiusM: 0.35 });
		expect(reverse?.distanceM).toBeCloseTo(route!.distanceM, 8);
	});

	it('keeps the destination reachable when its shortest approach blocks', () => {
		const start = getSpatialNode(CALCUTTA_SPATIAL_WORLD.startNodeId).position;
		const direct = pathToDestination(start, { radiusM: 0.35 });
		const alternate = pathToDestination(start, {
			radiusM: 0.35,
			blockedEdgeIds: ['east-destination']
		});

		expect(direct).not.toBeNull();
		expect(direct!.edgeIds).toContain('east-destination');
		expect(alternate).not.toBeNull();
		expect(alternate!.edgeIds).not.toContain('east-destination');
		expect(alternate!.edgeIds).toContain('wide-north-destination');
		expect(alternate!.distanceM).toBeGreaterThan(direct!.distanceM);
	});

	it('keeps landmarks, signs, and stalls referenceable and inside renderer bounds', () => {
		const world = CALCUTTA_SPATIAL_WORLD;
		const edgeIds = new Set(world.edges.map((edge) => edge.id));
		const bounds = getWorldBounds(world, 8);
		const placements = [...world.landmarks, ...world.signs, ...world.stalls];

		expect(world.landmarks.length).toBeGreaterThanOrEqual(6);
		expect(world.signs.length).toBeGreaterThanOrEqual(3);
		expect(world.stalls.map((stall) => stall.kind).sort()).toEqual([
			'fuchka',
			'ghugni',
			'mishti',
			'tea'
		]);
		for (const placement of placements) {
			expect(edgeIds.has(placement.edgeId)).toBe(true);
			expect(placement.position.x).toBeGreaterThanOrEqual(bounds.minX);
			expect(placement.position.x).toBeLessThanOrEqual(bounds.maxX);
			expect(placement.position.z).toBeGreaterThanOrEqual(bounds.minZ);
			expect(placement.position.z).toBeLessThanOrEqual(bounds.maxZ);
		}
	});
});
