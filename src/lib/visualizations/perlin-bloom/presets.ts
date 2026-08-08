import { DEFAULT_FLOWER_CONFIG, DEFAULT_SEED, normalizeFlowerConfig } from './config';
import type { BloomPalette, FlowerConfig, PerlinBloomPreset, PresetId } from './types';

export const PRESETS = Object.freeze([
	{
		id: 'neon-orchid',
		name: 'Neon Orchid',
		description: 'Ultraviolet ribbons unfurl through cyan glass with an elegant recurved edge.',
		palette: {
			id: 'neon-orchid',
			name: 'Neon Orchid',
			background: ['#03040d', '#0d0620', '#071323'],
			membranes: ['#6d28d9', '#d946ef', '#22d3ee'],
			edge: '#8ff7ff',
			vein: '#e9d5ff',
			core: ['#f8fbff', '#a855f7'],
			accent: '#ff4fd8',
			rupture: '#67e8f9',
			pollen: '#f5f3ff',
			box: '#73e7ff'
		},
		config: {
			petals: 11,
			whorls: 4,
			petalLength: 0.72,
			petalWidth: 0.34,
			curl: 0.18,
			symmetry: 0.84,
			asymmetry: 0.14,
			tipStyle: 'recurved',
			noiseStrength: 0.17,
			noiseScale: 1.35,
			domainWarp: 0.42,
			boxSize: 0.46,
			constraint: 0.62,
			breakout: 0.76,
			glow: 0.68,
			pollen: 0.38
		}
	},
	{
		id: 'reactor-lotus',
		name: 'Reactor Lotus',
		description: 'A compact, high-pressure lotus emitting acid-green reactor light.',
		palette: {
			id: 'reactor-lotus',
			name: 'Reactor Lotus',
			background: ['#020b0d', '#031719', '#03101c'],
			membranes: ['#22c55e', '#14b8a6', '#2563eb'],
			edge: '#b7ff42',
			vein: '#5eead4',
			core: ['#f4ff9a', '#22c55e'],
			accent: '#d7ff36',
			rupture: '#67ffb7',
			pollen: '#efff71',
			box: '#24e6c2'
		},
		config: {
			petals: 9,
			whorls: 5,
			bloomScale: 0.74,
			petalLength: 0.64,
			petalWidth: 0.39,
			widthProfile: 0.92,
			curl: -0.11,
			symmetry: 0.91,
			asymmetry: 0.08,
			tipStyle: 'pointed',
			noiseStrength: 0.12,
			noiseScale: 1.8,
			domainWarp: 0.27,
			breath: 0.09,
			boxSize: 0.43,
			constraint: 0.78,
			breakout: 0.57,
			glow: 0.74,
			pollen: 0.24
		}
	},
	{
		id: 'solar-chrysalis',
		name: 'Solar Chrysalis',
		description: 'Broad amber membranes twist outward like a chrysalis opening near a small sun.',
		palette: {
			id: 'solar-chrysalis',
			name: 'Solar Chrysalis',
			background: ['#100506', '#25080f', '#160718'],
			membranes: ['#f59e0b', '#f97316', '#d946ef'],
			edge: '#ffd77a',
			vein: '#ffe4a3',
			core: ['#fff6bf', '#f59e0b'],
			accent: '#ff4f9a',
			rupture: '#ffb449',
			pollen: '#fff0a6',
			box: '#ff9c70'
		},
		config: {
			petals: 14,
			whorls: 3,
			bloomScale: 0.82,
			petalLength: 0.79,
			petalWidth: 0.3,
			widthProfile: 1.34,
			curl: 0.31,
			symmetry: 0.77,
			asymmetry: 0.19,
			tipStyle: 'rounded',
			noiseStrength: 0.2,
			noiseScale: 0.92,
			domainWarp: 0.51,
			breath: 0.17,
			boxSize: 0.48,
			constraint: 0.48,
			breakout: 0.91,
			glow: 0.78,
			pollen: 0.48
		}
	},
	{
		id: 'kolkata-after-midnight',
		name: 'Kolkata After Midnight',
		description: 'Tram blue, wet violet and sodium amber gather into a restless nocturnal flower.',
		palette: {
			id: 'kolkata-after-midnight',
			name: 'Kolkata After Midnight',
			background: ['#07080b', '#10101a', '#15101b'],
			membranes: ['#1d4ed8', '#7c3aed', '#dc2626'],
			edge: '#78b7ff',
			vein: '#ffbd62',
			core: ['#ffe2a8', '#e24b2d'],
			accent: '#f59e0b',
			rupture: '#ff784f',
			pollen: '#ffc66f',
			box: '#4ca7ff'
		},
		config: {
			petals: 7,
			whorls: 5,
			bloomScale: 0.8,
			petalLength: 0.76,
			petalWidth: 0.37,
			widthProfile: 1.08,
			curl: -0.24,
			symmetry: 0.68,
			asymmetry: 0.27,
			tipStyle: 'split',
			noiseStrength: 0.25,
			noiseScale: 1.18,
			domainWarp: 0.63,
			noiseDrift: 0.041,
			breath: 0.1,
			boxSize: 0.44,
			constraint: 0.69,
			breakout: 0.84,
			glow: 0.6,
			grain: 0.065,
			pollen: 0.3
		}
	},
	{
		id: 'ice-signal',
		name: 'Ice Signal',
		description: 'Long filamented petals transmit a quiet glacial signal through navy glass.',
		palette: {
			id: 'ice-signal',
			name: 'Ice Signal',
			background: ['#020713', '#061329', '#0a1022'],
			membranes: ['#22d3ee', '#c4b5fd', '#94a3b8'],
			edge: '#d9fbff',
			vein: '#e8eaff',
			core: ['#ffffff', '#7dd3fc'],
			accent: '#a5b4fc',
			rupture: '#b8f4ff',
			pollen: '#f8fbff',
			box: '#8eeeff'
		},
		config: {
			petals: 12,
			whorls: 4,
			bloomScale: 0.76,
			petalLength: 0.84,
			petalWidth: 0.22,
			widthProfile: 1.5,
			curl: 0.08,
			symmetry: 0.94,
			asymmetry: 0.06,
			tipStyle: 'filamented',
			noiseStrength: 0.09,
			noiseScale: 2.15,
			domainWarp: 0.18,
			noiseDrift: 0.028,
			breath: 0.07,
			boxSize: 0.47,
			constraint: 0.54,
			breakout: 0.68,
			membraneOpacity: 0.31,
			veinBrightness: 0.82,
			glow: 0.56,
			pollen: 0.18
		}
	},
	{
		id: 'blacklight-dahlia',
		name: 'Blacklight Dahlia',
		description:
			'Dense violet whorls buckle under blacklight, punctuated by a dangerous lime trace.',
		palette: {
			id: 'blacklight-dahlia',
			name: 'Blacklight Dahlia',
			background: ['#04020c', '#0d0322', '#08031a'],
			membranes: ['#3730a3', '#7c3aed', '#e11d9a'],
			edge: '#e879f9',
			vein: '#c4b5fd',
			core: ['#f0abfc', '#6d28d9'],
			accent: '#b8ff38',
			rupture: '#d4ff55',
			pollen: '#e9ff7a',
			box: '#a875ff'
		},
		config: {
			petals: 16,
			whorls: 3,
			bloomScale: 0.83,
			petalLength: 0.67,
			petalWidth: 0.32,
			widthProfile: 0.82,
			curl: 0.26,
			symmetry: 0.79,
			asymmetry: 0.17,
			tipStyle: 'pointed',
			noiseStrength: 0.23,
			noiseScale: 1.55,
			domainWarp: 0.72,
			breath: 0.15,
			boxSize: 0.42,
			constraint: 0.57,
			breakout: 1.02,
			glow: 0.82,
			pollen: 0.42
		}
	},
	{
		id: 'monochrome-laser',
		name: 'Monochrome Laser',
		description: 'A high-contrast white specimen cut by one surgical red laser frequency.',
		palette: {
			id: 'monochrome-laser',
			name: 'Monochrome Laser',
			background: ['#000000', '#080808', '#111111'],
			membranes: ['#262626', '#737373', '#d4d4d4'],
			edge: '#ffffff',
			vein: '#ffffff',
			core: ['#ffffff', '#a3a3a3'],
			accent: '#ff3155',
			rupture: '#ff3155',
			pollen: '#ffffff',
			box: '#ffffff'
		},
		config: {
			petals: 8,
			whorls: 6,
			bloomScale: 0.72,
			petalLength: 0.7,
			petalWidth: 0.25,
			widthProfile: 1.7,
			curl: 0.04,
			symmetry: 0.98,
			asymmetry: 0.03,
			tipStyle: 'pointed',
			noiseStrength: 0.07,
			noiseScale: 2.4,
			domainWarp: 0.12,
			breath: 0.05,
			boxSize: 0.4,
			constraint: 0.82,
			breakout: 0.63,
			membraneOpacity: 0.28,
			veinBrightness: 0.95,
			glow: 0.42,
			grain: 0.015,
			pollen: 0.12
		}
	}
] as const satisfies readonly PerlinBloomPreset[]);

for (const preset of PRESETS) {
	Object.freeze(preset.palette.background);
	Object.freeze(preset.palette.membranes);
	Object.freeze(preset.palette.core);
	Object.freeze(preset.palette);
	Object.freeze(preset.config);
	Object.freeze(preset);
}

export const PERLIN_BLOOM_PRESETS = PRESETS;

export const PRESET_BY_ID: Readonly<Record<PresetId, PerlinBloomPreset>> = Object.freeze(
	Object.fromEntries(PRESETS.map((preset) => [preset.id, preset])) as Record<
		PresetId,
		PerlinBloomPreset
	>
);

export function getPreset(id: string): PerlinBloomPreset {
	return PRESET_BY_ID[id as PresetId] ?? PRESETS[0];
}

export const presetById = getPreset;

export function paletteForPreset(id: string): BloomPalette {
	return getPreset(id).palette;
}

export function stateForPreset(id: string, seed = DEFAULT_SEED): FlowerConfig {
	const preset = getPreset(id);
	return normalizeFlowerConfig({
		...DEFAULT_FLOWER_CONFIG,
		...preset.config,
		seed,
		preset: preset.id,
		palette: preset.id
	});
}
