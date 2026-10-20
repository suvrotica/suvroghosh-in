import assert from 'node:assert/strict';
import test from 'node:test';
import {
	flrwCurvatureDensity,
	flrwCurvatureSign,
	flrwScaleFactorAt,
	flrwSnapshot
} from '../src/lib/visualizations/spacetime-laboratory/spacetimeCosmology.ts';

const fluid = (omegaMatter, omegaRadiation, omegaLambda) => ({
	omegaMatter,
	omegaRadiation,
	omegaLambda
});
const near = (actual, expected, tolerance = 1e-7) =>
	assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test('Friedmann integration recovers independently known single-fluid limits from a=1', () => {
	for (const tau of [0, 0.1, 1, 3]) {
		near(flrwScaleFactorAt(tau, fluid(1, 0, 0)).scaleFactor, (1 + 1.5 * tau) ** (2 / 3));
		near(flrwScaleFactorAt(tau, fluid(0, 1, 0)).scaleFactor, Math.sqrt(1 + 2 * tau));
		near(flrwScaleFactorAt(tau, fluid(0, 0, 1)).scaleFactor, Math.exp(tau));
		near(flrwScaleFactorAt(tau, fluid(0, 0, 0)).scaleFactor, 1 + tau);
	}
});

test('mixed matter + vacuum matches the analytic flat ΛCDM solution', () => {
	const matter = 0.3;
	const lambda = 0.7;
	const initial = Math.asinh(Math.sqrt(lambda / matter));
	for (const tau of [0.2, 1, 3]) {
		const expected =
			(matter / lambda) ** (1 / 3) * Math.sinh(initial + 1.5 * Math.sqrt(lambda) * tau) ** (2 / 3);
		near(flrwScaleFactorAt(tau, fluid(matter, 0, lambda)).scaleFactor, expected);
	}
});

test('mixed density histories satisfy the Friedmann energy constraint', () => {
	for (const densities of [fluid(0.3, 0.0001, 0.65), fluid(0.9, 0.001, 0), fluid(1.2, 0.01, 0.1)]) {
		const { scaleFactor: a, expansionRate: v } = flrwScaleFactorAt(1.4, densities);
		const energy =
			densities.omegaMatter / a +
			densities.omegaRadiation / a ** 2 +
			flrwCurvatureDensity(densities) +
			densities.omegaLambda * a ** 2;
		near(v * v, energy, 1e-7);
	}
});

test('closed matter universe passes through turnaround into contraction', () => {
	const densities = fluid(2, 0, 0);
	const maximum = flrwScaleFactorAt(2.5, densities);
	const later = flrwScaleFactorAt(4, densities);
	assert.equal(later.phase, 'contracting');
	assert.ok(maximum.scaleFactor > later.scaleFactor);
	const crunch = flrwScaleFactorAt(8, densities);
	assert.equal(crunch.phase, 'crunch');
	assert.ok(Number.isFinite(crunch.scaleFactor));
});

test('curvature sign follows the density closure and changes the expansion history', () => {
	assert.equal(flrwCurvatureSign(fluid(0.3, 0, 0.7)), 0);
	assert.equal(flrwCurvatureSign(fluid(0.3, 0, 0.4)), -1);
	assert.equal(flrwCurvatureSign(fluid(0.9, 0.001, 0.4)), 1);
	assert.ok(
		flrwScaleFactorAt(1, fluid(0, 0, 0)).scaleFactor >
			flrwScaleFactorAt(1, fluid(1, 0, 0)).scaleFactor
	);
});

test('Hubble, elapsed time, offset and animation speed all affect the same history', () => {
	const params = { ...fluid(0.3, 0, 0.7), hubble: 70, flrwTime: 0, flrwSpeed: 1 };
	const baseline = flrwSnapshot(params, 10);
	near(flrwSnapshot({ ...params, hubble: 35 }, 20).scaleFactor, baseline.scaleFactor);
	near(flrwSnapshot({ ...params, flrwSpeed: 2 }, 5).scaleFactor, baseline.scaleFactor);
	near(flrwSnapshot({ ...params, flrwTime: 0.4 }, 0).scaleFactor, baseline.scaleFactor);
	assert.ok(
		flrwSnapshot(params, 61).scaleFactor > flrwSnapshot(params, 59).scaleFactor,
		'does not reset after one minute'
	);
	assert.equal(flrwSnapshot({ ...params, flrwSpeed: 0 }, 60).scaleFactor, 1);
	near(baseline.redshift, baseline.scaleFactor / baseline.emittedScaleFactor - 1);
	assert.ok(baseline.elapsedGyr > 5 && baseline.elapsedGyr < 6);
});

test('remote future and malformed inputs terminate with finite bounded output', () => {
	const future = flrwScaleFactorAt(1e12, fluid(0, 0, 1));
	assert.equal(future.phase, 'display-limit');
	assert.equal(future.scaleFactor, 1e4);
	assert.equal(flrwScaleFactorAt(Number.NaN, fluid(-1, Number.NaN, 0)).scaleFactor, 1);
});
