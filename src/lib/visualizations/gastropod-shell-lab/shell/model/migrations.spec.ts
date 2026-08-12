import { describe, expect, it } from 'vitest';
import { createDefaultRecipe } from './defaults';
import {
	RecipeMigrationError,
	migrateShellRecipe,
	migrateShellRecipeWithReport
} from './migrations';

describe('recipe migrations', () => {
	it('migrates the flat v1 prototype and preserves authored values', () => {
		const report = migrateShellRecipeWithReport({
			schemaVersion: 1,
			name: 'Legacy turret',
			model: 'accretion',
			seed: -1,
			turns: 8,
			whorlExpansion: 1.5,
			axialMode: 'lecture-lift',
			risePerTurn: 0.4,
			handedness: -1,
			apertureProfile: 'circle',
			apertureSize: 0.21,
			apertureAspect: 1,
			ribs: 17,
			varices: 3,
			spines: 1.2,
			hierarchyDepth: 2
		});
		expect(report.fromVersion).toBe(1);
		expect(report.toVersion).toBe(2);
		expect(report.steps).toHaveLength(1);
		expect(report.recipe).toMatchObject({
			schemaVersion: 2,
			name: 'Legacy turret',
			engine: 'accretion',
			seed: 0xffffffff,
			coiling: {
				turns: 8,
				whorlExpansion: 1.5,
				handedness: -1,
				axial: { mode: 'lecture-lift', risePerTurn: 0.4 }
			},
			aperture: { profile: 'circle', scale: 0.21, aspectRatio: 1 },
			ornament: {
				ribs: { enabled: true, countPerTurn: 17 },
				varices: { enabled: true, countPerTurn: 3 },
				spines: { enabled: true, length: 1.2 },
				hierarchy: { enabled: true, depth: 2 }
			}
		});
	});

	it('treats an unversioned prototype as v1 and reads its parameters bag', () => {
		const recipe = migrateShellRecipe({
			name: 'Unversioned',
			parameters: { turns: 6, whorlExpansion: 2.8, apertureSize: 0.4 }
		});
		expect(recipe.schemaVersion).toBe(2);
		expect(recipe.coiling.turns).toBe(6);
		expect(recipe.coiling.whorlExpansion).toBe(2.8);
		expect(recipe.aperture.scale).toBe(0.4);
	});

	it('round-trips a current recipe without a migration step', () => {
		const current = createDefaultRecipe({ name: 'Current' });
		const report = migrateShellRecipeWithReport(current);
		expect(report.steps).toEqual([]);
		expect(report.recipe).toEqual(current);
		expect(report.recipe).not.toBe(current);
	});

	it('rejects unknown future schemas', () => {
		expect(() => migrateShellRecipe({ schemaVersion: 99 })).toThrow(RecipeMigrationError);
	});
});
