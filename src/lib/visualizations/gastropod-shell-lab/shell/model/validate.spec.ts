import { describe, expect, it } from 'vitest';
import { createDefaultRecipe } from './defaults';
import { classifyShellRecipe, validateShellRecipe } from './validate';

describe('recipe classification and semantic validation', () => {
	it('separates strict cone similarity, lecture lift, and allometry', () => {
		const exact = createDefaultRecipe();
		expect(classifyShellRecipe(exact)).toMatchObject({
			similarity: 'exact-self-similar',
			appliesTo: 'underlying-base-growth-law',
			strictlySelfSimilarIn3d: true,
			finiteRenderedShellStrictlySimilar: false
		});

		const lecture = createDefaultRecipe({ coiling: { axial: { mode: 'lecture-lift' } } });
		expect(classifyShellRecipe(lecture)).toMatchObject({
			similarity: 'top-view-self-similar',
			strictlySelfSimilarIn3d: false
		});

		const allometric = createDefaultRecipe({ aperture: { scaleExponent: 0.42 } });
		expect(classifyShellRecipe(allometric).similarity).toBe('allometric');
	});

	it('labels an Archimedean or local-frame path generalized', () => {
		expect(
			classifyShellRecipe(createDefaultRecipe({ coiling: { curve: 'archimedean' } })).similarity
		).toBe('generalized');
		expect(classifyShellRecipe(createDefaultRecipe({ engine: 'accretion' })).similarity).toBe(
			'generalized'
		);
	});

	it('does not badge ontogenetic scale, lip, or roll changes as exact base similarity', () => {
		const changingScale = createDefaultRecipe({
			aperture: { scaleModulation: { type: 'linear', start: 0.8, end: 1 } }
		});
		const lipFlare = createDefaultRecipe({
			aperture: { lipFlare: { type: 'linear', start: 0, end: 0.3 } }
		});
		const roll = createDefaultRecipe({
			twist: { rate: { type: 'constant', value: 0.2 } }
		});
		for (const recipe of [changingScale, lipFlare, roll]) {
			expect(classifyShellRecipe(recipe).similarity).toBe('generalized');
		}
	});

	it('keeps unequal logarithmic radial and aperture exponents classified as allometric', () => {
		const recipe = createDefaultRecipe({
			aperture: {
				scaleExponent: 0.42,
				lipFlare: { type: 'linear', start: 0, end: 0.2 }
			},
			coiling: { meander: { radialAmplitude: 0.1 } }
		});
		expect(classifyShellRecipe(recipe).similarity).toBe('allometric');
	});

	it('rejects a non-positive Fourier radius with a repair diagnostic', () => {
		const recipe = createDefaultRecipe({
			aperture: {
				profile: 'fourier',
				fourier: [
					{ harmonic: 1, cos: 1, sin: 0 },
					{ harmonic: 2, cos: 1, sin: 0 }
				]
			}
		});
		const validation = validateShellRecipe(recipe);
		expect(validation.structurallyValid).toBe(true);
		expect(validation.semanticallyValid).toBe(false);
		expect(validation.canGenerate).toBe(false);
		expect(validation.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'aperture-non-positive',
					severity: 'error',
					repair: expect.any(String)
				})
			])
		);
	});

	it('reports likely self-intersection but keeps a finite experiment operable', () => {
		const validation = validateShellRecipe(
			createDefaultRecipe({
				coiling: { whorlExpansion: 1.2, axial: { mode: 'planispiral' } },
				aperture: { scale: 1.35 }
			})
		);
		expect(validation.canGenerate).toBe(true);
		expect(validation.safe).toBe(false);
		expect(validation.diagnostics.map(({ code }) => code)).toContain('self-intersection-likely');
	});

	it('treats aperture scale as the existing A/R ratio when the axis distance is not one', () => {
		const validation = validateShellRecipe(
			createDefaultRecipe({
				coiling: { axisDistance: 0.25 },
				aperture: { scale: 0.5 }
			})
		);

		expect(validation.diagnostics.map(({ code }) => code)).not.toContain(
			'aperture-axis-ratio-unsafe-range'
		);
	});
});
