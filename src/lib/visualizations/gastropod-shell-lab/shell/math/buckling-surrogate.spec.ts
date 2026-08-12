import { describe, expect, it } from 'vitest';
import {
	advanceBucklingMode,
	bucklingGrowthRate,
	bucklingWaveNumber,
	saturatedBucklingAmplitude,
	selectDominantBucklingMode
} from './buckling-surrogate';

describe('dimensionless buckling surrogate', () => {
	it('implements k=2πm/L and σ=ξk²−Kk⁴−1 with normalized gamma zero', () => {
		const waveNumber = bucklingWaveNumber(2, Math.PI * 4);
		expect(waveNumber).toBeCloseTo(1, 14);
		expect(bucklingGrowthRate(2, Math.PI * 4, 5, 0.25)).toBeCloseTo(3.75, 14);
	});

	it('treats mode zero as an explicitly disabled spatial mode', () => {
		expect(bucklingWaveNumber(0, Math.PI * 2)).toBe(0);
		expect(bucklingGrowthRate(0, Math.PI * 2, 5, 0.25)).toBe(-1);
	});

	it('deterministically selects the fastest-growing finite resolved mode', () => {
		const selected = selectDominantBucklingMode(12, Math.PI * 2, 4, 0.5);
		expect(selected.mode).toBe(2);
		expect(selected.waveNumber).toBeCloseTo(2, 14);
		expect(selected.growthRate).toBeCloseTo(7, 14);
	});

	it('saturates growing modes and decays stable modes without a sign flip', () => {
		const growing = saturatedBucklingAmplitude(0.01, 20, 20, 10);
		const stable = saturatedBucklingAmplitude(0.5, -20, 1, 10);
		expect(growing).toBeCloseTo(1, 10);
		expect(stable).toBeGreaterThanOrEqual(0);
		expect(stable).toBeLessThan(1e-10);
		expect([growing, stable].every(Number.isFinite)).toBe(true);
	});

	it('keeps repeated closed-form updates finite for extreme but finite proxy values', () => {
		let state = {
			mode: 64,
			initialAmplitude: 0.01,
			amplitude: 0.01,
			phase: 0,
			mismatch: 1e6,
			stiffness: 1e6,
			saturation: 1
		};
		for (let step = 0; step < 200; step += 1) {
			state = advanceBucklingMode(state, 0.01, 1e-6);
			expect(Number.isFinite(state.amplitude)).toBe(true);
		}
	});
});
