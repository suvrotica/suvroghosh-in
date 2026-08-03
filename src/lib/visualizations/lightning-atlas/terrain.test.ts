import { describe, expect, it } from 'vitest';
import { TERRAIN_PRESET_IDS } from './config';
import { terrainHash } from './hash';
import { generateTerrain, sampleTerrainHeight } from './terrain';

describe('Lightning Atlas terrain generation', () => {
	it('reproduces every preset exactly and keeps finite bounded data', () => {
		for (const preset of TERRAIN_PRESET_IDS) {
			const first = generateTerrain(preset, 'atlas-terrain-test');
			const second = generateTerrain(preset, 'atlas-terrain-test');
			expect(terrainHash(first), preset).toBe(terrainHash(second));
			expect(first.heights.every(Number.isFinite), preset).toBe(true);
			expect(
				first.wetness.every((value) => value >= 0 && value <= 1),
				preset
			).toBe(true);
			expect(
				first.waterMask.every((value) => value === 0 || value === 1),
				preset
			).toBe(true);
			expect(first.minHeight, preset).toBeLessThanOrEqual(first.maxHeight);
			for (const candidate of first.candidates) {
				expect(candidate.position.y, `${preset}:${candidate.id}`).toBeGreaterThanOrEqual(
					sampleTerrainHeight(first, candidate.position.x, candidate.position.z) - 0.001
				);
			}
		}
	});

	it('produces meaningfully different statistics rather than recoloured copies', () => {
		const summaries = TERRAIN_PRESET_IDS.map((preset) => {
			const terrain = generateTerrain(preset, 'different-terrain-test');
			const mean = terrain.heights.reduce((sum, value) => sum + value, 0) / terrain.heights.length;
			const water =
				terrain.waterMask.reduce((sum, value) => sum + value, 0) / terrain.waterMask.length;
			return `${Math.round(mean / 10)}:${Math.round((terrain.maxHeight - terrain.minHeight) / 10)}:${water.toFixed(2)}`;
		});
		expect(new Set(summaries).size).toBe(TERRAIN_PRESET_IDS.length);
	});
});
