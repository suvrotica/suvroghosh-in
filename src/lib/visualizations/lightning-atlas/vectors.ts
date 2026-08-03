import type { Vec3 } from './types';

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function add(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(value: Vec3, amount: number): Vec3 {
	return { x: value.x * amount, y: value.y * amount, z: value.z * amount };
}

export function length(value: Vec3): number {
	return Math.hypot(value.x, value.y, value.z);
}

export function distance(a: Vec3, b: Vec3): number {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function normalize(value: Vec3): Vec3 {
	const magnitude = length(value);
	return magnitude <= Number.EPSILON ? { x: 0, y: 0, z: 0 } : scale(value, 1 / magnitude);
}

export function lerp(a: Vec3, b: Vec3, amount: number): Vec3 {
	return {
		x: a.x + (b.x - a.x) * amount,
		y: a.y + (b.y - a.y) * amount,
		z: a.z + (b.z - a.z) * amount
	};
}

export function dot(a: Vec3, b: Vec3): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

export function finiteVec3(value: Vec3): boolean {
	return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}
