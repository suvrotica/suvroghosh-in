/** A small, allocation-conscious vector toolkit for the pure shell engine. */
export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export const VEC3_EPSILON = 1e-12;

export function vec3(x = 0, y = 0, z = 0): Vec3 {
	return { x, y, z };
}

export function clone3(value: Vec3): Vec3 {
	return { x: value.x, y: value.y, z: value.z };
}

export function add3(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale3(value: Vec3, scalar: number): Vec3 {
	return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar };
}

export function multiplyAdd3(a: Vec3, b: Vec3, scalar: number): Vec3 {
	return { x: a.x + b.x * scalar, y: a.y + b.y * scalar, z: a.z + b.z * scalar };
}

export function lerp3(a: Vec3, b: Vec3, amount: number): Vec3 {
	return {
		x: a.x + (b.x - a.x) * amount,
		y: a.y + (b.y - a.y) * amount,
		z: a.z + (b.z - a.z) * amount
	};
}

export function dot3(a: Vec3, b: Vec3): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
	return {
		x: a.y * b.z - a.z * b.y,
		y: a.z * b.x - a.x * b.z,
		z: a.x * b.y - a.y * b.x
	};
}

export function lengthSquared3(value: Vec3): number {
	return dot3(value, value);
}

export function length3(value: Vec3): number {
	return Math.sqrt(lengthSquared3(value));
}

export function distance3(a: Vec3, b: Vec3): number {
	return length3(sub3(a, b));
}

export function normalize3(value: Vec3, fallback: Vec3 = { x: 1, y: 0, z: 0 }): Vec3 {
	const length = length3(value);
	if (!(length > VEC3_EPSILON) || !Number.isFinite(length)) {
		const fallbackLength = length3(fallback);
		if (!(fallbackLength > VEC3_EPSILON) || !Number.isFinite(fallbackLength)) {
			return { x: 1, y: 0, z: 0 };
		}
		return scale3(fallback, 1 / fallbackLength);
	}
	return scale3(value, 1 / length);
}

export function negate3(value: Vec3): Vec3 {
	return { x: -value.x, y: -value.y, z: -value.z };
}

export function projectPerpendicular3(value: Vec3, normal: Vec3): Vec3 {
	return sub3(value, scale3(normal, dot3(value, normal)));
}

export function choosePerpendicular3(tangent: Vec3): Vec3 {
	const unitTangent = normalize3(tangent);
	const candidates: Vec3[] = [
		{ x: 1, y: 0, z: 0 },
		{ x: 0, y: 1, z: 0 },
		{ x: 0, y: 0, z: 1 }
	];
	let reference = candidates[0];
	let leastAlignment = Math.abs(dot3(unitTangent, reference));
	for (let index = 1; index < candidates.length; index += 1) {
		const alignment = Math.abs(dot3(unitTangent, candidates[index]));
		if (alignment < leastAlignment) {
			leastAlignment = alignment;
			reference = candidates[index];
		}
	}
	return normalize3(projectPerpendicular3(reference, unitTangent));
}

export function rotateAroundAxis3(value: Vec3, axis: Vec3, angle: number): Vec3 {
	const unitAxis = normalize3(axis);
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);
	return add3(
		add3(scale3(value, cosine), scale3(cross3(unitAxis, value), sine)),
		scale3(unitAxis, dot3(unitAxis, value) * (1 - cosine))
	);
}

export function determinant3(first: Vec3, second: Vec3, third: Vec3): number {
	return dot3(first, cross3(second, third));
}

export function isFinite3(value: Vec3): boolean {
	return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

export function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

export function saturate(value: number): number {
	return clamp(value, 0, 1);
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
	if (edge0 === edge1) return value < edge0 ? 0 : 1;
	const amount = saturate((value - edge0) / (edge1 - edge0));
	return amount * amount * (3 - 2 * amount);
}

export function smootherstep(edge0: number, edge1: number, value: number): number {
	if (edge0 === edge1) return value < edge0 ? 0 : 1;
	const amount = saturate((value - edge0) / (edge1 - edge0));
	return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

export function wrapAngle(angle: number): number {
	const tau = Math.PI * 2;
	return ((angle % tau) + tau) % tau;
}

export function shortestAngleDifference(from: number, to: number): number {
	const difference = wrapAngle(to - from);
	return difference > Math.PI ? difference - Math.PI * 2 : difference;
}
