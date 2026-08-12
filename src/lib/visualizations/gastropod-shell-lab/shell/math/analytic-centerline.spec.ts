import { describe, expect, it } from 'vitest';
import {
	evaluateAnalyticCenterline,
	type AnalyticCenterlineParameters
} from './analytic-centerline';
import { TAU } from './logarithmic-spiral';

const base: AnalyticCenterlineParameters = {
	spiralFamily: 'logarithmic',
	thetaStart: -TAU * 4,
	thetaEnd: 0,
	adultRadius: 2,
	whorlExpansion: 2,
	archimedeanSpacing: 0.1,
	handedness: 1,
	axialMode: 'planispiral',
	risePerTurn: 0.4,
	coneSpireRatio: 0.8
};

describe('analytic axial laws', () => {
	it('keeps the planispiral at zero height', () => {
		for (let index = 0; index < 25; index += 1) {
			const theta = base.thetaStart + (index / 24) * (base.thetaEnd - base.thetaStart);
			const sample = evaluateAnalyticCenterline(theta, base);
			expect(sample.point.z).toBe(0);
			expect(sample.derivative.z).toBe(0);
		}
	});

	it('gives lecture lift a linear rise without calling the full 3D curve self-similar', () => {
		const parameters = { ...base, axialMode: 'lecture-lift' as const };
		const start = evaluateAnalyticCenterline(parameters.thetaStart, parameters);
		const adult = evaluateAnalyticCenterline(parameters.thetaEnd, parameters);
		expect(start.point.z).toBe(0);
		expect(adult.point.z).toBeCloseTo(base.risePerTurn * 4, 12);
		expect(adult.derivative.z).toBeCloseTo(base.risePerTurn / TAU, 12);
	});

	it('makes cone-similar height proportional to radial growth', () => {
		const parameters = { ...base, axialMode: 'cone-similar' as const };
		const start = evaluateAnalyticCenterline(parameters.thetaStart, parameters);
		for (let index = 1; index < 25; index += 1) {
			const theta = base.thetaStart + (index / 24) * (base.thetaEnd - base.thetaStart);
			const sample = evaluateAnalyticCenterline(theta, parameters);
			expect(sample.point.z).toBeCloseTo(base.coneSpireRatio * (sample.radius - start.radius), 12);
		}
	});

	it('keeps Archimedean spacing additive rather than proportional', () => {
		const parameters = { ...base, spiralFamily: 'archimedean' as const };
		const first = evaluateAnalyticCenterline(-TAU * 2, parameters);
		const second = evaluateAnalyticCenterline(-TAU, parameters);
		const third = evaluateAnalyticCenterline(0, parameters);
		expect(second.radius - first.radius).toBeCloseTo(base.archimedeanSpacing * TAU, 12);
		expect(third.radius - second.radius).toBeCloseTo(base.archimedeanSpacing * TAU, 12);
	});
});
