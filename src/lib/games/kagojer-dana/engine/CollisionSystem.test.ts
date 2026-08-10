import { describe, expect, it } from 'vitest';
import {
	CollisionSystem,
	DEFAULT_PLANE_COLLISION_PROBES,
	type PlaneCollisionPose
} from './CollisionSystem';

const identity = { x: 0, y: 0, z: 0, w: 1 };

function pose(x: number, y: number, z: number): PlaneCollisionPose {
	return { position: { x, y, z }, orientation: identity };
}

describe('paper-plane swept collision', () => {
	it('cannot tunnel through a millimetre-scale wire during a maximum-speed step', () => {
		const collision = new CollisionSystem();
		const hit = collision.sweep(pose(0, 0, -5), pose(0, 0, 5), [
			{
				id: 'tram-wire-17',
				category: 'tram-wire',
				shape: 'capsule',
				start: { x: -2, y: 0, z: 0 },
				end: { x: 2, y: 0, z: 0 },
				radiusM: 0.002
			}
		]);

		expect(hit).not.toBeNull();
		expect(hit?.probeId).toBe('nose');
		expect(hit?.colliderId).toBe('tram-wire-17');
		expect(hit?.timeFraction).toBeGreaterThan(0);
		expect(hit?.timeFraction).toBeLessThan(1);
	});

	it('sweeps both wingtips rather than checking only the fuselage', () => {
		const collision = new CollisionSystem();
		const rightTip = DEFAULT_PLANE_COLLISION_PROBES.find((probe) => probe.id === 'right-wingtip');
		expect(rightTip).toBeDefined();
		const hit = collision.sweep(pose(0, 0, -1), pose(0, 0, 1), [
			{
				id: 'short-clothesline',
				category: 'clothesline',
				shape: 'capsule',
				start: { x: 0.46, y: -0.08, z: 0 },
				end: { x: 0.46, y: 0.08, z: 0 },
				radiusM: 0.003
			}
		]);

		expect(hit?.probeId).toBe('right-wingtip');
	});

	it('returns the earliest deterministic obstacle contact', () => {
		const collision = new CollisionSystem();
		const hit = collision.sweep(pose(0, 0, -3), pose(0, 0, 3), [
			{
				id: 'later-wall',
				category: 'wall',
				shape: 'aabb',
				min: { x: -1, y: -1, z: 1 },
				max: { x: 1, y: 1, z: 1.1 }
			},
			{
				id: 'earlier-wall',
				category: 'wall',
				shape: 'aabb',
				min: { x: -1, y: -1, z: -0.5 },
				max: { x: 1, y: 1, z: -0.4 }
			}
		]);

		expect(hit?.colliderId).toBe('earlier-wall');
	});
});
