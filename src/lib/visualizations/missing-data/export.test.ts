import { describe, expect, it } from 'vitest';
import { fingerprintReport } from './export';
import { buildExperiment, DEFAULT_SETTINGS } from './model';
import { matrixColor, normalizeScore } from './renderer';
import { MODEL_VERSION } from './types';

describe('missingness fingerprint', () => {
	it('records the exact visible mask, ordering, counts and model version without hidden cell truth', () => {
		const experiment = buildExperiment({
			...DEFAULT_SETTINGS,
			scenario: 'mar',
			ordering: 'driver',
			imputation: 'predictive'
		});
		const report = fingerprintReport(experiment);
		expect(report.modelVersion).toBe(MODEL_VERSION);
		expect(report.actual.missingCells).toBe(experiment.observed.mask.reduce((a, b) => a + b, 0));
		expect(report.actual.missingRate).toBe(experiment.summary.rate);
		expect(report.ordering.displayedToOriginalRow).toEqual(experiment.order);
		expect(report.matrix.missingMask).toEqual(Array.from(experiment.observed.mask));
		expect(report.matrix).not.toHaveProperty('revealedSyntheticTruth');
		const missingCell = experiment.observed.mask.findIndex((value) => value === 1);
		expect(report.matrix.observedValues[missingCell]).toBeNull();
		expect(report.matrix.completedValues[missingCell]).toBe(
			experiment.completion.values[missingCell]
		);
		expect(report.matrix.predictiveStandardDeviation[missingCell]).toBe(
			experiment.completion.spread[missingCell]
		);
		expect(report.disclosure).toBe(
			'Describes this pattern; does not establish why values are missing.'
		);
	});

	it('includes synthetic cell truth only after explicit reveal', () => {
		const experiment = buildExperiment({ ...DEFAULT_SETTINGS, reveal: true });
		const report = fingerprintReport(experiment);
		expect(report.matrix.revealedSyntheticTruth).toEqual(Array.from(experiment.data.truth));
	});

	it('retains wholly absent variables as null rather than fabricated zeros', () => {
		const experiment = buildExperiment({
			...DEFAULT_SETTINGS,
			scenario: 'variables',
			imputation: 'mean'
		});
		const report = fingerprintReport(experiment);
		const column = report.imputation.unestimableColumns[0];
		expect(column).toBeDefined();
		expect(report.variables[column].missingRate).toBe(1);
		for (let row = 0; row < experiment.data.rows; row++) {
			expect(report.matrix.completedValues[row * experiment.data.cols + column]).toBeNull();
		}
		expect(JSON.parse(JSON.stringify(report))).toEqual(report);
	});

	it('copies report arrays so an exported report cannot mutate current state', () => {
		const experiment = buildExperiment(DEFAULT_SETTINGS);
		const report = fingerprintReport(experiment);
		const original = experiment.order[0];
		report.ordering.displayedToOriginalRow[0] = -10;
		report.matrix.missingMask.fill(0);
		expect(experiment.order[0]).toBe(original);
		expect(experiment.summary.missing).toBeGreaterThan(0);
		expect(experiment.observed.mask.reduce((a, b) => a + b, 0)).toBe(experiment.summary.missing);
	});
});

describe('fixed matrix colour scale', () => {
	it('distinguishes low, central and high measured scores on the same scale', () => {
		expect(normalizeScore(50)).toBe(0);
		expect(matrixColor(14)).toEqual([87, 196, 184]);
		expect(matrixColor(50)).toEqual([238, 224, 184]);
		expect(matrixColor(86)).toEqual([245, 132, 110]);
		expect(matrixColor(38)).not.toEqual(matrixColor(62));
	});

	it('clips only its visual result and handles unavailable values defensively', () => {
		expect(matrixColor(-1000)).toEqual(matrixColor(14));
		expect(matrixColor(1000)).toEqual(matrixColor(86));
		expect(matrixColor(Number.NaN)).toEqual(matrixColor(50));
	});
});
