import { describe, expect, it } from 'vitest';
import { createDefaultRecipe } from '../model/defaults';
import { evaluateOrnament, ornamentIsZero, prepareOrnament } from './index';

const context = {
	age: 0.61,
	theta: -3.2,
	totalTurns: 5,
	u: 1.7,
	apertureSamples: 64,
	growthSamples: 320,
	seed: 12345
};

describe('continuous ornament', () => {
	it('is exactly zero when every ornament amplitude is zero or disabled', () => {
		const recipe = createDefaultRecipe();
		expect(ornamentIsZero(recipe.ornament)).toBe(true);
		const result = evaluateOrnament(recipe.ornament, context);
		expect(result.radialDisplacement).toBe(0);
		expect(Object.values(result.components).every((value) => value === 0)).toBe(true);
	});

	it('is deterministic for hierarchy and seeded imperfection', () => {
		const recipe = createDefaultRecipe({
			ornament: {
				hierarchy: { enabled: true, depth: 4, amplitude: 0.2 },
				imperfection: { enabled: true, amplitude: 0.1 }
			}
		});
		const first = evaluateOrnament(recipe.ornament, context);
		const second = evaluateOrnament(recipe.ornament, context);
		expect(first).toEqual(second);
		expect(first.radialDisplacement).not.toBe(0);
	});

	it('reuses a prepared finite hierarchy without changing deterministic output', () => {
		const recipe = createDefaultRecipe({
			ornament: { hierarchy: { enabled: true, depth: 6, amplitude: 0.25 } }
		});
		const prepared = prepareOrnament(recipe.ornament, context.seed, context.apertureSamples);
		expect(prepared.hierarchy.peaks.length).toBeGreaterThan(0);
		expect(evaluateOrnament(recipe.ornament, context, prepared)).toEqual(
			evaluateOrnament(recipe.ornament, context)
		);
	});

	it('uses only growing beam modes for the finite instability proxy', () => {
		const growing = createDefaultRecipe({
			ornament: {
				buckling: {
					enabled: true,
					amplitude: 0.2,
					mode: 2,
					domainLength: Math.PI * 2,
					mismatchProxy: 4,
					stiffnessProxy: 0.5
				}
			}
		});
		const stable = createDefaultRecipe({
			ornament: {
				buckling: {
					enabled: true,
					amplitude: 0.2,
					mode: 2,
					domainLength: 1,
					mismatchProxy: 0.2,
					stiffnessProxy: 1
				}
			}
		});
		const growingResult = evaluateOrnament(growing.ornament, context);
		const stableResult = evaluateOrnament(stable.ornament, context);
		expect(growingResult.instabilityProxy).toBeGreaterThan(0);
		expect(stableResult.instabilityProxy).toBe(0);
		expect(Number.isFinite(growingResult.radialDisplacement)).toBe(true);
	});

	it('smoothly limits destructive inward displacement', () => {
		const recipe = createDefaultRecipe({
			ornament: {
				imperfection: {
					enabled: true,
					amplitude: 0.75,
					bandLimit: 12,
					timingJitter: 0.5
				}
			}
		});
		for (let sample = 0; sample < 64; sample += 1) {
			const result = evaluateOrnament(recipe.ornament, {
				...context,
				u: (sample / 64) * Math.PI * 2
			});
			expect(result.radialDisplacement).toBeGreaterThan(-0.72);
			expect(Number.isFinite(result.radialDisplacement)).toBe(true);
		}
	});
});
