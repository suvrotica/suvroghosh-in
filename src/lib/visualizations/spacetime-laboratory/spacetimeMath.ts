/**
 * Physics helpers for the spacetime laboratory.
 *
 * Conventions: metric signature (-,+,+,+). SI constants are provided for the
 * article-facing conversions, but the shader and the graph helpers work in
 * geometrized units G = c = 1, so lengths are measured in units of the black
 * hole mass M, or equivalently the Schwarzschild radius rs = 2M is 2.
 */

export const C_M_PER_S = 299_792_458;
export const G_SI = 6.6743e-11;
export const SOLAR_MASS_KG = 1.98847e30;
export const SOLAR_SCHWARZSCHILD_RADIUS_KM = 2.953_250_08;

/** Schwarzschild radius r_s = 2GM/c^2 in kilometres. */
export function schwarzschildRadiusKm(massSolar: number): number {
	return SOLAR_SCHWARZSCHILD_RADIUS_KM * massSolar;
}

/** Photon sphere radius in geometrized units (r = 3M). */
export function photonSphereRadius(geometrizedMass = 1): number {
	return 3 * geometrizedMass;
}

/** Innermost stable circular orbit for Schwarzschild in geometrized units (r = 6M). */
export function iscoRadiusSchwarzschild(geometrizedMass = 1): number {
	return 6 * geometrizedMass;
}

/** Kretschmann scalar K = 48 G^2 M^2 / (c^4 r^6) in geometrized units (G = c = 1). */
export function kretschmannScalar(radius: number, geometrizedMass = 1): number {
	if (radius <= 0) return Number.POSITIVE_INFINITY;
	return (48 * geometrizedMass * geometrizedMass) / Math.pow(radius, 6);
}

/** Gravitational time dilation dτ/dt = sqrt(1 - rs/r) for a static Schwarzschild observer. */
export function schwarzschildTimeDilation(radius: number, schwarzschildRadius = 2): number {
	const ratio = schwarzschildRadius / radius;
	if (ratio >= 1) return 0;
	return Math.sqrt(1 - ratio);
}

/** Kerr outer horizon r_+ = M(1 + sqrt(1 - spin²)); spin = a/M. */
export function kerrHorizonRadius(spin: number, geometrizedMass = 1): number {
	const clamped = clampSpin(spin);
	return geometrizedMass * (1 + Math.sqrt(1 - clamped ** 2));
}

/** Prograde equatorial Kerr ISCO, with dimensionless spin a/M. */
export function kerrIscoRadius(spin: number, geometrizedMass = 1): number {
	const a = clampSpin(spin);
	const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
	const z2 = Math.sqrt(3 * a * a + z1 * z1);
	return geometrizedMass * (3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2)));
}

/** Clock at fixed Boyer–Lindquist spatial coordinates; no static worldline in the ergoregion. */
export function kerrStaticTimeDilation(
	radius: number,
	spin: number,
	polarAngleRadians: number,
	geometrizedMass = 1
): number | null {
	if (radius <= 0) return null;
	const a = clampSpin(spin) * geometrizedMass;
	const sigma = radius * radius + a * a * Math.cos(polarAngleRadians) ** 2;
	const lapseSquared = 1 - (2 * geometrizedMass * radius) / sigma;
	return lapseSquared > 0 ? Math.sqrt(lapseSquared) : null;
}

/** Kerr equatorial ergosphere radius r_e = M + sqrt(M^2 - a^2 cos^2θ) at θ = π/2 = 2M. */
export function kerrErgosphereEquator(geometrizedMass = 1): number {
	return 2 * geometrizedMass;
}

/** Display cap for near-extremal Kerr; the exact Kerr bound is |a/M| <= 1. */
export const EXTREMAL_SPIN = 0.998;

export function clampSpin(spin: number): number {
	return Math.min(EXTREMAL_SPIN, Math.max(0, spin));
}

/** Extremal Reissner–Nordstrom charge Q* = sqrt(4π ε0 G) M. Normalized q = Q/Q*. */
export function rnExtremalChargeNormalized(): number {
	return 1;
}

/** RN horizons r_± = M ± sqrt(M^2 - Q^2), geometrized units; null when naked. */
export function rnHorizonRadii(
	normalizedCharge: number,
	geometrizedMass = 1
): { outer: number; inner: number } | null {
	const q = normalizedCharge * geometrizedMass;
	const discriminant = geometrizedMass ** 2 - q ** 2;
	if (discriminant < 0) return null;
	const root = Math.sqrt(discriminant);
	return { outer: geometrizedMass + root, inner: geometrizedMass - root };
}

