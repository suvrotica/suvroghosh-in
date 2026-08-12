import type { TopologyReport } from './types';

interface EdgeRecord {
	count: number;
	a: number;
	b: number;
}

function edgeKey(a: number, b: number): string {
	return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function analyzeTopology(
	positions: ArrayLike<number>,
	indices: ArrayLike<number>,
	areaEpsilon = 1e-14
): TopologyReport {
	const vertexCount = Math.floor(positions.length / 3);
	const triangleCount = Math.floor(indices.length / 3);
	const edges = new Map<string, EdgeRecord>();
	let degenerateTriangleCount = 0;
	for (let offset = 0; offset + 2 < indices.length; offset += 3) {
		const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
		const aOffset = triangle[0] * 3;
		const bOffset = triangle[1] * 3;
		const cOffset = triangle[2] * 3;
		const abX = positions[bOffset] - positions[aOffset];
		const abY = positions[bOffset + 1] - positions[aOffset + 1];
		const abZ = positions[bOffset + 2] - positions[aOffset + 2];
		const acX = positions[cOffset] - positions[aOffset];
		const acY = positions[cOffset + 1] - positions[aOffset + 1];
		const acZ = positions[cOffset + 2] - positions[aOffset + 2];
		const crossX = abY * acZ - abZ * acY;
		const crossY = abZ * acX - abX * acZ;
		const crossZ = abX * acY - abY * acX;
		if (Math.hypot(crossX, crossY, crossZ) * 0.5 <= areaEpsilon) {
			degenerateTriangleCount += 1;
		}
		for (let edge = 0; edge < 3; edge += 1) {
			const a = triangle[edge];
			const b = triangle[(edge + 1) % 3];
			const key = edgeKey(a, b);
			const existing = edges.get(key);
			if (existing) existing.count += 1;
			else edges.set(key, { count: 1, a: Math.min(a, b), b: Math.max(a, b) });
		}
	}
	const boundary = [...edges.values()].filter((edge) => edge.count === 1);
	const nonManifoldEdgeCount = [...edges.values()].filter((edge) => edge.count > 2).length;
	const adjacency = new Map<number, number[]>();
	for (const edge of boundary) {
		const aNeighbors = adjacency.get(edge.a) ?? [];
		aNeighbors.push(edge.b);
		adjacency.set(edge.a, aNeighbors);
		const bNeighbors = adjacency.get(edge.b) ?? [];
		bNeighbors.push(edge.a);
		adjacency.set(edge.b, bNeighbors);
	}
	let boundaryLoopCount = 0;
	const visited = new Set<number>();
	for (const vertex of adjacency.keys()) {
		if (visited.has(vertex)) continue;
		boundaryLoopCount += 1;
		const stack = [vertex];
		while (stack.length > 0) {
			const current = stack.pop()!;
			if (visited.has(current)) continue;
			visited.add(current);
			for (const neighbor of adjacency.get(current) ?? []) {
				if (!visited.has(neighbor)) stack.push(neighbor);
			}
		}
	}
	return {
		vertexCount,
		triangleCount,
		edgeCount: edges.size,
		boundaryEdgeCount: boundary.length,
		boundaryLoopCount,
		nonManifoldEdgeCount,
		degenerateTriangleCount,
		eulerCharacteristic: vertexCount - edges.size + triangleCount,
		manifold:
			nonManifoldEdgeCount === 0 && [...adjacency.values()].every((list) => list.length === 2)
	};
}
