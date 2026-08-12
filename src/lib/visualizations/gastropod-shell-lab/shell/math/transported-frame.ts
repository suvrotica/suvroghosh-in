import {
	add3,
	choosePerpendicular3,
	clamp,
	clone3,
	cross3,
	dot3,
	isFinite3,
	length3,
	negate3,
	normalize3,
	projectPerpendicular3,
	rotateAroundAxis3,
	scale3,
	sub3,
	type Vec3
} from './vector';

export interface LocalFrame {
	tangent: Vec3;
	e1: Vec3;
	e2: Vec3;
}

export interface TransportedFrame extends LocalFrame {
	point: Vec3;
	twist: number;
}

export function stableTangents(points: readonly Vec3[]): Vec3[] {
	if (points.length < 2) throw new RangeError('At least two points are required for tangents.');
	const tangents: Vec3[] = [];
	for (let index = 0; index < points.length; index += 1) {
		let difference: Vec3;
		if (index === 0) difference = sub3(points[1], points[0]);
		else if (index === points.length - 1) difference = sub3(points[index], points[index - 1]);
		else difference = sub3(points[index + 1], points[index - 1]);
		const fallback = index > 0 ? tangents[index - 1] : { x: 1, y: 0, z: 0 };
		tangents.push(normalize3(difference, fallback));
	}
	return tangents;
}

export function orthonormalizeFrame(frame: LocalFrame): LocalFrame {
	const tangent = normalize3(frame.tangent);
	let e1 = normalize3(projectPerpendicular3(frame.e1, tangent), choosePerpendicular3(tangent));
	let e2 = normalize3(cross3(tangent, e1));
	// Recompute E1 to remove the last bit of floating-point drift and preserve handedness.
	e1 = normalize3(cross3(e2, tangent), e1);
	e2 = normalize3(cross3(tangent, e1), e2);
	return { tangent, e1, e2 };
}

/** Minimum-rotation parallel transport from one unit tangent to another. */
export function transportFrame(previous: LocalFrame, nextTangentInput: Vec3): LocalFrame {
	const current = orthonormalizeFrame(previous);
	const nextTangent = normalize3(nextTangentInput, current.tangent);
	const axisVector = cross3(current.tangent, nextTangent);
	const sine = length3(axisVector);
	const cosine = clamp(dot3(current.tangent, nextTangent), -1, 1);
	let transportedE1: Vec3;
	if (sine > 1e-10) {
		const axis = scale3(axisVector, 1 / sine);
		transportedE1 = rotateAroundAxis3(current.e1, axis, Math.atan2(sine, cosine));
	} else if (cosine < 0) {
		// An exact reversal has no unique minimum rotation. Keep the choice deterministic.
		const axis = normalize3(current.e1, choosePerpendicular3(current.tangent));
		transportedE1 = rotateAroundAxis3(current.e1, axis, Math.PI);
	} else {
		transportedE1 = clone3(current.e1);
	}
	return orthonormalizeFrame({ tangent: nextTangent, e1: transportedE1, e2: current.e2 });
}

export function twistFrame(frame: LocalFrame, angle: number): LocalFrame {
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);
	return orthonormalizeFrame({
		tangent: frame.tangent,
		e1: add3(scale3(frame.e1, cosine), scale3(frame.e2, sine)),
		e2: add3(scale3(frame.e2, cosine), scale3(frame.e1, -sine))
	});
}

export function buildRotationMinimizingFrames(
	points: readonly Vec3[],
	twistAngles?: readonly number[],
	initialNormal?: Vec3
): TransportedFrame[] {
	const tangents = stableTangents(points);
	const firstE1 = normalize3(
		projectPerpendicular3(initialNormal ?? choosePerpendicular3(tangents[0]), tangents[0]),
		choosePerpendicular3(tangents[0])
	);
	let transported = orthonormalizeFrame({
		tangent: tangents[0],
		e1: firstE1,
		e2: cross3(tangents[0], firstE1)
	});
	const output: TransportedFrame[] = [];
	for (let index = 0; index < points.length; index += 1) {
		if (index > 0) transported = transportFrame(transported, tangents[index]);
		const twist = twistAngles?.[index] ?? 0;
		const authored = twistFrame(transported, twist);
		if (![authored.tangent, authored.e1, authored.e2].every(isFinite3)) {
			throw new Error(`Non-finite transported frame at sample ${index}.`);
		}
		output.push({ point: clone3(points[index]), ...authored, twist });
	}
	return output;
}

/** An explicit mirror transform used for chirality invariants. */
export function mirrorChirality(point: Vec3): Vec3 {
	return { x: point.x, y: -point.y, z: point.z };
}

/** Correct the sign of a vector when continuity is preferable to an arbitrary eigenvector sign. */
export function alignDirection(previous: Vec3, next: Vec3): Vec3 {
	return dot3(previous, next) < 0 ? negate3(next) : next;
}
