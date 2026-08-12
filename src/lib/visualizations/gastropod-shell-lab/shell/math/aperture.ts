import { add3, clamp, rotateAroundAxis3, scale3, wrapAngle, type Vec3 } from './vector';
import { orthonormalizeFrame, type LocalFrame } from './transported-frame';

export interface FourierTerm {
	harmonic: number;
	cosine: number;
	sine: number;
}

export interface DrawnProfilePoint {
	u: number;
	radius: number;
}

export type ApertureProfile =
	| { kind: 'circle' }
	| { kind: 'ellipse' }
	| { kind: 'superellipse'; exponent: number }
	| { kind: 'rounded-polygon'; sides: number; roundness: number; rotation?: number }
	| { kind: 'fourier'; terms: readonly FourierTerm[] }
	| { kind: 'lobed'; lobes: number; amplitude: number; phase?: number }
	| { kind: 'drawn'; points: readonly DrawnProfilePoint[] };

export interface ApertureParameters {
	profile: ApertureProfile;
	width: number;
	height: number;
	rotation?: number;
}

export interface AperturePoint2 {
	x: number;
	y: number;
	radius: number;
}

export interface ApertureValidation {
	valid: boolean;
	errors: string[];
	minimumRadius: number;
	maximumHarmonic: number;
	simple: boolean;
}

function signedPower(value: number, exponent: number): number {
	return Math.sign(value) * Math.pow(Math.abs(value), exponent);
}

function periodicDrawnRadius(points: readonly DrawnProfilePoint[], u: number): number {
	if (points.length === 0) return 1;
	if (points.length === 1) return points[0].radius;
	const ordered = [...points]
		.map((point) => ({ u: wrapAngle(point.u), radius: point.radius }))
		.sort((a, b) => a.u - b.u);
	const wrapped = wrapAngle(u);
	let rightIndex = ordered.findIndex((point) => point.u > wrapped);
	if (rightIndex < 0) rightIndex = 0;
	const leftIndex = (rightIndex - 1 + ordered.length) % ordered.length;
	const left = ordered[leftIndex];
	const right = ordered[rightIndex];
	const leftU = left.u;
	const rightU = right.u <= leftU ? right.u + Math.PI * 2 : right.u;
	const sampleU = wrapped < leftU ? wrapped + Math.PI * 2 : wrapped;
	const amount = clamp((sampleU - leftU) / Math.max(1e-12, rightU - leftU), 0, 1);
	// Smooth interpolation avoids a crease at every drawn control point.
	const smooth = amount * amount * (3 - 2 * amount);
	return left.radius + (right.radius - left.radius) * smooth;
}

export function aperturePolarRadius(profile: ApertureProfile, u: number): number {
	if (profile.kind === 'circle' || profile.kind === 'ellipse' || profile.kind === 'superellipse') {
		return 1;
	}
	if (profile.kind === 'lobed') {
		return (
			1 +
			profile.amplitude *
				Math.cos(Math.max(1, Math.round(profile.lobes)) * u + (profile.phase ?? 0))
		);
	}
	if (profile.kind === 'fourier') {
		let radius = 1;
		for (const term of profile.terms) {
			const harmonic = Math.max(1, Math.round(term.harmonic));
			radius += term.cosine * Math.cos(harmonic * u) + term.sine * Math.sin(harmonic * u);
		}
		return radius;
	}
	if (profile.kind === 'drawn') return periodicDrawnRadius(profile.points, u);
	const sides = Math.max(3, Math.round(profile.sides));
	const sector = (Math.PI * 2) / sides;
	const centered = ((wrapAngle(u - (profile.rotation ?? 0)) + sector / 2) % sector) - sector / 2;
	const polygonRadius = Math.cos(Math.PI / sides) / Math.max(1e-8, Math.cos(centered));
	return polygonRadius + (1 - polygonRadius) * clamp(profile.roundness, 0, 1);
}

export function sampleAperturePoint(parameters: ApertureParameters, u: number): AperturePoint2 {
	// Canonicalizing the periodic coordinate makes the explicit seam byte-identical,
	// including fractional superellipse powers that would otherwise magnify sin(2π).
	const angle = wrapAngle(u);
	const rotation = parameters.rotation ?? 0;
	const rotationCosine = Math.cos(rotation);
	const rotationSine = Math.sin(rotation);
	const profile = parameters.profile;
	let localX: number;
	let localY: number;
	if (profile.kind === 'superellipse') {
		const exponent = clamp(profile.exponent, 0.1, 32);
		const power = 2 / exponent;
		localX = parameters.width * signedPower(Math.cos(angle), power);
		localY = parameters.height * signedPower(Math.sin(angle), power);
	} else {
		const polarRadius = aperturePolarRadius(profile, angle);
		localX = parameters.width * polarRadius * Math.cos(angle);
		localY = parameters.height * polarRadius * Math.sin(angle);
	}
	const x = localX * rotationCosine - localY * rotationSine;
	const y = localX * rotationSine + localY * rotationCosine;
	return { x, y, radius: Math.hypot(x, y) };
}

