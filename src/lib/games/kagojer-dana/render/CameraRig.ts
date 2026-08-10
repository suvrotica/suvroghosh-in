import * as THREE from 'three';

export interface Vector3Like {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

export interface QuaternionLike {
	readonly x: number;
	readonly y: number;
	readonly z: number;
	readonly w: number;
}

export interface FlightCameraFrame {
	readonly position: Vector3Like;
	readonly groundVelocity: Vector3Like;
	readonly orientation: QuaternionLike;
	readonly airspeed: number;
	readonly altitudeM?: number;
	readonly rollRadians?: number;
	readonly obstacleDistanceM?: number;
	readonly gustStrength?: number;
	readonly elapsedSeconds?: number;
	readonly hasPlayerInput?: boolean;
	readonly allowScenicDrift?: boolean;
	readonly dangerousPassage?: boolean;
}

export interface FlightCameraEnvelope {
	readonly distanceM: number;
	readonly heightM: number;
	readonly fovDegrees: number;
	readonly obstacleProximity: number;
	readonly altitudeReveal: number;
}

export interface PaperPlaneCameraOptions {
	readonly calmCamera?: boolean;
	readonly dampingSeconds?: number;
	readonly collisionObjects?: readonly THREE.Object3D[];
}

export interface CameraRigDebugState {
	readonly boomLengthM: number;
	readonly desiredDistanceM: number;
	readonly cameraRollRadians: number;
	readonly scenicDriftRadians: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const LOCAL_ROLL_AXIS = new THREE.Vector3(0, 0, 1);
const MAX_CAMERA_ROLL = THREE.MathUtils.degToRad(22);
const MAX_SCENIC_DRIFT = THREE.MathUtils.degToRad(18);

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number | undefined, fallback = 0): number {
	return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
	return t * t * (3 - 2 * t);
}

function lerp(start: number, end: number, amount: number): number {
	return start + (end - start) * amount;
}

function dampingAlpha(deltaSeconds: number, timeConstant: number): number {
	return 1 - Math.exp(-Math.max(0, deltaSeconds) / Math.max(0.001, timeConstant));
}

export function cameraEnvelopeForFlight(
	airspeed: number,
	altitudeM: number,
	obstacleDistanceM = Number.POSITIVE_INFINITY,
	calmCamera = false
): FlightCameraEnvelope {
	const speed = Math.max(0, finite(airspeed));
	const altitude = Math.max(0, finite(altitudeM));
	const obstacleProximity = 1 - smoothstep(1.5, 12, obstacleDistanceM);
	const altitudeReveal = smoothstep(55, 330, altitude);
	const baseDistance = lerp(5.5, 9.5, smoothstep(6, 18, speed));
	return {
		distanceM: clamp(baseDistance + altitudeReveal * 2.7 - obstacleProximity * 2.35, 3.4, 12.2),
		heightM: 1.35 + altitudeReveal * 1.25 + obstacleProximity * 1.2,
		fovDegrees: calmCamera ? 62 : lerp(58, 70, smoothstep(7, 21, speed)),
		obstacleProximity,
		altitudeReveal
	};
}

/**
 * Third-person camera driven primarily by ground-track direction. It damps
 * position and rotation over 0.12–0.20 s, limits roll, and raycasts its boom.
 */
export class PaperPlaneCameraRig {
	readonly camera: THREE.PerspectiveCamera;
	private readonly currentHeading = new THREE.Vector3(0, 0, 1);
	private readonly desiredHeading = new THREE.Vector3(0, 0, 1);
	private readonly planePosition = new THREE.Vector3();
	private readonly desiredPosition = new THREE.Vector3();
	private readonly boomOrigin = new THREE.Vector3();
	private readonly boomDirection = new THREE.Vector3();
	private readonly lookTarget = new THREE.Vector3();
	private readonly orientation = new THREE.Quaternion();
	private readonly desiredQuaternion = new THREE.Quaternion();
	private readonly rollQuaternion = new THREE.Quaternion();
	private readonly lookMatrix = new THREE.Matrix4();
	private readonly raycaster = new THREE.Raycaster();
	private readonly intersections: THREE.Intersection<THREE.Object3D>[] = [];
	private collisionObjects: THREE.Object3D[];
	private calmCamera: boolean;
	private dampingSeconds: number;
	private boomLengthM = 7;
	private desiredDistanceM = 7;
	private currentRollRadians = 0;
	private scenicDriftRadians = 0;
	private initialized = false;

