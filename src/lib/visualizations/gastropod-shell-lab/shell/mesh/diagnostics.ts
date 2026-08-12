import type { Bounds3, MeshDiagnostics, MeshPacket } from './types';

export function computeBounds(positions: ArrayLike<number>): Bounds3 {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let minZ = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let maxZ = Number.NEGATIVE_INFINITY;
	for (let offset = 0; offset + 2 < positions.length; offset += 3) {
		const x = positions[offset];
		const y = positions[offset + 1];
		const z = positions[offset + 2];
		if (![x, y, z].every(Number.isFinite)) continue;
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		minZ = Math.min(minZ, z);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
		maxZ = Math.max(maxZ, z);
	}
	if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
		return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], diagonal: 0 };
	}
	return {
		min: [minX, minY, minZ],
		max: [maxX, maxY, maxZ],
		center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
		diagonal: Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
	};
}

export function diagnoseMesh(mesh: MeshPacket, expectedBoundaryLoops = 1): MeshDiagnostics {
	let nonFinitePositionCount = 0;
	let nonFiniteNormalCount = 0;
	let nonFiniteUvCount = 0;
	let outOfRangeIndexCount = 0;
	let shortNormalCount = 0;
	let degenerateTriangleCount = 0;
	let minimumTriangleArea = Number.POSITIVE_INFINITY;
	let maximumTriangleArea = 0;
	for (const value of mesh.positions) if (!Number.isFinite(value)) nonFinitePositionCount += 1;
	for (const value of mesh.normals) if (!Number.isFinite(value)) nonFiniteNormalCount += 1;
	for (const value of mesh.uvs) if (!Number.isFinite(value)) nonFiniteUvCount += 1;
	const vertexCount = mesh.positions.length / 3;
	for (const index of mesh.indices) {
		if (!Number.isInteger(index) || index < 0 || index >= vertexCount) outOfRangeIndexCount += 1;
	}
	for (let offset = 0; offset + 2 < mesh.normals.length; offset += 3) {
		const length = Math.hypot(
			mesh.normals[offset],
			mesh.normals[offset + 1],
			mesh.normals[offset + 2]
		);
		if (Math.abs(length - 1) > 1e-4) shortNormalCount += 1;
	}
	const areaThreshold = Math.max(1e-16, mesh.bounds.diagonal * mesh.bounds.diagonal * 1e-12);
	for (let offset = 0; offset + 2 < mesh.indices.length; offset += 3) {
		const a = mesh.indices[offset] * 3;
		const b = mesh.indices[offset + 1] * 3;
		const c = mesh.indices[offset + 2] * 3;
		const abX = mesh.positions[b] - mesh.positions[a];
		const abY = mesh.positions[b + 1] - mesh.positions[a + 1];
		const abZ = mesh.positions[b + 2] - mesh.positions[a + 2];
		const acX = mesh.positions[c] - mesh.positions[a];
		const acY = mesh.positions[c + 1] - mesh.positions[a + 1];
		const acZ = mesh.positions[c + 2] - mesh.positions[a + 2];
		const crossX = abY * acZ - abZ * acY;
		const crossY = abZ * acX - abX * acZ;
		const crossZ = abX * acY - abY * acX;
		const area = Math.hypot(crossX, crossY, crossZ) * 0.5;
		minimumTriangleArea = Math.min(minimumTriangleArea, area);
		maximumTriangleArea = Math.max(maximumTriangleArea, area);
		if (!(area > areaThreshold)) degenerateTriangleCount += 1;
	}
	if (!Number.isFinite(minimumTriangleArea)) minimumTriangleArea = 0;
	const errors: string[] = [];
	const warnings: string[] = [];
	if (nonFinitePositionCount > 0)
		errors.push(`${nonFinitePositionCount} position values are non-finite.`);
	if (nonFiniteNormalCount > 0)
		errors.push(`${nonFiniteNormalCount} normal values are non-finite.`);
	if (nonFiniteUvCount > 0) errors.push(`${nonFiniteUvCount} UV values are non-finite.`);
	if (outOfRangeIndexCount > 0)
		errors.push(`${outOfRangeIndexCount} indices are outside the vertex buffer.`);
	if (shortNormalCount > 0) errors.push(`${shortNormalCount} vertex normals are not unit length.`);
	if (degenerateTriangleCount > 0) {
		warnings.push(
			`${degenerateTriangleCount} triangles are below the scale-relative area threshold.`
		);
	}
	if (mesh.topology.nonManifoldEdgeCount > 0) {
		errors.push(`${mesh.topology.nonManifoldEdgeCount} edges are non-manifold.`);
	}
	if (mesh.topology.boundaryLoopCount !== expectedBoundaryLoops) {
		errors.push(
			`Expected ${expectedBoundaryLoops} open boundary ${expectedBoundaryLoops === 1 ? 'loop' : 'loops'}; found ${mesh.topology.boundaryLoopCount}.`
		);
	}
	return {
		valid: errors.length === 0,
		errors,
		warnings,
		nonFinitePositionCount,
		nonFiniteNormalCount,
		nonFiniteUvCount,
		outOfRangeIndexCount,
		shortNormalCount,
		degenerateTriangleCount,
		minimumTriangleArea,
		maximumTriangleArea
	};
}
