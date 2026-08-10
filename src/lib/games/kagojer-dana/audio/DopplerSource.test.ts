import { describe, expect, it } from 'vitest';
import {
	DopplerSource,
	closingSpeedFromDistances,
	dopplerRateForClosingSpeed,
	dopplerRateFromDistances
} from './DopplerSource';

describe('restrained manual Doppler', () => {
	it('rises while approaching, is neutral at closest approach, and falls while receding', () => {
		expect(dopplerRateFromDistances(20, 18, 0.2)).toBeGreaterThan(1);
		expect(dopplerRateFromDistances(18, 18, 0.2)).toBe(1);
		expect(dopplerRateFromDistances(18, 20, 0.2)).toBeLessThan(1);
	});

	it('clamps extreme speed and playback rate to 0.92–1.08', () => {
		expect(closingSpeedFromDistances(100, 0, 0.001)).toBe(45);
		expect(closingSpeedFromDistances(0, 100, 0.001)).toBe(-45);
		expect(dopplerRateForClosingSpeed(10_000)).toBe(1.08);
		expect(dopplerRateForClosingSpeed(-10_000)).toBeGreaterThanOrEqual(0.92);
	});

	it('smooths changes over a restrained 50–80 ms time constant', () => {
		const source = new DopplerSource();
		source.update(20, 1 / 60);
		const first = source.update(18, 0.05);
		expect(first.smoothedRate).toBeGreaterThan(1);
		expect(first.smoothedRate).toBeLessThan(first.targetRate);
		const second = source.update(16, 0.08);
		expect(second.smoothedRate).toBeGreaterThan(first.smoothedRate);
		expect(second.smoothedRate).toBeLessThanOrEqual(1.08);
	});
});
