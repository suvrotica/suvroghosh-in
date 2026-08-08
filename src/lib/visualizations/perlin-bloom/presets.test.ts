import { describe, expect, it } from 'vitest';
import { CONFIG_RANGES, NUMERIC_CONFIG_KEYS } from './config';
import { buildBloomGeometry, geometrySignature } from './geometry';
import { PRESETS, getPreset, stateForPreset } from './presets';

describe('Perlin Bloom art-directed presets', () => {
	it('provides the seven required named palettes in a stable order', () => {
		expect(PRESETS.map(({ id, name }) => ({ id, name }))).toEqual([
			{ id: 'neon-orchid', name: 'Neon Orchid' },
			{ id: 'reactor-lotus', name: 'Reactor Lotus' },
			{ id: 'solar-chrysalis', name: 'Solar Chrysalis' },
			{ id: 'kolkata-after-midnight', name: 'Kolkata After Midnight' },
			{ id: 'ice-signal', name: 'Ice Signal' },
			{ id: 'blacklight-dahlia', name: 'Blacklight Dahlia' },
			{ id: 'monochrome-laser', name: 'Monochrome Laser' }
		]);
		expect(getPreset('not-a-preset').id).toBe('neon-orchid');
	});

	it('keeps every preset within the central control ranges', () => {
		for (const preset of PRESETS) {
			const state = stateForPreset(preset.id, 'range-check');
			expect(state.preset).toBe(preset.id);
			expect(state.palette).toBe(preset.id);
			expect(state.seed).toBe('range-check');
			for (const key of NUMERIC_CONFIG_KEYS) {
				expect(state[key]).toBeGreaterThanOrEqual(CONFIG_RANGES[key].min);
				expect(state[key]).toBeLessThanOrEqual(CONFIG_RANGES[key].max);
			}
		}
	});

	it('changes morphology and animation character rather than color alone', () => {
		const structuralKeys = [
			'petals',
			'whorls',
			'petalLength',
			'petalWidth',
			'curl',
			'noiseStrength',
			'domainWarp',
			'boxSize',
			'constraint',
			'breakout',
			'breath'
		] as const;
		const baseline = stateForPreset('neon-orchid', 'shared-seed');
		for (const preset of PRESETS.slice(1)) {
			const state = stateForPreset(preset.id, 'shared-seed');
			const changed = structuralKeys.filter((key) => state[key] !== baseline[key]);
			expect(changed.length).toBeGreaterThanOrEqual(3);
		}
	});

	it('reconstructs deterministic geometry from every preset and seed', () => {
		for (const preset of PRESETS) {
			const state = stateForPreset(preset.id, 'deterministic-preset');
			const first = buildBloomGeometry(state, { samplesPerPetal: 12 });
			const second = buildBloomGeometry(state, { samplesPerPetal: 12 });
			expect(geometrySignature(second)).toBe(geometrySignature(first));
			expect(first.petals).toHaveLength(state.petals * state.whorls);
		}
	});

	it('uses concrete, renderer-safe hexadecimal palette colors', () => {
		for (const preset of PRESETS) {
			const colors = [
				...preset.palette.background,
				...preset.palette.membranes,
				preset.palette.edge,
				preset.palette.vein,
				...preset.palette.core,
				preset.palette.accent,
				preset.palette.rupture,
				preset.palette.pollen,
				preset.palette.box
			];
			expect(colors.every((color) => /^#[\da-f]{6}$/iu.test(color))).toBe(true);
		}
	});
});
