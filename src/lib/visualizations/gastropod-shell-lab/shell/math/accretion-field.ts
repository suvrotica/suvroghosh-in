import { add3, cross3, dot3, normalize3, scale3, sub3, type Vec3 } from './vector';

export interface AccretionVelocity {
	total: Vec3;
	apertureTangent: Vec3;
	growthDirection: Vec3;
	surfaceNormal: Vec3;
	components: {
		tangential: number;
		growth: number;
		normal: number;
	};
}

/**
 * Finite-difference decomposition of aperture motion into rim tangent, in-surface
 * growth direction, and surface normal. These are calculated kinematics, not tissue forces.
 */
export function decomposeAccretionVelocity(
	previous: Vec3,
	current: Vec3,
	previousAround: Vec3,
	nextAround: Vec3,
	deltaAge: number
): AccretionVelocity {
	const safeDelta = Math.max(1e-12, Math.abs(deltaAge));
	const total = scale3(sub3(current, previous), 1 / safeDelta);
	const apertureTangent = normalize3(sub3(nextAround, previousAround));
	const acrossGrowth = normalize3(sub3(current, previous), { x: 0, y: 0, z: 1 });
	const surfaceNormal = normalize3(cross3(apertureTangent, acrossGrowth));
	const growthDirection = normalize3(cross3(surfaceNormal, apertureTangent), acrossGrowth);
	const tangential = dot3(total, apertureTangent);
	const growth = dot3(total, growthDirection);
	const normal = dot3(total, surfaceNormal);
	return {
		total,
		apertureTangent,
		growthDirection,
		surfaceNormal,
		components: { tangential, growth, normal }
	};
}

export function reconstructAccretionVelocity(field: AccretionVelocity): Vec3 {
	return add3(
		add3(
			scale3(field.apertureTangent, field.components.tangential),
			scale3(field.growthDirection, field.components.growth)
		),
		scale3(field.surfaceNormal, field.components.normal)
	);
}