/** Static RN clock relative to infinity; null where a static worldline is impossible. */
export function reissnerNordstromTimeDilation(
	radius: number,
	normalizedCharge = 0,
	geometrizedMass = 1
): number | null {
	if (radius <= 0) return null;
	const q = normalizedCharge * geometrizedMass;
	const f = 1 - (2 * geometrizedMass) / radius + (q * q) / (radius * radius);
	return f > 0 ? Math.sqrt(f) : null;
}

/** Outer unstable RN photon sphere, if the discriminant is non-negative. */
export function rnPhotonSphereRadius(normalizedCharge: number, geometrizedMass = 1): number | null {
	const discriminant = 9 - 8 * normalizedCharge * normalizedCharge;
	return discriminant < 0 ? null : (geometrizedMass * (3 + Math.sqrt(discriminant))) / 2;
}

/** Outermost marginally stable timelike orbit of a subextremal RN black hole. */
export function rnIscoRadius(normalizedCharge: number, geometrizedMass = 1): number | null {
	if (Math.abs(normalizedCharge) > 1) return null;
	const q2 = normalizedCharge * normalizedCharge;
	let low = 4;
	let high = 6;
	for (let i = 0; i < 64; i++) {
		const r = (low + high) / 2;
		const polynomial = r ** 3 - 6 * r ** 2 + 9 * q2 * r - 4 * q2 * q2;
		if (polynomial > 0) high = r;
		else low = r;
	}
	return (geometrizedMass * (low + high)) / 2;
}

/**
 * Weak-field deflection angle for a photon with impact parameter b, in radians:
 * α = 4GM/(bc^2) = 2rs/b. Doubles the Newtonian (corpuscular) value — the
 * factor of two is the famous 1919 eclipse result.
 */
export function weakDeflectionAngle(impactParameter: number, schwarzschildRadius = 2): number {
	return (2 * schwarzschildRadius) / Math.max(impactParameter, 1e-6);
}

/** Gravitational redshift 1 + z = 1/sqrt(1 - rs/r) for light escaping to infinity. */
export function gravitationalRedshift(radius: number, schwarzschildRadius = 2): number {
	const dilation = schwarzschildTimeDilation(radius, schwarzschildRadius);
	if (dilation <= 0) return Number.POSITIVE_INFINITY;
	return 1 / dilation;
}

/** Effective potential per unit mass for a Schwarzschild circular timelike orbit. */
export function schwarzschildEffectivePotential(
	radius: number,
	angularMomentum: number,
	geometrizedMass = 1
): number {
	const rs = 2 * geometrizedMass;
	return (1 - rs / radius) * (1 + (angularMomentum * angularMomentum) / (radius * radius));
}

/**
 * FLRW scale factor a(t) for a flat single-component universe:
 * matter: a ∝ t^(2/3), radiation: a ∝ t^(1/2), cosmological constant: a ∝ e^(Ht).
 * This is the educational single-fluid approximation used by the graph.
 */
export function scaleFactorSingleFluid(
	t: number,
	dominant: 'matter' | 'radiation' | 'lambda'
): number {
	if (dominant === 'lambda') return Math.exp(t - 1);
	if (t <= 0) return 0;
	if (dominant === 'matter') return Math.pow(t, 2 / 3);
	return Math.sqrt(t);
}

/** Cosmological redshift 1 + z = a_observed / a_emitted. */
export function cosmologicalRedshift(scaleEmitted: number, scaleObserved: number): number {
	if (scaleEmitted <= 0) return Number.POSITIVE_INFINITY;
	return scaleObserved / scaleEmitted;
}

/** de Sitter horizon distance d = c/H in normalized units (c = 1). */
export function deSitterHorizon(hubbleNormalized: number): number {
	if (hubbleNormalized <= 0) return Number.POSITIVE_INFINITY;
	return 1 / hubbleNormalized;
}

/**
 * Gravitational-wave ring deformation. For a plus-polarized wave travelling
 * along z, a ring of test particles in the xy-plane stretches along x and
 * squeezes along y by h(t)/2, where h(t) = h0 cos(ωt + φ). Cross polarization
 * is the same pattern rotated by 45°.
 */
export function gwRingDisplacement(
	angle: number,
	strain: number,
	phase: number,
	polarization: 'plus' | 'cross'
): { x: number; y: number } {
	const h = strain * Math.cos(phase);
	const x = Math.cos(angle);
	const y = Math.sin(angle);
	return polarization === 'plus'
		? { x: x * (1 + h / 2), y: y * (1 - h / 2) }
		: { x: x + (h * y) / 2, y: y + (h * x) / 2 };
}

/** Physical strain of a typical LIGO-band binary inspiral (order of magnitude). */
export const PHYSICAL_GW_STRAIN = 1e-21;

/** Camera areal radius limits in M units; keep static Schwarzschild observers outside 2M. */
export const OBSERVER_MIN_RADIUS_M = 2.1;
export const OBSERVER_MAX_RADIUS_M = 40;

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
