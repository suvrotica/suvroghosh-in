import { clamp } from '../math/vector';
import type { MeshPacket } from '../mesh/types';
import type { RingHistory, RingPrefix } from './types';

export function visibleRingCountAtAge(ringCount: number, age: number): number {
	if (ringCount <= 0) return 0;
	return Math.min(
		ringCount,
		1 + Math.floor(clamp(Number.isFinite(age) ? age : 0, 0, 1) * (ringCount - 1) + 1e-12)
	);
}

export function ringPrefixAtAge(history: RingHistory, mesh: MeshPacket, age: number): RingPrefix {
	const safeAge = clamp(Number.isFinite(age) ? age : 0, 0, 1);
	const visibleRingCount = visibleRingCountAtAge(history.ringCount, safeAge);
	const indexCount =
		visibleRingCount > 0
			? mesh.stripIndexEnds[Math.min(mesh.stripIndexEnds.length - 1, visibleRingCount - 1)]
			: 0;
	return {
		age: safeAge,
		visibleRingCount,
		visibleRingVertexCount: visibleRingCount * history.samplesPerRing,
		indexCount
	};
}

export function ringPositionPrefix(history: RingHistory, visibleRingCount: number): Float32Array {
	const count = Math.max(0, Math.min(history.ringCount, Math.floor(visibleRingCount)));
	return history.ringPositions.subarray(0, count * history.samplesPerRing * 3);
}
