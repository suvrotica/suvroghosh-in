// Physics verification for the spacetime laboratory. Imports spacetimeMath.ts
// via Node's type stripping and asserts the exact GR relations the article
// and shader rely on. Run with: node --experimental-strip-types.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const mathUrl = pathToFileURL(
	path.join(root, 'src/lib/visualizations/spacetime-laboratory/spacetimeMath.ts')
).href;
const m = await import(mathUrl);

const approx = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

test('Schwarzschild radius is 2.953 km per solar mass', () => {
	assert.ok(approx(m.schwarzschildRadiusKm(1), 2.95325, 1e-3));
	assert.ok(approx(m.schwarzschildRadiusKm(4.3e6), 2.95325 * 4.3e6, 1));
});

test('photon sphere at 3M and ISCO at 6M', () => {
	assert.equal(m.photonSphereRadius(1), 3);
	assert.equal(m.iscoRadiusSchwarzschild(1), 6);
});

test('Kretschmann scalar K = 48 M^2 / r^6', () => {
	assert.ok(approx(m.kretschmannScalar(2, 1), 48 / 64));
	assert.equal(m.kretschmannScalar(0, 1), Number.POSITIVE_INFINITY);
});

test('gravitational time dilation vanishes at the horizon', () => {
	assert.equal(m.schwarzschildTimeDilation(2, 2), 0);
	assert.ok(approx(m.schwarzschildTimeDilation(3, 2), Math.sqrt(1 / 3)));
	assert.ok(approx(m.schwarzschildTimeDilation(1e9, 2), 1, 1e-6));
});

test('gravitational redshift 1+z = 1/sqrt(1 - rs/r)', () => {
	assert.ok(approx(m.gravitationalRedshift(3, 2), Math.sqrt(3)));
});

test('Kerr horizons and extremal bound', () => {
	assert.ok(approx(m.kerrHorizonRadius(0, 1), 2), 'zero spin -> Schwarzschild 2M');
	assert.ok(
		approx(m.kerrHorizonRadius(1, 1), m.kerrHorizonRadius(0.998, 1)),
		'spin clamped to near-extremal'
	);
	assert.ok(
		approx(m.kerrHorizonRadius(0.998, 1), 1 + Math.sqrt(1 - 0.998 ** 2)),
		'near-extremal horizon'
	);
	assert.ok(approx(m.kerrHorizonRadius(0.5, 1), 1 + Math.sqrt(0.75)));
	assert.ok(approx(m.kerrErgosphereEquator(1), 2));
	assert.equal(m.clampSpin(1.4), 0.998, 'spin clamped to near-extremal');
	assert.equal(m.clampSpin(-1), 0);
	assert.ok(
		approx(m.kerrHorizonRadius(0.5, 2), 2 * (1 + Math.sqrt(0.75))),
		'dimensionless spin scales with M'
	);
	assert.ok(approx(m.kerrIscoRadius(0), 6));
	assert.ok(m.kerrIscoRadius(0.998) > 1.23 && m.kerrIscoRadius(0.998) < 1.24);
	assert.equal(
		m.kerrStaticTimeDilation(1.9, 0.9, Math.PI / 2),
		null,
		'no static observer in the ergoregion'
	);
});

test('Reissner–Nordstrom horizon structure', () => {
	assert.deepEqual(m.rnHorizonRadii(0, 1), { outer: 2, inner: 0 }, 'zero charge -> Schwarzschild');
	const extremal = m.rnHorizonRadii(1, 1);
	assert.ok(approx(extremal.outer, 1) && approx(extremal.inner, 1), 'extremal horizons merge');
	assert.equal(m.rnHorizonRadii(1.5, 1), null, 'super-extremal is naked, not a black hole');
	assert.equal(m.rnPhotonSphereRadius(0), 3);
	assert.equal(m.rnPhotonSphereRadius(1), 2);
	assert.ok(approx(m.rnIscoRadius(0), 6));
	assert.ok(approx(m.rnIscoRadius(1), 4));
	assert.ok(approx(m.reissnerNordstromTimeDilation(10, 1), 0.9));
});

test('weak-field deflection alpha = 2 rs / b', () => {
	assert.ok(approx(m.weakDeflectionAngle(10, 2), 0.4));
});

