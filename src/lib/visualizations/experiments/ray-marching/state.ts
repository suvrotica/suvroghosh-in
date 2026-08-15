import type { RayMarchingCamera, RayMarchingExperienceState, RayMarchingStageId } from './types';

export const RAY_MARCHING_CAMERA_LIMITS = Object.freeze({
	yaw: Object.freeze({ min: -0.7, max: 0.7 }),
	pitch: Object.freeze({ min: -0.3, max: 0.25 })
});

export const RAY_MARCHING_FOG_RANGE = Object.freeze({ min: 0.2, max: 1 });
export const RAY_MARCHING_PULSE_SPEED_RANGE = Object.freeze({ min: 0.5, max: 1.8 });
export const RAY_MARCHING_FOCAL_LENGTH_RANGE = Object.freeze({ min: 1.1, max: 2.2 });

export const DEFAULT_RAY_MARCHING_FOG = 0.72;
export const DEFAULT_RAY_MARCHING_PULSE_SPEED = 1;
export const DEFAULT_RAY_MARCHING_FOCAL_LENGTH = 1.65;

export const DEFAULT_RAY_MARCHING_CAMERA: RayMarchingCamera = Object.freeze({ yaw: 0, pitch: 0 });

export const DEFAULT_RAY_MARCHING_STATE: RayMarchingExperienceState = Object.freeze({
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

function clamp(value: number, minimum: number, maximum: number, fallback: number): number {
	const finite = Number.isFinite(value) ? value : fallback;
	return Math.min(maximum, Math.max(minimum, finite));
}

export function clampRayMarchingCamera(camera: RayMarchingCamera): RayMarchingCamera {
	return Object.freeze({
		yaw: clamp(
			camera.yaw,
			RAY_MARCHING_CAMERA_LIMITS.yaw.min,
			RAY_MARCHING_CAMERA_LIMITS.yaw.max,
			DEFAULT_RAY_MARCHING_CAMERA.yaw
		),
		pitch: clamp(
			camera.pitch,
			RAY_MARCHING_CAMERA_LIMITS.pitch.min,
			RAY_MARCHING_CAMERA_LIMITS.pitch.max,
			DEFAULT_RAY_MARCHING_CAMERA.pitch
		)
	});
}

export function clampRayMarchingStage(value: number): RayMarchingStageId {
	const finite = Number.isFinite(value) ? Math.round(value) : DEFAULT_RAY_MARCHING_STATE.stage;
	return Math.min(8, Math.max(1, finite)) as RayMarchingStageId;
}

export function createRayMarchingState(
	overrides: Partial<RayMarchingExperienceState> = {}
): RayMarchingExperienceState {
	return Object.freeze({
		...DEFAULT_RAY_MARCHING_STATE,
		...overrides,
		stage: clampRayMarchingStage(overrides.stage ?? DEFAULT_RAY_MARCHING_STATE.stage),
		camera: clampRayMarchingCamera(overrides.camera ?? DEFAULT_RAY_MARCHING_CAMERA),
		fogAmount: clamp(
			overrides.fogAmount ?? DEFAULT_RAY_MARCHING_FOG,
			RAY_MARCHING_FOG_RANGE.min,
			RAY_MARCHING_FOG_RANGE.max,
			DEFAULT_RAY_MARCHING_FOG
		),
		pulseSpeed: clamp(
			overrides.pulseSpeed ?? DEFAULT_RAY_MARCHING_PULSE_SPEED,
			RAY_MARCHING_PULSE_SPEED_RANGE.min,
			RAY_MARCHING_PULSE_SPEED_RANGE.max,
			DEFAULT_RAY_MARCHING_PULSE_SPEED
		),
		focalLength: clamp(
			overrides.focalLength ?? DEFAULT_RAY_MARCHING_FOCAL_LENGTH,
			RAY_MARCHING_FOCAL_LENGTH_RANGE.min,
			RAY_MARCHING_FOCAL_LENGTH_RANGE.max,
			DEFAULT_RAY_MARCHING_FOCAL_LENGTH
		),
		elapsedRevision: Math.max(0, Math.floor(overrides.elapsedRevision ?? 0)),
		pulseRevision: Math.max(0, Math.floor(overrides.pulseRevision ?? 0))
	});
}

/** Keeps every selected scene setting, but returns motion and pulse age to deterministic zero. */
export function restartRayMarchingMotion(
	state: RayMarchingExperienceState
): RayMarchingExperienceState {
	return Object.freeze({
		...state,
		playing: true,
		elapsedRevision: state.elapsedRevision + 1,
		pulseRevision: state.pulseRevision + 1
	});
}

/** Restores the authored Cathedral composition and also invalidates the renderer clock. */
export function resetRayMarchingState(
	state: RayMarchingExperienceState
): RayMarchingExperienceState {
	return Object.freeze({
		...DEFAULT_RAY_MARCHING_STATE,
		camera: DEFAULT_RAY_MARCHING_CAMERA,
		elapsedRevision: state.elapsedRevision + 1,
		pulseRevision: state.pulseRevision + 1
	});
}
