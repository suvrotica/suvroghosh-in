export type Tuple3 = [number, number, number];

export interface Bounds3 {
	min: Tuple3;
	max: Tuple3;
	center: Tuple3;
	diagonal: number;
}

export interface TopologyReport {
	vertexCount: number;
	triangleCount: number;
	edgeCount: number;
	boundaryEdgeCount: number;
	boundaryLoopCount: number;
	nonManifoldEdgeCount: number;
	degenerateTriangleCount: number;
	eulerCharacteristic: number;
	manifold: boolean;
}

/** Raw arrays only: safe to post from a worker with transferable buffers. */
export interface MeshPacket {
	positions: Float32Array;
	normals: Float32Array;
	uvs: Float32Array;
	indices: Uint32Array;
	/** Cumulative index count after revealing each successive deposited ring. */
	stripIndexEnds: Uint32Array;
	ringCount: number;
	samplesPerRing: number;
	apexVertexIndex: number;
	bounds: Bounds3;
	topology: TopologyReport;
}

export interface MeshDiagnostics {
	valid: boolean;
	errors: string[];
	warnings: string[];
	nonFinitePositionCount: number;
	nonFiniteNormalCount: number;
	nonFiniteUvCount: number;
	outOfRangeIndexCount: number;
	shortNormalCount: number;
	degenerateTriangleCount: number;
	minimumTriangleArea: number;
	maximumTriangleArea: number;
}
