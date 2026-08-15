import { describe, expect, it } from 'vitest';
import {
	DEFAULT_RAY_MARCHING_CAMERA,
	DEFAULT_RAY_MARCHING_FOCAL_LENGTH,
	DEFAULT_RAY_MARCHING_FOG,
	DEFAULT_RAY_MARCHING_PULSE_SPEED,
	DEFAULT_RAY_MARCHING_STATE,
	RAY_MARCHING_CAMERA_LIMITS,
	createRayMarchingState,
	restartRayMarchingMotion,
	resetRayMarchingState
} from './state';

describe('ray-marching experience state semantics', () => {
	it('opens on the finished Cathedral in Explore mode with a centred bounded camera', () => {
		expect(DEFAULT_RAY_MARCHING_STATE).toEqual({
			stage: 8,
			mode: 'explore',
			camera: DEFAULT_RAY_MARCHING_CAMERA,
			palette: 'cathedral',
			quality: 'auto',
			debugView: 'beauty',
			fogAmount: DEFAULT_RAY_MARCHING_FOG,
			pulseSpeed: DEFAULT_RAY_MARCHING_PULSE_SPEED,
			focalLength: DEFAULT_RAY_MARCHING_FOCAL_LENGTH,
			playing: true,
			elapsedRevision: 0,
			pulseRevision: 0
		});
		expect(DEFAULT_RAY_MARCHING_CAMERA).toEqual({ yaw: 0, pitch: 0 });
	});

	it('clamps external stage, camera, and curated range values', () => {
		const state = createRayMarchingState({
			stage: 99 as 8,
			camera: { yaw: 99, pitch: -99 },
			fogAmount: Number.POSITIVE_INFINITY,
			pulseSpeed: -1,
			focalLength: 99,
			elapsedRevision: -4,
			pulseRevision: -2
		});
		expect(state.stage).toBe(8);
		expect(state.camera).toEqual({
			yaw: RAY_MARCHING_CAMERA_LIMITS.yaw.max,
			pitch: RAY_MARCHING_CAMERA_LIMITS.pitch.min
		});
		expect(state.fogAmount).toBe(DEFAULT_RAY_MARCHING_FOG);
		expect(state.pulseSpeed).toBe(0.5);
		expect(state.focalLength).toBe(2.2);
		expect(state.elapsedRevision).toBe(0);
		expect(state.pulseRevision).toBe(0);
	});

	it('Restart Motion retains selected scene settings but restarts elapsed and pulse motion', () => {
		const selected = createRayMarchingState({
			stage: 5,
			mode: 'build',
			camera: { yaw: 0.35, pitch: -0.15 },
			palette: 'amber-archive',
			quality: 'high',
			debugView: 'normals',
			fogAmount: 0.4,
			pulseSpeed: 1.6,
			focalLength: 1.2,
			playing: false,
			elapsedRevision: 7,
			pulseRevision: 3
		});
		const restarted = restartRayMarchingMotion(selected);
		expect(restarted).toEqual({
			...selected,
			playing: true,
			elapsedRevision: 8,
			pulseRevision: 4
		});
	});

	it('Reset All restores every authored default while still invalidating elapsed state', () => {
		const selected = createRayMarchingState({
			stage: 2,
			mode: 'build',
			camera: { yaw: 0.6, pitch: 0.2 },
			palette: 'blue-hour',
			quality: 'saver',
			debugView: 'distance-bands',
			fogAmount: 0.3,
			pulseSpeed: 1.7,
			focalLength: 2,
			playing: false,
			elapsedRevision: 11,
			pulseRevision: 5
		});
		const reset = resetRayMarchingState(selected);
		expect(reset).toEqual({
			...DEFAULT_RAY_MARCHING_STATE,
			elapsedRevision: 12,
			pulseRevision: 6
		});
		expect(reset.camera).toEqual({ yaw: 0, pitch: 0 });
	});
});
