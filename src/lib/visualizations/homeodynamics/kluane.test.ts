import { describe, expect, it } from 'vitest';
import { KLUANE_CONTROL_SERIES, KLUANE_PROVENANCE, KLUANE_TREATMENT_SUMMARIES } from './kluane';

describe('derived Kluane field dataset', () => {
	it('preserves the selected Dryad rows and supplied confidence limits', () => {
		expect(KLUANE_CONTROL_SERIES).toHaveLength(16);
		expect(KLUANE_CONTROL_SERIES[0]).toEqual({
			occasion: 'Spring87',
			year: 1987.25,
			density: 0.17779166666666668,
			lower95: 0.10613333333333333,
			upper95: 0.3648
		});
		for (const datum of KLUANE_CONTROL_SERIES) {
			expect(datum.lower95).toBeLessThanOrEqual(datum.density);
			expect(datum.upper95).toBeGreaterThanOrEqual(datum.density);
		}
	});

	it('records workbook, sheet, table, columns and transformation notes', () => {
		expect(KLUANE_PROVENANCE.sourceWorkbook).toBe('3_Monitoring Data for Small Mammals.xlsx');
		expect(KLUANE_PROVENANCE.sourceSheet).toBe('Hares');
		expect(KLUANE_PROVENANCE.sourceColumns.C).toBe('Lower 95% C.L.');
		expect(KLUANE_PROVENANCE.transformation).toContain('without changing values');
	});

	it('keeps reported treatment ratios separate from the control trajectory', () => {
		expect(KLUANE_TREATMENT_SUMMARIES.map((summary) => summary.ratio)).toEqual([1, 2, 3, 11]);
		expect(KLUANE_TREATMENT_SUMMARIES.every((summary) => summary.kind === 'measured-summary')).toBe(
			true
		);
		expect(
			KLUANE_TREATMENT_SUMMARIES.slice(1).every((summary) =>
				summary.uncertainty.includes('No confidence interval')
			)
		).toBe(true);
	});
});
