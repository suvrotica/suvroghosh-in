import { describe, expect, it } from 'vitest';
import {
	buildExperiment,
	createMask,
	DEFAULT_SETTINGS,
	estimate,
	generateDataset,
	impute,
	observe,
	rowOrdering,
	summarize
} from './model';
import type { ObservedData, Settings } from './types';

const settings = (overrides: Partial<Settings> = {}): Settings => ({
	...DEFAULT_SETTINGS,
	...overrides
});

describe('the reproducible complete sample', () => {
	it('replays exactly and stays fixed when mechanisms, fills, ordering and intensity change', () => {
		const first = buildExperiment(settings());
		const second = buildExperiment(
			settings({
				scenario: 'mnar',
				rate: 0.7,
				imputation: 'predictive',
				draw: 4,
				ordering: 'driver'
			})
		);
		expect(first.data.truth).toEqual(second.data.truth);
		expect(first.data.driver).toEqual(second.data.driver);
		expect(first.data.uniforms).toEqual(second.data.uniforms);
		expect(buildExperiment(settings()).observed.values).toEqual(first.observed.values);
		expect(generateDataset(1848, 'variables').truth).not.toEqual(first.data.truth);
	});

	it('bounds both views and provides a separate measured baseline', () => {
		const variables = generateDataset(1847, 'variables');
		const time = generateDataset(1847, 'time');
		expect([variables.rows, variables.cols, time.rows, time.cols]).toEqual([96, 16, 96, 24]);
		expect(variables.driver).toHaveLength(variables.rows);
		expect(variables.columns[0]).toBe('Measure 01');
		expect(time.columns[23]).toBe('Visit 24');
		expect(variables.truth.every(Number.isFinite)).toBe(true);
	});
});

describe('generative missingness rules', () => {
	it('uses stable uniforms so increasing MCAR intensity only removes additional cells', () => {
		const data = generateDataset(1847, 'variables');
		const low = createMask(data, settings({ rate: 0.2 }));
		const high = createMask(data, settings({ rate: 0.6 }));
		for (let cell = 0; cell < low.length; cell++) {
			expect(low[cell]).toBe(data.uniforms[cell] < 0.2 ? 1 : 0);
			if (low[cell]) expect(high[cell]).toBe(1);
		}
	});

	it('makes MCAR and MAR invariant to target values while MNAR depends on them', () => {
		const original = generateDataset(1847, 'variables');
		const changed = {
			...original,
			truth: Float64Array.from(original.truth, (_, cell) => (cell % 2 ? 90 : 10))
		};
		for (const scenario of ['mcar', 'mar'] as const) {
			expect(createMask(changed, settings({ scenario }))).toEqual(
				createMask(original, settings({ scenario }))
			);
		}
		expect(createMask(changed, settings({ scenario: 'mnar' }))).not.toEqual(
			createMask(original, settings({ scenario: 'mnar' }))
		);
	});

	it('makes MAR selection depend on the observed baseline, holding cell uniforms and outcomes fixed', () => {
		const original = generateDataset(1847, 'variables');
		const changed = { ...original, driver: Float64Array.from(original.driver, (value) => -value) };
		expect(createMask(changed, settings({ scenario: 'mar' }))).not.toEqual(
			createMask(original, settings({ scenario: 'mar' }))
		);
		expect(createMask(changed, settings({ scenario: 'mcar' }))).toEqual(
			createMask(original, settings({ scenario: 'mcar' }))
		);
	});

	it('never returns after dropout, and ordering exposes each frontier without mutating the mask', () => {
		const data = generateDataset(1847, 'time');
		const mask = createMask(data, settings({ scenario: 'dropout', view: 'time' }));
		for (let row = 0; row < data.rows; row++) {
			let missing = false;
			for (let col = 0; col < data.cols; col++) {
				if (mask[row * data.cols + col]) missing = true;
				if (missing) expect(mask[row * data.cols + col]).toBe(1);
			}
		}
		expect(summarize(mask, data.rows, data.cols).missing).toBe(
			Math.round(data.rows * data.cols * 0.35)
		);
		const copy = mask.slice();
		const order = rowOrdering(data, mask, 'dropout');
		const frontiers = order.map((row) => {
			const first = mask.slice(row * data.cols, (row + 1) * data.cols).indexOf(1);
			return first < 0 ? data.cols : first;
		});
		expect(frontiers).toEqual([...frontiers].sort((a, b) => a - b));
		expect(mask).toEqual(copy);
	});

	it('makes instrument outages contiguous and bounded by measured first and final visits', () => {
		const data = generateDataset(1847, 'time');
		const mask = createMask(data, settings({ scenario: 'instrument', view: 'time', rate: 0.95 }));
		for (let row = 0; row < data.rows; row++) {
			const visitMask = Array.from(mask.slice(row * data.cols, (row + 1) * data.cols));
			expect(visitMask[0]).toBe(0);
			expect(visitMask.at(-1)).toBe(0);
			const first = visitMask.indexOf(1);
			const last = visitMask.lastIndexOf(1);
			expect(visitMask.slice(first, last + 1).every(Boolean)).toBe(true);
		}
		expect(summarize(mask, data.rows, data.cols).rate).toBeLessThan(0.95);
	});

	it('removes whole columns or whole responses, never partial versions of those structures', () => {
		const data = generateDataset(1847, 'variables');
		const variables = createMask(data, settings({ scenario: 'variables' }));
		for (let col = 0; col < data.cols; col++) {
			const count = Array.from(
				{ length: data.rows },
				(_, row) => variables[row * data.cols + col]
			).reduce((a, b) => a + b, 0);
			expect([0, data.rows]).toContain(count);
		}
		const responses = createMask(data, settings({ scenario: 'nonresponse' }));
		for (let row = 0; row < data.rows; row++) {
			const count = responses
				.slice(row * data.cols, (row + 1) * data.cols)
				.reduce((a, b) => a + b, 0);
			expect([0, data.cols]).toContain(count);
		}
		expect(
			createMask(
				{ ...data, truth: new Float64Array(data.truth.length) },
				settings({ scenario: 'nonresponse' })
			)
		).toEqual(responses);
	});
});

