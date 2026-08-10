import type { Quaternion, Vector3 } from 'three';

/**
 * Flight-space convention
 * -----------------------
 * Distances are metres, durations are seconds, and +Y is world-up. The paper-plane
 * model uses +Z as its nose/forward axis, +X toward its right wing, and +Y through
 * the top face. `orientation` rotates those local axes into world space.
 */
export interface PlaneState {
	position: Vector3;
	groundVelocity: Vector3;
	orientation: Quaternion;
	/** World-space angular velocity, in radians per second. */
	angularVelocity: Vector3;
	/** Accumulated paper damage, normalized to the inclusive range 0..1. */
	creaseLevel: number;
	lastSafeLaunchId: string;
}

/** Normalized pilot intent. Values outside -1..1 are clamped by the flight model. */
export interface FlightControlInput {
	/** Positive raises the nose; negative lowers it. */
	pitch: number;
	/** Positive banks right; negative banks left. */
	roll: number;
}

/**
 * Values measured during the most recent physics tick. Vector instances are reused
 * by `FlightModel`; clone them before retaining a historical telemetry sample.
 */
export interface FlightTelemetry {
	simulationTime: number;
	wind: Vector3;
	/** Plane velocity relative to the surrounding air: groundVelocity - wind. */
	airVelocity: Vector3;
	airspeed: number;
	/** Radians; positive when the nose is above the relative flight path. */
	angleOfAttack: number;
	/** Radians; positive for relative air velocity toward the right wing. */
	sideslipAngle: number;
	liftForce: number;
	dragForce: number;
	/** Translational kinetic plus gravitational potential energy, in joules. */
	mechanicalEnergy: number;
	stalled: boolean;
	/** Normalized aerodynamic control effectiveness. */
	controlAuthority: number;
}

export interface FlightSnapshot {
	state: PlaneState;
	telemetry: FlightTelemetry;
}

/** A deterministic wind source. Supplying `target` avoids a Vector3 allocation. */
export interface WindSampler {
	sample(position: Readonly<Vector3>, simulationTime: number, target?: Vector3): Vector3;
}

export const NO_FLIGHT_INPUT: Readonly<FlightControlInput> = Object.freeze({
	pitch: 0,
	roll: 0
});
