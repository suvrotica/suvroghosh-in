export function computeVertexNormals(
	positions: ArrayLike<number>,
	indices: ArrayLike<number>
): Float32Array {
	const normals = new Float64Array(positions.length);
	for (let offset = 0; offset + 2 < indices.length; offset += 3) {
		const a = indices[offset] * 3;
		const b = indices[offset + 1] * 3;
		const c = indices[offset + 2] * 3;
		const abX = positions[b] - positions[a];
		const abY = positions[b + 1] - positions[a + 1];
		const abZ = positions[b + 2] - positions[a + 2];
		const acX = positions[c] - positions[a];
		const acY = positions[c + 1] - positions[a + 1];
		const acZ = positions[c + 2] - positions[a + 2];
		const x = abY * acZ - abZ * acY;
		const y = abZ * acX - abX * acZ;
		const z = abX * acY - abY * acX;
		for (const vertex of [a, b, c]) {
			normals[vertex] += x;
			normals[vertex + 1] += y;
			normals[vertex + 2] += z;
		}
	}
	const result = new Float32Array(positions.length);
	for (let offset = 0; offset < normals.length; offset += 3) {
		const length = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]);
		if (length > 1e-20 && Number.isFinite(length)) {
			result[offset] = normals[offset] / length;
			result[offset + 1] = normals[offset + 1] / length;
			result[offset + 2] = normals[offset + 2] / length;
		} else {
			// A finite fallback is preferable to poisoning a GPU buffer; diagnostics still report it.
			result[offset] = 0;
			result[offset + 1] = 0;
			result[offset + 2] = 1;
		}
	}
	return result;
}