describe('imputation without hidden truth', () => {
	it('observes a defensive copy with no truth and makes missing cells NaN', () => {
		const data = generateDataset(1847, 'variables');
		const mask = createMask(data, settings());
		const observed = observe(data, mask);
		expect(Object.keys(observed).sort()).toEqual(['cols', 'driver', 'mask', 'rows', 'values']);
		const oldValue = observed.values.find(Number.isFinite);
		data.truth.fill(-1000);
		expect(observed.values.find(Number.isFinite)).toBe(oldValue);
		for (let cell = 0; cell < mask.length; cell++) {
			if (mask[cell]) expect(Number.isNaN(observed.values[cell])).toBe(true);
		}
	});

	it('keeps measured values including zero exactly, and mean filling reports no uncertainty estimate', () => {
		const observed: ObservedData = {
			rows: 4,
			cols: 1,
			values: new Float64Array([0, 3, Number.NaN, 9]),
			mask: new Uint8Array([0, 0, 1, 0]),
			driver: new Float64Array([-1, 0, 0.5, 1])
		};
		const result = impute(observed, settings({ imputation: 'mean' }));
		expect(Array.from(result.values)).toEqual([0, 3, 4, 9]);
		expect(result.spread.every(Number.isNaN)).toBe(true);
		expect(Number.isNaN(observed.values[2])).toBe(true);
	});

	it('fits the observed baseline, produces reproducible predictive draws, and leaves observations unchanged', () => {
		const experiment = buildExperiment(settings({ imputation: 'predictive' }));
		const again = impute(experiment.observed, settings({ imputation: 'predictive' }));
		const alternative = impute(
			experiment.observed,
			settings({ imputation: 'predictive', draw: 1 })
		);
		expect(again.values).toEqual(experiment.completion.values);
		expect(alternative.values).not.toEqual(again.values);
		for (let cell = 0; cell < experiment.observed.values.length; cell++) {
			if (!experiment.observed.mask[cell]) {
				expect(again.values[cell]).toBe(experiment.observed.values[cell]);
				expect(alternative.values[cell]).toBe(again.values[cell]);
			} else {
				expect(again.spread[cell]).toBeGreaterThan(0);
				expect(Number.isFinite(again.values[cell])).toBe(true);
			}
		}
	});

	it('cannot learn an entirely absent column; predictive filling also requires at least three observations', () => {
		const experiment = buildExperiment(
			settings({ scenario: 'variables', imputation: 'predictive' })
		);
		expect(experiment.completion.unestimable.length).toBe(Math.round(16 * 0.35));
		for (const col of experiment.completion.unestimable) {
			expect(estimate(experiment.completion.values, 16, col)).toEqual({
				mean: null,
				sd: null,
				n: 0
			});
		}
		const sparse: ObservedData = {
			rows: 3,
			cols: 1,
			values: new Float64Array([1, 2, NaN]),
			mask: new Uint8Array([0, 0, 1]),
			driver: new Float64Array([0, 1, 2])
		};
		expect(impute(sparse, settings({ imputation: 'predictive' })).unestimable).toEqual([0]);
		expect(impute(sparse, settings({ imputation: 'mean' })).values[2]).toBe(1.5);
	});

	it('anchors predictive randomness to each cell so another column does not reshuffle its draws', () => {
		const observed: ObservedData = {
			rows: 6,
			cols: 2,
			values: new Float64Array([1, 2, 2, 3, 3, 5, 5, 8, NaN, NaN, NaN, NaN]),
			mask: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]),
			driver: new Float64Array([0, 1, 2, 3, 4, 5])
		};
		const changed = { ...observed, values: observed.values.slice(), mask: observed.mask.slice() };
		changed.values[0] = NaN;
		changed.mask[0] = 1;
		const before = impute(observed, settings({ imputation: 'predictive' }));
		const after = impute(changed, settings({ imputation: 'predictive' }));
		expect(after.values[9]).toBe(before.values[9]);
		expect(after.values[11]).toBe(before.values[11]);
	});

	it('moves only imputed MNAR outcomes under sensitivity assumptions and preserves the draw and spread', () => {
		const base = buildExperiment(settings({ scenario: 'mnar', imputation: 'predictive' }));
		const shifted = impute(
			base.observed,
			settings({ scenario: 'mnar', imputation: 'predictive', delta: 1 })
		);
		expect(shifted.spread).toEqual(base.completion.spread);
		for (let cell = 0; cell < shifted.values.length; cell++) {
			if (base.observed.mask[cell])
				expect(shifted.values[cell]).toBeGreaterThan(base.completion.values[cell]);
			else expect(shifted.values[cell]).toBe(base.completion.values[cell]);
		}
	});
});

