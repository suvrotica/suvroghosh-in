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
});

test('Reissner–Nordstrom horizon structure', () => {
	assert.deepEqual(m.rnHorizonRadii(0, 1), { outer: 2, inner: 0 }, 'zero charge -> Schwarzschild');
	const extremal = m.rnHorizonRadii(1, 1);
	assert.ok(approx(extremal.outer, 1) && approx(extremal.inner, 1), 'extremal horizons merge');
	assert.equal(m.rnHorizonRadii(1.5, 1), null, 'super-extremal is naked, not a black hole');
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
});
