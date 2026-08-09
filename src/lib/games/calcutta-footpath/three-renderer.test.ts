import { describe, expect, it } from 'vitest';
import {
	authoredLaneCameraLead,
	cameraRigForLane,
	chooseFootpathRenderQuality,
	constrainCameraToAuthoredLane
} from './three-renderer';
import type { FootpathQualityHints } from './three-renderer';
import type { SpatialEdge, SpatialNode, SpatialWorld, WorldPoint } from './spatial-world';

const DESKTOP_HINTS: FootpathQualityHints = {
	width: 1_440,
	height: 900,
	devicePixelRatio: 2,
	hardwareConcurrency: 12,
	deviceMemory: 8,
	saveData: false
};

function node(
	id: string,
	position: WorldPoint,
	kind: SpatialNode['kind'] = 'junction'
): SpatialNode {
	return { id, label: id, kind, position };
}

function edge(
	id: string,
	from: string,
	to: string,
	widthM = 4,
	via: readonly WorldPoint[] = []
): SpatialEdge {
	return {
		id,
		from,
		to,
		via,
		widthM,
		archetype: 'residential-lane',
		traffic: 0,
		pedestrianDensity: 0,
		lighting: 'open-sun',
		surface: 'patched-asphalt',
		shopDensity: 0,
		animalChance: 0,
		blockage: null,
		weatherExposure: 0
	};
}

const TURN_WORLD: SpatialWorld = {
	id: 'camera-turn-test',
	unit: 'metre',
	startNodeId: 'south',
	destinationNodeId: 'east',
	nodes: [
		node('south', { x: 0, z: 0 }, 'start'),
		node('corner', { x: 0, z: 10 }, 'turn'),
		node('east', { x: 10, z: 10 }, 'destination')
	],
	edges: [edge('south-lane', 'south', 'corner'), edge('east-lane', 'corner', 'east')],
	landmarks: [],
	signs: [],
	stalls: []
};

describe('footpath renderer quality policy', () => {
	it('keeps explicit low and high choices authoritative', () => {
		expect(chooseFootpathRenderQuality('low', DESKTOP_HINTS)).toBe('low');
		expect(
			chooseFootpathRenderQuality('high', {
				...DESKTOP_HINTS,
				width: 360,
				height: 640,
				hardwareConcurrency: 2,
				deviceMemory: 2,
				saveData: true
			})
		).toBe('high');
	});

	it('uses high for a comfortable desktop in auto mode', () => {
		expect(chooseFootpathRenderQuality('auto', DESKTOP_HINTS)).toBe('high');
	});

	it.each([
		['a compact viewport', { width: 390, height: 600 }],
		['data saver', { saveData: true }],
		['a small CPU', { hardwareConcurrency: 2 }],
		['limited memory', { deviceMemory: 3 }]
	])('uses low for %s', (_label, constraint) => {
		expect(
			chooseFootpathRenderQuality('auto', {
				...DESKTOP_HINTS,
				...constraint
			})
		).toBe('low');
	});

	it('starts a four-core desktop at high and lets frame metrics downgrade later', () => {
		expect(
			chooseFootpathRenderQuality('auto', {
				...DESKTOP_HINTS,
				hardwareConcurrency: 4
			})
		).toBe('high');
	});
});

