import { describe, expect, it } from 'vitest';
import {
	applyCalibration,
	buildCalibrationCurves,
	buildReliabilityBins,
	calibratedProbabilityFromBaseLogOdds,
	calibrationStatus,
	describeCalibrationStatus,
	wilsonInterval
} from './calibration';
import { logit } from './normal';
import { configForIcuLabPreset } from './presets';
import { simulateIcuCohort } from './simulation';

describe('conventional calibration transformations', () => {
	it('implements c + m logit(p) = logit(p⁰)', () => {
		const baseProbability = 0.73;
		const intercept = 0.35;
		const slope = 1.4;
		const transformed = applyCalibration(baseProbability, intercept, slope);
		expect(intercept + slope * logit(transformed)).toBeCloseTo(logit(baseProbability), 13);
		expect(calibratedProbabilityFromBaseLogOdds(logit(baseProbability), intercept, slope)).toBe(
			transformed
		);
	});

	it('moves positive-intercept forecasts lower and sub-unit slopes toward greater extremity', () => {
		expect(applyCalibration(0.7, 0.5, 1)).toBeLessThan(0.7);
		expect(applyCalibration(0.8, 0, 0.5)).toBeGreaterThan(0.8);
		expect(applyCalibration(0.2, 0, 0.5)).toBeLessThan(0.2);
		expect(() => applyCalibration(0.5, 0, 0)).toThrow(RangeError);
	});

	it('generates the reader-facing calibration status from both parameters', () => {
		expect(calibrationStatus({ calibrationIntercept: 0, calibrationSlope: 1 })).toEqual({
			calibrated: true,
			level: 'level-ok',
			spread: 'spread-ok',
			labels: ['calibrated']
		});
		expect(describeCalibrationStatus({ calibrationIntercept: 0.3, calibrationSlope: 0.8 })).toBe(
			'systematically low and too extreme'
		);
		expect(describeCalibrationStatus({ calibrationIntercept: -0.3, calibrationSlope: 1.2 })).toBe(
			'systematically high and too timid'
		);
	});
});

describe('tie-aware equal-count reliability bins', () => {
	it('computes bounded Wilson 95% intervals for finite bins', () => {
		const none = wilsonInterval(0, 10);
		expect(none.lower).toBe(0);
		expect(none.upper).toBeCloseTo(0.277_532_8, 6);
		const half = wilsonInterval(5, 10);
		expect(half.lower).toBeCloseTo(0.236_593_1, 6);
		expect(half.upper).toBeCloseTo(0.763_406_9, 6);
	});

	it('accounts for every case across ten approximately equal-count bins', () => {
		const cohort = simulateIcuCohort(configForIcuLabPreset('specialist-missing-structured-data'));
		const curves = buildCalibrationCurves(cohort.cases);
		for (const bins of [curves.clinician, curves.model, curves.ensemble]) {
			expect(bins).toHaveLength(10);
			expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(cohort.cases.length);
			expect(Math.max(...bins.map((bin) => bin.count))).toBeLessThanOrEqual(301);
			for (const bin of bins) {
				expect(bin.eventCount).toBeLessThanOrEqual(bin.count);
				expect(bin.meanPrediction).toBeGreaterThanOrEqual(bin.minPrediction);
				expect(bin.meanPrediction).toBeLessThanOrEqual(bin.maxPrediction);
				expect(bin.wilson95.lower).toBeGreaterThanOrEqual(0);
				expect(bin.wilson95.upper).toBeLessThanOrEqual(1);
			}
		}
	});

	it('collapses an AUC-0.50 constant forecast into one defensible bin', () => {
		const base = configForIcuLabPreset('specialist-missing-structured-data');
		const constant = simulateIcuCohort({
			...base,
			clinician: { ...base.clinician, targetAuc: 0.5 },
			model: { ...base.model, targetAuc: 0.5 }
		});
		const curves = buildCalibrationCurves(constant.cases);
		expect(curves.clinician).toHaveLength(1);
		expect(curves.model).toHaveLength(1);
		expect(curves.ensemble).toHaveLength(1);
		expect(curves.clinician[0].count).toBe(base.cohortSize);
		expect(curves.clinician[0].minPrediction).toBe(curves.clinician[0].maxPrediction);
	});

	it('is approximately diagonal when development and deployment populations match', () => {
		const base = configForIcuLabPreset('specialist-missing-structured-data');
		const cohort = simulateIcuCohort({ ...base, seed: 'calibration-proof', cohortSize: 30_000 });
		const bins = buildReliabilityBins(cohort.cases, 'clinician');
		const weightedAbsoluteGap =
			bins.reduce((sum, bin) => sum + bin.count * Math.abs(bin.meanPrediction - bin.eventRate), 0) /
			cohort.cases.length;
		expect(weightedAbsoluteGap).toBeLessThan(0.012);
	});
});
