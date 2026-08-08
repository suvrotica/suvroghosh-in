import { describe, expect, it } from 'vitest';
import { stateForPreset } from './presets';
import {
	MAX_EXPORT_BYTES,
	MAX_EXPORT_EDGE,
	MAX_EXPORT_PIXELS,
	boundedExportDimensions,
	createExportPlan,
	perlinBloomFilename,
	sanitizeFilename
} from './export';

describe('Perlin Bloom export planning', () => {
	it('creates meaningful path-safe filenames', () => {
		const config = stateForPreset('neon-orchid', 'Outside / 1847?');
		expect(perlinBloomFilename(config)).toBe('perlin-bloom-neon-orchid-outside-1847.png');
		expect(sanitizeFilename('../unsafe\\flower?.png')).not.toMatch(/[\\/]/u);
		expect(sanitizeFilename('CON')).toBe('perlin-bloom.png');
	});

	it('caps a 4x social-sized render against the real layered working set', () => {
		const dimensions = boundedExportDimensions(1_200, 630, 4);
		expect(dimensions.width).toBeGreaterThan(2_400);
		expect(dimensions.height).toBeGreaterThan(1_260);
		expect(dimensions.scale).toBeGreaterThan(2);
		expect(dimensions.scale).toBeLessThan(4);
		expect(dimensions.wasCapped).toBe(true);
		expect(dimensions.reasons).toContain('memory-budget');
		expect(dimensions.estimatedBytes).toBeLessThanOrEqual(MAX_EXPORT_BYTES);
	});

	it('caps edge length, pixels and estimated working memory before allocation', () => {
		const dimensions = boundedExportDimensions(100_000, 80_000, 100);
		expect(dimensions.width).toBeLessThanOrEqual(MAX_EXPORT_EDGE);
		expect(dimensions.height).toBeLessThanOrEqual(MAX_EXPORT_EDGE);
		expect(dimensions.pixelCount).toBeLessThanOrEqual(MAX_EXPORT_PIXELS);
		expect(dimensions.estimatedBytes).toBeLessThanOrEqual(MAX_EXPORT_BYTES);
		expect(dimensions.wasCapped).toBe(true);
		expect(dimensions.reasons.length).toBeGreaterThan(0);
	});

	it('returns a complete immutable rendering plan with a safe custom name', () => {
		const plan = createExportPlan(stateForPreset('solar-chrysalis', 'sun-1937'), {
			width: 1_600,
			height: 1_000,
			scale: 4,
			includeSignature: true,
			filename: '../Solar specimen'
		});
		expect(plan.filename).toBe('Solar-specimen.png');
		expect(plan.includeSignature).toBe(true);
		expect(plan.pixelCount).toBe(plan.width * plan.height);
		expect(plan.estimatedBytes).toBeLessThanOrEqual(MAX_EXPORT_BYTES);
		expect(plan.wasCapped).toBe(true);
	});
});
