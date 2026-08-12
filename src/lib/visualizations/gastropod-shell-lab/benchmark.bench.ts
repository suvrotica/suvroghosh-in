import { bench, describe } from 'vitest';
import { generateShell } from './shell/engine';
import { createDefaultRecipe } from './shell/model';
import { getPresetById } from './shell/presets';

const hierarchyPreset = getPresetById('finite-fractal-like-murex');
if (!hierarchyPreset) throw new Error('Expected finite-hierarchy benchmark preset was not found.');

describe('Living Aperture deterministic generation', () => {
	bench(
		'default preview · 240×56',
		() => {
			generateShell(createDefaultRecipe(), { growthRings: 240, apertureSamples: 56 });
		},
		{ iterations: 7, warmupIterations: 1 }
	);

	bench(
		'default auto refine · 560×88',
		() => {
			generateShell(createDefaultRecipe(), { growthRings: 560, apertureSamples: 88 });
		},
		{ iterations: 7, warmupIterations: 1 }
	);

	bench(
		'finite hierarchy adaptive refine · 340×64',
		() => {
			generateShell(hierarchyPreset.recipe, { growthRings: 340, apertureSamples: 64 });
		},
		{ iterations: 7, warmupIterations: 1 }
	);

	bench(
		'finite hierarchy explicit fine · 900×128',
		() => {
			generateShell(hierarchyPreset.recipe, { growthRings: 900, apertureSamples: 128 });
		},
		{ iterations: 7, warmupIterations: 1 }
	);
});