describe('honest numerical summaries and presentation permutations', () => {
	it('computes sample estimates including legitimate zeros and explicitly undefined values', () => {
		expect(estimate(new Float64Array([0, NaN, 4, Infinity]), 1, 0)).toEqual({
			mean: 2,
			sd: Math.sqrt(8),
			n: 2
		});
		expect(estimate(new Float64Array([NaN, NaN]), 1, 0)).toEqual({ mean: null, sd: null, n: 0 });
		expect(estimate(new Float64Array([4]), 1, 0)).toEqual({ mean: 4, sd: null, n: 1 });
	});

	it('counts row/column gaps, complete cases, patterns and co-missingness from the same mask', () => {
		const summary = summarize(new Uint8Array([0, 0, 1, 1, 0, 1]), 3, 2);
		expect(summary).toEqual({
			missing: 3,
			rate: 0.5,
			completeCases: 1,
			rowMissing: [0, 2, 1],
			columnMissing: [1, 2],
			patterns: [
				{ pattern: '00', count: 1 },
				{ pattern: '01', count: 1 },
				{ pattern: '11', count: 1 }
			],
			coMissing: [
				[1, 1],
				[1, 2]
			]
		});
	});

	it('changes only the row permutation when sorting', () => {
		const original = buildExperiment(settings({ scenario: 'mar' }));
		for (const ordering of ['driver', 'missing', 'dropout'] as const) {
			const sorted = buildExperiment(settings({ scenario: 'mar', ordering }));
			expect(sorted.data.truth).toEqual(original.data.truth);
			expect(sorted.observed.values).toEqual(original.observed.values);
			expect(sorted.summary).toEqual(original.summary);
			expect(new Set(sorted.order).size).toBe(original.data.rows);
			expect(estimate(sorted.observed.values, sorted.data.cols, 0)).toEqual(
				estimate(original.observed.values, original.data.cols, 0)
			);
		}
	});
});
