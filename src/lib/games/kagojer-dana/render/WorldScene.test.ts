import { describe, expect, it } from 'vitest';
import { createKagojerDanaWorldScene } from './WorldScene';

describe('Kagojer Dana world scene lifecycle', () => {
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