test('FLRW scale factors and redshift', () => {
	assert.ok(approx(m.scaleFactorSingleFluid(1, 'matter'), 1));
	assert.ok(approx(m.scaleFactorSingleFluid(8, 'matter'), 4));
	assert.ok(approx(m.scaleFactorSingleFluid(4, 'radiation'), 2));
	assert.ok(approx(m.cosmologicalRedshift(0.5, 1), 2));
	assert.ok(approx(m.cosmologicalRedshift(1, 1), 1), 'constant a -> no expansion redshift');
	assert.ok(
		approx(m.scaleFactorSingleFluid(0, 'lambda'), Math.exp(-1)),
		'de Sitter has no finite-time a=0'
	);
});

test('de Sitter horizon = 1/H', () => {
	assert.ok(approx(m.deSitterHorizon(0.5), 2));
	assert.equal(m.deSitterHorizon(0), Number.POSITIVE_INFINITY);
});

test('gravitational-wave ring deformation', () => {
	const plus = m.gwRingDisplacement(0, 0.5, 0, 'plus');
	assert.ok(plus.x > 1 && approx(plus.y, 0), 'plus stretches x at phase 0');
	const squeezed = m.gwRingDisplacement(Math.PI / 2, 0.5, 0, 'plus');
	assert.ok(approx(squeezed.y, 0.75), 'plus squeezes y at phase 0');
	const zero = m.gwRingDisplacement(0.7, 0, 0.3, 'plus');
	assert.ok(
		approx(zero.x, Math.cos(0.7)) && approx(zero.y, Math.sin(0.7)),
		'zero strain -> circle'
	);
	const diagonal = m.gwRingDisplacement(Math.PI / 4, 0.2, 0, 'plus');
	assert.ok(approx(diagonal.x, Math.SQRT1_2 * 1.1));
	assert.ok(
		approx(diagonal.y, Math.SQRT1_2 * 0.9),
		'individual particles follow the strain tensor'
	);
	const cross = m.gwRingDisplacement(0, 0.2, 0, 'cross');
	assert.ok(approx(cross.x, 1) && approx(cross.y, 0.1), 'cross has fixed diagonal principal axes');
});

// Independent CPU float32 exercise of the shader's affine geodesic ODE. These
// checks compare the numerical orbit with the analytical metric invariants and
// capture cone, rather than merely asserting helper constants. Operation-level
// rounding approximates GLSL highp; driver/FMA differences still need GPU checks.
const f32 = Math.fround;
const add = (a, b, factor) => a.map((x, i) => f32(x + f32(b[i] * factor)));
const norm = (v) => f32(Math.hypot(...v));
const dot = (a, b) => f32(a.reduce((sum, x, i) => f32(sum + f32(x * b[i])), 0));

function integrateStaticRay(observerRadius, screenImpact, steps, charge = 0) {
	const metric = (r) => 1 - 2 / r + (charge * charge) / (r * r);
	let p = [screenImpact, 0, Math.sqrt(observerRadius ** 2 - screenImpact ** 2)].map(f32);
	const rd = [0, 0, -1];
	const component = -p[2] / observerRadius;
	let v = rd.map((x, i) =>
		f32(x + ((Math.sqrt(metric(observerRadius)) - 1) * component * p[i]) / observerRadius)
	);
	const l2 = f32(p[0] ** 2); // this launch has L = r sin(alpha) = screenImpact
	const energySquared = metric(observerRadius);
	const acceleration = (position) => {
		const r2 = dot(position, position);
		const r = f32(Math.sqrt(r2));
		const coefficient = f32(
			f32(l2 * f32(-3 + f32((2 * charge * charge) / r))) / f32(f32(r2 * r2) * r)
		);
		return position.map((x) => f32(coefficient * x));
	};
	let maxRelativeEnergyError = 0;
	for (let i = 0; i < Math.max(steps, 56) + 80; i++) {
		const r = norm(p);
		if (r <= (1 + Math.sqrt(1 - charge * charge)) * 1.0001)
			return { fate: 'captured', maxRelativeEnergyError, direction: Math.atan2(v[0], -v[2]) };
		if (r > Math.max(100, observerRadius * 3) && dot(p, v) > 0)
			return { fate: 'escaped', maxRelativeEnergyError, direction: Math.atan2(v[0], -v[2]) };
		const dt = f32(
			(0.14 * Math.sqrt(56 / Math.max(steps, 56)) * Math.max(r, 0.5)) / Math.max(norm(v), 0.15)
		);
		const a1 = acceleration(p);
		const v2 = add(v, a1, dt / 2);
		const a2 = acceleration(add(p, v, dt / 2));
		const v3 = add(v, a2, dt / 2);
		const a3 = acceleration(add(p, v2, dt / 2));
		const v4 = add(v, a3, dt);
		const a4 = acceleration(add(p, v3, dt));
		p = p.map((x, j) => f32(x + (dt * f32(v[j] + f32(2 * v2[j]) + f32(2 * v3[j]) + v4[j])) / 6));
		v = v.map((x, j) => f32(x + (dt * f32(a1[j] + f32(2 * a2[j]) + f32(2 * a3[j]) + a4[j])) / 6));
		const newRadius = norm(p);
		const radialVelocity = dot(p, v) / newRadius;
		const energy = radialVelocity ** 2 + (metric(newRadius) * l2) / newRadius ** 2;
		maxRelativeEnergyError = Math.max(
			maxRelativeEnergyError,
			Math.abs(energy - energySquared) / energySquared
		);
		assert.ok(p.every(Number.isFinite) && v.every(Number.isFinite), 'finite trajectory');
	}
	return { fate: 'budget', maxRelativeEnergyError };
}

