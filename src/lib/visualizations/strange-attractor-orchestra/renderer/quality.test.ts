import { describe, expect, it } from 'vitest';
import {
	ORCHESTRA_DEGRADATION_ORDER,
	ORCHESTRA_MAX_DPR,
	ORCHESTRA_QUALITY_PROFILES,
	adaptQuality,
	cappedPixelRatio,
	chooseInitialQuality,
	nextLowerQuality,
	qualityProfile,
	surfaceSize,
	wakeSampleStride,
	type OrchestraQualityHints
} from './quality';

const generous: OrchestraQualityHints = {
	width: 1_440,
	height: 900,
	devicePixelRatio: 2,
	hardwareConcurrency: 12,
	deviceMemory: 16,
	saveData: false
};

describe('orchestra renderer quality contract', () => {
	it('caps every quality tier at or below 1.5 DPR', () => {
		expect(ORCHESTRA_MAX_DPR).toBe(1.5);
		expect(cappedPixelRatio(4, 'high')).toBe(1.5);
		expect(cappedPixelRatio(4, 'medium')).toBe(1.25);
		expect(cappedPixelRatio(4, 'low')).toBe(1);
		expect(cappedPixelRatio(Number.NaN, 'high')).toBe(1);
	});

	it('decreases only renderer presentation budgets across tiers', () => {
		const low = qualityProfile('low');
		const medium = qualityProfile('medium');
		const high = qualityProfile('high');
		expect(low.maxVisiblePoints).toBeLessThan(medium.maxVisiblePoints);
		expect(medium.maxVisiblePoints).toBeLessThan(high.maxVisiblePoints);
		expect(low.trailFraction).toBeLessThan(medium.trailFraction);
		expect(medium.trailFraction).toBeLessThanOrEqual(high.trailFraction);
		expect(low.wakeParticleBudget).toBeLessThan(medium.wakeParticleBudget);
		expect(medium.wakeParticleBudget).toBeLessThan(high.wakeParticleBudget);
		expect(low.densityHaze).toBe(false);
		expect(high.densityHaze).toBe(true);
		expect(ORCHESTRA_QUALITY_PROFILES).not.toHaveProperty('integrationStep');
		expect(ORCHESTRA_QUALITY_PROFILES).not.toHaveProperty('scoreDensity');
	});

	it('publishes the mandated deterministic degradation order', () => {
		expect(ORCHESTRA_DEGRADATION_ORDER.map((step) => step.id)).toEqual([
			'density-haze',
			'pixel-ratio',
			'trail-length',
			'wake-particles',
			'noise-contours',
			'visible-points',
			'canvas-fallback'
		]);
		expect(ORCHESTRA_DEGRADATION_ORDER.map((step) => step.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
		for (const step of ORCHESTRA_DEGRADATION_ORDER) {
			expect(step.preservesTrajectory).toBe(true);
			expect(step.preservesScore).toBe(true);
		}
	});

	it('bounds Wake marks by tier through deterministic uniform sampling', () => {
		for (const tier of ['low', 'medium', 'high'] as const) {
			const count = 60_000;
			const stride = wakeSampleStride(count, tier);
			expect(stride).toBeGreaterThanOrEqual(1);
			expect(Math.ceil(count / stride)).toBeLessThanOrEqual(
				qualityProfile(tier).wakeParticleBudget
			);
			expect(wakeSampleStride(count, tier)).toBe(stride);
		}
		expect(wakeSampleStride(Number.NaN, 'high')).toBe(1);
	});

	it('computes stable integer drawing-buffer dimensions without exceeding the tier cap', () => {
		expect(surfaceSize(801.4, 499.6, 3, 'high')).toEqual({
			cssWidth: 801,
			cssHeight: 500,
			pixelWidth: 1_202,
			pixelHeight: 750,
			pixelRatio: 1.5
		});
		expect(surfaceSize(Number.NaN, 0, 0.5, 'medium')).toEqual({
			cssWidth: 1,
			cssHeight: 1,
			pixelWidth: 1,
			pixelHeight: 1,
			pixelRatio: 1
		});
	});

	it('honours explicit quality and classifies constrained devices conservatively', () => {
		expect(chooseInitialQuality('high', { ...generous, saveData: true })).toBe('high');
		expect(chooseInitialQuality('auto', generous)).toBe('high');
		expect(chooseInitialQuality('auto', { ...generous, width: 390, height: 844 })).toBe('low');
		expect(chooseInitialQuality('auto', { ...generous, deviceMemory: 4 })).toBe('low');
		expect(
			chooseInitialQuality('auto', {
				...generous,
				width: 960,
				height: 700,
				hardwareConcurrency: 6,
				deviceMemory: 8
			})
		).toBe('medium');
	});

	it('degrades one tier at a time and promotes only after a fast frame window', () => {
		expect(nextLowerQuality('high')).toBe('medium');
		expect(nextLowerQuality('medium')).toBe('low');
		expect(nextLowerQuality('low')).toBe('low');
		expect(adaptQuality('high', 31, generous)).toBe('medium');
		expect(adaptQuality('medium', 31, generous)).toBe('low');
		expect(adaptQuality('low', 13, generous)).toBe('medium');
		expect(adaptQuality('medium', 15, generous)).toBe('high');
		expect(adaptQuality('medium', 17, generous)).toBe('medium');
	});

	it('does not promote Save-Data or invalid frame measurements', () => {
		const constrained = { ...generous, saveData: true };
		expect(adaptQuality('low', 10, constrained)).toBe('low');
		expect(adaptQuality('high', 10, constrained)).toBe('medium');
		expect(adaptQuality('medium', Number.NaN, generous)).toBe('medium');
		expect(adaptQuality('medium', 0, generous)).toBe('medium');
	});
});
