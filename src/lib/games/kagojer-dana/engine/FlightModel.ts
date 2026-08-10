import { Quaternion, Vector3 } from 'three';
import type {
	FlightControlInput,
	FlightSnapshot,
	FlightTelemetry,
	PlaneState,
	WindSampler
} from '../types';

const DEG_TO_RAD = Math.PI / 180;
const LOCAL_RIGHT = new Vector3(1, 0, 0);
const LOCAL_UP = new Vector3(0, 1, 0);
const LOCAL_FORWARD = new Vector3(0, 0, 1);

export interface FlightTuning {
	airDensity: number;
	mass: number;
	wingArea: number;
	gravity: number;
	cl0: number;
	clAlphaPerRadian: number;
	clMax: number;
	stallAngle: number;
	stallSpeed: number;
	recoverySpeed: number;
	cd0: number;
	inducedDragFactor: number;
	stallDrag: number;
	sideForceSlope: number;
	maxPitchRate: number;
	maxRollRate: number;
	pitchLevelRate: number;
	rollLevelRate: number;
	yawStabilityRate: number;
	angularResponse: number;
	trimPitch: number;
}

export const DEFAULT_FLIGHT_TUNING: Readonly<FlightTuning> = Object.freeze({
	airDensity: 1.18,
	mass: 0.075,
	wingArea: 0.045,
	gravity: 9.80665,
	cl0: 0.12,
	clAlphaPerRadian: 0.055 / DEG_TO_RAD,
	clMax: 0.9,
	stallAngle: 14 * DEG_TO_RAD,
	stallSpeed: 5.5,
	recoverySpeed: 6.7,
	cd0: 0.04,
	inducedDragFactor: 0.08,
	stallDrag: 0.34,
	sideForceSlope: 0.72,
	maxPitchRate: 52 * DEG_TO_RAD,
	maxRollRate: 92 * DEG_TO_RAD,
	pitchLevelRate: 1.35,
	rollLevelRate: 1.65,
	yawStabilityRate: 0.85,
	angularResponse: 5.2,
	trimPitch: -2.5 * DEG_TO_RAD
});

export interface InitialPlaneStateOptions {
	position?: Readonly<Vector3>;
	groundVelocity?: Readonly<Vector3>;
	orientation?: Readonly<Quaternion>;
	angularVelocity?: Readonly<Vector3>;
	launchSpeed?: number;
	creaseLevel?: number;
	lastSafeLaunchId?: string;
}

export interface FlightModelOptions {
	state?: PlaneState;
	tuning?: Partial<FlightTuning>;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
	return amount * amount * (3 - 2 * amount);
}