test('float32 null rays reproduce Schwarzschild/RN capture cones at every quality', () => {
	let worstEnergyError = 0;
	for (const q of [0, 0.6, 1]) {
		for (const observerRadius of [10, 40]) {
			const photonRadius = (3 + Math.sqrt(9 - 8 * q * q)) / 2;
			const photonMetric = 1 - 2 / photonRadius + (q * q) / photonRadius ** 2;
			const observerMetric = 1 - 2 / observerRadius + (q * q) / observerRadius ** 2;
			const criticalScreenImpact = photonRadius * Math.sqrt(observerMetric / photonMetric);
			for (const steps of [56, 96, 144, 224]) {
				const inside = integrateStaticRay(observerRadius, criticalScreenImpact * 0.999, steps, q);
				const outside = integrateStaticRay(observerRadius, criticalScreenImpact * 1.001, steps, q);
				assert.equal(
					inside.fate,
					'captured',
					`q=${q}, r=${observerRadius}, steps=${steps}: just inside shadow`
				);
				assert.equal(
					outside.fate,
					'escaped',
					`q=${q}, r=${observerRadius}, steps=${steps}: just outside shadow`
				);
				worstEnergyError = Math.max(
					worstEnergyError,
					inside.maxRelativeEnergyError,
					outside.maxRelativeEnergyError
				);
			}
		}
	}
	assert.ok(worstEnergyError < 0.0005, `worst relative null-energy residual ${worstEnergyError}`);
	console.log(
		`Float32 near-critical orbit grid: worst relative null-energy residual ${(100 * worstEnergyError).toFixed(4)}%`
	);
});

test('far observer central ray reaches horizon at Low quality', () => {
	assert.equal(integrateStaticRay(40, 0, 56).fate, 'captured');
});

test('static scattering converges against a much smaller step reference', () => {
	let worstAngleError = 0;
	for (const q of [0, 0.6, 1]) {
		const r = 40;
		const rp = (3 + Math.sqrt(9 - 8 * q * q)) / 2;
		const critical =
			rp * Math.sqrt((1 - 2 / r + (q * q) / r ** 2) / (1 - 2 / rp + (q * q) / rp ** 2));
		for (const factor of [1.001, 1.01, 1.1, 2]) {
			const reference = integrateStaticRay(r, critical * factor, 3584, q);
			for (const steps of [56, 96, 144, 224]) {
				const actual = integrateStaticRay(r, critical * factor, steps, q);
				assert.equal(actual.fate, 'escaped');
				assert.equal(reference.fate, 'escaped');
				const difference = actual.direction - reference.direction;
				const angleError = Math.abs(Math.atan2(Math.sin(difference), Math.cos(difference)));
				worstAngleError = Math.max(worstAngleError, angleError);
			}
		}
	}
	console.log(
		`Float32 scattering grid: largest angular difference from fine-step reference ${((worstAngleError * 180) / Math.PI).toFixed(3)} degrees`
	);
	assert.ok(
		worstAngleError < Math.PI / 180,
		`scattering direction error ${worstAngleError} radians`
	);
});
