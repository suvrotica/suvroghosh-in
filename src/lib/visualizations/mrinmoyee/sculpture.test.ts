import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN, PRESETS } from './config';
import { ARM_LAYOUT, buildSculpture } from './sculpture';

function inspect(root: THREE.Group) {
	let vertices = 0;
	let triangles = 0;
	const regions = new Set<string>();
	const materials = new Set<THREE.Material>();
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		const geometry = object.geometry as THREE.BufferGeometry;
		vertices += geometry.attributes.position.count;
		triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
		regions.add(object.userData.region);
		materials.add(object.material as THREE.Material);
		for (const attribute of Object.values(geometry.attributes)) {
			const values =
				attribute instanceof THREE.InterleavedBufferAttribute
					? attribute.data.array
					: attribute.array;
			for (const number of values) {
				if (!Number.isFinite(number)) throw new Error(`Non-finite geometry in ${object.name}`);
			}
		}
	});
	return { vertices, triangles, regions, materials, bounds: new THREE.Box3().setFromObject(root) };
}

function dispose(root: THREE.Group) {
	const materials = new Set<THREE.Material>();
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		object.geometry.dispose();
		materials.add(object.material as THREE.Material);
	});
	materials.forEach((material) => material.dispose());
}

describe('Mrinmoyee sculptural construction', () => {
	it('builds six genuine, finite construction stages with increasing physical detail', () => {
		const triangles: number[] = [];
		for (let stage = 0; stage <= 5; stage++) {
			const model = buildSculpture({ ...DEFAULT_DESIGN, stage }, 'low');
			try {
				const result = inspect(model);
				triangles.push(result.triangles);
				expect(result.bounds.min.y).toBeGreaterThanOrEqual(0);
				expect(result.bounds.max.y).toBeLessThan(8);
				expect(result.bounds.max.x - result.bounds.min.x).toBeLessThan(6.5);
				if (stage < 3) expect(result.regions.has('dress')).toBe(false);
				if (stage < 4) expect(result.regions.has('crown')).toBe(false);
				if (stage === 5) expect(result.regions.has('lion')).toBe(true);
			} finally {
				dispose(model);
			}
		}
		for (let stage = 1; stage <= 5; stage++)
			expect(triangles[stage]).toBeGreaterThan(triangles[stage - 1]);
	});

	it('keeps ten distinct gripping locations connected to the expected arm fan', () => {
		expect(ARM_LAYOUT).toHaveLength(10);
		expect(new Set(ARM_LAYOUT.map(({ attribute }) => attribute)).size).toBe(10);
		const model = buildSculpture({ ...DEFAULT_DESIGN, stage: 1 }, 'low');
		try {
			const skin = model.children.filter(
				(object): object is THREE.Mesh =>
					object instanceof THREE.Mesh && object.userData.region === 'face'
			);
			for (const arm of ARM_LAYOUT) {
				expect(Math.sign(arm.elbow[0])).toBe(arm.side);
				expect(Math.sign(arm.hand[0])).toBe(arm.side);
				for (const point of [arm.elbow, arm.hand]) {
					let nearest = Infinity;
					for (const mesh of skin) {
						const positions = mesh.geometry.attributes.position;
						for (let index = 0; index < positions.count; index++) {
							nearest = Math.min(
								nearest,
								Math.hypot(
									positions.getX(index) - point[0],
									positions.getY(index) - point[1],
									positions.getZ(index) - point[2]
								)
							);
						}
					}
					expect(
						nearest,
						`${arm.attribute} ${point === arm.hand ? 'grip' : 'elbow'} must contain anatomy`
					).toBeLessThan(0.19);
				}
			}
		} finally {
			dispose(model);
		}
	});

	it('renders each curated material as geometry with stable bounds and selectable regions', () => {
		for (const preset of PRESETS) {
			const model = buildSculpture(preset.design, 'low');
			try {
				const result = inspect(model);
				expect(result.regions.has('face')).toBe(true);
				expect(result.bounds.max.y).toBeGreaterThan(7);
				expect(result.bounds.max.y).toBeLessThan(8);
				if (preset.design.material === 'bronze' || preset.design.material === 'brass') {
					expect(
						[...result.materials].some(
							(material) => (material as THREE.MeshStandardMaterial).metalness > 0.7
						)
					).toBe(true);
				}
			} finally {
				dispose(model);
			}
		}
	});

	it('reduces secondary geometry while preserving the sculpture silhouette on lower quality', () => {
		const low = buildSculpture(DEFAULT_DESIGN, 'low');
		const high = buildSculpture(DEFAULT_DESIGN, 'high');
		try {
			const a = inspect(low),
				b = inspect(high);
			expect(a.triangles).toBeLessThan(b.triangles * 0.55);
			expect(a.regions).toEqual(b.regions);
			expect(a.bounds.max.distanceTo(b.bounds.max)).toBeLessThan(0.08);
			expect(a.bounds.min.distanceTo(b.bounds.min)).toBeLessThan(0.08);
			expect(low.children.length).toBeLessThan(65);
			expect(high.children.length).toBeLessThan(65);
		} finally {
			dispose(low);
			dispose(high);
		}
	});
});
