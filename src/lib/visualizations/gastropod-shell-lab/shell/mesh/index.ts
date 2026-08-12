export { tessellateRingHistory, type TessellationInput } from './tessellate';
export { diagnoseMesh, computeBounds } from './diagnostics';
export { analyzeTopology } from './topology';
export { computeVertexNormals } from './normals';
export { appendRingCapIndices, ringCentroid } from './caps';
export {
	estimateRingIntersections,
	type RingSphere,
	type IntersectionEstimate
} from './intersections';
export type { Bounds3, MeshDiagnostics, MeshPacket, TopologyReport, Tuple3 } from './types';
