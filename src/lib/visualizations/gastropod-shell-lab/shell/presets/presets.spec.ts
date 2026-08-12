import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../serialization';
import {
	ALL_PRESETS,
	COMPARATIVE_PRESETS,
	EXPERIMENT_PRESETS,
	GASTROPOD_PRESETS,
	clonePresetRecipe,
	getPresetById,
	presetsOnShelf
} from '.';

describe('preset catalog', () => {
	it('contains the required shelves and counts', () => {
		expect(GASTROPOD_PRESETS.length).toBeGreaterThanOrEqual(10);
		expect(COMPARATIVE_PRESETS).toHaveLength(3);
		expect(EXPERIMENT_PRESETS.length).toBeGreaterThanOrEqual(10);
		expect(presetsOnShelf('gastropod-archetypes')).toHaveLength(GASTROPOD_PRESETS.length);
		expect(new Set(ALL_PRESETS.map(({ id }) => id)).size).toBe(ALL_PRESETS.length);
	});

	it('gives every preset fixed provenance, note, badge, view, and diagnostics metadata', () => {
		for (const preset of ALL_PRESETS) {
			expect(preset.seed).toBe(preset.recipe.seed);
			expect(Number.isInteger(preset.seed)).toBe(true);
			expect(preset.morphologicalNote.length).toBeGreaterThan(24);
			expect(preset.scientificNote.length).toBeGreaterThan(24);
			expect(preset.scopeBadge.length).toBeGreaterThan(8);
			expect(preset.viewHint.length).toBeGreaterThan(24);
			expect(preset.cameraHint).toEqual(preset.recipe.camera);
			expect(preset.recipe.ancestry).toEqual({
				presetId: preset.id,
				presetTitle: preset.title,
				modified: false
			});

			const actual = preset.diagnostics.actual.map(({ code }) => code).sort();
			const expected = [...preset.diagnostics.expectedDiagnosticCodes].sort();
			expect(actual, preset.id).toEqual(expected);
			if (preset.diagnostics.declaredStatus === 'safe') expect(actual, preset.id).toEqual([]);
			else expect(actual.length, preset.id).toBeGreaterThan(0);
		}
	});

	it('keeps gastropod and cephalopod taxonomy unambiguous', () => {
		for (const preset of GASTROPOD_PRESETS) {
			expect(preset.shelf).toBe('gastropod-archetypes');
			expect(preset.scopeBadge).toBe('Gastropod archetype');
			expect(preset.taxonomicClass).toBe('Gastropoda');
			expect(preset.scientificNote.toLowerCase()).toContain('not fitted');
		}
		for (const preset of COMPARATIVE_PRESETS) {
			expect(preset.shelf).toBe('comparative-molluscs');
			expect(preset.taxonomicClass).toBe('Cephalopoda');
			expect(preset.scopeBadge.toLowerCase()).toContain('cephalopod');
			expect(preset.scientificNote.toLowerCase()).toContain('cephalopod');
			expect(preset.scientificNote.toLowerCase()).toContain('not a gastropod');
		}
		for (const preset of EXPERIMENT_PRESETS) {
			expect(preset.shelf).toBe('mathematical-experiments');
			expect(preset.taxonomicClass).toBe('Mathematical model');
		}
	});

	it('does not repeat a morphology under a renamed card', () => {
		const signatures = ALL_PRESETS.map((preset) =>
			canonicalJson({
				engine: preset.recipe.engine,
				coiling: preset.recipe.coiling,
				aperture: preset.recipe.aperture,
				twist: preset.recipe.twist,
				kinematics: preset.recipe.kinematics,
				ornament: preset.recipe.ornament
			})
		);
		expect(new Set(signatures).size).toBe(ALL_PRESETS.length);
	});

	it('contains no golden-ratio folklore or infinite-fractal claim', () => {
		const copy = canonicalJson(ALL_PRESETS).toLowerCase();
		expect(copy).not.toContain('golden ratio');
		expect(copy).not.toContain('fibonacci');
		expect(copy).not.toMatch(/\binfinite fractal\b/);
		expect(copy).not.toContain('switching chirality');
		expect(getPresetById('switching-chirality')?.title).toBe('Alternating winding sense');
	});

	it('supports lookup and returns an independent recipe copy', () => {
		const id = GASTROPOD_PRESETS[0].id;
		expect(getPresetById(id)?.id).toBe(id);
		const clone = clonePresetRecipe(id);
		expect(clone).toEqual(GASTROPOD_PRESETS[0].recipe);
		expect(clone).not.toBe(GASTROPOD_PRESETS[0].recipe);
	});
});
