import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FlowCurve, petalGeometry, ribbonGeometry, tunnelGeometry } from './geometry';
import { DEFAULT_STATE, normalizeState } from './model';

const boundaryCases = [0, DEFAULT_STATE.shape, 100].flatMap((shape) =>
	[0, DEFAULT_STATE.detail, 100].map((detail) => ({ shape, detail }))
);

function inspectSurface(geometry: THREE.BufferGeometry) {
	try {
		const positions = geometry.getAttribute('position');
		const normals = geometry.getAttribute('normal');
		const indices = geometry.getIndex();
		expect(positions.count).toBeGreaterThan(500);
		expect(positions.count).toBeLessThan(25_000);
		expect(normals.count).toBe(positions.count);
		expect(
			Array.from(positions.array).every(Number.isFinite),
			'All surface positions must be finite'
		).toBe(true);
		expect(
			Array.from(normals.array).every(Number.isFinite),
			'All lighting normals must be finite'
		).toBe(true);
		let smallestNormal = Infinity;
		let largestNormal = 0;
		for (let vertex = 0; vertex < normals.count; vertex++) {
			const length = Math.hypot(normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex));
			smallestNormal = Math.min(smallestNormal, length);
			largestNormal = Math.max(largestNormal, length);
		}
		// A zero vector is finite, but its normalization inside a physical shader is undefined.
		// This specifically protects the folded petal tips that previously poisoned HDR bloom.
		expect(
			smallestNormal,
			'Every vertex, including both boundary tips, needs a usable normal'
		).toBeGreaterThan(0.99);
		expect(largestNormal).toBeLessThan(1.01);
		expect(indices).not.toBeNull();
		expect(indices!.count % 3).toBe(0);
		let collapsedTriangles = 0;
		let invalidIndices = 0;
		const a = new THREE.Vector3();
		const b = new THREE.Vector3();
		const c = new THREE.Vector3();
		for (let triangle = 0; triangle < indices!.count; triangle += 3) {
			const vertices = [
				indices!.getX(triangle),
				indices!.getX(triangle + 1),
				indices!.getX(triangle + 2)
			];
			if (
				vertices.some(
					(vertex) => !Number.isInteger(vertex) || vertex < 0 || vertex >= positions.count
				)
			) {
				invalidIndices++;
				continue;
			}
			a.fromBufferAttribute(positions, vertices[0]);
			b.fromBufferAttribute(positions, vertices[1]).sub(a);
			c.fromBufferAttribute(positions, vertices[2]).sub(a);
			if (b.cross(c).lengthSq() === 0) collapsedTriangles++;
		}
		expect(invalidIndices).toBe(0);
		expect(collapsedTriangles, 'No indexed face should collapse to a line or a point').toBe(0);
		geometry.computeBoundingBox();
		const size = geometry.boundingBox!.getSize(new THREE.Vector3());
		expect([size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0.05)).toBe(
			true
		);
	} finally {
		geometry.dispose();
	}
}

describe('folded petal lighting regression', () => {
	it.each(boundaryCases)(
		'has finite nonzero normals and noncollapsed tips at shape $shape / detail $detail',
		({ shape, detail }) => {
			const state = normalizeState({ ...DEFAULT_STATE, shape, detail });
			inspectSurface(petalGeometry(state, 0, 0));
			inspectSurface(petalGeometry(state, 1.7, 1));
		}
	);
});

describe('bounded closed sculpture surfaces', () => {
	it.each(boundaryCases)(
		'keeps the knot and satellite finite at shape $shape / detail $detail',
		({ shape, detail }) => {
			const state = normalizeState({ ...DEFAULT_STATE, shape, detail });
			inspectSurface(ribbonGeometry(state, 0));
			inspectSurface(ribbonGeometry(state, 1.3, true));
		}
	);

	it.each(boundaryCases)(
		'keeps tunnel surfaces finite at shape $shape / detail $detail',
		({ shape, detail }) => {
			inspectSurface(tunnelGeometry(normalizeState({ ...DEFAULT_STATE, shape, detail }), 2.1));
		}
	);
});

it('keeps the current curves closed, spatial and finite across shape boundaries', () => {
	for (const shape of [0, DEFAULT_STATE.shape, 100]) {
		const curve = new FlowCurve(1.4, shape, 5);
		const start = curve.getPoint(0);
		const end = curve.getPoint(1);
		expect(start.distanceTo(end)).toBeLessThan(1e-10);
		const samples = curve.getPoints(100);
		expect(samples.every((point) => [point.x, point.y, point.z].every(Number.isFinite))).toBe(true);
		const extent = new THREE.Box3().setFromPoints(samples).getSize(new THREE.Vector3());
		expect(Math.min(extent.x, extent.y, extent.z)).toBeGreaterThan(0.5);
	}
});