describe('footpath third-person camera envelope', () => {
	it('keeps narrow and wide lanes within the agreed human-scale camera bounds', () => {
		for (const width of [2.35, 3.1, 4.6, 9.4]) {
			const rig = cameraRigForLane(width);
			expect(rig.fovDegrees).toBeGreaterThanOrEqual(46);
			expect(rig.fovDegrees).toBeLessThanOrEqual(50);
			expect(rig.heightM).toBeGreaterThanOrEqual(2.5);
			expect(rig.heightM).toBeLessThanOrEqual(4);
			expect(rig.behindM).toBeGreaterThanOrEqual(2.42);
			expect(rig.behindM).toBeLessThanOrEqual(2.5);
		}
	});

	it('opens the camera gently as the street gets wider', () => {
		const narrow = cameraRigForLane(2.55);
		const wide = cameraRigForLane(9.4);
		expect(wide.heightM).toBeGreaterThan(narrow.heightM);
		expect(wide.behindM).toBeGreaterThan(narrow.behindM);
		expect(wide.lookAheadM).toBeGreaterThan(narrow.lookAheadM);
		expect(wide.fovDegrees).toBeLessThan(narrow.fovDegrees);
	});

	it('uses a steadier reduced-motion composition and repairs invalid widths', () => {
		const standard = cameraRigForLane(Number.NaN);
		const reduced = cameraRigForLane(Number.NaN, true);
		expect(standard).toEqual(cameraRigForLane(4));
		expect(reduced.heightM).toBeGreaterThan(standard.heightM);
		expect(reduced.lookAheadM).toBeLessThan(standard.lookAheadM);
		expect(reduced.behindM).toBeGreaterThanOrEqual(2.42);
	});
});

describe('authored lane camera lead', () => {
	it('looks into a connected authored turn before the player reaches its corner', () => {
		const lead = authoredLaneCameraLead(TURN_WORLD, { x: 0, z: 7 }, 0, 8);

		expect(lead.edgeId).toBe('south-lane');
		expect(lead.targetPoint.x).toBeGreaterThan(4.9);
		expect(lead.targetPoint.z).toBeCloseTo(10, 6);
		expect(lead.turnRadians).toBeGreaterThan(0.4);
		expect(lead.yawRadians).toBeCloseTo(lead.turnRadians, 6);
	});

	it('does not invent a turn when the anticipation sample stays on a straight lane', () => {
		const lead = authoredLaneCameraLead(TURN_WORLD, { x: 0, z: 2 }, 0, 4);

		expect(lead.targetPoint).toEqual({ x: 0, z: 6 });
		expect(lead.turnRadians).toBeCloseTo(0, 8);
		expect(lead.yawRadians).toBeCloseTo(0, 8);
	});

	it('keeps authored bend anticipation materially steadier for reduced motion', () => {
		const standard = authoredLaneCameraLead(TURN_WORLD, { x: 0, z: 7 }, 0, 8);
		const reduced = authoredLaneCameraLead(TURN_WORLD, { x: 0, z: 7 }, 0, 8, true);

		expect(Math.abs(reduced.turnRadians)).toBeLessThan(Math.abs(standard.turnRadians));
		expect(Math.abs(reduced.turnRadians)).toBeLessThanOrEqual(0.26);
	});
});

describe('authored lane camera corridor', () => {
	it('preserves an unobstructed 2.45 metre follow position exactly', () => {
		const player = { x: 0, z: 5 };
		const desired = { x: 0, z: 2.55 };
		const placement = constrainCameraToAuthoredLane(TURN_WORLD, player, desired);

		expect(placement.adjusted).toBe(false);
		expect(placement.point).toEqual(desired);
		expect(Math.hypot(placement.point.x - player.x, placement.point.z - player.z)).toBeCloseTo(
			2.45,
			8
		);
	});

	it('pulls an outside camera inside the road edge before it reaches facade space', () => {
		const placement = constrainCameraToAuthoredLane(
			TURN_WORLD,
			{ x: 0, z: 5 },
			{ x: 3, z: 5 },
			0.34
		);

		expect(placement.adjusted).toBe(true);
		expect(placement.edgeId).toBe('south-lane');
		expect(placement.point.x).toBeCloseTo(1.66, 8);
		expect(placement.point.z).toBeCloseTo(5, 8);
		expect(placement.adjustmentM).toBeCloseTo(1.34, 8);
	});

	it('allows the camera to occupy a connected junction corridor without snapping back', () => {
		const desired = { x: 2.4, z: 10 };
		const placement = constrainCameraToAuthoredLane(TURN_WORLD, { x: 0, z: 9.8 }, desired, 0.34);

		expect(placement.adjusted).toBe(false);
		expect(placement.edgeId).toBe('east-lane');
		expect(placement.point).toEqual(desired);
	});
});
