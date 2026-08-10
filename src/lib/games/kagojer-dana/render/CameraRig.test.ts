import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraEnvelopeForFlight, PaperPlaneCameraRig } from './CameraRig';

const LEVEL_FRAME = {
	position: { x: 0, y: 35, z: 0 },
	groundVelocity: { x: 0, y: -0.8, z: 9 },
	orientation: { x: 0, y: 0, z: 0, w: 1 },
	airspeed: 9,
	altitudeM: 35,
	rollRadians: 0,
	elapsedSeconds: 0
};

describe('paper-plane camera envelope', () => {
	it('uses the authored speed envelope and opens out gradually at height', () => {
		const slow = cameraEnvelopeForFlight(6, 20);
		const fast = cameraEnvelopeForFlight(18, 20);
		const skyline = cameraEnvelopeForFlight(18, 360);
		expect(slow.distanceM).toBeCloseTo(5.5, 1);
		expect(fast.distanceM).toBeCloseTo(9.5, 1);
		expect(fast.fovDegrees).toBeGreaterThan(slow.fovDegrees);
		expect(skyline.distanceM).toBeGreaterThan(fast.distanceM);
	});

	it('moves closer and higher near architecture', () => {
		const open = cameraEnvelopeForFlight(10, 35, 30);
		const close = cameraEnvelopeForFlight(10, 35, 1.5);
		expect(close.distanceM).toBeLessThan(open.distanceM);
		expect(close.heightM).toBeGreaterThan(open.heightM);
	});

	it('removes FOV pumping in Calm Camera', () => {
		expect(cameraEnvelopeForFlight(5, 30, 30, true).fovDegrees).toBe(62);
		expect(cameraEnvelopeForFlight(24, 30, 30, true).fovDegrees).toBe(62);
	});

	it('limits camera roll below twenty-two degrees and cancels scenic drift on input', () => {
		const camera = new THREE.PerspectiveCamera();
		const rig = new PaperPlaneCameraRig(camera);
		for (let index = 0; index < 40; index += 1) {
			rig.update(
				{
					...LEVEL_FRAME,
					rollRadians: Math.PI,
					elapsedSeconds: index / 60,
					allowScenicDrift: true
				},
				1 / 60
			);
		}
		expect(Math.abs(rig.getDebugState().cameraRollRadians)).toBeLessThanOrEqual(
			THREE.MathUtils.degToRad(22)
		);
		rig.update(
			{ ...LEVEL_FRAME, elapsedSeconds: 12, allowScenicDrift: true, hasPlayerInput: true },
			1 / 60
		);
		expect(rig.getDebugState().scenicDriftRadians).toBe(0);
	});
});
