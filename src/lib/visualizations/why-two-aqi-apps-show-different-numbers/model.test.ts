import { describe, expect, it } from 'vitest';
import {
	ALL_PRESET_COMPARISONS,
	DEFAULT_AVERAGING_SCENARIO,
	DEFAULT_PM25_PRESET,
	FIXED_HOURLY_AXIS_MAX,
	PERSISTENT_SCALE_NOTE,
	SOURCES_CHECKED_DATE,
	VERIFIED_SOURCES,
	calculateIndiaCpcbPm25SubIndex,
	calculateUsEpaPm25SubIndex,
	comparePm25Preset,
	computeOverallAqiSummary,
	getAveragingScenarioSummary,
	summarizeHourlySeries,
	truncateToOneDecimal
} from './model';

describe('Why two AQI apps show different numbers — model verification', () => {
	it('verifies all four preset 24-hour PM2.5 comparisons on India CPCB and current US EPA scales', () => {
		expect(DEFAULT_PM25_PRESET).toBe(60);

		const expected = [
			{
				conc: 30,
				indiaScore: 50,
				indiaCategory: 'Good',
				usScore: 90,
				usCategory: 'Moderate',
				reversed: false
			},
			{
				conc: 60,
				indiaScore: 100,
				indiaCategory: 'Satisfactory',
				usScore: 154,
				usCategory: 'Unhealthy',
				reversed: false
			},
			{
				conc: 90,
				indiaScore: 200,
				indiaCategory: 'Moderately polluted',
				usScore: 175,
				usCategory: 'Unhealthy',
				reversed: true
			},
			{
				conc: 120,
				indiaScore: 300,
				indiaCategory: 'Poor',
				usScore: 196,
				usCategory: 'Unhealthy',
				reversed: true
			}
		] as const;

		expect(ALL_PRESET_COMPARISONS).toHaveLength(4);

		for (const item of expected) {
			const comparison = comparePm25Preset(item.conc);
			expect(comparison.india.subIndex).toBe(item.indiaScore);
			expect(comparison.india.category).toBe(item.indiaCategory);
			expect(comparison.india.averagingHours).toBe(24);
			expect(comparison.india.pollutant).toBe('PM2.5');

			expect(comparison.us.subIndex).toBe(item.usScore);
			expect(comparison.us.category).toBe(item.usCategory);
			expect(comparison.us.averagingHours).toBe(24);
			expect(comparison.us.pollutant).toBe('PM2.5');

			expect(comparison.orderingReversed).toBe(item.reversed);
			expect(comparison.persistentNote).toBe(PERSISTENT_SCALE_NOTE);
		}

		expect(comparePm25Preset(60).dynamicNote).toBe(
			'Changing the scale changes the score. It removes no pollution.'
		);
		expect(comparePm25Preset(90).dynamicNote).toContain('reverses');
		expect(comparePm25Preset(120).dynamicNote).toContain('reverses');
	});

	it('truncates US PM2.5 concentrations to 1 decimal place and respects category boundaries', () => {
		expect(truncateToOneDecimal(9.09)).toBe(9.0);
		expect(truncateToOneDecimal(9.1)).toBe(9.1);
		expect(truncateToOneDecimal(35.49)).toBe(35.4);
		expect(truncateToOneDecimal(55.49)).toBe(55.4);

		expect(calculateUsEpaPm25SubIndex(0)).toMatchObject({ subIndex: 0, category: 'Good' });
		expect(calculateUsEpaPm25SubIndex(9.0)).toMatchObject({ subIndex: 50, category: 'Good' });
		expect(calculateUsEpaPm25SubIndex(9.09)).toMatchObject({ subIndex: 50, category: 'Good' });
		expect(calculateUsEpaPm25SubIndex(9.1)).toMatchObject({ subIndex: 51, category: 'Moderate' });
		expect(calculateUsEpaPm25SubIndex(35.4)).toMatchObject({ subIndex: 100, category: 'Moderate' });
		expect(calculateUsEpaPm25SubIndex(35.49)).toMatchObject({
			subIndex: 100,
			category: 'Moderate'
		});
		expect(calculateUsEpaPm25SubIndex(35.5)).toMatchObject({
			subIndex: 101,
			category: 'Unhealthy for Sensitive Groups'
		});
		expect(calculateUsEpaPm25SubIndex(55.4)).toMatchObject({
			subIndex: 150,
			category: 'Unhealthy for Sensitive Groups'
		});
		expect(calculateUsEpaPm25SubIndex(55.5)).toMatchObject({
			subIndex: 151,
			category: 'Unhealthy'
		});
		expect(calculateUsEpaPm25SubIndex(125.4)).toMatchObject({
			subIndex: 200,
			category: 'Unhealthy'
		});
		expect(calculateUsEpaPm25SubIndex(125.5)).toMatchObject({
			subIndex: 201,
			category: 'Very Unhealthy'
		});
		expect(calculateUsEpaPm25SubIndex(225.4)).toMatchObject({
			subIndex: 300,
			category: 'Very Unhealthy'
		});
		expect(calculateUsEpaPm25SubIndex(225.5)).toMatchObject({
			subIndex: 301,
			category: 'Hazardous'
		});
		expect(calculateUsEpaPm25SubIndex(325.4)).toMatchObject({
			subIndex: 500,
			category: 'Hazardous'
		});

		expect(calculateIndiaCpcbPm25SubIndex(0)).toMatchObject({ subIndex: 0, category: 'Good' });
		expect(calculateIndiaCpcbPm25SubIndex(30)).toMatchObject({ subIndex: 50, category: 'Good' });
		expect(calculateIndiaCpcbPm25SubIndex(31)).toMatchObject({
			subIndex: 51,
			category: 'Satisfactory'
		});
		expect(calculateIndiaCpcbPm25SubIndex(60)).toMatchObject({
			subIndex: 100,
			category: 'Satisfactory'
		});
		expect(calculateIndiaCpcbPm25SubIndex(61)).toMatchObject({
			subIndex: 101,
			category: 'Moderately polluted'
		});
		expect(calculateIndiaCpcbPm25SubIndex(90)).toMatchObject({
			subIndex: 200,
			category: 'Moderately polluted'
		});
		expect(calculateIndiaCpcbPm25SubIndex(91)).toMatchObject({ subIndex: 201, category: 'Poor' });
		expect(calculateIndiaCpcbPm25SubIndex(120)).toMatchObject({ subIndex: 300, category: 'Poor' });
		expect(calculateIndiaCpcbPm25SubIndex(121)).toMatchObject({
			subIndex: 301,
			category: 'Very poor'
		});
		expect(calculateIndiaCpcbPm25SubIndex(250)).toMatchObject({
			subIndex: 400,
			category: 'Very poor'
		});
	});

	it('respects the 500 scale endpoint on CPCB while permitting >500 Hazardous extrapolation on US EPA', () => {
		const indiaHigh = calculateIndiaCpcbPm25SubIndex(420);
		expect(indiaHigh.subIndex).toBe(500);
		expect(indiaHigh.category).toBe('Severe');
		expect(indiaHigh.exceedsPublished500).toBe(false);

		const usHigh = calculateUsEpaPm25SubIndex(375.4);
		expect(usHigh.subIndex).toBeGreaterThan(500);
		expect(usHigh.category).toBe('Hazardous');
		expect(usHigh.exceedsPublished500).toBe(true);
	});

	it('computes both 24-hour concentration averaging examples from their 24-hour arrays with fixed axis limits', () => {
		expect(DEFAULT_AVERAGING_SCENARIO).toBe('smoke-arrives');

		const steady = getAveragingScenarioSummary('steady-day');
		expect(steady.hourlyConcentrationsUgM3).toHaveLength(24);
		expect(steady.mean24hUgM3).toBe(60);
		expect(steady.latestHourUgM3).toBe(60);
		expect(steady.yAxisMax).toBe(FIXED_HOURLY_AXIS_MAX);

		const smoke = getAveragingScenarioSummary('smoke-arrives');
		expect(smoke.hourlyConcentrationsUgM3).toHaveLength(24);
		expect(smoke.hourlyConcentrationsUgM3.slice(0, 20).every((v) => v === 60)).toBe(true);
		expect(smoke.hourlyConcentrationsUgM3.slice(20).every((v) => v === 360)).toBe(true);
		expect(smoke.mean24hUgM3).toBe(110);
		expect(smoke.latestHourUgM3).toBe(360);
		expect(smoke.yAxisMax).toBe(FIXED_HOURLY_AXIS_MAX);
	});

	it('selects the highest pollutant score for overall US AQI without averaging or summing', () => {
		const overall = computeOverallAqiSummary();
		expect(overall.scaleName).toBe('US AQI');
		expect(overall.overallScore).toBe(154);
		expect(overall.overallCategory).toBe('Unhealthy');
		expect(overall.dominantPollutantId).toBe('pm25');
		expect(overall.bars.map((b) => [b.pollutantLabel, b.score, b.isDominant])).toEqual([
			['PM2.5', 154, true],
			['PM10', 62, false],
			['Ozone', 37, false]
		]);
	});

	it('rejects missing, NaN, infinite, or negative inputs rather than treating missing data as zero', () => {
		for (const bad of [NaN, Infinity, -Infinity, -0.1, null, undefined, '60']) {
			expect(() => calculateIndiaCpcbPm25SubIndex(bad as number)).toThrow(RangeError);
			expect(() => calculateUsEpaPm25SubIndex(bad as number)).toThrow(RangeError);
		}

		const withMissingHour = Array.from({ length: 24 }, (_, idx) =>
			idx === 12 ? (undefined as unknown as number) : 60
		);
		expect(() =>
			summarizeHourlySeries(withMissingHour, {
				id: 'steady-day',
				label: 'Missing test',
				summary: 'Contains undefined hour'
			})
		).toThrow(RangeError);

		expect(() => computeOverallAqiSummary([])).toThrow(RangeError);
	});

	it('records dated official sources checked on 11 November 2026', () => {
		expect(SOURCES_CHECKED_DATE).toBe('2026-11-11');
		expect(VERIFIED_SOURCES.length).toBeGreaterThanOrEqual(9);
		for (const source of VERIFIED_SOURCES) {
			expect(source.checkedOn).toBe('2026-11-11');
			expect(source.url).toMatch(/^https:\/\//);
		}
	});
});