function finiteVector(vector: Readonly<Vector3>): boolean {
	return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function finiteQuaternion(quaternion: Readonly<Quaternion>): boolean {
	return (
		Number.isFinite(quaternion.x) &&
		Number.isFinite(quaternion.y) &&
		Number.isFinite(quaternion.z) &&
		Number.isFinite(quaternion.w)
	);
}

function validateTuning(tuning: FlightTuning): void {
	const positive: (keyof FlightTuning)[] = [
		'airDensity',
		'mass',
		'wingArea',
		'gravity',
		'clAlphaPerRadian',
		'clMax',
		'stallAngle',
		'stallSpeed',
		'recoverySpeed',
		'cd0',
		'inducedDragFactor',
		'stallDrag',
		'sideForceSlope',
		'maxPitchRate',
		'maxRollRate',
		'pitchLevelRate',
		'rollLevelRate',
		'yawStabilityRate',
		'angularResponse'
	];
	for (const key of positive) {
		if (!Number.isFinite(tuning[key]) || tuning[key] <= 0) {
			throw new RangeError(`Flight tuning ${key} must be finite and positive.`);
		}
	}
	if (!Number.isFinite(tuning.cl0) || !Number.isFinite(tuning.trimPitch)) {
		throw new RangeError('Flight lift offset and trim pitch must be finite.');
	}
	if (tuning.recoverySpeed <= tuning.stallSpeed) {
		throw new RangeError('Flight recovery speed must exceed stall speed.');
	}
}

export function createPlaneState(options: InitialPlaneStateOptions = {}): PlaneState {
	const position = options.position
		? new Vector3(options.position.x, options.position.y, options.position.z)
		: new Vector3(0, 60, 0);
	const orientation = options.orientation
		? new Quaternion(
				options.orientation.x,
				options.orientation.y,
				options.orientation.z,
				options.orientation.w
			).normalize()
		: new Quaternion().setFromAxisAngle(LOCAL_RIGHT, 2 * DEG_TO_RAD);

	const launchSpeed = options.launchSpeed ?? 9.5;
	if (!Number.isFinite(launchSpeed) || launchSpeed < 0) {
		throw new RangeError('Plane launch speed must be finite and non-negative.');
	}
	const groundVelocity = options.groundVelocity
		? new Vector3(options.groundVelocity.x, options.groundVelocity.y, options.groundVelocity.z)
		: new Vector3(0, -Math.sin(4 * DEG_TO_RAD), Math.cos(4 * DEG_TO_RAD))
				.applyQuaternion(orientation)
				.multiplyScalar(launchSpeed);
	const angularVelocity = options.angularVelocity
		? new Vector3(options.angularVelocity.x, options.angularVelocity.y, options.angularVelocity.z)
		: new Vector3();

	if (!finiteVector(position) || !finiteVector(groundVelocity) || !finiteVector(angularVelocity)) {
		throw new RangeError('Plane state vectors must contain finite coordinates.');
	}
	if (!finiteQuaternion(orientation) || orientation.lengthSq() < 1e-12) {
		throw new RangeError('Plane orientation must be a finite, non-zero quaternion.');
	}

	return {
		position,
		groundVelocity,
		orientation,
		angularVelocity,
		creaseLevel: clamp(options.creaseLevel ?? 0, 0, 1),
		lastSafeLaunchId: options.lastSafeLaunchId ?? 'north-calcutta-windowsill'
	};
}

export function clonePlaneState(state: PlaneState): PlaneState {
	return {
		position: state.position.clone(),
		groundVelocity: state.groundVelocity.clone(),
		orientation: state.orientation.clone(),
		angularVelocity: state.angularVelocity.clone(),
		creaseLevel: state.creaseLevel,
		lastSafeLaunchId: state.lastSafeLaunchId
	};
}

export function copyPlaneState(target: PlaneState, source: PlaneState): PlaneState {
	target.position.copy(source.position);
	target.groundVelocity.copy(source.groundVelocity);
	target.orientation.copy(source.orientation).normalize();
	target.angularVelocity.copy(source.angularVelocity);
	target.creaseLevel = clamp(source.creaseLevel, 0, 1);
	target.lastSafeLaunchId = source.lastSafeLaunchId;
	return target;
}

export function mechanicalEnergy(state: PlaneState, tuning = DEFAULT_FLIGHT_TUNING): number {
	return (
		0.5 * tuning.mass * state.groundVelocity.lengthSq() +
		tuning.mass * tuning.gravity * state.position.y
	);
}

/** A compact deterministic aerodynamic model; it deliberately contains no propulsion. */
export class FlightModel {
	readonly state: PlaneState;
	readonly previousState: PlaneState;
	readonly tuning: FlightTuning;
	readonly telemetry: FlightTelemetry;

	private elapsedTime = 0;
	private highAngleTime = 0;
	private recoveryTime = 0;
	private stalled = false;
	private stallWingSign = 1;

	private readonly forward = new Vector3();
	private readonly right = new Vector3();
	private readonly up = new Vector3();
	private readonly airVelocity = new Vector3();
	private readonly airDirection = new Vector3();
	private readonly liftDirection = new Vector3();
	private readonly lift = new Vector3();
	private readonly drag = new Vector3();
	private readonly sideForce = new Vector3();
	private readonly acceleration = new Vector3();
	private readonly desiredAngularVelocity = new Vector3();
	private readonly deltaRotation = new Quaternion();
	private readonly rotationAxis = new Vector3();
	private readonly windScratch = new Vector3();

	constructor(options: FlightModelOptions = {}) {
		this.tuning = { ...DEFAULT_FLIGHT_TUNING, ...options.tuning };
		validateTuning(this.tuning);
		this.state = clonePlaneState(options.state ?? createPlaneState());
		this.previousState = clonePlaneState(this.state);
		this.telemetry = {
			simulationTime: 0,
			wind: new Vector3(),
			airVelocity: this.state.groundVelocity.clone(),
			airspeed: this.state.groundVelocity.length(),
			angleOfAttack: 0,
			sideslipAngle: 0,
			liftForce: 0,
			dragForce: 0,
			mechanicalEnergy: mechanicalEnergy(this.state, this.tuning),
			stalled: false,
			controlAuthority: 1
		};
	}

	step(
		input: Readonly<FlightControlInput>,
		wind: Readonly<Vector3>,
		dt: number,
		simulationTime?: number
	): FlightTelemetry {
		if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) {
			throw new RangeError('Flight timestep must be finite, positive, and no greater than 0.1 s.');
		}
		if (!finiteVector(wind)) throw new RangeError('Wind velocity must contain finite coordinates.');
		if (!Number.isFinite(input.pitch) || !Number.isFinite(input.roll)) {
			throw new RangeError('Flight input must contain finite pitch and roll values.');
		}

		copyPlaneState(this.previousState, this.state);
		this.elapsedTime = simulationTime ?? this.elapsedTime + dt;
		this.windScratch.set(wind.x, wind.y, wind.z);

		this.updateBodyAxes();
		this.airVelocity.copy(this.state.groundVelocity).sub(this.windScratch);
		let airspeed = this.airVelocity.length();
		let angleOfAttack = this.measureAngleOfAttack(this.airVelocity);
		let sideslipAngle = this.measureSideslip(this.airVelocity);
		this.updateStallState(airspeed, angleOfAttack, sideslipAngle, dt);

		const controlAuthority =
			smoothstep(this.tuning.stallSpeed * 0.72, this.tuning.recoverySpeed * 1.38, airspeed) *
			(this.stalled ? 0.32 : 1) *
			(1 - this.state.creaseLevel * 0.28);
		this.updateAttitude(input, controlAuthority, sideslipAngle, dt);
		this.updateBodyAxes();

		// Attitude changed during this tick, so aerodynamic angles are measured again.
		angleOfAttack = this.measureAngleOfAttack(this.airVelocity);
		sideslipAngle = this.measureSideslip(this.airVelocity);
		const dynamicPressure = 0.5 * this.tuning.airDensity * airspeed * airspeed;
		const coefficient = this.liftCoefficient(angleOfAttack);
		const stallFraction = smoothstep(
			this.tuning.stallAngle * 0.82,
			this.tuning.stallAngle * 2.15,
			Math.abs(angleOfAttack)
		);
		const dragCoefficient =
			this.tuning.cd0 +
			this.tuning.inducedDragFactor * coefficient * coefficient +
			this.tuning.stallDrag * stallFraction * stallFraction;
		const forceScale = dynamicPressure * this.tuning.wingArea;

		this.lift.set(0, 0, 0);
		this.drag.set(0, 0, 0);
		this.sideForce.set(0, 0, 0);
		if (airspeed > 1e-5) {
			this.airDirection.copy(this.airVelocity).multiplyScalar(1 / airspeed);
			this.liftDirection
				.copy(this.up)
				.addScaledVector(this.airDirection, -this.up.dot(this.airDirection));
			if (this.liftDirection.lengthSq() > 1e-10) {
				this.liftDirection.normalize();
				this.lift
					.copy(this.liftDirection)
					.multiplyScalar(forceScale * coefficient * (1 - this.state.creaseLevel * 0.34));
			}
			this.drag
				.copy(this.airDirection)
				.multiplyScalar(-forceScale * dragCoefficient * (1 + this.state.creaseLevel * 0.72));

			const sideCoefficient = -this.tuning.sideForceSlope * Math.sin(sideslipAngle);
			this.sideForce.copy(this.right).multiplyScalar(forceScale * sideCoefficient);
		}

		this.acceleration
			.copy(this.lift)
			.add(this.drag)
			.add(this.sideForce)
			.multiplyScalar(1 / this.tuning.mass);
		this.acceleration.y -= this.tuning.gravity;
		this.state.groundVelocity.addScaledVector(this.acceleration, dt);
		this.state.position.addScaledVector(this.state.groundVelocity, dt);
		this.state.creaseLevel = clamp(this.state.creaseLevel, 0, 1);

		// Report the post-integration apparent wind while retaining forces from this tick.
		this.airVelocity.copy(this.state.groundVelocity).sub(this.windScratch);
		airspeed = this.airVelocity.length();
		angleOfAttack = this.measureAngleOfAttack(this.airVelocity);
		sideslipAngle = this.measureSideslip(this.airVelocity);
		this.telemetry.simulationTime = this.elapsedTime;
		this.telemetry.wind.copy(this.windScratch);
		this.telemetry.airVelocity.copy(this.airVelocity);
		this.telemetry.airspeed = airspeed;
		this.telemetry.angleOfAttack = angleOfAttack;
		this.telemetry.sideslipAngle = sideslipAngle;
		this.telemetry.liftForce = this.lift.length();
		this.telemetry.dragForce = this.drag.length();
		this.telemetry.mechanicalEnergy = mechanicalEnergy(this.state, this.tuning);
		this.telemetry.stalled = this.stalled;
		this.telemetry.controlAuthority = controlAuthority;
		return this.telemetry;
	}

	stepWithWind(
		input: Readonly<FlightControlInput>,
		wind: WindSampler,
		dt: number,
		simulationTime?: number
	): FlightTelemetry {
		const time = simulationTime ?? this.elapsedTime + dt;
		wind.sample(this.state.position, time, this.windScratch);
		return this.step(input, this.windScratch, dt, time);
	}

	reset(state: PlaneState = createPlaneState()): void {
		copyPlaneState(this.state, state);
		copyPlaneState(this.previousState, state);
		this.elapsedTime = 0;
		this.highAngleTime = 0;
		this.recoveryTime = 0;
		this.stalled = false;
		this.stallWingSign = 1;
		this.telemetry.simulationTime = 0;
		this.telemetry.wind.set(0, 0, 0);
		this.telemetry.airVelocity.copy(state.groundVelocity);
		this.telemetry.airspeed = state.groundVelocity.length();
		this.telemetry.angleOfAttack = 0;
		this.telemetry.sideslipAngle = 0;
		this.telemetry.liftForce = 0;
		this.telemetry.dragForce = 0;
		this.telemetry.mechanicalEnergy = mechanicalEnergy(this.state, this.tuning);
		this.telemetry.stalled = false;
		this.telemetry.controlAuthority = 1;
	}

	getInterpolatedState(alpha: number, target = clonePlaneState(this.state)): PlaneState {
		const amount = clamp(Number.isFinite(alpha) ? alpha : 0, 0, 1);
		target.position.lerpVectors(this.previousState.position, this.state.position, amount);
		target.groundVelocity.lerpVectors(
			this.previousState.groundVelocity,
			this.state.groundVelocity,
			amount
		);
		target.orientation
			.slerpQuaternions(this.previousState.orientation, this.state.orientation, amount)
			.normalize();
		target.angularVelocity.lerpVectors(
			this.previousState.angularVelocity,
			this.state.angularVelocity,
			amount
		);
		target.creaseLevel =
			this.previousState.creaseLevel +
			(this.state.creaseLevel - this.previousState.creaseLevel) * amount;
		target.lastSafeLaunchId = this.state.lastSafeLaunchId;
		return target;
	}

	getSnapshot(alpha: number, targetState?: PlaneState): FlightSnapshot {
		return {
			state: this.getInterpolatedState(alpha, targetState),
			telemetry: this.telemetry
		};
	}

	private updateBodyAxes(): void {
		this.forward.copy(LOCAL_FORWARD).applyQuaternion(this.state.orientation).normalize();
		this.right.copy(LOCAL_RIGHT).applyQuaternion(this.state.orientation).normalize();
		this.up.copy(LOCAL_UP).applyQuaternion(this.state.orientation).normalize();
	}

	private measureAngleOfAttack(airVelocity: Readonly<Vector3>): number {
		const forwardSpeed = this.forward.dot(airVelocity);
		const normalSpeed = this.up.dot(airVelocity);
		return Math.atan2(-normalSpeed, forwardSpeed);
	}

	private measureSideslip(airVelocity: Readonly<Vector3>): number {
		return Math.atan2(this.right.dot(airVelocity), this.forward.dot(airVelocity));
	}

	private updateStallState(
		airspeed: number,
		angleOfAttack: number,
		sideslipAngle: number,
		dt: number
	): void {
		if (Math.abs(angleOfAttack) > this.tuning.stallAngle) {
			this.highAngleTime += dt;
		} else {
			this.highAngleTime = Math.max(0, this.highAngleTime - dt * 1.8);
		}

		if (!this.stalled && (airspeed < this.tuning.stallSpeed || this.highAngleTime >= 0.2)) {
			this.stalled = true;
			this.recoveryTime = 0;
			if (Math.abs(sideslipAngle) > 0.025) {
				this.stallWingSign = sideslipAngle > 0 ? 1 : -1;
			} else {
				const phase =
					this.state.position.x * 0.071 + this.state.position.z * 0.037 + this.elapsedTime * 0.53;
				this.stallWingSign = Math.sin(phase) >= 0 ? 1 : -1;
			}
		}

		if (this.stalled) {
			if (
				airspeed > this.tuning.recoverySpeed &&
				Math.abs(angleOfAttack) < this.tuning.stallAngle * 0.72
			) {
				this.recoveryTime += dt;
				if (this.recoveryTime >= 0.16) {
					this.stalled = false;
					this.highAngleTime = 0;
					this.recoveryTime = 0;
				}
			} else {
				this.recoveryTime = Math.max(0, this.recoveryTime - dt);
			}
		}
	}

	private updateAttitude(
		input: Readonly<FlightControlInput>,
		controlAuthority: number,
		sideslipAngle: number,
		dt: number
	): void {
		const pitchInput = clamp(input.pitch, -1, 1);
		const rollInput = clamp(input.roll, -1, 1);
		const pitchAngle = Math.asin(clamp(this.forward.y, -1, 1));
		const rollAngle = Math.atan2(-this.right.y, this.up.y);

		let localPitchRate =
			-pitchInput * this.tuning.maxPitchRate * controlAuthority +
			(pitchAngle - this.tuning.trimPitch) * this.tuning.pitchLevelRate;
		let localRollRate =
			-rollInput * this.tuning.maxRollRate * controlAuthority +
			rollAngle * this.tuning.rollLevelRate;
		if (this.stalled) {
			// A paper plane nods and drops one wing; the moments remain mild and self-recovering.
			localPitchRate += 31 * DEG_TO_RAD;
			localRollRate += this.stallWingSign * 25 * DEG_TO_RAD;
		}
		const localYawRate = sideslipAngle * this.tuning.yawStabilityRate;

		this.desiredAngularVelocity
			.copy(this.right)
			.multiplyScalar(localPitchRate)
			.addScaledVector(this.up, localYawRate)
			.addScaledVector(this.forward, localRollRate);
		const response = 1 - Math.exp(-this.tuning.angularResponse * dt);
		this.state.angularVelocity.lerp(this.desiredAngularVelocity, response);

		const angularSpeed = this.state.angularVelocity.length();
		if (angularSpeed > 1e-8) {
			this.rotationAxis.copy(this.state.angularVelocity).multiplyScalar(1 / angularSpeed);
			this.deltaRotation.setFromAxisAngle(this.rotationAxis, angularSpeed * dt);
			this.state.orientation.premultiply(this.deltaRotation).normalize();
		}
	}

	private liftCoefficient(angleOfAttack: number): number {
		const linear = clamp(
			this.tuning.cl0 + this.tuning.clAlphaPerRadian * angleOfAttack,
			-this.tuning.clMax * 0.62,
			this.tuning.clMax
		);
		const excess = smoothstep(
			this.tuning.stallAngle,
			this.tuning.stallAngle * 2.5,
			Math.abs(angleOfAttack)
		);
		const separatedFlow = 1 - excess * 0.7;
		return linear * separatedFlow * (this.stalled ? 0.66 : 1);
	}
}