	constructor(camera?: THREE.PerspectiveCamera, options: PaperPlaneCameraOptions = {}) {
		this.camera = camera ?? new THREE.PerspectiveCamera(62, 1, 0.08, 900);
		this.calmCamera = options.calmCamera ?? false;
		this.dampingSeconds = clamp(options.dampingSeconds ?? 0.16, 0.12, 0.2);
		this.collisionObjects = [...(options.collisionObjects ?? [])];
	}

	setCalmCamera(calm: boolean): void {
		this.calmCamera = calm;
	}

	setDampingSeconds(seconds: number): void {
		this.dampingSeconds = clamp(finite(seconds, 0.16), 0.12, 0.2);
	}

	setCollisionObjects(objects: readonly THREE.Object3D[]): void {
		this.collisionObjects = [...objects];
	}

	resize(width: number, height: number): void {
		this.camera.aspect = Math.max(1, width) / Math.max(1, height);
		this.camera.updateProjectionMatrix();
	}

	reset(frame: FlightCameraFrame): void {
		this.initialized = false;
		this.currentHeading.set(0, 0, 1);
		this.boomLengthM = cameraEnvelopeForFlight(
			frame.airspeed,
			frame.altitudeM ?? frame.position.y,
			frame.obstacleDistanceM,
			this.calmCamera
		).distanceM;
		this.update(frame, 1);
	}

