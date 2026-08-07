import { describe, expect, it } from 'vitest';
import { DEFAULT_FIELD_SETTINGS } from './defaults';
import {
	fieldAngle,
	fieldGradient,
	gradientNoise3D,
	normalizeFieldSettings,
	sampleField,
	valueNoise3D
} from './field';

describe('Invisible Weather coherent and nested fields', () => {
	it('keeps value and gradient noise finite, bounded, coherent, and deterministic', () => {
		for (const sample of [
			[0, 0, 0],
			[0.01, 0.02, 0.03],
			[-17.2, 9.4, 103],
			[1e4, -1e4, 0.5]
		] as const) {
			for (const noise of [valueNoise3D, gradientNoise3D]) {
				const first = noise(sample[0], sample[1], sample[2], 'fixed');
				expect(first).toBeGreaterThanOrEqual(0);
				expect(first).toBeLessThanOrEqual(1);
				expect(noise(sample[0], sample[1], sample[2], 'fixed')).toBe(first);
			}
		}
		expect(
			Math.abs(valueNoise3D(0.1, 0.1, 0.1, 'a') - valueNoise3D(0.101, 0.1, 0.1, 'a'))
		).toBeLessThan(0.02);
	});

	it('supports one through four materially distinct nesting depths', () => {
		const values = ([1, 2, 3, 4] as const).map((depth) =>
			sampleField(0.371, 0.692, 4.2, { ...DEFAULT_FIELD_SETTINGS, depth })
		);
		expect(new Set(values.map((value) => value.toFixed(8))).size).toBeGreaterThanOrEqual(3);
		expect(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
	});

	it('clamps extreme settings and supplies finite angles and gradients', () => {
		const normalized = normalizeFieldSettings({
			...DEFAULT_FIELD_SETTINGS,
			depth: 4,
			frequency: Number.POSITIVE_INFINITY,
			warpStrength: -100,
			timeScale: 999
		});
		expect(normalized.frequency).toBe(0.05);
		expect(normalized.warpStrength).toBe(0);
		expect(normalized.timeScale).toBe(2);
		expect(Number.isFinite(sampleField(Number.NaN, 2, 3, normalized))).toBe(true);
		expect(Number.isFinite(fieldAngle(0.3, 0.4, 0, normalized))).toBe(true);
		const gradient = fieldGradient(0.3, 0.4, 0, normalized);
		expect(Number.isFinite(gradient.x) && Number.isFinite(gradient.y)).toBe(true);
	});
});
