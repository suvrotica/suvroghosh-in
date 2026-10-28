import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { generateDistrictChunk, type PropBlueprint } from '../world/AssetGrammar';
import { generateDistrictRoute } from '../world/DistrictGraph';
import { DistrictChunkVisualFactory } from './DistrictChunkVisuals';

describe('district visual batching', () => {
	it('keeps different materials and geometries within a prop family distinct', () => {
		const factory = new DistrictChunkVisualFactory('battery');
		const target = new THREE.Group();
		const prop = (kind: PropBlueprint['kind'], x: number): PropBlueprint => ({
			id: kind,
			kind,
			position: [x, 0, 0],
			rotationY: 0,
			scale: 1,
			motionPhase: 0
		});
		const base = generateDistrictChunk(generateDistrictRoute('batch-regression'), 0, {
			quality: 'battery'
		});
		factory.populate(target, {
			...base,
			buildings: [],
			landmarks: [],
			activities: [],
			animals: [],
			signs: [],
			props: [
				prop('yellow-taxi', 0),
				prop('city-bus', 6),
				prop('clay-armature', 15),
				prop('clay-worktable', 18),
				prop('book-stack', 22)
			]
		});
		const family = (name: string) =>
			target.children.filter(
				(child): child is THREE.InstancedMesh =>
					child instanceof THREE.InstancedMesh && child.name === name
			);
		const vehicles = family('vehicle-bodies');
		expect(vehicles).toHaveLength(2);
		expect(new Set(vehicles.map((mesh) => mesh.material)).size).toBe(2);
		const clay = family('clay-work');
		expect(clay.map((mesh) => mesh.geometry.type).sort()).toEqual(['BoxGeometry', 'ConeGeometry']);
		const books = family('book-and-paper-stacks');
		expect(books).toHaveLength(2);
		expect(books.map((mesh) => mesh.count)).toEqual([2, 2]);
		let releasedInstances = 0;
		let releasedSharedGeometry = 0;
		for (const mesh of [...vehicles, ...clay, ...books])
			mesh.addEventListener('dispose', () => {
				releasedInstances += 1;
			});
		vehicles[0].geometry.addEventListener('dispose', () => {
			releasedSharedGeometry += 1;
		});
		factory.clear(target);
		expect(releasedInstances).toBe(6);
		expect(releasedSharedGeometry).toBe(0);
		factory.dispose();
		expect(releasedSharedGeometry).toBe(1);
	});
});