	update(frame: FlightCameraFrame, deltaSeconds: number): void {
		const dt = clamp(finite(deltaSeconds), 0, 0.1);
		this.planePosition.set(
			finite(frame.position.x),
			finite(frame.position.y),
			finite(frame.position.z)
		);
		this.orientation.set(
			finite(frame.orientation.x),
			finite(frame.orientation.y),
			finite(frame.orientation.z),
			finite(frame.orientation.w, 1)
		);
		if (this.orientation.lengthSq() < 0.5) this.orientation.identity();
		else this.orientation.normalize();

		this.desiredHeading.set(finite(frame.groundVelocity.x), 0, finite(frame.groundVelocity.z));
		if (this.desiredHeading.lengthSq() < 0.25) {
			this.desiredHeading.copy(LOCAL_FORWARD).applyQuaternion(this.orientation);
			this.desiredHeading.y = 0;
		}
		if (this.desiredHeading.lengthSq() < 0.0001) this.desiredHeading.set(0, 0, 1);
		else this.desiredHeading.normalize();
		const headingAlpha = dampingAlpha(dt, 0.18);
		this.currentHeading.lerp(this.desiredHeading, headingAlpha).normalize();

		const altitude = frame.altitudeM ?? frame.position.y;
		const envelope = cameraEnvelopeForFlight(
			frame.airspeed,
			altitude,
			frame.obstacleDistanceM,
			this.calmCamera
		);
		this.desiredDistanceM = envelope.distanceM;

		const scenicAllowed =
			frame.allowScenicDrift === true &&
			frame.hasPlayerInput !== true &&
			frame.dangerousPassage !== true &&
			envelope.obstacleProximity < 0.12;
		if (frame.hasPlayerInput === true || !scenicAllowed) {
			this.scenicDriftRadians = 0;
		} else {
			const time = Math.max(0, finite(frame.elapsedSeconds));
			this.scenicDriftRadians = Math.sin(time * 0.11) * MAX_SCENIC_DRIFT;
		}

		this.lookTarget
			.copy(this.planePosition)
			.addScaledVector(this.currentHeading, 2.1 + envelope.altitudeReveal * 1.6);
		this.lookTarget.y += 0.18 + envelope.altitudeReveal * 0.32;
		this.boomOrigin.copy(this.planePosition);
		this.boomOrigin.y += 0.28;

		this.boomDirection.copy(this.currentHeading).multiplyScalar(-1);
		if (this.scenicDriftRadians !== 0)
			this.boomDirection.applyAxisAngle(UP, this.scenicDriftRadians);
		this.desiredPosition
			.copy(this.boomOrigin)
			.addScaledVector(this.boomDirection, envelope.distanceM);
		this.desiredPosition.y += envelope.heightM;

		this.boomDirection.subVectors(this.desiredPosition, this.boomOrigin);
		const fullBoomLength = this.boomDirection.length();
		this.boomDirection.multiplyScalar(1 / Math.max(0.0001, fullBoomLength));
		let unobstructedLength = fullBoomLength;
		if (this.collisionObjects.length > 0) {
			this.raycaster.set(this.boomOrigin, this.boomDirection);
			this.raycaster.near = 0.2;
			this.raycaster.far = fullBoomLength;
			this.intersections.length = 0;
			this.raycaster.intersectObjects(this.collisionObjects, true, this.intersections);
			const hit = this.intersections[0];
			if (hit) unobstructedLength = Math.max(0.85, hit.distance - 0.32);
		}
		const boomTime = unobstructedLength < this.boomLengthM ? 0.065 : 0.19;
		this.boomLengthM = lerp(
			this.boomLengthM,
			Math.min(fullBoomLength, unobstructedLength),
			dampingAlpha(dt, boomTime)
		);
		this.desiredPosition
			.copy(this.boomOrigin)
			.addScaledVector(this.boomDirection, this.boomLengthM);

		const gust = clamp(Math.abs(finite(frame.gustStrength)), 0, 1);
		if (!this.calmCamera && gust > 0.72) {
			const time = Math.max(0, finite(frame.elapsedSeconds));
			const tremor = (gust - 0.72) * 0.045;
			this.desiredPosition.x += Math.sin(time * 37.3) * tremor;
			this.desiredPosition.y += Math.sin(time * 31.7 + 1.2) * tremor * 0.55;
		}

		const requestedRoll = finite(frame.rollRadians) * 0.35;
		const targetRoll = clamp(requestedRoll, -MAX_CAMERA_ROLL, MAX_CAMERA_ROLL);
		this.currentRollRadians = lerp(
			this.currentRollRadians,
			this.calmCamera ? targetRoll * 0.38 : targetRoll,
			dampingAlpha(dt, this.dampingSeconds)
		);
		this.lookMatrix.lookAt(this.desiredPosition, this.lookTarget, UP);
		this.desiredQuaternion.setFromRotationMatrix(this.lookMatrix);
		this.rollQuaternion.setFromAxisAngle(LOCAL_ROLL_AXIS, this.currentRollRadians);
		this.desiredQuaternion.multiply(this.rollQuaternion);

		if (!this.initialized) {
			this.camera.position.copy(this.desiredPosition);
			this.camera.quaternion.copy(this.desiredQuaternion);
			this.camera.fov = envelope.fovDegrees;
			this.initialized = true;
		} else {
			const alpha = dampingAlpha(dt, this.dampingSeconds);
			this.camera.position.lerp(this.desiredPosition, alpha);
			this.camera.quaternion.slerp(this.desiredQuaternion, alpha);
			this.camera.fov = lerp(this.camera.fov, envelope.fovDegrees, alpha);
		}
		this.camera.updateProjectionMatrix();
	}

	getDebugState(): CameraRigDebugState {
		return {
			boomLengthM: this.boomLengthM,
			desiredDistanceM: this.desiredDistanceM,
			cameraRollRadians: this.currentRollRadians,
			scenicDriftRadians: this.scenicDriftRadians
		};
	}
}
