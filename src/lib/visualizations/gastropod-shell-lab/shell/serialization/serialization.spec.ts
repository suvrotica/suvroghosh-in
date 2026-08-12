import { describe, expect, it } from 'vitest';
import { createDefaultRecipe } from '../model';
import { ALL_PRESETS } from '../presets';
import {
	canonicalJson,
	decodeRecipeFromUrlState,
	deserializeShellRecipe,
	encodeRecipeToUrlState,
	prepareRecipeShare,
	serializeShellRecipe
} from '.';

describe('recipe serialization', () => {
	it('sorts object keys recursively for canonical output', () => {
		expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
	});

	it('round-trips every preset through JSON', () => {
		for (const preset of ALL_PRESETS) {
			const encoded = serializeShellRecipe(preset.recipe);
			expect(deserializeShellRecipe(encoded), preset.id).toEqual(preset.recipe);
		}
	});

	it('round-trips every preset through compressed base64url state', () => {
		for (const preset of ALL_PRESETS) {
			const state = encodeRecipeToUrlState(preset.recipe);
			expect(state).toMatch(/^sl2\.[A-Za-z0-9_-]+$/);
			expect(decodeRecipeFromUrlState(state), preset.id).toEqual(preset.recipe);
			expect(decodeRecipeFromUrlState(`#shell=${state}`), preset.id).toEqual(preset.recipe);
			expect(prepareRecipeShare(preset.recipe).kind, preset.id).toBe('url');
		}
	});

	it('returns a JSON download fallback when the URL budget is too small', () => {
		const recipe = createDefaultRecipe({ name: 'Oversized URL shell' });
		const fallback = prepareRecipeShare(recipe, 12);
		expect(fallback).toMatchObject({
			kind: 'json-download',
			filename: 'oversized-url-shell.shell.json',
			reason: 'url-state-too-large',
			maxLength: 12
		});
		if (fallback.kind === 'json-download') {
			expect(deserializeShellRecipe(fallback.json)).toEqual(recipe);
		}
	});

	it('accepts migrated legacy JSON and rejects corrupt URL state', () => {
		const migrated = deserializeShellRecipe(
			JSON.stringify({ schemaVersion: 1, name: 'Old', turns: 6, whorlExpansion: 2 })
		);
		expect(migrated.schemaVersion).toBe(2);
		expect(() => decodeRecipeFromUrlState('sl2.not-valid-compressed-data')).toThrow();
		expect(() => decodeRecipeFromUrlState('unknown.payload')).toThrow(/prefix/i);
	});
});