function orientation(a: AperturePoint2, b: AperturePoint2, c: AperturePoint2): number {
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(
	a: AperturePoint2,
	b: AperturePoint2,
	c: AperturePoint2,
	d: AperturePoint2
): boolean {
	const abC = orientation(a, b, c);
	const abD = orientation(a, b, d);
	const cdA = orientation(c, d, a);
	const cdB = orientation(c, d, b);
	return abC * abD < -1e-14 && cdA * cdB < -1e-14;
}

export function validateApertureProfile(
	parameters: ApertureParameters,
	apertureSamples: number,
	denseSamples = Math.max(256, apertureSamples * 4),
	minimumRadius = 1e-4
): ApertureValidation {
	const errors: string[] = [];
	if (!(parameters.width > 0) || !(parameters.height > 0)) {
		errors.push('Aperture width and height must be positive.');
	}
	let maximumHarmonic = 1;
	if (parameters.profile.kind === 'fourier') {
		maximumHarmonic = parameters.profile.terms.reduce(
			(maximum, term) => Math.max(maximum, Math.abs(Math.round(term.harmonic))),
			1
		);
	} else if (parameters.profile.kind === 'lobed') {
		maximumHarmonic = Math.abs(Math.round(parameters.profile.lobes));
	} else if (parameters.profile.kind === 'rounded-polygon') {
		maximumHarmonic = Math.abs(Math.round(parameters.profile.sides));
	} else if (parameters.profile.kind === 'drawn') {
		maximumHarmonic = Math.max(1, Math.floor(parameters.profile.points.length / 2));
	}
	if (maximumHarmonic >= apertureSamples / 2) {
		errors.push(`Profile harmonic ${maximumHarmonic} exceeds the aperture sampling Nyquist limit.`);
	}

	const points: AperturePoint2[] = [];
	let sampledMinimum = Number.POSITIVE_INFINITY;
	for (let index = 0; index < denseSamples; index += 1) {
		const u = (index / denseSamples) * Math.PI * 2;
		const radius = aperturePolarRadius(parameters.profile, u);
		sampledMinimum = Math.min(sampledMinimum, radius);
		const point = sampleAperturePoint(parameters, u);
		if (![point.x, point.y, point.radius, radius].every(Number.isFinite)) {
			errors.push('Aperture profile produced a non-finite coordinate.');
			break;
		}
		points.push(point);
	}
	if (!(sampledMinimum > minimumRadius)) {
		errors.push(`Aperture polar radius must stay above ${minimumRadius}.`);
	}

	let simple = true;
	for (let first = 0; first < points.length && simple; first += 1) {
		const firstNext = (first + 1) % points.length;
		for (let second = first + 2; second < points.length; second += 1) {
			const secondNext = (second + 1) % points.length;
			if (first === secondNext || firstNext === second) continue;
			if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) {
				simple = false;
				break;
			}
		}
	}
	if (!simple) errors.push('Aperture outline self-intersects.');
	return {
		valid: errors.length === 0,
		errors: [...new Set(errors)],
		minimumRadius: sampledMinimum,
		maximumHarmonic,
		simple
	};
}

export function tiltApertureFrame(frame: LocalFrame, tilt: number, azimuth = 0): LocalFrame {
	if (tilt === 0) return orthonormalizeFrame(frame);
	const tiltAxis = add3(scale3(frame.e1, Math.cos(azimuth)), scale3(frame.e2, Math.sin(azimuth)));
	return orthonormalizeFrame({
		tangent: rotateAroundAxis3(frame.tangent, tiltAxis, tilt),
		e1: rotateAroundAxis3(frame.e1, tiltAxis, tilt),
		e2: rotateAroundAxis3(frame.e2, tiltAxis, tilt)
	});
}

export function aperturePointInWorld(
	center: Vec3,
	frame: LocalFrame,
	point: AperturePoint2,
	scale: number,
	radialDisplacement = 0
): Vec3 {
	const planarLength = Math.max(1e-12, Math.hypot(point.x, point.y));
	// Continuous inward ornament may narrow a profile but may never invert it through
	// the aperture origin. Outward displacement remains controlled by the ornament field.
	const safeDisplacement = Math.max(-0.95 * planarLength, radialDisplacement);
	const displacementScale = scale * (1 + safeDisplacement / planarLength);
	return add3(
		center,
		add3(
			scale3(frame.e1, point.x * displacementScale),
			scale3(frame.e2, point.y * displacementScale)
		)
	);
}
