import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createKagojerDanaWorldScene } from './WorldScene';

describe('Kagojer Dana world scene lifecycle', () => {
	it('keeps the continuous ground below streamed floors through origin changes and releases it once', () => {
		const world = createKagojerDanaWorldScene({ seed: 'ground-lifecycle', quality: 'battery' });
		const ground = world.scene.getObjectByName('continuous-district-ground') as THREE.Mesh<
			THREE.PlaneGeometry,
			THREE.MeshStandardMaterial
		>;
		expect(ground.geometry.parameters.width).toBeGreaterThan(world.camera.far * 2);
		expect(ground.userData.visualCueOnly).toBe(true);
		let releasedGeometry = 0;
		let releasedMaterial = 0;
		ground.geometry.addEventListener('dispose', () => {
			releasedGeometry += 1;
		});
		ground.material.addEventListener('dispose', () => {
			releasedMaterial += 1;
		});
		world.update(
			{
				position: { x: 550, y: 90, z: 1100 },
				groundVelocity: { x: 0, y: 0, z: 9 },
				orientation: { x: 0, y: 0, z: 0, w: 1 },
				airspeed: 9
			},
			1 / 60
		);
		expect(ground.position.y).toBe(-0.08);
		expect(ground.position.x).toBe(world.camera.position.x);
		expect(ground.position.z).toBe(world.camera.position.z);
		expect(world.getMetrics().visualOrigin.z).toBe(1024);
		world.destroy();
		world.destroy();
		expect(releasedGeometry).toBe(1);
		expect(releasedMaterial).toBe(1);
	});
	it('streams deterministic colliders with stable array identity and disposes idempotently', () => {
		const world = createKagojerDanaWorldScene({ seed: 'scene-lifecycle', quality: 'battery' });
		const colliders = world.getColliders();
		expect(colliders.length).toBeGreaterThan(0);
		expect(world.getColliders()).toBe(colliders);
		expect(world.getMetrics()).toMatchObject({
			routeSignature: world.route.signature,
			currentDistrict: 'north-calcutta',
			quality: 'battery'
		});
		world.update(
			{
				position: { x: 0, y: 18, z: 110 },
				groundVelocity: { x: 0, y: -0.8, z: 9 },
				orientation: { x: 0, y: 0, z: 0, w: 1 },
				airspeed: 9,
				apparentWind: { x: -1, y: 0.2, z: -9 },
				gustStrength: 0.25
			},
			1 / 60
		);
		expect(world.getColliders()).toBe(colliders);
		world.setStrongWindMarks(true);
		world.setCalmCamera(true);
		world.destroy();
		world.destroy();
		expect(world.getMetrics().activeChunkCount).toBe(0);
		expect(colliders).toHaveLength(0);
	});
});
