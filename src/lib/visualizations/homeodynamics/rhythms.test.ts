import { describe, expect, it } from 'vitest';
import {
	BREATHS_PER_MINUTE,
	HEARTBEAT_BPM,
	TEMPERATURE_PEAK_TO_TROUGH_C,
	halfRangeFromPeakToTrough,
	rhythmSeriesFor,
	secondsPerBeat,
	secondsPerBreath
} from './rhythms';

describe('representative human rhythm conversions', () => {
	it('converts heartbeat rate to seconds per beat', () => {
		expect(secondsPerBeat(HEARTBEAT_BPM)).toBeCloseTo(0.8333333333, 9);
		expect(() => secondsPerBeat(0)).toThrow(RangeError);
	});

	it('converts breathing rate to seconds per cycle', () => {
		expect(secondsPerBreath(BREATHS_PER_MINUTE)).toBe(4);
		expect(() => secondsPerBreath(Number.NaN)).toThrow(RangeError);
	});

	it('uses peak-to-trough excursion unambiguously for temperature', () => {
		expect(halfRangeFromPeakToTrough(TEMPERATURE_PEAK_TO_TROUGH_C)).toBeCloseTo(0.55, 12);
		const temperature = rhythmSeriesFor('24h').find((series) => series.id === 'core-temperature');
		expect(temperature).toBeDefined();
		const values = temperature!.points.map((point) => point.value);
		expect(Math.max(...values) - Math.min(...values)).toBeCloseTo(1.1, 6);
	});

	it('generates only finite coordinates for every time window', () => {
		for (const window of ['20s', '2h', '24h'] as const) {
			for (const series of rhythmSeriesFor(window)) {
				expect(series.points.length).toBeGreaterThan(3);
				expect(
					series.points.every((point) => Number.isFinite(point.t) && Number.isFinite(point.value))
				).toBe(true);
			}
		}
	});

	it('keeps connected series identifiable by line pattern without colour', () => {
		for (const window of ['20s', '2h', '24h'] as const) {
			const patterns = rhythmSeriesFor(window)
				.filter((series) => series.connect !== false)
				.map((series) => series.dash ?? 'solid');
			expect(new Set(patterns).size).toBe(patterns.length);
		}
	});

	it('discloses that daily cortisol points use illustrative clock placement', () => {
		const cortisol = rhythmSeriesFor('24h').find((series) => series.id === 'daily-cortisol');
		expect(cortisol?.connect).toBe(false);
		expect(cortisol?.note).toMatch(/clock placement is illustrative/i);
	});
});
