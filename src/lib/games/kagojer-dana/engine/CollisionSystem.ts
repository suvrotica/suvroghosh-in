/**
 * Narrow-phase collision for the paper plane. The module deliberately uses structural vector
 * types rather than Three.js classes so the deterministic simulation can also run in Node tests.
 * Plane-local +Z is forward; callers may replace the default probe layout for a different mesh.
 */

export interface CollisionVector3 {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

export interface CollisionQuaternion {
	readonly x: number;
	readonly y: number;
	readonly z: number;
	readonly w: number;
}

export type PlaneCollisionProbeId = 'nose' | 'left-wingtip' | 'right-wingtip';

export interface PlaneCollisionProbe {
	readonly id: PlaneCollisionProbeId;
	readonly localCenter: CollisionVector3;
	readonly radiusM: number;
}

export interface PlaneCollisionPose {
	readonly position: CollisionVector3;
	readonly orientation: CollisionQuaternion;
}

interface CollisionColliderBase {
	readonly id: string;
	readonly category: string;
	readonly enabled?: boolean;
	readonly metadata?: unknown;
}

export interface SphereCollisionCollider extends CollisionColliderBase {
	readonly shape: 'sphere';
	readonly center: CollisionVector3;
	readonly radiusM: number;
}

/** A capsule is the collision representation for wires, cables, branches, rails and masts. */
export interface CapsuleCollisionCollider extends CollisionColliderBase {
	readonly shape: 'capsule';
	readonly start: CollisionVector3;
	readonly end: CollisionVector3;
	readonly radiusM: number;
}

export interface AabbCollisionCollider extends CollisionColliderBase {
	readonly shape: 'aabb';
	readonly min: CollisionVector3;
	readonly max: CollisionVector3;
}

export type CollisionCollider =
	| SphereCollisionCollider
	| CapsuleCollisionCollider
	| AabbCollisionCollider;

export interface SweptCollisionHit {
	readonly colliderId: string;
	readonly colliderCategory: string;
	readonly probeId: PlaneCollisionProbeId;
	/** Normalised time within the physics step. Zero means the probe began in contact. */
	readonly timeFraction: number;
	/** Centre of the swept probe at impact. */
	readonly probeCenter: CollisionVector3;
	/** Approximate point on the obstacle surface. */
	readonly contactPoint: CollisionVector3;
	/** Unit normal pointing from the obstacle toward the probe. */
	readonly normal: CollisionVector3;
	readonly metadata?: unknown;
}

export interface CollisionSystemOptions {
	readonly probes?: readonly PlaneCollisionProbe[];
	/** Small deterministic tolerance for co-planar and almost-touching motion. */
	readonly skinM?: number;
}

interface SweepCandidate {
	readonly timeFraction: number;
	readonly center: CollisionVector3;
	readonly contactPoint: CollisionVector3;
	readonly normal: CollisionVector3;
}

interface SegmentClosestPoints {
	readonly movingFraction: number;
	readonly staticFraction: number;
	readonly movingPoint: CollisionVector3;
	readonly staticPoint: CollisionVector3;
	readonly distanceSquared: number;
}

const EPSILON = 1e-10;

export const DEFAULT_PLANE_COLLISION_PROBES = Object.freeze([
	Object.freeze({
		id: 'nose',
		localCenter: Object.freeze({ x: 0, y: 0, z: 0.43 }),
		radiusM: 0.035
	}),
	Object.freeze({
		id: 'left-wingtip',
		localCenter: Object.freeze({ x: -0.46, y: 0, z: -0.08 }),
		radiusM: 0.03
	}),
	Object.freeze({
		id: 'right-wingtip',
		localCenter: Object.freeze({ x: 0.46, y: 0, z: -0.08 }),
		radiusM: 0.03
	})
] as const satisfies readonly PlaneCollisionProbe[]);

function finite(value: number, fallback = 0): number {
	return Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function add(left: CollisionVector3, right: CollisionVector3): CollisionVector3 {
	return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: CollisionVector3, right: CollisionVector3): CollisionVector3 {
	return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(vector: CollisionVector3, scalar: number): CollisionVector3 {
	return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function dot(left: CollisionVector3, right: CollisionVector3): number {
	return left.x * right.x + left.y * right.y + left.z * right.z;
}

function lengthSquared(vector: CollisionVector3): number {
	return dot(vector, vector);
}

function interpolate(
	start: CollisionVector3,
	end: CollisionVector3,
	fraction: number
): CollisionVector3 {
	return {
		x: start.x + (end.x - start.x) * fraction,
		y: start.y + (end.y - start.y) * fraction,
		z: start.z + (end.z - start.z) * fraction
	};
}

function normalise(vector: CollisionVector3, fallback: CollisionVector3): CollisionVector3 {
	const squared = lengthSquared(vector);
	if (squared <= EPSILON) return fallback;
	return scale(vector, 1 / Math.sqrt(squared));
}

function sanitisedRadius(value: number): number {
	return Math.max(0, finite(value));
}

/** Rotates a vector by a quaternion. Normalisation is folded in for tolerant external input. */
export function rotateCollisionVector(
	vector: CollisionVector3,
	quaternion: CollisionQuaternion
): CollisionVector3 {
	const qLengthSquared =
		quaternion.x * quaternion.x +
		quaternion.y * quaternion.y +
		quaternion.z * quaternion.z +
		quaternion.w * quaternion.w;
	if (qLengthSquared <= EPSILON) return { ...vector };
	const inverseLength = 1 / Math.sqrt(qLengthSquared);
	const qx = quaternion.x * inverseLength;
	const qy = quaternion.y * inverseLength;
	const qz = quaternion.z * inverseLength;
	const qw = quaternion.w * inverseLength;
	const tx = 2 * (qy * vector.z - qz * vector.y);
	const ty = 2 * (qz * vector.x - qx * vector.z);
	const tz = 2 * (qx * vector.y - qy * vector.x);
	return {
		x: vector.x + qw * tx + (qy * tz - qz * ty),
		y: vector.y + qw * ty + (qz * tx - qx * tz),
		z: vector.z + qw * tz + (qx * ty - qy * tx)
	};
}

export function planeProbeWorldCenter(
	pose: PlaneCollisionPose,
	probe: PlaneCollisionProbe
): CollisionVector3 {
	return add(pose.position, rotateCollisionVector(probe.localCenter, pose.orientation));
}

function closestPointOnSegment(
	point: CollisionVector3,
	start: CollisionVector3,
	end: CollisionVector3
): { point: CollisionVector3; fraction: number; distanceSquared: number } {
	const axis = subtract(end, start);
	const denominator = lengthSquared(axis);
	const fraction =
		denominator <= EPSILON ? 0 : clamp01(dot(subtract(point, start), axis) / denominator);
	const closest = interpolate(start, end, fraction);
	return {
		point: closest,
		fraction,
		distanceSquared: lengthSquared(subtract(point, closest))
	};
}

/** Closest points between two finite 3D segments (Ericson's clamped formulation). */
function closestPointsBetweenSegments(
	movingStart: CollisionVector3,
	movingEnd: CollisionVector3,
	staticStart: CollisionVector3,
	staticEnd: CollisionVector3
): SegmentClosestPoints {
	const d1 = subtract(movingEnd, movingStart);
	const d2 = subtract(staticEnd, staticStart);
	const r = subtract(movingStart, staticStart);
	const a = dot(d1, d1);
	const e = dot(d2, d2);
	const f = dot(d2, r);
	let movingFraction = 0;
	let staticFraction = 0;

	if (a <= EPSILON && e <= EPSILON) {
		return {
			movingFraction,
			staticFraction,
			movingPoint: { ...movingStart },
			staticPoint: { ...staticStart },
			distanceSquared: lengthSquared(r)
		};
	}

	if (a <= EPSILON) {
		staticFraction = clamp01(f / e);
	} else {
		const c = dot(d1, r);
		if (e <= EPSILON) {
			movingFraction = clamp01(-c / a);
		} else {
			const b = dot(d1, d2);
			const denominator = a * e - b * b;
			movingFraction = Math.abs(denominator) > EPSILON ? clamp01((b * f - c * e) / denominator) : 0;
			staticFraction = (b * movingFraction + f) / e;
			if (staticFraction < 0) {
				staticFraction = 0;
				movingFraction = clamp01(-c / a);
			} else if (staticFraction > 1) {
				staticFraction = 1;
				movingFraction = clamp01((b - c) / a);
			}
		}
	}

	const movingPoint = interpolate(movingStart, movingEnd, movingFraction);
	const staticPoint = interpolate(staticStart, staticEnd, staticFraction);
	return {
		movingFraction,
		staticFraction,
		movingPoint,
		staticPoint,
		distanceSquared: lengthSquared(subtract(movingPoint, staticPoint))
	};
}

function fallbackNormal(motion: CollisionVector3): CollisionVector3 {
	return normalise(scale(motion, -1), { x: 0, y: 1, z: 0 });
}

function sweepSphereAgainstSphere(
	start: CollisionVector3,
	end: CollisionVector3,
	probeRadiusM: number,
	collider: SphereCollisionCollider,
	skinM: number
): SweepCandidate | null {
	const motion = subtract(end, start);
	const offset = subtract(start, collider.center);
	const colliderRadius = sanitisedRadius(collider.radiusM);
	const combinedRadius = probeRadiusM + colliderRadius + skinM;
	const c = dot(offset, offset) - combinedRadius * combinedRadius;
	let timeFraction = 0;
	if (c > 0) {
		const a = dot(motion, motion);
		if (a <= EPSILON) return null;
		const b = dot(offset, motion);
		if (b >= 0) return null;
		const discriminant = b * b - a * c;
		if (discriminant < 0) return null;
		timeFraction = (-b - Math.sqrt(Math.max(0, discriminant))) / a;
		if (timeFraction < -EPSILON || timeFraction > 1 + EPSILON) return null;
		timeFraction = clamp01(timeFraction);
	}
	const center = interpolate(start, end, timeFraction);
	const normal = normalise(subtract(center, collider.center), fallbackNormal(motion));
	return {
		timeFraction,
		center,
		contactPoint: add(collider.center, scale(normal, colliderRadius)),
		normal
	};
}

function sweepSphereAgainstCapsule(
	start: CollisionVector3,
	end: CollisionVector3,
	probeRadiusM: number,
	collider: CapsuleCollisionCollider,
	skinM: number
): SweepCandidate | null {
	const motion = subtract(end, start);
	const colliderRadius = sanitisedRadius(collider.radiusM);
	const combinedRadius = probeRadiusM + colliderRadius + skinM;
	const combinedSquared = combinedRadius * combinedRadius;
	const initial = closestPointOnSegment(start, collider.start, collider.end);
	let timeFraction = 0;

	if (initial.distanceSquared > combinedSquared) {
		const closest = closestPointsBetweenSegments(start, end, collider.start, collider.end);
		if (closest.distanceSquared > combinedSquared + EPSILON) return null;

		// Distance to a convex segment is convex along the sweep. Bisect the first threshold crossing
		// between the known-outside start and the closest point; thin wires cannot be stepped over.
		let outside = 0;
		let inside = closest.movingFraction;
		for (let iteration = 0; iteration < 32; iteration += 1) {
			const middle = (outside + inside) * 0.5;
			const point = interpolate(start, end, middle);
			const distance = closestPointOnSegment(point, collider.start, collider.end).distanceSquared;
			if (distance <= combinedSquared) inside = middle;
			else outside = middle;
		}
		timeFraction = inside;
	}

	const center = interpolate(start, end, timeFraction);
	const axisPoint = closestPointOnSegment(center, collider.start, collider.end).point;
	const normal = normalise(subtract(center, axisPoint), fallbackNormal(motion));
	return {
		timeFraction,
		center,
		contactPoint: add(axisPoint, scale(normal, colliderRadius)),
		normal
	};
}

function pointInsideAabb(point: CollisionVector3, min: CollisionVector3, max: CollisionVector3) {
	return (
		point.x >= min.x &&
		point.x <= max.x &&
		point.y >= min.y &&
		point.y <= max.y &&
		point.z >= min.z &&
		point.z <= max.z
	);
}

function nearestAabbFaceNormal(
	point: CollisionVector3,
	min: CollisionVector3,
	max: CollisionVector3
): CollisionVector3 {
	const faces = [
		{ distance: Math.abs(point.x - min.x), normal: { x: -1, y: 0, z: 0 } },
		{ distance: Math.abs(max.x - point.x), normal: { x: 1, y: 0, z: 0 } },
		{ distance: Math.abs(point.y - min.y), normal: { x: 0, y: -1, z: 0 } },
		{ distance: Math.abs(max.y - point.y), normal: { x: 0, y: 1, z: 0 } },
		{ distance: Math.abs(point.z - min.z), normal: { x: 0, y: 0, z: -1 } },
		{ distance: Math.abs(max.z - point.z), normal: { x: 0, y: 0, z: 1 } }
	];
	faces.sort((left, right) => left.distance - right.distance);
	return faces[0].normal;
}

function sweepSphereAgainstAabb(
	start: CollisionVector3,
	end: CollisionVector3,
	probeRadiusM: number,
	collider: AabbCollisionCollider,
	skinM: number
): SweepCandidate | null {
	const radius = probeRadiusM + skinM;
	const min = {
		x: Math.min(collider.min.x, collider.max.x) - radius,
		y: Math.min(collider.min.y, collider.max.y) - radius,
		z: Math.min(collider.min.z, collider.max.z) - radius
	};
	const max = {
		x: Math.max(collider.min.x, collider.max.x) + radius,
		y: Math.max(collider.min.y, collider.max.y) + radius,
		z: Math.max(collider.min.z, collider.max.z) + radius
	};
	const motion = subtract(end, start);
	let entry = 0;
	let exit = 1;
	let entryNormal: CollisionVector3 | null = null;

	if (!pointInsideAabb(start, min, max)) {
		const axes = ['x', 'y', 'z'] as const;
		for (const axis of axes) {
			const velocity = motion[axis];
			if (Math.abs(velocity) <= EPSILON) {
				if (start[axis] < min[axis] || start[axis] > max[axis]) return null;
				continue;
			}
			let first = (min[axis] - start[axis]) / velocity;
			let last = (max[axis] - start[axis]) / velocity;
			let normalSign = -1;
			if (first > last) {
				[first, last] = [last, first];
				normalSign = 1;
			}
			if (first > entry) {
				entry = first;
				entryNormal = {
					x: axis === 'x' ? normalSign : 0,
					y: axis === 'y' ? normalSign : 0,
					z: axis === 'z' ? normalSign : 0
				};
			}
			exit = Math.min(exit, last);
			if (entry > exit) return null;
		}
		if (entry < -EPSILON || entry > 1 + EPSILON) return null;
	}

	const timeFraction = clamp01(entry);
	const center = interpolate(start, end, timeFraction);
	const normal = entryNormal ?? nearestAabbFaceNormal(center, min, max);
	const originalMin = {
		x: Math.min(collider.min.x, collider.max.x),
		y: Math.min(collider.min.y, collider.max.y),
		z: Math.min(collider.min.z, collider.max.z)
	};
	const originalMax = {
		x: Math.max(collider.min.x, collider.max.x),
		y: Math.max(collider.min.y, collider.max.y),
		z: Math.max(collider.min.z, collider.max.z)
	};
	return {
		timeFraction,
		center,
		contactPoint: {
			x: Math.max(originalMin.x, Math.min(originalMax.x, center.x)),
			y: Math.max(originalMin.y, Math.min(originalMax.y, center.y)),
			z: Math.max(originalMin.z, Math.min(originalMax.z, center.z))
		},
		normal
	};
}

function sweepProbe(
	start: CollisionVector3,
	end: CollisionVector3,
	probeRadiusM: number,
	collider: CollisionCollider,
	skinM: number
): SweepCandidate | null {
	switch (collider.shape) {
		case 'sphere':
			return sweepSphereAgainstSphere(start, end, probeRadiusM, collider, skinM);
		case 'capsule':
			return sweepSphereAgainstCapsule(start, end, probeRadiusM, collider, skinM);
		case 'aabb':
			return sweepSphereAgainstAabb(start, end, probeRadiusM, collider, skinM);
	}
}

function compareHits(left: SweptCollisionHit, right: SweptCollisionHit): number {
	if (Math.abs(left.timeFraction - right.timeFraction) > EPSILON) {
		return left.timeFraction - right.timeFraction;
	}
	const colliderOrder = left.colliderId.localeCompare(right.colliderId);
	if (colliderOrder !== 0) return colliderOrder;
	return left.probeId.localeCompare(right.probeId);
}

/**
 * Stateful collider registry with allocation-light fixed-step queries. Supplying colliders directly
 * to sweep() is useful for streamed chunks; the registry is useful for long-lived landmarks.
 */
export class CollisionSystem {
	readonly probes: readonly PlaneCollisionProbe[];
	readonly skinM: number;
	private readonly colliders = new Map<string, CollisionCollider>();

	constructor(options: CollisionSystemOptions = {}) {
		this.probes = Object.freeze(
			(options.probes ?? DEFAULT_PLANE_COLLISION_PROBES).map((probe) => ({
				...probe,
				localCenter: { ...probe.localCenter },
				radiusM: sanitisedRadius(probe.radiusM)
			}))
		);
		this.skinM = sanitisedRadius(options.skinM ?? 0.001);
	}

	setColliders(colliders: Iterable<CollisionCollider>): void {
		this.colliders.clear();
		for (const collider of colliders) this.colliders.set(collider.id, collider);
	}

	upsertCollider(collider: CollisionCollider): void {
		this.colliders.set(collider.id, collider);
	}

	removeCollider(id: string): boolean {
		return this.colliders.delete(id);
	}

	clear(): void {
		this.colliders.clear();
	}

	get colliderCount(): number {
		return this.colliders.size;
	}

	/** Returns the first collision across the swept nose and both swept wingtips. */
	sweep(
		previousPose: PlaneCollisionPose,
		currentPose: PlaneCollisionPose,
		colliders: Iterable<CollisionCollider> = this.colliders.values()
	): SweptCollisionHit | null {
		let earliest: SweptCollisionHit | null = null;
		for (const collider of colliders) {
			if (collider.enabled === false) continue;
			for (const probe of this.probes) {
				const start = planeProbeWorldCenter(previousPose, probe);
				const end = planeProbeWorldCenter(currentPose, probe);
				const candidate = sweepProbe(start, end, probe.radiusM, collider, this.skinM);
				if (!candidate) continue;
				const hit: SweptCollisionHit = {
					colliderId: collider.id,
					colliderCategory: collider.category,
					probeId: probe.id,
					timeFraction: candidate.timeFraction,
					probeCenter: candidate.center,
					contactPoint: candidate.contactPoint,
					normal: candidate.normal,
					metadata: collider.metadata
				};
				if (!earliest || compareHits(hit, earliest) < 0) earliest = hit;
			}
		}
		return earliest;
	}
}

export function sweepPlaneCollision(
	previousPose: PlaneCollisionPose,
	currentPose: PlaneCollisionPose,
	colliders: Iterable<CollisionCollider>,
	options: CollisionSystemOptions = {}
): SweptCollisionHit | null {
	return new CollisionSystem(options).sweep(previousPose, currentPose, colliders);
}
