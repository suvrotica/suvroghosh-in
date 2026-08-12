import { createDefaultRecipe, patchShellRecipe, type DeepPartial } from '../model/defaults';
import { constantLaw } from '../model/growth-law';
import type { CameraHint, ShellRecipe } from '../model/recipe-schema';
import {
	validateShellRecipe,
	type RecipeDiagnostic,
	type RecipeClassification
} from '../model/validate';

export type PresetShelf =
	| 'gastropod-archetypes'
	| 'comparative-molluscs'
	| 'mathematical-experiments';

export type ScopeBadge =
	| 'Gastropod archetype'
	| 'Comparative mollusc · cephalopod'
	| 'Comparative mollusc · extinct cephalopod'
	| 'Mathematical experiment';

export type PresetSafetyStatus = 'safe' | 'warning' | 'intentional-invalid';

export interface PresetDiagnosticsMetadata {
	declaredStatus: PresetSafetyStatus;
	expectedDiagnosticCodes: readonly string[];
	actual: readonly RecipeDiagnostic[];
	canGenerate: boolean;
}

export interface ShellPreset {
	id: string;
	title: string;
	shelf: PresetShelf;
	scopeBadge: ScopeBadge;
	taxonomicClass: 'Gastropoda' | 'Cephalopoda' | 'Mathematical model';
	morphologicalNote: string;
	scientificNote: string;
	viewHint: string;
	cameraHint: CameraHint;
	seed: number;
	diagnostics: PresetDiagnosticsMetadata;
	classification: RecipeClassification;
	recipe: ShellRecipe;
}

export interface PresetDefinition {
	id: string;
	title: string;
	shelf: PresetShelf;
	scopeBadge: ScopeBadge;
	taxonomicClass: ShellPreset['taxonomicClass'];
	morphologicalNote: string;
	scientificNote: string;
	viewHint: string;
	cameraHint: CameraHint;
	seed: number;
	safety?: PresetSafetyStatus;
	expectedDiagnosticCodes?: readonly string[];
	patch: DeepPartial<ShellRecipe>;
}

export const expansionExponent = (whorlExpansion: number): number =>
	Math.log(whorlExpansion) / (Math.PI * 2);

export function definePreset(definition: PresetDefinition): ShellPreset {
	const seed = Math.trunc(definition.seed) >>> 0;
	let recipe = createDefaultRecipe(definition.patch);
	const authoredWhorlExpansion = definition.patch.coiling?.whorlExpansion;
	if (
		typeof authoredWhorlExpansion === 'number' &&
		definition.patch.kinematics?.growthRate === undefined
	) {
		recipe = patchShellRecipe(recipe, {
			kinematics: { growthRate: constantLaw(expansionExponent(authoredWhorlExpansion)) }
		});
	}
	recipe = patchShellRecipe(recipe, {
		name: definition.title,
		seed,
		ancestry: {
			presetId: definition.id,
			presetTitle: definition.title,
			modified: false
		},
		camera: definition.cameraHint
	});
	const validation = validateShellRecipe(recipe);
	if (!validation.classification) {
		throw new Error(`Preset ${definition.id} did not produce a classification.`);
	}
	return {
		id: definition.id,
		title: definition.title,
		shelf: definition.shelf,
		scopeBadge: definition.scopeBadge,
		taxonomicClass: definition.taxonomicClass,
		morphologicalNote: definition.morphologicalNote,
		scientificNote: definition.scientificNote,
		viewHint: definition.viewHint,
		cameraHint: recipe.camera as CameraHint,
		seed,
		diagnostics: {
			declaredStatus: definition.safety ?? 'safe',
			expectedDiagnosticCodes: definition.expectedDiagnosticCodes ?? [],
			actual: validation.diagnostics,
			canGenerate: validation.canGenerate
		},
		classification: validation.classification,
		recipe
	};
}

export const SIDE_CAMERA: CameraHint = {
	view: 'side',
	position: [4.2, 1.2, 2.2],
	target: [0, 0, 0],
	up: [0, 0, 1],
	zoom: 1
};

export const TOP_CAMERA: CameraHint = {
	view: 'top',
	position: [0.2, 0.1, 5.2],
	target: [0, 0, 0],
	up: [0, 1, 0],
	zoom: 1.08
};

export const APERTURE_CAMERA: CameraHint = {
	view: 'aperture',
	position: [3.4, -2.8, 1.5],
	target: [0.35, 0, 0],
	up: [0, 0, 1],
	zoom: 1.05
};

export const CHARACTER_CAMERA: CameraHint = {
	view: 'character',
	position: [3.8, -3.2, 2.8],
	target: [0, 0, 0],
	up: [0, 0, 1],
	zoom: 0.95
};
