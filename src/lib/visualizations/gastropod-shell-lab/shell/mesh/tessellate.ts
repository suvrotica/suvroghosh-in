import { appendRingCapIndices, ringCentroid } from './caps';
import { computeBounds } from './diagnostics';
import { computeVertexNormals } from './normals';
import { analyzeTopology } from './topology';
import type { MeshPacket } from './types';

export interface TessellationInput {
	ringPositions: Float32Array;
	ringCount: number;
	samplesPerRing: number;
	capApex?: boolean;
}

export function tessellateRingHistory(input: TessellationInput): MeshPacket {
	const { ringPositions, ringCount, samplesPerRing } = input;
	if (!Number.isInteger(ringCount) || ringCount < 2) {
		throw new RangeError('Tessellation needs at least two rings.');
	}
	if (!Number.isInteger(samplesPerRing) || samplesPerRing < 3) {
		throw new RangeError('Tessellation needs at least three aperture samples.');
	}
	const expectedLength = ringCount * samplesPerRing * 3;
	if (ringPositions.length !== expectedLength) {
		throw new RangeError(
			`Expected ${expectedLength} ring coordinates; received ${ringPositions.length}.`
		);
	}
	const capApex = input.capApex ?? true;
	const apexVertexIndex = capApex ? ringCount * samplesPerRing : -1;
	const vertexCount = ringCount * samplesPerRing + (capApex ? 1 : 0);
	const positions = new Float32Array(vertexCount * 3);
	positions.set(ringPositions);
	if (capApex) {
		const centroid = ringCentroid(ringPositions, 0, samplesPerRing);
		const nextCentroid = ringCentroid(ringPositions, samplesPerRing, samplesPerRing);
		const direction = [
			nextCentroid[0] - centroid[0],
			nextCentroid[1] - centroid[1],
			nextCentroid[2] - centroid[2]
		] as const;
		const directionLength = Math.hypot(direction[0], direction[1], direction[2]);
		let meanRadius = 0;
		for (let sample = 0; sample < samplesPerRing; sample += 1) {
			const offset = sample * 3;
			meanRadius += Math.hypot(
				ringPositions[offset] - centroid[0],
				ringPositions[offset + 1] - centroid[1],
				ringPositions[offset + 2] - centroid[2]
			);
		}
		meanRadius /= samplesPerRing;
		const backward = directionLength > 1e-12 ? (meanRadius * 0.65) / directionLength : 0;
		positions.set(
			[
				centroid[0] - direction[0] * backward,
				centroid[1] - direction[1] * backward,
				centroid[2] - direction[2] * backward
			],
			apexVertexIndex * 3
		);
	}
	const uvs = new Float32Array(vertexCount * 2);
	for (let ring = 0; ring < ringCount; ring += 1) {
		const age = ring / (ringCount - 1);
		for (let sample = 0; sample < samplesPerRing; sample += 1) {
			const vertex = ring * samplesPerRing + sample;
			uvs[vertex * 2] = sample / samplesPerRing;
			uvs[vertex * 2 + 1] = age;
		}
	}
	if (capApex) {
		uvs[apexVertexIndex * 2] = 0.5;
		uvs[apexVertexIndex * 2 + 1] = 0;
	}
	const indexList: number[] = [];
	const stripIndexEnds = new Uint32Array(ringCount);
	if (capApex) appendRingCapIndices(indexList, 0, apexVertexIndex, samplesPerRing);
	stripIndexEnds[0] = indexList.length;
	for (let ring = 0; ring < ringCount - 1; ring += 1) {
		const currentStart = ring * samplesPerRing;
		const nextStart = (ring + 1) * samplesPerRing;
		for (let sample = 0; sample < samplesPerRing; sample += 1) {
			const nextSample = (sample + 1) % samplesPerRing;
			const a = currentStart + sample;
			const b = currentStart + nextSample;
			const c = nextStart + sample;
			const d = nextStart + nextSample;
			indexList.push(a, b, c, b, d, c);
		}
		stripIndexEnds[ring + 1] = indexList.length;
	}
	const indices = Uint32Array.from(indexList);
	const normals = computeVertexNormals(positions, indices);
	const bounds = computeBounds(positions);
	const topology = analyzeTopology(
		positions,
		indices,
		Math.max(1e-16, bounds.diagonal * bounds.diagonal * 1e-12)
	);
	return {
		positions,
		normals,
		uvs,
		indices,
		stripIndexEnds,
		ringCount,
		samplesPerRing,
		apexVertexIndex,
		bounds,
		topology
	};
}
