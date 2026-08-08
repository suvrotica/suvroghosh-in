import { describe, expect, it } from 'vitest';
import { adaptQuality, cappedPixelRatio, chooseInitialQuality } from './quality';
import type { NucleusQualityHints } from './quality';

const generous: NucleusQualityHints = {
	width: 1_440,
	height: 900,
	devicePixelRatio: 2,
	hardwareConcurrency: 12,
	deviceMemory: 16,
	saveData: false
};

describe('nucleus renderer quality selection', () => {
	it('honours explicit tiers', () => {
		expect(chooseInitialQuality('low', generous)).toBe('low');
		expect(chooseInitialQuality('medium', generous)).toBe('medium');
		expect(chooseInitialQuality('high', generous)).toBe('high');
	});

	it('starts constrained devices at low quality', () => {
		expect(
			chooseInitialQuality('auto', {
				...generous,
				width: 640,
				height: 860,
				hardwareConcurrency: 4
			})
		).toBe('low');
	});

	it('uses hysteresis when adapting frame cost', () => {
		expect(adaptQuality('high', 22, generous)).toBe('medium');
		expect(adaptQuality('medium', 16, generous)).toBe('medium');
		expect(adaptQuality('medium', 15, generous)).toBe('high');
		expect(adaptQuality('high', 31, generous)).toBe('low');
	});

	it('does not promote constrained devices', () => {
		const constrained = { ...generous, saveData: true };
		expect(adaptQuality('low', 12, constrained)).toBe('low');
		expect(adaptQuality('high', 12, constrained)).toBe('medium');
	});

	it('caps pixel density per tier', () => {
		expect(cappedPixelRatio(3, 'low')).toBe(1);
		expect(cappedPixelRatio(3, 'medium')).toBe(1.25);
		expect(cappedPixelRatio(3, 'high')).toBe(1.5);
	});
});
